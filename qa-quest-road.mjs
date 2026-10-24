import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WorldSave,WORLD_SAVE_KEY } from './dist/world-save.js';
import { groundOffset } from './dist/terrain.js';
import { portalDoor } from './dist/portal-geometry.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { MARSH_BRIDGE } from './dist/quest-definitions.js';

const ROAD='moss-stone-road',values=new Map();
const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
const launch=()=>{const save=new WorldSave({storage}),game=new Game({mode:'world',environment:false,...save.startOptions(),questStorage:save.questStorage});assert(save.attach(game));game.player.invuln=1e8;return {save,game};};
let {save,game:g}=launch();
const foot=()=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const place=point=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);g.status='playing';g.regionGrace=0;g.dungeon.update(0);};
const finish=()=>{for(let i=0;i<40&&g.sceneTransition.active;i++)g.sceneTransition.update(.05);assert(!g.sceneTransition.active);};
const request=id=>{g.status='playing';assert(g.requestInteraction(id),`real interaction ${id}`);finish();};
const record=()=>g.quests.store.record(ROAD);
const entry=()=>g.quests.getEntries().find(item=>item.id===ROAD);
const target=()=>g.quests.getGuide()?.target;
const enter=site=>{place(site.door||site);request(site.id);assert(g.dungeon.active);};
const leave=exit=>{place(exit);request(exit.id||g.getInteraction().id);assert.equal(g.dungeon.active,null);};
const travel=worldId=>{const portal=g.regions.portals.find(portal=>portal.nextRegion?.id===worldId);assert(portal);place(portalDoor(portal));request(portal.id);assert.equal(g.worldId,worldId);};
function followGuide(){
  const guide=g.quests.getGuide();assert(guide?.complete,'guidance must connect to the real objective');
  let distance=0;
  for(const to of guide.path.slice(1)){
    for(let n=0;n<200;n++){
      const from=foot(),dx=to.x-from.x,dy=to.y-from.y,d=Math.hypot(dx,dy);if(d<.05)break;
      const step=Math.min(10,d);g._moveEntity(g.player,dx/d*step,dy/d*step,true);g.dungeon.update(0);
      const moved=Math.hypot(foot().x-from.x,foot().y-from.y);assert(moved>.01,'guidance movement cannot stall on an invisible wall');distance+=moved;
    }
  }
  assert(Math.hypot(foot().x-guide.target.x,foot().y-guide.target.y)<1,'walked guidance arrives at its actual objective');
  return distance;
}
function claim(chest){
  const state=g.dungeon.active;place(chest);
  assert.equal(g.requestInteraction(chest.id),false,'quest materials remain guarded by their real room');
  for(const enemy of g.enemies)if(enemy.dungeonId===state.id&&enemy.dungeonRoom===chest.cellId)enemy.hp=0;
  g.dungeon.update(0);request(chest.id);assert.equal(chest.state,'claimed');
}

// The nearby board only opens an offer; the player explicitly accepts it.
const board=g.quests.boards.find(board=>board.questId===ROAD);assert(board);place(board);request(board.id);
assert.equal(record().accepted,false);assert.equal(g.quests.getTracker(),null);
assert(g.quests.accept(ROAD));assert.equal(entry().tracked,true);assert.equal(target().objectiveId,'handle');
const occupied=g.settlements.sites.find(site=>site.type==='occupied');enter(occupied);
assert.equal(g.quests.chestLabel(g.dungeon.active,g.dungeon.active.chests[0]),'取回驿桥摇柄');
claim(g.dungeon.active.chests[0]);assert(record().objectives.handle);leave(g.dungeon.active.entrance);
assert.match(target().label,/苔根湿径/);assert.equal(target().objectiveId,'crossing');
assert(save.capture(g));g.dispose('quest-road-reload');({save,game:g}=launch());
assert(record().objectives.handle);assert.equal(entry().tracked,true);
travel('beach');assert.equal(entry().tracked,true);assert.equal(g.quests.getTracker().id,ROAD);
assert.match(target().label,/海风松径/,'a detour keeps the next real return portal as the guide target');
assert(save.capture(g));g.dispose('quest-road-detour-reload');({save,game:g}=launch());
assert.equal(g.worldId,'beach');assert.equal(entry().tracked,true);assert.equal(g.quests.getTracker().id,ROAD);
// A local commission and a traveling commission can explicitly replace each
// other even outside the journey's three objective regions, across reloads.
travel('clockshadow-city');const cityBoard=g.quests.boards.find(board=>board.questId==='clock-bridge');assert(cityBoard);place(cityBoard);request(cityBoard.id);
assert(g.quests.accept('clock-bridge'));assert.equal(g.quests.getTracker().id,'clock-bridge');
assert(g.quests.track(ROAD));assert.equal(g.quests.getTracker().id,ROAD);assert.equal(entry().tracked,true);
assert(save.capture(g));g.dispose('quest-road-city-tracking');({save,game:g}=launch());
assert.equal(g.worldId,'clockshadow-city');assert.equal(g.quests.getTracker().id,ROAD);assert.equal(entry().tracked,true);
assert(g.quests.track('clock-bridge'));assert.equal(g.quests.getTracker().id,'clock-bridge');assert.equal(entry().tracked,false);
assert(save.capture(g));g.dispose('quest-local-city-tracking');({save,game:g}=launch());
assert.equal(g.quests.getTracker().id,'clock-bridge');assert.equal(entry().tracked,false);
assert(g.quests.track(ROAD));assert.equal(g.quests.getTracker().id,ROAD);travel('beach');travel('rift-forest');
travel('marsh');assert.equal(entry().tracked,true);assert.equal(g.quests.getTracker().id,ROAD);
const b=MARSH_BRIDGE;
assert(g.terrain.firstBlocker(b.x-80,b.y,b.x+80,b.y,g.player.r),'closed bridge has real collision');
const detour=terrainNavigation(g.terrain).rift.route({x:b.x-170,y:b.y},{x:b.x+170,y:b.y},g.player.r,'ground');
assert(detour?.length>3,'closed southern bridge still has a traversable northern detour');
place(b.approach);assert.equal(g.requestInteraction(`quest:${ROAD}:winch`),false,'missing materials cannot open the shortcut');
const marshMouth=g.riftExploration.sites.find(site=>site.key==='sunken-court');enter(marshMouth);
leave(g.dungeon.active.riftExits.find(exit=>exit.key==='sunken-court'));assert(!record().objectives.crossing,'same-mouth exit does not count as traversal');
enter(marshMouth);const other=g.dungeon.active.riftExits.find(exit=>exit.key==='hollow-corridor');
assert(followGuide()>1500,'marsh stage crosses a substantial connected underground route');request(other.id);assert(record().objectives.crossing);
assert.match(target().label,/沉石古道/);assert.equal(target().objectiveId,'bearing');travel('ruins');
assert.equal(entry().tracked,true);assert.equal(g.quests.getTracker().id,ROAD);
const ruinsMouth=g.riftExploration.sites.find(site=>site.key==='archive-stair');enter(ruinsMouth);
const state=g.dungeon.active,bearing=state.chests.find(chest=>g.quests.chestLabel(state,chest)==='取回耐水轴承');assert(bearing);
const arrival=foot(),ordinary=state.chests.find(chest=>chest!==bearing);assert(ordinary);claim(ordinary);assert(!record().objectives.bearing,'an ordinary waterway chest cannot substitute for the marked bearing');place(arrival);
assert(followGuide()>1500,'ruins material lies beyond multiple actual rooms');claim(bearing);assert(record().objectives.bearing);
leave(state.riftExits.find(exit=>exit.key==='sanctum-stair'));
assert.equal(target().objectiveId,'bridge');assert.match(target().label,/沉石古道/);
assert(save.capture(g));g.dispose('quest-road-reload');({save,game:g}=launch());
assert.equal(g.worldId,'ruins');assert(record().objectives.bearing);assert.equal(entry().tracked,true);
travel('marsh');assert.equal(entry().tracked,true);assert.equal(target().objectiveId,'bridge');
place(b.approach);const before={gold:g.gold,crystals:g.crystals};request(`quest:${ROAD}:winch`);
assert(record().completed&&record().rewardClaimed);assert.equal(g.gold-before.gold,70);assert.equal(g.crystals-before.crystals,40);
assert(!g.terrain.firstBlocker(b.x-80,b.y,b.x+80,b.y,g.player.r),'repair opens the same visible bridge collider');
assert.equal(g.quests.getGuide(),null);assert.equal(g.quests.getTracker(),null);
assert.equal(g.requestInteraction(`quest:${ROAD}:winch`),false);assert.equal(g.gold,before.gold+70);
await Promise.resolve();assert(values.has(WORLD_SAVE_KEY));
const paid={gold:g.gold,crystals:g.crystals};g.dispose('quest-road-reload');({save,game:g}=launch());
assert(record().completed);assert.equal(g.gold,paid.gold);assert.equal(g.crystals,paid.crystals);
assert(!g.terrain.firstBlocker(b.x-80,b.y,b.x+80,b.y,g.player.r));
travel('rift-forest');travel('marsh');assert(record().completed);assert(!g.terrain.firstBlocker(b.x-80,b.y,b.x+80,b.y,g.player.r),'returning across saved regions retains the repaired route');
assert.equal(g.quests.accept(ROAD),false);assert.equal(g.gold,paid.gold);g.dispose('quest-road-complete');
console.log('Road quest: three regions, explicit acceptance, actual guarded materials and underground routes, portal guidance, save/restore, permanent bridge collision and exactly-once reward passed.');
