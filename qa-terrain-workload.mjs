import assert from 'node:assert/strict';
import { Terrain } from './dist/terrain.js';
import { Island } from './dist/islands.js';
import { RiftCollision } from './dist/rift-collision.js';

const point=([x,y])=>({x,y});
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
let seed=371,visibilityChecks=0,movementChecks=0;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const profiles=['ground','air','projectile','sight','overhead'];
const make=()=>{
  const terrain=new Terrain({obstacles:[
    {id:'trunk',type:'tree',x:140,y:140,r:20},
    {id:'low-stone',type:'rock',x:470,y:150,r:25,heightBand:'low'},
    {id:'log',type:'log',x:320,y:250,angle:Math.PI/3,halfLength:80,r:14}
  ]});
  const outer=[[0,0],[1200,0],[1200,480],[600,480],[600,700],[0,700]].map(point);
  const lake=[[260,80],[400,80],[400,200],[260,200]].map(point);
  terrain.rift=new RiftCollision({boundaries:[outer,lake],solidBoundaries:[outer]});
  return terrain;
};
const forest=new Terrain({region:'rift-forest',island:new Island({region:'rift-forest',seed:0})});
// Authored-world queries equal an independent scan of the actual immutable
// layout plus live structures. Procedural cells must never be consulted.
const indexed=[...new Set([...forest._layoutIndex.values()].flat())];
forest.setStructures([{id:'qa-live-gate',type:'log',x:-2500,y:1200,r:10,halfLength:80}]);
forest._cell=()=>assert.fail('fixed outline worlds have no procedural cells');
for(let i=0;i<120;i++){
  const minX=-3600+random()*6600,minY=-2700+random()*4800,maxX=minX+100+random()*600,maxY=minY+100+random()*600;
  const expected=[...forest._structures,...indexed].filter(o=>o.bounds.maxX>=minX&&o.bounds.minX<=maxX&&o.bounds.maxY>=minY&&o.bounds.minY<=maxY).map(o=>o.id).sort();
  assert.deepEqual(forest.query(minX,minY,maxX,maxY).map(o=>o.id).sort(),expected);
}
for(const terrain of [make(),forest,new Terrain({obstacles:[{type:'tree',x:30,y:0,r:10}]})]){
  const bounds=terrain.island?.bounds??{minX:-100,minY:-100,maxX:1300,maxY:800};
  const positions=[{x:0,y:0},{x:260,y:80},{x:384,y:384},{x:600,y:480},{x:-20,y:40}];
  for(let i=0;i<160;i++)positions.push({x:bounds.minX+random()*(bounds.maxX-bounds.minX),y:bounds.minY+random()*(bounds.maxY-bounds.minY)});
  for(const profile of profiles)for(const r of [0,4,15,28,49])for(let i=0;i<positions.length;i++){
    const a=positions[i],b=positions[(i*37+13)%positions.length];
    const expected=!!terrain.firstBlocker(a.x,a.y,b.x,b.y,r,profile);
    assert.equal(terrain.hasBlocker(a.x,a.y,b.x,b.y,r,profile),expected,`visibility ${profile} r=${r} ${JSON.stringify({a,b})}`);
    visibilityChecks++;
  }
}
// A boolean query must still see a live gate, with no stale visibility cache.
const gates=make();
gates.setStructures([{type:'log',x:800,y:150,angle:Math.PI/2,halfLength:130,r:10}]);
assert(gates.hasBlocker(650,150,1050,150,15));
gates.setStructures([]);assert(!gates.hasBlocker(650,150,1050,150,15));
let overheadQueries=0;const query=gates.query.bind(gates);
gates.query=(...args)=>{overheadQueries++;return query(...args);};
assert(!gates.hasBlocker(-100,150,1500,150,50,'overhead'));assert.equal(overheadQueries,0);

// Preserve the old exact geometry as an oracle: discard candidate caches and
// obtain boolean visibility from the unchanged nearest-obstacle operation.
function originalQueries(terrain){
  for(const mask of [terrain.rift.ground,terrain.rift.high]){
    mask._localEdges=function(minX,minY,maxX,maxY){return this.query(minX,minY,maxX,maxY);};
    mask.hasBlocker=function(...args){return !!this.firstBlocker(...args);};
  }
  return terrain;
}
const countBoundaryQueries=terrain=>{
  let calls=0;
  for(const mask of [terrain.rift.ground,terrain.rift.high]){
    const query=mask.query.bind(mask);mask.query=(...args)=>{calls++;return query(...args);};
  }
  return ()=>calls;
};
let fastQueries=0,originalCalls=0;
for(const shared of [false,true])for(const profile of profiles)for(const r of [8,15,28,49]){
  const fast=make(),original=originalQueries(make()),countFast=countBoundaryQueries(fast),countOriginal=countBoundaryQueries(original),cache=shared?{}:null;
  let a={x:70,y:70},b={...a};
  for(let i=0;i<180;i++){
    const angle=Math.floor(i/30)*Math.PI/3,dx=Math.cos(angle)*4.8,dy=Math.sin(angle)*4.8;
    a=fast.moveCircle(a.x,a.y,dx,dy,r,profile,cache);
    b=original.moveCircle(b.x,b.y,dx,dy,r,profile);
    near(a.x,b.x);near(a.y,b.y);assert.equal(a.blocked,b.blocked);movementChecks++;
  }
  fastQueries+=countFast();originalCalls+=countOriginal();
}
assert(fastQueries<originalCalls*.6,'local outline candidates avoid repeated broad-phase collection');

// Cached candidates must be exactly the original cells, including at an
// inclusive upper grid line and negative coordinates. No extra edge padding.
const gridMask=make().rift.ground,gridCache={};
for(const x of [-384.00001,-384,-383.99999,-.00001,0,.00001,383.99999,384,384.00001,767.99999,768])for(const r of [0,8,49]){
  const box=[x-r,100-r,x+r,100+r];
  assert.deepEqual(gridMask._localEdges(...box,gridCache),gridMask.query(...box));
  for(const dy of [-120,0,120])assert.equal(gridMask.hasBlocker(x,100,x+80,100+dy,r,gridCache),!!gridMask.firstBlocker(x,100,x+80,100+dy,r));
}
// Start/end validation shares only two exact immutable point-in-polygon
// answers. A changed position or ground/air mask cannot inherit an answer.
const exact=make().rift,inside=exact.ground.inside.bind(exact.ground),insideCache={};let insideCalls=0;
exact.ground.inside=(...args)=>{insideCalls++;return inside(...args);};
assert(exact.circleFree(70,70,8,'ground',insideCache));
assert(exact.circleFree(75,70,8,'ground',insideCache));
assert(!exact.hasBlocker(70,70,75,70,8,'ground',insideCache));
assert.equal(insideCalls,2,'repeated start/end checks reuse exact inclusion');
assert(exact.circleFree(75+1e-10,70,8,'ground',insideCache));assert.equal(insideCalls,3,'coordinates are not rounded');
assert(!exact.circleFree(330,140,8,'ground',insideCache));
assert(exact.circleFree(330,140,8,'air',insideCache));
assert(!exact.circleFree(330,140,8,'ground',insideCache),'returning to the ground mask invalidates the air answer');

// Reuse across a changed mask, radius, distant location, long slide and closed
// gate. Sharing candidates must never grant clearance or hide new obstacles.
const fast=make(),original=originalQueries(make()),cache={};
const requests=[
  [70,70,3,-2,15,'ground'],[70,70,400,0,15,'ground'],
  [70,70,400,0,15,'air'],[70,70,400,0,49,'ground'],
  [700,40,480,-30,15,'ground'],[1000,650,-600,0,15,'ground'],
  [140,140,0,0,15,'ground'],[270,150,-100,0,15,'ground']
];
for(const args of requests){
  const a=fast.moveCircle(...args,cache),b=original.moveCircle(...args);
  near(a.x,b.x);near(a.y,b.y);assert.equal(a.blocked,b.blocked);movementChecks++;
}
for(const terrain of [fast,original])terrain.setStructures([{type:'log',x:800,y:150,angle:Math.PI/2,halfLength:130,r:10}]);
let a=fast.moveCircle(650,150,400,0,15,'ground',cache),b=original.moveCircle(650,150,400,0,15);
near(a.x,b.x);near(a.y,b.y);assert.equal(a.blocked,b.blocked);assert(a.x<=775.001);
// The same object must not retain another terrain's mask when reused.
const replacement=make();replacement.rift=new RiftCollision({boundaries:[[[0,0],[300,0],[300,300],[0,300]].map(point)]});
a=replacement.moveCircle(250,100,100,0,15,'ground',cache);assert(a.x<=285.001);

// Boolean visibility exits on the first blocking bucket, unlike nearest-edge
// selection. The saved work is observable without relying on elapsed timing.
const mask=make().rift.ground,get=mask.grid.get.bind(mask.grid);let buckets=0;
mask.grid.get=id=>{buckets++;return get(id);};
assert(mask.firstBlocker(-50,100,5000,100,15));const allBuckets=buckets;buckets=0;
assert(mask.hasBlocker(-50,100,5000,100,15));assert(buckets<allBuckets);
console.log(JSON.stringify({terrainWorkload:'passed',visibilityChecks,movementChecks,boundaryQueries:{cached:fastQueries,original:originalCalls},earlyExitBuckets:{boolean:buckets,nearest:allBuckets}}));
