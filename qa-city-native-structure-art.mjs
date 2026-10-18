import assert from 'node:assert/strict';
import {createRiftLayout} from './dist/worlds/rift-layout.js';
import {RiftCollision} from './dist/rift-collision.js';
import {ClockshadowBuildingArt,clockshadowBuildingProjection} from './dist/clockshadow-building-art.js';
import {CITY_NATIVE_PRESERVED_IDS,createNativeCityProps,decorateNativeCityProp,createNativeCityBridgeProps,nativeCityVisual,CityNativeStructureArt,drawNativeCityBridge} from './dist/city-native-structure-art.js';

const layout=createRiftLayout('clockshadow-city'),before=JSON.stringify(layout.cityStructures),props=createNativeCityProps(layout),collision=new RiftCollision(layout),originals=new Map(layout.cityStructures.map(prop=>[prop.id,prop]));
assert.equal(props.length,originals.size,'every complete authored structure receives one complete illustration');
assert.equal(JSON.stringify(layout.cityStructures),before);assert(Object.isFrozen(props)&&props.every(prop=>Object.isFrozen(prop)&&Object.isFrozen(prop.cityArt)));
assert.deepEqual(createNativeCityProps({worldId:'forest',artTheme:'city'}),[]);assert.deepEqual(CITY_NATIVE_PRESERVED_IDS,[],'no old demonstration buildings remain separate');
const covered=props.flatMap(prop=>prop.canonicalIds);assert.equal(new Set(covered).size,originals.size);assert.equal(covered.length,originals.size);
let samples=0;
for(const prop of props){
  const source=originals.get(prop.sourceId);assert(source);for(const key of['x','y','width','depth','height'])assert.equal(prop[key],source[key]);assert.equal(prop.collision,false);assert.equal(prop.sortY,prop.y+prop.depth/2);
  if(source.solid!==false&&source.cityKind!=='gate')for(const dx of[-.47,0,.47])for(const dy of[-.47,0,.47]){assert(!collision.high.inside(prop.x+prop.width*dx,prop.y+prop.depth*dy),'grounded illustration keeps the authored solid footprint');samples++;}
  const v=nativeCityVisual(prop);for(const key of['halfWidth','top','bottom','shadowWidth','shadowLength','sortY'])assert(Number.isFinite(v[key]));
  assert.equal(v.maxBounds.minX,prop.x+prop.cityArt.bounds.minX);assert.equal(v.maxBounds.maxY,prop.y+prop.cityArt.bounds.maxY);assert.equal(v.sortY,prop.sortY);
}
assert(samples>100);assert(!props.some(prop=>prop.canonicalIds.length!==1),'no old coordinate/ID based building assembly');
// These are the actual main-layout dimensions which exposed the oversized
// roof, alongside a shallow infill house. Testing only infill hides the defect.
for(const [kind,width,depth,height,rearRole]of[
  ['house',220,145,92,'annex'],['house',190,250,88,'courtyard'],['warehouse',145,210,92,'courtyard'],
  ['workshop',220,145,100,'annex'],['keep',390,230,160,'courtyard'],['cathedral',390,240,175,'courtyard'],['house',190,94,125,null]
]){
  const prop={cityKind:kind,width,depth,height,x:100,y:200},plan=clockshadowBuildingProjection(prop);
  assert.equal(plan.parts.length,rearRole?2:1,`${kind} has one front house and at most one enclosed rear volume`);
  assert.equal(plan.backFoot,-depth/2);assert.equal(plan.frontFoot,depth/2);
  const roofs=plan.parts.filter(part=>part.role==='building');
  assert.equal(roofs.length,1,'deep foundations cannot become repeated full-width tiled roofs');
  const roof=roofs[0],grand=['keep','wing','barracks','cathedral'].includes(kind);
  assert(roof.side>0,'the front and side walls use an oblique depth projection');
  assert(roof.ridge<roof.front&&roof.backRidge<roof.back,'both ends of the convex roof ridge rise above their eaves');
  assert(Math.abs((roof.front-roof.ridge)-(roof.back-roof.backRidge))<1e-8,'the pitched ridge stays at one physical height along its depth');
  assert.equal(roof.width,width,'the main house keeps its authored width instead of shrinking the entire structure');
  assert.equal(roof.frontFoot,depth/2,'the front house and its door stay on the authored front edge');
  assert(roof.frontSpan>0&&roof.frontSpan<=roof.wall*1.25,'the forward roof slope remains comparable to its own facade');
  assert(roof.depth<=(grand?128:96),'one uninterrupted tiled roof has bounded depth');
  if(rearRole){
    assert.equal(plan.parts[0].role,rearRole);assert(plan.parts[0].height<=38,'the rear volume stays visibly lower than the front house');
    assert.equal(plan.parts[0].frontSpan,undefined,'the enclosed rear foundation does not receive another tiled slope');
    const tiledArea=roof.width*roof.depth;
    assert(tiledArea<=width*depth*(2/3),'tiles cover at most two thirds of these deep authored footprints');
    if(!grand&&depth>=200)assert(tiledArea<=width*depth*.5,'deep ordinary houses leave most of their foundation to the enclosed courtyard');
  }
  let edge=-depth/2,area=0;
  for(const part of plan.parts){
    assert(Math.abs(part.backFoot-edge)<1e-8,'adjacent volumes leave no invisible traversable gap or double footprint');edge=part.frontFoot;area+=part.width*part.depth;
  }
  assert(Math.abs(edge-depth/2)<1e-8,'the front door foot stays at the original depth queue');assert(Math.abs(area-width*depth)<1e-8,'visual subvolumes exactly cover the authored ground rectangle');
}
for(const prop of props){const plan=clockshadowBuildingProjection(prop);if(!plan)continue;const v=nativeCityVisual(prop);for(const part of plan.parts)assert(v.maxBounds.minY<=prop.y+part.offsetY+part.minY,'the real pitched roof participates in culling and attack-depth bounds');}

const detail={id:'street-lamp',variant:'city-native',region:'clockshadow-city',cityKind:'street-detail',cityArt:'lamp',x:40,y:50,width:24,depth:16,height:70,sortY:57,heightBand:'high',collision:false};
const decorated=decorateNativeCityProp(detail);assert.equal(decorated.id,detail.id);assert.equal(decorated.cityArt.sprite,'lamp');assert.equal(decorated.cityKind,'lamp');assert.equal(decorated.sortY,57);assert.equal(detail.cityArt,'lamp');assert.equal(decorateNativeCityProp(decorated),decorated);

// Recording canvases exercise every painter and state restoration. Masks are
// injected here; the browser smoke checks the actual artwork's pixel masks.
let pixelAlpha=255,paintCalls=0;
function makeContext({readFrequently=false}={}){const stack=[],c={globalAlpha:.72,save(){stack.push(this.globalAlpha);},restore(){assert(stack.length);this.globalAlpha=stack.pop();},getImageData(x,y,w,h){assert(readFrequently,'pixel readback is confined to the tiny CPU mask');const data=new Uint8ClampedArray(w*h*4);for(let i=3;i<data.length;i+=4)data[i]=pixelAlpha;return{data};}};return new Proxy(c,{get(o,key){return key in o?o[key]:(...args)=>{if(readFrequently&&key==='drawImage')assert.fail('CPU mask must rasterize geometry without reading a display canvas');paintCalls++;for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),`${String(key)} finite coordinate`);};}});}
const makeCanvas=()=>({width:0,height:0,getContext:(kind,options)=>makeContext({readFrequently:options?.willReadFrequently===true})}),painter=new ClockshadowBuildingArt({makeCanvas,limitBytes:2*1024*1024}),art=new CityNativeStructureArt({painter}),c=makeContext();
assert.equal(art.drawProp(c,{variant:'world-building'}),false);assert.equal(nativeCityVisual({...props[0],region:'forest'}),null);
for(const prop of props)art.drawProp(c,prop,{canopyAlpha:1});assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);assert(paintCalls>1000);assert.equal(c.globalAlpha,.72);
const sample=props.find(prop=>prop.cityKind==='house'),visual=nativeCityVisual(sample),player={x:sample.x,y:sample.y};
art.drawProp(c,sample,{canopyAlpha:.35,player,footY:sample.y});assert.equal(art.cacheStats.lastAppliedOpacity[sample.sourceId],.35);
const builds=painter.builds;for(let i=0;i<10;i++)art.drawProp(c,sample);assert.equal(painter.builds,builds,'warm rendering reuses stamps and pixel masks');
assert(visual.top>sample.depth/2,'the projected roof rises above the same back ground edge');pixelAlpha=0;painter.clear();art.drawProp(c,sample,{canopyAlpha:.35,player});assert.equal(art.cacheStats.lastAppliedOpacity[sample.sourceId],1,'transparent source pixels do not fade the entire structure');
const base=c.globalAlpha,throwing={globalAlpha:base,save(){this.saved=this.globalAlpha;},restore(){this.globalAlpha=this.saved;},drawImage(){throw new Error('draw failure');}};assert.throws(()=>painter.draw(throwing,sample),/draw failure/);assert.equal(throwing.globalAlpha,base);
const rails=createNativeCityBridgeProps(layout);assert(rails.length>0);for(const rail of rails){assert.equal(rail.collision,false);assert.equal(rail.heightBand,'low');assert.equal(rail.cityKind,'wall');assert.equal(Math.min(rail.width,rail.depth),12);assert.equal(rail.canonicalIds.length,0);art.drawProp(c,rail);}
assert.equal(drawNativeCityBridge(c,layout.passages.find(p=>p.kind==='bridge'),{painter}),true);assert.equal(drawNativeCityBridge(c,layout.passages.find(p=>p.kind==='bridge'),{overview:true,painter}),false);
console.log(JSON.stringify({cityNativeStructures:'passed',structures:props.length,footprintSamples:samples,rails:rails.length,cacheBytes:painter.cacheStats.bytes,coverage:'immutable complete footprints; no PNG or legacy ID assembly; all painters; cached alpha occlusion; warm reuse; memory cap; exception restoration; open bridges'}));
