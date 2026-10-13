import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { friendlyTargets, friendlyFoot, selectFriendlyTarget, damageFriendly } from './dist/friendly-combat.js';
import { resolveBloomBoss } from './dist/bosses.js';
const wall={id:'army-wall',type:'log',structureType:'castle-wall',x:60,y:0,r:9,halfLength:260,angle:Math.PI/2};
function arena(obstacles=[]){
  const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  game.terrain=new Terrain({obstacles});game.enemies=[];game.enemyBullets=[];game.effects=[];
  game.player.x=240;game.player.y=-groundOffset(game.player,true);game.player.invuln=0;
  game.player.xpNext=Infinity;game.crystalsNext=Infinity;game._spawn=Infinity;game.nextBossAt=Infinity;
  game.build.setEquipped('sword',false);game._shot=Infinity;game._pulse=Infinity;game._lightning=Infinity;
  game.companions.members=[];
  // Damage routing is tested independently of companion defenses/recovery,
  // which the manager's integration checks cover with its actual catalog.
  game.companions.takeDamage=(member,amount)=>{if(member.invuln>0)return false;member.hp-=amount;member.invuln=.5;return true;};
  game.companions.protectionMultiplier=()=>1;
  return game;
}
function ally(game,x,y=0,{flying=false}={}){
  const member={id:1000+game.companions.members.length,kind:flying?'owl':'warden',isCompanion:true,heroId:'warden',r:14,groundOffset:flying?22:19.8,x,y:y-(flying?22:19.8),hp:200,maxHp:200,invuln:0,state:'active',flying};
  game.companions.members.push(member);return member;
}
function enemy(game,x=0,y=0,type='slime'){
  const member=game._spawnEnemy(type);Object.assign(member,{x,y:y-groundOffset(member),speed:80,hp:10000,maxHp:10000,guardActive:true,damage:20});return member;
}
const plain=arena(),pursuer=enemy(plain);
assert.equal(selectFriendlyTarget(plain,pursuer),plain.player,'no-party pursuit preserves hero target');
const near=ally(plain,40);assert.equal(groundOffset(near),19.8);assert.equal(friendlyTargets(plain).length,2);
assert.equal(selectFriendlyTarget(plain,pursuer),near,'closer reachable ally draws pursuit');
near.x=90;plain.player.x=10;
assert.equal(selectFriendlyTarget(plain,pursuer),near,'brief target cache avoids frame-by-frame switching');
plain._clock=.3;assert.equal(selectFriendlyTarget(plain,pursuer),plain.player,'coarse retarget follows changed threat positions');
near.state='recovering';plain.player.x=240;plain._clock=.6;
assert.equal(selectFriendlyTarget(plain,pursuer),plain.player,'downed allies cannot be targets');
near.state='active';plain.companions.members=[];
assert.equal(selectFriendlyTarget(plain,pursuer),plain.player,'dismissal immediately invalidates cached target');

const covered=arena([wall]),coveredEnemy=enemy(covered),hidden=ally(covered,110);covered.player.x=-220;
assert.equal(selectFriendlyTarget(covered,coveredEnemy),covered.player,'high walls prevent ally aggro even when ally is closer');
const castle=arena(),guard=enemy(castle),unseen=ally(castle,40);guard.dungeonId='closed-room';castle.dungeon.canDamage=()=>false;
assert.equal(selectFriendlyTarget(castle,guard),castle.player,'unexplored castle room cannot be awakened via ally target acquisition');

const airborne=arena(),crawler=enemy(airborne),owl=ally(airborne,35,0,{flying:true});
assert.equal(selectFriendlyTarget(airborne,crawler),airborne.player,'ground melee does not chase the flying scout');
const spore=enemy(airborne,0,0,'spore');assert.equal(selectFriendlyTarget(airborne,spore),owl,'ranged enemy can target flying scout');
spore.castCooldown=0;airborne._updateSpore(spore,0);assert(spore.cast,'spore targets nearby owl');

const projectile=arena(),shieldmate=ally(projectile,55);projectile.enemyBullets=[{x:0,y:0,r:6,vx:200,vy:0,life:2,damage:23}];
projectile._resolveEnemyAttacks(.5);
assert.equal(shieldmate.hp,177);assert.equal(projectile.player.hp,projectile.player.maxHp);assert.equal(projectile.enemyBullets.length,0,'first friendly body consumes enemy projectile');
const stopped=arena([wall]),safe=ally(stopped,110);stopped.enemyBullets=[{x:0,y:0,r:6,vx:300,vy:0,life:2,damage:23}];
stopped._resolveEnemyAttacks(.5);assert.equal(safe.hp,200,'terrain before companion stops projectile');

const rush=arena(),ram=enemy(rush,110,0,'boar'),victim=ally(rush,55),bird=ally(rush,55,0,{flying:true});
ram._chargeSegment={x:0,y:0,x2:110,y2:0};rush._resolveEnemyAttacks(.05);
assert.equal(victim.hp,174);assert.equal(bird.hp,200,'charge is ground-only');
const slam=arena(),boss=enemy(slam,0,0,'boss'),grounded=ally(slam,60),flyer=ally(slam,55,0,{flying:true});
boss.slam={x:0,y:0,r:115,life:0};slam._resolveBossSlams();assert.equal(grounded.hp,174);assert.equal(flyer.hp,200);
const bloom=arena(),bloomBoss=enemy(bloom,0,0,'boss'),bloomVictim=ally(bloom,60);Object.assign(bloomBoss,{bossKind:'bloom',bloomAttack:{kind:'burst',life:0,circles:[{x:60,y:0,r:52},{x:61,y:0,r:52}]}});
resolveBloomBoss(bloom,bloomBoss);assert.equal(bloomVictim.hp,183,'overlapping bloom eruption damages each ally only once');

const protectedHero=arena();protectedHero.companions.protectionMultiplier=()=>.75;
assert(damageFriendly(protectedHero,protectedHero.player,20));assert.equal(protectedHero.player.hp,protectedHero.player.maxHp-15,'warden mitigation applies exactly once to player');
const custom={x:10,y:4,r:14,isCompanion:true,groundOffset:12};assert.deepEqual(friendlyFoot(custom),{x:10,y:16},'natural-size companions use their own foot anchor');
const pursuit=arena(),hunter=enemy(pursuit),rearAlly=ally(pursuit,-50);pursuit._moveEnemy(hunter,.05);
assert(hunter.x<0,'actual terrain navigation moves toward selected companion instead of hero');
const contact=arena(),biter=enemy(contact,60),tank=ally(contact,61);biter.speed=0;
contact.companions.update=()=>{};contact.companions.resolve=()=>{};contact.update(0);
assert.equal(tank.hp,180,'ordinary enemy contact is routed to companion damage');
assert.equal(contact.player.hp,contact.player.maxHp);
console.log('Army combat: bounded retargeting, no-party pursuit, wall/room isolation, flight rules, first-impact bullets, charge/slam/burst damage and hero protection passed.');
