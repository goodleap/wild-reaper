import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';
import { blocksObstacle } from './dist/height-rules.js';

const island=new Island({region:'rift-forest'}),terrain=new Terrain({region:'rift-forest',island}),layout=island.layout,b=island.bounds;
const props=terrain.query(b.minX,b.minY,b.maxX,b.maxY),edge=props.filter(p=>p.riftEdge),groups=props.filter(p=>p.riftGroup),sparse=props.filter(p=>p.id.startsWith('rift-sparse:'));
assert(edge.length>300,'the shared contour is dressed with depth-sorted material units');
assert(groups.length>45&&sparse.length>=25,'interior groups supplement the existing traversable groves');
assert(groups.some(p=>p.riftArea==='03'&&p.type==='rock'),'the quarry contains rock groups');
assert(groups.some(p=>p.riftArea==='11'&&p.variant==='world-city-wall'),'the ruins contain broken masonry');
assert(groups.some(p=>p.riftArea==='08'&&p.type==='tree'&&!p.riftShrub),'the woodland has full trees among lower growth');
assert(edge.some(p=>p.riftShrub)&&edge.some(p=>p.type==='rock')&&edge.some(p=>p.type==='tree'&&!p.riftShrub),'edge vegetation and rock have separate forms');
for(const prop of edge){
  assert(!terrain.rift.circleFree(prop.x,prop.y,0,'ground'),'edge roots stay on the blocked side');
  assert(!terrain.rift.circleFree(prop.x,prop.y,0,'air'),'large edge units stand in solid landforms, never open water beside a bridge');
  for(const passage of layout.passages.filter(p=>p.kind==='bridge'&&p.deck?.length>=2)){
    const [a,z]=passage.deck,dx=z.x-a.x,dy=z.y-a.y,t=Math.max(0,Math.min(1,((prop.x-a.x)*dx+(prop.y-a.y)*dy)/(dx*dx+dy*dy)));
    assert(Math.hypot(prop.x-a.x-dx*t,prop.y-a.y-dy*t)>=passage.width/2+90,'large scenery leaves the deck and bridgehead readable');
  }
  for(const profile of ['ground','air','projectile','sight','overhead'])assert(!blocksObstacle(prop,profile),'visible edge units never add another collision mask');
}
for(const prop of [...groups,...sparse]){
  const span=prop.type==='log'?prop.halfLength:0,dx=Math.cos(prop.angle||0)*span,dy=Math.sin(prop.angle||0)*span;
  assert(!island.isReservedCapsule(prop.x-dx,prop.y-dy,prop.x+dx,prop.y+dy,prop.r+26),`${prop.id} preserves roads and encounter/interaction reservations`);
  assert(!terrain.rift.firstBlocker(prop.x-dx,prop.y-dy,prop.x+dx,prop.y+dy,prop.r+55,'ground'),`${prop.id} has full-body boundary clearance`);
  assert(!terrain.isFree(prop.x,prop.y,20),`${prop.id} is real terrain rather than a painted obstacle`);
  if(prop.riftShrub){assert.equal(prop.heightBand,'low');assert(prop.visual.top<66,'a shrub uses its own measured silhouette');}
}
// New games and arbitrary query order cannot rearrange a narrow local route.
const secondIsland=new Island({region:'rift-forest',seed:81}),second=new Terrain({region:'rift-forest',island:secondIsland,seed:81});
for(const area of [...layout.areas].reverse())second.query(area.center.x-240,area.center.y-240,area.center.x+240,area.center.y+240);
const snapshot=items=>items.filter(p=>p.riftPalette).map(p=>[p.id,p.x,p.y,p.type,p.r,p.riftShrub??false]).sort((a,b)=>a[0].localeCompare(b[0]));
assert.deepEqual(snapshot(second.query(b.minX,b.minY,b.maxX,b.maxY)),snapshot(props));
// Full-body sweeps still traverse both bridge decks and every authored
// passage. Gate opening is explicit, so it cannot hide a broken approach.
terrain.setRiftGate('bell-shortcut',true);let swept=0;
for(const passage of layout.passages)for(let i=1;i<passage.waypoints.length;i++){
  const a=passage.waypoints[i-1],z=passage.waypoints[i];
  if(terrain.rift.firstBlocker(a.x,a.y,z.x,z.y,24,'ground'))continue;
  const result=terrain.moveCircle(a.x,a.y,z.x-a.x,z.y-a.y,24);
  assert(Math.hypot(result.x-z.x,result.y-z.y)<.1,`${passage.id} retains its authored full-body walking leg`);swept++;
}
assert(swept>30);
console.log(JSON.stringify({riftScenery:'passed',edge:edge.length,groups:groups.length,sparse:sparse.length,fullBodyPassageSweeps:swept}));
