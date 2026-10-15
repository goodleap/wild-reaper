import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { worldNeighbors } from './dist/world-definitions.js';

const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const layout=g=>g.settlements.sites.map(({id,x,y,door})=>({id,x,y,door}));
const castle=g=>g.settlements.sites.find(site=>site.type==='castle');
const ordinaryGame=new Game(),ordinaryLayout=layout(ordinaryGame);
const resources=g=>({gold:g.gold,crystals:g.crystals});
const debugGrants=g=>g.events.filter(e=>e.type==='resources'&&e.source==='debugStart');
function settleTransition(game) {
  for(let i=0;i<24&&game.sceneTransition?.active;i++)game.update(.025,{});
  assert(!game.sceneTransition?.active,'scene fade finishes without advancing the live world');
}
// The normal world is deterministic and receives no debug placement or budget,
// including when a caller accidentally supplies a truthy non-boolean option.
for(const options of [{},{debug:false},{debug:'true'},{debug:1},{debug:0},{debug:null}]) {
  const g=new Game(options);assert.equal(g.debug,false);assert.deepEqual(layout(g),ordinaryLayout);
  assert.deepEqual(resources(g),{gold:0,crystals:0});assert.equal(debugGrants(g).length,0);
  assert.equal(g.player.speed,320,'ordinary and non-boolean debug options retain the normal movement speed');
  assert.equal(g.enemies.filter(e=>e.debugWave).length,0,'normal runs never get the testing ring');
  assert(Math.hypot(castle(g).door.x,castle(g).door.y)>320,'ordinary castle retains exploration distance');
}

const defaultDebug=new Game({debug:true});
assert.equal(defaultDebug.enemies.some(enemy=>enemy.debugWave),false,'the removed initial wave stays absent');
const regularFacilities=new Game({debug:true,debugOptions:{testFacilities:false}});
assert.deepEqual(layout(regularFacilities),ordinaryLayout,'disabled facilities preserve ordinary generation order and locations');
assert(!regularFacilities.enemies.some(enemy=>enemy.trainingDummy||enemy.debugBoss));
assert.equal(regularFacilities.gold,500,'facilities do not control the gold option');

for(let terrainSeed=0;terrainSeed<100;terrainSeed++) {
  const g=new Game({debug:true,debugOptions:{enemyWave:true},terrain:new Terrain({seed:terrainSeed})}),site=castle(g),from=feet(g);
  assert.equal(g.debug,true);assert.equal(g.settlements.sites.length,5);
  assert.equal(Object.hasOwn(g.debugOptions,'enemyWave'),false,'obsolete options are discarded even when explicitly true');
  assert.equal(g.enemies.some(enemy=>enemy.debugWave),false,'the removed opening cohort never returns');
  assert.deepEqual(g.regions.portals.map(portal=>portal.nextRegionIndex).sort((a,b)=>a-b),worldNeighbors(g.regionIndex),'debug retains every configured world gateway exactly once');
  assert.equal(new Set(g.regions.portals.map(portal=>portal.id)).size,g.regions.portals.length,'configured gateways have distinct identities');
  assert.equal(g.enemies.filter(enemy=>enemy.type==='boss'&&!enemy.debugBoss).length,g.regions.portals.filter(portal=>portal.state==='locked').length,'each locked portal retains its ordinary guardian');
  for(const portal of g.regions.portals) {
    assert.equal(portal.state,'locked','debug does not unlock ordinary world connections');
    const guardians=g.enemies.filter(enemy=>enemy.type==='boss'&&!enemy.debugBoss&&enemy.portalId===portal.id&&enemy.hp>0);
    assert.equal(guardians.length,1,'each gateway owns exactly one living ordinary guardian');
    assert.equal(guardians[0].id,portal.bossId,'the gateway refers to its own guardian');
  }
  assert.equal(g.settlements.sites.filter(s=>s.type==='castle').length,1,'debug relocates the existing castle instead of duplicating it');
  const distance=Math.hypot(site.door.x-from.x,site.door.y-from.y);
  assert(distance>=180&&distance<=320,`seed ${terrainSeed}: nearby door distance ${distance}`);
  assert.equal(g.terrain.firstBlocker(from.x,from.y,site.door.x,site.door.y,g.player.r),null,'the actual foundations and ground leave a direct walking route');
  assert(g.terrain.isFree(from.x,from.y,g.player.r),'spawn remains clear');
  assert(!g.terrain.isFree(site.x,site.y-site.depth/2,g.player.r),'castle keeps its solid foundation');
  for(let i=0;i<=20;i++) {
    const x=from.x+(site.door.x-from.x)*i/20,y=from.y+(site.door.y-from.y)*i/20;
    assert(g.settlements._hazardFree(x,y,g.player.r),'subsequent environment generation preserves the entrance path');
  }
  assert.deepEqual(resources(g),{gold:500,crystals:0});assert.equal(g.player.speed,960);
  assert.equal(g.player.level,1);assert.equal(g.player.xp,0);
  assert.deepEqual({hp:g.player.hp,maxHp:g.player.maxHp},{hp:ordinaryGame.player.hp,maxHp:ordinaryGame.player.maxHp},'debug retains the selected hero\'s ordinary starting health');
  assert.equal(g.player.hp,g.player.maxHp,'the selected hero starts at full health');
  assert.equal(g.player.invuln,0,'the debug budget does not add invulnerability or character levels');
  assert.equal(g.skillLevel,1);assert.equal(g.status,'playing','construction does not open an upgrade before gameplay is ready');
  assert.equal(debugGrants(g).length,1);assert.deepEqual(debugGrants(g)[0],{type:'resources',source:'debugStart',gold:500,crystals:0});
  if(terrainSeed===0)assert.deepEqual(site.door,{x:0,y:-170},'default castle is visible directly above spawn');
}

const g=new Game({debug:true,debugOptions:{enemyWave:true}}),site=castle(g),initialLayout=layout(g),worldTerrain=g.terrain;
g.enemies=[];g._spawn=Infinity;g._shot=Infinity;
g.update(.016,{});assert.equal(g.status,'playing','the first real update has no opening skill choice');assert.equal(g.skillLevel,1);assert.equal(g.crystals,0);
assert.equal(g.chooseUpgrade('not-a-choice'),false);assert.deepEqual(resources(g),{gold:500,crystals:0},'invalid choices never spend the debug budget');
g.addCrystals(g.crystalsNext-1);g.update(.016,{});assert.equal(g.status,'playing','ordinary crystal costs still gate debug upgrades');
g.addCrystals(1);g.update(.016,{});assert.equal(g.status,'upgrade','earning enough crystals still offers the ordinary skill choice');
const choices=g.getUpgradeChoices();assert.equal(choices.length,3);
assert(g.chooseUpgrade(choices.find(choice=>choice.id!=='speed').id),'debug skills still use the ordinary offered choices');
assert.equal(g.crystals,0);assert.equal(g.skillLevel,2);assert.equal(g.status,'playing','one earned upgrade does not produce a second opening choice');
assert.equal(g.player.level,1);assert.equal(g.player.xp,0);assert.equal(g.gold,500);
const upgradedSpeed=g.player.speed;assert.equal(upgradedSpeed,960,'a normal skill choice keeps debug movement intact');
g.gold-=73;
const spentResources=resources(g);
// Walk through the real update/input path. Touching the door must enter without
// a second button press, and the scene change must stop this world-space route.
for(let i=0;i<120&&!g.dungeon.active;i++) {
  const from=feet(g),dx=site.door.x-from.x,dy=site.door.y-from.y,length=Math.hypot(dx,dy);
  g.update(Math.min(.025,length/g.player.speed),length?{x:dx/length,y:dy/length}:{});
}
settleTransition(g);
const dungeon=g.dungeon.active;assert(dungeon,'walking to the debug castle door automatically enters the normal dungeon');
assert.equal(g.player.speed,upgradedSpeed,'entering the castle keeps debug movement');
const maze=JSON.stringify(dungeon.cells),guardIds=g.enemies.map(e=>e.id);
assert.equal(dungeon.bossDefeated,false);assert.equal(dungeon.rewardClaimed,false);
assert.equal(g.enemies.filter(e=>e.dungeonBoss).length,1,'debug entrance uses the normal guarded dungeon');
assert.equal(g.getInteraction()?.type,'dungeonExit');g.update(0);g.update(0);
assert.equal(g.dungeon.active,dungeon,'standing at the arrival doorway does not instantly leave');
// Step into the entrance room beyond the contact latch, then return to the exit.
function walkTo(point,done){
  for(let i=0;i<160&&!done();i++){
    const from=feet(g),dx=point.x-from.x,dy=point.y-from.y,length=Math.hypot(dx,dy);
    g.update(Math.min(.025,length/g.player.speed),length?{x:dx/length,y:dy/length}:{});
  }
  assert(done(),'the short clear doorway approach remains walkable');
  settleTransition(g);
}
const inside={x:dungeon.entrance.x,y:dungeon.entrance.y-75};
walkTo(inside,()=>Math.hypot(feet(g).x-inside.x,feet(g).y-inside.y)<3);
walkTo(dungeon.entrance,()=>!g.dungeon.active);
assert.equal(g.dungeon.active,null);assert.equal(g.terrain,worldTerrain);assert.deepEqual(layout(g),initialLayout);
assert.equal(g.enemies.filter(enemy=>enemy.debugWave).length,0,'leaving the castle does not refill a removed testing cohort');
g.update(0);g.update(0);assert.equal(g.dungeon.active,null,'returning to the world does not immediately reenter the castle');
const outside={x:site.door.x,y:site.door.y+75};
walkTo(outside,()=>Math.hypot(feet(g).x-outside.x,feet(g).y-outside.y)<3);
walkTo(site.door,()=>!!g.dungeon.active);
assert.equal(g.dungeon.active,dungeon);assert.equal(JSON.stringify(dungeon.cells),maze);assert.deepEqual(g.enemies.map(e=>e.id),guardIds,'touch reentry keeps the same finite maze and guards');
g.update(0);assert.equal(g.dungeon.active,dungeon);
walkTo(inside,()=>Math.hypot(feet(g).x-inside.x,feet(g).y-inside.y)<3);
walkTo(dungeon.entrance,()=>!g.dungeon.active);
assert.deepEqual(resources(g),spentResources,'castle entry, exit and reentry never grant the starting budget again');
assert.equal(g.player.speed,upgradedSpeed,'castle exit and reentry preserve the speed multiplier');
assert.equal(debugGrants(g).length,1);

const restarted=new Game({debug:true,debugOptions:{enemyWave:true}});assert.deepEqual(layout(restarted),initialLayout);assert.equal(restarted.dungeon.states.size,0,'restart creates a fresh run at the same nearby entrance');
assert.equal(restarted.enemies.some(enemy=>enemy.debugWave),false,'a fresh run cannot restore a removed cohort');
assert.deepEqual(resources(restarted),{gold:500,crystals:0},'a new run receives gold without pre-earned crystals');
assert.equal(restarted.player.speed,960,'a new run restores the initial debug speed');
assert.equal(debugGrants(restarted).length,1);
restarted.gold-=91;restarted.addCrystals(23);const remaining=resources(restarted);
const restartedRingIds=restarted.enemies.filter(enemy=>enemy.debugWave).map(enemy=>enemy.id);
restarted.settlements.resetRegion();assert.deepEqual(resources(restarted),remaining,'regenerating regional sites does not refill debug resources');
assert.deepEqual(restarted.enemies.filter(enemy=>enemy.debugWave).map(enemy=>enemy.id),restartedRingIds,'regenerating sites never duplicates the testing wave');
restarted.portal={nextRegionIndex:1};assert(restarted._switchRegion());assert.equal(restarted.regionIndex,1);
assert.equal(restarted.enemies.filter(enemy=>enemy.debugWave).length,0,'later regions use normal populations');
assert.equal(restarted.settlements.sites.filter(s=>s.type==='castle').length,1);assert(Math.hypot(castle(restarted).door.x,castle(restarted).door.y)>320,'later regions retain regular castle distance');
assert.deepEqual(resources(restarted),remaining,'changing regions preserves the spent resource balance');
assert.equal(restarted.player.speed,960,'changing worlds retains debug speed');
const disabled=new Game({debug:true,settlements:false});assert.equal(disabled.settlements.sites.length,0,'debug does not override a deliberately disabled feature');
assert.deepEqual(resources(disabled),{gold:500,crystals:0},'the starting budget does not depend on settlement generation');

// Compare actual updates on clear ground, including normalized diagonal input
// and a speed upgrade. Refreshing stats must apply the debug factor only once.
const movementGame=(debug,obstacles=[])=>{
  const game=new Game({debug,adventure:false,terrain:new Terrain({obstacles})});
  game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;
  return game;
};
const normalMove=movementGame(false),debugMove=movementGame(true);
for(const speedLevel of [0,2]){
  for(const game of [normalMove,debugMove]){game.levels.speed=speedLevel;game._refreshStats();const speed=game.player.speed;game._refreshStats();assert.equal(game.player.speed,speed,'repeated stat refresh never compounds the multiplier');}
  assert(Math.abs(debugMove.player.speed-normalMove.player.speed*3)<1e-9);
  for(const input of [{x:1,y:0},{x:1,y:1}]){
    const distances=[];
    for(const game of [normalMove,debugMove]){
      const start={x:game.player.x,y:game.player.y};game.update(.04,input);
      const distance=Math.hypot(game.player.x-start.x,game.player.y-start.y);distances.push(distance);
      assert(Math.abs(distance-game.player.speed*.04)<1e-9,'diagonal input travels the same distance as an axial step');
    }
    assert(Math.abs(distances[1]-distances[0]*3)<1e-9,'debug movement covers three times the ordinary distance');
  }
}
// At 960 units/s the allowed 50 ms update could cross this entire thin wall
// with an endpoint-only collision check. The real swept movement must stop it.
const thinWall={type:'log',id:'thin-debug-wall',x:16.2,y:19.8,r:.5,halfLength:100,angle:Math.PI/2};
const blocked=movementGame(true,[thinWall]);
assert.equal(blocked.player.x,0);assert(blocked.terrain.isFree(feet(blocked).x,feet(blocked).y,blocked.player.r));
for(let i=0;i<12;i++)blocked.update(.05,{x:1,y:0});
assert(blocked.player.x<=thinWall.x-thinWall.r-blocked.player.r,'fast movement never crosses a thin wall');
assert(blocked.terrain.isFree(feet(blocked).x,feet(blocked).y,blocked.player.r),'the stopped player remains outside the wall');
console.log('Debug entry: strict flag, gold-only budget, earned crystal upgrades, triple movement with normalized diagonals and thin-wall collision, removed opening wave and stale preferences across 100 terrains, clear castle approach, persistent maze entry/exit/reentry, fresh restart and regular later regions passed.');
