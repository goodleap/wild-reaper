import assert from 'node:assert/strict';
import { WaterArt } from './dist/water-art.js';
import { getWaterContours, traceWaterPath, containsWater } from './dist/water-geometry.js';

function recordingContext(){
  const calls=[],stack=[],ctx={globalAlpha:.7};
  for(const name of ['beginPath','moveTo','lineTo','closePath','fill','stroke','ellipse','fillRect','translate','rotate','quadraticCurveTo','drawImage','setTransform','clip'])ctx[name]=(...args)=>calls.push([name,...args]);
  ctx.save=()=>stack.push(ctx.globalAlpha);ctx.restore=()=>{ctx.globalAlpha=stack.pop();};
  ctx.createLinearGradient=(...args)=>{calls.push(['createLinearGradient',...args]);return{addColorStop(){}};};
  return {ctx,calls,stack};
}
function artwork(){const canvases=[],art=new WaterArt(()=>{const {ctx,calls,stack}=recordingContext();const canvas={width:0,height:0,calls,stack,getContext:()=>ctx};canvases.push(canvas);return canvas;});return{art,canvases};}
const {art,canvases}=artwork(),mud={x:15,y:50,rx:102,ry:60,shape:'kidney',angle:.21,island:true,seed:.47};
function draw(patch=mud,options={}){const {ctx,calls,stack}=recordingContext();assert(art.draw(ctx,patch,{pixelRatio:2,time:3,...options}));assert.equal(ctx.globalAlpha,.7);assert.equal(stack.length,0);return calls;}
const first=draw(),builds=art.cacheStats.builds;
assert(first.some(x=>x[0]==='translate'&&x[1]===mud.x&&x[2]===mud.y),'water remains anchored in the world');
for(let i=0;i<20;i++)assert.deepEqual(draw(),first,'paused water uses identical images, shore geometry and ripple phase');
assert.equal(art.cacheStats.builds,builds,'paused frames do not rebuild cached surfaces');
assert.notDeepEqual(draw(mud,{time:10}),first,'simulation time only animates a few water ripples');
assert.equal(art.cacheStats.builds,builds,'animation never rebuilds shore textures');
assert.deepEqual(draw(mud,{reduced:true,time:10}),draw(mud,{reduced:true,time:200}),'reduced-motion water is visually stationary');
assert.equal(draw(mud,{dense:true}).filter(x=>x[0]==='ellipse').length,1,'dense scenes draw one tiny ripple per pool');
assert.equal(first.filter(x=>x[0]==='ellipse').length,3,'normal scenes never draw unbounded ripples for a large pool');

// The dynamic clip is the exact shared contour, including the dry hole. It
// does not add a second artist-only ellipse or smooth away the bank geometry.
const shape={...mud,x:0,y:0},expected=recordingContext();traceWaterPath(expected.ctx,shape,{local:true});
const clipIndex=first.findIndex(x=>x[0]==='clip');
assert.deepEqual(first.slice(clipIndex-expected.calls.length,clipIndex),expected.calls);
assert.equal(expected.calls.filter(x=>x[0]==='closePath').length,2,'the inner island is part of the clipped water path');
for(const ripple of art._shape(mud).ripples)assert(containsWater(shape,ripple.x,ripple.y),'ripple centers are on actual water, never a dry island');
const bounds=getWaterContours(shape,{local:true});assert(bounds.holes.length===1);
for(const canvas of canvases){assert.equal(canvas.stack.length,0);assert(canvas.width<=392&&canvas.height<=392,'even a huge pool never allocates an oversized texture');}

// Exact identical shapes at different world positions reuse the same bitmap
// and do not generate a new texture as the camera follows the player.
draw({...mud,x:1700,y:-900});assert.equal(art.cacheStats.builds,builds);
const culled=draw(mud,{viewBounds:{minX:900,minY:900,maxX:1100,maxY:1100}});assert.equal(culled.length,0);assert.equal(art.cacheStats.builds,builds);
const viewportCase=artwork(),large={x:0,y:0,rx:340,ry:200,shape:'branching',angle:.32,island:true,seed:.62};
viewportCase.art.draw(recordingContext().ctx,large,{pixelRatio:2,viewBounds:{minX:-25,minY:-25,maxX:25,maxY:25}});
assert(viewportCase.art.cacheStats.builds<=4,'only visible large-water chunks are constructed');
assert(viewportCase.canvases.every(c=>c.width<=196&&c.height<=196),'large pools use ground-resolution tiles to bound memory');

// Actual worst-case request: a larger-than-generated wetland and two medium
// pools must all fit together, avoiding repeated frame-time cache thrashing.
const stress=artwork(),scene=[large,{...mud,rx:136,ry:80,seed:.21},{...mud,rx:144,ry:84,shape:'bays',seed:.79}];
const random=Math.random;Math.random=()=>{throw new Error('art must never consume gameplay randomness');};
try{
  for(const m of scene)stress.art.draw(recordingContext().ctx,m,{pixelRatio:2,reduced:true});
  const warmed=stress.art.cacheStats.builds;
  for(let frame=0;frame<100;frame++)for(const m of scene)stress.art.draw(recordingContext().ctx,m,{pixelRatio:2,time:frame*.1});
  assert.equal(stress.art.cacheStats.builds,warmed,'large plus two medium pools reuse all warm tiles on every frame');
  assert(stress.art.cacheStats.bytes<5_500_000,'common large-water view leaves cache headroom for more scenery');
  for(let i=0;i<25;i++)stress.art.draw(recordingContext().ctx,{...large,seed:i*.031,angle:i*.03},{pixelRatio:2});
  assert(stress.art.cacheStats.bytes<=stress.art.cacheStats.limitBytes,'exploration evicts old shore images instead of growing memory');
}finally{Math.random=random;}
const invalid=recordingContext();assert.equal(art.draw(invalid.ctx,{...mud,rx:NaN}),false);assert.equal(invalid.calls.length,0);
console.log('Water art: exact shared shore/island clips, world-sized details, viewport chunks, stable paused/reduced animation, no large-pool cache thrash and bounded 8 MB LRU passed.');
