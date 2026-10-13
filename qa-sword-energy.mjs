import assert from 'node:assert/strict';
import { CombatBuild } from './dist/combat-build.js';
import { canTakeUpgrade, getUpgradeDefinition } from './dist/combat-catalog.js';
import { weaponStats, skillStats } from './dist/combat-stats.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { SWORD_ENERGY_RULES, swordEnergyContact } from './dist/sword-combat.js';

function arena() {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g._spawn=Infinity;g.nextBossAt=Infinity;return g;
}
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-8,`${message}: ${a} / ${b}`);
const fresh=arena(),base=weaponStats(fresh,'sword');
assert.equal(base.energyRank,0);assert.equal(base.range,92);assert.equal(base.range,base.meleeRange);
assert.equal(base.baseDamage,64);assert.equal(base.interval,.72);
assert.equal(canTakeUpgrade(fresh.build,'swordEnergy'),false);
assert.equal(fresh.build.increment('swordEnergy'),false);
assert.equal(fresh.getUpgradeChoices().some(c=>c.id==='swordEnergy'),false);
assert(fresh.build.increment('sword'));
assert.equal(canTakeUpgrade(fresh.build,'swordEnergy'),false);
assert(fresh.build.increment('sword'));
assert.equal(canTakeUpgrade(fresh.build,'swordEnergy'),true);

const definition=getUpgradeDefinition('swordEnergy');
assert.equal(definition.category,'weapon');assert.equal(definition.ownerId,'sword');
const before=fresh.build.serialize(),projected=fresh.build.previewUpgrade('swordEnergy');
assert.deepEqual(fresh.build.serialize(),before,'preview must not mutate the current build');
assert.equal(projected.getRank('swordEnergy'),1);
assert.equal(projected.getWeapon('sword').baseRank,3);
assert.equal(projected.getSkill('swordEnergy'),null);

// The purchase uses the normal crystal transaction and retains one modifier
// investment under its weapon, rather than granting a second independent skill.
fresh._choices=[{...definition}];fresh.status='upgrade';fresh.crystals=fresh.crystalsNext;
assert(fresh.chooseUpgrade('swordEnergy'));assert.equal(fresh.crystals,0);
assert.equal(fresh.build.getRank('swordEnergy'),1);
assert.equal(fresh.build.getWeapon('sword').level,4);
assert(fresh.build.getWeaponLoadout().find(w=>w.id==='sword').enhancements.some(e=>e.id==='swordEnergy'));
assert.equal(fresh.build.getSkillLoadout().some(s=>s.id==='swordEnergy'),false);

assert(fresh.build.increment('arrow'));assert(fresh.build.increment('pulse'));
const arrow=weaponStats(fresh,'arrow'),pulse=skillStats(fresh,'pulse'),storm=skillStats(fresh,'storm');
for(const [index,range,bonus] of [[1,60,.08],[2,80,.14],[3,100,.20]]) {
  if(index>1)assert(fresh.build.increment('swordEnergy'));
  const s=weaponStats(fresh,'sword');
  assert.equal(s.energyRank,index);assert.equal(s.range,s.meleeRange+range);
  assert.equal(s.energyCount,index===1?2:3);close(s.energyDamage,s.damage*.8,'flying energy damage');
  close(s.baseDamage,84*(1+bonus),'sword-only energy bonus');
  assert.deepEqual(weaponStats(fresh,'arrow'),arrow);
  assert.deepEqual(skillStats(fresh,'pulse'),pulse);
  assert.deepEqual(skillStats(fresh,'storm'),storm);
}
assert.equal(fresh.build.increment('swordEnergy'),false);
const saved=fresh.build.serialize();
assert.deepEqual(CombatBuild.fromSnapshot(saved).serialize(),saved);
const old=structuredClone(saved);delete old.weapons.sword.modifiers.swordEnergy;
assert.equal(CombatBuild.fromSnapshot(old).getRank('swordEnergy'),0,'v55 builds load without granting energy');
const impossible=new CombatBuild().serialize();impossible.weapons.sword.modifiers.swordEnergy=1;
assert.throws(()=>CombatBuild.fromSnapshot(impossible),/Unavailable combat build modifier: swordEnergy/);

assert(fresh.build.setEquipped('sword',false));
assert.equal(weaponStats(fresh,'sword').equipped,false);
assert.equal(fresh.build.getRank('swordEnergy'),3);
assert(fresh.build.setEquipped('sword',true));
assert.equal(weaponStats(fresh,'sword').energyRank,3);

for(const branch of ['sweep','heavy']) {
  const g=arena();for(let i=0;i<3;i++)assert(g.build.increment('sword'));
  assert(g.build.selectBranch('sword',branch));
  g._syncEvolutions(false);
  const ordinary=weaponStats(g,'sword');assert.equal(ordinary.energyRank,0);
  assert(g.build.increment('swordEnergy'));const empowered=weaponStats(g,'sword');
  assert.equal(empowered.arc,ordinary.arc);assert.equal(empowered.range,ordinary.range+60);
  assert.equal(empowered.interval,ordinary.interval);close(empowered.damage,ordinary.damage*1.08,'branch energy damage');
  assert(g.build.increment('swordMastery'));assert(g.build.increment('power'));
  close(weaponStats(g,'sword').damage,104*(branch==='heavy'?1.85:1)*1.20*1.25,'local and character bonuses apply once');
  assert.deepEqual(CombatBuild.fromSnapshot(g.build.serialize()).serialize(),g.build.serialize());
}

function flightArena(obstacles=[]) {
  const g=arena();g.terrain=new Terrain({obstacles});g.enemies=[];g.player.x=0;g.player.y=0;g.effects=[];
  g.levels.sword=3;g.levels.swordEnergy=3;g._refreshWeapons();return g;
}
function target(g,x,y=0,r=12) {const e=g._spawnEnemy('slime');Object.assign(e,{x,y,r,hp:10000,maxHp:10000,speed:0});g._rebuildGrid();return e;}
function release(g) {const s=weaponStats(g,'sword');g.attacks.sword.update(0,s);g.attacks.sword.update(s.hitTime,s);return s;}
function advance(g,s,seconds) {for(let left=seconds;left>1e-9;){const step=Math.min(.02,left);g.attacks.sword.update(step,s);left-=step;}}

// All three crescent paths pierce, but their shared ledger keeps one target's
// damage within one attack. The full melee hit gets first claim in close range.
const cast=flightArena(),near=target(cast,60),far=target(cast,172,0,24),s=release(cast);
assert.equal(cast.attacks.sword.energyWaves.length,3);assert.equal(far.hp,10000,'no instant remote hit');
close(10000-near.hp,s.damage,'melee retains its normal output');
const waves=cast.attacks.sword.energyWaves;
assert.equal(waves[0].delay,0);assert(waves[1].delay<waves[2].delay);assert(new Set(waves.map(w=>w.angle)).size===3);
assert(waves.every(w=>w.cast===waves[0].cast&&w.owner===cast.player&&w.source==='sword'));
advance(cast,s,.42);close(10000-near.hp,s.damage,'overlapping energy never repeats melee');close(10000-far.hp,s.energyDamage,'siblings cannot multiply one cast damage');
assert.equal(cast.attacks.sword.energyWaves.length,0,'travel expires at its explicit range');

for(const distance of [60,172]) {
  const g=flightArena(),e=target(g,distance,0,24),stats=weaponStats(g,'sword'),amount=distance<100?stats.damage:stats.energyDamage;
  e.affix={id:'shield',shield:amount,maxShield:amount,color:'#9acbdf'};
  let contacts=0;const hit=g._hitEnemy.bind(g);g._hitEnemy=(enemy,...args)=>{if(enemy===e)contacts++;return hit(enemy,...args);};
  release(g);advance(g,stats,.42);
  assert.equal(e.affix.shield,0);assert.equal(e.hp,10000,'a fully absorbed contact consumes the cast, including sibling energy');
  assert.equal(contacts,1,'shield absorption cannot let sibling waves hit again');
  g.attacks.sword.cooldown=0;release(g);advance(g,stats,.42);
  close(10000-e.hp,amount,'a fresh cast can damage the same target after its shield breaks');assert.equal(contacts,2);
}

const moving=flightArena();target(moving,60);const movingStats=release(moving),launched=moving.attacks.sword.energyWaves[0],beforeX=launched.x,beforeY=launched.y;
moving.player.x=30;moving.player.y=12;moving.player.facing=Math.PI;moving.attacks.sword.update(.03,movingStats);
close(launched.x,beforeX+movingStats.energySpeed*.03,'a released wave travels independently');close(launched.y,beforeY,'owner motion cannot bend a wave');

// Sweeping both endpoints catches a narrow target even when a test frame spans
// it, as well as an enemy crossing a wave between two observed positions.
assert(Number.isFinite(swordEnergyContact({x:0,y:0},{x:150,y:0},{x:80,y:0,r:1},undefined,2)));
assert(Number.isFinite(swordEnergyContact({x:0,y:0},{x:80,y:0},{x:40,y:55,r:1},{x:40,y:-55},2)));
assert.equal(swordEnergyContact({x:0,y:0},{x:150,y:0},{x:80,y:35,r:1},undefined,2),Infinity);
const crossed=flightArena();target(crossed,50);const runner=target(crossed,165,-60,4),crossStats=release(crossed);
crossed.attacks.sword.update(.24,crossStats);runner.y=60;crossed._rebuildGrid();crossed.attacks.sword.update(.12,crossStats);
assert(runner.hp<10000,'relative-motion contact catches a crossing enemy');

// A tall obstruction terminates the flight itself, including delayed siblings.
// Low objects pass beneath the same source profile; unseen room guards remain
// ineligible even when a visible enemy starts the swing.
for(const height of ['low','high']) {
  const g=flightArena([{id:'cover',type:'log',heightBand:height,x:120,y:20,r:8,halfLength:90,angle:Math.PI/2}]);
  target(g,50);const e=target(g,170),stats=release(g);advance(g,stats,.42);
  assert.equal(e.hp<10000,height==='low',`${height} cover governs flying sword energy`);
  assert.equal(g.attacks.sword.energyWaves.length,0);
}
const invisible=flightArena();target(invisible,50);const hidden=target(invisible,170);hidden.dungeonId='hidden';invisible.dungeon.canDamage=e=>e!==hidden;
const invisibleStats=release(invisible);advance(invisible,invisibleStats,.42);assert.equal(hidden.hp,10000);
const rescue=flightArena();target(rescue,50);const protectedEnemy=target(rescue,165);protectedEnemy.rescueSpawnGrace=1;const rescueStats=release(rescue);advance(rescue,rescueStats,.42);assert.equal(protectedEnemy.hp,10000);

const supplies=flightArena();const supply={x:168,y:0,aimY:0,r:26,hp:10000},closeSupply={x:60,y:0,aimY:0,r:12,hp:10000};
supplies.adventure={props:[supply,closeSupply],hitSupply:(p,d)=>p.hp-=d,damageMultiplier:()=>1};const supplyStats=release(supplies);advance(supplies,supplyStats,.42);
close(10000-closeSupply.hp,supplyStats.damage,'melee and waves share the prop ledger');close(10000-supply.hp,supplyStats.energyDamage,'overlapping waves hit supplies only once');

for(const boundary of ['scene','terrain','owner','teleport','unequip','explicit']) {
  const g=flightArena();target(g,60);const e=target(g,175),stats=release(g);assert(g.attacks.sword.energyWaves.length);
  if(boundary==='scene')g.sceneKind='hut';else if(boundary==='terrain')g.terrain=new Terrain({obstacles:[]});else if(boundary==='owner')g.player={...g.player};
  else if(boundary==='teleport')g.player.x=2000;else if(boundary==='explicit')g.attacks.clearTrails();
  g.attacks.sword.update(.1,boundary==='unequip'?{...stats,equipped:false}:stats);
  // A still-equipped actor can start a fresh windup; the old cast never survives.
  assert.equal(g.attacks.sword.energyWaves.length,0,`${boundary} clears old energy`);assert.equal(e.hp,10000);
}
const paused=flightArena();target(paused,50);const pausedStats=release(paused),state=paused.attacks.sword.energyWaves.map(w=>[w.x,w.y,w.age,w.life,w.delay]);
paused.status='paused';paused.attacks.sword.update(2,pausedStats);assert.deepEqual(paused.attacks.sword.energyWaves.map(w=>[w.x,w.y,w.age,w.life,w.delay]),state);
paused.status='playing';paused.attacks.sword.update(.02,pausedStats);assert(paused.attacks.sword.energyWaves[0].age>0);
const bounded=flightArena();target(bounded,60);const burstStats={...weaponStats(bounded,'sword'),interval:0,hitTime:0};
for(let i=0;i<30;i++)bounded.attacks.sword.update(0,burstStats);assert(bounded.attacks.sword.energyWaves.length<=SWORD_ENERGY_RULES.maxWaves);
console.log('Sword energy: upgrade/build compatibility, flying fan, delayed remote hits, shared melee/prop budgets, swept moving contact, cover/visibility, independent origins, pause and lifecycle passed.');
