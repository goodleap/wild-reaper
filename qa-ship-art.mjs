import assert from 'node:assert/strict';
import { getExpeditionDefinition } from './dist/expedition-definitions.js';
import { ShipArt, drawShipSceneMap, drawShipLinks } from './dist/ship-art.js';

function context(record=false){
  const values={globalAlpha:.72},stack=[],calls=[];
  const c=new Proxy(values,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>stack.push({...target});
    if(key==='restore')return()=>{assert(stack.length,'balanced drawing context');const prior=stack.pop();for(const key of Object.keys(target))delete target[key];Object.assign(target,prior);};
    if(key==='createLinearGradient'||key==='createRadialGradient')return(...args)=>{assert(args.every(Number.isFinite));return {addColorStop(offset){assert(Number.isFinite(offset));}};};
    return(...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${String(key)} coordinates stay finite`);if(record)calls.push({key,args,alpha:target.globalAlpha});};
  }});return {c,calls,stack};
}
const scenes=getExpeditionDefinition('ship').scenes,before=JSON.stringify(scenes),allContexts=[],canvases=[];
const factory=()=>{const ctx=context();allContexts.push(ctx);const canvas={width:0,height:0,getContext:()=>ctx.c};canvases.push(canvas);return canvas;};
const art=new ShipArt(factory),screen=context(),full=scene=>({minX:scene.bounds.minX-50,minY:scene.bounds.minY-50,maxX:scene.bounds.maxX+50,maxY:scene.bounds.maxY+50});let peak=0;
const draw=scene=>{art.drawGround(screen.c,scene,full(scene),1);for(const shipSolid of scene.solids)assert(art.drawProp(screen.c,{shipSolid}));};
for(const scene of [...scenes,...scenes.slice().reverse(),...scenes]){
  draw(scene);const built=art.cacheStats.builds;
  for(let i=0;i<8;i++)draw(scene);
  assert.equal(art.cacheStats.builds,built,`${scene.id}: a full desktop scene fits and stays warm after changing floors`);
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'scene traversal evicts old imagery within the budget');
  peak=Math.max(peak,art.cacheStats.bytes);
  const overview=context(true);drawShipSceneMap(overview.c,scene,{labels:true,scale:.2});
  const vertices=new Set(overview.calls.filter(x=>x.key==='moveTo'||x.key==='lineTo').map(x=>x.args.join(',')));
  for(const p of [...scene.outline,...scene.solids.flatMap(s=>s.points)])assert(vertices.has(`${p.x},${p.y}`),'overview follows every physical hull and solid vertex');
  assert.equal(overview.stack.length,0);
}
const mast=scenes.flatMap(s=>s.solids).find(s=>s.kind==='mast'),faded=context(true);
assert(mast);art.drawProp(faded.c,{shipSolid:mast},{player:{x:mast.x,y:mast.y-70},footY:mast.y-45});
assert(faded.calls.some(x=>x.key==='drawImage'&&x.alpha<.5),'sails recede when they would hide the player');
assert.equal(faded.c.globalAlpha,.72);assert.equal(faded.stack.length,0);
for(const scene of scenes)for(const cleared of [false,true]){drawShipLinks(screen.c,{sceneDefinition:scene,groups:[{cleared},{cleared}]});assert.equal(screen.stack.length,0);}
assert(canvases.every(c=>c.width<=1280&&c.height<=1280),'there is no retained full-floor bitmap');
assert(allContexts.every(ctx=>ctx.stack.length===0));assert.equal(JSON.stringify(scenes),before,'drawing cannot modify geometry or progression');
art.clear();assert.equal(art.cacheStats.bytes,0);assert.equal(art.cacheStats.entries,0);
console.log(JSON.stringify({shipArt:'passed',scenes:scenes.length,desktopWarmFrames:72,peakBytes:peak,limitBytes:art.cacheStats.limitBytes,checks:'same collision contours; full-scene warm caches across returns; bounded memory; finite draws; sailor visibility; context and disposal'}));
