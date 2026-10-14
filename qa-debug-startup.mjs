import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { BOSS_DEFS } from './dist/boss-definitions.js';
import { DEBUG_BOSS_ROSTER } from './dist/debug-training.js';

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
  assert.equal(game.enemies.some(enemy=>enemy.debugWave),false,'the removed opening wave is never created');
  assert.equal(game.enemies.some(enemy=>enemy.debugBoss),false,'nearby debug fixtures no longer add an unsolicited boss');
  assert.equal(game.debugOptions.allBosses,false);assert.equal(game.debugOptions.allMonsters,false);
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

// Launch both added switches through the actual preparation DOM and render the
// resulting world/castle bosses and continuous stream with the shipped callback.
{
  const h=harness('?debug');h.nodes['start-button'].onclick();
  for(const id of ['allBosses','allMonsters']) {
    const toggle=h.document.getElementById(`debug-option-${id}`);toggle.checked=true;h.fire(toggle,'change');
  }
  h.nodes['prepare-start-button'].onclick();await h.flush();
  const game=h.run('game'),bosses=game.enemies.filter(e=>e.debugBoss);
  assert.equal(game.debugOptions.allBosses,true);assert.equal(game.debugOptions.allMonsters,true);
  assert.deepEqual(bosses.map(e=>e.debugBossId).sort(),DEBUG_BOSS_ROSTER.map(def=>def.id).sort());
  assert.equal(bosses.length,6);assert.deepEqual([...new Set(bosses.map(e=>e.bossKind))].sort(),Object.keys(BOSS_DEFS).sort());
  assert(bosses.every(e=>e.hp===100000&&e.maxHp===100000));
  h.run(`renderGame=shippedRenderGame;game.player.invuln=1e9;
    for(const id of Object.keys(game.build.weapons))game.build.setEquipped(id,false);game._refreshWeapons();
    const rosterProbe=game.enemies.find(e=>e.bossKind==='bloom'&&e.debugBoss);rosterProbe.x=game.player.x+80;rosterProbe.y=game.player.y;
    game.enemies=[rosterProbe,...game.enemies.filter(e=>e!==rosterProbe)];updateHUD();`);
  assert.equal(h.nodes['boss-name'].textContent,`${h.run('rosterProbe.name')} · 调试 · 10 万生命`);
  assert.equal(h.nodes['boss-hp'].textContent,'100%');assert(!h.nodes['boss-bar'].classList.contains('hidden'));
  h.tick();h.tick();assert(game.enemies.filter(e=>e.debugMonster).length>=64,'the first positive simulation frame immediately brings a substantial crowd');
  for(let frame=0;frame<60;frame++)h.tick();
  assert(game.enemies.filter(e=>e.debugMonster).length>=128,'selected stream continues densely through a second of actual app frames');
  const beforePause=game.enemies.filter(e=>e.debugMonster).length,streamTime=JSON.stringify(game._debugMonsterStream);
  h.nodes['pause-button'].onclick();for(let frame=0;frame<40;frame++)h.tick();
  assert.equal(game.enemies.filter(e=>e.debugMonster).length,beforePause);assert.equal(JSON.stringify(game._debugMonsterStream),streamTime);
  h.nodes['resume-button'].onclick();for(let frame=0;frame<40;frame++)h.tick();
  assert(game.enemies.filter(e=>e.debugMonster).length>beforePause,'resume continues the same stream');
}
console.log('Startup: ordinary, debug, legacy link/full loadout and both roster switches survive shipped update/render; six unique 100000-HP Boss combat kinds, correct HUD label, dense streaming and UI pause/resume passed (VM Canvas).');
