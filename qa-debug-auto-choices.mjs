import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';

for(const search of ['', '?debug']){
  const h=harness(search);
  h.run('startGame();');await h.flush();h.run('game.crystals=game.crystalsNext;game._trySkillUpgrade();');
  h.tick();
  assert.equal(h.run('game.progressionTier'),1);
  assert.equal(h.nodes['upgrade-overlay'].classList.contains('hidden'),false,'ordinary runs keep manual choices');
}

const h=harness('?debug=full');
h.run('startGame();');await h.flush();h.run(`game.crystals=game.crystalsNext;game._trySkillUpgrade();
  let selected=[];const chooseUpgrade=game.chooseUpgrade.bind(game);
  game.chooseUpgrade=id=>{const ok=chooseUpgrade(id);if(ok)selected.push(id);return ok;};
  const firstUpgrade=game.getUpgradeChoices()[0].id;keys.add('KeyD');`);
h.tick();
assert.equal(h.run('selected[0]'),h.run('firstUpgrade'));
assert.equal(h.run('game.progressionTier'),2);
assert.equal(h.run('game.crystals'),0,'auto selection pays the normal cost exactly once');
assert(h.run("keys.has('KeyD')"),'auto selection preserves held movement');
assert(h.nodes['upgrade-overlay'].classList.contains('hidden'));

h.run(`game.relics.offer();game.status='relic';const firstRelic=game.getRelicChoices()[0].id;`);
h.tick();
assert(h.run('game.relics.has(firstRelic)'));
assert.equal(h.run('game.relics.pending'),false);
assert(h.nodes['relic-overlay'].classList.contains('hidden'));

h.run(`const rewardPortal=game.regions.portals[0];game.regions.rewardPortal=rewardPortal;
  game.superSkills.offer('region',game.region.id);game.status='super';
  const firstSuper=game.getSuperChoices()[0].id;const superChoices=[];
  const chooseSuper=game.chooseSuper.bind(game);game.chooseSuper=id=>{const ok=chooseSuper(id);if(ok)superChoices.push(id);return ok;};`);
h.tick();
assert.equal(h.run('superChoices[0]'),h.run('firstSuper'));
assert(h.run('rewardPortal.rewardClaimed'),'auto boss reward completes its normal world transaction');
assert(h.nodes['super-overlay'].classList.contains('hidden'));

h.run(`game.crystals=0;game.status='shop';const beforeGold=game.gold;settleDebugChoices();`);
assert.equal(h.run('game.status'),'shop');
assert.equal(h.run('game.gold'),h.run('beforeGold'),'debug full never buys automatically');
h.run(`game.status='playing';game.crystals=game.crystalsNext;game._trySkillUpgrade();pause();`);
const tier=h.run('game.progressionTier');h.tick();assert.equal(h.run('game.progressionTier'),tier,'pause retains pending reward');
h.nodes['close-pause'].onclick();h.tick();assert.equal(h.run('game.progressionTier'),tier+1);

h.run(`game.status='playing';game.crystals=Array.from({length:20},(_,i)=>game.progression.costForTier(game.progressionTier+i)).reduce((a,b)=>a+b,0);game._trySkillUpgrade();`);
const batchTier=h.run('game.progressionTier');h.tick();
assert(h.run('game.progressionTier')>batchTier&&h.run('game.progressionTier')<batchTier+20,'large grants leave frame budget for input');
h.tick();assert.equal(h.run('game.progressionTier'),batchTier+20,'remaining choices continue without a visible modal');
assert(h.nodes['upgrade-overlay'].classList.contains('hidden'));
console.log('Debug auto choices: first offers, normal costs, held movement, boss/relic transactions, manual shop/pause and bounded batches passed.');
