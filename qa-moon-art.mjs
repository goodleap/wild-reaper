import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MoonArt, drawMoonMap, drawMoonGates } from './dist/moon-art.js';

function context(record=false){
  const values={globalAlpha:.8},stack=[],calls=[];
  const c=new Proxy(values,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>stack.push({...target});
    if(key==='restore')return()=>{assert(stack.length,'balanced drawing context');const prior=stack.pop();for(const key of Object.keys(target))delete target[key];Object.assign(target,prior);};
    if(key==='createLinearGradient'||key==='createRadialGradient')return(...args)=>{assert(args.every(Number.isFinite));return {addColorStop(offset){assert(Number.isFinite(offset));}};};
    return(...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${String(key)} coordinates stay finite`);if(record)calls.push({key,args,alpha:target.globalAlpha});};
  }});return {c,calls,stack};
}
const d=JSON.parse(readFileSync(new URL('./dist/config/stages.json',import.meta.url))).expeditions.find(d=>d.id==='moon');
const original=JSON.stringify(d),contexts=[],canvases=[];
const factory=()=>{const ctx=context();contexts.push(ctx);const canvas={width:0,height:0,getContext:()=>ctx.c};canvases.push(canvas);return canvas;};
const art=new MoonArt(factory),screen=context(),locations=[d.start,...d.segments.map(s=>s.center),d.exit];let peak=0,warmFrames=0;
const view=p=>({minX:p.x-960,minY:p.y-540,maxX:p.x+960,maxY:p.y+540});
function draw(p){
  art.drawGround(screen.c,d,view(p));
  for(const solid of d.landform.solids)if(Math.abs(solid.x-p.x)<960+solid.width/2&&Math.abs(solid.y-p.y)<540+solid.depth/2+solid.height)assert(art.drawProp(screen.c,{moonSolid:solid}));
}
for(const p of [...locations,...locations.slice().reverse()]){
  draw(p);const builds=art.cacheStats.builds;
  for(let i=0;i<6;i++){draw(p);warmFrames++;}
  assert.equal(art.cacheStats.builds,builds,'a 1920 × 1080 world view remains warm without rebuilding static terrain');
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'traversing the complete map keeps memory bounded');peak=Math.max(peak,art.cacheStats.bytes);
}
art.drawPreview(screen.c,d,280,210);const previewBuilds=art.cacheStats.builds;
for(let i=0;i<4;i++)art.drawPreview(screen.c,d,280,210);
assert.equal(art.cacheStats.builds,previewBuilds,'preparation preview reuses its image');
const map=context(true);drawMoonMap(map.c,d,{scale:.16,labels:true});
const vertices=new Set(map.calls.filter(c=>c.key==='moveTo'||c.key==='lineTo').map(c=>c.args.join(',')));
for(const p of [...d.landform.outline,...d.landform.solids.flatMap(s=>s.points)])assert(vertices.has(`${p.x},${p.y}`),'map follows the exact physical outline and solid boundaries');
for(const cleared of [false,true])drawMoonGates(screen.c,{groups:d.segments.map(definition=>({definition,cleared}))});
const structure=d.landform.solids.find(s=>s.kind==='wreck'),faded=context(true);
assert(art.drawProp(faded.c,{moonSolid:structure},{player:{x:structure.x},footY:structure.y-30}));
assert(faded.calls.some(c=>c.key==='drawImage'&&c.alpha<.8),'structures recede when their visual height covers the player');assert.equal(faded.c.globalAlpha,.8);
const crater=d.landform.solids.find(s=>s.kind==='crater'),pit=context(true);
assert(art.drawProp(pit.c,{moonSolid:crater}));assert(!pit.calls.some(c=>c.key==='drawImage'),'a ground crater never becomes a floating depth sprite');
assert(canvases.every(c=>c.width<=1300&&c.height<=1300),'no full-map bitmap is retained');
assert(contexts.every(c=>c.stack.length===0)&&screen.stack.length===0&&map.stack.length===0&&faded.stack.length===0);
assert.equal(JSON.stringify(d),original,'rendering does not modify gameplay geometry');
art.clear();assert.equal(art.cacheStats.entries,0);assert.equal(art.cacheStats.bytes,0);
console.log(JSON.stringify({moonArt:'passed',warmFrames,peakBytes:peak,limitBytes:art.cacheStats.limitBytes,checks:'bounded warm desktop cache; cached preview; same physical contours; finite drawing; occlusion; balanced context; release'}));
