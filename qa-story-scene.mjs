import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { WorldMap } from './dist/world-map.js';
import { visitSceneUnits } from './dist/unit-counts.js';
import { dialogueSpeakers } from './dist/scene-dialogue.js';

const emptyWorld=g=>{
  for(const list of [g.settlements.sites,g.relicSites.sites,g.riftExploration.sites,g.regions.portals,g.territories.groups,g.companions.camps,g.adventure.props,g.adventure.pickups,g.environment.props,g.environment.mechanisms.props,g.environment.worldHazards.props])assert.equal(list.length,0);
  assert.equal(g.adventure.treasure,null);assert.equal(g.portal,null);
  assert.equal(g.terrain._structures.length,0,'Unrelated buildings and doors leave no invisible collision.');
  assert.equal(g.regions.unlockedConnections.size,0,'Borrowing geography must not unlock world travel.');
};
const at=(g,point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
const feet=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.heroId)});
const original=new Game({mode:'world'}),chapter=new Game({mode:'story'});
assert(original.settlements.sites.length&&original.relicSites.sites.length&&original.territories.groups.length);
assert.equal(chapter.sceneContent.allows('worldContent'),false);
assert.equal(chapter.sceneContent.allows('naturalTerrain'),true);
assert.equal(chapter.sceneContent.allows('storyEnemies'),true);
assert.equal(chapter.sceneContent.allows('unregistered-content'),false);
emptyWorld(chapter);
assert.equal(chapter.enemies.length,0,'Ordinary monsters are never generated before the chapter starts.');
assert.deepEqual(chapter.terrain.island.layout.boundaries,original.terrain.island.layout.boundaries,'The chapter keeps the actual map geometry.');
const map=new WorldMap();
chapter.story.update=()=>{};
for(const key of ['environment','adventure','encounters','settlements','relicSites','territories','companions','regions'])chapter[key].update=()=>assert.fail(`Ordinary ${key} simulation ran during the chapter`);
for(const area of chapter.terrain.island.layout.areas) {
  at(chapter,area.center);
  chapter.update(.05);map.discover(chapter);emptyWorld(chapter);
  assert.deepEqual(map.getMarkers(chapter,{range:100000}),[],'Walking the borrowed map cannot reveal ordinary sites or monster domains.');
}
assert.equal(visitSceneUnits(chapter,()=>{}),1);
assert.deepEqual(dialogueSpeakers(chapter).map(s=>s.kind),['player']);
const actorUpdate=[];
chapter.story.updateActors=()=>actorUpdate.push(chapter.player.x);
at(chapter,chapter.terrain.island.layout.spawn);const oldX=chapter.player.x;
chapter.update(.02,{x:1});assert(chapter.player.x>oldX);assert.equal(actorUpdate.at(-1),chapter.player.x,'The chapter followers receive this frame\'s moved player position.');
const scripted=chapter._spawnEnemy('slime',1);scripted.storyId='prologue';scripted.storyEnemy=true;
assert.equal(visitSceneUnits(chapter,()=>{}),2,'The content policy retains explicitly scripted enemies.');
chapter.dispose('quit');emptyWorld(chapter);assert.equal(chapter.sceneContent.restoreWorld(),false,'Exiting must not generate an exploration scene.');

// Restore against real populated foundations and residents, not a mocked floor.
const complete=new Game({mode:'story'}),terrain=complete.terrain,castle=original.settlements.sites.find(site=>site.type==='castle');
at(complete,{x:castle.x,y:castle.y-castle.depth/2});
const end=feet(complete.player),natural=terrain.query(end.x-150,end.y-150,end.x+150,end.y+150).filter(p=>!p.structureId).map(p=>p.id);
complete.gold=37;complete.crystals=19;complete.time=600;complete.runTime=600;
const build=complete.build,xp=complete.player.xp;
complete.bullets.push({x:0,y:0,life:1});complete.enemyBullets.push({x:0,y:0,life:1});complete.effects.push({type:'ring',life:1});
complete.story.completed=true;
assert.equal(complete.sceneContent.restoreWorld(),true);
assert.equal(complete.sceneContent.allows('worldContent'),true);
assert.equal(complete.terrain,terrain,'The same natural map remains loaded.');
assert.deepEqual(terrain.query(end.x-150,end.y-150,end.x+150,end.y+150).filter(p=>!p.structureId).map(p=>p.id),natural);
assert.deepEqual(complete.settlements.sites.map(({id,x,y})=>({id,x,y})),original.settlements.sites.map(({id,x,y})=>({id,x,y})),'Chapter timing and final position do not relocate ordinary buildings.');
assert.deepEqual(complete.relicSites.sites.map(({id,x,y})=>({id,x,y})),original.relicSites.sites.map(({id,x,y})=>({id,x,y})));
assert.equal(complete.enemies.length,original.enemies.length,'Returning does not delete ordinary enemies around the arrival.');
assert(complete.enemies.every(e=>e.hp>0&&!e.storyEnemy));
const arrival=feet(complete.player);
assert(terrain.isFree(arrival.x,arrival.y,complete.player.r+4));
assert(complete.enemies.every(e=>Math.hypot(e.x-arrival.x,feet(e).y-arrival.y)>=240));
assert(Math.hypot(arrival.x-end.x,arrival.y-end.y)<=640,'A nearby safe point is preferred over restarting at the map origin.');
assert.equal(complete.gold,37);assert.equal(complete.crystals,19);assert.equal(complete.player.xp,xp);assert.equal(complete.build,build);
assert.equal(complete.bullets.length+complete.enemyBullets.length+complete.effects.length,0);
assert(complete.encounters.nextAt>complete.time);assert(complete.adventure._nextTreasureAt>complete.time);assert(complete.companions.nextAt>complete.time);assert(complete.nextBossAt>complete.time);
assert(complete.regionGrace>=4&&complete.player.invuln>=2);
assert.equal(complete.terrain.riftGateOpen('bell-shortcut'),false);
const residents=complete.enemies;
assert.equal(complete.sceneContent.restoreWorld(),false);assert.equal(complete.enemies,residents,'A repeated completion cannot duplicate residents or rewards.');

const departing=new Game({mode:'story'}),unrelated=new Game({mode:'world'}),structures=unrelated.terrain._structures;
departing.terrain=unrelated.terrain;departing.mapId=999;
assert.equal(departing.sceneContent.restoreWorld(),false);
departing.dispose('scene-change');
assert.equal(unrelated.terrain._structures,structures,'Cleaning an old chapter cannot rewrite a replacement scene.');
assert.equal(unrelated.terrain.riftGateOpen('bell-shortcut'),false);
assert.equal(new Game({mode:'story'}).sceneContent.allows('worldContent'),false,'Restart begins with a fresh isolated chapter.');
console.log('Story scene isolation QA passed: generation, actors, map, collision, simulation, safe restoration and lifecycle.');
