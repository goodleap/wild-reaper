export const RELIC_ACTIVATION_DURATION = .7;
const clamp = n => Math.max(0, Math.min(1, n));

// Ages advance with the owning scene, never wall-clock time. An absent age is
// dormant, and completed ages remain inert when a saved world is revisited.
export function beginRelicActivation(subject, duration = RELIC_ACTIVATION_DURATION) {
  if (!subject) return false;
  subject.activationAge = 0;
  subject.activationDuration = Number.isFinite(duration) && duration > 0 ? duration : RELIC_ACTIVATION_DURATION;
  return true;
}
export function advanceRelicActivation(subject, dt) {
  if (!Number.isFinite(subject?.activationAge) || !Number.isFinite(dt) || dt <= 0) return;
  subject.activationAge = Math.min(subject.activationDuration || RELIC_ACTIVATION_DURATION, subject.activationAge + Math.min(.05, dt));
}
export function relicActivationStrength(subject) {
  if (!Number.isFinite(subject?.activationAge)) return 0;
  const t = subject.activationAge / (subject.activationDuration || RELIC_ACTIVATION_DURATION);
  return t < 0 || t >= 1 ? 0 : Math.sin(Math.PI * clamp(t));
}

// Fixed-size highlights follow the existing carved arch. No expanding wave,
// dynamic texture, blur or full-screen blend is needed for an entrance cue.
export function drawCastleActivation(c, site, behind = false) {
  if (site?.type !== 'castle') return false;
  const strength = relicActivationStrength(site);
  if (strength <= 0) return false;
  c.save(); c.translate(site.x, site.y); c.scale((site.width || 240) / 240, (site.depth || 90) / 90);
  c.globalAlpha *= strength * (behind ? .36 : 1); c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-30, 1); c.lineTo(-30, -47); c.bezierCurveTo(-30, -84, 30, -84, 30, -47); c.lineTo(30, 1);
  c.strokeStyle = '#9ccee963'; c.lineWidth = 11; c.stroke();
  c.strokeStyle = '#deecbaba'; c.lineWidth = 5; c.stroke();
  c.strokeStyle = '#fff5d9'; c.lineWidth = 1.3; c.stroke();
  c.restore(); return true;
}
