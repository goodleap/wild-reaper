import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment, ENVIRONMENT_BALANCE, WATER_SIZES, waterObstacleFootprint } from './dist/environment.js';
import { WATER_SHAPES, containsWater, waterDepth, waterBounds, waterIntersectsCircle, waterIntersectsCapsule, getWaterContours, traceWaterPath } from './dist/water-geometry.js';
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

// The long diagonal crosses water between its midpoint and end. Neither an
// endpoint-only nor center-circle obstacle check can detect this regression.
const crossing={x:0,y:0,rx:40,ry:28};
for(const q of [{x:-150,y:-90},{x:-50,y:-10},{x:50,y:70}])assert(!containsWater(crossing,q.x,q.y));
assert(waterIntersectsCapsule(crossing,-150,-90,50,70,3));
assert(waterIntersectsCapsule(crossing,-90,32,90,32,4),'the complete round side touches the shoreline');
assert(!waterIntersectsCapsule(crossing,-90,32.01,90,32.01,4),'a separated capsule does not claim an empty shore');
assert(!waterIntersectsCapsule(island,islandCenter.x-5,islandCenter.y,islandCenter.x+5,islandCenter.y,10),'a complete small capsule fits on a real dry island');
assert(waterIntersectsCapsule(island,islandCenter.x-80,islandCenter.y,islandCenter.x+80,islandCenter.y,4),'extending beyond a dry island reaches water');
const slender=waterObstacleFootprint({type:'tree',x:0,y:0,r:17.76,treeForm:1,scale:1.5});
assert(slender.r>=48.5,'large slender-tree roots are larger than their narrow trunk collision');

// Use actual populated Terrain, not the empty arena used above. Scan multiple
// world seeds in each biome and sample every retained obstacle's body all the
// way along the axis, including radial edges and both round end caps.
let naturalCount=0,largestCount=0,footprintSamples=0;
for(const region of ['forest','marsh','ruins'])for(const seed of [0,1,7]){
  const g={region:{id:region},regionIndex:seed,terrain:new Terrain({region,seed}),player:{x:0,y:0,r:15},viewWidth:1100,viewHeight:650};
  const e=new Environment(g,{generation:false}),seen=[],sizeCounts=new Map();
  for(let x=-10;x<=10;x++)for(let y=-10;y<=10;y++){
    const mud=e._mudAt(x,y);if(!mud)continue;seen.push({x,y,mud:structuredClone(mud)});naturalCount++;sizeCounts.set(mud.scale,(sizeCounts.get(mud.scale)||0)+1);
    if(mud.scale===3.6)largestCount++;
    const b=waterBounds(mud,60);
    for(const o of g.terrain.query(b.minX,b.minY,b.maxX,b.maxY)){
      const f=waterObstacleFootprint(o);
      assert(!waterIntersectsCapsule(mud,f.ax,f.ay,f.bx,f.by,f.r),`full ${o.type} footprint stays dry in ${region}:${seed}:${mud.id}`);
      const length=Math.hypot(f.bx-f.ax,f.by-f.ay),steps=Math.max(1,Math.ceil(length/5));
      for(let step=0;step<=steps;step++){
        const x=f.ax+(f.bx-f.ax)*step/steps,y=f.ay+(f.by-f.ay)*step/steps;
        assert(!containsWater(mud,x,y));
        for(let j=0;j<24;j++){
          const a=j*Math.PI/12;assert(!containsWater(mud,x+Math.cos(a)*(f.r-.01),y+Math.sin(a)*(f.r-.01)),'sampled round sides/end caps never enter the visible water contour');footprintSamples++;
        }
      }
    }
  }
  assert.deepEqual([...sizeCounts.keys()].sort((a,b)=>a-b),WATER_SIZES,`${region}:${seed} retains small through largest natural waters`);
  // A changed visit order and evicted caches must not reroll either placement
  // or its orientation, even when a large pool needed several terrain retries.
  e._waterCandidates.clear();g.terrain._cache.clear();
  for(const entry of seen.reverse())assert.deepEqual(e._mudAt(entry.x,entry.y),entry.mud,'cache eviction/reverse visitation preserves the complete water shape');
  assert(e._waterCandidates.size<=192);assert(g.terrain.cacheSize<=192);
  const sample=seen.find(entry=>entry.mud.scale===3.6),before=e._mudCandidate(sample.x,sample.y);
  g.terrain.setStructures([{type:'rock',x:before.x,y:before.y,r:400,structureId:'qa-new-building'}],'qa-water');
  e._waterCandidates.clear();assert.deepEqual(e._mudCandidate(sample.x,sample.y),before,'dynamic buildings never relocate the underlying seeded water');
  g.settlements={sites:[{x:before.x,y:before.y,width:240,depth:90}]};assert.equal(e._mudAt(sample.x,sample.y),null,'the later building suppresses, rather than relocates, that fixed water candidate');
}
assert(largestCount>=30,'obstacle avoidance preserves a useful frequency of full-size large waters');
console.log(`Water diversity: ${accepted.length} empty-arena patches; ${naturalCount} real-terrain waters including ${largestCount} largest lakes, ${footprintSamples} dry capsule-edge samples, all shapes/sizes, unchanged seeded revisits, dry objectives/routes and bounded shoreline streaming passed.`);
