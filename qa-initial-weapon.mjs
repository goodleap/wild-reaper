import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { CombatBuild } from './dist/combat-build.js';
import { INITIAL_WEAPON_IDS, WEAPON_DEFS, normalizeInitialWeaponId, canTakeUpgrade } from './dist/combat-catalog.js';
import { weaponStats, resolveCharacterStats } from './dist/combat-stats.js';
import { presentUpgrade } from './dist/upgrade-presentation.js';
import { AdventureArchive } from './dist/adventure-archive.js';
import { ARCHIVE_ENTRY_BY_ID } from './dist/archive-catalog.js';

let seed=820032;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function arena(options={}) {
  const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,...options});
  game.enemies=[];game.effects=[];game.events=[];game._spawn=Infinity;game.nextBossAt=Infinity;game._updatePressure=()=>{};
  game.player.x=0;game.player.y=0;game.player.xpNext=Infinity;game.crystalsNext=Infinity;
  return game;
}
function target(game,x) {
  const enemy=game._spawnEnemy('slime');Object.assign(enemy,{x,y:0,hp:10000,maxHp:10000,speed:0});game._rebuildGrid();return enemy;
}
function advance(game,duration) {
  const effects=new Set();
  for(let left=duration;left>1e-8;left-=.025){game.update(Math.min(.025,left));for(const effect of game.effects)effects.add(effect.type);}
  return effects;
}
function buy(game,id) {
  game.progressionTier=Math.max(5,game.progressionTier);game.crystals=40;game.crystalsNext=40;game.status='upgrade';
  for(let attempt=0;attempt<80;attempt++) {
    game._choices=null;const choice=game.getUpgradeChoices().find(choice=>choice.id===id);
    if(!choice)continue;
    const model=presentUpgrade(choice,game);assert.equal(model.action,'新获得');assert.equal(model.levelLabel,'获得 Lv.1');
    assert(game.chooseUpgrade(id));return;
  }
  assert.fail(`Missing acquisition offer: ${id}`);
}

assert.deepEqual(INITIAL_WEAPON_IDS,['sword','orbit','arrow']);
const baseline=new CombatBuild().serialize();
for(const bad of [undefined,null,'','missing','__proto__',1,{},['arrow']]) {
  assert.equal(normalizeInitialWeaponId(bad),'sword');
  assert.deepEqual(new CombatBuild({initialWeaponId:bad}).serialize(),baseline);
}
const invalidGame=arena({initialWeaponId:'missing'});assert.equal(invalidGame.initialWeaponId,'sword');
for(const initialWeaponId of INITIAL_WEAPON_IDS) {
  const game=arena({initialWeaponId}),build=game.build;
  assert.equal(game.initialWeaponId,initialWeaponId);
  assert.deepEqual(game.weapons.map(weapon=>weapon.id),[initialWeaponId]);
  assert.deepEqual(game.skills.map(skill=>skill.id),['storm']);
  assert.equal(build.getSkill('storm').baseRank,1);assert.equal(game.player.level,1);assert.equal(game.progressionTier,1);
  assert.equal(game.gold,0);assert.equal(game.crystals,0);assert.equal(resolveCharacterStats(game).attack,32);
  assert.deepEqual(build.attributes,baseline.attributes,'initial equipment grants no attributes');
  for(const id of INITIAL_WEAPON_IDS) {
    const state=build.getWeapon(id),selected=id===initialWeaponId;
    assert.equal(state.baseRank,selected?1:0);assert.equal(state.equipped,selected);assert.equal(state.branch,null);assert.equal(state.evolved,false);
    assert(Object.values(state.modifiers).every(rank=>rank===0));
    assert.match(ARCHIVE_ENTRY_BY_ID.get(`weapon:${id}`).source,/冒险准备.*灵晶/);
  }

  // A selected weapon is the only automatic attack, and reaches a real target.
  const victim=target(game,initialWeaponId==='sword'?55:initialWeaponId==='orbit'?74:160);
  const effects=advance(game,initialWeaponId==='arrow'?.55:.3);assert(victim.hp<10000,`${initialWeaponId} attacks without first earning a crystal`);
  assert.equal(victim.hitSource,initialWeaponId);
  assert.equal(effects.has('swordSlash'),initialWeaponId==='sword');
  assert.equal(game.orbitals.length>0,initialWeaponId==='orbit');
  assert.equal(game.events.some(event=>event.type==='shoot'),initialWeaponId==='arrow');

  // Upgrade previews use serialization; an unowned sword must remain at zero.
  const saved=build.serialize();assert.deepEqual(CombatBuild.fromSnapshot(structuredClone(saved)).serialize(),saved);
  const upgrade=initialWeaponId==='arrow'?'rapid':initialWeaponId;
  assert(canTakeUpgrade(build,upgrade));const preview=build.previewUpgrade(upgrade);assert(preview);
  assert.equal(preview.getRank(upgrade),build.getRank(upgrade)+1);assert.deepEqual(build.serialize(),saved);
  if(initialWeaponId!=='sword')assert.equal(preview.getWeapon('sword').baseRank,0);
  const route=CombatBuild.fromSnapshot(saved);
  if(initialWeaponId==='arrow') {
    for(let i=0;i<3;i++)assert(route.increment('rapid'));
    assert(route.selectBranch('arrow','pierce'));assert(route.increment('arrowRetention'));
  }else {
    while(route.getRank(initialWeaponId)<4)assert(route.increment(initialWeaponId));
    if(initialWeaponId==='sword'){assert(route.selectBranch('sword','sweep'));assert(route.increment('swordEnergy'));}
    else assert(route.increment('orbit'));
  }
  assert(CombatBuild.fromSnapshot(route.serialize()));

  const archive=new AdventureArchive({storage:null});archive.begin(game);
  assert(archive.data.entries[`weapon:${initialWeaponId}`]);assert(archive.data.entries['skill:storm']);
  for(const other of INITIAL_WEAPON_IDS.filter(id=>id!==initialWeaponId)) {
    assert.equal(archive.data.entries[`weapon:${other}`],undefined,'merely selectable does not count as owned');
    buy(game,other);assert.equal(game.build.getWeapon(other).baseRank,1);assert(game.build.isEquipped(other));
    assert(game.events.some(event=>event.type==='weaponAcquired'&&event.weaponId===other));
    archive.checkpoint(game);assert.equal(archive.data.entries[`weapon:${other}`].acquisitions,1);
  }
  assert.equal(game.initialWeaponId,initialWeaponId,'later acquisitions never rewrite restart equipment');
  const restart=arena({initialWeaponId:game.initialWeaponId});assert.deepEqual(restart.weapons.map(weapon=>weapon.id),[initialWeaponId]);

  const full=arena({initialWeaponId,debug:true,debugOptions:{fullLoadout:true}});assert.equal(full.initialWeaponId,initialWeaponId);
  assert.deepEqual(full.weapons.map(weapon=>weapon.id).sort(),[...INITIAL_WEAPON_IDS].sort());
  for(const id of INITIAL_WEAPON_IDS)assert.equal(full.build.getWeapon(id).baseRank,WEAPON_DEFS[id].maxBaseRank);
  assert.equal(full.build.getSkill('storm').baseRank,3);assert.equal(full.player.level,1);
  assert.equal(weaponStats(full,initialWeaponId).equipped,true);
}

// Old snapshots still receive their former defaults; only weapons now permit
// zero. The innate manual super keeps its validation and cannot disappear.
for(const version of [1,2]) {
  const old=structuredClone(baseline);old.version=version;
  assert.deepEqual(CombatBuild.fromSnapshot(old).serialize(),baseline);
  delete old.weapons.sword;assert.equal(CombatBuild.fromSnapshot(old).getWeapon('sword').baseRank,1);
}
const noStorm=structuredClone(baseline);noStorm.skills.storm.baseRank=0;
assert.throws(()=>CombatBuild.fromSnapshot(noStorm),/storm.baseRank/);
const negative=structuredClone(baseline);negative.weapons.sword.baseRank=-1;
assert.throws(()=>CombatBuild.fromSnapshot(negative),/sword.baseRank/);
console.log('Initial weapons: three real attacks, exactly one starting weapon, unchanged skills/resources, paid acquisitions and branches, snapshot previews/legacy validation, archive ownership and debug-full passed.');
