import { groundOffset } from './terrain.js';

export const WEAPON_KNOCKBACK=Object.freeze({window:1,minimumInterval:.25,secondMultiplier:.6,duration:.16});
export const isWeaponKnockbackSource=source=>source==='sword'||source==='arrow'||source==='orbit';
const rushing=enemy=>enemy.charge?.phase==='rush'||enemy.affix?.id==='swift'&&enemy.affix.phase==='rush';
const sceneId=game=>game._weaponKnockbackScene||0;

export function clearWeaponKnockbackScene(game){game._weaponKnockbackScene=sceneId(game)+1;}

// Two timestamps implement a rolling per-enemy budget without a queue or
// allocations on rejected hits. Damage and reactions are resolved separately.
export function queueWeaponKnockback(game,enemy,distance,origin,source) {
  if(game.status!=='playing'||enemy.hp<=0||enemy.type==='boss'||rushing(enemy)||!isWeaponKnockbackSource(source)||!(distance>0))return false;
  const now=game._clock||0,rules=WEAPON_KNOCKBACK;
  let state=enemy._weaponPush;
  if(state?.scene!==sceneId(game))state=null;
  const last=state?.lastAt??-Infinity,previous=state?.previousAt??-Infinity;
  if(now-last+1e-9<rules.minimumInterval||now-previous+1e-9<rules.window)return false;
  let dx,dy;
  if(Number.isFinite(origin?.knockbackX)&&Number.isFinite(origin?.knockbackY)) {dx=origin.knockbackX;dy=origin.knockbackY;}
  else {const from=source==='orbit'?game.player:origin;dx=enemy.x-(from?.x??enemy.x);dy=enemy.y-(from?.y??enemy.y);}
  const length=Math.hypot(dx,dy);if(!(length>1e-7))return false;
  const sizeScale=Math.min(1,20/Math.max(20,enemy.r||20)),resistance=enemy.type==='brute'?Math.min(.45,sizeScale):enemy.type==='boar'?Math.min(.6,sizeScale):sizeScale;
  const scale=now-last+1e-9<rules.window?rules.secondMultiplier:1;
  state??={};Object.assign(state,{scene:sceneId(game),previousAt:last,lastAt:now,age:0,distance:distance*scale*resistance,dx:dx/length,dy:dy/length});
  enemy._weaponPush=state;return true;
}

// Integrate a short, linearly decaying velocity through ordinary terrain
// collision. There is no stun, AI cancellation or position teleport.
export function updateWeaponKnockback(game,enemy,dt) {
  const state=enemy._weaponPush;if(!state)return;
  if(enemy.hp<=0||state.scene!==sceneId(game)){enemy._weaponPush=null;return;}
  if(game.status!=='playing'||!(dt>0))return;
  const duration=WEAPON_KNOCKBACK.duration;
  if(rushing(enemy)){state.age=duration;return;}
  if(state.age>=duration)return;
  const before=state.age,after=Math.min(duration,before+dt);state.age=after;
  const distance=state.distance*((1-before/duration)**2-(1-after/duration)**2);
  const movement=game._moveEntity(enemy,state.dx*distance,state.dy*distance);
  if(movement?.blocked)state.age=duration;
  // Keep an already telegraphed charge attached to its displaced actor; its
  // aim, countdown and special-attack state remain intact.
  if(enemy.charge?.phase==='windup'){enemy.charge.startX=enemy.x;enemy.charge.startY=enemy.y+groundOffset(enemy);}
}
