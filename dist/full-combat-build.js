import { UPGRADE_DEFS, SUPER_SKILL_DEFS } from './combat-catalog.js';
import { isBranchReady } from './weapon-branches.js';

export const FULL_BUILD_BRANCHES=Object.freeze({sword:'sweep',arrow:'pierce',pulse:'echoes',lightning:'chain'});

// Debug and temporary story power use the same capped combat records. This
// never grants attributes, XP or resources; callers decide which build owns it.
export function applyFullCombatBuild(build,{excludedSkillIds=[]}={}) {
  const excluded=new Set(excludedSkillIds);
  for(const id of excluded) {
    const skill=build.getSkill(id);if(!skill)continue;
    skill.baseRank=0;skill.equipped=false;skill.branch=null;skill.evolved=false;
    for(const modifier of Object.keys(skill.modifiers))skill.modifiers[modifier]=0;
  }
  // An existing exclusive route must not prevent the shared full-loadout
  // route (including runic arrows) from being acquired on a temporary copy.
  for(const [id,branch] of Object.entries(FULL_BUILD_BRANCHES))if(build.branches[id]&&build.branches[id]!==branch)build.branches[id]=null;
  const upgrades=UPGRADE_DEFS.filter(def=>def.category!=='attribute'&&!(def.category==='skill'&&excluded.has(def.ownerId)));
  // Later passes acquire modifiers unlocked by the preceding branch choice.
  for(let pass=0;pass<UPGRADE_DEFS.length;pass++) {
    let changed=false;
    for(const def of upgrades)while(build.increment(def.id))changed=true;
    for(const [id,branch] of Object.entries(FULL_BUILD_BRANCHES)) {
      if(!excluded.has(id)&&build.branches[id]!==branch&&isBranchReady(build,id)&&build.selectBranch(id,branch))changed=true;
    }
    if(!changed)break;
  }
  while(build.awardRuneArrow()){}
  for(const def of SUPER_SKILL_DEFS)if(!excluded.has(def.id)&&build.getSkill(def.id))build.superLevels[def.id]=def.maxBaseRank;
  for(const weapon of Object.values(build.weapons))if(weapon.acquired)build.setEquipped(weapon.id,true);
  return build;
}
