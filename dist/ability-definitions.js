import { getConfigSection } from './content-config.js';

const config=getConfigSection('abilities');
export const ABILITY_RULES=config.rules;
export const ABILITY_DEFINITIONS=config.definitions;
export const getAbilityDefinition=id=>ABILITY_DEFINITIONS[id]||null;
export function abilityActorKind(caster,game){
  if(caster===game?.player)return 'player';
  if(caster?.isCompanion||caster?.isTownNpc)return 'companion';
  return caster?.type==='boss'||caster?.bossKind?'boss':'enemy';
}
export function abilityAllowed(id,caster,game){
  const definition=getAbilityDefinition(id);if(!definition)return false;
  if(!definition.allowedActors.includes(abilityActorKind(caster,game)))return false;
  return !definition.exclusiveOwnerIds.length||definition.exclusiveOwnerIds.some(owner=>[caster?.heroId,caster?.type,caster?.bossKind,caster?.companionKind].includes(owner));
}
