import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { CombatAttacks } from './dist/combat-attacks.js';
import { CombatArt } from './dist/combat-art.js';
import { WeaponTrail, TRAIL_CAPACITY, drawWeaponTrail } from './dist/weapon-trails.js';

const points=t=>Array.from({length:t.count},(_,n)=>{const i=t.index(n);return Array.from(t.points.subarray(i,i+3));});
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function recorder(){const calls=[];return new Proxy({calls},{get:(target,key)=>key in target?target[key]:(...args)=>calls.push([key,...args])});}
function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.bullets=[];g.effects=[];g._shot=Infinity;g._spawn=Infinity;g.levels.orbit=1;
  return g;
}

// Fixed storage survives long runs; expiration, rewind and a teleport cannot
// turn into a very long connecting ribbon.
const bounded=new WeaponTrail(),storage=bounded.points;
for(let n=0;n<20000;n++)bounded.add(n*.2,Math.sin(n*.02),n*.002);
assert.equal(bounded.points,storage);assert.equal(bounded.count,TRAIL_CAPACITY);assert(bounded.length<=bounded.maxLength);
bounded.add(4000,0,41);assert.equal(bounded.count,1);
bounded.add(8000,0,41.01);assert.equal(bounded.count,1);
bounded.add(8001,0,40);assert.equal(bounded.count,1);

// A real swept ricochet turns inside a single tick. Preserve its exact impact
// and both legs, including the source's unchanged damage attenuation and IDs.
const first={id:1,x:14,y:0,r:2,hp:100},second={id:2,x:8,y:80,r:2,hp:100},hits=[];
const fake={_clock:.04,player:{r:15},terrain:{query:()=>[]},region:{id:'forest'},dungeon:{active:null},
  _nearby:()=>[first,second],_nearest:()=>second,_effect:()=>{},_emit:()=>{},
  _hitEnemy:(e,damage)=>{e.hp-=damage;hits.push([e.id,damage]);}};
const arrow={weaponId:'arrow',x:0,y:0,r:1,vx:640,vy:0,speed:640,angle:0,life:1,damage:10,branch:'ricochet',pierce:3,targetLimit:3,maxBounces:2,retention:.65,bounces:0,hitIds:new Set()};
const attacks=new CombatAttacks(fake),random=Math.random;
Math.random=()=>{throw new Error('Trails must never consume combat randomness');};
try{attacks.updateArrow(arrow,.04);}finally{Math.random=random;}
const bend=points(arrow.trail);assert.equal(bend.length,3);assert.deepEqual(bend[0],[0,0,0]);
near(bend[1][0],8);near(bend[1][1],0);near(bend[1][2],.0125);
near(bend[2][0],8);near(bend[2][1],17.6);near(bend[2][2],.04);
assert.deepEqual(hits,[[1,10]]);assert.equal(first.hp,90);assert.equal(second.hp,100);near(arrow.damage,6.5);assert.equal(arrow.bounces,1);assert.deepEqual([...arrow.hitIds],[1]);
// External relocation and a scene replacement cannot inherit the old bend.
arrow.x=200;fake._clock=.05;attacks.updateArrow(arrow,.01);assert(points(arrow.trail).every(p=>p[0]>199));
fake.terrain={query:()=>[]};fake._clock=.06;attacks.updateArrow(arrow,.01);assert.equal(arrow.trail.count,2);

// Orbital history is sampled in world coordinates. Walking changes the center
// but cannot translate yesterday's points to the player's current position.
const g=arena();g.attacks.updateOrbit();const trail=g.orbitals[0].trail,initial=points(trail)[0];
g._clock=.025;g.player.x=5;g.attacks.updateOrbit();assert.equal(g.orbitals[0].trail,trail);assert.deepEqual(points(trail)[0],initial);assert.equal(trail.count,2);
const paused=points(trail);for(let n=0;n<20;n++)g.attacks.updateOrbit();assert.deepEqual(points(trail),paused,'same simulation time cannot add animation samples');
const before=JSON.stringify({head:trail.head,count:trail.count,points:Array.from(trail.points)}),a=recorder(),b=recorder();
assert(drawWeaponTrail(a,g.orbitals[0],{time:g._clock}));assert(drawWeaponTrail(b,g.orbitals[0],{time:g._clock}));assert.deepEqual(a.calls,b.calls);
assert.equal(JSON.stringify({head:trail.head,count:trail.count,points:Array.from(trail.points)}),before,'drawing is read-only');
assert(!drawWeaponTrail(recorder(),g.orbitals[0],{time:g._clock+1}),'expired samples are invisible');
const dense=recorder();drawWeaponTrail(dense,g.orbitals[0],{time:g._clock,dense:true});assert(dense.calls.length<a.calls.length);

// Obstruction clears immediately, and the next visible tick starts fresh. The
// additional between-sample check also blocks a chord through a wall corner.
const clearPath=g.combat.clearPath.bind(g.combat);
g.combat.clearPath=()=>false;g._clock+=.025;g.attacks.updateOrbit();assert.equal(g.orbitals.length,0);assert.equal(trail.count,0);
g.combat.clearPath=clearPath;g._clock+=.025;g.attacks.updateOrbit();assert.equal(g.orbitals[0].trail.count,1);
g.combat.clearPath=(origin,...args)=>origin===g.player?clearPath(origin,...args):false;
g._clock+=.025;g.attacks.updateOrbit();assert.equal(g.orbitals[0].trail.count,1,'a wall-crossing sample segment must be severed');g.combat.clearPath=clearPath;

// In-world teleport, changing dungeon identity, and re-equipping each begin
// a new bounded history even if simulation time barely advances.
g._clock+=.025;g.player.x+=500;g.attacks.updateOrbit();assert.equal(g.orbitals[0].trail.count,1);
g._clock+=.025;g.attacks.updateOrbit();assert.equal(g.orbitals[0].trail.count,2);
g.dungeon.active={id:'room'};g._clock+=.025;g.attacks.updateOrbit();assert.equal(g.orbitals[0].trail.count,1);
g.dungeon.active=null;g._clock+=.025;g.attacks.updateOrbit();assert.equal(g.orbitals[0].trail.count,1);
g.build.setEquipped('orbit',false);g.attacks.updateOrbit();assert.equal(g.attacks._orbitTrails.size,0);
g.build.setEquipped('orbit',true);g.attacks.updateOrbit();assert.equal(g.orbitals[0].trail.count,1);
g.levels.orbit=5;g._clock+=.025;g.attacks.updateOrbit();assert.equal(g.attacks._orbitTrails.size,4);assert(g.orbitals.every(b=>b.trail.count===1));
for(let n=0;n<1000;n++){g._clock+=.016;g.player.x+=1;g.attacks.updateOrbit();}assert.equal(g.attacks._orbitTrails.size,4);assert(g.orbitals.every(b=>b.trail.count<=TRAIL_CAPACITY));
g.attacks.clearTrails();assert.equal(g.attacks._orbitTrails.size,0);

// The projectile body keeps its familiar shape without adding its previous
// guessed straight tail on top of the recorded bent one.
const art=new CombatArt(),plain=recorder(),recorded=recorder();
art.drawArrow(plain,{...arrow,trail:null});art.drawArrow(recorded,arrow);
assert(plain.calls.length>recorded.calls.length);
console.log('Weapon trails QA passed: swept ricochets, world paths, walls, pause, scenes, equipment and bounded allocation');
