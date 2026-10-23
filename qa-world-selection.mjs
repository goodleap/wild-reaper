import assert from 'node:assert/strict';
import { harness,html } from './qa-app-harness.mjs';
import { getConfigSection } from './dist/content-config.js';
import { WORLD_SAVE_KEY } from './dist/world-save.js';
import { landmarkState } from './dist/world-map.js';

// Real shipped UI handlers, WorldSave and Game; browser geometry is checked separately.
const node=(h,id)=>h.document.getElementById(id),click=(h,id)=>h.fire(node(h,id),'click');
const choose=(h,id)=>{const input=node(h,id);input.checked=true;h.fire(input,'change');};
const visible=(h,id)=>!node(h,id).classList.contains('hidden');
const storage=new Map(),h=harness('',{storage,coarse:true});
assert.equal(getConfigSection('worlds').travel.regions.length,9);
assert.doesNotMatch(html,/id="world-(rift-forest|verdant-rift|marsh|snow)"/,'there is one world entry instead of separate region launches');
click(h,'start-button');
assert.match(node(h,'world-entry-title').textContent,/裂谷林海/);
assert.equal(visible(h,'world-options'),false);assert.equal(visible(h,'world-new-button'),false);
choose(h,'hero-princess-v2');choose(h,'weapon-arrow');click(h,'prepare-start-button');await h.flush();
assert.equal(h.run('game.worldId'),'rift-forest');assert.equal(h.run('game.hero.id'),'princess');assert.equal(h.run('game.initialWeaponId'),'arrow');
assert(h.run('game.worldSave===worldSave'));assert(storage.has(WORLD_SAVE_KEY));

// The ordinary atlas is informational; only the waypoint interaction offers travel.
h.run('openMap();');click(h,'map-view-world');
assert.equal(node(h,'world-atlas-content').querySelectorAll('[data-world-target]').length,9);
assert.equal(h.run('game.status'),'playing','map visibility pauses UI scheduling, not the runtime travel status');
const regionButton=node(h,'world-atlas-content').querySelector('[data-world-target="rift-forest"]');
h.fire(node(h,'world-atlas-content'),'click',{target:regionButton});
assert.equal(h.run('game.worldId'),'rift-forest');assert.equal(h.run('game.sceneTransition.active'),false);
h.run('closeMap();openMap(undefined,{travel:true});');
for(const button of node(h,'world-atlas-content').querySelectorAll('[data-world-target]'))assert(button.disabled,'undiscovered destinations and current region cannot be selected for travel');
h.run('closeMap();');

// Fixed purchases stay in the same shop and put consumables in inventory.
h.run(`const shopSite=game.settlements.sites.find(site=>site.worldFacility==='supplies');game.player.x=shopSite.door.x;game.player.y=shopSite.door.y-groundOffset(game.player,true);game.gold=1000;game.settlements.interact(shopSite.id);openShop();`);
assert.equal(h.run('game.status'),'shop');
for(let i=0;i<2;i++){const button=node(h,'shop-items').querySelector('button');h.fire(button,'click');assert.equal(h.run('game.status'),'shop');assert(visible(h,'shop-overlay'));}
assert.equal(h.run('game.worldShops.inventory.heal'),2);assert.doesNotMatch(node(h,'shop-items').textContent,/剩余 1 份/);
click(h,'shop-close');h.run("game.player.hp-=10;openCharacter('supplies');");
const use=node(h,'character-content').querySelector('[data-use-supply="heal"]');h.fire(node(h,'character-content'),'click',{target:use});
assert.equal(h.run('game.worldShops.inventory.heal'),1);assert.equal(h.run('game.player.hp===game.player.maxHp'),true);
h.run('closeCharacter();game.gold=321;home();');
const stored=JSON.parse(storage.get(WORLD_SAVE_KEY));assert(stored);

// A fresh page continues the saved loadout and assets, with a real reset confirmation.
const restored=harness('',{storage,coarse:true});click(restored,'start-button');
assert.equal(node(restored,'prepare-start-label').textContent,'继续探索');assert(visible(restored,'world-new-button'));
assert(node(restored,'hero-princess-v2').disabled);assert(node(restored,'weapon-arrow').disabled);
click(restored,'prepare-start-button');await restored.flush();
assert.equal(restored.run('game.hero.id'),'princess');assert.equal(restored.run('game.initialWeaponId'),'arrow');assert.equal(restored.run('game.gold'),321);assert.equal(restored.run('game.worldShops.inventory.heal'),1);
restored.run('home();');click(restored,'start-button');
const before=storage.get(WORLD_SAVE_KEY);click(restored,'world-new-button');assert(visible(restored,'world-reset-confirm'));assert.equal(storage.get(WORLD_SAVE_KEY),before);
click(restored,'world-reset-cancel');assert.equal(storage.get(WORLD_SAVE_KEY),before);
choose(restored,'mode-dungeon');assert.equal(node(restored,'hero-princess-v2').disabled,false,'challenge still permits its own loadout');
choose(restored,'mode-world');click(restored,'world-new-button');click(restored,'world-reset-confirm-button');
assert(!storage.has(WORLD_SAVE_KEY));assert.equal(node(restored,'prepare-start-label').textContent,'开始探索');assert.equal(node(restored,'hero-princess-v2').disabled,false);

// The debug launch has the same services but never reads or overwrites official progress.
const official=new Map([[WORLD_SAVE_KEY,JSON.stringify(stored)]]),debug=harness('?debug',{storage:official});
click(debug,'start-button');assert.equal(node(debug,'prepare-start-label').textContent,'开始探索');click(debug,'prepare-start-button');await debug.flush();
assert(debug.run('game.worldTravel.enabled'));assert.equal(debug.run('game.hero.id'),'traveler');debug.run('game.gold=9999;home();');assert.equal(official.get(WORLD_SAVE_KEY),JSON.stringify(stored));

// Failed disk writes must retain the playable instance and its unsaved progress.
const failure=harness();click(failure,'start-button');click(failure,'prepare-start-button');await failure.flush();
const live=failure.run('game');failure.run('game.gold=789;');
failure.storage.set=()=>{throw new Error('QuotaExceededError');};
failure.run('home();');assert.equal(failure.run('game'),live);assert.equal(live.gold,789);assert.notEqual(live._disposed,true);
await failure.run('restartGame();');assert.equal(failure.run('game'),live,'failed persistence must not replace the active journey');assert.equal(failure.run('startLoading'),false);
assert.equal(landmarkState({type:'supplies'}),'购买随身补给');assert.equal(landmarkState({type:'rest'}),'恢复全队生命');
console.log('Unified world UI: single start, save/continue/reset confirmation, failed-save retention, isolated debug saves, atlas vs waypoint travel, persistent shop and inventory actions passed.');
