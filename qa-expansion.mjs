import assert from 'node:assert/strict';
import { portalDoor } from './dist/portal-geometry.js';
import { Game, BALANCE, EVOLUTIONS, WEAPON_BRANCHES } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Adventure } from './dist/adventure.js';
import { Encounters } from './dist/encounters.js';

// Focused behavior scenarios; this suite does not model a player's skill.
let seed=410117;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena({terrain=new Terrain({obstacles:[]}),width=1100,height=650}={}) {
  const g=new Game({terrain,adventure:false,encounters:false});
  // These scenarios isolate the established arrow/pulse/encounter behavior.
  g.levels.arrow=1;g.build.setEquipped('sword',false);
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;
  g.viewWidth=width;g.viewHeight=height;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  return g;
}
function advance(g,seconds,input={}) {
  for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);
}
function monster(g,type,x,y=0) {
  const e=g._spawnEnemy(type,1);
  Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000});
  return e;
}
const foot=(entity,isPlayer=false)=>({x:entity.x,y:entity.y+groundOffset(entity,isPlayer)});
const xpTotal=g=>g.player.xp;

// The fifth slot uses the current upgrade: orbit evolves directly, while
// sword/pulse/lightning require an explicit branch without another choice screen.
for(const id of Object.keys(EVOLUTIONS)) {
  const g=arena();g.player.level=8;g.player.xp=17;g.levels[id]=4;g.branches.arrow='pierce';g.crystalsNext=40;g.crystals=40;g.status='upgrade';
  const chosenId=id==='sword'?'branch:sword:sweep':id==='pulse'?'branch:pulse:echoes':id==='lightning'?'branch:lightning:chain':id;
  const expectedName=WEAPON_BRANCHES[id]?.find(b=>b.id===chosenId)?.name||EVOLUTIONS[id].name;
  let choices;
  for(let i=0;i<100;i++) {
    g._choices=null;choices=g.getUpgradeChoices();
    if(choices.some(c=>c.id===chosenId))break;
  }
  const choice=choices.find(c=>c.id===chosenId);
  assert(choice?.evolves&&choice.evolutionName===expectedName,'the final level advertises the resulting weapon');
  assert(g.chooseUpgrade(chosenId));
  assert.equal(g.levels[id],5);assert.equal(g.evolutions[id],true);
  assert.equal(g.status,'playing','evolution does not add another selection screen');
  assert.equal(g.player.xp,17,'evolution does not charge additional experience');
  assert.equal(g.player.level,8,'evolution does not create a bonus hero level');
  const weapon=(['sword','orbit'].includes(id)?g.weapons:g.skills).find(w=>w.id===id);
  assert(weapon.evolved&&weapon.name===expectedName,'the displayed weapon name and state update together');
  g._syncEvolutions(true);g._syncEvolutions(true);advance(g,.1);
  assert.equal(g.events.filter(e=>e.type==='evolution'&&e.weaponId===id).length,1,'an evolution announces only once');
  g._choices=null;
  assert(!g.getUpgradeChoices().some(c=>c.id===id||c.weaponId===id),'a completed base track cannot offer its base upgrade or a second branch');
}

const orbit=arena();orbit.levels.orbit=5;orbit.update(0);
const restRadius=Math.hypot(orbit.orbitals[0].x,orbit.orbitals[0].y),bladeCount=orbit.orbitals.length;
advance(orbit,.45);
const outerBlade=orbit.orbitals[0],expandedRadius=Math.hypot(outerBlade.x,outerBlade.y);
assert(expandedRadius>restRadius+40,'the evolved blades visibly expand beyond their normal orbit');
const outerTarget=monster(orbit,'slime',outerBlade.x,outerBlade.y),outerHealth=outerTarget.hp;
assert(expandedRadius>restRadius+outerTarget.r+outerBlade.r,'the target is beyond the old orbit collision reach');
orbit.update(0);
assert.equal(outerTarget.hp,outerHealth,'a same-clock refresh does not start another contact simulation');
orbit.update(.025);
assert(outerTarget.hp<outerHealth,'the expanded blade has a real damaging collision on the next simulation step');
assert.equal(orbit.orbitals.length,bladeCount,'expansion does not increase the blade budget');
advance(orbit,.5);
assert(Math.hypot(orbit.orbitals[0].x,orbit.orbitals[0].y)<expandedRadius-40,'the blades return to their normal orbit');

const echo=arena();echo.levels.pulse=5;echo.branches.pulse='echoes';echo._pulse=0;
const echoTarget=monster(echo,'slime',210,0);echo.update(0);
assert.equal(echoTarget.hp,10000,'an enemy in the outer ring is outside the first pulse');
assert.equal(echo._pulseEchoes.length,1);
const pendingEcho=structuredClone(echo._pulseEchoes[0]);
echo.player.x=480;advance(echo,.3);
assert.equal(echoTarget.hp,10000,'the secondary pulse is delayed');
const remaining=echo._pulseEchoes[0].life;
echo.status='upgrade';advance(echo,1);
assert.equal(echo._pulseEchoes[0].life,remaining,'choosing an upgrade freezes the pending echo');
echo.status='playing';advance(echo,.04);
assert.equal(echoTarget.hp,10000,'the echo cannot arrive before its full delay');
advance(echo,.02);
assert(echoTarget.hp<10000,'the secondary pulse hits around the original cast location after the player leaves');
assert.equal(echo._pulseEchoes.length,0);
const echoEffects=echo.effects.filter(e=>e.echo);
assert.equal(echoEffects.length,1);assert.equal(echoEffects[0].x,pendingEcho.x);assert.equal(echoEffects[0].y,pendingEcho.y);
const afterEcho=echoTarget.hp;advance(echo,.5);assert.equal(echoTarget.hp,afterEcho,'one cast cannot repeat its echo');

const deadEcho=arena();deadEcho.levels.pulse=5;deadEcho.branches.pulse='echoes';deadEcho._pulse=0;
const untouched=monster(deadEcho,'slime',210,0);deadEcho.update(0);
deadEcho.player.x=480;deadEcho.player.hp=1;
monster(deadEcho,'slime',480,0).damage=5;
deadEcho.update(.05);assert.equal(deadEcho.status,'dead');advance(deadEcho,1);
assert.equal(untouched.hp,10000,'a pending echo cannot deal delayed damage after death');
assert(!deadEcho.effects.some(e=>e.echo));

const chain=arena();chain.levels.lightning=5;chain.branches.lightning='chain';chain._lightning=0;
const chainTargets=[60,120,180,240,300,360,420,480].map(x=>monster(chain,'slime',x));chain.update(0);
const chainDamage=chainTargets.map(e=>10000-e.hp);
assert.equal(chainDamage.filter(d=>d>0).length,7,'an evolved chain hits at most seven different enemies');
assert(chainDamage[0]>0);
assert(chainDamage.slice(0,3).every(damage=>damage===chainDamage[0]),'the original three targets retain their full strike damage');
for(const damage of chainDamage.slice(3,7))assert(Math.abs(damage/chainDamage[0]-.85)<1e-10,'the four extra jumps retain 85% damage');
assert.equal(chainDamage[7],0);
const links=chain.effects.filter(e=>e.type==='lightning');
assert.equal(new Set(links.map(e=>`${e.x2},${e.y2}`)).size,7,'the chain never revisits an earlier target');
for(const [width,height,axis] of [[390,690,'x'],[1100,300,'y']]) {
  const edge=arena({width,height});edge.levels.lightning=5;edge.branches.lightning='chain';edge._lightning=0;
  const visible=monster(edge,'slime',axis==='x'?160:0,axis==='y'?110:0);
  const hidden=monster(edge,'slime',axis==='x'?230:0,axis==='y'?185:0);
  edge.update(0);
  assert(visible.hp<10000);assert.equal(hidden.hp,10000,'a chain stops at invisible targets beyond either viewport edge');
}

function expedition(options={}) {
  const g=arena(options);g.adventure=new Adventure(g,{generation:false});g.encounters=new Encounters(g,{generation:false});
  return {g,a:g.adventure,c:g.encounters};
}

const scheduling=expedition();scheduling.c.generation=true;scheduling.c.nextAt=0;
monster(scheduling.g,'boss',400,0);scheduling.c.update(0);
assert.equal(scheduling.c.active,null,'random events do not start during a living Boss encounter');
scheduling.g.enemies=[];scheduling.g.nextBossAt=scheduling.g.time+20;scheduling.c.update(0);
assert.equal(scheduling.c.active,null,'random events leave preparation time before a due Boss');
scheduling.g.nextBossAt=Infinity;scheduling.c.update(0);
assert(scheduling.c.active,'the same due event starts once the Boss restriction clears');

const occupiedArena=expedition({terrain:new Terrain({obstacles:[{type:'tree',x:190,y:0,r:35}]})});
assert(occupiedArena.g.terrain.isFree(0,0,42),'the center alone is walkable');
assert.equal(occupiedArena.c.spawn('hunt',0,0),null,'an arena rejects a solid obstacle elsewhere on its floor');
const relocatedArena=occupiedArena.c.spawn('hunt');
assert(relocatedArena&&occupiedArena.g.terrain.isFree(relocatedArena.x,relocatedArena.y,245),'the arena can choose nearby clear ground');

const hunt=expedition(),h=hunt.c.spawn('hunt',120,19.8);
assert(h);assert.equal(hunt.g.enemies.length,0,'a hunt reuses the ordinary population');
const killAt=(run,x,extras={})=>{
  const e=monster(run.g,'slime',x,19.8-14);Object.assign(e,extras);run.g._hurtEnemy(e,e.hp+1);return e;
};
const counted=killAt(hunt,120);assert.equal(h.progress,1);
hunt.c.onEnemyKilled(counted);assert.equal(h.progress,1,'the same death cannot advance a hunt twice');
killAt(hunt,450);assert.equal(h.progress,1,'a death outside the marked zone does not count');
hunt.g.player.x=450;killAt(hunt,120);assert.equal(h.progress,1,'the player must also be inside the hunt zone');
hunt.g.player.x=0;
for(const extras of [{type:'boss'},{elite:true},{guardianId:'other-chest'},{eventRole:'treasure'}]) {
  killAt(hunt,120,extras);assert.equal(h.progress,1,'Bosses, elites, guardians and event enemies cannot advance the hunt');
}
const huntFreeze=structuredClone(h);hunt.g.status='upgrade';advance(hunt.g,1);hunt.c.update(.05);
assert.deepEqual(h,huntFreeze,'hunt time and progress freeze during upgrades');

const successfulHunt=expedition(),goal=successfulHunt.c.spawn('hunt',120,19.8);
let expectedXp=xpTotal(successfulHunt.g);
for(let i=0;i<goal.goal;i++) {
  const e=monster(successfulHunt.g,'slime',120,5.8);expectedXp+=e.xp;successfulHunt.g._hurtEnemy(e,e.hp+1);
}
assert.equal(successfulHunt.c.active,null);assert.deepEqual(successfulHunt.a.pickups.map(p=>p.type),['fury']);assert.equal(successfulHunt.g.gold,6);assert.equal(successfulHunt.g.crystals,40);
assert.equal(xpTotal(successfulHunt.g),expectedXp,'hunt rewards add no experience beyond ordinary kill drops');
const huntRewardIds=successfulHunt.a.pickups.map(p=>p.id);
successfulHunt.c._finish(true);successfulHunt.c.onEnemyKilled(successfulHunt.g.enemies.at(-1));
assert.deepEqual(successfulHunt.a.pickups.map(p=>p.id),huntRewardIds,'hunt rewards are paid once');
assert.equal(successfulHunt.g.events.filter(e=>e.type==='encounterComplete').length,1);assert.equal(successfulHunt.g.gold,6);assert.equal(successfulHunt.g.crystals,40);

const chaseTerrain=new Terrain({obstacles:[{id:'chase-tree',type:'tree',x:180,y:19.8,r:28}]});
const chase=expedition({terrain:chaseTerrain}),chaseEvent=chase.c.spawn('treasure',100,19.8);
assert(chaseEvent);const runner=chase.g.enemies.find(e=>e.id===chaseEvent.enemyId),start={x:runner.x,y:runner.y};
for(let i=0;i<100;i++) {
  chase.g.update(.025);const p=foot(runner);
  assert(chase.g.terrain.isFree(p.x,p.y,runner.r),'a fleeing treasure enemy never crosses through terrain');
}
assert(Math.hypot(runner.x-start.x,runner.y-start.y)>20,'the treasure enemy actually flees instead of remaining stationary');
const frozenRunner={x:runner.x,y:runner.y,life:chaseEvent.life};
chase.g.status='upgrade';advance(chase.g,1);
assert.deepEqual({x:runner.x,y:runner.y,life:chaseEvent.life},frozenRunner,'a chase and its timeout freeze during an upgrade');
chase.g.status='playing';const chaseXp=xpTotal(chase.g);chase.g._hurtEnemy(runner,runner.hp+1);
assert.equal(chase.c.active,null);assert.deepEqual(chase.a.pickups.map(p=>p.type),['magnet']);assert.equal(xpTotal(chase.g),chaseXp+16,'the treasure enemy awards automatic kill XP');assert.equal(chase.g.gold,24);assert.equal(chase.g.crystals,8);
const chaseRewards=chase.a.pickups.map(p=>p.id);chase.c.onEnemyKilled(runner);chase.c.update(0);
assert.deepEqual(chase.a.pickups.map(p=>p.id),chaseRewards,'duplicate death notifications cannot duplicate treasure rewards');assert.equal(chase.g.gold,24);assert.equal(chase.g.crystals,8);

for(const exit of ['timeout','distance','missing']) {
  const run=expedition(),active=run.c.spawn('treasure',100,19.8),before={kills:run.g.kills,xp:xpTotal(run.g)};
  if(exit==='timeout')active.life=.01;
  if(exit==='distance')run.g.player.x=1500;
  if(exit==='missing')run.g.enemies=[];
  run.c.update(.025);
  assert.equal(run.c.active,null,`${exit} cancels an abandoned treasure encounter`);
  assert.equal(run.a.pickups.length,0,'abandonment cannot produce rewards');
  assert(!run.g.enemies.some(e=>e.eventId===active.id));
  assert.deepEqual({kills:run.g.kills,xp:xpTotal(run.g)},before,'despawning an event enemy is not a rewarded kill');
}
const capacity=expedition();for(let i=0;i<180;i++)monster(capacity.g,'slime',700+i,400);
assert.equal(capacity.c.spawn('treasure',100,19.8),null,'treasure events respect the ordinary enemy capacity');
assert(capacity.c.spawn('hunt',100,19.8));assert.equal(capacity.g.enemies.length,180,'a hunt does not add a second population');

// Scheduled Bosses alternate their behavior while sharing the one-Boss limit.
const schedule=arena(),kinds=[];
for(let round=1;round<=3;round++) {
  schedule.nextBossAt=schedule.time;schedule.update(0);
  const bosses=schedule.enemies.filter(e=>e.type==='boss'&&e.hp>0);
  assert.equal(bosses.length,1);const boss=bosses[0];kinds.push(boss.bossKind);
  assert.equal(boss.bossIndex,round);
  schedule.time=schedule.nextBossAt+1;schedule.update(0);
  assert.equal(schedule.enemies.filter(e=>e.type==='boss'&&e.hp>0).length,1,'a due round cannot overlap a living Boss');
  assert.equal(schedule.bossCount,round);
  schedule._hurtEnemy(boss,boss.hp+1);schedule.enemies=[];
  schedule.player.x=schedule.portal.x;schedule.player.y=portalDoor(schedule.portal).y-groundOffset(schedule.player,true);schedule.regions.flushReward();assert(schedule.chooseSuper(schedule.getSuperChoices()[0].id));assert(schedule.enterPortal());schedule.regionGrace=0;
}
assert.deepEqual(kinds,['ancient','bloom','ancient'],'even rounds introduce the new lord without replacing the first fight');
assert.equal(schedule.regions.unlockedConnections.size,3,'the three finite world connections are unlocked once');
schedule.nextBossAt=schedule.time;schedule.update(0);assert(!schedule.enemies.some(e=>e.type==='boss'&&e.hp>0),'an activated world connection cannot refresh a fourth regional boss reward');
const fourthPattern=arena();fourthPattern.bossCount=4;assert.equal(monster(fourthPattern,'boss').bossKind,'bloom','the fourth boss index still selects the bloom behavior independently of world generation');

function warning(kind='fan',options={}) {
  const g=arena(options);g.bossCount=2;
  const boss=monster(g,'boss',-250,19.8-41);
  boss.bloomNext=kind;boss.bloomCooldown=0;g.update(.025);
  assert.equal(boss.bossKind,'bloom');assert.equal(boss.bloomAttack?.kind,kind);
  assert(boss.bloomAttack.life>.5,'the new attack has a readable warning');
  assert.equal(g.player.hp,g.player.maxHp,'starting a warning does not damage the player');
  assert.equal(g.enemyBullets.length,0);
  return {g,boss};
}

const fan=warning(),fanAim=structuredClone(fan.boss.bloomAttack);
fan.g.player.y=50;advance(fan.g,.2);
assert.equal(fan.boss.bloomAttack.angle,fanAim.angle,'the fan locks its angle when the warning begins');
assert.equal(fan.boss.bloomAttack.x,fanAim.x);assert.equal(fan.boss.bloomAttack.y,fanAim.y);
const fanFrozen=structuredClone(fan.boss.bloomAttack);fan.g.status='upgrade';advance(fan.g,1);
assert.deepEqual(fan.boss.bloomAttack,fanFrozen,'the fan warning freezes while an upgrade is open');
fan.g.status='playing';advance(fan.g,fanFrozen.life-.05);
assert.equal(fan.g.enemyBullets.length,0,'the fan cannot fire before its warning ends');
advance(fan.g,.075);
assert.equal(fan.g.enemyBullets.length,5,'one completed fan creates five projectiles');
assert(fan.g.enemyBullets.some(b=>Math.abs(Math.atan2(b.vy,b.vx)-fanAim.angle)<1e-10),'the central projectile follows the locked angle');
const frozenShots=structuredClone(fan.g.enemyBullets);fan.g.status='upgrade';advance(fan.g,1);
assert.deepEqual(fan.g.enemyBullets,frozenShots,'the new hostile projectiles freeze during upgrades');
fan.g.status='playing';fan.g.player.invuln=10;fan.g.enemies=[];advance(fan.g,5);
assert.equal(fan.g.enemyBullets.length,0,'the emitted projectiles have a finite lifetime');

const openFan=warning();advance(openFan.g,3);
assert(openFan.g.player.hp<openFan.g.player.maxHp,'standing in the fan path can take projectile damage');
const coveredFan=warning('fan');
coveredFan.g.terrain=new Terrain({obstacles:[{id:'fan-cover',type:'rock',heightBand:'high',x:-110,y:19.8,r:45}]});
advance(coveredFan.g,3);
assert.equal(coveredFan.g.player.hp,coveredFan.g.player.maxHp,'solid cover absorbs the projectiles that would reach the player');
assert(!coveredFan.g.enemyBullets.some(b=>Math.abs(b.vy)<1e-10),'the center projectile is consumed by cover');

const burst=warning('burst'),burstWarning=structuredClone(burst.boss.bloomAttack);
assert.equal(burstWarning.circles.length,3,'the empty-ground attack marks three distinct circles');
assert.equal(new Set(burstWarning.circles.map(c=>`${c.x},${c.y}`)).size,3);
advance(burst.g,burstWarning.life-.05);
assert.equal(burst.g.player.hp,burst.g.player.maxHp,'marked circles deal no damage before their warning expires');
advance(burst.g,.075);
assert(burst.g.player.hp<burst.g.player.maxHp,'remaining in a marked circle receives the burst');
const afterBurst=burst.g.player.hp;advance(burst.g,.5);
assert.equal(burst.g.player.hp,afterBurst,'the burst resolves only once during its visual effect');

const dodgedBurst=warning('burst'),lockedCircles=structuredClone(dodgedBurst.boss.bloomAttack.circles);
dodgedBurst.g.player.x=-50;dodgedBurst.g.player.y=90;advance(dodgedBurst.g,.1);
assert.deepEqual(dodgedBurst.boss.bloomAttack.circles,lockedCircles,'the circles stay at their original positions after the player moves');
advance(dodgedBurst.g,1.2);
assert.equal(dodgedBurst.g.player.hp,dodgedBurst.g.player.maxHp,'leaving the marked circles avoids the burst');
assert.equal(dodgedBurst.g.events.filter(e=>e.type==='bloomBurst').length,1);
const immuneBurst=warning('burst');immuneBurst.g.player.invuln=2;advance(immuneBurst.g,1.3);
assert.equal(immuneBurst.g.player.hp,immuneBurst.g.player.maxHp,'the burst respects existing invulnerability');

for(const kind of ['fan','burst'])for(const weapon of ['skill','arrow','pulse']) {
  const cancelled=warning(kind),{g,boss}=cancelled;
  boss.hp=1;boss.bloomAttack.life=.001;
  if(weapon==='arrow')g.bullets.push({x:boss.x,y:boss.y,r:4,vx:0,vy:0,life:1,damage:10,pierce:1,hitIds:new Set()});
  if(weapon==='pulse') {
    // Put the already-locked warning's caster in normal pulse range.
    boss.x=-100;g.levels.pulse=1;g._pulse=0;
  }
  g.update(.025,weapon==='skill'?{skill:true}:{});
  assert(boss.hp<=0);assert.equal(boss.bloomAttack,null,`${weapon} cancels a same-frame ${kind} release`);
  assert.equal(g.enemyBullets.length,0);assert.equal(g.player.hp,g.player.maxHp);
  assert(!g.events.some(e=>e.type==='bloomShot'||e.type==='bloomBurst'),'a killed Boss cannot resolve a delayed attack');
}

for(const occupied of [56,58,59,60]) {
  const limited=warning();
  for(let i=0;i<occupied;i++)limited.g.enemyBullets.push({id:++limited.g._id,type:'spore',x:500,y:250+i,r:6,vx:0,vy:0,life:5,damage:1});
  limited.boss.bloomAttack.life=.001;limited.g.update(.025);
  assert(limited.g.enemyBullets.length<=BALANCE.maxEnemyBullets,'the fan shares the existing hostile projectile capacity');
  const added=limited.g.enemyBullets.filter(b=>b.type==='bloom');
  if(occupied<BALANCE.maxEnemyBullets)assert(added.length>0,'available capacity still permits a limited fan');
  if(added.length)assert(added.length%2===1,'a limited fan keeps its center and symmetric pairs');
}

console.log('Expansion mechanics: selected evolutions, delayed/visible attacks, optional events, bounded rewards and alternating telegraphed Bosses passed.');
