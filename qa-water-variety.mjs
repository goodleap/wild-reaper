import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment, ENVIRONMENT_BALANCE, WATER_SIZES } from './dist/environment.js';
import { WATER_SHAPES, containsWater, waterDepth, waterBounds, waterIntersectsCircle, getWaterContours, traceWaterPath } from './dist/water-geometry.js';
import { ImmersionArt } from './dist/immersion-art.js';

const world=()=>{
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,companions:false,settlements:false});
  g.environment=new Environment(g,{generation:false});return g;
};
const signedArea=points=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)*.5;
const base={x:130,y:-85,rx:240,ry:140,seed:.5,angle:0};
const shapes=WATER_SHAPES.map(shape=>({...base,shape}));
for(const mud of shapes){
  const g=getWaterContours(mud,{local:true}),b=waterBounds(mud);
  assert.equal(g.outer.length,48);assert.equal(g.holes.length,0);assert(signedArea(g.outer)>0);
  assert(containsWater(mud,mud.x,mud.y));assert.equal(waterDepth(mud,mud.x,mud.y),1);
  assert(!containsWater(mud,b.maxX+1,mud.y));assert(!waterIntersectsCircle(mud,b.maxX+11,mud.y,10));
  const moves=[],ctx={beginPath(){moves.push('begin');},moveTo(x,y){moves.push(['move',x,y]);},lineTo(x,y){moves.push(['line',x,y]);},closePath(){moves.push('close');}};
  traceWaterPath(ctx,mud,{local:true});assert.equal(moves[0],'begin');assert.equal(moves.length,50);
  assert.deepEqual(moves[1],['move',g.outer[0].x,g.outer[0].y]);
  assert.deepEqual(moves[48],['line',g.outer[47].x,g.outer[47].y]);assert.equal(moves.at(-1),'close');
  assert.equal(getWaterContours(mud,{local:true}).outer,g.outer,'stable repeated queries reuse the cached contour');
}
assert(!containsWater(shapes[2],base.x+base.rx*.8,base.y),'the kidney bay is real dry ground, not a painted oval');
assert(containsWater(shapes[0],base.x+base.rx*.8,base.y),'the rounded pool actually differs from the kidney outline');
const island={...base,shape:'branching',island:true},hole=getWaterContours(island,{local:true}).holes[0];
assert(signedArea(hole)<0,'dry islands wind opposite the water, so ordinary fill and clip preserve them');
const islandCenter={x:base.x-base.rx*.12,y:base.y+base.ry*.015};
assert(!containsWater(island,islandCenter.x,islandCenter.y));assert.equal(waterDepth(island,islandCenter.x,islandCenter.y),0);
assert(!waterIntersectsCircle(island,islandCenter.x,islandCenter.y,12),'small actors fit on the dry island');
assert(waterIntersectsCircle(island,islandCenter.x,islandCenter.y,55),'a large building may not overlap the surrounding water');
const turned={...island,angle:.28},turn=point=>({x:base.x+(point.x-base.x)*Math.cos(.28)-(point.y-base.y)*Math.sin(.28),y:base.y+(point.x-base.x)*Math.sin(.28)+(point.y-base.y)*Math.cos(.28)});
for(const point of [{x:base.x+170,y:base.y+12},islandCenter,{x:base.x+250,y:base.y}]){
  const q=turn(point);assert.equal(containsWater(turned,q.x,q.y),containsWater(island,point.x,point.y));
  assert(Math.abs(waterDepth(turned,q.x,q.y)-waterDepth(island,point.x,point.y))<1e-10);
}

const wet=world();wet.environment.muds=[island];const p=wet.player;
p.x=islandCenter.x;p.y=islandCenter.y-groundOffset(p,true);
assert.equal(wet.environment.movementMultiplier(p),1);assert.equal(wet.environment.getImmersion(p),null);
p.x=base.x+90;p.y=base.y-groundOffset(p,true);
assert.equal(wet.environment.movementMultiplier(p),.74);assert(wet.environment.getImmersion(p)?.sink>0);
const bat={x:p.x,y:base.y-20,r:11,type:'bat'};assert.equal(wet.environment.movementMultiplier(bat),1);assert.equal(wet.environment.getImmersion(bat),null);
const calls=[],fake=new Proxy({globalAlpha:1},{get:(target,key)=>key in target?target[key]:(...args)=>calls.push([key,...args]),set:(target,key,value)=>(target[key]=value,true)});
new ImmersionArt().drawSurface(fake,wet.environment.getImmersion(p),{time:0});
assert.equal(calls.filter(c=>c[0]==='closePath').length,2,'actor ripples clip to both the outer shore and the dry island');

const seeded=world();seeded.region={id:'marsh'};const env=seeded.environment=new Environment(seeded,{generation:false});
const accepted=[],counts=new Map(),families=new Set();
const random=Math.random;Math.random=()=>{throw new Error('water geometry must not consume combat randomness');};
try{
  for(let x=-15;x<=15;x++)for(let y=-15;y<=15;y++){
    const mud=env._mudAt(x,y);if(!mud)continue;accepted.push(mud);counts.set(mud.scale,(counts.get(mud.scale)||0)+1);families.add(mud.shape);
    assert(!waterIntersectsCircle(mud,0,0,ENVIRONMENT_BALANCE.safeRadius),'all generated water leaves the initial sanctuary dry');
    assert.deepEqual(env._mudAt(x,y),mud,'generation is stable independent of loaded neighbours');
  }
}finally{Math.random=random;}
assert.deepEqual([...counts.keys()].sort((a,b)=>a-b),WATER_SIZES);assert.equal(families.size,WATER_SHAPES.length);
assert(accepted.some(m=>m.island),'large marshes include genuine dry islands');
const overlap=(a,b)=>a.maxX>b.minX&&a.minX<b.maxX&&a.maxY>b.minY&&a.minY<b.maxY;
for(let i=0;i<accepted.length;i++)for(let j=i+1;j<accepted.length;j++)assert(!overlap(waterBounds(accepted[i],39.9),waterBounds(accepted[j],39.9)),'neighbouring water leaves broad dry paths');
assert(env._waterCandidates.size<=192,'exploring a large world retains only a bounded candidate cache');

const large=accepted.find(m=>m.scale===3.6&&!m.island),origin={x:large.x,y:large.y};
const coords=large.id.match(/mud:(-?\d+),(-?\d+)/);
seeded.adventure={props:[{x:large.x,y:large.y,r:18}],treasure:null};
assert.equal(env._mudAt(+coords[1],+coords[2]),null,'an existing objective keeps its dry footprint');
seeded.adventure.props=[];assert.deepEqual(env._mudAt(+coords[1],+coords[2]),large,'suppression never moves a fixed water identity');
seeded.settlements.sites=[{x:origin.x,y:origin.y,width:54,depth:28}];assert(!env._mudObjectiveClear(large));seeded.settlements.sites=[];
seeded.regions.portals=[{x:origin.x,y:origin.y-115}];assert(!env._mudObjectiveClear(large),'a portal also reserves its guardian footing');seeded.regions.portals=[];

// A shoreline crossing the view remains loaded even when its center is far
// offscreen; filling the cache with closer centers must not evict that shore.
seeded.viewWidth=390;seeded.viewHeight=750;seeded.player.x=large.x+large.rx+180;seeded.player.y=large.y;
env.muds=[large];env._refreshWater(false,env._foot());assert(env.muds.includes(large));
for(let i=0;i<45;i++){
  seeded.player.x=origin.x+i*140;seeded.player.y=origin.y+(i%3)*30;env._refreshWater(false,env._foot());
  assert(env.muds.length<=ENVIRONMENT_BALANCE.maxMuds);
}
seeded.player.x=origin.x;seeded.player.y=origin.y;env._refreshWater(true,env._foot());
assert(env.muds.some(m=>m.id===large.id&&m.shape===large.shape&&m.rx===large.rx),'returning reconstructs the same large water');
// A desktop walk must preload every approaching visible shoreline without
// dropping the fixed active budget, including enlarged waters at the edges.
const streaming=world();streaming.region={id:'marsh'};streaming.viewWidth=1920;streaming.viewHeight=1080;
const flowing=streaming.environment=new Environment(streaming,{generation:false});flowing._refresh(true);
for(let step=0;step<120;step++){
  streaming.player.x=step*90;streaming.player.y=Math.sin(step*.06)*700;flowing._refresh(false);
  const v={minX:streaming.player.x-960,maxX:streaming.player.x+960,minY:streaming.player.y-540,maxY:streaming.player.y+540};
  for(let x=Math.floor((v.minX-330)/520);x<=Math.floor((v.maxX+330)/520);x++)for(let y=Math.floor((v.minY-330)/520);y<=Math.floor((v.maxY+330)/520);y++){
    const mud=flowing._mudAt(x,y);if(mud&&overlap(waterBounds(mud,35),v))assert(flowing.muds.some(m=>m.id===mud.id),'all approaching visible shores were prefetched');
  }
  assert(flowing.muds.length<=ENVIRONMENT_BALANCE.maxMuds);
}
console.log(`Water diversity: ${accepted.length} stable marsh patches, all 5 shapes/sizes, exact shared shoreline/dry islands, flying immunity, dry objectives/routes, and full-footprint bounded streaming passed.`);
