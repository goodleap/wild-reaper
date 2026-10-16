import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';
import { RiftNavigation } from './dist/rift-navigation.js';
import { createCityScenery } from './dist/worlds/city-scenery.js';

const island=new Island({region:'clockshadow-city',seed:8});
const terrain=new Terrain({region:'clockshadow-city',seed:8,island});
const layout=island.layout;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
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

// Preserve the accepted castle plan at its original scale, including the
// 700 × 400 keep. A large icon at the courtyard center cannot satisfy this.
const castleOrigin={x:-5200,y:-4300};
const castleAssemblies=[
  ['主堡',[650,300,1350,700]],['西翼',[420,400,650,700]],['东翼',[1350,400,1580,700]],
  ['兵营',[250,860,600,1150]],['军械仓库',[1400,860,1750,1120]],['马厩',[250,1270,650,1500]],['工坊',[1370,1320,1750,1500]],
  ['北墙',[150,100,1850,140]],['西墙北',[150,100,190,590]],['西墙南',[150,770,190,1640]],
  ['东墙北',[1810,100,1850,1160]],['东墙南',[1810,1340,1850,1640]],['南墙西',[150,1600,900,1640]],['南墙东',[1100,1600,1850,1640]],
  ['瓮城西',[680,1410,720,1600]],['瓮城东',[1280,1410,1320,1600]],['内门墙西',[680,1370,900,1410]],['内门墙东',[1100,1370,1320,1410]],
  ['西北塔',[150,100,270,220]],['东北塔',[1730,100,1850,220]],['西南塔',[150,1520,270,1640]],['东南塔',[1730,1520,1850,1640]]
];
for(const [name,[minX,minY,maxX,maxY]] of castleAssemblies){
  const pieces=layout.cityStructures.filter(s=>s.id===`castle:${name}`||s.id.startsWith(`castle:${name}:`));
  assert(pieces.length,`castle ${name} has physical building modules`);
  const bounds=[Math.min(...pieces.map(s=>s.x-s.width/2))-castleOrigin.x,Math.min(...pieces.map(s=>s.y-s.depth/2))-castleOrigin.y,Math.max(...pieces.map(s=>s.x+s.width/2))-castleOrigin.x,Math.max(...pieces.map(s=>s.y+s.depth/2))-castleOrigin.y];
  assert.deepEqual(bounds,[minX,minY,maxX,maxY],`castle ${name} retains its complete footprint`);
  assert.equal(pieces.reduce((sum,s)=>sum+s.width*s.depth,0),(maxX-minX)*(maxY-minY),`castle ${name} is tiled without omitted volume`);
}
const castleRoutes={
  main:[[1000,1760],[1000,1500],[1000,1220],[1000,950]],
  west:[[1000,1220],[750,1220],[750,780],[310,780],[310,300],[340,220],[1000,220]],
  east:[[1000,220],[1660,220],[1660,780],[1250,780],[1250,1220],[1740,1220],[1920,1250]],
  postern:[[310,680],[80,680]],
  crossCourt:[[750,1220],[1250,1220]]
};
for(const p of layout.passages.filter(p=>p.gateId))terrain.setRiftGate(p.gateId,true);
let castleSweeps=0,roadSweeps=0;
function replay(points,radius,label){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    assert(terrain.isFree(a.x,a.y,radius),`${label}: r${radius} has standing space`);
    assert(!terrain.firstBlocker(a.x,a.y,b.x,b.y,radius),`${label}: r${radius} has swept clearance`);
    const result=terrain.moveCircle(a.x,a.y,b.x-a.x,b.y-a.y,radius);
    assert(distance(result,b)<.02,`${label}: actual r${radius} body completes the leg`);
  }
}
for(const [name,route] of Object.entries(castleRoutes))for(const radius of [15,24,49]){
  replay(route.map(([x,y])=>({x:x+castleOrigin.x,y:y+castleOrigin.y})),radius,`castle:${name}`);
  castleSweeps+=route.length-1;
}
for(const passage of layout.passages)for(const radius of [15,24,49]){
  replay(passage.waypoints,radius,passage.id);roadSweeps+=passage.waypoints.length-1;
}

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

// Large within-area holes need explicit graph detours. Test both directions
// around the keep; the bounded local grid must not be the only global route.
const navigation=new RiftNavigation(terrain),castlePoint=([x,y])=>({x:x+castleOrigin.x,y:y+castleOrigin.y});
for(const radius of [15,24,49])for(const [a,b] of [[[1000,950],[1000,220]],[[310,680],[1740,1220]],[[80,680],[1000,1760]]])for(const reverse of [false,true]){
  const start=castlePoint(reverse?b:a),target=castlePoint(reverse?a:b),route=navigation.route(start,target,radius,'ground');
  assert(route?.length,`castle internal graph retains a real r${radius} detour`);
  let prior=start;for(const p of route){assert(!terrain.firstBlocker(prior.x,prior.y,p.x,p.y,radius),'each macro detour leg also clears real terrain');prior=p;}
}
console.log(JSON.stringify({cityGeometry:'passed',dimensions:[14400,10800],structures:layout.cityStructures.length,footprintSamples,exposedSweeps,castleAssemblies:castleAssemblies.length,castleSweeps,roadSweeps,waterSweeps}));
