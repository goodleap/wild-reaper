import { beamCapsule } from './attack-capsule.js';

// The preview and damage resolver use the same locked ground geometry.
export function humanAttackCapsules(a){
  if(a.kind==='royalVolley')return [-.48,0,.48].map(offset=>beamCapsule(a.x,a.y,a.angle+offset,a.reach,a.width));
  return [beamCapsule(a.x,a.y,a.angle,a.reach,a.width)];
}
