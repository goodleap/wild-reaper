import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment } from './dist/environment.js';
import { weaponStats } from './dist/combat-stats.js';
import { isDepthAttackEffect, visitLegacyAttackDepthItems } from './dist/legacy-attack-depth.js';

let seed=94713;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.terrain=new Terrain({obstacles:[]});g.enemies=[];g.effects=[];g.events=[];g.player.x=0;g.player.y=0;
  return g;
}
function enemy(g,x,y,offset){
  const e=g._spawnEnemy('slime');Object.assign(e,{x,y,groundOffset:offset,speed:0,hp:10000,maxHp:10000});return e;
}
function ground(e,human=false){return e.y+groundOffset(e,human);}
function checkArc(e,source,target,human=false){
  assert.equal(e.x,source.x);assert.equal(e.y,source.y);assert.equal(e.x2,target.x);assert.equal(e.y2,target.y);
  assert.equal(e.renderGroundY,ground(source,human));assert.equal(e.renderEndGroundY,ground(target));
}
function collect(g,e,options={}){
  const result=[],snapshot=structuredClone(e);
  let draws=0;
  visitLegacyAttackDepthItems(g,e,options,()=>draws++,item=>result.push(item));
  const ctx={save(){},restore(){},beginPath(){},rect(){},clip(){}};
  for(const item of result){assert(Number.isFinite(item.sortY));assert.equal(item.effect,e);item.draw(ctx);}
  assert.equal(draws,result.length,'each descriptor reuses the unchanged painter once');
  assert.deepEqual(e,snapshot,'depth collection/drawing cannot change simulation effect data');
  return result;
}

const chain=arena();chain.levels.lightning=3;
const chainEnemies=[enemy(chain,0,-70,8),enemy(chain,0,-140,31),enemy(chain,0,-210,13)];
chain._lightning=0;chain.attacks.updateLightning(0);
const arcs=chain.effects.filter(e=>e.type==='lightning');assert(arcs.length>=2);
for(const [i,e] of arcs.entries()){
  const source=i?chainEnemies[i-1]:chain.player;
  checkArc(e,source,chainEnemies[i],!i);
}
assert.notEqual(arcs[1].renderGroundY-arcs[1].y,groundOffset(chain.player,true),'later player-chain hops use the preceding enemy lift');

const focused=arena();focused.levels.lightning=5;focused.branches.lightning='focus';focused.evolutions.lightning=true;
const focusTarget=enemy(focused,70,-130,37);focused._lightning=0;focused.attacks.updateLightning(0);
checkArc(focused.effects.find(e=>e.type==='lightning'&&e.focus),focused.player,focusTarget,true);

const allies=arena(),caster={id:997,isCompanion:true,x:0,y:0,r:16,groundOffset:43};
const allyTargets=[enemy(allies,0,-65,7),enemy(allies,0,-130,29),enemy(allies,0,-195,11)];
assert(allies.companions._castLightning(caster));
const allyArcs=allies.effects.filter(e=>e.type==='lightning');assert(allyArcs.length>=2);
for(const [i,e] of allyArcs.entries())checkArc(e,i?allyTargets[i-1]:caster,allyTargets[i],!i);
assert.equal(allyArcs[1].renderGroundY-allyArcs[1].y,7,'ally chain hop two originates at enemy one, not at the caster');

const conduction=arena(),marked=enemy(conduction,20,-40,9),receiver=enemy(conduction,25,-100,28);
conduction.combatStatus._conduct(marked,marked.x,marked.y,12);
checkArc(conduction.effects.find(e=>e.type==='conduction'),marked,receiver);
assert.equal(receiver.hp,9988,'visual metadata does not alter conduction damage');

const rune=arena();rune.environment=new Environment(rune,{generation:false});
const prop={x:0,y:19.8,r:45,state:'active',remaining:2,_shot:0,element:'frost'},runeTarget=enemy(rune,50,-90,27);
rune.environment.mechanisms._rune(prop,0);
const bolt=rune.effects.find(e=>e.type==='runeBolt');
assert.equal(bolt.renderGroundY,prop.y,'fixed rune origin is already on the ground');
assert.equal(bolt.renderEndGroundY,ground(runeTarget));

const runic=arena();assert(runic.build.awardRuneArrow());
const beamTarget=enemy(runic,120,-150,36),runicStats=weaponStats(runic,'arrow');
assert(runic.superSkills.castRunicVolley(runicStats,beamTarget));
const charge=runic.effects.find(e=>e.type==='superRunicCharge'),castGround=ground(runic.player,true);
assert.equal(charge.renderGroundY,castGround);
runic.player.x=75;runic.player.y=70;runic.player.groundOffset=33;
runic.superSkills._updateRunic(.2);
const ray=runic.effects.find(e=>e.type==='superRay');assert(ray);
assert.equal(ray.renderGroundY,castGround,'delayed beam keeps its actual emission snapshot after caster movement');
assert(Math.abs((ray.renderEndGroundY-ray.y2)-(castGround-charge.y))<1e-9);

const e={type:'superRay',x:0,y:0,x2:30,y2:-180,renderGroundY:20,renderEndGroundY:-160,life:.3,maxLife:.5};
let bounds,path;
const items=collect(runic,e,{depthCutsFor:(minX,maxX,segment)=>(bounds=[minX,maxX],path=segment,[-60]),step:1000});
assert.deepEqual(bounds,[-45,75]);assert.equal(items.length,2,'a local body foot creates an exact depth cut even in coarse mode');
assert.deepEqual(path,{x:e.x,y:e.y,x2:e.x2,y2:e.y2,radius:45},'local depth query follows the original ray geometry with decoration padding');
assert(items.some(i=>i.sortY<-60)&&items.some(i=>i.sortY>-60),'one ray can pass behind and in front of different bodies');
assert(items.every(i=>i.sortY<20),'upward ray sorts behind its source');
const down=collect(runic,{...e,y2:180,renderEndGroundY:200});assert(down.every(i=>i.sortY>20));
const unequal=collect(runic,{...e,renderEndGroundY:-130},{step:1000});
assert.equal(unequal[0].sortY,(20-130)*.5-.25,'endpoints use their own lifts');
const horizontal=collect(runic,{...e,y2:0,renderEndGroundY:35});assert.equal(horizontal.length,1);assert.equal(horizontal[0].sortY,27.5);
assert.equal(collect(runic,charge)[0].sortY,castGround+Math.sin(charge.angle)*.25,'charge direction only affects draw order');

for(const type of ['lightning','conduction','runeBolt','superRay','superSword']){
  assert(isDepthAttackEffect({...e,type}));assert(collect(runic,{...e,type,renderGroundY:undefined,renderEndGroundY:undefined}).length);
}
for(const effect of [{...e,type:'superSword',impactOnly:true},...['ring','storm','meteor','superBurst','hit','damage','angelStrike'].map(type=>({...e,type}))]){
  assert(!isDepthAttackEffect(effect));assert.equal(collect(runic,effect).length,0);
}
assert.equal(collect(runic,{...e,life:0}).length,0);assert.equal(collect(runic,e,{visible:()=>false}).length,0);
console.log('Legacy attack depth: source snapshots, per-hop ally/enemy lifts, delayed runic casts, immutable painters, body cuts, directional layers and ground/sky exclusions passed.');
