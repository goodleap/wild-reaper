import assert from 'node:assert/strict';
import { WorldLayoutArt, drawWorldLayoutMap } from './dist/worlds/world-layout-art.js';
import { WorldMap } from './dist/world-map.js';
import { getWaterContours } from './dist/water-geometry.js';

function context(){
  const state={globalAlpha:.73},stack=[],calls=[];
  const c=new Proxy(state,{get(target,key){if(key in target)return target[key];if(key==='save')return()=>stack.push({...target});if(key==='restore')return()=>{assert(stack.length,'balanced context');const previous=stack.pop();for(const name of Object.keys(target))delete target[name];Object.assign(target,previous);};return(...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${String(key)} receives finite coordinates`);calls.push([key,...args]);};}});
  return {c,calls,stack};
}
const makeCanvas=()=>({width:0,height:0,getContext:()=>context().c}),art=new WorldLayoutArt(makeCanvas),target=context();
const lake={id:'lake',type:'mud',kind:'water',x:440,y:170,rx:210,ry:130,angle:.2,shape:'bays',seed:.2,deep:true};
const layout={
  patches:['forest','brush','ridge','ruins','city','ice','ash'].map((kind,i)=>({id:kind,kind,x:(i-3)*210,y:i%2?130:-80,rx:180,ry:170,angle:.2,seed:i*.1,density:.8})),
  routes:[{id:'main',kind:'main',ax:-1100,ay:0,bx:1100,by:0,r:80},{id:'trail',kind:'trail',ax:0,ay:0,bx:900,by:800,r:65}],lakes:[lake],
  obstacles:[{id:'ridge',type:'log',variant:'world-ridge',x:-450,y:350,halfLength:120,r:30,angle:.4}]
};
for(const region of ['forest','marsh','ruins','beach','city','mountain','snow','volcano']){
  const island={region,layout:structuredClone(layout)},before=JSON.stringify(island);
  art.drawGround(target.c,island,{width:1920,height:1080,camX:64,camY:32});const warmed=art.cacheStats.builds;
  for(let i=0;i<8;i++)art.drawGround(target.c,island,{width:1920,height:1080,camX:64,camY:32});
  assert.equal(art.cacheStats.builds,warmed,`${region} warm desktop frame reuses ground tiles`);
  drawWorldLayoutMap(target.c,island,{scale:.04,viewBounds:{minX:-1400,minY:-900,maxX:1400,maxY:900}});
  assert.equal(JSON.stringify(island),before,'drawing cannot mutate the stable geometry');assert.equal(target.c.globalAlpha,.73);
  assert.equal(target.stack.length,0);assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);
}
const mapContext=context(),island={region:'forest',layout:{patches:[],routes:[],lakes:[lake]}};
drawWorldLayoutMap(mapContext.c,island,{scale:.04});
const contour=getWaterContours(lake).outer;
assert.deepEqual(mapContext.calls.filter(call=>call[0]==='moveTo')[0].slice(1),[contour[0].x,contour[0].y],'map starts on the exact gameplay shoreline');
assert.deepEqual(mapContext.calls.filter(call=>call[0]==='lineTo').slice(0,contour.length-1).map(call=>call.slice(1)),contour.slice(1).map(point=>[point.x,point.y]),'every visible shoreline edge follows shared water geometry');
mapContext.calls.length=0;drawWorldLayoutMap(mapContext.c,island,{scale:.04,viewBounds:{minX:-1000,minY:-1000,maxX:-800,maxY:-800}});assert.equal(mapContext.calls.length,0,'distant geometry is culled');
for(let i=0;i<100;i++)art.drawGround(target.c,island,{camX:i*317,camY:i*211,width:540,height:985});
assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'exploration retains a bounded cache');
assert.equal(art.drawGround(target.c,{region:'forest'}),false,'legacy and indoor terrain need no layout');
for(const region of ['forest','marsh','beach','snow']){
  const prop={type:'tree',region,layoutPatch:'dense',r:28.5,x:40,y:80,treeForm:2};
  assert(art.drawTreeFooting(target.c,prop));const warmed=art.cacheStats.builds;art.drawTreeFooting(target.c,{...prop,x:140});assert.equal(art.cacheStats.builds,warmed,'dense root detail reuses a shared themed sprite');
  assert.equal(art.drawTreeFooting(target.c,{...prop,r:20}),false,'sparse trees keep their existing footing');
  assert.equal(art.drawTreeFooting(target.c,{...prop,layoutPatch:undefined}),false,'legacy trees keep their existing footing');
}
assert.equal(target.c.globalAlpha,.73);assert.equal(target.stack.length,0);

const group={id:'boss-domain',kind:'boss',name:'荒野首领',x:0,y:0,discovered:true,cleared:false};
const game={player:{x:0,y:-19.8},territories:{groups:[group]},dungeon:{active:null}};
const map=new WorldMap();assert.deepEqual(map.getMarkers(game).map(marker=>[marker.type,marker.name,marker.completed]),[['boss','荒野首领',false]]);
group.cleared=true;assert.equal(map.getMarkers(game)[0].completed,true,'a defeated world Boss keeps its cleared map record');
console.log('Macro layout art: all eight palettes, exact mapped water contours, bounded warm caches, read-only drawing and persistent Boss markers passed.');
