import assert from 'node:assert/strict';
import { harness as createHarness } from './qa-app-harness.mjs';
import { WORLD_IDS } from './dist/world-definitions.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { groundOffset } from './dist/terrain.js';

// Exercise the normal preparation handlers and their real Game instances.
// Canvas is mocked here; browser layout and performance need browser checks.
// Image fetching is mocked with the other rendering dependencies; decode and
// failure/retry behavior have their own asset QA and real Chromium capture.
const harness=(search='',options={})=>createHarness(search,{...options,moduleOverrides:{cityDetailArt:{preload:async()=>{},drawProp:()=>false,ready:false},cityArtLibrary:{preload:async()=>{},draw:()=>true,coversPlayer:()=>true}}});
const worlds=[
  {id:'rift-forest',radio:'world-rift-forest',preview:'world-preview',name:'裂谷林海',width:7200,height:5400},
  {id:'verdant-rift',radio:'world-verdant-rift',preview:'world-preview-verdant-rift',name:'苍翠断脊',width:14400,height:10800},
  {id:'marsh',radio:'world-marsh',preview:'world-preview-marsh',name:'迷雾沼泽',width:14400,height:10800},
  {id:'clockshadow-city',radio:'world-clockshadow-city',preview:'world-preview-clockshadow-city',name:'钟影旧都',width:14400,height:10800},
  {id:'ember-realm-large',radio:'world-ember-realm-large',preview:'world-preview-ember-realm-large',name:'熔火之境',width:14400,height:10800}
];
const node=(h,id)=>h.document.getElementById(id);
const click=(h,id)=>h.fire(node(h,id),'click');
const choose=(h,ids,id)=>{
  for(const key of ids)node(h,key).checked=key===id;
  h.fire(node(h,id),'change');
};
const selectWorld=(h,id)=>choose(h,worlds.map(world=>world.radio),worlds.find(world=>world.id===id).radio);
const selectMode=(h,id)=>choose(h,['mode-world','mode-dungeon'],`mode-${id}`);
const saved=h=>JSON.parse(h.storage.get('wild-echoes-setup'));
const quiet=h=>h.run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.regionGrace=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
const assertDestination=(h,world)=>{
  const game=h.run('game'),layout=createRiftLayout(world.id);
  assert.equal(game.debug,false,'normal world choice never enables debug');
  assert.equal(game.mode,'world');assert.equal(game.startWorldId,world.id);assert.equal(game.worldId,world.id);assert.equal(game.region.id,world.id);
  assert.equal(game.terrain.region,world.id);
  assert.equal(game.terrain.island.layout,layout,'selected world owns the actual collision/render layout');
  assert.equal(layout.bounds.maxX-layout.bounds.minX,world.width);assert.equal(layout.bounds.maxY-layout.bounds.minY,world.height);
  assert.equal(game.player.x,layout.spawn.x);assert.equal(game.player.y+groundOffset(game.player,true),layout.spawn.y);
  if(world.id==='ember-realm-large'){
    assert.equal(game.mapId,10,'the ember world appends after the ten existing world identities');
    assert.equal(layout.artTheme,'ember');
    assert.equal(game.regions.portals.length,0,'the ember world cannot invent travel into an existing world');
    assert.equal(game.regions.states.size,0,'launching the ember world cannot initialize a different world');
    assert.equal(layout.emberScene.sample,false);assert.equal(layout.areas.length,17);
    assert.equal(layout.encounters.filter(encounter=>encounter.kind==='boss').length,2,'both authored open Boss encounters launch with the complete map');
    assert.equal(game.territories.groups.length,layout.encounters.length,'the ember world creates its actual baked encounter reservations');
    assert.equal(game.enemies.filter(enemy=>enemy.worldBoss).length,2,'the selected complete map creates both existing-system open bosses');
    assert.equal(game.riftExploration.sites.filter(site=>site.kind==='chest').length,10);assert.equal(game.riftExploration.sites.filter(site=>site.kind==='cave').length,3);
    assert.equal(game.settlements.sites.filter(site=>site.type!=='angel').length,4);assert.equal(game.relicSites.sites.length,8);
    assert(game.riftExploration.sites.every(site=>site.id.startsWith('rift:ember-realm-large:')),'ember objectives use their own saved identities');
  }
  assert.equal(node(h,'terrain-name').textContent,world.name);
  assert(node(h,'story-objective').classList.contains('hidden'),'ordinary exploration never displays an empty story objective');
  assert.equal(h.run('viewWidth'),540,'normal world selection retains standard camera width');
};

assert.deepEqual(WORLD_IDS.slice(0,8),['forest','marsh','ruins','beach','city','mountain','snow','volcano'],'existing world identities remain stable');
assert.equal(WORLD_IDS[8],'verdant-rift');assert.equal(WORLD_IDS[9],'clockshadow-city');assert.equal(WORLD_IDS[10],'ember-realm-large');assert.equal(WORLD_IDS[11],'rift-forest');assert.equal(WORLD_IDS.length,12);
assert.notEqual(createRiftLayout('rift-forest'),createRiftLayout('verdant-rift'),'authored map caches do not alias');
assert.notEqual(createRiftLayout('ember-realm-large'),createRiftLayout('clockshadow-city'),'the ember world does not reuse a previous map cache');

for(const world of worlds){
  const h=harness('',{coarse:true}),rail=node(h,'world-options');click(h,'start-button');
  assert.equal(rail.children.length,5,'normal preparation exposes the four existing authored worlds and the remade marsh');
  assert.equal(node(h,'world-count').textContent,'5 张地图');
  for(const destination of worlds){
    const portrait=node(h,destination.preview);
    assert.equal(portrait.getAttribute('role'),'img');assert.match(portrait.getAttribute('aria-label'),new RegExp(destination.name));
    assert.equal(portrait.width/portrait.height,4/3);assert.equal(node(h,destination.radio).value,destination.id);
    assert.equal(node(h,destination.radio).parentElement.textContent,destination.name,'world cards contain only their overview and title');
  }
  selectWorld(h,world.id);
  assert.equal(h.run('game'),null);assert.equal(h.run('archive.data.totals.runs'),0,'previewing a destination never starts an adventure');
  assert.match(node(h,'prepare-summary').textContent,new RegExp(world.name));
  assert.equal(node(h,'world-mode-note').getAttribute('aria-describedby'),'world-description');
  assert.match(node(h,'world-description').textContent,world.id==='rift-forest'?/南岸营地/:world.id==='marsh'?/干地堤岸.*苇荡.*根林/:world.id==='clockshadow-city'?/南郊驿站.*旧城堡庭院/:world.id==='ember-realm-large'?/17.*三.*桥.*矿洞/:/西南营地.*跨河桥/);
  assert.equal(saved(h).worldId,world.id);
  selectMode(h,'dungeon');selectMode(h,'world');assert(node(h,world.radio).checked,'mode switching retains world choice');
  click(h,'prepare-back-button');click(h,'start-button');assert(node(h,world.radio).checked);
  click(h,'prepare-start-button');await h.flush();assertDestination(h,world);
  click(h,'map-button');assert.match(node(h,'map-legend').textContent,world.id==='marsh'?/根林与深水不可步行.*干地堤岸、缺口和木桥/:world.id==='clockshadow-city'?/城墙、建筑与深水.*城门、街巷和石桥/:world.id==='ember-realm-large'?/密林、岩脊与熔岩.*山径、缺口和岩桥/:/深绿密林、山壁与深水/);click(h,'close-map');
  const previousGame=h.run('game');quiet(h);h.run('game.status="dead";');h.tick();click(h,'restart-button');await h.flush();
  assertDestination(h,world);assert.notEqual(h.run('game'),previousGame);assert.equal(saved(h).worldId,world.id);
  h.run('home();');click(h,'start-button');assert(node(h,world.radio).checked);
  const images=h.drawImages();click(h,'prepare-back-button');click(h,'start-button');assert.equal(h.drawImages(),images,'reopening reuses all static world previews');
  const restored=harness('',{storage:h.storage,coarse:true});click(restored,'start-button');assert(node(restored,world.radio).checked);assert.match(node(restored,'prepare-summary').textContent,new RegExp(world.name));
}

// A destination preference is independent of a saved dungeon, hero and weapon.
// Both non-forest expeditions must initialize and restart with their actual
// world identity without replacing the independent world-selection preference.
for(const [dungeonId,themeId] of [['ship','beach'],['moon','mountain']]){
  const storage=new Map([['wild-echoes-setup',JSON.stringify({mode:'dungeon',worldId:'verdant-rift',dungeonId,heroId:'princess',appearanceId:'princess-v2',weaponId:'arrow'})]]);
  const h=harness('',{storage,coarse:true});click(h,'start-button');
  const assertDungeon=()=>{
    const game=h.run('game');
    assert.equal(game.mode,'dungeon');assert.equal(game.expedition.id,dungeonId);
    assert.equal(game.mapId,dungeonId==='ship'?'expedition:ship:aft-deck':`expedition:${dungeonId}`);
    if(dungeonId==='ship')assert.equal(game.expedition.currentSceneId,'aft-deck','start and restart enter the first ship deck');
    assert.equal(game.region.id,themeId);assert.equal(game.terrain.region,themeId);
    assert.equal(game.worldId,themeId,'the running expedition reports its own world');
    assert.equal(game.startWorldId,themeId,'the expedition start identity matches its actual scene');
    assert.equal(saved(h).worldId,'verdant-rift','dungeon identity never overwrites the next exploration choice');
  };
  assert(node(h,'mode-dungeon').checked);assert(node(h,`dungeon-${dungeonId}`).checked);assert(node(h,'world-verdant-rift').checked);
  assert(node(h,'hero-princess-v2').checked);assert(node(h,'weapon-arrow').checked);
  click(h,'prepare-start-button');await h.flush();assertDungeon();
  const previousGame=h.run('game');quiet(h);h.run('game.status="dead";');h.tick();click(h,'restart-button');await h.flush();
  assertDungeon();assert.notEqual(h.run('game'),previousGame,'restart creates a fresh instance of the same dungeon');
  h.run('home();');click(h,'start-button');selectMode(h,'world');assert.match(node(h,'prepare-summary').textContent,/苍翠断脊.*公主.*翠羽飞矢/);
  click(h,'prepare-start-button');await h.flush();assertDestination(h,worlds[1]);assert.equal(h.run('game.hero.id'),'princess');assert.equal(h.run('game.initialWeaponId'),'arrow');
}

// Invalid or unavailable destinations retain independent loadout preferences.
// Valid selections always store the current canonical world identity.
for(const worldId of [undefined,null,'snow','missing','__proto__',['verdant-rift'],{}]){
  const storage=new Map([['wild-echoes-setup',JSON.stringify({mode:'world',worldId,heroId:'elder',appearanceId:'elder-v2',weaponId:'orbit'})]]);
  const h=harness('',{storage,coarse:true});click(h,'start-button');assert(node(h,'world-rift-forest').checked);assert(node(h,'hero-elder-v2').checked);assert(node(h,'weapon-orbit').checked);
  click(h,'prepare-start-button');await h.flush();assertDestination(h,worlds[0]);assert.equal(h.run('game.initialWeaponId'),'orbit');assert.equal(saved(h).worldId,'rift-forest');
}

// Browsing and keyboard focus reveal a card without selecting it. Resizing
// preparation preserves state; only a radio change selects the other world.
{
  const h=harness(),rail=node(h,'world-options');rail.clientWidth=168;rail.scrollWidth=346;
  rail.children.forEach((card,index)=>{card.offsetLeft=index*178;card.offsetWidth=168;});
  click(h,'start-button');node(h,'world-verdant-rift').focus();assert.equal(h.run('selectedWorldId'),'rift-forest');assert(rail.scrollLeft>0);
  selectWorld(h,'verdant-rift');
  for(const [width,height] of [[320,568],[393,717],[844,390],[1440,900]]){
    h.resize(width,height);assert.equal(h.run('selectedWorldId'),'verdant-rift');assert(node(h,'world-verdant-rift').checked);assert.equal(node(h,'prepare-start-button').disabled,false);
  }
  assert(!h.fire(rail,'touchstart').defaultPrevented);assert(!h.fire(rail,'touchmove').defaultPrevented);
}
console.log('World selection: five authored destinations including the remade marsh, full-map previews, launch/restart identity, distinct layouts and spawns, complete ember encounter and fixed-site ownership, 540 camera, remembered independent preferences, invalid-selection fallback, non-selecting focus and resize state passed (VM DOM / mocked Canvas).');
