import assert from 'node:assert/strict';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { RiftArt } from './dist/worlds/rift-art.js';
import { CityMapArt, drawCityOverview } from './dist/worlds/city-map-art.js';
import { WorldLayoutArt, drawWorldLayoutMap } from './dist/worlds/world-layout-art.js';
import { CITY_NATIVE_GROUND_TILE, drawCityNativeGround, drawCityNativeBridgeDeck } from './dist/worlds/city-native-ground.js';

function recording(record=true){
  const state={globalAlpha:.61,globalCompositeOperation:'source-over'},stack=[],calls=[];
  const c=new Proxy(state,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>stack.push({...target});
    if(key==='restore')return()=>{assert(stack.length,'balanced city drawing context');const prior=stack.pop();for(const k of Object.keys(target))delete target[k];Object.assign(target,prior);};
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({addColorStop(){}});
    return(...args)=>{for(const v of args)if(typeof v==='number')assert(Number.isFinite(v),`${String(key)} receives finite world coordinates`);if(record)calls.push({key,args,fill:typeof target.fillStyle==='object'?'gradient':target.fillStyle});};
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
const native=recording(),sampleView={minX:-4470,maxX:-3930,minY:-2550,maxY:-2250};
assert(drawCityNativeGround(native.c,layout,sampleView));
assert(native.calls.some(call=>call.key==='quadraticCurveTo'),'warm paving has individual chipped slabs');
assert(!native.calls.some(call=>call.key==='drawImage'),'paving does not depend on the retired native PNG');
const reflected=recording();assert(drawCityNativeGround(reflected.c,layout,{minX:-321,minY:-1,maxX:1,maxY:321}));
assert(!drawCityNativeGround(reflected.c,forest,sampleView),'city paving cannot replace forest-world artwork');
for(const p of layout.passages.filter(p=>p.kind==='bridge')){
  const bridge=recording(),otherApproach=recording();assert(drawCityNativeBridgeDeck(bridge.c,layout,p));
  assert(drawCityNativeBridgeDeck(otherApproach.c,layout,{...p,points:[{x:1e6,y:1e6}],waypoints:[{x:-1e6,y:-1e6}]}));
  assert.deepEqual(bridge.calls,otherApproach.calls,'bridge material depends on the physical deck, never the long approach road');
  const [a,b]=p.deck,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),nx=-dy/length*p.width/2,ny=dx/length*p.width/2;
  for(const point of[[a.x+nx,a.y+ny],[b.x+nx,b.y+ny],[b.x-nx,b.y-ny],[a.x-nx,a.y-ny]])assert(bridge.calls.some(call=>['moveTo','lineTo'].includes(call.key)&&call.args.every((v,i)=>almost(v,point[i]))),'deck uses its exact authored length and traversal width');
  assert(bridge.calls.some(call=>call.key==='quadraticCurveTo'),'bridge uses the same stone slab material');
  assert.equal(bridge.stack.length,0);
}
// Reproduce the former corner cuts at the same entrance/street junction.
// Raised houses must not be painted into the blocked-complement floor clip,
// including neighboring grid cells whose projections extend into this view.
const sampleFloor=new CityMapArt(factory),sampleScreen=recording();
sampleFloor.ground._building=()=>{throw new Error('A clipped background house leaked into the depth-sorted sample');};
sampleFloor.ground._tree=()=>{throw new Error('A tree leaked into cached diffuse floor');};
sampleFloor.ground._tile=()=>{throw new Error('The generic legacy floor replaced the authored city paving');};
assert(sampleFloor.paintTile(sampleScreen.c,layout,{minX:-4470,maxX:-3930,minY:-2550,maxY:-2250}));
assert(sampleScreen.calls.some(call=>call.key==='quadraticCurveTo'));
assert.equal(sampleScreen.stack.length,0);
for(const area of layout.areas){
  const areaScreen=recording(),p=area.center;assert(sampleFloor.paintTile(areaScreen.c,layout,{minX:p.x-270,maxX:p.x+270,minY:p.y-225,maxY:p.y+225}));
  assert(areaScreen.calls.filter(call=>call.key==='drawImage').every(call=>canvases.includes(call.args[0])),'ground cache draws only locally created tiles and deep vegetation; complete edge objects belong in depth queue');
  assert.equal(areaScreen.stack.length,0);
}
// The transient mask and grass surfaces are a bounded working set, reused
// while new tiles are painted rather than allocated once per traversed tile.
assert.equal(sampleFloor.cacheStats.workingCanvasAllocations,3,'all natural districts share one work pair and alpha stamp');
assert(sampleFloor.cacheStats.workingCanvasBytes>0&&sampleFloor.cacheStats.workingCanvasBytes<=(2*1024*1024+256*256)*4);
const workMask=sampleFloor.workspace.mask,workLayer=sampleFloor.workspace.layer,workStamp=sampleFloor.workspace.stamp;
sampleFloor.releaseWorkingSet();assert.equal(sampleFloor.cacheStats.workingCanvasBytes,0,'explicit release drops retained work buffers');
assert.equal(workMask.width,0);assert.equal(workLayer.height,0);assert.equal(workStamp.width,0);
const natural=layout.areas.find(a=>a.id==='02').center;
assert(sampleFloor.paintTile(recording().c,layout,{minX:natural.x-194,minY:natural.y-194,maxX:natural.x+194,maxY:natural.y+194}));
assert.equal(sampleFloor.cacheStats.workingCanvasAllocations,6,'painting after release safely recreates one pair and alpha stamp');
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
console.log(JSON.stringify({cityMapArt:'passed',structures:layout.cityStructures.length,labels:layout.areas.length,nativeGroundTile:CITY_NATIVE_GROUND_TILE,warmFrames:40,explorationViews:100,cacheBytes:art.cacheStats.bytes,cacheLimitBytes:art.cacheStats.limitBytes,coverage:'exact collision contours and foundations; world-anchored warm slabs across districts and bridges; no raised buildings or trees in floor clips; no retired PNG dependency; soft natural ground transitions; exact bridge decks; overview culling; city/forest cache isolation; 540-unit warm frames and capped exploration memory'}));
