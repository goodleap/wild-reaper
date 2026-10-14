import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { Game } from './dist/engine.js';
import { WORLD_IDS } from './dist/world-definitions.js';
import { debugConfigFromSearch } from './dist/debug-mode.js';

assert.deepEqual(debugConfigFromSearch('?world=volcano'),{enabled:false,full:false});
assert.equal(new Game({debugWorld:'volcano'}).region.id,'forest');
assert.equal(new Game({debug:true,debugWorld:'unknown'}).region.id,'forest');
const h=harness('?debug&world=beach');h.nodes['start-button'].onclick();h.nodes['prepare-start-button'].onclick();
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
console.log('World integration: debug query isolation, eight world identities, mobile/desktop draw paths, live updates, expanded maps and bounded initial pressure passed (mock canvas; no GPU/FPS claim).');
