import assert from 'node:assert/strict';
import { EncounterArt } from './dist/encounter-art.js';
import { RelicArt } from './dist/relic-art.js';
import { beginRelicActivation, advanceRelicActivation, relicActivationStrength, drawCastleActivation } from './dist/relic-activation.js';

function recorder() {
  const calls = [], stack = [];
  let state = { globalAlpha: .7, lineWidth: 1, shadowBlur: 0, fillStyle: '#000', strokeStyle: '#000' };
  const target = { calls, save() { stack.push({ ...state }); }, restore() { assert(stack.length); state = stack.pop(); }, get depth() { return stack.length; } };
  for (const name of ['beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'closePath', 'fill', 'stroke', 'arc', 'ellipse', 'fillRect', 'translate', 'rotate', 'scale', 'setTransform', 'clip', 'drawImage']) target[name] = (...args) => {
    for (const n of args) if (typeof n === 'number') assert(Number.isFinite(n), `${name} uses finite coordinates`);
    calls.push([name, ...args, { ...state }]);
  };
  for (const name of ['createLinearGradient', 'createRadialGradient']) target[name] = () => ({ addColorStop() {} });
  return new Proxy(target, { get: (o, k) => k in o ? o[k] : state[k], set: (o, k, v) => {
    if (k === 'shadowBlur') assert.equal(v, 0, 'activation needs no runtime blur');
    if (k === 'globalAlpha') assert(v >= 0 && v <= 1);
    state[k] = v; return true;
  } });
}
const canvases = [], canvas = () => { const c = recorder(), image = { width: 0, height: 0, getContext: () => c }; canvases.push({ image, c }); return image; };
const art = new EncounterArt(canvas), relic = new RelicArt(canvas);
const hunt = { id: 'hunt', type: 'hunt', x: 34, y: 56, r: 210, state: 'ready', goal: 24, progress: 0 };
function draw(subject = hunt, encounter, time = 4) {
  const c = recorder(); art.drawGround(c, subject, { encounter, time });
  assert.equal(c.depth, 0); assert.equal(c.globalAlpha, .7); return c.calls;
}
const oldRandom = Math.random;
Math.random = () => { throw new Error('art must not consume gameplay RNG'); };
try {
  const ready = draw();
  assert(ready.some(call => call[0] === 'drawImage' && call[1] === art.cache.get('arena-crest-glow').canvas), 'ready center has a fixed faint crest');
  const active = { ...hunt, state: 'active' }, battle = { activationAge: .175, activationDuration: .7, spawnWarnings: [] };
  const center = draw(active, battle);
  assert(center.some(call => call[0] === 'drawImage' && call[1] === art.cache.get('arena-crest-glow').canvas));
  assert.equal(art.cache.has('arena-rim-glow'), false, 'rim is not drawn during the center stage');
  battle.activationAge = .525;
  const rim = draw(active, battle), rimImage = art.cache.get('arena-rim-glow').canvas;
  assert(rim.some(call => call[0] === 'drawImage' && call[1] === rimImage));
  assert(!rim.some(call => call[0] === 'drawImage' && call[1] === art.cache.get('arena-crest-glow').canvas), 'stages are sequential, not an expanding wave');
  assert.deepEqual(draw(active, battle, 9999), rim, 'activation only depends on its paused scene age');
  battle.activationAge = .7;
  assert(!draw(active, battle).some(call => call[0] === 'drawImage' && call[1] === rimImage), 'finished ritual does not replay');
  battle.spawnWarnings = [{ x: 300, y: -200, age: .2, duration: .45 }];
  assert(draw(active, battle).some(call => call[0] === 'translate' && call[1] === 300 && call[2] === -200), 'warnings remain fixed to actual spawn points');
  for (const type of ['rescue', 'rune']) {
    const site = { id: type, type, x: 20, y: 90, state: 'active' };
    beginRelicActivation(site); assert.equal(relicActivationStrength(site), 0);
    for (let i = 0; i < 7; i++) advanceRelicActivation(site, .05);
    assert(relicActivationStrength(site) > .99);
    const c = recorder(); relic.drawGround(c, site, { time: 2 });
    for (const prop of relic.props(site)) relic.drawProp(c, prop, { time: 2 });
    assert.equal(c.depth, 0); assert.equal(c.globalAlpha, .7);
    const age = site.activationAge;
    for (const dt of [0, -1, NaN, Infinity]) advanceRelicActivation(site, dt);
    assert.equal(site.activationAge, age);
    for (let i = 0; i < 8; i++) advanceRelicActivation(site, .05);
    assert.equal(relicActivationStrength(site), 0);
  }
  const castle = { type: 'castle', x: 50, y: -50, width: 240, depth: 90 };
  beginRelicActivation(castle, .35); advanceRelicActivation(castle, .05);
  const c = recorder(); assert(drawCastleActivation(c, castle)); assert.equal(c.depth, 0); assert.equal(c.globalAlpha, .7);
  assert.equal(drawCastleActivation(c, { ...castle, type: 'supply' }), false, 'ordinary buildings keep their existing feedback');
  for (const prop of art.props(active)) art.drawMarker(recorder(), prop, { time: 2 });
  const builds = art.cacheStats.builds;
  for (let frame = 0; frame < 120; frame++) { battle.activationAge = frame % 14 * .05; draw(active, battle, frame); }
  assert.equal(art.cacheStats.builds, builds, 'all arena phases share a bounded warm atlas');
  for (const atlas of [art, relic]) assert(atlas.cacheStats.bytes <= atlas.cacheStats.limitBytes);
  for (const { c } of canvases) assert.equal(c.depth, 0, 'cached paint also restores its context');
} finally { Math.random = oldRandom; }
console.log('Relic activation: fixed sequential crest/rim, world-fixed spawn warnings, scene-owned ages, bounded warm atlases, no runtime blur, restored graphics state and selective castle/rescue/rune cues passed.');
