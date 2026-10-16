import assert from 'node:assert/strict';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { RiftArt } from './dist/worlds/rift-art.js';
import { CityMapArt, drawCityOverview } from './dist/worlds/city-map-art.js';
import { WorldLayoutArt, drawWorldLayoutMap } from './dist/worlds/world-layout-art.js';
import { cityDetailArt } from './dist/city-detail-art.js';
import { cityArtLibrary } from './dist/city-art-library.js';
import { CITY_NATIVE_GROUND_TILE, drawCityNativeGround, drawCityNativeBridgeDeck } from './dist/worlds/city-native-ground.js';
import { drawCitySampleGround } from './dist/worlds/city-sample-ground.js';

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
const nativeGround={naturalWidth:1254,naturalHeight:1254,source:'approved-native-ground'},nativeGrass={naturalWidth:1254,naturalHeight:1254,source:'native-grass-and-dirt'};
cityDetailArt.images.set('ground',nativeGround);
cityArtLibrary.images.set('grassGround',nativeGrass);
assert.equal(CITY_NATIVE_GROUND_TILE,320,'the approved paving keeps its 20–28-unit slab scale');
const native=recording(),sample=recording(),sampleView={minX:-4470,maxX:-3930,minY:-2550,maxY:-2250};
assert(drawCityNativeGround(native.c,layout,sampleView));assert(drawCitySampleGround(sample.c,layout,sampleView));
const pavingCalls=draw=>draw.calls.filter(call=>['drawImage','translate','scale'].includes(call.key));
assert.deepEqual(pavingCalls(native),pavingCalls(sample),'sample and full-city paving share the exact same native texture, reflection and world origin');
for(const call of native.calls.filter(call=>call.key==='drawImage')){
  assert.equal(call.args[0],nativeGround);assert.deepEqual(call.args.slice(1),[0,0,320,320]);
}
const reflected=recording();assert(drawCityNativeGround(reflected.c,layout,{minX:-321,minY:-1,maxX:1,maxY:321}));
assert(reflected.calls.some(call=>call.key==='scale'&&call.args[0]===-1),'negative world tiles also reflect their shared X edge');
assert(reflected.calls.some(call=>call.key==='scale'&&call.args[1]===-1),'negative world tiles also reflect their shared Y edge');
assert(!drawCityNativeGround(reflected.c,forest,sampleView),'native city paving cannot replace forest-world artwork');
assert.throws(()=>drawCityNativeGround(reflected.c,layout,sampleView,{image:null}),/must be preloaded/,'missing approved ground cannot silently leave a different cached floor');
for(const p of layout.passages.filter(p=>p.kind==='bridge')){
  const bridge=recording(),otherApproach=recording();assert(drawCityNativeBridgeDeck(bridge.c,layout,p));
  assert(drawCityNativeBridgeDeck(otherApproach.c,layout,{...p,points:[{x:1e6,y:1e6}],waypoints:[{x:-1e6,y:-1e6}]}));
  assert.deepEqual(bridge.calls,otherApproach.calls,'bridge material depends on the physical deck, never the long approach road');
  const [a,b]=p.deck,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),nx=-dy/length*p.width/2,ny=dx/length*p.width/2;
  for(const point of[[a.x+nx,a.y+ny],[b.x+nx,b.y+ny],[b.x-nx,b.y-ny],[a.x-nx,a.y-ny]])assert(bridge.calls.some(call=>['moveTo','lineTo'].includes(call.key)&&call.args.every((v,i)=>almost(v,point[i]))),'deck uses its exact authored length and traversal width');
  assert(bridge.calls.some(call=>call.key==='drawImage'&&call.args[0]===nativeGround),'bridge uses the same native stone diffuse');
  assert.equal(bridge.stack.length,0);
}
// Reproduce the former corner cuts at the same entrance/street junction.
// Raised houses must not be painted into the blocked-complement floor clip,
// including neighboring grid cells whose projections extend into this view.
const sampleFloor=new CityMapArt(factory),sampleScreen=recording();
sampleFloor.ground._building=()=>{throw new Error('A clipped background house leaked into the depth-sorted sample');};
sampleFloor.ground._tree=()=>{throw new Error('A tree leaked into cached diffuse floor');};
sampleFloor.ground._tile=()=>{throw new Error('A procedural city ground replaced the approved native material');};
assert(sampleFloor.paintTile(sampleScreen.c,layout,{minX:-4470,maxX:-3930,minY:-2550,maxY:-2250}));
assert(sampleScreen.calls.some(call=>call.key==='drawImage'&&call.args[0]===nativeGround));
assert(!sampleScreen.calls.some(call=>call.key==='stroke'),'the approved castle entrance paving receives no new tint, cracks or overlaid grass');
assert.equal(sampleScreen.stack.length,0);
for(const area of layout.areas){
  const areaScreen=recording(),p=area.center;assert(sampleFloor.paintTile(areaScreen.c,layout,{minX:p.x-270,maxX:p.x+270,minY:p.y-225,maxY:p.y+225}));
  assert(areaScreen.calls.filter(call=>call.key==='drawImage').every(call=>call.args[0]===nativeGround||canvases.includes(call.args[0])),'all 19 districts cache diffuse material only; raised objects belong in the depth queue');
  assert.equal(areaScreen.stack.length,0);
}
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
cityDetailArt.images.delete('ground');
cityArtLibrary.images.delete('grassGround');
console.log(JSON.stringify({cityMapArt:'passed',structures:layout.cityStructures.length,labels:layout.areas.length,nativeGroundTile:CITY_NATIVE_GROUND_TILE,warmFrames:40,explorationViews:100,cacheBytes:art.cacheStats.bytes,cacheLimitBytes:art.cacheStats.limitBytes,coverage:'exact collision contours and foundations; native 320-unit reflected diffuse across every district and bridge; no raised buildings or trees in floor clips; unchanged castle sample; soft natural ground transitions; exact bridge decks; overview culling; city/forest cache isolation; 540-unit warm frames and capped exploration memory'}));
