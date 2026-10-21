import { getConfigSection } from './content-config.js';
import { defineWorld } from './worlds/define-world.js';
import { terrainGenerator } from './worlds/terrain-generators.js';

const config=getConfigSection('worlds'),definitions=new Map(config.definitions.map(world=>[world.id,world]));
// Explicit registration order preserves numeric world identities and seed mapping.
export const REGIONS=Object.freeze(config.order.map(id=>{
  const source=definitions.get(id);
  return defineWorld({...source,terrain:{...source.terrain,generate:terrainGenerator(source.terrain.generatorId)}});
}));
const BY_ID=new Map(REGIONS.map(world=>[world.id,world]));
export const worldForId=id=>BY_ID.get(id)||REGIONS[0];
export const WORLD_IDS=Object.freeze(REGIONS.map(region=>region.id));
export const normalizeWorldIndex=index=>Number.isFinite(index)?((Math.trunc(index)%REGIONS.length)+REGIONS.length)%REGIONS.length:0;
export const regionFor=index=>REGIONS[normalizeWorldIndex(index)];
export const WORLD_CONNECTIONS=Object.freeze(config.connections.map(edge=>Object.freeze(edge.map(id=>WORLD_IDS.indexOf(id)))));
// Keep portal placement order stable when a map receives a separate identity.
const NEIGHBORS=Object.freeze(REGIONS.map((_,index)=>Object.freeze(WORLD_CONNECTIONS.flatMap(([a,b])=>a===index?[b]:b===index?[a]:[]).sort((a,b)=>(REGIONS[a].seed??a)-(REGIONS[b].seed??b)||a-b))));
export const worldNeighbors=index=>NEIGHBORS[normalizeWorldIndex(index)];
