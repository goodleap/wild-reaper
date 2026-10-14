import { getConfigSection } from './content-config.js';

const content=getConfigSection('enemies');
export const BOSS_DEFS=Object.freeze(Object.fromEntries(Object.entries(content.bosses).map(([id,boss])=>[id,Object.freeze({...boss,parameters:Object.freeze({name:boss.name,...boss.parameters})})])));
export const ANCIENT_BOSS=BOSS_DEFS.ancient.parameters;
export const BLOOM_BOSS=BOSS_DEFS.bloom.parameters;
export const BOSS_ROTATION=content.bossRotation;
export function bossDefinition(kind){
  if(!Object.hasOwn(BOSS_DEFS,kind))throw new RangeError(`Unknown boss kind: ${String(kind)}`);
  return BOSS_DEFS[kind];
}
export function bossKindFor(index){
  const offset=((index||1)-1)%BOSS_ROTATION.length;
  return BOSS_ROTATION[(offset+BOSS_ROTATION.length)%BOSS_ROTATION.length];
}
