import assert from 'node:assert/strict';
import { MapLightCache, mapLightPatch, MAP_SUN_ANGLE, MAP_SUN_DIRECTION } from './dist/map-light-cache.js';

function context(){
  const calls=[],stack=[],ctx={imageSmoothingEnabled:false,imageSmoothingQuality:'high',globalAlpha:.7};
  for(const name of ['setTransform','fillRect','beginPath','moveTo','lineTo','closePath','fill','drawImage'])ctx[name]=(...args)=>calls.push([name,...args]);
  for(const name of ['createLinearGradient','createRadialGradient'])ctx[name]=(...args)=>{
    const stops=[];calls.push([name,...args,stops]);return{addColorStop:(...stop)=>stops.push(stop)};
  };
  ctx.save=()=>stack.push([ctx.imageSmoothingEnabled,ctx.imageSmoothingQuality,ctx.globalAlpha]);
  ctx.restore=()=>[ctx.imageSmoothingEnabled,ctx.imageSmoothingQuality,ctx.globalAlpha]=stack.pop();
  return {ctx,calls,stack};
}
function fixture(){
  const canvases=[],cache=new MapLightCache(()=>{const c=context(),canvas={width:0,height:0,...c,getContext:()=>c.ctx};canvases.push(canvas);return canvas;});
  const render=view=>{const c=context();cache.draw(c.ctx,view);assert.equal(c.stack.length,0);assert.equal(c.ctx.imageSmoothingEnabled,false);assert.equal(c.ctx.imageSmoothingQuality,'high');assert.equal(c.ctx.globalAlpha,.7);return c.calls;};
  return {cache,canvases,render};
}
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
assert.equal(MAP_SUN_ANGLE,Math.atan2(325,840));
for(let gx=-5;gx<=5;gx++)for(let gy=-5;gy<=5;gy++){
  const p=mapLightPatch(gx,gy),seed=hash(gx+51,gy+93),spread=80+seed*65;
  assert.equal(p.x,gx*1080+160+hash(gx+7,gy+16)*460+165+spread*.24);
  assert.equal(p.y,gy*1080+100+hash(gx+34,gy+2)*400-520);
  assert.equal(p.endX,p.x+MAP_SUN_DIRECTION.x/MAP_SUN_DIRECTION.y*840);
  assert.equal(p.endY,p.y+840);assert.equal(p.alpha,.04+seed*.025);
  for(const [x,y] of p.points){assert(x>=p.minX&&x<=p.maxX);assert(y>=p.minY&&y<=p.maxY);}
  assert(p.minX<=p.glowX-330&&p.maxX>=p.glowX+330);
  assert(p.minY<=p.glowY-330&&p.maxY>=p.glowY+330);
}

const light=fixture(),view={camX:-1548,camY:-22,width:1728,height:958};
const first=light.render(view),builds=light.cache.cacheStats.builds;
assert(builds>0&&builds<12);
assert(first.every(call=>call[0]==='drawImage'),'steady rendering only composites cached images');
assert(light.canvases.every(c=>c.calls.filter(call=>call[0].startsWith('create')).length===2),'one radial and one linear gradient per cold beam');
for(let frame=0;frame<120;frame++)light.render({...view,camX:view.camX+Math.sin(frame)*2,camY:view.camY+Math.cos(frame)*2});
assert.equal(light.cache.cacheStats.builds,builds,'small camera movements do not regenerate fixed sunlight');
for(const draw of first){
  const [,canvas,sx,sy,sw,sh,dx,dy,dw,dh]=draw;
  assert(sx>=0&&sy>=0&&sw>0&&sh>0);
  assert(sx+sw<=canvas.width+1e-8&&sy+sh<=canvas.height+1e-8);
  assert(dx>=0&&dy>=0&&dx+dw<=view.width+1e-8&&dy+dh<=view.height+1e-8,'only the visible sprite subsection is submitted');
}

// A light's origin can be far outside the screen while its glow reaches in.
const p=mapLightPatch(-2,-3),edgeView={camX:p.glowX,camY:p.glowY+320,width:12,height:12};
const edge=fixture();edge.render(edgeView);
assert(edge.cache.cache.has(`0.5:${p.id}`),'offscreen beam origins must not cull an overlapping ground glow');

// Compare the indexed cull to a larger brute-force neighborhood, including
// negative cell coordinates and narrow views near beam/glow boundaries.
for(const v of [view,edgeView,{camX:0,camY:0,width:393,height:852},{camX:-4300,camY:3900,width:3840,height:2160}]){
  const f=fixture();f.render(v);const expected=[];
  const left=v.camX-v.width/2,right=v.camX+v.width/2,top=v.camY-v.height/2,bottom=v.camY+v.height/2;
  for(let gx=Math.floor(left/1080)-3;gx<=Math.ceil(right/1080)+3;gx++)for(let gy=Math.floor(top/1080)-3;gy<=Math.ceil(bottom/1080)+3;gy++){
    const p=mapLightPatch(gx,gy);
    if(p.maxX<left||p.minX>right||p.maxY<top||p.minY>bottom)continue;
    expected.push(`0.5:${p.id}`);
  }
  assert.deepEqual([...f.cache.cache.keys()],expected,'visible lights retain original x-then-y world order');
}

for(const [width,height] of [[393,852],[3840,2160],[7680,4320]]){
  const f=fixture(),v={camX:415.25,camY:-320.75,width,height};f.render(v);
  const count=f.cache.cacheStats.builds;
  for(let i=0;i<10;i++)f.render(v);
  assert.equal(f.cache.cacheStats.builds,count,'a large viewport never evicts its own visible lights');
  assert(f.cache.cacheStats.bytes<=f.cache.cacheStats.limitBytes);
  if(width===7680)assert(f.cache.cacheStats.scale<.5,'extreme view sizes reduce cached resolution instead of thrashing');
}
for(let i=0;i<70;i++)light.render({...view,camX:i*1900-60000,camY:i*511-20000});
assert(light.cache.cacheStats.bytes<=light.cache.cacheStats.limitBytes,'exploration cannot grow bitmap memory without bound');
assert(light.cache.geometry.size<=256,'world-coordinate metadata is also bounded');
assert(light.canvases.some(c=>c.width===0&&c.height===0),'evicted canvases release their backing stores');
const resident=[...light.cache.cache.values()];light.cache.clear();
assert.equal(light.cache.cacheStats.entries,0);assert.equal(light.cache.cacheStats.bytes,0);assert.equal(light.cache.geometry.size,0);
assert(resident.every(entry=>entry.canvas.width===0&&entry.canvas.height===0));
const invalid=fixture();invalid.render({...view,width:NaN});assert.equal(invalid.cache.cacheStats.builds,0);
console.log('Map light cache: original geometry/order, full glow culling, cropped draws, warm reuse, 4K/8K stability and bounded bitmap/metadata eviction passed.');
