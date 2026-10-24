// Keep world coordinates independent of the canvas backing resolution.
export const MAX_RENDER_PIXELS = 3_000_000;
export function backingResolution(width, height, nativeDpr = 1, maxPixels = MAX_RENDER_PIXELS) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const deviceScale = Number.isFinite(nativeDpr) && nativeDpr > 0 ? Math.min(nativeDpr, 2) : 1;
  const budget = Number.isFinite(maxPixels) && maxPixels >= 1 ? maxPixels : MAX_RENDER_PIXELS;
  const ratio = Math.min(deviceScale, Math.sqrt(budget / (w * h)));
  const bufferWidth = Math.min(Math.floor(budget), Math.max(1, Math.floor(w * ratio)));
  const bufferHeight = Math.min(Math.floor(budget / bufferWidth), Math.max(1, Math.floor(h * ratio)));
  const scaleX = bufferWidth / w, scaleY = bufferHeight / h;
  return { width: bufferWidth, height: bufferHeight, scaleX, scaleY, pixelRatio: Math.max(scaleX, scaleY) };
}

const sceneKeys = ['game', 'scene', 'status', 'paused', 'prepareOpen', 'helpOpen', 'mapOpen', 'characterOpen', 'archiveOpen', 'runEnded', 'hidden'];
export class RenderSchedule {
  constructor() { this.dirty = true; this.lastState = null; }
  invalidate() { this.dirty = true; }
  isLive(state) {
    return !state.hidden && !state.paused && !state.prepareOpen && !state.helpOpen && !state.mapOpen && !state.characterOpen && !state.archiveOpen && !state.runEnded && (!state.game || state.status === 'playing');
  }
  shouldRender(state) {
    if (state.hidden) return false;
    return this.isLive(state) || this.needsRender(state);
  }
  needsRender(state) { return !state.hidden && (this.dirty || !this.lastState || sceneKeys.some(key => state[key] !== this.lastState[key])); }
  commit(state) { this.lastState = { ...state }; this.dirty = false; }
}

export const MAX_SIMULATION_STEP = 1 / 30;
export const MAX_FRAME_ELAPSED = .2;
const pacingKeys = [...sceneKeys, 'transition', 'dialogue'];
// Accumulate skipped display callbacks, then spend their elapsed time in
// bounded simulation steps. Pauses/scenes start a fresh clock domain.
export class FramePacer {
  constructor() { this.reset(); }
  reset() { this.last = null; this.nextAt = null; this.pending = 0; this.state = null; }
  take(now, state, {fps = 60, live = false, force = false} = {}) {
    const interval = 1000 / (fps === 30 ? 30 : 60);
    const delta = this.last === null || now < this.last ? 0 : Math.min(MAX_FRAME_ELAPSED, (now - this.last) / 1000);
    const changed = !this.state || pacingKeys.some(key => state[key] !== this.state[key]);
    this.last = now; this.state = {...state};
    if (!live || state.hidden) { this.pending = 0; this.nextAt = null; return {ready:force && !state.hidden, elapsed:0}; }
    if (changed) { this.pending = 0; this.nextAt = now; }
    this.pending = Math.min(MAX_FRAME_ELAPSED, this.pending + (changed ? Math.min(delta, interval / 1000) : delta));
    if (this.nextAt === null) this.nextAt = now;
    if (!force && now + .1 < this.nextAt) return {ready:false, elapsed:0};
    // Keep the target phase instead of rounding 60 FPS down on 90/144 Hz displays.
    if (now + .1 >= this.nextAt) this.nextAt += (Math.floor((now - this.nextAt + .1) / interval) + 1) * interval;
    const elapsed = this.pending; this.pending = 0;
    return {ready:true, elapsed};
  }
}

// Submission CPU time excludes browser compositing / GPU work. RAF cadence is
// measured separately from draws so frozen scenes never masquerade as 60 FPS.
export class FrameMetrics {
  constructor(interval = 500) { this.interval = interval; this.reset(); }
  reset() { this.last = null; this.elapsed = 0; this.callbacks = 0; this.draws = 0; this.updateMs = 0; this.renderMs = 0; }
  sample(now, { rendered = false, updateMs = 0, renderMs = 0 } = {}) {
    if (this.last === null || now < this.last) { this.last = now; return null; }
    const elapsed = now - this.last;
    this.last = now;
    if (!(elapsed > 0)) return null;
    this.elapsed += elapsed; this.callbacks++; this.draws += rendered ? 1 : 0;
    this.updateMs += Math.max(0, updateMs); this.renderMs += Math.max(0, renderMs);
    if (this.elapsed < this.interval) return null;
    const result = { fps: Math.round(this.draws * 1000 / this.elapsed), rafMs: this.elapsed / this.callbacks, updateMs: this.updateMs / this.callbacks, renderMs: this.draws ? this.renderMs / this.draws : 0 };
    this.elapsed = 0; this.callbacks = 0; this.draws = 0; this.updateMs = 0; this.renderMs = 0;
    return result;
  }
}
