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
assert.equal(node(h,'prepare-screen').classList.contains('story-preparation'),true);
assert.match(node(h,'prepare-summary').textContent,/序章.*帅气王子.*长剑/);
assert.match(node(h,'story-availability').textContent,/开头重来/);
choose(h,'mode-world');
assert.equal(node(h,'hero-princess-v2').checked,true,'story restriction preserves the free-play hero preference');
assert.equal(node(h,'weapon-arrow').checked,true);
assert.equal(node(h,'weapon-arrow').disabled,false);
assert.equal(node(h,'prepare-screen').classList.contains('story-preparation'),false);
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
assert.equal(node(h,'level-label').textContent,'Lv.1','story shows character level without exploration realms');
assert.equal(hidden(h,'game-bottom'),true);assert.equal(hidden(h,'skill-button'),true);assert.equal(hidden(h,'touch-skill'),true);
h.run('requestSkill();');assert.equal(h.run('skillRequested'),false,'unavailable story skill has no input request or error toast');
// The portrait redraws at the actual displayed size and follows DPR changes.
node(h,'story-dialogue-portrait').getBoundingClientRect=()=>({width:144,height:156});
h.run('drawStoryPortrait("princess");');
assert.equal(node(h,'story-dialogue-portrait').width,288);assert.equal(node(h,'story-dialogue-portrait').height,312);
h.window.devicePixelRatio=3;h.run('drawStoryPortrait("princess");');
assert.equal(node(h,'story-dialogue-portrait').width,432);assert.equal(node(h,'story-dialogue-portrait').height,468);
assert(h.run('[...storyPortraitArt.directional.cache.values()].some(sprite=>sprite.canvas.width/sprite.w>2)'),'portrait art is rasterized above the world sprite density');
h.window.devicePixelRatio=2;

// Fixed dialogue has no visibility/read-receipt dependency and owns input.
// Use a chapter fixture to exercise actual shipped UI/focus handlers separately
// from core stage timings (covered by qa-story-run).
h.run('game.story.advanceDialogue?.(true);updateHUD();');
h.listeners['document:pointerdown']({target:node(h,'game-canvas'),pointerType:'touch'});
h.run(`const dialogueStory=game.story;let advances=0,skips=0;
  const fixtureLines=[{id:'a',speaker:'prince',name:'王子',text:'先看清退路。',index:1,total:2},{id:'b',speaker:'princess',name:'公主',text:'沿小路走，我与你一起。',index:2,total:3,nextLabel:'一起突围'},{id:'c',speaker:'princess',name:'公主',text:'跟上我。',index:3,total:3,nextLabel:'一起突围'}];
  game.story={active:true,objective:'沿小路与公主会合',actors:[],get dialogueBlocking(){return fixtureLines.length>0;},getDialogue:()=>fixtureLines[0]||null,
    advanceDialogue:skip=>{advances++;if(skip){skips++;fixtureLines.length=0;}else fixtureLines.shift();},
    getProgress:()=>({label:'求援',value:4,max:10,detail:'守住光环'}),getGuide:()=>({kind:'travel',target:{x:900,y:0},waypoint:{x:game.player.x,y:game.player.y+80},path:[{x:game.player.x,y:game.player.y},{x:game.player.x,y:game.player.y+80}]})};
  keys.add('KeyD');keys.add('Space');skillRequested=true;touch={id:4,dx:1,dy:0};updateHUD();`);
assert.equal(hidden(h,'story-dialogue-overlay'),false);
node(h,'story-dialogue-panel').onclick({target:node(h,'story-dialogue-next')});
assert.equal(h.run('advances'),0,'a bubbled button click cannot also advance the panel');
assert.equal(node(h,'story-dialogue-name').textContent,'王子');
assert.equal(h.document.querySelectorAll('#story-dialogue-count,#story-dialogue-title').length,0,'dialogue omits page chrome');
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
assert(storyKey('KeyF').defaultPrevented,'context actions cannot bypass blocking dialogue');
h.listeners['window:keyup']({code:'KeyF'});
assert(storyKey('Enter').defaultPrevented);assert.equal(node(h,'story-dialogue-name').textContent,'公主');
assert.equal(node(h,'story-dialogue-next').textContent,'一起突围');
h.fire(node(h,'story-dialogue-panel'),'click',{target:node(h,'story-dialogue-text')});
assert.equal(h.run('advances'),2,'clicking the dialogue text advances exactly one line');
assert.equal(node(h,'story-dialogue-text').textContent,'跟上我。');
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
// Empty, inactive and non-story states fully clear the panel. In particular,
// absent story data must never turn show(id, undefined) into its default true.
h.run('const objectiveStory=game.story;');
for(const state of ["game.mode='world';game.story=undefined", "game.mode='dungeon';game.story=objectiveStory", "game.mode='story';game.story={active:false,objective:'旧目标'}", "game.story={active:true,objective:'  ',getProgress:()=>({label:'旧进度',value:1,max:2})}"]){
  h.run(`${state};updateStoryDialogueHUD(true);`);
  assert.equal(hidden(h,'story-objective'),true);assert.equal(hidden(h,'story-progress'),true);
  assert.equal(node(h,'story-objective-text').textContent,'');assert.equal(node(h,'story-progress-label').textContent,'');assert.equal(node(h,'story-progress-detail').textContent,'');
  assert.equal(node(h,'story-progress-fill').style.width,'0%');
}
h.run("game.mode='story';game.story=objectiveStory;updateStoryDialogueHUD(true);");
assert.equal(hidden(h,'story-objective'),false);assert.equal(node(h,'story-progress-track').getAttribute('aria-valuenow'),'40');
assert.equal(h.document.querySelectorAll('#story-route-arrow').length,0,'ground ribbon is the only route direction display');
h.run(`const originalObserve=sceneDialogue.observe;let ambientCalls=0;sceneDialogue.observe=()=>ambientCalls++;
  observeSceneDialogue(.1);game.story.active=false;observeSceneDialogue(.1);`);
assert.equal(h.run('ambientCalls'),0,'story mode suppresses all ambient dialogue, including after the chapter ends');
assert.equal(h.run('renderSceneDialogue(0,0,[],[]).length'),0);
h.run(`game.mode='world';observeSceneDialogue(.1);game.mode='story';sceneDialogue.observe=originalObserve;game.story=dialogueStory;updateHUD();`);
assert.equal(h.run('ambientCalls'),1,'exploration continues to use generic speech normally');
// Script markers remain attached to the current actor, and do not react to
// unrelated attacks. A hidden actor never gets a through-wall speech marker.
h.run(`const speechActor={x:196,y:330},speechItems=[{id:'speaker',actor:speechActor,text:'…'}];
  const markerA=drawScriptedSceneDialogue(ctx,speechItems,{project:(x,y)=>({x,y}),width:393,height:717});
  const markerB=drawScriptedSceneDialogue(ctx,speechItems,{project:(x,y)=>({x,y}),width:393,height:717});`);
assert.equal(h.run('JSON.stringify(markerA[0].rect)'),h.run('JSON.stringify(markerB[0].rect)'));
assert.equal(h.run(`drawScriptedSceneDialogue(ctx,speechItems,{project:(x,y)=>({x,y}),width:393,height:717,isVisible:()=>false}).length`),0);
h.run(`speechActor.x+=15;speechActor.y+=20;const movedMarker=drawScriptedSceneDialogue(ctx,speechItems,{project:(x,y)=>({x,y}),width:393,height:717});`);
assert.equal(h.run('movedMarker[0].rect.x-markerA[0].rect.x'),15);
assert.equal(h.run('movedMarker[0].rect.y-markerA[0].rect.y'),20);
h.run(`const edgeActor={x:30,y:330},edgeLine={id:'summon',actor:edgeActor,text:'守望者，请回应古老的誓约，护住此地！'},speechOptions={project:(x,y)=>({x,y}),width:393,height:717};
  const edgeA=drawScriptedSceneDialogue(ctx,[edgeLine],speechOptions);`);
assert.equal(h.run('edgeA.length'),1,'a visible edge speaker can place the text into available screen space');
assert(h.run('edgeA[0].rect.x>=6'));
h.run(`edgeActor.x+=30;const edgeB=drawScriptedSceneDialogue(ctx,[{...edgeLine}],speechOptions);`);
assert.equal(h.run('edgeB[0].rect.x-edgeA[0].rect.x'),30,'same line follows actor with its first chosen offset');
assert.equal(h.run(`drawScriptedSceneDialogue(ctx,[edgeLine],{...speechOptions,isVisible:()=>false}).length`),0,'placement does not reveal a concealed actor');
h.run(`edgeActor.x=220;const newSpeech=drawScriptedSceneDialogue(ctx,[{...edgeLine,id:'next-speech'}],speechOptions);`);
assert(h.run('Math.abs(newSpeech[0].rect.x+newSpeech[0].rect.width/2-newSpeech[0].anchor.x)<1'),'a new line may choose its own initial placement');



// Generic progression announcements must not tell the chapter player to
// leave the scripted objective for tribulation/rewards that are unavailable.
h.run(`notifications.clear();$('toast').textContent='剧情状态';
  announceCombatEvents([{type:'realmBottleneck'},{type:'evolution',weaponId:'orbit'}]);`);
assert.equal(node(h,'toast').textContent,'剧情状态');assert.equal(h.run('notifications.current'),null);
h.run(`const realmWasEnabled=game.realms.enabled;game.mode='world';game.realms.enabled=true;announceCombatEvents([{type:'realmBottleneck'}]);game.mode='story';game.realms.enabled=realmWasEnabled;`);
assert.match(node(h,'toast').textContent,/可准备渡劫/,'ordinary modes retain their progression announcements');

// Trigger the actual shipped button handlers against a changing chapter action.
// This avoids coupling UI tests to how far a player has walked through the map.
h.run(`const realStory=game.story;let actionUses=0;
  game.story={active:true,completed:false,objective:'跟随公主',actors:[],
    getAction:()=>actionUses?null:{id:'story:take-pill',label:'服用燃脉丸',description:'潜力仅能持续片刻',enabled:true},
    useAction:id=>{if(id!=='story:take-pill'||actionUses)return false;actionUses++;return true;},
    getBuff:()=>actionUses?{label:'燃脉激发',remaining:29.1,speedPercent:100,damageReduction:.98}:null};updateHUD();`);
assert.equal(hidden(h,'context-action'),false);
assert.equal(node(h,'context-action-label').textContent,'服用燃脉丸');
assert.equal(hidden(h,'touch-context-action'),false);
click(h,'touch-context-action');
assert.equal(h.run('actionUses'),1);
assert.equal(hidden(h,'context-action'),true,'successful use immediately removes the action');
assert.equal(hidden(h,'story-buff'),false);
assert.equal(node(h,'story-buff-time').textContent,'30');
assert.match(node(h,'story-buff').title,/移速 \+100%.*当前减伤 98%/,'buff uses the accumulated mitigation value');
click(h,'context-action');assert.equal(h.run('actionUses'),1,'stale repeated clicks cannot use a consumed action');
h.run('actionUses=0;updateHUD();');
assert(storyKey('KeyF').defaultPrevented);
assert.equal(h.run('actionUses'),1,'F uses the same story action as the touch control');
assert.equal(h.document.activeElement,node(h,'game-canvas'));
h.run('game.story=realStory;home();');
assert.equal(hidden(h,'context-action'),true);
assert.equal(h.run('game'),null);
assert.equal(hidden(h,'touch-context-action'),true);
click(h,'start-button');choose(h,'mode-world');
assert.equal(node(h,'world-verdant-rift').checked,true,'returning from a story run restores exploration world');
assert.equal(node(h,'hero-princess-v2').checked,true);
assert.equal(node(h,'weapon-arrow').checked,true);

// Material preferences remain in the character panel, while the HUD action starts directly.
click(h,'prepare-start-button');await h.flush();
assert.equal(h.run('game.startWorldId'),'verdant-rift');
assert.equal(hidden(h,'story-objective'),true);assert.equal(node(h,'story-objective-text').textContent,'');
assert.equal(hidden(h,'skill-button'),false);assert.equal(hidden(h,'touch-skill'),false,'world restores the mobile skill entry');
assert.match(node(h,'level-label').textContent,/^Lv\.1 · /);
click(h,'character-button');
assert.match(node(h,'character-content').textContent,/距 Lv\.5 瓶颈还需 \d+ 经验/);
assert.match(node(h,'character-content').textContent,/护劫符 0 张/);
click(h,'character-done');
h.run(`game.player.level=5;game.player.xp=game.player.xpNext;game.realms.capExperience();updateHUD();`);
assert.equal(hidden(h,'touch-context-action'),false);
assert.equal(node(h,'context-action-label').textContent,'开始渡劫');
assert.match(node(h,'context-action-detail').textContent,/投入护劫符 3 张/);
click(h,'character-button');
assert.equal(h.run('characterOpen'),true);
assert(node(h,'realm-material-3').checked,'the first preparation recommends the three granted talismans');
assert.match(node(h,'character-content').textContent,/附近随机落下/);assert.doesNotMatch(node(h,'character-content').textContent,/开阔|留在劫域|离场/);
assert.equal(node(h,'start-tribulation').disabled,false,'combat does not disable an otherwise ready trial');
assert.equal(node(h,'realm-material-3').disabled,false);
choose(h,'realm-material-2');
assert.equal(h.run('realmMaterials'),2);
assert.match(node(h,'start-tribulation').textContent,/投入 2 张/);
click(h,'character-done');h.run('game.regionGrace=0;updateHUD();');
click(h,'touch-context-action');
assert.equal(h.run('characterOpen'),false,'HUD action never opens the character panel');
assert.equal(h.run('game.realms.active.materials'),2,'direct action honors the selected material count');
assert.equal(h.document.activeElement,node(h,'game-canvas'));
assert.equal(hidden(h,'touch-context-action'),true,'an active trial consumes its action');
// A chapter's unread angel line directs the player back to the angel, rather
// than mislabelling the destination as the following princess.
h.run(`const pointerLabels=[],savedSceneLabel=ctx.fillText,savedStory=game.story;
  ctx.fillText=text=>pointerLabels.push(text);game.story={active:true,step:'conversation',getGuide:()=>({target:{x:game.player.x+1000,y:game.player.y},waypoint:{x:game.player.x+1000,y:game.player.y},shortLabel:'天使',label:'返回守望天使身边继续交谈'})};
  drawObjectivePointers();ctx.fillText=savedSceneLabel;game.story=savedStory;`);
assert.equal(h.run('pointerLabels.length'),0,'story does not draw duplicate location or edge pointers');
assert.equal(h.run('pointerLabels.some(text=>text.startsWith("公主"))'),false);
const css=fs.readFileSync(new URL('./dist/story-ui.css',import.meta.url),'utf8');
assert.match(css,/\.story-preparation \.hero-option,\.story-preparation \.weapon-option\{flex-grow:0;flex-basis:max/,'single story selections preserve standard card sizes');
const mainCss=fs.readFileSync(new URL('./dist/style.css',import.meta.url),'utf8');
assert.match(mainCss,/\.touch-context-action\{left:27px;right:auto;margin-left:var\(--safe-left\)/,'mobile context shares the lightning geometry and mirrors its side');
assert.match(css,/\.story-victory \.end-actions\{grid-template-columns:minmax\(180px,240px\);justify-content:center/,'the single ending action replaces the two-column grid');
// Completing the final conversation fades into a chapter victory screen.
// The frame scheduler must keep advancing the fade after its commit changes
// status to victory, then record the clear exactly once before disposal.
const ending=harness('',{coarse:true});
click(ending,'start-button');choose(ending,'mode-story');click(ending,'prepare-start-button');await ending.flush();
ending.run(`game.story.flow.go('conversation');updateHUD();`);
assert.equal(hidden(ending,'story-dialogue-overlay'),false);
click(ending,'story-dialogue-skip');
assert.equal(ending.run('game.sceneTransition.active'),false,'skipping the conclusion still awaits deliberate departure');
assert.equal(node(ending,'story-dialogue-next').textContent,'正式启航');
assert.equal(hidden(ending,'story-dialogue-skip'),true);
node(ending,'story-dialogue-panel').focus();
ending.listeners['window:keydown']({code:'Enter',key:'Enter',target:node(ending,'story-dialogue-panel'),repeat:false,preventDefault(){this.defaultPrevented=true;}});
assert.equal(ending.run('game.sceneTransition.active'),false,'neutral keyboard focus does not implicitly depart');
for(let i=0;i<5;i++)ending.tick(20);
assert.equal(ending.run('game.sceneTransition.active'),false,'the ending awaits a deliberate player action');
click(ending,'story-dialogue-panel');
assert.equal(ending.run('game.sceneTransition.active'),true);
assert.equal(hidden(ending,'end-overlay'),true);
for(let i=0;i<30;i++)ending.tick(20);
assert.equal(ending.run('game.status'),'victory');
assert.equal(ending.run('game.sceneTransition.active'),false);
assert.equal(hidden(ending,'end-overlay'),false);
assert.equal(node(ending,'end-title').textContent,'序章 · 林海余烬 · 通关');
assert.equal(hidden(ending,'end-kicker'),true);
assert(!node(ending,'end-description').textContent.includes('副本'));
assert.equal(hidden(ending,'story-dialogue-overlay'),true);
assert.equal(hidden(ending,'story-objective'),true);
assert.equal(hidden(ending,'restart-button'),true);
assert.equal(hidden(ending,'end-archive-button'),true);
assert.equal(hidden(ending,'end-stats'),true);
assert.equal(node(ending,'home-button').textContent,'返回主界面');
assert.equal(ending.document.activeElement,node(ending,'end-overlay').querySelector('[role="dialog"]'),'touch completion focuses the ending surface');
assert.equal(ending.run('archive.data.stories.prologue.clears'),1);
assert.equal(ending.run('game.sceneContent.allows("worldContent")'),false,'chapter never restores ordinary exploration behind its ending');
assert.equal(ending.run('game.story.disposed'),true);
ending.run('endGame()');assert.equal(ending.run('archive.data.stories.prologue.clears'),1);
click(ending,'home-button');assert.equal(ending.run('game'),null);
click(ending,'start-button');choose(ending,'mode-world');click(ending,'prepare-start-button');await ending.flush();
ending.run(`game.status='dead';endGame();`);
assert.equal(hidden(ending,'restart-button'),false,'ordinary endings restore their full controls after a story clear');
assert.equal(hidden(ending,'end-archive-button'),false);
assert.equal(hidden(ending,'end-stats'),false);
assert.equal(node(ending,'end-overlay').classList.contains('story-victory'),false);

console.log('Story UI: three modes, chapter preview/selection, fixed but extensible loadout, free-mode preference restoration, active action consumption, accumulated buff readout, fixed blocking dialogue/input, ambient speech suppression, ground-only route direction, explicit departure and single-button victory/archive, explicit tribulation materials and exit cleanup passed.');
