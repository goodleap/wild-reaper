import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

// Exercise the shipped app's controls and frame with a deliberately small DOM.
// These are interaction/state tests, not a browser layout or touch-device test.
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
let source=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const modules={};
for(const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?$/gm)){
  const exports=await import(new URL(`./dist/${match[2].replace('./','')}`,import.meta.url));
  for(const specifier of match[1].split(',').map(value=>value.trim())){const [exported,local=exported]=specifier.split(/\s+as\s+/);modules[local]=exports[exported];}
}
source=source.replace(/^import[^\n]+;\s*$/gm,'');
const gradient={addColorStop(){}};
const drawing=new Proxy({measureText:text=>({width:String(text).length*6}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
const document={activeElement:null,hidden:false},windowListeners={},documentListeners={};
const camel=s=>s.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
let viewport={width:393,height:717,left:0,top:0};
class Element{
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();this.id='';this.attributes={};this.dataset={};this.children=[];this.parentElement=null;this.listeners={};this._html='';this._text='';this.disabled=false;this.isConnected=true;this.scrollLeft=0;this.scrollTop=0;
    this.style={setProperty(name,value){this[name]=String(value);},getPropertyValue(name){return this[name]??'';}};
    const classes=new Set();this.classList={contains:name=>classes.has(name),add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),toggle:(name,on)=>{on=on??!classes.has(name);on?classes.add(name):classes.delete(name);return on;}};
    Object.defineProperty(this,'className',{get:()=>[...classes].join(' '),set:value=>{classes.clear();String(value).split(/\s+/).filter(Boolean).forEach(name=>classes.add(name));}});
  }
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=String(value);if(name==='class')this.className=value;if(name.startsWith('data-'))this.dataset[camel(name.slice(5))]=String(value);if(name==='disabled')this.disabled=true;}
  getAttribute(name){return this.attributes[name]??null;}
  hasAttribute(name){return Object.hasOwn(this.attributes,name);}
  removeAttribute(name){delete this.attributes[name];if(name==='disabled')this.disabled=false;}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this._text=String(value);this.children=[];this._html='';}
  get innerHTML(){return this._html;}
  set innerHTML(value){this._html=String(value);this._text='';this.children=[];parseInto(this._html,this);}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
  replaceChildren(...children){this.children=[];this._text='';this._html='';this.append(...children);}
  matches(selector){return selector.split(',').some(raw=>{const s=raw.trim();if(s.includes(':not(:disabled)')&&this.disabled)return false;const clean=s.replace(':not(:disabled)','');const attr=clean.match(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/);if(attr&&(!this.hasAttribute(attr[1])||(attr[2]!==undefined&&this.getAttribute(attr[1])!==attr[2])))return false;const tag=clean.match(/^[a-z]+/i)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;const id=clean.match(/#([\w-]+)/)?.[1];if(id&&this.id!==id)return false;for(const m of clean.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(m[1]))return false;return true;});}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  contains(target){return target===this||this.children.some(child=>child.contains(target));}
  addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
  getBoundingClientRect(){return viewport;}
  get clientWidth(){return viewport.width;}
  get scrollWidth(){return this.clientWidth;}
  get offsetLeft(){return 0;}
  get offsetWidth(){return 120;}
  scrollBy({left=0}={}){this.scrollLeft=Math.max(0,this.scrollLeft+left);}
  scrollTo({left=0,top=0}={}){this.scrollLeft=left;this.scrollTop=top;}
  getContext(){return drawing;}
  setPointerCapture(id){this.captured=id;}
  releasePointerCapture(id){if(this.captured===id)this.captured=null;}
  hasPointerCapture(id){return this.captured===id;}
  focus(){document.activeElement=this;}
}
function parseInto(markup,root){
  const stack=[root],voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const token of markup.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/gi)){
    const t=token[0];if(t.startsWith('<!'))continue;
    if(t.startsWith('</')){const tag=t.match(/^<\/([a-z][a-z0-9-]*)/i)?.[1]?.toUpperCase();const at=stack.findLastIndex(node=>node.tagName===tag);if(at>0)stack.length=at;continue;}
    if(!t.startsWith('<')){stack.at(-1)._text+=t;continue;}
    const match=t.match(/^<([a-z][a-z0-9-]*)\b([^>]*)>/i);if(!match)continue;
    const node=new Element(match[1]);for(const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(attr[1],attr[2]??attr[3]??attr[4]??'');
    stack.at(-1).append(node);if(!voids.has(match[1].toLowerCase())&&!t.endsWith('/>'))stack.push(node);
  }
}
const root=new Element('root');parseInto(html,root);
Object.assign(document,{body:root.querySelector('body'),getElementById:id=>root.querySelector(`#${id}`),createElement:tag=>new Element(tag),querySelectorAll:selector=>root.querySelectorAll(selector),addEventListener:(type,handler)=>{(documentListeners[type]??=[]).push(handler);}});
globalThis.document=document;
const $=id=>{const node=document.getElementById(id);assert(node,`missing #${id}`);return node;};
let taskId=0,taskNow=1000;const frameTasks=new Map(),timerTasks=new Map();
const sandbox={...modules,document,performance,window:{location:{search:''},devicePixelRatio:1,addEventListener:(type,handler)=>{(windowListeners[type]??=[]).push(handler);}},URLSearchParams,ResizeObserver:class{observe(){}},matchMedia:query=>({matches:query.includes('pointer: coarse')}),localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:callback=>{const id=++taskId;frameTasks.set(id,callback);return id;},cancelAnimationFrame:id=>frameTasks.delete(id),setTimeout:(callback,delay=0)=>{const id=++taskId;timerTasks.set(id,{callback,at:taskNow+Number(delay)});return id;},clearTimeout:id=>timerTasks.delete(id),console};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
for(const id of ['start-button','archive-button','help-button','sound-button'])$(id).disabled=false;
const shippedRenderGame=sandbox.renderGame;
const run=script=>vm.runInContext(script,sandbox);
const flush=async()=>{for(let count=0;count<100;count++){await Promise.resolve();await Promise.resolve();if(!run('typeof startLoading!=="undefined"&&startLoading'))return;taskNow+=1000/60;const callbacks=[...frameTasks.values()];frameTasks.clear();for(const callback of callbacks)callback(taskNow);for(const [id,task] of [...timerTasks])if(task.at<=taskNow){timerTasks.delete(id);task.callback();}}assert.fail('startup did not settle');};
function fire(node,type,extra={}){
  const event={target:node,currentTarget:node,pointerId:1,clientX:30,clientY:30,button:0,detail:type==='click'?1:undefined,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};
  for(const handler of node.listeners[type]||[])handler(event);node[`on${type}`]?.(event);return event;
}
const key=(code,extra={})=>{const event={code,key:code==='Escape'?'Escape':code,repeat:false,target:$('game-canvas'),preventDefault(){},...extra};for(const handler of windowListeners.keydown||[])handler(event);};
const click=id=>fire($(id),'click');
let touchPointerId=100;
const tap=id=>{
  const node=$(id),pointerId=touchPointerId++,event={pointerId,pointerType:'touch',isPrimary:true};
  fire(node,'pointerdown',event);fire(node,'pointerup',event);return fire(node,'click',{...event,detail:1});
};
const start=async()=>{click('start-button');click('prepare-start-button');await flush();run('renderGame=()=>{};renderIntro=()=>{};game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;');};
const model=()=>JSON.parse(run('JSON.stringify({time:game.runTime,clock,skill:game.player.skillCooldown,point:[game.player.x,game.player.y]})'));
assert($('run-summary').classList.contains('hidden'),'the menu starts without run statistics');
assert(!fire($('game-canvas'),'touchstart',{cancelable:true}).defaultPrevented,'the intro has no canvas touch fallback');
await start();
// Native menus need real WeChat devices. These checks verify the shipped guard
// boundaries and the pointer controls that a touchstart fallback could disturb.
for(const type of ['contextmenu','selectstart','dragstart']){
  assert(fire($('arena'),type,{target:$('hp-label'),cancelable:true}).defaultPrevented);
  assert(fire($('arena'),type,{target:{nodeType:3,parentElement:$('hp-label')},cancelable:true}).defaultPrevented);
  assert(!fire($('arena'),type,{target:$('hp-label'),cancelable:false}).defaultPrevented);
  for(const tag of ['input','textarea','select']){
    const field=new Element(tag),child=new Element('span');field.append(child);
    assert(!fire($('arena'),type,{target:field,cancelable:true}).defaultPrevented,`${tag} keeps native actions`);
    assert(!fire($('arena'),type,{target:child,cancelable:true}).defaultPrevented);
  }
  const editable=new Element('span');editable.isContentEditable=true;
  assert(!fire($('arena'),type,{target:editable,cancelable:true}).defaultPrevented,'editable descendants keep selection');
  assert(!documentListeners[type]&&!windowListeners[type],'the page outside the game has no callout interception');
}
assert(!documentListeners.touchstart&&!windowListeners.touchstart&&!$('arena').listeners.touchstart,'no broad touchstart interception');
assert(!documentListeners.touchmove&&!windowListeners.touchmove&&!$('arena').listeners.touchmove,'native scrolling has no broad touchmove interception');
for(const id of ['pause-button','start-button','touch-skill','character-content','diagnostic-output'])assert(!$(id).listeners.touchstart,`${id} keeps native touchstart`);
const canvasTouch=fire($('game-canvas'),'touchstart',{cancelable:true});assert(canvasTouch.defaultPrevented&&!canvasTouch.stopped);
assert(!fire($('game-canvas'),'touchstart',{cancelable:false}).defaultPrevented);
for(const flag of ['paused','helpOpen','mapOpen','characterOpen','archiveOpen']){
  run(`${flag}=true`);assert(!fire($('game-canvas'),'touchstart',{cancelable:true}).defaultPrevented,`${flag} leaves native touch alone`);run(`${flag}=false`);
}
for(const eventOrder of [['pointerdown','touchstart'],['touchstart','pointerdown']]){
  run('clearInput();game.player.skillCooldown=0;');
  for(const type of eventOrder)fire($('game-canvas'),type,{pointerId:73,pointerType:'touch',clientX:100,clientY:300,cancelable:true});
  fire($('game-canvas'),'pointermove',{pointerId:73,clientX:130,clientY:300});
  assert(run('touch.id===73&&touch.dx>0'),'dragging continues with the canvas fallback');
  fire($('touch-skill'),'pointerdown',{pointerId:74,pointerType:'touch'});
  assert(run('skillRequested&&touch.id===73&&touch.dx>0'),'a second finger can cast while moving');
  fire($('game-canvas'),'pointercancel',{pointerId:73});assert.equal(run('touch'),null);
}
run('clearInput();');
// Entrance feedback is a non-interactive, single text node. It shares the
// notice lane with routine messages and yields to significant combat notices.
assert.equal($('portal-action').querySelectorAll('button,small,kbd').length,0);
assert.equal($('portal-action').getAttribute('role'),'status');
run("const savedInteraction=game.getInteraction;game.getInteraction=()=>({id:'qa-hint',type:'supply',label:'走进林间小屋',enabled:true});toastUntil=0;toastPriority=0;updatePortalHUD();");
assert.equal($('portal-action').textContent,'走进林间小屋');
assert(!$('portal-action').classList.contains('hidden'));
assert($('arena').classList.contains('entrance-hint-visible'));
run("notify('普通提醒',0);");assert(!$('portal-action').classList.contains('hidden'),'routine toast cannot obscure an entrance');
run("notify('首领即将进攻',3);");assert($('portal-action').classList.contains('hidden'),'important notice takes the shared lane');
assert(!$('arena').classList.contains('entrance-hint-visible'));
run('toastUntil=0;toastPriority=0;updatePortalHUD();');assert(!$('portal-action').classList.contains('hidden'));
for(const flag of ['paused','helpOpen','mapOpen','characterOpen']){
  run(`${flag}=true;updatePortalHUD();`);assert($('portal-action').classList.contains('hidden'),`${flag} hides entrance feedback`);
  run(`${flag}=false;updatePortalHUD();`);assert(!$('portal-action').classList.contains('hidden'));
}
run("game.sceneTransition.active=true;updatePortalHUD();");assert($('portal-action').classList.contains('hidden'),'scene fade hides the entrance hint');
run("game.sceneTransition.active=false;game.getInteraction=savedInteraction;toastUntil=0;toastPriority=0;$('toast').classList.remove('visible');updatePortalHUD();");
// Protection is separate from visible hit blinking; the shipped actor renderer
// must pass the hurt timer, not the longer invulnerability timer.
assert.deepEqual(JSON.parse(run(`JSON.stringify((()=>{
  const draw=humanoidArt.draw,clock=game._clock,entity=game.player,invuln=entity.invuln,flash=entity.hurtFlash,seen=[];
  try{
    game._clock=.01;humanoidArt.draw=()=>seen.push(ctx.globalAlpha);entity.invuln=2;
    entity.hurtFlash=0;ctx.globalAlpha=1;drawActorBody({isPlayer:true,entity,x:0,y:0,scale:1});
    entity.hurtFlash=.8;ctx.globalAlpha=1;drawActorBody({isPlayer:true,entity,x:0,y:0,scale:1});
    return seen;
  }finally{humanoidArt.draw=draw;game._clock=clock;entity.invuln=invuln;entity.hurtFlash=flash;ctx.globalAlpha=1;}
})())`)),[1,.65]);
assert(!$('run-summary').classList.contains('hidden'),'starting a run shows passive run statistics');
assert(!$('hud').contains($('run-summary')),'run statistics are outside the interactive top HUD');
assert.equal($('run-summary').parentElement,$('hud').parentElement);
assert.equal($('run-summary').querySelectorAll('button,a,input,select').length,0,'passive statistics have no controls');
for(const id of ['timer','kills','phase-label','wave-label'])assert($('run-summary').contains($(id)),`${id} belongs in passive run statistics`);

// Resource captions contain values only; the row supplies the single text label.
const numericResource=/^\d+(?:\.\d+)?k? \/ \d+(?:\.\d+)?k?$/;
for(const id of ['xp-caption','crystal-label'])assert.match($(id).textContent,numericResource);
run('game.player.xp=12345;game.player.xpNext=45678;game.crystals=23456;game.crystalsNext=56789;updateHUD();');
for(const id of ['xp-caption','crystal-label'])assert.match($(id).textContent,numericResource,'large values must not restore a duplicate resource name');
run('game.player.xp=0;game.crystals=0;updateHUD();');

// Actual pointer event sequences exercise touch activation for all three HUD
// controls. This verifies current-script bindings; release cache consistency is
// tested separately, and DOM simulation cannot verify a mobile browser itself.
tap('character-button');assert(run('characterOpen&&!paused'));tap('character-done');assert.equal(run('characterOpen'),false);
tap('pause-button');assert(run('paused'));assert(!$('pause-overlay').classList.contains('hidden'));tap('resume-button');assert.equal(run('paused'),false);
tap('map-button');assert(run('mapOpen&&!paused'));tap('map-done');assert.equal(run('mapOpen'),false);

// The whole upper-left block is a keyboard-accessible, single modal trigger.
assert.equal($('loadout').parentElement,$('super-loadout').parentElement,'weapons and skills share one equipment strip');
const hudChildren=$('character-hud').children;
assert.equal(hudChildren.indexOf($('loadout').parentElement),hudChildren.findIndex(child=>child.contains($('hp-label')))+1,'the shared equipment row immediately follows the attribute meters');
assert.equal($('character-button').tagName,'BUTTON');assert.equal($('character-button').getAttribute('aria-controls'),'character-overlay');
for(const id of ['loadout','super-loadout','buff-status','companion-status','xp-caption','xp-fill','crystal-label','crystal-fill'])assert($('character-hud').contains($(id)),`${id} belongs in the upper-left character group`);
for(const id of ['loadout','super-loadout','buff-status','companion-status'])assert(!$('game-bottom').contains($(id)),`${id} must not occupy thumb controls`);
assert($('game-bottom').contains($('skill-button')),'manual skill remains in the controls area');
run("keys.add('KeyW');skillRequested=true;portalRequested=true;touch={id:77,dx:1,dy:0};game.player.skillCooldown=6;");
click('character-button');
assert(run('characterOpen&&!mapOpen&&!paused'));assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert.equal(run('skillRequested||portalRequested'),false);
assert.equal($('character-button').getAttribute('aria-expanded'),'true');assert(document.activeElement.classList.contains('character-panel'),'a pointer opens the panel without highlighting its close button');
assert.equal($('character-tab-attributes').getAttribute('aria-selected'),'true');
const before=model();run('frame(1000);frame(1040);');assert.deepEqual(model(),before,'character details freeze movement, simulation, cooldown and visual clock');
key('KeyW');key('Space');key('KeyE');click('skill-button');fire($('touch-skill'),'pointerdown');fire($('game-canvas'),'pointerdown');
assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert.equal(run('skillRequested||portalRequested'),false);
assert(fire($('character-overlay'),'pointerdown').stopped,'overlay stops pointer bubbling');
// Tabs are actual controls with a single selected accessible tab.
for(const tab of ['weapons','skills','status','attributes']){
  click(`character-tab-${tab}`);assert.equal(run('characterTab'),tab);assert.equal($(`character-tab-${tab}`).getAttribute('aria-selected'),'true');
  assert.equal(['attributes','weapons','skills','status'].filter(id=>$(`character-tab-${id}`).getAttribute('aria-selected')==='true').length,1);
  assert($('character-content').innerHTML.length>0);
}
fire($('character-tab-attributes'),'keydown',{key:'ArrowRight'});assert.equal(run('characterTab'),'weapons');assert.equal(document.activeElement.id,'character-tab-weapons');
fire($('character-tab-weapons'),'keydown',{key:'End'});assert.equal(run('characterTab'),'status');
fire($('character-tab-status'),'keydown',{key:'Home'});assert.equal(run('characterTab'),'attributes');
$('character-done').focus();for(const handler of documentListeners.keydown||[])handler({key:'Tab',shiftKey:false,preventDefault(){}});assert.equal(document.activeElement.id,'close-character','focus wraps inside the active details dialog');
key('Escape');assert.equal(run('characterOpen'),false);assert.equal(run('paused'),false);assert.equal($('character-button').getAttribute('aria-expanded'),'false');

// A deliberate drag is not a click, and canvas pointer capture retains a
// movement gesture even when its coordinates pass across the HUD.
fire($('character-button'),'pointerdown',{pointerId:22,clientX:25,clientY:25});fire($('character-button'),'pointermove',{pointerId:22,clientX:65,clientY:25});fire($('character-button'),'pointerup',{pointerId:22,clientX:65,clientY:25});click('character-button');assert.equal(run('characterOpen'),false,'dragging the HUD never opens details');
fire($('character-button'),'pointerdown',{pointerId:23});fire($('character-button'),'pointercancel',{pointerId:23});click('character-button');assert.equal(run('characterOpen'),false,'cancelled gestures never open details');
fire($('character-button'),'pointerdown',{pointerId:24});fire($('character-button'),'pointerup',{pointerId:24});click('character-button');assert(run('characterOpen'),'a fresh tap opens after a cancelled gesture');click('character-done');
fire($('game-canvas'),'pointerdown',{pointerId:25,clientX:200,clientY:600});fire($('game-canvas'),'pointermove',{pointerId:25,clientX:30,clientY:30});assert.equal(run('characterOpen'),false);assert.equal(run('touch.id'),25);assert.equal($('game-canvas').captured,25);fire($('game-canvas'),'pointerup',{pointerId:25});
fire($('game-canvas'),'pointerdown',{pointerId:26,clientX:200,clientY:600});fire($('character-button'),'pointerdown',{pointerId:27});fire($('character-button'),'pointerup',{pointerId:27});click('character-button');assert.equal(run('characterOpen'),false,'a second finger cannot accidentally interrupt a live movement gesture');fire($('game-canvas'),'pointerup',{pointerId:26});
// Keyboard activation does not depend on receiving pointer events.
$('character-button').focus();fire($('character-button'),'click',{detail:0});assert(run('characterOpen'));assert.equal(document.activeElement.id,'close-character');key('KeyC');assert.equal(run('characterOpen'),false);assert.equal(document.activeElement.id,'character-button','keyboard activation restores its original control');

// Details and map are mutually exclusive independent pause reasons.
key('KeyC');key('KeyM');assert(run('mapOpen&&!characterOpen'));assert($('character-overlay').classList.contains('hidden'));key('KeyC');assert(run('characterOpen&&!mapOpen'));assert($('map-overlay').classList.contains('hidden'));key('Escape');assert(run('!characterOpen&&!mapOpen&&!paused'));
click('pause-button');click('pause-character-button');assert(run('paused&&characterOpen'));key('Escape');assert(run('paused&&!characterOpen'));assert(document.activeElement.classList.contains('pause-panel'),'pointer-opened details return to the containing pause panel');click('resume-button');assert.equal(run('paused'),false);
key('KeyC');for(const handler of windowListeners.blur||[])handler();assert(run('paused&&characterOpen'));click('character-done');assert(run('paused&&!characterOpen'),'background pause is preserved when closing details');click('resume-button');
key('KeyC');click('help-button');assert(run('helpOpen&&characterOpen'));key('Escape');assert(run('!helpOpen&&characterOpen'));assert(document.activeElement.classList.contains('character-panel'));key('Escape');

// Never spend a crystal/reward or change equipment behind the details modal.
run("game.crystals=game.crystalsNext;game.status='upgrade';upgradeLevel=0;openUpgrades();");
click('upgrade-pause');click('close-pause');assert.equal(run('paused'),false);assert.equal(run('game.status'),'upgrade','closing pause returns to the required reward choice');assert(!$('upgrade-overlay').classList.contains('hidden'));
let upgrade=$('upgrade-cards').children[0];assert(upgrade.onclick);const upgradeBefore=run('game.skillLevel');key('KeyC');upgrade.onclick();assert.equal(run('game.skillLevel'),upgradeBefore);key('Escape');assert.equal(run('game.status'),'upgrade');upgrade.onclick();assert.equal(run('game.skillLevel'),upgradeBefore+1);
run("game.regions.rewardPortal={rewardClaimed:false};game.superSkills.offer('region',game.region.id);game.status='super';openSuperChoices();");
const superChoice=$('super-cards').children[0],superBefore=run('Object.values(game.superSkills.owned).filter(level=>level>0).length');key('KeyC');superChoice.onclick();assert.equal(run('Object.values(game.superSkills.owned).filter(level=>level>0).length'),superBefore);key('Escape');assert.equal(run('game.status'),'super');superChoice.onclick();assert.equal(run('Object.values(game.superSkills.owned).filter(level=>level>0).length'),superBefore+1);
run("game.status='playing';game.build.increment('arrow');game.build.increment('arrowPower');game._refreshWeapons();");
run("const merchant=game.settlements.sites.find(site=>site.type==='merchant');const shopBefore=JSON.stringify({gold:game.gold,state:merchant.state,stock:merchant.stock});game.settlements.activeShop=merchant;game.status='shop';openShop();");
click('shop-pause');click('close-pause');assert.equal(run('game.status'),'shop');assert(!$('shop-overlay').classList.contains('hidden'));
click('close-shop');assert.equal(run('game.status'),'playing');assert.equal(run('JSON.stringify({gold:game.gold,state:merchant.state,stock:merchant.stock})'),run('shopBefore'),'closing the merchant neither spends coins nor dismisses the merchant');
key('KeyC');click('character-tab-weapons');
let equip=$('character-equip-arrow');assert.equal(equip.disabled,false);
const weaponBefore=run('JSON.stringify({rank:game.build.getWeapon("arrow").baseRank,modifiers:game.build.getWeapon("arrow").modifiers,branch:game.build.getWeapon("arrow").branch})');
fire($('character-content'),'click',{target:equip});assert.equal(run('game.build.isEquipped("arrow")'),false);assert.equal($('character-equip-sword').disabled,true);assert.equal(document.activeElement.id,'character-equip-arrow');
assert.equal(run('JSON.stringify({rank:game.build.getWeapon("arrow").baseRank,modifiers:game.build.getWeapon("arrow").modifiers,branch:game.build.getWeapon("arrow").branch})'),weaponBefore,'unequipping retains the weapon investment');
fire($('character-content'),'click',{target:$('character-equip-arrow')});assert.equal(run('game.build.isEquipped("arrow")'),true);
run("game.status='upgrade';renderCharacter();");equip=$('character-equip-arrow');assert(equip.disabled);fire($('character-content'),'click',{target:equip});assert.equal(run('game.build.isEquipped("arrow")'),true);key('Escape');assert.equal(run('game.status'),'upgrade');
run("game.status='playing';");

// Long builds share one bounded equipment strip; weapon and skill slots use one
// budget, including overflow counters. Exercise resize breakpoints and actual
// catalog items, then remove a weapon through the real equipment control.
run("game.build.increment('pulse');game.build.increment('lightning');game.build.increment('barrier');game.build.increment('fireball');game.build.increment('frostbolt');for(const id of ['meteor','swords'])game.superSkills.owned[id]=1;updateHUD();");
const owned=run('game.build.getSkillLoadout().length');
assert($('super-loadout').querySelector('.barrier-ready'),'automatic protection has a ready indicator');
assert.equal($('super-loadout').querySelectorAll('button').length,0,'barrier adds no manual control');
run('game.barrier.cooldown=7.2;updateHUD();');
assert.equal($('super-loadout').querySelector('.barrier-state').textContent,'8');
run('game.barrier.life=1.4;game.barrier.remaining=18;updateHUD();');
assert($('super-loadout').querySelector('.barrier-active'));
run('game.barrier.life=0;game.barrier.remaining=0;game.barrier.cooldown=0;updateHUD();');

const assertSharedSlots=(budget)=>{
  const shown=$('super-loadout').querySelectorAll('.skill-slot').length;
  assert(shown<owned&&shown>0,`the compact HUD limits its skill slots: owned=${owned}, shown=${shown}`);
  const overflow=$('super-loadout').textContent.match(/\+(\d+)/);assert(overflow,'hidden skills have a +N counter');assert.equal(Number(overflow[1]),owned-shown);
  const weaponSlots=$('loadout').querySelectorAll('.combat-slot').length,skillSlots=$('super-loadout').querySelectorAll('.combat-slot').length;
  assert(weaponSlots<=2,'weapons reserve at most two positions');
  assert.equal(weaponSlots+skillSlots,budget,'the shared equipment strip fills but never exceeds its slot budget');
  assert($('loadout').querySelectorAll('.weapon-slot').length>0,'at least one equipped weapon stays visible');
};
for(const [width,height,budget] of [[320,717,5],[393,717,6],[1100,700,7],[844,390,6]]){
  viewport={...viewport,width,height};run('resize();updateHUD();');assertSharedSlots(budget);
}
viewport={...viewport,width:393,height:717};run('resize();updateHUD();');
const skillSlotsBeforeRemoval=$('super-loadout').querySelectorAll('.skill-slot').length;
key('KeyC');click('character-tab-weapons');
fire($('character-content'),'click',{target:$('character-equip-arrow')});
assert.equal(run('game.build.isEquipped("arrow")'),false);assertSharedSlots(6);
assert.equal($('super-loadout').querySelectorAll('.skill-slot').length,skillSlotsBeforeRemoval+1,'removing a weapon immediately gives its slot to the skills row');
fire($('character-content'),'click',{target:$('character-equip-arrow')});assertSharedSlots(6);
assert.equal($('super-loadout').querySelectorAll('.skill-slot').length,skillSlotsBeforeRemoval,'re-equipping returns the original skill capacity');
key('Escape');
run("game.build.increment('orbit');game._refreshWeapons();updateHUD();");
assertSharedSlots(6);
assert.match($('loadout').textContent,/\+2/,'all three weapons stay inside the existing two-position budget');
key('KeyC');click('character-tab-skills');assert.equal($('character-content').querySelectorAll('[data-capability-id]').length,owned,'details list every acquired skill');
click('quit-button');assert.equal(run('game'),null);assert($('run-summary').classList.contains('hidden'),'returning home hides passive run statistics');assert.equal(run('characterOpen'),false);assert($('character-overlay').classList.contains('hidden'));assert.equal($('character-button').getAttribute('aria-expanded'),'false');
await start();assert.equal(run('characterOpen'),false);assert.equal(run('characterTab'),'attributes');
// A weapon-bound upgrade remains in the existing equipment strip. Details
// can explain it without adding an automatic skill or a mobile HUD slot.
const compactBefore={weapons:$('loadout').querySelectorAll('.combat-slot').length,skills:$('super-loadout').querySelectorAll('.combat-slot').length};
run("game.levels.sword=3;game.levels.swordEnergy=1;game._refreshWeapons();updateHUD();");
assert.equal($('loadout').querySelectorAll('.combat-slot').length,compactBefore.weapons);
assert.equal($('super-loadout').querySelectorAll('.combat-slot').length,compactBefore.skills);
assert.equal(run("game.build.getSkill('swordEnergy')"),null);

// Sword art joins the normal scene depth instead of the final air-effects
// layer. The same ground anchor still orders the unchanged player sprite.
assert.equal(run(`(()=>{const actor=actorVisual(game.player,true),foot=actor.footY;
 const front={kind:'sword',sortY:foot+2,effect:{seed:1}},back={kind:'sword',sortY:foot-2,effect:{seed:2}};
 const wall={id:'front-wall',type:'log',variant:'castle-wall',x:actor.x,y:foot+20,r:14,halfLength:100};
 return sceneDrawList([actor],[wall],[],[front,back]).map(item=>item.kind==='sword'?(item.effect.seed===1?'front-sword':'back-sword'):item.kind).join(',');})()`),'back-sword,actor,front-sword,terrain');
const swordDraws=[],originalSwordDraw=sandbox.drawSwordSlash;
sandbox.drawSwordSlash=(ctx,e,g,options)=>{swordDraws.push(options);return originalSwordDraw(ctx,e,g,options);};
run(`game.effects=[{type:'swordSlash',x:game.player.x,y:game.player.y,groundY:game.player.y+19.8,r:122,meleeRange:100,energyRank:1,angle:0,arc:1.95,windup:.065,hitTime:.115,attackAge:.115,maxLife:.28,life:.165,followOwner:true,owner:game.player,seed:765}];`);shippedRenderGame();
assert.equal(swordDraws.length,1,'one sword effect renders once in the scene, never again in the air layer');
assert(swordDraws[0].actor.entity===run('game.player'));
assert(Number.isFinite(swordDraws[0].pose.sortY),'the frame uses the art pose for depth ordering');
assert(Number.isFinite(swordDraws[0].bodyY),'walking body offset accompanies the owner silhouette');
sandbox.drawSwordSlash=originalSwordDraw;run('game.effects=[];');
run("game.sceneTransition.active=true;");key('KeyC');click('character-button');assert.equal(run('characterOpen'),false,'scene changes cannot be interrupted by details');

console.log('Character HUD: touch activation, equipment below attributes with shared responsive slots, value-only resource captions, passive run-statistics lifecycle, frozen simulation/cooldowns, pause and reward preservation, modal exclusivity, drag/cancel guards, tabs, and equipment investment passed (VM DOM; no browser layout assertion).');
