import { getConfigSection } from './content-config.js';
import { REGIONS } from './world-definitions.js';
import { featureForSite } from './world-sites.js';

const config=getConfigSection('geography').interiors;
const {maxStatesPerWorld:dungeonStates,...dungeon}=config.dungeon,{maxStatesPerWorld:hutStates,...hut}=config.hut;
export const INTERIOR_REWARDS=config.rewards;
export const DUNGEON_RULES=Object.freeze({...dungeon,bossGold:INTERIOR_REWARDS.castle.gold,bossCrystals:INTERIOR_REWARDS.castle.crystals,maxStates:REGIONS.length*dungeonStates});
export const HUT_RULES=Object.freeze({...hut,maxStates:REGIONS.length*hutStates});
const HUT_LAYOUTS=config.hutLayouts;
export const CASTLE_PROFILE=Object.freeze({...config.castleProfile,cols:DUNGEON_RULES.cols,rows:DUNGEON_RULES.rows,cellSize:DUNGEON_RULES.cellSize,bossDistance:DUNGEON_RULES.bossDistance});
export function castleProfileFor(site){return {...CASTLE_PROFILE,...(featureForSite(site)||{})};}
export function hutProfileFor(site){const feature=featureForSite(site),layout=HUT_LAYOUTS[feature?.id]||HUT_LAYOUTS.default;return {...layout,size:feature?.interiorSize||HUT_RULES.cellSize,height:feature?.interiorHeight||feature?.interiorSize||HUT_RULES.cellSize,chestY:feature?-90:-25,guardHp:feature?.guardHp||1};}
export function interiorRewardFor(site){return featureForSite(site)?.reward||INTERIOR_REWARDS[site?.type]||INTERIOR_REWARDS.castle;}
