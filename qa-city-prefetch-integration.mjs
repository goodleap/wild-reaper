import assert from 'node:assert/strict';
import {harness} from './qa-app-harness.mjs';

// Real app frame scheduling and timing; tile contents/budgets are exercised by
// qa-city-ground-prefetch. A controlled clock makes hidden CPU work detectable.
for(const search of ['', '?debug']){
  const {nodes,document,run,tick,flush,resize}=harness(search);
  nodes['start-button'].onclick();
  run("selectedMode='world';selectedWorldId='clockshadow-city';selectedDebugOptions=normalizeDebugOptions({});");
  nodes['prepare-start-button'].onclick();await flush();
  assert.equal(run('game.terrain.island.layout.artStyle'),'clockshadow-renewed');
  resize(1728,874);
  assert.equal(run('cityNativeArt.painter.limitBytes'),24*1024*1024,'desktop viewport admits its visible building working set');
  resize(393,717);
  assert.equal(run('cityNativeArt.painter.limitBytes'),12*1024*1024,'shrinking the viewport restores the smaller budget');
  assert(run('cityNativeArt.painter.bytes<=cityNativeArt.painter.limitBytes'));
  run(`let qaClock=100,qaRenderCost=6,qaSamples=[],qaPreparations=[],qaDrawFlags=[];
    performance.now=()=>qaClock;
    game.update=()=>{};game.enemies=[];
    renderGame=()=>{qaDrawFlags.push(groundPrefetchActive);qaClock+=qaRenderCost;};
    worldLayoutArt.prepareGround=options=>{qaPreparations.push(options);if(options.budgetMs>=1)qaClock+=2;};
    if(playPerformance)playPerformance.sample=(now,sample)=>qaSamples.push(sample);`);
  tick();
  assert.equal(run('qaDrawFlags.at(-1)'),true,'live city draw enables candidate discovery');
  assert.equal(run('qaPreparations.at(-1).budgetMs'),3,'optional work has a 3 ms ceiling');
  assert.equal(run('groundPrefetchActive'),false,'manual/startup rendering cannot inherit live preparation');
  if(search){
    assert.equal(run('qaSamples.at(-1).renderMs'),8,'D includes the optional preparation cost');
    assert.equal(run('qaSamples.at(-1).totalMs'),8,'full callback includes the same preparation cost');
  }
  run('qaRenderCost=11.5;');tick();
  assert.equal(run('qaPreparations.at(-1).budgetMs'),.5,'busy frames offer less than admission budget');
  run('qaRenderCost=14;');tick();assert.equal(run('qaPreparations.at(-1).budgetMs'),0);
  const before=run('qaPreparations.length');
  nodes['pause-button'].onclick();tick();
  assert.equal(run('qaDrawFlags.at(-1)'),false,'one frozen redraw does no extra ground work');
  for(let i=0;i<5;i++)tick();
  assert.equal(run('qaPreparations.length'),before,'paused frames never prepare tiles');
  nodes['resume-button'].onclick();
  document.hidden=true;tick();assert.equal(run('qaPreparations.length'),before,'hidden tabs do no preparation');
  document.hidden=false;
  run('game.story={dialogueBlocking:true};renderSchedule.invalidate();');tick();
  assert.equal(run('qaPreparations.length'),before,'blocking story dialogue does no optional work');
  run('game.story=null;updateGameFrame=()=>{};game.dungeon.active={kind:"hut"};renderSchedule.invalidate();');tick();
  assert.equal(run('qaPreparations.length'),before,'interiors do not use the outdoor city cache');
  run('game.dungeon.active=null;home();');
  assert.equal(run('cityNativeArt.painter.cacheStats.bytes'),0,'returning home releases the city building cache');
}
console.log('City prefetch integration: live-only admission, remaining budget and honest D/full callback timing passed.');
