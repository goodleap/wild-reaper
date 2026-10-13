import { STORM_DURATION } from './storm-geometry.js';
import { groundOffset } from './terrain.js';
import { blocksObstacle, isGrounded } from './height-rules.js';
import { weaponStats, skillStats, ATTACK_DEFAULTS } from './combat-stats.js';
import { WeaponTrail } from './weapon-trails.js';
import { SwordCombat } from './sword-combat.js';

const TAU=Math.PI*2;
const sq=v=>v*v;
const dist2=(a,b)=>sq(a.x-b.x)+sq(a.y-b.y);
// Every execution path delegates eligibility to the same resolver. The fallback
// supports isolated simulations and old callers during the staged migration.
const canTarget=(g,e,origin,options={})=>g.combat?.canTarget
  ?g.combat.canTarget(e,origin,options)
  :e.hp>0&&!(e.rescueSpawnGrace>0)&&(options.canHitFlying!==false||isGrounded(e))&&(!options.requireView||g._inView(e))&&(!e.dungeonId||g.dungeon.canDamage(e,origin));
const clearPath=(g,origin,target,options={})=>g.combat?.clearPath?.(origin,target,options)!==false;
const propPath=(g,origin,prop,source)=>clearPath(g,origin,{x:prop.x,y:prop.aimY??prop.y,groundY:prop.y},{source,radius:source==='arrow'?4:0});
function syncTrailScene(trail,g) {
  if(trail.terrain!==g.terrain||trail.scene!==g.dungeon?.active||trail.region!==g.region?.id||trail.sceneKind!==g.sceneKind)trail.clear();
  trail.terrain=g.terrain;trail.scene=g.dungeon?.active;trail.region=g.region?.id;trail.sceneKind=g.sceneKind;
}
function nearestProp(g,props,fallback,range,eligible){
  const p=g.player;let result=null,best=range*range;
  for(const prop of props||[fallback].filter(Boolean))if(eligible(prop)){
    const d=sq(prop.x-p.x)+sq((prop.aimY??prop.y)-p.y);
    if(d<best&&g._inView({x:prop.x,y:prop.aimY??prop.y})&&propPath(g,p,prop,'arrow')){best=d;result=prop;}
  }
  return result;
}

export function circleImpact(x,y,dx,dy,cx,cy,r) {
  const ox=x-cx,oy=y-cy,c=ox*ox+oy*oy-r*r;if(c<=0)return 0;
  const a=dx*dx+dy*dy;if(a<1e-12)return Infinity;
  const b=2*(ox*dx+oy*dy),discriminant=b*b-4*a*c;if(discriminant<0)return Infinity;
  const t=(-b-Math.sqrt(discriminant))/(2*a);return t>=0&&t<=1?t:Infinity;
}
export function obstacleImpact(o,x,y,dx,dy,r) {
  const angle=o.angle||0,half=o.type==='log'?o.halfLength:0,ux=Math.cos(angle),uy=Math.sin(angle);
  const ax=o.x-ux*half,ay=o.y-uy*half,bx=o.x+ux*half,by=o.y+uy*half,R=o.r+r;
  let first=Math.min(circleImpact(x,y,dx,dy,ax,ay,R),circleImpact(x,y,dx,dy,bx,by,R));
  if(half) {
    const along=(x-ax)*ux+(y-ay)*uy,normal=-(x-ax)*uy+(y-ay)*ux;
    const ds=dx*ux+dy*uy,dn=-dx*uy+dy*ux;
    if(along>=0&&along<=half*2&&Math.abs(normal)<=R)return 0;
    if(Math.abs(dn)>1e-12)for(const side of [-1,1]) {
      const t=(side*R-normal)/dn,s=along+ds*t;
      if(t>=0&&t<=1&&s>=0&&s<=half*2)first=Math.min(first,t);
    }
  }
  return first;
}

// Execution owns attack cadence and transient effects. Build state and derived
// stats live elsewhere; it never edits upgrade ranks or reapplies global power.
export class CombatAttacks {
  constructor(game){this.game=game;this._orbitTrails=new Map();this.sword=new SwordCombat(game);}

  clearScene(){this.sword.clearScene();}

  clearTrails() {
    for(const b of this.game.bullets)b.trail?.clear();
    this._orbitTrails.clear();this._orbitTrailClock=undefined;
    this.clearScene();
  }

  castStorm() {
    const g=this.game,p=g.player,stats=skillStats(g,'storm');
    const targets=g.enemies.filter(e=>canTarget(g,e,p,{requireView:true,source:'storm',checkPath:true}));
    p.skillCooldownMax=stats.cooldown;p.skillCooldown=stats.cooldown;p.castFace=.25;
    g.storm={x:p.x,y:p.y,viewWidth:g.viewWidth,viewHeight:g.viewHeight,life:STORM_DURATION,maxLife:STORM_DURATION,targets:targets.map(e=>({x:e.x,y:e.y,r:e.r,seed:e.id}))};
    g._emit('skill');
    for(const e of targets)g._hitEnemy(e,stats.damage,0,p,'storm');
    g.environment?.hitAllVisible('storm');
    g._effect(p.x,p.y,'ring',.45,95,'#d4e7ff');
  }

  updateBasic(dt) {
    const g=this.game,p=g.player,stats=weaponStats(g,'arrow');
    if(!stats.equipped) {
      // Unequipping suppresses its in-flight effects as well as new volleys.
      g.bullets=g.bullets.filter(b=>b.weaponId&&b.weaponId!=='arrow');
      return;
    }
    g._shot-=dt;
    if(g._shot<=0) {
      const enemy=g._nearest(p.x,p.y,stats.range,undefined,p,{source:'arrow',pathRadius:4}),
        supply=nearestProp(g,g.adventure?.props,g.adventure?.nearestSupply(280),280,prop=>prop.hp>0),
        vine=nearestProp(g,g.environment?.mechanisms?.props,g.environment?.nearestDestructible?.(280),280,prop=>prop.type==='vine'&&(prop.state==='windup'||prop.state==='active'));
      const supplyDistance=supply?sq(supply.x-p.x)+sq((supply.aimY??supply.y)-p.y):Infinity;
      let target=supply&&(!enemy||(dist2(enemy,p)>180*180&&supplyDistance<dist2(enemy,p)))?supply:enemy;
      if(vine&&(!enemy||dist2(enemy,p)>150*150))target=vine;
      if(target) {
        g._shot=stats.interval;
        const base=Math.atan2((target.aimY??target.y)-p.y,target.x-p.x),branch=stats.branch;
        g._volley=(g._volley||0)+1;
        for(let i=0;i<stats.count;i++) {
          const angle=base+(i?Math.ceil(i/2)*.16*(i%2?1:-1)*(g._volley%2?1:-1):0);
          // A projectile snapshots its source and numbers. Later upgrades or
          // expiry of fury do not alter a volley already crossing the screen.
          g.bullets.push({weaponId:'arrow',x:p.x,y:p.y,r:4,angle,color:branch==='ricochet'?'#ead59b':branch==='pierce'?'#a5eed1':'#c3e9a4',vx:Math.cos(angle)*stats.speed,vy:Math.sin(angle)*stats.speed,speed:stats.speed,life:stats.life,damage:stats.damage*(i?.6:1),branch,pierce:stats.targetLimit,targetLimit:stats.targetLimit,maxBounces:stats.maxBounces,retention:stats.retention,bounces:0,hitIds:new Set()});
        }
        if(stats.runic>0)g.superSkills?.castRunicVolley?.(stats,target);
        g._emit('shoot');
      }else g._shot=.06;
    }
    for(const b of g.bullets)this.updateArrow(b,dt);
    g.bullets=g.bullets.filter(b=>b.life>0&&g._inView(b,24));
  }

  updateArrow(b,dt) {
    const g=this.game;
    if(b.life<=0)return;
    const elapsed=Math.min(dt,b.life);b.life-=dt;
    // Samples are taken at sweep boundaries, including the exact ricochet
    // impact before its remaining motion. Rendering never guesses a direction.
    const trail=b.trail||(b.trail=new WeaponTrail('arrow')),clock=Number.isFinite(g._clock)?g._clock:0;
    syncTrailScene(trail,g);
    if(trail.count&&!trail.endsAt(b.x,b.y))trail.clear();
    if(!trail.count)trail.add(b.x,b.y,clock-elapsed);
    let remaining=elapsed;
    const targetLimit=Math.min(ATTACK_DEFAULTS.maxArrowTargets,b.targetLimit??3);
    // Sweep each segment, including the remainder after a bounce. Bounded
    // targets prevent extra branch ranks from growing collision work forever.
    for(let segment=0;segment<targetLimit;segment++) {
      const x=b.x,y=b.y,dx=b.vx*remaining,dy=b.vy*remaining;
      let impact=null,first=Infinity,isSupply=false,wallHit=Infinity;
      const groundY=y+groundOffset(g.player,true),origin={x,y,groundY};
      for(const wall of g.terrain.query(Math.min(x,x+dx)-b.r,Math.min(groundY,groundY+dy)-b.r,Math.max(x,x+dx)+b.r,Math.max(groundY,groundY+dy)+b.r))if(blocksObstacle(wall,'projectile'))wallHit=Math.min(wallHit,obstacleImpact(wall,x,groundY,dx,dy,b.r));
      first=wallHit;
      const nearby=g._nearby(x+dx*.5,y+dy*.5,Math.hypot(dx,dy)*.5+64);
      for(const e of nearby)if(!b.hitIds.has(e.id)&&canTarget(g,e,origin)) {
        const t=circleImpact(x,y,dx,dy,e.x,e.y,b.r+e.r+3);
        if(t<first||(t===first&&impact&&!isSupply&&e.id<impact.id)){first=t;impact=e;isSupply=false;}
      }
      for(const prop of g.adventure?.props||[])if(prop.hp>0) {
        const t=circleImpact(x,y,dx,dy,prop.x,prop.aimY??prop.y,b.r+prop.r);
        if(t<first){first=t;impact=prop;isSupply=true;}
      }
      const fraction=Number.isFinite(first)?first:1;
      b.x=x+dx*fraction;b.y=y+dy*fraction;
      trail.add(b.x,b.y,clock-remaining+remaining*fraction);
      g.environment?.hitSegment(x,y,b.x,b.y,b.r,'arrow');
      if(!impact){if(Number.isFinite(wallHit)){b.life=0;g._effect(b.x,b.y,'hit',.18,7,'#d8cfba',undefined,{source:'arrow',angle:b.angle||0,strength:.18});}break;}
      if(isSupply){g.adventure.hitSupply(impact,b.damage);b.life=0;break;}
      b.hitIds.add(impact.id);g._hitEnemy(impact,b.damage,4,origin,'arrow');g._emit('hit');
      if(--b.pierce<=0||b.hitIds.size>=targetLimit){b.life=0;break;}
      remaining*=1-first;
      if(b.branch==='pierce'||b.branch==='ricochet')b.damage*=b.retention??.65;
      if(b.branch==='ricochet') {
        const next=(b.bounces||0)<(b.maxBounces??2)?g._nearest(b.x,b.y,150,b.hitIds,{x:b.x,y:b.y,groundY:b.y+groundOffset(g.player,true)},{source:'arrow',pathRadius:b.r}):null;
        if(!next){b.life=0;break;}
        b.bounces=(b.bounces||0)+1;
        b.angle=Math.atan2(next.y-b.y,next.x-b.x);
        b.vx=Math.cos(b.angle)*(b.speed??ATTACK_DEFAULTS.arrowSpeed);b.vy=Math.sin(b.angle)*(b.speed??ATTACK_DEFAULTS.arrowSpeed);
        b.life=Math.max(b.life,.25);
        g._effect(b.x,b.y,'arrowRicochet',.22,14,'#ead59b',undefined,{x2:next.x,y2:next.y,branch:'ricochet'});
      }
      if(remaining<=1e-9)break;
    }
  }

  updateAbilities(dt) {
    this.game._syncEvolutions();
    this.updateSword(dt);
    this.updateOrbit();
    this.updatePulse(dt);
    this.updateLightning(dt);
  }

  updateSword(dt){this.sword.update(dt,weaponStats(this.game,'sword'));}

  updateOrbit() {
    const g=this.game,p=g.player,stats=weaponStats(g,'orbit');
    g.orbitals=[];
    if(!stats.equipped){this._orbitTrails.clear();this._orbitTrailClock=undefined;return;}
    const elapsed=g._clock-(this._orbitTrailClock??g._clock),travel=Math.hypot(p.x-(this._orbitTrailPlayerX??p.x),p.y-(this._orbitTrailPlayerY??p.y));
    if(this._orbitTrailCount!==stats.count||this._orbitTrailRadius!==stats.radius||this._orbitTrailSpeed!==stats.rotationSpeed||this._orbitTrailEvolved!==g.evolutions.orbit||elapsed<0||elapsed>.25||travel>Math.max(48,Math.max(0,elapsed)*(p.speed||220)*1.8))this._orbitTrails.clear();
    this._orbitTrailCount=stats.count;this._orbitTrailRadius=stats.radius;this._orbitTrailSpeed=stats.rotationSpeed;this._orbitTrailEvolved=g.evolutions.orbit;
    this._orbitTrailClock=g._clock;this._orbitTrailPlayerX=p.x;this._orbitTrailPlayerY=p.y;
    const cycle=(g._clock-(g._orbitEvolutionStartedAt||0))%3;
    const surge=g.evolutions.orbit&&cycle<.9?Math.sin(Math.PI*cycle/.9):0,radius=stats.radius+55*surge;
    for(let i=0;i<stats.count;i++) {
      const a=g._clock*stats.rotationSpeed+i*TAU/stats.count;
      const blade={x:p.x+Math.cos(a)*radius,y:p.y+Math.sin(a)*radius,r:12,angle:a,evolved:g.evolutions.orbit,surge};
      const origin={x:blade.x,y:blade.y,groundY:blade.y+groundOffset(p,true)};
      let trail=this._orbitTrails.get(i);if(!trail){trail=new WeaponTrail('orbit');this._orbitTrails.set(i,trail);}syncTrailScene(trail,g);
      if(!clearPath(g,p,origin,{source:'orbit',radius:blade.r})){trail.clear();continue;}
      if(trail.count&&!trail.endsAt(blade.x,blade.y)){
        const last=trail.index(trail.count-1),prior={x:trail.points[last],y:trail.points[last+1],groundY:trail.points[last+1]+groundOffset(p,true)};
        if(!clearPath(g,prior,origin,{source:'orbit',radius:blade.r}))trail.clear();
      }
      trail.add(blade.x,blade.y,g._clock);blade.trail=trail;
      g.orbitals.push(blade);
      g.environment?.hitAt(blade.x,blade.y,blade.r,'orbit',prop=>propPath(g,origin,prop,'orbit'));
      for(const e of g._nearby(blade.x,blade.y,65))if(e.orbitHit<=0&&dist2(e,blade)<sq(e.r+blade.r)&&canTarget(g,e,origin,{source:'orbit',checkPath:true})) {
        g._hitEnemy(e,stats.damage,8,origin,'orbit');e.orbitHit=stats.hitInterval;
      }
      for(const prop of g.adventure?.props||[])if(prop.hp>0&&(prop._orbitNext||0)<=g.time&&sq(prop.x-blade.x)+sq((prop.aimY??prop.y)-blade.y)<sq(prop.r+blade.r)&&propPath(g,origin,prop,'orbit')) {
        g.adventure.hitSupply(prop,stats.damage);prop._orbitNext=g.time+stats.hitInterval;
      }
    }
  }

  updatePulse(dt) {
    const g=this.game,p=g.player,stats=skillStats(g,'pulse');
    for(const echo of g._pulseEchoes) {
      echo.life-=dt;
      if(echo.life<=0)this.castPulse(echo.x,echo.y,echo.r,echo.damage,12,true);
    }
    g._pulseEchoes=g._pulseEchoes.filter(e=>e.life>0);
    g._pulse-=dt;
    if(!stats.owned||g._pulse>0)return;
    // The extended echo is part of the same cast, so a reachable enemy in its
    // outer band is also a useful target. Never spend a full cooldown on air.
    const reach=stats.radius*(stats.echo?1.2:1),origin={x:p.x,y:p.y,groundY:p.y+groundOffset(p,true)};
    const hasEnemy=g.enemies.some(e=>dist2(e,p)<sq(reach+e.r)&&canTarget(g,e,origin,{requireView:true,source:'pulse',checkPath:true,canHitFlying:false}));
    const hasSupply=!hasEnemy&&(g.adventure?.props||[]).some(prop=>prop.hp>0&&sq(prop.x-p.x)+sq((prop.aimY??prop.y)-p.y)<sq(reach+prop.r)&&g._inView({x:prop.x,y:prop.aimY??prop.y})&&propPath(g,origin,prop,'pulse'));
    const hasVine=!hasEnemy&&!hasSupply&&(g.environment?.mechanisms?.props||[]).some(prop=>prop.type==='vine'&&(prop.state==='windup'||prop.state==='active')&&sq(prop.x-p.x)+sq((prop.aimY??prop.y)-p.y)<sq(reach+prop.r)&&g._inView({x:prop.x,y:prop.aimY??prop.y})&&propPath(g,origin,prop,'pulse'));
    if(!hasEnemy&&!hasSupply&&!hasVine){g._pulse=.06;return;}
    g._pulse=stats.cooldown;
    this.castPulse(p.x,p.y,stats.radius,stats.damage,stats.knockback,false,stats.control,stats.controlDuration);
    if(stats.echo)g._pulseEchoes.push({x:p.x,y:p.y,r:stats.radius*1.2,damage:stats.damage*(stats.echoRetention??.6),life:stats.echoDelay??.35,maxLife:stats.echoDelay??.35});
  }

  updateLightning(dt) {
    const g=this.game,p=g.player,stats=skillStats(g,'lightning');
    g._lightning-=dt;
    if(!stats.owned||g._lightning>0)return;
    let origin=p;const excluded=new Set();
    let hit=false;
    if(stats.focus) {
      let target=null;
      for(const e of g.enemies)if(dist2(e,p)<=stats.range*stats.range&&canTarget(g,e,p,{requireView:true,source:'lightning',checkPath:true})) {
        if(!target||(e.type==='boss'&&target.type!=='boss')||((e.type==='boss')===(target.type==='boss')&&(e.hp>target.hp||(e.hp===target.hp&&dist2(e,p)<dist2(target,p)))))target=e;
      }
      if(target) {
        hit=true;
        g._effect(p.x,p.y,'lightning',.32,0,'#dcecff',undefined,{x2:target.x,y2:target.y,evolved:true,branch:'focus',focus:true,chainIndex:0});
        g._hitEnemy(target,stats.primaryDamage,0,p,'lightning');
        g.environment?.hitAt(target.x,target.y,target.r,'lightning',prop=>propPath(g,target,prop,'lightning'));
      }
    }else for(let i=0;i<stats.targetLimit;i++) {
      const e=g._nearest(origin.x,origin.y,i===0?stats.range:stats.chainRange,excluded,origin,{source:'lightning'});if(!e)break;
      hit=true;
      excluded.add(e.id);
      g._effect(origin.x,origin.y,'lightning',.22,0,'#d5d0fb',undefined,{x2:e.x,y2:e.y,evolved:stats.evolved,branch:stats.branch,chainIndex:i});
      g._hitEnemy(e,stats.damage*(i>=3?(stats.chainRetention??.85):1),0,origin,'lightning');
      g.environment?.hitAt(e.x,e.y,e.r,'lightning',prop=>propPath(g,e,prop,'lightning'));origin=e;
    }
    g._lightning=hit?stats.cooldown:.06;
  }

  castPulse(x,y,radius,damage,knockback,echo=false,control=false,controlDuration=1.1) {
    const g=this.game,origin={x,y,groundY:y+groundOffset(g.player,true)};
    g._effect(x,y,'ring',control?.65:echo?.6:.48,radius,control?'#9fe5cf':echo?'#c6ead5':'#9de0b3',undefined,{quake:true,groundY:origin.groundY,evolved:g.evolutions.pulse,echo,control,branch:g.branches.pulse});
    const source=echo?'echo':'pulse';
    for(const e of g.enemies)if(dist2(origin,e)<sq(radius+e.r)&&canTarget(g,e,origin,{source,checkPath:true,canHitFlying:false})) {
      const dealt=g._hitEnemy(e,damage,knockback,origin,source);
      if(dealt>0&&e.hp>0&&e.type!=='boss') {
        if(e.charge||e._chargeSegment){e.charge=null;e._chargeSegment=null;e.chargeCooldown=Math.max(e.chargeCooldown||0,1.2);}
        if(control)e.branchSlowUntil=g._clock+controlDuration;
      }
    }
    g.environment?.hitAt(x,y,radius,source,prop=>propPath(g,origin,prop,source));
    for(const prop of g.adventure?.props||[])if(prop.hp>0&&sq(prop.x-x)+sq((prop.aimY??prop.y)-y)<sq(radius+prop.r)&&propPath(g,origin,prop,source))g.adventure.hitSupply(prop,damage);
  }
}
