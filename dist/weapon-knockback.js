import { getConfigSection } from './content-config.js';
import { groundOffset } from './terrain.js';

const CONFIG=getConfigSection('combat').knockback;
export const ATTACK_KNOCKBACK=CONFIG.attack;
export const WEAPON_KNOCKBACK=ATTACK_KNOCKBACK;
export const BOSS_KNOCKBACK=CONFIG.boss;
// Ordinary attacks share one world-space distance. A special attack may use a
// multiplier or an explicit distance without replacing resistance or limits.
export function weaponKnockbackDistance({multiplier=1,distance}={}) {
  const value=distance??WEAPON_KNOCKBACK.distance*multiplier;
  return Number.isFinite(value)?Math.max(0,value):0;
}
// Forced-movement behaviors may opt out while their authored motion is active.
// Ordinary windups/casts do not opt out and continue advancing while displaced.
const motionLocked=enemy=>enemy.knockbackImmune===true||enemy.charge?.phase==='rush'||enemy.affix?.id==='swift'&&enemy.affix.phase==='rush';
const sceneId=game=>game._weaponKnockbackScene||0;

export function clearWeaponKnockbackScene(game){game._weaponKnockbackScene=sceneId(game)+1;}

// All attack sources share a per-enemy budget: two rolling timestamps for
// ordinary enemies, or one longer cooldown for a boss.
// Special skills choose their distance but retain the same motion rules.
// Rejected displacement never blocks damage or the attack's other reactions.
export function queueAttackKnockback(game,enemy,distance,origin,source) {
  if(game.status!=='playing'||enemy.hp<=0||motionLocked(enemy)||!Number.isFinite(distance)||!(distance>0))return false;
  const now=game._clock||0,rules=ATTACK_KNOCKBACK,boss=enemy.type==='boss';
  let state=enemy._weaponPush;
  if(state?.scene!==sceneId(game))state=null;
  const last=state?.lastAt??-Infinity,previous=state?.previousAt??-Infinity;
  if(boss?now-last+1e-9<BOSS_KNOCKBACK.minimumInterval:
    now-last+1e-9<rules.minimumInterval||now-previous+1e-9<rules.window)return false;
  let dx,dy;
  if(Number.isFinite(origin?.knockbackX)&&Number.isFinite(origin?.knockbackY)) {dx=origin.knockbackX;dy=origin.knockbackY;}
  else {const from=source==='orbit'?game.player:origin;dx=enemy.x-(from?.x??enemy.x);dy=enemy.y-(from?.y??enemy.y);}
  const length=Math.hypot(dx,dy);if(!Number.isFinite(length)||!(length>1e-7))return false;
  const reference=CONFIG.resistance.referenceRadius,sizeScale=Math.min(1,reference/Math.max(reference,enemy.r||reference));
  const resistance=boss?1:Math.min(CONFIG.resistance[enemy.type]??1,sizeScale);
  const scale=!boss&&now-last+1e-9<rules.window?rules.secondMultiplier:1;
  state??={};Object.assign(state,{scene:sceneId(game),previousAt:last,lastAt:now,age:0,distance:distance*scale*resistance,dx:dx/length,dy:dy/length});
  enemy._weaponPush=state;return true;
}
// Existing weapon callers use the same generalized resolver.
export const queueWeaponKnockback=queueAttackKnockback;

// Integrate a short, linearly decaying velocity through ordinary terrain
// collision. There is no stun, AI cancellation or position teleport.
export function updateWeaponKnockback(game,enemy,dt) {
  const state=enemy._weaponPush;if(!state)return 0;
  if(enemy.hp<=0||state.scene!==sceneId(game)){enemy._weaponPush=null;return 0;}
  if(game.status!=='playing'||!(dt>0))return 0;
  const duration=WEAPON_KNOCKBACK.duration;
  if(motionLocked(enemy)){state.age=duration;return 0;}
  if(state.age>=duration)return 0;
  const before=state.age,after=Math.min(duration,before+dt);state.age=after;
  const distance=state.distance*((1-before/duration)**2-(1-after/duration)**2);
  const movement=game._moveEntity(enemy,state.dx*distance,state.dy*distance);
  if(movement?.blocked)state.age=duration;
  // Keep an already telegraphed charge attached to its displaced actor; its
  // aim, countdown and special-attack state remain intact.
  if(enemy.charge?.phase==='windup'){enemy.charge.startX=enemy.x;enemy.charge.startY=enemy.y+groundOffset(enemy);}
  // Only ordinary pursuit yields this portion of the frame; attack clocks and
  // special AI still advance by the full dt, and pursuit resumes in the remainder.
  return after-before;
}
