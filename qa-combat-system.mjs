import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { ANGEL_RULES } from './dist/settlements.js';
import { CombatBuild } from './dist/combat-build.js';
import { LEVEL_CAPS } from './dist/combat-catalog.js';
import { weaponStats, skillStats, resolveCharacterStats } from './dist/combat-stats.js';

// These scenarios exercise actual attacks, purchases and equipment lifecycle.
// Suppress world generation only, leaving targeting/status/damage intact.
let seed=462831;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function arena({starting=false,...options}={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,...options});
  if(!starting){g.levels.arrow=1;g.build.setEquipped('sword',false);g._refreshWeapons();}
  g.enemies=[];g.gems=[];g.coins=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.nextBossAt=Infinity;
  g.player.xpNext=Infinity;g.crystalsNext=Infinity;g._updatePressure=()=>{};
  return g;
}
function enemy(g,x=100,y=0) {const e=g._spawnEnemy('slime');Object.assign(e,{x,y,hp:10000,maxHp:10000,speed:0});return e;}
function advance(g,t) {for(let left=t;left>1e-8;left-=.025)g.update(Math.min(left,.025));}
function near(actual,expected,message) {assert(Math.abs(actual-expected)<1e-8,`${message}: expected ${expected}, received ${actual}`);}
function paid(g,id) {
  g.progressionTier=Math.max(5,g.progressionTier);g.crystalsNext=40;g.crystals=40;g.status='upgrade';
  for(let i=0;i<1000;i++) {g._choices=null;if(g.getUpgradeChoices().some(c=>c.id===id)){assert(g.chooseUpgrade(id),`pay for ${id}`);return;}}
  assert.fail(`eligible upgrade never offered: ${id}`);
}

const base=arena({starting:true});
assert.deepEqual(base.weapons.map(w=>w.id),['sword']);
assert.deepEqual(base.skills.map(s=>s.id),['storm'],'manual super belongs to the independent skill collection');
assert.equal(base.player.level,1);assert.equal(base.progressionTier,1);
assert.equal(resolveCharacterStats(base).attack,32);
assert.equal(weaponStats(base,'arrow').baseDamage,32);
assert.equal(weaponStats(base,'arrow').interval,.38);
assert.equal(skillStats(base,'storm').damage,160);
assert.equal(skillStats(base,'storm').cooldown,15);
assert.equal(base.build.getWeapon('arrow').level,0);
assert.equal(base.build.getWeapon('sword').level,1);assert.equal(weaponStats(base,'sword').baseDamage,64);

// Merely inspecting a portal guardian cannot awaken it, announce a Boss or
// increment progression. The first valid hit activates it, even if shielded.
for(const shielded of [false,true]) {
  const g=arena(),guard=g._spawnEnemy('boss');Object.assign(guard,{x:100,y:0,hp:10000,maxHp:10000,speed:0,portalId:'qa-locked-gate',guardActive:false,_portalAnnounced:false});
  g.enemies=[guard];g.regions.portals=[{id:'qa-locked-gate',x:100,y:19.8,state:'locked'}];g.events=[];
  const count=g.bossCount;
  assert(g.combat.canTarget(guard,g.player,{requireView:true}));assert.equal(g._nearest(0,0,420),guard);
  assert.equal(guard.guardActive,false);assert.equal(g.bossCount,count);assert(!g.events.some(e=>e.type==='boss'));
  if(shielded)guard.affix={id:'shield',shield:10,maxShield:10,color:'#9acbdf'};
  g._hitEnemy(guard,1,0,g.player,'arrow');
  if(shielded){assert.equal(guard.hp,10000);assert.equal(guard.affix.shield,9,'the awakening hit is still fully absorbed');}
  assert.equal(guard.guardActive,true);assert.equal(g.bossCount,count+1);assert.equal(g.events.filter(e=>e.type==='boss').length,1);
  g._hitEnemy(guard,1,0,g.player,'arrow');assert.equal(g.bossCount,count+1,'repeated hits announce a guardian only once');
}

// The baseline output of every existing attack must stay exactly unchanged.
for(const [id,expected] of [['arrow',32],['orbit',30],['pulse',50],['lightning',48],['storm',160]]) {
  const g=arena();if(['orbit','pulse','lightning'].includes(id))g.levels[id]=1;
  const e=enemy(g,id==='orbit'?74:100);g._rebuildGrid();
  if(id==='arrow'){g._shot=0;g.update(0);assert.equal(g.bullets[0].damage,expected);g._shot=Infinity;advance(g,.2);}
  else if(id==='storm')g.update(0,{skill:true});
  else {g._pulse=id==='pulse'?0:Infinity;g._lightning=id==='lightning'?0:Infinity;g._updateWeapons(0);}
  near(10000-e.hp,expected,`${id} baseline damage`);
}

// Local weapon and skill ranks must not leak into the character or siblings.
const local=arena();local.levels.orbit=1;local.levels.pulse=1;local.levels.lightning=1;
const untouched={attack:resolveCharacterStats(local).attack,orbit:weaponStats(local,'orbit').damage,pulse:skillStats(local,'pulse').damage,lightning:skillStats(local,'lightning').damage,storm:skillStats(local,'storm').damage};
paid(local,'arrowPower');
near(weaponStats(local,'arrow').damage,36.8,'arrow-only base damage upgrade');
assert.deepEqual({attack:resolveCharacterStats(local).attack,orbit:weaponStats(local,'orbit').damage,pulse:skillStats(local,'pulse').damage,lightning:skillStats(local,'lightning').damage,storm:skillStats(local,'storm').damage},untouched);
assert.equal(local.build.getWeapon('arrow').level,2);
paid(local,'power');
near(weaponStats(local,'arrow').damage,36.8*1.25,'character and weapon power combine once');
near(skillStats(local,'storm').damage,160*1.25,'character power applies to independent storm once');
const arrowVictim=enemy(local);local.levels.orbit=0;local.levels.pulse=0;local.levels.lightning=0;local._shot=0;local.update(0);local._shot=Infinity;advance(local,.2);
near(10000-arrowVictim.hp,36.8*1.25,'real projectile matches the single-scaling resolver');

// Delayed damage snapshots are already scaled and may not borrow later power.
const echo=arena();echo.levels.power=2;echo.levels.pulse=5;echo.branches.pulse='echoes';echo._pulse=0;
const echoVictim=enemy(echo,205);echo.update(0);assert.equal(echoVictim.hp,10000);
echo.levels.power=6;echo.player.x=500;echo._pulse=Infinity;advance(echo,.36);
near(10000-echoVictim.hp,90*1.5*.6,'echo preserves its cast-time damage without a second global multiplier');

// Main-character ranks never affect another caster's direct damage.
for(const power of [0,6]) {
  const g=arena();g.levels.power=power;g.player.level=40;g.rescuePower=5;
  const e=enemy(g),ally={id:'qa-ally',x:0,y:0,r:15,isCompanion:true,kind:'stormcaller',_echoes:[]};
  assert(g.companions._castLightning(ally));near(10000-e.hp,105,'companion damage uses its own caster');
  e.hp=10000;e.shock=null;g.companions._castQuake({...ally,kind:'warden'});near(10000-e.hp,90,'companion quake uses its own caster');
  const angel={id:'qa-angel',type:'angel',x:0,y:groundOffset(g.player,true),_attack:0,state:'ready'};
  e.hp=10000;e.bleed=null;g.settlements.sites=[angel];g.settlements._updateAngels(.025,{x:0,y:angel.y});
  near(10000-e.hp,ANGEL_RULES.damage,'angel does not inherit main-character damage');
}

// A shared capability source can belong to any explicit actor. Its delayed
// statuses inherit that actor's scope, not a player-only source-name shortcut.
for(const actorScope of ['ally','player'])for(const source of ['lightning','orbit']) {
  const g=arena();g.levels.power=4;
  const caster=actorScope==='player'?g.player:{id:'qa-generic-ally',x:0,y:0,r:15,isCompanion:true};
  const victim=enemy(g),attack=g.combat.createAttack({source,actor:caster,baseDamage:100});
  assert.equal(attack.ownerScope,actorScope);assert.equal(attack.damage,actorScope==='player'?200:100);
  g.combat.resolve(victim,attack);
  near(10000-victim.hp,actorScope==='player'?200:100,'shared ability damage retains explicit caster ownership');
  const state=source==='lightning'?victim.shock:victim.bleed,base=source==='lightning'?12:15;
  near(state.damage,base*(actorScope==='player'?2:1),'secondary reaction snapshots retain explicit caster ownership');
  if(source==='orbit') {
    g.levels.power=6;g.combatStatus.update(.5);
    near(10000-victim.hp,(actorScope==='player'?200:100)+base*(actorScope==='player'?2:1),'bleed tick consumes resolved snapshot without importing current hero power');
  }
}

// Boss reward acceptance immediately refreshes the public skill collection,
// without requiring another crystal purchase or a later render/update frame.
const rewarded=arena();
for(let level=1;level<=2;level++) {
  rewarded.regions.rewardPortal={rewardClaimed:false};assert(rewarded.superSkills.offer('region',rewarded.region.id));rewarded.status='super';
  const domainChoice=rewarded.getSuperChoices().find(c=>(c.skillId==='domain'||c.id==='domain')&&c.domainBranch==='binding');assert(domainChoice);
  assert(rewarded.chooseSuper(domainChoice.id));assert.equal(rewarded.build.getSkill('domain').level,level);
  assert.equal(rewarded.skills.find(skill=>skill.id==='domain')?.level,level);assert(!rewarded.weapons.some(weapon=>weapon.id==='domain'));
}

// Branch investments change the real finite projectile path, preserving both
// route exclusivity and the single-projectile budget for ricochet.
for(const route of ['pierce','ricochet']) {
  const g=arena();g.levels.rapid=3;paid(g,`branch:arrow:${route}`);
  const branchLevel=g.build.getWeapon('arrow').level;
  assert.equal(g.build.selectBranch('arrow',route==='pierce'?'ricochet':'pierce'),false);
  paid(g,'arrowRetention');paid(g,'arrowRetention');paid(g,'arrowReach');
  assert.equal(g.build.getWeapon('arrow').level,branchLevel+3);
  near(weaponStats(g,'arrow').retention,.85,'repeatable branch retention reaches its cap');
  assert.equal(weaponStats(g,'arrow').targetLimit,4);assert.equal(g.build.increment('arrowRetention'),false);
  const targets=route==='pierce'?[70,140,210,280,350].map(x=>enemy(g,x)):[[70,0],[125,45],[180,0],[240,45],[305,0]].map(([x,y])=>enemy(g,x,y));
  g._shot=0;g.update(0);g._shot=Infinity;
  assert.equal(g.bullets.length,1);advance(g,.82);
  const hits=targets.map(e=>10000-e.hp).filter(n=>n>0);
  assert.equal(hits.length,4,'post-branch upgrade raises actual hit cap exactly once');
  hits.forEach((damage,index)=>near(damage,32*Math.pow(.85,index),'retained damage scales once per hop'));
  assert.equal(g.bullets.length,0,'bounded projectile expires after its target or lifetime budget');
}

// Evolved abilities remain growable, with each new rank local to its owner.
const evolved=arena();evolved.levels.orbit=5;evolved._syncEvolutions(false);
paid(evolved,'orbitPower');paid(evolved,'orbitRadius');
const orbitVictim=enemy(evolved,82);evolved._rebuildGrid();evolved._updateWeapons(0);
near(10000-orbitVictim.hp,44*1.15,'post-evolution orbit damage');
near(Math.hypot(evolved.orbitals[0].x,evolved.orbitals[0].y),82,'post-evolution orbit radius');
assert.equal(evolved.build.getWeapon('orbit').level,7);assert.equal(skillStats(evolved,'storm').damage,160);
for(const [id,route,baseDamage] of [['pulse','echoes',90],['lightning','chain',88]]) {
  const g=arena();g.levels[id]=4;paid(g,`branch:${id}:${route}`);paid(g,`${id}Mastery`);paid(g,`${id}Mastery`);
  assert.equal(g.build.getSkill(id).level,7);assert.equal(g.build.increment(`${id}Mastery`),false);
  const e=enemy(g,100);g._rebuildGrid();g[id==='pulse'?'_pulse':'_lightning']=0;g._updateWeapons(0);
  near(10000-e.hp,baseDamage*1.24,`${id} post-branch mastery`);assert.equal(weaponStats(g,'arrow').damage,32);
}

// Equipment switches suppress output without deleting investment. Independent
// skills survive each weapon change; at least one weapon stays equipped.
const equip=arena();equip.levels.rapid=2;equip.levels.orbit=5;equip.levels.pulse=1;equip._syncEvolutions(false);equip._refreshWeapons();
const stateBefore=JSON.stringify({arrow:equip.build.getWeapon('arrow').modifiers,orbit:equip.build.getWeapon('orbit').modifiers,arrowLevel:equip.build.getWeapon('arrow').level,orbitLevel:equip.build.getWeapon('orbit').level});
const e=enemy(equip,74);equip._shot=0;equip.update(0);assert(equip.bullets.length>0);assert(equip.orbitals.length>0);
assert(equip.setWeaponEquipped('arrow',false));assert.equal(equip.bullets.length,0,'unequipping cancels weapon-owned projectiles');
assert.equal(equip.setWeaponEquipped('orbit',false),false,'the final equipped weapon cannot be removed');
equip._shot=0;equip.update(0);assert.equal(equip.bullets.length,0);assert(equip.orbitals.length>0);
assert(equip.setWeaponEquipped('arrow',true));assert(equip.setWeaponEquipped('orbit',false));
assert.equal(equip.orbitals.length,0);assert.equal(equip.setWeaponEquipped('pulse',false),false,'an independent skill cannot be unequipped through the weapon API');
e.hp=10000;e.bleed=null;e.shock=null;equip._shot=Infinity;equip._pulse=0;equip.update(0);
assert.equal(equip.orbitals.length,0);near(10000-e.hp,50,'independent quake survives weapon removal');
assert(equip.setWeaponEquipped('orbit',true));
assert.equal(JSON.stringify({arrow:equip.build.getWeapon('arrow').modifiers,orbit:equip.build.getWeapon('orbit').modifiers,arrowLevel:equip.build.getWeapon('arrow').level,orbitLevel:equip.build.getWeapon('orbit').level}),stateBefore);
equip._shot=0;equip.update(0);assert(equip.bullets.length>0);assert(equip.orbitals.length>0);

// A cached offer is a transaction: inspection cannot reroll it, stale caps and
// insufficient resources cannot grant progress, and one payment happens once.
const choice=arena();choice.progressionTier=5;choice.crystalsNext=40;choice.crystals=40;choice.status='upgrade';
const offer=choice.getUpgradeChoices(),offerIds=offer.map(c=>c.id);for(let i=0;i<10;i++)assert.equal(choice.getUpgradeChoices(),offer);
assert.equal(new Set(offerIds).size,offer.length);assert(offer.some(c=>c.category==='attribute'));
assert(offer.some(c=>['orbit','pulse','lightning','barrier'].includes(c.id)),'new abilities retain opportunity');
assert(offer.some(c=>['rapid','multishot','arrowPower','storm','sword'].includes(c.id)),'owned abilities retain opportunity');
const unfunded=choice.build.serialize();choice.crystals=39;assert.equal(choice.chooseUpgrade(offerIds[0]),false);assert.deepEqual(choice.build.serialize(),unfunded);
choice.crystals=40;assert.equal(choice.chooseUpgrade('missing'),false);assert.equal(choice.getUpgradeChoices(),offer);
const picked=offer.find(c=>c.category==='attribute');assert(choice.chooseUpgrade(picked.id));assert.equal(choice.crystals,0);assert.equal(choice.progressionTier,6);assert.equal(choice.chooseUpgrade(picked.id),false);
const stale=arena();stale.progressionTier=5;stale.status='upgrade';stale.crystalsNext=40;stale.crystals=40;
let cappedCard;for(let i=0;i<100&&!cappedCard;i++){stale._choices=null;cappedCard=stale.getUpgradeChoices().find(c=>c.id==='rapid');}
assert(cappedCard);stale.levels.rapid=LEVEL_CAPS.rapid;
assert.equal(stale.chooseUpgrade('rapid'),false,'cached cards revalidate the cap at payment');assert.equal(stale.crystals,40);

// Progress snapshots preserve a build, not world/HP/cooldown state. Invalid
// numerical and structural states fail instead of manufacturing corrupt runs.
const saved=local.build.serialize(),restored=CombatBuild.fromSnapshot(JSON.parse(JSON.stringify(saved)));
assert.deepEqual(restored.serialize(),saved);assert.notEqual(restored.weapons.arrow.modifiers,local.build.weapons.arrow.modifiers);
restored.increment('arrowPower');assert.equal(local.build.getRank('arrowPower'),1,'restored build has no mutable references to original');
for(const mutate of [s=>s.version=99,s=>s.progressionTier=0,s=>s.attributes.power=NaN,s=>s.weapons.arrow.modifiers.rapid=100,s=>s.weapons.arrow.branch='missing',s=>s.skills.pulse.baseRank=-1]) {
  const corrupt=structuredClone(saved);mutate(corrupt);assert.throws(()=>CombatBuild.fromSnapshot(corrupt));
}
for(const mutate of [s=>s.skills.pulse.branch='echoes',s=>s.weapons.orbit.evolved=true,s=>s.weapons.arrow.modifiers.arrowRetention=1]) {
  const impossible=new CombatBuild().serialize();mutate(impossible);assert.throws(()=>CombatBuild.fromSnapshot(impossible),'invalid branch/modifier/evolution prerequisites are rejected');
}

// Storm is a leveled independent super; upgrades improve its actual hit and
// retain the debug contract of zero cooldown.
for(const debug of [false,true]) {
  const storm=arena({debug});paid(storm,'storm');paid(storm,'storm');
  assert.equal(storm.build.getSkill('storm').level,3);assert.equal(storm.build.increment('storm'),false);
  const target=enemy(storm);storm.status='playing';storm.player.skillCooldown=0;storm.update(0,{skill:true});
  near(10000-target.hp,208,'storm level 3 has explicit own base damage');
  assert.equal(storm.player.skillCooldown,debug?0:12);assert.equal(storm.player.skillCooldownMax,debug?0:12);
}
console.log('Combat system: canonical ownership, exact baseline attacks, single damage scaling, NPC isolation, branch growth budgets, equipment restoration, paid offer guards, validated snapshots and leveled debug storm passed.');
