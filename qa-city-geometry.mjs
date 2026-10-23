import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';
import { RiftNavigation } from './dist/rift-navigation.js';
import { createCityScenery } from './dist/worlds/city-scenery.js';
import { Regions } from './dist/regions.js';
import { worldNeighbors, WORLD_IDS } from './dist/world-definitions.js';

const island=new Island({region:'clockshadow-city',seed:8});
const terrain=new Terrain({region:'clockshadow-city',seed:8,island});
const layout=island.layout;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const neighbors=worldNeighbors(WORLD_IDS.indexOf('clockshadow-city'));
assert.deepEqual(neighbors.map(index=>WORLD_IDS[index]).sort(),['beach','mountain','ruins']);
assert.equal(layout.passages.filter(p=>p.kind==='exit').length,neighbors.length);
for(const target of neighbors){
  const portal={...layout.plan[`portal:${target}`],natural:true};
  for(const radius of [15,24,49]){
    const arrival=Regions.prototype.arrivalPoint.call({game:{terrain}},portal,radius);
    assert(arrival&&distance(arrival,portal)>=80,'travel arrival clears the natural portal contact zone');
    assert(terrain.isFree(arrival.x,arrival.y,radius),'arrival body remains outside city foundations');
    assert(!terrain.firstBlocker(arrival.x,arrival.y,portal.x,portal.y,radius),'the same exit is open in both directions');
  }
}
assert.equal(layout?.worldId,'clockshadow-city');
assert.equal(layout.artTheme,'city');
assert.equal(layout.bounds.maxX-layout.bounds.minX,14400);
assert.equal(layout.bounds.maxY-layout.bounds.minY,10800);
assert(layout.cityStructures.length>40,'continuous city blocks use real building footprints');
const artwork=createCityScenery(layout),drawn=new Map(terrain.query(layout.bounds.minX,layout.bounds.minY,layout.bounds.maxX,layout.bounds.maxY).filter(p=>p.variant==='city-structure').map(p=>[p.id,p]));
assert(Object.isFrozen(artwork)&&artwork.every(Object.isFrozen),'shared structure records stay immutable');
assert.equal(drawn.size,layout.cityStructures.length,'every authored structure enters the ordinary terrain depth queue');
for(const s of layout.cityStructures){
  const p=drawn.get(s.id);assert(p,`${s.id}: visible structure is indexed`);
  for(const key of ['x','y','width','depth','height','cityKind','style'])assert.equal(p[key],s[key],`${s.id}: rendered ${key} matches its baked foundation`);
  assert.equal(p.collision,false,'the same building cannot add a second capsule collider');
  assert.equal(p.sortY,s.y+s.depth/2,'the front foundation edge owns ordinary depth ordering');
}

// Artwork is nonblocking; every solid foundation is already subtracted from
// both immutable collision masks. Sample interiors independently of navigation.
let footprintSamples=0,exposedSweeps=0;
for(const structure of layout.cityStructures.filter(s=>s.solid)){
  const {x,y,width,depth}=structure;
  assert(width>0&&depth>0&&Number.isFinite(x+y+width+depth));
  for(const u of [-.45,0,.45])for(const v of [-.45,0,.45]){
    const p={x:x+u*width,y:y+v*depth};
    for(const profile of ['ground','air','sight','projectile'])assert(!terrain.rift.circleFree(p.x,p.y,0,profile),`${structure.id}: ${profile} cannot enter a visible foundation`);
    footprintSamples++;
  }
  for(const radius of [15,24,49])for(const [nx,ny,extent] of [[-1,0,width/2],[1,0,width/2],[0,-1,depth/2],[0,1,depth/2]]){
    const start={x:x+nx*(extent+radius+5),y:y+ny*(extent+radius+5)};
    if(!terrain.isFree(start.x,start.y,radius))continue; // Adjacent modules may share an interior seam.
    const result=terrain.moveCircle(start.x,start.y,x-start.x,y-start.y,radius);
    assert(result.blocked,`${structure.id}: a complete body sweep hits the exposed facade`);
    assert(terrain.isFree(result.x,result.y,radius),`${structure.id}: collision leaves a legal full body`);
    assert((result.x-x)*nx+(result.y-y)*ny>=extent+radius-.02,`${structure.id}: movement stops outside the foundation`);
    exposedSweeps++;
  }
}
assert(exposedSweeps>100,'exercise exposed faces across the whole city');

// Every authored inter-quarter street, court loop and interaction approach is
// tested against the actual complete-body sweep, not just its graph endpoints.
for(const p of layout.passages.filter(p=>p.gateId))terrain.setRiftGate(p.gateId,true);
let roadSweeps=0;
function replay(points,radius,label){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    assert(terrain.isFree(a.x,a.y,radius),`${label}: r${radius} has standing space`);
    assert(!terrain.firstBlocker(a.x,a.y,b.x,b.y,radius),`${label}: r${radius} has swept clearance`);
    const result=terrain.moveCircle(a.x,a.y,b.x-a.x,b.y-a.y,radius);
    assert(distance(result,b)<.02,`${label}: actual r${radius} body completes the leg`);
  }
}
for(const passage of layout.passages)for(const radius of [15,24,49]){
  replay(passage.waypoints,radius,passage.id);roadSweeps+=passage.waypoints.length-1;
}
assert(layout.passages.filter(p=>p.from===p.to).length>=10,'multiple real streets loop around building blocks');
assert(layout.cityStructures.some(s=>s.cityKind==='keep'),'the fortress has a real keep');
assert(layout.cityStructures.some(s=>s.cityKind==='cathedral'),'the cathedral has its own built footprint');
assert.equal(layout.cityStructures.filter(s=>s.cityKind==='belltower').length,0,'the functional bell tower is not duplicated by scenery');
assert(layout.cityStructures.filter(s=>s.cityKind==='wall').length>30,'continuous wall modules define controlled gates');
assert(layout.cityStructures.some(s=>s.cityKind==='fountain'),'the square includes low human-scale furnishings');

const bridges=layout.passages.filter(p=>p.kind==='bridge');
assert.equal(bridges.length,2);
let waterSweeps=0;
for(const bridge of bridges){
  const [a,b]=bridge.deck,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  assert(terrain.isFree(middle.x,middle.y,49),'a large body fits the actual bridge deck');
  for(const side of [-1,1]){
    const q={x:middle.x-dy/length*(bridge.width/2+70)*side,y:middle.y+dx/length*(bridge.width/2+70)*side};
    assert(!terrain.isFree(q.x,q.y,15),'the canal beside the deck blocks ordinary walkers');
    assert(terrain.isFree(q.x,q.y,15,'air'),'existing flight can cross low canal water');
    assert(!terrain.firstBlocker(q.x,q.y,middle.x,middle.y,0,'sight'),'low canal water preserves sight and projectile behavior');
    const result=terrain.moveCircle(middle.x,middle.y,q.x-middle.x,q.y-middle.y,15);
    assert(result.blocked&&terrain.isFree(result.x,result.y,15),'a long movement cannot leave the bridge for water');waterSweeps++;
  }
}

// Test graph routes from the camp to every region and fixed objective. Local
// grid search alone cannot paper over disconnected large-scale streets.
const navigation=new RiftNavigation(terrain);
const goals=[...layout.areas.map(a=>a.center),...Object.values(layout.plan),...layout.interactions.caves.map(s=>s.approach),...layout.interactions.chests.map(s=>s.approach)];
let navigationRoutes=0;
for(const radius of [15,24,49])for(const target of goals){
  assert(terrain.isFree(target.x,target.y,radius),'objectives retain body-wide standing room');
  for(const reverse of [false,true]){
    const start=reverse?target:layout.spawn,finish=reverse?layout.spawn:target;
    const route=navigation.route(start,finish,radius,'ground');
    assert(route?.length,`a real r${radius} route reaches ${finish.x},${finish.y}`);
    let prior=start;for(const p of route){assert(!terrain.firstBlocker(prior.x,prior.y,p.x,p.y,radius),'every macro leg clears real terrain');prior=p;}
    navigationRoutes++;
  }
}
console.log(JSON.stringify({cityGeometry:'passed',dimensions:[14400,10800],structures:layout.cityStructures.length,footprintSamples,exposedSweeps,roadSweeps,waterSweeps,navigationRoutes}));
