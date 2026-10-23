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
  ['missing world edge',worlds=>worlds.travel.connections.pop()],
  ['duplicate edge',worlds=>worlds.travel.connections.push(structuredClone(worlds.travel.connections[0]))],
  ['exit inside settlement',worlds=>Object.assign(worlds.travel.connections[0].endpoints['rift-forest'],{x:-3168,y:1812.14})],
  ['non-unit arrival direction',worlds=>worlds.travel.connections[0].endpoints['rift-forest'].arrivalDirection={x:2,y:0}],
  ['backward arrival',worlds=>{const d=worlds.travel.connections[0].endpoints['rift-forest'].arrivalDirection;d.x*=-1;d.y*=-1;}],
  ['wrong adjacent material',worlds=>worlds.travel.connections[0].endpoints['rift-forest'].transition.theme='snow'],
  ['preview disagrees with live exit',worlds=>worlds.definitions.find(w=>w.id==='rift-forest').authored.plan['portal:1'].x+=90],
];
for(const [name,mutate] of cases){const worlds=structuredClone(source);mutate(worlds);assert.throws(()=>validateWorldTravel(worlds),TypeError,name);}
console.log(`World travel config: valid catalogue and ${cases.length} rejected invalid layouts passed.`);
