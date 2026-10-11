import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';

const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const layout=g=>g.settlements.sites.map(({id,x,y,door})=>({id,x,y,door}));
const castle=g=>g.settlements.sites.find(site=>site.type==='castle');
const ordinaryLayout=[
  {id:'site:0:merchant',x:31,y:409,door:{x:31,y:439}},
  {id:'site:0:supply',x:-593,y:-143,door:{x:-593,y:-113}},
  {id:'site:0:angel',x:-368,y:-654,door:{x:-368,y:-624}},
  {id:'site:0:occupied',x:-969,y:40,door:{x:-969,y:70}},
  {id:'site:0:castle',x:1069,y:-499,door:{x:1069,y:-469}}
];
// These coordinates were recorded before adding debug placement. The default
// and explicitly disabled modes must preserve ordinary generation exactly.
for(const options of [{},{debug:false},{debug:'true'},{debug:1}]) {
  const g=new Game(options);assert.equal(g.debug,false);assert.deepEqual(layout(g),ordinaryLayout);
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
  assert.equal(g.gold,0);assert.equal(g.player.level,1);assert.equal(g.player.hp,100);assert.equal(g.player.invuln,0,'debug placement does not add invulnerability or resources');
  if(terrainSeed===0)assert.deepEqual(site.door,{x:0,y:-170},'default castle is visible directly above spawn');
}

const g=new Game({debug:true}),site=castle(g),initialLayout=layout(g),worldTerrain=g.terrain;
g.enemies=[];g._spawn=Infinity;g._shot=Infinity;
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

const restarted=new Game({debug:true});assert.deepEqual(layout(restarted),initialLayout);assert.equal(restarted.dungeon.states.size,0,'restart creates a fresh run at the same nearby entrance');
restarted.portal={nextRegionIndex:1};assert(restarted._switchRegion());assert.equal(restarted.regionIndex,1);
assert.equal(restarted.settlements.sites.filter(s=>s.type==='castle').length,1);assert(Math.hypot(castle(restarted).door.x,castle(restarted).door.y)>320,'later regions retain regular castle distance');
const disabled=new Game({debug:true,settlements:false});assert.equal(disabled.settlements.sites.length,0,'debug does not override a deliberately disabled feature');
console.log('Debug entry: unchanged normal layouts, strict flag, 100 safe nearby placements, real walking, normal maze entry/exit/reentry, fresh restart and regular later regions passed.');
