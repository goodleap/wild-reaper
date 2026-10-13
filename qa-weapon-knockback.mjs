import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { queueWeaponKnockback, updateWeaponKnockback, clearWeaponKnockbackScene, WEAPON_KNOCKBACK } from './dist/weapon-knockback.js';

let seed=57081;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} != ${b}`);
function arena(obstacles=[]) {
  const g=new Game({terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g._spawn=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g.build.setEquipped('sword',false);g._shot=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.player.x=g.player.y=0;return g;
}
function enemy(g,type='slime',x=100,y=0) {
  const e=g._spawnEnemy(type);Object.assign(e,{x,y,hp:10000,maxHp:10000,speed:0,xp:0,chargeCooldown:Infinity});g._rebuildGrid();return e;
}
function finish(g,e) {for(let n=0;n<4;n++){g._clock+=.04;updateWeaponKnockback(g,e,.04);}}
function hit(g,e,source='sword',distance=12,origin=g.player,damage=10){return g._hitEnemy(e,damage,distance,origin,source);}

// The shared rolling window has no fixed-second reset boundary. Rejected
// displacement still deals damage and produces the ordinary hit feedback.
const g=arena(),e=enemy(g);hit(g,e);assert.equal(e.x,100,'no instantaneous displacement');
updateWeaponKnockback(g,e,.04);const firstStep=e.x-100;updateWeaponKnockback(g,e,.04);const secondStep=e.x-100-firstStep;
assert(firstStep>secondStep&&secondStep>0,'velocity decays instead of moving in equal teleport steps');
updateWeaponKnockback(g,e,.08);close(e.x,112,'first displacement');
g._clock=.249;hit(g,e,'arrow',4);assert.equal(e.hp,9980);close(e.x,112,'minimum interval blocks only displacement');
g._clock=.25;hit(g,e,'orbit',4);finish(g,e);close(e.x,114.4,'second displacement is sixty percent');
for(const time of [.5,.999]){g._clock=time;hit(g,e,'sword');finish(g,e);close(e.x,114.4,'third weapon cannot reset the shared budget');}
assert.equal(e.hp,9950);assert.equal(g.effects.filter(effect=>effect.type==='hit').length,5,'every successful damage hit retains feedback');
g._clock=1;hit(g,e);finish(g,e);close(e.x,121.6,'first timestamp expires after exactly one second, leaving a reduced second hit');
g._clock=1.249;hit(g,e);finish(g,e);close(e.x,121.6,'rolling interval still applies across integer seconds');
g._clock=2.26;hit(g,e);finish(g,e);close(e.x,133.6,'an empty window restores full displacement');

// Every enemy owns its budget. A skill's larger push remains immediate and
// does not use or replenish the ordinary-weapon allowance.
const independent=arena(),a=enemy(independent,'slime',100),b=enemy(independent,'slime',180);
hit(independent,a);hit(independent,b);finish(independent,a);finish(independent,b);close(a.x,112,'first enemy');close(b.x,192,'second enemy');
independent._clock=.4;hit(independent,a,'arrow',4);finish(independent,a);const beforeSkill=a.x,last=a._weaponPush.lastAt;
hit(independent,a,'pulse',30);close(a.x,beforeSkill+30,'skill retains its own displacement');assert.equal(a._weaponPush.lastAt,last);
independent._clock=.7;hit(independent,a);finish(independent,a);close(a.x,beforeSkill+30,'skill cannot reset the shared weapon allowance');

// Bosses do not move. Heavy creatures still react, with smaller displacement.
for(const [type,factor] of [['boss',0],['brute',.45],['boar',.6],['slime',1]]) {
  const world=arena(),target=enemy(world,type);hit(world,target);finish(world,target);
  close(target.x,100+12*factor,`${type} resistance`);assert.equal(target.hp,9990);
}

// Directions remain explicit: arrows follow velocity, even when a target's
// center is off the ray; orbitals push away from the hero, not the blade.
const directions=arena(),arrow=enemy(directions,'slime',100,12),ring=enemy(directions,'slime',-100,0);
hit(directions,arrow,'arrow',4,{x:80,y:0,knockbackX:500,knockbackY:0});finish(directions,arrow);
close(arrow.x,104,'arrow flight direction');close(arrow.y,12,'arrow does not fan away from its near-side impact point');
hit(directions,ring,'orbit',4,{x:-110,y:0});finish(directions,ring);close(ring.x,-104,'orbital pushes radially from the character');
const projectileWorld=arena(),projectileTarget=enemy(projectileWorld,'slime',70,9);
projectileWorld.attacks.updateArrow({weaponId:'arrow',x:30,y:0,r:4,angle:0,vx:640,vy:0,speed:640,life:.8,damage:10,pierce:1,targetLimit:1,hitIds:new Set()},.1);
finish(projectileWorld,projectileTarget);close(projectileTarget.y,9,'actual projectile hit carries its flight vector into displacement');assert(projectileTarget.x>70);

// The same swept movement respects solid terrain. Neither repeated arrows
// nor ongoing rushes turn a push into a wall-crossing teleport.
const wall={id:'wall',type:'log',heightBand:'high',x:130,y:20,r:8,halfLength:100,angle:Math.PI/2};
const blocked=arena([wall]),atWall=enemy(blocked,'slime',100);hit(blocked,atWall,'sword',40);finish(blocked,atWall);
assert(atWall.x<=106.02&&atWall.x>=100,'collision stops displacement on the near side of the wall');
const boar=enemy(blocked,'boar',70);boar.charge={phase:'rush',life:.5,maxLife:.8,dx:1,dy:0,startX:70,startY:22,length:256};
hit(blocked,boar,'arrow',4);assert.equal(boar._weaponPush,undefined,'rush immunity does not spend displacement allowance');assert.equal(boar.charge.phase,'rush');
blocked._updateBoar(boar,.2);assert(boar.x<130);assert.equal(boar.charge.phase,'stunned','the rush itself still collides with terrain');
boar.charge=null;assert(queueWeaponKnockback(blocked,boar,4,blocked.player,'arrow'),'the budget is available after the rush');
const special=arena(),windup=enemy(special,'boar'),caster=enemy(special,'spore',200);
windup.charge={phase:'windup',life:.7,dx:-1,dy:0,startX:100,startY:22};caster.cast={life:.6,angle:.8};
hit(special,windup);hit(special,caster);finish(special,windup);finish(special,caster);
assert.equal(windup.charge.phase,'windup');assert.equal(windup.charge.life,.7);close(windup.charge.startX,windup.x,'charge telegraph follows its actor');
close(windup.charge.startY,windup.y+groundOffset(windup),'charge ground origin stays aligned');assert.deepEqual(caster.cast,{life:.6,angle:.8},'weapon feedback never cancels a cast');

// The engine advances displacement only during play. Killing an actor or
// leaving a scene removes the pending motion without ghost movement later.
const paused=arena(),frozen=enemy(paused);hit(paused,frozen);paused.status='paused';paused.update(.05);assert.equal(frozen.x,100);assert.equal(paused._clock,0);
paused.status='playing';paused.update(.04);assert(frozen.x>100&&frozen.x<112,'engine integration applies a partial motion on resume');
const movingX=frozen.x;hit(paused,frozen,'sword',12,paused.player,20000);assert.equal(frozen._weaponPush,null);paused.update(.05);assert.equal(frozen.x,movingX,'dead actors never finish queued motion');
const scene=arena(),old=enemy(scene);hit(scene,old);clearWeaponKnockbackScene(scene);updateWeaponKnockback(scene,old,.04);assert.equal(old.x,100);assert.equal(old._weaponPush,null);
assert(queueWeaponKnockback(scene,old,12,scene.player,'sword'),'a fresh scene cannot inherit a stale budget');
assert.equal(WEAPON_KNOCKBACK.window,1);
console.log('Weapon knockback: shared rolling budget, decaying motion, independent actors, uninterrupted damage, skill independence, resistance, actual arrow direction, radial orbit, terrain, rush/cast safety, pause, death and scene cleanup passed.');
