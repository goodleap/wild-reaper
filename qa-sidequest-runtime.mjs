import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {WORLD_QUESTS} from './dist/quest-definitions.js';
import {foot} from './dist/sidequests/base.js';

const worldIds=[...new Set(WORLD_QUESTS.filter(definition=>definition.sidequest).map(definition=>definition.worldId))];
// The hero's ground offset is derived by the existing ground geometry helper.
function stand(game,point){const current=foot(game.player);game.player.x+=point.x-current.x;game.player.y+=point.y-current.y;}
const available=new Set(),newScenes=new Set();
for(const worldId of worldIds){
  const game=new Game({mode:'world',worldId,questStorage:null});
  game.status='playing';const runtime=game.quests.sidequests;
  for(const definition of game.quests.definitions)available.add(definition.id);
  for(const [id,scene] of runtime.scenes){
    newScenes.add(id);assert.equal(scene.accepted,false,`${id}: fresh independent quest requires acceptance`);
    const giver=scene.actors.get('giver'),location=foot(giver);
    assert(game.terrain.isFree(location.x,location.y,giver.r),`${id}: giver occupies walkable ground`);
    stand(game,location);runtime.update(.05);
    assert(scene.record.discovered,`${id}: approaching discovers the actual giver`);
    assert.equal(scene.accepted,false,`${id}: proximity does not accept a quest`);
    const action=runtime._discoveryAction(scene);assert(action.manual&&action.sideQuestId===id);
    assert(runtime.interact(action.id),`${id}: nearby conversation opens the journal`);
    assert.equal(scene.accepted,false,`${id}: opening the journal still does not accept`);
    game.status='playing';assert(game.quests.accept(id),`${id}: explicit acceptance succeeds without any main story progress`);
  }
  const stable=runtime._activeScenes();assert.equal(runtime._activeScenes(),stable,'hot combat hooks reuse the active scene list');
  const before=JSON.stringify([...runtime.scenes.values()].map(scene=>scene.state));
  game.status='paused';game._clock+=100;runtime.update(100);
  assert.equal(JSON.stringify([...runtime.scenes.values()].map(scene=>scene.state)),before,'paused scenes neither move actors nor advance quest clocks');
  game.status='playing';game.dispose();
}
assert.equal(worldIds.length,9);assert.equal(newScenes.size,18);assert.equal(available.size,25,'all seven existing and eighteen independent quests remain available');

const game=new Game({mode:'world',worldId:'mountain',questStorage:null});game.status='playing';
const runtime=game.quests.sidequests,scene=runtime.scenes.get('mountain-routes');
game.quests._discover(scene.id);assert(game.quests.accept(scene.id));
const action=()=>scene.actions().find(action=>action.action==='choose-route');
stand(game,action());assert(runtime.interact(action().id));
assert.equal(game.status,'sidequest-choice');assert.equal(runtime.getChoice().choices.length,2);
assert.equal(scene.state.choices.route,undefined,'opening options has no gameplay effect');
assert(runtime.closeChoice());assert.equal(game.status,'playing');assert.equal(scene.state.choices.route,undefined);
stand(game,action());assert(runtime.interact(action().id));
assert.equal(runtime.choose('nonexistent'),false);assert.equal(game.status,'sidequest-choice');
stand(game,{x:action().x+1000,y:action().y});assert.equal(runtime.choose('short'),false,'choice revalidates proximity');
assert.equal(scene.state.choices.route,undefined);runtime.closeChoice();
stand(game,action());assert(runtime.interact(action().id));
game.worldId='snow';assert.equal(runtime.choose('short'),false,'choice from a previous map is invalid');
assert.equal(game.status,'playing');assert.equal(runtime.getChoice(),null);game.worldId='mountain';
stand(game,action());assert(runtime.interact(action().id));assert(runtime.choose('long'));
assert.equal(game.status,'playing');assert.equal(scene.state.choices.route,'long');

// Portable equipment controls must not hide a nearby world interaction.
const actions=scene.actions.bind(scene);const p=foot(game.player);
scene.actions=()=>[scene.action('portable-control',p,'提灯',()=>true,{portable:true,priority:-10}),scene.action('nearby-object',{x:p.x+12,y:p.y},'近处物件',()=>true)];
assert.equal(runtime.getInteraction().action,'nearby-object');scene.actions=actions;
const cached=runtime._activeScenes();game.dungeon.active={id:'unrelated'};
assert.equal(runtime._activeScenes().length,0,'unrelated interiors have no surface actors/actions');
game.dungeon.active=null;assert.notEqual(runtime._activeScenes(),cached,'scene context changes invalidate the active cache');
game.dispose();assert.equal(runtime._activeScenes().length,0);
console.log('Sidequest runtime passed: 9 authored worlds, 25 available quests, 18 explicit acceptances, paused state, choices, map isolation and portable priority.');
