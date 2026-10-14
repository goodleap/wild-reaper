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
    return this.dirty || this.isLive(state) || !this.lastState || sceneKeys.some(key => state[key] !== this.lastState[key]);
  }
  commit(state) { this.lastState = { ...state }; this.dirty = false; }
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
