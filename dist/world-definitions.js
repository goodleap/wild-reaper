import forest from './worlds/forest.js';
import marsh from './worlds/marsh.js';
import ruins from './worlds/ruins.js';
import beach from './worlds/beach.js';
import city from './worlds/city.js';
import mountain from './worlds/mountain.js';
import snow from './worlds/snow.js';
import volcano from './worlds/volcano.js';

// Registration order is persistent: saved routes and world seeds use these indices.
export const REGIONS=Object.freeze([forest,marsh,ruins,beach,city,mountain,snow,volcano]);
const BY_ID=new Map(REGIONS.map(world=>[world.id,world]));
export const worldForId=id=>BY_ID.get(id)||REGIONS[0];
export const WORLD_IDS=Object.freeze(REGIONS.map(region=>region.id));
export const normalizeWorldIndex=index=>Number.isFinite(index)?((Math.trunc(index)%REGIONS.length)+REGIONS.length)%REGIONS.length:0;
export const regionFor=index=>REGIONS[normalizeWorldIndex(index)];
export const WORLD_CONNECTIONS=Object.freeze([[0,1],[1,2],[0,2],[0,3],[3,4],[4,5],[5,6],[6,7],[7,2],[4,2]].map(edge=>Object.freeze(edge)));
const NEIGHBORS=Object.freeze(REGIONS.map((_,index)=>Object.freeze(WORLD_CONNECTIONS.flatMap(([a,b])=>a===index?[b]:b===index?[a]:[]).sort((a,b)=>a-b))));
export const worldNeighbors=index=>NEIGHBORS[normalizeWorldIndex(index)];
