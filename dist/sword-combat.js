import { groundOffset } from './terrain.js';

const TAU=Math.PI*2;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

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
  constructor(game){this.game=game;this.cooldown=0;this.pending=null;this._visual=null;this._sequence=0;}

  clearScene() {
    this.pending=null;this._visual=null;this.cooldown=0;
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
    if(!stats.equipped){if(this.pending||this._visual)this.clearScene();return;}
    if(g.status!=='playing')return;
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
    this.pending={angle,arc:stats.arc,range:stats.range,damage:stats.damage,knockback:stats.knockback||0,remaining:hitTime};
    this.cooldown=stats.interval;
    p.castFace=Math.max(p.castFace||0,windup+.1);
    const sequence=++this._sequence;
    g._effect(origin.x,origin.y,'swordSlash',stats.duration??.28,stats.range,stats.branch==='heavy'?'#f1d594':'#daf2ed',undefined,{angle,arc:stats.arc,branch:stats.branch,groundY:origin.groundY,seed:sequence,windup,hitTime,attackAge:0,followOwner:true,owner:p,meleeRange:stats.meleeRange??stats.range,energyRank:stats.energyRank??0,energyBonus:stats.energyBonus??0});
    const visual=g.effects?.[g.effects.length-1];this._visual=visual?.type==='swordSlash'&&visual.seed===sequence?visual:null;
    g._emit('swordSwing',{branch:stats.branch,angle});
    if(hitTime<=0){const swing=this.pending;this.pending=null;this._strike(swing);}
  }

  _strike(swing) {
    const g=this.game,{range,arc,angle,damage,knockback}=swing,origin=this._origin();
    if(g.status!=='playing')return;
    const within=target=>intersectsSwordArc(origin,target,range,arc,angle);
    let hit=false;
    for(const e of g._nearby?.(origin.x,origin.y,range+64)||g.enemies)if(within(e)&&this._canHit(e,origin)) {
      if(g._hitEnemy(e,damage,knockback,origin,'sword')>0)hit=true;
    }
    for(const prop of g.adventure?.props||[])if(prop.hp>0&&within(prop)&&this._propClear(prop,origin)){g.adventure.hitSupply(prop,damage);hit=true;}
    if(g.environment?.hitAt(origin.x,origin.y,range,'sword',prop=>within(prop)&&this._propClear(prop,origin)))hit=true;
    if(hit)g._emit('hit');
  }
}
