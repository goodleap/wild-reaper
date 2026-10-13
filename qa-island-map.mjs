import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { WorldMap, WORLD_MAP_RULES, landmarkLabel, landmarkState } from './dist/world-map.js';

const game=(region='forest')=>({status:'playing',paused:false,player:{x:0,y:-19.8,facing:0},viewWidth:1100,viewHeight:700,terrain:{island:new Island({region,seed:29})},region:{id:region},settlements:{sites:[]},relicSites:{sites:[]},regions:{portals:[]},dungeon:{active:null}});
const map=new WorldMap(),g=game(),island=g.terrain.island;
const calls=[],stack=[],ctx=new Proxy({globalAlpha:1},{get(t,k){if(k==='save')return()=>stack.push(1);if(k==='restore')return()=>stack.pop();return t[k]??((...args)=>calls.push([k,...args]));},set(t,k,v){t[k]=v;return true;}});
const blank=map.draw(ctx,g,{width:420,height:420,expanded:true});assert.equal(blank.explored,0);assert.equal(island.explored,undefined,'rendering a virgin island never discovers terrain');
assert.equal(calls.filter(c=>c[0]==='rect').length,0,'no geographical detail escapes an empty exploration clip');assert.equal(stack.length,0);
map.discover(g);assert(island.explored instanceof Set);const first=[...island.explored];assert(first.length>0);const cell=WORLD_MAP_RULES.explorationCell;
for(const key of first){const [gx,gy]=key.split(',').map(Number),x=(gx+.5)*cell,y=(gy+.5)*cell;assert(Math.hypot(x,y)<=WORLD_MAP_RULES.discoveryRadius);}
for(const status of ['upgrade','super','shop','dead']){g.status=status;g.player.x=2000;map.discover(g);assert.deepEqual([...island.explored],first);}
g.status='playing';g.paused=true;map.discover(g);assert.deepEqual([...island.explored],first);g.paused=false;g.dungeon.active={kind:'castle'};map.discover(g);assert.deepEqual([...island.explored],first);g.dungeon.active=null;
// Entire-world framing never recenters on the traveler. Local map still does.
map.discover(g);const full=map.draw(ctx,g,{width:420,height:420,expanded:true}),near=map.draw(ctx,g,{width:128,height:128});
assert(full.player.x>full.center.x+50);assert(Math.abs(near.player.x-near.center.x)<1e-7);assert(full.explored>blank.explored);assert(full.scale<near.scale);
const frozen=[...island.explored];map.draw(ctx,g,{width:420,height:420,expanded:true});assert.deepEqual([...island.explored],frozen);
// Expanded and local marker lists use exactly the same discovered flags, but
// a recorded distant gate is retained in the full map and includes its target.
g.regions.portals=[{id:'far',x:-2000,y:0,state:'active',discovered:true,nextRegion:{name:'迷雾沼泽'}},{id:'secret',x:2001,y:1,state:'locked',discovered:false,nextRegion:{name:'失落遗迹'}}];
assert.equal(map.draw(ctx,g,{width:128,height:128}).markers.length,0);
const portals=map.draw(ctx,g,{width:420,height:420,expanded:true}).markers;assert.deepEqual(portals.map(p=>p.id),['far']);assert.equal(landmarkLabel(portals[0]),'通往迷雾沼泽');
const other=game('marsh');assert.equal(map.draw(ctx,other,{width:420,height:420,expanded:true}).explored,0);assert.equal(other.terrain.island.explored,undefined);map.discover(other);assert.notEqual(other.terrain.island.explored,island.explored);assert.deepEqual([...island.explored],frozen,'exploring a second island cannot overwrite the first one');
// Narrow phones only reveal whole visible cells; their side borders cannot
// uncover coastline 340 units away just because discovery is circular.
const phone=game();phone.viewWidth=320;map.discover(phone);for(const key of phone.terrain.island.explored){const [gx]=key.split(',').map(Number);assert(Math.abs((gx+.5)*cell)<=110);}
assert.equal(stack.length,0);
console.log('Island map: world-owned exploration, hidden unknown coasts, full-island framing, correct traveler position, distant discovered gate targets and phone visibility passed.');
// A fully explored island must not construct thousands of overlapping clip
// subpaths: that makes native Canvas path rasterization stall for seconds.
const surveyed=game();surveyed.terrain.island.explored=new Set();for(let y=-52;y<=52;y++)for(let x=-52;x<=52;x++)surveyed.terrain.island.explored.add(`${x},${y}`);
calls.length=0;map.draw(ctx,surveyed,{width:420,height:420,expanded:true});assert.equal(calls.filter(c=>c[0]==='rect').length,105,'11,025 cells merge into 105 exact row runs');
const cached=map._mapRuns(surveyed.terrain.island,{expanded:true});assert.equal(map._mapRuns(surveyed.terrain.island,{expanded:true}),cached,'unchanged exploration reuses its merged clip');
surveyed.terrain.island.explored[Symbol.iterator]=()=>{throw new Error('minimap may not scan all explored cells');};calls.length=0;map.draw(ctx,surveyed,{width:128,height:128});assert(calls.filter(c=>c[0]==='rect').length<30,'local clip complexity stays bounded by the nearby viewport');
console.log('Island map performance: 11,025-cell complete map merges to 105 cached non-overlapping rows; minimap never traverses world-wide discovery.');

// Gate companions share a full-map entry only after both are discovered.
// The independent spawn angel and all local-map markers retain their identity.
const guarded=game();guarded.regions.portals=[{id:'gate',x:300,y:0,state:'active',discovered:true,nextRegion:{name:'迷雾沼泽'}}];guarded.settlements.sites=[{id:'angel:gate',type:'angel',anchorId:'gate',x:385,y:0,discovered:true},{id:'angel:spawn',type:'angel',anchorId:'spawn:0',x:0,y:80,discovered:true}];
let grouped=map.draw(ctx,guarded,{width:420,height:420,expanded:true}).markers;assert.deepEqual(grouped.map(m=>m.id),['angel:spawn','gate']);assert(landmarkState(grouped[1]).includes('天使守护'));assert.equal(map.draw(ctx,guarded,{width:128,height:128}).markers.length,3);
guarded.settlements.sites[0].discovered=false;grouped=map.draw(ctx,guarded,{width:420,height:420,expanded:true}).markers;assert(!landmarkState(grouped.find(m=>m.id==='gate')).includes('天使'),'an unseen guardian cannot leak into the gate description');
guarded.settlements.sites[0].discovered=true;guarded.regions.portals[0].discovered=false;grouped=map.draw(ctx,guarded,{width:420,height:420,expanded:true}).markers;assert.deepEqual(grouped.map(m=>m.id),['angel:gate','angel:spawn'],'seeing a guardian alone cannot reveal its unknown portal');
console.log('Full map gate markers: discovered guardians merge with their exact portal, spawn angels stay separate, local icons stay unchanged and hidden sites do not leak.');

// Unknown debug landmarks sit over the existing fog; neither map size traces
// new explored cells or generates new terrain merely to expose their markers.
const debug=game();debug.debug=true;debug.debugFull=true;
debug.regions.portals=[{id:'debug-near',x:300,y:0,state:'locked',discovered:false},{id:'debug-far',x:2000,y:0,state:'locked',discovered:false}];
debug.settlements.sites=[{id:'debug-castle',type:'castle',x:-2200,y:0,state:'ready',discovered:false}];
calls.length=0;const debugLocal=map.draw(ctx,debug,{width:128,height:128});
assert.deepEqual(debugLocal.markers.map(marker=>marker.id),['debug-near']);
assert.equal(calls.filter(call=>call[0]==='rect').length,0,'debug minimap retains the empty exploration clip');
calls.length=0;const debugFull=map.draw(ctx,debug,{width:420,height:420,expanded:true});
assert.deepEqual(debugFull.markers.map(marker=>marker.id),['debug-castle','debug-near','debug-far']);
assert.equal(calls.filter(call=>call[0]==='rect').length,0,'debug full map retains the empty exploration clip');
assert.equal(debugFull.explored,0);assert.equal(debug.terrain.island.explored,undefined);
assert(debug.regions.portals.every(portal=>portal.discovered===false));assert.equal(debug.settlements.sites[0].discovered,false);
debug.debug=false;assert.equal(map.draw(ctx,debug,{width:420,height:420,expanded:true}).markers.length,0);
assert.equal(stack.length,0);
console.log('Debug island map: full and nearby landmark visibility keeps unknown terrain opaque and normal maps unchanged.');
