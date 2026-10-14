import { getConfigSection } from './content-config.js';
import { ENEMY_DEFS, enemyDefinition } from './enemy-definitions.js';

const content=getConfigSection('encounters');
export const ENCOUNTER_SEQUENCES=content.sequences;
export const WAVE_PATTERNS=content.wavePatterns;
export const SPECIAL_ENEMY_CAPS=content.specialEnemyCaps;
export const ENCOUNTER_CAPS=Object.freeze(Object.fromEntries(Object.entries(content.caps).map(([id,profile])=>[id,Object.freeze({...profile,limits:Object.freeze(Object.fromEntries(profile.limits.map(type=>[type,SPECIAL_ENEMY_CAPS[type]])))})])));
export const HUT_GUARD_PACKS=content.hutGuardPacks;
export const CASTLE_GUARD_PACKS=content.castleGuardPacks;
export const CASTLE_SIDE_PACKS=content.castleSidePacks;
export const ELITE_ELIGIBLE_TYPES=content.eliteEligibleTypes;
export const SPECIALIST_SPAWN_RULES=content.specialistSpawnRules;

function matches(rule,index,{time=0,enemies=[],counts=null}={}) {
  if(rule.index!=null&&index!==rule.index)return false;
  if(rule.every!=null&&index%rule.every!==rule.remainder)return false;
  if(rule.minTime!=null&&time<rule.minTime)return false;
  if(rule.underCap!=null&&(counts?.[rule.type]??enemies.filter(enemy=>enemy.type===rule.type&&enemy.hp>0).length)>=rule.underCap)return false;
  return true;
}
export function sequenceEnemyType(definition,index,context) {
  return definition.rules.find(rule=>matches(rule,index,context))?.type||definition.fallback;
}
export const arenaGuardType=index=>sequenceEnemyType(ENCOUNTER_SEQUENCES.arena,index);
export const rescueGuardType=(index,relic=false)=>sequenceEnemyType(ENCOUNTER_SEQUENCES[relic?'relicRescue':'rescue'],index);
export const settlementGuardType=index=>sequenceEnemyType(ENCOUNTER_SEQUENCES.settlement,index);
export const treasureGuardianType=(count,enemies)=>sequenceEnemyType(ENCOUNTER_SEQUENCES.treasureGuardian,count,{enemies});
export const waveEnemyType=(pattern,index,time)=>sequenceEnemyType(WAVE_PATTERNS[pattern]||WAVE_PATTERNS[2],index,{time});
export function hutGuardType(index,featureId=null) {
  return HUT_GUARD_PACKS[featureId]?.[index]||settlementGuardType(index);
}
export function castleRoomTypes(route,side=false) {
  return side?CASTLE_SIDE_PACKS[route>CASTLE_SIDE_PACKS.lateAfter?'late':'early']:CASTLE_GUARD_PACKS[Math.min(CASTLE_GUARD_PACKS.length-1,Math.max(0,route-2))];
}
export function cappedEncounterType(type,counts,profile='castle') {
  const {limits,fallback}=ENCOUNTER_CAPS[profile];
  return limits[type]!=null&&counts[type]>=limits[type]?fallback:type;
}

// JSON null explicitly means an unbounded upper roll, never a missing value.
export const ORDINARY_SPAWN_RULES=Object.freeze({...content.ordinarySpawnRules,specials:Object.freeze(content.ordinarySpawnRules.specials.map(rule=>Object.freeze({...rule,cap:SPECIAL_ENEMY_CAPS[rule.type],rollThrough:rule.rollThrough===null?Infinity:rule.rollThrough})))});

// Preserve the baseline world's cumulative intervals and their historical
// overlap. Other worlds use the same unlocked bands with regional weights.
export function ordinaryEnemyType(game,roll) {
  const specialist=specialistEnemyRoll(game,roll);
  if(specialist.type)return specialist.type;
  roll=specialist.roll;
  const rules=ORDINARY_SPAWN_RULES,t=game._difficultyTime?.()??game.time,late=Math.max(0,t-rules.lateAfter)/rules.latePeriod;
  const brute=t>rules.brute.after?Math.min(rules.brute.max,rules.brute.base+late*rules.brute.growth):0;
  const batCurve=Math.min(rules.bat.max,rules.bat.base+late*rules.bat.growth);
  const bat=t>rules.bat.after?batCurve:0;
  const beetle=t>rules.beetle.after?Math.max(rules.beetle.min,batCurve+rules.beetle.offset):0;
  const specialWeights={};
  for(const item of rules.specials)specialWeights[item.type]=t>=item.at&&game.enemies.filter(enemy=>enemy.type===item.type&&enemy.hp>0).length<item.cap?item.weight:0;
  if(game.region.id===rules.baselineWorld) {
    let type=roll<brute?'brute':roll<bat?'bat':roll<beetle?'beetle':rules.fallback;
    for(const item of rules.specials)if(specialWeights[item.type]&&roll>item.rollAbove&&roll<=item.rollThrough){type=item.type;break;}
    return type;
  }
  // The subtraction order is stable, including at exact roll boundaries.
  let slimeWeight=1-beetle;for(const weight of Object.values(specialWeights))slimeWeight-=weight;
  const weights={brute,bat:Math.max(0,bat-brute),beetle:Math.max(0,beetle-bat),slime:Math.max(.01,slimeWeight),...specialWeights};
  let total=0;for(const type of Object.keys(weights)){weights[type]*=game.region.enemyWeights[type];total+=weights[type];}
  let cursor=roll*total;
  for(const [type,weight] of Object.entries(weights)){cursor-=weight;if(cursor<0)return type;}
  return rules.fallback;
}

export function specialistEnemyRoll(game,roll){
  const rules=SPECIALIST_SPAWN_RULES,time=game._difficultyTime?.()??game.time;
  let total=0,alive=0;const counts={};
  // Live targets also include training fixtures outside the monster catalog.
  // Only catalogued specialist monsters consume these spawn limits.
  for(const enemy of game.enemies)if(enemy.hp>0&&ENEMY_DEFS[enemy.type]?.behavior==='specialist'){alive++;counts[enemy.type]=(counts[enemy.type]||0)+1;}
  if(alive>=rules.globalCap)return {roll};
  const choices=[];
  for(const entry of rules.entries){
    if(time<entry.at||(counts[entry.type]||0)>=SPECIAL_ENEMY_CAPS[entry.type])continue;
    const weight=entry.weight*(game.region.enemyWeights[entry.type]||0);
    if(weight>0){choices.push([entry.type,weight]);total+=weight;}
  }
  const chance=Math.min(rules.maxChance,total);
  if(chance>0&&roll<chance){let cursor=roll/chance*total;for(const[type,weight]of choices){cursor-=weight;if(cursor<0)return {type};}}
  return {roll:chance>0?(roll-chance)/(1-chance):roll};
}

export function validateSpawnCatalog(regions=[]) {
  const checkSequence=definition=>{enemyDefinition(definition.fallback);for(const rule of definition.rules)enemyDefinition(rule.type);};
  for(const definition of [...Object.values(ENCOUNTER_SEQUENCES),...WAVE_PATTERNS])checkSequence(definition);
  for(const list of [...Object.values(HUT_GUARD_PACKS),...CASTLE_GUARD_PACKS,CASTLE_SIDE_PACKS.early,CASTLE_SIDE_PACKS.late,ELITE_ELIGIBLE_TYPES])for(const type of list)enemyDefinition(type);
  for(const profile of Object.values(ENCOUNTER_CAPS)){enemyDefinition(profile.fallback);for(const type of Object.keys(profile.limits))enemyDefinition(type);}
  for(const special of ORDINARY_SPAWN_RULES.specials)enemyDefinition(special.type);
  for(const special of SPECIALIST_SPAWN_RULES.entries)enemyDefinition(special.type);
  const ordinaryTypes=['brute','bat','beetle','slime',...ORDINARY_SPAWN_RULES.specials.map(item=>item.type)];
  for(const region of regions) {
    const weights=region.enemyWeights;
    if(!weights||typeof weights!=='object')throw new TypeError(`Missing enemy weights: ${region.id}`);
    for(const [type,weight] of Object.entries(weights)) {
      enemyDefinition(type);
      if(!Number.isFinite(weight)||weight<0)throw new TypeError(`Invalid enemy weight: ${region.id}/${type}`);
    }
    let total=0;
    for(const type of ordinaryTypes) {
      if(!Object.hasOwn(weights,type))throw new TypeError(`Missing enemy weight: ${region.id}/${type}`);
      const weight=weights[type];
      if(!Number.isFinite(weight)||weight<0)throw new TypeError(`Invalid enemy weight: ${region.id}/${type}`);
      total+=weight;
    }
    if(!Number.isFinite(total)||total<=0)throw new TypeError(`Invalid ordinary enemy weight total: ${region.id}`);
  }
  return true;
}
validateSpawnCatalog();
