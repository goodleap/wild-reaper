import {FRAME_SAMPLE_CAPACITY} from './frame-diagnostics.js';
import {normalizeFrameRate} from './render-performance.js';

// Instantiated by debug mode only. Frame sampling has fixed memory usage and
// never writes storage; only completed/exceptional summaries reach the log.
export const ACTIVITY_PERFORMANCE_CAPACITY = FRAME_SAMPLE_CAPACITY;
const METRICS = ['raf', 'cpu', 'update', 'render', 'hud', 'simulation', 'auxiliary', 'lighting'];
const COUNT_KEYS = ['enemies', 'companions', 'sceneUnits', 'screenUnits', 'projectiles', 'effects', 'abilityEffects'];
const COUNT_INTERVAL_MS = 1000;
const WINDOW_MS = 5000;
const WARNING_INTERVAL_MS = 30000;
const nonnegative = value => Number.isFinite(value) && value > 0 ? value : 0;
const NOTES = Object.freeze([
  '所有耗时单位均为 ms；raf 是相邻有效绘制帧的间隔（包含限帧等待），CPU 是提交该帧的完整回调耗时。',
  'simulation（核心模拟）和 auxiliary（辅助逻辑）是 update（逻辑）的子项；HUD 与逻辑可能重叠，不能相加。',
  'lighting（光影提交）是 render（绘制提交）的子项，不能重复相加；render 不含完整 GPU 和浏览器合成耗时。',
  '数量为每秒读取已有缓存的快照均值/峰值，可能遗漏两个快照之间的短暂峰值。',
]);

function copyContext(context) {
  try { return JSON.parse(JSON.stringify(context() ?? {})); } catch { return {}; }
}

export class ActivityPerformance {
  constructor({log, context = () => ({}), counts = () => ({}), durationMs = 30000} = {}) {
    this.log = log;
    this.context = context;
    this.counts = counts;
    this.durationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 30000;
    this._buffers = METRICS.map(() => new Float64Array(ACTIVITY_PERFORMANCE_CAPACITY));
    this._sums = new Float64Array(METRICS.length);
    this._max = new Float64Array(METRICS.length);
    this._countSums = new Float64Array(COUNT_KEYS.length);
    this._countPeaks = new Float64Array(COUNT_KEYS.length);
    this._id = null;
    this._lastWarningAt = -Infinity;
    this._clear();
  }

  get id() { return this._id; }

  _clearWindow() {
    this._windowMs = 0; this._windowSamples = 0;
    this._windowCpu = 0; this._windowCpuMax = 0;
    this._windowOver25 = 0; this._windowOver50 = 0; this._windowLate = 0; this._windowCpuOverBudget = 0;
  }

  _clear() {
    this._id = null; this._last = null; this._count = 0; this._index = 0;
    this._elapsed = 0; this._moving = 0; this._over25 = 0; this._over50 = 0; this._warnings = 0;
    this._sums.fill(0); this._max.fill(0);
    this._countSums.fill(0); this._countPeaks.fill(0);
    this._countSnapshots = 0; this._lastCountAt = null;
    this._clearWindow();
  }

  _begin(now) {
    const context = copyContext(this.context);
    this._frameBudget = 1000 / normalizeFrameRate(context.targetFps);
    this._id = this.log.begin('play', '持续游玩', context);
    // This module never sets the current activity; the app arbitrates between
    // play, loading, and manual comparison activities.
    this._snapshotCounts(now);
  }

  _snapshotCounts(now) {
    this._lastCountAt = now;
    let values;
    try { values = this.counts() ?? {}; } catch { return; }
    for (let i = 0; i < COUNT_KEYS.length; i++) {
      const value = nonnegative(values[COUNT_KEYS[i]]);
      this._countSums[i] += value;
      if (value > this._countPeaks[i]) this._countPeaks[i] = value;
    }
    this._countSnapshots++;
  }

  _store(index, value) {
    value = nonnegative(value);
    this._buffers[index][this._index] = value;
    this._sums[index] += value;
    if (value > this._max[index]) this._max[index] = value;
    return value;
  }

  sample(now, {active = false, totalMs = 0, updateMs = 0, renderMs = 0, hudMs = 0,
    simulationMs = 0, auxiliaryMs = 0, lightingMs = 0, moving = false} = {}) {
    if (!active || !Number.isFinite(now)) return this.finish(active ? '无效时钟' : '暂停');
    if (this._last !== null && now <= this._last) {
      // A defensive clock rollback starts a new time domain; a warning from
      // the old domain must not silence this one indefinitely.
      if (now < this._last) this._lastWarningAt = -Infinity;
      const report = this.finish('时钟变化');
      this._begin(now); this._last = now;
      return report;
    }
    if (this._id === null) this._begin(now);
    const previous = this._last;
    this._last = now;
    // A first active frame after a pause/background/transition is a baseline;
    // neither its callback nor the inactive RAF gap enters a report.
    if (previous === null) return null;
    const elapsed = now - previous;
    this._store(0, elapsed);
    const cpu = this._store(1, totalMs);
    this._store(2, updateMs); this._store(3, renderMs); this._store(4, hudMs);
    this._store(5, simulationMs); this._store(6, auxiliaryMs); this._store(7, lightingMs);
    this._index = (this._index + 1) % ACTIVITY_PERFORMANCE_CAPACITY;
    this._count++; this._elapsed += elapsed;
    if (moving) this._moving++;
    if (elapsed > 25) this._over25++;
    if (elapsed > 50) this._over50++;
    this._windowSamples++; this._windowMs += elapsed; this._windowCpu += cpu;
    if (cpu > this._windowCpuMax) this._windowCpuMax = cpu;
    if (elapsed > 25) this._windowOver25++;
    if (elapsed > 50) this._windowOver50++;
    if (elapsed > this._frameBudget * 1.5 + .1) this._windowLate++;
    if (cpu > this._frameBudget) this._windowCpuOverBudget++;
    if (this._lastCountAt === null || now - this._lastCountAt >= COUNT_INTERVAL_MS) this._snapshotCounts(now);
    if (this._windowMs >= WINDOW_MS) this._checkWindow(now);
    if (this._elapsed >= this.durationMs) {
      const report = this.finish('定时摘要');
      // The boundary frame is also the baseline for the next continuous
      // segment. Explicit finish/breakContinuity still discard this baseline.
      this._last = now;
      return report;
    }
    return null;
  }

  _checkWindow(now) {
    const samples = this._windowSamples;
    const meanRafMs = this._windowMs / samples;
    const cpuMeanMs = this._windowCpu / samples;
    const rafSlow = this._windowLate >= 3 && (meanRafMs > this._frameBudget * 1.5 || this._windowLate / samples >= .2);
    const cpuSlow = this._windowCpuOverBudget >= 3 && (cpuMeanMs > this._frameBudget || this._windowCpuOverBudget / samples >= .2);
    // Require several slow frames: one isolated stall must not masquerade as
    // sustained slowness. The cooldown spans pauses and successive records.
    if (samples >= 5 && (rafSlow || cpuSlow) && now - this._lastWarningAt >= WARNING_INTERVAL_MS) {
      const classification = rafSlow ? (cpuSlow ? 'raf-and-cpu' : 'raf-only') : 'cpu-only';
      const message = classification === 'raf-and-cpu'
        ? '连续 5 秒窗口内帧间隔或长帧偏高，完整回调 CPU 也偏高；请结合逻辑、绘制分项排查。'
        : classification === 'raf-only'
          ? '连续 5 秒窗口内帧间隔或长帧偏高，完整回调 CPU 较低；可能涉及浏览器调度、绘制或刷新率，不能据此认定 GPU 瓶颈。'
          : '连续 5 秒窗口内完整回调 CPU 偏高；当前 RAF 间隔尚未持续偏慢。';
      this._lastWarningAt = now; this._warnings++;
      this.log.event(this._id, 'warning', message, {
        classification, activeMs:this._windowMs, samples, fps:samples * 1000 / this._windowMs,
        meanRafMs, targetFps:1000 / this._frameBudget, over25:this._windowOver25, over50:this._windowOver50,
        cpuMeanMs, cpuMaxMs:this._windowCpuMax,
      });
      const details = this._details('异常阶段摘要');
      this.log.update(this._id, {summary:this._summary(details.performance), details});
    }
    this._clearWindow();
  }

  _details(reason) {
    const percentileSamples = Math.min(this._count, ACTIVITY_PERFORMANCE_CAPACITY);
    const performance = {
      reason, timeUnit:'ms', samples:this._count, activeMs:this._elapsed,
      fps:this._elapsed ? this._count * 1000 / this._elapsed : 0,
      movingRatio:this._count ? this._moving / this._count : 0,
      warnings:this._warnings, percentileSamples,
      percentileScope:this._count > ACTIVITY_PERFORMANCE_CAPACITY ? 'latest' : 'all',
      percentileNote:this._count > ACTIVITY_PERFORMANCE_CAPACITY
        ? `P95 仅计算最近 ${percentileSamples} 帧；均值、最大值、长帧次数覆盖整个有效区间。`
        : 'P95、均值、最大值、长帧次数覆盖整个有效区间。',
      notes:[...NOTES],
    };
    for (let i = 0; i < METRICS.length; i++) {
      const sorted = this._buffers[i].slice(0, percentileSamples).sort();
      performance[METRICS[i]] = {
        meanMs:this._count ? this._sums[i] / this._count : 0,
        maxMs:this._max[i],
        p95Ms:percentileSamples ? sorted[Math.ceil(percentileSamples * .95) - 1] : 0,
      };
    }
    performance.raf.over25 = this._over25; performance.raf.over50 = this._over50;
    const counts = {snapshots:this._countSnapshots, intervalMs:COUNT_INTERVAL_MS};
    for (let i = 0; i < COUNT_KEYS.length; i++) counts[COUNT_KEYS[i]] = {
      mean:this._countSnapshots ? this._countSums[i] / this._countSnapshots : 0,
      peak:this._countPeaks[i],
    };
    return {performance, counts, endContext:copyContext(this.context)};
  }

  _summary(report) {
    return `${(report.activeMs / 1000).toFixed(1)} 秒 · ${report.fps.toFixed(1)} FPS · 帧间隔 P95 ${report.raf.p95Ms.toFixed(2)} ms · CPU 均值 ${report.cpu.meanMs.toFixed(2)} ms · >50 ms ${report.raf.over50} 帧`;
  }

  finish(reason = '暂停') {
    if (this._id === null) { this._last = null; return null; }
    const details = this._details(reason);
    const valid = this._count > 0;
    this.log.end(this._id, {
      status:valid ? 'success' : 'cancelled',
      summary:valid ? this._summary(details.performance) : '未形成连续有效帧采样',
      details,
    });
    this._clear();
    return valid ? details.performance : null;
  }

  breakContinuity(reason = '连续采样中断') { return this.finish(reason); }
}
