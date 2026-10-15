import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SceneDialogue,dialogueSpeakers,DIALOGUE_RULES } from './dist/scene-dialogue.js';
import { layoutSceneDialogue,drawSceneDialogue } from './dist/scene-dialogue-renderer.js';
import { validateDialogueConfig } from './dist/config-validation/dialogue.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

const config=JSON.parse(readFileSync(new URL('./dist/config/sites.json',import.meta.url),'utf8'));
assert(validateDialogueConfig(config));
for(const change of [s=>s.dialogue.rules.maxVisible=3,s=>s.dialogue.rules.combatVisible=4,s=>s.dialogue.rules.merchantFarExit=10,s=>s.dialogue.lines.angel=['{secret}'],s=>s.dialogue.lines.captive=[],s=>s.dialogue.lines.join=['<button>']]){
  const invalid=structuredClone(config);change(invalid);assert.throws(()=>validateDialogueConfig(invalid),/Invalid sites.dialogue/);
}
const visible={isVisible:s=>!s.source.hidden};
function game(name='王子'){
  return {hero:{id:'traveler',dialogueName:name},status:'playing',mapId:'world:forest',terrain:{},player:{heroId:'traveler',x:0,y:-19.8},enemies:[],companions:{members:[],camps:[]},settlements:{sites:[]},relicSites:{sites:[]}};
}
const site=(type,x=150,id=type)=>({id,type,x,y:0,state:'ready',guardRadius:190});
const enemy=(type,id=1,x=150,extra={})=>({id,type,x,y:0,r:type==='boss'?49:18,hp:100,maxHp:100,guardActive:false,...extra});
const contents=d=>d.items(visible).map(item=>item.text).join(' ');
const tick=(d,g,dt=0)=>d.observe(g,dt,visible);

// Names are dialogue-specific, not the longer role-selection labels.
for(const name of ['王子','公主','老登']){
  const g=game(name),d=new SceneDialogue();g.hero.name='帅气王子';g.settlements.sites=[site('angel')];tick(d,g);
  assert(contents(d).includes(name));assert(!contents(d).includes('帅气'));
}
const merchant=game(),greet=new SceneDialogue();merchant.settlements.sites=[site('merchant',DIALOGUE_RULES.merchantFar+1)];tick(greet,merchant);
assert.equal(greet.items(visible).length,0,'Even a visible merchant waits until the distant greeting radius.');
merchant.settlements.sites[0].x=DIALOGUE_RULES.merchantFar;tick(greet,merchant);
assert(contents(greet).includes('王子'));assert.equal(greet.items(visible).length,1);
merchant.player.x=DIALOGUE_RULES.merchantFar-100;tick(greet,merchant,1);tick(greet,merchant,4);
assert(contents(greet).includes('用得上的'),'Approaching a visible shop follows its distant invitation with a close greeting.');
tick(greet,merchant,35);assert.equal(greet.items(visible).length,0,'Standing in range never repeats a greeting.');
for(const delta of [-1,1,-1,1]){merchant.player.x=DIALOGUE_RULES.merchantFar-DIALOGUE_RULES.merchantNear+delta;tick(greet,merchant,10);}
assert.equal(greet.items(visible).length,0,'Crossing the inner boundary cannot retrigger without leaving its outer hysteresis.');
merchant.player.x=800;tick(greet,merchant,30);merchant.player.x=0;tick(greet,merchant);
assert(contents(greet).includes('行装'),'A real departure plus cooldown permits the next stable variant.');

const hidden=game(),silence=new SceneDialogue();hidden.settlements.sites=[{...site('angel'),hidden:true}];tick(silence,hidden);
assert.equal(silence.items(visible).length,0);hidden.settlements.sites[0].hidden=false;tick(silence,hidden);
assert.equal(silence.items(visible).length,1,'An unseen cue remains eligible only after its actual speaker becomes visible.');
hidden.settlements.sites[0].hidden=true;assert.equal(silence.items(visible).length,0,'Draw-time visibility closes the gap before the next observation.');tick(silence,hidden);
assert.equal(silence.items(visible).length,0);assert.equal(silence.items().length,0,'Absent visibility evidence always fails closed.');

const priority=game(),scheduler=new SceneDialogue();priority.settlements.sites=[site('angel'),site('merchant',DIALOGUE_RULES.merchantFar)];tick(scheduler,priority);
assert.equal(scheduler.items(visible).length,2);
const boss=enemy('boss',9,210,{guardActive:true,bossKind:'ancient'});priority.enemies=[boss];tick(scheduler,priority,.1);
assert.equal(scheduler.items(visible).length,1);assert.equal(scheduler.items(visible)[0].speaker.source,boss,'A boss preempts both incidental greetings.');
boss.hp=40;tick(scheduler,priority,1);tick(scheduler,priority,3);
assert(contents(scheduler).includes('还没结束'),'The actual low-health state receives one follow-up line.');
boss.hp=0;tick(scheduler,priority);assert.equal(scheduler.items(visible).length,0,'Dead speakers leave no floating line.');

const territory=game(),warnings=new SceneDialogue();territory.enemies=[enemy('shieldguard',1,150,{territoryId:'group:a',territoryState:'idle'}),enemy('frostmage',2,170,{territoryId:'group:a',territoryState:'idle'})];tick(warnings,territory);assert.equal(warnings.items(visible).length,0);
for(const e of territory.enemies){e.guardActive=true;e.territoryState='chasing';}tick(warnings,territory);
assert.equal(warnings.items(visible).length,1);assert(contents(warnings).includes('守住入口'));
tick(warnings,territory,4);territory.enemies.forEach(e=>e.hidden=true);tick(warnings,territory,25);territory.enemies.forEach(e=>e.hidden=false);tick(warnings,territory);
assert.equal(warnings.items(visible).length,0,'Camera visibility changes cannot re-arm the same active group.');
territory.enemies.forEach(e=>{e.guardActive=false;e.territoryState='returning';});tick(warnings,territory);
territory.enemies.forEach(e=>{e.guardActive=true;e.territoryState='chasing';});tick(warnings,territory);
assert.equal(warnings.items(visible).length,1,'A disengaged group may warn on a later intrusion after cooldown.');
const beasts=game(),growl=new SceneDialogue();beasts.enemies=[enemy('boar',1,150,{guardActive:true,territoryId:'boars',territoryState:'alert'})];tick(growl,beasts);assert.match(contents(growl),/哼哧/);

const rescue=game('公主'),voices=new SceneDialogue();rescue.companions.camps=[{id:'camp:1',siteId:'ruin:1',kind:'warden',x:160,y:0,state:'trapped'}];rescue.relicSites.sites=[{id:'ruin:1',type:'rescue',kind:'warden',x:160,y:0,state:'ready'}];
assert.equal(dialogueSpeakers(rescue).length,1,'An activated ruin and its camp describe one captive.');tick(voices,rescue);assert.match(contents(voices),/束缚/);
rescue.companions.camps[0].state='ready';tick(voices,rescue,4);assert.match(contents(voices),/守卫倒下/);
tick(voices,rescue,.05);tick(voices,rescue,4);assert.equal(voices.items(visible).length,0,'Ready-state and proximity handling cannot repeat the same rescue cue.');
rescue.companions.camps=[];rescue.relicSites.sites[0].state='cleared';rescue.companions.members=[{id:1,kind:'warden',heroId:'warden',isCompanion:true,state:'active',x:150,y:-19.8,r:15,hp:100,rescuedFace:.65}];tick(voices,rescue);
assert.match(contents(voices),/公主/);rescue.companions.members[0].rescuedFace=0;tick(voices,rescue,4);rescue.companions.members[0].castFace=.3;tick(voices,rescue);assert.match(contents(voices),/掩护/);
tick(voices,rescue,4);rescue.companions.members[0].castFace=0;tick(voices,rescue);rescue.companions.members[0].castFace=.3;tick(voices,rescue);assert.equal(voices.items(visible).length,0,'Repeated casts do not become a speech loop.');
for(const kind of ['dog','owl','golem']){
  const g=game(),d=new SceneDialogue();g.companions.members=[{id:1,kind,heroId:kind,isCompanion:true,state:'active',x:150,y:0,hp:100,rescuedFace:.65}];tick(d,g);assert.equal(d.items(visible).length,1);assert(!contents(d).includes('王子'),'Animal companions and the golem retain their own voices.');
}

// State advances only during play, never while shopping, paused, or selecting.
const paused=game(),pauseDialogue=new SceneDialogue();paused.settlements.sites=[site('angel')];tick(pauseDialogue,paused);
const remaining=pauseDialogue.items(visible)[0].remaining;paused.status='shop';tick(pauseDialogue,paused,100);assert.equal(pauseDialogue.items(visible).length,0);
paused.status='playing';tick(pauseDialogue,paused);assert.equal(pauseDialogue.items(visible)[0].remaining,remaining);
paused.mapId='world:moon';paused.settlements.sites=[];tick(pauseDialogue,paused);assert.equal(pauseDialogue.items(visible).length,0,'Changing scenes clears old speech immediately.');
const immutable=game(),presentation=new SceneDialogue();immutable.settlements.sites=[Object.freeze(site('angel'))];immutable.enemies=[Object.freeze(enemy('slime',4,700))];
const before=JSON.stringify(immutable),random=Math.random;Math.random=()=>{throw new Error('Dialogue must not consume combat randomness');};
try{tick(presentation,immutable);tick(presentation,immutable,.1);}finally{Math.random=random;}
assert.equal(JSON.stringify(immutable),before,'Observation leaves simulation objects, HP, positions and flags untouched.');

// Verify the observer against production recruitment and casting objects, not
// only hand-authored speech fixtures. No extra dialogue hooks are required in
// combat, recruitment, damage, or settlement code.
const actual=new Game({hero:'princess',terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false}),actualVoices=new SceneDialogue();
actual.enemies=[];actual.events=[];
const ally=actual.companions.recruit('stormcaller',{x:120,y:20,sourceId:'qa:dialogue'});
assert(ally);tick(actualVoices,actual);assert.match(contents(actualVoices),/公主/);
ally.rescuedFace=0;tick(actualVoices,actual,4);
const target=actual._spawnEnemy('slime');Object.assign(target,{x:230,y:0,hp:1000,maxHp:1000});actual._rebuildGrid();
assert(actual.companions._castLightning(ally));const actualHp=target.hp;tick(actualVoices,actual);
assert.match(contents(actualVoices),/雷光/);assert.equal(target.hp,actualHp,'Observing real support cannot apply additional combat effects.');

const bubble={id:1,speaker:{x:300,y:300,headOffset:58},text:'公主，这里有我守着。',priority:35,remaining:3};
const projection={project:(x,y)=>({x,y}),width:640,height:480};
const normal=layoutSceneDialogue([bubble],projection);assert.equal(normal.length,1);
const first=normal[0].rect;
const redirected=layoutSceneDialogue([bubble],{...projection,avoid:[{x:295,y:first.y,width:10,height:first.height}]});assert.equal(redirected.length,1);assert.notDeepEqual(redirected[0].rect,first,'Bubbles move to an available nearby position instead of covering an exclusion.');
assert.equal(layoutSceneDialogue([bubble],{...projection,avoid:[{x:0,y:0,width:640,height:480}]}).length,0,'A packed screen omits dialogue.');
assert.equal(layoutSceneDialogue([{...bubble,speaker:{x:-10,y:200}}],projection).length,0,'Offscreen speakers never gain an edge indicator.');
assert.equal(layoutSceneDialogue([{...bubble,text:'长'.repeat(100)}],projection).length,0,'Oversized prose cannot exceed the compact two-line layout.');
let saves=0,restores=0,draws=0;
const ctx={save(){saves++;},restore(){restores++;},measureText:t=>({width:Array.from(t).length*12}),beginPath(){},roundRect(){},fill(){},stroke(){},moveTo(){},lineTo(){},fillText(){draws++;}};
drawSceneDialogue(ctx,[bubble],projection);assert.equal(saves,restores);assert(draws>0);
assert.equal(DIALOGUE_RULES.maxVisible,2);
console.log('Scene dialogue QA passed: contextual names, real roles, rescue and support transitions, group warnings, priority, hysteresis, pause/scene identity, fail-closed visibility, no simulation/random mutations, compact collision-free overlays.');
