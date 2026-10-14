import assert from 'node:assert/strict';
import { Game, xpCost } from './dist/engine.js';
import { HEROES, applyHeroStat } from './dist/heroes.js';
import { Terrain } from './dist/terrain.js';
import { LEVEL_CAPS } from './dist/combat-catalog.js';
import { resolveCharacterStats, skillStats, weaponStats } from './dist/combat-stats.js';
import { presentUpgrade } from './dist/upgrade-presentation.js';

let seed=840614;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const near=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-8,`${label}: ${actual} != ${expected}`);
function arena(options={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false,...options});
  g.enemies=[];g.gems=[];g.coins=[];g.events=[];g.effects=[];
  g._spawn=g.nextBossAt=g._shot=g._pulse=g._lightning=Infinity;g._updatePressure=()=>{};
  return g;
}
function purchase(g,id) {
  g.addCrystals(g.crystalsNext-g.crystals);assert(g.progression.tryUpgrade());
  let choice;
  for(let attempt=0;attempt<256&&!choice;attempt++) {
    g._choices=null;choice=g.getUpgradeChoices().find(entry=>entry.id===id);
  }
  assert(choice,`eligible upgrade ${id} must appear in the real offer pool`);
  const before={hp:g.player.hp,maxHp:g.player.maxHp,build:JSON.stringify(g.build.serialize())};
  const model=presentUpgrade(choice,g);
  assert.equal(JSON.stringify(g.build.serialize()),before.build,'preview never grants an upgrade');
  assert.equal(g.player.hp,before.hp);assert.equal(g.player.maxHp,before.maxHp);
  assert(g.chooseUpgrade(id));assert.equal(g.status,'playing');
  return {before,model};
}
function capRegular(g) {
  Object.assign(g.branches,{sword:'sweep',arrow:'pierce',pulse:'echoes',lightning:'chain'});
  Object.assign(g.levels,LEVEL_CAPS);g._syncEvolutions(false);g._refreshStats();
}
const expectedHealth={traveler:1.1,princess:1,elder:.85};
for(const hero of HEROES)for(const difficulty of ['normal','casual']) {
  const commonBase=difficulty==='casual'?140:100,multiplier=expectedHealth[hero.id];
  for(const [level,vitality,endless] of [[1,0,0],[2,0,0],[11,1,0],[51,5,20],[201,5,200]]) {
    const g=arena({hero:hero.id,difficulty});
    g.player.level=level;g.levels.vitality=vitality;g.levels.endlessVitality=endless;g._refreshStats();
    const expected=Math.round((commonBase+(level-1)*2+vitality*25+endless*12)*multiplier);
    assert.equal(g.player.baseMaxHp,commonBase,'common base is not already role-scaled');
    assert.equal(g.player.maxHp,expected,`${hero.id} ${difficulty} Lv${level} keeps health identity`);
    assert.equal(resolveCharacterStats(g).maxHp,expected);
    const prior=JSON.stringify({player:g.player,stats:resolveCharacterStats(g),build:g.build.serialize()});
    for(let refresh=0;refresh<8;refresh++)g._refreshStats();
    assert.equal(JSON.stringify({player:g.player,stats:resolveCharacterStats(g),build:g.build.serialize()}),prior,'refresh never compounds role growth');
  }

  // Both single and multi-level XP grants restore the actual rounded increase,
  // preserving the missing HP amount rather than rounding each level's bonus.
  for(const missing of [0,37.5]) {
    const g=arena({hero:hero.id,difficulty});g.player.hp-=missing;
    for(let level=2;level<=7;level++) {
      assert(g.addExperience(g.player.xpNext));assert.equal(g.player.level,level);
      near(g.player.maxHp-g.player.hp,missing,'individual level preserves missing health');
      assert.equal(g.player.maxHp,Math.round((commonBase+(level-1)*2)*multiplier));
    }
    const xp=Array.from({length:19},(_,index)=>xpCost(index+7)).reduce((sum,value)=>sum+value,0);
    assert(g.addExperience(xp));assert.equal(g.player.level,26);assert.equal(g.player.xp,0);
    near(g.player.maxHp-g.player.hp,missing,'multi-level grant preserves missing health');
    assert.equal(g.player.maxHp,Math.round((commonBase+50)*multiplier));
  }

  // Real crystal purchases use the same final values as their non-mutating
  // previews. Their explicit healing remains fixed, separate from capacity.
  for(const missing of [0,60]) {
    const g=arena({hero:hero.id,difficulty});g.progressionTier=2;g.player.level=11;
    g.player.hp=g.player.maxHp-missing;
    const {before,model}=purchase(g,'vitality');
    assert.equal(g.player.maxHp,Math.round((commonBase+20+25)*multiplier));
    const row=model.rows.find(row=>row.label==='最大生命');
    assert.equal(Number(row.before),before.maxHp);assert.equal(Number(row.after),g.player.maxHp);
    near(g.player.hp,Math.min(g.player.maxHp,before.hp+35),'vitality heals only its stated 35');
    assert.match(model.summary,new RegExp(`最大生命 ＋${g.player.maxHp-before.maxHp}，`));

    capRegular(g);g.player.hp=g.player.maxHp-missing;
    const late=purchase(g,'endlessVitality');
    assert.equal(g.player.maxHp,Math.round((commonBase+20+125+12)*multiplier));
    const lateRow=late.model.rows.find(row=>row.label==='最大生命');
    assert.equal(Number(lateRow.before),late.before.maxHp);assert.equal(Number(lateRow.after),g.player.maxHp);
    near(g.player.hp,Math.min(g.player.maxHp,late.before.hp+24),'endless vitality heals only its stated 24');
  }

  const debug=arena({hero:hero.id,difficulty,debug:true,debugOptions:{fullLoadout:true}});
  assert.equal(debug.player.maxHp,Math.round(commonBase*multiplier),'full debug does not erase role health');
  assert.equal(debug.levels.vitality,0);assert.equal(debug.levels.endlessVitality,0);
  near(debug.player.speed,hero.baseSpeed*3,'debug movement composes with role speed');
  debug.addExperience(xpCost(1));assert.equal(debug.player.hp,debug.player.maxHp);
}

// Exercise both mechanisms in the real stat resolver, not only the helper.
// A future role may combine a persistent factor and a flat amount on one stat.
const mixed=arena();
mixed.hero={...mixed.hero,statModifiers:{
  maxHealth:{multiplier:.9,fixed:20},attack:{multiplier:.8,fixed:7},
  defense:{multiplier:1.5,fixed:8},moveSpeed:{multiplier:1.2,fixed:11},pickupRange:{multiplier:1.25,fixed:13}
}};
assert.equal(applyHeroStat(mixed.hero,'maxHealth',100),110);
assert.equal(applyHeroStat(mixed.hero,'maxHealth',400),380);
assert.equal(applyHeroStat(null,'attack',32),32,'no role modifier is neutral');
mixed.player.level=21;mixed.levels.vitality=2;mixed.levels.endlessVitality=3;
mixed.levels.power=2;mixed.levels.endlessPower=3;mixed.rescuePower=2;
mixed.levels.toughness=2;mixed.levels.endlessToughness=3;mixed.build.attributes.defense=7;
mixed.levels.speed=2;mixed.levels.magnet=2;mixed._refreshStats();
let stats=resolveCharacterStats(mixed);
assert.equal(stats.maxHp,Math.round((100+40+50+36)*.9+20));
near(stats.attack,32*(1+.5+.24+.16+.2)*.8+7,'flat attack stays after shared growth');
near(stats.defense,(20+40+30+7)*1.5+8,'flat defense stays after shared growth');
near(stats.moveSpeed,220*1.16*1.2+11,'flat movement is not amplified by upgrade ranks');
near(stats.magnet,105*1.7*1.25+13,'flat pickup is not amplified by upgrade ranks');
near(weaponStats(mixed,'sword').damage,64*stats.attack/32,'real weapon uses the final role attack once');
near(skillStats(mixed,'storm').damage,160*stats.attack/32,'real skill uses the final role attack once');
mixed.adventure={damageMultiplier:()=>1.35};
mixed.relics={damageMultiplier:()=>1.2,movementMultiplier:()=>1.08};mixed.debug=true;
stats=resolveCharacterStats(mixed);
near(stats.moveSpeed,(220*1.16*1.2+11)*1.08*3,'external speed applies after intrinsic role stat');
near(weaponStats(mixed,'sword').damage,64*stats.attack/32*1.35*1.2,'external damage applies after intrinsic role stat');

// Legacy debug/tests set an effective HP cap directly. Its inverse setter must
// keep that meaning, even with both modifiers and existing level investments.
mixed.player.maxHp=333;assert.equal(mixed.player.maxHp,333);
mixed.player.hp=301;mixed._refreshStats();assert.equal(mixed.player.maxHp,333);assert.equal(mixed.player.hp,301);
mixed.player.level++;assert.equal(mixed.player.maxHp,335,'later growth remains role-scaled after an effective-cap assignment');

console.log('Hero growth: persistent early/late health, XP healing, real vitality purchases and previews, mixed fixed/multiplier stats, effective HP setter and debug composition passed.');
