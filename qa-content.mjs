import assert from 'node:assert/strict';
import { Game, BALANCE } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Adventure } from './dist/adventure.js';

// Short, isolated behavior checks. Play balance is evaluated separately.
let seed=70261;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const openGround=()=>new Terrain({obstacles:[]});
function arena({terrain=openGround(),adventure=false}={}) {
  const g=new Game({terrain,adventure});
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  return g;
}
function advance(g,seconds,input={}) {
  for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);
}
function monster(g,type,x) {
  g._spawnEnemy(type);
  const e=g.enemies.at(-1);
  Object.assign(e,{x,y:groundOffset(g.player,true)-groundOffset(e),hp:10000,maxHp:10000,speed:0});
  return e;
}
function feetFree(g) {
  assert(g.terrain.isFree(g.player.x,g.player.y+groundOffset(g.player,true),g.player.r));
  for(const e of g.enemies)assert(g.terrain.isFree(e.x,e.y+groundOffset(e),e.r));
}
function preparedBoar({terrain=openGround()}={}) {
  const g=arena({terrain}),e=monster(g,'boar',-180);
  e.chargeCooldown=0;g.update(.025);
  assert.equal(e.charge?.phase,'windup','a nearby boar warns before rushing');
  return {g,e};
}
function preparedSpore() {
  const g=arena(),e=monster(g,'spore',-220);
  e.castCooldown=0;g.update(.025);
  assert(e.cast&&e.cast.life>0,'a ranged enemy winds up before firing');
  assert.equal(g.enemyBullets.length,0,'the ranged warning does not itself launch a shot');
  return {g,e};
}
function hostileShot(g,x,vx=140,{y=g.player.y+groundOffset(g.player,true),damage=13,r=6}={}) {
  const b={id:++g._id,type:'spore',x,y,r,vx,vy:0,life:4.5,maxLife:4.5,color:'#cfdc91',damage};
  g.enemyBullets.push(b);return b;
}

const charging=preparedBoar(),aim={dx:charging.e.charge.dx,dy:charging.e.charge.dy};
const frozenCharge=structuredClone(charging.e.charge),frozenTime=charging.g.time;
charging.g.status='upgrade';advance(charging.g,2);
assert.deepEqual(charging.e.charge,frozenCharge,'boar warnings freeze while choosing an upgrade');
assert.equal(charging.g.time,frozenTime);
charging.g.status='playing';charging.g.player.y+=120;
advance(charging.g,frozenCharge.life+.03);
assert.equal(charging.e.charge?.phase,'rush');
assert.deepEqual({dx:charging.e.charge.dx,dy:charging.e.charge.dy},aim,'the rush direction does not home in after the warning');

const wall=new Terrain({obstacles:[{id:'tree',type:'tree',x:-70,y:19.8,r:25}]}),blocked=preparedBoar({terrain:wall});
for(let i=0;i<100&&blocked.e.charge?.phase!=='stunned';i++) {blocked.g.update(.025);feetFree(blocked.g);}
assert.equal(blocked.e.charge?.phase,'stunned','hitting a tree interrupts the rush and stuns the boar');
assert(blocked.e.x<-70,'the boar cannot cross through the obstacle');
Object.assign(blocked.g.player,{x:blocked.e.x,y:blocked.e.y+groundOffset(blocked.e)-groundOffset(blocked.g.player,true),invuln:0});
const beforeStunContact=blocked.g.player.hp;blocked.g.update(.025);
assert.equal(blocked.g.player.hp,beforeStunContact,'a stunned boar does not immediately deal contact damage');

// Smaller collision circles isolate the sweep: both endpoints miss the player.
const crossing=arena(),crossingBoar=monster(crossing,'boar',-8);
crossing.player.r=1;crossingBoar.r=1;crossingBoar.y=groundOffset(crossing.player,true)-groundOffset(crossingBoar);
crossingBoar.charge={phase:'rush',life:.8,maxLife:.8,dx:1,dy:0,startX:-8,startY:19.8,length:256};
crossing.update(.05);
assert(crossingBoar.x>2,'the test rush crosses the player within one tick');
assert(crossing.player.hp<crossing.player.maxHp,'a rush hits along its swept path, even when neither endpoint overlaps');

const cancelledCharge=preparedBoar();
cancelledCharge.e.hp=100;cancelledCharge.e.charge.life=.001;
cancelledCharge.g.update(.025,{skill:true});
assert(cancelledCharge.e.hp<=0&&cancelledCharge.e.charge===null,'a same-frame kill cancels a ready boar attack');
assert.equal(cancelledCharge.g.player.hp,cancelledCharge.g.player.maxHp);

const casting=preparedSpore(),frozenCast=structuredClone(casting.e.cast);
casting.g.status='upgrade';advance(casting.g,2);
assert.deepEqual(casting.e.cast,frozenCast,'ranged windup freezes during an upgrade');
casting.g.status='playing';advance(casting.g,frozenCast.life+.03);
assert.equal(casting.g.enemyBullets.length,1,'one completed windup releases one slow shot');
const frozenBullet=structuredClone(casting.g.enemyBullets[0]);
casting.g.status='upgrade';advance(casting.g,2);
assert.deepEqual(casting.g.enemyBullets[0],frozenBullet,'enemy projectiles also freeze during an upgrade');

const cancelledCast=preparedSpore();
cancelledCast.e.hp=100;cancelledCast.e.cast.life=.001;
cancelledCast.g.update(.025,{skill:true});
assert(cancelledCast.e.hp<=0&&cancelledCast.e.cast===null,'a same-frame kill cancels ranged windup');
assert.equal(cancelledCast.g.enemyBullets.length,0,'a killed caster does not launch a delayed shot');

const sheltered=arena({terrain:new Terrain({obstacles:[{id:'cover',type:'rock',x:-50,y:19.8,r:20}]})});
hostileShot(sheltered,-100,5000);sheltered.update(.05);
assert.equal(sheltered.player.hp,sheltered.player.maxHp,'cover absorbs an incoming projectile before it reaches the player');
assert.equal(sheltered.enemyBullets.length,0,'a projectile hitting cover is consumed');feetFree(sheltered);
const exposed=arena({terrain:new Terrain({obstacles:[{id:'behind',type:'rock',x:70,y:19.8,r:20}]})});
hostileShot(exposed,-100,5000);exposed.update(.05);
assert(exposed.player.hp<exposed.player.maxHp,'a wall behind the player cannot retroactively prevent an earlier impact');

const repeated=arena();hostileShot(repeated,-25);hostileShot(repeated,-25);
repeated.update(.05);
assert.equal(repeated.player.hp,repeated.player.maxHp-13,'simultaneous shots respect the shared damage grace period');
assert.equal(repeated.enemyBullets.length,0,'both contacting shots are consumed, even when the second is resisted');
const afterShots=repeated.player.hp;advance(repeated,1);
assert.equal(repeated.player.hp,afterShots,'spent projectiles cannot hit the same player again');
const protectedPlayer=arena();protectedPlayer.player.invuln=1;
hostileShot(protectedPlayer,-25);protectedPlayer.update(.05);
assert.equal(protectedPlayer.player.hp,protectedPlayer.player.maxHp,'an existing invulnerability window protects against projectiles');
assert.equal(protectedPlayer.enemyBullets.length,0);

const volley=arena();
for(let i=0;i<80;i++) {
  const e=monster(volley,'spore',-250-(i%10)*4);
  e.cast={life:.001,maxLife:.65,angle:0};e.castCooldown=20;
}
volley.update(.025);
assert(volley.enemyBullets.length>0&&volley.enemyBullets.length<=BALANCE.maxEnemyBullets,'simultaneous ranged releases obey the projectile budget');
advance(volley,.1);
assert(volley.enemyBullets.length<=BALANCE.maxEnemyBullets);
for(const [type,roll,cap] of [['boar',.92,BALANCE.boarCap],['spore',.98,BALANCE.sporeCap]]) {
  const spawning=arena(),random=Math.random;spawning.time=70;
  try {
    Math.random=()=>roll;
    for(let i=0;i<16;i++) {spawning._spawn=0;spawning.update(.025);}
  } finally {Math.random=random;}
  assert.equal(spawning.enemies.filter(e=>e.type===type).length,cap,`natural spawning respects the ${type} population cap`);
}

function expedition({terrain=openGround()}={}) {
  const g=arena({terrain});g.adventure=new Adventure(g,{generation:false});
  return {g,a:g.adventure};
}
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const collect=(g,a,type,duration)=>{const p=foot(g),item=a.dropPickup(type,p.x,p.y,duration);assert(item);a.update(0);return item;};

const healing=expedition(),herb=collect(healing.g,healing.a,'herb');
assert.equal(healing.g.player.hp,healing.g.player.maxHp);
assert(healing.a.pickups.includes(herb),'a healing item is preserved when health is already full');
healing.g.player.hp-=7;healing.a.update(0);
assert.equal(healing.g.player.hp,healing.g.player.maxHp,'healing clamps to maximum health');
assert(!healing.a.pickups.includes(herb),'a used healing item is consumed once');
healing.g.player.hp=35;collect(healing.g,healing.a,'herb');
assert.equal(healing.g.player.hp,60,'a herb gives its normal healing amount when space is available');
healing.a.update(0);assert.equal(healing.g.player.hp,60,'the same herb cannot heal twice');

const attraction=expedition();
attraction.g.player.xpNext=Infinity;attraction.g.crystalsNext=Infinity;attraction.g.player.xp=11;attraction.g.crystals=11;
attraction.g.gems=[{x:220,y:0,r:5,value:7},{x:-270,y:20,r:5,value:9},{x:850,y:0,r:5,value:13}];
const crystalBudget=11+attraction.g.gems.reduce((sum,gem)=>sum+gem.value,0);
collect(attraction.g,attraction.a,'magnet');
assert.equal(attraction.g.player.xp,11,'the magnet does not manufacture experience on activation');
assert(attraction.g.gems.slice(0,2).every(gem=>gem.attracted));
assert(!attraction.g.gems[2].attracted,'the magnet does not pull the entire infinite map');
assert(attraction.a.magnetRange(attraction.g.stats.magnet)>attraction.g.stats.magnet);
advance(attraction.g,2);
assert(attraction.g.crystals>11,'existing nearby crystal drops actually arrive');assert.equal(attraction.g.player.xp,11,'pickup never awards character XP a second time');
assert.equal(attraction.g.crystals+attraction.g.gems.reduce((sum,gem)=>sum+gem.value,0),crystalBudget,'magnet collection conserves total crystals');
for(let i=0;i<5;i++)collect(attraction.g,attraction.a,'magnet');
assert(attraction.a.magnetTime<=attraction.a.buffDuration,'repeated magnets cannot accumulate unlimited duration');
advance(attraction.g,attraction.a.buffDuration+.05);
assert.equal(attraction.a.magnetRange(attraction.g.stats.magnet),attraction.g.stats.magnet,'the temporary pickup range expires');

const empowered=expedition(),baseDamage=empowered.g._damageMultiplier();
collect(empowered.g,empowered.a,'fury');
const boostedDamage=empowered.g._damageMultiplier(),boostedRate=empowered.a.fireRateMultiplier();
assert(boostedDamage>baseDamage&&boostedRate>1,'fury improves both damage and firing rate');
const duration=empowered.a.furyTime;
advance(empowered.g,3);
assert(empowered.a.furyTime>0&&empowered.a.furyTime<duration);
collect(empowered.g,empowered.a,'fury');
assert.equal(empowered.a.furyTime,duration,'a second pickup refreshes duration instead of adding it');
for(let i=0;i<12;i++)collect(empowered.g,empowered.a,'fury');
assert.equal(empowered.a.furyTime,duration,'repeated pickups cannot accumulate unlimited time');
assert.equal(empowered.g._damageMultiplier(),boostedDamage,'repeated pickups do not stack the damage multiplier');
const pausedBuff=empowered.a.furyTime;
empowered.g.status='upgrade';advance(empowered.g,2);empowered.a.update(.05);
assert.equal(empowered.a.furyTime,pausedBuff,'buff duration freezes during an upgrade');
empowered.g.status='playing';advance(empowered.g,duration+.05);
assert.equal(empowered.a.furyTime,0);assert.equal(empowered.g._damageMultiplier(),baseDamage);
assert.equal(empowered.a.fireRateMultiplier(),1,'the firing bonus ends with the buff');

const treasureRun=expedition(),chest=treasureRun.a.spawnTreasure(140,19.8);
assert(chest&&chest.state==='locked');
assert.equal(treasureRun.a.spawnTreasure(400,19.8),null,'only one guarded treasure can be active');
treasureRun.a.update(0);
assert.equal(chest.state,'active');
const guardian=treasureRun.g.enemies.find(e=>e.id===chest.guardianId);
assert(guardian?.elite&&guardian.guardianId===chest.id,'approaching treasure creates its matching elite guardian');
treasureRun.g.player.x=chest.x;treasureRun.a.update(0);
assert.equal(chest.state,'active','standing on a guarded chest cannot open it');
assert.equal(treasureRun.a.pickups.length,0);
treasureRun.a.onEnemyKilled({id:guardian.id+100,guardianId:chest.id,hp:0});
assert.equal(chest.state,'active','another monster death cannot unlock the chest');
treasureRun.a.onEnemyKilled(guardian);
assert.equal(chest.state,'active','a living guardian cannot be reported as defeated');
const beforeGuard={xp:treasureRun.g.player.xp,crystals:treasureRun.g.gems.reduce((sum,g)=>sum+g.value,0)};
treasureRun.g._hurtEnemy(guardian,guardian.hp+1);
assert.equal(chest.state,'unlocked','killing the associated elite unlocks its chest');
assert.equal(treasureRun.g.player.xp,beforeGuard.xp+30,'the guardian awards automatic kill XP');assert.equal(treasureRun.g.gems.reduce((sum,g)=>sum+g.value,0),beforeGuard.crystals+30,'guardian crystals remain a distinct pickup reward');
treasureRun.g.player.x=chest.x+120;treasureRun.a.update(0);
assert.equal(chest.state,'unlocked');assert.equal(treasureRun.a.pickups.length,0,'an unlocked chest must still be approached to claim its reward');
treasureRun.g.player.x=chest.x;treasureRun.a.update(0);
assert.equal(chest.state,'opened');assert.equal(treasureRun.a.pickups.length,3);
assert.equal(treasureRun.g.gold,18);assert.equal(treasureRun.g.crystals,35);const rewards=treasureRun.a.pickups.map(p=>p.id);
treasureRun.a.update(0);treasureRun.a.onEnemyKilled(guardian);treasureRun.a.update(0);
assert.deepEqual(treasureRun.a.pickups.map(p=>p.id),rewards,'an opened chest cannot produce another set of rewards');
assert.equal(treasureRun.g.events.filter(e=>e.type==='treasureOpened').length,1);assert.equal(treasureRun.g.gold,18);assert.equal(treasureRun.g.crystals,35);

const abandoned=expedition(),abandonedChest=abandoned.a.spawnTreasure(140,19.8);
abandoned.a.update(0);assert.equal(abandonedChest.state,'active');
const beforeAbandon={kills:abandoned.g.kills,xp:abandoned.g.player.xp};
abandoned.g.player.x=1600;abandoned.a.update(0);
assert.equal(abandoned.a.treasure,null);assert.equal(abandoned.a.pickups.length,0,'leaving the encounter cannot grant its reward');
assert(!abandoned.g.enemies.some(e=>e.guardianId===abandonedChest.id));
assert.deepEqual({kills:abandoned.g.kills,xp:abandoned.g.player.xp},beforeAbandon,'despawning an abandoned guard is not a kill');
const missingGuard=expedition();missingGuard.a.spawnTreasure(140,19.8);missingGuard.a.update(0);
missingGuard.g.enemies=[];missingGuard.a.update(0);
assert.equal(missingGuard.a.treasure,null);assert.equal(missingGuard.a.pickups.length,0,'a missing guard cancels the encounter instead of awarding a free chest');
const pausedAdventure=expedition();pausedAdventure.a.spawnTreasure(140,19.8);pausedAdventure.a.update(0);
pausedAdventure.a.dropPickup('herb',300,19.8);
const frozenAdventure={life:pausedAdventure.a.treasure.life,item:pausedAdventure.a.pickups[0].life,enemies:pausedAdventure.g.enemies.length};
pausedAdventure.g.status='upgrade';advance(pausedAdventure.g,2);pausedAdventure.a.update(.05);
assert.deepEqual({life:pausedAdventure.a.treasure.life,item:pausedAdventure.a.pickups[0].life,enemies:pausedAdventure.g.enemies.length},frozenAdventure,'treasure and pickup lifetimes freeze during upgrades');
const crowdedEncounter=expedition();
for(let i=0;i<180;i++)crowdedEncounter.g._spawnEnemy('slime');
const waitingChest=crowdedEncounter.a.spawnTreasure(140,19.8);crowdedEncounter.a.update(0);
assert.equal(waitingChest.state,'locked','a treasure waits for capacity before adding its guardian');
assert.equal(crowdedEncounter.g.enemies.length,180);
crowdedEncounter.g.enemies.pop();crowdedEncounter.a.update(0);
assert.equal(waitingChest.state,'active');assert.equal(crowdedEncounter.g.enemies.length,180);
crowdedEncounter.g.nextBossAt=0;crowdedEncounter.g.update(0);
assert(crowdedEncounter.g.enemies.length<=181,'a due Boss and an elite guardian cannot exceed the overall entity budget');

const supplies=expedition(),crate={id:'supply:test',type:'supply',x:100,y:19.8,r:18,aimY:7.8,sortY:19.8,hp:42,maxHp:42,hit:0,drop:'herb'};
supplies.a.props.push(crate);
assert.equal(supplies.a.nearestSupply(),crate);
supplies.a.hitSupply(crate,10);assert(crate.hp>0);assert.equal(supplies.a.pickups.length,0,'damaging a crate does not award its drop early');
supplies.a.hitSupply(crate.id,100);assert.equal(supplies.a.props.length,0);assert.equal(supplies.a.pickups.length,1);
assert.equal(supplies.a.hitSupply(crate,100),false);assert.equal(supplies.a.pickups.length,1,'a broken crate drops only once');
supplies.g.player.hp=40;supplies.a.update(0);
assert.equal(supplies.g.player.hp,40,'breaking a distant supply does not instantly grant its item');
const armed=expedition();armed.a.props.push({...crate,id:'supply:arrow',hp:42});
armed.g._shot=0;advance(armed.g,1.2);
assert.equal(armed.a.props.length,0,'normal auto-fired arrows can actually break a nearby supply');
assert.equal(armed.a.pickups.length,1,'breaking a supply through real weapon damage produces its item');

// Inventory and the consumed-location memory remain bounded while travelling.
const bounded=expedition({terrain:new Terrain()});
let original=null;
for(let x=1;x<12&&!original;x++)for(let y=1;y<12&&!original;y++) {
  const p=bounded.a._supplyAt(x,y);if(p)original={x,y,p};
}
assert(original,'there is a deterministic supply candidate for the revisit check');
bounded.a.props.push(original.p);bounded.a.hitSupply(original.p,100);
const memory=bounded.a._consumed.bits;
for(let i=0;i<400;i++) {
  const p={...crate,id:`supply:consumed-${i}`,x:i*3+200,y:200,hp:1};
  bounded.a.props.push(p);bounded.a.hitSupply(p,2);
}
assert.equal(bounded.a._supplyAt(original.x,original.y),null,'a broken procedural crate remains gone after other rewards are consumed');
assert.equal(bounded.a._consumed.bits,memory);assert(memory.byteLength<=65536,'consumed supply memory has a fixed space budget');
assert(bounded.a.pickups.length<=24,'dropping many rewards retains a bounded pickup list');
for(let i=0;i<70;i++) {
  bounded.g.player.x=i*1040;bounded.g.player.y=-i*520;
  bounded.a._refreshSupplies(true);
  assert(bounded.a.props.length<=18,'visible supply props stay within the budget');
  assert(bounded.g.terrain.cacheSize<=bounded.g.terrain.cacheLimit,'travelling with supplies keeps terrain caching bounded');
}

console.log('Content mechanics: special enemies, projectiles, guarded treasure, supplies, pickups and bounded state passed.');

