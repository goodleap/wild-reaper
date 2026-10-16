import { getConfigSection } from './content-config.js';
import { groundOffset } from './terrain.js';
import { SUPER_SKILL_DEFS, ALL_SUPER_SKILL_DEFS } from './combat-catalog.js';
import { scalePlayerDamage } from './combat-stats.js';
import { isGrounded } from './height-rules.js';
import { SWORD_FLIGHT_RULES, swordFormationAnchor, createSwordFlight, advanceSwordFlight } from './sword-flight.js';
import { isFrostcrownBody, frostcrownBodySweep, frostcrownGroundContact } from './enemy-body-geometry.js';

const freeze=Object.freeze;
export const SUPER_SKILLS=SUPER_SKILL_DEFS;
const CONFIG=getConfigSection('combat').super,TIMING=CONFIG.timing;
export const SUPER_RULES=CONFIG.rules;
const DEFINITIONS=new Map(ALL_SUPER_SKILL_DEFS.map(skill=>[skill.id,skill]));
const availableFrom=(skill,source)=>skill.allowedActors?.includes('player')&&(skill.rewardSources||[skill.source]).includes(source);
const PROPAGATION=CONFIG.propagation;
const DOMAIN_BRANCHES=CONFIG.domainBranches;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
// Rank authored enemy identity, never its remaining health (including dummies).
const targetTier=enemy=>enemy.type==='boss'?2:enemy.elite||enemy.affix?1:0;
const segmentDistance=(x,y,x1,y1,x2,y2)=>{
  const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
  const t=length?clamp(((x-x1)*dx+(y-y1)*dy)/length,0,1):0;
  return Math.hypot(x-x1-dx*t,y-y1-dy*t);
};
// One immutable source supplies both combat and the upgrade-card comparisons.
// damage is a single hit/tick, before the player's shared damage multiplier.
const LEVEL_STATS=CONFIG.levelStats;
const DOMAIN_STATS=CONFIG.domainStats;
export const getSuperSkillStats=(id,level=1,branch='binding')=>id==='domain'?(DOMAIN_STATS[branch]||DOMAIN_STATS.binding)[level-1]||null:LEVEL_STATS[id]?.[level-1]||null;
const upgradeDescription=(id,level,branch)=>{
  const s=getSuperSkillStats(id,level,branch);
  return {
    domain:branch==='erosion'?`每次侵蚀提升至 ${s.damage} 伤害，领域扩大，冷却缩短`:`每次刺击提升至 ${s.damage} 伤害，领域扩大，束缚增强`,
    meteor:`星陨伤害提升至 ${s.damage}，扩大爆炸范围${level===2?'，增加一次星陨':''}`,
    swords:`每轮增加一柄灵剑，单剑伤害提升至 ${s.damage}，冷却缩短`,
    vortex:`漩涡每次伤害提升至 ${s.damage}，范围与牵引速度增加，冷却缩短`
  }[id];
};

// Boss rewards exclusively unlock these skills. Ordinary crystal choices can
// strengthen an already owned skill, but cannot introduce an unearned one.
export class SuperSkills {
  constructor(game) {
    this.game=game;this.owned=game.build.superLevels;this.cooldowns={};this.pending=null;
    this.fields=[];this._volleys=[];this.swordFlights=[];this._erosion=new Map();this._runicShots=[];this._runicCooldown=0;this._id=0;
  }

  offer(source,regionId=this.game.region?.id) {
    if(this.pending||!['region','castle'].includes(source))return false;
    this.pending=this._rewardSnapshot(source,regionId||'forest');
    return true;
  }
  _branch(){return this.game.build.getSkill('domain')?.branch||'binding';}
  _cooldown(id,level){return getSuperSkillStats(id,level,this._branch()).cooldown;}
  _poolSignature(source) {
    const signature=SUPER_SKILLS.filter(skill=>this.game.build.getSkill(skill.id)&&availableFrom(skill,source)).map(skill=>`${skill.id}:${this.owned[skill.id]||0}`).join('|');
    if(source!=='region')return signature;
    const arrow=this.game.build.getWeapon('arrow');
    return `${signature}|${this._branch()}|${arrow?.baseRank||0}:${arrow?.branch||''}:${this.game.build.getRank('arrowRune')}`;
  }
  _regionChoices(regionId) {
    const choices=SUPER_SKILLS.filter(skill=>this.game.build.getSkill(skill.id)&&availableFrom(skill,'region')&&(this.owned[skill.id]||0)<SUPER_RULES.maxLevel).map(skill=>this._choice(skill));
    const arrow=this.game.build.getWeapon('arrow'),currentLevel=this.game.build.getRank('arrowRune');
    if(arrow?.branch!=='ricochet'&&currentLevel<SUPER_RULES.maxLevel) {
      const rune=freeze({id:'runeArrow',name:'符文穿击',desc:currentLevel?'强化贯穿符文的伤害并缩短充能间隔':`${arrow?.baseRank?'':'获得翠羽飞矢；'}飞矢转为穿透路线，射击时周期性释放强力符文重箭`,icon:'✧',color:'#89ddd8',category:'weapon',ownerId:'arrow',tier:'super',abilityTier:'super',source:'region',rewardTier:'区域武器宝藏',kind:currentLevel?'武器专属强化':'武器专属能力',upgradeKind:currentLevel?'modifier':'acquisition',level:currentLevel+1,currentLevel,acquired:currentLevel>0,automatic:true,runic:true});
      if(regionId==='ruins')choices.unshift(rune);else choices.push(rune);
    }
    return choices;
  }
  _rewardSnapshot(source,regionId) {
    const pool=source==='region'?this._regionChoices(regionId):SUPER_SKILLS.filter(skill=>this.game.build.getSkill(skill.id)&&availableFrom(skill,source)&&(this.owned[skill.id]||0)<SUPER_RULES.maxLevel).map(skill=>this._choice(skill));
    let choices=freeze(pool.map(choice=>freeze({...choice,source,rewardTier:source==='castle'?'城堡超级宝藏':'区域超级宝藏'})));
    if(!choices.length) {
      const reward=source==='castle'?SUPER_RULES.castleFallback:SUPER_RULES.regionFallback;
      choices=freeze([freeze({id:'super:resource',name:'满阶宝藏',desc:`可获得的该类能力已全部满阶，获得 ${reward.gold} 金币与 ${reward.crystals} 灵晶`,icon:'◆',color:'#edcf8a',kind:'资源宝藏',source,tier:source==='castle'?'城堡宝藏':'区域宝藏',level:0,automatic:false})]);
    }
    // A suspended portal restores a complete immutable reward snapshot.
    return freeze({source,regionId,choices,signature:this._poolSignature(source)});
  }

  _choice(skill,domainBranch=this._branch()) {
    const currentLevel=this.owned[skill.id]||0,level=currentLevel+1;
    const domain=skill.id==='domain'?{...DOMAIN_BRANCHES[domainBranch],domainBranch,skillId:'domain',ownerId:'domain',category:'skill',upgradeKind:currentLevel?'base':'acquisition'}:{};
    return freeze({...skill,...domain,tier:skill.tier,abilityTier:skill.tier,level,currentLevel,acquired:currentLevel>0,kind:currentLevel?'超级技能强化':'超级技能',desc:currentLevel?upgradeDescription(skill.id,level,domainBranch):(domain.desc||skill.desc)});
  }
  getChoices(){
    // A portal can remain unclaimed while crystals strengthen learned skills,
    // including during a castle visit. Keep its source/order, but never offer
    // a stale upgrade that has already reached its cap. No random rerolling.
    if(this.pending&&this.pending.signature!==this._poolSignature(this.pending.source))this.pending=this._rewardSnapshot(this.pending.source,this.pending.regionId);
    return this.pending?.choices||[];
  }

  choose(id) {
    const g=this.game;
    if(g.status!=='super'||!this.pending)return false;
    const choice=this.getChoices().find(choice=>choice.id===id);
    if(!choice)return false;
    const source=this.pending.source;
    if(id==='super:resource') {
      // Only a freshly recomputed fallback card can reach this branch.
      this.pending=null;
      const reward=source==='castle'?SUPER_RULES.castleFallback:SUPER_RULES.regionFallback;
      g.grantResources({...reward},'superMastered');
      g._emit('superChosen',{skillId:id,name:'满阶宝藏',source});
      return true;
    }
    if(id==='runeArrow') {
      if(source!=='region'||!g.build.awardRuneArrow())return false;
      this.pending=null;
      g._emit('superChosen',{skillId:'runeArrow',weaponId:'arrow',name:choice.name,level:g.build.getRank('arrowRune'),source});
      return true;
    }
    const skillId=choice.skillId||id,skill=DEFINITIONS.get(skillId),current=this.owned[skillId]||0;
    if(!skill||!g.build.getSkill(skillId)||!availableFrom(skill,source)||current>=SUPER_RULES.maxLevel)return false;
    this.owned[skillId]=current+1;
    this.cooldowns[skillId]=current?Math.min(this.cooldowns[skillId]??0,this._cooldown(skillId,current+1)):TIMING.initialCooldown;
    this.pending=null;
    g._emit('superChosen',{skillId,name:choice.name,level:this.owned[skillId],source});
    return true;
  }

  getUpgradeChoices() {
    return SUPER_SKILLS.filter(skill=>this.owned[skill.id]>0&&this.owned[skill.id]<SUPER_RULES.maxLevel)
      .map(skill=>({...this._choice(skill),id:`super:${skill.id}`,skillId:skill.id,kind:'超级技能强化'}));
  }
  upgrade(id) {
    if(this.game.status!=='upgrade'||typeof id!=='string'||!id.startsWith('super:'))return false;
    const skillId=id.slice(6),level=this.owned[skillId];
    if(!SUPER_SKILLS.some(skill=>skill.id===skillId)||!level||level>=SUPER_RULES.maxLevel)return false;
    if(!this.game.build.increment(id))return false;
    this.cooldowns[skillId]=Math.min(this.cooldowns[skillId]??0,this._cooldown(skillId,level+1));
    return true;
  }
  getLoadout() {
    return SUPER_SKILLS.filter(skill=>this.owned[skill.id]>0)
      .map(skill=>({...skill,...(skill.id==='domain'?DOMAIN_BRANCHES[this._branch()]:{}),level:this.owned[skill.id],cooldown:this.cooldowns[skill.id]||0,maxCooldown:this._cooldown(skill.id,this.owned[skill.id])}));
  }

  _foot(entity=this.game.player) {
    const y=Number.isFinite(entity.groundY)?entity.groundY:entity.y+groundOffset(entity,entity===this.game.player||!!entity.isCompanion);
    return {x:entity.x,y,groundY:y};
  }
  _visible(enemy,origin=this._foot()) {
    if(enemy.isCompanion)return false;
    if(this.game.combat?.canTarget)return this.game.combat.canTarget(enemy,{...origin,groundY:origin.y},{requireView:true});
    return enemy.hp>0&&!(enemy.rescueSpawnGrace>0)&&this.game._inView(enemy)&&
      (enemy.dungeonId?this.game.dungeon.canDamage(enemy,{...origin,groundY:origin.y}):enemy.guardActive!==false);
  }
  _lineClear(from,to,r=0,profile='projectile') {
    // Falling attacks can clear outdoor cover, but still respect an interior's
    // walls in addition to the explored-room gate applied by _visible.
    const effective=profile==='overhead'&&this.game.dungeon?.active?'projectile':profile;
    const terrain=this.game.terrain,blocks=terrain?.hasBlocker??terrain?.firstBlocker;
    return effective==='overhead'||!blocks?.call(terrain,from.x,from.y,to.x,to.y,r,effective);
  }
  _compareTargets(a,b,origin,priority=true) {
    return (priority?targetTier(b)-targetTier(a):0)||distance(origin,this._foot(a))-distance(origin,this._foot(b));
  }
  _targets(origin=this._foot(),range=TIMING.targetRange,{strongest=false,skillId='swords'}={}) {
    const profile=PROPAGATION[skillId]||'projectile';
    const targets=this.game.enemies.filter(enemy=>(profile!=='ground'||isGrounded(enemy))&&this._visible(enemy,origin)&&distance(origin,this._foot(enemy))<=range&&this._lineClear(origin,this._foot(enemy),0,profile));
    targets.sort((a,b)=>this._compareTargets(a,b,origin,strongest));
    return targets;
  }
  _center(targets,r) {
    // The input is tier/distance ordered, so a distant eligible Boss cannot
    // disappear behind a dense ordinary crowd's sample budget. Only centers
    // on the highest tier compete; density breaks ties within that tier.
    let best=targets[0],score=-1;
    const sample=targets.slice(0,18);
    for(const target of sample.slice(0,6)) {
      if(targetTier(target)!==targetTier(targets[0]))break;
      const at=this._foot(target),count=sample.reduce((n,enemy)=>n+(distance(at,this._foot(enemy))<=r),0);
      if(count>score){best=target;score=count;}
    }
    return best?this._foot(best):null;
  }
  _field(skillId,point,r,life,extra={}) {
    if(this.fields.length>=SUPER_RULES.maxFields)return null;
    const definition=DEFINITIONS.get(skillId),id=++this._id;
    const field={id,kind:skillId,x:point.x,y:point.y,r,life,maxLife:life,stage:'active',color:definition.color,skillId,seed:id,...extra};
    this.fields.push(field);return field;
  }
  _areaTargets(field,limit=SUPER_RULES.maxTargets) {
    const profile=field.profile||PROPAGATION[field.skillId]||'projectile';
    return this.game.enemies.filter(enemy=>(profile!=='ground'||isGrounded(enemy))&&this._visible(enemy,field)&&this._areaContact(field,enemy)&&this._lineClear(field,this._foot(enemy),0,profile))
      .sort((a,b)=>this._compareTargets(a,b,field)).slice(0,limit);
  }
  _areaContact(field,enemy) {
    // Field centers are authored on the ground plane for every propagation
    // profile. The profile controls walls/flight, not an extra foot offset.
    return isFrostcrownBody(enemy)?!!frostcrownGroundContact(enemy,field.x,field.y,field.r):distance(field,this._foot(enemy))<=field.r+enemy.r;
  }
  _damage(enemy,amount,origin,kind='super') {
    // Raw damage deliberately bypasses bleed, shock and lightning refunds.
    const source=origin===this.game.player?origin:{...origin,groundY:origin.y};
    return this.game._hurtEnemy(enemy,amount,0,source,kind);
  }
  _burst(field,life=.55) {
    this.game._effect(field.x,field.y,'superBurst',life,field.r,field.color,undefined,{skillId:field.skillId,domainBranch:field.domainBranch,seed:field.seed});
  }

  _cast(id,level) {
    if(!SUPER_SKILLS.some(skill=>skill.id===id)||this.game.abilities?.isFrozen(this.game.player))return false;
    const g=this.game,p=g.player,origin=this._foot(),targets=this._targets(origin,id==='swords'?TIMING.swordTargetRange:TIMING.targetRange,{strongest:true,skillId:id});
    if(!targets.length)return false;
    const stats=getSuperSkillStats(id,level,this._branch());
    if(!stats)return false;
    const damage=scalePlayerDamage(g,stats.damage,{skillId:id});
    if(id==='domain') {
      const branch=this._branch(),{radius,duration,interval}=stats;
      const field=this._field(id,this._center(targets,radius),radius,duration,{kind:branch==='binding'?'thorns':'miasma',domainBranch:branch,profile:'ground',tick:interval,interval,damage,root:stats.root,slow:stats.slow,linger:stats.linger,color:DOMAIN_BRANCHES[branch].color});
      if(!field)return false;
      const impactDamage=scalePlayerDamage(g,stats.impactDamage,{skillId:id});
      for(const enemy of this._areaTargets(field)) {
        const dealt=this._damage(enemy,impactDamage,field);
        if(dealt>0&&enemy.hp>0)this._domainContact(enemy,field);
      }
      this._burst(field,.5);
    } else if(id==='meteor') {
      const {radius,count}=stats,points=[];
      for(const enemy of targets) {
        const at=this._foot(enemy);
        if(points.some(point=>distance(point,at)<radius*TIMING.meteorSpacingRatio))continue;
        points.push(at);if(points.length===count)break;
      }
      // Against a lone boss, the second star still lands nearby rather than
      // silently deleting half the reward's damage potential.
      while(points.length<count)points.push({...points[0]});
      for(let i=0;i<points.length;i++)this._field(id,points[i],radius,TIMING.meteorDelay+i*TIMING.meteorStagger,{stage:'warning',damage});
    } else if(id==='swords') {
      if(this._volleys.length>=TIMING.maxVolleys)return false;
      const formationId=++this._id;
      this._volleys.push({skillId:id,formationId,remaining:stats.count,count:stats.count,index:0,tick:TIMING.volleyDelay,interval:stats.interval,damage,targetHits:new Map()});
      g._effect(p.x,p.y,'superBurst',TIMING.volleyDelay+stats.count*stats.interval,48,DEFINITIONS.get(id).color,undefined,{skillId:id,count:stats.count,interval:stats.interval,released:0,castX:p.x,castY:p.y,seed:formationId});
    } else if(id==='vortex') {
      const {radius,duration,interval,pull}=stats;
      if(!this._field(id,this._center(targets,radius),radius,duration,{tick:interval,interval,damage,pull}))return false;
    }
    g._emit('superCast',{skillId:id});return true;
  }

  _domainContact(enemy,field) {
    const now=this.game._clock;
    if(field.domainBranch==='binding'&&enemy.type!=='boss') {
      enemy.superRootUntil=Math.max(enemy.superRootUntil||0,now+field.root);
      enemy.charge=null;enemy._chargeSegment=null;
      enemy.chargeCooldown=Math.max(enemy.chargeCooldown||0,field.root+TIMING.rootChargeDelay);
    }else {
      enemy.superSlowUntil=Math.max(enemy.superSlowUntil||0,now+TIMING.slowRefresh);
      enemy.superSlowFactor=enemy.type==='boss'?Math.max(TIMING.bossMinimumMoveRatio,1-field.slow):1-field.slow;
    }
    if(field.domainBranch==='erosion')this._erosion.set(enemy,{fieldId:field.id,origin:{x:field.x,y:field.y},damage:field.damage*TIMING.erosionDamageRatio,life:field.linger,tick:TIMING.erosionInterval});
  }
  _updateErosion(dt) {
    const g=this.game;
    for(const [enemy,residue] of this._erosion) {
      residue.life-=dt;residue.tick-=dt;
      if(enemy.hp<=0||residue.life<-1e-9||!isGrounded(enemy)) {this._erosion.delete(enemy);continue;}
      if(residue.tick>1e-9)continue;
      residue.tick+=TIMING.erosionInterval;
      if(!this._visible(enemy,residue.origin)||!this._lineClear(residue.origin,this._foot(enemy),0,'ground'))continue;
      // The field owns all in-area ticks. Residue only pays after leaving it.
      const field=this.fields.find(field=>field.id===residue.fieldId&&field.life>1e-9);
      if(field&&this._areaContact(field,enemy))continue;
      if(this._damage(enemy,residue.damage,residue.origin)>0&&enemy.hp>0){
        enemy.superSlowUntil=Math.max(enemy.superSlowUntil||0,g._clock+TIMING.erosionSlowDuration);
        enemy.superSlowFactor=enemy.type==='boss'?TIMING.erosionBossMoveRatio:TIMING.erosionMoveRatio;
      }
    }
  }

  castRunicVolley(stats,target) {
    const g=this.game;
    if(g.status!=='playing'||g.abilities?.isFrozen(g.player)||!stats?.equipped||!g.build.isEquipped('arrow')||!(stats.runic>0)||this._runicCooldown>1e-9||this._runicShots.length)return false;
    target=target||this._targets(this._foot(),stats.range,{skillId:'runeArrow'})[0];
    if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y)||Math.hypot(target.x-g.player.x,(target.aimY??target.y)-g.player.y)>stats.range)return false;
    const origin=this._foot(),visual={x:g.player.x,y:g.player.y},angle=Math.atan2((target.aimY??target.y)-visual.y,target.x-visual.x);
    this._runicShots.push({origin,visual,angle,tick:TIMING.runicDelay,width:TIMING.runicWidth+TIMING.runicWidthPerRank*(stats.runic-1),range:TIMING.runicRange,damage:stats.runicDamage??stats.damage*(TIMING.runicDamageFallbackMultiplier+TIMING.runicDamageFallbackPerRank*(stats.runic-1))});
    this._runicCooldown=stats.runicInterval??TIMING.runicInterval-TIMING.runicIntervalReductionPerRank*(stats.runic-1);
    g._effect(visual.x,visual.y,'superRunicCharge',TIMING.runicDelay,18,'#89ddd8',undefined,{skillId:'runeArrow',renderGroundY:origin.y,angle,seed:++this._id});
    return true;
  }
  _updateRunic(dt) {
    this._runicCooldown=Math.max(0,this._runicCooldown-dt);
    const g=this.game;
    if(!g.build.isEquipped('arrow')){this._runicShots=[];return;}
    for(const shot of this._runicShots) {
      shot.tick-=dt;if(shot.tick>1e-9)continue;
      const {origin,visual,angle,width}=shot,dx=Math.cos(angle),dy=Math.sin(angle);
      let length=shot.range;
      if(!this._lineClear(origin,{x:origin.x+dx*length,y:origin.y+dy*length},width)) {
        let lo=0,hi=length;
        for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(this._lineClear(origin,{x:origin.x+dx*mid,y:origin.y+dy*mid},width))lo=mid;else hi=mid;}
        length=lo;
      }
      const end={x:visual.x+dx*length,y:visual.y+dy*length};
      const targets=g.enemies.filter(enemy=>this._visible(enemy,origin)&&(isFrostcrownBody(enemy)?Number.isFinite(frostcrownBodySweep(enemy,visual,end,width)):segmentDistance(enemy.x,enemy.y,visual.x,visual.y,end.x,end.y)<=enemy.r+width)&&this._lineClear(origin,this._foot(enemy)))
        .sort((a,b)=>distance(visual,a)-distance(visual,b)).slice(0,SUPER_RULES.maxTargets);
      g._effect(visual.x,visual.y,'superRay',.48,width,'#89ddd8',undefined,{x2:end.x,y2:end.y,renderGroundY:origin.y,renderEndGroundY:end.y+origin.y-visual.y,skillId:'runeArrow',seed:++this._id});
      for(const enemy of targets)this._damage(enemy,shot.damage,origin,'runeArrow');
      g._emit('superCast',{skillId:'runeArrow',weaponId:'arrow'});
    }
    this._runicShots=this._runicShots.filter(shot=>shot.tick>1e-9);
  }

  _updateFields(dt) {
    const g=this.game;
    for(const field of this.fields) {
      field.life-=dt;
      if(field.kind==='meteor') {
        if(field.life<=1e-9) {
          this._burst(field,.82);
          for(const enemy of this._areaTargets(field,12))this._damage(enemy,field.damage,field);
          g._emit('superImpact',{skillId:'meteor',x:field.x,y:field.y});
        }
        continue;
      }
      field.tick-=dt;
      if(field.kind!=='vortex'&&field.tick>1e-9)continue;
      const targets=this._areaTargets(field);
      if(field.kind==='vortex')for(const enemy of targets) {
        // Keep the advertised geometry of attacks already being telegraphed.
        if(enemy.type==='boss'||enemy.charge||enemy.cast||enemy.slam||enemy.bloomAttack)continue;
        const foot=this._foot(enemy),dx=field.x-foot.x,dy=field.y-foot.y,d=Math.hypot(dx,dy);
        if(d>enemy.r+6){const step=Math.min(d-enemy.r-6,field.pull*dt);g._moveEntity(enemy,dx/d*step,dy/d*step);}
      }
      if(field.tick<=1e-9) {
        field.tick+=field.interval;
        for(const enemy of targets){const dealt=this._damage(enemy,field.damage,field);if(dealt>0&&enemy.hp>0&&field.skillId==='domain')this._domainContact(enemy,field);}
      }
    }
    this.fields=this.fields.filter(field=>field.life>1e-9);
  }
  _updateVolleys(dt) {
    const g=this.game,p=g.player;
    for(const volley of this._volleys) {
      // Unlaunched swords share the actual caster position. Ground decoration
      // retains castX/Y, but the formation and release count follow simulation.
      const formation=g.effects.find(effect=>effect.type==='superBurst'&&effect.skillId==='swords'&&effect.seed===volley.formationId);
      if(formation){formation.x=p.x;formation.y=p.y;}
      volley.tick-=dt;if(volley.tick>1e-9)continue;
      volley.tick+=volley.interval;volley.remaining--;
      const index=volley.index++;
      if(formation)formation.released=volley.count-volley.remaining;
      const anchor=swordFormationAnchor(p,index,volley.count),{x,y}=anchor;
      const origin={x,y:y+groundOffset(p,true),groundY:y+groundOffset(p,true)};
      if(!this._lineClear(this._foot(),origin,9,'projectile'))continue;
      const targets=this._targets(this._foot(),TIMING.swordTargetRange,{strongest:true,skillId:'swords'}).filter(target=>this._lineClear(origin,this._foot(target),0,'projectile'));
      let target=null,fewest=Infinity;
      for(const candidate of targets) {
        if(targetTier(candidate)!==targetTier(targets[0]))break;
        const hits=volley.targetHits.get(candidate.id)||0;
        if(hits<fewest){target=candidate;fewest=hits;}
        if(!hits)break;
      }
      if(!target||this.swordFlights.length>=SWORD_FLIGHT_RULES.maxFlights)continue;
      volley.targetHits.set(target.id,fewest+1);
      this.swordFlights.push(createSwordFlight({id:++this._id,anchor,groundLift:groundOffset(p,true),target,targetPoint:this._swordPoint(target),damage:volley.damage}));
    }
    this._volleys=this._volleys.filter(volley=>volley.remaining>0);
  }
  _swordPoint(target){const point=this._foot(target);return {...point,lift:point.y-target.y};}
  _updateSwordFlights(dt){
    for(const flight of this.swordFlights)advanceSwordFlight(flight,dt,{
      pointOf:target=>this._swordPoint(target),
      blocked:(from,to,r)=>!this._lineClear(from,to,r,'projectile'),
      onImpact:(arrived,origin,damageTarget)=>{
        const {x,visualY:y,groundY}=arrived,angle=arrived.visualAngle??arrived.angle;
        this.game._effect(x,y,'superSword',.28,9,DEFINITIONS.get('swords').color,undefined,{x2:x,y2:y,groundY,angle,impactOnly:true,skillId:'swords',seed:arrived.id,blocked:arrived.reason==='blocked'});
        if(damageTarget)this._damage(arrived.target,arrived.damage,origin);
      }
    });
    this.swordFlights=this.swordFlights.filter(flight=>!flight.done);
  }

  movementMultiplier(enemy) {
    if(enemy.isCompanion||!isGrounded(enemy))return 1;
    if(enemy.type!=='boss'&&(enemy.superRootUntil||0)>this.game._clock)return 0;
    return (enemy.superSlowUntil||0)>this.game._clock?(enemy.superSlowFactor??1):1;
  }
  clearScene() {
    this.fields=[];this._volleys=[];this.swordFlights=[];this._erosion.clear();this._runicShots=[];
    for(const enemy of this.game.enemies)for(const key of ['superRootUntil','superSlowUntil','superSlowFactor'])delete enemy[key];
    this.game.effects=this.game.effects.filter(effect=>!effect.skillId||(!DEFINITIONS.has(effect.skillId)&&effect.skillId!=='runeArrow'));
  }
  update(dt) {
    if(this.game.status!=='playing'||this.game.sceneTransition?.active||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(.05,dt);
    this._updateErosion(dt);this._updateFields(dt);this._updateSwordFlights(dt);this._updateVolleys(dt);this._updateRunic(dt);
    for(const skill of SUPER_SKILLS) {
      const level=this.owned[skill.id];if(!level)continue;
      this.cooldowns[skill.id]=Math.max(0,(this.cooldowns[skill.id]||0)-dt);
      if(this.cooldowns[skill.id]<=1e-9&&!this.game.abilities?.isFrozen(this.game.player))this.cooldowns[skill.id]=this._cast(skill.id,level)?this._cooldown(skill.id,level):TIMING.retryCooldown;
    }
  }
}
