import assert from 'node:assert/strict';
import { WaterArt } from './dist/water-art.js';
import { getWaterContours, traceWaterPath } from './dist/water-geometry.js';
import { REGIONS } from './dist/world-definitions.js';
import { paintSnowGround, paintSnowSurface, paintSnowIceTexture } from './dist/snow-surface-art.js';

function context(){
  const calls=[],stack=[],state={globalAlpha:.73,lineWidth:4,fillStyle:'#123456',strokeStyle:'#654321',lineJoin:'bevel',lineCap:'square'};
  const c=new Proxy(state,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>{stack.push({...target});calls.push(['save']);};
    if(key==='restore')return()=>{assert(stack.length,'balanced canvas saves');const previous=stack.pop();for(const name of Object.keys(target))delete target[name];Object.assign(target,previous);calls.push(['restore']);};
    if(key==='createLinearGradient')return(...args)=>{calls.push([key,...args]);return{addColorStop:(...stop)=>calls.push(['addColorStop',...stop])};};
    return(...args)=>{for(const n of args)if(typeof n==='number')assert(Number.isFinite(n),`${String(key)} coordinates are finite`);calls.push([key,...args]);};
  },set(target,key,value){target[key]=value;calls.push(['set',key,value]);return true;}});
  return{c,calls,stack,state};
}
function assertState(paint){const target=context(),before={...target.state};paint(target.c);assert.deepEqual(target.state,before,'shared painters restore all incoming canvas state');assert.equal(target.stack.length,0);return target;}
const originalRandom=Math.random;Math.random=()=>{throw new Error('art must never consume simulation randomness');};
try{
  for(let zone=0;zone<3;zone++)for(let variant=0;variant<3;variant++)assertState(c=>paintSnowGround(c,{variant,zone}));
  for(const surface of ['path','ice'])assertState(c=>paintSnowGround(c,{surface,size:192}));
  assert.deepEqual(assertState(c=>paintSnowGround(c,{variant:2,zone:1})).calls,assertState(c=>paintSnowGround(c,{variant:2,zone:1})).calls,'seeded tile revisits are exact');
  assert.notDeepEqual(assertState(c=>paintSnowGround(c,{zone:0})).calls,assertState(c=>paintSnowGround(c,{zone:2})).calls,'forest snow and drifted snow have distinct interior details');
  assertState(c=>paintSnowIceTexture(c,{minX:-240,minY:-180,maxX:270,maxY:300},{seed:.37}));

  const canvases=[],art=new WaterArt(()=>{const target=context(),canvas={width:0,height:0,getContext:()=>target.c,...target};canvases.push(canvas);return canvas;});
  const patch={x:40,y:-70,rx:325,ry:210,shape:'kidney',island:true,seed:.43,angle:.22,kind:'ice'};
  const before=JSON.stringify(patch),contours=structuredClone(getWaterContours(patch));
  for(const kind of ['ice','snow','water'])for(const deep of [false,true]){
    const local={...patch,kind,deep},shape=art._shape(local),tile={minX:-260,minY:-190,maxX:250,maxY:180};
    const expected=context();traceWaterPath(expected.c,shape.local,{local:true});
    const painted=assertState(c=>paintSnowSurface(c,shape,tile)),clip=painted.calls.findIndex(call=>call[0]==='clip');
    const lastBegin=painted.calls.slice(0,clip).findLastIndex(call=>call[0]==='beginPath');
    const path=painted.calls.slice(lastBegin,clip).filter(call=>!['set','fill','save'].includes(call[0]));
    assert.deepEqual(path,expected.calls,'all snowy surfaces clip the same exact contour and dry island');
    assert.equal(path.filter(call=>call[0]==='closePath').length,2);
    assertState(c=>art.draw(c,local,{region:'snow',viewBounds:{minX:-220,minY:-220,maxX:280,maxY:220}}));
    const warm=art.cacheStats.builds;
    for(let frame=0;frame<20;frame++)assertState(c=>art.draw(c,local,{region:'snow',time:frame*.1,viewBounds:{minX:-220,minY:-220,maxX:280,maxY:220}}));
    assert.equal(art.cacheStats.builds,warm,'snow artwork and water animation reuse warm tiles');
  }
  const explicit=new WaterArt(()=>({width:0,height:0,getContext:()=>context().c}));
  explicit.draw(context().c,patch,{region:'snow',reduced:true});const warm=explicit.cacheStats.builds;
  explicit.draw(context().c,patch,{region:'another-snow-world',theme:'snow',reduced:true});assert.equal(explicit.cacheStats.builds,warm,'explicit shared theme aliases reuse snow cache entries');
  for(const world of REGIONS.filter(world=>world.authored?.artTheme==='snow')){
    explicit.draw(context().c,patch,{region:world.id,reduced:true});assert.equal(explicit.cacheStats.builds,warm,'registered authored snow worlds automatically reuse the shared theme');
  }
  assert.equal(JSON.stringify(patch),before,'art leaves gameplay surface parameters unchanged');assert.deepEqual(getWaterContours(patch),contours);
  assert(canvases.every(canvas=>canvas.width<=196&&canvas.height<=196),'large lakes retain bounded ground-resolution cache tiles');
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'new surfaces share the existing bounded 8 MB LRU');
}finally{Math.random=originalRandom;}
console.log('Snow surfaces: reusable seeded variants, exact shoreline/island clips, full canvas-state restoration, shared theme cache reuse, bounded warm tiles and unchanged gameplay geometry passed.');
