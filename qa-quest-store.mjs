import assert from 'node:assert/strict';
import { QuestStore,QUEST_STORAGE_KEY } from './dist/quest-store.js';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { CLOCK_BRIDGE } from './dist/quest-definitions.js';
import { WorldSave,WORLD_SAVE_KEY } from './dist/world-save.js';

const memory=initial=>{const values=new Map(initial?[[QUEST_STORAGE_KEY,initial]]:[]);return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const storage=memory(),first=new QuestStore({storage}),second=new QuestStore({storage});
first.record('clock-bridge').objectives.gear=true;first.changed();
second.record('clock-bridge').objectives.chain=true;second.changed();
const merged=new QuestStore({storage});
assert.deepEqual(merged.record('clock-bridge').objectives,{gear:true,chain:true},'independent tabs retain both materials');
assert.equal(merged.record('clock-bridge').completed,false,'materials alone never open the bridge');
assert.equal(merged.record('clock-bridge').accepted,false,'merging objective facts never accepts a quest');
assert.equal(merged.record('unknown'),null,'unregistered IDs cannot grow the archive');
const future=memory(JSON.stringify({version:2,protected:'newer release'})),newer=new QuestStore({storage:future});
newer.record('clock-bridge').accepted=true;newer.changed();
assert.equal(newer.readOnly,true);assert.equal(JSON.parse(future.getItem(QUEST_STORAGE_KEY)).protected,'newer release');
const corrupt=memory('{broken'),broken=new QuestStore({storage:corrupt});
assert.equal(broken.available,false);assert.doesNotThrow(()=>broken.changed());assert.equal(corrupt.getItem(QUEST_STORAGE_KEY),'{broken');
const forged=new QuestStore({storage:memory(JSON.stringify({version:1,records:{'clock-bridge':{completed:true,rewardClaimed:'yes',objectives:{bridge:'yes',unknown:true}}},tracked:{forest:'clock-bridge'}}))});
assert.equal(forged.record('clock-bridge').completed,false);assert.equal(forged.record('clock-bridge').rewardClaimed,false);assert.deepEqual(forged.record('clock-bridge').objectives,{});assert.equal(forged.data.tracked.forest,undefined);
const unaccepted=new QuestStore({storage:memory(JSON.stringify({version:1,records:{'clock-bridge':{completed:true,rewardClaimed:true,objectives:{gear:true,chain:true,bridge:true}}},tracked:{'clockshadow-city':'clock-bridge'}}))});
assert.equal(unaccepted.record('clock-bridge').accepted,false);assert.equal(unaccepted.record('clock-bridge').completed,false);assert.equal(unaccepted.record('clock-bridge').rewardClaimed,false);
assert.deepEqual(unaccepted.record('clock-bridge').objectives,{gear:true,chain:true,bridge:true},'cleaning keeps facts earned before acceptance');
assert.equal(unaccepted.data.tracked['clockshadow-city'],undefined,'an unaccepted quest cannot restore a tracking selection');
const failing=new QuestStore({storage:{getItem:()=>null,setItem(){throw new Error('quota');}}});
failing.record('clock-bridge').objectives.gear=true;assert.doesNotThrow(()=>failing.changed());assert.equal(failing.available,false);assert.equal(failing.record('clock-bridge').objectives.gear,true);

const g=new Game({mode:'world',worldId:'clockshadow-city',questStorage:null});
g.quests.update();
assert.equal(g.quests.getEntries()[0]?.status,'available','the town board makes the journal discoverable');
assert.equal(g.quests.getTracker(),null,'discovering a board never occupies the quest tracker');
assert.equal(g.quests.getGuide(),null);assert.deepEqual(g.quests.getMarkers(),[]);
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
  const core=game.worldTravel.current.core,board=game.quests.board;assert(board,'every quest town has an accessible notice board');
  assert(Math.hypot(board.x-core.x,board.y-core.y)<240,'quest boards follow the relocated town, away from the old island spawn');
  assert(game.terrain.isFree(board.x,board.y,28));
  if(core.spawn)assert(!game.terrain.firstBlocker(core.spawn.x,core.spawn.y,board.x,board.y,game.player.r),'the town landing has a clear approach to its board');
  game.player.x=site.x;game.player.y=site.y-groundOffset(game.player,true);assert(game.interact(site.id));
  assert.equal(game.quests.getTracker(),null,'entering a relevant scene does not accept its quest');assert.equal(game.quests.getGuide(),null);
  assert(game.quests.accept(worldId==='rift-forest'?'underground-return':'clock-bridge'));
  const guide=game.quests.getGuide();assert(guide?.complete,'the dungeon guide reaches its actual objective');
  assert(guide.path.length>20,'the guide travels the maze instead of drawing a direct line');
  for(let i=1;i<guide.path.length;i++){
    const a=guide.path[i-1],b=guide.path[i];
    assert(!game.terrain.firstBlocker(a.x,a.y,b.x,b.y,game.player.r),'every smoothed dungeon leg clears the entire hero body');
  }
}
// Late acceptance completes existing facts and commits the paid flag together
// with the wallet through the ordinary campaign checkpoint microtask.
const campaignStorage=memory();let campaignWrites=0;
const setCampaign=campaignStorage.setItem;campaignStorage.setItem=(key,value)=>{campaignWrites++;setCampaign(key,value);};
let campaign=new WorldSave({storage:campaignStorage}),player=new Game({mode:'world',worldId:'clockshadow-city',questStorage:campaign.questStorage});
assert(campaign.attach(player));assert(player.quests._objective('gear','clock-bridge'));assert(player.quests._objective('chain','clock-bridge'));
player.player.x=CLOCK_BRIDGE.approach.x;player.player.y=CLOCK_BRIDGE.approach.y-groundOffset(player.player,true);
assert(player.requestInteraction('quest:clock-bridge:winch'));assert(player.quests.store.record('clock-bridge').objectives.bridge);
assert.equal(player.quests.store.record('clock-bridge').accepted,false);assert.equal(player.quests._complete('clock-bridge'),false);
assert.equal(player.gold,0);assert.equal(campaignWrites,0);
await Promise.resolve();assert.equal(campaignWrites,1,'unaccepted facts schedule their own campaign checkpoint, including a repaired bridge without a reward event');
campaign=new WorldSave({storage:campaignStorage});player=new Game({mode:'world',...campaign.startOptions(),questStorage:campaign.questStorage});assert(campaign.attach(player));
const writesBeforeAccept=campaignWrites;assert(player.quests.accept('clock-bridge'));assert.equal(campaignWrites,writesBeforeAccept,'acceptance waits until its reward action has finished');
await Promise.resolve();assert.equal(campaignWrites,writesBeforeAccept+1,'late acceptance and reward use one campaign write');
const paidCampaign=JSON.parse(campaignStorage.getItem(WORLD_SAVE_KEY));
assert(paidCampaign.quests.records['clock-bridge'].accepted);assert(paidCampaign.quests.records['clock-bridge'].completed);assert(paidCampaign.quests.records['clock-bridge'].rewardClaimed);
assert.equal(paidCampaign.gold,40);assert.equal(paidCampaign.crystals,30);assert.equal(campaignStorage.getItem(QUEST_STORAGE_KEY),null);
assert.equal(player.quests.accept('clock-bridge'),false);await Promise.resolve();assert.equal(campaignWrites,writesBeforeAccept+1);
console.log('quest storage and navigation: explicit acceptance, durable facts, atomic late rewards, protected saves, tab merges, stable targets and real bridge/dungeon paths passed');
