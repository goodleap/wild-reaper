import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';

const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const layout=g=>g.settlements.sites.map(({id,x,y,door})=>({id,x,y,door}));
const castle=g=>g.settlements.sites.find(site=>site.type==='castle');
const ordinaryLayout=layout(new Game());
const resources=g=>({gold:g.gold,crystals:g.crystals});
const debugGrants=g=>g.events.filter(e=>e.type==='resources'&&e.source==='debugStart');
// The normal world is deterministic and receives no debug placement or budget,
// including when a caller accidentally supplies a truthy non-boolean option.
for(const options of [{},{debug:false},{debug:'true'},{debug:1},{debug:0},{debug:null}]) {
  const g=new Game(options);assert.equal(g.debug,false);assert.deepEqual(layout(g),ordinaryLayout);
  assert.deepEqual(resources(g),{gold:0,crystals:0});assert.equal(debugGrants(g).length,0);
  assert(Math.hypot(castle(g).door.x,castle(g).door.y)>320,'ordinary castle retains exploration distance');
}

for(let terrainSeed=0;terrainSeed<100;terrainSeed++) {
  const g=new Game({debug:true,terrain:new Terrain({seed:terrainSeed})}),site=castle(g),from=feet(g);
  assert.equal(g.debug,true);assert.equal(g.settlements.sites.length,5);
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
  assert.deepEqual(resources(g),{gold:500,crystals:150});
  assert.equal(g.player.level,1);assert.equal(g.player.xp,0);assert.equal(g.player.hp,100);assert.equal(g.player.invuln,0,'the debug budget does not add invulnerability or character levels');
  assert.equal(g.skillLevel,1);assert.equal(g.status,'playing','construction does not open an upgrade before gameplay is ready');
  assert.equal(debugGrants(g).length,1);assert.deepEqual(debugGrants(g)[0],{type:'resources',source:'debugStart',gold:500,crystals:150});
  if(terrainSeed===0)assert.deepEqual(site.door,{x:0,y:-170},'default castle is visible directly above spawn');
}

const g=new Game({debug:true}),site=castle(g),initialLayout=layout(g),worldTerrain=g.terrain;
g.enemies=[];g._spawn=Infinity;g._shot=Infinity;
g.update(0,{});assert.equal(g.status,'upgrade','the regular update offers the first affordable skill choice');
assert.equal(g.chooseUpgrade('not-a-choice'),false);assert.deepEqual(resources(g),{gold:500,crystals:150},'invalid choices never spend the debug budget');
for(const expected of [{crystals:110,skillLevel:2,status:'upgrade'},{crystals:0,skillLevel:3,status:'playing'}]) {
  const choices=g.getUpgradeChoices();assert.equal(choices.length,3);
  assert(g.chooseUpgrade(choices[0].id),'debug skills must be chosen from the ordinary offered choices');
  assert.equal(g.crystals,expected.crystals);assert.equal(g.skillLevel,expected.skillLevel);assert.equal(g.status,expected.status);
}
assert.equal(g.player.level,1);assert.equal(g.player.xp,0);assert.equal(g.gold,500);
g.gold-=73;
const spentResources=resources(g);
// Walk through the real update/input path rather than teleporting to the door.
for(let i=0;i<120&&Math.hypot(site.door.x-feet(g).x,site.door.y-feet(g).y)>5;i++) {
  const from=feet(g),dx=site.door.x-from.x,dy=site.door.y-from.y,length=Math.hypot(dx,dy);
  g.update(Math.min(.025,length/g.player.speed),{x:dx/length,y:dy/length});
}
assert(Math.hypot(site.door.x-feet(g).x,site.door.y-feet(g).y)<6,'player can walk to the debug door');
assert.equal(g.getInteraction()?.type,'castle');assert(g.interact());
const dungeon=g.dungeon.active,maze=JSON.stringify(dungeon.cells),guardIds=g.enemies.map(e=>e.id);
assert(dungeon);assert.equal(dungeon.bossDefeated,false);assert.equal(dungeon.rewardClaimed,false);
assert.equal(g.enemies.filter(e=>e.dungeonBoss).length,1,'debug entrance uses the normal guarded dungeon');
assert.equal(g.getInteraction()?.type,'dungeonExit');assert(g.interact());
assert.equal(g.dungeon.active,null);assert.equal(g.terrain,worldTerrain);assert.deepEqual(layout(g),initialLayout);
assert.equal(g.getInteraction()?.type,'castle');assert(g.interact());
assert.equal(g.dungeon.active,dungeon);assert.equal(JSON.stringify(dungeon.cells),maze);assert.deepEqual(g.enemies.map(e=>e.id),guardIds,'reentry keeps the same finite maze and guards');
assert(g.interact());
assert.deepEqual(resources(g),spentResources,'castle entry, exit and reentry never grant the starting budget again');
assert.equal(debugGrants(g).length,1);

const restarted=new Game({debug:true});assert.deepEqual(layout(restarted),initialLayout);assert.equal(restarted.dungeon.states.size,0,'restart creates a fresh run at the same nearby entrance');
assert.deepEqual(resources(restarted),{gold:500,crystals:150},'a new run receives exactly one fresh budget');
assert.equal(debugGrants(restarted).length,1);
restarted.gold-=91;restarted.crystals-=127;const remaining=resources(restarted);
restarted.settlements.resetRegion();assert.deepEqual(resources(restarted),remaining,'regenerating regional sites does not refill debug resources');
restarted.portal={nextRegionIndex:1};assert(restarted._switchRegion());assert.equal(restarted.regionIndex,1);
assert.equal(restarted.settlements.sites.filter(s=>s.type==='castle').length,1);assert(Math.hypot(castle(restarted).door.x,castle(restarted).door.y)>320,'later regions retain regular castle distance');
assert.deepEqual(resources(restarted),remaining,'changing regions preserves the spent resource balance');
const disabled=new Game({debug:true,settlements:false});assert.equal(disabled.settlements.sites.length,0,'debug does not override a deliberately disabled feature');
assert.deepEqual(resources(disabled),{gold:500,crystals:150},'the starting budget does not depend on settlement generation');
console.log('Debug entry: deterministic normal layouts, strict flag, one-time starting resources, two ordinary skill choices, 100 safe nearby placements, real walking, normal maze entry/exit/reentry, fresh restart and regular later regions passed.');
