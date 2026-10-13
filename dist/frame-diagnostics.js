// Optional, local-only frame capture. CPU timings are supplied by the caller;
// this module does not touch the DOM, storage, network, or animation scheduling.
export const FRAME_SAMPLE_CAPACITY = 4096;
const REPORT_LIMIT = 6;
const MODE_LABELS = Object.freeze({default:'默认', 'hud-off':'关闭 HUD 更新', 'lights-off':'关闭光照与阴影'});
const nonnegative = value => Number.isFinite(value) && value > 0 ? value : 0;
const fixed = value => value.toFixed(2);

function stats(values, count, percentile = false) {
  let sum = 0, maxMs = 0;
  for (let i = 0; i < count; i++) { sum += values[i]; maxMs = Math.max(maxMs, values[i]); }
  const result = {meanMs:sum / count, maxMs};
  if (percentile) result.p95Ms = values.slice(0, count).sort()[Math.ceil(count * .95) - 1];
  return result;
}

function copyMetadata(metadata) {
  // Capture the settings at start, so later viewport changes cannot relabel a
  // finished result. App metadata is plain JSON; reject unsupported values.
  try { return JSON.parse(JSON.stringify(metadata ?? {})); } catch { return {}; }
}

export class FrameDiagnostics {
  constructor({durationMs = 15000} = {}) {
    this.durationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 15000;
    this.mode = 'default';
    this.reports = [];
    this.running = false;
    this._last = null;
    this._buffers = Object.fromEntries(['raf','cpu','update','render','hud'].map(key => [key, new Float64Array(FRAME_SAMPLE_CAPACITY)]));
    this._clearCapture();
  }

  get hudDisabled() { return this.mode === 'hud-off'; }
  get lightsDisabled() { return this.mode === 'lights-off'; }

  setMode(mode) {
    if (!Object.hasOwn(MODE_LABELS, mode)) return false;
    if (mode !== this.mode) { this.cancel(); this.mode = mode; }
    return true;
  }

  _clearCapture() {
    this._last = null; this._count = 0; this._elapsed = 0;
    this._moving = 0; this._over25 = 0; this._over50 = 0;
    this._metadata = {}; this._startedAt = null;
  }

  start(metadata = {}) {
    this.cancel();
    this._metadata = copyMetadata(metadata);
    this._startedAt = new Date().toISOString();
    this.running = true;
  }

  breakContinuity() { this._last = null; }

  cancel() { this.running = false; this._clearCapture(); }

  reset() { this.cancel(); this.reports.length = 0; this.mode = 'default'; }

  sample(now, {active = false, updateMs = 0, renderMs = 0, hudMs = 0, totalMs = 0, moving = false} = {}) {
    if (!this.running) return null;
    if (!active || !Number.isFinite(now)) { this.breakContinuity(); return null; }
    const previous = this._last;
    this._last = now;
    // Both endpoints must belong to continuous active frames. The first frame
    // after starting/resuming establishes a baseline, excluding the pause gap.
    if (previous === null || now <= previous) return null;
    const elapsed = now - previous, i = this._count++;
    this._buffers.raf[i] = elapsed;
    this._buffers.cpu[i] = nonnegative(totalMs);
    this._buffers.update[i] = nonnegative(updateMs);
    this._buffers.render[i] = nonnegative(renderMs);
    this._buffers.hud[i] = nonnegative(hudMs);
    this._elapsed += elapsed;
    if (moving) this._moving++;
    if (elapsed > 25) this._over25++;
    if (elapsed > 50) this._over50++;
    if (this._elapsed >= this.durationMs) return this._finish('duration');
    if (this._count >= FRAME_SAMPLE_CAPACITY) return this._finish('capacity');
    return null;
  }

  stop() { return this.running ? this._finish('manual') : null; }

  _finish(reason) {
    if (!this._count) { this.cancel(); return null; }
    const report = {
      mode:this.mode, modeLabel:MODE_LABELS[this.mode], reason,
      startedAt:this._startedAt, metadata:this._metadata,
      samples:this._count, activeMs:this._elapsed, fps:this._count * 1000 / this._elapsed,
      raf:{...stats(this._buffers.raf, this._count, true), over25:this._over25, over50:this._over50},
      cpu:stats(this._buffers.cpu, this._count, true),
      update:stats(this._buffers.update, this._count),
      render:stats(this._buffers.render, this._count),
      hud:stats(this._buffers.hud, this._count),
      movingRatio:this._moving / this._count,
    };
    if (this.reports.length >= REPORT_LIMIT) this.reports.shift();
    this.reports.push(report);
    this.cancel();
    return report;
  }

  summaryText(report) {
    if (!report) return '暂无有效采样';
    const {raf,cpu,update,render,hud} = report;
    const ending = {duration:'采样完成', manual:'手动结束', capacity:'已达样本上限'}[report.reason] || '采样结束';
    return [
      `${report.modeLabel} · ${ending} · ${(report.activeMs / 1000).toFixed(1)} 秒 · ${report.samples} 帧 · ${report.fps.toFixed(1)} FPS`,
      `RAF 间隔：均值 ${fixed(raf.meanMs)} / P95 ${fixed(raf.p95Ms)} / 最大 ${fixed(raf.maxMs)} ms`,
      `长帧：>25 ms ${raf.over25} 次 / >50 ms ${raf.over50} 次；移动样本 ${(report.movingRatio * 100).toFixed(0)}%`,
      `完整回调 CPU：均值 ${fixed(cpu.meanMs)} / P95 ${fixed(cpu.p95Ms)} / 最大 ${fixed(cpu.maxMs)} ms`,
      `U 逻辑：${fixed(update.meanMs)} / ${fixed(update.maxMs)} ms；D 绘制提交：${fixed(render.meanMs)} / ${fixed(render.maxMs)} ms`,
      `HUD：${fixed(hud.meanMs)} / ${fixed(hud.maxMs)} ms（以上分项为均值 / 最大）`,
      'HUD 已计入完整回调 CPU；其中逻辑阶段触发的 HUD 也计入 U，不能相加。D 不含 GPU 和浏览器合成耗时。',
    ].join('\n');
  }

  exportText() {
    if (!this.reports.length) return '荒野回响性能诊断：暂无已完成的有效采样。';
    return ['荒野回响性能诊断（仅本次页面会话，未上传）', ...this.reports.map((report, i) => [
      `第 ${i + 1} 组 · ${report.startedAt}`,
      this.summaryText(report),
      `采样环境：${JSON.stringify(report.metadata, null, 2)}`,
    ].join('\n'))].join('\n\n');
  }
}
