import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';

// Exercise shipped UI handlers and state. Native browser Space-click behavior
// is emulated only when the handler leaves a real focused control unconsumed.
const node=(h,id)=>h.document.getElementById(id);
const settleActions=()=>new Promise(resolve=>setTimeout(resolve,0));
function key(h,code,extra={}){
  const event={code,key:code==='Space'?' ':code,repeat:false,target:h.document.activeElement||node(h,'game-canvas'),preventDefault(){this.defaultPrevented=true;},...extra};
  h.listeners['document:keydown']?.(event);h.listeners['window:keydown']?.(event);return event;
}
function click(h,id,{keyboard=false,touch=false,settle=true}={}){
  const target=node(h,id),detail=keyboard?0:1;
  if(keyboard)key(h,'Tab');else h.listeners['document:pointerdown']?.({target,pointerType:touch?'touch':'mouse'});
  target.focus();h.listeners['document:click']?.({target,detail});
  const event=h.fire(target,'click',{detail});
  // The VM DOM has no browser event loop. Flush the same post-dispatch policy
  // synchronously for existing assertions; separate cases below await the
  // installed capture listener's next event task, including stopped events.
  if(settle)h.run(`focusNavigation.settlePointerAction({target:$(${JSON.stringify(id)}),detail:${detail}});`);
  return event;
}
function space(h){
  const target=h.document.activeElement,event=key(h,'Space');
  h.listeners['window:keyup']?.({...event});
  if(!event.defaultPrevented&&target.tagName==='BUTTON')h.fire(target,'click',{detail:0});
  return event;
}
const panel=(h,id)=>node(h,id).querySelector('[role="dialog"]');
const quiet=h=>h.run('game.enemies=[];game._spawn=game.nextBossAt=Infinity;game.player.invuln=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;');

// Pointer navigation does not decorate a destructive/back control as selected.
// The opening source survives Escape, while a subsequent Tab remains usable.
const h=harness('?debug'),canvas=node(h,'game-canvas');
h.run('audio={state:"suspended",resume:()=>Promise.resolve()};');
click(h,'sound-button');assert.equal(h.document.activeElement,node(h,'intro'));
const soundSelected=node(h,'sound-button').getAttribute('aria-pressed');
space(h);assert.equal(node(h,'sound-button').getAttribute('aria-pressed'),soundSelected,'pointer sound toggle cannot remain the Space target');
click(h,'start-button',{touch:true});assert.equal(h.document.activeElement,node(h,'prepare-screen'));
assert.equal(h.run('prepareOpen'),true);assert.equal(node(h,'mode-world').checked,true);
click(h,'prepare-help-button',{touch:true});assert.equal(h.document.activeElement,panel(h,'help-overlay'));
key(h,'Escape');assert.equal(h.document.activeElement,node(h,'prepare-screen'));assert(h.run('prepareOpen'));
click(h,'prepare-archive-button',{touch:true});key(h,'Escape');assert.equal(h.document.activeElement,node(h,'prepare-screen'));
key(h,'Escape');assert.equal(h.document.activeElement,node(h,'intro'));assert(!h.run('prepareOpen'));
click(h,'start-button',{keyboard:true});assert.equal(h.document.activeElement,node(h,'prepare-back-button'));
key(h,'Escape');assert.equal(h.document.activeElement,node(h,'start-button'));
click(h,'start-button');click(h,'prepare-start-button');await h.flush();quiet(h);assert.equal(h.document.activeElement,canvas);

// Map and details share one return policy; both pointer close and Escape must
// hand Space back to combat instead of natively clicking the prior HUD button.
for(const [trigger,overlay,done,flag] of [['map-button','map-overlay','map-done','mapOpen'],['character-button','character-overlay','character-done','characterOpen']]){
  for(const close of ['pointer','escape']){
    h.run('skillRequested=false;game.player.skillCooldown=0;');
    click(h,trigger);assert(h.run(flag));assert.equal(h.document.activeElement,panel(h,overlay));
    assert(!key(h,'Space').defaultPrevented,'Space on a neutral modal container is not a combat input');assert(!h.run('skillRequested'));
    if(close==='pointer')click(h,done);else key(h,'Escape');
    assert(!h.run(flag));assert.equal(h.document.activeElement,canvas);
    assert(space(h).defaultPrevented);assert(h.run('skillRequested'));assert(!h.run(flag));
  }
  click(h,trigger,{keyboard:true});assert.equal(h.document.activeElement,node(h,trigger==='map-button'?'close-map':'close-character'));
  key(h,'Escape');assert.equal(h.document.activeElement,node(h,trigger));
  space(h);assert(h.run(flag),'keyboard users can reactivate their focused trigger with Space');key(h,'Escape');
}

// Explicit pointer interaction with the playable canvas also clears any stale
// HUD focus. It does not cancel ordinary buttons or claim modal input.
node(h,'map-button').focus();h.fire(canvas,'pointerdown',{pointerId:81,clientX:100,clientY:300});
assert.equal(h.document.activeElement,canvas);assert.equal(h.run('touch.id'),81);
h.fire(canvas,'pointerup',{pointerId:81});assert.equal(h.run('touch'),null);

// Nested dialogs return to their actual parent surface, never the live game.
click(h,'pause-button');assert(h.run('paused'));assert.equal(h.document.activeElement,panel(h,'pause-overlay'));
click(h,'pause-sound-button');assert.equal(h.document.activeElement,panel(h,'pause-overlay'));
assert.notEqual(node(h,'pause-sound-button').getAttribute('aria-pressed'),soundSelected,'clearing focus preserves the sound toggle state');
click(h,'pause-character-button');key(h,'Escape');assert(h.run('paused'));assert.equal(h.document.activeElement,panel(h,'pause-overlay'));
click(h,'pause-archive-button',{keyboard:true});key(h,'Escape');assert.equal(h.document.activeElement,node(h,'pause-archive-button'));
click(h,'resume-button');assert.equal(h.document.activeElement,canvas);assert(!h.run('paused'));

// The new realm trigger obeys the same policy and its radio group participates
// in the keyboard order once, with disabled materials excluded.
h.run('game.player.level=game.realms.cap;game.player.xp=game.player.xpNext=100;game.realms.talismans=2;updateHUD();');
assert(!node(h,'realm-ready').classList.contains('hidden'));
click(h,'realm-ready');assert.equal(h.document.activeElement,panel(h,'character-overlay'));
const realmControls=h.run('focusNavigation.focusable($("character-overlay")).map(element=>element.id)');
assert(realmControls.includes('realm-material-2'));assert(!realmControls.includes('realm-material-0'));assert(!realmControls.includes('realm-material-1'));assert(!realmControls.includes('realm-material-3'));
node(h,'realm-material-1').checked=true;node(h,'realm-material-2').checked=false;
h.fire(node(h,'realm-material-1'),'change');assert.equal(h.run('realmMaterials'),1);
assert(!key(h,'Space',{target:node(h,'realm-material-1')}).defaultPrevented,'native radio keys remain native');
key(h,'Escape');assert.equal(h.document.activeElement,canvas);

// Tab includes input/textarea/tabindex surfaces and skips hidden, disabled,
// roving-tabindex and collapsed-details controls. Input editing never casts.
click(h,'pause-button');const input=node(h,'debug-viewport-width');input.focus();input.value='600';
for(const code of ['Space','KeyM','KeyC','KeyP','Enter']){
  h.run('skillRequested=false;');assert(!key(h,code).defaultPrevented);assert(h.run('paused&&!mapOpen&&!characterOpen&&!skillRequested'));
}
const ids=Array.from(h.run('focusNavigation.focusable($("pause-overlay")).map(element=>element.id)'));
assert(ids.includes('debug-viewport-width'));assert(!ids.includes('diagnostic-output'),'collapsed diagnostic details are not tab stops');
node(h,'diagnostic-details').classList.remove('hidden');
assert(!h.run('focusNavigation.focusable($("pause-overlay")).includes($("diagnostic-output"))'),'a visible but closed details element hides its textarea');
node(h,'diagnostic-details').open=true;
assert(h.run('focusNavigation.focusable($("pause-overlay")).includes($("diagnostic-output"))'),'the opened textarea joins the tab order');
node(h,'diagnostic-output').focus();assert(key(h,'Tab').defaultPrevented);assert.equal(h.document.activeElement,node(h,'close-pause'));
assert(key(h,'Tab',{shiftKey:true}).defaultPrevented);assert.equal(h.document.activeElement,node(h,'diagnostic-output'));
click(h,'resume-button');
const editor=h.document.createElement('div');editor.setAttribute('contenteditable','true');node(h,'arena').append(editor);editor.focus();
h.run('skillRequested=false;');assert(!key(h,'Space').defaultPrevented);assert(!h.run('skillRequested'));
assert(!key(h,'KeyM',{ctrlKey:true}).defaultPrevented);assert(!h.run('mapOpen'));
canvas.focus();

// A delayed reward focus cannot steal focus from a newer pause/map or from a
// keyboard user who already chose a different card before the 80 ms delay.
h.run('game.player.xp=0;game.player.xpNext=Infinity;game.crystalsNext=40;game.crystals=40;game.status="upgrade";upgradeLevel=0;openUpgrades();');
click(h,'upgrade-pause');const pausedFocus=h.document.activeElement;h.tick(100);assert.equal(h.document.activeElement,pausedFocus);
assert(h.run('paused&&game.status==="upgrade"'));click(h,'resume-button');
h.run('upgradeLevel=0;show("upgrade-overlay",false);openUpgrades();');
const second=node(h,'upgrade-cards').children[1];assert(second);key(h,'Tab');second.focus();h.tick(100);assert.equal(h.document.activeElement,second);

// Starting another app harness must not redirect the first one's DOM helper.
const other=harness('',{coarse:true});click(other,'start-button',{touch:true});
assert.equal(other.document.activeElement,node(other,'prepare-screen'));
assert.equal(h.document.activeElement,second);
assert(h.run('focusNavigation.visible($("upgrade-overlay"))'));

// The reusable dialogue button survives each line. Native pointer focus must
// be released after every click, including handlers that stop propagation.
const story=harness('',{coarse:true});click(story,'start-button',{touch:true});
node(story,'mode-story').checked=true;story.fire(node(story,'mode-story'),'change');
click(story,'prepare-start-button',{touch:true});await story.flush();quiet(story);
let lines=0;
while(story.run('game.story.dialogueBlocking')){
  const event=click(story,'story-dialogue-next',{touch:true,settle:false});
  assert(event.stopped,'the shipped dialogue handler stops propagation');
  await settleActions();
  assert.notEqual(story.document.activeElement,node(story,'story-dialogue-next'));
  if(story.run('game.story.dialogueBlocking'))assert.equal(story.document.activeElement,panel(story,'story-dialogue-overlay'));
  assert(++lines<20,'opening dialogue should finish');
}
assert(lines>1,'test repeated pointer confirmation, not only the final close');
assert.equal(story.document.activeElement,node(story,'game-canvas'));
story.run('skillRequested=false;game.player.skillCooldown=0;');
assert(key(story,'Space').defaultPrevented);assert(story.run('keys.has("Space")'),'Space returns to combat routing after the final line');
story.listeners['window:keyup']({code:'Space'});
assert(!story.run('game.story.dialogueBlocking'));

// Chromium can checkpoint microtasks between capture and delegated listeners.
// Reproduce that ordering with the actual archive re-render handler: its
// replacement button must also release focus while keeping its selected tab.
click(other,'prepare-archive-button',{touch:true});
const archiveTab=node(other,'archive-content').querySelector('[data-archive-tab="world"]');
other.listeners['document:pointerdown']({target:archiveTab,pointerType:'touch'});
archiveTab.focus();other.listeners['document:click']({target:archiveTab,detail:1});
await Promise.resolve();
other.fire(node(other,'archive-content'),'click',{target:archiveTab,detail:1});
await settleActions();
assert.equal(other.document.activeElement,panel(other,'archive-overlay'));
assert.equal(node(other,'archive-content').querySelector('[data-archive-tab="world"]').getAttribute('aria-pressed'),'true');
click(other,'close-archive',{touch:true});

// A captured pointer click must not clear a later explicit keyboard focus,
// nor the input intentionally focused by a button's completion handler.
click(other,'prepare-help-button',{touch:true});
click(other,'sound-button',{touch:true,settle:false});
key(other,'Tab');node(other,'close-help').focus();await settleActions();
assert.equal(other.document.activeElement,node(other,'close-help'));
click(other,'sound-button',{touch:true,settle:false});
const editable=other.document.createElement('input');editable.setAttribute('type','text');panel(other,'help-overlay').append(editable);editable.focus();await settleActions();
assert.equal(other.document.activeElement,editable);
click(other,'sound-button',{keyboard:true,settle:false});await settleActions();
assert.equal(other.document.activeElement,node(other,'sound-button'),'keyboard activation keeps the chosen button');
console.log('Focus navigation: repeated story confirmation, stopped/bubbling pointer actions, toggle state, current modal ownership, pointer/keyboard return origins, combat Space routing, touch preparation, editable controls, Tab boundaries and delayed focus passed (shipped handlers / VM DOM).');
