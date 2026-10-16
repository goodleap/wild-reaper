import { clamp, line, oval } from './drawing.js';

const INK = '#344b46';
const smooth = n => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
function shape(c, draw, fill, width = 1.3, stroke = INK) {
  c.beginPath(); draw(c); c.closePath(); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function animation(p, pose) {
  const mode = pose.mode || 'move', t = clamp(pose.progress || 0, 0, 1);
  const cycle = Number.isFinite(pose.cycle) ? pose.cycle : Math.asin(clamp(p, -1, 1));
  return { mode, t, cycle, beat: Math.sin(cycle), curl: Math.cos(cycle),
    wind: mode === 'windup' ? smooth(t) : 0,
    release: mode === 'active' || mode === 'rush' ? 1 : 0,
    settle: mode === 'recovery' ? 1 - smooth(t) : 0,
    hit: mode === 'hit' ? 1 - smooth(t) : 0 };
}

function wing(c, side, a) {
  const fold = a.wind * .6 + a.release * .74 + a.settle * .18;
  const reach = 36 - Math.max(0, a.beat) * 3.5 - fold * 15 + a.settle * 1.6;
  const bank = side * (a.release * 2 - a.wind);
  const tipY = clamp(-18.5 - a.beat * 7 * (1 - fold * .65) - a.settle * 3 + bank, -26, -8.5);
  const curl = a.curl * (1 - fold) * 1.15;
  c.save(); c.scale(side, 1);
  // A continuous leading edge flows from the shoulder through the wrist.
  // Three broad, rounded trailing primaries make a feather wing, not a bat.
  shape(c, c => {
    c.moveTo(3.6, -11.5);
    c.bezierCurveTo(11, -16, reach * .61, tipY - 4.5, reach - 4.2, tipY - 3.1);
    c.quadraticCurveTo(reach + .2, tipY - 2.2, reach, tipY + .6);
    c.quadraticCurveTo(reach - .4, tipY + 3.2, reach - 7, tipY + 6);
    c.quadraticCurveTo(reach - 1.6, tipY + 4.7, reach - 3.1, tipY + 8.3);
    c.quadraticCurveTo(reach - 5.1, tipY + 12.3, reach - 12, tipY + 13.1);
    c.quadraticCurveTo(reach - 6.7, tipY + 11.9, reach - 9, tipY + 15.5 + curl);
    c.quadraticCurveTo(reach - 13, tipY + 18.5 + curl, reach - 20, tipY + 16.1);
    c.quadraticCurveTo(8, -1.8, 3.4, -5.8);
  }, side < 0 ? '#78938f' : '#6e8b91', 1.35);
  // Broad inner coverts form a single light block over the flight feathers.
  shape(c, c => {
    c.moveTo(4.8, -11.2); c.quadraticCurveTo(14.5, -16.5, reach - 7, tipY - .8);
    c.quadraticCurveTo(reach - 12, tipY + 7.5, 14.6, -4.9);
    c.quadraticCurveTo(8.3, -4.2, 4.8, -11.2);
  }, side < 0 ? '#bdc8b5' : '#c9d0bb', .6, null);
  // Two clean feather overlaps remain visible at native size. The outer
  // contour supplies the third division without adding tiny line texture.
  line(c, [[reach - 7.1, tipY + 5.9], [reach - 16.4, tipY + 8.8]], '#485f61', .9);
  line(c, [[reach - 12, tipY + 13.1], [reach - 19, tipY + 11.1]], '#485f61', .9);
  c.restore();
}

function tail(c, a) {
  const fan = a.wind * .6 + a.settle * 1.7 - a.release * .7;
  shape(c, c => {
    c.moveTo(-4.7, 3); c.quadraticCurveTo(-8, 5, -11.5 - fan, 9.2);
    c.quadraticCurveTo(-13.2 - fan, 12.6, -9.2, 12.8);
    c.lineTo(-5.4, 11.2); c.quadraticCurveTo(-6, 14.3, -2.1, 13.8);
    c.quadraticCurveTo(1, 13.4, 2.5, 10.3);
    c.quadraticCurveTo(5.2, 12.1, 7.4, 10.5); c.quadraticCurveTo(8, 7.3, 3.6, 3.5);
  }, '#68878b', 1.1);
  line(c, [[-9.7, 11], [-6.3, 9.8]], '#c6cbb3', 1.2);
  line(c, [[-3.1, 11.5], [-1.3, 8.5]], '#c6cbb3', 1.1);
}

function body(c, a) {
  const lean = a.release * 1.3 - a.wind * .5, headDrop = a.wind * 1.6 + a.release * 2.5;
  c.save(); c.translate(lean - a.hit * .8, a.hit * .7);
  // Tucked feet are attached beneath the breast instead of floating beside it.
  for (const x of [-.8, 5]) {
    line(c, [[x, 4.2], [x + 1.3, 7.4], [x - .2, 9.4]], INK, 2.8);
    line(c, [[x, 4.2], [x + 1.3, 7.4], [x - .2, 9.4]], '#b9aa7c', 1.4);
    line(c, [[x - .2, 9.4], [x + 2, 10.2], [x + 2.5, 8.9]], INK, 1);
  }
  shape(c, c => {
    c.moveTo(-6.8, -13); c.quadraticCurveTo(-8.6, -3, -4.6, 5.5);
    c.quadraticCurveTo(-1, 9.1, 4, 5.7); c.quadraticCurveTo(10, .4, 7.2, -12);
    c.quadraticCurveTo(1, -17, -6.8, -13);
  }, '#7f9b9b', 1.3);
  shape(c, c => {
    c.moveTo(-1, -12.5); c.quadraticCurveTo(5.4, -12.6, 6.7, -5.2);
    c.quadraticCurveTo(7, 1.8, 1.6, 5.8); c.quadraticCurveTo(-2.8, 1.6, -3, -5.8);
  }, '#d5d7ba', .6, null);
  // A short continuous neck joins the pale head to the shoulder block.
  shape(c, c => {
    c.moveTo(-1, -12); c.quadraticCurveTo(-2.7, -17.5 + headDrop, .4, -23.8 + headDrop);
    c.quadraticCurveTo(5.8, -29 + headDrop, 11.2, -23.9 + headDrop);
    c.quadraticCurveTo(14, -20.3 + headDrop, 10, -15.8 + headDrop);
    c.quadraticCurveTo(6.3, -11.5 + headDrop * .6, 5.6, -8.8);
    c.quadraticCurveTo(2.1, -9.3, -1, -12);
  }, '#c6cfb7', 1.25);
  shape(c, c => {
    c.moveTo(10.7, -21.2 + headDrop); c.quadraticCurveTo(16.5, -20.8 + headDrop, 17, -17.9 + headDrop);
    c.quadraticCurveTo(16.6, -16.1 + headDrop, 14.8, -15.8 + headDrop);
    c.lineTo(14.6, -17.2 + headDrop); c.lineTo(10, -17.4 + headDrop);
  }, '#c5aa70', 1);
  shape(c, c => {
    c.moveTo(.8, -22.6 + headDrop); c.quadraticCurveTo(5, -25.4 + headDrop, 10.3, -22.9 + headDrop);
    c.lineTo(8.8, -20.8 + headDrop); c.quadraticCurveTo(4.3, -22.1 + headDrop, .8, -22.6 + headDrop);
  }, '#698884', .6, null);
  oval(c, 8.5, -21.4 + headDrop, 1.55, 1.8, '#2f453e');
  oval(c, 8.9, -22 + headDrop, .4, .45, '#eef0cd');
  line(c, [[6.1, -23.1 + headDrop], [10.2, -23 + headDrop]], '#40594f', 1);
  c.restore();
}

export function paint(c, p, flip = 1, pose = {}) {
  const a = animation(p, pose);
  c.save(); c.scale(flip, 1); c.lineJoin = 'round'; c.lineCap = 'round';
  tail(c, a); wing(c, -1, a); wing(c, 1, a); body(c, a);
  c.restore();
}

export default Object.freeze({ paint });
