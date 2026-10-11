import { groundOffset } from './terrain.js';

const TAU=Math.PI*2;
const TYPES=['treasure','hunt'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Optional, short objectives share the ordinary enemy population and drop the
// existing supplies. They neither create experience nor interrupt play.
export class Encounters {
  constructor(game,{generation=true}={}) {
    this.game=game;this.generation=generation;this.active=null;
    this.nextAt=70;this._id=0;this._nextType=Math.random()<.5?'treasure':'hunt';
  }
  _foot(entity=this.game.player,isPlayer=true) {
    return {x:entity.x,y:entity.y+groundOffset(entity,isPlayer)};
  }
  _canStart() {
    const g=this.game;
    if(g.enemies.some(e=>e.type==='boss'&&e.hp>0)||g.nextBossAt-g.time<45)return false;
    const chest=g.adventure?.treasure;
    // An ignored, unopened chest is not a permanent veto on other objectives.
    if(chest?.state==='active'&&distance(chest,this._foot())<600)return false;
    return true;
  }
  _point(x,y) {
    const g=this.game,p=this._foot(),chest=g.adventure?.treasure;
    const free=(candidate)=>g.terrain.isFree(candidate.x,candidate.y,42)&&
      !g.adventure?.props.some(o=>distance(o,candidate)<70)&&
      (!chest||distance(chest,candidate)>180);
    if(Number.isFinite(x)&&Number.isFinite(y))return free({x,y})?{x,y}:null;
    const start=Math.random()*TAU;
    for(let i=0;i<30;i++) {
      const a=start+i*TAU/30,r=280+(i%3)*50;
      const candidate={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};
      if(free(candidate))return candidate;
    }
    return null;
  }
  spawn(type=this._nextType,x,y) {
    const g=this.game;
    if(this.active||g.status!=='playing'||!TYPES.includes(type))return null;
    if(type==='treasure'&&g.enemies.length>=180)return null;
    const point=this._point(x,y);if(!point)return null;
    const life=type==='hunt'?40:35;
    const active={id:`encounter:${++this._id}`,type,...point,r:210,life,maxLife:life,goal:12,progress:0,enemyId:null,state:'active'};
    if(type==='treasure') {
      const enemy=g._spawnEnemy('beetle',1);if(!enemy)return null;
      enemy.eventRole='treasure';enemy.eventId=active.id;
      enemy.r=18;enemy.hp=enemy.maxHp=160*(1+Math.min(g.time,600)*.001);
      enemy.speed=(g.easy?106:118);enemy.damage=0;enemy.xp=0;
      enemy.x=point.x;enemy.y=point.y-groundOffset(enemy);
      enemy._escapeAngle=Math.random()*TAU;
      g._moveEntity(enemy,0,0);active.enemyId=enemy.id;
      active.x=enemy.x;active.y=enemy.y+groundOffset(enemy);
    }
    this.active=active;this._nextType=type==='hunt'?'treasure':'hunt';
    g._emit(type==='hunt'?'encounterHunt':'encounterTreasure');
    g._effect(active.x,active.y,'ring',.75,type==='hunt'?80:48,'#e8ce85');
    return active;
  }
  _finish(success) {
    const active=this.active;if(!active)return false;
    const g=this.game;
    // Detach before reward hooks, so duplicate kill/cleanup calls cannot pay twice.
    this.active=null;this.nextAt=g.time+95;
    g.enemies=g.enemies.filter(e=>e.eventId!==active.id);
    if(success) {
      for(const [i,type] of ['magnet','fury','herb'].entries()) {
        const a=-Math.PI/2+i*TAU/3;
        g.adventure?.dropPickup(type,active.x+Math.cos(a)*28,active.y+Math.sin(a)*28);
      }
      g._effect(active.x,active.y,'ring',.8,90,'#f3d28c');
      g._emit('encounterComplete');
    }else g._emit('encounterExpired');
    return true;
  }
  onEnemyKilled(enemy) {
    const active=this.active;
    if(!active||active.life<=0||this.game.status!=='playing'||!(enemy.hp<=0))return;
    if(active.type==='treasure') {
      if(enemy.eventId!==active.id||enemy.id!==active.enemyId||enemy.eventRole!=='treasure')return;
      active.x=enemy.x;active.y=enemy.y+groundOffset(enemy);this._finish(true);return;
    }
    if(enemy.type==='boss'||enemy.guardianId||enemy.elite||enemy.eventRole||enemy._encounterCounted===active.id)return;
    if(distance(this._foot(),active)>active.r||distance(this._foot(enemy,false),active)>active.r)return;
    enemy._encounterCounted=active.id;active.progress++;
    if(active.progress>=active.goal)this._finish(true);
  }
  updateEnemy(enemy,dt) {
    if(enemy.eventRole!=='treasure')return false;
    const active=this.active,g=this.game;
    if(!active||active.id!==enemy.eventId||enemy.hp<=0||g.status!=='playing')return true;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    const p=this._foot(),e=this._foot(enemy,false),d=distance(e,p);
    let angle=enemy._escapeAngle,speed=enemy.speed;
    if(d<245) {
      // Slow enough to catch on foot; use ordinary obstacle steering, not a
      // teleport or a straight-line move through trunks.
      angle=d>.1?Math.atan2(e.y-p.y,e.x-p.x):angle;
      enemy._escapeAngle=angle;
      g._moveEnemy(enemy,dt,{x:e.x+Math.cos(angle)*180,y:e.y+Math.sin(angle)*180});
    }else if(d>330) {
      // Wait for the chase instead of escaping forever beyond the viewport.
      enemy.speed=speed*.4;
      g._moveEnemy(enemy,dt,{x:p.x+Math.cos(Math.atan2(e.y-p.y,e.x-p.x))*280,y:p.y+Math.sin(Math.atan2(e.y-p.y,e.x-p.x))*280});
      enemy.speed=speed;
    }else {
      enemy.speed=speed*.18;
      angle+=Math.sin(g.time*.8+enemy.phase)*.4;
      g._moveEnemy(enemy,dt,{x:e.x+Math.cos(angle+Math.PI/2)*80,y:e.y+Math.sin(angle+Math.PI/2)*80});
      enemy.speed=speed;
    }
    active.x=enemy.x;active.y=enemy.y+groundOffset(enemy);return true;
  }
  update(dt) {
    const g=this.game;if(g.status!=='playing')return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    const active=this.active;
    if(active) {
      active.life=Math.max(0,active.life-dt);
      if(active.type==='treasure') {
        const enemy=g.enemies.find(e=>e.id===active.enemyId&&e.eventId===active.id&&e.hp>0);
        // A removed enemy is abandonment, not a successful kill.
        if(!enemy){this._finish(false);return;}
        active.x=enemy.x;active.y=enemy.y+groundOffset(enemy);
      }
      if(active.life<=0||distance(this._foot(),active)>1100)this._finish(false);
      return;
    }
    if(this.generation&&g.time>=this.nextAt&&this._canStart()&&!this.spawn())this.nextAt=g.time+5;
  }
}
