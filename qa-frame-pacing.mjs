import assert from 'node:assert/strict';
import {FramePacer, MAX_SIMULATION_STEP} from './dist/render-performance.js';
import {harness} from './qa-app-harness.mjs';

const state={game:{},scene:{},status:'playing',paused:false,hidden:false};
for(const fps of [30,60,120])for(const refresh of [20,30,60,90,120,144]){
  const pacing=new FramePacer();let frames=0,elapsed=0;
  pacing.take(0,state,{fps,live:true});
  for(let i=1;i<=refresh*2;i++){
    const sample=pacing.take(i*1000/refresh,state,{fps,live:true});
    if(sample.ready){frames++;elapsed+=sample.elapsed;}
  }
  assert.equal(frames,Math.min(fps,refresh)*2,`${refresh} Hz callback cadence respects ${fps} FPS work limit`);
  assert(Math.abs(elapsed-2)<1e-8,`${refresh}/${fps} preserves elapsed time`);
}
const pacing=new FramePacer();pacing.take(0,state,{live:true});
pacing.take(8,state,{live:true});
pacing.take(10,{...state,paused:true},{live:false,force:true});
pacing.take(60_010,{...state,paused:true},{live:false});
assert(pacing.take(60_026,state,{live:true}).elapsed<=.017,'paused time is never simulated');
assert(pacing.take(120_026,state,{live:true}).elapsed<=.2,'an exceptional foreground stall has a bounded catch-up budget');

async function quiet(fps=60){
  const storage=new Map([['wild-echoes-frame-rate',String(fps)]]),h=harness('?debug',{storage});
  h.nodes['start-button'].onclick();h.nodes['prepare-start-button'].onclick();await h.flush();
  h.run(`game=new Game({terrain:new game.terrain.constructor({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
    game.enemies=[];game.regionGrace=Infinity;game._spawn=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;
    game.player.x=0;game.player.y=0;game.player.skillCooldown=5;game.viewWidth=width;game.viewHeight=height;
    let observedSteps=[],skillEdges=0,interactEdges=0;const actualUpdate=game.update.bind(game);
    game.update=(dt,input)=>{observedSteps.push(dt);if(input.skill)skillEdges++;if(input.interact)interactEdges++;return actualUpdate(dt,input);};
    keys.add('KeyD');updateHUD();framePacer.reset();`);
  h.tick(0);return h;
}
for(const [fps,refresh] of [[60,120],[30,120],[60,20],[30,20],[120,120],[120,60],[120,20],[120,144]]){
  const h=await quiet(fps),before=h.run('gameDraws');
  for(let i=0;i<refresh*2;i++)h.tick(1000/refresh);
  assert.equal(h.run('gameDraws')-before,Math.min(fps,refresh)*2);
  assert(Math.abs(h.run('game.runTime')-2)<1e-8);
  assert(Math.abs(h.run('game.player.x')-h.run('game.player.speed')*2)<1e-6,'movement does not slow down at 20 FPS');
  assert(Math.abs(h.run('game.player.skillCooldown')-3)<1e-8,'cooldowns track elapsed time');
  assert(h.run('Math.max(...observedSteps)')<=MAX_SIMULATION_STEP+1e-9);
  if(fps===30&&refresh===120)assert.equal(h.run('observedSteps.length'),60,'power saving reduces simulation updates as well as drawing');
  h.run('skillRequested=true;portalRequested=true;');h.tick(200);
  assert.equal(h.run('skillEdges'),1);assert.equal(h.run('interactEdges'),1,'a catch-up frame does not replay input pulses');
  h.nodes['pause-button'].onclick();h.tick();const stopped=h.run('game.runTime');
  h.tick(60_000);assert.equal(h.run('game.runTime'),stopped);
  h.nodes['resume-button'].onclick();h.tick();assert(h.run('game.runTime')-stopped<.034);
  h.run('game.dispose("pacing-test");');
}
// The setting belongs to the browser, not a particular run or account save.
const h=await quiet();h.nodes['pause-button'].onclick();h.nodes['pause-frame-rate-button'].onclick();
assert.equal(h.storage.get('wild-echoes-frame-rate'),'120');assert.equal(h.run('gameplayFps'),120);
assert.match(h.nodes['pause-frame-rate-button'].textContent,/高帧 120/);
assert.equal(harness('',{storage:h.storage}).run('gameplayFps'),120,'120 FPS survives a page reload');
h.nodes['pause-frame-rate-button'].onclick();
assert.equal(h.storage.get('wild-echoes-frame-rate'),'30');assert.equal(h.run('gameplayFps'),30);
assert.match(h.nodes['pause-frame-rate-button'].textContent,/省电 30/);
const reloaded=harness('',{storage:h.storage});assert.equal(reloaded.run('gameplayFps'),30);
h.nodes['pause-frame-rate-button'].onclick();
assert.equal(h.storage.get('wild-echoes-frame-rate'),'60');assert.equal(h.run('gameplayFps'),60);
assert.match(h.nodes['pause-frame-rate-button'].textContent,/流畅 60/);
for(const value of [undefined,'0','240','invalid']){
  const storage=new Map(value===undefined?[]:[['wild-echoes-frame-rate',value]]);
  assert.equal(harness('',{storage}).run('gameplayFps'),60,'missing or invalid settings keep the 60 FPS default');
}
reloaded.tick(0);const intro=reloaded.run('introDraws');
for(let i=0;i<120;i++)reloaded.tick(1000/120);
assert.equal(reloaded.run('introDraws')-intro,30,'the homepage animates at 30 FPS');

// Manual profiling counts actual submitted frames in power-saving mode.
for(const fps of [30,120]){
const profiled=await quiet(fps);profiled.nodes['pause-button'].onclick();profiled.nodes['diagnostic-start'].onclick();
profiled.run('diagnostics._captureDurationMs=1000;');
for(let i=0;i<130&&profiled.run('diagnostics.running');i++)profiled.tick(1000/120);
assert.equal(profiled.run('diagnostics.reports.length'),1);
assert(Math.abs(profiled.run('diagnostics.reports[0].fps')-fps)<1,'manual capture counts actual draws at the selected target, including its initial UI refresh');
assert.equal(profiled.run('diagnostics.reports[0].metadata.targetFps'),fps);
assert.equal(profiled.run('diagnostics.reports[0].metadata.frameSampling'),'rendered');
}
console.log('Frame pacing: 30/60/120 FPS limits, 20–144 Hz timing, mobile movement/cooldowns, single input edges, bounded pause/stall recovery, saved settings, intro and actual draw diagnostics passed.');
