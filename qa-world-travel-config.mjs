import assert from 'node:assert/strict';
import { getConfigSection } from './dist/content-config.js';
import { validateWorldTravel } from './dist/config-validation/world-travel.js';

const source=getConfigSection('worlds');
validateWorldTravel(source);
const cases=[
  ['missing travel',worlds=>delete worlds.travel],
  ['unlisted region',worlds=>worlds.travel.regions.pop()],
  ['invalid start',worlds=>worlds.travel.startWorldId='forest'],
  ['duplicate shop kind',worlds=>worlds.travel.regions[0].core.facilities[1].kind='weapons'],
  ['invisible oversized foundation',worlds=>worlds.travel.regions[0].core.facilities[0].width=260],
  ['shop outside safe core',worlds=>worlds.travel.regions[0].core.facilities[0].x+=800],
  ['overlapping facilities',worlds=>Object.assign(worlds.travel.regions[0].core.facilities[1],{x:worlds.travel.regions[0].core.facilities[0].x,y:worlds.travel.regions[0].core.facilities[0].y})],
  ['missing paved streets',worlds=>delete worlds.travel.regions[0].core.ground.streets],
  ['unpaved shop door',worlds=>{const c=worlds.travel.regions[0].core;c.ground.streets=c.ground.streets.filter(s=>s.points.every(p=>Math.abs(p.x-c.facilities[0].x)>50));}],
  ['unsafe spawn',worlds=>worlds.travel.regions[0].core.spawn.x+=2000],
  ['encounter inside town',worlds=>Object.assign(worlds.definitions.find(w=>w.id==='rift-forest').authored.encounters[0],worlds.travel.regions[0].core.spawn)],
  ['missing world edge',worlds=>worlds.travel.connections.pop()],
  ['duplicate edge',worlds=>worlds.travel.connections.push(structuredClone(worlds.travel.connections[0]))],
  ['exit inside settlement',worlds=>Object.assign(worlds.travel.connections[0].endpoints['rift-forest'],worlds.travel.regions[0].core)],
  ['non-unit arrival direction',worlds=>worlds.travel.connections[0].endpoints['rift-forest'].arrivalDirection={x:2,y:0}],
  ['backward arrival',worlds=>{const d=worlds.travel.connections[0].endpoints['rift-forest'].arrivalDirection;d.x*=-1;d.y*=-1;}],
  ['missing boundary strip',worlds=>delete worlds.travel.connections[0].endpoints['rift-forest'].exitTrigger],
  ['exit detached from boundary',worlds=>worlds.travel.connections[0].endpoints['rift-forest'].y+=100],
  ['wrong boundary orientation',worlds=>worlds.travel.connections[0].endpoints['rift-forest'].exitTrigger.edge='south'],
  ['strip misses part of road',worlds=>worlds.travel.connections[0].endpoints['rift-forest'].exitTrigger.width-=40],
  ['sign on transfer strip',worlds=>(()=>{const e=worlds.travel.connections[0].endpoints['rift-forest'];Object.assign(e.sign,{x:e.x,y:e.y});})()],
  ['wrong adjacent material',worlds=>worlds.travel.connections[0].endpoints['rift-forest'].transition.theme='snow'],
  ['preview disagrees with live exit',worlds=>worlds.definitions.find(w=>w.id==='rift-forest').authored.plan['portal:1'].x+=90],
];
for(const [name,mutate] of cases){const worlds=structuredClone(source);mutate(worlds);assert.throws(()=>validateWorldTravel(worlds),TypeError,name);}
console.log(`World travel config: valid catalogue and ${cases.length} rejected invalid layouts passed.`);
