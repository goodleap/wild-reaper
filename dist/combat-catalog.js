import { getConfigSection } from './content-config.js';
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
export const ATTRIBUTE_DEFS=CONFIG.attributes;
export const WEAPON_DEFS=CONFIG.weapons;
export const INITIAL_WEAPON_IDS=CONFIG.initialWeaponIds;
export const normalizeInitialWeaponId=id=>INITIAL_WEAPON_IDS.includes(id)?id:INITIAL_WEAPON_IDS[0];
export const SUPER_SKILL_DEFS=CONFIG.superSkills;
export const SKILL_DEFS=freeze({...CONFIG.skills,...Object.fromEntries(SUPER_SKILL_DEFS.map(def=>[def.id,def]))});
// JSON null is the explicit unbounded cap; only this adapter introduces Infinity.
const upgrade=def=>freeze({...def,cap:def.cap===null?Infinity:def.cap});
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
  if(def.branchAtRank!==undefined&&build.getRank(def.id)>=def.branchAtRank)return false;
  return meetsUpgradeRequirements(build,def);
}
