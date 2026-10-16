import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { WORLD_IDS, worldForId, worldNeighbors } from './dist/world-definitions.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { validateWorlds } from './dist/config-validation/worlds.js';
import { RiftCollision } from './dist/rift-collision.js';

const id='frostmirror-highlands',layout=createRiftLayout(id),theme=worldForId('snow'),world=worldForId(id);
assert.deepEqual(WORLD_IDS.slice(0,9),['forest','marsh','ruins','beach','city','mountain','snow','volcano','verdant-rift'],'existing numeric save identities stay stable');
assert.equal(WORLD_IDS[9],id);assert.deepEqual(worldNeighbors(9),[],'the new destination cannot invent a world gate');
assert.equal(layout.id,`${id}:1`);assert.equal(layout.worldId,id);assert.equal(layout.artTheme,'snow');
assert.equal(layout.bounds.maxX-layout.bounds.minX,14400);assert.equal(layout.bounds.maxY-layout.bounds.minY,10800);
assert.equal(layout.areas.length,19);assert.equal(layout.areas.filter(area=>area.kind==='secret').length,3);
assert.equal(layout.passages.filter(p=>p.kind==='bridge').length,2);assert.equal(layout.interactions.caves.length,3);assert.equal(layout.interactions.chests.length,4);
assert.equal(layout.areas.filter(area=>area.snowTerrain==='ice').length,1,'the main frozen lake is walkable ground rather than deep water');
for(const key of ['enemyWeights','danger','environment','terrain','art'])assert.deepEqual(world[key],theme[key],`new destination reuses the existing snow ${key}`);
assert.notEqual(layout,createRiftLayout('verdant-rift'));assert.notEqual(layout,createRiftLayout('forest'));
assert(Object.isFrozen(layout)&&Object.isFrozen(layout.areas),'render and collision share immutable baked data');

const sections=Object.fromEntries(['worlds','stages','geography','enemies','encounters','economy'].map(key=>[key,JSON.parse(readFileSync(new URL(`./dist/config/${key}.json`,import.meta.url)))]));
assert(validateWorlds(sections));
const reject=edit=>{const copy=structuredClone(sections);edit(copy.worlds.definitions.find(w=>w.id===id).authored);assert.throws(()=>validateWorlds(copy));};
reject(map=>map.worldId='snow');reject(map=>map.artTheme='volcano');reject(map=>map.areas[0].snowTerrain='sliding');
reject(map=>map.decorations.push({id:'qa-bad',name:'bad',kind:'stele',x:map.bounds.maxX+1,y:0}));
reject(map=>map.decorations.push({id:'qa-bad',name:'bad',kind:'boss',x:0,y:0}));
reject(map=>map.interactions.caves[0].area='missing');
reject(map=>map.interactions.chests.push({...map.interactions.chests[0]}));

const game=new Game({mode:'world',worldId:id}),forest=new Game({mode:'world',environment:false});
assert.equal(game.debug,false);assert.equal(game.mapId,9);assert.equal(game.worldId,id);assert.equal(game.startWorldId,id);
assert.equal(game.region.id,id);assert.equal(game.terrain.region,id);assert.equal(game.terrain.island.layout,layout);
assert.equal(game.player.speed,forest.player.speed);assert.equal(game.player.r,forest.player.r);
assert.equal(game.regions.portals.length,0);assert.equal(game.regions._endpoint(0),null);
assert(game.terrain.isFree(layout.spawn.x,layout.spawn.y,game.player.r));
assert.equal(game.territories.groups.length,layout.encounters.length,'every reserved finite encounter becomes a populated territory');
const bosses=game.enemies.filter(enemy=>enemy.worldBoss);assert.equal(bosses.length,2);assert(bosses.every(enemy=>enemy.bossKind==='frostcrown'));
assert(game.enemies.some(enemy=>enemy.type==='frostmage'),'the new map uses snow specialist enemies');
for(const site of game.riftExploration.sites){assert(site.id.startsWith(`rift:${id}:`));assert.equal(site.artTheme,'snow');}
assert.equal(game.riftExploration.decorations.length,layout.decorations.length);assert(game.riftExploration.decorations.length>0);
for(const decoration of game.riftExploration.decorations){assert.equal(decoration.artTheme,'snow');assert.equal(decoration.collision,false);assert(!game.riftExploration.sites.some(site=>site.id===decoration.id),'decorative landmarks never become interactions');}
const themedProps=game.terrain.query(layout.bounds.minX,layout.bounds.minY,layout.bounds.maxX,layout.bounds.maxY);
assert(themedProps.some(prop=>prop.variant==='world-snowpine'));assert(themedProps.some(prop=>prop.variant==='world-snowshrub'));assert(themedProps.some(prop=>prop.variant==='world-ice'));
assert(!themedProps.some(prop=>prop.variant==='world-city-wall'),'snow ruins use their own reusable visual variant');

// Validate complete-body movement and flight layers against the collision
// union, independently from graph adjacency or a centre-only path check.
let sweeps=0;const collision=new RiftCollision(layout);
for(const passage of layout.passages)for(const radius of [15,24,49])for(let index=1;index<passage.waypoints.length;index++){
  const a=passage.waypoints[index-1],b=passage.waypoints[index];
  assert.equal(collision.firstBlocker(a.x,a.y,b.x,b.y,radius),null,`${passage.id}: r${radius} full-body clearance`);
  const moved=collision.step(a.x,a.y,b.x,b.y,radius);assert(Math.hypot(moved.x-b.x,moved.y-b.y)<.02);sweeps++;
}
const ice=layout.areas.find(area=>area.snowTerrain==='ice').center;
assert(game.terrain.isFree(ice.x,ice.y,49),'large ground bodies can stand on the frozen lake');
const beforeSpeed=game.environment.movementMultiplier(game.player,true);assert.equal(beforeSpeed,1,'the snow spawn retains the ordinary movement rate');

// Real cave transitions retain their existing enemies/rewards and namespace;
// the second mouth shares an underground instance instead of teleporting.
game.enemies=[];
const put=point=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);game.regionGrace=0;};
const finish=()=>{for(let index=0;index<30&&game.sceneTransition.active;index++)game.sceneTransition.update(.05);assert.equal(game.sceneTransition.active,false);assert.equal(game.sceneTransition.commitSucceeded,true);};
const request=target=>{put(target);assert.equal(game.requestInteraction(target.id),true);finish();};
const chests=game.riftExploration.sites.filter(site=>site.kind==='chest'),chest=chests[0];put(chest);
const gold=game.gold;assert.equal(game.riftExploration.interact(chest.id),true);assert(game.gold>gold);assert.equal(game.riftExploration.interact(chest.id),false);
assert(forest.riftExploration.sites.filter(site=>site.kind==='chest').every(site=>site.state==='closed'));
const mouths=game.riftExploration.sites.filter(site=>site.kind==='cave'),groups=Map.groupBy(mouths,mouth=>mouth.caveId);
assert.equal(groups.size,2);const paired=[...groups.values()].find(group=>group.length===2),challenge=[...groups.values()].find(group=>group.length===1)[0];
request(challenge);const challengeState=game.dungeon.active;assert.equal(challengeState.artTheme,'snow');assert.equal(challengeState.riftExits.length,1);
request(challengeState.riftExits[0]);assert(!game.dungeon.active);
request(paired[0]);const shared=game.dungeon.active;assert.equal(shared.riftExits.length,2);assert(shared.enemies.length>0&&shared.chests.length>0);
const enemy=shared.enemies[0];enemy.hp--;const retainedHp=enemy.hp;
request(shared.riftExits.find(exit=>exit.key===paired[1].key));assert(!game.dungeon.active);assert(Math.hypot(game.player.x-paired[1].x,game.player.y+groundOffset(game.player,true)-paired[1].y)<190);
request(paired[1]);assert.equal(game.dungeon.active,shared);assert.equal(enemy.hp,retainedHp);
request(shared.riftExits.find(exit=>exit.key===paired[0].key));assert.equal(game.dungeon.states.size,2);assert.equal(forest.dungeon.states.size,0);
const snapshot=game.regions.saveWorld();assert.equal(game.regions.states.get(9),snapshot);assert.equal(game.regions.restoreWorld(0),false);assert.equal(game.regions.restoreWorld(9),true);assert.equal(game.riftExploration.sites.find(site=>site.id===chest.id).state,'claimed');
const fresh=new Game({mode:'world',worldId:id,environment:false});assert(fresh.riftExploration.sites.filter(site=>site.kind==='chest').every(site=>site.state==='closed'),'a fresh expedition resets only its own finite content');
const trial=new Game({mode:'dungeon',stageId:'snow-trial',environment:false});assert.equal(trial.region.id,'snow');assert.notEqual(trial.terrain.island.layout,layout,'the original snow trial remains its own scene');
console.log(`Snow world: stable identities, snow combat metadata, schema rejection, themed scenery/landmarks, ${sweeps} full-body sweeps, finite encounters/rewards, challenge and paired caves, snapshot isolation and legacy snow trial passed.`);
