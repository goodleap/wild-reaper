import assert from 'node:assert/strict';
import { Game, REGIONS } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment } from './dist/environment.js';
import { REGIONAL_MECHANISM_RULES as RULES } from './dist/regional-mechanisms.js';
import { Adventure } from './dist/adventure.js';

let seed=192653;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(region='forest',generation=false) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false});
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g._updatePressure=()=>{};g.region=REGIONS.find(r=>r.id===region);g.regionIndex=REGIONS.indexOf(g.region);
  g.environment=new Environment(g,{generation});return g;
}
function advance(g,seconds,input={}) {for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);}
let fixtureId=0;
function fixture(g,type,x=0,y=19.8,extras={}) {
  const prop={id:`qa-${type}:${++fixtureId}`,type,x,y,r:RULES[`${type}Radius`],seed:.5,sortY:y,aimY:y,hp:type==='vine'?1:undefined,state:'idle',remaining:0,maxRemaining:0,warning:0,charge:0,...extras};
  g.environment.mechanisms.props.push(prop);return prop;
}
function monster(g,x=150,y=0,type='slime') {
  const e=g._spawnEnemy(type,1);Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000});return e;
}
const xpTotal=g=>g.player.xp;
const mechanism=g=>g.environment.mechanisms;

const vines=arena(),vine=fixture(vines,'vine');vines.update(0);
assert.equal(vine.state,'windup');assert(vine.remaining>=1.1,'the forest gives a complete warning before slowing movement');
assert.equal(vines.environment.movementMultiplier(vines.player,true),1);
advance(vines,1.075);assert.equal(vine.state,'windup');assert.equal(vines.environment.movementMultiplier(vines.player,true),1);
advance(vines,.025);assert.equal(vine.state,'active');assert.equal(vines.environment.movementMultiplier(vines.player,true),.6);
const dry=arena(),slowed=arena();fixture(slowed,'vine',0,19.8,{state:'active',remaining:2.5,maxRemaining:2.5});
dry.update(.05,{x:1});slowed.update(.05,{x:1});assert(Math.abs(slowed.player.x/dry.player.x-.6)<1e-12,'vine slowdown affects actual movement');
const overlapping=arena();for(let i=0;i<3;i++)fixture(overlapping,'vine',0,19.8,{state:'active',remaining:2.5,maxRemaining:2.5});
overlapping.environment.muds.push({id:'mud',type:'mud',x:0,y:19.8,rx:100,ry:60});overlapping.update(.05,{x:1});
assert.equal(overlapping.player.x,slowed.player.x,'overlapping vines and mud use the strongest slow, without multiplying it');
const feet=arena(),feetVine=fixture(feet,'vine',0,0,{r:8,state:'active',remaining:2.5,maxRemaining:2.5});
assert.equal(feet.environment.movementMultiplier(feet.player,true),1,'a hazard at the body center does not incorrectly capture the feet');
feetVine.y=groundOffset(feet.player,true);assert.equal(feet.environment.movementMultiplier(feet.player,true),.6);
const feetEnemy=monster(feet,100,0);feetVine.x=100;feetVine.y=groundOffset(feetEnemy);assert.equal(feet.environment.movementMultiplier(feetEnemy),.6,'enemies use their own ground offset');

for(const state of ['paused','upgrade','relic','dead']) {
  const g=arena(),p=fixture(g,'vine');g.update(0);const frozen=structuredClone(p),time=g.time;
  g.status=state;advance(g,2,{x:1});g.environment.update(.05);
  assert.deepEqual(p,frozen,`${state} freezes mechanism warnings`);assert.equal(g.time,time);
  assert.equal(g.environment.hitAt(p.x,p.y,10,'arrow'),0,'a paused mechanism cannot be cut by a stray callback');
}
const consumed=arena(),cut=fixture(consumed,'vine',90),beforeCut={kills:consumed.kills,xp:xpTotal(consumed)};
assert.equal(consumed.environment.hitAt(cut.x,cut.y,0,'gas'),0,'environmental damage cannot recursively trigger player-weapon interactions');
assert.equal(consumed.environment.hitAt(cut.x,cut.y,0,'arrow'),1);
assert.equal(cut.state,'cut');assert.equal(cut.hp,0);assert(mechanism(consumed)._used.has(cut.id));
assert.equal(consumed.environment.hitAt(cut.x,cut.y,0,'arrow'),0);
assert.deepEqual({kills:consumed.kills,xp:xpTotal(consumed)},beforeCut,'cutting vegetation never awards combat kills or experience');
assert.equal(consumed.effects.filter(e=>e.type==='vineCut').length,1);

// Use actual weapon casts, including automatic fallback aiming with no enemy.
for(const source of ['arrow','orbit','pulse','echo','lightning','storm']) {
  const g=arena(),p=fixture(g,'vine',source==='echo'?205:source==='orbit'?74:120,0,{r:source==='echo'?12:24,state:'windup',remaining:1.1,maxRemaining:1.1});
  if(source==='arrow'){g._shot=0;g.update(0);g._shot=Infinity;assert(g.bullets.length,'a visible obstructing vine is an automatic fallback target');advance(g,.25);}
  if(source==='orbit'){g.levels.orbit=1;g.update(0);}
  if(source==='pulse'){g.levels.pulse=1;g._pulse=0;g.update(0);}
  if(source==='echo'){
    p.x=190;g.levels.pulse=5;g.branches.pulse='echoes';g._pulse=0;g.update(0);
    assert.equal(p.state,'windup','the outer vine is beyond the first pulse');advance(g,.36);
  }
  if(source==='lightning'){monster(g,120);g.levels.lightning=1;g._lightning=0;g.update(0);}
  if(source==='storm'){
    const hidden=fixture(g,'vine',800,0);g.update(0,{skill:true});assert.equal(hidden.state,'idle','a screen skill cannot cut an unseen vine');
  }
  assert.equal(p.state,'cut',`${source} reaches the common cut path`);
}
const stopped=arena(),behind=fixture(stopped,'vine',180,0,{r:12,state:'windup',remaining:1.1,maxRemaining:1.1});
monster(stopped,70);stopped._shot=0;stopped.update(0);stopped._shot=Infinity;stopped.bullets[0].vx=6000;stopped.update(.05);
assert.equal(stopped.bullets.length,0);assert.equal(behind.state,'windup','a consumed arrow cannot cut ground beyond its actual impact');

const gas=arena('marsh'),cloud=fixture(gas,'gas');gas.update(0);
assert.equal(cloud.state,'warn');assert.equal(cloud.remaining,1.4);
const gasVictim=monster(gas,50,19.8-14);advance(gas,1.375);
assert.equal(gas.player.hp,100);assert.equal(gasVictim.hp,10000,'the full gas warning is harmless to both sides');
advance(gas,.025);assert.equal(cloud.state,'active');assert.equal(gas.player.hp,94);assert.equal(gasVictim.hp,9980);
assert(!gasVictim.shock&&!gasVictim.bleed,'gas uses raw damage and never generates weapon statuses');
advance(gas,.975);assert.equal(gas.player.hp,94,'gas cannot damage the player more often than once per second');
advance(gas,.025);assert.equal(gas.player.hp,88);assert.equal(gasVictim.hp,9960);
const single=arena('marsh'),many=arena('marsh');
fixture(single,'gas',0,19.8,{state:'active',remaining:3.6,maxRemaining:3.6});
for(let i=0;i<4;i++)fixture(many,'gas',0,19.8,{state:'active',remaining:3.6,maxRemaining:3.6});
const oneVictim=monster(single,50,5.8),manyVictim=monster(many,50,5.8);
advance(single,2.1);advance(many,2.1);
assert.equal(many.player.hp,single.player.hp,'overlapping clouds share one player damage budget');
assert.equal(manyVictim.hp,oneVictim.hp,'overlapping clouds cannot multiply enemy damage');
const immune=arena('marsh');fixture(immune,'gas',0,19.8,{state:'active',remaining:3.6,maxRemaining:3.6});immune.player.invuln=5;advance(immune,2);assert.equal(immune.player.hp,100);
const returned=arena('marsh'),returnCloud=fixture(returned,'gas',0,19.8,{state:'active',remaining:3.6,maxRemaining:3.6});
returned.player.x=2000;returned.update(.025);assert.equal(returnCloud.state,'idle');returned.player.x=0;
while(returnCloud.state==='idle')returned.update(.025);
assert.equal(returnCloud.state,'warn');assert(returnCloud.remaining>=1.4);assert.equal(returned.player.hp,100);
advance(returned,1.375);assert.equal(returned.player.hp,100,'reentering the view always restores a complete gas warning');
const lethal=arena('marsh');fixture(lethal,'gas',0,19.8,{state:'active',remaining:3.6,maxRemaining:3.6});
lethal.player.hp=1;const savedEnemy=monster(lethal,50,5.8);lethal.update(.025);assert.equal(lethal.status,'dead');
const deathHp=savedEnemy.hp;advance(lethal,5);assert.equal(savedEnemy.hp,deathHp,'death stops later mechanism damage');

const runeGame=arena('ruins'),rune=fixture(runeGame,'rune');
const runeTargets=[100,160,220,280].map(x=>monster(runeGame,x));advance(runeGame,.3);
assert.equal(rune.state,'charging');assert(runeTargets.every(e=>e.hp===10000));runeGame.player.x=100;runeGame.update(.025);
assert.equal(rune.state,'idle');assert.equal(rune.charge,0,'leaving before activation cancels incomplete charge');
runeGame.player.x=0;advance(runeGame,.575);assert.equal(rune.state,'charging');advance(runeGame,.025);
assert.equal(rune.state,'active');assert.equal(rune.remaining,12);assert(mechanism(runeGame)._used.has(rune.id));
const runeFrozen=structuredClone(rune);runeGame.status='upgrade';advance(runeGame,2);assert.deepEqual(rune,runeFrozen);runeGame.status='playing';
advance(runeGame,.3);assert.equal(runeTargets.filter(e=>e.hp<10000).length,3,'a rune burst hits at most three distinct targets');
assert(runeTargets.every(e=>!e.shock&&!e.bleed),'rune assistance never creates recursive weapon reactions');
const burstHp=runeTargets.map(e=>e.hp);advance(runeGame,1.375);assert.deepEqual(runeTargets.map(e=>e.hp),burstHp);
advance(runeGame,.025);assert(runeTargets[0].hp<burstHp[0]);
advance(runeGame,10.4);assert.equal(rune.state,'spent');const spentHp=runeTargets.map(e=>e.hp);advance(runeGame,2);
assert.equal(rune.state,'spent');assert.deepEqual(runeTargets.map(e=>e.hp),spentHp,'the same rune does not reactivate while standing on it');
for(const [width,height,axis] of [[390,690,'x'],[1100,300,'y']]) {
  const g=arena('ruins');g.viewWidth=width;g.viewHeight=height;
  fixture(g,'rune',0,19.8,{state:'active',remaining:12,maxRemaining:12,_shot:0});
  const visible=monster(g,axis==='x'?160:0,axis==='y'?110:0),hidden=monster(g,axis==='x'?230:0,axis==='y'?190:0);
  g.update(.025);assert(visible.hp<10000);assert.equal(hidden.hp,10000,'rune targets remain inside either viewport edge');
}
const reward=arena('ruins');fixture(reward,'rune',0,19.8,{state:'active',remaining:12,maxRemaining:12,_shot:0});
const victim=monster(reward,120);victim.hp=1;const expectedXp=victim.xp;reward.update(.025);
assert.equal(reward.kills,1);assert.equal(xpTotal(reward),expectedXp);advance(reward,2);assert.equal(reward.kills,1);assert.equal(xpTotal(reward),expectedXp,'raw assists use normal single death rewards');

// Generated locations remain deterministic through reentry and use bounded
// live arrays plus a fixed-size consumed-location filter during long travel.
for(const region of ['forest','marsh','ruins']) {
  const g=arena(region,true),m=mechanism(g),expectedType={forest:'vine',marsh:'gas',ruins:'rune'}[region];
  assert(m.props.length>0);assert(m.props.every(p=>p.type===expectedType));
  for(const p of m.props)assert(Math.hypot(p.x,p.y)>=RULES.safeRadius+p.r,'each new region has a clear starting area');
  const start=m.props[0],original={id:start.id,x:start.x,y:start.y};
  g.player.x=20000;g.player.y=12000;g.environment._refresh(true);m._refresh(true);
  g.player.x=0;g.player.y=0;g.environment._refresh(true);m._refresh(true);
  const restored=m.props.find(p=>p.id===original.id);assert(restored);assert.equal(restored.x,original.x);assert.equal(restored.y,original.y);
  if(region==='forest')g.environment.hitAt(restored.x,restored.y,0,'arrow');
  if(region==='ruins'){g.player.x=restored.x;g.player.y=restored.y-groundOffset(g.player,true);advance(g,.6);assert.equal(restored.state,'active');}
  if(region!=='marsh') {
    g.player.x=20000;g.player.y=12000;g.environment._refresh(true);m._refresh(true);
    g.player.x=0;g.player.y=0;g.environment._refresh(true);m._refresh(true);
    assert(!m.props.some(p=>p.id===original.id),'used single-use locations never reappear on a later visit');
  }
  const memoryBytes=m._used.bits.byteLength;
  for(let i=1;i<=100;i++) {
    g.player.x=i*700;g.player.y=Math.sin(i)*1800;g.environment._refresh(true);m._refresh(true);
    assert(m.props.length<=RULES.maxProps);assert.equal(new Set(m.props.map(p=>p.id)).size,m.props.length);
  }
  assert.equal(m._used.bits.byteLength,memoryBytes,'exploration cannot grow the consumed-location memory');
}
const hiddenMushroom=arena('forest',true),realMushroom=hiddenMushroom.environment.props[0];assert(realMushroom);
hiddenMushroom.adventure=new Adventure(hiddenMushroom,{generation:false});
hiddenMushroom.adventure.props.push({id:'temporary-crate',x:realMushroom.x,y:realMushroom.y,r:18});
const mushroomCell=realMushroom.id.match(/^mushroom:(-?\d+),(-?\d+):/);
assert(!hiddenMushroom.environment._mushroomsAt(+mushroomCell[1],+mushroomCell[2]).some(p=>p.id===realMushroom.id));
hiddenMushroom.environment.props=[];
assert.equal(mechanism(hiddenMushroom)._mushroomClear({x:realMushroom.x,y:realMushroom.y,r:54}),false,'a temporarily suppressed mushroom still reserves its original blast area');

const safety=arena('marsh');fixture(safety,'gas',350,19.8);
assert.equal(safety.environment.isHazardFree(350,19.8,40),false);assert.equal(safety.companions.spawn('warden',350,19.8),null,'a rescue camp cannot occupy a gas hazard');
safety.adventure=new Adventure(safety,{generation:false});assert.equal(safety.adventure._environmentFree(350,19.8,90),false,'treasure and supply site selection share hazard checks');
const portalBoss=monster(safety,260,-21.2,'boss');safety._hurtEnemy(portalBoss,portalBoss.hp+1);
assert(safety.portal);assert(safety.environment.isHazardFree(safety.portal.x,safety.portal.y,45),'portal placement avoids existing hazardous ground');
const oldEnvironment=safety.environment,oldMechanisms=mechanism(safety),oldHp=safety.player.hp;
safety._features.environment=true;safety.player.x=safety.portal.x;safety.player.y=safety.portal.y-groundOffset(safety.player,true);
assert(safety.enterPortal());assert(safety.chooseSuper(safety.getSuperChoices()[0].id));
assert.notEqual(safety.environment,oldEnvironment);assert.notEqual(mechanism(safety),oldMechanisms);
assert(!mechanism(safety).props.some(p=>p.id.startsWith('qa-')),'travel discards old mechanism state and pending attacks');
assert.equal(safety.player.hp,oldHp);advance(safety,.1);assert.equal(safety.player.hp,oldHp,'the fresh protected landing cannot inherit old gas damage');

console.log('Regional mechanisms: full warnings, feet-based nonstacking hazards, real weapon cuts, one-use rune assistance, safe objectives and bounded deterministic worlds passed.');
