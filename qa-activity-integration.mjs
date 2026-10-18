import assert from 'node:assert/strict';
import {harness} from './qa-app-harness.mjs';
import {ActivityLog,formatActivityLog} from './dist/activity-log.js';

function logger(){return new ActivityLog({storage:{load:async()=>[],write:async()=>{}},setTimer:()=>0,clearTimer:()=>{}});}
for(const debug of [false,true]){
  const log=logger();
  const {nodes,listeners,document,run,tick,flush}=harness(debug?'?debug':'',{moduleOverrides:{activityLog:log}});
  assert.equal(run('playPerformance===null'),!debug);
  if(debug)run('selectedDebugOptions={...selectedDebugOptions,fullLoadout:true};');
  nodes['start-button'].onclick();nodes['prepare-start-button'].onclick();await flush();
  const starts=(await log.list()).filter(record=>record.kind==='start');
  assert.equal(starts.length,1);assert.equal(starts[0].status,'success');
  assert(starts[0].context.contentVersion);assert(starts[0].context.selection);assert(starts[0].context.loadout);
  run(`game.enemies=[];game._spawn=game._shot=game.nextBossAt=Infinity;game.crystalsNext=game.player.xpNext=Infinity;game.player.invuln=Infinity;`);
  for(let i=0;i<35;i++)tick();
  if(!debug){assert(!(await log.list()).some(record=>record.kind==='play'));continue;}
  // A logging modal freezes gameplay and returns pointer focus to its surface.
  nodes['activity-log-dialog'].open=true;const gameTime=run('game.runTime');tick();
  assert.equal(run('game.runTime'),gameTime);assert.equal(run('pointerFocusSurface().id'),'activity-log-dialog');
  nodes['activity-log-dialog'].open=false;tick();tick();
  listeners['window:pagehide']();
  let play=(await log.list()).find(record=>record.kind==='play');
  assert.equal(play.status,'success');assert.equal(play.details.performance.reason,'页面离开');
  assert(play.details.counts.snapshots>0);assert('simulation' in play.details.performance);
  assert.equal(play.context.diagnosticMode,'default');
  // One comparison action owns all three existing diagnostic reports.
  nodes['pause-button'].onclick();nodes['diagnostic-auto'].onclick();
  let frames=0;while(run('diagnostics.running')&&frames++<1000)tick();
  assert(frames<1000);let diagnostic=(await log.list()).find(record=>record.kind==='diagnostic');
  assert.equal(diagnostic.status,'success');assert.equal(diagnostic.details.reports.length,3);
  assert(!JSON.stringify(diagnostic).includes('[已截断]'),'full-loadout comparison retains all three groups without nested-data truncation');
  assert.deepEqual(diagnostic.details.reports.map(report=>report.mode),['default','hud-off','lights-off']);
  const group=formatActivityLog(diagnostic,{groupIndex:1});
  assert.match(group,/hud-off/);assert.match(group,/contentVersion/);assert(!group.includes('诊断组 3'));
  // Background snapshots retain partial measurements without cancelling the
  // existing resumable manual capture or polluting its completed-report list.
  nodes['diagnostic-start'].onclick();tick();tick();tick();
  const completed=run('diagnostics.reports.length');document.hidden=true;listeners['document:visibilitychange']();
  diagnostic=(await log.list()).find(record=>record.kind==='diagnostic');
  assert.equal(diagnostic.details.reports.at(-1).reason,'partial');
  assert(run('diagnostics.running'));assert.equal(run('diagnostics.reports.length'),completed);
  document.hidden=false;listeners['document:visibilitychange']();nodes['resume-button'].onclick();tick();tick();
  run("cancelDiagnosticCapture('测试取消')");
  diagnostic=(await log.list()).find(record=>record.kind==='diagnostic');
  assert.equal(diagnostic.status,'cancelled');assert.equal(diagnostic.details.reports.at(-1).reason,'cancelled');
  assert.equal(run('diagnostics.reports.length'),completed);
  // Observing an existing scripted transition preserves its result and groups
  // the source, destination, and actual fade/commit timing in one entry.
  run("game.sceneTransition.run('测试目的地',()=>true)");for(let i=0;i<30;i++)tick();
  const transition=(await log.list()).find(record=>record.kind==='transition');
  assert.equal(transition.status,'success');assert.equal(transition.details.committed,true);
  assert.equal(transition.stages.length,3);
  await log.flush();
}
console.log('Activity app integration: startup, debug-only summaries, modal pause, lifecycle snapshots, grouped comparison and scene handoff passed.');
