import assert from 'node:assert/strict';
import { STAGES } from './dist/stage-definitions.js';
import { AdventureArchive, ARCHIVE_STORAGE_KEY } from './dist/adventure-archive.js';
import { archivePanelHTML } from './dist/archive-panel.js';
import { harness, html } from './qa-app-harness.mjs';

const click=(h,id)=>h.document.getElementById(id).onclick();
const selectMode=(h,mode)=>{for(const id of ['stage','free'])h.nodes[`mode-${id}`].checked=id===mode;h.listeners[`mode-${mode}:change`]();};
const selectStage=(h,id)=>{h.document.getElementById(`stage-${id}`).checked=true;h.listeners[`stage-${id}:change`]();};
const quiet=h=>h.run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.regionGrace=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
const storageFrom=data=>new Map([['wild-echoes-setup',JSON.stringify(data)]]);

assert.equal(STAGES.length,8);
assert.match(html,/主题关卡/);assert.doesNotMatch(html,/森林关卡/);

// Real title event handlers, engine construction and restart, with canvas
// mocked by the shared harness. This does not claim device/rendering QA.
for(const stage of STAGES){
  const h=harness();
  assert.equal(h.nodes['stage-options'].children.length,8);
  selectStage(h,stage.id);
  assert.equal(h.nodes['stage-title'].textContent,stage.name);
  assert.equal(h.nodes['stage-description'].textContent,stage.summary);
  assert.match(h.nodes['stage-difficulty'].textContent,new RegExp(stage.difficultyLabel));
  assert.equal(STAGES.filter(item=>h.document.getElementById(`stage-${item.id}`).checked).length,1);
  assert.equal(h.document.getElementById(`stage-${stage.id}`).getAttribute('aria-label'),stage.name);
  click(h,'start-button');click(h,'prepare-start-button');quiet(h);
  assert.equal(h.run('game.stage.id'),stage.id);assert.equal(h.run('game.mapId'),stage.startMapId);
  assert.equal(h.run('game.region.id'),stage.themeId);
  h.run('openMap();');assert.equal(h.nodes['map-title'].textContent,stage.islands[0].name);h.run('closeMap();');
  h.run('game.status="dead";');h.tick();
  click(h,'restart-button');quiet(h);
  assert.equal(h.run('game.stage.id'),stage.id,'restart repeats the current stage');
  assert.equal(h.run('game.mapId'),stage.startMapId);
  h.run('home();');
  const loaded=harness('',{storage:h.storage});
  assert.equal(loaded.document.getElementById(`stage-${stage.id}`).checked,true);
  assert.equal(loaded.nodes['mode-stage'].checked,true);
  assert.equal(loaded.nodes['stage-picker'].classList.contains('hidden'),false);
  selectMode(loaded,'free');assert.equal(loaded.nodes['stage-picker'].classList.contains('hidden'),true);
  selectMode(loaded,'stage');assert.equal(loaded.document.getElementById(`stage-${stage.id}`).checked,true);
}

// Title settings remain backward compatible and recover from stale values.
for(const initial of [{},{mode:'stage',stageId:'obsolete'}, {mode:'obsolete',stageId:[]}, {mode:'stage',stageId:null}]){
  const h=harness('',{storage:storageFrom(initial)});
  assert.equal(h.document.getElementById('stage-forest-trial').checked,true);
  click(h,'start-button');click(h,'prepare-start-button');assert.equal(h.run('game.stage.id'),'forest-trial');
}
{
  const h=harness('',{storage:new Map([['wild-echoes-setup','{invalid']])});
  assert.equal(h.document.getElementById('stage-forest-trial').checked,true);
}
{
  const h=harness('',{storage:storageFrom({mode:'free',difficulty:'casual',stageId:'snow-trial'})});
  assert.equal(h.nodes['mode-free'].checked,true);assert.equal(h.nodes['difficulty-casual'].checked,true);
  click(h,'start-button');click(h,'prepare-start-button');quiet(h);assert.equal(h.run('game.stage'),null);assert.equal(h.run('game.difficulty'),'casual');
  h.run('game.status="dead";');h.tick();click(h,'restart-button');assert.equal(h.run('game.stage'),null);
  h.run('home();');selectMode(h,'stage');click(h,'start-button');click(h,'prepare-start-button');assert.equal(h.run('game.stage.id'),'snow-trial');
  assert.equal(h.run('game.difficulty'),'casual');
}
{
  const h=harness('?debug&world=beach',{storage:storageFrom({mode:'stage',stageId:'snow-trial'})});
  assert.equal(h.nodes['mode-free'].checked,true);
  click(h,'start-button');click(h,'prepare-start-button');assert.equal(h.run('game.stage'),null);assert.equal(h.run('game.region.id'),'beach');
  h.run('home();');selectMode(h,'stage');selectStage(h,'volcano-trial');click(h,'start-button');click(h,'prepare-start-button');
  assert.equal(h.run('game.stage.id'),'volcano-trial');assert.equal(h.run('game.region.id'),'volcano');
  assert.equal(harness('?world=beach').nodes['mode-stage'].checked,true);
  assert.equal(harness('?debug&world=invalid').nodes['mode-stage'].checked,true);
}

// Existing v2 forest progress survives; each theme and difficulty keeps its
// own count and minimum clear time, with no new stage unlock requirement.
{
  const saved=new Map([[ARCHIVE_STORAGE_KEY,JSON.stringify({version:2,stages:{'forest-trial':{normal:{clears:4,bestTime:210},casual:{clears:1,bestTime:100}}}})]]);
  const storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
  const archive=new AdventureArchive({storage});
  assert.equal(archive.data.stages['forest-trial'].normal.clears,4);
  for(const [index,stage] of STAGES.entries()){
    const game={difficulty:'normal',runTime:0,kills:0,bossKills:0,wave:1,player:{level:1},status:'playing',stage:{id:stage.id,completed:false,coreDefeated:false}};
    archive.begin(game);game.runTime=300+index*10;game.stage.completed=game.stage.coreDefeated=true;game.status='victory';
    archive.finish(game,'victory');archive.finish(game,'victory');
    assert.equal(archive.data.stages[stage.id].normal.clears,stage.id==='forest-trial'?5:1);
    assert.equal(archive.data.stages[stage.id].normal.bestTime,stage.id==='forest-trial'?210:game.runTime);
  }
  const reloaded=new AdventureArchive({storage});
  assert.equal(Object.keys(reloaded.data.stages).length,8);
  assert.equal(reloaded.data.stages['forest-trial'].casual.clears,1);
  const normalPanel=archivePanelHTML(reloaded.data,{tab:'records',difficulty:'normal'});
  for(const stage of STAGES)assert(normalPanel.includes(`data-stage-record="${stage.id}"`));
  const casualPanel=archivePanelHTML(reloaded.data,{tab:'records',difficulty:'casual'});
  assert.equal((casualPanel.match(/尚未通关/g)||[]).length,7);
}

console.log('all-stage UI: eight title choices/start/restart, setup recovery/persistence, debug-world and free mode, and independent v2 archive records passed');
