import { getConfigSection } from './content-config.js';
// Routes are exclusive choices, not independent levels. Their modifiers can
// continue to grow after selection and live on the same weapon/skill record.
const CONFIG=getConfigSection('combat');
const RULES=CONFIG.branchRules;
export const WEAPON_BRANCHES=CONFIG.branches;
export const BRANCH_WEAPONS=Object.freeze(Object.keys(WEAPON_BRANCHES).filter(id=>!RULES.exclude.includes(id)));
export function branchDefinition(weaponId,id) {
  return WEAPON_BRANCHES[weaponId]?.find(def=>def.branch===id)||null;
}
export function isBranchReady(game,weaponId) {
  const build=game.build||game;
  if(!BRANCH_WEAPONS.includes(weaponId)||build.branches[weaponId])return false;
  // Preserve the established first route threshold; power-only investments do
  // not bring forward the old rapid/multishot milestone during migration.
  return weaponId==='arrow'?!!(build.getWeapon?.('arrow')?.baseRank>0||build.levels.arrow>0)&&RULES.arrowBase+RULES.arrowInvestments.reduce((sum,id)=>sum+build.levels[id],0)>=RULES.threshold:build.levels[weaponId]>=RULES.threshold;
}
