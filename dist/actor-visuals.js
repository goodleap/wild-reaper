import { ENEMY_DEFS } from './enemy-definitions.js';
import { ENEMY_VISUALS, enemyVisual } from './enemy-visuals.js';

// Shared body extents keep actor depth, shadows and floating labels aligned.
export const ACTOR_VISUALS={
  trainingDummy:{radius:16,foot:18,halfWidth:24,top:42,shadowWidth:12,shadowLength:18},
  player:{radius:15,foot:18,halfWidth:29,top:35,shadowWidth:14,shadowLength:24},
  ...Object.fromEntries(Object.values(ENEMY_DEFS).map(def=>[def.id,ENEMY_VISUALS[def.visual]]))
};
export function actorShape(entity){return enemyVisual(entity)||ACTOR_VISUALS[entity?.type]||ACTOR_VISUALS.slime;}
