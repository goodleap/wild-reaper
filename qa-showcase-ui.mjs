import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { DEBUG_OPTION_DEFS,normalizeDebugOptions,normalizeDebugRunOptions } from './dist/debug-mode.js';
import { characterSprites } from './dist/character-sprites.js';

await characterSprites.preload({load:async(url,atlas)=>({width:atlas.width,height:atlas.height})});
const node=(h,id)=>h.document.getElementById(id),click=(h,id)=>h.fire(node(h,id),'click');
const option=(h,id,value)=>{const input=node(h,`debug-option-${id}`);input.checked=value;h.fire(input,'change');};
const selected=Object.fromEntries(DEBUG_OPTION_DEFS.map(def=>[def.id,true]));
assert.deepEqual(normalizeDebugOptions(selected),selected,'saved switches are not overwritten by showcase exclusions');
const run=normalizeDebugRunOptions(selected);assert(run.characterShowcase&&run.fastMovement);
for(const key of ['fullLoadout','extraGold','zeroStormCooldown','testFacilities','allBosses','allMonsters'])assert.equal(run[key],false);
assert.equal(normalizeDebugRunOptions(selected,false).characterShowcase,false);

for(const mode of ['world','dungeon','story']){
  const h=harness('?debug',{coarse:mode==='world'});click(h,'start-button');
  const radio=node(h,`mode-${mode}`);radio.checked=true;h.fire(radio,'change');
  for(const key of Object.keys(selected))option(h,key,true);
  assert.equal(node(h,'prepare-start-label').textContent,'进入角色展示');
  assert(!node(h,'debug-prepare-settings').classList.contains('hidden'));
  h.run(`
    const showcaseWrites=[];
    for(const method of ['begin','observe','finish','checkpoint','recordRecruit','recordDefeat','recordStoryCompletion'])archive[method]=()=>showcaseWrites.push(method);
    worldSave.attach=()=>{throw Error('showcase cannot attach world progress');};
    worldMap.discover=()=>{throw Error('showcase cannot discover the campaign map');};
    worldMap.draw=()=>{throw Error('showcase cannot draw the campaign minimap');};
    accountAllowsPlay=()=>false;
  `);
  click(h,'prepare-start-button');await h.flush();
  assert.equal(h.run('game?.mode'),'showcase',`${mode} preparation can enter showcase without opening an account`);
  assert(h.run('!!game.showcase'));assert.equal(h.run('game.worldSave'),undefined);
  assert(node(h,'arena').classList.contains('showcase-mode'));
  assert.equal(node(h,'showcase-sections').children.length,5);
  assert.match(node(h,'showcase-count').textContent,/种形象/);
  assert(node(h,'game-bottom').classList.contains('hidden'));
  assert.equal(h.run('game.debugOptions.allMonsters'),false);assert.equal(h.run('game.debugOptions.allBosses'),false);
  assert.deepEqual(JSON.parse(h.storage.get('wild-echoes-debug-options')),selected);

  h.run(`openMap();openCharacter();requestSkill();requestPortal();requestContextAction();debugArmyAction(true);`);
  assert.equal(h.run('mapOpen||characterOpen||skillRequested||portalRequested'),false);
  assert.equal(h.run('game.companions.members.length'),0);
  const oldY=h.run('game.player.y');click(h,'showcase-section-bosses');
  assert.notEqual(h.run('game.player.y'),oldY);
  assert.equal(h.document.activeElement,node(h,'game-canvas'),'jump button does not retain pointer focus');
  h.run(`keys.add('KeyD');const showcaseX=game.player.x;updateGameFrame(.05);clearInput();shippedRenderGame();`);
  assert(h.run('game.player.x>showcaseX'),'normal keyboard movement remains usable');
  click(h,'pause-button');assert.equal(node(h,'quit-button').textContent,'返回首页');
  assert(node(h,'debug-recruit-army').disabled&&node(h,'debug-dismiss-army').disabled);
  click(h,'resume-button');
  h.run('checkpointArchive();observeArchive();');
  const setup=h.storage.get('wild-echoes-setup');
  h.run('restartGame();');await h.flush();
  assert.equal(h.run('selectedMode'),mode,'restarting showcase preserves the selected ordinary adventure mode');
  assert.equal(h.storage.get('wild-echoes-setup'),setup);
  h.run('home();');assert.equal(h.run('game'),null);
  assert(!node(h,'arena').classList.contains('showcase-mode'));
  assert(node(h,'showcase-toolbar').classList.contains('hidden'));
  assert.equal(h.run('showcaseWrites.length'),0,'start, view, pause, restart and exit do not change account/archive progress');
}

const ordinary=harness('',{storage:new Map([['wild-echoes-debug-options',JSON.stringify(selected)]])});
click(ordinary,'start-button');assert(node(ordinary,'debug-prepare-settings').classList.contains('hidden'));
assert(!ordinary.run('selectedDebugOptions.characterShowcase'));
assert.notEqual(node(ordinary,'prepare-start-label').textContent,'进入角色展示');
console.log('Showcase UI passed: debug-only entry across all preparation modes, run-only exclusions, five section controls, actual render/input, no account/archive writes, safe restart/home and ordinary-mode isolation.');
