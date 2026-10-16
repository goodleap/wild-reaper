import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { Game } from './dist/engine.js';
import { WORLD_IDS } from './dist/world-definitions.js';
import { debugConfigFromSearch } from './dist/debug-mode.js';
import { cityArtLibrary } from './dist/city-art-library.js';
import { cityDetailArt, CITY_DETAIL_MANIFEST } from './dist/city-detail-art.js';
import { CITY_ART_ASSETS } from './dist/city-art-manifest.js';

// This suite runs the shipped drawing commands on a mock Canvas. Supply the
// image dimensions from the real manifests without skipping the city render.
function installCityImages(){
  for(const [library,assets]of [[cityDetailArt,CITY_DETAIL_MANIFEST.assets],[cityArtLibrary,CITY_ART_ASSETS]]){
    for(const [key,spec]of Object.entries(assets))library.images.set(key,Object.freeze({source:spec.path,naturalWidth:spec.width,naturalHeight:spec.height}));
  }
}
installCityImages();

assert.deepEqual(debugConfigFromSearch('?world=volcano'),{enabled:false});
assert.equal(new Game({debugWorld:'volcano'}).region.id,'forest');
assert.equal(new Game({debug:true,debugWorld:'unknown'}).region.id,'forest');
const h=harness('?debug&world=beach');h.nodes['start-button'].onclick();h.nodes['prepare-start-button'].onclick();await h.flush();
assert.equal(h.run('game.region.id'),'beach','URL starts the requested debug world');
assert.equal(h.run('game.environment.region'),'beach');
h.run('game.enemies=[];game.player.invuln=Infinity;game.player.xpNext=Infinity;game.crystalsNext=Infinity;');
h.tick();
for(const world of WORLD_IDS){
  h.run(`game=new Game({debug:true,debugWorld:${JSON.stringify(world)}});game.viewWidth=width;game.viewHeight=height;game.player.invuln=Infinity;game.player.xpNext=Infinity;game.crystalsNext=Infinity;`);
  const before=h.drawImages();
  for(const [w,height] of [[393,717],[1728,958]]){
    h.resize(w,height);h.run('updateHUD();shippedRenderGame();');
    h.run('game.player.x=650;game.player.y=440;game.environment._refresh(true);game.environment.worldHazards._refresh(true);');
    for(let i=0;i<20;i++)h.run('game.update(.05,{x:1,y:0});');
    h.run('shippedRenderGame();');
    assert(h.run('Number.isFinite(game.player.x)&&Number.isFinite(game.player.hp)'));
    h.run('worldMap.draw(ctx,game,{x:0,y:0,width,height,expanded:true});');
  }
  assert(h.drawImages()>before,`${world} renders cached art`);
  assert.equal(h.run('game.region.id'),world);
  assert.equal(h.run('game.adventure.region'),world);
  assert.equal(h.run('game.terrain.region'),world);
}
// Array ordering must not turn a direct debug visit into late-game pressure.
const g=new Game({debug:true,debugWorld:'volcano'});assert(g._difficultyTime()<70);assert(g._waveTier()<=2);
g.regions.unlockedConnections.add('0:1');assert(g._difficultyTime()>=45);

// The URL can override the preparation selection. Cold loading must use the
// resolved Game world and await its assets before the real first scene render.
for(const [search,selectedWorld,expectedWorld]of [['','clockshadow-city','clockshadow-city'],['?debug&world=clockshadow-city','forest','clockshadow-city'],['?debug&world=beach','clockshadow-city','beach']]){
  cityArtLibrary.images.clear();cityArtLibrary.sprites.clear();cityDetailArt.images.clear();
  let loads=0,draws=0,released=false,cold;
  const library=new Proxy(cityArtLibrary,{get(target,key){
    if(key==='preload')return()=>{
      loads++;assert.equal(cold.run('game'),null,'the previous scene is not replaced while city art loads');
      assert.equal(cold.run('archive.data.totals.runs'),0);
      assert(!cityArtLibrary.ready,'each city start begins with empty image caches');
      return new Promise(resolve=>{cold.run('setTimeout(releaseCityAssets,100)');release=()=>{installCityImages();released=true;resolve(cityArtLibrary);};});
    };
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  let release;
  cold=harness(search,{moduleOverrides:{cityArtLibrary:library,releaseCityAssets:()=>release(),assertSceneReady:()=>{
    if(expectedWorld==='clockshadow-city')assert(released&&cityArtLibrary.ready,'first render waits for decoded city art');draws++;
  }}});
  cold.nodes['start-button'].onclick();cold.run(`selectedWorldId=${JSON.stringify(selectedWorld)};renderGame=()=>{assertSceneReady();shippedRenderGame();};`);
  cold.nodes['prepare-start-button'].onclick();await cold.flush();
  assert.equal(cold.run('game.worldId'),expectedWorld);assert.equal(loads,expectedWorld==='clockshadow-city'?1:0);
  assert(draws>0,'startup warms the actual scene drawing path');assert.equal(cold.run('archive.data.totals.runs'),1);
  assert(!cold.nodes['scene-loading'].classList.contains('has-error'));assert(cold.nodes['scene-loading'].classList.contains('hidden'));
  cold.run("game.dispose('test-complete');");
}
console.log('World integration: all world identities, mobile/desktop shipped draws, live updates/maps, bounded initial pressure and cold city loading through normal/debug-overridden selections passed (mock canvas; no GPU/FPS claim).');
