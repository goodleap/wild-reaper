import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

let seed=781632;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const HP=100000;
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} versus ${b}`);
function arena(obstacles=[]) {
  const g=new Game({terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.events=[];g.effects=[];
  g._spawn=g._shot=g._pulse=g._lightning=g.nextBossAt=Infinity;
  g.player.xpNext=g.crystalsNext=g.player.invuln=Infinity;
  g._updatePressure=()=>{};
  return g;
}
function take(g,id) {
  if(id.startsWith('branch:')){const [,owner,branch]=id.split(':');assert(g.build.selectBranch(owner,branch),id);}
  else assert(g.build.increment(id),id);
}
function equip(g,id,purchases=[]) {
  purchases.forEach(upgrade=>take(g,upgrade));
  assert(g.build.isEquipped(id));
  for(const other of ['sword','arrow','orbit'])if(other!==id&&g.build.isEquipped(other))assert(g.build.setEquipped(other,false));
  g._syncEvolutions(false);g._refreshWeapons();g._shot=id==='arrow'?0:Infinity;
  return g;
}
// Immobile, nonattacking Boss fixtures keep reach and hit cadence measurable
// without knockback or AI changing the layout. Damage still uses Game.update.
function target(g,x,y=0,r=12) {
  const e=g._spawnEnemy('boss');
  Object.assign(e,{x,y,r,hp:HP,maxHp:HP,speed:0,knockbackImmune:true,bossKind:null,slamCooldown:Infinity,damage:0});
  g._rebuildGrid();return e;
}
function advance(g,seconds) {for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left));}
const damage=e=>HP-e.hp;
function measure(id,purchases,positions=[[74,0,12]],seconds=12) {
  const g=equip(arena(),id,purchases),enemies=positions.map(([x,y,r])=>target(g,x,y,r));
  advance(g,seconds);
  return {g,enemies,damage:enemies.map(damage),dps:enemies.reduce((sum,e)=>sum+damage(e),0)/seconds};
}

// Compare equal paid crystal choices, including acquisition for nonstarting
// weapons. These checks preserve useful roles, not equality of every scenario.
const four={
  sweep:['sword','sword','sword','branch:sword:sweep'],
  heavy:['sword','sword','sword','branch:sword:heavy'],
  orbit:['orbit','orbit','orbit','orbit'],
  arrow:['arrow','rapid','rapid','rapid']
};
assert(Object.values(four).every(picks=>picks.length===4));
const single={sweep:measure('sword',four.sweep),heavy:measure('sword',four.heavy),orbit:measure('orbit',four.orbit),arrow:measure('arrow',four.arrow)};
assert(single.heavy.dps>single.arrow.dps*1.3,'close heavy sword has a material focused-output reward over equally funded distant arrows');
assert(single.heavy.dps>single.sweep.dps*1.2,'heavy sword earns its smaller sector and slower cadence');
const fan=[[65,0,9],[90*Math.cos(1.15),90*Math.sin(1.15),9],[90*Math.cos(-1.15),90*Math.sin(-1.15),9]];
const sweepBurst=measure('sword',four.sweep,fan,.2),heavyBurst=measure('sword',four.heavy,fan,.2);
assert.equal(sweepBurst.damage.filter(n=>n>0).length,3,'one sweep reaches both flanks');
assert.equal(heavyBurst.damage.filter(n=>n>0).length,1,'one heavy strike remains concentrated');
const circle=Array.from({length:8},(_,i)=>[74*Math.cos(i*Math.PI/4),74*Math.sin(i*Math.PI/4),9]);
const surroundingOrbit=measure('orbit',four.orbit,circle),surroundingHeavy=measure('sword',four.heavy,circle);
const surroundingSweep=measure('sword',four.sweep,circle);
assert(surroundingOrbit.damage.every(n=>n>0),'orbit handles every approach around the player');
assert(Math.min(...surroundingOrbit.damage)>Math.min(...surroundingHeavy.damage),'orbit supplies damage to neglected approaches that a focused heavy slash leaves open');
assert(surroundingOrbit.dps>surroundingSweep.dps,'sustained full-surround contact rewards orbit over the wider directional sword');
for(const [id,picks] of [['sword',four.sweep],['orbit',four.orbit],['arrow',four.arrow]]) {
  const distant=measure(id,picks,[[260,0,12]],2);
  assert.equal(distant.dps>0,id==='arrow','only the ranged weapon reaches the distant lane');
}
let previous=0;
for(let rank=1;rank<=5;rank++) {
  const sample=measure('orbit',Array(rank).fill('orbit'));
  assert(sample.dps>previous,`orbit acquisition/rank ${rank} improves actual sustained contact`);previous=sample.dps;
}
const fast=equip(arena(),'orbit',['orbit']),side=target(fast,0,74,8);
advance(fast,.55);assert(damage(side)>0,'the initial orbit reaches a quarter-turn target promptly');

const nine={
  heavy:[...four.heavy,'swordMastery','swordMastery','swordEnergy','swordEnergy','swordEnergy'],
  orbit:['orbit','orbit','orbit','orbit','orbit','orbitPower','orbitPower','orbitRadius','orbitRadius'],
  arrow:['arrow','rapid','rapid','rapid','multishot','multishot','multishot','branch:arrow:pierce','arrowPower']
};
assert(Object.values(nine).every(picks=>picks.length===9));
const late={heavy:measure('sword',nine.heavy,[[90,0,38]]),orbit:measure('orbit',nine.orbit,[[90,0,38]]),arrow:measure('arrow',nine.arrow,[[90,0,38]])};
assert(late.heavy.dps>late.arrow.dps,'equally funded multi-arrow piercing cannot displace heavy sword in close single-target output');
assert(late.heavy.dps>late.orbit.dps*1.5,'six surrounding blades retain a material focused-output disadvantage to the equally funded heavy sword');
assert(late.arrow.dps>single.arrow.dps,'coverage investments still add output on a large single target');
const evolvedSurround=measure('orbit',Array(5).fill('orbit'),circle);
assert(evolvedSurround.dps>surroundingOrbit.dps,'the sixth blade and evolution improve sustained surrounding damage with independent blade contacts');
for(const distance of [60,90]) {
  const positions=[[distance,0,9]],previous=measure('orbit',Array(4).fill('orbit'),positions,30),evolved=measure('orbit',Array(5).fill('orbit'),positions,30);
  assert(evolved.dps>previous.dps,'evolution does not reduce sustained small-body contact damage on the original orbit');
}

function arrowArena({branch=null,shield=0,obstacles=[]}={}) {
  const g=equip(arena(obstacles),'arrow',['arrow','multishot','multishot','multishot',...(branch?[`branch:arrow:${branch}`]:[])]);
  const e=target(g,90,0,38);if(shield)e.affix={id:'shield',shield,maxShield:shield,color:'#9acbdf'};
  return {g,e};
}
function fire(g) {g._shot=0;g.update(0);g._shot=Infinity;}

// All arrows created together share a target budget, but different volleys
// never borrow one another's budget. Exercise real projectile collisions.
const volley=arrowArena();fire(volley.g);assert.equal(volley.g.bullets.length,4);
advance(volley.g,.4);near(damage(volley.e),32*1.45,'one close volley is capped per target');
const first=damage(volley.e);fire(volley.g);advance(volley.g,.4);
near(damage(volley.e)-first,first,'the next volley has its own full target budget');

const snapshot=arrowArena();fire(snapshot.g);take(snapshot.g,'power');advance(snapshot.g,.4);
near(damage(snapshot.e),first,'in-flight direct damage and budget retain cast-time scaling');
const snapshotFirst=damage(snapshot.e);fire(snapshot.g);advance(snapshot.g,.4);
near(damage(snapshot.e)-snapshotFirst,first*1.25,'a later volley snapshots the upgraded character');

// Shield absorption must not consume a hit budget as though HP were lost.
const shield=arrowArena({shield:32});fire(shield.g);advance(shield.g,.4);
near(damage(shield.e),32*.45*3,'the absorbed main arrow leaves the three side arrows able to damage HP');

for(const branch of ['pierce','ricochet']) {
  const g=equip(arena(),'arrow',['arrow','multishot','multishot','multishot',`branch:arrow:${branch}`]);
  const victims=[90,190,290].map(x=>target(g,x,0,38));fire(g);advance(g,.8);
  assert(victims.every(e=>damage(e)>0),`${branch} continues reaching other targets after a target exhausts its budget`);
  assert(victims.every(e=>damage(e)<=first+1e-7),`${branch} sibling projectiles cannot evade the same-target budget`);
  assert(victims.reduce((sum,e)=>sum+damage(e),0)>first,`${branch} retains a real multi-target benefit`);

  const wall={id:`balance-${branch}-wall`,type:'log',heightBand:'high',x:140,y:20,r:8,halfLength:200,angle:Math.PI/2};
  const blocked=equip(arena([wall]),'arrow',['arrow','multishot','multishot','multishot',`branch:arrow:${branch}`]);
  const front=target(blocked,75,0,22),behind=target(blocked,210,0,22);fire(blocked);advance(blocked,.8);
  assert(damage(front)>0);assert.equal(damage(behind),0,`${branch} budget handling never grants a route through a tall wall`);
}

// More side arrows improve coverage even when they cannot multiply damage on
// the primary target. Target locations use the actual emitted trajectories.
function spreadCoverage(rank) {
  const g=equip(arena(),'arrow',['arrow',...Array(rank).fill('multishot')]);target(g,200,0,6);fire(g);
  for(const b of g.bullets.slice(1))target(g,Math.cos(b.angle)*200,Math.sin(b.angle)*200,6);
  advance(g,.6);return g.enemies.reduce((sum,e)=>sum+damage(e),0);
}
let covered=spreadCoverage(0);
for(let rank=1;rank<=3;rank++){const next=spreadCoverage(rank);assert(next>covered,`side-arrow rank ${rank} improves distributed damage`);covered=next;}

console.log('weapon balance: equal-purchase roles, orbit cadence/progression, late single-target output, shared volley caps, snapshots, shield accounting, bounded routes and spread coverage passed.');
console.log(JSON.stringify({fourPickDps:Object.fromEntries(Object.entries(single).map(([id,result])=>[id,+result.dps.toFixed(2)])),ninePickDps:Object.fromEntries(Object.entries(late).map(([id,result])=>[id,+result.dps.toFixed(2)]))}));
