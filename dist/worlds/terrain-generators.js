import { naturalTerrainCell } from './natural-terrain.js';
import { TERRAIN_GENERATOR_IDS } from './generator-ids.js';

// Recipes contain bounded numeric parameters, never code or expressions.
function sceneryTerrainCell({zone,roll,place,settings}){
  const placements=settings.placements[zone.id]||settings.placements.default;
  for(const item of placements){
    if(item.condition&&roll(item.condition.roll)<=item.condition.above)continue;
    const properties=item.properties&&Object.fromEntries(Object.entries(item.properties).map(([key,value])=>[
      key,typeof value==='number'?value:value.base+roll(value.roll)*value.gain
    ]));
    if(properties)place(item.type,item.variant,item.x,item.y,properties);
    else place(item.type,item.variant,item.x,item.y);
  }
}
export const TERRAIN_GENERATORS=Object.freeze({natural:naturalTerrainCell,scenery:sceneryTerrainCell});
export function terrainGenerator(id){
  if(!TERRAIN_GENERATOR_IDS.includes(id))throw new RangeError(`Unknown terrain generator: ${String(id)}`);
  return TERRAIN_GENERATORS[id];
}
