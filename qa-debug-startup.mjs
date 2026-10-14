import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';

// Keep ordinary spawning and the debug fixtures active: isolated combat tests
// that disable spawns cannot catch catalog lookups across this boundary.
for(const {search,fullLoadout=false} of [{search:''},{search:'?debug'},{search:'?debug=full'},{search:'?debug',fullLoadout:true}]){
  const h=harness(search);
  h.nodes['start-button'].onclick();
  if(fullLoadout){const toggle=h.document.getElementById('debug-option-fullLoadout');toggle.checked=true;h.fire(toggle,'change');}
  h.nodes['prepare-start-button'].onclick();
  await h.flush();
  const game=h.run('game');
  assert(game&&game.status==='playing',`${search||'ordinary'} starts successfully`);
  assert.equal(game.enemies.some(enemy=>enemy.trainingDummy),!!search);
  assert.equal(game.debugFull,fullLoadout,'the preparation setting alone enables the full loadout');
  assert.equal(game.enemies.some(enemy=>enemy.debugWave),false,'a debug URL does not enable the optional wave');
  // Use the shipped draw pass as well as the real app update/RAF handler.
  // Canvas commands run in the VM mock; this is not a browser/FPS test.
  h.run('renderGame=shippedRenderGame;');
  for(let frame=0;frame<210;frame++){
    h.tick();
    if(!game.debugFull&&game.status==='upgrade'){
      const card=h.nodes['upgrade-cards'].children[0];
      assert(card,'ordinary upgrade has a selectable card');
      card.onclick();
    }
  }
  assert(game.time>=3,`${search||'ordinary'} continues beyond the first spawn`);
  assert.equal(game.status,'playing');
  assert(Number.isFinite(game._spawn),'ordinary spawning remains enabled');
  if(search)assert(game.enemies.some(enemy=>enemy.trainingDummy),'training fixture remains present');
}
console.log('Startup: ordinary, debug, legacy debug link and prepared full loadout survive first spawns with shipped update/render callbacks for at least three seconds (VM Canvas).');
