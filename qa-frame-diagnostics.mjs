import assert from 'node:assert/strict';
import {FrameDiagnostics, FRAME_SAMPLE_CAPACITY} from './dist/frame-diagnostics.js';

const active = {active:true, updateMs:2, renderMs:4, hudMs:1, totalMs:8, moving:true};
function capture(gaps, durationMs = 500) {
  const d = new FrameDiagnostics({durationMs}); d.start(); d.sample(0, active);
  let now = 0, report;
  for (let i = 0; i < 1000 && !report; i++) { now += gaps[i % gaps.length]; report = d.sample(now, active); }
  assert(report); return report;
}

// A mean FPS counter cannot distinguish these two pacing patterns.
const smooth = capture([50 / 3]), uneven = capture([8,12,30]);
assert.equal(Math.round(smooth.fps), 60); assert.equal(Math.round(uneven.fps), 60);
assert(uneven.raf.p95Ms > smooth.raf.p95Ms); assert.equal(uneven.raf.maxMs, 30);
assert.equal(uneven.raf.over25, 10); assert.equal(uneven.raf.over50, 0);
assert.deepEqual(uneven.cpu, {meanMs:8, maxMs:8, p95Ms:8});
assert.deepEqual(uneven.hud, {meanMs:1, maxMs:1});

const d = new FrameDiagnostics();
const metadata = {version:'v-test', viewport:{width:1440,height:900}, browser:'test'};
d.start(metadata); metadata.viewport.width = 1;
assert.equal(d.sample(100, active), null);
d.sample(116, active); d.sample(1000, {...active, active:false});
assert.equal(d.sample(5000, active), null);
d.sample(5020, {...active, moving:false});
d.breakContinuity(); assert.equal(d.sample(9000, active), null);
d.sample(9051, active);
const partial = d.stop();
assert.equal(partial.samples, 3); assert.equal(partial.activeMs, 87);
assert.equal(partial.raf.over25, 1); assert.equal(partial.raf.over50, 1);
assert.equal(partial.movingRatio, 2 / 3); assert.equal(partial.reason, 'manual');
assert.equal(partial.metadata.viewport.width, 1440); assert.equal(d.running, false);
assert.equal(d.stop(), null); assert.equal(d.reports.length, 1);

// Count only continuous active time; a resumed sample starts a new baseline.
d.start(); d.sample(0, active);
let finished;
for (let i = 1; i <= 150; i++) finished = d.sample(i * 100, active);
assert.equal(finished.reason, 'duration'); assert.equal(finished.activeMs, 15000);
assert.equal(d.running, false); assert.equal(d.reports.length, 2);

d.start(); d.sample(0, active); d.sample(10, active);
assert.equal(d.setMode('hud-off'), true); assert.equal(d.running, false);
assert.equal(d.reports.length, 2); assert.equal(d.hudDisabled, true); assert.equal(d.lightsDisabled, false);
d.start(); d.sample(0, active); d.sample(20, active);
const hud = d.stop(); assert.equal(hud.mode, 'hud-off'); assert.equal(hud.samples, 1);
assert.equal(d.setMode('invalid'), false); assert.equal(d.mode, 'hud-off');
d.setMode('lights-off'); assert.equal(d.hudDisabled, false); assert.equal(d.lightsDisabled, true);
d.start(); d.cancel(); assert.equal(d.mode, 'lights-off'); assert.equal(d.reports.length, 3);

// High-frequency input has a hard memory bound even before 15 seconds elapse.
d.start(); d.sample(0, active);
let capacityReport;
for (let i = 1; i <= FRAME_SAMPLE_CAPACITY; i++) capacityReport = d.sample(i, active);
assert.equal(capacityReport.reason, 'capacity'); assert.equal(capacityReport.samples, FRAME_SAMPLE_CAPACITY);
assert.equal(d.running, false); assert.equal(d.sample(FRAME_SAMPLE_CAPACITY + 1, active), null);
for (let i = 0; i < 9; i++) { d.start(); d.sample(0, active); d.sample(10, active); d.stop(); }
assert.equal(d.reports.length, 6);
assert.match(d.summaryText(hud), /HUD 已计入完整回调 CPU/);
assert.match(d.summaryText(hud), /D 不含 GPU/);
assert.match(d.exportText(), /采样环境/);

d.reset(); assert.equal(d.mode, 'default'); assert.equal(d.reports.length, 0); assert.equal(d.running, false);
d.start(); assert.equal(d.stop(), null); assert.equal(d.reports.length, 0);
d.start(); d.sample(100, active); d.sample(90, active); d.sample(NaN, active);
d.sample(1000, active); d.sample(1010, {...active, updateMs:NaN, renderMs:-1, hudMs:Infinity, totalMs:-3});
const invalid = d.stop(); assert.equal(invalid.samples, 1); assert.equal(invalid.cpu.meanMs, 0);
assert.equal(invalid.update.maxMs, 0); assert.equal(invalid.render.maxMs, 0); assert.equal(invalid.hud.maxMs, 0);
console.log('Frame diagnostics: pacing percentiles, pause continuity, duration, mode isolation, bounded capture/history and local text report passed.');
