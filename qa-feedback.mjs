import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';

// Count every gameplay-random draw: rendering metadata must not change the
// subsequent damage-number/loot rolls, even during a screen-clearing attack.
let randomCalls=0,rolls=[];
Math.random=()=>{randomCalls++;return rolls.length?rolls.shift():.7;};
const resetRolls=(...values)=>{randomCalls=0;rolls=values;};
function arena() {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,elites:false,companions:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;
  g._updatePressure=()=>{};g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  return g;
}
function enemy(g,type='slime',extra={}) {
  const e=g._spawnEnemy(type,1);Object.assign(e,{x:140,y:80,speed:0,hp:100,maxHp:100},extra);return e;
}
function advance(g,seconds) {
  for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(left,.025));
}
const g=arena(),target=enemy(g);g._clock=12.345;
resetRolls(.7);
assert.equal(g._hurtEnemy(target,20,10,{x:100,y:50},'arrow'),20);
assert.equal(randomCalls,1,'a normal nonlethal hit keeps its sole pre-existing damage-label roll');
assert.equal(target.hp,80);assert.equal(target.hit,.12);assert.equal(target.hitSource,'arrow');
assert(Math.abs(target.hitAngle-Math.atan2(30,40))<1e-12,'hit direction is captured before physical knockback');
assert(Math.abs(target.hitStrength-.6)<1e-12);assert.equal(target.x,148);assert.equal(target.y,86);
const hit=g.effects.find(e=>e.type==='hit');
assert.equal(hit.source,'arrow');assert.equal(hit.angle,target.hitAngle);assert.equal(hit.strength,target.hitStrength);
assert.equal(hit.maxLife,.24);assert.equal(hit.x,target.x);assert.equal(hit.y,target.y);
assert([hit.x,hit.y,hit.r,hit.angle,hit.strength,hit.seed,hit.life].every(Number.isFinite));

const same=arena(),sameTarget=enemy(same,'slime',{id:target.id});same._clock=g._clock;
resetRolls(.1,.75);
same._hurtEnemy(sameTarget,20,0,{x:100,y:50},'arrow');
assert.equal(randomCalls,2,'showing a damage label still draws only its existing chance and jitter rolls');
assert.equal(same.effects.find(e=>e.type==='hit').seed,hit.seed,'hit variation depends only on enemy identity and game time');
same._clock+=.025;resetRolls(.7);same._hurtEnemy(sameTarget,1);
assert.notEqual(same.effects.filter(e=>e.type==='hit').at(-1).seed,hit.seed);
resetRolls();same._effect(10,20,'test',.5,10,'#fff');same._effect(10,20,'test',.5,10,'#fff');
assert.equal(same.effects.at(-1).seed,same.effects.at(-2).seed);assert.equal(randomCalls,0);
same._effect(10,20,'test',.5,10,'#fff',undefined,{seed:12345});assert.equal(same.effects.at(-1).seed,12345);

const deathGame=arena(),victim=enemy(deathGame,'slime',{hp:5}),beforeXp=deathGame.player.xp;
resetRolls(.7,.7);
assert.equal(deathGame._hurtEnemy(victim,500,0,deathGame.player,'lightning'),5);
assert.equal(randomCalls,2,'ordinary death keeps exactly the existing label and coin rolls');
assert.equal(deathGame.kills,1);assert.equal(deathGame.player.xp,beforeXp+victim.xp);
assert.equal(deathGame.gems.reduce((sum,e)=>sum+e.value,0),victim.xp);assert.equal(deathGame.coins.length,0);
const defeat=deathGame.effects.find(e=>e.type==='defeat');
assert.equal(defeat.maxLife,.5);assert.equal(defeat.enemyType,'slime');assert.equal(defeat.boss,false);
assert.equal(defeat.source,'lightning');assert.equal(defeat.r,victim.r);assert.equal(defeat.color,'#cce9ff');
assert.equal(deathGame._hurtEnemy(victim,500),0);assert.equal(deathGame.effects.filter(e=>e.type==='defeat').length,1);
assert.equal(deathGame.kills,1);assert.equal(randomCalls,2,'repeated hits on a corpse cannot consume randomness or create a second burst');
const boss=enemy(deathGame,'boss',{hp:5});deathGame._hurtEnemy(boss,100,0,deathGame.player,'storm');
const bossDefeat=deathGame.effects.find(e=>e.type==='defeat'&&e.boss);
assert.equal(bossDefeat.maxLife,.95);assert.equal(bossDefeat.enemyType,'boss');assert.equal(bossDefeat.r,boss.r);

const rejected=arena(),shield=enemy(rejected);rejected.elites.promote(shield,'shield');
resetRolls();const shieldBefore=shield.hp;rejected._hurtEnemy(shield,1);
assert.equal(shield.hp,shieldBefore);assert.equal(shield.hit,0);assert.equal(shield.hitSource,undefined);
for(const amount of [0,-1,NaN,Infinity])assert.equal(rejected._hurtEnemy(shield,amount),0);
assert.equal(rejected.effects.length,0);assert.equal(randomCalls,0);
const blocked=arena();assert(blocked.dungeon.enter({id:'feedback-castle',door:{x:0,y:19.8}}));
blocked.terrain=new Terrain({obstacles:[{id:'wall',type:'log',x:85,y:0,r:12,halfLength:280,angle:Math.PI/2}]});
blocked.enemies=[];blocked.effects=[];blocked.player.x=0;blocked.player.y=0;
const behindWall=enemy(blocked,'slime',{x:145,y:0,dungeonId:blocked.dungeon.active.id,guardActive:true});
resetRolls();assert.equal(blocked._hitEnemy(behindWall,90,0,blocked.player,'lightning'),0);
assert.equal(blocked._hurtEnemy(behindWall,90,0,blocked.player,'super'),0);
assert.equal(behindWall.hp,100);assert.equal(behindWall.hitSource,undefined);assert.equal(blocked.effects.length,0);assert.equal(randomCalls,0);
const coincident=enemy(rejected,'slime',{x:0,y:0});rejected._hurtEnemy(coincident,1,0,{x:0,y:0});
assert.equal(coincident.hitAngle,0);assert(Number.isFinite(coincident.hitStrength));

// A mass defeat stays bounded and retains boss feedback while ordinary bursts
// are replaced. The global effect limit remains exact after unrelated hits.
const crowd=arena();
crowd._effect(0,0,'defeat',.95,49,'#fff',undefined,{boss:true,enemyType:'boss'});
const savedBoss=crowd.effects[0];
for(let i=0;i<80;i++)crowd._effect(i,0,'defeat',.5,16,'#fff',undefined,{boss:false,enemyType:'slime'});
assert.equal(crowd.effects.filter(e=>e.type==='defeat').length,24);assert(crowd.effects.includes(savedBoss));
for(let i=0;i<500;i++)crowd._effect(i,0,'hit',.24,8,'#fff');
assert.equal(crowd.effects.length,200);assert(crowd.effects.includes(savedBoss));
crowd.effects=[];
for(let i=0;i<24;i++)crowd._effect(i,0,'defeat',.95,49,'#fff',undefined,{boss:true});
crowd._effect(99,0,'defeat',.5,16,'#fff',undefined,{boss:false});assert.equal(crowd.effects.length,24);assert(crowd.effects.every(e=>e.boss));
crowd._effect(100,0,'defeat',.95,49,'#fff',undefined,{boss:true});assert.equal(crowd.effects.length,24);assert.equal(crowd.effects.at(-1).x,100);

const pause=arena(),pausedTarget=enemy(pause,'slime',{hp:1});pause._hurtEnemy(pausedTarget,2);
const snapshot=structuredClone(pause.effects),clock=pause._clock;
for(const status of ['paused','upgrade','shop','super','dead']) {
  pause.status=status;advance(pause,1);
  assert.deepEqual(pause.effects,snapshot,`${status} freezes effect lifetimes`);assert.equal(pause._clock,clock);
}
pause.status='playing';advance(pause,1);assert.equal(pause.effects.length,0,'all hit and death remnants expire on gameplay time');

const quakes=arena(),quakeTarget=enemy(quakes,'slime',{x:60,y:20,hp:1000,maxHp:1000});
quakes._castPulse(10,20,100,40,0);
const pulse=quakes.effects.find(e=>e.type==='ring');assert.equal(pulse.quake,true);assert.equal(pulse.x,10);assert.equal(pulse.y,20);assert.equal(pulse.r,100);assert.equal(quakeTarget.hp,960);
assert.equal(pulse.groundY,20+groundOffset(quakes.player,true),'the visual ground origin uses the feet without changing the body-space cast coordinates');
quakes.effects=[];const groundY=20+groundOffset(quakes.player,true);
quakes.companions._quake(10,groundY,100,30,true,77);
const allyPulse=quakes.effects.find(e=>e.type==='ring');assert.equal(allyPulse.quake,true);assert.equal(allyPulse.ally,true);assert.equal(allyPulse.echo,true);assert.equal(allyPulse.seed,77);
assert.equal(allyPulse.x,10);assert.equal(allyPulse.y,groundY);assert.equal(allyPulse.r,100);assert.equal(quakeTarget.hp,930);
assert.equal(allyPulse.groundY,groundY,'the companion quake already starts at its foot point');
console.log('Combat feedback: directional hits, deterministic visual seeds, unchanged RNG/rewards, one-time deaths, blocked hits, bounded effects, pause/expiry and real quake origins passed.');
