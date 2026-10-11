import { groundOffset } from './terrain.js';
import { resetLocomotion, updateLocomotion } from './locomotion.js';
import { OBJECTIVE_RULES, canStartObjective, majorFightActive, objectivePointSafe } from './event-scheduling.js';

const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const COMPANIONS=Object.freeze([
  Object.freeze({id:'stormcaller',kind:'stormcaller',name:'唤雷者',skill:'高级雷电',color:'#c8b9f0'}),
  Object.freeze({id:'warden',kind:'warden',name:'守林人',skill:'高级地震',color:'#e4c487'})
]);
export const RESCUE_RULES=Object.freeze({firstAt:35,campDuration:70,companionDuration:60,interval:45,guards:6,rescueRadius:65,bonus:.08});
const definition=kind=>COMPANIONS.find(c=>c.id===kind);

// Rescue is an optional world objective. Guards can only be credited by an
// actual lethal hit; expiration, range culling and scene replacement pay nothing.
export class Companions {
  constructor(game,{generation=true}={}) {
    this.game=game;this.generation=generation;this.camp=null;this.active=null;
    this.rescuedCount=0;this.nextAt=game.time+RESCUE_RULES.firstAt;this._nextKind='stormcaller';
  }
  _foot(entity=this.game.player) {return {x:entity.x,y:entity.y+groundOffset(entity,true)};}
  _canStart() {
    return canStartObjective(this.game,{skipCamp:true});
  }
  _hazardFree(x,y,r=0) {
    const environment=this.game.environment;
    if(this.game.settlements?.isSafePoint(x,y,r)===false)return false;
    if(environment?.isHazardFree?.(x,y,r)===false)return false;
    return !environment?.props.some(o=>o.state!=='spent'&&Math.hypot(o.x-x,o.y-y)<(o.blastRadius||82)+r+8);
  }
  _point(x,y) {
    const g=this.game,p=this._foot();
    const safe=q=>g.terrain.isFree(q.x,q.y,125)&&this._hazardFree(q.x,q.y,105)&&objectivePointSafe(g,q,125,{skipCamp:true})&&
      !g.adventure?.props.some(o=>distance(o,q)<135)&&
      (!g.adventure?.treasure||distance(g.adventure.treasure,q)>240)&&
      (!g.portal||distance(g.portal,q)>180);
    if(Number.isFinite(x)&&Number.isFinite(y))return safe({x,y})?{x,y}:null;
    const start=Math.random()*TAU;
    for(let i=0;i<48;i++) {
      const angle=start+i*TAU/24,radius=320+Math.floor(i/24)*100;
      const point={x:p.x+Math.cos(angle)*radius,y:p.y+Math.sin(angle)*radius};
      if(safe(point))return point;
    }
    return null;
  }
  spawn(kind=this._nextKind,x,y) {
    const g=this.game,def=definition(kind);
    if(!def||g.status!=='playing'||this.camp||this.active||!this._canStart()||g.enemies.length+RESCUE_RULES.guards>180)return null;
    const point=this._point(x,y);if(!point)return null;
    const camp={id:`rescue:${++g._id}`,kind,name:def.name,...point,r:24,state:'trapped',guardIds:[],guardTotal:RESCUE_RULES.guards,remainingGuards:RESCUE_RULES.guards,life:RESCUE_RULES.campDuration,maxLife:RESCUE_RULES.campDuration,_remaining:new Set()};
    for(let i=0;i<RESCUE_RULES.guards;i++) {
      const angle=-Math.PI/2+i*TAU/RESCUE_RULES.guards,enemy=g._spawnEnemy(i%3===0?'beetle':'slime',1);
      enemy.rescueId=camp.id;enemy.eventRole='rescueGuard';enemy.xp=2;
      enemy.hp*=1.25;enemy.maxHp=enemy.hp;enemy.guardActive=false;
      enemy.rescueHome={x:point.x+Math.cos(angle)*92,y:point.y+Math.sin(angle)*92};
      enemy.x=enemy.rescueHome.x;enemy.y=enemy.rescueHome.y-groundOffset(enemy);
      enemy._navTimer=0;g._moveEntity(enemy,0,0);
      camp.guardIds.push(enemy.id);camp._remaining.add(enemy.id);
    }
    this.camp=camp;this._nextKind=kind==='stormcaller'?'warden':'stormcaller';
    g._emit('rescueAppeared',{name:def.name,kind});
    g._effect(camp.x,camp.y,'ring',.8,70,def.color);
    return camp;
  }
  _clearCamp(expired=false) {
    const camp=this.camp;if(!camp)return;
    this.camp=null;
    // Never simulate kills while discarding a camp's surviving guards.
    this.game.enemies=this.game.enemies.filter(e=>e.rescueId!==camp.id);
    this.nextAt=this.game.time+RESCUE_RULES.interval;
    if(expired)this.game._emit('rescueExpired',{name:camp.name});
  }
  onEnemyKilled(enemy) {
    const camp=this.camp;
    if(!camp||camp.state!=='trapped'||this.game.status!=='playing'||enemy.hp>0||enemy.rescueId!==camp.id||!camp._remaining.delete(enemy.id))return;
    camp.remainingGuards=camp._remaining.size;
    if(!camp.remainingGuards) {
      camp.state='ready';
      this.game._emit('rescueReady',{name:camp.name,kind:camp.kind});
      this.game._effect(camp.x,camp.y,'ring',.65,75,definition(camp.kind).color);
    }
  }
  _join() {
    const g=this.game,camp=this.camp;
    if(!camp||camp.state!=='ready'||this.active||g.status!=='playing'||distance(this._foot(),camp)>RESCUE_RULES.rescueRadius)return false;
    // Detach the reward-bearing camp before any effect/notification can reenter.
    this.camp=null;
    this.active={id:++g._id,kind:camp.kind,name:camp.name,heroId:camp.kind,x:camp.x,y:camp.y-groundOffset(g.player,true),r:15,isCompanion:true,remaining:RESCUE_RULES.companionDuration,maxDuration:RESCUE_RULES.companionDuration,facing:g.player.facing,moving:false,speed:250,_attack:.8,_echoes:[],_stuckFor:0};
    this._resetFollowing(this.active);
    this.rescuedCount++;g.rescuePower++;g._refreshStats();
    this.nextAt=g.time+RESCUE_RULES.companionDuration+RESCUE_RULES.interval;
    g._emit('companionJoined',{name:camp.name,kind:camp.kind,bonusLevel:g.rescuePower,bonusPercent:8,duration:RESCUE_RULES.companionDuration});
    g._effect(camp.x,camp.y,'ring',.8,85,definition(camp.kind).color);
    return true;
  }
  _resetFollowing(active) {
    active._navTimer=0;active._navObstacle=null;active._navSide=0;
    active._navProgressTimer=0;active._navProgressX=undefined;active._navProgressY=undefined;
    active._stuckFor=0;active._following=false;active._followSpeed=0;active._followTarget=null;
    resetLocomotion(active);
  }
  _safeReturn(active) {
    const g=this.game,p=this._foot();
    for(const radius of [52,76,104,135])for(let i=0;i<16;i++) {
      const angle=g.player.facing+Math.PI+i*TAU/16,x=p.x+Math.cos(angle)*radius,y=p.y+Math.sin(angle)*radius;
      if(!g.terrain.isFree(x,y,active.r+3)||!this._hazardFree(x,y,active.r))continue;
      if(g.enemies.some(e=>e.hp>0&&Math.hypot(e.x-x,e.y+groundOffset(e)-y)<e.r+active.r+12))continue;
      active.x=x;active.y=y-groundOffset(active,true);this._resetFollowing(active);
      return true;
    }
    return false;
  }
  _follow(active,dt) {
    const g=this.game,p=this._foot(),angle=g.player.facing+Math.PI;
    let target=active._followTarget;
    // A stationary player's preferred trailing spot can fall inside a tree or
    // its steering clearance. Pick a clear slot and retain it while the player
    // rests, including turns made against a wall that do not actually travel.
    if(!target||Math.hypot(p.x-target.playerX,p.y-target.playerY)>=4) {
      target=null;
      for(const radius of [54,78]) {
        for(const turn of [0,.6,-.6,1.2,-1.2,Math.PI]) {
          const x=p.x+Math.cos(angle+turn)*radius,y=p.y+Math.sin(angle+turn)*radius;
          if(g.terrain.isFree(x,y,active.r+10)){target={x,y};break;}
        }
        if(target)break;
      }
      target??={...p};target.playerX=p.x;target.playerY=p.y;active._followTarget=target;
    }
    const foot=this._foot(active),d=distance(foot,target),oldX=active.x,oldY=active.y;
    // The wide restart threshold keeps a settled ally from chasing every tiny
    // correction. Arrival slows naturally without changing the collision path.
    if(active._following&&d<=12)active._following=false;
    else if(!active._following&&d>=30)active._following=true;
    if(active._following&&dt>0) {
      const desiredSpeed=Math.min(Math.max(250,g.player.speed*1.18),Math.max(40,(d-12)*7));
      const acceleration=1000*dt;
      active._followSpeed=Math.max(active._followSpeed-acceleration,Math.min(active._followSpeed+acceleration,desiredSpeed));
      active.speed=active._followSpeed;
      g._moveEnemy(active,dt,target);
      const moved=Math.hypot(active.x-oldX,active.y-oldY);
      if(moved>.001)active.facing=Math.atan2(active.y-oldY,active.x-oldX);
      active._stuckFor=moved<.3&&d>100?active._stuckFor+dt:0;
    }else {active._stuckFor=0;active._followSpeed=0;}
    updateLocomotion(active,oldX,oldY,dt);
    // Recovery is reserved for an unseen stranded ally; visible followers walk
    // around scenery instead of snapping back across the screen.
    if((distance(this._foot(active),p)>550||active._stuckFor>3)&&!g._inView(active,40)) {
      if(this._safeReturn(active))g._effect(active.x,active.y+groundOffset(active,true),'ring',.35,26,definition(active.kind).color);
    }
  }
  _leave() {
    const active=this.active;if(!active)return;
    this.active=null;this.nextAt=this.game.time+RESCUE_RULES.interval;
    this.game._emit('companionLeft',{name:active.name,kind:active.kind});
    this.game._effect(active.x,active.y,'ring',.6,38,definition(active.kind).color);
  }
  updateEnemy(enemy,dt) {
    if(!enemy.rescueId)return false;
    const camp=this.camp,g=this.game;
    if(!camp||camp.id!==enemy.rescueId)return true;
    const p=this._foot(),foot={x:enemy.x,y:enemy.y+groundOffset(enemy)};
    const active=distance(p,camp)<OBJECTIVE_RULES.campEngage&&distance(foot,camp)<250&&!majorFightActive(g);
    enemy.guardActive=active;enemy.guardReturnTarget=null;
    if(!active) {
      enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;
      if(distance(foot,enemy.rescueHome)>4)g._moveEnemy(enemy,dt,enemy.rescueHome);
    }else g._moveEnemy(enemy,dt);
    return true;
  }
  update(dt) {
    const g=this.game;if(g.status!=='playing')return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    if(this.active) {
      const active=this.active;
      active.remaining=Math.max(0,active.remaining-dt);
      if(active.remaining<=0){this._leave();return;}
      this._follow(active,dt);active._attack-=dt;
      for(const echo of active._echoes)echo.life-=dt;
    }
    if(this.camp) {
      this.camp.life=Math.max(0,this.camp.life-dt);
      if(this.camp.life<=0||distance(this._foot(),this.camp)>1200)this._clearCamp(true);
    }
    if(this.generation&&!this.camp&&!this.active&&g.time>=this.nextAt&&this._canStart()&&!this.spawn())this.nextAt=g.time+6;
  }
  _castLightning(active) {
    const g=this.game,excluded=new Set();let origin=active,hits=0;
    const damage=105*(1+Math.floor(g.time/60)*.12);
    for(let i=0;i<5;i++) {
      const enemy=g._nearest(origin.x,origin.y,i?190:430,excluded,origin);if(!enemy)break;
      excluded.add(enemy.id);hits++;
      g._effect(origin.x,origin.y,'lightning',.22,0,'#d5d0fb',undefined,{x2:enemy.x,y2:enemy.y,evolved:true,branch:'chain',chainIndex:i,ally:true});
      g._hitEnemy(enemy,damage,0,origin,'companionLightning');origin=enemy;
    }
    if(!hits)return false;
    active._attack=3.8;return true;
  }
  _quake(x,y,r,damage,echo,seed) {
    const g=this.game;
    g._effect(x,y,'ring',echo?.6:.48,r,echo?'#c6ead5':'#9de0b3',undefined,{quake:true,groundY:y,evolved:true,echo,branch:'echoes',ally:true,seed});
    for(const enemy of g.enemies)if(enemy.hp>0&&g._inView(enemy)&&Math.hypot(enemy.x-x,enemy.y+groundOffset(enemy)-y)<r+enemy.r)
      g._hitEnemy(enemy,damage,echo?14:30,{x,y,groundY:y+groundOffset(g.player,true)},echo?'companionEcho':'companionPulse');
  }
  _castQuake(active) {
    const g=this.game,foot=this._foot(active);
    if(!g.enemies.some(e=>e.hp>0&&g._inView(e)&&Math.hypot(e.x-foot.x,e.y+groundOffset(e)-foot.y)<185+e.r))return false;
    const damage=90*(1+Math.floor(g.time/60)*.12);
    this._quake(foot.x,foot.y,185,damage,false,active.id);
    active._echoes.push({x:foot.x,y:foot.y,r:215,damage:damage*.65,life:.35,regionIndex:g.regionIndex});
    active._attack=4.8;return true;
  }
  resolve() {
    const g=this.game;if(g.status!=='playing')return;
    this._join();
    const active=this.active;if(!active)return;
    const ready=active._echoes.filter(e=>e.life<=0);active._echoes=active._echoes.filter(e=>e.life>0);
    for(const echo of ready)if(echo.regionIndex===g.regionIndex)this._quake(echo.x,echo.y,echo.r,echo.damage,true,active.id);
    if(active._attack<=0) {
      const cast=active.kind==='stormcaller'?this._castLightning(active):this._castQuake(active);
      if(!cast)active._attack=.2;
    }
  }
  onRegionChange() {
    this._clearCamp();
    this.nextAt=Math.max(this.nextAt,this.game.time+RESCUE_RULES.firstAt);
    const active=this.active;if(!active)return;
    active._echoes=[];
    // The freshly generated spawn clearing always contains the player's feet.
    // SafeReturn adds separation where possible; the fallback cannot land in a wall.
    active.x=this.game.player.x;active.y=this.game.player.y;this._resetFollowing(active);
    this._safeReturn(active);
  }
}
