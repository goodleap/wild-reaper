import { getConfigSection } from './content-config.js';
import { HUT_GUARD_PACKS } from './encounter-definitions.js';

const config=getConfigSection('geography');
export const WORLD_SITE_FEATURES=Object.freeze(Object.fromEntries(Object.entries(config.siteFeatures).map(([id,source])=>{
  const {guardPackId,...feature}=source;
  return [id,Object.freeze({...feature,...(guardPackId?{guardTypes:HUT_GUARD_PACKS[guardPackId]}:{})})];
})));
export const featureForSite=site=>WORLD_SITE_FEATURES[site?.featureId]||null;
export function worldSettlementDefinition(world,definition){
  const match=Object.values(WORLD_SITE_FEATURES).find(item=>item.world===world&&item.type===definition.type);
  return match?{...definition,name:match.name,width:match.width,depth:match.depth,featureId:match.id}:definition;
}
export const WORLD_HUT_NAMES=config.hutNames;
