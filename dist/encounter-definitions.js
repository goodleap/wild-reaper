import { enemyDefinition } from './enemy-definitions.js';

const frozenList=items=>Object.freeze(items);
const rule=(type,condition={})=>Object.freeze({type,...condition});
const sequence=(id,fallback,rules=[],extra={})=>Object.freeze({id,fallback,rules:frozenList(rules),...extra});

// Ordered rules preserve authored formations without consuming random rolls.
export const ENCOUNTER_SEQUENCES=Object.freeze({
  arena:sequence('arena','slime',[rule('brute',{every:8,remainder:0}),rule('beetle',{every:3,remainder:0})]),
  rescue:sequence('rescue','slime',[rule('beetle',{every:3,remainder:0})]),
  relicRescue:sequence('relicRescue','slime',[rule('brute',{every:4,remainder:0}),rule('beetle',{every:3,remainder:0})]),
  settlement:sequence('settlement','beetle',[rule('brute',{index:0})]),
  treasureRunner:sequence('treasureRunner','beetle'),
  eliteSummon:sequence('eliteSummon','slime'),
  treasureGuardian:sequence('treasureGuardian','brute',[rule('boar',{every:2,remainder:0,underCap:5})])
});
export const WAVE_PATTERNS=frozenList([
  sequence('advance','slime',[rule('brute',{every:5,remainder:4,minTime:60}),rule('beetle',{every:3,remainder:0})],{name:'兽群推进'}),
  sequence('wings','bat',[rule('beetle',{every:3,remainder:2})],{name:'疾翼掠袭'}),
  sequence('pincer','slime',[rule('boar',{every:5,remainder:0,minTime:30}),rule('spore',{every:5,remainder:4,minTime:45}),rule('beetle',{every:3,remainder:1})],{name:'冲锋夹击'})
]);
export const SPECIAL_ENEMY_CAPS=Object.freeze({boar:5,spore:4});
export const ENCOUNTER_CAPS=Object.freeze({
  wave:Object.freeze({limits:SPECIAL_ENEMY_CAPS,fallback:'beetle'}),
  castle:Object.freeze({limits:SPECIAL_ENEMY_CAPS,fallback:'bat'})
});
export const HUT_GUARD_PACKS=Object.freeze({
  default:frozenList(['brute','beetle','beetle','beetle']),
  shipwreck:frozenList(['brute','beetle','beetle','bat','beetle','slime']),
  mine:frozenList(['brute','beetle','beetle','brute','beetle'])
});
export const CASTLE_GUARD_PACKS=frozenList([
  frozenList(['slime','slime','beetle','bat']),
  frozenList(['beetle','slime','beetle','slime','spore']),
  frozenList(['slime','beetle','slime','beetle','boar']),
  frozenList(['beetle','slime','beetle','brute','spore']),
  frozenList(['slime','beetle','beetle','slime','boar','spore'])
]);
export const CASTLE_SIDE_PACKS=Object.freeze({
  early:frozenList(['beetle','slime','beetle','bat']),
  late:frozenList(['beetle','slime','beetle','boar']),
  lateAfter:4
});
export const ELITE_ELIGIBLE_TYPES=frozenList(['slime','beetle','brute']);
export const DEBUG_WAVE_TYPES=frozenList(['slime','beetle','slime','brute','beetle','slime']);

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

export const ORDINARY_SPAWN_RULES=Object.freeze({
  fallback:'slime',baselineWorld:'forest',lateAfter:150,latePeriod:60,
  brute:Object.freeze({after:60,max:.15,base:.07,growth:.006}),
  bat:Object.freeze({after:23,max:.8,base:.35,growth:.033}),
  beetle:Object.freeze({after:12,min:.65,offset:.1}),
  specials:frozenList([
    Object.freeze({type:'boar',at:30,cap:SPECIAL_ENEMY_CAPS.boar,weight:.06,rollAbove:.89,rollThrough:.95}),
    Object.freeze({type:'spore',at:45,cap:SPECIAL_ENEMY_CAPS.spore,weight:.05,rollAbove:.95,rollThrough:Infinity})
  ])
});

// Preserve the baseline world's cumulative intervals and their historical
// overlap. Other worlds use the same unlocked bands with regional weights.
export function ordinaryEnemyType(game,roll) {
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

export function validateSpawnCatalog(regions=[]) {
  const checkSequence=definition=>{enemyDefinition(definition.fallback);for(const rule of definition.rules)enemyDefinition(rule.type);};
  for(const definition of [...Object.values(ENCOUNTER_SEQUENCES),...WAVE_PATTERNS])checkSequence(definition);
  for(const list of [...Object.values(HUT_GUARD_PACKS),...CASTLE_GUARD_PACKS,CASTLE_SIDE_PACKS.early,CASTLE_SIDE_PACKS.late,ELITE_ELIGIBLE_TYPES,DEBUG_WAVE_TYPES])for(const type of list)enemyDefinition(type);
  for(const profile of Object.values(ENCOUNTER_CAPS)){enemyDefinition(profile.fallback);for(const type of Object.keys(profile.limits))enemyDefinition(type);}
  for(const special of ORDINARY_SPAWN_RULES.specials)enemyDefinition(special.type);
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
