import assert from 'node:assert/strict';
import { ShadowTileCache } from './dist/shadow-tile-cache.js';

class RecordingContext {
  constructor(){this.globalAlpha=1;this.globalCompositeOperation='source-over';this.imageSmoothingEnabled=true;this.fillStyle='';this.stack=[];this.paths=[];this.images=[];this.fills=[];this.transform=[];}
  save(){this.stack.push({globalAlpha:this.globalAlpha,globalCompositeOperation:this.globalCompositeOperation,imageSmoothingEnabled:this.imageSmoothingEnabled,fillStyle:this.fillStyle,transform:this.transform});}
  restore(){assert(this.stack.length,'context restore is balanced');Object.assign(this,this.stack.pop());}
  setTransform(...args){this.transform=args;}
  clearRect(){this.fills=[];}
  beginPath(){this.paths=[];}
  rect(...args){this.paths.push(args);}
  clip(){}
  fill(){this.fills.push({paths:this.paths.map(p=>[...p]),color:this.fillStyle,alpha:this.globalAlpha,mode:this.globalCompositeOperation});}
  drawImage(canvas,...args){this.images.push({args,width:canvas.width,height:canvas.height,alpha:this.globalAlpha,mode:this.globalCompositeOperation,smoothing:this.imageSmoothingEnabled,source:canvas.getContext('2d').fills.map(fill=>({...fill}))});}
}
function factory(){
  const canvases=[];let peak=0;
  const make=()=>{let w=0,h=0;const c=new RecordingContext();const canvas={get width(){return w;},set width(v){w=v;record();},get height(){return h;},set height(v){h=v;record();},getContext(){return c;}};canvases.push(canvas);return canvas;};
  function record(){peak=Math.max(peak,canvases.reduce((n,c)=>n+c.width*c.height,0));}
  return{make,canvases,get peak(){return peak;},get pixels(){return canvases.reduce((n,c)=>n+c.width*c.height,0);}};
}
const bounds=(minX,minY,maxX,maxY)=>({minX,minY,maxX,maxY});
const rectangle=(key,x,y,w,h,signature='intact')=>({key,signature,bounds:bounds(x,y,x+w,y+h),drawPath(c){c.rect(x,y,w,h);}});
const allocation=factory(),cache=new ShadowTileCache(allocation.make,{tileSize:64,resolution:.5,pixelBudget:16*1024}),target=new RecordingContext();
target.globalAlpha=.37;target.globalCompositeOperation='destination-out';
const view=bounds(-64,-64,64,64),a=rectangle('rock',-8,-8,16,16),b=rectangle('tree',10,10,10,10);
cache.draw(target,view,[a,b],'forest');
assert.equal(cache.cacheStats.builds,4,'a caster straddling both axes populates all four neighboring tiles');
assert.equal(cache.cacheStats.pixels,4*32*32);
assert.deepEqual(target.images.map(image=>image.args),[[-64,-64,64,64],[0,-64,64,64],[-64,0,64,64],[0,0,64,64]],'negative world coordinates use floor-based tile positions');
assert(target.images.every(image=>image.width===32&&image.height===32&&!image.smoothing&&image.alpha===1&&image.mode==='source-over'),'cached cores are copied as opaque masks without a second tile filter');
assert.equal(target.globalAlpha,.37);assert.equal(target.globalCompositeOperation,'destination-out');assert.equal(target.imageSmoothingEnabled,true);assert.equal(target.stack.length,0);
const warm=cache.cacheStats.builds;
for(let i=0;i<30;i++)cache.draw(target,bounds(-61+i*.05,-61,61,61),i%2?[a,b]:[b,a],'forest');
assert.equal(cache.cacheStats.builds,warm,'fractional camera movement and query ordering do not rebuild warm tiles');

// A state transition changes only the caster's affected tiles. Removal clears
// stale pixels, including the old footprint of an object moved across tiles.
const changed={...b,signature:'rubble',drawPath(c){c.rect(11,12,4,3);}};
cache.draw(target,view,[a,changed],'forest');
assert.equal(cache.cacheStats.builds,warm+1,'geometry changes inside the same bounds rebuild exactly one tile');
cache.draw(target,view,[changed],'forest');
assert.equal(cache.cacheStats.pixels,32*32,'removing a cross-boundary caster releases all now-empty tiles');
assert.equal(cache.cacheStats.builds,warm+2,'the shared occupied tile is repainted without the removed caster');
const moved=rectangle('tree',-24,-24,10,10,'rubble');
cache.draw(target,view,[moved],'forest');
assert.equal(cache.cacheStats.pixels,32*32);
assert.equal(cache.cacheStats.builds,warm+3,'bounds changes invalidate both old and new tile membership');
assert.equal(cache.cache.get('0,0').canvas,null,'the original tile retains no stale shadow bitmap');
assert.deepEqual(cache.cache.get('-1,-1').canvas.getContext('2d').fills[0].paths,[[-24,-24,10,10]]);
cache.draw(target,view,[],'forest');assert.equal(cache.cacheStats.pixels,0);assert.equal(allocation.pixels,0);

cache.draw(target,view,[a],'forest');const beforeScene=cache.cacheStats.builds;
cache.draw(target,view,[a],'marsh');assert.equal(cache.cacheStats.builds,beforeScene+4,'scene identity prevents reuse of another map');
const beforeClear=cache.cacheStats.builds;cache.clear();assert.equal(cache.cacheStats.entries,0);assert.equal(cache.cacheStats.pixels,0);assert.equal(allocation.pixels,0);
cache.draw(target,view,[a],'marsh');assert.equal(cache.cacheStats.builds,beforeClear+4,'explicit invalidation rebuilds next use');
assert(allocation.peak<=cache.pixelBudget);

// A deliberately tiny budget exercises eviction and an oversized viewport.
// Visible retained tiles stay warm; remaining tiles paint directly into the
// mask, which prevents both allocation spikes and repeated LRU churn.
const smallAllocation=factory(),small=new ShadowTileCache(smallAllocation.make,{tileSize:64,resolution:.5,pixelBudget:2*32*32});
const huge=rectangle('large-shadow',-128,-128,256,256),largeView=bounds(-128,-128,128,128),sink=new RecordingContext();
small.draw(sink,largeView,[huge],'forest');
assert.equal(small.cacheStats.entries,2);assert.equal(small.cacheStats.builds,2);assert.equal(small.cacheStats.directPasses,14);assert.equal(small.cacheStats.evictions,0);
small.draw(sink,largeView,[huge],'forest');
assert.equal(small.cacheStats.builds,2,'oversized warm views do not churn resident bitmaps');assert.equal(small.cacheStats.directPasses,28);
assert(sink.fills.every(fill=>fill.color==='#10271d'&&fill.alpha===1&&fill.mode==='source-over'));assert.equal(sink.stack.length,0);
for(let i=0;i<25;i++){
  const x=i*128;small.draw(sink,bounds(x,0,x+64,64),[rectangle(`rock-${i}`,x+2,2,20,20)],'forest');
  assert(small.cacheStats.entries<=2);assert(small.cacheStats.pixels<=small.pixelBudget);assert.equal(smallAllocation.pixels,small.cacheStats.pixels);
}
assert(small.cacheStats.evictions>0,'exploration actually evicts old regions');assert(smallAllocation.peak<=small.pixelBudget,'live bitmap allocation never exceeds the budget');
small.clear();assert.equal(smallAllocation.pixels,0);
assert.throws(()=>new ShadowTileCache(allocation.make,{tileSize:32,resolution:.3}),RangeError);
assert.throws(()=>new ShadowTileCache(allocation.make,{tileSize:64,pixelBudget:100}),RangeError);
console.log('Shadow tile cache: warm reuse, state/removal/movement invalidation, scenes, negative tiles, state restoration, and strict budget passed.');
