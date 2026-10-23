import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateInteriorLayouts } from './dist/config-validation/interior-layouts.js';
import { validateWorlds } from './dist/config-validation/worlds.js';

const read=name=>JSON.parse(readFileSync(new URL(`./dist/config/${name}.json`,import.meta.url)));
const geography=read('geography'),worlds=read('worlds'),enemies=read('enemies');
const context={worldIds:new Set(worlds.definitions.map(world=>world.id)),enemyIds:new Set(Object.keys(enemies.definitions))};
const layouts=geography.interiors.authoredLayouts;
const validate=value=>validateInteriorLayouts(value,'interiors.authoredLayouts',context);
assert.equal(validate(layouts),true);
let rejected=0;
function rejects(name,mutate,reason){
  const candidate=structuredClone(layouts);mutate(candidate);
  assert.throws(()=>validate(candidate),reason,name);rejected++;
}
rejects('both authored samples required',c=>delete c.darkriver,/authoredLayouts.darkriver/);
rejects('style matches the selected sample',c=>c.darkriver.style='castle',/style/);
rejects('world terrain reference exists',c=>c.darkriver.terrain='missing-world',/terrain/);
rejects('coordinates are finite',c=>c.darkriver.floorPolygons[0].outer[0][0]=NaN,/\.x/);
rejects('floor vertices stay within scene bounds',c=>c.darkriver.floorPolygons[0].outer[0][0]=c.darkriver.bounds.minX-1,/\.x/);
rejects('floor edges cannot be duplicated',c=>c.darkriver.floorPolygons[0].outer[1]=[...c.darkriver.floorPolygons[0].outer[0]],/duplicate edge/);
rejects('floor contours cannot cross themselves',c=>{
  const b=c.darkriver.bounds;
  c.darkriver.floorPolygons[0].outer=[[b.minX+1,b.minY+1],[b.maxX-1,b.maxY-1],[b.minX+1,b.maxY-1],[b.maxX-1,b.minY+1]];
},/area|self intersection/);
rejects('a hole cannot coincide with its floor boundary',c=>c.darkriver.floorPolygons[0].holes=[structuredClone(c.darkriver.floorPolygons[0].outer)],/hole outside floor/);
rejects('cell IDs are contiguous',c=>c.darkriver.cells[0].id=4,/cells.0.id/);
rejects('cell bounds belong to the scene',c=>c.darkriver.cells[0].bounds.minX=c.darkriver.bounds.minX-1,/bounds.minX/);
rejects('neighbor references are valid',c=>c.darkriver.cells[0].neighbors.push(999),/neighbor/);
rejects('adjacency is reciprocal',c=>{
  const cells=c.darkriver.cells,cell=cells.find(v=>v.neighbors.length>1),neighbor=cells[cell.neighbors[0]];
  cell.neighbors=cell.neighbors.filter(id=>id!==neighbor.id);
},/nonreciprocal neighbor/);
rejects('isolated components are rejected',c=>{
  assert.equal(c.darkriver.cells.length%2,0);
  for(const cell of c.darkriver.cells)cell.neighbors=[cell.id^1];
},/disconnected cells/);
rejects('exit directions are normalized',c=>c.darkriver.exits[0].direction={x:1,y:1},/direction.length/);
rejects('chests refer to existing cells',c=>c.darkriver.chests[0].cellId=999,/cellId/);
rejects('a switch must reference an actual graph edge',c=>c.darkriver.mechanisms[0].closedLink=[0,0],/closedLink edge/);
rejects('a gate has physical length',c=>{
  const g=c.darkriver.mechanisms[0].gate;g.bx=g.ax;g.by=g.ay;
},/gate.length/);
rejects('a switch cannot be locked behind its own gate',c=>{
  const l=c.darkriver,m=l.mechanisms[0],cell=l.cells[1];
  m.closedLink=[l.entranceCell,l.cells[l.entranceCell].neighbors[0]];
  m.cellId=cell.id;m.x=cell.x;m.y=cell.y;
},/unreachable mechanism/);
rejects('main route ends at the boss room',c=>c.darkriver.mainRoute.pop(),/mainRoute endpoints/);
rejects('enemy type exists',c=>c.darkriver.groups[0].enemies[0].type='missing-enemy',/\.type/);
rejects('enemy spawn stays within its room',c=>c.darkriver.groups[0].enemies[0].x=10001,/\.x/);
rejects('group healing flag is boolean',c=>c.darkriver.groups[0].heal='yes',/heal/);
rejects('prop identities are unique within the prop list',c=>c.darkriver.props[1].id=c.darkriver.props[0].id,/duplicate/);
rejects('mechanism artwork is not duplicated as a prop',c=>c.darkriver.props.push({id:'bad',type:'interiorWinch',...c.darkriver.entrance,r:20,collision:false}),/\.type/);
rejects('furniture footprint is finite and positive',c=>c.forestCastle.props.find(p=>p.footprint).footprint.width=0,/footprint.width/);
rejects('furniture anchor offset is finite',c=>c.forestCastle.props.find(p=>p.footprint).footprint.offsetY=Infinity,/footprint.offsetY/);

// Confirm the main configuration entry point applies the furniture rules too.
const sections={worlds,geography,stages:read('stages'),enemies,encounters:read('encounters'),economy:read('economy')};
assert.equal(validateWorlds(sections),true);
for(const [key,value]of [['width',-1],['depth',Infinity],['offsetY',NaN]]){
  const candidate={...sections,geography:structuredClone(geography)};
  const prop=candidate.geography.interiors.hutLayouts.default.props.find(p=>p.footprint);
  assert(prop,'default hut uses explicit furniture footprints');prop.footprint[key]=value;
  assert.throws(()=>validateWorlds(candidate),new RegExp('hut prop.footprint.'+key));rejected++;
}
console.log(`Interior configuration: 2 authored layouts accepted; ${rejected} invalid geometry, graph, placement and furniture cases rejected.`);
