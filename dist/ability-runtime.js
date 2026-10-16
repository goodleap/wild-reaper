import { ABILITY_RULES as RULES, getAbilityDefinition, abilityAllowed, abilityActorKind } from './ability-definitions.js';
import { friendlyTargets, friendlyFoot, isFriendlyActive, damageFriendly } from './friendly-combat.js';
import { isGrounded } from './height-rules.js';
import { recordHeroAction } from './hero-animation.js';
import { beamCapsule, capsuleHitsCircle } from './attack-capsule.js';
import { isFrostcrownBody, frostcrownBodySweep, frostcrownBodyCircle, frostcrownBodyArc, frostcrownGroundContact } from './enemy-body-geometry.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const point=e=>({x:e.x,y:e.y});
const projected=(effect,p)=>({...p,groundY:p.y+effect.groundOffset});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const alive=e=>!!e&&e.hp>0&&e.state!=='recovering'&&e.state!=='left';
function segmentHit(a,b,p,r){
  const dx=b.x-a.x,dy=b.y-a.y,ox=a.x-p.x,oy=a.y-p.y,c=ox*ox+oy*oy-r*r;
  if(c<=0)return 0;const aa=dx*dx+dy*dy;if(aa<1e-10)return Infinity;
  const bb=2*(ox*dx+oy*dy),disc=bb*bb-4*aa*c;if(disc<0)return Infinity;
  const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:Infinity;
}
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const MAX_VISUAL_BURSTS=96;
const BURST_LIFE=Object.freeze({fireball:.32,frostbolt:.32,waterBolt:.3,windSlash:.22,swords:.22,meteor:.55,stoneLob:.45,lightning:.22,storm:.22,iceShatter:.45,heatEruption:.45,spiderHatch:.3});

// Effects own only transient execution state. Build ranks, AI cadence and
// character scaling are supplied by callers; every hit uses the normal resolver.
export class AbilityRuntime {
  constructor(game){this.game=game;this.effects=[];this.statuses=new Map();this.clock=0;this.nextId=1;this.visualBursts=[];this.visualCasts=new Map();this.nextVisualId=1;}
  clearScene(){
    for(const [caster,entry] of this.visualCasts)if(caster._visualCast===entry.pose)delete caster._visualCast;
    this.effects.length=0;this.statuses.clear();this.visualBursts.length=0;this.visualCasts.clear();
  }
  casterActive(caster,hostile){return alive(caster)&&(!hostile||caster.guardActive!==false&&this.game.enemies.includes(caster));}
  isFrozen(entity){return (this.statuses.get(entity)?.frozenUntil||0)>this.clock;}
  movementMultiplier(entity){const status=this.statuses.get(entity);if(!status)return 1;if(status.frozenUntil>this.clock)return 0;return status.slowUntil>this.clock?status.slowMultiplier:1;}
  absorbDamage(entity,amount,origin=null){
    const s=this.statuses.get(entity);if(!s||s.shieldUntil<=this.clock||s.shield<=0)return amount;
    const absorbed=Math.min(s.shield,amount);s.shield-=absorbed;
    if(absorbed>0){s.shieldHitAt=this.clock;s.shieldHitAngle=origin&&Number.isFinite(origin.x)&&Number.isFinite(origin.y)?Math.atan2(origin.y-entity.y,origin.x-entity.x):0;}
    return amount-absorbed;
  }
  statusFor(entity){
    let s=this.statuses.get(entity);if(s)return s;
    if(this.statuses.size>=RULES.maxStatuses)return null;
    s={slowUntil:0,slowMultiplier:1,frozenUntil:0,freezeProtectedUntil:0,shieldUntil:0,shield:0,shieldHitAt:-Infinity,shieldHitAngle:0,burn:null};this.statuses.set(entity,s);return s;
  }
  cast(id,caster,options={}){
    const g=this.game,def=getAbilityDefinition(id);
    if(!def||!abilityAllowed(id,caster,g)||!alive(caster)||this.isFrozen(caster)||g.status!=='playing')return false;
    const hostile=!['player','companion'].includes(abilityActorKind(caster,g));
    if(hostile&&g._inView?.(caster,120)===false)return false;
    const target=options.target??(hostile?g.player:null),origin=options.origin??caster;
    const aim=options.point??target??origin;
    if(!Number.isFinite(origin.x)||!Number.isFinite(origin.y)||!Number.isFinite(aim.x)||!Number.isFinite(aim.y))return false;
    if(hostile&&target&&caster.dungeonId&&g.dungeon?.canDamage?.(caster,target)===false)return false;
    const p={...def.parameters};for(const key of Object.keys(p))if(Number.isFinite(options[key]))p[key]=options[key];
    // Optional rank-derived controls are accepted even when absent in defaults.
    for(const key of ['damage','burnDamage','burnDuration','burnInterval','slowDuration','slowMultiplier','freezeChance','freezeDuration','freezeImmunity','bossFreezeMultiplier','bossFreezeImmunity','knockback','pullSpeed','shield'])if(Number.isFinite(options[key]))p[key]=options[key];
    p.damage=clamp(p.damage||0,0,1e7);p.duration=clamp(p.duration,.05,15);p.radius=clamp(p.radius||1,1,500);p.range=clamp(p.range||500,1,1000);p.speed=clamp(p.speed||0,0,1200);
    p.tickInterval=clamp(p.tickInterval||.5,.1,10);p.burnInterval=clamp(p.burnInterval||.6,.1,10);
    p.burnDuration=clamp(p.burnDuration||0,0,15);p.slowDuration=clamp(p.slowDuration||0,0,8);p.knockback=clamp(p.knockback||0,0,40);
    if(def.shape==='shield'){
      const s=this.statusFor(caster);if(!s)return false;s.shield=Math.max(s.shield,Math.max(0,p.shield||p.damage));s.shieldUntil=this.clock+p.duration;return true;
    }
    if(this.effects.length>=RULES.maxEffects||hostile&&this.effects.filter(e=>e.hostile).length>=RULES.maxHostileEffects)return false;
    if(def.shape==='field'&&(this.effects.filter(e=>e.shape==='field').length>=RULES.maxFields||this.effects.filter(e=>e.shape==='field'&&e.caster===caster).length>=RULES.maxFieldsPerCaster))return false;
    const aimReference=target??caster,aimPoint={...point(aim),groundY:aim.y+friendlyFoot(aimReference).y-aimReference.y},castOrigin={...point(origin),groundY:origin.y+friendlyFoot(caster).y-caster.y};
    if(!this.clearPath(castOrigin,aimPoint,def.profile==='ground'?'ground':'projectile'))return false;
    const angle=Number.isFinite(options.angle)?options.angle:Math.atan2(aim.y-origin.y,aim.x-origin.x);
    const windup=hostile?clamp(p.windup||0,RULES.minimumEnemyWindup,4):clamp(options.windup??0,0,4);
    if(Math.hypot(aimPoint.x-castOrigin.x,aimPoint.groundY-castOrigin.groundY)>p.range+1e-7&&['field','zone'].includes(def.shape))return false;
    const center=['field','zone'].includes(def.shape)?aim:origin;
    const reference=['field','zone'].includes(def.shape)&&target?target:caster,groundOffset=friendlyFoot(reference).y-reference.y;
    const effect={id:this.nextId++,abilityId:id,caster,hostile,shape:def.shape,profile:def.profile,parameters:p,x:center.x,y:center.y,origin:{...point(origin),groundY:origin.y+friendlyFoot(caster).y-caster.y},groundOffset,angle,age:0,windup,remaining:p.duration,hit:new Set(),lastHit:new Map(),distance:0,
      sourceX:caster.x,sourceY:caster.y,sourceGroundOffset:friendlyFoot(caster).y-caster.y,casterKind:caster.bossKind||caster.type||caster.companionKind||caster.heroId||abilityActorKind(caster,g),visualVariant:id==='domain'&&caster.bossKind==='broodmother'?'web':undefined};
    this.effects.push(effect);this.beginVisualCast(effect);
    if(caster===g.player)recordHeroAction(g,{kind:'cast',angle,duration:Math.min(1.1,windup+.44),windup,priority:1});
    return true;
  }
  beginVisualCast(effect){
    const caster=effect.caster,previous=this.visualCasts.get(caster);
    // A projectile fan is one body action. Its center direction remains stable
    // even though each projectile owns a separate execution effect.
    if(previous&&previous.startedAt===this.clock&&previous.pose.abilityId===effect.abilityId){
      previous.aimX+=Math.cos(effect.angle);previous.aimY+=Math.sin(effect.angle);
      previous.pose.angle=Math.atan2(previous.aimY,previous.aimX);return;
    }
    if(!previous&&this.visualCasts.size>=RULES.maxEffects){
      const [oldCaster,entry]=this.visualCasts.entries().next().value;
      if(oldCaster._visualCast===entry.pose)delete oldCaster._visualCast;
      this.visualCasts.delete(oldCaster);
    }
    const sustained=['beam','cone'].includes(effect.shape)||effect.abilityId==='vortex'&&caster.bossKind==='deepcaller';
    const activeDuration=sustained?effect.parameters.duration:Math.min(effect.parameters.duration,effect.shape==='field'?.34:.2);
    const pose={id:effect.id,abilityId:effect.abilityId,phase:effect.windup>0?'windup':'active',progress:0,angle:effect.angle,age:0,windup:effect.windup,duration:effect.parameters.duration,activeDuration,recoveryDuration:.24,
      visualVariant:effect.visualVariant,sourceX:effect.sourceX,sourceY:effect.sourceY,sourceGroundOffset:effect.sourceGroundOffset,casterKind:effect.casterKind};
    caster._visualCast=pose;this.visualCasts.set(caster,{pose,effect,startedAt:this.clock,aimX:Math.cos(effect.angle),aimY:Math.sin(effect.angle)});
  }
  updateVisualCasts(dt){
    for(const [caster,entry] of this.visualCasts){
      const {pose,effect}=entry;
      if(!this.casterActive(caster,effect.hostile)){
        if(caster._visualCast===pose)delete caster._visualCast;this.visualCasts.delete(caster);continue;
      }
      // Freeze pauses unlaunched casts, matching execution. Once released,
      // effects keep running; the renderer holds the frozen body separately.
      if(pose.age<pose.windup&&this.isFrozen(caster))continue;
      // Execution owns windup timing, including its existing freeze pause.
      pose.age=pose.age<pose.windup?effect.age:pose.age+dt;
      const activeAge=pose.age-pose.windup;
      if(activeAge<0){pose.phase='windup';pose.progress=clamp(pose.age/pose.windup,0,1);}
      else if(activeAge<pose.activeDuration){pose.phase='active';pose.progress=clamp(activeAge/pose.activeDuration,0,1);}
      else if(activeAge<pose.activeDuration+pose.recoveryDuration){pose.phase='recovery';pose.progress=clamp((activeAge-pose.activeDuration)/pose.recoveryDuration,0,1);}
      else{if(caster._visualCast===pose)delete caster._visualCast;this.visualCasts.delete(caster);}
    }
  }
  visualBurst(effect,target,kind='hit'){
    if(this.visualBursts.length>=MAX_VISUAL_BURSTS)this.visualBursts.splice(0,this.visualBursts.length-MAX_VISUAL_BURSTS+1);
    this.visualBursts.push({id:this.nextVisualId++,abilityId:effect.abilityId,x:target.x,y:target.y,radius:kind==='landing'?effect.parameters.radius:Math.min(30,Math.max(8,target.r||effect.parameters.radius)),age:0,life:BURST_LIFE[effect.abilityId]||.28,
      hostile:effect.hostile,angle:effect.angle,groundOffset:kind==='landing'?effect.groundOffset:friendlyFoot(target).y-target.y,visualVariant:effect.visualVariant,kind});
  }
  clearPath(origin,target,profile='projectile',radius=0){
    if(this.game.combat?.clearPath)return this.game.combat.clearPath(origin,target,{source:'ability',profile,radius});
    const a=friendlyFoot(origin),b=friendlyFoot(target);return !this.game.terrain?.firstBlocker?.(a.x,a.y,b.x,b.y,radius,profile);
  }
  targets(effect){return effect.hostile?friendlyTargets(this.game):this.game.enemies;}
  eligible(effect,target){
    const g=this.game;if(!alive(target))return false;
    if(effect.profile==='ground'&&!isGrounded(target))return false;
    if(effect.hostile)return isFriendlyActive(g,target)&&(!effect.caster.dungeonId||g.dungeon?.canDamage?.(effect.caster,target)!==false);
    return g.combat?.canTarget?g.combat.canTarget(target,effect.caster,{requireView:true,source:effect.abilityId}):g._inView?.(target)!==false;
  }
  hit(effect,target){
    if(!this.eligible(effect,target))return false;
    const g=this.game,p=effect.parameters,before=target.hp;
    const amount=effect.hostile?damageFriendly(g,target,p.damage,effect.caster):g._hitEnemy(target,p.damage,p.knockback||0,effect.caster,effect.abilityId);
    if(!amount||target.hp>=before)return false;
    this.visualBurst(effect,target);
    this.applyStatus(target,p,effect);
    if(effect.hostile&&p.knockback>0){
      const length=distance(target,effect)||1,push=Math.min(RULES.maxPushDistance,p.knockback);g._moveEntity?.(target,(target.x-effect.x)/length*push,(target.y-effect.y)/length*push);
    }
    g._effect?.(target.x,target.y,'hit',.2,Math.max(5,target.r*.5),effect.abilityId==='frostbolt'?'#b9eaff':effect.abilityId==='fireball'?'#ffb065':'#c6e4e2');
    return true;
  }
  applyStatus(target,p,effect){
    if(!alive(target)||!(p.burnDamage>0||p.slowDuration>0||p.freezeChance>0))return;
    const s=this.statusFor(target);if(!s)return;
    if(p.burnDamage>0){
      const next={damage:p.burnDamage,interval:p.burnInterval,until:this.clock+p.burnDuration,nextAt:this.clock+p.burnInterval,caster:effect.caster,hostile:effect.hostile};
      if(!s.burn||s.burn.until<=this.clock)s.burn=next;
      else{
        const until=Math.max(s.burn.until,next.until);
        if(next.damage/next.interval>s.burn.damage/s.burn.interval){next.nextAt=Math.min(next.nextAt,s.burn.nextAt);s.burn=next;}
        s.burn.until=until;
      }
    }
    if(p.slowDuration>0){const multiplier=clamp(p.slowMultiplier??1,RULES.minSlowMultiplier,1);s.slowMultiplier=s.slowUntil>this.clock?Math.min(s.slowMultiplier,multiplier):multiplier;s.slowUntil=Math.max(s.slowUntil,this.clock+p.slowDuration);}
    if(p.freezeChance>0&&this.clock>=s.freezeProtectedUntil&&Math.random()<clamp(p.freezeChance,0,1)){
      const boss=target.type==='boss',friendly=effect.hostile;
      const duration=Math.min(friendly?RULES.maxFriendlyFreeze:RULES.maxFreeze,(p.freezeDuration||.7)*(boss?(p.bossFreezeMultiplier??.35):1));
      s.frozenUntil=this.clock+duration;s.freezeProtectedUntil=s.frozenUntil+(friendly?RULES.friendlyFreezeImmunity:boss?(p.bossFreezeImmunity??6):(p.freezeImmunity??3));
      s.visualFrozen=true;
    }
  }
  updateStatuses(){
    const g=this.game;
    for(const [entity,s] of this.statuses){
      if(!alive(entity)){this.statuses.delete(entity);continue;}
      if(s.visualFrozen&&s.frozenUntil<=this.clock){
        s.visualFrozen=false;
        this.visualBurst({abilityId:'iceThaw',parameters:{radius:entity.r||14},angle:0,hostile:entity!==g.player&&!entity.isCompanion},entity);
      }
      if(s.burn){const b=s.burn;if(!this.casterActive(b.caster,b.hostile)||b.until<this.clock)s.burn=null;
        else if(b.nextAt<=this.clock){b.nextAt=this.clock+b.interval;if(b.hostile)damageFriendly(g,entity,b.damage,b.caster);else if(g.combat?.canTarget?.(entity,b.caster,{source:'burn'})!==false)g._hitEnemy(entity,b.damage,0,b.caster,'burn');}}
      if(!s.burn&&s.slowUntil<=this.clock&&s.frozenUntil<=this.clock&&s.freezeProtectedUntil<=this.clock&&s.shieldUntil<=this.clock&&this.clock-(s.shieldHitAt??-Infinity)>.22)this.statuses.delete(entity);
    }
  }
  update(dt){
    if(this.game.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    this.clock+=dt;this.updateStatuses();
    for(const burst of this.visualBursts)burst.age+=dt;
    this.visualBursts=this.visualBursts.filter(burst=>burst.age<burst.life);
    for(const effect of this.effects){
      if(!this.casterActive(effect.caster,effect.hostile)){effect.remaining=0;continue;}
      if(effect.age<effect.windup&&this.isFrozen(effect.caster))continue;
      const previousAge=effect.age;effect.age+=dt;
      if(effect.age<effect.windup)continue;
      const elapsed=Math.min(effect.remaining,dt,Math.max(0,effect.age-effect.windup));
      if(elapsed<=0)continue;
      if(['projectile','wave'].includes(effect.shape))this.updateMoving(effect,elapsed);
      else this.updateArea(effect,elapsed,previousAge<effect.windup||effect.age===dt);
      effect.remaining-=elapsed;
    }
    this.effects=this.effects.filter(e=>e.remaining>0);
    this.updateVisualCasts(dt);
  }
  updateMoving(effect,dt){
    const p=effect.parameters,start={x:effect.x,y:effect.y},step=Math.min(p.speed*dt,p.range-effect.distance),end={x:start.x+Math.cos(effect.angle)*step,y:start.y+Math.sin(effect.angle)*step};
    if(step<=0){effect.remaining=0;return;}
    effect.distance+=step;
    if(effect.shape==='wave'){
      effect.x=end.x;effect.y=end.y;
      for(const target of this.targets(effect)){
        if(effect.hit.has(target)||!this.eligible(effect,target))continue;
        const dx=target.x-start.x,dy=target.y-start.y,along=dx*Math.cos(effect.angle)+dy*Math.sin(effect.angle),across=-dx*Math.sin(effect.angle)+dy*Math.cos(effect.angle);
        const inside=isFrostcrownBody(target)?Number.isFinite(frostcrownBodySweep(target,start,end,p.radius)):along>=-target.r-12&&along<=step+target.r+12&&Math.abs(across)<=p.radius+target.r;
        if(inside&&this.clearPath(effect.origin,target,effect.profile)){
          effect.hit.add(target);this.hit(effect,target);
        }
      }
      if(!this.clearPath(projected(effect,start),projected(effect,end),effect.profile,5))effect.remaining=0;
      return;
    }
    // Sweep thin projectiles; check the path to the actual contact, so targets
    // before a wall can still be struck without hitting those behind it.
    let first=Infinity,victim=null;
    for(const target of this.targets(effect))if(this.eligible(effect,target)){
      const t=isFrostcrownBody(target)?frostcrownBodySweep(target,start,end,p.radius):segmentHit(start,end,target,p.radius+(target.r||10));if(t<first){first=t;victim=target;}
    }
    const contact=victim?{x:start.x+(end.x-start.x)*first,y:start.y+(end.y-start.y)*first}:end;
    if(!this.clearPath(projected(effect,start),projected(effect,contact),effect.profile,p.radius)){effect.remaining=0;return;}
    effect.x=contact.x;effect.y=contact.y;
    if(victim){this.hit(effect,victim);effect.remaining=0;}
  }
  updateArea(effect,dt,activated){
    const p=effect.parameters,center={x:effect.x,y:effect.y},activeAge=effect.age-effect.windup;
    // The first active step can follow a frame that ended exactly at windup.
    // Track presentation delivery explicitly so that boundary cannot lose or
    // repeat the landing burst.
    if(effect.shape==='zone'&&!effect.visualLanded){effect.visualLanded=true;this.visualBurst(effect,effect,'landing');}
    const radius=effect.shape==='ring'?p.radius*clamp(activeAge/p.duration,0,1):p.radius;
    for(const target of this.targets(effect)){
      if(!this.eligible(effect,target))continue;
      const repeat=['field','cone'].includes(effect.shape);
      if(repeat?(effect.lastHit.get(target)||-Infinity)>this.clock-p.tickInterval:effect.hit.has(target))continue;
      const dx=target.x-center.x,dy=target.y-center.y,d=Math.hypot(dx,dy);let inside=false;
      if(effect.shape==='cone')inside=isFrostcrownBody(target)?frostcrownBodyArc(target,center,p.range,p.spread*2,effect.angle):d<=p.range+(target.r||0)&&Math.abs(angleDifference(Math.atan2(dy,dx),effect.angle))<=p.spread+(target.r||0)/Math.max(20,d);
      else if(effect.shape==='beam'){
        const beam=beamCapsule(center.x,center.y,effect.angle,p.range,p.radius);
        inside=isFrostcrownBody(target)?Number.isFinite(frostcrownBodySweep(target,beam,{x:beam.x2,y:beam.y2},beam.r)):capsuleHitsCircle(beam,target.x,target.y,target.r||0);
      }else inside=isFrostcrownBody(target)?effect.profile==='ground'?!!frostcrownGroundContact(target,center.x,center.y+(effect.groundOffset||0),radius):frostcrownBodyCircle(target,center.x,center.y,radius):d<=radius+(target.r||0);
      if(!inside||!this.clearPath(projected(effect,center),target,effect.profile))continue;
      if(repeat)effect.lastHit.set(target,this.clock);else effect.hit.add(target);
      this.hit(effect,target);
    }
    if(p.pullSpeed>0&&effect.shape==='field')for(const target of this.targets(effect)){
      if(!this.eligible(effect,target)||!isGrounded(target)||this.isFrozen(target))continue;
      const d=distance(target,center);if(d>p.radius||d<20||!this.clearPath(projected(effect,center),target,'ground'))continue;
      const speed=Math.min(RULES.maxPullSpeed,p.pullSpeed)*(target.type==='boss'?0:1);this.game._moveEntity?.(target,(center.x-target.x)/d*speed*dt,(center.y-target.y)/d*speed*dt);
    }
  }
}
