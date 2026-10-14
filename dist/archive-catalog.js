import { getConfigSection } from './content-config.js';
import { ENEMY_DEFS, ENEMY_CODEX_IDS } from './enemy-definitions.js';
import { BOSS_DEFS } from './boss-definitions.js';
import { WEAPON_DEFS, SKILL_DEFS, ALL_SKILL_DEFS, UPGRADE_DEFS, EVOLUTIONS, INITIAL_WEAPON_IDS } from './combat-catalog.js';
import { WEAPON_BRANCHES } from './weapon-branches.js';
import { companionDefinition } from './companion-catalog.js';

const codex=getConfigSection('codex');
export const ARCHIVE_TABS=codex.tabs;
export const ARCHIVE_CATEGORIES=codex.categories;
const enemies=ENEMY_CODEX_IDS.map(id=>({id:`enemy:${id}`,category:'enemies',...ENEMY_DEFS[id].codex,type:id}));
const bosses=[
  ...Object.values(BOSS_DEFS).map(def=>({id:`boss:${def.id}`,name:def.name,...def.codex,type:'boss',bossKind:def.id})),
  codex.castleBoss
].map(def=>({...def,category:'bosses'}));
const copy=codex.equipment;
const sourceLabel=def=>def.category==='weapon'&&INITIAL_WEAPON_IDS.includes(def.id)?'冒险准备中选择，或消耗灵晶成长时获得':def.source==='innate'?'出场自带':def.rewardSources?.includes('region')&&def.rewardSources?.includes('castle')?'击败区域或城堡首领后，从宝藏获得':def.source==='castle'?'击败城堡首领后，从王城宝藏获得':def.source==='region'?'击败区域首领后，从奖励中获得':'消耗灵晶成长时获得';
const equipment=(def,category)=>({id:`${category==='weapons'?'weapon':'skill'}:${def.id}`,ownerId:def.id,category,name:def.name,color:def.color,icon:def.icon,tier:def.tier,family:def.family,activation:def.activation,source:sourceLabel(def),...copy[def.id],branches:(WEAPON_BRANCHES[def.id]||[]).map(branch=>({id:branch.branch,name:branch.name,description:branch.desc})),evolution:EVOLUTIONS[def.id]||null});
const weaponSkills=codex.weaponSkills;
const companionCopy=codex.companions;
const companions=Object.entries(companionCopy).map(([kind,copy])=>{
  const def=companionDefinition(kind);
  return {id:`companion:${kind}`,category:'companions',kind,name:def.name,color:def.color,...copy};
});
const freezeEntry=entry=>Object.freeze({...entry,branches:Object.freeze((entry.branches||[]).map(Object.freeze))});
export const ARCHIVE_ENTRIES=Object.freeze([...enemies,...bosses,...Object.values(WEAPON_DEFS).map(def=>equipment(def,'weapons')),...Object.values(SKILL_DEFS).map(def=>equipment(def,'skills')),...weaponSkills,...companions].map(freezeEntry));
export const ARCHIVE_LEGACY_ENTRIES=Object.freeze(['domain','vortex'].map(id=>freezeEntry({...equipment(ALL_SKILL_DEFS[id],'skills'),legacy:true,source:'历史记录 · 现为 Boss 专用'})));
export const ARCHIVE_PERSISTED_IDS=Object.freeze([...ARCHIVE_ENTRIES,...ARCHIVE_LEGACY_ENTRIES].map(entry=>entry.id));
export const ARCHIVE_IDS=Object.freeze(ARCHIVE_ENTRIES.map(entry=>entry.id));
export const ARCHIVE_ENTRY_BY_ID=new Map([...ARCHIVE_ENTRIES,...ARCHIVE_LEGACY_ENTRIES].map(entry=>[entry.id,entry]));

export function companionArchiveId(companion){
  const kind=typeof companion==='string'?companion:companion?.kind||companion?.heroId;
  const id=`companion:${kind}`;return ARCHIVE_ENTRY_BY_ID.has(id)?id:null;
}

export function enemyArchiveId(enemy){
  if(!enemy||enemy.trainingDummy||enemy.type==='trainingDummy')return null;
  if(enemy.type==='boss')return enemy.dungeonBoss?'boss:castle':`boss:${enemy.bossKind||'ancient'}`;
  const id=`enemy:${enemy.type}`;return ARCHIVE_ENTRY_BY_ID.has(id)?id:null;
}
export function ownedArchiveEntries(build){
  if(!build)return [];
  const owned=[];
  for(const [kind,defs] of [['weapon',WEAPON_DEFS],['skill',SKILL_DEFS]])for(const def of Object.values(defs)){
    const state=kind==='weapon'?build.getWeapon?.(def.id)||build.weapons?.[def.id]:build.getSkill?.(def.id)||build.skills?.[def.id];
    if(!(state?.baseRank>0))continue;
    owned.push({id:`${kind}:${def.id}`,level:state.level||state.baseRank,branch:state.branch||null,evolved:!!state.evolved,modifiers:{...state.modifiers}});
  }
  for(const entry of weaponSkills){
    const state=build.getWeapon?.(entry.ownerId)||build.weapons?.[entry.ownerId];
    const level=state?.baseRank>0?(state.modifiers?.[entry.modifierId]||0):0;
    if(level>0)owned.push({id:entry.id,level,branch:null,evolved:false});
  }
  return owned;
}

// Compact names are read from the same catalog as upgrade choices.
export function archiveUpgradeNames(id){
  const owner=ARCHIVE_ENTRY_BY_ID.get(id)?.ownerId;
  return UPGRADE_DEFS.filter(def=>def.ownerId===owner&&def.upgradeKind==='modifier'&&def.kind!=='武器技能').map(def=>def.name);
}
