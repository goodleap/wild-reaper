// Derived combat numbers. The reference attack preserves the existing game
// balance while giving the character an actual attack attribute. A weapon's
// base damage / reference attack is its coefficient, not another attack bonus.
import { getUpgradeDefinition } from './combat-catalog.js';
import { weaponKnockbackDistance } from './weapon-knockback.js';

export const COMBAT_REFERENCE_ATTACK=32;
export const CHARACTER_DEFENSE_PER_LEVEL=1;
export const defenseDamageMultiplier=defense=>100/(100+Math.max(0,defense||0));
export const defenseReduction=defense=>1-defenseDamageMultiplier(defense);
export const ATTACK_DEFAULTS=Object.freeze({arrowDamage:32,arrowInterval:.38,arrowRange:420,arrowSpeed:640,arrowLife:.82,arrowSideDamage:.45,arrowVolleyTarget:1.45,magnet:105,maxArrowTargets:4,maxArrowProjectiles:4});
export const ORBIT_BLEED_RATIO=.15;
const ORBIT_DAMAGE=Object.freeze([30,30,36,36,44,60]);
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

export function resolveCharacterStats(game) {
  const p=game.player,hero=game.hero;
  const attackMultiplier=1+effectTotal(game,'power','damageBonus')+effectTotal(game,'endlessPower','damageBonus')+(game.rescuePower||0)*.08+(p.level-1)*.01;
  const externalDamageMultiplier=(game.adventure?.damageMultiplier()??1)*(game.relics?.damageMultiplier()??1);
  const moveMultiplier=(1+effectTotal(game,'speed','moveSpeedBonus'))*(game.relics?.movementMultiplier()??1)*(game.debug?3:1);
  return {
    attack:COMBAT_REFERENCE_ATTACK*attackMultiplier,attackMultiplier,
    externalDamageMultiplier,damageMultiplier:attackMultiplier*externalDamageMultiplier,
    defense:Math.max(0,(game.build?.attributes?.defense??0)+Math.max(0,p.level-1)*CHARACTER_DEFENSE_PER_LEVEL+effectTotal(game,'toughness','defense')+effectTotal(game,'endlessToughness','defense')),
    // Critical attributes remain neutral until a real source grants them.
    criticalChance:0,criticalMultiplier:1,
    maxHp:p.maxHp,currentHp:p.hp,
    regen:effectTotal(game,'regen','healthRegen')+effectTotal(game,'endlessRegen','healthRegen'),
    moveSpeed:hero.baseSpeed*moveMultiplier,moveMultiplier,
    magnet:ATTACK_DEFAULTS.magnet*(1+effectTotal(game,'magnet','pickupRangeBonus')),
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
    const level=Math.min(5,rank(game,id)),branch=game.build?.getWeapon?.(id)?.branch??game.branches?.sword??null;
    const heavy=branch==='heavy',sweep=branch==='sweep';
    const energyRank=level>=3?boundedRank(game,'swordEnergy',3):0;
    const energy=getUpgradeDefinition('swordEnergy').rankBonuses[energyRank-1];
    const energyBonus=energy?.damageBonus||0,meleeRange=88+level*4+(sweep?18:0);
    const baseDamage=(54+level*10)*(heavy?1.85:1)*(1+effectTotal(game,'swordMastery','baseDamageBonus')+energyBonus);
    return {id,level,equipped:equipped&&level>0,branch,energyRank,energyBonus,meleeRange,baseDamage,damage:scalePlayerDamage(game,baseDamage,{weaponId:id}),
      interval:(.72-Math.max(0,level-1)*.025)*(heavy?1.38:1)-effectTotal(game,'swordMastery','intervalReduction'),
      range:meleeRange+(energy?.range||0),arc:heavy?1.5:sweep?2.8:1.95,windup:.065,hitTime:.115,duration:.28,knockback:weaponKnockbackDistance(heavy?{distance:20}:undefined)};
  }
  if(id==='arrow') {
    const branch=game.build?.getWeapon?.(id)?.branch??game.branches?.arrow??null;
    const reach=branch?effectTotal(game,'arrowReach','maxTargets'):0;
    const baseDamage=ATTACK_DEFAULTS.arrowDamage*(1+effectTotal(game,'arrowPower','baseDamageBonus'));
    const fireRate=(1+effectTotal(game,'rapid','attackRateBonus'))*(game.adventure?.fireRateMultiplier()??1);
    const runic=branch==='pierce'?boundedRank(game,'arrowRune',3):0;
    const runicBaseDamage=runic?(96+(runic-1)*30)*(1+effectTotal(game,'arrowPower','baseDamageBonus')):0;
    return {id,equipped,branch,baseDamage,damage:scalePlayerDamage(game,baseDamage,{weaponId:id}),
      runic,runicBaseDamage,runicDamage:scalePlayerDamage(game,runicBaseDamage,{weaponId:id}),runicInterval:4.2-Math.max(0,runic-1)*.3,
      interval:ATTACK_DEFAULTS.arrowInterval/fireRate,range:ATTACK_DEFAULTS.arrowRange,
      speed:ATTACK_DEFAULTS.arrowSpeed,life:ATTACK_DEFAULTS.arrowLife,knockback:weaponKnockbackDistance(),
      count:Math.min(ATTACK_DEFAULTS.maxArrowProjectiles,1+effectTotal(game,'multishot','projectileCount')),
      sideDamageMultiplier:ATTACK_DEFAULTS.arrowSideDamage,volleyTargetMultiplier:ATTACK_DEFAULTS.arrowVolleyTarget,
      targetLimit:branch?Math.min(ATTACK_DEFAULTS.maxArrowTargets,3+reach):1,
      maxBounces:branch==='ricochet'?2+reach:0,
      retention:branch ? .65+effectTotal(game,'arrowRetention','damageRetention') : 1};
  }
  if(id==='orbit') {
    const level=Math.min(5,rank(game,'orbit'));
    const baseDamage=ORBIT_DAMAGE[level]*(1+effectTotal(game,'orbitPower','baseDamageBonus'));
    const damage=scalePlayerDamage(game,baseDamage,{weaponId:id});
    return {id,equipped:equipped&&level>0,level,baseDamage,damage,baseBleedDamage:baseDamage*ORBIT_BLEED_RATIO,bleedDamage:damage*ORBIT_BLEED_RATIO,
      count:1+Math.max(1,level),radius:74+effectTotal(game,'orbitRadius','radius'),
      rotationSpeed:2.9,hitInterval:.42,knockback:weaponKnockbackDistance()};
  }
  return null;
}

export function skillStats(game,id) {
  const record=game.build?.getSkill?.(id),branch=record?.branch??game.branches?.[id]??null;
  if(id==='barrier') {
    const level=boundedRank(game,id,3),bonus=game.relics?.has?.('leafWard')===true;
    const healthFraction=.3+Math.max(0,level-1)*.075;
    return {id,level,owned:level>0,automatic:true,capacity:level>0?game.player.maxHp*healthFraction*(bonus?1.15:1):0,
      healthFraction:healthFraction*(bonus?1.15:1),cooldown:(15-Math.max(0,level-1)*1.5)*(bonus?.85:1),duration:2+Math.max(0,level-1)*.3};
  }
  if(id==='storm') {
    const upgrades=boundedRank(game,'storm',2),baseDamage=160*(1+effectTotal(game,'storm','baseDamageBonus'));
    return {id,level:1+upgrades,baseDamage,damage:scalePlayerDamage(game,baseDamage,{skillId:id}),cooldown:game.debug?0:game.hero.skillCooldown*(1-effectTotal(game,'storm','cooldownReduction')),manual:true,super:true};
  }
  if(id==='pulse') {
    const level=Math.min(5,rank(game,id)),evolved=!!game.evolutions?.pulse,control=evolved&&branch==='control';
    const baseDamage=(40+level*10)*(1+effectTotal(game,'pulseMastery','baseDamageBonus'));
    return {id,level,owned:level>0,branch,evolved,control,baseDamage,damage:scalePlayerDamage(game,baseDamage,{skillId:id}),
      cooldown:2.6-effectTotal(game,'pulseMastery','cooldownReduction'),radius:control?230:132+level*8,knockback:control?48:30,controlDuration:1.1,echo:evolved&&branch==='echoes'};
  }
  if(id==='lightning') {
    const level=Math.min(5,rank(game,id)),evolved=!!game.evolutions?.lightning,focus=evolved&&branch==='focus';
    const baseDamage=(38+level*10)*(1+effectTotal(game,'lightningMastery','baseDamageBonus'));
    const primaryBaseDamage=baseDamage*(focus?2.5:1);
    return {id,level,owned:level>0,branch,evolved,baseDamage,damage:scalePlayerDamage(game,baseDamage,{skillId:id}),
      primaryBaseDamage,primaryDamage:scalePlayerDamage(game,primaryBaseDamage,{skillId:id}),
      cooldown:2.8-effectTotal(game,'lightningMastery','cooldownReduction'),range:360,chainRange:evolved&&branch==='chain'?220:190,
      targetLimit:evolved&&branch==='chain'?7+effectTotal(game,'lightningMastery','chainTargets'):3,chainRetention:.85,focus};
  }
  return null;
}
