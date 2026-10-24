import assert from 'node:assert/strict';
import {ActivityPerformance, ACTIVITY_PERFORMANCE_CAPACITY} from './dist/activity-performance.js';
import {ActivityLog} from './dist/activity-log.js';

const active = {active:true, totalMs:14, updateMs:6, renderMs:7, hudMs:2,
  simulationMs:4, auxiliaryMs:2, lightingMs:3, moving:true};
const countKeys = ['enemies', 'companions', 'sceneUnits', 'screenUnits', 'projectiles', 'effects', 'abilityEffects'];
function fixture(options = {}) {
  const clock = {now:0};
  const log = {records:[], writes:[], current:'another-activity',
    begin(type, title, context) {
      const id = `activity-${this.records.length + 1}`;
      this.records.push({id, type, title, context, events:[], status:'running', startedAt:clock.now});
      this.writes.push({type:'begin', id, now:clock.now}); return id;
    },
    update(id, patch) {
      Object.assign(this.records.find(record => record.id === id), patch);
      this.writes.push({type:'update', id, now:clock.now});
    },
    event(id, level, message, data) {
      this.records.find(record => record.id === id).events.push({level, message, data, at:clock.now});
      this.writes.push({type:'event', id, now:clock.now});
    },
    end(id, patch) {
      Object.assign(this.records.find(record => record.id === id), patch);
      this.writes.push({type:'end', id, now:clock.now});
    },
    setCurrent() { throw new Error('Sampling must never change the current activity'); },
  };
  const sampler = new ActivityPerformance({log, ...options});
  return {clock, log, sampler,
    frame(now, values = active) { clock.now = now; return sampler.sample(now, values); },
    advance(until, gap = 20, values = active) {
      let report = null;
      while (clock.now < until) {
        clock.now = Math.min(until, clock.now + gap);
        report = sampler.sample(clock.now, values) || report;
      }
      return report;
    },
  };
}

// A full 30-second behavior has one entry and no normal intermediate writes.
const normal = fixture();
assert.equal(normal.frame(0, {active:false}), null);
assert.equal(normal.log.records.length, 0);
assert.equal(normal.frame(0), null);
assert.equal(normal.sampler.id, normal.log.records[0].id);
normal.advance(29980);
assert.deepEqual(normal.log.writes.map(write => write.type), ['begin']);
const report = normal.frame(30000);
assert.equal(report.activeMs, 30000); assert.equal(report.samples, 1500); assert.equal(report.fps, 50);
assert.deepEqual(normal.log.writes.map(write => write.type), ['begin', 'end']);
assert.equal(normal.log.records[0].status, 'success');
assert.equal(normal.sampler.id, null); assert.equal(normal.log.current, 'another-activity');
assert.deepEqual(report.cpu, {meanMs:14, maxMs:14, p95Ms:14});
assert.deepEqual(report.update, {meanMs:6, maxMs:6, p95Ms:6});
assert.deepEqual(report.render, {meanMs:7, maxMs:7, p95Ms:7});
assert.deepEqual(report.hud, {meanMs:2, maxMs:2, p95Ms:2});
assert.deepEqual(report.simulation, {meanMs:4, maxMs:4, p95Ms:4});
assert.deepEqual(report.auxiliary, {meanMs:2, maxMs:2, p95Ms:2});
assert.deepEqual(report.lighting, {meanMs:3, maxMs:3, p95Ms:3});
assert.equal(report.timeUnit, 'ms'); assert.equal(report.movingRatio, 1);
assert.match(report.notes.join('\n'), /HUD.*重叠.*不能相加/);
assert.match(report.notes.join('\n'), /lighting.*render.*子项.*不能重复相加/);
assert.match(report.notes.join('\n'), /render 不含完整 GPU/);
assert.match(report.notes.join('\n'), /simulation.*auxiliary.*update.*子项/);
normal.frame(30020);
assert.equal(normal.log.records.length, 2);
normal.advance(60000);
assert.equal(normal.log.records[1].details.performance.activeMs, 30000, 'adjacent segments retain their shared active baseline');
assert.equal(normal.log.records[1].details.performance.samples, 1500);

// Low-rate cached snapshots are accumulated, never resampled per frame or
// traversed by the sampler. Start/end metadata stay independent of mutations.
let quantity = 2, countCalls = 0;
const context = {scene:'field', viewport:{width:1000}};
const quantities = fixture({context:() => context, counts:() => {
  countCalls++;
  return Object.fromEntries(countKeys.map(key => [key, quantity]));
}});
quantities.frame(0); quantity = 8; quantities.advance(1000); quantity = 5; quantities.advance(2000);
quantity = 100; quantities.advance(2400);
context.scene = 'forest'; context.viewport.width = 500;
const partial = quantities.sampler.finish('切换场景');
assert.equal(partial.activeMs, 2400); assert.equal(countCalls, 3);
const quantityRecord = quantities.log.records[0];
assert.deepEqual(quantityRecord.context, {scene:'field', viewport:{width:1000}});
assert.deepEqual(quantityRecord.details.endContext, {scene:'forest', viewport:{width:500}});
assert.equal(quantityRecord.details.counts.snapshots, 3); assert.equal(quantityRecord.details.counts.intervalMs, 1000);
for (const key of countKeys) assert.deepEqual(quantityRecord.details.counts[key], {mean:5, peak:8});
assert.match(partial.notes.join('\n'), /每秒.*快照均值\/峰值/);
assert.equal(quantities.sampler.finish(), null);

// Inactive callback time, pause/background gaps and the first resumed frame
// cannot leak into a play behavior, including a viewport metadata boundary.
const continuity = fixture();
continuity.frame(100); continuity.frame(120);
const first = continuity.frame(900, {...active, active:false, totalMs:900});
assert.equal(first.activeMs, 20); assert.equal(first.samples, 1);
assert.equal(continuity.sampler.id, null);
continuity.frame(100000, {...active, totalMs:500});
continuity.frame(100020, {...active, moving:false});
const second = continuity.sampler.breakContinuity('后台');
assert.equal(second.activeMs, 20); assert.equal(second.cpu.maxMs, 14); assert.equal(second.movingRatio, 0);
continuity.frame(900000, {...active, totalMs:800}); continuity.frame(900020);
const third = continuity.sampler.breakContinuity('视口变化');
assert.equal(third.activeMs, 20); assert.equal(third.cpu.maxMs, 14);
assert.equal(continuity.log.records.length, 3);
assert.deepEqual(continuity.log.records.map(record => record.details.performance.reason), ['暂停', '后台', '视口变化']);
continuity.frame(1000000); continuity.sampler.finish('暂停');
assert.equal(continuity.log.records.at(-1).status, 'cancelled', 'baseline alone is not reported as measured play');

// Five-second exception windows annotate the existing behavior. A cooldown
// crosses both 30-second record boundaries and rapid pause/resume boundaries.
const slow = fixture();
slow.frame(0); slow.advance(5000, 40);
assert.equal(slow.log.records.length, 1);
assert.equal(slow.log.records[0].events.length, 1);
assert.equal(slow.log.records[0].events[0].data.classification, 'raf-only');
assert.match(slow.log.records[0].events[0].message, /不能据此认定 GPU/);
assert.equal(slow.log.records[0].details.performance.reason, '异常阶段摘要');
slow.advance(30000, 40);
assert.equal(slow.log.records[0].events.length, 1);
assert.equal(slow.log.records[0].details.performance.reason, '定时摘要');
assert.equal(slow.log.writes.filter(write => write.type === 'update').length, 1);
slow.advance(35000, 40);
assert.equal(slow.log.records[1].events.length, 1);
assert.equal(slow.log.records[1].events[0].at - slow.log.records[0].events[0].at, 30000);
slow.sampler.finish('暂停'); slow.frame(35020); slow.advance(40020, 40);
assert.equal(slow.log.records[2].events.length, 0);

const both = fixture();
both.frame(0); both.advance(5000, 40, {...active, totalMs:30});
assert.equal(both.log.records[0].events[0].data.classification, 'raf-and-cpu');
const cpuOnly = fixture();
cpuOnly.frame(0); cpuOnly.advance(5000, 20, {...active, totalMs:30});
assert.equal(cpuOnly.log.records[0].events[0].data.classification, 'cpu-only');
const isolated = fixture();
isolated.frame(0); isolated.advance(4800, 20); isolated.frame(5000, {...active, totalMs:200});
assert.equal(isolated.log.records[0].events.length, 0, 'one isolated long frame does not imply sustained slowness');
const rollback = fixture();
rollback.frame(100000); rollback.advance(105000, 40);
assert.equal(rollback.log.records[0].events.length, 1);
rollback.frame(0); rollback.advance(5000, 40);
assert.equal(rollback.log.records[1].events.length, 1, 'clock rollback resets the warning time domain');

// P95 is numerical, unlike lexicographic sorting. Long-frame cutoffs are
// strict, and all aggregate counts span the full record.
const percentiles = fixture();
percentiles.frame(0);
for (const [gap, moving] of [[8,true], [12,true], [25,false], [50,false], [60,true]]) {
  percentiles.frame(percentiles.clock.now + gap, {...active, moving});
}
const pacing = percentiles.sampler.finish();
assert.equal(pacing.raf.p95Ms, 60); assert.equal(pacing.raf.over25, 2); assert.equal(pacing.raf.over50, 1);
assert.equal(pacing.movingRatio, .6); assert.equal(pacing.percentileScope, 'all');

// Extremely high refresh rates wrap preallocated buffers without truncating
// the requested duration. Means/maxima include older frames; P95 declares its
// bounded recent window. No raw frame data is copied into log records.
const bounded = fixture({durationMs:50000});
bounded.frame(0);
bounded.frame(1, {...active, totalMs:100});
bounded.advance(ACTIVITY_PERFORMANCE_CAPACITY * 2, 1, {...active, totalMs:4});
assert.equal(bounded.log.records.length, 1); assert.equal(bounded.log.records[0].status, 'running');
for (const buffer of bounded.sampler._buffers) assert.equal(buffer.length, ACTIVITY_PERFORMANCE_CAPACITY);
const boundedReport = bounded.sampler.finish();
assert.equal(boundedReport.samples, ACTIVITY_PERFORMANCE_CAPACITY * 2);
assert.equal(boundedReport.percentileSamples, ACTIVITY_PERFORMANCE_CAPACITY);
assert.equal(boundedReport.percentileScope, 'latest');
assert.equal(boundedReport.cpu.maxMs, 100); assert.equal(boundedReport.cpu.p95Ms, 4);
assert.equal(boundedReport.cpu.meanMs, (100 + 4 * (boundedReport.samples - 1)) / boundedReport.samples);
assert.match(boundedReport.percentileNote, /最近 4096 帧.*整个有效区间/);
const serialized = JSON.stringify(bounded.log.records[0]);
assert(!/Float64Array|rawFrames|_buffers/.test(serialized));
assert(serialized.length < 8000, 'persisted summary size is independent of the number of raw frames');

// Invalid times never poison later samples. Bad callback values are clamped;
// callback failures do not force per-frame retries or interrupt gameplay.
const invalid = fixture();
invalid.frame(0); invalid.frame(20); invalid.frame(NaN);
invalid.frame(1000); invalid.frame(1020, {active:true, totalMs:Infinity, updateMs:-1, renderMs:NaN, hudMs:-10,
  simulationMs:Infinity, auxiliaryMs:NaN, lightingMs:-5});
const invalidReport = invalid.sampler.finish();
assert.equal(invalidReport.samples, 1); assert.equal(invalidReport.activeMs, 20);
for (const key of ['cpu', 'update', 'render', 'hud', 'simulation', 'auxiliary', 'lighting']) assert.equal(invalidReport[key].meanMs, 0);
let failures = 0;
const unavailable = fixture({counts:() => { failures++; throw new Error('cache temporarily unavailable'); }});
unavailable.frame(0); unavailable.advance(1000);
assert.equal(failures, 2); unavailable.sampler.finish();
assert.equal(unavailable.log.records[0].details.counts.snapshots, 0);

// Successful performance completion must preserve an earlier runtime error
// attached to this behavior by the real log core.
let runtimeNow = 1700000000000;
const runtimeLog = new ActivityLog({storage:null, clock:() => runtimeNow,
  setTimer:() => 1, clearTimer:() => {}, sessionId:'performance-errors'});
const runtimeSampler = new ActivityPerformance({log:runtimeLog});
runtimeSampler.sample(0, active); runtimeNow += 20; runtimeSampler.sample(20, active);
const runtimeId = runtimeSampler.id;
runtimeLog.setCurrent(runtimeId);
runtimeLog.captureError(new Error('game update failed'), {phase:'simulation'});
runtimeNow += 20; runtimeSampler.sample(40, active); runtimeSampler.finish();
const runtimeRecords = await runtimeLog.list();
assert.equal(runtimeRecords.length, 1); assert.equal(runtimeRecords[0].id, runtimeId);
assert.equal(runtimeRecords[0].status, 'error', 'normal performance completion cannot downgrade runtime errors');
assert.equal(runtimeRecords[0].events.filter(event => event.level === 'error').length, 1);
assert.equal(runtimeRecords[0].details.performance.samples, 2);

const saving=fixture({context:()=>({targetFps:30,frameSampling:'rendered'})});
saving.frame(0);let savingReport;for(let i=1;i<=900;i++)savingReport=saving.frame(i*1000/30)||savingReport;
assert(Math.abs(savingReport.fps-30)<.01);
assert.equal(saving.log.records[0].events.length,0,'intentional 30 FPS does not generate sustained-slowness warnings');

const highFrame=fixture({context:()=>({targetFps:120,frameSampling:'rendered'})});
highFrame.frame(0,{...active,totalMs:4});
highFrame.advance(5000,1000/120,{...active,totalMs:4});
assert.equal(highFrame.log.records[0].events.length,0,'normal 120 FPS cadence fits the selected budget');
highFrame.advance(10020,1000/120,{...active,totalMs:12});
assert.equal(highFrame.log.records[0].events[0].data.classification,'cpu-only','12 ms CPU exceeds the 120 FPS frame budget');
assert(Math.abs(highFrame.log.records[0].events[0].data.targetFps-120)<1e-8);

console.log('Activity performance: bounded continuous sampling, 30-second summaries, one-second counts, pause/background isolation, merged throttled warnings, selected FPS budget, and timing hierarchy passed.');
