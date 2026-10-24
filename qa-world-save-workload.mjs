import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WorldSave,WORLD_SAVE_KEY,validateWorldSaveData } from './dist/world-save.js';
import { WORLD_IDS } from './dist/world-definitions.js';

const memory=new Map(),reports=[];
let standardWrites=0,validatedWrites=0,failWrite=false;
const storage={getItem:key=>memory.get(key)??null,
  setItem(key,text){standardWrites++;memory.set(key,text);},
  setValidatedItem(key,text){if(failWrite)throw Error('quota');validatedWrites++;memory.set(key,text);},
  removeItem:key=>memory.delete(key)};
const save=new WorldSave({storage,onMetrics:report=>reports.push(report)});
const game=new Game({mode:'world',questStorage:save.questStorage});assert(save.attach(game));
game.enemies[0].name='雪地守卫 · 测试';assert(save.capture(game));
assert.equal(standardWrites,0);assert.equal(validatedWrites,1,'codec uses trusted adapter after validation');
assert.equal(reports.at(-1).bytes,Buffer.byteLength(memory.get(WORLD_SAVE_KEY)),'metrics and quota use UTF-8 bytes');
assert.equal(reports.at(-1).rebuiltRegions,1);

// Every region exit creates a new suspended state. Repeated checkpoints in
// the current region reuse all unchanged suspended regions and saved JSON.
for(let i=0;i<4;i++){
  const portal=game.regions.portals.find(portal=>!save.data.regions[portal.nextRegion?.id]);
  if(!portal)break;
  game.status='playing';assert(game._switchRegion(portal));await Promise.resolve();
}
assert(game.regions.states.size>=2);assert(save.capture(game));
const count=Object.keys(save.data.regions).length;
const prior=new Map(Object.entries(save.data.regions));
assert(save.capture(game));
assert.equal(reports.at(-1).rebuiltRegions,1);assert.equal(reports.at(-1).reusedRegions,count-1);
for(const [id,region] of prior)assert.equal(save.data.regions[id]===region,id!==game.worldId);
assert.throws(()=>{save.data.regions[game.worldId].enemies[0].hp=0;},TypeError,'cached snapshots are immutable, never live actor collections');
assert.equal(reports.at(-1).bytes,Buffer.byteLength(memory.get(WORLD_SAVE_KEY)));
assert.doesNotThrow(()=>validateWorldSaveData(JSON.parse(memory.get(WORLD_SAVE_KEY))));

const [index,inactive]=[...game.regions.states][0],id=WORLD_IDS[index];
let old=save.data.regions[id];
inactive.portals[0].rewardClaimed=!inactive.portals[0].rewardClaimed;
assert(save.capture(game));assert.notEqual(save.data.regions[id],old,'in-place portal progress invalidates the suspended snapshot');
assert.equal(save.data.regions[id].portals[0].rewardClaimed,inactive.portals[0].rewardClaimed);
old=save.data.regions[id];
inactive.enemies=inactive.enemies.slice(1);assert(save.capture(game));
assert.notEqual(save.data.regions[id],old,'remote guardian removal invalidates the enemy snapshot');
assert.equal(save.data.regions[id].enemies.length,inactive.enemies.filter(enemy=>enemy.hp>0).length);

// An explicit content change can invalidate a suspended region even when it
// keeps the collection identities (for example a future remote quest effect).
const actor=inactive.enemies.find(enemy=>enemy.hp>1);assert(actor);actor.hp--;
save.invalidateRegion(id);assert(save.capture(game));
assert.equal(save.data.regions[id].enemies.find(enemy=>enemy.id===actor.id).hp,actor.hp);

// Re-entering and leaving the same region replaces the suspended identity,
// so a cache never overwrites new exploration with the earlier visit.
const target={nextRegionIndex:index,nextRegion:{id},arrivalKind:'waypoint'};
game.status='playing';assert(game._switchRegion(target));await Promise.resolve();
const edited=game.enemies.find(enemy=>enemy.hp>1);assert(edited);edited.hp--;
const hp=edited.hp,actorId=edited.id;
assert(save.capture(game));
const next=game.regions.portals[0];game.status='playing';assert(game._switchRegion(next));await Promise.resolve();
assert(save.capture(game));assert(save.capture(game));
assert.equal(save.data.regions[id].enemies.find(enemy=>enemy.id===actorId).hp,hp);

// A failed disk write does not publish partially updated cache data or
// prevent the next attempt from capturing a newly changed suspended state.
const stable=memory.get(WORLD_SAVE_KEY);failWrite=true;game.gold+=11;
assert.equal(save.capture(game),false);assert.equal(memory.get(WORLD_SAVE_KEY),stable);
assert.equal(reports.at(-1).status,'error');assert(reports.at(-1).totalMs>=0);
failWrite=false;assert(save.capture(game));assert.equal(JSON.parse(memory.get(WORLD_SAVE_KEY)).gold,game.gold);
assert.equal(reports.at(-1).status,'success');
for(const report of reports)assert(!Object.hasOwn(report,'save')&&!Object.hasOwn(report,'player'),'metrics contain no save content');
assert(reports.every(report=>['snapshotMs','validateMs','serializeMs','storageMs','totalMs'].every(key=>Number.isFinite(report[key])&&report[key]>=0)));
game.dispose('workload-test');

// Frozen progress loaded from disk can be reused without trusting incoming
// data: the constructor still rejects invalid values and oversized trees.
const restored=new WorldSave({storage}),again=new Game({mode:'world',...restored.startOptions(),questStorage:restored.questStorage});assert(restored.attach(again));
assert.equal(again.gold,game.gold);assert(restored.capture(again));again.dispose('workload-test');
const bad=JSON.parse(memory.get(WORLD_SAVE_KEY));bad.regions[id].enemies[0].hp='invalid';memory.set(WORLD_SAVE_KEY,JSON.stringify(bad));
assert.equal(new WorldSave({storage}).storageOk,false);
console.log(`World-save workload: ${count} visited regions rebuild only the active region; portal/actor invalidation, revisits, full load validation, UTF-8 bytes, atomic failures and bounded metrics passed.`);
