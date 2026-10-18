import { worldForId } from './world-definitions.js';
import { getConfigSection } from './content-config.js';
import { HUT_GUARD_PACKS } from './encounter-definitions.js';

const config=getConfigSection('geography');
export const WORLD_SITE_FEATURES=Object.freeze(Object.fromEntries(Object.entries(config.siteFeatures).map(([id,source])=>{
  const {guardPackId,...feature}=source;
  return [id,Object.freeze({...feature,...(guardPackId?{guardTypes:HUT_GUARD_PACKS[guardPackId]}:{})})];
})));
export const featureForSite=site=>WORLD_SITE_FEATURES[site?.featureId]||null;
export function worldSettlementDefinition(world,definition){
  if(worldForId(world).authored?.artTheme==='ember'){
    const names={merchant:'热泉旅商',supply:'暖灰补给屋',occupied:'赤铁作业棚',castle:'旧铸熔炉'};
    return {...definition,name:names[definition.type]||definition.name};
  }
  const theme=worldForId(world).authored?.artTheme==='city'?'city':world;
  const match=Object.values(WORLD_SITE_FEATURES).find(item=>item.world===theme&&item.type===definition.type);
  if(world==='clockshadow-city'&&['supply','occupied'].includes(definition.type)){
    const occupied=definition.type==='occupied';
    return {...definition,...(match?{name:match.name,featureId:match.id}:{}),width:occupied?104:96,depth:occupied?50:46};
  }
  return match?{...definition,name:match.name,width:match.width,depth:match.depth,featureId:match.id}:definition;
}
export const WORLD_HUT_NAMES=config.hutNames;
