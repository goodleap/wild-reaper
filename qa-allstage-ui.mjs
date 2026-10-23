import assert from 'node:assert/strict';
import { EXPEDITIONS } from './dist/expedition-definitions.js';
import { STAGES } from './dist/stage-definitions.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { harness } from './qa-app-harness.mjs';

const node=(h,id)=>h.document.getElementById(id),click=(h,id)=>h.fire(node(h,id),'click');
const selectMode=(h,mode)=>{for(const id of ['dungeon','world'])node(h,`mode-${id}`).checked=id===mode;h.fire(node(h,`mode-${mode}`),'change');};
const selectStage=(h,id)=>{for(const stage of STAGES)node(h,`stage-${stage.id}`).checked=stage.id===id;for(const expedition of EXPEDITIONS)node(h,`dungeon-${expedition.id}`).checked=false;h.fire(node(h,`stage-${id}`),'change');};
const quiet=h=>h.run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.regionGrace=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
assert.equal(STAGES.length,8);assert.deepEqual(EXPEDITIONS.map(item=>item.id),['survival','ship','moon']);
for(const stage of STAGES){
  const h=harness('',{coarse:true});click(h,'start-button');selectMode(h,'dungeon');selectStage(h,stage.id);
  assert.equal(node(h,'stage-options').children.length,11,'the eight trials and three special challenges remain available');
  const radio=node(h,`stage-${stage.id}`),portrait=radio.parentElement.children[1].children[0];
  assert.equal(portrait.getAttribute('data-world-archive-art'),`world:${stage.worldMapId}`,'the card previews the exact world map used in play');
  assert.equal(portrait.width/portrait.height,4/3);assert.equal(radio.getAttribute('aria-label'),stage.name);
  assert.equal(node(h,'stage-title').textContent,stage.name);assert(node(h,'stage-description').textContent.includes(stage.summary));
  assert.equal(node(h,'stage-description').parentElement.tagName,'DETAILS');assert(!node(h,'stage-description').parentElement.hasAttribute('open'));
  assert.doesNotMatch(node(h,'stage-kind').textContent,/岛屿|外岛|核心岛/,'the choice no longer describes a removed two-island mode');
  click(h,'prepare-start-button');await h.flush();
  const game=h.run('game');assert.equal(game.stage.id,stage.id);assert.equal(game.mapId,stage.mapId);assert.equal(game.region.id,stage.worldMapId);
  assert(game.terrain.island.layout===createRiftLayout(stage.worldMapId),'the preview and game share authored map data');assert.equal(node(h,'terrain-name').textContent,stage.sceneName);
  assert.equal(node(h,'wave-label').textContent,game.stage.objectiveLabel,'the compact HUD displays the current challenge objective');
  click(h,'map-button');assert.equal(node(h,'map-title').textContent,stage.sceneName);
  assert.doesNotMatch(node(h,'map-legend').textContent,/相邻世界|洞穴入口|矿洞|宝藏|遗迹/,'the challenge map explains its own objective without world-only interactions');click(h,'close-map');
  quiet(h);h.run('game.status="dead";');h.tick();click(h,'restart-button');await h.flush();
  assert(h.run('game')!==game,'restart creates a new Game');assert.equal(h.run('game.stage.id'),stage.id);assert.equal(h.run('game.mapId'),stage.mapId);assert.equal(h.run('game.stage.bossDefeated'),false);
  quiet(h);h.run('game.stage.bossDefeated=true;game.stage.completed=true;game.status="victory";');h.tick();
  assert.match(node(h,'end-title').textContent,new RegExp(stage.name));assert.match(node(h,'end-title').textContent,/通关/);
  assert.equal(h.run(`archive.data.stages[${JSON.stringify(stage.id)}].normal.clears`),1);h.tick();assert.equal(h.run(`archive.data.stages[${JSON.stringify(stage.id)}].normal.clears`),1,'repeated HUD updates do not add another clear');
  h.run('home();');click(h,'start-button');assert(node(h,`stage-${stage.id}`).checked);
  selectMode(h,'world');assert.equal(node(h,'stage-picker').classList.contains('hidden'),true);selectMode(h,'dungeon');assert(node(h,`stage-${stage.id}`).checked);
  const restored=harness('',{storage:h.storage,coarse:true});click(restored,'start-button');assert(node(restored,`stage-${stage.id}`).checked);assert(node(restored,'mode-dungeon').checked);
}
{
  const h=harness('?debug&world=beach');click(h,'start-button');assert(node(h,'mode-world').checked);selectMode(h,'dungeon');selectStage(h,'volcano-trial');click(h,'prepare-start-button');await h.flush();
  assert.equal(h.run('game.region.id'),'ember-realm-large','explicit challenge selection controls its terrain even in debug');
  assert.equal(h.run('game.settlements.sites.length'),0,'debug does not reintroduce world-only trial buildings');
}
console.log('All stage UI: eight cards preview their actual full maps, single-scene starts/restarts, challenge-only map legend and HUD, one-shot victory records and remembered independent selections passed (VM DOM / mocked Canvas).');
