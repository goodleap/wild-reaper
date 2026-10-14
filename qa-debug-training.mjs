import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { CombatBuild } from './dist/combat-build.js';
import { UPGRADE_DEFS, WEAPON_DEFS, SKILL_DEFS } from './dist/combat-catalog.js';
import { debugConfigFromSearch, DEBUG_OPTION_DEFS, normalizeDebugOptions } from './dist/debug-mode.js';
import { applyFullDebugBuild, spawnDebugTrainingDummy, DEBUG_FULL_BRANCHES, TRAINING_DUMMY_RULES } from './dist/debug-training.js';
import { WEAPON_KNOCKBACK } from './dist/weapon-knockback.js';

const close=(a,b,message)=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} != ${b}`);
const advance=(g,seconds)=>{for(let left=seconds;left>1e-8;left-=.02)g.update(Math.min(left,.02),{});};
const factory=(options={})=>new Game({adventure:false,terrain:new Terrain({obstacles:[]}),...options});
const isolate=g=>{
  g.enemies=g.enemies.filter(e=>e.trainingDummy);g._spawn=Infinity;g.nextBossAt=Infinity;
  for(const id of Object.keys(g.build.weapons))g.build.setEquipped(id,false);
  g._refreshWeapons();return g;
};
for(const search of ['', '?x=1', '?debug=false','?debug=0','?debug=enabled','?debug=fuller'])assert.deepEqual(debugConfigFromSearch(search),{enabled:false});
for(const search of ['?debug','?debug=','?debug=1','?debug=true','?debug=TRUE','?x=1&debug=true'])assert.deepEqual(debugConfigFromSearch(search),{enabled:true});
assert.deepEqual(debugConfigFromSearch('?debug=full'),{enabled:true});
assert.deepEqual(debugConfigFromSearch('?debug=FULL'),{enabled:true});
assert.deepEqual(debugConfigFromSearch(new URLSearchParams('debug=full')),{enabled:true});

for(const options of [{},{debug:false,debugOptions:{fullLoadout:true}},{debug:true,debugFull:true},{debug:true,debugOptions:{fullLoadout:'true'}}]) {
  const g=factory(options);
  assert.equal(g.debugFull,false,'full loadout requires an explicit boolean setting in a debug run');
  assert.equal(g.build.getWeapon('arrow').acquired,false);
  if(!g.debug){assert.equal(g.enemies.some(e=>e.trainingDummy),false);assert.equal(spawnDebugTrainingDummy(g),null);}
  assert.equal(applyFullDebugBuild(g),false);
}
const disabledOptions=Object.fromEntries(DEBUG_OPTION_DEFS.map(def=>[def.id,false]));
const defaults=normalizeDebugOptions();assert(Object.isFrozen(defaults));
assert.deepEqual(Object.keys(defaults),DEBUG_OPTION_DEFS.map(def=>def.id));
assert.deepEqual(normalizeDebugOptions({unknown:true,fullLoadout:'true'}),defaults,'only known booleans are accepted');
assert.deepEqual(normalizeDebugOptions(Object.fromEntries(DEBUG_OPTION_DEFS.map(def=>[def.id,true])),false),disabledOptions);
const normalWithOptions=factory({debugOptions:Object.fromEntries(DEBUG_OPTION_DEFS.map(def=>[def.id,true]))});
assert.deepEqual(normalWithOptions.debugOptions,disabledOptions);assert.equal(normalWithOptions.gold,0);assert.equal(normalWithOptions.player.speed,220);
assert.equal(normalWithOptions.player.skillCooldownMax,normalWithOptions.hero.skillCooldown);
assert(!normalWithOptions.enemies.some(enemy=>enemy.trainingDummy||enemy.debugBoss||enemy.debugWave));
assert.equal(normalWithOptions.build.getWeapon('arrow').acquired,false);
const inputOptions={...disabledOptions},plainDebug=factory({debug:true,debugOptions:inputOptions});
inputOptions.fastMovement=true;
assert.equal(plainDebug.debugOptions.fastMovement,false,'run settings are a snapshot of prepared preferences');
assert(Object.isFrozen(plainDebug.debugOptions));
assert.equal(plainDebug.player.speed,220);assert.equal(plainDebug.player.skillCooldownMax,plainDebug.hero.skillCooldown);assert.equal(plainDebug.gold,0);
assert(!plainDebug.enemies.some(enemy=>enemy.trainingDummy||enemy.debugBoss||enemy.debugWave));
for(const def of DEBUG_OPTION_DEFS) {
  const g=factory({debug:true,debugOptions:{...disabledOptions,[def.id]:true}});
  assert.equal(g.gold,def.id==='extraGold'?500:0,`${def.id}: gold is independent`);
  assert.equal(g.player.speed,def.id==='fastMovement'?660:220,`${def.id}: movement is independent`);
  assert.equal(g.player.skillCooldownMax===0,def.id==='zeroStormCooldown',`${def.id}: zero cooldown is independent`);
  if(!['zeroStormCooldown','fullLoadout'].includes(def.id))assert.equal(g.player.skillCooldownMax,g.hero.skillCooldown);
  assert.equal(g.enemies.some(enemy=>enemy.trainingDummy),def.id==='testFacilities',`${def.id}: dummy is independent`);
  assert.equal(g.enemies.some(enemy=>enemy.debugBoss),def.id==='testFacilities',`${def.id}: boss is independent`);
  assert.equal(g.enemies.some(enemy=>enemy.debugWave),def.id==='enemyWave',`${def.id}: wave is independent`);
  assert.equal(g.build.getWeapon('arrow').acquired,def.id==='fullLoadout',`${def.id}: full loadout is independent`);
  assert.equal(g.companions.members.length,0);
  g.player.skillCooldown=5;g.update(.01,{});
  assert.equal(g.player.skillCooldown,def.id==='zeroStormCooldown'?0:4.99,`${def.id}: cooldown update follows the run setting`);
}
const ordinary=factory({debug:true}),full=factory({debug:true,debugOptions:{fullLoadout:true}});
full.enemies=full.enemies.filter(e=>e.trainingDummy);
assert.equal(ordinary.build.getWeapon('sword').baseRank,1);assert.equal(ordinary.skills.length,1);
assert.equal(ordinary.player.level,1);assert.equal(ordinary.progressionTier,1);assert.equal(ordinary.status,'playing');
assert.deepEqual(full.build.attributes,ordinary.build.attributes,'full mode does not buy base-attribute upgrades');
assert.equal(full.player.level,ordinary.player.level);assert.equal(full.player.hp,ordinary.player.hp);assert.equal(full.player.maxHp,ordinary.player.maxHp);
assert.equal(full.player.speed,ordinary.player.speed);assert.equal(full.player.attack,ordinary.player.attack);assert.equal(full.player.defense,ordinary.player.defense);
assert.equal(full.companions.members.length,0,'full loadout does not silently recruit companions');
assert.equal(full.gold,ordinary.gold);assert.equal(full.crystals,ordinary.crystals);assert.equal(full.progressionTier,1);assert.equal(full.status,'playing');
assert.equal(full.events.some(e=>['skillUpgrade','superChosen','evolution'].includes(e.type)),false,'full grants cause no purchase modals or reward queues');
for(const def of UPGRADE_DEFS.filter(def=>def.category!=='attribute'&&(def.category==='weapon'||full.build.getSkill(def.ownerId))))assert.equal(full.build.getRank(def.id),def.cap,`${def.id} reaches its real cap`);
for(const [id,def] of Object.entries(WEAPON_DEFS)){assert.equal(full.build.getWeapon(id).baseRank,def.maxBaseRank);assert(full.build.isEquipped(id));}
for(const [id,def] of Object.entries(SKILL_DEFS).filter(([id])=>full.build.getSkill(id)))assert.equal(full.build.getSkill(id).baseRank,def.maxBaseRank,`${id} is fully learned`);
for(const [id,branch] of Object.entries(DEBUG_FULL_BRANCHES))assert.equal(full.branches[id],branch);
const snapshot=full.build.serialize();assert.deepEqual(CombatBuild.fromSnapshot(snapshot).serialize(),snapshot,'full debug is a valid serializable build with exclusive branches');
assert.equal(full.superSkills.owned,full.build.superLevels,'granting a build preserves runtime state references');
assert.equal(applyFullDebugBuild(full),false);assert.deepEqual(full.build.serialize(),snapshot,'initialization is idempotent');
assert.equal(full.player.skillCooldownMax,0);full.player.skillCooldown=5;full.update(.01,{});assert.equal(full.player.skillCooldown,0,'full mode retains the debug storm cooldown');

for(let seed=0;seed<12;seed++) {
  const g=new Game({debug:true,terrain:new Terrain({seed})}),dummy=g.enemies.find(e=>e.trainingDummy);
  assert(dummy,`terrain ${seed} has one safe training post`);
  assert.equal(g.enemies.filter(e=>e.trainingDummy).length,1);assert.equal(spawnDebugTrainingDummy(g),null);
  const point={x:dummy.x,y:dummy.y+groundOffset(dummy)},from={x:g.player.x,y:g.player.y+groundOffset(g.player,true)},d=Math.hypot(point.x-from.x,point.y-from.y);
  assert(d>=TRAINING_DUMMY_RULES.minDistance-.001&&d<=TRAINING_DUMMY_RULES.maxDistance+.001);
  assert(g.terrain.isFree(point.x,point.y,dummy.r+12));assert(g.settlements._hazardFree(point.x,point.y,dummy.r+14));
  assert.equal(g.terrain.firstBlocker(from.x,from.y,point.x,point.y,dummy.r+5),null,'the post is directly approachable');
  for(const site of g.settlements.sites.filter(site=>!['angel','merchant'].includes(site.type)))assert(Math.hypot(point.x-site.door.x,point.y-site.door.y)>dummy.r+70);
}

const g=isolate(factory({debug:true})),dummy=g.enemies[0],resources={kills:g.kills,xp:g.player.xp,gold:g.gold,crystals:g.crystals};
assert.equal(dummy.defense,100);assert.equal(dummy.maxHp,TRAINING_DUMMY_RULES.health);
const before={x:dummy.x,y:dummy.y,hp:dummy.hp};
advance(g,10);assert.deepEqual({x:dummy.x,y:dummy.y,hp:dummy.hp},before,'an unhit post neither chases nor attacks or self-damages over ten seconds');
assert.equal(g.player.hp,g.player.maxHp);
const dealt=g._hitEnemy(dummy,80,WEAPON_KNOCKBACK.distance,g.player,'sword');
assert.equal(dealt,40,'100 real defense halves a normal weapon hit');assert.equal(dummy.hp,before.hp-40);
advance(g,WEAPON_KNOCKBACK.duration);
close(Math.hypot(dummy.x-before.x,dummy.y-before.y),WEAPON_KNOCKBACK.distance,'a first hit applies the same standard knockback as a small monster');
const afterPush={x:dummy.x,y:dummy.y};advance(g,2);assert.deepEqual({x:dummy.x,y:dummy.y},afterPush,'the dummy stays where it was pushed');
for(const source of ['angel','companionLightning','companionPulse','companionEcho']) {
  const hp=dummy.hp;assert.equal(g.combat.canTarget(dummy,g.player,{source}),false);assert.equal(g._hurtEnemy(dummy,400,30,g.player,source),0);assert.equal(dummy.hp,hp);
  assert.equal(g._nearest(g.player.x,g.player.y,500,null,null,{source}),null,'allied target acquisition ignores the fixture');
}
const angel={id:'test-angel',type:'angel',x:dummy.x,y:dummy.y+groundOffset(dummy),_attack:0};
g.settlements.sites.push(angel);const hp=dummy.hp;g.settlements._updateAngels(.1,{x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
assert.equal(dummy.hp,hp);assert(!g.effects.some(e=>e.type==='angelStrike'),'a nearby angel does not visually cast at the dummy');
g.settlements.sites=[];
g.player.x=dummy.x;g.player.y=dummy.y;advance(g,.1);assert.equal(g.player.hp,g.player.maxHp);assert.equal(g.player.invuln,0,'touching a dummy does not trigger zero-damage contact immunity');
dummy.hp=1;assert.equal(g._hurtEnemy(dummy,20,0,g.player,'raw'),1);assert.equal(dummy.hp,dummy.maxHp,'an exhausted fixture restores its testing health');
assert.deepEqual({kills:g.kills,xp:g.player.xp,gold:g.gold,crystals:g.crystals},resources);assert.equal(g.gems.length,0);assert.equal(g.coins.length,0);
assert(!g.events.some(e=>e.type==='kill'),'training never advances kill-based events');
g.player.x=10000;g.player.y=10000;advance(g,.02);assert(g.enemies.includes(dummy),'walking far away does not cull the testing post');
assert.equal(spawnDebugTrainingDummy(g),null);

const live=full.enemies.find(e=>e.trainingDummy);full.enemies=[live];full._spawn=Infinity;full.nextBossAt=Infinity;
advance(full,10);assert(Number.isFinite(live.hp)&&live.hp>0&&live.hp<live.maxHp,'the full attack loadout runs against real defended HP');
assert.equal(full.status,'playing');assert.equal(full.kills,0);assert.equal(full.gold,500);assert.equal(full.player.level,1);
assert(Number.isFinite(live.x)&&Number.isFinite(live.y));
console.log('Debug settings: independent switches, strict query parsing, capped valid full build without attribute grants, safe nearby training placement, real defense/standard push, passive contact, ally exclusion, no rewards and ten-second live combat passed.');
