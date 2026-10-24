import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { CLOCK_BRIDGE } from './dist/quest-definitions.js';
import { QUEST_STORAGE_KEY } from './dist/quest-store.js';
import { portalDoor } from './dist/portal-geometry.js';
import { WORLD_IDS } from './dist/world-definitions.js';
import { harness } from './qa-app-harness.mjs';

const memory=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))};};
const fresh=(worldId='clockshadow-city',storage=null,extra={})=>{
  const g=new Game({mode:'world',worldId,questStorage:storage,environment:false,...extra});
  g.player.invuln=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;g._spawn=g.nextBossAt=Infinity;
  g.quests.update();
  return g;
};
const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const put=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);g.regionGrace=0;g.dungeon.update(0);};
const entry=(g,id)=>g.quests.getEntries().find(item=>item.id===id);
const done=(g,id,objective)=>entry(g,id)?.objectives.find(item=>item.id===objective)?.done===true;
const finish=g=>{for(let i=0;i<30&&g.sceneTransition.active;i++)g.sceneTransition.update(.05);assert.equal(g.sceneTransition.active,false);};
const request=(g,id)=>{assert(g.requestInteraction(id),`interaction ${id} must use the shipped entry point`);finish(g);};
const approach=(g,site)=>put(g,site.door||site);
const bridgeBlocked=g=>!!g.terrain.firstBlocker(CLOCK_BRIDGE.x-75,CLOCK_BRIDGE.y,CLOCK_BRIDGE.x+75,CLOCK_BRIDGE.y,g.player.r);
function walk(g,to){
  for(let count=0;count<4000;count++){
    const from=feet(g),dx=to.x-from.x,dy=to.y-from.y,d=Math.hypot(dx,dy);if(d<.1)return;
    const step=Math.min(12,d);g._moveEntity(g.player,dx/d*step,dy/d*step,true);g.dungeon.update(0);
    assert(Math.hypot(feet(g).x-from.x,feet(g).y-from.y)>.01,'an actual movement segment cannot stall against a wall');
  }
  assert.fail('finite room crossing did not arrive');
}
function walkRooms(g,to){
  const state=g.dungeon.active,from=g.dungeon._cellAt(feet(g).x,feet(g).y,state),target=g.dungeon._cellAt(to.x,to.y,state);
  assert(from&&target);const queue=[from],parent=new Map([[from.id,null]]);
  for(let i=0;i<queue.length&&!parent.has(target.id);i++)for(const next of g.dungeon._neighbors(queue[i],state))if(!parent.has(next.id)){parent.set(next.id,queue[i].id);queue.push(next);}
  assert(parent.has(target.id),'the objective must belong to the same connected maze');
  const path=[];for(let id=target.id;id!==null;id=parent.get(id))path.unshift(state.cells[id]);
  for(const cell of path)walk(g,cell);walk(g,to);
  return path.length;
}
function claimChest(g,chest,{guarded=true}={}){
  const state=g.dungeon.active;put(g,chest);
  if(guarded){const blocked=g.getInteraction();assert.equal(blocked.id,chest.id);assert.equal(blocked.enabled,false);assert.equal(g.requestInteraction(chest.id),false,'quest materials cannot bypass the room guards');}
  for(const enemy of g.enemies)if(enemy.dungeonId===state.id&&enemy.dungeonRoom===chest.cellId)enemy.hp=0;
  g.dungeon.update(0);request(g,chest.id);assert.equal(chest.state,'claimed');
}
function leave(g,exit=g.dungeon.active.entrance){put(g,exit);request(g,g.getInteraction().id);assert.equal(g.dungeon.active,null);}
function collectGear(g){
  const site=g.settlements.sites.find(item=>item.type==='occupied');assert(site);approach(g,site);request(g,site.id);
  const state=g.dungeon.active;assert.equal(state.kind,'hut');claimChest(g,state.chests[0]);leave(g);
  assert(done(g,'clock-bridge','gear'));
}
function collectChain(g){
  const site=g.riftExploration.sites.find(item=>item.caveId==='city-cellar');assert(site);approach(g,site);request(g,site.id);
  const state=g.dungeon.active,chain=state.chests.find(chest=>g.quests.chestLabel(state,chest)==='取回牵引链');assert(chain);
  const other=state.chests.find(chest=>chest!==chain);assert(other);
  claimChest(g,other);assert(!done(g,'clock-bridge','chain'),'ordinary cellar treasure cannot stand in for the marked chain');
  const guide=g.quests.getGuide();assert(guide?.complete,'underground guidance must reach the actual marked chest');
  assert(Math.hypot(guide.target.x-chain.x,guide.target.y-chain.y)<1);
  assert(walkRooms(g,chain)>1,'finding the chain crosses real connected rooms');claimChest(g,chain);assert(done(g,'clock-bridge','chain'));leave(g,state.riftExits[0]);
}

// Use real guarded chest and scene-transition paths. Surface teleports isolate
// these interactions; the underground traversal below uses actual body movement.
const storage=memory(),city=fresh('clockshadow-city',storage),staleCity=fresh('clockshadow-city',storage);
assert.equal(entry(city,'clock-bridge').status,'available');assert(bridgeBlocked(city));
const board=city.quests.board;assert(board);approach(city,board);
assert(city.touchInteractions.update(),'touching the board opens its available commission');
assert.equal(city.events.filter(event=>event.type==='questBoardOpen').length,1);
assert.equal(entry(city,'clock-bridge').status,'available');assert.equal(city.quests.getTracker(),null);
assert(!city.events.some(event=>event.type==='questAccepted'),'board contact never accepts a commission');
assert.equal(city.touchInteractions.update(),false,'closing the panel on the same contact does not immediately reopen it');
const supply=city.settlements.sites.find(site=>site.type==='supply'&&!site.worldFacility);assert(supply);approach(city,supply);request(city,supply.id);
claimChest(city,city.dungeon.active.chests[0],{guarded:false});leave(city);
assert.equal(entry(city,'clock-bridge').status,'available','unrelated supplies do not accept or advance a quest');
assert(entry(city,'clock-bridge').objectives.every(item=>!item.done));
collectGear(city);assert.equal(entry(city,'clock-bridge').status,'available','finding a real quest item records its fact without accepting the commission');
assert.equal(city.quests.getTracker(),null);assert.equal(city.quests.getGuide(),null);assert.deepEqual(city.quests.getMarkers(),[]);
assert(city.quests.accept('clock-bridge'));assert.equal(entry(city,'clock-bridge').status,'active');assert(done(city,'clock-bridge','gear'),'acceptance retains the previously claimed material');
assert(bridgeBlocked(city));collectChain(city);assert(bridgeBlocked(city),'possessing both items does not silently remove the bridge shutter');
put(city,CLOCK_BRIDGE.approach);const before={gold:city.gold,crystals:city.crystals};request(city,'quest:clock-bridge:winch');
assert.equal(entry(city,'clock-bridge').status,'completed');assert(!bridgeBlocked(city),'the visible opened shutter also opens physical movement');
assert.equal(city.gold-before.gold,40);assert.equal(city.crystals-before.crystals,30);
assert.equal(city.requestInteraction('quest:clock-bridge:winch'),false);assert.equal(city.gold,before.gold+40);
walk(city,{x:CLOCK_BRIDGE.x-75,y:CLOCK_BRIDGE.y});walk(city,{x:CLOCK_BRIDGE.x+75,y:CLOCK_BRIDGE.y});
assert(storage.data.has(QUEST_STORAGE_KEY));
const reload=fresh('clockshadow-city',storage);assert.equal(entry(reload,'clock-bridge').status,'completed');assert(!bridgeBlocked(reload));assert.equal(reload.gold,0,'restarting restores the route without granting its reward again');
// A previously open tab may learn the other tab's completion on any objective
// write. Its collision must catch up with its now-completed journal and art.
collectGear(staleCity);assert.equal(entry(staleCity,'clock-bridge').status,'completed');assert(!bridgeBlocked(staleCity));
const saved=storage.getItem(QUEST_STORAGE_KEY),debug=fresh('clockshadow-city',storage,{debug:true});assert(bridgeBlocked(debug));
assert.equal(entry(debug,'clock-bridge').status,'available');collectGear(debug);assert.equal(storage.getItem(QUEST_STORAGE_KEY),saved,'debug cannot overwrite formal progress');

const forest=fresh('rift-forest',storage),cave05=forest.riftExploration.sites.find(site=>site.key==='cave05'),cave15=forest.riftExploration.sites.find(site=>site.key==='cave15');
assert(cave05&&cave15);approach(forest,cave05);request(forest,cave05.id);
let cave=forest.dungeon.active;const same=cave.riftExits.find(exit=>exit.key==='cave05');leave(forest,same);
assert(!done(forest,'underground-return','crossing'),'entering and backing out the same mouth is not a crossing');
assert.equal(entry(forest,'underground-return').status,'available');assert.equal(forest.quests.getGuide(),null);
approach(forest,cave05);request(forest,cave05.id);cave=forest.dungeon.active;
const opposite=cave.riftExits.find(exit=>exit.key==='cave15'),guide=forest.quests.getGuide();
assert.equal(guide,null,'independent exploration never enables quest guidance');
assert(walkRooms(forest,opposite)>=5);request(forest,opposite.id);assert(done(forest,'underground-return','crossing'));
assert(Math.hypot(feet(forest).x-cave15.x,feet(forest).y-cave15.y)<150);
const gate=forest.riftExploration.sites.find(site=>site.gateId==='bell-shortcut'),north=forest.riftExploration._gateApproach(gate),dx=north.x-gate.x,dy=north.y-gate.y;
put(forest,{x:gate.x-dx,y:gate.y-dy});assert.equal(forest.requestInteraction(gate.id),false,'the shortcut still has a real locked side');
put(forest,north);const forestGold=forest.gold,forestCrystals=forest.crystals;request(forest,gate.id);
assert.equal(entry(forest,'underground-return').status,'available');assert(forest.terrain.riftGateOpen('bell-shortcut'));
assert(entry(forest,'underground-return').objectives.every(objective=>objective.done),'all one-time exploration facts persist before acceptance');
assert.equal(forest.gold,forestGold);assert.equal(forest.crystals,forestCrystals,'an unaccepted commission never grants its reward');
const factsReload=fresh('rift-forest',storage);assert.equal(entry(factsReload,'underground-return').status,'available');assert(factsReload.terrain.riftGateOpen('bell-shortcut'));
assert.equal(factsReload.quests.getTracker(),null);assert.equal(factsReload.quests.getGuide(),null);assert.deepEqual(factsReload.quests.getMarkers(),[]);
assert(forest.quests.accept('underground-return'));assert.equal(entry(forest,'underground-return').status,'completed');
assert.equal(forest.gold,forestGold+30);assert.equal(forest.crystals,forestCrystals+20);
assert.equal(forest.quests.accept('underground-return'),false);assert.equal(forest.gold,forestGold+30,'acceptance pays previously completed facts only once');
assert.equal(factsReload.quests.accept('underground-return'),false,'a stale tab learns the other tab already accepted and claimed');assert.equal(factsReload.gold,0);
const out=forest.regions.portals.find(portal=>portal.nextRegionIndex===1);assert(out);approach(forest,portalDoor(out));request(forest,out.id);
assert.equal(forest.worldId,'marsh');assert.equal(forest.quests.getEntries().length,0);assert.equal(forest.quests.getProps().length,0);assert.equal(forest.quests.getGuide(),null);
const back=forest.regions.portals.find(portal=>portal.nextRegionIndex===WORLD_IDS.indexOf('rift-forest'));approach(forest,portalDoor(back));request(forest,back.id);
assert.equal(forest.worldId,'rift-forest');assert(forest.terrain.riftGateOpen('bell-shortcut'));assert.equal(entry(forest,'underground-return').status,'completed');
const reopenedForest=fresh('rift-forest',storage);assert(reopenedForest.terrain.riftGateOpen('bell-shortcut'));assert.equal(entry(reopenedForest,'underground-return').status,'completed');
for(const options of [{mode:'story'},{mode:'dungeon',dungeonId:'survival'}]){
  const game=new Game({...options,questStorage:storage});assert.equal(game.quests.getEntries().length,0);assert.equal(game.quests.getProps().length,0);assert.equal(game.quests.getGuide(),null);
}

// Real app handlers: journal uses the existing map pause and input ownership.
// The harness counts draws rather than claiming device/browser rendering FPS.
const h=harness('?debug'),node=id=>h.document.getElementById(id);
function click(id){const target=node(id);h.listeners['document:pointerdown']?.({target,pointerType:'mouse'});target.focus();h.fire(target,'click',{detail:1});h.run(`focusNavigation.settlePointerAction({target:$(${JSON.stringify(id)}),detail:1});`);}
function questAction(action){
  const target=node('quest-journal-list').querySelector(`[data-quest-action="${action}"]`);assert(target);
  h.listeners['document:pointerdown']?.({target,pointerType:'mouse'});target.focus();h.fire(node('quest-journal-list'),'click',{target,detail:1});
  h.run('focusNavigation.settlePointerAction({target:$("quest-journal-list"),detail:1});');
}
click('start-button');click('prepare-start-button');await h.flush();
h.run('game.enemies=[];game._spawn=game.nextBossAt=Infinity;game.player.invuln=Infinity;game.player.xpNext=game.crystalsNext=Infinity;game.quests.update();');
h.run('mapView="world";game.player.x=game.quests.board.x;game.player.y=game.quests.board.y-groundOffset(game.player,true);updateGameFrame(.016);');
assert(h.run('mapOpen'),'real board contact opens the existing journal');assert.equal(h.run('mapView'),'region','board entry shows quests even after using the world atlas');
assert.equal(h.run('game.quests.getEntries()[0].status'),'available');assert(node('quest-tracker').hidden);
const declinedTime=h.run('game.time');h.tick();assert.equal(h.run('game.time'),declinedTime,'reading a commission pauses the adventure');
questAction('decline');assert(!h.run('mapOpen'));assert.equal(h.run('game.quests.getEntries()[0].status'),'available');assert.equal(h.document.activeElement.id,'game-canvas');
h.tick();assert(!h.run('mapOpen'),'declining while standing at the board keeps its contact latch');
h.run('game.player.x=game.worldTravel.current.core.spawn.x;game.player.y=game.worldTravel.current.core.spawn.y-groundOffset(game.player,true);updateGameFrame(.016);game.player.x=game.quests.board.x;game.player.y=game.quests.board.y-groundOffset(game.player,true);updateGameFrame(.016);');
assert(h.run('mapOpen'),'leaving and returning lets the player reconsider the commission');
const frozen=h.run('game.time');questAction('accept');
assert.equal(h.run('game.quests.getEntries()[0].status'),'active');assert(h.run('mapOpen'));h.tick();assert.equal(h.run('game.time'),frozen);
click('map-done');assert(!h.run('mapOpen'));assert.equal(h.document.activeElement.id,'game-canvas');
h.run('updateHUD();');assert(!node('quest-tracker').hidden);click('quest-tracker');assert(h.run('mapOpen'));click('map-done');
const key={code:'Space',key:' ',target:h.document.activeElement,repeat:false,preventDefault(){this.defaultPrevented=true;}};
h.listeners['document:keydown']?.(key);h.listeners['window:keydown']?.(key);assert(key.defaultPrevented);assert(h.run('skillRequested'));assert(!h.run('mapOpen'),'Space after pointer-close returns to combat instead of reopening the map');
console.log('Quest integration: guarded materials, connected underground traversal, physical route changes, wrong-scene isolation, durable progress/reward-once, stale-tab collision sync, debug exclusion and map pause/focus passed.');
