import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { portalDoor } from './dist/portal-geometry.js';
import { queueAttackKnockback, updateWeaponKnockback, clearWeaponKnockbackScene, weaponKnockbackDistance, WEAPON_KNOCKBACK, BOSS_KNOCKBACK } from './dist/weapon-knockback.js';

let seed=821839;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const standard=weaponKnockbackDistance();
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-6,`${message}: ${a} != ${b}`);
const place=(g,x,y)=>{g.player.x=x;g.player.y=y-groundOffset(g.player,true);};
function quiet(g){
  for(const id of ['sword','arrow','orbit'])g.build.setEquipped(id,false);
  g.player.xpNext=g.crystalsNext=g._spawn=g.nextBossAt=Infinity;
  g._shot=g._pulse=g._lightning=Infinity;g.regionGrace=0;
  return g;
}
function arena(obstacles=[]){
  const g=quiet(new Game({terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false}));
  g.enemies=[];place(g,0,0);return g;
}
function boss(g,x=160,r=44){
  const e=g._spawnEnemy('boss');Object.assign(e,{x,y:-groundOffset(e),r,hp:10000,maxHp:10000,speed:0,xp:0,slamCooldown:Infinity});
  e.y=-groundOffset(e);g._rebuildGrid();return e;
}
function finish(g,e){for(let frame=0;frame<4;frame++)updateWeaponKnockback(g,e,.04);}
function hit(g,e,source='sword',distance=standard){return g._hitEnemy(e,10,distance,{x:e.x-100,y:e.y,knockbackX:1,knockbackY:0},source);}

// All ordinary weapon sources use the full standard, irrespective of boss size.
for(const radius of [32,52,100])for(const source of ['sword','arrow','orbit']){
  const g=arena(),e=boss(g,160,radius);assert.equal(hit(g,e,source),10);finish(g,e);
  close(e.x,160+standard,`${source} keeps the complete standard for radius ${radius}`);
  assert.equal(e.hp,9990);
}
assert.equal(BOSS_KNOCKBACK.minimumInterval,2);
const shared=arena(),a=boss(shared),b=boss(shared,360);
hit(shared,a);finish(shared,a);const firstX=a.x;
for(const [time,source] of [[.25,'arrow'],[.5,'orbit'],[1,'sword'],[1.999,'pulse']]){
  shared._clock=time;assert.equal(hit(shared,a,source),source==='pulse'?12.5:10);finish(shared,a);
  close(a.x,firstX,'all sources share one boss allowance');
}
assert.equal(a.hp,9947.5,'the two-second push limit never suppresses damage or the existing bleed reaction');
assert.equal(a._weaponPush.lastAt,0,'blocked sources do not postpone the cooldown');
assert.equal(hit(shared,b,'orbit'),10);finish(shared,b);close(b.x,360+standard,'each boss owns its own allowance');
shared._clock=2;hit(shared,a,'arrow');finish(shared,a);close(a.x,firstX+standard,'the next push is full strength at exactly two seconds');
shared._clock=4;hit(shared,a,'pulse',48);finish(shared,a);close(a.x,firstX+standard+48,'an explicitly special distance remains supported');

// Existing rush motion and a future forced-motion opt-out suppress only displacement.
for(const lock of ['charge','swift','explicit']){
  const g=arena(),e=boss(g);
  if(lock==='charge')e.charge={phase:'rush',life:.5};
  else if(lock==='swift')e.affix={id:'swift',phase:'rush',life:.5};
  else e.knockbackImmune=true;
  assert.equal(hit(g,e),10);assert.equal(e._weaponPush,undefined,`${lock} does not spend the budget`);finish(g,e);assert.equal(e.x,160);
  e.charge=null;e.affix=null;e.knockbackImmune=false;
  assert.equal(hit(g,e),10);finish(g,e);close(e.x,160+standard,`${lock} ends without an extra cooldown`);
}
const interrupt=arena(),forced=boss(interrupt);hit(interrupt,forced);updateWeaponKnockback(interrupt,forced,.04);
const interruptedX=forced.x;forced.knockbackImmune=true;finish(interrupt,forced);forced.knockbackImmune=false;finish(interrupt,forced);
close(forced.x,interruptedX,'a forced action cancels residual push instead of resuming it later');

// An already marked attack keeps its aim and clock while ordinary body motion reacts.
for(const kind of ['ancient','bloom']){
  const g=arena(),e=boss(g);g._initializeRegionalBoss(e,kind);
  const attack=kind==='ancient'?{x:e.x,y:0,r:140,life:.6,maxLife:.6}:{kind:'fan',x:e.x,y:0,angle:.8,spread:1.2,life:.6,maxLife:.6};
  e[kind==='ancient'?'slam':'bloomAttack']=attack;e.attackCooldown=1;
  hit(g,e);g.update(.04);
  assert(e.x>160&&e.x<160+standard);close(attack.life,.56,`${kind} cast continues during displacement`);
  assert.equal(attack.x,160,`${kind} announced ground origin stays fixed`);assert.equal(attack.y,0);
  close(e.attackCooldown,.96,`${kind} contact clock continues`);
  assert.equal(e[kind==='ancient'?'slam':'bloomAttack'],attack,'hit does not replace or reset the attack');
}

// The same terrain-aware integration protects large bodies from walls.
const wall={id:'boss-wall',type:'log',heightBand:'high',x:200,y:0,r:10,halfLength:160,angle:Math.PI/2};
const blocked=arena([wall]),atWall=boss(blocked,145,40);hit(blocked,atWall);finish(blocked,atWall);
assert(atWall.x>145&&atWall.x<145+standard,'collision shortens a blocked push');
assert(blocked.terrain.isFree(atWall.x,atWall.y+groundOffset(atWall),atWall.r),'boss stays on the walkable side');

const paused=arena(),frozen=boss(paused);hit(paused,frozen);paused.status='paused';finish(paused,frozen);assert.equal(frozen.x,160);
paused.status='playing';clearWeaponKnockbackScene(paused);finish(paused,frozen);assert.equal(frozen.x,160);assert.equal(frozen._weaponPush,null);
assert(queueAttackKnockback(paused,frozen,standard,{x:0,y:frozen.y},'sword'),'scene changes discard a stale cooldown');
frozen.hp=0;finish(paused,frozen);assert.equal(frozen._weaponPush,null);

// Exercise real guardian ownership, awakening, castle walls and core-island flow.
function actualBossMotion(g,e,label){
  quiet(g);const footY=e.y+groundOffset(e);place(g,e.x-100,footY);
  if(g.dungeon.active)g.dungeon.update(0);
  const before=e.x,hp=e.hp;assert.equal(hit(g,e),10,`${label} accepts the real damage path`);
  assert.equal(e.guardActive,true,`${label} awakens normally`);
  e.speed=0;e.slamCooldown=e.bloomCooldown=Infinity;
  for(let frame=0;frame<4;frame++)g.update(.04);
  close(e.x,before+standard,`${label} moves through the real Game update`);
  close(e.hp,hp-10,`${label} damage is independent of displacement`);
}
const regional=new Game({debug:true,debugWorld:'beach'});actualBossMotion(regional,regional.enemies.find(e=>e.portalId),'regional guardian');
const stage=new Game({stageId:'forest-trial'});actualBossMotion(stage,stage.enemies.find(e=>e.stageBossRole==='optional'),'outer-island boss');
const portal=stage.regions.portals[0],door=portalDoor(portal);place(stage,door.x,door.y);
assert(stage.requestInteraction(portal.id));for(let frame=0;frame<32&&stage.sceneTransition.active;frame++)stage.update(.025);
assert.equal(stage.mapId,'forest-heart');actualBossMotion(stage,stage.enemies.find(e=>e.stageBossRole==='core'),'core-island boss');
const castle=arena();assert(castle.dungeon.enter({id:'boss-knockback-castle',door:{x:0,y:0}}));
actualBossMotion(castle,castle.enemies.find(e=>e.dungeonBoss),'castle boss');
assert.equal(WEAPON_KNOCKBACK.duration,.16,'boss uses the ordinary short displacement animation');
console.log('Boss knockback: full size-independent distance, shared 2-second allowance, damage, cast clocks, forced-motion immunity, collision, scene cleanup and real regional/stage/castle updates passed.');
