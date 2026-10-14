import { getConfigSection } from './content-config.js';
import { featureForSite } from './world-sites.js';

const sites=getConfigSection('sites'),huntRules=getConfigSection('encounters').eventRules.hunt;
export const SETTLEMENT_RULES=sites.settlementRules;
export const ANGEL_RULES=sites.angelRules;
export const SETTLEMENT_DEFINITIONS=sites.settlementDefinitions;
export const SETTLEMENT_TYPES=sites.settlementTypes;
export const RELIC_SITE_RULES=Object.freeze({...sites.relicSiteRules,huntGuards:huntRules.relicGoal});
export const ARMY_SITE_RULES=sites.armySiteRules;
export const RESCUE_BUILDING=sites.rescueBuilding;
export const RELIC_SITE_DEFINITIONS=sites.relicSiteDefinitions;
export const WORLD_RELIC_DEFINITIONS=sites.worldRelicDefinitions;
export const RELIC_SITE_TYPES=Object.freeze({...sites.relicSiteTypes,hunt:Object.freeze({...sites.relicSiteTypes.hunt,goal:RELIC_SITE_RULES.huntGuards,touchRadius:RELIC_SITE_RULES.huntTouchRadius})});
export const RELIC_APPEARANCES=Object.freeze({...sites.relicAppearances,golemaltar:Object.freeze({...sites.relicAppearances.golemaltar,touchRadius:ARMY_SITE_RULES.altarTouchRadius})});
export const settlementType=site=>SETTLEMENT_TYPES[typeof site==='string'?site:site?.type]||null;
export function relicSiteProfile(site){const profile=RELIC_SITE_TYPES[site?.type]||RELIC_SITE_TYPES.default,appearance=RELIC_APPEARANCES[site?.appearance];return appearance?{...profile,...appearance}:profile;}
export function relicSiteEntries(game){return game.environment?.mechanisms?[...RELIC_SITE_DEFINITIONS,...(WORLD_RELIC_DEFINITIONS[game.region?.id]||[])]:RELIC_SITE_DEFINITIONS;}
export function relicSiteEnabled(game,site){const feature=relicSiteProfile(site).feature;return !feature||game._features?.[feature]!==false;}
export function createRelicMechanism(site,entry){const spec=relicSiteProfile(entry).mechanism;if(!spec)return null;return {id:`${site.id}:support`,siteId:site.id,...spec,element:featureForSite(entry)?.element,x:site.x,y:site.y};}
