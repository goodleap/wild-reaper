import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { skillStats } from './dist/combat-stats.js';

function fixture(){
  const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,companions:false,settlements:false});
  game.enemies=[];game._spawn=Infinity;game.nextBossAt=Infinity;
  game.player.x=0;game.player.y=0;
  const target=game._spawnEnemy('slime');Object.assign(target,{x:180,y:0,hp:10000,maxHp:10000,speed:0,trainingDummy:true,defense:0});
  game._rebuildGrid();return {game,target};
}
for(const id of ['fireball','frostbolt']){
  const {game:g,target}=fixture();g.levels[id]=5;g._refreshStats();g._refreshWeapons();g._abilityCooldowns[id]=0;
  const stats=skillStats(g,id);g.update(.05,{});
  const effect=g.abilities.effects.find(e=>e.abilityId===id);
  assert(effect,'owned general skill is automatically cast by the real update loop');
  assert.equal(effect.parameters.damage,stats.damage,'resolved hero damage is scaled once');
  assert.equal(effect.parameters.radius,stats.radius);
  for(let i=0;i<16;i++)g.update(.05,{});
  assert(target.hp<target.maxHp,'projectile reaches and damages the target');
  const status=g.abilities.statusFor(target);status.frozenUntil=g.abilities.clock+1;
  target.trainingDummy=false;target.speed=150;const before={x:target.x,y:target.y};
  g.update(.05,{});assert.equal(target.x,before.x);assert.equal(target.y,before.y);
  const hp=target.hp;g._hitEnemy(target,10,0,g.player,'frostbolt');assert(target.hp<hp,'frozen targets still receive independent damage');
  g.dungeon._clearScene();assert.equal(g.abilities.effects.length,0);assert.equal(g.abilities.statuses.size,0);
}
{
  const {game:g,target}=fixture();g.abilities.cast('barrier',g.player,{shield:1000});
  const hp=g.player.hp;g._hurtPlayer(20);assert.equal(g.player.hp,hp,'new shared barrier uses ordinary incoming damage resolver');
  g.player.invuln=0;
  g.abilities.cast('barrier',target,{shield:1000});const enemyHp=target.hp;
  g._hitEnemy(target,20,0,g.player,'fireball');assert.equal(target.hp,enemyHp,'enemy barrier shares the same hit resolver');
}
console.log('v86 engine integration: automatic skill cadence, single scaling, real projectile hits, frozen movement with continued damage, shields and interior scene cleanup passed.');
