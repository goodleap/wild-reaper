import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { ACTOR_VISUALS } from './dist/actor-visuals.js';
import { DAMAGE_NUMBERS, damageNumberAnchor, emitDamageNumber, drawDamageNumber } from './dist/damage-numbers.js';

const game=()=>{
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,elites:false,companions:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g._spawn=Infinity;g.nextBossAt=Infinity;g._shot=Infinity;
  for(const id of Object.keys(g.build.weapons))g.build.setEquipped(id,false);
  return g;
};
const enemy=(g,type='slime',extra={})=>{
  const e=g._spawnEnemy(type==='trainingDummy'?'slime':type);Object.assign(e,{type,x:140,y:80,hp:10000,maxHp:10000,speed:0,xp:0,attackCooldown:Infinity},extra);return e;
};
const numbers=g=>g.effects.filter(e=>e.type==='damage'&&e.life>0);

const g=game(),dummy=enemy(g,'trainingDummy',{trainingDummy:true,defense:100});
let randomCalls=0;const random=Math.random;Math.random=()=>{randomCalls++;return .7;};
assert.equal(g._hurtEnemy(dummy,80,0,g.player,'sword'),40);
assert.equal(numbers(g).length,1,'the dummy always shows a valid hit');
assert.equal(numbers(g)[0].text,'40','a label reports post-defense HP damage');
assert.equal(numbers(g)[0].damageAmount,40);assert.equal(dummy.hp,9960);
assert.equal(randomCalls,0,'visual placement never consumes combat or loot randomness');
const first=numbers(g)[0];
assert(first.y+4<dummy.y-47,'the entire text baseline stays above the dummy name');
assert.equal(first.groundY,dummy.y+groundOffset(dummy),'castle visibility uses the struck actor ground point');
for(const source of ['arrow','orbit','lightning','pulse','super'])g._hurtEnemy(dummy,20,0,g.player,source);
assert.equal(numbers(g).length,6);
assert.equal(new Set(numbers(g).map(e=>`${e.x},${e.y}`)).size,6,'simultaneous attacks occupy six distinct fixed lanes');
for(const e of numbers(g)){
  assert.equal(e.groundX,dummy.x,'horizontal scatter retains the struck point for visibility');
  assert(Math.abs(e.x-dummy.x)<=36,'scatter remains near its owner');
  assert(damageNumberAnchor(dummy).y-e.y<=33,'start heights remain bounded');
}
const visibleSource=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8').match(/function sceneVisible\(entity\)\{[^\n]*\}/)[0];
const renderedVisible=new Function('game','ACTOR_VISUALS','groundOffset','entity',`return (${visibleSource})(entity);`);
const doorway={dungeon:{active:{},vision:{isVisible:(x,y)=>x===dummy.x&&y===dummy.y+groundOffset(dummy)}}};
for(const label of numbers(g))assert(renderedVisible(doorway,ACTOR_VISUALS,groundOffset,label),'a visible hit keeps all scattered lanes visible beside a wall');
doorway.dungeon.vision.isVisible=()=>false;
assert(!renderedVisible(doorway,ACTOR_VISUALS,groundOffset,numbers(g)[0]),'unseen rooms still hide floating damage');
g._hurtEnemy(dummy,20,0,g.player,'sword');
assert.equal(numbers(g).length,6);assert(!g.effects.includes(first),'the oldest label yields at the per-target cap');
assert.equal(randomCalls,0);Math.random=random;

const shapes=game();
for(const [type,shape] of Object.entries(ACTOR_VISUALS).filter(([type])=>type!=='player')) {
  const target=enemy(shapes,type,{r:shape.radius*1.4,name:type==='boss'?'古木首领':undefined});
  const anchor=damageNumberAnchor(target);
  assert(anchor.y<target.y-shape.top*1.4-10,`${type} uses the rendered head instead of collision radius`);
}
const small=enemy(shapes,'slime',{hp:3,defense:100});
const guard=enemy(shapes,'brute',{rescueId:'rescue:label'});
assert(damageNumberAnchor(guard).y+4<guard.y-ACTOR_VISUALS.brute.top-25,'damage clears the full rescue guard title');
assert.equal(shapes._hurtEnemy(small,100,0,shapes.player,'sword'),3);
assert.equal(numbers(shapes).at(-1).text,'3','overkill never claims damage beyond the HP removed');

const ticks=game(),a=enemy(ticks),b=enemy(ticks,'slime',{x:250});
emitDamageNumber(ticks,a,1.4,'bleed');const bleed=numbers(ticks)[0];
ticks._clock=.06;assert.equal(emitDamageNumber(ticks,a,1.4,'bleed'),bleed);
assert.equal(numbers(ticks).length,1);assert.equal(bleed.text,'3');assert.equal(bleed.damageAmount,2.8,'sum precise values before rounding');
assert.equal(bleed.life,DAMAGE_NUMBERS.life,'merging does not restart age or cause a perpetual label');
emitDamageNumber(ticks,a,12,'arrow');emitDamageNumber(ticks,a,12,'arrow');
assert.equal(numbers(ticks).filter(e=>e.damageSource==='arrow').length,2,'multi-hit weapon damage remains separate');
emitDamageNumber(ticks,b,9,'bleed');assert.equal(numbers(ticks).filter(e=>e.damageSource==='bleed').length,2,'different enemies never share a total');
ticks._clock=.121;emitDamageNumber(ticks,a,2,'bleed');
assert.equal(numbers(ticks).filter(e=>e.damageSource==='bleed').length,3,'only a short fixed bleed window merges');
ticks.effects=[];emitDamageNumber(ticks,a,4,'bleed');assert.equal(numbers(ticks)[0].text,'4','scene effect clearing cannot merge into a stale label');
for(const value of [0,-1,NaN,Infinity])assert.equal(emitDamageNumber(ticks,a,value,'sword'),null);
ticks.status='paused';assert.equal(emitDamageNumber(ticks,a,4,'sword'),null);

const crowd=game();crowd._effect(0,0,'rescueWarning',1.2,28,'#fff');const warning=crowd.effects[0];
for(let i=0;i<120;i++)emitDamageNumber(crowd,enemy(crowd,'slime',{x:i*5}),20,'sword');
assert.equal(numbers(crowd).length,DAMAGE_NUMBERS.globalLimit);assert(crowd.effects.includes(warning));
crowd.effects=[];for(let i=0;i<200;i++)crowd._effect(i,0,'rescueWarning',1.2,28,'#fff');
assert.equal(emitDamageNumber(crowd,crowd.enemies[0],50,'sword'),null);
assert.equal(crowd.effects.length,200);assert(crowd.effects.every(e=>e.type==='rescueWarning'),'damage labels cannot evict protected spawn cues');

const paused=game(),frozen=enemy(paused);emitDamageNumber(paused,frozen,20,'sword');
const floating=numbers(paused)[0],initial={y:floating.y,life:floating.life};
paused.status='paused';paused.update(.04);assert.deepEqual({y:floating.y,life:floating.life},initial);
paused.status='playing';paused.update(.04);
assert(Math.abs(floating.y-(initial.y-26*.04))<1e-7);assert(Math.abs(floating.life-(initial.life-.04))<1e-7);

const calls=[],ctx={save(){},restore(){},translate(...args){calls.push(['translate',...args]);},scale(...args){calls.push(['scale',...args]);},strokeText(...args){calls.push(['stroke',...args]);},fillText(...args){calls.push(['fill',...args]);}};
assert.equal(drawDamageNumber(ctx,{type:'heal'}),false);
drawDamageNumber(ctx,{type:'damage',x:20,y:30,life:.665,maxLife:.72,damageSide:1,text:'123'});
assert.equal(ctx.font,'700 14px ui-monospace,monospace');assert.equal(ctx.lineWidth,1.8);assert.equal(ctx.shadowBlur,0);
assert.equal(calls.filter(c=>c[0]==='stroke').length,1);assert.equal(calls.filter(c=>c[0]==='fill').length,1,'one outline and one fill per number');
assert(calls.find(c=>c[0]==='scale')[1]>1,'the brief pop is subtle and positive');
calls.length=0;drawDamageNumber(ctx,{type:'damage',x:20,y:30,life:.1,maxLife:.72,damageSide:-1,text:'123'},{reduced:true});
assert.deepEqual(calls.find(c=>c[0]==='translate'),['translate',20,30]);assert.deepEqual(calls.find(c=>c[0]==='scale'),['scale',1,1]);
assert(ctx.globalAlpha>0&&ctx.globalAlpha<.3,'the final part fades smoothly');
console.log('Damage numbers: deterministic distinct lanes, real damage, shared actor heights, names, bounded budgets, protected cues, precise short bleed sums, scene cleanup, pause, reduced motion and restrained rendering passed.');
