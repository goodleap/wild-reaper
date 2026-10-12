import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';

// These short scenarios validate pacing mechanics, not a simulated player's skill.
let seed=819263;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const emptyTerrain=()=>new Terrain({obstacles:[]});
function arena({terrain=emptyTerrain(),width=1100,height=650}={}) {
  const g=new Game({terrain,adventure:false});
  g.enemies=[];g.gems=[];g.events=[];
  g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;
  g.viewWidth=width;g.viewHeight=height;
  return g;
}
function enemy(g,type,x,y) {
  g._spawnEnemy(type);
  const e=g.enemies.at(-1);
  Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000});
  return e;
}
function advance(g,seconds,input={}) {
  for(let remaining=seconds;remaining>1e-8;remaining-=.025)g.update(Math.min(.025,remaining),input);
}
function feetFree(g) {
  assert(g.terrain.isFree(g.player.x,g.player.y+groundOffset(g.player,true),g.player.r));
  for(const e of g.enemies)assert(g.terrain.isFree(e.x,e.y+groundOffset(e),e.r),`${e.type} cannot enter solid terrain`);
}

// Enemy entry and auto targeting must work in narrow portrait viewports too.
for(const [width,height] of [[1100,650],[390,690]]) {
  const spawning=arena({terrain:new Terrain(),width,height});
  Object.assign(spawning.player,{x:760,y:-410});
  spawning._moveEntity(spawning.player,0,0,true);
  for(let i=0;i<40;i++) {
    spawning.enemies=[];
    spawning._spawnEnemy(['slime','beetle','bat','brute'][i%4]);
    const e=spawning.enemies[0],dx=Math.abs(e.x-spawning.player.x),dy=Math.abs(e.y-spawning.player.y);
    assert(dx-e.r>=width/2||dy-e.r>=height/2,'ordinary enemies enter from outside the visible rectangle');
    assert(Math.hypot(dx,dy)>150,'spawning never places enemies on the player');
    feetFree(spawning);
  }
  const aiming=arena({width,height});
  const horizontal=enemy(aiming,'slime',width/2+100,0);
  aiming.levels.lightning=1;aiming._lightning=0;
  aiming._shot=0;aiming.update(0);
  assert.equal(aiming.bullets.length,0,'auto fire does not clear invisible enemies beyond the horizontal edge');
  assert.equal(horizontal.hp,10000,'automatic lightning also leaves invisible enemies alone');
  aiming.enemies=[];const vertical=enemy(aiming,'slime',0,height/2+40);
  aiming._lightning=0;aiming._shot=0;aiming.update(0);
  assert.equal(aiming.bullets.length,0,'auto fire respects the vertical screen edge');
  assert.equal(vertical.hp,10000,'automatic lightning respects the vertical screen edge');
  aiming.enemies=[];enemy(aiming,'slime',Math.min(width/2-30,200),0);
  aiming._shot=0;aiming.update(0);
  assert(aiming.bullets.length>0,'visible threats are still targeted');
}

// A bulk crystal pickup may fund several choices; every point must be retained.
const progression=arena(),budget=1200;
let spent=0,choices=0;
progression.addCrystals(budget);progression.update(0);
assert.equal(progression.status,'upgrade');
while(progression.status==='upgrade'&&choices++<40) {
  const before=progression.crystals,nextCost=progression.crystalsNext;
  assert(progression.chooseUpgrade(progression.getUpgradeChoices()[0].id));
  assert.equal(progression.crystals,before-nextCost,'each confirmed skill upgrade spends exactly its crystal cost');spent+=nextCost;
}
assert(choices>1&&choices<40,'a bulk pickup grants all earned skill choices and then returns to combat');
assert.equal(progression.crystals,budget-spent,'crystals are conserved across consecutive choices');
assert(progression.crystals>=0&&progression.crystals<progression.crystalsNext);
assert.equal(progression.player.level,1);assert.equal(progression.player.xp,0,'crystal collection cannot manufacture character XP');

// Observe complete transitions rather than reproducing the phase arithmetic.
const rhythm=arena(),observed=[rhythm.pressurePhase];
rhythm._spawnEnemy=()=>{};
let pausedSiege=false;
while(rhythm.time<110&&observed.length<6) {
  rhythm.update(.05);
  if(observed.at(-1)!==rhythm.pressurePhase)observed.push(rhythm.pressurePhase);
  if(rhythm.pressurePhase==='siege'&&!pausedSiege) {
    const frozen={time:rhythm.time,phase:rhythm.pressurePhase,end:rhythm.phaseEndsAt,spawn:rhythm._spawn};
    rhythm.status='upgrade';advance(rhythm,2);
    assert.deepEqual({time:rhythm.time,phase:rhythm.pressurePhase,end:rhythm.phaseEndsAt,spawn:rhythm._spawn},frozen,'upgrades freeze the encounter clock');
    rhythm.status='playing';pausedSiege=true;
  }
}
assert.deepEqual(observed,['steady','warning','siege','relief','steady','warning'],'pressure rises, eases, and repeats');
assert(rhythm.events.some(e=>e.type==='siege')&&rhythm.events.some(e=>e.type==='relief'));
assert(pausedSiege);

// Dense encounters retain the rendering budget, including a simultaneously due Boss.
const crowd=arena();
for(let i=0;i<179;i++)enemy(crowd,'slime',700+(i%18)*35,400+Math.floor(i/18)*35);
crowd.player.invuln=100;crowd.time=300;crowd.nextBossAt=0;crowd._spawn=0;
advance(crowd,1);
assert(crowd.enemies.length<=181,'ordinary enemies plus the Boss stay within the entity budget');
assert.equal(crowd.enemies.filter(e=>e.type==='boss').length,1);

// First Boss arrives at two minutes; later arrivals are spaced and never overlap.
const scheduled=new Game({terrain:emptyTerrain(),adventure:false});
scheduled.enemies=[];scheduled._spawn=Infinity;scheduled._shot=Infinity;
scheduled.time=119.9;scheduled.update(.05);
assert(!scheduled.enemies.some(e=>e.type==='boss'),'the first Boss does not arrive early');
advance(scheduled,.1);
const first=scheduled.enemies.find(e=>e.type==='boss');
assert(first,'the first Boss arrives after two minutes');
assert(Math.abs(scheduled.nextBossAt-scheduled.time-150)<.051,'subsequent Boss spacing remains two and a half minutes');
assert(Math.abs(first.x-scheduled.player.x)-first.r>=scheduled.viewWidth/2||Math.abs(first.y-scheduled.player.y)-first.r>=scheduled.viewHeight/2,'the Boss also enters from outside the visible area');
scheduled.time=scheduled.nextBossAt+.1;scheduled.update(0);
assert.equal(scheduled.bossCount,1,'an overdue Boss waits until the current one dies');
scheduled._hurtEnemy(first,first.hp+1);scheduled.crystalsNext=Infinity;scheduled.update(0);assert.equal(scheduled.bossCount,1,'pending portal reward holds the overdue next Boss');
scheduled.player.x=scheduled.portal.x;scheduled.player.y=scheduled.portal.y-groundOffset(scheduled.player,true);assert(scheduled.chooseSuper(scheduled.getSuperChoices()[0].id));assert(scheduled.enterPortal());advance(scheduled,2.025);
assert.equal(scheduled.bossCount,2);
assert.equal(scheduled.enemies.filter(e=>e.type==='boss'&&e.hp>0).length,1);

function windingBoss({terrain=emptyTerrain()}={}) {
  const g=arena({terrain}),boss=enemy(g,'boss',80,-21.2);
  boss.slamCooldown=0;
  g.update(.025);
  assert(boss.slam,'a nearby Boss gives a warning before attacking');
  assert(boss.slam.life>.5,'the warning gives the player time to react');
  assert.equal(g.player.hp,g.player.maxHp,'the warning itself deals no damage');
  return {g,boss};
}

const hit=windingBoss(),health=hit.g.player.hp,warning=structuredClone(hit.boss.slam);
hit.g.status='upgrade';advance(hit.g,2);
assert.deepEqual(hit.boss.slam,warning,'the Boss warning freezes during an upgrade');
assert.equal(hit.g.player.hp,health);
hit.g.status='playing';advance(hit.g,warning.life-.08);
assert.equal(hit.g.player.hp,health,'damage cannot occur before the warning expires');
advance(hit.g,.1);
assert(hit.g.player.hp<health,'remaining inside the marked ground receives damage');
const afterHit=hit.g.player.hp;advance(hit.g,.2);
assert.equal(hit.g.player.hp,afterHit,'one slam does not deal repeated damage throughout its visual effect');
assert.equal(hit.g.events.filter(e=>e.type==='bossSlam').length,1);

const dodge=windingBoss(),zone={x:dodge.boss.slam.x,y:dodge.boss.slam.y};
Object.assign(dodge.g.player,{x:zone.x+dodge.boss.slam.r+dodge.g.player.r+40,y:zone.y-groundOffset(dodge.g.player,true)});
dodge.g.update(.025);
assert.deepEqual({x:dodge.boss.slam.x,y:dodge.boss.slam.y},zone,'the warning stays fixed when the player escapes');
advance(dodge.g,1.1);
assert.equal(dodge.g.player.hp,dodge.g.player.maxHp,'leaving the circle avoids the slam');
assert(dodge.g.events.some(e=>e.type==='bossSlam'),'a missed slam still completes visibly');

const protectedPlayer=windingBoss();
protectedPlayer.g.player.invuln=protectedPlayer.boss.slam.life+.2;
advance(protectedPlayer.g,1.1);
assert.equal(protectedPlayer.g.player.hp,protectedPlayer.g.player.maxHp,'an existing damage grace period also protects against the slam');

const cancelled=windingBoss();
cancelled.boss.slam.life=.01;cancelled.boss.hp=100;
cancelled.g.update(.025,{skill:true});
assert.equal(cancelled.g.bossKills,1,'the active skill kills the winding Boss');
assert.equal(cancelled.boss.slam,null,'death immediately cancels the pending warning');
assert.equal(cancelled.g.player.hp,cancelled.g.player.maxHp,'a same-frame kill prevents the otherwise due slam');
advance(cancelled.g,1.1);
assert(!cancelled.g.events.some(e=>e.type==='bossSlam'),'a dead Boss never resolves its attack later');

for(const weapon of ['arrow','pulse']) {
  const interrupted=windingBoss(),g=interrupted.g,boss=interrupted.boss;
  boss.hp=1;boss.slam.life=.01;
  if(weapon==='arrow')g.bullets.push({x:boss.x,y:boss.y,r:4,vx:0,vy:0,life:1,damage:32,pierce:1,hitIds:new Set()});
  else {g.levels.pulse=1;g._pulse=0;}
  g.update(.025);
  assert.equal(g.bossKills,1,`${weapon} kills the winding Boss`);
  assert.equal(g.player.hp,g.player.maxHp,`${weapon} also cancels a same-frame slam`);
  assert(!g.events.some(e=>e.type==='bossSlam'),'no attack resolves after a killing blow');
}

const solid=new Terrain({obstacles:[{id:'wall',type:'rock',x:160,y:19.8,r:30}]}),obstructed=windingBoss({terrain:solid});
obstructed.g.player.invuln=10;
for(let i=0;i<80;i++) {obstructed.g.update(.025,{x:1});feetFree(obstructed.g);}
assert(obstructed.g.player.x<130,'movement remains blocked by the rock during and after a Boss attack');

console.log('Balance mechanics: phases, spawns, targeting, XP, Boss schedule and telegraphed attacks passed.');

