import { getConfigSection } from './content-config.js';
import { mapSeed } from './map-context.js';
import { enemyDefinition } from './enemy-definitions.js';
import { groundOffset } from './terrain.js';
import { placementAllowed } from './placement-rules.js';
import { PORTAL_GEOMETRY, portalDoor, portalEntranceContains, portalObstacles } from './portal-geometry.js';
import { REGIONS, regionFor, normalizeWorldIndex, worldNeighbors } from './world-definitions.js';
export { REGIONS, WORLD_IDS, regionFor, normalizeWorldIndex, worldNeighbors, WORLD_CONNECTIONS } from './world-definitions.js';
export const worldConnectionId=(a,b)=>[normalizeWorldIndex(a),normalizeWorldIndex(b)].sort((x,y)=>x-y).join(':');

export { ordinaryEnemyType as regionEnemyType } from './encounter-definitions.js';

export const PORTAL_RULES=getConfigSection('geography').portalRules;
const GUARDIAN_RULES=getConfigSection('geography').portalGuardian,ENEMY_GROWTH=getConfigSection('difficulty').enemyGrowth;
const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Only the current region is simulated. Inactive worlds retain their finite
// authored objectives and territory populations; terrain caches are released.
export class Regions {
  constructor(game){this.game=game;this._lastBossId=null;this.portals=[];this.states=new Map();this.guarded=!!(game.stage||game._features.adventure);this.rewardPortal=null;this.unlockedConnections=new Set();this.claimedConnections=new Set();this.endlessStartedAt=null;this._rewardQueue=[];}
  _setStructures(){this.game.terrain.setStructures?.(this.portals.flatMap(portalObstacles),'portals');}
  get defeatedConnectionsCount(){return this.unlockedConnections.size;}
  get endlessUnlocked(){return !this.game._worldExploration&&!this.game.stage&&!this.game.expedition&&this.unlockedConnections.size>=GUARDIAN_RULES.endlessConnections;}
  _endpoint(target,{origin=null,back=false}={}) {
    if(!Number.isInteger(target)||!worldNeighbors(this.game.regionIndex).includes(target))return null;
    const g=this.game,index=normalizeWorldIndex(g.regionIndex),plan=g.terrain.island?.plan?.[`portal:${target}`];
    const natural=g.terrain.island?.layout?.kind==='rift-forest';
    const point=natural&&plan?{x:plan.x,y:plan.y}:plan?this._safePoint(plan,true,true):this._safePoint(origin||{x:0,y:0},true,false,target);
    if(!point)return null;
    const connectionId=worldConnectionId(index,target);
    if(natural)this.unlockedConnections.add(connectionId);
    const active=this.unlockedConnections.has(connectionId);
    return {id:`portal:${index}:${target}`,...point,...(natural?{natural:true,kind:'travel',touchRadius:42,arrivalDirection:plan?.arrivalDirection||(target===1?{x:0,y:1}:target===2?{x:0,y:-1}:{x:1,y:0}),name:target===1?'北境山口':target===2?'南境长桥':'营地小径'}:{}),r:32,interactRadius:PORTAL_RULES.interactRadius,state:active?'active':'locked',direction:back?'back':'forward',connectionId,nextRegionIndex:target,nextRegion:regionFor(target),targetPortalId:`portal:${target}:${index}`,discovered:back&&active,rewardClaimed:this.claimedConnections.has(connectionId)};
  }
  _syncConnections() {
    if(this.game.stage)return;
    const g=this.game,sync=(portals,enemies)=>{
      const removed=new Set();
      for(const portal of portals)if(this.unlockedConnections.has(portal.connectionId)) {
        portal.state='active';portal.rewardClaimed=this.claimedConnections.has(portal.connectionId);
        for(const enemy of enemies)if(enemy.portalId===portal.id&&enemy.hp>0){g._clearRegionalBossAttacks?.(enemy);removed.add(enemy);}
      }
      // Removal is deliberately not damage: the remote guardian grants no
      // second kill, experience, currency or boss reward.
      return enemies.filter(enemy=>!removed.has(enemy));
    };
    g.enemies=sync(this.portals,g.enemies);
    for(const state of this.states.values())state.enemies=sync(state.portals,state.enemies);
  }
  _spawnGuardian(portal) {
    const g=this.game,boss=g._spawnEnemy('boss',1),base=enemyDefinition('boss'),rules=GUARDIAN_RULES,progress=g._worldExploration?0:this.unlockedConnections.size+Math.min(rules.timeProgressCap,Math.max(0,g.time||0)/rules.timeProgressPeriod),danger=g.region.danger||1;
    boss.bossIndex=g._worldExploration?1:this.unlockedConnections.size+1;
    boss.hp=boss.maxHp=(g.easy?base.easyHp:base.baseHp)*(1+progress*rules.hpGrowth)*danger;boss.damage=base.damage*(1+progress*rules.damageGrowth)*danger*(g.easy?ENEMY_GROWTH.easyDamageMultiplier:1);boss.xp=Math.round(base.xp*(1+progress*rules.xpGrowth)*danger);
    boss.portalId=portal.id;boss.portalHome={x:portal.x,y:portal.y+115};boss.x=boss.portalHome.x;boss.y=boss.portalHome.y-groundOffset(boss);boss.guardActive=false;boss._portalAnnounced=false;portal.bossId=boss.id;
    g._initializeRegionalBoss?.(boss);g._moveEntity(boss,0,0);
  }
  _safePoint(origin={x:0,y:0},forward=false,planned=false,target=0) {
    const g=this.game;
    // Reserve the full gate, connected approach and guardian footprint against
    // the deterministic layout, even when its neighboring chunks are unloaded.
    const safe=(x,y)=>placementAllowed(g,'structure',{x,y,r:forward?112:45})&&
      (!forward||placementAllowed(g,'structure',{ax:x,ay:y,bx:x,by:y+115,r:66}))&&g.relicSites?.isSafePoint(x,y,forward?180:60)!==false&&
      g.settlements?.isSafePoint(x,y,forward?150:45)!==false&&g.environment?.isHazardFree?.(x,y,forward?90:45)!==false&&
      !g.environment?.props.some(o=>distance(o,{x,y})<(o.blastRadius||82)+80)&&
      !g.adventure?.props.some(o=>distance(o,{x,y})<100)&&
      (!g.adventure?.treasure||distance(g.adventure.treasure,{x,y})>220)&&
      !(g.companions?.camps||[]).some(camp=>distance(camp,{x,y})<=350)&&
      this.portals.every(portal=>distance(portal,{x,y})>(forward?600:110));
    if(planned&&safe(origin.x,origin.y))return {x:origin.x,y:origin.y};
    const radii=planned?[32,64,96]:forward?[1120,1270,1420,1570,1720,1870,2020,2170]:[90,150,220,300,400];
    for(const radius of radii)for(let i=0;i<48;i++) {
      const a=(mapSeed(g)*.93)+(planned?0:(regionFor(target).seed??target)*Math.PI*.82)+i*Math.PI/24,x=Math.round(origin.x+Math.cos(a)*radius),y=Math.round(origin.y+Math.sin(a)*radius);
      if(safe(x,y))return {x,y};
    }
    // Exhausted bounded searches omit this gate; a player-position fallback
    // could place a foundation on water or duplicate another portal.
    return null;
  }
  initialize(fromPortal=null,fromRegionIndex=null) {
    const g=this.game,index=normalizeWorldIndex(g.regionIndex);this.portals=[];g.portal=null;this._setStructures();
    if(g.expedition)return;
    if(g.stage){g.stage.initialize();g.settlements?.ensureAngels?.();return;}
    // Small isolated mechanics fixtures keep the legacy timed-boss trigger.
    // Once entered they still use the same finite world graph.
    if(!this.guarded&&!fromPortal)return;
    if(fromPortal)this.unlockedConnections.add(worldConnectionId(index,fromRegionIndex));
    const targets=worldNeighbors(index);
    for(const target of targets){const endpoint=this._endpoint(target,{back:fromPortal&&target===fromRegionIndex});if(endpoint)this.portals.push(endpoint);}
    if(fromPortal)fromPortal.targetPortalId=`portal:${index}:${normalizeWorldIndex(fromRegionIndex)}`;
    g.portal=this.portals.find(portal=>portal.state==='locked')||this.portals[0]||null;
    this._setStructures();
    if(this.guarded)for(const portal of this.portals)if(portal.state==='locked'&&!portal.natural)this._spawnGuardian(portal);
    g.settlements?.ensureAngels?.();
  }
  update() {
    const g=this.game;if(g.dungeon?.active||g.expedition)return;
    if(g.stage){g.stage.update();return;}
    const p=feet(g);
    for(const portal of this.portals) {
      if(portal.state!=='locked')continue;
      const boss=g.enemies.find(e=>e.id===portal.bossId&&e.hp>0);if(!boss)continue;
      const d=distance(p,portal),was=boss.guardActive;
      boss.guardActive=g.regionGrace<=0&&(d<=PORTAL_RULES.engageRadius||(was&&d<=PORTAL_RULES.leashRadius));
      if(boss.guardActive)portal.discovered=true;
      if(boss.guardActive&&!boss._portalAnnounced){boss._portalAnnounced=true;g.bossCount++;g.bossSpawned=true;g.bossDefeated=false;g._emit('boss');}
      if(!boss.guardActive) {
        g._clearRegionalBossAttacks?.(boss);
        boss.guardReturnTarget=boss.portalHome;
      } else boss.guardReturnTarget=null;
    }
  }
  updateEnemy(enemy,dt) {
    if(enemy.stageBoss)return this.game.stage?.updateEnemy(enemy,dt)??false;
    if(!enemy.portalId)return false;
    const g=this.game,portal=this.portals.find(p=>p.id===enemy.portalId);if(!portal)return true;
    if(!enemy.guardActive) {
      if(distance({x:enemy.x,y:enemy.y+groundOffset(enemy)},enemy.portalHome)>5)g._moveEnemy(enemy,dt,enemy.portalHome);
      return true;
    }
    // A collision/knockback cannot drag the guardian out of its home arena.
    if(distance({x:enemy.x,y:enemy.y+groundOffset(enemy)},portal)>PORTAL_RULES.leashRadius-70) {
      g._clearRegionalBossAttacks?.(enemy);g._moveEnemy(enemy,dt,enemy.portalHome);return true;
    }
    return false;
  }
  canTarget(enemy) {
    if(this.game.expedition)return this.game.expedition.canTarget(enemy);
    if(enemy.stageBoss)return this.game.stage?.canTarget(enemy)??false;
    if(!enemy.portalId)return true;
    const portal=this.portals.find(p=>p.id===enemy.portalId);
    return !!portal&&portal.state==='locked'&&distance(feet(this.game),portal)<=PORTAL_RULES.leashRadius;
  }
  canDamage(enemy) {
    if(!this.canTarget(enemy))return false;
    if(this.game.expedition){this.game.expedition.awaken(enemy);return true;}
    if(enemy.territoryId)this.game.territories?.awaken(enemy);
    if(enemy.stageBoss){this.game.stage.awaken(enemy);return true;}
    if(!enemy.portalId)return true;
    enemy.guardActive=true;
    if(!enemy._portalAnnounced){enemy._portalAnnounced=true;this.game.bossCount++;this.game._emit('boss');}
    return true;
  }
  openPortal(enemy) {
    if(enemy.type!=='boss'||enemy.dungeonBoss||enemy.dungeonId||enemy.debugBoss||enemy.hp>0||enemy.id===this._lastBossId)return null;
    if(enemy.worldBoss){
      // Optional field encounters reuse the regional skill reward, but never
      // unlock an unrelated gate or remove its living guardian.
      const group=this.game.territories?.byId.get(enemy.territoryId);
      if(!group||group.rewardQueued||group.rewardClaimed)return null;
      group.cleared=true;group.rewardQueued=true;this._lastBossId=enemy.id;
      this._rewardQueue.push(group);this._offerReward();return null;
    }
    if(this.game.stage)return this.game.stage.onBossKilled(enemy);
    const g=this.game;let portal=enemy.portalId?this.portals.find(p=>p.id===enemy.portalId):g.portal;
    if(!portal&&!this.guarded) {
      const targets=worldNeighbors(g.regionIndex),target=targets[0];
      portal=this._endpoint(target,{origin:{x:enemy.x,y:enemy.y+groundOffset(enemy)}});
      if(portal){this.portals.push(portal);g.portal=portal;}
      for(const remaining of targets.slice(1)){const endpoint=this._endpoint(remaining);if(endpoint)this.portals.push(endpoint);}
      this._setStructures();
    }
    if(!portal||this.unlockedConnections.has(portal.connectionId))return null;
    this._lastBossId=enemy.id;this.unlockedConnections.add(portal.connectionId);
    portal.state='active';portal.discovered=true;portal.bossId=enemy.id;
    this._syncConnections();
    this._rewardQueue.push(portal);this._offerReward();
    if(this.endlessUnlocked&&this.endlessStartedAt===null){this.endlessStartedAt=g.time;g._emit('worldsConnected',{count:GUARDIAN_RULES.endlessConnections});}
    g.settlements?.ensureAngels?.();
    g._emit('portalOpened',{nextRegionId:portal.nextRegion.id,name:portal.nextRegion.name});return portal;
  }
  _offerReward() {
    const g=this.game;if(this.rewardPortal||!this._rewardQueue.length||g.superSkills.pending)return false;
    if(!g.superSkills.offer('region',g.region.id))return false;
    this.rewardPortal=this._rewardQueue.shift();g._regionRewardPending=true;return true;
  }
  flushReward() {
    const g=this.game;this._offerReward();
    if(!g._regionRewardPending||g.status!=='playing'||g.superSkills.pending?.source!=='region')return false;
    g._regionRewardPending=false;g.status='super';g._emit('superChoice',{source:'region',regionId:g.region.id});return true;
  }
  completeReward(){
    if(this.rewardPortal?.stageReward)this.game.stage?.claimReward(this.rewardPortal.stageReward);
    if(this.rewardPortal){this.rewardPortal.rewardClaimed=true;if(this.rewardPortal.connectionId)this.claimedConnections.add(this.rewardPortal.connectionId);}
    this.rewardPortal=null;this.game._regionRewardPending=false;this._syncConnections();this._offerReward();
  }
  isSafePoint(x,y,r=0){return this.game.dungeon?.active||this.portals.every(portal=>Math.hypot(x-portal.x,y-portal.y)>90+r);}
  _portal(portalOrId) {
    if(portalOrId&&typeof portalOrId==='object')return portalOrId;
    return this.portals.find(portal=>portal.id===portalOrId)||(!portalOrId?this.nearest():null);
  }
  nearest() {
    const p=feet(this.game);return [...this.portals].sort((a,b)=>distance(p,a)-distance(p,b))[0]||this.game.portal;
  }
  canEnter(portalOrId) {
    const g=this.game,portal=this._portal(portalOrId);
    return !!(portal&&portal.state==='active'&&g.status==='playing'&&!g.superSkills.pending&&!this._rewardQueue.length&&!g.dungeon?.active&&
      !this.rewardPortal&&(!g.stage||portal.kind!=='victory'||g.stage.coreDefeated)&&
      (g.stage||!g.enemies.some(e=>e.type==='boss'&&!e.debugBoss&&e.hp>0&&e.guardActive!==false))&&portalEntranceContains(portal,feet(g)));
  }
  getInteraction() {
    const portal=this.nearest(),g=this.game;if(!portal||g.status!=='playing'||g.dungeon?.active)return null;
    const door=portalDoor(portal);if(distance(feet(g),door)>portal.interactRadius)return null;
    const locked=portal.state!=='active',enabled=this.canEnter(portal);
    if(portal.kind==='victory')return {id:portal.id,type:'stageExit',label:'进入通关门',description:'完成本局试炼',...door,touchRadius:PORTAL_GEOMETRY.touchRadius,enabled};
    if(portal.kind==='travel')return {id:portal.id,type:'portal',label:`前往${portal.nextRegion.name}`,description:portal.natural?'沿通路离开 · 可返回探索':'可自由往返',...door,touchRadius:portal.touchRadius||PORTAL_GEOMETRY.touchRadius,enabled};
    return {id:portal.id,type:'portal',label:locked?`通往${portal.nextRegion.name}`:`前往${portal.nextRegion.name}`,description:locked?'击败驻门首领 · 解锁双向通道':'已激活 · 可以往返穿越',...door,touchRadius:PORTAL_GEOMETRY.touchRadius,enabled};
  }
  arrivalPoint(portal,r=this.game.player.r){
    const g=this.game,door=portalDoor(portal),clearance=r+4;
    if(portal.natural){
      const d=portal.arrivalDirection||{x:0,y:1};
      for(const offset of [110,140,170,80]){const point={x:door.x+d.x*offset,y:door.y+d.y*offset};if(g.terrain.isFree(point.x,point.y,clearance)&&!g.terrain.firstBlocker(door.x,door.y,point.x,point.y,clearance))return point;}
      return g.terrain.isFree(door.x,door.y,clearance)?door:null;
    }
    // Arrival stays beyond the contact zone and on the open front apron.
    // Guardians are removed on unlock; persistent angels still need room.
    const safe=point=>placementAllowed(g,'loot',{...point,r:clearance})&&
      !g.terrain.firstBlocker(door.x,door.y,point.x,point.y,clearance)&&
      g.environment?.isHazardFree?.(point.x,point.y,clearance)!==false&&
      !g.environment?.props?.some(prop=>prop.state!=='spent'&&distance(prop,point)<(prop.blastRadius||82)+clearance)&&
      !g.settlements?.sites.some(site=>site.type==='angel'&&distance(site,point)<r+(site.r||15)+14);
    for(const offset of [90,60,120,150,180,210,45])for(const dx of [0,-26,26,-52,52]){
      const point={x:portal.x+dx,y:portal.y+offset};if(safe(point))return point;
    }
    // The reserved doorway itself is the final checked fallback. Its contact
    // latch, like all scene arrivals, requires leaving before entering again.
    return safe(door)?door:null;
  }
  saveWorld() {
    const g=this.game;
    const enemies=g.enemies.filter(e=>e.hp>0&&(e.territoryId||e.stageBoss||e.portalId||e.guardianId||e.eventId||e.rescueId||e.settlementId||e.relicSiteId||e.debugBoss));
    g.terrain._cache?.clear();
    const state={savedAt:g.time,savedClock:g._clock,terrain:g.terrain,adventure:g.adventure,environment:g.environment,encounters:g.encounters,settlements:g.settlements,relicSites:g.relicSites,territories:g.territories,riftExploration:g.riftExploration,enemies,gems:g.gems,coins:g.coins,portals:this.portals,portal:g.portal,dungeonStates:g.dungeon.states,discoveredMap:g.discoveredMap,
      companionCamps:g.companions.camps,companionNextAt:g.companions.nextAt,companionGeneration:g.companions.generation,bossDefeated:g.bossDefeated,nextBossAt:g.nextBossAt};
    this.states.set(g.mapId??g.regionIndex,state);return state;
  }
  restoreWorld(index) {
    const state=this.states.get(index);if(!state)return false;
    const g=this.game,delta=g.time-state.savedAt,clockDelta=g._clock-state.savedClock;
    for(const key of ['terrain','adventure','environment','encounters','settlements','relicSites','territories','riftExploration','enemies','gems','coins','portal','discoveredMap','bossDefeated','nextBossAt'])g[key]=state[key];
    this.portals=state.portals;g.dungeon.states=state.dungeonStates;
    g.companions.camps=state.companionCamps||(state.companionCamp?[state.companionCamp]:[]);g.companions.generation=state.companionGeneration;g.companions.nextAt=state.companionNextAt+delta;
    if(g.adventure)g.adventure._nextTreasureAt+=delta;if(g.encounters)g.encounters.nextAt+=delta;
    for(const e of g.enemies)for(const key of ['superRootUntil','superSlowUntil','branchSlowUntil','shockUntil'])if(Number.isFinite(e[key]))e[key]+=clockDelta;
    this.states.delete(index);this._setStructures();this._syncConnections();g.settlements?.ensureAngels?.();return true;
  }
}
