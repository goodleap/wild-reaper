import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WorldSave, WORLD_SAVE_KEY } from './dist/world-save.js';
import { QUEST_STORAGE_KEY } from './dist/quest-store.js';
import { groundOffset } from './dist/terrain.js';
import { DEBUG_OPTION_DEFS } from './dist/debug-mode.js';

const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
const options=Object.fromEntries(DEBUG_OPTION_DEFS.map(option=>[option.id,false]));
const launch=extra=>{
  const save=new WorldSave({storage});
  const game=new Game({mode:'world',debug:true,debugOptions:{...options,...extra},...save.startOptions(),questStorage:save.questStorage});
  assert(save.attach(game));return {save,game};
};
let {save,game}=launch({extraGold:true,testFacilities:true,allBosses:true});
assert.equal(game.gold,500);assert(game.enemies.some(enemy=>enemy.trainingDummy));
const bosses=game.enemies.filter(enemy=>enemy.debugBoss);assert(bosses.length>0);
bosses[0].hp-=321;
const bossState=bosses.map(enemy=>({id:enemy.id,kind:enemy.bossKind,hp:enemy.hp,debugBossId:enemy.debugBossId}));
game.gold=173;game.addExperience(65);game.build.increment('arrow');
game.realms.talismans=6;game.worldShops.inventory.heal=3;
const quest=game.quests.store.record('underground-return');quest.accepted=true;quest.objectives.crossing=true;game.quests.store.changed();
assert.equal(game.quests.storageMode,'persistent');assert.equal(storage.getItem(QUEST_STORAGE_KEY),null,'quest flags share the campaign transaction');
const rest=game.settlements.sites.find(site=>site.worldFacility==='rest');assert(rest);
game.player.x=rest.door.x;game.player.y=rest.door.y-groundOffset(game.player,true);assert(game.worldShops.rest(rest));
game.worldTravel.activated.add('marsh');game.worldTravel.discovered.add('marsh');
const expected={level:game.player.level,xp:game.player.xp,build:game.build.serialize(),rest:game.worldTravel.getRestAnchor(),x:game.player.x,y:game.player.y};
await Promise.resolve();
assert(values.has(WORLD_SAVE_KEY),'debug rest and growth events automatically checkpoint');
assert(save.capture(game));game.dispose('test-reload');

({save,game}=launch({extraGold:true,testFacilities:true,allBosses:true}));
assert.equal(game.gold,173,'resuming does not grant another 500 gold');
assert.equal(game.player.level,expected.level);assert.equal(game.player.xp,expected.xp);assert.deepEqual(game.build.serialize(),expected.build);
assert.equal(game.player.x,expected.x);assert.equal(game.player.y,expected.y);
assert.equal(game.realms.talismans,6);assert.equal(game.worldShops.inventory.heal,3);
assert.deepEqual(game.worldTravel.getRestAnchor(),expected.rest);assert(game.worldTravel.activated.has('marsh'));
assert(game.quests.store.record('underground-return').objectives.crossing);
assert.deepEqual(game.enemies.filter(enemy=>enemy.debugBoss).map(enemy=>({id:enemy.id,kind:enemy.bossKind,hp:enemy.hp,debugBossId:enemy.debugBossId})),bossState,'test Boss markers and health survive without duplicate roster');
assert(game.enemies.filter(enemy=>enemy.debugBoss).every(enemy=>enemy.guardActive!==false),'restored test Bosses remain active rather than becoming sleeping territory guards');
assert.equal(game.enemies.filter(enemy=>enemy.trainingDummy).length,1,'the selected test dummy is recreated after restoring the saved region');
assert.equal(new Set(game.enemies.map(enemy=>enemy.id)).size,game.enemies.length,'restored actors and new test tools have distinct IDs');
const debugBoss=game.enemies.find(enemy=>enemy.debugBoss);debugBoss.hp=0;
assert.equal(game.regions.openPortal(debugBoss),null,'a restored test Boss cannot advance the ordinary region');
assert.equal(game.realms.onEnemyDefeated(debugBoss),false,'a restored test Boss does not grant tribulation materials');

// A newly enabled full-build switch applies after the saved partial build.
assert(save.capture(game));game.dispose('test-reload');
({save,game}=launch({fullLoadout:true}));
assert(game.build.getWeapon('arrow').modifiers.multishot>expected.build.weapons.arrow.modifiers.multishot);
assert.equal(game.build.getWeapon('arrow').branch,'pierce');
const fullBuild=game.build.serialize();assert.equal(game.gold,173);assert(save.capture(game));game.dispose('test-reload');
({save,game}=launch({fullLoadout:false}));
assert.deepEqual(game.build.serialize(),fullBuild,'turning off the grant switch does not erase saved abilities');

// Region changes and death use the same saved map and last rested town.
const portal=game.regions.portals.find(portal=>portal.nextRegion?.id==='marsh');assert(portal);
game.status='playing';assert(game._switchRegion(portal));assert.equal(game.worldId,'marsh');
await Promise.resolve();assert.equal(JSON.parse(values.get(WORLD_SAVE_KEY)).location.worldId,'marsh');
game.dispose('test-reload');({save,game}=launch());assert.equal(game.worldId,'marsh');assert.deepEqual(game.worldTravel.getRestAnchor(),expected.rest);
game.player.hp=0;assert(save.capture(game,{reason:'death'}));game.dispose('test-reload');
({save,game}=launch());assert.equal(game.worldId,'rift-forest');assert.equal(game.player.hp,game.player.maxHp);
assert.equal(game.player.x,expected.rest.x);assert.equal(game.player.y+groundOffset(game.player,true),expected.rest.y);
game.dispose('test-complete');

// Standalone debug fixtures without an injected campaign never read the
// ordinary browser quest key as an accidental fallback.
let reads=0;const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(){reads++;return null;},setItem(){throw Error('unexpected write');}}});
try{const fixture=new Game({mode:'world',debug:true,debugOptions:options});assert.equal(fixture.quests.storageMode,'session-debug');assert.equal(reads,0);fixture.dispose('test-complete');}
finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;}

console.log('Debug world saves: checkpoints, growth, quests, rest/waypoints, inventory, map/death return, one-time gold, full-build switches and safe test Boss restoration passed.');
