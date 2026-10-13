import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { REGIONS, WORLD_IDS, worldForId, regionFor } from './dist/world-definitions.js';
import { Terrain } from './dist/terrain.js';
import { Island } from './dist/islands.js';
import { Environment } from './dist/environment.js';

// Captured from v0.0.74 before the content-module refactor. This guards saved
// world identities, deterministic scenery, safe routes and water/hazard layout.
const baseline={
  forest:'f4b540e27ca735170cace1e9884b909f51ad5a29ee286aae189a0a349fc3e2a3',
  marsh:'7fe06af17ba4526ad62929363dce40e936ab6c27f8a302c909da0853e1babec8',
  ruins:'92bc2d425f088d1e18e053c0f9cf9685c997e01a9553627ab51f84357dc33fff',
  beach:'30907f8a6533d519ece323d4d7d7463ddecf3c90803ed18dadeefe7786a5b989',
  city:'a150ca21b8334639bee04671c841ca6a455583662c5ce4ef889aa2ebc2e38c2c',
  mountain:'19eb66be8bda50126ebab827b03cb05869712e770db498617369037535b49b4c',
  snow:'0edf907e53083f1bbd8e3102f844d99eec87333ba74cc449bec87b660ecb620c',
  volcano:'4c98851b45256b3fa2d12d4cd118e6101ef4f2416117f2f0d3be80a1b71a4028'
};
assert.equal(new Set(WORLD_IDS).size,REGIONS.length,'world IDs must be unique');
assert.deepEqual(WORLD_IDS.slice(0,8),Object.keys(baseline),'existing world indices are persistent');
assert.equal(worldForId('__unregistered__'),REGIONS[0]);
for(const [index,world] of REGIONS.entries()){
  assert.equal(worldForId(world.id),world);assert.equal(regionFor(index),world);
  assert(Object.isFrozen(world)&&Object.isFrozen(world.environment.water)&&Object.isFrozen(world.art),'configs are shared immutable objects');
  assert.equal(typeof world.terrain.generate,'function',`${world.id}: missing terrain strategy`);
  assert(Number.isFinite(world.terrain.hashOffset)&&Number.isFinite(world.environment.hashOffset));
  for(const chance of [world.environment.water.chance,world.environment.mushroomChance])assert(chance>=0&&chance<=1);
  assert(world.profile.x>0&&world.profile.y>0&&world.art.coast&&world.art.mapCoast);
  if(!baseline[world.id])continue;
  const digest=createHash('sha256');
  for(const seed of [0,7]){
    const island=new Island({region:world.id,seed}),terrain=new Terrain({region:world.id,seed,island});
    const game={region:world,regionIndex:index,terrain,player:{x:0,y:0,r:15},viewWidth:1100,viewHeight:700};
    const env=new Environment(game,{generation:false});game.environment=env;
    digest.update(JSON.stringify({points:island.points,plan:island.plan,routes:island.routes}));
    for(let tx=-4;tx<=4;tx++)for(let ty=-4;ty<=4;ty++){
      digest.update(JSON.stringify(terrain._cell(tx,ty)));
      if((tx+ty)%3===0)digest.update(JSON.stringify([env._mudAt(tx,ty),env._mushroomsAt(tx,ty),env.mechanisms._candidate(tx,ty),env.worldHazards._candidate(tx,ty)]));
    }
  }
  assert.equal(digest.digest('hex'),baseline[world.id],`${world.id}: existing generation changed`);
}
console.log('World configuration: immutable registered strategies, stable identities and eight-world seeded generation match the pre-refactor release.');
