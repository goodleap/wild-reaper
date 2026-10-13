import { groundOffset } from './terrain.js';

const TAU=Math.PI*2;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const SWORD_ENERGY_RULES=Object.freeze({radius:20,spawnDistance:35,stagger:.035,maxWaves:12,maxRange:260});

// Relative-motion sweep: fast waves and targets crossing between frames still
// meet at their first occupied-circle contact, without extra simulation steps.
export function swordEnergyContact(a,b,target,previous=target,radius=0) {
  const ox=a.x-previous.x,oy=a.y-(previous.aimY??previous.y),
    dx=b.x-a.x-(target.x-previous.x),dy=b.y-a.y-((target.aimY??target.y)-(previous.aimY??previous.y)),
    r=radius+Math.max(0,target.r||0),c=ox*ox+oy*oy-r*r;
  if(c<=0)return 0;
  const aa=dx*dx+dy*dy;if(aa<1e-12)return Infinity;
  const bb=2*(ox*dx+oy*dy),disc=bb*bb-4*aa*c;if(disc<0)return Infinity;
  const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:Infinity;
}

// Test the target's occupied circle, including the blade's end and both edges
// of the sector. A wide monster can be grazed without its center entering it.
export function intersectsSwordArc(origin,target,range,arc,angle) {
  const dx=target.x-origin.x,dy=(target.aimY??target.y)-origin.y,d=Math.hypot(dx,dy),r=Math.max(0,target.r||0);
  if(d>range+r)return false;
  if(d<=r||arc>=TAU)return true;
  const delta=Math.abs(angleDelta(Math.atan2(dy,dx),angle)),half=arc*.5;
  if(delta<=half)return true;
  const edge=delta-half,along=Math.max(0,Math.min(range,d*Math.cos(edge)));
  return d*d+along*along-2*d*along*Math.cos(edge)<=r*r+1e-7;
}

export class SwordCombat {
  constructor(game){this.game=game;this.cooldown=0;this.pending=null;this._visual=null;this._sequence=0;this.energyWaves=[];this._enemyPoints=new WeakMap();}

  clearScene() {
    this.pending=null;this._visual=null;this.cooldown=0;this.energyWaves.length=0;this._enemyPoints=new WeakMap();
    if(this.game.effects)this.game.effects=this.game.effects.filter(e=>e.type!=='swordSlash');
    this._terrain=this.game.terrain;this._scene=this.game.dungeon?.active;this._region=this.game.region?.id;this._sceneKind=this.game.sceneKind;
    this._owner=this.game.player;
    this._lastX=this.game.player.x;this._lastY=this.game.player.y;
  }

  _sceneChanged(dt) {
    const g=this.game,p=g.player;
    return this._owner!==p||this._terrain!==g.terrain||this._scene!==g.dungeon?.active||this._region!==g.region?.id||this._sceneKind!==g.sceneKind||Math.hypot(p.x-(this._lastX??p.x),p.y-(this._lastY??p.y))>Math.max(64,(p.speed||220)*Math.max(0,dt)*2);
  }

  _origin() {const p=this.game.player;return {x:p.x,y:p.y,groundY:p.y+groundOffset(p,true)};}

  _followVisual(dt) {
    const e=this._visual;if(!e)return;
    if(e.life<=0){this._visual=null;return;}
    const origin=this._origin();e.x=origin.x;e.y=origin.y;e.groundY=origin.groundY;e.attackAge+=dt;
  }

  _canHit(enemy,origin) {
    const g=this.game;
    return g.combat?.canTarget?g.combat.canTarget(enemy,origin,{source:'sword',requireView:true,checkPath:true}):enemy.hp>0&&!(enemy.rescueSpawnGrace>0)&&g._inView(enemy)&&(!enemy.dungeonId||g.dungeon?.canDamage(enemy,origin)!==false);
  }

  _propClear(prop,origin) {
    const g=this.game;
    return g._inView({x:prop.x,y:prop.aimY??prop.y})&&g.combat?.clearPath?.(origin,{x:prop.x,y:prop.aimY??prop.y,groundY:prop.y},{source:'sword'})!==false;
  }

  _acquire(origin,stats) {
    const g=this.game;let target=null,best=Infinity;
    const consider=(e,eligible)=>{
      const d=Math.hypot(e.x-origin.x,(e.aimY??e.y)-origin.y);
      if(d<=stats.range+(e.r||0)&&d<best&&eligible()){target=e;best=d;}
    };
    for(const e of g._nearby?.(origin.x,origin.y,stats.range+64)||g.enemies)consider(e,()=>this._canHit(e,origin));
    // Enemies have priority when in reach; a default sword can still open
    // supplies and cut obstructing vines without owning a ranged weapon.
    if(target)return target;
    for(const prop of g.adventure?.props||[])if(prop.hp>0)consider(prop,()=>this._propClear(prop,origin));
    for(const prop of g.environment?.mechanisms?.props||[])if(prop.type==='vine'&&(prop.state==='windup'||prop.state==='active'))consider(prop,()=>this._propClear(prop,origin));
    return target;
  }

  update(dt,stats) {
    const g=this.game,p=g.player;
    if(this._sceneChanged(dt))this.clearScene();
    this._lastX=p.x;this._lastY=p.y;
    if(!stats.equipped){if(this.pending||this._visual||this.energyWaves.length)this.clearScene();return;}
    if(g.status!=='playing')return;
    this._updateEnergy(dt);
    this._followVisual(dt);
    this.cooldown-=dt;
    if(this.pending) {
      this.pending.remaining-=dt;
      if(this.pending.remaining<=0){const swing=this.pending;this.pending=null;this._strike(swing);}
    }
    if(this.pending||this.cooldown>0)return;
    const origin=this._origin(),target=this._acquire(origin,stats);
    if(!target){this.cooldown=.06;return;}
    const angle=Math.atan2((target.aimY??target.y)-origin.y,target.x-origin.x),windup=stats.windup??.065;
    const hitTime=stats.hitTime??windup+.05;
    // Direction and outgoing stats lock at startup, while the owner and path
    // origin are resolved at contact so a moving blade cannot hit from behind.
    this.pending={angle,arc:stats.arc,range:stats.meleeRange??stats.range,damage:stats.damage,knockback:stats.knockback||0,remaining:hitTime,
      energyRank:stats.energyRank||0,energyRange:stats.range,energyCount:stats.energyCount,energySpread:stats.energySpread,
      energyDamage:stats.energyDamage??stats.damage*.8,energySpeed:stats.energySpeed??440,branch:stats.branch};
    this.cooldown=stats.interval;
    p.castFace=Math.max(p.castFace||0,windup+.1);
    const sequence=++this._sequence;
    g._effect(origin.x,origin.y,'swordSlash',stats.duration??.28,stats.meleeRange??stats.range,stats.branch==='heavy'?'#f1d594':'#daf2ed',undefined,{angle,arc:stats.arc,branch:stats.branch,groundY:origin.groundY,seed:sequence,windup,hitTime,attackAge:0,followOwner:true,owner:p,meleeRange:stats.meleeRange??stats.range,energyRank:stats.energyRank??0,energyBonus:stats.energyBonus??0});
    const visual=g.effects?.[g.effects.length-1];this._visual=visual?.type==='swordSlash'&&visual.seed===sequence?visual:null;
    g._emit('swordSwing',{branch:stats.branch,angle});
    if(hitTime<=0){const swing=this.pending;this.pending=null;this._strike(swing);}
  }

  _strike(swing) {
    const g=this.game,{range,arc,angle,damage,knockback}=swing,origin=this._origin();
    if(g.status!=='playing')return;
    const within=target=>intersectsSwordArc(origin,target,range,arc,angle),hitTargets=new Set();
    let hit=false;
    for(const e of g._nearby?.(origin.x,origin.y,range+64)||g.enemies)if(within(e)&&this._canHit(e,origin)) {
      hitTargets.add(e);
      if(g._hitEnemy(e,damage,knockback,origin,'sword')>0)hit=true;
    }
    for(const prop of g.adventure?.props||[])if(prop.hp>0&&within(prop)&&this._propClear(prop,origin)){g.adventure.hitSupply(prop,damage);hitTargets.add(prop);hit=true;}
    if(g.environment?.hitAt(origin.x,origin.y,range,'sword',prop=>{if(!within(prop)||!this._propClear(prop,origin))return false;hitTargets.add(prop);return true;}))hit=true;
    if(swing.energyRank>0)this._launchEnergy(swing,origin,hitTargets);
    if(hit)g._emit('hit');
  }

  _rememberEnemies() {
    for(const e of this.game.enemies)if(e.hp>0){
      let point=this._enemyPoints.get(e);if(!point){point={};this._enemyPoints.set(e,point);}
      point.x=e.x;point.y=e.y;
    }
  }

  _launchEnergy(swing,origin,hitTargets) {
    const rules=SWORD_ENERGY_RULES,g=this.game,count=Math.min(3,Math.max(2,swing.energyCount|| (swing.energyRank===1?2:3))),
      spread=swing.energySpread??(swing.energyRank===1?.12:swing.energyRank===2?.20:.24),
      cast={hitTargets,owner:g.player,seed:this._sequence},speed=swing.energySpeed,
      reach=Math.min(rules.maxRange,swing.energyRange),distance=Math.max(0,reach-rules.spawnDistance-rules.radius);
    this._rememberEnemies();
    for(let i=0;i<count;i++) {
      // The center leads a three-wave cast; the side waves leave at distinct
      // angles and times. All launch anchors lock now, not to the moving owner.
      const offset=count===2?(i?spread:-spread):(i===0?0:i===1?-spread:spread),angle=swing.angle+offset,
        x=origin.x+Math.cos(angle)*rules.spawnDistance,y=origin.y+Math.sin(angle)*rules.spawnDistance,
        groundLift=origin.groundY-origin.y,maxLife=distance/speed;
      const wave={type:'swordEnergy',source:'sword',owner:g.player,cast,seed:this._sequence*3+i,
        x,y,groundY:y+groundLift,groundLift,angle,r:rules.radius,age:0,life:maxLife,maxLife,delay:i*rules.stagger,
        range:reach,speed,damage:swing.energyDamage,knockback:swing.knockback,branch:swing.branch,energyRank:swing.energyRank};
      if(g.combat?.clearPath?.(origin,wave,{source:'sword',radius:wave.r})!==false)this.energyWaves.push(wave);
    }
    if(this.energyWaves.length>rules.maxWaves)this.energyWaves.splice(0,this.energyWaves.length-rules.maxWaves);
  }

  _updateEnergy(dt) {
    if(!this.energyWaves.length||!(dt>0))return;
    const g=this.game;
    for(const wave of this.energyWaves) {
      const delay=Math.max(0,wave.delay);wave.delay=Math.max(0,wave.delay-dt);
      const elapsed=Math.min(Math.max(0,dt-delay),wave.life);if(!(elapsed>0))continue;
      const a={x:wave.x,y:wave.y,groundY:wave.groundY},dx=Math.cos(wave.angle)*wave.speed*elapsed,dy=Math.sin(wave.angle)*wave.speed*elapsed;
      const point=t=>({x:a.x+dx*t,y:a.y+dy*t,groundY:a.groundY+dy*t});
      let fraction=1;
      const blocked=end=>g.combat?.clearPath?.(a,end,{source:'sword',radius:wave.r})===false;
      if(blocked(point(1))){let lo=0,hi=1;for(let i=0;i<8;i++){const mid=(lo+hi)/2;if(blocked(point(mid)))hi=mid;else lo=mid;}fraction=lo;}
      const end=point(fraction),origin={...a,knockbackX:Math.cos(wave.angle),knockbackY:Math.sin(wave.angle)},
        ledger=wave.cast.hitTargets,midX=(a.x+end.x)*.5,midY=(a.y+end.y)*.5,extent=Math.hypot(end.x-a.x,end.y-a.y)*.5+wave.r;
      let hit=false;
      for(const e of g._nearby?.(midX,midY,extent+96)||g.enemies)if(!ledger.has(e)&&this._canHit(e,origin)) {
        const old=this._enemyPoints.get(e)||e,start=delay/dt,finish=(delay+elapsed*fraction)/dt,
          previous={x:old.x+(e.x-old.x)*start,y:old.y+(e.y-old.y)*start},
          current={x:old.x+(e.x-old.x)*finish,y:old.y+(e.y-old.y)*finish,r:e.r};
        if(swordEnergyContact(a,end,current,previous,wave.r)!==Infinity){
          // A shield still consumes this cast's physical contact even when no
          // HP damage remains; sibling waves must not peel it repeatedly.
          ledger.add(e);if(g._hitEnemy(e,wave.damage,wave.knockback,origin,'sword')>0)hit=true;
        }
      }
      const hitsProp=prop=>!ledger.has(prop)&&swordEnergyContact(a,end,prop,prop,wave.r)!==Infinity&&this._propClear(prop,origin);
      for(const prop of g.adventure?.props||[])if(prop.hp>0&&hitsProp(prop)){g.adventure.hitSupply(prop,wave.damage);ledger.add(prop);hit=true;}
      if(g.environment?.hitAt(midX,midY,extent,'sword',prop=>{if(!hitsProp(prop))return false;ledger.add(prop);return true;}))hit=true;
      wave.x=end.x;wave.y=end.y;wave.groundY=end.groundY;wave.age+=elapsed;wave.life=fraction<1?0:Math.max(0,wave.life-elapsed);
      if(hit)g._emit('hit');
    }
    this._rememberEnemies();
    this.energyWaves=this.energyWaves.filter(w=>w.life>1e-9&&g._inView(w,w.r));
  }
}
