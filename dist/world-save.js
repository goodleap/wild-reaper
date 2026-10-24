import { CombatBuild } from './combat-build.js';
import { WORLD_IDS } from './world-definitions.js';
import { ENEMY_IDS } from './enemy-definitions.js';
import { RELICS } from './relics.js';
import { QUEST_STORAGE_KEY } from './quest-store.js';
import { groundOffset } from './terrain.js';
import { getConfigSection } from './content-config.js';
import { isWorldShop } from './shop-interior.js';
import { restoreDebugTools } from './debug-training.js';

export const WORLD_SAVE_KEY='wild-echoes-guest-world-v1';
const MAX_BYTES=4_000_000,MAX_ACTORS=1600;
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const finite=value=>Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER;
const permitted=game=>game?.mode==='world'&&!game.stage&&!game.expedition;
const browserStorage=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
const empty=()=>({version:1,revision:0,quests:null,regions:{}});
const list=(values,max=4096)=>Array.isArray(values)?values.slice(0,max):[];
const pick=(source,keys)=>Object.fromEntries(keys.filter(key=>source?.[key]!==undefined).map(key=>[key,copy(source[key])]));
// Only explicitly selected components reach this codec. Runtime instances,
// targets, terrain, renderer caches and cyclic object graphs are never saved.
function copy(value,depth=0){
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string')return value.slice(0,1024);
  if(typeof value==='number')return finite(value)?value:null;
  if(depth>7)return null;
  if(Array.isArray(value))return list(value,65536).map(item=>copy(item,depth+1));
  if(!plain(value))return null;
  const result={};
  for(const [key,item] of Object.entries(value)){
    if(['__proto__','prototype','constructor'].includes(key)||typeof item==='function'||item===undefined)continue;
    result[key]=copy(item,depth+1);
  }
  return result;
}
function record(value,nested=[]){
  const result={};
  for(const [key,item] of Object.entries(value||{})){
    if(key.startsWith('_')||['__proto__','prototype','constructor'].includes(key))continue;
    if(typeof item==='string'||typeof item==='boolean'||finite(item))result[key]=item;
  }
  for(const key of nested)if(value?.[key]!==undefined)result[key]=copy(value[key]);
  return result;
}
const ENEMY_KEYS='id type name x y r hp maxHp speed damage xp bossIndex bossKind worldBoss dungeonBoss dungeonId dungeonRoom territoryId territoryState guardActive portalId guardianId eventId eventRole rescueId rescueGuard settlementId relicSiteId debugBoss debugBossId debugMonster summoned summonerId elite flying heightBand bodyKind bossBody facing _escapeAngle _territoryOrder _worldBossAnnounced _portalAnnounced'.split(' ');
const HOME_KEYS=['territoryHome','portalHome','rescueHome','dungeonHome','huntHome','settlementHome','affix'];
const enemies=values=>list(values,MAX_ACTORS).filter(e=>e.hp>0&&ENEMY_IDS.includes(e.type)).map(e=>({...pick(e,ENEMY_KEYS),...pick(e,HOME_KEYS)}));
const objects=values=>list(values).map(value=>({...record(value,['door','mechanism','guardIds','memberIds','direction','footprint','stock','reward']),...(value._remaining instanceof Set?{remainingIds:[...value._remaining]}:{})}));
// Authored identities and geometry are rebuilt from the current content.
// Disk records may restore progress, never relocate a door, road or collider.
const PROGRESS_KEYS='id state discovered explored cleared announced open opened gateOpen progress remainingGuards guardIds memberIds rewardClaimed rewardQueued rewarded bossId battleId workerId openProgress activationAge activationDuration started stock'.split(' ');
const MECHANISM_PROGRESS='state remaining maxRemaining warning charge hp _shot activationAge activationDuration'.split(' ');
function progress(value){
  const saved=pick(value,PROGRESS_KEYS);
  if(value?.mechanism)saved.mechanism=pick(value.mechanism,MECHANISM_PROGRESS);
  const remaining=value?._remaining instanceof Set?[...value._remaining]:value?.remainingIds;
  if(Array.isArray(remaining))saved.remainingIds=copy(remaining);
  return saved;
}
const progressObjects=values=>list(values).map(progress);
function applyProgress(target,saved){
  const next=progress(saved),mechanism=next.mechanism;delete next.mechanism;
  Object.assign(target,next);
  if(mechanism&&target.mechanism)Object.assign(target.mechanism,mechanism);
  if(next.remainingIds){target._remaining=new Set(next.remainingIds);delete target.remainingIds;}
}
function shopReturnPoint(game,site,source=game){
  if(!isWorldShop(site))return null;
  const door=site.door,terrain=source.terrain,environment=source.environment,clearance=game.player.r+4;
  if(!door||!terrain)return null;
  const safe=point=>terrain.isFree(point.x,point.y,clearance)&&!terrain.firstBlocker(door.x,door.y,point.x,point.y,clearance)&&
    environment?.isHazardFree?.(point.x,point.y,clearance)!==false&&
    !environment?.props?.some(prop=>prop.state!=='spent'&&Math.hypot(prop.x-point.x,prop.y-point.y)<(prop.blastRadius||82)+clearance);
  const inset=Math.max(52,(site.touchRadius??26)+26);
  for(const offset of [inset,inset+20,inset+44,inset+68])for(const side of [0,-28,28,-56,56]){
    const point={x:door.x+side,y:door.y+offset};if(safe(point))return point;
  }
  return null;
}
function restoreRecords(values){return copy(values).map(value=>{if(value.remainingIds){value._remaining=new Set(value.remainingIds);delete value.remainingIds;}return value;});}
const sparse=bits=>{const result=[];if(bits)for(let i=0;i<bits.length;i++)if(bits[i])result.push([i,bits[i]]);return result;};
function applyBits(bits,entries){if(!bits)return;bits.fill(0);for(const [index,value] of list(entries,65536))if(Number.isInteger(index)&&index>=0&&index<bits.length&&Number.isInteger(value)&&value>0&&value<=255)bits[index]=value;}
function adventureSnapshot(adventure){
  if(!adventure)return null;
  return {...pick(adventure,['furyTime','magnetTime','_id','_treasureCount','_nextTreasureAt']),props:objects(adventure.props),pickups:objects(adventure.pickups),treasure:adventure.treasure?record(adventure.treasure,['guardIds']):null,consumed:sparse(adventure._consumed?.bits)};
}
function restoreAdventure(target,saved){
  if(!target||!saved)return;
  Object.assign(target,pick(saved,['furyTime','magnetTime','_id','_treasureCount','_nextTreasureAt']));
  target.props=copy(saved.props);target.pickups=copy(saved.pickups);target.treasure=copy(saved.treasure);applyBits(target._consumed?.bits,saved.consumed);
}
function visionSnapshot(dungeon,state){
  const memory=dungeon?.vision?._states.get(state);if(!memory)return null;
  return {seen:sparse(memory.seen),walls:memory.pieces.filter(piece=>piece.seen).map(piece=>piece.id)};
}
function dungeonSnapshot(dungeon,state){
  return {id:state.id,kind:state.kind,...pick(state,['bossId','bossDefeated','bossDiscovered','rewardClaimed','populated']),visited:[...state.visited],
    enemies:enemies(state.enemies),gems:objects(state.gems),coins:objects(state.coins),chests:progressObjects(state.chests),mechanisms:progressObjects(state.mechanisms),
    treasure:state.treasure?progress(state.treasure):null,rooms:[...state.rooms].map(([id,room])=>[id,progress(room)]),adventure:adventureSnapshot(state.adventure),vision:visionSnapshot(dungeon,state)};
}
function surfaceSnapshot(game,source,old){
  const c=game.companions,dungeons=source.dungeonStates||game.dungeon.states;
  const saved={savedAt:source.savedAt??game.time,...pick(source,['bossDefeated','nextBossAt']),enemies:enemies(source.enemies),gems:objects(source.gems),coins:objects(source.coins),
    adventure:adventureSnapshot(source.adventure),environment:source.environment?{props:objects(source.environment.props),consumed:sparse(source.environment._consumed?.bits),mechanisms:objects(source.environment.mechanisms?.props),used:sparse(source.environment.mechanisms?._used?.bits)}:null,
    settlements:progressObjects(source.settlements?.sites),relicSites:progressObjects(source.relicSites?.sites),rift:progressObjects(source.riftExploration?.sites),
    territories:progressObjects(source.territories?.groups),discoveredMap:[...(source.discoveredMap||[])],explored:[...(source.terrain?.island?.explored||[])],portals:progressObjects(source.portals),
    camps:objects(source.companionCamps??c?.camps),companionNextAt:source.companionNextAt??c?.nextAt??0,
    encounters:source.encounters?{nextAt:source.encounters.nextAt,_id:source.encounters._id,activities:source.encounters.activities.map(a=>({...record(a,['guardIds','pendingGuards','spawnWarnings']),remaining:[...(a._remaining||[])]}))}:null,
    pendingRewards:[...(old?.pendingRewards||[])],dungeons:Object.fromEntries(Object.entries(old?.dungeons||{}).filter(([,state])=>state.kind!=='shop'))};
  for(const [id,state] of dungeons){if(state.kind==='shop')delete saved.dungeons[id];else saved.dungeons[id]=dungeonSnapshot(game.dungeon,state);}
  return saved;
}
function restoreEnemies(game,saved){
  game.enemies=[];
  for(const dto of list(saved,MAX_ACTORS)){
    if(!ENEMY_IDS.includes(dto.type)||!(dto.hp>0))continue;
    const enemy=game._spawnEnemy(dto.type,1);if(!enemy)continue;
    if(dto.type==='boss')game._initializeRegionalBoss(enemy,dto.bossKind);
    Object.assign(enemy,copy(dto));
    if(enemy.affix){enemy.affix.phase='idle';enemy.affix.life=0;}
    enemy.guardActive=dto.debugBoss||dto.debugMonster?dto.guardActive:false;
    enemy.territoryState=enemy.territoryId?'idle':enemy.territoryState;
    game._id=Math.max(game._id,enemy.id||0);
  }
  game._grid?.clear();game._friendlySnapshot=null;
  return game.enemies;
}
function mergeObjects(target,saved){
  if(!target)return;
  const byId=new Map(list(saved).map(value=>[value.id,value]));
  for(const item of target){const next=byId.get(item.id);if(next)applyProgress(item,next);}
}
function connectionIds(values,toNames=false){
  if(toNames)return [...values].map(key=>key.split(':').map(Number).map(index=>WORLD_IDS[index])).filter(pair=>pair.length===2&&pair.every(Boolean));
  return new Set(list(values).filter(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(id=>WORLD_IDS.includes(id))).map(pair=>pair.map(id=>WORLD_IDS.indexOf(id)).sort((a,b)=>a-b).join(':')));
}
export function validateWorldSaveData(data){
  if(!plain(data)||data.version!==1||!plain(data.regions)||!plain(data.player)||!plain(data.start)||!WORLD_IDS.includes(data.start.worldId)||!WORLD_IDS.includes(data.location?.worldId))throw new Error('存档格式无效');
  if(![data.player.hp,data.player.level,data.player.xp,data.player.xpNext,data.gold,data.crystals,data.crystalsNext].every(finite)||data.player.level<1||data.player.xpNext<=0||data.crystalsNext<=0||data.gold<0||data.crystals<0)throw new Error('存档成长数据无效');
  if(data.build?.version!==3||data.build.heroId!==data.start.hero)throw new Error('存档能力数据无效');
  CombatBuild.fromSnapshot(data.build);
  if(Object.keys(data.regions).some(id=>!WORLD_IDS.includes(id)))throw new Error('存档地图无效');
  for(const region of Object.values(data.regions)){
    if(!plain(region)||!plain(region.dungeons)||['enemies','gems','coins','settlements','relicSites','rift','territories','discoveredMap','portals','camps'].some(key=>!Array.isArray(region[key])))throw new Error('存档区域数据无效');
    for(const scene of [region,...Object.values(region.dungeons)]){
      if(!Array.isArray(scene.enemies)||scene.enemies.length>MAX_ACTORS||scene.enemies.some(enemy=>!ENEMY_IDS.includes(enemy.type)||![enemy.id,enemy.hp,enemy.maxHp,enemy.x,enemy.y].every(finite)))throw new Error('存档守卫数据无效');
    }
  }
  let nodes=0;
  const walk=(value,depth=0,path='save')=>{
    if(++nodes>400000||depth>18)throw new Error('存档超出上限');
    if(typeof value==='number'&&!finite(value))throw new Error(`存档数值无效：${path}`);
    if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(key))throw new Error('存档字段无效');walk(item,depth+1,`${path}.${key}`);
    }
  };walk(data);return data;
}

/** One campaign in the supplied identity-bound storage. Quest flags and assets commit together. */
export class WorldSave {
  constructor({storage=browserStorage(),enabled=true,onNotice=()=>{}}={}){
    this.enabled=!!enabled;this.storage=storage;this.onNotice=onNotice;this.data=empty();this._storageOk=!!storage;this._blocked=false;this._applied=new WeakSet();this._dungeonApplied=new WeakSet();
    this.questStorage={getItem:key=>key===QUEST_STORAGE_KEY&&this.data.quests?JSON.stringify(this.data.quests):null,setItem:(key,value)=>{if(key===QUEST_STORAGE_KEY)this.data.quests=JSON.parse(value);},removeItem:key=>{if(key===QUEST_STORAGE_KEY)this.data.quests=null;}};
    if(this.enabled&&storage)try{const raw=storage.getItem(WORLD_SAVE_KEY);if(raw){if(raw.length>MAX_BYTES)throw new Error('存档超出上限');this.data=validateWorldSaveData(JSON.parse(raw));}}
    catch(error){this._blocked=true;this._fail(error,'read');}
  }
  get hasSave(){return !!this.data.start;}
  get storageOk(){return this._storageOk;}
  get revision(){return this.data.revision||0;}
  startOptions(){return this.hasSave?{...this.data.start,worldId:this.data.location.worldId}:{worldId:getConfigSection('worlds').travel.startWorldId};}
  _fail(error,reason){this._storageOk=false;this.onNotice({type:'worldSaveError',reason,message:reason==='read'?'世界存档无法读取，请保留页面并检查浏览器存储。':'世界进度未能保存，请保留页面。',detail:String(error?.message||error)});return false;}
  reset(){
    if(!this.enabled)return false;
    try{if(!this.storage?.removeItem)throw new Error('浏览器存储不可用');this.storage.removeItem(WORLD_SAVE_KEY);this.data=empty();this._blocked=false;this._storageOk=true;this._applied=new WeakSet();this._dungeonApplied=new WeakSet();return true;}
    catch(error){return this._fail(error,'reset');}
  }
  attach(game){
    if(!this.enabled||!permitted(game)||this._blocked)return false;
    game.worldSave=this;
    if(!this.hasSave)return true;
    const d=this.data,p=game.player;
    if(game.worldId!==d.location.worldId||game.hero.id!==d.start.hero)throw new Error('WorldSave requires startOptions before Game construction');
    game.build=CombatBuild.fromSnapshot(d.build);game.levels=game.build.levels;game.branches=game.build.branches;game.evolutions=game.build.evolutions;game.superSkills.owned=game.build.superLevels;
    game.startWorldId=d.start.worldId;
    Object.assign(p,pick(d.player,['level','xp','xpNext','baseMaxHp','skillCooldown','facing']));
    Object.assign(game,pick(d,['gold','crystals','crystalsNext','time','runTime','kills','wave','bossCount','bossKills','_clock','_id','_branchOfferCursor','_branchOfferWeapon']));
    if(game.realms&&d.realms)Object.assign(game.realms,pick(d.realms,['index','talismans','cooldown','_starterGranted']));
    game.relics.owned=list(d.relics?.owned).filter(id=>RELICS.some(relic=>relic.id===id));game.relics.wardAmount=d.relics?.wardAmount||0;
    game.superSkills.cooldowns=copy(d.cooldowns?.super||{});Object.assign(game.barrier,pick(d.cooldowns?.barrier,['cooldown','remaining','life','_capacity']));
    game.worldTravel?.restore(d.travel);game.worldShops?.restore(d.shops);
    game.regions.unlockedConnections=connectionIds(d.connections?.unlocked);game.regions.claimedConnections=connectionIds(d.connections?.claimed);
    this.restoreRegion(game);
    game._refreshStats();game._refreshWeapons();
    p.hp=d.location.recover?p.maxHp:Math.max(1,Math.min(p.maxHp,d.player.hp));
    const rest=game.worldTravel?.getRestAnchor(),site=game.settlements?.sites.find(site=>site.id===d.location.facilityId);
    const location=d.location.recover?(rest?.worldId===game.worldId?rest:game.worldTravel?.spawnPoint()):
      d.location.facilityId?shopReturnPoint(game,site)||game.worldTravel?.spawnPoint():d.location;
    if(location&&finite(location.x)&&finite(location.y)&&game.terrain.isFree(location.x,location.y,p.r,'ground')){p.x=location.x;p.y=location.y-groundOffset(p,true);}
    p.invuln=2;game.regionGrace=2;
    this._restoreParty(game,d.party);
    game.worldTravel?.onRegionEntered();
    const find=id=>game.territories?.byId.get(id)||game.regions.portals.find(portal=>portal.id===id);
    game.regions._rewardQueue=list(d.regions[game.worldId]?.pendingRewards).map(find).filter(item=>item&&!item.rewardClaimed);
    game.regions.rewardPortal=null;game.superSkills.pending=null;game._regionRewardPending=false;
    restoreDebugTools(game);
    game.status='playing';
    if(d.relics?.pending){game.relics.pending=true;game.relics.choices=[];game.status='relic';}
    else if(!game.regions.flushReward())game.progression.tryUpgrade();
    return true;
  }
  _restoreParty(game,saved){
    if(!saved)return;
    const c=game.companions,eventCount=game.events.length,effectCount=game.effects.length,status=game.status;
    game.status='playing';c.members=[];
    for(const dto of list(saved.members,30)){
      const member=c.recruit(dto.kind,{sourceId:dto.sourceId,rescueBonus:false});
      if(member){Object.assign(member,pick(dto,['id','hp','state','recovery','sourceId']));member.hp=Math.max(0,Math.min(member.hp,member.maxHp));game._id=Math.max(game._id,member.id);}
    }
    Object.assign(c,pick(saved,['nextPayrollAt','graceUntil','unpaidCost','rescuedCount']));c._rescueSources=new Set(list(saved.rescueSources));
    game.events.length=eventCount;game.effects.length=effectCount;game.status=status;c.onSceneChange?.();
  }
  restoreRegion(game){
    if(!this.enabled||!permitted(game)||game.dungeon?.active||this._applied.has(game.terrain))return false;
    this._applied.add(game.terrain);
    const d=this.data.regions[game.worldId];if(!d)return false;
    restoreEnemies(game,d.enemies);game.gems=copy(d.gems);game.coins=copy(d.coins);restoreAdventure(game.adventure,d.adventure);
    if(game.environment&&d.environment){game.environment.props=restoreRecords(d.environment.props);applyBits(game.environment._consumed?.bits,d.environment.consumed);if(game.environment.mechanisms){game.environment.mechanisms.props=restoreRecords(d.environment.mechanisms);applyBits(game.environment.mechanisms._used?.bits,d.environment.used);}}
    mergeObjects(game.settlements?.sites,d.settlements);mergeObjects(game.relicSites?.sites,d.relicSites);mergeObjects(game.riftExploration?.sites,d.rift);mergeObjects(game.regions.portals,d.portals);
    for(const site of game.riftExploration?.sites||[])if(site.gateId&&site.open)game.terrain.setRiftGate(site.gateId,true);
    const enemyById=new Map(game.enemies.map(enemy=>[enemy.id,enemy]));
    mergeObjects(game.territories?.groups,d.territories);
    for(const group of game.territories?.groups||[])group.members=(group.memberIds||[]).map(id=>enemyById.get(id)||{id,hp:0});
    if(game.encounters&&d.encounters){Object.assign(game.encounters,pick(d.encounters,['nextAt','_id']));game.encounters.activities=copy(d.encounters.activities).map(a=>{a._remaining=new Set(a.remaining);delete a.remaining;return a;});}
    game.discoveredMap=new Set(d.discoveredMap);game.companions.camps=restoreRecords(d.camps);game.companions.nextAt=d.companionNextAt;
    if(game.terrain.island)game.terrain.island.explored=new Set(d.explored);
    Object.assign(game,pick(d,['bossDefeated','nextBossAt']));
    const elapsed=Math.max(0,game.time-(d.savedAt||0));
    if(game.adventure)game.adventure._nextTreasureAt+=elapsed;if(game.encounters)game.encounters.nextAt+=elapsed;game.companions.nextAt+=elapsed;
    game.settlements?._setStructures();game.relicSites?._setStructures();game.regions._setStructures();game.regions._syncConnections();game.quests?._applyWorldEffects();
    const find=id=>game.territories?.byId.get(id)||game.regions.portals.find(portal=>portal.id===id);
    game.regions._rewardQueue=list(d.pendingRewards).map(find).filter(item=>item&&!item.rewardClaimed);
    return true;
  }
  restoreDungeon(game,state){
    if(!this.enabled||!permitted(game)||state.kind==='shop'||this._dungeonApplied.has(state))return false;
    this._dungeonApplied.add(state);
    const d=this.data.regions[game.worldId]?.dungeons?.[state.id];if(!d)return false;
    state.enemies=restoreEnemies(game,d.enemies);state.gems=game.gems=copy(d.gems);state.coins=game.coins=copy(d.coins);
    Object.assign(state,pick(d,['bossId','bossDefeated','bossDiscovered','rewardClaimed','populated']));state.rewardPending=false;state.visited=new Set(d.visited);
    for(const [id,saved] of list(d.rooms)){const room=state.rooms.get(id);if(room)applyProgress(room,saved);}
    mergeObjects(state.chests,d.chests);mergeObjects(state.mechanisms,d.mechanisms);
    if(state.treasure){applyProgress(state.treasure,d.treasure);state.treasure.state=state.rewardClaimed?'claimed':state.bossDefeated?'unlocked':'locked';}
    for(const mechanism of state.mechanisms||[])if(mechanism.opened)state.terrain.setStructures([],`interior:${mechanism.id}`);
    restoreAdventure(state.adventure,d.adventure);
    if(d.vision){const record=game.dungeon.vision._record(state);applyBits(record.seen,d.vision.seen);record.count=record.seen.reduce((sum,n)=>sum+(n?1:0),0);record.dirty=true;const ids=new Set(d.vision.walls);for(const piece of record.pieces)piece.seen=ids.has(piece.id);record.known=record.pieces.filter(piece=>piece.seen);record.knownByWall=new Map();for(const piece of record.known){if(!record.knownByWall.has(piece.wallId))record.knownByWall.set(piece.wallId,[]);record.knownByWall.get(piece.wallId).push(piece);}}
    return true;
  }
  capture(game,{reason='checkpoint',respawn=null}={}){
    if(!this.enabled||!permitted(game)||this._blocked)return false;
    try{
      game.quests?.flush();game.dungeon?._saveScene();
      const d=empty();d.quests=copy(this.data.quests);d.regions={...this.data.regions};d.revision=this.revision+1;d.savedAt=Date.now();d.reason=String(reason).slice(0,64);
      d.start={hero:game.hero.id,appearanceId:game.appearanceId,initialWeaponId:game.initialWeaponId,worldId:game.startWorldId};
      const underground=game.dungeon.active,world=underground?game.dungeon._world:null;
      const recovering=!!respawn||game.player.hp<=0;
      const coreSpawn=game.worldTravel?.current?.core.spawn;
      const recovery=recovering?(game.worldTravel?.getRestAnchor()||{worldId:game.worldId,...coreSpawn}):null;
      const shop=underground?.kind==='shop'?underground.site:null;
      const position=recovery||(shop?shopReturnPoint(game,shop,world)||coreSpawn:world?world.returnPoint:{x:game.player.x,y:game.player.y+groundOffset(game.player,true)});
      d.location={worldId:recovery?.worldId||game.worldId,x:position.x??0,y:position.y??0,recover:recovering,...(shop&&!recovering?{facilityId:shop.id}:{})};
      if(!WORLD_IDS.includes(d.location.worldId))throw new Error('恢复地点无效');
      d.player=pick(game.player,['hp','level','xp','xpNext','baseMaxHp','skillCooldown','facing']);d.build=game.build.serialize();
      Object.assign(d,pick(game,['gold','crystals','crystalsNext','time','runTime','kills','wave','bossCount','bossKills','_clock','_id','_branchOfferCursor','_branchOfferWeapon']));
      d.realms=pick(game.realms,['index','talismans','cooldown','_starterGranted']);d.relics={owned:[...game.relics.owned],wardAmount:game.relics.wardAmount,pending:game.relics.pending};
      d.cooldowns={super:copy(game.superSkills.cooldowns),barrier:pick(game.barrier,['cooldown','remaining','life','_capacity'])};
      d.travel=game.worldTravel?.serialize()??null;d.shops=game.worldShops?.serialize()??null;
      const c=game.companions;d.party={members:c.members.map(member=>pick(member,['id','kind','hp','state','recovery','sourceId'])),...pick(c,['nextPayrollAt','graceUntil','unpaidCost','rescuedCount']),rescueSources:[...c._rescueSources]};
      d.connections={unlocked:connectionIds(game.regions.unlockedConnections,true),claimed:connectionIds(game.regions.claimedConnections,true)};
      for(const [index,state] of game.regions.states){const id=WORLD_IDS[index];if(id)d.regions[id]=surfaceSnapshot(game,state,d.regions[id]);}
      const source={...game,...(world||{}),portals:game.regions.portals,dungeonStates:game.dungeon.states,discoveredMap:game.discoveredMap,
        companionCamps:world?.companionCamps??c.camps,companionNextAt:world?.companionNextAt??c.nextAt};
      d.regions[game.worldId]=surfaceSnapshot(game,source,d.regions[game.worldId]);
      d.regions[game.worldId].pendingRewards=[game.regions.rewardPortal,...game.regions._rewardQueue].filter(Boolean).map(reward=>reward.id);
      validateWorldSaveData(d);const text=JSON.stringify(d);if(text.length>MAX_BYTES)throw new Error('世界存档超出容量上限');
      if(!this.storage?.setItem)throw new Error('浏览器存储不可用');
      this.storage.setItem(WORLD_SAVE_KEY,text);this.data=d;this._storageOk=true;return true;
    }catch(error){return this._fail(error,'write');}
  }
}
