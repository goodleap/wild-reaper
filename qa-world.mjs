import assert from 'node:assert/strict';
import { Game, REGIONS } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { DUNGEON_RULES } from './dist/dungeon.js';

let seed=529163;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(){const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:true,encounters:false,environment:false,settlements:true});g.enemies=[];g.gems=[];g.coins=[];g.events=[];g.effects=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;g._updatePressure=()=>{};g.adventure.generation=false;g.companions.generation=false;return g;}
const feet=(g,point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);g._moveEntity(g.player,0,0,true);};
const site=(g,type)=>{const s=g.settlements.sites.find(s=>s.type===type);assert(s,`${type} generated`);return s;};
function near(g,type){const s=site(g,type);feet(g,s.door);return s;}
function advance(g,t){for(let left=t;left>1e-8;left-=.025)g.update(Math.min(.025,left));}
function kill(g,e){feet(g,{x:e.x,y:e.y+groundOffset(e)});g.dungeon.updateEnemy(e,0);g._hurtEnemy(e,e.hp+(e.affix?.shield||0)+100);assert(e.hp<=0,JSON.stringify({id:e.id,hp:e.hp,active:e.guardActive,x:e.x,y:e.y,player:g.player}));}
function clearCamp(g){const camp=g.companions.spawn('warden');assert(camp);for(const e of g.enemies.filter(e=>e.rescueId===camp.id))g._hurtEnemy(e,e.hp+100);feet(g,camp);g.update(0);assert(g.companions.active);return g.companions.active;}

// Small houses retain real, finite collision bounds; the independent merchant
// has no invisible house or stall. All approaches stay clear in every region.
for(const [index,region] of REGIONS.entries()){
 const g=arena();g.regionIndex=index;g.region=region;g.terrain=new Terrain({region:region.id,seed:index});g.settlements.resetRegion();
 const layout=g.settlements.sites.map(s=>[s.id,s.type,s.x,s.y]);assert.equal(layout.length,index===0?5:4);assert.equal(new Set(layout.map(x=>x[1])).size,layout.length,'only the initial region has a spawn angel without an activated portal');
 for(const s of g.settlements.sites){
  assert(g.terrain.isFree(s.door.x,s.door.y,20));assert(!g.settlements.isSafePoint(s.x,s.y,30));
  if(s.type==='supply'||s.type==='occupied'){
   assert(s.width>=50&&s.width<=60&&s.depth>=24&&s.depth<=32,'huts use a compact footprint beside the traveler');
   assert(!g.terrain.isFree(s.x,s.y-s.depth/2,15),'small house foundations still block feet');
   for(const wall of g.terrain.query(s.x-100,s.y-100,s.x+100,s.y+100).filter(o=>o.structureId===s.id)){
    assert([wall.x,wall.y,wall.r,wall.halfLength,...Object.values(wall.bounds)].every(Number.isFinite),'shallow foundations never divide by zero');
    assert(wall.bounds.minX>=s.x-s.width/2-.01&&wall.bounds.maxX<=s.x+s.width/2+.01,'collision width matches the small house');
    assert(wall.bounds.minY>=s.y-s.depth-.01&&wall.bounds.maxY<=s.y+.01,'collision depth matches the small house');
   }
  }else if(s.type==='castle')assert(!g.terrain.isFree(s.x,s.y-s.depth/2,15),'castle foundation stays solid');
  if(s.type==='merchant'){
   assert.deepEqual(s.door,{x:s.x,y:s.y},'independent merchant interaction is located at the NPC feet');
   assert.equal(g.terrain.query(s.x-200,s.y-200,s.x+200,s.y+200).some(o=>o.structureId===s.id),false,'merchant has no house/stall foundation');
   assert(g.terrain.isFree(s.x,s.y,g.player.r),'merchant position remains walkable');
   for(const house of g.settlements.sites.filter(o=>o.type==='supply'||o.type==='occupied'))assert(Math.hypot(s.x-house.x,s.y-house.y)>s.width/2+house.width/2+160,'merchant stands away from houses');
  }
 }
 g.settlements.resetRegion();assert.deepEqual(g.settlements.sites.map(s=>[s.id,s.type,s.x,s.y]),layout,'rebuilding unchanged region does not shuffle sites');
 const oldIds=new Set(g.terrain.query(-2000,-2000,2000,2000).filter(o=>o.structureId).map(o=>o.id));assert(oldIds.size>0);g.terrain.setStructures([]);assert(!g.terrain.query(-2000,-2000,2000,2000).some(o=>oldIds.has(o.id)),'the structures layer can be cleared without stale collisions');
}
const safeDoors=new Game();
for(const type of ['merchant','castle','supply']){const s=site(safeDoors,type);assert.equal(safeDoors.environment._objectiveClear(s.door.x,s.door.y,82),false,'later mushroom generation reserves building approaches');assert.equal(safeDoors.environment.mechanisms._objectiveClear({x:s.door.x,y:s.door.y,r:70}),false,'later regional hazards cannot spawn over an established building door');}
const shopping=arena(),merchant=near(shopping,'merchant');
assert.equal(shopping.getInteraction().id,merchant.id);assert(shopping.interact());assert.equal(shopping.status,'shop');
const stockBefore=structuredClone(merchant.stock);assert.equal(shopping.buyShopItem('heal'),false);assert.deepEqual(merchant.stock,stockBefore);assert.equal(shopping.gold,0,'unaffordable purchases cannot debit gold');
assert.equal(merchant.state,'ready');assert.equal(shopping.status,'shop','failed purchase keeps the merchant and shop open');
shopping.gold=200;assert.equal(shopping.buyShopItem('heal'),false);assert.equal(shopping.gold,200,'a full health potion is rejected without payment');assert.deepEqual(merchant.stock,stockBefore);assert.equal(merchant.state,'ready');
assert.equal(shopping.buyShopItem('unknown'),false);assert.equal(shopping.gold,200);assert.deepEqual(merchant.stock,stockBefore);
shopping.adventure.furyTime=5;shopping.adventure.magnetTime=3;
const shopFrozen={time:shopping.time,clock:shopping._clock,hp:shopping.player.hp,fury:shopping.adventure.furyTime,magnet:shopping.adventure.magnetTime};advance(shopping,3);assert.deepEqual({time:shopping.time,clock:shopping._clock,hp:shopping.player.hp,fury:shopping.adventure.furyTime,magnet:shopping.adventure.magnetTime},shopFrozen,'shopping freezes enemy time and buff decay');
assert(shopping.closeShop());assert.equal(shopping.status,'playing');assert.equal(merchant.state,'ready','closing without a purchase does not consume the merchant');assert.equal(shopping.settlements.activeShop,null);assert.equal(shopping.getInteraction().id,merchant.id);assert(shopping.interact(),'merchant can be reopened after cancellation');
shopping.crystalsNext=40;shopping.addCrystals(40);assert.equal(shopping.status,'shop');assert(shopping.closeShop());assert.equal(shopping.status,'upgrade','banked skill choice waits until shopping is closed');assert(shopping.chooseUpgrade(shopping.getUpgradeChoices()[0].id));assert.equal(shopping.closeShop(),false);assert.equal(shopping.buyShopItem('fury'),false);assert.equal(merchant.state,'ready');
for(const itemId of ['heal','magnet','fury','shield','relic']){
 const buyer=arena(),trader=near(buyer,'merchant');buyer.gold=200;buyer.player.hp=40;assert(buyer.interact());
 const item=buyer.getShopItems().find(i=>i.id===itemId),beforeStock=structuredClone(trader.stock);assert(item.available);
 assert(buyer.buyShopItem(itemId));assert.equal(buyer.gold,200-item.price);assert.equal(trader.stock[itemId],beforeStock[itemId]-1);
 for(const id of Object.keys(beforeStock))if(id!==itemId)assert.equal(trader.stock[id],beforeStock[id],'unselected goods are not sold');
 if(itemId==='heal')assert.equal(buyer.player.hp,75);
 if(itemId==='magnet')assert.equal(buyer.adventure.magnetTime,8);
 if(itemId==='fury')assert.equal(buyer.adventure.furyTime,8);
 if(itemId==='shield')assert.equal(buyer.relics.wardAmount,18);
 if(itemId==='relic')assert(buyer.relics.has(trader.relicId));
 assert.equal(trader.state,'spent','the first successful trade consumes this merchant');assert.equal(buyer.status,'playing');assert.equal(buyer.settlements.activeShop,null);assert.deepEqual(buyer.getShopItems(),[]);
 assert.equal(buyer.getInteraction()?.id===trader.id,false);assert.equal(buyer.interact(trader.id),false);assert.equal(buyer.settlements.interact(trader.id),false);
 assert.equal(buyer.buyShopItem(itemId),false);assert.equal(buyer.settlements.buy(itemId),false);assert.equal(buyer.buyShopItem(itemId==='relic'?'fury':'relic'),false,'a second item cannot be purchased after departure');assert.equal(buyer.gold,200-item.price);
 assert.equal(buyer.events.filter(e=>e.type==='shopBought').length,1);assert.equal(buyer.events.filter(e=>e.type==='merchantDeparted').length,1);
 assert.equal(buyer.settlements.sites.find(s=>s.id===trader.id),trader,'consumed merchant keeps its identity for world persistence');assert.equal(buyer.settlements.isSafePoint(trader.x,trader.y),true,'departed merchant does not reserve an invisible objective area');
}
const pendingBuyer=arena(),pendingTrader=near(pendingBuyer,'merchant');pendingBuyer.gold=100;assert(pendingBuyer.interact());pendingBuyer.crystalsNext=40;pendingBuyer.addCrystals(40);
assert(pendingBuyer.buyShopItem('fury'));assert.equal(pendingBuyer.status,'upgrade','successful trade flushes a banked skill choice after closing the shop');assert.equal(pendingTrader.state,'spent');assert.equal(pendingBuyer.settlements.activeShop,null);assert(pendingBuyer.chooseUpgrade(pendingBuyer.getUpgradeChoices()[0].id));assert.equal(pendingBuyer.status,'playing');assert.equal(pendingBuyer.getInteraction()?.id===pendingTrader.id,false);
const revisit=arena(),departed=near(revisit,'merchant');revisit.gold=100;assert(revisit.interact());assert(revisit.buyShopItem('shield'));const remainingGold=revisit.gold,departedStock=structuredClone(departed.stock);
near(revisit,'castle');assert(revisit.interact());assert(revisit.dungeon.active);assert(revisit.interact());assert.equal(revisit.dungeon.active,null);feet(revisit,departed.door);
assert.equal(revisit.settlements.sites.find(s=>s.id===departed.id),departed);assert.equal(departed.state,'spent');assert.deepEqual(departed.stock,departedStock);assert.equal(revisit.gold,remainingGold);assert.equal(revisit.getInteraction()?.id===departed.id,false,'castle round trip never respawns a departed merchant');assert.equal(revisit.interact(departed.id),false);
const angel=arena(),shrine=near(angel,'angel');angel.player.hp=31;assert.equal(angel.settlements.interact(shrine.id),false);angel.settlements.update(2);assert.equal(angel.player.hp,37);assert.equal(shrine.state,'ready','the persistent guardian is not consumed by healing');
feet(angel,{x:shrine.x+116,y:shrine.y});angel.settlements.update(2);assert.equal(angel.player.hp,37,'leaving the haven stops its continuous recovery');
feet(angel,shrine.door);angel.player.hp=99;angel.settlements.update(2);assert.equal(angel.player.hp,100);assert.equal(angel.relics.wardAmount,0,'full health is capped without creating the removed blessing shield');
const huts=arena(),supply=near(huts,'supply');assert(huts.interact());assert.equal(huts.gold,4);assert.equal(huts.crystals,12);assert.equal(huts.interact(supply.id),false);
const occupied=near(huts,'occupied');assert(huts.interact());assert.equal(occupied.state,'active');assert.equal(occupied.remainingGuards,4);assert.equal(huts.getInteraction().enabled,false);
const guards=huts.enemies.filter(e=>e.settlementId===occupied.id);assert.equal(guards.length,4);for(const e of guards){assert(huts.terrain.isFree(e.x,e.y+groundOffset(e),e.r));huts._hurtEnemy(e,e.hp+100);}
assert.equal(occupied.state,'cleared');assert.equal(huts.gold,4,'killing guards does not remotely claim the house');feet(huts,occupied.door);assert(huts.interact());assert.equal(huts.gold,28);assert.equal(huts.crystals,52);assert.equal(occupied.state,'spent');assert.equal(huts.interact(occupied.id),false);huts.settlements.onEnemyKilled(guards[0]);assert.equal(huts.gold,28);

const journey=arena();const ally=clearCamp(journey);journey.time=119.9;journey._clock=119.9;journey.runTime=119.9;journey.nextBossAt=120;ally.remaining=20;ally._attack=3;journey.adventure.furyTime=5;journey.adventure.magnetTime=1;
const worldBoss=journey._spawnEnemy('boss');worldBoss.x=200;worldBoss.y=0;journey._hurtEnemy(worldBoss,worldBoss.hp+100);journey.enemies=journey.enemies.filter(e=>e.hp>0);
const worldPortal=journey.portal;assert(worldPortal&&journey.superSkills.pending);assert(journey.regions.flushReward());assert.equal(journey.status,'super');const regionalSkill=journey.getSuperChoices()[0].id;assert(journey.chooseSuper(regionalSkill));journey.superSkills.cooldowns[regionalSkill]=Infinity;const worldPending=null;assert.equal(journey.superSkills.pending,worldPending);assert.equal(journey.regionIndex,0,'the regional reward is claimed before travelling');assert.equal(worldPortal.rewardClaimed,true);
const castle=near(journey,'castle'),world={terrain:journey.terrain,adventure:journey.adventure,environment:journey.environment,encounters:journey.encounters,enemies:journey.enemies,gems:journey.gems,coins:journey.coins,time:journey.time,clock:journey._clock,runTime:journey.runTime,bossKills:journey.bossKills,bossCount:journey.bossCount,nextBossAt:journey.nextBossAt};
for(const state of ['paused','upgrade','shop','super','dead']){journey.status=state;assert.equal(journey.dungeon.enter(castle),false);}journey.status='playing';
assert(journey.interact());const dungeon=journey.dungeon.active;assert(dungeon);assert.equal(journey.portal,null);assert.equal(journey.superSkills.pending,null);assert.equal(journey.environment,null);assert.equal(journey.encounters,null);assert.equal(journey.getInteraction().type,'dungeonExit');
assert.equal(dungeon.cells.length,25);assert.equal(dungeon.cells.reduce((n,c)=>n+c.open.length,0),48,'the perfect maze has exactly 24 undirected links');
const directions=[[0,-1],[1,0],[0,1],[-1,0]],visited=new Set([dungeon.entranceId]),queue=[dungeon.cells[dungeon.entranceId]];
for(let i=0;i<queue.length;i++)for(const dir of queue[i].open){const [dx,dy]=directions[dir],neighbor=dungeon.cells[(queue[i].row+dy)*dungeon.cols+queue[i].col+dx];assert(neighbor);assert(neighbor.open.includes((dir+2)%4));assert(!journey.terrain.firstBlocker(queue[i].x,queue[i].y,neighbor.x,neighbor.y,49),'open corridors fit a Boss-sized body');if(!visited.has(neighbor.id)){visited.add(neighbor.id);queue.push(neighbor);}}
assert.equal(visited.size,25);assert(dungeon.distances.get(dungeon.bossRoom.id)>=6&&dungeon.distances.get(dungeon.bossRoom.id)<=10,'the final Boss has a compact traversable main route');
const mazeSignature=JSON.stringify(dungeon.cells),initialEnemies=journey.enemies.map(e=>e.id);assert(initialEnemies.length>25&&initialEnemies.length<80);assert.equal(journey.enemies.filter(e=>e.dungeonBoss).length,1);
advance(journey,3);assert.equal(journey.time,world.time,'overworld difficulty time stops inside');assert(Math.abs(journey.runTime-world.runTime-3)<1e-8);assert(Math.abs(journey._clock-world.clock-3)<1e-8);assert.equal(journey.nextBossAt,world.nextBossAt);assert.equal(journey.bossCount,world.bossCount);assert.deepEqual(journey.enemies.map(e=>e.id),initialEnemies,'finite dungeon cannot generate overworld mobs or due Bosses');
assert(Math.abs(journey.adventure.furyTime-2)<1e-8);assert.equal(journey.adventure.magnetTime,0);assert(Math.abs(ally.remaining-17)<1e-8,'companion service and combat buffs elapse inside');
assert(journey.dungeon.getMap().cells.some(c=>c.revealed));assert(journey.dungeon.getMap().cells.some(c=>!c.revealed));
const guard=journey.enemies.find(e=>!e.dungeonBoss);feet(journey,{x:guard.x,y:guard.y+groundOffset(guard)});journey.dungeon.updateEnemy(guard,0);
if(guard.affix)guard.affix.shield=0;
journey._hitEnemy(guard,1,0,journey.player,'orbit');journey._hitEnemy(guard,1,0,journey.player,'lightning');assert(guard.bleed&&guard.shock);
const occluded=dungeon.cells.find(c=>journey.terrain.firstBlocker(c.x,c.y,guard.x,guard.y+groundOffset(guard),0));assert(occluded);feet(journey,occluded);journey.dungeon.updateEnemy(guard,0);
const marks=structuredClone({hp:guard.hp,bleed:guard.bleed,shock:guard.shock});journey._hitEnemy(guard,1,0,journey.player,'pulse');journey._hitEnemy(guard,1,0,journey.player,'arrow');
assert.deepEqual({hp:guard.hp,bleed:guard.bleed,shock:guard.shock},marks,'a blocked castle hit cannot damage, consume bleeding or conduct shock through a wall');
kill(journey,guard);const deadId=guard.id;journey.update(0);const remaining=journey.enemies.length;
feet(journey,dungeon.entrance);assert(journey.interact());assert.equal(journey.dungeon.active,null);for(const key of ['terrain','adventure','environment','encounters','enemies','gems','coins'])assert.equal(journey[key],world[key],`return restores original ${key} identity`);
assert.equal(journey.portal,worldPortal);assert.equal(journey.superSkills.pending,worldPending);assert(Math.abs(journey.adventure.furyTime-2)<1e-8);assert.equal(journey.adventure.magnetTime,0,'expired buff is not refunded on returning');assert.equal(journey.companions.active,ally);assert(journey.player.invuln>=2);assert(journey.terrain.isFree(journey.player.x,journey.player.y+groundOffset(journey.player,true),journey.player.r));
feet(journey,castle.door);assert(journey.interact());assert.equal(journey.dungeon.active,dungeon);assert.equal(JSON.stringify(dungeon.cells),mazeSignature);assert.equal(journey.enemies.length,remaining);assert(!journey.enemies.some(e=>e.id===deadId),'retreat and reentry cannot respawn a defeated guard');
const chest=dungeon.chests[0];feet(journey,chest);const initialChestInteraction=journey.getInteraction();assert.equal(initialChestInteraction?.type,'dungeonChest');
for(const e of journey.enemies.filter(e=>e.dungeonRoom===chest.cellId))kill(journey,e);feet(journey,chest);const beforeSide={gold:journey.gold,crystals:journey.crystals};assert(journey.interact());assert.equal(journey.gold,beforeSide.gold+12);assert.equal(journey.crystals,beforeSide.crystals+24);assert.equal(journey.interact(chest.id),false);
const castleBoss=journey.enemies.find(e=>e.dungeonBoss);const beforeBoss={gold:journey.gold,crystals:journey.crystals,xp:journey.player.xp};kill(journey,castleBoss);assert.equal(dungeon.treasure.state,'unlocked');assert.equal(journey.gold,beforeBoss.gold);assert.equal(journey.crystals,beforeBoss.crystals,'defeating Boss unlocks the treasury instead of granting it remotely');assert.equal(journey.player.xp,beforeBoss.xp+castleBoss.xp);assert.equal(journey.bossKills,world.bossKills);assert.equal(journey.bossCount,world.bossCount);assert.equal(journey.portal,null);
feet(journey,dungeon.treasure);assert(journey.interact());assert.equal(journey.status,'super');assert(journey.getSuperChoices().every(c=>c.source==='castle'));assert.equal(journey.dungeon.exit(),false,'cannot leave a pending treasure choice');assert.equal(journey.chooseSuper('thorns'),false,'castle treasure cannot award the regional pool');assert(journey.chooseSuper('meteor'));assert.equal(journey.superSkills.owned.meteor,1);assert.equal(journey.gold,beforeBoss.gold+DUNGEON_RULES.bossGold);assert.equal(journey.crystals,beforeBoss.crystals+DUNGEON_RULES.bossCrystals);assert.equal(dungeon.rewardClaimed,true);assert.equal(journey.dungeon.completeReward(),false);assert.equal(journey.chooseSuper('meteor'),false);
assert(journey.interact());assert.equal(journey.dungeon.active,null);assert.equal(journey.superSkills.pending,worldPending);assert.equal(journey.superSkills.owned.meteor,1);feet(journey,castle.door);assert(journey.interact());assert.equal(journey.dungeon.active,dungeon);assert.equal(dungeon.rewardClaimed,true);assert(!journey.enemies.some(e=>e.dungeonBoss&&e.hp>0));const claimedGold=journey.gold;feet(journey,dungeon.treasure);assert.equal(journey.getInteraction().type,'dungeonExit');assert(journey.interact());assert.equal(journey.gold,claimedGold,'a claimed castle cannot farm its treasure');
const originalSettlements=journey.settlements,originalDungeonStates=journey.dungeon.states,originalAngels=journey.settlements.sites.filter(s=>s.type==='angel');
feet(journey,worldPortal);assert(journey.enterPortal());assert.equal(journey.status,'playing');assert.equal(journey.superSkills.pending,null);assert.equal(journey.region.id,'marsh');assert.equal(journey.dungeon.states.size,0,'an unvisited region begins without castle exploration');assert.equal(journey.regions.states.get(0).dungeonStates,originalDungeonStates,'the previous castle remains in its region snapshot');assert.equal(journey.superSkills.owned.meteor,1);assert.equal(journey.settlements.sites.filter(s=>s.type==='angel').length,1,'only the active return gate gains an angel');
const returnGate=journey.regions.portals.find(p=>p.direction==='back');assert(returnGate);feet(journey,returnGate);assert(journey.enterPortal(returnGate.id));assert.equal(journey.region.id,'forest');assert.equal(journey.settlements,originalSettlements);assert.equal(journey.dungeon.states,originalDungeonStates);assert.deepEqual(journey.settlements.sites.filter(s=>s.type==='angel'),originalAngels,'round trips preserve each stationed angel exactly once');feet(journey,castle.door);assert(journey.interact());assert.equal(journey.dungeon.active,dungeon);assert.equal(dungeon.rewardClaimed,true,'a returned castle retains its claimed treasury');feet(journey,dungeon.entrance);assert(journey.interact());

const campRun=arena(),camp=campRun.companions.spawn('stormcaller');assert(camp);const campLife=camp.life,campEnemies=campRun.enemies;const campCastle=near(campRun,'castle');assert(campRun.interact());assert.equal(campRun.companions.camp,null);advance(campRun,2);feet(campRun,campRun.dungeon.active.entrance);assert(campRun.interact());assert.equal(campRun.companions.camp,camp);assert.equal(camp.life,campLife,'unrescued overworld camp timeout is suspended inside');assert.equal(campRun.enemies,campEnemies);
const boundedRun=arena();near(boundedRun,'castle');assert(boundedRun.interact());const limits=boundedRun.dungeon.active.bounds;boundedRun.player.x=limits.maxX+1000;boundedRun.player.y=limits.minY-1000;boundedRun.update(.025);assert(boundedRun.player.x<limits.maxX&&boundedRun.player.y>limits.minY,'independent finite bounds recover oversized displacements');boundedRun.status='dead';assert.equal(boundedRun.dungeon.exit(),false);assert.equal(boundedRun.interact(),false,'death cannot claim or leave to bypass the result');
console.log('World content: compact solid huts, independent merchants, one successful trade and departure, rejected/cancelled trade preservation, pending upgrades, persistent angel auras, distinct hut rewards, finite connected castle, guarded chests, frozen overworld, preserved buffs/allies, retreat continuity, immediate regional rewards, return-portal world persistence and exclusive once-only Boss treasures passed.');
