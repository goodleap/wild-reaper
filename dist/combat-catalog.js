import { getConfigSection } from './content-config.js';
import { getAbilityDefinition } from './ability-definitions.js';
// Shared definitions describe ownership, growth and scope; runtime combat state
// lives in CombatBuild. A rank is an investment, never a second attack level.
const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
const CONFIG=getConfigSection('combat');
const abilityMetadata=id=>{const def=getAbilityDefinition(id);return def?{family:def.family,allowedActors:def.allowedActors,exclusiveOwnerIds:def.exclusiveOwnerIds}:null;};
const abilityDefinition=def=>freeze({...def,...(abilityMetadata(def.id)||{})});
const playerAbility=def=>def.allowedActors?.includes('player')===true;
export const ATTRIBUTE_DEFS=CONFIG.attributes;
export const WEAPON_DEFS=CONFIG.weapons;
export const INITIAL_WEAPON_IDS=CONFIG.initialWeaponIds;
export const normalizeInitialWeaponId=id=>INITIAL_WEAPON_IDS.includes(id)?id:INITIAL_WEAPON_IDS[0];
export const ALL_SUPER_SKILL_DEFS=freeze(CONFIG.superSkills.map(abilityDefinition));
export const SUPER_SKILL_DEFS=freeze(ALL_SUPER_SKILL_DEFS.filter(playerAbility));
export const ALL_SKILL_DEFS=freeze(Object.fromEntries([...Object.values(CONFIG.skills),...CONFIG.superSkills].map(def=>[def.id,abilityDefinition(def)])));
export const SKILL_DEFS=freeze(Object.fromEntries(Object.entries(ALL_SKILL_DEFS).filter(([,def])=>playerAbility(def))));
// JSON null is the explicit unbounded cap; only this adapter introduces Infinity.
const upgrade=def=>freeze({...def,...(abilityMetadata(def.id==='arrowRune'?'runeArrow':def.id)||{}),cap:def.cap===null?Infinity:def.cap});
const owned=id=>({kind:'owned',id});
export const UPGRADE_DEFS=freeze(CONFIG.upgrades.map(upgrade));
export const ENDLESS_UPGRADES=freeze(CONFIG.endlessUpgrades.map(upgrade));
export const LEVEL_CAPS=freeze(Object.fromEntries(UPGRADE_DEFS.map(def=>[def.id,def.cap])));
export const EVOLUTIONS=CONFIG.evolutions;
const UPGRADE_INDEX=new Map([...UPGRADE_DEFS,...ENDLESS_UPGRADES,...SUPER_SKILL_DEFS.map(def=>({...def,id:`super:${def.id}`,upgradeKind:'rank',cap:def.maxLevel,requires:[owned(def.id)]}))].map(def=>[def.id,freeze(def)]));
export const getUpgradeDefinition=id=>UPGRADE_INDEX.get(id)||null;
const requirements={
  owned:(build,rule)=>(build.getWeapon(rule.id)||build.getSkill(rule.id))?.baseRank>0,
  rank:(build,rule)=>build.getRank(rule.id)>=rule.min,
  branch:(build,rule)=>{const branch=(build.getWeapon(rule.id)||build.getSkill(rule.id))?.branch;return rule.value?branch===rule.value:!!branch;}
};
export const meetsUpgradeRequirements=(build,def)=>(def.requires||[]).every(rule=>requirements[rule.kind]?.(build,rule)===true);
export function canTakeUpgrade(build,id) {
  const def=typeof id==='object'?id:getUpgradeDefinition(id);
  if(!build||!def||build.getRank(def.id)>=def.cap)return false;
  if(def.category==='skill'&&!build.getSkill(def.ownerId))return false;
  if(def.branchAtRank!==undefined&&build.getRank(def.id)>=def.branchAtRank)return false;
  return meetsUpgradeRequirements(build,def);
}
