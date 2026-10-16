import { clamp, line, oval } from './drawing.js';

const INK = '#2e4648';
const smooth = n => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };

// Each spine is two continuous cubic curves. Their outlines are filled,
// tapered ribbons: no stroked segments or joint discs form an arm.
const ARMS = Object.freeze([
  { back: true, side: -1, width: 13, phase: 0, points: [[-20, 1], [-34, -13], [-55, -6], [-58, 7], [-60, 17], [-47, 18], [-49, 9]] },
  { back: true, side: -1, width: 11, phase: Math.PI, points: [[-10, 5], [-23, 1], [-34, 10], [-34, 19], [-34, 28], [-22, 24], [-26, 17]] },
  { back: true, side: 1, width: 11, phase: 0, points: [[10, 5], [23, 0], [36, 10], [36, 21], [36, 28], [26, 26], [28, 18]] },
  { back: true, side: 1, width: 13, phase: Math.PI, points: [[20, 0], [37, -13], [56, -10], [59, 4], [62, 15], [49, 19], [50, 10]] },
  { back: false, side: -1, width: 15, phase: Math.PI * .5, points: [[-21, 7], [-33, 10], [-28, 33], [-44, 34], [-60, 36], [-62, 19], [-51, 22]] },
  { back: false, side: 1, width: 15, phase: Math.PI * 1.5, points: [[20, 9], [31, 12], [28, 29], [43, 30], [58, 33], [60, 19], [50, 20]] },
  { back: false, side: -1, width: 15, phase: Math.PI * 1.5, points: [[-8, 11], [-10, 22], [-12, 33], [-23, 35], [-35, 37], [-37, 29], [-28, 28]] },
  { back: false, side: 1, width: 15, phase: Math.PI * .5, points: [[7, 12], [9, 21], [9, 33], [19, 35], [32, 37], [39, 30], [29, 27]] }
]);

function state(p, pose) {
  const mode = pose.mode || (p ? 'move' : 'idle');
  const progress = clamp(pose.progress || 0, 0, 1);
  const cycle = Number.isFinite(pose.cycle) ? pose.cycle : Math.asin(clamp(p, -1, 1));
  return { mode, progress, cycle, action: pose.action || '',
    moving: pose.moving ?? (mode === 'move' || mode === 'rush'),
    prepare: mode === 'windup' ? smooth(progress) : 0,
    release: mode === 'active' || mode === 'rush' ? 1 : 0,
    rest: mode === 'recovery' ? 1 - smooth(progress) : 0,
    hit: mode === 'hit' ? 1 - smooth(progress) : 0 };
}

function shape(c, draw, fill, width = 1.5, stroke = INK) {
  c.beginPath(); draw(c); c.closePath(); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function cubic(points, t) {
  const segment = t < .5 ? 0 : 3, q = t < .5 ? t * 2 : (t - .5) * 2;
  const [a, b, d, e] = points.slice(segment, segment + 4), u = 1 - q;
  return [u * u * u * a[0] + 3 * u * u * q * b[0] + 3 * u * q * q * d[0] + q * q * q * e[0],
    u * u * u * a[1] + 3 * u * u * q * b[1] + 3 * u * q * q * d[1] + q * q * q * e[1]];
}

function outline(c, left, right, fill, stroke, width, tip = null) {
  c.beginPath(); c.moveTo(...left[0]);
  for (let i = 1; i < left.length - 1; i++) {
    c.quadraticCurveTo(...left[i], (left[i][0] + left[i + 1][0]) * .5, (left[i][1] + left[i + 1][1]) * .5);
  }
  c.quadraticCurveTo(...left.at(-1), ...right.at(-1));
  if (tip) c.lineTo(tip[0], tip[1]);
  for (let i = right.length - 2; i > 0; i--) {
    c.quadraticCurveTo(...right[i], (right[i][0] + right[i - 1][0]) * .5, (right[i][1] + right[i - 1][1]) * .5);
  }
  c.lineTo(...right[0]); c.closePath(); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

// World-space strike geometry keeps the caller's quadratic centerline and
// exact captured endpoint. It changes only the continuous painted surface.
export function paintAttackArm(c, a, b, d, width, { back = false, suckers = true } = {}) {
  const left = [], right = [], innerLeft = [], innerRight = [];
  const thickness = Number.isFinite(width) ? Math.max(0, width) : 0;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, u = 1 - t;
    const x = u * u * a[0] + 2 * u * t * b[0] + t * t * d[0];
    const y = u * u * a[1] + 2 * u * t * b[1] + t * t * d[1];
    const dx = 2 * u * (b[0] - a[0]) + 2 * t * (d[0] - b[0]);
    const dy = 2 * u * (b[1] - a[1]) + 2 * t * (d[1] - b[1]);
    const length = Math.max(.001, Math.hypot(dx, dy)), nx = -dy / length, ny = dx / length;
    const r = thickness * .5 * Math.pow(u, .85);
    left.push([x + nx * r, y + ny * r]); right.push([x - nx * r, y - ny * r]);
    if (i < 14) {
      innerLeft.push([x + nx * r * .65, y + ny * r * .65]);
      innerRight.push([x + nx * r * .03, y + ny * r * .03]);
    }
  }
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  outline(c, left, right, back ? '#517e86' : '#6b9f9e', INK, 1.5, d);
  // The legacy density option now controls the broad underside accent;
  // neither setting introduces sucker beads or disconnected joints.
  if (suckers) outline(c, innerLeft, innerRight, back ? '#8bb3ad' : '#bed0b7', null, 0);
  c.restore();
}

function arm(c, def, s, bodyY) {
  const isStrike = s.action === 'tentacles', isWave = s.action === 'tidalWave', isVortex = s.action === 'vortex';
  const wind = s.prepare + s.rest * .6;
  const curl = isVortex ? s.prepare + s.release + s.rest * .7 : 0;
  const lift = isStrike ? wind * (def.back ? 12 : 23) : isWave ? wind * 14 : curl * 12;
  const spread = isWave ? s.prepare * 1.7 + s.release * 2.6 + s.rest : isStrike ? s.release * 2.6 : 0;
  const gait = s.cycle + def.phase;
  const stride = s.moving ? Math.sin(gait) * 3.2 : 0;
  const stepLift = s.moving ? Math.max(0, Math.cos(gait)) * 3.4 : 0;
  const left = [], right = [], innerLeft = [], innerRight = [];
  // Twelve intervals retain broad natural bends even in the small runtime
  // cache. Width fades smoothly all the way through the returning tip.
  const centers = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, point = cubic(def.points, t), reach = Math.pow(t, .85);
    point[0] += def.side * (spread * reach - curl * 8 * t * t) + stride * reach;
    point[1] += bodyY * (1 - t) - (lift + stepLift) * smooth(t);
    // The strike opens the curled end while keeping the real ground effect
    // and its captured world targets entirely in the existing attack code.
    if (isStrike && s.release) {
      point[0] += def.side * s.release * Math.max(0, t - .5) * 3;
      point[1] -= s.release * (def.back ? 2 : 1.2) * reach;
    }
    centers.push(point);
  }
  for (let i = 0; i < centers.length; i++) {
    const t = i / 12, p = centers[i], before = centers[Math.max(0, i - 1)], after = centers[Math.min(12, i + 1)];
    const dx = after[0] - before[0], dy = after[1] - before[1], length = Math.max(.001, Math.hypot(dx, dy));
    const nx = -dy / length, ny = dx / length;
    const r = def.width * .5 * Math.pow(1 - t, 1.5) + .3;
    left.push([p[0] + nx * r, p[1] + ny * r]);
    right.push([p[0] - nx * r, p[1] - ny * r]);
    // One broad underside strip replaces rows of sucker-like beads. It is
    // inset on both edges and stops before the fine tip becomes a hairline.
    if (i < 10) {
      const offset = (def.side < 0 ? -.3 : .3) * r;
      const half = r * .31;
      innerLeft.push([p[0] + nx * (offset + half), p[1] + ny * (offset + half)]);
      innerRight.push([p[0] + nx * (offset - half), p[1] + ny * (offset - half)]);
    }
  }
  outline(c, left, right, def.back ? '#517e86' : '#6b9f9e', INK, def.back ? 1.35 : 1.65);
  outline(c, innerLeft, innerRight, def.back ? '#8bb3ad' : '#bed0b7', null, 0);
}

function mantle(c) {
  // A single pear-shaped head sac, with a full rounded crown and a low,
  // continuous cheek. There are no antlers, crown points or separate orbs.
  shape(c, c => {
    c.moveTo(-25, 1);
    c.bezierCurveTo(-33, -13, -31, -34, -22, -46);
    c.bezierCurveTo(-16, -55, -10, -59.2, 1, -59.2);
    c.bezierCurveTo(19, -59.2, 30, -43, 31, -25);
    c.bezierCurveTo(33, -8, 28, 4, 17, 10);
    c.quadraticCurveTo(-8, 17, -25, 1);
  }, '#659b9c', 1.7);
  shape(c, c => {
    c.moveTo(-22, -43); c.bezierCurveTo(-29, -26, -27, -6, -16, 5);
    c.quadraticCurveTo(-8, 11, 4, 10); c.quadraticCurveTo(-21, 15, -26, -5);
    c.quadraticCurveTo(-31, -29, -22, -43);
  }, '#4e7d83', .7, null);
  shape(c, c => {
    c.moveTo(-19, -43); c.quadraticCurveTo(-10, -56, 2, -55.5);
    c.quadraticCurveTo(17, -55, 23, -39); c.quadraticCurveTo(8, -46, -7, -39);
    c.quadraticCurveTo(-15, -35, -19, -43);
  }, '#86b4ac', .7, null);
}

function face(c, s) {
  shape(c, c => {
    c.moveTo(-19, -15); c.quadraticCurveTo(-10, -21, -3, -16);
    c.quadraticCurveTo(11, -23, 22, -14); c.quadraticCurveTo(29, -6, 22, 5);
    c.quadraticCurveTo(11, 15, -3, 11); c.quadraticCurveTo(-18, 8, -19, -15);
  }, '#b8cdb6', .85, '#537a75');
  // The nearer eye is lower and larger. Both sit on the same turned face.
  oval(c, -10.8, -11.5, 4.7, 6.1, '#dce0bc');
  oval(c, 11.6, -8.8, 6.8, 7.7, '#e6e4bd');
  const blink = s.hit > .2 ? .75 : 1;
  oval(c, -10.1, -11.1, 2.8, 1.5 * blink, '#29474b');
  oval(c, 12.2, -8.3, 4, 1.85 * blink, '#29474b');
  oval(c, 12.9, -9, .7, .6, '#f4edcb');
  line(c, [[-15.3, -15.7 + s.prepare], [-8.2, -16.7]], '#46706e', 1.4);
  line(c, [[5.8, -14.4 + s.prepare * 1.5], [16.8, -15.4]], '#46706e', 1.7);
  // A single off-center siphon joins the underside of the head; its oval
  // opening gives the face depth without implying a human mouth or nose.
  shape(c, c => {
    c.moveTo(11, 1.4); c.quadraticCurveTo(18, -1, 23, 4.3);
    c.quadraticCurveTo(26, 8.4, 21.1, 11); c.quadraticCurveTo(16.4, 12.2, 12.8, 7.5);
  }, '#83aaa0', 1.2);
  oval(c, 21.5, 7.4, 2.7, 2, '#365b60', -.45);
  line(c, [[15.4, 2.6], [19.5, 3.5]], '#d4ddbf', 1);
}

export function paint(c, p, flip = 1, pose = {}) {
  const s = state(p, pose);
  const bodyY = (s.moving ? -Math.abs(Math.sin(s.cycle * 2)) * .45 : 0) + s.prepare * .7 + s.release * .3;
  const bodyX = s.hit * -1.3 + (s.moving ? Math.sin(s.cycle) * .45 : 0);
  c.save(); c.scale(flip, 1); c.lineCap = 'round'; c.lineJoin = 'round';
  for (const def of ARMS) if (def.back) arm(c, def, s, bodyY);
  c.save(); c.translate(bodyX, bodyY); c.scale(1 + s.prepare * .025 - s.hit * .025, 1 - s.prepare * .04 - s.hit * .025);
  mantle(c); c.restore();
  for (const def of ARMS) if (!def.back) arm(c, def, s, bodyY);
  c.save(); c.translate(bodyX, bodyY); c.scale(1 + s.prepare * .025 - s.hit * .025, 1 - s.prepare * .04 - s.hit * .025);
  face(c, s); c.restore();
  c.restore();
}

export default Object.freeze({ paint });
