import assert from 'node:assert/strict';
import { WorldMap, WORLD_MAP_RULES, minimapBounds, landmarkLabel, landmarkState } from './dist/world-map.js';

const map=new WorldMap();
const site=(id,type,x,y=0,extra={})=>({id,type,x,y,state:'ready',discovered:false,...extra});
const game=()=>({status:'playing',viewWidth:1100,viewHeight:650,player:{x:0,y:-19.8,facing:0},settlements:{sites:[]},relicSites:{sites:[]},regions:{portals:[]},dungeon:{active:null}});
const g=game(),house=site('house','supply',200),hidden=site('hidden','castle',500),merchant=site('merchant','merchant',40);
g.settlements.sites=[house,hidden,merchant];
g.relicSites.sites=[site('hunt','hunt',300),site('rescue','rescue',-300),site('rune','rune',0,250)];
g.regions.portals=[site('gate','portal',310,0,{state:'locked'})];
assert.deepEqual(map.getMarkers(g),[],'unvisited buildings are hidden, even within map range');
assert.equal(map.discover(g),5);assert(house.discovered);assert(!hidden.discovered);assert(!merchant.discovered);
assert.equal(map.discover(g),0,'discovery is idempotent');
assert.equal(map.getMarkers(g).length,5);assert.equal(map.getMarkers(g).find(m=>m.id==='gate').active,false);
g.regions.portals[0].state='active';assert(map.getMarkers(g).at(-1).active,'an activated gate is visually prioritized');
house.state='spent';assert(map.getMarkers(g).find(m=>m.id==='house').completed,'retained completed buildings are marked as cleared');

// Discovery must respect a narrow phone viewport as well as walking distance.
const phone=game();phone.viewWidth=320;phone.viewHeight=650;
phone.settlements.sites=[site('left','supply',-161),site('right','supply',159),site('above','castle',0,-347),site('far','castle',0,341)];
assert.equal(map.discover(phone),1);assert(phone.settlements.sites[1].discovered);
phone.player.x=-25;assert.equal(map.discover(phone),1);assert(phone.settlements.sites[0].discovered);

const stopped=game();stopped.settlements.sites=[site('unseen','castle',80)];
for(const state of ['upgrade','super','shop','dead']){stopped.status=state;assert.equal(map.discover(stopped),0);}
stopped.status='playing';stopped.paused=true;assert.equal(map.discover(stopped),0);stopped.paused=false;
stopped.dungeon.active={};assert.equal(map.discover(stopped),0);assert.deepEqual(map.getMarkers(stopped),[]);
stopped.dungeon.active=null;assert.equal(map.discover(stopped),1);

// Markers do not get clamped to the frame edge or leak between region objects.
const known=game(),near=site('near','castle',WORLD_MAP_RULES.range,0,{discovered:true}),far=site('far','castle',WORLD_MAP_RULES.range+1,0,{discovered:true});
known.settlements.sites=[near,far];assert.deepEqual(map.getMarkers(known).map(m=>m.id),['near']);
known.player.x=400;assert.equal(map.getMarkers(known).length,2);
const saved=known.settlements;known.settlements={sites:[site('new-region','castle',40)]};assert.equal(map.getMarkers(known).length,0);
known.settlements=saved;assert.equal(map.getMarkers(known).length,2,'returning to a saved region retains its discovery');

// Drawing is read-only, balanced, and works without a DOM/offscreen canvas.
let balance=0,draws=0;
const ctx=new Proxy({}, {get(_target,key){if(key==='save')return ()=>balance++;if(key==='restore')return ()=>balance--;return ()=>draws++;},set(){return true;}});
const drawing=game();drawing.settlements.sites=[site('not-yet-seen','castle',100)];
const result=map.draw(ctx,drawing,{x:10,y:20,width:150,height:178});
assert.equal(result.markers.length,0);assert(!drawing.settlements.sites[0].discovered,'rendering cannot reveal an unseen building');
assert.equal(balance,0);assert(draws>0);
map.discover(drawing);assert.equal(map.draw(ctx,drawing).markers.length,1);assert.equal(balance,0);
drawing.dungeon.active={};const before=draws;assert.equal(map.draw(ctx,drawing),null);assert.equal(draws,before,'the existing castle map owns its own UI');
console.log('World map: bounded on-screen discovery, persistent landmarks, region isolation, gate states and read-only drawing passed.');

// Both world and castle HUDs share compact square bounds close to the top edge.
for(const [width,height,size] of [[1100,700,128],[393,717,104],[760,360,104],[320,568,104]]){
  const bounds=minimapBounds(width,height);assert.equal(bounds.width,size);assert.equal(bounds.height,size);
  assert.equal(bounds.x+bounds.width,width-bounds.margin);assert.equal(bounds.y,bounds.margin);assert(bounds.y<=16);
}
assert.equal(landmarkLabel({type:'hunt'}),'狩猎擂台');assert(landmarkState({type:'portal',active:true}).includes('可往返'));
const texts=[];const textCtx=new Proxy(ctx,{get(target,key){if(key==='fillText'||key==='strokeText')return value=>texts.push(value);return target[key];}});
drawing.dungeon.active=null;const compact=map.draw(textCtx,drawing,{width:104,height:104});
assert.deepEqual(texts,['N'],'the compact map devotes its entire panel to the map, with no title/footer text');
assert.equal(compact.center.x,52);assert.equal(compact.center.y,52);assert(compact.radius>=39);
texts.length=0;const expanded=map.draw(textCtx,drawing,{width:420,height:420,expanded:true});
assert.equal(expanded.markers.length,1);assert(texts.includes('1'),'expanded markers are numbered for their matching named list');
assert.equal(balance,0);
