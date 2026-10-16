import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { REGIONS, WORLD_IDS, worldForId, regionFor } from './dist/world-definitions.js';
import { Terrain } from './dist/terrain.js';
import { Island } from './dist/islands.js';
import { Environment } from './dist/environment.js';

// Procedural fingerprints remain the original release fixtures. The forest
// switched to baked geometry before v0.0.102; its old procedural fingerprint
// was already stale in that release. Pin the complete canonical v0.0.102
// authored data instead, alongside independent body/navigation checks.
const baseline={
  marsh:'f31e0625da438c05e843a95ecb7ef8ab1548a5dfef30e5ed31cb309913e02e59',
  ruins:'6a890b34c07c16301f1a1e41bfb25a2d824ece470e3304eeb3c564b8f72533ec',
  beach:'b6484e2ce39ccbd4318f96633707e60f34ef8b79535650ce948411fb7cf66be1',
  city:'765fea00a703d396a9b7e757de6a1c2910608e236f20deb65c666aee47ab7244',
  mountain:'ccef60c0e34283c8b2d4813f69a796137d82e0d45d71467a747864389e2ae58b',
  snow:'979a1bd95ed43775df7bbddc6cd7934b75bc0d8dd20c8d74ee07b5ac18712ee5',
  volcano:'31c5e7181689dc9b3194ea9c901833c0c693dd2e32fa61065acbc3827fb0091b'
};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const forest=worldForId('forest').authored;
assert.equal(fingerprint(forest),'8ea13ab1b15b2e5e625794cb63cd16cec37482658a188aa3c1df710c9d439e80','the complete v0.0.102 forest geometry, routes and content remain unchanged');
assert.equal(new Set(WORLD_IDS).size,REGIONS.length,'world IDs must be unique');
assert.deepEqual(WORLD_IDS,['forest',...Object.keys(baseline),'verdant-rift','clockshadow-city','ember-realm-large'],'all ten existing world indices are persistent and the region sample is appended');
assert.equal(worldForId('__unregistered__'),REGIONS[0]);
for(const [index,world] of REGIONS.entries()){
  assert.equal(worldForId(world.id),world);assert.equal(regionFor(index),world);
  assert(Object.isFrozen(world)&&Object.isFrozen(world.environment.water)&&Object.isFrozen(world.art),'configs are shared immutable objects');
  assert.equal(typeof world.terrain.generate,'function',`${world.id}: missing terrain strategy`);
  assert(Number.isFinite(world.terrain.hashOffset)&&Number.isFinite(world.environment.hashOffset));
  for(const chance of [world.environment.water.chance,world.environment.mushroomChance])assert(chance>=0&&chance<=1);
  assert(world.profile.x>0&&world.profile.y>0&&world.art.coast&&world.art.mapCoast);
  if(world.authored){
    const island=new Island({region:world.id,seed:index}),again=new Island({region:world.id,seed:7}),terrain=new Terrain({region:world.id,seed:index,island});
    assert.equal(island.layout,again.layout,'fixed maps never reroll their outlines or content');
    const {routes,clearings,obstacles,...source}=island.layout;
    assert.deepEqual(source,world.authored,'the runtime reads exactly this world\'s baked source');
    assert.equal(routes.length,world.authored.passages.reduce((sum,passage)=>sum+passage.waypoints.length-1,0));
    assert.equal(obstacles.length,0,'decorative scenery does not rewrite the authored geometry');
    assert(clearings.length>=world.authored.encounters.length);
    assert(terrain.isFree(island.layout.spawn.x,island.layout.spawn.y,24),'the authored spawn fits the player and ground followers');
    for(const area of island.layout.areas)assert(terrain.isFree(area.center.x,area.center.y,24),`${world.id}/${area.id}: the authored navigation anchor remains usable`);
    continue;
  }
  if(!baseline[world.id])continue;
  const digest=createHash('sha256');
  for(const seed of [0,7]){
    const island=new Island({region:world.id,seed}),terrain=new Terrain({region:world.id,seed,island});
    const game={region:world,regionIndex:index,terrain,player:{x:0,y:0,r:15},viewWidth:1100,viewHeight:700};
    const env=new Environment(game,{generation:false});game.environment=env;
    digest.update(JSON.stringify({points:island.points,plan:island.plan,routes:island.routes,layout:island.layout}));
    for(let tx=-4;tx<=4;tx++)for(let ty=-4;ty<=4;ty++){
      digest.update(JSON.stringify(terrain._cell(tx,ty)));
      if((tx+ty)%3===0)digest.update(JSON.stringify([env._mudAt(tx,ty),env._mushroomsAt(tx,ty),env.mechanisms._candidate(tx,ty),env.worldHazards._candidate(tx,ty)]));
    }
  }
  assert.equal(digest.digest('hex'),baseline[world.id],`${world.id}: existing generation changed`);
}
console.log('World configuration: 11 immutable world identities, exact v0.0.102 forest source, separate authored caches, usable body anchors and all 7 original procedural generation hashes passed.');
