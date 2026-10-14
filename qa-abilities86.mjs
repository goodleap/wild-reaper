import assert from 'node:assert/strict';
import { AbilityRuntime } from './dist/ability-runtime.js';
import { ABILITY_DEFINITIONS, ABILITY_RULES, abilityAllowed } from './dist/ability-definitions.js';
import { drawAbilityGround, drawAbilityProjectiles } from './dist/ability-art.js';
import { validateAbilities } from './dist/config-validation/abilities.js';
import { getConfigSnapshot } from './dist/content-config.js';

function fixture(){
  const player={x:0,y:0,groundOffset:0,r:10,hp:1000,maxHp:1000,heroId:'traveler'};
  const g={player,enemies:[],status:'playing',_clock:0,companions:{members:[]},terrain:{firstBlocker:()=>null},hits:[],moves:[],_inView:()=>true,_effect:()=>{},_moveEntity(e,dx,dy){e.x+=dx;e.y+=dy;this.moves.push({e,dx,dy});},_hurtPlayer(damage){if(this.invulnerable)return false;player.hp-=damage;return true;},_hitEnemy(e,damage,_push,_source,id){e.hp-=damage;this.hits.push({e,damage,id});return damage;}};
  g.combat={canTarget:e=>e.hp>0,clearPath:(a,b)=>!g.terrain.firstBlocker(a.x,a.groundY??a.y,b.x,b.groundY??b.y)};
  g.abilities=new AbilityRuntime(g);
  g.enemy=(x=100,type='slime')=>{const e={id:g.enemies.length+1,type,x,y:0,groundOffset:0,r:10,hp:1000,maxHp:1000};g.enemies.push(e);return e;};
  g.tick=(dt,count=1)=>{for(let i=0;i<count;i++){g._clock+=dt;g.abilities.update(dt);}};return g;
}
{
 const g=fixture(),enemy=g.enemy();
 assert(g.abilities.cast('fireball',g.player,{target:enemy,damage:40,burnDamage:6,burnInterval:.6,burnDuration:2.4,speed:500}));
 g.tick(.2);assert.equal(enemy.hp,960,'direct projectile impact');g.tick(.61);assert.equal(enemy.hp,954,'burn damage is separate from impact');
 const status=g.abilities.statuses.get(enemy),next=status.burn.nextAt;
 g.abilities.applyStatus(enemy,{burnDamage:2,burnDuration:3,burnInterval:.6},{caster:g.player,hostile:false});
 assert.equal(status.burn.damage,6,'weaker burn refresh never downgrades or stacks');assert.equal(status.burn.nextAt,next,'refresh keeps cadence');
 g.abilities.applyStatus(enemy,{burnDamage:10,burnDuration:2,burnInterval:.6},{caster:g.player,hostile:false});assert.equal(status.burn.damage,10,'stronger replaces');
 g.abilities.clearScene();assert.equal(g.abilities.effects.length,0);assert.equal(g.abilities.statuses.size,0);
}
{
 const g=fixture(),enemy=g.enemy(),opts={target:enemy,damage:30,speed:500,freezeChance:1,freezeDuration:.7,freezeImmunity:3,slowMultiplier:.6,slowDuration:2};
 g.abilities.cast('frostbolt',g.player,opts);g.tick(.2);assert.equal(enemy.hp,970);assert(g.abilities.isFrozen(enemy));const until=g.abilities.statuses.get(enemy).frozenUntil;
 g.abilities.cast('frostbolt',g.player,opts);g.tick(.2);assert.equal(enemy.hp,940,'freeze protection never suppresses damage');assert.equal(g.abilities.statuses.get(enemy).frozenUntil,until,'protected freeze does not extend');
 g.tick(.6);assert(!g.abilities.isFrozen(enemy));assert.equal(g.abilities.movementMultiplier(enemy),.6);
 const boss=g.enemy(100,'boss');g.abilities.cast('frostbolt',g.player,{...opts,target:boss});enemy.hp=0;g.tick(.2);const s=g.abilities.statuses.get(boss);assert(s);assert(s.frozenUntil-g.abilities.clock<.3);assert(s.freezeProtectedUntil-s.frozenUntil>=6);
}
{
 const g=fixture(),enemy=g.enemy();g.terrain.firstBlocker=(ax,ay,bx)=>ax<50&&bx>=50?{}:null;
 assert(!g.abilities.cast('fireball',g.player,{target:enemy}), 'acquisition rejects targets behind walls');
 g.terrain.firstBlocker=()=>null;g.abilities.cast('fireball',g.player,{target:enemy,damage:40,speed:500});g.terrain.firstBlocker=(ax,ay,bx)=>ax<50&&bx>=50?{}:null;g.tick(.2);assert.equal(enemy.hp,1000,'swept execution also respects new blockers');
}
{
 const g=fixture(),enemy=g.enemy();assert(!abilityAllowed('domain',g.player,g));assert(!g.abilities.cast('domain',g.player,{target:enemy}));
 assert(g.abilities.cast('frostbolt',enemy,{target:g.player,damage:20,speed:500,freezeChance:1,windup:.4}));
 g.tick(.2);assert.equal(g.player.hp,1000,'hostile projectile waits for warning');assert.equal(enemy.hp,1000,'no friendly fire');
 g.invulnerable=true;g.tick(.5);assert.equal(g.player.hp,1000);assert(!g.abilities.statuses.has(g.player),'invulnerability rejects control and burn');
 g.invulnerable=false;g.abilities.cast('frostbolt',enemy,{target:g.player,damage:20,speed:500,freezeChance:1,windup:.3});g.tick(.5);
 assert.equal(g.player.hp,980);const s=g.abilities.statuses.get(g.player);assert(s.frozenUntil-g.abilities.clock<=.281,'player freeze duration is separately capped');
}
{
 const g=fixture(),enemy=g.enemy();g.abilities.cast('fireball',enemy,{target:g.player,windup:.8});
 const status=g.abilities.statusFor(enemy);status.frozenUntil=1;g.tick(.4);assert.equal(g.abilities.effects[0].age,0,'freeze pauses unlaunched hostile cast');
 enemy.guardActive=false;g.tick(.1);assert.equal(g.abilities.effects.length,0,'dormant casters clean transients');
 enemy.guardActive=true;g.abilities.clearScene();g.abilities.cast('fireball',enemy,{target:g.player});g.enemies=[];g.tick(.1);assert.equal(g.abilities.effects.length,0,'removed casters clean transients');
}
{
 const g=fixture(),boss=g.enemy(100,'boss');for(let i=0;i<100;i++)g.abilities.cast('domain',boss,{target:g.player});
 assert.equal(g.abilities.effects.length,ABILITY_RULES.maxFieldsPerCaster,'persistent zones have per-caster caps');
 g.abilities.clearScene();for(let i=0;i<200;i++)g.abilities.cast('fireball',boss,{target:g.player});assert.equal(g.abilities.effects.length,ABILITY_RULES.maxHostileEffects,'hostile work is bounded');
 g.abilities.clearScene();g.abilities.cast('barrier',boss,{shield:50});assert.equal(g.abilities.absorbDamage(boss,30),0);assert.equal(g.abilities.absorbDamage(boss,30),10);
 g.abilities.cast('tidalWave',boss,{target:g.player,origin:{x:100,y:100}});assert.equal(g.abilities.effects[0].y,100,'explicit origins support wave gaps');
}
{
 const sections=structuredClone(getConfigSnapshot().sections);validateAbilities(sections);
 sections.abilities.definitions.domain.allowedActors=['player'];assert.throws(()=>validateAbilities(sections),/reserved/);
 sections.abilities.definitions.domain.allowedActors=['boss'];sections.abilities.definitions.fireball.shape='script';assert.throws(()=>validateAbilities(sections),/unknown/);
 assert.equal(ABILITY_DEFINITIONS.swordEnergy.family,'weapon');assert.equal(ABILITY_DEFINITIONS.fireball.family,'general');assert.equal(ABILITY_DEFINITIONS.domain.family,'exclusive');
 const g=fixture(),boss=g.enemy(100,'boss');for(const id of ['fireball','frostRing','flameStream','tidalWave','domain','vortex'])g.abilities.cast(id,boss,{target:g.player});
 boss.specialAttack={kind:'leap',phase:'windup',life:.4,maxLife:1,x:100,y:0,circles:[{x:0,y:0,r:60}],destination:{x:0,y:0}};boss.specialMarks=[{x:10,y:10,r:30,kind:'heat',delay:.4}];
 const context=new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
 drawAbilityGround(context,g,{visible:()=>true});g.tick(1);drawAbilityGround(context,g);drawAbilityProjectiles(context,g);
}
console.log('Shared abilities: impact/burn refresh, freeze immunity independent of damage, Boss/player control limits, faction permissions, locked warnings, walls, shield, caster/scene cleanup, capacity, schema and renderer smoke passed.');
