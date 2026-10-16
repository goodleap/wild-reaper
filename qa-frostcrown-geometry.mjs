import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { initBoss } from './dist/bosses.js';
import { resolveSpecialistBoss } from './dist/bosses/specialists.js';
import { bossDefinition } from './dist/boss-definitions.js';
import { updateEnemyLocomotion } from './dist/enemy-animation.js';
import { intersectsSwordArc, swordEnergyContact } from './dist/sword-combat.js';
import { frostcrownFacing, frostcrownBodyCircle, frostcrownBodySweep, frostcrownQueryBounds,
  frostcrownGroundContact, frostcrownGroundSweep, frostcrownGroundSamples, frostcrownTerrainSamples,
  moveFrostcrownGround, snapshotFrostcrownBody, frostcrownBodyPose } from './dist/enemy-body-geometry.js';

let seed=76312;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-6,`${message}: ${a} / ${b}`);
const deer=extra=>({id:1,type:'boss',bossKind:'frostcrown',x:0,y:0,r:49,groundOffset:40,hp:10000,maxHp:10000,damage:30,speed:49,visualFacing:0,guardActive:true,...extra});
function arena(obstacles=[]){
  const g=new Game({terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g.player.x=g.player.y=0;
  g._spawn=g._shot=g._pulse=g._lightning=g.nextBossAt=Infinity;g.player.xpNext=g.crystalsNext=Infinity;g._updatePressure=()=>{};
  for(const id of ['sword','arrow','orbit'])g.build.setEquipped(id,false);
  return g;
}
function addDeer(g,extra={}){const e=g._spawnEnemy('boss');initBoss(e,'frostcrown');Object.assign(e,deer({id:e.id,...extra}));g._rebuildGrid();return e;}
const shape=deer();
for(const [x,y] of [[0,0],[34,-32],[52,-25],[13,38],[-28,34],[29,33],[-9,31]])assert(frostcrownBodyCircle(shape,x,y),`occupied body ${x},${y}`);
for(const [x,y] of [[0,31],[38,28],[0,-75],[-45,0],[-5,-22],[45,15]])assert(!frostcrownBodyCircle(shape,x,y),`transparent/decorative space ${x},${y}`);
assert.equal(frostcrownBodySweep(shape,{x:0,y:24},{x:0,y:45},1),Infinity,'a thin projectile can pass between the legs');
assert(Number.isFinite(frostcrownBodySweep(shape,{x:70,y:-33},{x:30,y:-33},1)),'head sweep detects the occupied silhouette');
assert.equal(swordEnergyContact({x:0,y:24},{x:0,y:45},shape,shape,1),Infinity);
assert(Number.isFinite(swordEnergyContact({x:70,y:-33},{x:30,y:-33},shape,shape,1)));
assert(Number.isFinite(frostcrownBodySweep(shape,{x:10,y:-33},{x:10,y:-33},1,{x:-60,y:0},{x:0,y:0})),'relative target motion is swept without losing identity');
assert(!intersectsSwordArc({x:0,y:31},shape,2,Math.PI*2,0),'melee cannot hit empty belly space');
assert(!intersectsSwordArc({x:70,y:-33},shape,8,Math.PI*2,Math.PI),'body bounds never inflate the actual sword reach');
assert(intersectsSwordArc({x:70,y:-33},shape,25,Math.PI*.5,Math.PI));
shape.visualFacing=Math.PI;assert.equal(frostcrownFacing(shape),-1);assert(frostcrownBodyCircle(shape,-34,-32));assert(!frostcrownBodyCircle(shape,52,-25));
shape.visualFacing=Math.PI/2;assert.equal(frostcrownFacing(shape),-1,'vertical motion preserves the last valid facing');
shape.specialAttack={angle:0};assert.equal(frostcrownFacing(shape),1,'committed attack owns facing');
assert.equal(shape.r,49,'geometry never rewrites the stable radius');

// Real grid and view eligibility must admit a visible head even when the
// legacy r49 circle and center cell are outside the queried region.
const grid=arena(),edge=addDeer(grid);grid._cell=32;grid._rebuildGrid();
assert.deepEqual(grid._nearby(52,-25,0),[edge]);assert.equal(grid._nearby(0,0,200).filter(e=>e===edge).length,1);
grid.viewWidth=540;grid.viewHeight=300;edge.x=325;edge.visualFacing=Math.PI;
assert(grid._inView(edge),'visible nose crossing the viewport remains eligible');edge.x=500;assert(!grid._inView(edge));
edge.x=0;edge.visualFacing=0;grid.player.x=68;grid.player.y=-34;grid._rebuildGrid();
const stats={equipped:true,damage:70,interval:.72,range:19,arc:Math.PI*.8,windup:.065,hitTime:.115,duration:.28,knockback:0,branch:null};
grid.attacks.sword.update(0,stats);assert(grid.attacks.sword.pending,'a reachable head can start a swing beyond center+r49');
grid.attacks.sword.update(stats.hitTime,stats);assert.equal(edge.hp,9930,'the real sword strike reaches that head once');

// The actual arrow update traverses transparent gaps without consuming its
// ledger, and settles one normal hit against a head before its endpoint.
for(const [start,end,hit] of [[{x:0,y:24},{x:0,y:45},false],[{x:70,y:-33},{x:30,y:-33},true]]){
  const g=arena(),e=addDeer(g),b={...start,vx:end.x-start.x,vy:end.y-start.y,r:1,life:2,damage:25,knockback:0,pierce:1,hitIds:new Set()};
  g.attacks.updateArrow(b,1);assert.equal(e.hp,hit?9975:10000);assert.equal(b.hitIds.has(e.id),hit);
  if(!hit)assert(b.life>0,'an empty-space crossing does not terminate the arrow');
}
for(const moving of [false,true]){
  const g=arena(),e=addDeer(g),sword=g.attacks.sword,start=moving?{x:10,y:-33}:{x:0,y:24},ledger=new Set();
  if(moving)sword._enemyPoints.set(e,{x:-60,y:0});
  sword.energyWaves.push({...start,groundY:start.y+groundOffset(g.player,true),groundLift:groundOffset(g.player,true),r:1,angle:Math.PI/2,speed:moving?0:21,delay:0,age:0,life:2,damage:23,knockback:0,cast:{hitTargets:ledger},owner:g.player});
  sword._updateEnergy(1);assert.equal(e.hp,moving?9977:10000,'real energy update retains deer identity for gap and moving-target sweeps');assert.equal(ledger.has(e),moving);
}

// Exercise moving and area ability execution independently of acquisition.
// Friendly abilities keep their authored width, length, damage and hit ledger.
function effect(g,shape,start,end,radius=1){return {abilityId:'frostbolt',caster:g.player,hostile:false,shape,profile:'projectile',parameters:{speed:Math.hypot(end.x-start.x,end.y-start.y),range:Math.hypot(end.x-start.x,end.y-start.y),radius,damage:17,duration:1,tickInterval:.5},...start,origin:{...start},angle:Math.atan2(end.y-start.y,end.x-start.x),groundOffset:0,distance:0,age:1,windup:0,remaining:1,hit:new Set(),lastHit:new Map()};}
for(const kind of ['projectile','wave','beam'])for(const [start,end,hit] of [[{x:0,y:24},{x:0,y:45},false],[{x:70,y:-33},{x:30,y:-33},true]]){
  const g=arena(),e=addDeer(g),a=effect(g,kind,start,end);
  if(kind==='beam')g.abilities.updateArea(a,1,true);else g.abilities.updateMoving(a,1);
  assert.equal(e.hp,hit?9983:10000,`${kind} respects body/gap geometry`);
}
const ground=arena(),groundDeer=addDeer(ground),ring=effect(ground,'ring',{x:60,y:16.2},{x:61,y:16.2},12);ring.profile='ground';ring.groundOffset=19.8;
ground.abilities.updateArea(ring,1,true);assert.equal(groundDeer.hp,10000,'ground areas use the feet, not the body-origin r49 circle');
ring.x=43;ring.hit.clear();ground.abilities.updateArea(ring,1,true);assert.equal(groundDeer.hp,9983);

// Per-blade contact state remains entry based for the illustrated body too.
const orbit=arena();orbit.levels.orbit=1;orbit.build.setEquipped('orbit',true);orbit._syncEvolutions(false);
const orbitDeer=addDeer(orbit,{x:55,y:30});let orbitHits=0;orbit._hitEnemy=()=>{orbitHits++;return 1;};
const orbitStep=dt=>{orbit._clock+=dt;orbit._rebuildGrid();orbit.attacks.updateOrbit();};
orbitStep(0);assert(orbitHits>0);const initialHits=orbitHits;
orbit.attacks.updateOrbit();assert.equal(orbitHits,initialHits,'same-clock refresh cannot replay a deer contact');
orbitDeer.x=1000;orbitStep(.01);assert(!orbit.attacks._orbitContacts.has(orbitDeer));orbitDeer.x=55;orbitStep(.01);assert(orbitHits>initialHits,'leaving and returning creates a new blade entry');

assert(!frostcrownGroundContact(deer(),60,36,12));assert(frostcrownGroundContact(deer(),43,36,12));
const chargeLine={x:0,y:40,x2:100,y2:40};
assert.equal(frostcrownGroundSweep(deer(),chargeLine,{x:50,y:100},12),Infinity);
assert(Number.isFinite(frostcrownGroundSweep(deer(),chargeLine,{x:50,y:36},12)));
for(const [groundY,hit] of [[100,false],[36,true]]){
  const g=arena(),e=addDeer(g);g.player.x=50;g.player.y=groundY-groundOffset(g.player,true);g.player.invuln=0;
  g._hurtPlayer=amount=>{g.player.hp-=amount;return true;};
  e.specialAttack={kind:'frostCharge',phase:'rush',angle:0,life:1,maxLife:1,segment:{...chargeLine},hitIds:new Set()};
  const hp=g.player.hp;resolveSpecialistBoss(g,e);const loss=hp-g.player.hp;
  assert.equal(loss>0,hit,'actual charge only hits its swept footprint');if(hit)close(loss,e.damage*bossDefinition('frostcrown').parameters.chargeDamage,'unchanged charge damage');
  e.specialAttack.segment={...chargeLine};g.player.invuln=0;resolveSpecialistBoss(g,e);close(hp-g.player.hp,loss,'one hit per charge target');
}

// Actual Game contact and soft separation use ground occupancy. An enemy
// beside the antlers or above the foot line must not push or damage through air.
const contact=arena(),contactDeer=addDeer(contact,{speed:0,specialCooldown:Infinity});contact.player.x=60;contact.player.y=36-groundOffset(contact.player,true);contact.player.invuln=0;
const hp=contact.player.hp;contact.update(.01);assert.equal(contact.player.hp,hp);
contact.player.x=43;contact.player.invuln=0;contact.update(.01);assert(contact.player.hp<hp);
const separate=arena(),inactive=addDeer(separate,{guardActive:false,speed:0});separate.player.x=500;
const slime=separate._spawnEnemy('slime');Object.assign(slime,{x:0,y:60-groundOffset(slime),speed:0,hp:10000});
const before={x:slime.x,y:slime.y};separate.update(.025);close(slime.x,before.x,'no air separation x');close(slime.y,before.y,'no air separation y');

// Ground movement checks the whole long footprint, plus moving planted hooves.
const wall={id:'wall',type:'log',heightBand:'tall',x:90,y:36,r:2,halfLength:300,angle:Math.PI/2};
const terrain=new Terrain({obstacles:[wall]}),walker=deer();let blockedFrames=0,maxBackward=0;
for(let frame=0;frame<800;frame++){
  const x=walker.x,y=walker.y;walker._walkStartX=x;walker._walkStartY=y;
  const moved=moveFrostcrownGround(terrain,walker,2,.3);Object.assign(walker,{x:moved.x,y:moved.y});updateEnemyLocomotion(walker,x+(moved.correctionX||0),y+(moved.correctionY||0),.025);snapshotFrostcrownBody(walker);
  if(moved.blocked)blockedFrames++;maxBackward=Math.max(maxBackward,x-walker.x);
  for(const p of frostcrownTerrainSamples(walker))assert(terrain.isFree(walker.x+p.x,walker.y+p.y,p.r),'a planted or swinging hoof or trunk cannot penetrate the wall');
}
assert(blockedFrames>0);assert(walker.y>230,'the whole body keeps sliding along a wall across several complete strides');assert(maxBackward<1,'continuous hoof clearance avoids a finite-frame wall push-out jump');
const turn=moveFrostcrownGround(terrain,walker,-30,0);assert(turn.x<walker.x-29,'turning away releases the wall without sticking');
const overlap=deer({x:65}),resolved=moveFrostcrownGround(terrain,overlap,0,0);
assert(resolved.blocked);for(const p of frostcrownTerrainSamples(overlap))assert(terrain.isFree(resolved.x+p.x,resolved.y+p.y,p.r),'initial overlap resolves one connected footprint');
const broad=deer({moving:true,walkPhase:0});snapshotFrostcrownBody(broad);assert(Math.max(...frostcrownGroundSamples(broad).map(p=>Math.abs(p.x)+p.r))>40,'extended planted hooves are not reduced to a fixed 35-wide footprint');

// The Game wrapper must exclude wall correction from gait/facing while still
// reporting its legacy ground-coordinate result to boss rush code.
const actual=arena([wall]),actualDeer=addDeer(actual,{specialCooldown:Infinity});actual.player.x=1000;actual.player.invuln=Infinity;
let moves=0;actual._moveEnemy=e=>{moves++;actual._moveEntity(e,2,.3);};
for(let frame=0;frame<220;frame++){
  actual.update(.025);
  for(const p of frostcrownTerrainSamples(actualDeer))assert(actual.terrain.isFree(actualDeer.x+p.x,actualDeer.y+p.y,p.r),'real Game movement keeps the full hoof footprint outside terrain');
}
assert(moves>200);assert(actualDeer.y>60);
const last=frostcrownBodyPose(actualDeer),phase=actualDeer.walkPhase;
actual.abilities.statusFor(actualDeer).frozenUntil=actual.abilities.clock+10;actual.update(.025);
assert.equal(actualDeer.walkPhase,phase,'frozen simulation never advances feet');assert.equal(frostcrownBodyPose(actualDeer),last,'freezing after multiple updates without rendering holds the latest simulation pose');
const stopping=arena([wall]),stopped=addDeer(stopping,{x:52.98,specialCooldown:Infinity});stopping.player.x=1000;stopping.player.invuln=Infinity;stopping._moveEnemy=()=>{};
stopped._visualCast={phase:'active',abilityId:'frostRing',progress:.5,angle:0};
stopping.update(.025);for(const p of frostcrownTerrainSamples(stopped))assert(stopping.terrain.isFree(stopped.x+p.x,stopped.y+p.y,p.r),'a stationary cast/recovery pose also reconciles its hoof clearance');

// Active cast progress can continue after launch, but a frozen painted body
// retains its sampled shape, direction and planted feet until thaw.
const frozen=deer({moving:true,walkPhase:Math.PI/2});snapshotFrostcrownBody(frozen);
assert(Object.isFrozen(frostcrownBodyPose(frozen)),'render hooks receive a read-only finite pose');
frozen.walkPhase+=Math.PI/4;snapshotFrostcrownBody(frozen);const latest=frostcrownBodyPose(frozen);
frozen.walkPhase+=Math.PI/4;assert.equal(frostcrownBodyPose(frozen,{frozen:true}),latest,'freezing after simulation catch-up retains the latest simulated pose without a draw');
const frozenBounds=frostcrownQueryBounds(frozen),frozenFeet=frostcrownGroundSamples(frozen);
frozen._bodyGeometryFrozen=true;frozen.walkPhase=Math.PI;frozen.visualFacing=Math.PI;frozen._visualCast={phase:'active',abilityId:'frostRing',progress:1,angle:Math.PI};
assert.deepEqual(frostcrownQueryBounds(frozen),frozenBounds);assert.deepEqual(frostcrownGroundSamples(frozen),frozenFeet);assert.equal(frostcrownFacing(frozen),1);
frozen._bodyGeometryFrozen=false;assert.equal(frostcrownFacing(frozen),-1);assert.notDeepEqual(frostcrownQueryBounds(frozen),frozenBounds);
assert.equal(inactive.r,49);assert.equal(contactDeer.r,49);
console.log('Frostcrown geometry: body/air/antler gaps, mirrored facing, relative sweeps, grid/view acquisition, real sword/arrow/orbit/ability/charge/contact/separation paths, planted-hoof wall sliding and freeze hold passed.');
