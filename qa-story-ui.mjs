import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness } from './qa-app-harness.mjs';

const node=(h,id)=>h.document.getElementById(id);
const click=(h,id)=>h.fire(node(h,id),'click');
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
console.log('Story UI: three modes, chapter preview/selection, fixed but extensible loadout, free-mode preference restoration, active action consumption, accumulated buff readout, explicit tribulation materials and exit cleanup passed.');
