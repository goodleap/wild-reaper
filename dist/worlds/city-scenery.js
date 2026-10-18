// Baked rectangular foundations already belong to both city collision masks.
// Their depth-sorted artwork is a separate, immutable view of the same records.
import { createNativeCityProps, decorateNativeCityProp, createNativeCityBridgeProps, CITY_NATIVE_PRESERVED_IDS } from '../city-native-structure-art.js';
import { createCityBlockScenery } from './city-block-scenery.js';
import { createCityGreenScenery } from './city-green-scenery.js';
const cache=new WeakMap();
const identity=text=>[...String(text)].reduce((value,char)=>(Math.imul(value,31)+char.charCodeAt(0))>>>0,17);

export function createCityScenery(layout,collision,island){
  if(cache.has(layout))return cache.get(layout);
  const props=(layout.cityStructures??[]).map(structure=>{
    const {width,depth}=structure,long=Math.max(width,depth),short=Math.min(width,depth),square=width===depth;
    // This capsule is an indexing bound only. Use its long axis so that a
    // narrow north/south wall is not lost when the camera queries its end.
    // Square pieces use rock: obstacle() intentionally defaults zero log
    // halfLength to 55 for legacy logs, which would enlarge square bounds.
    return Object.freeze({...structure,
      region:layout.worldId,type:square?'rock':'log',variant:'city-structure',
      r:short/2,halfLength:square?0:(long-short)/2,angle:depth>width?Math.PI/2:0,
      scale:1,seed:identity(structure.id)/4294967296,
      collision:false,heightBand:'high',sortY:structure.y+depth/2,
      visual:CITY_NATIVE_PRESERVED_IDS.includes(structure.id)?undefined:false
    });
  });
  const blocks=createCityBlockScenery(layout),greens=createCityGreenScenery(layout,blocks);
  const native=[...createNativeCityProps(layout),...createNativeCityBridgeProps(layout),...blocks.map(prop=>decorateNativeCityProp(prop))];
  const result=Object.freeze([...props,...native,...greens]);cache.set(layout,result);return result;
}
