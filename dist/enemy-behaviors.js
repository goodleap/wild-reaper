import { enemyDefinition } from './enemy-definitions.js';
import { initBoss, updateBoss } from './bosses.js';
import { updateBoar, resolveBoarCharge } from './enemies/boar.js';
import { updateSpore, resolveSpore } from './enemies/spore.js';
import { initializeSpecialist, updateSpecialist, resolveSpecialist } from './enemies/specialists.js';

export { updateBoar } from './enemies/boar.js';
export { updateSpore } from './enemies/spore.js';

export const ENEMY_BEHAVIORS=Object.freeze({
  chase:Object.freeze({}),
  boar:Object.freeze({update:updateBoar}),
  spore:Object.freeze({update:updateSpore,resolve:resolveSpore}),
  specialist:Object.freeze({initialize:initializeSpecialist,update:updateSpecialist,resolve:resolveSpecialist}),
  boss:Object.freeze({initialize:initBoss,update:updateBoss})
});
export function enemyBehavior(type){
  const id=enemyDefinition(type).behavior;
  if(!Object.hasOwn(ENEMY_BEHAVIORS,id))throw new RangeError(`Unknown enemy behavior: ${String(id)}`);
  return ENEMY_BEHAVIORS[id];
}
export function initializeEnemyBehavior(enemy){enemyBehavior(enemy.type).initialize?.(enemy);}
export function updateEnemyBehavior(game,enemy,dt){return enemyBehavior(enemy.type).update?.(game,enemy,dt)??false;}
export function resolveEnemyBehavior(game,enemy,context){
  // Resolve a completed movement segment before any ranged release, preserving
  // the original within-enemy damage order and compatibility with charge state.
  if(enemy._chargeSegment)resolveBoarCharge(game,enemy,context);
  if(enemy.trainingDummy)return;
  enemyBehavior(enemy.type).resolve?.(game,enemy,context);
}
