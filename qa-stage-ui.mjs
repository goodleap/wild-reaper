import assert from 'node:assert/strict';
import { AdventureArchive, ARCHIVE_STORAGE_KEY } from './dist/adventure-archive.js';
import { archivePanelHTML } from './dist/archive-panel.js';
import { harness } from './qa-app-harness.mjs';

const memory=(initial={})=>{const data=new Map(Object.entries(initial));return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const run=(extra={})=>({difficulty:'normal',runTime:0,kills:0,bossKills:0,wave:1,player:{level:1},status:'playing',stage:{id:'forest-trial',completed:false,coreDefeated:false},...extra});
const finishVictory=(archive,game,time)=>{archive.begin(game);game.runTime=time;game.stage.coreDefeated=true;game.stage.completed=true;game.status='victory';return archive.finish(game,'victory');};

// Migrate the shipped archive once, retaining discoveries and all counters.
// A running older tab can continue writing its v1/v2 key without erasing v3.
{
  const oldKey='wild-echoes-adventure-archive';
  const previous={version:1,totals:{runs:12,time:900,kills:144,bossKills:3,maxLevel:9,maxWave:5},best:{normal:{time:600,kills:99,bossKills:2,level:9,wave:5}},entries:{'weapon:sword':{seen:true,acquisitions:12,maxLevel:5,branches:['heavy'],evolved:false,modifiers:{swordEnergy:2}}},legacy:{time:123,kills:45,bossKills:1}};
  const storage=memory({[oldKey]:JSON.stringify(previous)}),archive=new AdventureArchive({storage});
  assert.equal(archive.data.version,3);assert.deepEqual(archive.data.totals,previous.totals);
  assert.deepEqual(archive.data.entries['weapon:sword'],{defeats:0,...previous.entries['weapon:sword']});
  assert.deepEqual(archive.data.legacy,previous.legacy);assert(storage.data.has(ARCHIVE_STORAGE_KEY));
  const game=run(),report=finishVictory(archive,game,321);
  assert.equal(report.stageCompletion.clears,1);assert.equal(report.stageCompletion.bestTime,321);
  archive.finish(game,'victory');archive.finish(game,'quit');archive.checkpoint(game,{force:true});
  assert.equal(archive.data.stages['forest-trial'].normal.clears,1,'finish/home/pagehide do not duplicate a clear');
  assert.equal(storage.data.get(oldKey),JSON.stringify(previous),'migration never destroys the source archive');
  storage.setItem(oldKey,JSON.stringify({...previous,totals:{runs:1}}));
  const reloaded=new AdventureArchive({storage});
  assert.equal(reloaded.data.totals.runs,13);assert.equal(reloaded.data.stages['forest-trial'].normal.clears,1);
  finishVictory(reloaded,run(),400);finishVictory(reloaded,run(),250);
  assert.deepEqual(reloaded.data.stages['forest-trial'].normal,{clears:3,bestTime:250},'the fastest clear is the minimum, not the survival maximum');
  finishVictory(reloaded,run({difficulty:'casual',debug:true,debugFull:true}),120);
  assert.deepEqual(reloaded.data.stages['forest-trial'].casual,{clears:1,bestTime:120},'debug participation and difficulty separation are preserved');
  const panel=archivePanelHTML(reloaded.data,{tab:'records',difficulty:'normal'});
  assert.match(panel,/关卡通关/);assert.match(panel,/森林试炼/);assert.match(panel,/4 分 10 秒/);
}

// The immediately preceding archive already has stage records. Chapter
// storage migrates those intact and leaves the old generation isolated.
{
  const oldKey='wild-echoes-adventure-archive-v2';
  const previous={version:2,totals:{runs:4,time:500,kills:75,bossKills:2,maxLevel:8,maxWave:3},stages:{'forest-trial':{normal:{clears:2,bestTime:210},casual:{clears:1,bestTime:180}}}};
  const saved=JSON.stringify(previous),storage=memory({[oldKey]:saved}),archive=new AdventureArchive({storage});
  assert.equal(archive.data.version,3);assert.deepEqual(archive.data.totals,previous.totals);assert.deepEqual(archive.data.stages,previous.stages);assert.deepEqual(archive.data.stories,{});
  assert.equal(storage.data.get(oldKey),saved);assert(storage.data.has(ARCHIVE_STORAGE_KEY));
  finishVictory(archive,run(),200);storage.setItem(oldKey,JSON.stringify({...previous,totals:{runs:0},stages:{}}));
  const reloaded=new AdventureArchive({storage});assert.equal(reloaded.data.totals.runs,5);assert.deepEqual(reloaded.data.stages['forest-trial'].normal,{clears:3,bestTime:200});
}

// An optional kill, an unentered exit, death, and quit are never victories.
{
  const archive=new AdventureArchive({storage:memory()});
  for(const reason of ['death','quit','restart']){const game=run();archive.begin(game);game.stage.coreDefeated=true;game.runTime=100;archive.finish(game,reason);}
  const unfinished=run();archive.begin(unfinished);unfinished.status='victory';archive.finish(unfinished,'victory');
  const free=run({stage:null});archive.begin(free);free.status='victory';archive.finish(free,'victory');
  assert.deepEqual(archive.data.stages,{});
  assert.equal(archive.data.totals.runs,5,'failed or abandoned runs still contribute their normal statistics');
}

const click=(h,id)=>{const target=h.nodes[id];h.listeners['document:pointerdown']?.({target,pointerType:'mouse'});target.focus();h.fire(target,'click',{detail:1});h.run(`focusNavigation.settlePointerAction({target:$(${JSON.stringify(id)}),detail:1});`);};
const quiet=h=>h.run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.regionGrace=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
const select=(h,mode)=>{h.nodes['mode-dungeon'].checked=mode==='dungeon';h.nodes['mode-world'].checked=mode==='world';h.listeners[`mode-${mode}:change`]();};
const selectForest=h=>{select(h,'dungeon');const input=h.document.getElementById('stage-forest-trial');input.checked=true;h.fire(input,'change');};

// Exercise the real title controls, HUD, result dialog and retained settings.
// Canvas is mocked by the shared harness; this is not device/rendering QA.
{
  const h=harness();assert.equal(h.nodes['mode-world'].checked,true);selectForest(h);
  click(h,'start-button');click(h,'prepare-start-button');await h.flush();quiet(h);
  assert.equal(h.run('game.stage.id'),'forest-trial');assert.equal(h.run('game.mapId'),'forest-outer');
  h.run('updateHUD();');assert.match(h.nodes['wave-label'].textContent,/核心岛/,'the objective remains visible in the narrow mobile HUD');
  h.run('openMap();');assert.equal(h.nodes['map-title'].textContent,'林间外岛');h.run('closeMap();');
  h.run("game.stage.objectives.get('forest-heart').defeated=true;game.runTime=245;game.status='playing';");h.tick();
  assert.equal(h.run('runEnded'),false,'defeating the core alone never opens the results dialog');
  h.run("game.stage.completed=true;game.status='victory';");h.tick();
  assert.equal(h.run('runEnded'),true);assert.match(h.nodes['end-title'].textContent,/森林试炼 · 通关/);
  assert.equal(h.nodes['end-time-label'].textContent,'通关用时');assert.match(h.nodes['end-archive-summary'].textContent,/通关成绩已记录/);
  assert.equal(h.run("archive.data.stages['forest-trial'].normal.clears"),1);
  click(h,'end-archive-button');assert.equal(h.run('archiveOpen'),true);h.run('closeArchive();');
  assert.equal(h.run('runEnded'),true);assert.equal(h.document.activeElement,h.nodes['end-overlay'].querySelector('[role="dialog"]'));
  click(h,'restart-button');await h.flush();quiet(h);assert.equal(h.run('game.stage.id'),'forest-trial');
  h.run("game.status='dead';");h.tick();
  assert.equal(h.nodes['end-time-label'].textContent,'存活时间');assert.doesNotMatch(h.nodes['end-title'].textContent,/通关/);
  assert.equal(h.run("archive.data.stages['forest-trial'].normal.clears"),1);
  click(h,'home-button');select(h,'world');click(h,'start-button');click(h,'prepare-start-button');await h.flush();quiet(h);
  assert.equal(h.run('game.stage'),null);assert.equal(h.run('game.difficulty'),'normal');
  h.run("game.status='dead';");h.tick();click(h,'restart-button');await h.flush();assert.equal(h.run('game.stage'),null);
  const loaded=harness('',{storage:h.storage});assert.equal(loaded.nodes['mode-world'].checked,true);
  assert.match(loaded.nodes['stage-mode-note'].textContent,/固定怪物领域/);
}

{
  const h=harness('?debug&world=beach');
  assert.equal(h.nodes['mode-world'].checked,true,'an explicit valid debug world opens its free-exploration theme');
  click(h,'start-button');click(h,'prepare-start-button');await h.flush();assert.equal(h.run('game.stage'),null);assert.equal(h.run('game.region.id'),'beach');
  h.run('home();');selectForest(h);click(h,'start-button');click(h,'prepare-start-button');await h.flush();
  assert.equal(h.run('game.stage.id'),'forest-trial');assert.equal(h.run('game.region.id'),'forest','manual stage selection overrides the debug-world default');
  assert.equal(harness('?world=beach').nodes['mode-world'].checked,true,'ordinary world query never silently changes adventure mode');
  assert.equal(harness('?debug&world=invalid').nodes['mode-world'].checked,true);
}

console.log('stage UI/archive: mode persistence, mobile objective, victory/death lifecycle, v1/v2 to v3 migration, old-tab isolation, one-shot clears, fastest time and difficulty records passed');
