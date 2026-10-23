import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RiftArt, drawRiftOverview, drawRiftLandmark } from './dist/worlds/rift-art.js';
import { SnowPropArt, snowVisual } from './dist/snow-art.js';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';

function context(record=false){
  const values={globalAlpha:.8},stack=[],calls=[];
  const c=new Proxy(values,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>stack.push({...target});
    if(key==='restore')return()=>{assert(stack.length,'drawing context is balanced');const before=stack.pop();for(const k of Object.keys(target))delete target[k];Object.assign(target,before);};
    if(key==='createRadialGradient'||key==='createLinearGradient')return(...args)=>{assert(args.every(Number.isFinite));return{addColorStop(offset){assert(Number.isFinite(offset));}};};
    return(...args)=>{for(const n of args)if(typeof n==='number')assert(Number.isFinite(n),`${String(key)} uses finite coordinates`);if(record)calls.push({key,args,alpha:target.globalAlpha});};
  }});return {c,stack,calls};
}
const layout=JSON.parse(readFileSync(new URL('./dist/config/worlds.json',import.meta.url))).definitions.find(w=>w.id==='snow').authored;
assert.equal(layout.artTheme,'snow');
const before=JSON.stringify(layout),canvases=[],contexts=[],makeCanvas=()=>{const ctx=context(),canvas={width:0,height:0,getContext:()=>ctx.c};canvases.push(canvas);contexts.push(ctx);return canvas;};
const art=new RiftArt(makeCanvas),screen=context(),propArt=new SnowPropArt(makeCanvas);let warmFrames=0,peak=0;
const island=new Island({region:'snow',seed:1}),terrain=new Terrain({region:'snow',seed:1,island});let visiblePropPeak=0;assert.equal(island.layout.artTheme,'snow');assert.deepEqual(island.layout.boundaries,layout.boundaries,'runtime uses the built snow layout');
for(const area of layout.areas){
  const view={camX:area.center.x,camY:area.center.y,width:1728,height:874};assert(art.drawGround(screen.c,{layout},view));
  const builds=art.cacheStats.builds;for(let n=0;n<4;n++){art.drawGround(screen.c,{layout},view);warmFrames++;}
  assert.equal(art.cacheStats.builds,builds,'stationary desktop frames never rebuild terrain');
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'terrain and source sprites remain bounded');peak=Math.max(peak,art.cacheStats.bytes);
  const props=terrain.query(area.center.x-980,area.center.y-600,area.center.x+980,area.center.y+650).filter(p=>p.variant==='snow-native');
  for(const p of props)propArt.drawProp(screen.c,p);const propBuilds=propArt.cacheStats.builds;
  for(let n=0;n<3;n++)for(const p of props)propArt.drawProp(screen.c,p);
  assert.equal(propArt.cacheStats.builds,propBuilds,'visible depth sprites remain warm without cache churn');assert(propArt.cacheStats.bytes<=propArt.cacheStats.limitBytes);visiblePropPeak=Math.max(visiblePropPeak,props.length);
}
const map=context(true);assert(drawRiftOverview(map.c,layout,{scale:.06,labels:true,landmarks:true}));
const vertices=new Set(map.calls.filter(c=>c.key==='moveTo'||c.key==='lineTo').map(c=>c.args.join(',')));
for(const ring of layout.boundaries)for(const p of ring.points)assert(vertices.has(`${p.x},${p.y}`),'map uses actual walkable boundary');
for(const ring of layout.lakes)for(const p of ring.points)assert(vertices.has(`${p.x},${p.y}`),'water mask and island holes remain in the overview');
for(const kind of ['rock','ledge','drift','waymark'])for(const angle of[0,Math.PI/2,Math.PI/4]){
  const p={variant:'snow-native',snowKind:kind,x:100,y:100,width:kind==='ledge'?168:kind==='waymark'?36:96,depth:kind==='waymark'?30:70,height:kind==='drift'?28:48,angle,seed:.5};
  const v=snowVisual(p);assert(v.top>20&&v.bottom>0&&v.halfWidth>=18);const fade=context(true);
  assert(propArt.drawProp(fade.c,p,{player:{x:100},footY:90}));assert(fade.calls.some(c=>c.key==='drawImage'&&c.alpha<.8),'foreground structures recede over the player');assert.equal(fade.c.globalAlpha,.8);assert(!fade.stack.length);
  const builds=propArt.cacheStats.builds;propArt.drawProp(screen.c,p);assert.equal(propArt.cacheStats.builds,builds,'static prop sprite stays warm');
}
for(const site of layout.interactions.caves)assert(drawRiftLandmark(screen.c,{...site,kind:'cave',artTheme:'snow'}));
assert(canvases.every(c=>c.width<=1300&&c.height<=1300),'no whole-map textures are retained');
assert(contexts.every(c=>c.stack.length===0)&&screen.stack.length===0&&map.stack.length===0);
assert.equal(JSON.stringify(layout),before,'drawing does not mutate physical map data');
propArt.clear();assert.equal(propArt.cacheStats.entries,0);assert.equal(propArt.cacheStats.bytes,0);
console.log(JSON.stringify({snowArt:'passed',warmFrames,visiblePropPeak,peakBytes:peak,limitBytes:art.cacheStats.limitBytes,checks:'warm bounded 1728x874 terrain and actual depth sprites; shared map geometry; finite drawing; sprite caching; foreground fade; context balance; prop release'}));
