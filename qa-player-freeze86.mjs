import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { weaponStats } from './dist/combat-stats.js';

const arena=()=>{
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.enemies=[];g.events=[];g.effects=[];g._spawn=Infinity;g.nextBossAt=Infinity;g.crystalsNext=Infinity;g.player.xpNext=Infinity;
  g._updatePressure=()=>{};return g;
};
const enemy=(g,x=90)=>{const e=g._spawnEnemy('slime');Object.assign(e,{x,y:0,hp:10000,maxHp:10000,speed:0,damage:0});g._rebuildGrid();return e;};
const freeze=(g,duration=.4)=>{g.abilities.statusFor(g.player).frozenUntil=g.abilities.clock+duration;};
const step=(g,t)=>{for(let left=t;left>1e-8;left-=.025)g.update(Math.min(left,.025));};

// Frozen actors cannot start body-driven attacks, but passive orbital blades
// remain in motion. Thawing resumes normal attacks without re-equipping.
const held=arena();enemy(held,55);
Object.assign(held.levels,{arrow:1,orbit:1,pulse:4,lightning:4,fireball:1,frostbolt:1});
held.build.superLevels.meteor=1;held.build.superLevels.swords=1;held._refreshWeapons();
held._shot=held._pulse=held._lightning=0;held._abilityCooldowns.fireball=held._abilityCooldowns.frostbolt=0;
freeze(held);held.events=[];held.effects=[];
step(held,.05);const orbit=held.orbitals.map(e=>({x:e.x,y:e.y}));step(held,.05);
assert.equal(held.bullets.length,0);assert.equal(held.attacks.sword.pending,null);
assert.equal(held.superSkills.fields.length,0);assert.equal(held.superSkills._volleys.length,0);assert.equal(held.abilities.effects.length,0);
assert(!held.events.some(e=>['shoot','swordSwing','superCast'].includes(e.type)));
assert(!held.effects.some(e=>e.type==='lightning'||e.quake));
assert(held.orbitals.some((e,i)=>e.x!==orbit[i].x||e.y!==orbit[i].y),'existing orbit blades keep rotating');
assert.equal(held.attacks.castStorm(),false,'direct casts cannot bypass freeze');
assert.equal(held.superSkills._cast('meteor',1),false);
assert.equal(held.superSkills.castRunicVolley({...weaponStats(held,'arrow'),runic:1},held.enemies[0]),false);
held.abilities.statusFor(held.player).frozenUntil=0;step(held,.025);
assert(held.events.some(e=>e.type==='shoot'));assert(held.events.some(e=>e.type==='swordSwing'));
assert(held.events.some(e=>e.type==='superCast'));
assert(held.abilities.effects.some(e=>['fireball','frostbolt'].includes(e.abilityId)));

// Arrows already in flight keep moving; freezing must not pause the world.
const arrow=arena();enemy(arrow,250);arrow.levels.arrow=1;arrow._shot=0;arrow.attacks.updateBasic(.01);
assert.equal(arrow.bullets.length,1);const shot=arrow.bullets[0],x=shot.x;
freeze(arrow);arrow._shot=0;arrow.events=[];arrow.attacks.updateBasic(.05);
assert(shot.x>x);assert.equal(arrow.bullets.length,1);assert(!arrow.events.some(e=>e.type==='shoot'));

// Interrupt an unfinished melee swing, but leave released energy untouched.
const sword=arena();enemy(sword,55);sword.levels.sword=3;sword.levels.swordEnergy=1;
sword.attacks.updateSword(.01);assert(sword.attacks.sword.pending);
const victim=sword.enemies[0],hp=victim.hp;freeze(sword);sword.attacks.updateSword(.2);
assert.equal(sword.attacks.sword.pending,null);assert.equal(victim.hp,hp);
sword.abilities.statusFor(sword.player).frozenUntil=0;sword.attacks.sword.cooldown=0;sword.attacks.updateSword(.01);sword.attacks.updateSword(.2);
assert(sword.attacks.sword.energyWaves.length>0);const wave=sword.attacks.sword.energyWaves[0],waveX=wave.x;
freeze(sword);sword.attacks.updateSword(.025);assert(wave.x>waveX,'released sword energy keeps flying');

// A previously cast star still lands and an already scheduled quake echo pays.
const active=arena(),target=enemy(active,140);active.build.superLevels.meteor=1;
assert(active.superSkills._cast('meteor',1));freeze(active,2);
for(let i=0;i<50;i++){active._clock+=.025;active.superSkills.update(.025);}
assert(target.hp<10000);assert.equal(active.superSkills.fields.length,0);
active.levels.pulse=4;active._pulseEchoes=[{x:target.x,y:target.y,r:120,damage:30,life:.01}];const before=target.hp;
active.attacks.updatePulse(.025);assert(target.hp<before,'existing echo is independent of the frozen caster');
console.log('Player freeze: no new casts, interrupted sword windup, persistent orbit/arrow/energy/star/echo continuation and clean thaw passed.');
