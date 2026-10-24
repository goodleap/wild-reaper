import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WorldSave,WORLD_SAVE_KEY } from './dist/world-save.js';
import { QUEST_STORAGE_KEY } from './dist/quest-store.js';
import { groundOffset } from './dist/terrain.js';
import { WorldMap } from './dist/world-map.js';

function memory(){const values=new Map();return {values,writes:0,getItem:key=>values.get(key)??null,setItem(key,value){this.writes++;values.set(key,String(value));},removeItem:key=>values.delete(key)};}
function start(storage,options={}){const save=new WorldSave({storage,...options}),game=new Game({mode:'world',...save.startOptions(),questStorage:save.questStorage});assert(save.attach(game));return {save,game};}
const storage=memory(),{save,game:g}=start(storage);
assert.equal(g.worldId,'rift-forest');assert.equal(save.hasSave,false);
g.gold=157;g.crystals=g.crystalsNext+15;g.addExperience(65);g.build.increment('arrow');g.build.increment('arrow');
g.realms.talismans=8;g.realms._starterGranted=true;g.relics.acquire('deepRoot');
const companion=g.companions.recruit('owl',{sourceId:'saved-owl',rescueBonus:true});assert(companion);
companion.hp=companion.maxHp/2;const build=g.build.serialize(),xp=g.player.xp,level=g.player.level;
const injured=g.enemies.find(enemy=>enemy.type!=='boss');assert(injured);injured.hp=Math.max(1,injured.hp-9);const hurt={id:injured.id,hp:injured.hp};
const cleared=g.territories.groups.find(group=>!group.members.some(member=>member.id===hurt.id));assert(cleared);
cleared.cleared=true;for(const enemy of cleared.members)enemy.hp=0;
const chest=g.riftExploration.sites.find(site=>site.kind==='chest');assert(chest);chest.state='claimed';
const shortcut=g.riftExploration.sites.find(site=>site.gateId);assert(shortcut);shortcut.open=true;shortcut.state='open';g.terrain.setRiftGate(shortcut.gateId,true);
g.discoveredMap.add('saved-marker');new WorldMap().discover(g);const surfaceSeen=[...g.terrain.island.explored];assert(surfaceSeen.length);g.adventure._consumed.add('supply:test');g.environment._consumed.add('mushroom:test');
const record=g.quests.store.record('underground-return');record.accepted=true;record.objectives.crossing=true;g.quests.store.changed();
assert.equal(storage.writes,0,'quest mutations only update the in-memory campaign transaction');
assert(save.capture(g,{reason:'test'}));assert.equal(storage.writes,1);assert.equal(storage.getItem(QUEST_STORAGE_KEY),null);
const serialized=storage.getItem(WORLD_SAVE_KEY);assert(!serialized.includes('terrainNavigation'));assert(!serialized.includes('_cache'));
const staticCollections={settlements:g.settlements.sites,relicSites:g.relicSites.sites,rift:g.riftExploration.sites,territories:g.territories.groups,portals:g.regions.portals};
const staticGeometry=item=>Object.fromEntries(['x','y','r','width','depth','radius','door','arrivalDirection','exitTrigger','targetPortalId','nextRegionIndex','mechanism'].filter(key=>item[key]!==undefined).map(key=>[key,key==='mechanism'?{x:item.mechanism.x,y:item.mechanism.y,r:item.mechanism.r}:structuredClone(item[key])]));
const expectedGeometry=Object.fromEntries(Object.entries(staticCollections).map(([key,items])=>[key,new Map(items.map(item=>[item.id,staticGeometry(item)]))]));
const edited=JSON.parse(serialized);
for(const key of Object.keys(staticCollections))for(const item of edited.regions[g.worldId][key]){
  for(const field of ['x','y','r','width','depth','radius','door','arrivalDirection','exitTrigger','targetPortalId','nextRegionIndex'])assert(!Object.hasOwn(item,field),`${key}: saves omit static ${field}`);
  Object.assign(item,{x:-90000,y:90000,r:900,width:1900,depth:1900,radius:5000,door:{x:0,y:0},arrivalDirection:{x:1,y:0},exitTrigger:{edge:'south',width:900,depth:900},targetPortalId:'wrong',nextRegionIndex:0});
  if(item.mechanism)Object.assign(item.mechanism,{x:90000,y:-90000,r:900});
}
storage.setItem(WORLD_SAVE_KEY,JSON.stringify(edited));
let {save:loaded,game:h}=start(storage);
assert.deepEqual(h.build.serialize(),build);assert.equal(h.gold,157);assert.equal(h.crystals,g.crystals);assert.equal(h.player.xp,xp);assert.equal(h.player.level,level);
assert.equal(h.status,'upgrade','unspent crystals reopen their normal random upgrade choice');
assert.equal(h.realms.talismans,8);assert(h.realms._starterGranted);assert(h.relics.owned.includes('deepRoot'));
assert.equal(h.companions.members.length,1);assert.equal(h.companions.members[0].kind,'owl');assert.equal(h.companions.members[0].hp,companion.hp);
assert.equal(h.enemies.find(enemy=>enemy.id===hurt.id).hp,hurt.hp);assert(h.territories.byId.get(cleared.id).cleared);
assert(!h.enemies.some(enemy=>cleared.memberIds.includes(enemy.id)),'cleared guardians never respawn on reload');
assert.equal(h.riftExploration.sites.find(site=>site.id===chest.id).state,'claimed');assert(h.terrain.riftGateOpen(shortcut.gateId));assert(h.discoveredMap.has('saved-marker'));
assert.deepEqual([...h.terrain.island.explored],surfaceSeen,'surface fog-of-war uses Island.explored and survives reload');
assert(h.adventure._consumed.has('supply:test'));assert(h.environment._consumed.has('mushroom:test'));
assert(h.quests.store.record('underground-return').objectives.crossing);assert.equal(h.build.superLevels,h.superSkills.owned);
for(const [key,items] of Object.entries({settlements:h.settlements.sites,relicSites:h.relicSites.sites,rift:h.riftExploration.sites,territories:h.territories.groups,portals:h.regions.portals}))
  for(const item of items)assert.deepEqual(staticGeometry(item),expectedGeometry[key].get(item.id),`${key}/${item.id}: current authored geometry overrides every stale saved coordinate`);

// Completing a quest commits its reward flag and real wallet in one record.
h.status='playing';h.crystals=0;
const quest=h.quests.store.record('underground-return');quest.objectives.crossing=true;quest.objectives.gate=true;
const goldBefore=h.gold;h.quests._complete('underground-return');
assert(quest.rewardClaimed);assert(h.gold>goldBefore);assert(loaded.capture(h));
({save:loaded,game:h}=start(storage));assert(h.quests.store.record('underground-return').rewardClaimed);assert(h.gold>goldBefore);
const paid=h.gold;h.quests._complete('underground-return');assert.equal(h.gold,paid,'completed quests cannot grant the same reward twice');

// Keep unfinished Boss reward offers and do not pay crystals until a choice.
h.status='playing';h.crystals=0;h.superSkills.pending=null;
const bossGroup=h.territories.groups.find(group=>group.kind==='boss');assert(bossGroup);
bossGroup.cleared=true;bossGroup.rewardQueued=true;for(const enemy of bossGroup.members)enemy.hp=0;h.regions._rewardQueue=[bossGroup];h.regions.flushReward();assert.equal(h.status,'super');
assert(loaded.capture(h));
({save:loaded,game:h}=start(storage));assert.equal(h.status,'super');assert.equal(h.regions.rewardPortal.id,bossGroup.id);assert(h.superSkills.pending);
const reward=h.getSuperChoices()[0];assert(reward);assert(h.chooseSuper(reward.id));assert(h.territories.byId.get(bossGroup.id).rewardClaimed);h.status='playing';

// Save a populated dungeon, then rebuild fresh geometry on next entry.
const caveSite=h.riftExploration.sites.find(site=>site.caveId);assert(caveSite);
const enter=(game,site)=>{
  game.status='playing';game.player.x=site.x;game.player.y=site.y-groundOffset(game.player,true);
  const request=game.riftExploration.interact(site.id);assert(request,'cave entrance accepts interaction');
  for(let i=0;i<30&&game.sceneTransition.active;i++)game.sceneTransition.update(.05);
  assert(game.dungeon.active);
};
enter(h,caveSite);const dungeon=h.dungeon.active,guard=h.enemies.find(enemy=>!enemy.dungeonBoss);assert(guard);guard.hp=Math.max(1,guard.hp-7);
const wounded={id:guard.id,hp:guard.hp},claimed=dungeon.chests[0];claimed.state='claimed';
const mechanism=dungeon.mechanisms[0];mechanism.opened=true;dungeon.terrain.setStructures([],`interior:${mechanism.id}`);
dungeon.visited.add(3);h.dungeon.vision.update();const explored=h.dungeon.vision._record(dungeon).count;assert(explored>0);
const dungeonBoss=h.enemies.find(enemy=>enemy.dungeonBoss);assert(dungeonBoss);dungeonBoss.hp=0;h.dungeon.onEnemyKilled(dungeonBoss);dungeon.rewardPending=true;dungeon.treasure.state='choosing';
const room=[...dungeon.rooms.values()][0];Object.assign(room,{started:true,cleared:true,rewarded:true});
assert(loaded.capture(h));
const dungeonBytes=storage.getItem(WORLD_SAVE_KEY).length;
const undergroundGeometry={chest:staticGeometry(claimed),mechanism:staticGeometry(mechanism),treasure:staticGeometry(dungeon.treasure),room:{kind:room.kind,total:room.total,heal:room.heal}};
const editedDungeon=JSON.parse(storage.getItem(WORLD_SAVE_KEY)),scene=editedDungeon.regions[h.worldId].dungeons[dungeon.id];
for(const items of [scene.chests,scene.mechanisms,[scene.treasure]])for(const item of items){assert(!Object.hasOwn(item,'x'));Object.assign(item,{x:90000,y:90000,r:900,closedLink:[999,1000]});}
for(const [,saved] of scene.rooms)Object.assign(saved,{kind:'wrong',total:9999,heal:'wrong'});
storage.setItem(WORLD_SAVE_KEY,JSON.stringify(editedDungeon));
({save:loaded,game:h}=start(storage));assert.equal(h.dungeon.active,null,'resume safely on surface while preserving underground progress');
enter(h,h.riftExploration.sites.find(site=>site.id===caveSite.id));
loaded.restoreDungeon(h,h.dungeon.active); // Idempotent if the runtime hook already restored it.
assert.equal(h.enemies.find(enemy=>enemy.id===wounded.id).hp,wounded.hp);assert.equal(h.dungeon.active.chests.find(c=>c.id===claimed.id).state,'claimed');
assert(h.dungeon.active.mechanisms.find(m=>m.id===mechanism.id).opened);assert(h.dungeon.active.visited.has(3));
assert(h.dungeon.vision._record(h.dungeon.active).count>=explored);assert.equal(h.dungeon.active.rewardPending,false);assert.equal(h.dungeon.active.treasure.state,'unlocked');
assert.deepEqual(staticGeometry(h.dungeon.active.chests.find(c=>c.id===claimed.id)),undergroundGeometry.chest);
assert.deepEqual(staticGeometry(h.dungeon.active.mechanisms.find(m=>m.id===mechanism.id)),undergroundGeometry.mechanism);
assert.deepEqual(staticGeometry(h.dungeon.active.treasure),undergroundGeometry.treasure);
const restoredRoom=h.dungeon.active.rooms.get(room.cellId);assert(restoredRoom.started&&restoredRoom.cleared&&restoredRoom.rewarded);
assert.deepEqual({kind:restoredRoom.kind,total:restoredRoom.total,heal:restoredRoom.heal},undergroundGeometry.room,'room progress cannot rewrite its current encounter definition');
assert.equal(loaded.restoreDungeon(h,h.dungeon.active),false,'a live scene is never overwritten by its old disk snapshot');

// A death changes only the resume point/health; it retains growth and claims.
const deathSpawn={...h.worldTravel.current.core.spawn};
h.player.hp=0;assert(loaded.capture(h,{reason:'death',respawn:true}));
assert.deepEqual({x:loaded.data.location.x,y:loaded.data.location.y},deathSpawn,'death checkpoints use the configured town spawn');
({save:loaded,game:h}=start(storage));assert.equal(h.player.hp,h.player.maxHp);assert.equal(h.gold,paid);assert.equal(h.player.level,level);
assert.deepEqual({x:h.player.x,y:h.player.y+groundOffset(h.player,true)},deathSpawn);
// Unloaded worlds retain their own population and underground history.
h.status='playing';h.crystals=0;
const toMarsh=h.regions.portals.find(portal=>portal.nextRegion?.id==='marsh');assert(toMarsh);assert(h._switchRegion(toMarsh));
h.worldShops.inventory.heal=3;h.worldTravel.activated.add('marsh');
const marshEnemy=h.enemies.find(enemy=>enemy.type!=='boss');assert(marshEnemy);marshEnemy.hp=Math.max(1,marshEnemy.hp-8);const marshHurt={id:marshEnemy.id,hp:marshEnemy.hp};
assert(loaded.capture(h));({save:loaded,game:h}=start(storage));assert.equal(h.worldId,'marsh');assert.equal(h.startWorldId,'rift-forest');
assert.equal(h.worldShops.inventory.heal,3);assert(h.worldTravel.activated.has('marsh'));assert.equal(h.enemies.find(enemy=>enemy.id===marshHurt.id).hp,marshHurt.hp);
const toForest=h.regions.portals.find(portal=>portal.nextRegion?.id==='rift-forest');assert(toForest);h.status='playing';assert(h._switchRegion(toForest));
assert.equal(h.enemies.find(enemy=>enemy.id===hurt.id).hp,hurt.hp);assert(h.territories.byId.get(cleared.id).cleared);
enter(h,h.riftExploration.sites.find(site=>site.id===caveSite.id));assert.equal(h.dungeon.active.chests.find(chest=>chest.id===claimed.id).state,'claimed');
assert.equal(h.enemies.find(enemy=>enemy.id===wounded.id).hp,wounded.hp);
assert(loaded.capture(h));
const stable=storage.getItem(WORLD_SAVE_KEY),writes=storage.writes;
for(const options of [{mode:'world',debug:true},{mode:'story'},{mode:'dungeon',dungeonId:'survival'}]){
  const other=new Game(options);assert.equal(loaded.attach(other),false);assert.equal(loaded.capture(other),false);
}
assert.equal(storage.writes,writes);assert.equal(storage.getItem(WORLD_SAVE_KEY),stable,'other modes cannot overwrite the campaign');
let reads=0;new WorldSave({enabled:false,storage:{getItem(){reads++;throw Error('debug read');}}});assert.equal(reads,0,'debug does not even read the official save');

const notices=[],failing=new WorldSave({storage:{...storage,setItem(){throw Error('quota');}},onNotice:n=>notices.push(n)});
const failedGame=new Game({mode:'world',...failing.startOptions(),questStorage:failing.questStorage});failing.attach(failedGame);failedGame.gold+=100;
assert.equal(failing.capture(failedGame),false);assert.equal(failing.storageOk,false);assert.equal(storage.getItem(WORLD_SAVE_KEY),stable);assert.equal(notices.at(-1).type,'worldSaveError');
const corrupt=memory();corrupt.setItem(WORLD_SAVE_KEY,'{"version":99}');const broken=new WorldSave({storage:corrupt,onNotice:n=>notices.push(n)});
assert.equal(broken.attach(h),false);assert.equal(broken.capture(h),false);assert.equal(corrupt.getItem(WORLD_SAVE_KEY),'{"version":99}','unrecognized data is not silently overwritten');
assert(broken.reset());assert.equal(corrupt.getItem(WORLD_SAVE_KEY),null);assert.equal(broken.questStorage.getItem(QUEST_STORAGE_KEY),null);
// Wounded surface defenders retain both their home and the owning kill ledger.
const guardStorage=memory(),guardRun=start(guardStorage),occupied=guardRun.game.settlements.sites.find(site=>site.type==='occupied');
assert(guardRun.game.settlements._startGuards(occupied));
const sentry=guardRun.game.enemies.find(enemy=>enemy.settlementId===occupied.id);sentry.hp=Math.max(1,sentry.hp-10);
const recovering=guardRun.game.companions.recruit('owl');assert(guardRun.game.companions.takeDamage(recovering,1e6));assert.equal(recovering.state,'recovering');
guardRun.game.barrier.cooldown=7;guardRun.game.superSkills.cooldowns['swordFlight']=9;
assert(guardRun.save.capture(guardRun.game));const guardReload=start(guardStorage).game;
assert.equal(guardReload.companions.members[0].state,'recovering');assert.equal(guardReload.companions.members[0].recovery,recovering.recovery);
assert.equal(guardReload.barrier.cooldown,7);assert.equal(guardReload.superSkills.cooldowns.swordFlight,9);
assert.doesNotThrow(()=>guardReload.settlements.update(.01));
const restoredSentry=guardReload.enemies.find(enemy=>enemy.id===sentry.id);assert.equal(restoredSentry.hp,sentry.hp);assert.deepEqual(restoredSentry.settlementHome,sentry.settlementHome);
const restoredHouse=guardReload.settlements.sites.find(site=>site.id===occupied.id),remaining=restoredHouse.remainingGuards;
assert.deepEqual(restoredHouse.guardIds,occupied.guardIds);assert.deepEqual([...restoredHouse._remaining],[...occupied._remaining],'surface defenders retain the owning kill ledger Set');
restoredSentry.hp=0;assert(guardReload.settlements.onEnemyKilled(restoredSentry));assert.equal(restoredHouse.remainingGuards,remaining-1);

const runeStorage=memory(),runeSave=new WorldSave({storage:runeStorage}),runeGame=new Game({mode:'world',worldId:'ruins',questStorage:runeSave.questStorage});assert(runeSave.attach(runeGame));
const rune=runeGame.relicSites.sites.find(site=>site.mechanism);assert(rune);rune.state='active';rune.discovered=true;rune.mechanism.state='active';rune.mechanism.remaining=5;rune.mechanism._shot=.27;
assert(runeSave.capture(runeGame));
const runeData=JSON.parse(runeStorage.getItem(WORLD_SAVE_KEY)),savedRune=runeData.regions.ruins.relicSites.find(site=>site.id===rune.id);
assert(!Object.hasOwn(savedRune.mechanism,'x'));Object.assign(savedRune.mechanism,{x:90000,y:-90000,r:900});runeStorage.setItem(WORLD_SAVE_KEY,JSON.stringify(runeData));
const restoredRune=start(runeStorage).game.relicSites.sites.find(site=>site.id===rune.id);
assert.equal(restoredRune.state,'active');assert(restoredRune.discovered);assert.equal(restoredRune.mechanism.remaining,5);assert.equal(restoredRune.mechanism._shot,.27);
assert.deepEqual({x:restoredRune.mechanism.x,y:restoredRune.mechanism.y,r:restoredRune.mechanism.r},{x:rune.mechanism.x,y:rune.mechanism.y,r:rune.mechanism.r},'rune timers survive while current mechanism geometry remains authoritative');

let shopReloads=0;
for(const kind of ['weapons','skills','supplies'])for(const status of ['playing','shop']){
  const shopStorage=memory(),run=start(shopStorage),game=run.game;
  game.gold=1000;game.crystals=0;
  const site=game.settlements.sites.find(site=>site.worldFacility===kind);assert(site);
  game.player.x=site.door.x;game.player.y=site.door.y-groundOffset(game.player,true);
  assert(game.requestInteraction(site.id));for(let i=0;game.sceneTransition.active&&i<30;i++)game.sceneTransition.update(.05);
  assert.equal(game.dungeon.active?.kind,'shop');assert.equal(game.status,'playing');
  const merchant=game.dungeon.active.merchant;game.player.x=merchant.interaction.x;game.player.y=merchant.interaction.y-groundOffset(game.player,true);
  assert(game.interact(merchant.id));assert.equal(game.status,'shop');
  const item=game.getShopItems().find(item=>item.available);assert(item);assert(game.buyShopItem(item.id));
  if(status==='playing')assert(game.closeShop());
  assert.equal(game.status,status);assert.equal(game.dungeon.active?.kind,'shop');
  const expected={gold:game.gold,build:game.build.serialize(),inventory:game.worldShops.serialize()};
  game.dungeon._world.returnPoint={x:90000,y:90000};
  assert(run.save.capture(game,{reason:`shop-${status}`}));assert.equal(run.save.data.location.facilityId,site.id);
  assert(!Object.hasOwn(run.save.data.regions[game.worldId].dungeons,site.id),'static shop rooms never enter the dungeon save ledger');
  assert.equal(run.save.restoreDungeon(game,game.dungeon.active),false,'shop rooms never restore dungeon rewards or geometry');
  const checkpoint=JSON.parse(shopStorage.getItem(WORLD_SAVE_KEY));checkpoint.location.x=-90000;checkpoint.location.y=-90000;shopStorage.setItem(WORLD_SAVE_KEY,JSON.stringify(checkpoint));
  const resumed=start(shopStorage).game,current=resumed.settlements.sites.find(candidate=>candidate.id===site.id);
  assert.equal(resumed.dungeon.active,null);assert.equal(resumed.status,'playing');
  assert.deepEqual({gold:resumed.gold,build:resumed.build.serialize(),inventory:resumed.worldShops.serialize()},expected,`${kind}/${status}: the real purchase survives a fresh game`);
  const foot={x:resumed.player.x,y:resumed.player.y+groundOffset(resumed.player,true)};
  assert(Math.hypot(foot.x-current.door.x,foot.y-current.door.y)>=52&&Math.hypot(foot.x-current.door.x,foot.y-current.door.y)<160,'shop reload uses the current exterior door at a safe contact distance');
  assert(resumed.terrain.isFree(foot.x,foot.y,resumed.player.r+4));
  for(let i=0;i<3;i++)resumed.update(0);
  assert.equal(resumed.dungeon.active,null);assert(!resumed.sceneTransition.active,'resuming outside cannot automatically re-enter the shop');shopReloads++;
}
console.log(`world-save QA passed: current static geometry, guard ledgers, ${shopReloads} real shop purchase reloads, town death spawn, atomic rewards, growth, party, dungeon progress/fog, isolation and failed writes (${dungeonBytes} bytes with one dungeon)`);
