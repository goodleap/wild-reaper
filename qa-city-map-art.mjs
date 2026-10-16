import assert from 'node:assert/strict';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { RiftArt } from './dist/worlds/rift-art.js';
import { CityMapArt, drawCityOverview } from './dist/worlds/city-map-art.js';
import { WorldLayoutArt, drawWorldLayoutMap } from './dist/worlds/world-layout-art.js';

function recording(record=true){
  const state={globalAlpha:.61,globalCompositeOperation:'source-over'},stack=[],calls=[];
  const c=new Proxy(state,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>stack.push({...target});
    if(key==='restore')return()=>{assert(stack.length,'balanced city drawing context');const prior=stack.pop();for(const k of Object.keys(target))delete target[k];Object.assign(target,prior);};
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({addColorStop(){}});
    return(...args)=>{for(const v of args)if(typeof v==='number')assert(Number.isFinite(v),`${String(key)} receives finite world coordinates`);if(record)calls.push({key,args,fill:target.fillStyle});};
  }});
  return{c,calls,stack};
}
const layout=createRiftLayout('clockshadow-city'),forest=createRiftLayout('forest'),island={region:'clockshadow-city',layout},original=JSON.stringify(layout);
const full=recording();
assert(drawCityOverview(full.c,layout,{scale:.1}));
assert(!full.calls.some(call=>call.key==='fillText'),'the minimap remains free of full-size area labels');
const vertices=new Set(full.calls.filter(call=>['moveTo','lineTo'].includes(call.key)).map(call=>call.args.join(',')));
for(const boundary of layout.boundaries)for(const p of boundary.points)assert(vertices.has(`${p.x},${p.y}`),'overview traces the same walkable contour used for collision');
// A footprint may be drawn with a rectangle command or a closed polygon. Both
// must use the authored corners rather than an undersized symbolic building.
const rects=full.calls.filter(call=>['rect','fillRect','strokeRect'].includes(call.key)).map(call=>call.args);
const almost=(a,b)=>Math.abs(a-b)<.001;
for(const s of layout.cityStructures.filter(s=>s.solid)){
  const left=s.x-s.width/2,top=s.y-s.depth/2,right=s.x+s.width/2,bottom=s.y+s.depth/2;
  const rect=rects.some(args=>args.length===4&&args.every((v,i)=>almost(v,[left,top,s.width,s.depth][i])));
  const polygon=[[left,top],[right,top],[right,bottom],[left,bottom]].every(p=>vertices.has(p.join(',')));
  assert(rect||polygon,`${s.id}: the overview shows its complete physical foundation`);
}
for(const p of layout.passages.filter(p=>p.kind==='bridge')){
  assert(full.calls.some(call=>call.key==='translate'&&almost(call.args[0],p.deck[0].x)&&almost(call.args[1],p.deck[0].y)),'stone bridge starts at its deck, not its long approach road');
}
const labeled=recording();drawWorldLayoutMap(labeled.c,island,{scale:.1,labels:true});
assert.equal(labeled.calls.filter(call=>call.key==='fillText').length,layout.areas.length,'expanded overview names each exploration region once');
const culled=recording();drawCityOverview(culled.c,layout,{scale:.1,labels:true,viewBounds:{minX:20000,minY:20000,maxX:20540,maxY:20985}});
assert(!culled.calls.some(call=>call.key==='fillText'),'offscreen region names are culled');

const canvases=[],factory=()=>{const canvas={width:0,height:0,getContext:()=>recording(false).c};canvases.push(canvas);return canvas;};
// Reproduce the former corner cuts at the same entrance/street junction.
// Raised houses must not be painted into the blocked-complement floor clip,
// including neighboring grid cells whose projections extend into this view.
const sampleFloor=new CityMapArt(factory),sampleScreen=recording();
sampleFloor.ground._building=()=>{throw new Error('A clipped background house leaked into the depth-sorted sample');};
assert(sampleFloor.paintTile(sampleScreen.c,layout,{minX:-4470,maxX:-3930,minY:-2550,maxY:-2250}));
assert.equal(sampleScreen.stack.length,0);
const art=new RiftArt(factory),screen=recording(false),view={camX:layout.spawn.x,camY:layout.spawn.y,width:540,height:985};
assert(art.drawGround(screen.c,island,view));const warm=art.cacheStats.builds;
for(let i=0;i<40;i++)art.drawGround(screen.c,island,{...view,camX:view.camX+i*.01});
assert.equal(art.cacheStats.builds,warm,'warm 540-unit city frames reuse static ground tiles');
const forestView={region:'forest',layout:forest};art.drawGround(screen.c,forestView,{camX:forest.spawn.x,camY:forest.spawn.y,width:540,height:985});
const switched=art.cacheStats.builds;art.drawGround(screen.c,island,view);
assert.equal(art.cacheStats.builds,switched,'forest and city tile identities do not alias or discard a nearby warm view');
for(let i=0;i<100;i++){
  const b=layout.bounds;art.drawGround(screen.c,island,{camX:b.minX+200+i*(b.maxX-b.minX-400)/99,camY:Math.sin(i*.43)*4400,width:540,height:985});
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'long city exploration retains bounded ground and shared sprite memory');
}
assert(canvases.every(canvas=>canvas.width<=2048&&canvas.height<=2048),'drawing never allocates a full-world canvas');
const integration=new WorldLayoutArt(factory);assert(integration.drawGround(screen.c,island,view));
assert(integration.cacheStats.bytes>0,'shared performance diagnostics include city ground');
assert.equal(screen.c.globalAlpha,.61);assert.equal(full.c.globalAlpha,.61);assert.equal(full.stack.length,0);assert.equal(labeled.stack.length,0);assert.equal(culled.stack.length,0);assert.equal(screen.stack.length,0);
assert.equal(JSON.stringify(layout),original,'maps and ground drawing cannot modify baked geometry or gameplay state');
console.log(JSON.stringify({cityMapArt:'passed',structures:layout.cityStructures.length,labels:layout.areas.length,warmFrames:40,explorationViews:100,cacheBytes:art.cacheStats.bytes,cacheLimitBytes:art.cacheStats.limitBytes,coverage:'exact collision contours and foundations; stone bridge decks; overview culling; city/forest cache isolation; 540-unit warm frames and capped exploration memory'}));
