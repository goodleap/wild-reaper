import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { WORLD_IDS,worldForId } from './dist/world-definitions.js';
import { mapSeed } from './dist/map-context.js';
import { questDefinition } from './dist/quest-definitions.js';

assert.equal(WORLD_IDS[0],'forest','the historical map retains its original identity');
assert.equal(worldForId('forest').name,'低语之森');
assert.equal(WORLD_IDS.indexOf('rift-forest'),11,'the existing map IDs are not renumbered');
assert.equal(worldForId('rift-forest').name,'裂谷林海');
assert.equal(questDefinition('underground-return').worldId,'rift-forest');
assert.equal(mapSeed({regionIndex:11,region:{seed:0}}),0);
assert.equal(mapSeed({regionIndex:11,region:{seed:0},stage:{currentIsland:{seed:73}}}),73,'stage seeds remain independent');

// Geometry fixtures from v0.0.73 (b17a5a6), independent of current art/collision.
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const original=new Island({region:'forest',seed:0});
assert.equal(digest(original.points),'b493f56345ed8e12decd6218b0c21daa693bf4d258036a83ee346ee5ada290a4','restore the original 128-point coast');
assert.equal(digest(original.plan),'5d558b95637d42968d9085b4993db8382df82ae78aae07a8a308b1f10e642a21','restore the original site reservations');
assert.equal(original.layout,null,'the restored island does not acquire a later macro layout');
assert.equal(digest(worldForId('rift-forest').authored),'0c68cbde0efb5636b20c0b18add4ed5527d4c9a033f642675c029552da3184a1','the existing rift layout remains unchanged');

const world=new Game({mode:'world',questStorage:null});
assert.equal(world.worldId,'rift-forest','world exploration keeps its existing default map');
assert.equal(world.terrain.island.seed,0);
assert.equal(world.environment.seed,0);
assert.equal(world.adventure.seed,0,'moving the map identity must not reroll its scenery or supplies');
assert(world.settlements.sites.some(site=>site.type==='angel'),'the existing spawn sanctuary survives the ID migration');
assert(world.quests.definitions.some(quest=>quest.id==='underground-return'));
assert(world.riftExploration.sites.some(site=>site.key==='cave05'));
assert(world.riftExploration.sites.some(site=>site.key==='cave15'));

const story=new Game({mode:'story',worldId:'forest',questStorage:null});
assert.equal(story.worldId,'rift-forest','the story follows its configured map instead of the historic ID');
assert.equal(story.story.definition.worldId,story.worldId);
assert.equal(story.story.step,'awakening');
assert.equal(story.terrain.island.layout.id,'rift-forest:1');
assert.equal(story.terrain.island.seed,0);
assert.equal(story.settlements.sites.length,0,'ordinary world NPCs remain excluded from the story');

const debug=new Game({mode:'world',debug:true,debugOptions:{testFacilities:true},questStorage:null});
assert(debug.enemies.some(enemy=>enemy.trainingDummy),'the existing debug facility is not tied to numeric index zero');
assert(debug.settlements.sites.some(site=>site.type==='castle'));

world.dispose();story.dispose();debug.dispose();
console.log('map identity: independent maps, stable seeds, story, sanctuary and debug facilities passed');
