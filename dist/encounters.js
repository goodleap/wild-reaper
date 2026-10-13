import { groundOffset } from './terrain.js';
import { canStartObjective, objectivePointSafe } from './event-scheduling.js';
import { placementAllowed } from './placement-rules.js';

const TAU=Math.PI*2;
const TYPES=['treasure','hunt'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const ARENA_ACTIVATION_RULES=Object.freeze({warmup:.7,batchSize:3,batchInterval:1.25,warning:.45,spawnGrace:.3,spawnDistance:150,enemyLimit:180});
const guardType=index=>index%8===0?'brute':index%3===0?'beetle':'slime';
const guardRadius=type=>type==='brute'?26:type==='beetle'?18:16;

// Optional objectives have distinct resource identities: chase for gold, hunt
// for skill crystals. Rewards are detached before payment to prevent repeats.
export class Encounters {
  constructor(game,{generation=true}={}) {
    this.game=game;this.generation=generation;this.active=null;
    this.nextAt=game.time+70;this._id=0;this._nextType='treasure';
  }
  _foot(entity=this.game.player,isPlayer=true) {
    return {x:entity.x,y:entity.y+groundOffset(entity,isPlayer)};
  }
  _canStart() {
    return canStartObjective(this.game,{skipEncounter:true});
  }
  _point(x,y,type='treasure',allowReserved=false) {
    const g=this.game,p=this._foot(),chest=g.adventure?.treasure,hunt=type==='hunt',clearance=hunt?245:42;
    // A stone arena belongs on clear ground, not under an existing solid tree.
    // Search a few nearby rings without removing terrain or moving its props.
    const free=(candidate)=>g.terrain.isFree(candidate.x,candidate.y,clearance)&&(allowReserved||!g.terrain.island?.isReserved(candidate.x,candidate.y,clearance))&&objectivePointSafe(g,candidate,hunt?245:210,{skipEncounter:true})&&g.settlements?.isSafePoint(candidate.x,candidate.y,hunt?245:90)!==false&&g.environment?.isHazardFree?.(candidate.x,candidate.y,70)!==false&&
      !g.adventure?.props.some(o=>distance(o,candidate)<(hunt?245+(o.r||18):70))&&
      (!chest||distance(chest,candidate)>(hunt?290:180));
    if(Number.isFinite(x)&&Number.isFinite(y))return free({x,y})?{x,y}:null;
    const start=Math.random()*TAU,attempts=hunt?144:30;
    for(let i=0;i<attempts;i++) {
      const a=start+i*TAU/(hunt?24:30),base=hunt?300+Math.floor(i/24)*100:280+(i%3)*50,r=g.terrain.island?Math.max(base,1/Math.max(Math.abs(Math.cos(a))/(g.viewWidth*.5+clearance+45),Math.abs(Math.sin(a))/(g.viewHeight*.5+clearance+45))):base;
      const candidate={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};
      if(free(candidate))return candidate;
    }
    return null;
  }
  spawn(type=this._nextType,x,y,{siteId=null}={}) {
    const g=this.game;
    if(this.active||g.status!=='playing'||!TYPES.includes(type))return null;
    if(type==='treasure'&&g.enemies.length>=180)return null;
    const relic=type==='hunt'&&!!siteId,goal=relic?24:12;
    if(siteId&&!g.relicSites?.sites.some(s=>s.id===siteId&&s.type==='hunt'&&s.state==='ready'))return null;
    const point=this._point(x,y,type,!!siteId);if(!point)return null;
    const life=type==='hunt'?40:35;
    const active={id:`encounter:${++this._id}`,type,...point,r:210,life,maxLife:life,goal,progress:0,enemyId:null,state:'active',siteId,category:relic?'relic':'random'};
    if(type==='treasure') {
      const enemy=g._spawnEnemy('beetle',1);if(!enemy)return null;
      enemy.eventRole='treasure';enemy.eventId=active.id;
      enemy.r=18;enemy.hp=enemy.maxHp=160*(1+Math.min(g._difficultyTime?.()??g.time,600)*.001);
      enemy.speed=(g.easy?106:118);enemy.damage=0;enemy.xp=16;
      enemy.x=point.x;enemy.y=point.y-groundOffset(enemy);
      enemy._escapeAngle=Math.random()*TAU;
      g._moveEntity(enemy,0,0);active.enemyId=enemy.id;
      active.x=enemy.x;active.y=enemy.y+groundOffset(enemy);
    }
    if(relic) {
      active._remaining=new Set();active.guardIds=[];active.spawnedCount=0;
      active.activationAge=0;active.activationDuration=ARENA_ACTIVATION_RULES.warmup;
      active.spawnTimer=0;active.spawnWarnings=[];
      active.pendingGuards=Array.from({length:goal},(_,index)=>({index,type:guardType(index)}));
    }
    this.active=active;this._nextType='treasure';
    g._emit(type==='hunt'?'encounterHunt':'encounterTreasure');
    if(!relic)g._effect(active.x,active.y,'ring',.75,type==='hunt'?80:48,'#e8ce85');
    return active;
  }
  _arenaPointSafe(point,type,active,ignoreWarning=null) {
    const g=this.game,r=guardRadius(type),p=this._foot();
    if(distance(point,p)<ARENA_ACTIVATION_RULES.spawnDistance||!placementAllowed(g,'loot',{x:point.x,y:point.y,r:r+5}))return false;
    if(g.environment?.isHazardFree?.(point.x,point.y,r+6)===false||g.settlements?.isSafePoint(point.x,point.y,r+6)===false)return false;
    if(g.environment?.props.some(o=>o.state!=='spent'&&distance(point,o)<(o.blastRadius||82)+r+8))return false;
    if(g.adventure?.props.some(o=>distance(point,o)<r+(o.r||18)+10))return false;
    if(g.enemies.some(e=>e.hp>0&&distance(point,this._foot(e,false))<r+e.r+12))return false;
    return !active.spawnWarnings.some(w=>w!==ignoreWarning&&distance(point,w)<r+guardRadius(w.type)+12);
  }
  _arenaSpawnPoint(active,guard,ignoreWarning=null) {
    // Search the existing rim only. If all approaches are occupied, wait rather
    // than teleporting a defender into the player, water or nearby scenery.
    for(const radius of [190,205,220])for(let i=0;i<24;i++) {
      const angle=guard.index*2.399963229728653+i*TAU/24;
      const point={x:active.x+Math.cos(angle)*radius,y:active.y+Math.sin(angle)*radius};
      if(this._arenaPointSafe(point,guard.type,active,ignoreWarning))return point;
    }
    return null;
  }
  _spawnArenaGuard(active,warning) {
    const g=this.game;if(g.enemies.length>=ARENA_ACTIVATION_RULES.enemyLimit)return false;
    const enemy=g._spawnEnemy(warning.type,1);if(!enemy)return false;
    enemy.eventRole='huntGuard';enemy.eventId=active.id;enemy.relicSiteId=active.siteId;
    enemy.huntHome={x:warning.x,y:warning.y};enemy.x=warning.x;enemy.y=warning.y-groundOffset(enemy);
    enemy.hp*=1.5;enemy.maxHp=enemy.hp;enemy.xp=2;enemy.guardActive=false;
    enemy.rescueSpawnGrace=ARENA_ACTIVATION_RULES.spawnGrace;enemy._navTimer=0;
    active.guardIds.push(enemy.id);active._remaining.add(enemy.id);active.spawnedCount++;return true;
  }
  _updateArena(active,dt) {
    const rules=ARENA_ACTIVATION_RULES;
    if(active.activationAge<active.activationDuration) {
      active.activationAge=Math.min(active.activationDuration,active.activationAge+dt);
      if(active.activationAge<active.activationDuration)return;
    }
    active.spawnTimer=Math.max(0,active.spawnTimer-dt);
    for(const warning of [...active.spawnWarnings]) {
      warning.age=Math.min(warning.duration,warning.age+dt);
      if(warning.age<warning.duration)continue;
      // Walking into a warning cancels that location, including on the exact
      // spawn frame. A replacement is telegraphed for the full duration again.
      if(!this._arenaPointSafe(warning,warning.type,active,warning)) {
        const point=this._arenaSpawnPoint(active,warning,warning);
        if(point)Object.assign(warning,point);
        warning.age=0;continue;
      }
      if(this._spawnArenaGuard(active,warning)) {
        active.spawnWarnings.splice(active.spawnWarnings.indexOf(warning),1);
        if(!active.spawnWarnings.length)active.spawnTimer=Math.max(active.spawnTimer,rules.batchInterval-rules.warning);
      }
    }
    if(active.spawnWarnings.length||!active.pendingGuards.length||active.spawnTimer>0)return;
    if(this.game.enemies.length>=rules.enemyLimit)return;
    for(let i=0;i<rules.batchSize&&active.pendingGuards.length;i++) {
      const guard=active.pendingGuards[0],point=this._arenaSpawnPoint(active,guard);
      if(!point)break;
      active.pendingGuards.shift();active.spawnWarnings.push({...guard,...point,age:0,duration:rules.warning});
    }
    // A delayed wave never accumulates an overdue burst after a scene return.
    active.spawnTimer=active.spawnWarnings.length?rules.batchInterval:.2;
  }
  _finish(success) {
    const active=this.active;if(!active)return false;
    const g=this.game;
    // Detach before reward hooks, so duplicate kill/cleanup calls cannot pay twice.
    this.active=null;this.nextAt=g.time+95;
    g.enemies=g.enemies.filter(e=>e.eventId!==active.id);
    if(active.siteId&&!g.relicSites?.complete(active.siteId,success))success=false;
    if(success) {
      const chase=active.type==='treasure';
      g.grantResources(chase?{gold:24,crystals:8}:active.siteId?{gold:18,crystals:72}:{gold:6,crystals:40},chase?'宝物精':active.siteId?'遗迹狩猎':'限时狩猎');
      g.adventure?.dropPickup(chase?'magnet':'fury',active.x,active.y);
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
    if(active.siteId) {
      if(enemy.eventId!==active.id||enemy.eventRole!=='huntGuard'||!active._remaining.delete(enemy.id))return;
      active.progress++;
      const site=this.game.relicSites?.sites.find(s=>s.id===active.siteId);if(site)site.progress=active.progress;
      if(active.spawnedCount===active.goal&&!active.pendingGuards.length&&!active.spawnWarnings.length&&!active._remaining.size)this._finish(true);
      return;
    }
    if(enemy.type==='boss'||enemy.guardianId||enemy.rescueId||enemy.elite||enemy.affix||enemy.summoned||enemy.eventRole||enemy._encounterCounted===active.id)return;
    if(distance(this._foot(),active)>active.r||distance(this._foot(enemy,false),active)>active.r)return;
    enemy._encounterCounted=active.id;active.progress++;
    if(active.progress>=active.goal)this._finish(true);
  }
  updateEnemy(enemy,dt) {
    if(enemy.eventRole==='huntGuard') {
      const active=this.active,g=this.game;
      if(!active||active.id!==enemy.eventId||enemy.hp<=0||g.status!=='playing')return true;
      if(enemy.rescueSpawnGrace>0) {
        enemy.rescueSpawnGrace=Math.max(0,enemy.rescueSpawnGrace-Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0)));
        enemy.guardActive=false;enemy.guardReturnTarget=null;enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;
        return true;
      }
      const foot=this._foot(enemy,false),engaged=distance(this._foot(),active)<active.r+140&&distance(foot,active)<active.r+120;
      enemy.guardActive=engaged;enemy.guardReturnTarget=null;
      if(engaged)g._moveEnemy(enemy,dt);
      else {
        enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;
        if(distance(foot,enemy.huntHome)>4)g._moveEnemy(enemy,dt,enemy.huntHome);
      }
      return true;
    }
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
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active||g.sceneTransition?.active)return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    const active=this.active;
    if(active) {
      if(active.siteId) {
        // Only real lethal hits remove IDs. Scene/range cleanup must never
        // finish a relic or silently refresh its finite defenders.
        const present=new Set(g.enemies.filter(e=>e.hp>0&&e.eventId===active.id).map(e=>e.id));
        if([...active._remaining].some(id=>!present.has(id))){this._finish(false);return;}
        this._updateArena(active,dt);
        return;
      }
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
