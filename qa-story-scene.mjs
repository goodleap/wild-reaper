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
chapter.story.advanceDialogue(true);
chapter.story.update=()=>{};
for(const key of ['environment','adventure','encounters','settlements','relicSites','territories','companions','regions'])chapter[key].update=()=>assert.fail(`Ordinary ${key} simulation ran during the chapter`);
for(const area of chapter.terrain.island.layout.areas) {
  at(chapter,area.center);
  chapter.update(.05);map.discover(chapter);emptyWorld(chapter);
  assert.deepEqual(map.getMarkers(chapter,{range:100000}).filter(marker=>marker.type!=='story'),[],'Walking the borrowed map cannot reveal ordinary sites or monster domains.');
}
assert.equal(visitSceneUnits(chapter,()=>{}),1+chapter.story.actors.length+chapter.enemies.length);
assert.deepEqual(dialogueSpeakers(chapter).filter(s=>s.kind!=='enemy').map(s=>s.kind),['player','story'],'Only the hero and the waiting story princess provide friendly world actors.');
const actorUpdate=[];
chapter.story.updateActors=()=>actorUpdate.push(chapter.player.x);
at(chapter,chapter.terrain.island.layout.spawn);const oldX=chapter.player.x;
chapter.update(.02,{x:1});assert(chapter.player.x>oldX);assert.equal(actorUpdate.at(-1),chapter.player.x,'The chapter followers receive this frame\'s moved player position.');
const scripted=chapter._spawnEnemy('slime',1);scripted.storyId='prologue';scripted.storyEnemy=true;
assert.equal(visitSceneUnits(chapter,()=>{}),1+chapter.story.actors.length+chapter.enemies.length,'The content policy retains explicitly scripted enemies.');
chapter.dispose('quit');emptyWorld(chapter);assert.equal(chapter.sceneContent.restoreWorld(),false,'Exiting must not generate an exploration scene.');

// Completing this standalone chapter preserves its borrowed geography but
// never creates the ordinary world content that belongs to another mode.
const complete=new Game({mode:'story'}),terrain=complete.terrain;
const end=feet(complete.player),natural=terrain.query(end.x-150,end.y-150,end.x+150,end.y+150).filter(p=>!p.structureId).map(p=>p.id);
complete.gold=37;complete.crystals=19;complete.time=600;complete.runTime=600;
const build=complete.build,xp=complete.player.xp;
complete.sceneContent.restoreWorld=()=>assert.fail('A chapter victory must not restore a free exploration scene.');
complete.story.advanceDialogue(true);complete.story.flow.go('conversation');complete.story.advanceDialogue(true);
assert(!complete.sceneTransition.active,'Skipping the conclusion cannot start departure.');
assert.equal(complete.story.getDialogue().nextLabel,'正式启航');assert.equal(complete.story.getDialogue().departure,true);assert(complete.story.advanceDialogue(false));
for(let i=0;i<32&&complete.sceneTransition.active;i++)complete.update(.025,{x:1,y:1,skill:true});
assert(complete.story.completed);assert.equal(complete.status,'victory');emptyWorld(complete);
assert.equal(complete.terrain,terrain,'The victory frame uses the same borrowed natural map.');
assert.deepEqual(terrain.query(end.x-150,end.y-150,end.x+150,end.y+150).filter(p=>!p.structureId).map(p=>p.id),natural);
assert.equal(complete.gold,37);assert.equal(complete.crystals,19);assert.equal(complete.player.xp,xp);assert.equal(complete.build,build);
assert.equal(complete.sceneContent.allows('worldContent'),false);assert.equal(complete.story.actors.length,0);
assert.equal(complete.story.advanceDialogue(true),false,'Repeated confirmation cannot begin another completion.');
complete.dispose('victory');emptyWorld(complete);

const departing=new Game({mode:'story'}),unrelated=new Game({mode:'world'}),structures=unrelated.terrain._structures;
departing.terrain=unrelated.terrain;departing.mapId=999;
assert.equal(departing.sceneContent.restoreWorld(),false);
departing.dispose('scene-change');
assert.equal(unrelated.terrain._structures,structures,'Cleaning an old chapter cannot rewrite a replacement scene.');
assert.equal(unrelated.terrain.riftGateOpen('bell-shortcut'),false);
assert.equal(new Game({mode:'story'}).sceneContent.allows('worldContent'),false,'Restart begins with a fresh isolated chapter.');
console.log('Story scene isolation QA passed: generation, actors, map, collision, simulation, standalone victory and lifecycle.');
