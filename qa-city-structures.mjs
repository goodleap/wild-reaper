import assert from 'node:assert/strict';
import {CityStructureArt,cityStructureVisual,drawCityBridge,drawCityLandmark} from './dist/city-structure-art.js';

const operations=[],canvases=[];
function context(){
  const stack=[],state={globalAlpha:.73};
  return new Proxy(state,{get(o,k){
    if(k in o)return o[k];
    if(k==='save')return()=>stack.push(o.globalAlpha);
    if(k==='restore')return()=>{assert(stack.length,'canvas state is balanced');o.globalAlpha=stack.pop();};
    if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});
    return(...args)=>{for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),`${String(k)} argument finite`);operations.push({method:k,args,alpha:o.globalAlpha});};
  }});
}
const makeCanvas=()=>{const canvas={width:0,height:0,getContext:()=>context()};canvases.push(canvas);return canvas;};
const art=new CityStructureArt(makeCanvas),c=context();
const kinds=['house','keep','wing','barracks','warehouse','stable','workshop','cathedral','church','school','belltower','wall','tower','gatepost','arcade','gate','statue','fountain','market','cart','lamp','banner','planter','ruin','sewer'];
const props=kinds.map((cityKind,i)=>({variant:'city-structure',cityKind,x:33+i*10,y:-42,width:['wall','arcade','gate'].includes(cityKind)?300:cityKind==='keep'?350:84,depth:cityKind==='wall'?40:cityKind==='keep'?200:64,height:cityKind==='keep'?130:70,style:i%6}));
assert.equal(art.drawProp(c,{variant:'world-building',cityKind:'house'}),false,'legacy props retain their own renderer');
assert.equal(art.drawProp(c,{variant:'city-structure',cityKind:'unknown'}),false,'unknown structure types are not silently drawn as a house');
for(const p of props){
  assert(art.drawProp(c,p));
  const v=cityStructureVisual(p);
  assert.equal(v.sortY,p.y+p.depth/2,'depth anchor is the real footprint front edge');
  assert.equal(v.maxBounds.minX,p.x-v.halfWidth);assert.equal(v.maxBounds.minY,p.y-v.top);assert.equal(v.maxBounds.maxY,p.y+v.bottom);
  assert(v.maxBounds.minY<=p.y-p.depth/2-p.height,'raised roof fits culling bounds');
  assert(v.canopy.rx>=p.width/2&&v.canopy.ry>=p.depth/2,'roof fading includes the actual large building');
  for(const key of['halfWidth','top','bottom','canopyX','canopyY','canopyRx','canopyRy','shadowWidth','shadowLength','shadowOffset'])assert(Number.isFinite(v[key]),`${key} matches Terrain visual interface`);
}
const warmed=art.cacheStats.builds;
for(let frame=0;frame<12;frame++)for(const p of props)art.drawProp(c,{...p,x:p.x+frame*20,y:p.y-frame*7},{canopyAlpha:.37});
assert.equal(art.cacheStats.builds,warmed,'world position and fading never rebuild static stamps');
assert.equal(c.globalAlpha,.73,'caller alpha is restored');
assert(Math.abs(operations.filter(v=>v.method==='drawImage').at(-1).alpha-.73*.37)<1e-12,'body and roof use the caller canopy fade');
for(const p of props){const before=art.cacheStats.builds;art.drawProp(c,{...p,style:(p.style||0)+6});assert.equal(art.cacheStats.builds,before,'visual variation is finite');}
for(const style of['keep-nw','keep-ne','keep-sw','keep-se'])art.drawProp(c,{variant:'city-structure',cityKind:'keep',x:0,y:0,width:350,depth:200,height:130,style});
const castleWarm=art.cacheStats.builds;
for(let i=0;i<5;i++)for(const style of['keep-nw','keep-ne','keep-sw','keep-se'])art.drawProp(c,{variant:'city-structure',cityKind:'keep',x:700,y:400,width:350,depth:200,height:130,style});
assert.equal(art.cacheStats.builds,castleWarm,'four pieces of a continuous keep reuse fixed stamps');
for(let i=0;i<130;i++){
  art.drawProp(c,{variant:'city-structure',cityKind:kinds[i%kinds.length],x:i*500,y:10,width:240+(i%5)*20,depth:160+(i%3)*40,height:60+(i%8)*10,style:i%6});
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'exploration cannot exceed the shared 24 MiB limit');
}
assert(canvases.every(v=>v.width<=900&&v.height<=900),'authored modules do not allocate full-castle or world-sized canvases');
assert(drawCityBridge(c,{width:140,deck:[{x:0,y:0},{x:340,y:0}],points:[{x:0,y:-70},{x:340,y:-70},{x:340,y:70},{x:0,y:70}]}));
assert(drawCityBridge(c,{width:140,waypoints:[[0,0],[340,0]]},{overview:true}));
assert.equal(drawCityBridge(c,{waypoints:[]}),false);
for(const site of[{kind:'cave'},{kind:'shortcut'},{kind:'shortcut',opened:true},{kind:'shortcut',state:'cleared'},{kind:'exit'},{featureId:'sewer'}])assert(drawCityLandmark(c,{x:20,y:30,...site}));
function gateOps(site){operations.length=0;drawCityLandmark(c,{kind:'shortcut',x:0,y:0,halfLength:90,...site});return operations.slice();}
const closedOps=gateOps({open:false});
for(const open of[{open:true},{gateOpen:true},{opened:true},{state:'cleared'}])assert(gateOps(open).length<closedOps.length,'actual runtime open fields remove portcullis bars');
const narrow=gateOps({width:80}),wide=gateOps({width:240});
assert(wide.length>narrow.length,'metalwork spans the specified real gate width');
const vertical=gateOps({angle:Math.PI/2,halfLength:150});
assert(vertical.some(v=>v.method==='moveTo'&&Math.abs(v.args[0])<1e-6&&Math.abs(v.args[1]+198)<1e-6),'vertical bars use the real gate axis with northward height');
assert(vertical.some(v=>v.method==='lineTo'&&Math.abs(v.args[0])<1e-6&&Math.abs(v.args[1]-153)<1e-6),'far vertical endpoint retains the actual 300 unit span');
assert.equal(drawCityLandmark(c,{kind:'fountain',x:0,y:0}),false,'unrelated site art remains routed to its existing renderer');
assert.equal(c.globalAlpha,.73);art.clear();assert.equal(art.cacheStats.bytes,0);
console.log('City structures: 25 shared module kinds, continuous four-part keep, real footprint/depth bounds, static cache reuse, finite variations, alpha/state restoration, bridges/gate/sewer states and 24 MiB LRU passed.');
