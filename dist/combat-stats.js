import { getConfigSection } from './content-config.js';
// Derived combat numbers. The reference attack preserves the existing game
// balance while giving the character an actual attack attribute. A weapon's
// base damage / reference attack is its coefficient, not another attack bonus.
import { getUpgradeDefinition } from './combat-catalog.js';
import { weaponKnockbackDistance } from './weapon-knockback.js';
import { applyHeroStat } from './heroes.js';

const CONFIG=getConfigSection('combat').stats;
const HERO_DEFAULTS=getConfigSection('heroes').defaults;
const RELIC_RULES=getConfigSection('economy').relicRules;
const WEAPON_RULES=CONFIG.weaponRules,SKILL_RULES=CONFIG.skillRules;
export const COMBAT_REFERENCE_ATTACK=CONFIG.referenceAttack;
export const CHARACTER_DEFENSE_PER_LEVEL=CONFIG.defensePerLevel;
export const defenseDamageMultiplier=defense=>CONFIG.defenseScale/(CONFIG.defenseScale+Math.max(0,defense||0));
export const defenseReduction=defense=>1-defenseDamageMultiplier(defense);
export const ATTACK_DEFAULTS=CONFIG.attackDefaults;
export const ORBIT_BLEED_RATIO=CONFIG.orbitBleedRatio;
const ORBIT_DAMAGE=CONFIG.orbitDamage;
const rank=(g,id)=>Math.max(0,g.build?.getRank?.(id)??g.levels?.[id]??0);
const boundedRank=(g,id,cap)=>Math.min(cap,rank(g,id));
// Catalog effects are the source of truth for every selectable modifier.
// Executable base formulas below describe the ability, not an upgrade card.
const effectTotal=(g,id,stat)=>{
  const def=getUpgradeDefinition(id);
  let perRank=0;
  for(const effect of def?.effects||[])if(effect.stat===stat&&effect.operation==='add')perRank+=effect.value;
  return Math.min(def?.cap??Infinity,rank(g,id))*perRank;
};
export { effectTotal as upgradeEffectTotal };

export function maxHealthGrowth(game) {
  return Math.max(0,game.player.level-1)*CONFIG.healthPerLevel+effectTotal(game,'vitality','maxHealth')+effectTotal(game,'endlessVitality','maxHealth');
}
export function resolveMaxHealth(game) {
  const base=game.player.baseMaxHp??(game.easy?HERO_DEFAULTS.easyBaseHealth:HERO_DEFAULTS.baseHealth);
  return Math.max(1,Math.round(applyHeroStat(game.hero,'maxHealth',base+maxHealthGrowth(game))));
}

export function resolveCharacterStats(game) {
  const p=game.player,hero=game.hero;
  const attack=applyHeroStat(hero,'attack',COMBAT_REFERENCE_ATTACK*(1+effectTotal(game,'power','damageBonus')+effectTotal(game,'endlessPower','damageBonus')+(game.rescuePower||0)*CONFIG.rescueDamageBonus+(p.level-1)*CONFIG.attackPerLevel));
  const attackMultiplier=attack/COMBAT_REFERENCE_ATTACK;
  const externalDamageMultiplier=(game.adventure?.damageMultiplier()??1)*(game.relics?.damageMultiplier()??1);
  const moveGrowth=1+effectTotal(game,'speed','moveSpeedBonus'),externalMoveMultiplier=(game.relics?.movementMultiplier()??1)*(game.debug?3:1);
  const moveMultiplier=moveGrowth*externalMoveMultiplier;
  return {
    attack,attackMultiplier,
    externalDamageMultiplier,damageMultiplier:attackMultiplier*externalDamageMultiplier,
    defense:Math.max(0,applyHeroStat(hero,'defense',(game.build?.attributes?.defense??0)+Math.max(0,p.level-1)*CHARACTER_DEFENSE_PER_LEVEL+effectTotal(game,'toughness','defense')+effectTotal(game,'endlessToughness','defense'))),
    // Critical attributes remain neutral until a real source grants them.
    criticalChance:0,criticalMultiplier:1,
    maxHp:p.maxHp,currentHp:p.hp,
    regen:effectTotal(game,'regen','healthRegen')+effectTotal(game,'endlessRegen','healthRegen'),
    moveSpeed:applyHeroStat(hero,'moveSpeed',HERO_DEFAULTS.baseMoveSpeed*moveGrowth)*externalMoveMultiplier,moveMultiplier,
    magnet:applyHeroStat(hero,'pickupRange',ATTACK_DEFAULTS.magnet*(1+effectTotal(game,'magnet','pickupRangeBonus'))),
    fireRate:1+effectTotal(game,'rapid','attackRateBonus'),
    stormCooldown:game.debug?0:hero.skillCooldown*(1-effectTotal(game,'storm','cooldownReduction'))
  };
}

// Apply character/global scaling exactly once. Local weapon and skill bonuses
// belong in their resolved baseDamage; a delayed echo/bleed copies final damage
// and must never pass its snapshot through this function for a second time.
export function scalePlayerDamage(game,base,{weaponId,skillId}={}) {
  if(!Number.isFinite(base)||base<=0)return 0;
  // These IDs label the source for callers; only its own resolver applies local
  // modifiers, so a weapon upgrade cannot leak into independent skill damage.
  void weaponId;void skillId;
  const stats=resolveCharacterStats(game);
  return base*stats.attack/COMBAT_REFERENCE_ATTACK*stats.externalDamageMultiplier;
}

export function weaponStats(game,id) {
  const equipped=game.build?.isEquipped?.(id)??(id==='arrow'||rank(game,id)>0);
  if(id==='sword') {
    const rules=WEAPON_RULES.sword;
    const level=Math.min(rules.maxRank,rank(game,id)),branch=game.build?.getWeapon?.(id)?.branch??game.branches?.sword??null;
    const heavy=branch==='heavy',sweep=branch==='sweep';
    const energyRank=level>=rules.energyAtRank?boundedRank(game,'swordEnergy',rules.energyMaxRank):0;
    const energy=getUpgradeDefinition('swordEnergy').rankBonuses[energyRank-1];
    const energyBonus=energy?.damageBonus||0,meleeRange=rules.meleeRange+level*rules.rangePerRank+(sweep?rules.sweep.rangeBonus:0);
    const baseDamage=(rules.baseDamage+level*rules.damagePerRank)*(heavy?rules.heavy.damageMultiplier:1)*(1+effectTotal(game,'swordMastery','baseDamageBonus')+energyBonus);
    const damage=scalePlayerDamage(game,baseDamage,{weaponId:id});
    return {id,level,equipped:equipped&&level>0,branch,energyRank,energyBonus,meleeRange,baseDamage,damage,
      energyCount:energy?.count||0,energySpread:energy?.spread||0,energySpeed:rules.energySpeed,energyDamage:energy?damage*rules.energyDamageRatio:0,
      interval:(rules.interval-Math.max(0,level-1)*rules.intervalReductionPerRank)*(heavy?rules.heavy.intervalMultiplier:1)-effectTotal(game,'swordMastery','intervalReduction'),
      range:meleeRange+(energy?.range||0),arc:heavy?rules.heavy.arc:sweep?rules.sweep.arc:rules.arc,windup:rules.windup,hitTime:rules.hitTime,duration:rules.duration,knockback:weaponKnockbackDistance(heavy?{distance:rules.heavy.knockback}:undefined)};
  }
  if(id==='arrow') {
    const rules=WEAPON_RULES.arrow;
    const branch=game.build?.getWeapon?.(id)?.branch??game.branches?.arrow??null;
    const reach=branch?effectTotal(game,'arrowReach','maxTargets'):0;
    const baseDamage=ATTACK_DEFAULTS.arrowDamage*(1+effectTotal(game,'arrowPower','baseDamageBonus'));
    const fireRate=(1+effectTotal(game,'rapid','attackRateBonus'))*(game.adventure?.fireRateMultiplier()??1);
    const runic=branch==='pierce'?boundedRank(game,'arrowRune',rules.runicMaxRank):0;
    const runicBaseDamage=runic?(rules.runicDamage+(runic-1)*rules.runicDamagePerRank)*(1+effectTotal(game,'arrowPower','baseDamageBonus')):0;
    return {id,equipped,branch,baseDamage,damage:scalePlayerDamage(game,baseDamage,{weaponId:id}),
      runic,runicBaseDamage,runicDamage:scalePlayerDamage(game,runicBaseDamage,{weaponId:id}),runicInterval:rules.runicInterval-Math.max(0,runic-1)*rules.runicIntervalReductionPerRank,
      interval:ATTACK_DEFAULTS.arrowInterval/fireRate,range:ATTACK_DEFAULTS.arrowRange,
      speed:ATTACK_DEFAULTS.arrowSpeed,life:ATTACK_DEFAULTS.arrowLife,knockback:weaponKnockbackDistance(),
      count:Math.min(ATTACK_DEFAULTS.maxArrowProjectiles,1+effectTotal(game,'multishot','projectileCount')),
      sideDamageMultiplier:ATTACK_DEFAULTS.arrowSideDamage,volleyTargetMultiplier:ATTACK_DEFAULTS.arrowVolleyTarget,
      targetLimit:branch?Math.min(ATTACK_DEFAULTS.maxArrowTargets,rules.branchTargets+reach):1,
      maxBounces:branch==='ricochet'?rules.ricochetBounces+reach:0,ricochetRange:rules.ricochetRange,ricochetMinimumLife:rules.ricochetMinimumLife,
      retention:branch ? rules.retention+effectTotal(game,'arrowRetention','damageRetention') : 1};
  }
  if(id==='orbit') {
    const rules=WEAPON_RULES.orbit;
    const level=Math.min(rules.maxRank,rank(game,'orbit'));
    const baseDamage=ORBIT_DAMAGE[level]*(1+effectTotal(game,'orbitPower','baseDamageBonus'));
    const damage=scalePlayerDamage(game,baseDamage,{weaponId:id});
    return {id,equipped:equipped&&level>0,level,baseDamage,damage,baseBleedDamage:baseDamage*ORBIT_BLEED_RATIO,bleedDamage:damage*ORBIT_BLEED_RATIO,
      count:rules.baseCount+Math.max(rules.minimumRankCount,level),radius:rules.radius+effectTotal(game,'orbitRadius','radius'),
      rotationSpeed:rules.rotationSpeed,propHitInterval:rules.propHitInterval,evolutionInterval:rules.evolutionInterval,evolutionDuration:rules.evolutionDuration,evolutionRange:rules.evolutionRange,knockback:weaponKnockbackDistance()};
  }
  return null;
}

export function skillStats(game,id) {
  const record=game.build?.getSkill?.(id),branch=record?.branch??game.branches?.[id]??null;
  if(id==='fireball'||id==='frostbolt') {
    const rules=SKILL_RULES[id],level=boundedRank(game,id,rules.maxRank);
    const values=rules.levels[Math.max(0,level-1)];
    const {damage:baseDamage,burnDamage:baseBurnDamage,...parameters}=values;
    return {id,level,owned:level>0,automatic:true,...parameters,baseDamage,damage:scalePlayerDamage(game,baseDamage,{skillId:id}),
      ...(baseBurnDamage===undefined?{}:{baseBurnDamage,burnDamage:scalePlayerDamage(game,baseBurnDamage,{skillId:id})})};
  }
  if(id==='barrier') {
    const rules=SKILL_RULES.barrier;
    const level=boundedRank(game,id,rules.maxRank),bonus=game.relics?.has?.('leafWard')===true;
    const healthFraction=rules.healthFraction+Math.max(0,level-1)*rules.healthFractionPerRank;
    return {id,level,owned:level>0,automatic:true,capacity:level>0?game.player.maxHp*healthFraction*(bonus?RELIC_RULES.barrierCapacityMultiplier:1):0,
      healthFraction:healthFraction*(bonus?RELIC_RULES.barrierCapacityMultiplier:1),cooldown:(rules.cooldown-Math.max(0,level-1)*rules.cooldownReductionPerRank)*(bonus?RELIC_RULES.barrierCooldownMultiplier:1),duration:rules.duration+Math.max(0,level-1)*rules.durationPerRank};
  }
  if(id==='storm') {
    const rules=SKILL_RULES.storm;
    const upgrades=boundedRank(game,'storm',rules.maxUpgradeRank),baseDamage=rules.damage*(1+effectTotal(game,'storm','baseDamageBonus'));
    return {id,level:1+upgrades,baseDamage,damage:scalePlayerDamage(game,baseDamage,{skillId:id}),cooldown:game.debug?0:game.hero.skillCooldown*(1-effectTotal(game,'storm','cooldownReduction')),manual:true,super:true};
  }
  if(id==='pulse') {
    const rules=SKILL_RULES.pulse;
    const level=Math.min(rules.maxRank,rank(game,id)),evolved=!!game.evolutions?.pulse,control=evolved&&branch==='control';
    const baseDamage=(rules.baseDamage+level*rules.damagePerRank)*(1+effectTotal(game,'pulseMastery','baseDamageBonus'));
    return {id,level,owned:level>0,branch,evolved,control,baseDamage,damage:scalePlayerDamage(game,baseDamage,{skillId:id}),
      cooldown:rules.cooldown-effectTotal(game,'pulseMastery','cooldownReduction'),radius:control?rules.controlRadius:rules.radius+level*rules.radiusPerRank,knockback:control?rules.controlKnockback:rules.knockback,controlDuration:rules.controlDuration,echo:evolved&&branch==='echoes',echoRadiusMultiplier:rules.echoRadiusMultiplier,echoRetention:rules.echoRetention,echoDelay:rules.echoDelay,echoKnockback:rules.echoKnockback};
  }
  if(id==='lightning') {
    const rules=SKILL_RULES.lightning;
    const level=Math.min(rules.maxRank,rank(game,id)),evolved=!!game.evolutions?.lightning,focus=evolved&&branch==='focus';
    const baseDamage=(rules.baseDamage+level*rules.damagePerRank)*(1+effectTotal(game,'lightningMastery','baseDamageBonus'));
    const primaryBaseDamage=baseDamage*(focus?rules.focusMultiplier:1);
    return {id,level,owned:level>0,branch,evolved,baseDamage,damage:scalePlayerDamage(game,baseDamage,{skillId:id}),
      primaryBaseDamage,primaryDamage:scalePlayerDamage(game,primaryBaseDamage,{skillId:id}),
      cooldown:rules.cooldown-effectTotal(game,'lightningMastery','cooldownReduction'),range:rules.range,chainRange:evolved&&branch==='chain'?rules.evolvedChainRange:rules.chainRange,
      targetLimit:evolved&&branch==='chain'?rules.evolvedTargetLimit+effectTotal(game,'lightningMastery','chainTargets'):rules.targetLimit,chainRetention:rules.chainRetention,fullDamageTargetCount:rules.fullDamageTargetCount,focus};
  }
  return null;
}
