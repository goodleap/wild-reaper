import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
let seed=957131;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const vertical={id:'cross-wall',type:'log',structureType:'castle-wall',x:85,y:0,r:12,halfLength:280,angle:Math.PI/2};
const horizontal={id:'near-wall',type:'log',structureType:'castle-wall',x:0,y:0,r:14,halfLength:400,angle:0};
function arena(wall=vertical){
 const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});g.enemies=[];
 assert(g.dungeon.enter({id:'combat-castle',door:{x:0,y:19.8}}));
 g.terrain=new Terrain({obstacles:[wall]});g.dungeon.active.terrain=g.terrain;g.enemies=[];g.gems=[];g.coins=[];g.effects=[];g.events=[];g.bullets=[];g.player.x=0;g.player.y=0;g._shot=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
 return g;
}
function enemy(g,x,y=0,type='slime'){const e=g._spawnEnemy(type);Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000,dungeonId:g.dungeon.active.id,guardActive:true});return e;}
function advance(g,t){for(let left=t;left>1e-8;left-=.025)g.update(Math.min(left,.025));}
const plain=arena(),blocked=enemy(plain,145),sameSide=enemy(plain,40);
// Both actors occupy the same maze cell and remain awake. This deliberately
// bypasses the simpler inactive-guard rejection and exercises actual wall rays.
plain.dungeon.updateEnemy(blocked,0);assert.equal(blocked.guardActive,true);
assert.equal(plain.dungeon.canDamage(blocked,{x:0,y:19.8}),false,'a plain ground origin cannot become NaN and bypass the wall');
assert.equal(plain.dungeon.canDamage(sameSide,{x:0,y:19.8}),true,'valid ground origins still reach same-side enemies');
assert.equal(plain._hurtEnemy(blocked,90,0,{x:0,y:19.8},'super'),0);assert.equal(blocked.hp,10000);
for(const source of ['pulse','echo','companionPulse','companionEcho','lightning','companionLightning'])assert.equal(plain._hitEnemy(blocked,90,0,{x:0,y:19.8},source),0,`${source} obeys actual wall geometry for ground origins`);
const explicit=arena(horizontal),above=enemy(explicit,100,-54),below=enemy(explicit,100,26);
assert.equal(explicit.dungeon.canDamage(above,{x:0,y:-50,groundY:40}),false,'groundY controls geometry independently of decorative body coordinates');
assert.equal(explicit.dungeon.canDamage(below,{x:0,y:-50,groundY:40}),true);

for(const echo of [false,true]){const g=arena(),near=enemy(g,45),far=enemy(g,135);g._castPulse(0,0,180,90,0,echo);assert(near.hp<10000);assert.equal(far.hp,10000,`${echo?'echo':'pulse'} cannot cross a solid wall despite its overlapping attack radius`);assert.equal(far.guardActive,true);}
const delayed=arena();const echoNear=enemy(delayed,45),echoFar=enemy(delayed,135);delayed.levels.pulse=5;delayed.branches.pulse='echoes';delayed._pulse=0;delayed.update(0);const firstHp=echoNear.hp;assert(firstHp<10000);assert.equal(echoFar.hp,10000);advance(delayed,.375);assert(echoNear.hp<firstHp,'the same-side delayed wave still works');assert.equal(echoFar.hp,10000,'the queued original-location echo also checks castle walls');
const chain=arena();const chainNear=enemy(chain,45),chainFar=enemy(chain,135);chain.levels.lightning=5;chain.branches.lightning='chain';chain._lightning=0;chain.update(0);assert(chainNear.hp<10000);assert.equal(chainFar.hp,10000);assert.equal(chain.effects.filter(e=>e.type==='lightning').length,1,'the chain ends when the next nearby target is behind a wall');
const conducted=arena(),charged=enemy(conducted,45),receiver=enemy(conducted,135);conducted._hitEnemy(charged,1,0,conducted.player,'lightning');assert(charged.shock);conducted._hitEnemy(charged,1,0,conducted.player,'arrow');assert.equal(charged.shock,null);assert.equal(receiver.hp,10000,'a real consumed shock cannot conduct through a wall');assert(!conducted.effects.some(e=>e.type==='conduction'));
const conductionWorks=arena(),marked=enemy(conductionWorks,35),reachable=enemy(conductionWorks,62);conductionWorks._hitEnemy(marked,1,0,conductionWorks.player,'lightning');conductionWorks._hitEnemy(marked,1,0,conductionWorks.player,'arrow');assert(reachable.hp<10000,'same-side conduction remains functional');

const grazing=arena(horizontal);grazing.player.y=31-groundOffset(grazing.player,true);const arrowTarget=enemy(grazing,160,31-14);
assert(grazing.terrain.isFree(grazing.player.x,31,grazing.player.r));assert(grazing.terrain.isFree(arrowTarget.x,31,arrowTarget.r));
grazing._shot=0;grazing.update(0);grazing._shot=Infinity;assert.equal(grazing.bullets.length,1);const arrow=grazing.bullets[0];grazing.update(.025);assert(grazing.bullets.includes(arrow)&&arrow.x>0&&arrow.life>0,'a same-side arrow fired beside a horizontal wall uses its projected foot path and does not self-destruct');advance(grazing,.3);assert(arrowTarget.hp<10000,'the grazing arrow reaches its same-side target');
const stopped=arena(),beyond=enemy(stopped,150);stopped.bullets.push({x:0,y:0,r:4,vx:640,vy:0,life:1,damage:32,pierce:1,hitIds:new Set()});advance(stopped,.3);assert.equal(beyond.hp,10000);assert.equal(stopped.bullets.length,0,'projected arrow sweeps still stop at an intervening wall');
console.log('Castle combat boundaries: awake target occlusion, ground/body origins, real pulse/echo/chain/conduction paths and near-wall projectile travel passed.');
