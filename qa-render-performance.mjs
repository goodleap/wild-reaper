import assert from 'node:assert/strict';
import { backingResolution, MAX_RENDER_PIXELS, RenderSchedule, FrameMetrics } from './dist/render-performance.js';

// Keep phone rendering as sharp as before; desktop pixel work has a stable cap
// without changing the dimensions used for gameplay, aiming or HUD layout.
for (const [width, height] of [[393, 717], [393, 852], [430, 932], [852, 393]]) {
  const r = backingResolution(width, height, 3);
  assert.equal(r.width, width * 2); assert.equal(r.height, height * 2);
  assert.equal(r.scaleX, 2); assert.equal(r.scaleY, 2);
}
for (const [width, height, device] of [[1512, 982, 2], [1728, 1117, 2], [2560, 1440, 2], [3840, 2160, 2], [1100.25, 700.75, 1.25], [100000, 1, 2]]) {
  const r = backingResolution(width, height, device);
  assert(r.width * r.height <= MAX_RENDER_PIXELS);
  assert(r.scaleX <= Math.min(device, 2)); assert(r.scaleY <= Math.min(device, 2));
  assert(Math.abs(width * r.scaleX - r.width) < 1e-8, 'fractional X transform exactly fills the backing canvas');
  assert(Math.abs(height * r.scaleY - r.height) < 1e-8, 'fractional Y transform exactly fills the backing canvas');
}
const desktop = backingResolution(1728, 1117, 2);
assert(desktop.width * desktop.height < 1728 * 1117 * 4 * .4, 'large desktop backing pixels drop by more than 60%');
assert.equal(backingResolution(393, 717, 1).pixelRatio, 1, 'DPR changes can update the same CSS viewport');
assert(backingResolution(3840, 2160, 2).pixelRatio < 1, 'large monitors can stay inside budget below CSS scale 1');
assert.deepEqual(backingResolution(0, NaN, NaN), {width: 1, height: 1, scaleX: 1, scaleY: 1, pixelRatio: 1});

const game = {}, scene = {}, schedule = new RenderSchedule();
const base = { game, scene, status: 'playing', paused: false, helpOpen: false, mapOpen: false, characterOpen: false, runEnded: false, hidden: false };
for (let i = 0; i < 120; i++) { assert(schedule.shouldRender(base)); schedule.commit(base); }
for (const flag of ['paused', 'helpOpen', 'mapOpen', 'characterOpen', 'runEnded']) {
  const frozen = {...base, [flag]: true};
  assert(schedule.shouldRender(frozen)); schedule.commit(frozen);
  assert.equal(schedule.shouldRender(frozen), false, `${flag} retains its final frame`);
  schedule.invalidate(); assert(schedule.shouldRender(frozen)); schedule.commit(frozen);
  assert.equal(schedule.shouldRender(frozen), false, 'resize or UI mutation redraws just once');
  assert(schedule.shouldRender(base)); schedule.commit(base);
}
for (const status of ['upgrade', 'relic', 'super', 'shop', 'dead']) {
  const frozen = {...base, status}; assert(schedule.shouldRender(frozen)); schedule.commit(frozen);
  assert.equal(schedule.shouldRender(frozen), false, `${status} skips redundant scene work`);
  assert(schedule.shouldRender({...frozen, scene: {}}), 'scene changes cannot reuse an unrelated image');
}
schedule.invalidate(); assert.equal(schedule.shouldRender({...base, hidden: true}), false, 'hidden tabs submit no canvas draws');
assert(schedule.shouldRender({...base, paused: true}), 'the pending invalidation survives a hidden tab');
const intro = {...base, game: null, scene: null, status: 'intro'};
assert(schedule.shouldRender(intro)); schedule.commit(intro);
assert(schedule.shouldRender(intro), 'the visible intro remains animated');
assert(schedule.shouldRender({...intro, helpOpen: true})); schedule.commit({...intro, helpOpen: true});
assert.equal(schedule.shouldRender({...intro, helpOpen: true}), false, 'intro help retains its background too');

for (const rate of [10, 30, 60, 120]) {
  const metrics = new FrameMetrics(); let sample;
  metrics.sample(1000);
  for (let i = 1; i <= rate; i++) sample = metrics.sample(1000 + i * 1000 / rate, {rendered: true, updateMs: 1.25, renderMs: 4.5}) ?? sample;
  assert.equal(sample.fps, rate); assert(Math.abs(sample.rafMs - 1000 / rate) < 1e-8);
  assert.equal(sample.updateMs, 1.25); assert.equal(sample.renderMs, 4.5);
}
const metrics = new FrameMetrics(); metrics.sample(0);
for (let i = 1; i < 30; i++) assert.equal(metrics.sample(i * 1000 / 60), null, 'telemetry is throttled to a half-second');
const idle = metrics.sample(500);
assert.equal(idle.fps, 0); assert(Math.abs(idle.rafMs - 1000 / 60) < 1e-8);
assert.equal(idle.updateMs, 0); assert.equal(idle.renderMs, 0);
metrics.reset(); assert.equal(metrics.sample(600000), null, 'background time is excluded after reset');
assert.equal(metrics.sample(600100, {rendered: true}), null);
console.log('Render performance: stable backing budget, exact transforms, frozen-scene invalidation, frozen-scene reuse and honest throttled CPU/RAF telemetry passed.');
