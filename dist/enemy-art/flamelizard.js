import { clamp, line, oval } from './drawing.js';

const INK = '#3d4034';
const smooth = n => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
function shape(c, draw, fill, width = 1.3, stroke = INK) {
  c.beginPath(); draw(c); c.closePath(); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function animation(p, pose) {
  const mode = pose.mode || 'move', t = clamp(pose.progress || 0, 0, 1);
  const cycle = Number.isFinite(pose.cycle) ? pose.cycle : Math.asin(clamp(p, -1, 1));
  return { mode, t, cycle, moving: mode === 'move' || mode === 'air' || !!pose.moving,
    wind: mode === 'windup' ? smooth(t) : 0,
    release: mode === 'active' || mode === 'rush' ? 1 : 0,
    settle: mode === 'recovery' ? 1 - smooth(t) : 0,
    hit: mode === 'hit' ? 1 - smooth(t) : 0 };
}

// The ankle and toes stay on their existing ground line during the stance
// half-cycle. Body compression moves the hip, never the collision footprint.
function leg(c, front, far, a, bodyY) {
  const phase = a.cycle + (front ? Math.PI : 0) + (far ? Math.PI : 0);
  const stride = a.moving ? Math.sin(phase) * 2.7 : 0;
  const lift = a.moving ? Math.max(0, Math.cos(phase)) * 2.2 : 0;
  const hipX = front ? 10 : -12, hipY = 4.2 + bodyY;
  const kneeX = front ? 14.5 : -20, kneeY = (far ? 7 : 10) + bodyY * .35;
  const ankleX = (front ? 20 : -15.5) + stride;
  const ankleY = (far ? 14.2 : 17.7) - lift;
  const material = far ? '#81614b' : '#a36d4b';
  line(c, [[hipX, hipY], [kneeX, kneeY], [ankleX, ankleY - 2]], INK, far ? 5.3 : 6.1);
  line(c, [[hipX, hipY], [kneeX, kneeY], [ankleX, ankleY - 2]], material, far ? 3.3 : 4.1);
  shape(c, c => {
    c.moveTo(ankleX - 2.2, ankleY - 3);
    c.quadraticCurveTo(ankleX + 1, ankleY - 3.2, ankleX + 2.3, ankleY - 1.8);
    c.quadraticCurveTo(ankleX + 6.1, ankleY - 1.8, ankleX + 6, ankleY -.2);
    c.quadraticCurveTo(ankleX + 3.3, ankleY + .45, ankleX - 1.1, ankleY + .1);
    c.quadraticCurveTo(ankleX - 3, ankleY - .8, ankleX - 2.2, ankleY - 3);
  }, material, 1);
  if (!far) {
    line(c, [[ankleX + 2.6, ankleY - .6], [ankleX + 3.1, ankleY - 1.5]], '#d0ae7b', .8);
    line(c, [[ankleX + 4.6, ankleY - .5], [ankleX + 4.8, ankleY - 1.2]], '#d0ae7b', .7);
  }
}

function tail(c, a) {
  const sway = a.moving ? Math.sin(a.cycle + .65) * 1.1 : 0;
  shape(c, c => {
    c.moveTo(-13, -4);
    c.bezierCurveTo(-23, -5, -27, 5 + sway, -33, 4 + sway);
    c.quadraticCurveTo(-36.5, 2 + sway, -35.8, -3.6 + sway);
    c.bezierCurveTo(-37.1, -.8 + sway, -36.1, 9.5 + sway, -30, 11 + sway);
    c.quadraticCurveTo(-23, 12, -15, 7);
  }, '#ad7652');
  shape(c, c => {
    c.moveTo(-16, 2); c.quadraticCurveTo(-26, 11, -32, 7);
    c.quadraticCurveTo(-27, 13, -16, 7);
  }, '#d2aa74', .7, null);
}

function fins(c, heat) {
  const material = heat > .55 ? '#d59b57' : '#bd8650';
  // A small hind fin, a tall central sail and a rounded forward fin all grow
  // out of the same back curve. Their unequal lobes avoid a triangle fence.
  shape(c, c => {
    c.moveTo(-19, -7); c.quadraticCurveTo(-19, -13, -15.5, -17.1);
    c.quadraticCurveTo(-13.5, -11, -10.2, -9);
  }, material, 1);
  shape(c, c => {
    c.moveTo(-10, -10); c.bezierCurveTo(-9, -16, -5, -20.8, -2.2, -22.7);
    c.quadraticCurveTo(-2, -16, 3, -11);
  }, material, 1.1);
  shape(c, c => {
    c.moveTo(1, -11); c.quadraticCurveTo(3, -16.5, 7.2, -18.6);
    c.quadraticCurveTo(8.8, -12.8, 12.7, -8.2);
  }, material, 1);
  line(c, [[-5.6, -17.5], [-5.1, -13]], '#e4bc7e', .85);
}

function head(c, a, heat, breath) {
  const jaw = a.release * 3.1 + a.settle * 1.7;
  c.save(); c.translate(-a.wind * 1.4 + a.release * 1.35, -a.wind * .7 + breath * .35);
  // The broad cheek and blunt, curved snout are one connected animal head.
  shape(c, c => {
    c.moveTo(10, -5); c.quadraticCurveTo(13, -12.2, 22, -11);
    c.quadraticCurveTo(28, -10.2, 28.7, -6.6);
    c.quadraticCurveTo(35.8, -6.4, 35.4, -.9);
    c.quadraticCurveTo(34.6, 3, 27, 3.8);
    c.lineTo(17, 5); c.quadraticCurveTo(11, 3, 10, -5);
  }, '#b87d53');
  // The throat is a warm, readable color block. Heat changes its palette,
  // while the attack system continues to own the actual breath particles.
  shape(c, c => {
    c.moveTo(13, .2); c.quadraticCurveTo(19, -1, 23, 4);
    c.quadraticCurveTo(21, 10.1, 15, 10.6);
    c.quadraticCurveTo(10, 7, 13, .2);
  }, heat > .55 ? '#e8ba73' : '#d3aa73', .85);
  if (heat > .1) shape(c, c => {
    c.moveTo(15.1, 3.4); c.quadraticCurveTo(17.5, 1.8, 19.5, 4.4);
    c.quadraticCurveTo(19, 7.4, 16, 8.3); c.quadraticCurveTo(14.7, 6, 15.1, 3.4);
  }, heat > .7 ? '#f7dc95' : '#dc9c59', .5, null);
  if (jaw > .05) shape(c, c => {
    c.moveTo(22, 1); c.lineTo(34.8, .3); c.lineTo(33.8, 3.1 + jaw);
    c.lineTo(24, 5 + jaw); c.lineTo(18, 1);
  }, '#583e36', .65);
  shape(c, c => {
    c.moveTo(16, 1.8); c.quadraticCurveTo(24, 4 + jaw, 34.5, 2.7 + jaw);
    c.quadraticCurveTo(34, 6.6 + jaw, 25, 7.4 + jaw);
    c.quadraticCurveTo(19, 7, 16, 1.8);
  }, '#d9b47f', 1);
  line(c, [[22, 2.6], [29, 2.3], [33, 1.5]], '#654a38', .85);
  oval(c, 21.1, -7.7, 2.9, 2.5, '#e4ca87');
  oval(c, 21.8, -7.6, 1.15, 1.9, '#354134');
  oval(c, 21.2, -8.3, .45, .5, '#f7ebba');
  line(c, [[18, -10], [23.3, -10.5]], '#77523f', 1.1);
  oval(c, 31.9, -3.7, .85, .7, '#5d4e38');
  c.restore();
}

export function paint(c, p, flip = 1, pose = {}) {
  const a = animation(p, pose), heat = a.wind + a.release + a.settle * .55;
  const breath = a.mode === 'recovery' ? Math.sin(a.t * Math.PI * 4) * (1 - a.t) : 0;
  const bodyY = a.wind * 1.3 + a.settle * .6 - a.hit * .35;
  c.save(); c.scale(flip, 1); c.lineCap = 'round'; c.lineJoin = 'round';
  leg(c, false, true, a, bodyY); leg(c, true, true, a, bodyY);
  c.save(); c.translate(-a.hit * 1.1, bodyY);
  tail(c, a); fins(c, heat);
  shape(c, c => {
    c.moveTo(-21, 0); c.quadraticCurveTo(-20, -10.5, -7, -11.8);
    c.quadraticCurveTo(7, -13, 17, -5.8); c.quadraticCurveTo(23, 1, 17, 8);
    c.quadraticCurveTo(2, 13.5 + breath * .3, -13, 10);
    c.quadraticCurveTo(-22, 7.8, -21, 0);
  }, '#ac7451', 1.4);
  shape(c, c => {
    c.moveTo(-17, 4); c.quadraticCurveTo(-1, 8, 16, 2.6);
    c.quadraticCurveTo(20, 8, 7, 10); c.quadraticCurveTo(-9, 12, -17, 4);
  }, '#d3ad78', .7, null);
  // One shoulder plane is enough to give the simple flat body its volume.
  shape(c, c => {
    c.moveTo(-16, -5); c.quadraticCurveTo(-6, -10.4, 5, -7.4);
    c.quadraticCurveTo(-3, -7.2, -12, -2.4);
  }, '#c79563', .7, null);
  head(c, a, heat, breath);
  c.restore();
  leg(c, false, false, a, bodyY); leg(c, true, false, a, bodyY);
  c.restore();
}

export default Object.freeze({ paint });
