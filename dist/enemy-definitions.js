import { getConfigSection } from './content-config.js';

const content=getConfigSection('enemies');
export const ENEMY_DEFS=content.definitions;
export const ENEMY_IDS=Object.freeze(Object.keys(ENEMY_DEFS));
export const ENEMY_CODEX_IDS=content.codexIds;
export function enemyDefinition(type){
  if(!Object.hasOwn(ENEMY_DEFS,type))throw new RangeError(`Unknown enemy type: ${String(type)}`);
  return ENEMY_DEFS[type];
}
