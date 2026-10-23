import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { REGIONS,WORLD_IDS,WORLD_CONNECTIONS,worldForId } from './dist/world-definitions.js';
import { STAGES } from './dist/stage-definitions.js';
import { validateWorlds } from './dist/config-validation/worlds.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { Environment } from './dist/environment.js';

// Baselines come from v0.0.148. The approved changes are current world IDs,
// corresponding portal indices/site labels, and reuse of the volcanic trial's
// terrain/environment recipe. Full forest content and all other unchanged
// layouts remain covered; the two extended layouts have separate geometry QA.
const expected={
  "exports": {
    "environment": "5a2e7540eee34a6d3ef9ea0b5029222765e9f6bd5b0b869552f15993a5f164c3",
    "world-sites": "4d59c5bd769e63982ac0e6859b979d9b68264ea1fa2d158c21ceafd8af25d707",
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
    "clockshadow-city": "94ecfacdf19e847371e0867dd4327e32fdbc459d735a23bd94077e75ec745b5c",
    "mountain": "6ae7839f4a491e7e824fd7c4e5fd853ccfee8bfcc2599dfa11ca8ca78f0be2f5",
    "snow": "1393d1d571bca29f82af4b0066131007fd81289c1fa3e843e6923d5126d276a2",
    "ember-realm-large": "420cabb482f2a3afefe2c783e2b60d20d81b550aedeac76a445378eca304cdf3"
  },
  "worlds": {
    "rift-forest": "c66f3366d4e12800c4c2a36f5fd0006c3afead1ad76c054c84a7e698ab643a34",
    "marsh": "83420920136e8d2145054b2dc01ad7fd2b6eca5f9499f451873efa5bd35d3570",
    "ruins": "34b5ca5d0a61b074af068b66c11d0c63c7f83f14e312270c20f057aa10e4351a",
    "beach": "f46f99e9f2649ba3fe9e8ef59f15ca2b753913ea910d566ca7bffb1c8e6b923c",
    "mountain": "a9843bd8d23600e9ec4a44d5f1c71a2b5a4b2abe8de4871cc1302e5a2bfe02ad",
    "snow": "a1bc6ffc0ec754281f2eb348203049325a48726e320984bee1aee3f4e21918d8",
    "verdant-rift": "4ebd51012306f3ca984579768a6fff7caf31194f63542c7cd8818ff609d33485",
    "clockshadow-city": "74adbb691cfddc89ddc010025a7b3e8391ca1300608aecc1114d21ac7a676e9d",
    "ember-realm-large": "c1bc6b361a861aa8adebe385ec5a28e96d4e9792dd6a356074089392fab6f8dc",
    "forest": "2eaa67a9d83874cfd6c7be230adff6b8f887649bd95f9886b2a1faa4ead53c66"
  },
  "stageEncounters": "36cc5d1ec28691de62c9a554a1c58108624764bb60fcd11535b3889eb8a302e2",
  "expeditions": "84fd465b93627e6fcadc7e0870720d9e139a9d4583d6e2120619a2ded2eecabe"
};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const currentWorldIds=['forest','marsh','ruins','beach','clockshadow-city','mountain','snow','ember-realm-large','verdant-rift','rift-forest'];
assert.deepEqual(WORLD_IDS,currentWorldIds,'only the current maps retain registered world identities');
for(const [id,hash]of Object.entries(expected.exports)){
  const module=await import(`./dist/${id}.js`),data=JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(module).filter(([,value])=>typeof value!=='function'))));
  if(data.DUNGEON_RULES){
    const rules=JSON.parse(readFileSync(new URL('./dist/config/geography.json',import.meta.url))).interiors;
    for(const [key,profile] of [['DUNGEON_RULES','dungeon'],['HUT_RULES','hut']]){
      assert.equal(data[key].maxStates,REGIONS.length*rules[profile].maxStatesPerWorld,'interior caches account for the complete world catalogue');
      data[key].maxStates=8*rules[profile].maxStatesPerWorld;
    }
  }
  assert.equal(digest(data),hash,`${id}: authored values preserved`);
}
for(const world of REGIONS.filter(world=>Object.hasOwn(expected.traces,world.id))){
  const out=[];
  for(const zoneId of ['default',...world.biomeZones])for(let seed=0;seed<80;seed++){
    const hash=(a,b)=>{const n=Math.sin(a*127.1+b*311.7+seed*19.19)*43758.5453123;return n-Math.floor(n);},roll=n=>hash(n,seed+7),calls=[];
    world.terrain.generate({tx:seed-40,ty:40-seed,key:`${seed-40},${40-seed}`,region:world.id,hash,roll,zone:{id:zoneId},add:o=>calls.push(['add',o]),place:(...args)=>calls.push(['place',...args]),treeProfiles:[{trunkWidth:1},{trunkWidth:.9},{trunkWidth:1.1},{trunkWidth:.8},{trunkWidth:1.2}],cell:520,settings:world.terrain});
    out.push(calls);
  }
  assert.equal(digest(out),expected.traces[world.id],`${world.id}: exact deterministic terrain placements`);
  assert(Object.isFrozen(world)&&Object.isFrozen(world.terrain));
}
assert.equal(STAGES.length,8);assert.equal(WORLD_IDS.length,10);assert.equal(WORLD_CONNECTIONS.length,10);assert.equal(worldForId('missing'),REGIONS[0]);
const sections=Object.fromEntries(['worlds','stages','geography','enemies','encounters','economy'].map(id=>[id,JSON.parse(readFileSync(new URL(`./dist/config/${id}.json`,import.meta.url)))]));
assert(validateWorlds(sections));
assert.deepEqual(new Set(sections.worlds.definitions.map(world=>world.id)),new Set(currentWorldIds));
for(const retiredId of ['city','volcano']){
  assert(!sections.worlds.definitions.some(world=>world.id===retiredId),'retired IDs have no world definition');
  assert(!sections.worlds.connections.some(edge=>edge.includes(retiredId)),'retired IDs have no travel route');
}
for(const world of sections.worlds.definitions){
  const data=structuredClone(world);
  if(['clockshadow-city','ember-realm-large'].includes(world.id))delete data.authored;
  assert.equal(digest(data),expected.worlds[world.id],`${world.id}: existing content outside the approved exits/theme data remains unchanged`);
}
assert.equal(digest(sections.stages.definitions.map(stage=>({id:stage.id,boss:stage.boss,reward:stage.reward}))),expected.stageEncounters,'eight single-scene trials retain their reviewed core Boss values and rewards');
assert.equal(digest(sections.stages.expeditions),expected.expeditions,'commemorative survival, ship and moon content remains unchanged');
assert.deepEqual(sections.worlds.definitions.filter(world=>world.authored).map(world=>world.id),['rift-forest','marsh','ruins','beach','mountain','snow','verdant-rift','clockshadow-city','ember-realm-large'],'all remade and existing fixed maps retain separate identities');
const rift=sections.worlds.definitions.find(world=>world.id==='rift-forest');
assert.equal(rift.authored.areas.length,18);
assert.equal(sections.worlds.definitions.find(world=>world.id==='forest').authored,undefined);
assert(sections.worlds.definitions.find(world=>world.id==='forest').naturalIsland,'the original forest uses its natural layout data');
const verdant=sections.worlds.definitions.find(world=>world.id==='verdant-rift');
assert.equal(verdant.authored.worldId,verdant.id);assert.equal(verdant.authored.id,'verdant-rift:1');
assert.equal(verdant.authored.bounds.maxX-verdant.authored.bounds.minX,14400);assert.equal(verdant.authored.bounds.maxY-verdant.authored.bounds.minY,10800);
assert(!sections.worlds.connections.some(edge=>edge.includes(verdant.id)),'the new world is an independent starting choice');
const ember=sections.worlds.definitions.find(world=>world.id==='ember-realm-large');
assert.equal(ember.authored.worldId,ember.id);assert.equal(ember.authored.id,'ember-realm-large:1');assert.equal(ember.authored.artTheme,'ember');
assert.equal(ember.authored.emberScene?.sample,false,'the full ember world replaces the partial preview');
assert.equal(ember.authored.emberScene.revision,2);assert.equal(ember.authored.areas.length,17);assert.equal(ember.authored.passages.length,25);
assert.equal(ember.authored.passages.filter(p=>p.kind==='bridge').length,3);assert.equal(ember.authored.interactions.caves.length,3);assert.equal(ember.authored.interactions.chests.length,10);
assert.equal(ember.authored.encounters.filter(e=>e.kind==='boss').length,2);assert.equal(Object.keys(ember.authored.plan).length,14);
assert.equal(ember.authored.bounds.maxX-ember.authored.bounds.minX,14400);assert.equal(ember.authored.bounds.maxY-ember.authored.bounds.minY,10800);
assert.deepEqual(new Set(sections.worlds.connections.filter(edge=>edge.includes(ember.id)).map(edge=>edge.find(id=>id!==ember.id))),new Set(['snow','ruins']),'the complete ember map owns both existing volcanic connections');
for(const [id,neighbors] of [['clockshadow-city',['beach','mountain','ruins']],['ember-realm-large',['snow','ruins']]]){
  const world=sections.worlds.definitions.find(world=>world.id===id);
  assert.deepEqual(new Set(Object.keys(world.authored.plan).filter(key=>key.startsWith('portal:'))),new Set(neighbors.map(neighbor=>`portal:${WORLD_IDS.indexOf(neighbor)}`)),'each new world exit has a corresponding authored reservation');
}
const reject=(edit,label)=>{const bad=structuredClone(sections);edit(bad);assert.throws(()=>validateWorlds(bad),undefined,label);};
reject(s=>s.worlds.definitions[0].terrain.generatorId='remote-code','unregistered behavior');
reject(s=>s.worlds.order.reverse(),'persistent numeric world identities');
reject(s=>s.worlds.connections.push(['forest','unknown']),'unknown world route');
for(const id of ['city','volcano']){
  reject(s=>s.worlds.connections.push(['forest',id]),'retired world routes cannot pass validation');
  reject(s=>s.stages.definitions[0].worldMapId=id,'retired world IDs cannot return as trial terrain');
}
reject(s=>s.worlds.definitions[0].enemyWeights.unknown=1,'unknown monster');
reject(s=>s.stages.definitions[0].boss.kind='unknown','unknown boss');
reject(s=>s.stages.definitions[0].boss.hp=-1,'invalid encounter HP');
reject(s=>s.stages.definitions[1].id=s.stages.definitions[0].id,'duplicate challenge identity');
reject(s=>s.geography.siteFeatures.shipwreck.guardPackId='unknown','unknown guard pack');
reject(s=>s.worlds.definitions[3].terrain.placements.default[0].properties.scale={base:1,gain:1,roll:'code'},'numeric recipes cannot execute code');
reject(s=>delete s.geography.environmentRules.mushroom.growthTimePeriod,'missing environmental formula input');
reject(s=>s.worlds.definitions.find(world=>world.id==='rift-forest').layout.bossKind='unknown','layout boss references an existing boss');
reject(s=>s.worlds.definitions.find(world=>world.id==='rift-forest').layout.paths[0][0][0]=Infinity,'layout routes contain finite world points');
reject(s=>s.worlds.definitions.find(world=>world.id==='rift-forest').layout.patches[0][0]='unrendered','layout patches use known terrain themes');
reject(s=>s.worlds.definitions.find(world=>world.id==='rift-forest').layout.lakes[0][2]=-1,'layout lakes have positive supported bounds');
reject(s=>s.worlds.definitions.find(world=>world.id==='rift-forest').authored.passages[0].to='missing','fixed map passage endpoints reference real areas');
reject(s=>delete s.worlds.definitions.find(world=>world.id==='rift-forest').authored.plan['portal:3'],'fixed map retains every existing world connection');
reject(s=>s.worlds.definitions.find(world=>world.id==='rift-forest').authored.boundaries[0].points[0].x=Infinity,'baked collision geometry stays finite');
reject(s=>s.worlds.definitions.find(world=>world.id==='verdant-rift').authored.worldId='forest','authored map state cannot alias the legacy forest');
reject(s=>s.worlds.definitions.find(world=>world.id==='verdant-rift').authored.interactions.caves[0].seed=-1,'cave seeds remain finite supported values');
for(const id of ['marsh','ruins','beach','mountain','snow'])reject(s=>delete s.worlds.definitions.find(world=>world.id===id).authored,`${id}: the current selection requires its complete authored map`);
for(const [time,damage]of [[0,90],[600,135],[1200,135]]){
  const g=new Game({hero:'princess',terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.time=time;g.enemies=[];g.player.x=g.player.y=0;g.player.invuln=0;
  g.environment=new Environment(g,{generation:false});
  const enemy=g._spawnEnemy('slime');Object.assign(enemy,{x:5,y:0,hp:1000,maxHp:1000});
  const hp=g.player.hp;g.environment._explode({x:0,y:19.8,r:17,blastRadius:82});
  assert.equal(enemy.hp,1000-damage,'environment damage retains capped growth and is independent of hero damage modifiers');
  assert.equal(g.player.hp,hp-12,'mushroom friendly damage remains unchanged');
}
console.log('World configuration: ten unchanged world maps/routes, eight single-scene trial Boss/reward definitions, three preserved special challenges, retired IDs rejected, complete commemorative forest and deterministic terrain recipes passed.');
