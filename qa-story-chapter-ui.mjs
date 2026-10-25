import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { ARCHIVE_STORAGE_KEY } from './dist/adventure-archive.js';
import { getStoryChapter } from './dist/story-chapters.js';

const node=(h,id)=>h.document.getElementById(id);
const click=(h,id)=>h.fire(node(h,id),'click');
const choose=(h,id)=>{node(h,id).checked=true;h.fire(node(h,id),'change');};
const hidden=(h,id)=>node(h,id).classList.contains('hidden');
const storage=new Map(),h=harness('',{storage,coarse:true});
click(h,'start-button');choose(h,'mode-story');
assert.equal(node(h,'world-options').querySelectorAll('input').length,2,'only implemented chapters are offered');
assert.equal(node(h,'story-prologue').disabled,false);
assert.equal(node(h,'story-false-orders').disabled,true);
assert.equal(hidden(h,'world-entry'),true,'the chapter owns its world map');
assert.equal(node(h,'story-summary').textContent,getStoryChapter('prologue').summary||'');
assert.equal(h.run('selectedStoryId'),'prologue');

// Persist an actual archive completion, then revisit preparation: no reload or
// alternate chapter-selection implementation is involved in the unlock.
click(h,'prepare-start-button');await h.flush();
h.run('game.story.completed=true;game.story.completionTime=100;game.status="victory";endGame();');
assert.equal(h.run('archive.storyRecord("prologue").clears'),1);
click(h,'home-button');click(h,'start-button');choose(h,'mode-story');
assert.equal(node(h,'story-false-orders').disabled,false);
choose(h,'story-false-orders');
assert.match(node(h,'prepare-summary').textContent,/王令之下.*帅气王子.*长剑/);
assert.equal(node(h,'story-summary').textContent,getStoryChapter('false-orders').summary);
assert.equal(node(h,'hero-traveler-v2').checked,true);assert.equal(node(h,'weapon-sword').checked,true);
click(h,'prepare-start-button');await h.flush();
assert.equal(h.run('game.story.id'),'false-orders');
assert.equal(h.run('game.mode'),'story');
assert.equal(h.run('game.storyDebug'),false);
assert.equal(h.run('game.sceneContent.allows("worldContent")'),false);
h.run('game.status="dead";endGame();');
assert.match(node(h,'end-description').textContent,/王令之下.*开头重来/);
click(h,'restart-button');await h.flush();
assert.equal(h.run('game.story.id'),'false-orders','failure restarts the chosen chapter');
assert.equal(h.run('game.status'),'playing');
for(const speaker of ['player','princess','elder','villager','officer','document'])h.run(`drawStoryPortrait(${JSON.stringify(speaker)});`);
h.run(`const originalActorDraw=humanoidArt.draw;let workerAppearance=null;humanoidArt.draw=(context,kind,options)=>{workerAppearance=options.appearanceId;};drawTownNpc({entity:game.story.worker,scale:1});humanoidArt.draw=originalActorDraw;`);
assert.equal(h.run('workerAppearance'),'merchant','a story NPC must not inherit the prince portrait from its movement hero');
assert(h.run('adventureSceneProps(game.player.x,game.player.y,100000,100000).every(prop=>prop.type==="storyProp")'),'isolated story scenes render authored props only');
h.run('game.story.flow.go("departure");updateHUD();');
click(h,'story-dialogue-skip');
assert.equal(node(h,'story-dialogue-next').textContent,'前往粮道');
assert.equal(hidden(h,'story-dialogue-skip'),true,'the final confirmation cannot be skipped');
node(h,'story-dialogue-panel').focus();
h.listeners['window:keydown']({code:'Enter',key:'Enter',target:node(h,'story-dialogue-panel'),repeat:false,preventDefault(){this.defaultPrevented=true;}});
assert.equal(h.run('game.sceneTransition.active'),false,'neutral Enter does not accidentally confirm departure in another chapter');
click(h,'story-dialogue-panel');assert.equal(h.run('game.sceneTransition.active'),true);
for(let i=0;i<40;i++)h.tick(20);
assert.equal(h.run('game.status'),'victory');
assert.match(node(h,'end-title').textContent,/王令之下.*通关/);
assert.equal(node(h,'end-description').textContent,getStoryChapter('false-orders').completionSummary);
assert.equal(hidden(h,'restart-button'),true);assert.equal(node(h,'home-button').textContent,'返回主界面');
assert.equal(h.run('archive.storyRecord("false-orders").clears'),1);
click(h,'home-button');click(h,'start-button');choose(h,'mode-story');
assert.equal(node(h,'prepare-start-label').textContent,'重玩本章');

// DEBUG can launch either chapter, but its successful run never unlocks the
// ordinary chapter list, even after both pages have reloaded the same storage.
const debugStorage=new Map(),debug=harness('?debug',{storage:debugStorage,coarse:true});
click(debug,'start-button');choose(debug,'mode-story');
assert.equal(node(debug,'story-false-orders').disabled,false);
choose(debug,'story-false-orders');click(debug,'prepare-start-button');await debug.flush();
assert.equal(debug.run('game.storyDebug'),true);assert.equal(debug.run('game.debug'),false,'story does not inherit full-loadout or forced-spawn cheats');
debug.run('game.story.completed=true;game.story.completionTime=20;game.status="victory";endGame();home();');
assert.equal(debug.run('archive.storyRecord("false-orders")'),null);
assert.equal(debug.run('archive.storyRecord("false-orders",{debug:true}).clears'),1);
assert.equal(JSON.parse(debugStorage.get(ARCHIVE_STORAGE_KEY)).debugStories['false-orders'].clears,1);
const normal=harness('',{storage:debugStorage});click(normal,'start-button');choose(normal,'mode-story');
assert.equal(node(normal,'story-false-orders').disabled,true);
assert.equal(normal.run('selectedStoryId'),'prologue','a saved debug chapter cannot bypass the normal prerequisite');
const debugAgain=harness('?debug',{storage:debugStorage});click(debugAgain,'start-button');choose(debugAgain,'mode-story');choose(debugAgain,'story-false-orders');
assert.equal(node(debugAgain,'prepare-start-label').textContent,'重玩本章');
assert.match(node(debugAgain,'story-availability').textContent,/调试记录独立/);
console.log('Story chapter UI: implemented chapter list, unlock/replay, authored map/loadout, restart ownership, portraits/props, simple ending and isolated debug completion passed.');
