import assert from 'node:assert/strict';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { RiftArt, RIFT_PALETTE, drawRiftOverview, drawRiftLandmark, drawRiftCaveExits, drawRiftCaveWall } from './dist/worlds/rift-art.js';
import { WorldLayoutArt, drawWorldLayoutMap } from './dist/worlds/world-layout-art.js';
import { WorldMap, landmarkState } from './dist/world-map.js';

function context(record=false){
  const values={globalAlpha:.72},stack=[],calls=[];
  const c=new Proxy(values,{get(target,key){if(key in target)return target[key];if(key==='save')return()=>stack.push({...target});if(key==='restore')return()=>{assert(stack.length,'balanced drawing context');const prior=stack.pop();for(const key of Object.keys(target))delete target[key];Object.assign(target,prior);};return(...args)=>{for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),`${String(key)} needs finite coordinates`);if(record)calls.push({key,args,style:target.fillStyle});};}});
  return {c,calls,stack};
}
const layout=createRiftLayout(),island={region:'forest',layout},before=JSON.stringify(layout),mapped=context(true);
assert(drawRiftOverview(mapped.c,layout,{scale:.1}));
for(const color of ['ground','forest','grass','water'])assert(mapped.calls.some(call=>call.style===RIFT_PALETTE[color]),`the map uses the authored ${color} palette`);
const vertices=new Set(mapped.calls.filter(call=>call.key==='moveTo'||call.key==='lineTo').map(call=>call.args.join(',')));
for(const boundary of layout.boundaries)for(const p of boundary.points)assert(vertices.has(`${p.x},${p.y}`),'mapped boundary uses the collision union exactly');
for(const p of layout.passages.filter(p=>p.kind==='bridge')){
  assert(mapped.calls.some(call=>call.key==='translate'&&call.args[0]===p.deck[0].x&&call.args[1]===p.deck[0].y),'wood starts at the authored bridge deck');
  assert(!mapped.calls.some(call=>call.key==='translate'&&call.args[0]===p.waypoints[0].x&&call.args[1]===p.waypoints[0].y),'the full approach corridor is not covered in wood');
}
assert(!mapped.calls.some(call=>call.key==='fillText'),'small previews and the minimap do not accumulate area labels');
const full=context(true);drawWorldLayoutMap(full.c,island,{scale:.1,labels:true});assert.equal(full.calls.filter(call=>call.key==='fillText').length,18,'expanded map names each authored area');
const canvases=[],factory=()=>{const canvas={width:0,height:0,getContext:()=>context().c};canvases.push(canvas);return canvas;},art=new RiftArt(factory),screen=context();
art.drawGround(screen.c,island,{camX:layout.spawn.x,camY:layout.spawn.y,width:540,height:985});const builds=art.cacheStats.builds;
for(let frame=0;frame<60;frame++)art.drawGround(screen.c,island,{camX:layout.spawn.x+frame*.01,camY:layout.spawn.y,width:540,height:985});
assert.equal(art.cacheStats.builds,builds,'warm phone frames reuse bounded world tiles');
for(let i=0;i<100;i++)art.drawGround(screen.c,island,{camX:-3300+i*67,camY:Math.sin(i*.4)*2300,width:540,height:985});
assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'exploration evicts distant tiles');assert(canvases.every(canvas=>canvas.width<=388&&canvas.height<=388),'no full-world bitmap is retained');
const integration=new WorldLayoutArt(factory);integration.drawGround(screen.c,island,{width:540,height:985});assert(integration.cacheStats.bytes>0,'shared art diagnostics account for rift tiles');
const gate=layout.passages.find(p=>p.gateId)?.gate;
if(gate){const closed=context(true),open=context(true),site={kind:'shortcut',...gate,halfLength:Math.hypot(gate.bx-gate.ax,gate.by-gate.ay)/2,angle:Math.atan2(gate.by-gate.ay,gate.bx-gate.ax)};drawRiftLandmark(closed.c,site);drawRiftLandmark(open.c,{...site,open:true});assert(closed.calls.length>open.calls.length,'opened shortcut removes the cross-gate planks');}
for(const kind of ['cave','exit'])assert(drawRiftLandmark(screen.c,{kind,x:10,y:20}));
drawRiftCaveExits(screen.c,{riftExits:[{x:0,y:0,name:'返回林间洞口'},{x:200,y:-180,name:'前往北境林地'}]});
for(const angle of [0,Math.PI/2])drawRiftCaveWall(screen.c,{x:0,y:0,r:14,halfLength:90,angle});
assert.equal(screen.stack.length,0);assert.equal(mapped.stack.length,0);assert.equal(screen.c.globalAlpha,.72);assert.equal(JSON.stringify(layout),before,'all map and terrain drawing is read-only');
const map=new WorldMap(),markers=map.getMarkers({player:{x:0,y:0},regions:{portals:[{id:'north',x:0,y:0,natural:true,discovered:true,state:'active',nextRegion:{name:'薄雾沼泽'}}]}});
assert.equal(markers[0].type,'exit');assert.equal(landmarkState(markers[0]),'前往薄雾沼泽 · 可往返');assert.equal(landmarkState({type:'exit'}),'走入出口返回荒野','indoor exit guidance retains its meaning');
console.log('Rift art: exact shared boundaries, sketch palette, three separate bridge decks, eighteen labels, warm/capped tile memory, dynamic gates and cave art passed.');
