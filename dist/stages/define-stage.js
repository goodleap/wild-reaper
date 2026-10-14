import { WORLD_IDS, regionFor } from '../world-definitions.js';
import { bossDefinition } from '../boss-definitions.js';

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
const positive=(value,label)=>{if(!Number.isFinite(value)||value<=0)throw new RangeError(`Invalid stage ${label}`);return value;};

// A theme supplies ecology and art. A stage supplies independent map identities,
// travel routes and fixed encounter/reward parameters.
export function defineStage(source){
  const {id,themeId,name,shortName,summary,difficultyLabel,outer,core,coreReward}=source;
  const themeIndex=WORLD_IDS.indexOf(themeId);
  if(themeIndex<0)throw new RangeError(`Unknown stage theme: ${String(themeId)}`);
  for(const [key,value] of Object.entries({id,name,shortName,summary,difficultyLabel}))if(typeof value!=='string'||!value.trim())throw new TypeError(`Missing stage ${key}`);
  const world=regionFor(themeIndex),mapPrefix=id.endsWith('-trial')?id.slice(0,-6):id;
  const outerId=outer?.id??`${mapPrefix}-outer`,coreId=core?.id??`${mapPrefix}-heart`,routeId=`${mapPrefix}-route`;
  if(typeof outerId!=='string'||!outerId||typeof coreId!=='string'||!coreId||outerId===coreId)throw new TypeError(`Invalid stage map identity: ${id}`);
  function island(spec,role,mapId,targetMapId){
    if(!spec||typeof spec.name!=='string'||!spec.name.trim()||!Number.isInteger(spec.seed))throw new TypeError(`Invalid stage island: ${mapId}`);
    const boss={...spec.boss,role:role==='boss'?'core':'optional'};
    bossDefinition(boss.kind);
    for(const key of ['index','hp','easyHp','damage','speed','xp'])positive(boss[key],`${mapId} boss ${key}`);
    if(!Number.isInteger(boss.index)||boss.easyHp>boss.hp)throw new RangeError(`Invalid stage boss difficulty: ${mapId}`);
    if(spec.profile){
      const profile={...world.profile,...spec.profile};
      positive(profile.x,`${mapId} width`);positive(profile.y,`${mapId} height`);
      if(!Number.isFinite(profile.phase)||!Number.isFinite(profile.bays)||profile.bays<0)throw new RangeError(`Invalid stage coast: ${mapId}`);
    }
    const map={...spec,id:mapId,themeId,themeIndex,role,boss,connections:[{id:routeId,targetMapId}]};
    return freeze(map);
  }
  const islands=[island(outer,'outer',outerId,coreId),island(core,'boss',coreId,outerId)];
  const reward={gold:coreReward?.gold,crystals:coreReward?.crystals};
  for(const [key,value] of Object.entries(reward))if(!Number.isSafeInteger(value)||value<0)throw new RangeError(`Invalid stage reward: ${key}`);
  if(islands[1].boss.hp<=islands[0].boss.hp)throw new RangeError(`Core boss must be stronger: ${id}`);
  return freeze({id,name,shortName,summary,difficultyLabel,themeId,themeIndex,color:world.colors.accent,dangerFactor:world.danger,startMapId:outerId,coreMapId:coreId,islands,coreReward:reward});
}
