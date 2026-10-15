import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { REGIONS, WORLD_IDS, worldForId, regionFor } from './dist/world-definitions.js';
import { Terrain } from './dist/terrain.js';
import { Island } from './dist/islands.js';
import { Environment } from './dist/environment.js';

// Seeded release fixtures guard registered world identities and the complete
// permanent layout. Intentional layout edits update these fixtures after the
// independent collision/reachability and placement checks have passed.
const baseline={
  forest:'02729a88685875f3fc66abcbe18025231e3a3f8fe9491b83a7541c1540e90770',
  marsh:'f31e0625da438c05e843a95ecb7ef8ab1548a5dfef30e5ed31cb309913e02e59',
  ruins:'6a890b34c07c16301f1a1e41bfb25a2d824ece470e3304eeb3c564b8f72533ec',
  beach:'b6484e2ce39ccbd4318f96633707e60f34ef8b79535650ce948411fb7cf66be1',
  city:'765fea00a703d396a9b7e757de6a1c2910608e236f20deb65c666aee47ab7244',
  mountain:'ccef60c0e34283c8b2d4813f69a796137d82e0d45d71467a747864389e2ae58b',
  snow:'979a1bd95ed43775df7bbddc6cd7934b75bc0d8dd20c8d74ee07b5ac18712ee5',
  volcano:'31c5e7181689dc9b3194ea9c901833c0c693dd2e32fa61065acbc3827fb0091b'
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
    digest.update(JSON.stringify({points:island.points,plan:island.plan,routes:island.routes,layout:island.layout}));
    for(let tx=-4;tx<=4;tx++)for(let ty=-4;ty<=4;ty++){
      digest.update(JSON.stringify(terrain._cell(tx,ty)));
      if((tx+ty)%3===0)digest.update(JSON.stringify([env._mudAt(tx,ty),env._mushroomsAt(tx,ty),env.mechanisms._candidate(tx,ty),env.worldHazards._candidate(tx,ty)]));
    }
  }
  assert.equal(digest.digest('hex'),baseline[world.id],`${world.id}: existing generation changed`);
}
console.log('World configuration: immutable registered strategies, stable identities and eight-world seeded generation match the verified layout fixtures.');
