import assert from 'node:assert/strict';
import { EXPEDITIONS } from './dist/expedition-definitions.js';
import { STAGES } from './dist/stage-definitions.js';
import { harness, html } from './qa-app-harness.mjs';

// Real shipped event handlers and Game/build/archive state. Canvas is mocked;
// scroll dimensions below are fixtures, not a browser/device layout assertion.
const node=(h,id)=>h.document.getElementById(id);
const click=(h,id)=>{const target=node(h,id);h.listeners['document:pointerdown']?.({target,pointerType:'mouse'});target.focus();h.fire(target,'click',{detail:1});h.run(`focusNavigation.settlePointerAction({target:$(${JSON.stringify(id)}),detail:1});`);};
const selected=(h,expression)=>JSON.parse(h.run(`JSON.stringify(${expression})`));
const quiet=h=>h.run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.regionGrace=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
const choose=(h,group,id)=>{
  const ids=group==='stage'?STAGES.map(stage=>stage.id):group==='weapon'?['sword','orbit','arrow']:group==='mode'?['world','dungeon']:group==='hero'?['traveler-v2','princess-v2','elder-v2']:EXPEDITIONS.map(item=>item.id);
  for(const value of ids)node(h,`${group}-${value}`).checked=value===id;
  h.fire(node(h,`${group}-${id}`),'change');
};
const key=(h,code,target=node(h,'game-canvas'))=>{const event={code,key:code,repeat:false,target,preventDefault(){this.defaultPrevented=true;}};h.listeners['window:keydown'](event);return event;};
const equipment=h=>selected(h,'game.build.getWeaponLoadout().filter(item=>item.equipped).map(item=>({id:item.id,level:item.level}))');

assert.deepEqual(EXPEDITIONS.map(item=>item.id),['survival','ship','moon']);
assert.match(html,/<button id="start-button"[^>]*>[\s\S]*?<span>开始游戏<\/span>/);
{
  const h=harness(),prepare=node(h,'prepare-screen');
  assert.equal(prepare.classList.contains('modal-layer'),false,'preparation is an independent full-screen view');
  assert.equal(prepare.getAttribute('aria-labelledby'),'prepare-title');
  assert.equal(node(h,'debug-prepare-settings').tagName,'DETAILS');assert.equal(node(h,'debug-prepare-settings').hasAttribute('open'),false);
  const sections=node(h,'prepare-body').querySelectorAll('fieldset').map(item=>item.id||item.className);
  assert(sections.indexOf('stage-picker')<sections.indexOf('hero-picker')&&sections.indexOf('hero-picker')<sections.indexOf('weapon-picker'));
  assert.equal(h.run('game'),null);assert.equal(h.run('archive.data.totals.runs'),0);
  click(h,'start-button');
  assert.equal(h.run('prepareOpen'),true);assert.equal(h.run('game'),null);
  assert.equal(node(h,'intro').classList.contains('hidden'),true);assert.equal(prepare.classList.contains('hidden'),false);
  assert.equal(node(h,'arena').classList.contains('preparing'),true);
  assert.equal(h.run('archive.data.totals.runs'),0,'opening setup never starts or records a run');
  assert.equal(node(h,'world-mode-title').textContent,'裂谷林海');
  assert.equal(node(h,'world-preview').getAttribute('role'),'img');
  assert.match(node(h,'world-preview').getAttribute('aria-label'),/中央湖泊.*双桥/);
  assert.equal(node(h,'world-preview').width/node(h,'world-preview').height,4/3,'world preview contains the complete authored map');
  const worldCard=node(h,'world-rift-forest').parentElement;
  assert.equal(worldCard.textContent,'裂谷林海','world cards keep only the preview and name');
  assert(node(h,'world-rift-forest').checked,'the available world is selected');
  assert.equal(worldCard.parentElement.id,'world-options','world cards have their own browsing rail');
  assert.equal(worldCard.querySelectorAll('details').length,0,'details do not expand inside a card');
  assert.equal(node(h,'world-mode-note').querySelector('details').parentElement.id,'world-mode-note','world details sit beneath the rail');
  assert.match(node(h,'prepare-summary').textContent,/裂谷林海.*帅气王子/);
  assert.equal(h.run('createRiftLayout().areas.length'),18,'preview reads the fixed world layout without starting a Game');
  assert(!node(h,'world-mode-note').querySelector('details').hasAttribute('open'),'world explanation remains folded');
  h.tick();const prepareDraws=h.run('introDraws'),prepareClock=h.run('clock');
  for(let i=0;i<5;i++)h.tick();
  assert.equal(h.run('introDraws'),prepareDraws,'the preparation background retains its frame');
  assert.equal(h.run('clock'),prepareClock,'preparation does not keep the title scene animation running');
  assert.equal(node(h,'stage-options').children.length,STAGES.length+EXPEDITIONS.length);assert.equal(node(h,'weapon-options').children.length,3);
  for(const canvas of node(h,'stage-options').querySelectorAll('canvas'))assert.equal(canvas.width/canvas.height,4/3,'all dungeon previews use the same map frame');
  assert.equal(prepare.querySelectorAll('canvas[data-world-archive-art]').length,STAGES.length);
  assert.equal(prepare.querySelectorAll('canvas[data-archive-art]').length,3);
  assert(h.drawImages()>0,'real theme portrait helpers draw into the mocked canvas');

  choose(h,'mode','dungeon');choose(h,'stage','snow-trial');choose(h,'weapon','arrow');
  const setup=JSON.parse(h.storage.get('wild-echoes-setup'));
  assert.deepEqual(setup,{mode:'dungeon',worldId:'forest',dungeonId:null,stageId:'snow-trial',weaponId:'arrow',heroId:'traveler',appearanceId:'traveler-v2'});
  assert.match(node(h,'prepare-summary').textContent,/雪原试炼.*帅气王子.*翠羽飞矢/);
  for(const id of ['prepare-archive-button','prepare-help-button']){
    click(h,id);assert.equal(h.run('prepareOpen'),true);key(h,'Escape');
    assert.equal(h.document.activeElement,prepare);assert.equal(h.run('prepareOpen'),true);
    assert.equal(h.run('game'),null);assert.equal(h.run('archive.data.totals.runs'),0);
  }
  const images=h.drawImages();click(h,'prepare-back-button');
  assert.equal(h.run('prepareOpen'),false);assert.equal(h.document.activeElement.id,'intro');
  click(h,'start-button');assert.equal(h.drawImages(),images,'reopening reuses the static preparation portraits');
  const radio=node(h,'weapon-arrow');radio.focus();assert(key(h,'Escape',radio).defaultPrevented);
  assert.equal(h.run('prepareOpen'),false,'Escape works with focus in a radio, before the normal input guard');
  click(h,'start-button');
  assert.equal(h.run('game'),null);assert.equal(h.run('archive.data.totals.runs'),0);
  click(h,'prepare-start-button');await h.flush();quiet(h);
  assert.equal(h.run('prepareOpen'),false);assert.equal(prepare.classList.contains('hidden'),true);
  assert.equal(h.run('game.initialWeaponId'),'arrow');assert.deepEqual(equipment(h),[{id:'arrow',level:1}]);
  assert.equal(h.run('game.stage.id'),'snow-trial');assert.equal(h.run('game.difficulty'),'normal');
  assert.equal(h.run('archive.data.totals.runs'),1);assert.equal(h.run('!!archive.data.entries["weapon:arrow"]'),true);
  assert.equal(h.run('!!archive.data.entries["weapon:sword"]'),false,'previewing weapons does not unlock unchosen weapons');

  h.run('game.build.increment("orbit");game.build.increment("orbit");game.build.increment("sword");game.build.increment("arrow");game.build.setEquipped("arrow",false);game.status="dead";');h.tick();
  click(h,'restart-button');await h.flush();quiet(h);
  assert.equal(h.run('game.initialWeaponId'),'arrow');assert.deepEqual(equipment(h),[{id:'arrow',level:1}],'restart uses the selected starter, not the strongest or currently equipped weapon');
  assert.equal(h.run('archive.data.totals.runs'),2);
  h.run('home();');click(h,'start-button');
  assert.equal(node(h,'weapon-arrow').checked,true);assert.equal(node(h,'stage-snow-trial').checked,true);
  assert.equal(h.run('archive.data.totals.runs'),2,'returning to preparation does not count another run');
}

// Arrow buttons and native scrolling only browse cards; selection requires a
// change event. Keyboard-focused cards are revealed without changing selection.
{
  const h=harness(),rail=node(h,'stage-options');
  rail.clientWidth=325;rail.scrollWidth=(STAGES.length+EXPEDITIONS.length)*140;
  rail.children.forEach((card,index)=>{card.offsetLeft=index*140;card.offsetWidth=128;});
  click(h,'start-button');choose(h,'mode','dungeon');assert(node(h,'stage-prev-button').disabled);assert(!node(h,'stage-next-button').disabled);
  const before=h.run('selectedStageId');click(h,'stage-next-button');
  assert(rail.scrollLeft>0);assert.equal(h.run('selectedStageId'),before);assert(!node(h,'stage-prev-button').disabled);
  rail.scrollLeft=rail.scrollWidth-rail.clientWidth;h.fire(rail,'scroll');
  assert(node(h,'stage-next-button').disabled);assert.equal(h.run('selectedStageId'),before);
  node(h,'stage-volcano-trial').focus();assert.equal(h.run('selectedStageId'),before);
  choose(h,'stage','volcano-trial');assert.equal(h.run('selectedStageId'),'volcano-trial');
  assert(rail.scrollLeft+rail.clientWidth>=rail.children.at(-1).offsetLeft+rail.children.at(-1).offsetWidth);
  for(const id of ['arena','prepare-screen','prepare-body','stage-options','world-options','weapon-options']){
    assert(!h.listeners[`${id}:touchstart`]&&!h.listeners[`${id}:touchmove`],`${id} has no broad default-preventing touch handler`);
    assert(!h.fire(node(h,id),'touchstart').defaultPrevented);assert(!h.fire(node(h,id),'touchmove').defaultPrevented);
  }
  for(const [width,height] of [[320,568],[844,390],[393,717],[1440,900]]){
    h.resize(width,height);assert.equal(h.run('prepareOpen'),true);assert.equal(h.run('selectedStageId'),'volcano-trial');
    assert.equal(node(h,'prepare-start-button').disabled,false);assert.equal(h.run('game'),null);
  }
  choose(h,'mode','world');assert(node(h,'stage-picker').classList.contains('hidden'));
  choose(h,'mode','dungeon');assert.equal(node(h,'stage-volcano-trial').checked,true);
  choose(h,'weapon','orbit');click(h,'prepare-start-button');await h.flush();quiet(h);
  const canvas=node(h,'game-canvas');
  assert(h.fire(canvas,'touchstart').defaultPrevented,'only live gameplay canvas retains its scoped callout fallback');
  h.fire(canvas,'pointerdown',{pointerId:42,clientX:80,clientY:220});
  h.fire(canvas,'pointermove',{pointerId:42,clientX:115,clientY:220});
  assert(h.run('touch?.id===42&&touch.dx>0'),'normal joystick dragging works after preparation');
  h.fire(canvas,'pointerup',{pointerId:42});assert.equal(h.run('touch'),null);
}

// Old setup records, invalid input and all starter choices share one path.
for(const saved of [{},{weaponId:'obsolete'},{weaponId:null},{weaponId:['arrow']}]){
  const h=harness('',{storage:new Map([['wild-echoes-setup',JSON.stringify(saved)]])});
  click(h,'start-button');assert.equal(node(h,'weapon-sword').checked,true);
  click(h,'prepare-start-button');await h.flush();assert.deepEqual(equipment(h),[{id:'sword',level:1}]);
}
for(const weaponId of ['sword','orbit','arrow']){
  const storage=new Map([['wild-echoes-setup',JSON.stringify({mode:'free',difficulty:'normal',stageId:'beach-trial',weaponId})]]);
  const h=harness('',{storage});click(h,'start-button');assert.equal(node(h,`weapon-${weaponId}`).checked,true);
  click(h,'prepare-start-button');await h.flush();assert.equal(h.run('game.stage'),null);assert.deepEqual(equipment(h),[{id:weaponId,level:1}]);
  const loaded=harness('',{storage});click(loaded,'start-button');assert.equal(node(loaded,`weapon-${weaponId}`).checked,true);
}
console.log('Adventure preparation: real open/back/start/restart, no preview archive runs, remembered mode/destination/starter, old save fallback, portrait reuse, horizontal browsing, radio Escape, short viewport state and live joystick passed (VM DOM / mocked Canvas).');

// Modes share character and starter choices. New destinations launch and
// restart their actual runtime, while legacy difficulty is discarded.
assert.doesNotMatch(html,/id="difficulty-(normal|casual)"|id="hero-preview-[^"]*"|动作预览/);
for(const expedition of EXPEDITIONS){
  const storage=new Map([['wild-echoes-setup',JSON.stringify({mode:'free',difficulty:'casual',heroId:'princess',appearanceId:'princess',weaponId:'orbit'})]]);
  const h=harness('',{storage});click(h,'start-button');
  assert.equal(node(h,'mode-world').checked,true);assert.equal(node(h,'prepare-start-label').textContent,'开始探索');
  assert(node(h,'stage-picker').classList.contains('hidden'));assert(!node(h,'world-mode-note').classList.contains('hidden'));
  choose(h,'mode','dungeon');choose(h,'dungeon',expedition.id);
  const card=node(h,`dungeon-${expedition.id}`).parentElement.textContent;
  assert.equal(card,expedition.name,'destination cards keep only their preview and name');
  const details=node(h,'stage-description');
  for(const text of [expedition.summary,expedition.objective,expedition.rewardLabel])assert(details.textContent.includes(text));
  assert.equal(details.parentElement.tagName,'DETAILS');assert(!details.parentElement.hasAttribute('open'),'destination details start folded');
  assert.equal(node(h,'stage-picker').getAttribute('aria-describedby'),details.id);
  choose(h,'mode','world');choose(h,'mode','dungeon');
  assert(node(h,`dungeon-${expedition.id}`).checked);assert(node(h,'hero-princess-v2').checked);assert(node(h,'weapon-orbit').checked);
  assert.equal(node(h,'prepare-start-label').textContent,'进入副本');
  click(h,'prepare-start-button');await h.flush();quiet(h);
  assert.equal(h.run('game.mode'),'dungeon');assert.equal(h.run('game.dungeonId'),expedition.id);assert.equal(h.run('game.expedition.id'),expedition.id);
  assert.equal(h.run('game.difficulty'),'normal');assert.equal(h.run('game.hero.id'),'princess');assert.equal(h.run('game.appearanceId'),'princess-v2');
  assert.equal(Object.hasOwn(JSON.parse(storage.get('wild-echoes-setup')),'difficulty'),false);
  h.run('game.status="dead"');h.tick();click(h,'restart-button');await h.flush();
  assert.equal(h.run('game.dungeonId'),expedition.id);assert.equal(h.run('game.initialWeaponId'),'orbit');
  const loaded=harness('',{storage});click(loaded,'start-button');assert(node(loaded,`dungeon-${expedition.id}`).checked);
}
console.log('Preparation modes: world default, all three expedition starts/restarts, shared hero/starter, compact cards with accessible folded details, legacy appearance/difficulty migration and removed preview passed.');

for(const dungeonId of ['missing',{},['moon']]){
  const h=harness('',{storage:new Map([['wild-echoes-setup',JSON.stringify({mode:'dungeon',dungeonId,difficulty:'casual'})]])});
  assert(node(h,'mode-dungeon').checked);assert(node(h,'dungeon-survival').checked);click(h,'start-button');click(h,'prepare-start-button');await h.flush();
  assert.equal(h.run('game.dungeonId'),'survival');assert.equal(h.run('game.difficulty'),'normal');
}
