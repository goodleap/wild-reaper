import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';

const storageKey='wild-echoes-debug-options';
const defaults={fullLoadout:false,extraGold:true,fastMovement:true,zeroStormCooldown:true,testFacilities:true,allBosses:false,allMonsters:false};
const disabled=Object.fromEntries(Object.keys(defaults).map(id=>[id,false]));
const node=(h,id)=>h.document.getElementById(id);
const click=(h,id)=>h.fire(node(h,id),'click');
const state=(h,expression)=>JSON.parse(h.run(`JSON.stringify(${expression})`));
const change=(h,id,checked)=>{const input=node(h,`debug-option-${id}`);input.checked=checked;h.fire(input,'change');};
const start=async h=>{click(h,'prepare-start-button');await h.flush();assert(h.run('game'),'the actual preparation flow creates a game');};

// Both old and new entry links expose the same defaults. A URL does not
// silently select a maxed loadout, even through the asynchronous start path.
for(const search of ['?debug','?debug=full']){
  const h=harness(search);click(h,'start-button');
  assert(!node(h,'debug-prepare-settings').classList.contains('hidden'));
  assert.equal(node(h,'debug-prepare-options').children.length,7);
  assert.match(node(h,'debug-prepare-details').textContent,/自动选首项.*木桩.*城堡/);
  assert(!/设施[^；。]*首领/.test(node(h,'debug-prepare-details').textContent),'nearby fixtures no longer promise a bundled boss');
  assert.match(node(h,'debug-option-allBosses-description').textContent,/10 万|100000|100,000/);
  assert.match(node(h,'game-version').textContent,/ · DEBUG$/);
  assert(!node(h,'game-version').textContent.includes('FULL'));
  for(const [id,checked] of Object.entries(defaults)){
    const input=node(h,`debug-option-${id}`);
    assert.equal(input.checked,checked);assert.equal(input.type,'checkbox');assert.equal(input.getAttribute('role'),'switch');
    assert(node(h,input.getAttribute('aria-describedby')).textContent.length>0);
    assert(!h.listeners[`${input.id}:touchstart`]&&!h.listeners[`${input.id}:touchmove`]);
  }
  await start(h);assert.deepEqual(state(h,'game.debugOptions'),defaults);
  assert.equal(h.run('game.debugFull'),false);
  assert.deepEqual(state(h,'game.build.getWeaponLoadout().filter(item=>item.equipped).map(item=>({id:item.id,level:item.level}))'),[{id:'sword',level:1}]);
}

// Choices are independent, survive a new page, and become a per-run snapshot.
const storage=new Map(),chosen={...disabled,fullLoadout:true,allBosses:true,allMonsters:true};
{
  const h=harness('?debug',{storage});click(h,'start-button');
  for(const [id,checked] of Object.entries(chosen))change(h,id,checked);
  assert.deepEqual(JSON.parse(storage.get(storageKey)),chosen);
  click(h,'prepare-back-button');click(h,'start-button');
  for(const [id,checked] of Object.entries(chosen))assert.equal(node(h,`debug-option-${id}`).checked,checked);
  const restored=harness('?debug',{storage});click(restored,'start-button');
  for(const [id,checked] of Object.entries(chosen))assert.equal(node(restored,`debug-option-${id}`).checked,checked);
  await start(restored);assert.deepEqual(state(restored,'game.debugOptions'),chosen);assert.equal(restored.run('game.debugFull'),true);
  assert.equal(restored.run('game.gold'),0,'turning off starter gold does not inherit the debug default');
  assert.equal(restored.run('game.companions.members.length'),0,'full equipment does not automatically recruit companions');
  assert.equal(restored.run('characterPanelHTML(game,"attributes").includes("移动速度 ×3")'),false);
  assert.equal(restored.run('characterPanelHTML(game,"attributes").includes("天雷无冷却")'),false);
  change(restored,'fastMovement',true);
  assert.deepEqual(state(restored,'game.debugOptions'),chosen,'changing saved preparation choices cannot mutate a running game');
  assert.match(node(restored,'toast').textContent,/调试设置已生效/);
}

// A normal entry cannot inherit any remembered boost or modify debug choices.
{
  const before=storage.get(storageKey),h=harness('',{storage});click(h,'start-button');
  assert(node(h,'debug-prepare-settings').classList.contains('hidden'));
  assert.equal(node(h,'debug-prepare-options').children.length,0);
  await start(h);assert.deepEqual(state(h,'game.debugOptions'),disabled);
  assert.equal(h.run('game.debug'),false);assert.equal(h.run('game.debugFull'),false);assert.equal(h.run('game.gold'),0);
  assert.equal(storage.get(storageKey),before);
}

// Corrupt/unavailable browser storage must leave a usable preparation screen.
{
  const {allBosses,allMonsters,...oldChoices}=defaults;
  const legacyStorage=new Map([[storageKey,JSON.stringify({...oldChoices,enemyWave:true})]]);
  const h=harness('?debug',{storage:legacyStorage});click(h,'start-button');
  assert.equal(h.document.querySelectorAll('#debug-option-enemyWave').length,0,'the removed wave has no preparation control');
  assert.equal(h.run('Object.hasOwn(selectedDebugOptions,"enemyWave")'),false,'stored legacy wave preference is discarded');
  await start(h);
  assert.equal(h.run('Object.hasOwn(game.debugOptions,"enemyWave")'),false);
  assert.equal(h.run('game.enemies.some(enemy=>enemy.debugWave)'),false,'an old true preference cannot spawn a wave');
  change(h,'extraGold',false);
  assert.equal(Object.hasOwn(JSON.parse(legacyStorage.get(storageKey)), 'enemyWave'),false,'the next preference save drops the retired key');
  assert.equal(node(h,'debug-option-allBosses').checked,false);assert.equal(node(h,'debug-option-allMonsters').checked,false,'older saved preferences do not opt into continuous spawning');
}
for(const storage of [new Map([[storageKey,'{invalid']]),{get(){throw Error('storage denied');},set(){throw Error('storage denied');}}]){
  const h=harness('?debug',{storage});click(h,'start-button');
  assert.deepEqual(state(h,'selectedDebugOptions'),defaults);
  change(h,'fullLoadout',true);assert.equal(node(h,'debug-option-fullLoadout').checked,true);
}
console.log('Debug preparation: native accessible switches, legacy-link defaults, independent remembered choices, immutable run settings, normal-game isolation and storage failure fallback passed (VM DOM / mocked Canvas).');
