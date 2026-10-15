import { getConfigSection } from '../content-config.js';

let cached;
// The complete walkable union is baked offline. All scene, map and collision
// consumers share this immutable geometry; the seed never changes an exit.
export function createRiftLayout(){
  if(cached)return cached;
  const source=getConfigSection('worlds').definitions.find(world=>world.id==='forest')?.authored;
  if(!source||source.kind!=='rift-forest')throw new Error('Missing baked forest layout');
  const routes=source.passages.flatMap(passage=>passage.waypoints.slice(1).map((b,index)=>{
    const a=passage.waypoints[index];return Object.freeze({id:`rift-route:${passage.id}:${index}`,kind:passage.kind,ax:a.x,ay:a.y,bx:b.x,by:b.y,r:passage.width/2});
  }));
  const clearings=[...source.encounters,...['treasure18','treasure07'].map(key=>Object.freeze({...source.landmarks[key],id:`clearing:rift:${key}`,r:100,kind:'secret'}))];
  cached=Object.freeze({...source,routes:Object.freeze(routes),clearings:Object.freeze(clearings),obstacles:Object.freeze([])});
  return cached;
}
