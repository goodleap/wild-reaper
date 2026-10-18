import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// The art manifest is usable by geometry/Node tooling before a browser exists.
const originalImage=Object.getOwnPropertyDescriptor(globalThis,'Image'),originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
Object.defineProperty(globalThis,'Image',{configurable:true,get(){throw new Error('Image accessed during module import');}});
Object.defineProperty(globalThis,'document',{configurable:true,get(){throw new Error('document accessed during module import');}});
const {CITY_DETAIL_MANIFEST,CityDetailArt,cityDetailArt,cityDetailVisual}=await import('./dist/city-detail-art.js');
assert.equal(cityDetailArt.ready,false);
for(const [key,descriptor]of[['Image',originalImage],['document',originalDocument]])if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
assert(Object.isFrozen(CITY_DETAIL_MANIFEST)&&Object.isFrozen(CITY_DETAIL_MANIFEST.assets.gate)&&Object.isFrozen(CITY_DETAIL_MANIFEST.props),'selectors cannot expand at runtime');
const nativeBytes=[];
for(const [kind,spec]of Object.entries(CITY_DETAIL_MANIFEST.assets)){
  const buffer=await readFile(new URL(spec.path,new URL('./dist/city-detail-art.js',import.meta.url)));
  assert.equal(buffer.subarray(1,4).toString(),'PNG');assert.equal(buffer.readUInt32BE(16),spec.width);assert.equal(buffer.readUInt32BE(20),spec.height);
  assert.equal(createHash('sha256').update(buffer).digest('hex'),spec.sha256,`${kind} is the untouched native source PNG`);
  nativeBytes.push(spec.width*spec.height*4);
}
const assetKeys=Object.keys(CITY_DETAIL_MANIFEST.assets),assetCount=assetKeys.length;
assert.equal(assetCount,5,'sample has a fixed five-image working set');
assert(nativeBytes.reduce((a,b)=>a+b,0)<=32*1024*1024,'native decoded allocation stays below 32 MiB');

const loads=new Map(),decodes=new Map();let failGate=true;
const loader=async(url,key,spec)=>{
  loads.set(key,(loads.get(key)??0)+1);assert.equal(new URL(url).origin,new URL(import.meta.url).origin,'assets are relative to this same-origin module');
  if(key==='gate'&&failGate){failGate=false;throw new Error('simulated network failure');}
  return{naturalWidth:spec.width,naturalHeight:spec.height,decode:async()=>decodes.set(key,(decodes.get(key)??0)+1)};
};
const art=new CityDetailArt({loadImage:loader});
const gate={id:'gate:castle-main',region:'clockshadow-city',variant:'city-structure',x:-4200,y:-2680,width:280,depth:60,height:112,sortY:-2650};
assert.throws(()=>art.drawProp({},gate),/preloaded/,'missing artwork cannot silently pretend to be the completed sample');
const preflightVisual=cityDetailVisual(gate);assert(preflightVisual&&preflightVisual.top>120,'culling metadata is available before decode');
const first=art.preload();assert.equal(first,art.preload(),'concurrent callers share one load attempt');
await assert.rejects(first,/failed to load/);assert.equal(art.ready,false);assert.equal(art.cacheStats.failures,1);assert.equal(art.getImage('gate'),null);
assert.equal(art.cacheStats.entries,assetCount-1,'successful independent images survive a retry');
await art.preload();assert.equal(art.ready,true);assert.equal(art.cacheStats.entries,assetCount);assert.equal(loads.get('gate'),2);
for(const key of assetKeys.filter(key=>key!=='gate'))assert.equal(loads.get(key),1,'retry does not re-fetch successful native images');
for(const key of assetKeys)assert.equal(decodes.get(key),1,'one successful decode per native image');
for(let i=0;i<8;i++)await art.preload();assert.equal(art.cacheStats.decodes,assetCount);assert.equal(art.cacheStats.bytes,nativeBytes.reduce((a,b)=>a+b,0));
assert.deepEqual(art.cacheStats.decodeNaturalSizes.gate,{width:1482,height:1061});assert(art.getImage('ground'));assert(art.getImage('house'));
assert.deepEqual(Object.entries(CITY_DETAIL_MANIFEST.props).filter(([,prop])=>prop.asset==='house').map(([id])=>id),['city-sample:house:west','city-sample:house:east'],'whole house PNGs use only the two approved depth props');
assert.deepEqual(cityDetailVisual(gate),preflightVisual,'culling and shadow metadata do not jump after preload');

const drawn=[],stack=[],ctx={globalAlpha:.72,save(){stack.push(this.globalAlpha);},restore(){assert(stack.length);this.globalAlpha=stack.pop();},drawImage(...args){drawn.push({args,alpha:this.globalAlpha});}};
assert(art.drawProp(ctx,gate,{canopyAlpha:.4}));assert.equal(ctx.globalAlpha,.72);assert.equal(stack.length,0);assert(Math.abs(drawn[0].alpha-.288)<1e-12);
const spec=CITY_DETAIL_MANIFEST.props[gate.id],call=drawn[0].args;
assert.equal(call[0],art.getImage('gate'));assert.equal(call[1],gate.x-spec.anchorX);assert.equal(call[2],gate.y-spec.anchorY);assert.equal(call[3],spec.drawWidth);assert.equal(call[4],spec.drawHeight);
const sourceScale=200/693;
assert(Math.abs((call[1]+1088*sourceScale)-(call[1]+395*sourceScale)-200)<1e-10,'the painted doorway retains the real 200 unit opening');
assert(Math.abs(call[2]+1040*sourceScale-gate.y-20)<1e-10,'native source foot aligns with world y+20');
assert(spec.drawWidth>427&&spec.drawHeight>306,'tall twin towers receive their full visual culling bounds');
// Legacy source calibration is a renderer unit fixture, not a requirement
// that the rebuilt world retain the old sample's adjoining wall identities.
const legacyWallFeet=[
  {x:-4425,y:-2680,width:250,depth:40,minSourceX:45,maxSourceX:395},
  {x:-3975,y:-2680,width:250,depth:40,minSourceX:1088,maxSourceX:1428}
];
for(const wall of legacyWallFeet){
  const foot={minX:call[1]+wall.minSourceX*sourceScale,maxX:call[1]+wall.maxSourceX*sourceScale,minY:gate.y-20,maxY:gate.y+20},epsilon=1e-8;
  assert(foot.minX>=wall.x-wall.width/2-epsilon&&foot.maxX<=wall.x+wall.width/2+epsilon&&foot.minY>=wall.y-wall.depth/2-epsilon&&foot.maxY<=wall.y+wall.depth/2+epsilon,'legacy source tower feet fit their calibrated wall footprint');
}

const {CITY_SAMPLE_HOUSES}=await import('./dist/worlds/city-sample-scene.js');
assert.equal(CITY_SAMPLE_HOUSES.length,2);
assert.deepEqual(CITY_SAMPLE_HOUSES.map(({x,y,width,depth,height,sortY})=>({x,y,width,depth,height,sortY})),[
  {x:-4410,y:-2340,width:210,depth:100,height:160,sortY:-2290},{x:-3990,y:-2340,width:210,depth:100,height:160,sortY:-2290}
]);
for(const house of CITY_SAMPLE_HOUSES){
  assert.equal(house.collision,false,'existing authored geometry remains the sole house-foot blocker');
  const spec=CITY_DETAIL_MANIFEST.props[house.id];assert(spec&&spec.asset==='house');assert.equal(house.width,spec.width);assert.equal(house.depth,spec.depth);assert.equal(house.variant,spec.variant);
  let houseCall;
  const houseContext={...ctx,clip(){throw new Error('house PNG must not inherit a floor/mass clip');},drawImage(...args){houseCall={args,alpha:this.globalAlpha};}};
  assert(art.drawProp(houseContext,house,{canopyAlpha:.55}));assert.equal(houseCall.args.length,5,'draw the complete PNG; no source crop rectangle');assert.equal(houseCall.args[0],art.getImage('house'));
  assert.deepEqual(houseCall.args.slice(1),[house.x-spec.anchorX,house.y-spec.anchorY,264,264]);assert(Math.abs(houseCall.alpha-.72*.55)<1e-12);assert.equal(houseContext.globalAlpha,.72);
  assert(Math.abs(houseCall.args[1]+636/1254*264-house.x)<1e-10,'image foot center stays on the declared house x');
  assert(Math.abs(houseCall.args[2]+1186/1254*264-house.y-50)<1e-10,'complete house-front foot lands at original y+50');
  assert.equal(cityDetailVisual(house).sortY,house.sortY,'house enters the existing front-foot depth queue');
}
for(const [id,entry]of Object.entries(CITY_DETAIL_MANIFEST.props)){
  const prop={id,region:CITY_DETAIL_MANIFEST.worldId,variant:entry.variant,width:entry.width,depth:entry.depth,height:entry.height??78,x:100,y:200,sortY:208};
  const visual=cityDetailVisual(prop);assert.equal(visual.sortY,208,'renderer keeps the existing depth queue');assert.equal(visual.maxBounds.minX,prop.x-entry.anchorX);assert.equal(visual.maxBounds.maxY,prop.y+entry.drawHeight-entry.anchorY);
  assert(art.drawProp(ctx,prop));
}
const before=art.cacheStats.draws;
for(const override of[{region:'forest'},{region:'city'},{region:'snow'},{id:'castle:南墙西:0:1'},{id:'gate:another'},{variant:'world-building'},{width:281},{depth:59},{x:NaN}]){
  const prop={...gate,...override};assert.equal(art.drawProp(ctx,prop),false);assert.equal(cityDetailVisual(prop),null);
}
assert.equal(art.cacheStats.draws,before,'sample artwork never spreads by type or proximity');
assert.throws(()=>art.drawProp({...ctx,drawImage(){throw new Error('draw rejected');}},gate),/draw rejected/);assert.equal(stack.length,0,'draw errors also restore canvas context');
assert.equal(art.cacheStats.draws,before,'failed draw does not count as actual rendered artwork');
for(let i=0;i<200;i++)art.drawProp(ctx,gate,{canopyAlpha:i%2?1:.3});assert.equal(art.cacheStats.decodes,assetCount);assert.equal(art.cacheStats.entries,assetCount);assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);

let wrongSize=true,decodeFailure=true;
const retryArt=new CityDetailArt({loadImage:async(url,key,spec)=>({naturalWidth:spec.width+(key==='wall'&&wrongSize?1:0),naturalHeight:spec.height,decode:async()=>{if(key==='foliage'&&decodeFailure){decodeFailure=false;throw new Error('decode rejected');}}})});
await assert.rejects(retryArt.preload(),/failed to load/);assert.equal(retryArt.ready,false);assert.equal(retryArt.cacheStats.entries,assetCount-2,'bad native dimensions and decode rejection are both rejected');wrongSize=false;
await retryArt.preload();assert.equal(retryArt.ready,true);assert.equal(retryArt.cacheStats.decodes,assetCount);

// A transparent doorway must keep its original opacity even when the old
// ellipse estimates an obstruction. Opaque columns still use that same fade.
let maskReads=0,maskDraws=0;
const maskArt=new CityDetailArt({loadImage:async(url,key,spec)=>({key,naturalWidth:spec.width,naturalHeight:spec.height,decode:async()=>{}}),makeCanvas:()=>{
  const canvas={width:0,height:0};let source;
  canvas.getContext=()=>({drawImage(image){source=image;maskDraws++;},getImageData(x,y,width,height){maskReads++;const data=new Uint8ClampedArray(width*height*4);for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)data[(yy*width+xx)*4+3]=source.key==='gate'&&xx>width*.27&&xx<width*.73?0:255;return{data};}});return canvas;
}});
const maskSpecs=new Map(Object.values(CITY_DETAIL_MANIFEST.props).map(spec=>[spec.asset,spec])),maskCount=maskSpecs.size,expectedMaskBytes=[...maskSpecs.values()].reduce((sum,spec)=>sum+Math.ceil(spec.drawWidth)*Math.ceil(spec.drawHeight),0);
await maskArt.preload();assert.equal(maskReads,maskCount);assert.equal(maskDraws,maskCount);assert.equal(maskArt.cacheStats.maskBuilds,4,'gate, wall, foliage and house each receive one display-resolution mask');
assert.equal(maskArt.cacheStats.maskBytes,expectedMaskBytes,'alpha masks use exactly one byte per display pixel');
assert.equal(maskArt.cacheStats.bytes,maskArt.cacheStats.imageBytes+maskArt.cacheStats.maskBytes);assert(maskArt.cacheStats.bytes<maskArt.cacheStats.limitBytes,'32 MiB budget includes every persistent alpha mask');
maskArt.drawProp(ctx,gate,{canopyAlpha:.35,player:{x:gate.x,y:gate.y-19.8}});assert.equal(drawn.at(-1).alpha,.72,'transparent arch does not dim its towers');
assert.equal(maskArt.cacheStats.lastAppliedOpacity[gate.id],1,'record actual PNG opacity after checking transparent pixels');
maskArt.drawProp(ctx,gate,{canopyAlpha:.35,player:{x:gate.x-170,y:gate.y-19.8}});assert(Math.abs(drawn.at(-1).alpha-.72*.35)<1e-12,'an opaque column still fades when it covers the actual body');
assert.equal(maskArt.cacheStats.lastAppliedOpacity[gate.id],.35);assert(Object.values(maskArt.cacheStats.lastAppliedOpacity).every(Number.isFinite));
maskArt.drawProp(ctx,gate,{canopyAlpha:.35,player:{x:gate.x-170,y:gate.y-19.8},footY:gate.y-1000});assert.equal(maskArt.cacheStats.lastAppliedOpacity[gate.id],1,'explicit physical foot anchor controls the opacity sample');
for(const house of CITY_SAMPLE_HOUSES){maskArt.drawProp(ctx,house,{canopyAlpha:.35,player:{x:house.x,y:house.y-19.8}});assert.equal(maskArt.cacheStats.lastAppliedOpacity[house.id],.35,'opaque house roof retains body occlusion fading');}
for(let i=0;i<120;i++)maskArt.drawProp(ctx,gate,{canopyAlpha:.35,player:{x:gate.x+(i%2?0:-170),y:gate.y-19.8}});
await maskArt.preload();assert.equal(maskReads,maskCount,'warm renders never read canvas pixels');assert.equal(maskDraws,maskCount,'warm renders never rebuild a mask');assert.equal(maskArt.cacheStats.decodes,assetCount);assert.equal(ctx.globalAlpha,.72);
// No legacy sample selector may capture a current canonical foundation or
// its raised view. Full current collision/ownership checks live in coverage QA.
const {createRiftLayout}=await import('./dist/worlds/rift-layout.js');
const {createCityScenery}=await import('./dist/worlds/city-scenery.js');
const layout=createRiftLayout('clockshadow-city');assert.equal(layout.artStyle,'clockshadow-renewed');
for(const prop of createCityScenery(layout))assert.equal(cityDetailVisual(prop),null,`${prop.id}: the rebuilt city does not fall back to an old sample PNG`);
console.log('City detail artwork: native PNG hashes/sizes, Node-safe import, explicit load/decode failure and retry, exact nine-ID/world/footprint scope, true doorway/tower feet, complete unclipped house PNGs, exclusion from rebuilt world scenery, depth/context restoration, pixel-based fading, warm one-time masks and image+mask 32 MiB budget passed.');
