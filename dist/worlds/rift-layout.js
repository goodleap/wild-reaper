import { getConfigSection } from '../content-config.js';

const cached=new Map();
// The complete walkable union is baked offline. All scene, map and collision
// consumers share this immutable geometry; the seed never changes an exit.
export function createRiftLayout(worldId='forest'){
  if(cached.has(worldId))return cached.get(worldId);
  const source=getConfigSection('worlds').definitions.find(world=>world.id===worldId)?.authored;
  if(!source||source.kind!=='rift-forest')throw new Error(`Missing baked world layout: ${worldId}`);
  const routes=source.passages.flatMap(passage=>passage.waypoints.slice(1).map((b,index)=>{
    const a=passage.waypoints[index];return Object.freeze({id:`rift-route:${source.worldId?`${source.worldId}:`:''}${passage.id}:${index}`,kind:passage.kind,ax:a.x,ay:a.y,bx:b.x,by:b.y,r:passage.width/2});
  }));
  const treasures=source.interactions?.chests.map(chest=>({...chest,id:`clearing:rift:${worldId}:${chest.id}`}))??['treasure18','treasure07'].map(key=>({...source.landmarks[key],id:`clearing:rift:${key}`}));
  const entrances=source.interactions?[...source.interactions.caves,...source.interactions.gates.map(gate=>({...gate.approach,id:`${gate.id}:approach`}))].map(site=>Object.freeze({...site,id:`clearing:rift:${worldId}:${site.id}`,r:140,kind:'entrance'})):[];
  const clearings=[...source.encounters,...treasures.map(chest=>Object.freeze({...chest,r:100,kind:'secret'})),...entrances];
  const layout=Object.freeze({...source,routes:Object.freeze(routes),clearings:Object.freeze(clearings),obstacles:Object.freeze([])});
  cached.set(worldId,layout);return layout;
}
