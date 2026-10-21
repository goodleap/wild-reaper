import assert from 'node:assert/strict';
import { QuestStore,QUEST_STORAGE_KEY } from './dist/quest-store.js';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { CLOCK_BRIDGE } from './dist/quest-definitions.js';

const memory=initial=>{const values=new Map(initial?[[QUEST_STORAGE_KEY,initial]]:[]);return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const storage=memory(),first=new QuestStore({storage}),second=new QuestStore({storage});
first.record('clock-bridge').objectives.gear=true;first.changed();
second.record('clock-bridge').objectives.chain=true;second.changed();
const merged=new QuestStore({storage});
assert.deepEqual(merged.record('clock-bridge').objectives,{gear:true,chain:true},'independent tabs retain both materials');
assert.equal(merged.record('clock-bridge').completed,false,'materials alone never open the bridge');
assert.equal(merged.record('unknown'),null,'unregistered IDs cannot grow the archive');
const future=memory(JSON.stringify({version:2,protected:'newer release'})),newer=new QuestStore({storage:future});
newer.record('clock-bridge').accepted=true;newer.changed();
assert.equal(newer.readOnly,true);assert.equal(JSON.parse(future.getItem(QUEST_STORAGE_KEY)).protected,'newer release');
const corrupt=memory('{broken'),broken=new QuestStore({storage:corrupt});
assert.equal(broken.available,false);assert.doesNotThrow(()=>broken.changed());assert.equal(corrupt.getItem(QUEST_STORAGE_KEY),'{broken');
const forged=new QuestStore({storage:memory(JSON.stringify({version:1,records:{'clock-bridge':{completed:true,rewardClaimed:'yes',objectives:{bridge:'yes',unknown:true}}},tracked:{forest:'clock-bridge'}}))});
assert.equal(forged.record('clock-bridge').completed,false);assert.equal(forged.record('clock-bridge').rewardClaimed,false);assert.deepEqual(forged.record('clock-bridge').objectives,{});assert.equal(forged.data.tracked.forest,undefined);
const failing=new QuestStore({storage:{getItem:()=>null,setItem(){throw new Error('quota');}}});
failing.record('clock-bridge').objectives.gear=true;assert.doesNotThrow(()=>failing.changed());assert.equal(failing.available,false);assert.equal(failing.record('clock-bridge').objectives.gear,true);

const g=new Game({mode:'world',worldId:'clockshadow-city',questStorage:null});
assert.equal(g.quests.getTracker().status,'available','visible spawn board makes the journal discoverable');
assert.equal(g.quests.accept('underground-return'),false,'other maps cannot accept this map\'s quest');
assert(g.quests.accept('clock-bridge'));
const navigation=terrainNavigation(g.terrain),before=navigation.rift.route({x:1300,y:-150},{x:2850,y:-150},g.player.r,'ground');
assert(before?.some(point=>point.y>3300),'closed clock bridge routes through the real southern bridge');
assert(g.terrain.firstBlocker(1400,-150,1650,-150,g.player.r),'closed visible barrier has matching body collision');
assert(g.terrain.isFree(CLOCK_BRIDGE.approach.x,CLOCK_BRIDGE.approach.y,g.player.r),'the winch is usable from its western approach');
const firstTarget=g.quests.getGuide().target.objectiveId;
g.player.x=500;g.player.y=4200-groundOffset(g.player,true);
assert.equal(g.quests.getGuide().target.objectiveId,firstTarget,'crossing a nearest-distance boundary cannot flip the tracked material');
const revision=g.terrain.structureRevision;
for(let i=0;i<120;i++)g.quests.update();
assert.equal(g.terrain.structureRevision,revision,'idle journal updates do not rebuild collision or navigation');
for(const worldId of ['rift-forest','clockshadow-city']){
  const game=new Game({mode:'world',worldId,questStorage:null}),site=game.riftExploration.sites.find(site=>worldId==='rift-forest'?site.key==='cave05':site.key==='wine-cellar');
  game.player.x=site.x;game.player.y=site.y-groundOffset(game.player,true);assert(game.interact(site.id));
  const guide=game.quests.getGuide();assert(guide?.complete,'the dungeon guide reaches its actual objective');
  assert(guide.path.length>20,'the guide travels the maze instead of drawing a direct line');
  for(let i=1;i<guide.path.length;i++){
    const a=guide.path[i-1],b=guide.path[i];
    assert(!game.terrain.firstBlocker(a.x,a.y,b.x,b.y,game.player.r),'every smoothed dungeon leg clears the entire hero body');
  }
}
console.log('quest storage and navigation: protected saves, tab merges, stable targets and real bridge/dungeon paths passed');
