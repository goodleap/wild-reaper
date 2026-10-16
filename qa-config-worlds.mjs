import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { REGIONS,WORLD_IDS,WORLD_CONNECTIONS,worldForId } from './dist/world-definitions.js';
import { STAGES } from './dist/stage-definitions.js';
import { validateWorlds } from './dist/config-validation/worlds.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { Environment } from './dist/environment.js';

// Fixed fingerprints preserve authored content and deterministic terrain.
// New macro layouts are checked through schema and navigation tests below;
// the existing enemy values and standalone terrain recipes retain their hash.
const expected={
  "exports": {
    "environment": "5a2e7540eee34a6d3ef9ea0b5029222765e9f6bd5b0b869552f15993a5f164c3",
    "world-definitions": "6b1ab206e047d336c42195f544a6c01e51f8926daeea2c6e71020de5fe2ae19e",
    "stage-definitions": "db9a79f08bbbb15d4659f34dae6c9aa87bfe658c8c31d8870dcf025035665af7",
    "world-sites": "31546e1f1db7a911f55177cd5395ee8bc3d508b7f6c6254f978018f2b9bb0a3a",
    "world-hazards": "1bda6969e34de2b9e50c502f2c9359998fb901561f39acf1daab0b4a2cfcc222",
    "regional-mechanisms": "b538127784763cf62edb39e73602c627e4238224678f7e1a1323ee64fd169aad",
    "interior-profiles": "f36d970a301265b72f4231dc1144c46dea2ffebe56339cdc0e10708b852e55d1",
    "placement-rules": "edfec75f083697a46b12c45dd0af7e96f37b462a67c718abc3256e0585f44d4e"
  },
  "traces": {
    "forest": "deb6014d3eba6d4a594f54bef473876fef321c3875c64241a58967ded910a325",
    "marsh": "a02415996344468a28ed0aeb4424b9410f9ba35c2d2afb00d6b53764a35921ff",
    "ruins": "43e9a1e21d1b317eb0b81c2f333a2d47b8671131d6b4a09812a68a52d58b8985",
    "beach": "b294379a2b1e07902a56c2d7cf4bc37b3a670a89e98de71ebfb6009003cc2c90",
    "city": "94ecfacdf19e847371e0867dd4327e32fdbc459d735a23bd94077e75ec745b5c",
    "mountain": "6ae7839f4a491e7e824fd7c4e5fd853ccfee8bfcc2599dfa11ca8ca78f0be2f5",
    "snow": "1393d1d571bca29f82af4b0066131007fd81289c1fa3e843e6923d5126d276a2",
    "volcano": "420cabb482f2a3afefe2c783e2b60d20d81b550aedeac76a445378eca304cdf3"
  }
};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const legacyWorldIds=['forest','marsh','ruins','beach','city','mountain','snow','volcano'];
const existingWorldIds=[...legacyWorldIds,'verdant-rift','clockshadow-city'];
assert.deepEqual(WORLD_IDS,[...existingWorldIds,'ember-realm-large'],'append the region sample without renumbering the ten existing worlds');
for(const [id,hash]of Object.entries(expected.exports)){
  const module=await import(`./dist/${id}.js`),data=JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(module).filter(([,value])=>typeof value!=='function'))));
  if(data.WORLD_IDS)data.WORLD_IDS=data.WORLD_IDS.slice(0,8);
  if(data.REGIONS)data.REGIONS=data.REGIONS.slice(0,8);
  if(data.DUNGEON_RULES){
    const rules=JSON.parse(readFileSync(new URL('./dist/config/geography.json',import.meta.url))).interiors;
    for(const [key,profile] of [['DUNGEON_RULES','dungeon'],['HUT_RULES','hut']]){
      assert.equal(data[key].maxStates,REGIONS.length*rules[profile].maxStatesPerWorld,'interior caches account for the complete world catalogue');
      data[key].maxStates=legacyWorldIds.length*rules[profile].maxStatesPerWorld;
    }
  }
  if(data.REGIONS)for(const w of data.REGIONS){delete w.terrain.generatorId;delete w.terrain.placements;delete w.terrain.layoutId;delete w.layout;delete w.authored;}
  if(data.REGIONS){assert.equal(data.REGIONS[0].name,'裂谷林海');assert.equal(data.REGIONS[0].shortName,'裂谷');assert.equal(digest(data.REGIONS.slice(1)),'fd814dc1ee3286e77cc1a1d51ffe609ee2d74d3d8012ae13a78f91f80bc5d46a','the other seven world catalogues remain unchanged');}
  assert.equal(digest(data),hash,`${id}: authored values preserved`);
}
for(const world of REGIONS.filter(world=>legacyWorldIds.includes(world.id))){
  const out=[];
  for(const zoneId of ['default',...world.biomeZones])for(let seed=0;seed<80;seed++){
    const hash=(a,b)=>{const n=Math.sin(a*127.1+b*311.7+seed*19.19)*43758.5453123;return n-Math.floor(n);},roll=n=>hash(n,seed+7),calls=[];
    world.terrain.generate({tx:seed-40,ty:40-seed,key:`${seed-40},${40-seed}`,region:world.id,hash,roll,zone:{id:zoneId},add:o=>calls.push(['add',o]),place:(...args)=>calls.push(['place',...args]),treeProfiles:[{trunkWidth:1},{trunkWidth:.9},{trunkWidth:1.1},{trunkWidth:.8},{trunkWidth:1.2}],cell:520,settings:world.terrain});
    out.push(calls);
  }
  assert.equal(digest(out),expected.traces[world.id],`${world.id}: exact deterministic terrain placements`);
  assert(Object.isFrozen(world)&&Object.isFrozen(world.terrain));
}
assert.equal(STAGES.length,8);assert.equal(WORLD_IDS.length,11);assert.equal(WORLD_CONNECTIONS.length,10);assert.equal(worldForId('missing'),REGIONS[0]);
const sections=Object.fromEntries(['worlds','stages','geography','enemies','encounters','economy'].map(id=>[id,JSON.parse(readFileSync(new URL(`./dist/config/${id}.json`,import.meta.url)))]));
assert(validateWorlds(sections));
assert.deepEqual(sections.worlds.definitions.filter(world=>world.authored).map(world=>world.id),['forest','verdant-rift','clockshadow-city','ember-realm-large'],'all fixed maps and the region sample retain separate identities');
assert.equal(sections.worlds.definitions[0].authored.areas.length,18);
const verdant=sections.worlds.definitions.find(world=>world.id==='verdant-rift');
assert.equal(verdant.authored.worldId,verdant.id);assert.equal(verdant.authored.id,'verdant-rift:1');
assert.equal(verdant.authored.bounds.maxX-verdant.authored.bounds.minX,14400);assert.equal(verdant.authored.bounds.maxY-verdant.authored.bounds.minY,10800);
assert(!sections.worlds.connections.some(edge=>edge.includes(verdant.id)),'the new world is an independent starting choice');
const ember=sections.worlds.definitions.find(world=>world.id==='ember-realm-large');
assert.equal(ember.authored.worldId,ember.id);assert.equal(ember.authored.id,'ember-realm-large:1');assert.equal(ember.authored.artTheme,'ember');
assert.equal(ember.authored.emberScene?.sample,true,'the region preview is explicitly marked as partial content');
assert.equal(ember.authored.bounds.maxX-ember.authored.bounds.minX,14400);assert.equal(ember.authored.bounds.maxY-ember.authored.bounds.minY,10800);
assert(!sections.worlds.connections.some(edge=>edge.includes(ember.id)),'the region sample does not add travel routes to an existing world');
const reject=(edit,label)=>{const bad=structuredClone(sections);edit(bad);assert.throws(()=>validateWorlds(bad),undefined,label);};
reject(s=>s.worlds.definitions[0].terrain.generatorId='remote-code','unregistered behavior');
reject(s=>s.worlds.order.reverse(),'persistent numeric world identities');
reject(s=>s.worlds.connections.push(['forest','unknown']),'unknown world route');
reject(s=>s.worlds.definitions[0].enemyWeights.unknown=1,'unknown monster');
reject(s=>s.stages.definitions[0].core.boss.kind='unknown','unknown boss');
reject(s=>s.stages.definitions[0].outer.boss.hp=-1,'invalid encounter HP');
reject(s=>s.stages.definitions[1].core.id='forest-heart','duplicate map identity');
reject(s=>s.geography.siteFeatures.shipwreck.guardPackId='unknown','unknown guard pack');
reject(s=>s.worlds.definitions[3].terrain.placements.default[0].properties.scale={base:1,gain:1,roll:'code'},'numeric recipes cannot execute code');
reject(s=>delete s.geography.environmentRules.mushroom.growthTimePeriod,'missing environmental formula input');
reject(s=>s.worlds.definitions[0].layout.bossKind='unknown','layout boss references an existing boss');
reject(s=>s.worlds.definitions[0].layout.paths[0][0][0]=Infinity,'layout routes contain finite world points');
reject(s=>s.worlds.definitions[0].layout.patches[0][0]='unrendered','layout patches use known terrain themes');
reject(s=>s.worlds.definitions[0].layout.lakes[0][2]=-1,'layout lakes have positive supported bounds');
reject(s=>s.worlds.definitions[0].authored.passages[0].to='missing','fixed map passage endpoints reference real areas');
reject(s=>delete s.worlds.definitions[0].authored.plan['portal:3'],'fixed map retains every existing world connection');
reject(s=>s.worlds.definitions[0].authored.boundaries[0].points[0].x=Infinity,'baked collision geometry stays finite');
reject(s=>s.worlds.definitions.find(world=>world.id==='verdant-rift').authored.worldId='forest','authored map state cannot alias the legacy forest');
reject(s=>s.worlds.definitions.find(world=>world.id==='verdant-rift').authored.interactions.caves[0].seed=-1,'cave seeds remain finite supported values');
for(const [time,damage]of [[0,90],[600,135],[1200,135]]){
  const g=new Game({hero:'princess',terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.time=time;g.enemies=[];g.player.x=g.player.y=0;g.player.invuln=0;
  g.environment=new Environment(g,{generation:false});
  const enemy=g._spawnEnemy('slime');Object.assign(enemy,{x:5,y:0,hp:1000,maxHp:1000});
  const hp=g.player.hp;g.environment._explode({x:0,y:19.8,r:17,blastRadius:82});
  assert.equal(enemy.hp,1000-damage,'environment damage retains capped growth and is independent of hero damage modifiers');
  assert.equal(g.player.hp,hp-12,'mushroom friendly damage remains unchanged');
}
console.log('World configuration checked: 11 world identities with the ten existing indices preserved, 8 unchanged stages, 10 unchanged legacy routes, separate authored maps/region sample and unchanged legacy values/terrain traces; invalid cross-references rejected.');
