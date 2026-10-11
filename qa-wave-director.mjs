import assert from 'node:assert/strict';
import { WaveDirector, WAVE_RULES } from './dist/wave-director.js';

function arena(extra={}) {
  let id=0;
  const g={time:0,wave:1,easy:false,regionGrace:0,nextBossAt:Infinity,portal:null,enemies:[],gems:[],coins:[],crystals:0,events:[],player:{x:0,y:0},
    _emit(type,data={}){this.events.push({type,...data});},
    addCrystals(n){this.crystals+=n;},
    _spawnEnemy(type,radius,angle){const e={id:++id,type,hp:10,angle};this.enemies.push(e);return e;},...extra};
  g.director=new WaveDirector(g);return g;
}
function tick(g,time){g.time=time;g.director.update(.05);}
function start(g){tick(g,g.phaseEndsAt);assert.equal(g.pressurePhase,'warning');tick(g,g.phaseEndsAt);assert.equal(g.pressurePhase,'siege');}
function spawnAll(g){for(let i=0;i<7;i++)tick(g,g.time+1.2);}
function kill(g,e){e.hp=0;g.director.onEnemyKilled(e);g.enemies=g.enemies.filter(n=>n!==e);}

const first=arena();
assert.equal(first.phaseEndsAt,20);tick(first,19.9);assert.equal(first.pressurePhase,'steady');
start(first);const warning=first.events.find(e=>e.type==='wave');
assert.equal(WAVE_RULES.firstWaveSize,22);assert.equal(WAVE_RULES.waveSizeStep,4);assert.equal(WAVE_RULES.maxWaveSize,56);
assert.equal(warning.total,WAVE_RULES.firstWaveSize);assert.equal(warning.directionLabel,'东侧');
spawnAll(first);assert.equal(first.enemies.length,WAVE_RULES.firstWaveSize,'a wave is a finite group');
assert(first.enemies.every(e=>Math.abs(e.angle)<=.65),'the opposite half of the map remains open');
assert(first.enemies.every(e=>['slime','beetle'].includes(e.type)),'the opening group uses readable ordinary enemies');
first.gems=[{x:300,y:0,value:5},{x:501,y:0,value:9}];first.coins=[{x:0,y:-400,value:1}];
for(const e of [...first.enemies])kill(first,e);
tick(first,first.time+.05);assert.equal(first.pressurePhase,'relief');assert.equal(first.phaseEndsAt-first.time,8);
assert.equal(first.crystals,8);assert.equal(first.director.summary().remaining,0);
assert.equal(first.gems[0].attracted,true);assert.equal(first.gems[1].attracted,undefined);assert.equal(first.coins[0].attracted,true);
tick(first,first.time+1);assert.equal(first.crystals,8,'a clear is rewarded once');
tick(first,first.phaseEndsAt);assert.equal(first.pressurePhase,'steady');assert.equal(first.phaseEndsAt-first.time,12);
start(first);assert.equal(first.wave,2);assert.equal(first.director.summary().directionId,'south');
assert.equal(first.director.summary().direction,Math.PI/2);
assert.equal(first.director.total,WAVE_RULES.firstWaveSize+WAVE_RULES.waveSizeStep);
spawnAll(first);assert(first.enemies.some(e=>e.type==='bat'));

// A despawn, distance cull, duplicate callback, or an unrelated kill must never
// turn running away into a free clear reward.
const escaped=arena();start(escaped);spawnAll(escaped);
const survivor=escaped.enemies.pop();
for(const e of [...escaped.enemies]){kill(escaped,e);escaped.director.onEnemyKilled(e);}
escaped.director.onEnemyKilled({id:99999,hp:0});escaped.director.onEnemyKilled(survivor);
tick(escaped,escaped.time+.05);assert.equal(escaped.pressurePhase,'siege');
assert.equal(escaped.director.summary().remaining,1);
tick(escaped,escaped.phaseEndsAt);assert.equal(escaped.pressurePhase,'relief');assert.equal(escaped.crystals,0);
assert.equal(escaped.phaseEndsAt-escaped.time,6);

// Density and global special-enemy budgets also apply to directed reinforcements.
const capped=arena();start(capped);
capped.enemies=Array.from({length:179},(_,i)=>({id:1000+i,type:'slime',hp:1}));
tick(capped,capped.time+.05);assert.equal(capped.enemies.length,180);
spawnAll(capped);assert.equal(capped.enemies.length,180);
tick(capped,capped.phaseEndsAt);assert.equal(capped.pressurePhase,'relief');assert.equal(capped.crystals,0,'unspawned budget is not a kill');
const specials=arena();specials.director.count=2;specials.time=100;specials.director.reset();start(specials);
specials.enemies=[...Array.from({length:5},(_,i)=>({id:500+i,type:'boar',hp:1})),...Array.from({length:4},(_,i)=>({id:600+i,type:'spore',hp:1}))];
spawnAll(specials);assert.equal(specials.enemies.filter(e=>e.type==='boar').length,5);assert.equal(specials.enemies.filter(e=>e.type==='spore').length,4);
const unlocked=arena();unlocked.director.count=2;unlocked.time=100;unlocked.director.reset();start(unlocked);spawnAll(unlocked);
assert(unlocked.enemies.some(e=>e.type==='boar')&&unlocked.enemies.some(e=>e.type==='spore'),'later attacks combine charging and ranged threats');

for(const block of ['boss','due']) {
  const g=arena();start(g);tick(g,g.time+.05);
  if(block==='boss')g.enemies.push({id:9000,type:'boss',hp:100});
  if(block==='due')g.nextBossAt=g.time;
  tick(g,g.time+.05);assert.equal(g.pressurePhase,'steady');assert.equal(g.crystals,0);
  assert.equal(g.director.members.size,0,'a cancelled attack cannot award a later clear');
  g.enemies=[];g.regionGrace=0;g.nextBossAt=Infinity;tick(g,g.time+1);
  assert.equal(g.phaseEndsAt-g.time,12,'a boss or travel transition is followed by exploration');
}
const beforeBoss=arena({nextBossAt:60});start(beforeBoss);spawnAll(beforeBoss);tick(beforeBoss,34);assert.equal(beforeBoss.pressurePhase,'siege','a promised wave may finish inside the pre-Boss reservation window');for(const e of [...beforeBoss.enemies])kill(beforeBoss,e);tick(beforeBoss,34.05);assert.equal(beforeBoss.pressurePhase,'relief');assert.equal(beforeBoss.crystals,8);
const grace=arena();start(grace);tick(grace,grace.time+.05);
kill(grace,grace.enemies[0]);
const beforeGrace={phase:grace.pressurePhase,end:grace.phaseEndsAt,spawnUntil:grace.director._spawnUntil,nextBatch:grace.director._nextBatchAt,
  members:[...grace.director.members],killed:[...grace.director.killed],spawned:grace.director.spawned};
grace.regionGrace=2;
for(let i=0;i<40;i++)tick(grace,grace.time+.05);
assert.equal(grace.pressurePhase,beforeGrace.phase);
assert.deepEqual([...grace.director.members],beforeGrace.members);assert.deepEqual([...grace.director.killed],beforeGrace.killed);
assert.equal(grace.director.spawned,beforeGrace.spawned,'exit grace never spawns or cancels the preserved cohort');
assert(Math.abs(grace.phaseEndsAt-beforeGrace.end-2)<1e-9);
assert(Math.abs(grace.director._spawnUntil-beforeGrace.spawnUntil-2)<1e-9);
assert(Math.abs(grace.director._nextBatchAt-beforeGrace.nextBatch-2)<1e-9);
grace.regionGrace=0;spawnAll(grace);
for(const e of [...grace.enemies])kill(grace,e);
tick(grace,grace.time+.05);assert.equal(grace.pressurePhase,'relief');assert.equal(grace.crystals,8,'a preserved wave can still be completed after castle exit grace');
const portal=arena({nextBossAt:0,portal:{x:1,y:2}});start(portal);assert.equal(portal.pressurePhase,'siege','an overdue boss held by a portal does not stop waves');
const reset=arena();start(reset);tick(reset,reset.time+.05);const old=[...reset.enemies];reset.director.reset();
for(const e of old)kill(reset,e);tick(reset,reset.time+.05);assert.equal(reset.crystals,0);assert.equal(reset.wave,1);
assert.equal(reset.director.members.size,0);

const objective=arena({companions:{camp:{x:0,y:0,state:'trapped'}}});
tick(objective,20);assert.equal(objective.pressurePhase,'steady','an engaged nearby rescue receives its own battle window');
objective.companions.camp.x=1000;start(objective);
objective.companions.camp.x=0;tick(objective,objective.time+.05);
assert.equal(objective.pressurePhase,'siege','approaching another objective never cancels an announced wave');

const stub=arena({_spawnEnemy(){return null;}});start(stub);spawnAll(stub);assert.equal(stub.director.spawned,0);
tick(stub,stub.phaseEndsAt);assert.equal(stub.pressurePhase,'relief');assert.equal(stub.crystals,0);
const jump=arena();tick(jump,10000);assert.equal(jump.pressurePhase,'warning');assert.equal(jump.enemies.length,0,'a time jump never catches up a backlog');
tick(jump,10003);tick(jump,10003.05);assert(jump.enemies.length<=Math.ceil(jump.director.total/6));
const easyOpening=arena({easy:true});start(easyOpening);assert.equal(easyOpening.director.total,18,'easy opening scales the finite cohort');
const late=arena({easy:true});late.director.count=999;late.director.reset();start(late);assert.equal(late.director.total,45,'easy endless waves remain bounded');
const lateNormal=arena();lateNormal.director.count=999;lateNormal.director.reset();start(lateNormal);assert.equal(lateNormal.director.total,56,'normal endless waves remain bounded');
assert.equal(WAVE_RULES.maxEnemies,180);
console.log('wave director QA passed: finite directional attacks, authentic clears, relief, caps, cancellation and bounded scheduling');
