import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { weaponStats } from './dist/combat-stats.js';

function arena(rank=1) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.player.x=g.player.y=0;g.enemies=[];g.effects=[];g.events=[];
  g.levels.orbit=rank;g.build.setEquipped('sword',false);g._syncEvolutions(false);
  g._spawn=g._shot=g._pulse=g._lightning=g.nextBossAt=Infinity;
  g.player.xpNext=g.crystalsNext=g.player.invuln=Infinity;g._updatePressure=()=>{};
  g.hits=[];g._hitEnemy=(e,damage,push,origin,source)=>{g.hits.push({e,damage,push,source,x:origin.x,y:origin.y});return damage;};
  return g;
}
function target(g,x,y,r=12) {
  const e={id:g.enemies.length+1,type:'slime',x,y,r,hp:1e9,maxHp:1e9};g.enemies.push(e);return e;
}
function step(g,dt=.025){g._clock+=dt;g._rebuildGrid();g.attacks.updateOrbit();}
function hits(g,e){return g.hits.filter(h=>h.e===e&&h.source==='orbit').length;}

// Six distinct blades can damage the same target at the same time. Standing
// inside the blades does not turn into periodic per-frame damage.
const dense=arena(5),a=target(dense,0,0,160),b=target(dense,0,0,160);
dense._nearby=()=>dense.enemies;step(dense);
assert.equal(hits(dense,a),6);assert.equal(hits(dense,b),6);
for(let i=0;i<40;i++)step(dense);
assert.equal(hits(dense,a),6);assert.equal(dense.attacks._orbitContacts.get(a),63);
for(let i=0;i<10;i++)dense.attacks.updateOrbit();
assert.equal(hits(dense,a),6,'same-clock refresh cannot replay a contact');

// Leaving the spatial-query region drops the mask without an all-enemy scan;
// a return is a fresh contact. A different target keeps its own six bits.
a.x=1000;dense._nearby=(x,y,r)=>dense.enemies.filter(e=>Math.hypot(x-e.x,y-e.y)<r+e.r);step(dense);
assert(!dense.attacks._orbitContacts.has(a));assert.equal(dense.attacks._orbitContacts.get(b),63);
a.x=0;step(dense);assert.equal(hits(dense,a),12);assert.equal(hits(dense,b),6);

// A narrow target receives one hit per pass, including the next revolution.
const pass=arena(),victim=target(pass,74,0);
step(pass,0);assert.equal(hits(pass,victim),1);
step(pass,.025);assert.equal(hits(pass,victim),1);
for(let i=0;i<44;i++)step(pass,.025);
assert.equal(hits(pass,victim),2,'the opposite knife independently hits on its own pass');
for(let i=0;i<43;i++)step(pass,.025);
assert.equal(hits(pass,victim),3,'the original knife can damage after leaving and returning');

// Debug-speed movement can cross a tiny enemy between endpoints. A short sweep
// catches it, while a teleport explicitly starts a new path without a sweep.
const fast=arena(),small=target(fast,90,5,1);fast.player.speed=660;
step(fast,0);assert.equal(hits(fast,small),0);
fast.player.x=33;step(fast,.05);assert.equal(hits(fast,small),1);
assert(!fast.attacks._orbitContacts.has(small),'crossed target is not left marked as touching');
const tele=arena(),between=target(tele,270,0,8);step(tele,0);tele.player.x=400;step(tele,.025);
assert.equal(hits(tele,between),0,'teleport never sweeps through an intermediate target');
assert(tele.orbitals.every(blade=>blade.trail.count===1));

// Blocked blades neither hit nor retain contacts; becoming reachable starts
// a new pass. Changing scenes and blade counts clears the bounded state too.
const blocked=arena(5),large=target(blocked,0,0,160);blocked._nearby=()=>blocked.enemies;
let allow=true;blocked.combat.clearPath=()=>allow;
step(blocked);assert.equal(hits(blocked,large),6);allow=false;step(blocked);
assert.equal(blocked.attacks._orbitContacts.size,0);allow=true;step(blocked);assert.equal(hits(blocked,large),12);
blocked.terrain=new Terrain({obstacles:[]});step(blocked);assert.equal(hits(blocked,large),18);
blocked.levels.orbit=2;blocked._syncEvolutions(false);step(blocked);assert.equal(hits(blocked,large),21);
blocked.build.setEquipped('sword',true);blocked._refreshWeapons();assert(blocked.setWeaponEquipped('orbit',false));
assert.equal(blocked.attacks._orbitContacts.size,0);assert(blocked.setWeaponEquipped('orbit',true));
blocked.attacks.updateOrbit();assert.equal(hits(blocked,large),21,'re-equipping during a refresh cannot create same-clock damage');
step(blocked);assert.equal(hits(blocked,large),24);
blocked.attacks.clearTrails();assert.equal(blocked.attacks._orbitContacts.size,0);assert.equal(blocked.attacks._orbitNextContacts.size,0);

// Multiple knife hits use the common independent push limiter. Damage is not
// suppressed when a second/third knife exceeds that per-victim push budget.
const actual=arena(5),body=target(actual,10,0,160);actual._nearby=()=>actual.enemies;
const actualHit=Game.prototype._hitEnemy.bind(actual);actual._hitEnemy=actualHit;
const hp=body.hp,damage=weaponStats(actual,'orbit').damage;step(actual,0);
assert(Math.abs(hp-body.hp-damage*6)<1e-6,'all six contacts settle actual damage');
assert.equal(body._weaponPush.lastAt,0,'the first contact requests a physical push');
assert.equal(body._weaponPush.previousAt,-Infinity,'five additional simultaneous hits cannot renew the push');

// Report a repeatable engine-only stress measurement, never a device FPS claim.
// Queries stay local and state remains bounded by current contacts, not kills.
const bench=arena(5);let queries=0;const nearby=bench._nearby.bind(bench);
bench._nearby=(...args)=>{queries++;return nearby(...args);};
for(let i=0;i<180;i++){const angle=i*Math.PI*(3-Math.sqrt(5)),r=60+(i%6)*13;target(bench,Math.cos(angle)*r,Math.sin(angle)*r,12);}
bench._hitEnemy=()=>1;bench._rebuildGrid();
const begin=performance.now();for(let i=0;i<1200;i++){bench._clock+=1/60;bench.attacks.updateOrbit();}
const elapsed=performance.now()-begin;
assert.equal(queries,1200*6,'one bounded spatial query per visible blade');
assert(bench.attacks._orbitContacts.size<=180);assert.equal(bench.attacks._orbitNextContacts.size,0);
bench.enemies=[];bench._rebuildGrid();step(bench);assert.equal(bench.attacks._orbitContacts.size,0);
console.log(`Orbit contact QA passed: per-blade entry, persistent overlaps, departure/re-entry, sweep, teleport, walls, scenes, equipment, and 180-enemy stress (${(elapsed/1200).toFixed(3)} ms/update; cloud Node, no rendering).`);
