import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness } from './qa-app-harness.mjs';

const node=(h,id)=>h.document.getElementById(id);
const click=(h,id)=>{h.listeners['document:pointerdown']?.({target:node(h,id),pointerType:'touch'});return h.fire(node(h,id),'click',{detail:1});};
const choose=(h,id)=>{node(h,id).checked=true;h.fire(node(h,id),'change');};
const hidden=(h,id)=>node(h,id).classList.contains('hidden');
const storage=new Map([['wild-echoes-setup',JSON.stringify({mode:'world',worldId:'verdant-rift',heroId:'princess',appearanceId:'princess-v2',weaponId:'arrow'})]]);
const h=harness('',{storage,coarse:true});
click(h,'start-button');
choose(h,'mode-story');
assert.equal(node(h,'destination-legend').textContent,'选择剧情');
assert.equal(node(h,'world-mode-title').textContent,'序章 · 林海余烬');
assert.equal(hidden(h,'stage-picker'),true);
assert.equal(hidden(h,'world-mode-note'),false,'story retains the full map preview frame');
assert.equal(hidden(h,'world-rift-forest'),true,'story does not offer a map choice');
assert.equal(hidden(h,'world-verdant-rift'),true);
assert.equal(node(h,'world-verdant-rift').disabled,true);
assert.equal(node(h,'world-verdant-rift').parentElement.classList.contains('hidden'),true,'story never shows the unrelated second world card');
assert.equal(h.run('selectedWorldId'),'verdant-rift','story keeps the exploration destination preference');
assert.equal(hidden(h,'story-prologue'),false);
assert.equal(node(h,'story-prologue').checked,true);
assert.equal(node(h,'hero-traveler-v2').checked,true);
assert.equal(node(h,'weapon-sword').checked,true);
assert.equal(node(h,'hero-princess-v2').parentElement.classList.contains('hidden'),true);
assert.equal(node(h,'weapon-arrow').disabled,true);
assert.match(node(h,'prepare-summary').textContent,/序章.*帅气王子.*长剑/);
assert.match(node(h,'story-availability').textContent,/开头重来/);
choose(h,'mode-world');
assert.equal(node(h,'hero-princess-v2').checked,true,'story restriction preserves the free-play hero preference');
assert.equal(node(h,'weapon-arrow').checked,true);
assert.equal(node(h,'weapon-arrow').disabled,false);
assert.equal(node(h,'world-mode-title').textContent,'裂谷林海');
assert.equal(node(h,'world-verdant-rift').checked,true);
assert.equal(node(h,'world-verdant-rift').parentElement.classList.contains('hidden'),false);
assert.match(node(h,'prepare-summary').textContent,/苍翠断脊.*公主.*翠羽飞矢/);
choose(h,'mode-story');
click(h,'prepare-start-button');await h.flush();
assert.equal(h.run('game.mode'),'story');
assert.equal(h.run('game.startWorldId'),'forest','story always starts on its authored first world');
assert.equal(JSON.parse(storage.get('wild-echoes-setup')).worldId,'verdant-rift');
assert.equal(h.run('game.hero.id'),'traveler');
assert.equal(h.run('game.initialWeaponId'),'sword');
assert.equal(h.run('game.story.id'),'prologue');
assert.equal(h.run('game.story.active'),true);
assert.match(node(h,'phase-label').textContent,/序章/);
assert.equal(h.run('archive.data.totals.runs'),1);

// Fixed dialogue has no visibility/read-receipt dependency and owns input.
// Use a chapter fixture to exercise actual shipped UI/focus handlers separately
// from core stage timings (covered by qa-story-run).
h.run('game.story.advanceDialogue?.(true);updateHUD();');
h.listeners['document:pointerdown']({target:node(h,'game-canvas'),pointerType:'touch'});
h.run(`const dialogueStory=game.story;let advances=0,skips=0;
  const fixtureLines=[{id:'a',speaker:'prince',name:'王子',text:'先看清退路。',index:1,total:2},{id:'b',speaker:'princess',name:'公主',text:'沿小路走，我与你一起。',index:2,total:2,nextLabel:'一起突围'}];
  game.story={active:true,objective:'沿小路与公主会合',actors:[],get dialogueBlocking(){return fixtureLines.length>0;},getDialogue:()=>fixtureLines[0]||null,
    advanceDialogue:skip=>{advances++;if(skip){skips++;fixtureLines.length=0;}else fixtureLines.shift();},
    getProgress:()=>({label:'求援',value:4,max:10,detail:'守住光环'}),getGuide:()=>({kind:'travel',target:{x:900,y:0},waypoint:{x:game.player.x,y:game.player.y+80},path:[{x:game.player.x,y:game.player.y},{x:game.player.x,y:game.player.y+80}]})};
  keys.add('KeyD');keys.add('Space');skillRequested=true;touch={id:4,dx:1,dy:0};updateHUD();`);
assert.equal(hidden(h,'story-dialogue-overlay'),false);
assert.equal(node(h,'story-dialogue-name').textContent,'王子');
assert.equal(node(h,'story-dialogue-count').textContent,'1 / 2');
assert.equal(h.document.activeElement.id,'story-dialogue-panel','touch opens a neutral surface, never the skip/back control');
assert(h.run('keys.size===0&&!skillRequested&&!touch&&!gameSurfaceActive()'));
assert(h.run('blockedTransitionKeys.has("KeyD")'),'held movement cannot resume across the conversation');
assert.equal(hidden(h,'story-objective'),true);
click(h,'touch-skill');assert.equal(h.run('skillRequested'),false);
const storyKey=(code,target=h.document.activeElement,extra={})=>{const event={code,key:code==='Space'?' ':code,target,repeat:false,preventDefault(){this.defaultPrevented=true;},...extra};h.listeners['document:keydown']?.(event);h.listeners['window:keydown']?.(event);return event;};
// A held combat key can transfer focus to Next when a conversation opens.
// Prevent its native button activation until release, and do not let keyboard
// auto-repeat turn one deliberate confirmation into multiple unread lines.
node(h,'story-dialogue-next').focus();
assert(storyKey('Space').defaultPrevented,'The held combat key is blocked even when Next has focus.');
assert(storyKey('Space',node(h,'story-dialogue-next'),{repeat:true}).defaultPrevented);
assert(storyKey('Enter',node(h,'story-dialogue-next'),{repeat:true}).defaultPrevented,'Repeated Enter cannot skip another line.');
assert.equal(h.run('advances'),0);
h.listeners['window:keyup']({code:'Space'});
assert(!storyKey('Space').defaultPrevented,'A fresh intentional Space may use the focused button normally.');
assert(!storyKey('Enter').defaultPrevented,'A fresh intentional Enter may use the focused button normally.');
node(h,'story-dialogue-panel').focus();
assert(storyKey('Space').defaultPrevented);assert.equal(h.run('advances'),0,'Space combat muscle memory cannot skip a neutral conversation');
h.listeners['window:keyup']({code:'Space'});
assert(storyKey('KeyM').defaultPrevented);assert.equal(h.run('mapOpen'),false);
assert(storyKey('Enter').defaultPrevented);assert.equal(node(h,'story-dialogue-name').textContent,'公主');
assert.equal(node(h,'story-dialogue-next').textContent,'一起突围');
click(h,'story-dialogue-pause');assert.equal(h.run('paused'),true);h.run('updateHUD()');
assert.equal(hidden(h,'story-dialogue-overlay'),true);assert.equal(hidden(h,'pause-overlay'),false);
click(h,'resume-button');assert.equal(hidden(h,'story-dialogue-overlay'),false);
assert(node(h,'story-dialogue-overlay').contains(h.document.activeElement));
node(h,'story-dialogue-next').focus();assert(storyKey('Tab').defaultPrevented);assert.equal(h.document.activeElement.id,'story-dialogue-pause','Tab stays in the conversation panel');
click(h,'story-dialogue-skip');assert.equal(h.run('skips'),1);assert.equal(hidden(h,'story-dialogue-overlay'),true);
assert.equal(h.document.activeElement,node(h,'game-canvas'));assert.equal(hidden(h,'story-objective'),false);
assert(storyKey('KeyD').defaultPrevented,'Pre-dialogue movement stays latched until the key is released.');
h.listeners['window:keyup']({code:'KeyD'});storyKey('KeyD');
assert(h.run('keys.has("KeyD")'),'A fresh movement press works after release and conversation completion.');
h.listeners['window:keyup']({code:'KeyD'});

assert.equal(node(h,'story-progress-track').getAttribute('aria-valuenow'),'40');
assert.equal(hidden(h,'story-route-arrow'),false,'nearby verified waypoint still has persistent screen guidance');
assert.match(node(h,'story-route-arrow').style.transform,/1\.570/);
h.run(`const originalObserve=sceneDialogue.observe;let ambientCalls=0;sceneDialogue.observe=()=>ambientCalls++;
  observeSceneDialogue(.1);game.story.active=false;observeSceneDialogue(.1);`);
assert.equal(h.run('ambientCalls'),0,'story mode suppresses all ambient dialogue, including after the chapter ends');
assert.equal(h.run('renderSceneDialogue(0,0,[],[]).length'),0);
h.run(`game.mode='world';observeSceneDialogue(.1);game.mode='story';sceneDialogue.observe=originalObserve;game.story=dialogueStory;updateHUD();`);
assert.equal(h.run('ambientCalls'),1,'exploration continues to use generic speech normally');

// Generic progression announcements must not tell the chapter player to
// leave the scripted objective for tribulation/rewards that are unavailable.
h.run(`$('toast').textContent='剧情状态';pendingEvolutions=[{weaponId:'sword'}];
  announceCombatEvents([{type:'realmBottleneck'},{type:'evolution',weaponId:'orbit'}]);`);
assert.equal(node(h,'toast').textContent,'剧情状态');assert.equal(h.run('pendingEvolutions.length'),0);
h.run(`game.mode='world';toastPriority=0;announceCombatEvents([{type:'realmBottleneck'}]);game.mode='story';`);
assert.match(node(h,'toast').textContent,/主动渡劫突破/,'ordinary modes retain their progression announcements');

// Trigger the actual shipped button handlers against a changing chapter action.
// This avoids coupling UI tests to how far a player has walked through the map.
h.run(`const realStory=game.story;let actionUses=0;
  game.story={active:true,completed:false,objective:'跟随公主',actors:[],
    getAction:()=>actionUses?null:{id:'story:take-pill',label:'服用燃脉丸',description:'潜力仅能持续片刻',enabled:true},
    useAction:id=>{if(id!=='story:take-pill'||actionUses)return false;actionUses++;return true;},
    getBuff:()=>actionUses?{label:'燃脉激发',remaining:29.1,speedPercent:100,damageReduction:.98}:null};updateHUD();`);
assert.equal(hidden(h,'context-action'),false);
assert.equal(node(h,'context-action-label').textContent,'服用燃脉丸');
click(h,'context-action');
assert.equal(h.run('actionUses'),1);
assert.equal(hidden(h,'context-action'),true,'successful use immediately removes the action');
assert.equal(hidden(h,'story-buff'),false);
assert.equal(node(h,'story-buff-time').textContent,'30');
assert.match(node(h,'story-buff').title,/移速 \+100%.*当前减伤 98%/,'buff uses the accumulated mitigation value');
click(h,'context-action');assert.equal(h.run('actionUses'),1,'stale repeated clicks cannot use a consumed action');
h.run('game.story=realStory;home();');
assert.equal(hidden(h,'context-action'),true);
assert.equal(h.run('game'),null);
assert.equal(hidden(h,'realm-ready'),true);
click(h,'start-button');choose(h,'mode-world');
assert.equal(node(h,'world-verdant-rift').checked,true,'returning from a story run restores exploration world');
assert.equal(node(h,'hero-princess-v2').checked,true);
assert.equal(node(h,'weapon-arrow').checked,true);

// Realm controls are a paused character panel; the material count is explicit.
click(h,'prepare-start-button');await h.flush();
assert.equal(h.run('game.startWorldId'),'verdant-rift');
h.run(`game.enemies=[];game.realms.talismans=3;
  game.player.level=10;game.player.xp=game.player.xpNext;updateHUD();`);
assert.equal(hidden(h,'realm-ready'),false);
click(h,'realm-ready');
assert.equal(h.run('characterOpen'),true);
assert(node(h,'realm-material-0').checked);
assert.equal(node(h,'realm-material-3').disabled,false);
choose(h,'realm-material-2');
assert.equal(h.run('realmMaterials'),2);
assert.match(node(h,'start-tribulation').textContent,/投入 2 张/);
// A chapter's unread angel line directs the player back to the angel, rather
// than mislabelling the destination as the following princess.
h.run(`const pointerLabels=[],savedSceneLabel=ctx.fillText,savedStory=game.story;
  ctx.fillText=text=>pointerLabels.push(text);game.story={active:true,step:'conversation',getGuide:()=>({target:{x:game.player.x+1000,y:game.player.y},waypoint:{x:game.player.x+1000,y:game.player.y},shortLabel:'天使',label:'返回守望天使身边继续交谈'})};
  drawObjectivePointers();ctx.fillText=savedSceneLabel;game.story=savedStory;`);
assert.equal(h.run('pointerLabels[0]'),'天使');
assert.equal(h.run('pointerLabels.some(text=>text.startsWith("公主"))'),false);
const css=fs.readFileSync(new URL('./dist/story-ui.css',import.meta.url),'utf8');
assert.match(css,/@media\(pointer:coarse\).*?bottom:calc\(176px/s,'mobile action sits above the joystick');
// Completing the final conversation fades into a chapter victory screen.
// The frame scheduler must keep advancing the fade after its commit changes
// status to victory, then record the clear exactly once before disposal.
const ending=harness('',{coarse:true});
click(ending,'start-button');choose(ending,'mode-story');click(ending,'prepare-start-button');await ending.flush();
ending.run(`game.story.flow.go('conversation');updateHUD();`);
assert.equal(hidden(ending,'story-dialogue-overlay'),false);
click(ending,'story-dialogue-skip');
assert.equal(ending.run('game.sceneTransition.active'),true);
assert.equal(hidden(ending,'end-overlay'),true);
for(let i=0;i<30;i++)ending.tick(20);
assert.equal(ending.run('game.status'),'victory');
assert.equal(ending.run('game.sceneTransition.active'),false);
assert.equal(hidden(ending,'end-overlay'),false);
assert.equal(node(ending,'end-title').textContent,'序章 · 林海余烬 · 通关');
assert.equal(node(ending,'end-kicker').textContent,'CHAPTER COMPLETE');
assert(!node(ending,'end-description').textContent.includes('副本'));
assert.equal(hidden(ending,'story-dialogue-overlay'),true);
assert.equal(hidden(ending,'story-objective'),true);
assert.equal(ending.run('archive.data.stories.prologue.clears'),1);
assert.equal(ending.run('game.sceneContent.allows("worldContent")'),false,'chapter never restores ordinary exploration behind its ending');
assert.equal(ending.run('game.story.disposed'),true);
ending.run('endGame()');assert.equal(ending.run('archive.data.stories.prologue.clears'),1);
click(ending,'home-button');assert.equal(ending.run('game'),null);

console.log('Story UI: three modes, chapter preview/selection, fixed but extensible loadout, free-mode preference restoration, active action consumption, accumulated buff readout, fixed blocking dialogue/input, ambient speech suppression, verified-route HUD, chapter victory fade/archive, explicit tribulation materials and exit cleanup passed.');
