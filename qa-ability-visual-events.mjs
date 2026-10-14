import assert from 'node:assert/strict';
import { AbilityRuntime } from './dist/ability-runtime.js';

function fixture(){
  const player={x:0,y:0,groundOffset:0,r:10,hp:1000,heroId:'traveler'};
  const g={player,enemies:[],status:'playing',companions:{members:[]},_inView:()=>true,_effect:()=>{},
    _hitEnemy(target,damage){target.hp-=damage;return damage;},_hurtPlayer(damage){if(this.invulnerable)return false;player.hp-=damage;return true;}};
  g.combat={canTarget:target=>target.hp>0,clearPath:()=>!g.blocked};
  g.abilities=new AbilityRuntime(g);
  g.enemy=(x=200,bossKind)=>{const e={id:g.enemies.length+1,type:bossKind?'boss':'slime',bossKind,x,y:20,groundOffset:9,r:15,hp:1000};g.enemies.push(e);return e;};
  return g;
}

{
  const g=fixture(),boss=g.enemy(200,'broodmother');
  assert(g.abilities.cast('domain',boss,{target:g.player}));
  const effect=g.abilities.effects[0],pose=boss._visualCast;
  assert.equal(effect.visualVariant,'web');assert.equal(effect.x,g.player.x);
  assert.equal(effect.sourceX,boss.x);assert.equal(effect.sourceY,boss.y);assert.equal(effect.sourceGroundOffset,9);
  assert.equal(effect.casterKind,'broodmother');assert.equal(pose.phase,'windup');
  g.abilities.statusFor(boss).frozenUntil=1;
  g.abilities.update(.4);assert.equal(effect.age,0);assert.equal(pose.age,0,'frozen windup preserves the same pose');
  g.status='paused';g.abilities.update(2);assert.equal(effect.age,0);assert.equal(pose.age,0);
  g.status='playing';g.abilities.update(.7);assert.equal(pose.age,effect.age);assert.equal(pose.phase,'windup');
  boss.guardActive=false;g.abilities.update(.1);assert.equal(boss._visualCast,undefined);assert.equal(g.abilities.visualCasts.size,0);
}

{
  const g=fixture(),boss=g.enemy(600,'frostcrown');
  for(const angle of [-.2,0,.2])assert(g.abilities.cast('frostbolt',boss,{target:g.player,angle,windup:.3,speed:1,duration:4}));
  const pose=boss._visualCast;
  assert.equal(g.abilities.visualCasts.size,1);assert(Math.abs(pose.angle)<1e-10,'fan shares a centered body action');
  g.abilities.update(.35);assert.equal(pose.phase,'active');
  g.abilities.update(.18);assert.equal(pose.phase,'recovery');
  g.abilities.update(.22);assert.equal(boss._visualCast,undefined,'body release finishes before projectile flight');
  assert.equal(g.abilities.effects.length,3,'presentation lifecycle does not expire projectiles');
}

{
  const g=fixture(),enemy=g.enemy(80);
  g.abilities.cast('fireball',g.player,{target:enemy,damage:40,burnDamage:0,speed:500});
  g.abilities.update(.2);
  assert.equal(enemy.hp,960);assert.equal(g.abilities.visualBursts.length,1);
  const burst=g.abilities.visualBursts[0];assert.equal(burst.kind,'hit');assert.equal(burst.age,0);assert.equal(burst.life,.32);assert.equal(burst.groundOffset,9);
  g.status='paused';g.abilities.update(2);assert.equal(burst.age,0,'paused impacts do not age');
  g.status='playing';g.abilities.update(.33);assert.equal(g.abilities.visualBursts.length,0);
  g.abilities.cast('fireball',g.player,{target:enemy,damage:40,burnDamage:0,speed:500});g.blocked=true;g.abilities.update(.2);
  assert.equal(enemy.hp,960);assert.equal(g.abilities.visualBursts.length,0,'blocked projectile cannot manufacture a health impact');
}

{
  const g=fixture(),boss=g.enemy(200,'furnace');
  assert(g.abilities.cast('meteor',boss,{point:{x:1000,y:1000},range:1000})===false);
  assert(g.abilities.cast('meteor',boss,{point:{x:400,y:400},windup:.3}));
  g.abilities.update(.3);assert.equal(g.abilities.visualBursts.length,0);
  g.abilities.update(.01);assert.equal(g.abilities.visualBursts.length,1,'zone landing exists even at an exact windup boundary and without targets');
  assert.equal(g.abilities.visualBursts[0].kind,'landing');assert.equal(g.abilities.visualBursts[0].radius,90);
  g.abilities.update(.05);assert.equal(g.abilities.visualBursts.length,1,'landing is emitted once');
  const effect=g.abilities.effects[0];
  for(let i=0;i<130;i++)g.abilities.visualBurst(effect,g.player);
  assert.equal(g.abilities.visualBursts.length,96,'impact presentation has a fixed capacity');
  g.abilities.clearScene();assert.equal(g.abilities.visualBursts.length,0);assert.equal(g.abilities.visualCasts.size,0);assert.equal(boss._visualCast,undefined);
}

{
  const g=fixture(),boss=g.enemy(200,'deepcaller');
  g.abilities.cast('vortex',boss,{target:g.player,windup:.3,duration:2});
  g.abilities.update(.4);g.abilities.update(.7);
  assert.equal(boss._visualCast.phase,'active');assert.equal(boss._visualCast.activeDuration,2,'deepcaller channels for the real vortex duration');
  g.abilities.statusFor(boss).frozenUntil=10;
  g.abilities.update(1.3);assert.equal(boss._visualCast.phase,'recovery');
  g.abilities.update(.25);assert.equal(boss._visualCast,undefined,'already released effects and follow-through expire during freeze');
}

{
  const g=fixture(),boss=g.enemy(200,'furnace');
  g.abilities.cast('barrier',boss,{shield:20,duration:.05});
  const status=g.abilities.statuses.get(boss);assert.equal(status.shieldHitAt,-Infinity);
  assert.equal(g.abilities.absorbDamage(boss,30,{x:200,y:120}),10);
  assert.equal(status.shieldHitAt,0);assert.equal(status.shieldHitAngle,Math.PI/2);assert.equal(status.shield,0);
  g.abilities.update(.1);assert.equal(g.abilities.statuses.get(boss),status,'depleted expired shield retains its break flash');
  g.abilities.update(.13);assert.equal(g.abilities.statuses.has(boss),false,'break flash does not retain a stale status');
}

{
  const g=fixture(),enemy=g.enemy(80);
  g.abilities.applyStatus(enemy,{freezeChance:1,freezeDuration:.05,freezeImmunity:1},{caster:g.player,hostile:false});
  assert(g.abilities.isFrozen(enemy));g.abilities.update(.06);
  assert(!g.abilities.isFrozen(enemy));assert.equal(g.abilities.visualBursts.filter(b=>b.abilityId==='iceThaw').length,1);
  g.abilities.update(.02);assert.equal(g.abilities.visualBursts.filter(b=>b.abilityId==='iceThaw').length,1,'one thaw never emits repeated shards');
}

console.log('Ability presentation events: source identity, web variant, frozen/paused cast lifecycle, fan poses, short follow-through, true impacts, thaw, bounded scene cleanup and directional shield break passed.');
