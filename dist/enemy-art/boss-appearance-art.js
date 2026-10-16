import { drownedWatcher, innerTreeKing, windTreeKing, crownWatcher } from './wild-boss-appearances.js';
import { castleGuardian, towerGuardian, forgeGuardian, riverGuardian, pursuitCaptain } from './guardian-boss-appearances.js';

function facing(enemy,{playerX=enemy.x+1,facings}={}){
  const attack=enemy.specialAttack||enemy._visualCast||enemy.specialist;
  const angle=Number.isFinite(attack?.angle)?attack.angle:Number.isFinite(enemy.visualFacing)?enemy.visualFacing:Math.atan2(0,playerX-enemy.x);
  const dx=Math.cos(angle),flip=Math.abs(dx)<.12?(facings?.get(enemy)||1):(dx<0?-1:1);
  facings?.set(enemy,flip);return flip;
}
// These entries own bodies only. Existing behavior modules remain the single
// owner of world warnings, phase labels, sounds and captured impact targets.
const body=paint=>Object.freeze({paint,animated:true,facing});
export const BOSS_APPEARANCE_ART=Object.freeze({
  drownedwatcher:body(drownedWatcher),
  innertreeking:body(innerTreeKing),
  windtreeking:body(windTreeKing),
  crownwatcher:body(crownWatcher),
  castleguardian:body(castleGuardian),
  towerguardian:body(towerGuardian),
  forgeguardian:body(forgeGuardian),
  riverguardian:body(riverGuardian),
  pursuitcaptain:body(pursuitCaptain)
});
