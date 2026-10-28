import assert from 'node:assert/strict';
import { importantActorName,actorVisibleBounds,actorNameplate,labelActorVisual,drawActorNameplate,ACTOR_LABEL_STYLE } from './dist/actor-labels.js';
import { actorShape } from './dist/actor-visuals.js';
import { bossDefinition,BOSS_DEFS } from './dist/boss-definitions.js';
import { CharacterSprites } from './dist/character-sprites.js';
import { sceneDialogueAvoidance } from './dist/scene-dialogue-avoidance.js';
import { layoutSceneDialogue } from './dist/scene-dialogue-renderer.js';
import { drawScriptedSceneDialogue } from './dist/scene-script-dialogue.js';
import { harness } from './qa-app-harness.mjs';

const hero={x:100,y:100,heroId:'traveler',name:'王子',storyActor:true};
assert.equal(importantActorName(hero,hero),'','the actual player is excluded by identity, not the shared humanoid actor flag');
assert.equal(importantActorName({type:'royalmage',name:'法师'},hero),'','ordinary enemies do not gain blanket labels');
assert.equal(importantActorName({enemyArtId:'royalguard'},hero),'刀盾步卒');
assert.equal(importantActorName({isTownNpc:true,townKind:'angel'},hero),'天使');
assert.equal(importantActorName({isCompanion:true,name:'猫头鹰',state:'recovering',hp:0},hero),'猫头鹰 · 恢复中');
assert.equal(importantActorName({isCaptive:true,name:'守卫',state:'ready'},hero),'守卫 · 等待同行');
assert.equal(importantActorName({isCaptive:true,kind:'golem',name:'石像'},hero),'石像 · 沉睡');
for(const kind of Object.keys(BOSS_DEFS)){
  const e={type:'boss',bossKind:kind,x:200,y:300,r:actorShape({type:'boss',bossKind:kind}).radius,hp:1};
  const actor=labelActorVisual(e),plate=actorNameplate(actor,{player:hero});
  assert.equal(plate.text,bossDefinition(kind).name);
  assert.equal(plate.y,e.y-actor.shape.top-8,`${kind}: name uses the visible silhouette, not a shared boss offset`);
  e.specialLift=36;assert.equal(actorNameplate(actor,{player:hero}).y,plate.y-36,'a leaping boss takes its name along');
}
const angel=labelActorVisual({x:200,y:300,isTownNpc:true,townKind:'angel'},true);
assert.equal(actorVisibleBounds(angel).top,256,'the halo is part of the angel name clearance');
const spriteRenderer=new CharacterSprites(),npc={x:200,y:300,isTownNpc:true,name:'失踪的林间送信人',characterSpriteId:'courier'};
const actor=labelActorVisual(npc,true),sprite=spriteRenderer.geometry(actor),plate=actorNameplate(actor,{player:hero,sprite});
assert.equal(plate.y,sprite.top-8,'the atlas frame head anchor matches the accepted preview');
const events=[],ctx={save(){},restore(){},strokeText(text,x,y){events.push({kind:'outline',text,x,y,color:this.strokeStyle,width:this.lineWidth,join:this.lineJoin});},fillText(text,x,y){events.push({kind:'fill',text,x,y,font:this.font,color:this.fillStyle,baseline:this.textBaseline});}};
drawActorNameplate(ctx,plate);
assert.deepEqual(events,[{kind:'outline',text:plate.text,x:plate.x,y:plate.y,color:'#26382b',width:2.4,join:'round'},{kind:'fill',text:plate.text,x:plate.x,y:plate.y,font:'600 9px system-ui,sans-serif',color:'#e5d3a0',baseline:'alphabetic'}]);
const g={player:hero,enemies:[],quests:{getActors:()=>[npc]},companions:{members:[],camps:[]},settlements:{sites:[]}};
const options={width:540,height:700,spriteGeometry:a=>spriteRenderer.geometry(a),namesOnly:true};
const avoid=sceneDialogueAvoidance(g,options);
assert.equal(avoid.length,1);assert.deepEqual(avoid[0],plate.bounds);
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const ambient=layoutSceneDialogue([{id:1,text:'王子，送信的路还安全吗？',clock:0,remaining:3,priority:30,speaker:{x:npc.x,y:npc.y,headOffset:58}}],{project:(x,y)=>({x,y}),width:540,height:700,avoid});
assert.equal(ambient.length,1);assert(!overlaps(ambient[0].rect,avoid[0]));
const drawctx=new Proxy({measureText:t=>({width:t.length*9})},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
const boss={type:'boss',bossKind:'frostcrown',x:270,y:400,r:49,hp:1};g.enemies=[boss];
const bossNames=sceneDialogueAvoidance(g,options),line={id:'boss-speaking',actor:boss,text:'…'};
const script=drawScriptedSceneDialogue(drawctx,[line],{project:(x,y)=>({x,y}),width:540,height:700,avoid:bossNames});
assert.equal(script.length,1);assert(bossNames.every(r=>!overlaps(script[0].rect,r)),'scripted markers clear tall boss names too');
const original=script[0].rect;boss.x+=20;boss.y+=10;
const moved=drawScriptedSceneDialogue(drawctx,[line],{project:(x,y)=>({x,y}),width:540,height:700,avoid:sceneDialogueAvoidance(g,options)})[0].rect;
assert.equal(moved.x-original.x,20);assert.equal(moved.y-original.y,10,'scripted marker keeps its first actor-relative offset');
for(let frame=0;frame<90;frame++){const held=drawScriptedSceneDialogue(drawctx,[line],{project:(x,y)=>({x,y}),width:540,height:700,avoid:frame%2?[moved]:[]});assert.equal(held.length,1,'a passing name does not flicker or interrupt existing scripted speech');assert.deepEqual(held[0].rect,moved);}

const h=harness();
h.run(`
  game={player:{x:-200,y:0},_clock:0};
  const labelEvents=[];ctx.strokeText=(text,x,y)=>labelEvents.push({kind:'outline',text,x,y,color:ctx.strokeStyle,width:ctx.lineWidth});
  ctx.fillText=(text,x,y)=>labelEvents.push({kind:'fill',text,x,y,color:ctx.fillStyle,font:ctx.font});
  const merchant={x:200,y:250,r:15,name:'城镇商人',isTownNpc:true,townKind:'merchant'};
  const savedArt=humanoidArt.draw;humanoidArt.draw=()=>true;
  for(const region of ['rift-forest','snow','ember','shop']){game.terrain={island:{layout:{kind:region}}};drawActor(actorVisual(merchant,true));}
  merchant.arrival={startedAt:0,duration:1};drawActor(actorVisual(merchant,true));
  humanoidArt.draw=savedArt;
`);
assert.equal(h.run('labelEvents.length'),8,'each terrain draws exactly one outline and one name; an unrevealed arrival draws neither');
assert(h.run("labelEvents.filter(e=>e.kind==='outline').every(e=>e.color==='#26382b'&&e.width===2.4)"));
assert(h.run("labelEvents.filter(e=>e.kind==='fill').every(e=>e.color==='#e5d3a0'&&e.font==='600 9px system-ui,sans-serif')"));
console.log('Actor names passed: important-only labels, all boss silhouettes/lift, halo and sprite bounds, preview style on every terrain, one depth-sorted label, arrival and both bubble paths.');
