// Data contracts are independent of runtime imports and never execute content.
const fail=(path,message)=>{throw new TypeError(`Content config ${path}: ${message}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path,'expected an object');return value;};
const array=(value,path,min=0,max=1000)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(path,`expected ${min}..${max} entries`);return value;};
const number=(value,path,min=0,max=1e6)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path,`expected a finite number in ${min}..${max}`);};
const integer=(value,path,min=0,max=1000)=>{number(value,path,min,max);if(!Number.isInteger(value))fail(path,'expected an integer');};
const string=(value,path)=>{if(typeof value!=='string'||!value.length||value.length>2000)fail(path,'expected a nonempty string');};
const reference=(value,keys,path)=>{if(!keys.has(value))fail(path,`unknown reference ${String(value)}`);};
const requireKeys=(value,keys,path)=>{object(value,path);for(const key of keys)if(!Object.hasOwn(value,key))fail(path,`missing ${key}`);};
const numeric=(value,keys,path,min=0)=>{requireKeys(value,keys.split(' '),path);for(const key of keys.split(' '))number(value[key],`${path}.${key}`,min);};
const positive=(value,keys,path)=>numeric(value,keys,path,.000001);
const refs=(values,keys,path,min=0)=>{for(const item of array(values,path,min))reference(item,keys,path);};
const unique=(values,path)=>{if(new Set(values).size!==values.length)fail(path,'duplicate ID');};
const specialistIds=['rootbinder','boglurker','prismguard','tidepriest','shieldguard','stoneape','windhunter','frostmage','flamelizard'];
const enemyBehaviors=new Set(['chase','boar','spore','boss','specialist']);
const enemyVisuals=new Set(['slime','bat','beetle','brute','boar','spore','boss','ancient','bloom','spiderling',...specialistIds,'broodmother','deepcaller','frostcrown','furnace']);
const bossBehaviors=new Set(['ancient','bloom','broodmother','deepcaller','frostcrown','furnace']);
const affixBehaviors=new Set(['shield','swift','summoner']);
const codex=(value,path)=>{object(value,path);for(const key of ['role','description','advice','color','source'])string(value[key],`${path}.${key}`);};

export function validateEnemies(sections){
  const enemies=object(sections.enemies,'enemies'),encounters=object(sections.encounters,'encounters'),difficulty=object(sections.difficulty,'difficulty');
  const definitions=object(enemies.definitions,'enemies.definitions'),enemyIds=new Set(Object.keys(definitions));
  for(const id of ['slime','beetle','bat','brute','boar','spore','boss'])reference(id,enemyIds,'enemies.definitions');
  for(const [id,def] of Object.entries(definitions)){
    const path=`enemies.definitions.${id}`;object(def,path);if(def.id!==id)fail(path,'key and stable ID must match');
    positive(def,'r baseHp baseSpeed',path);numeric(def,'damage xp',path);
    if(def.easyHp!==undefined)number(def.easyHp,`${path}.easyHp`,.000001);
    reference(def.movement,new Set(['ground','air']),`${path}.movement`);reference(def.behavior,enemyBehaviors,`${path}.behavior`);reference(def.visual,enemyVisuals,`${path}.visual`);
    if(def.behavior==='specialist'&&(!specialistIds.includes(def.specialist)||def.specialist!==id))fail(path,'invalid specialist profile');
    if(def.locomotion!==undefined&&typeof def.locomotion!=='boolean')fail(path,'locomotion must be boolean');
    if(def.ranged!==undefined&&typeof def.ranged!=='boolean')fail(path,'ranged must be boolean');
    for(const key of ['wobble','surge'])if(def[key])numeric(def[key],'frequency amplitude',`${path}.${key}`);
    if(def.codex){codex(def.codex,`${path}.codex`);string(def.codex.name,`${path}.codex.name`);}
  }
  refs(enemies.codexIds,enemyIds,'enemies.codexIds',1);unique(enemies.codexIds,'enemies.codexIds');for(const id of enemies.codexIds)if(!definitions[id].codex)fail('enemies.codexIds',`missing codex ${id}`);
  const bosses=object(enemies.bosses,'enemies.bosses'),bossIds=new Set(Object.keys(bosses));
  for(const id of bossBehaviors)reference(id,bossIds,'enemies.bosses');
  for(const [id,def] of Object.entries(bosses)){
    const path=`enemies.bosses.${id}`;object(def,path);if(def.id!==id)fail(path,'key and ID must match');string(def.name,`${path}.name`);
    if(def.canTargetAir!==undefined&&typeof def.canTargetAir!=='boolean')fail(path,'canTargetAir must be boolean');
    reference(def.behavior,bossBehaviors,`${path}.behavior`);reference(def.visual,enemyVisuals,`${path}.visual`);codex(def.codex,`${path}.codex`);object(def.parameters,`${path}.parameters`);
    for(const [key,value] of Object.entries(def.parameters))if(!['name','bulletColor','summonType'].includes(key))number(value,`${path}.parameters.${key}`);
    if(def.parameters.summonType!==undefined)reference(def.parameters.summonType,enemyIds,`${path}.parameters.summonType`);
  }
  positive(bosses.ancient.parameters,'range radius windup cooldown recovery damageMultiplier','enemies.bosses.ancient.parameters');
  const bloom=bosses.bloom.parameters;positive(bloom,'range preferredMin preferredMax cooldown enragedCooldown recovery fanWindup fanSpread bulletSpeed bulletLife burstWindup burstRadius burstSpacing initialCooldown retreatRange retreatDuration retreatCooldown retreatDistance bulletRadius','enemies.bosses.bloom.parameters');
  validateSpecialistBosses(bosses);
  numeric(bloom,'enragedHealthRatio advanceSpeedMultiplier retreatSpeedMultiplier bulletDamageMultiplier burstDamageMultiplier','enemies.bosses.bloom.parameters');
  number(bloom.enragedHealthRatio,'enemies.bosses.bloom.parameters.enragedHealthRatio',0,1);integer(bloom.fanCount,'enemies.bosses.bloom.parameters.fanCount',3,31);if(bloom.fanCount%2!==1)fail('enemies.bosses.bloom.parameters.fanCount','must be odd');integer(bloom.maxEnemyBullets,'enemies.bosses.bloom.parameters.maxEnemyBullets',1,1000);string(bloom.bulletColor,'enemies.bosses.bloom.parameters.bulletColor');if(bloom.preferredMin>bloom.preferredMax)fail('enemies.bosses.bloom.parameters','invalid preferred range');
  refs(enemies.bossRotation,bossIds,'enemies.bossRotation',1);
  const behavior=object(enemies.behaviorRules,'enemies.behaviorRules');
  positive(behavior.boar,'speed rushLife stunLife minRange maxRange windup chargeLength cooldown damageMultiplier','enemies.behaviorRules.boar');if(behavior.boar.minRange>behavior.boar.maxRange)fail('enemies.behaviorRules.boar','invalid charge range');
  positive(behavior.spore,'range holdRange releaseRange windup cooldown bulletSpeed bulletLife bulletRadius','enemies.behaviorRules.spore');string(behavior.spore.color,'enemies.behaviorRules.spore.color');
  validateSpecialists(enemies,sections);
  const elite=object(enemies.elite,'enemies.elite');numeric(elite.rules,'startAt chance cap health scale xp shield range swiftWindup swiftDuration swiftSpeed swiftCooldown summonWindup summonCooldown summonCount summonOwnerCap summonGlobalCap enemyCap swiftInitialCooldown otherInitialCooldown cancelCooldown summonAttempts summonStartRadius summonRingStep summonRingSlots summonPlayerClearance','enemies.elite.rules');
  number(elite.rules.chance,'enemies.elite.rules.chance',0,1);positive(elite.rules,'health scale swiftDuration swiftCooldown summonCooldown summonRingSlots','enemies.elite.rules');for(const key of ['cap','summonCount','summonOwnerCap','summonGlobalCap','enemyCap','summonAttempts','summonRingSlots'])integer(elite.rules[key],`enemies.elite.rules.${key}`,1,1000);
  requireKeys(elite.affixes,[...affixBehaviors],'enemies.elite.affixes');for(const [id,affix] of Object.entries(elite.affixes)){reference(id,affixBehaviors,'enemies.elite.affixes');object(affix,`enemies.elite.affixes.${id}`);if(affix.id!==id)fail('enemies.elite.affixes','key and ID must match');string(affix.name,'enemies.elite.affixes.name');string(affix.color,'enemies.elite.affixes.color');}
  validateEncounters(encounters,enemyIds);
  validateDifficulty(difficulty,encounters,enemyIds);
  return true;
}
function validateSpecialistBosses(bosses){
  const required={
    broodmother:'preferredRange domainRange summonRange leapRange initialCooldown cooldown recovery cycleRecovery windup domainRadius domainDuration domainDamage summonCount summonCap summonGlobalCap summonAttempts summonRadius summonClearance enemyCap leapRadius leapDuration leapDamage moveMultiplier',
    deepcaller:'preferredRange strikeRange vortexRange waveActivationRange waveRange initialCooldown cooldown recovery cycleRecovery windup strikeRadius strikeSpacing strikeInterval strikeDamage vortexRadius vortexDuration vortexDamage waveGap waveWidth waveSpeed waveDuration waveDamage moveMultiplier',
    frostcrown:'preferredRange fanRange boltRange chargeRange chargeLength shatterRange frostRange initialCooldown cooldown recovery cycleRecovery windup fanCount fanSpread fanDamage fanSpeed chargeSpeed chargeDuration chargeDamage markRadius markSpacing markCap markLife markDamage shatterDelay shatterInterval frostRadius frostDamage moveMultiplier',
    furnace:'preferredRange marchRange marchLength eruptionRange fireballActivationRange fireballRange flameActivationRange initialCooldown cooldown recovery cycleRecovery windup marchDuration marchSpeedMultiplier markRadius markSpacing markCap markLife markDamage eruptionDelay eruptionInterval fireballDamage flameDamage flameRange flameDuration flameSpread moveMultiplier'
  };
  const activation={broodmother:['domainRange','summonRange','leapRange'],deepcaller:['strikeRange','vortexRange','waveActivationRange'],frostcrown:['fanRange','chargeRange','shatterRange','frostRange'],furnace:['marchRange','eruptionRange','fireballActivationRange','flameActivationRange']};
  for(const[id,keys]of Object.entries(required)){
    const p=bosses[id].parameters,path=`enemies.bosses.${id}.parameters`;positive(p,keys,path);
    if(p.preferredRange>Math.max(...activation[id].map(key=>p[key])))fail(path,'preferred range exceeds every attack activation range');
    for(const key of ['summonCount','summonCap','summonGlobalCap','summonAttempts','enemyCap','fanCount','markCap'])if(p[key]!==undefined)integer(p[key],`${path}.${key}`,1,500);
    if(p.fanCount>9||p.markCap>12)fail(path,'excessive simultaneous attacks');
  }
  string(bosses.broodmother.parameters.summonType,'enemies.bosses.broodmother.parameters.summonType');
}
function validateSpecialists(enemies,sections){
  const rules=object(enemies.specialistRules,'enemies.specialistRules');
  requireKeys(rules,specialistIds,'enemies.specialistRules');
  const abilities=new Set(['vineTrap','beam','waterBolt','stoneLob','windSlash','frostbolt','shortFlame']);
  for(const [id,rule]of Object.entries(rules)){
    const path=`enemies.specialistRules.${id}`;reference(id,new Set(specialistIds),path);reference(id,new Set(Object.keys(enemies.definitions)),path);
    reference(rule.mode,new Set(['cast','fan','pounce','strafe','shield']),`${path}.mode`);
    positive(rule,'range cooldown windup recovery initialCooldown damageMultiplier',path);number(rule.holdRange,`${path}.holdRange`,0,rule.range);
    if(['cast','fan','strafe'].includes(rule.mode))reference(rule.abilityId,abilities,`${path}.abilityId`);
    for(const[key,value]of Object.entries(rule))if(!['mode','abilityId'].includes(key))number(value,`${path}.${key}`);
    if(rule.mode==='fan'){integer(rule.count,`${path}.count`,2,7);number(rule.spread,`${path}.spread`,.1,Math.PI);}
    if(['cast','fan','strafe'].includes(rule.mode))positive(rule,'abilityRange',path);
    if(rule.mode==='pounce')positive(rule,'minRange duration speed travelDistance',path);
    if(rule.mode==='strafe')positive(rule,'duration speed projectileSpeed projectileDuration',path);
    if(rule.mode==='shield'){positive(rule,'duration speedMultiplier turnSpeed frontHalfAngle frontDamageMultiplier',path);number(rule.frontDamageMultiplier,`${path}.frontDamageMultiplier`,.1,1);number(rule.frontHalfAngle,`${path}.frontHalfAngle`,.1,Math.PI*.75);}
  }
  for(const world of sections.worlds.definitions){
    let types=0;for(const id of specialistIds){number(world.enemyWeights[id],`world ${world.id}.enemyWeights.${id}`,0,5);if(world.enemyWeights[id]>0)types++;}
    if(types>2)fail(`world ${world.id}.enemyWeights`,'at most two specialist types per theme');
  }
}
function validateEncounters(c,enemyIds){
  const sequence=(s,path)=>{
    object(s,path);string(s.id,`${path}.id`);reference(s.fallback,enemyIds,`${path}.fallback`);
    for(const rule of array(s.rules,`${path}.rules`,0,100)){
      object(rule,`${path}.rules`);reference(rule.type,enemyIds,`${path}.rules.type`);
      for(const key of Object.keys(rule))if(!['type','index','every','remainder','minTime','underCap'].includes(key))fail(`${path}.rules`, `unsupported condition ${key}`);
      if(rule.index!==undefined)integer(rule.index,`${path}.rules.index`);
      if(rule.every!==undefined){integer(rule.every,`${path}.rules.every`,1);integer(rule.remainder,`${path}.rules.remainder`,0,rule.every-1);}
      if(rule.minTime!==undefined)number(rule.minTime,`${path}.rules.minTime`);
      if(rule.underCap!==undefined)integer(rule.underCap,`${path}.rules.underCap`,1);
    }
  };
  requireKeys(c.sequences,['arena','rescue','relicRescue','settlement','treasureRunner','eliteSummon','treasureGuardian'],'encounters.sequences');for(const [id,s] of Object.entries(c.sequences)){sequence(s,`encounters.sequences.${id}`);if(s.id!==id)fail('encounters.sequences','key and ID must match');}
  const patterns=array(c.wavePatterns,'encounters.wavePatterns',3,100);unique(patterns.map(s=>s.id),'encounters.wavePatterns');for(const s of patterns){sequence(s,'encounters.wavePatterns');string(s.name,'encounters.wavePatterns.name');}
  requireKeys(c.specialEnemyCaps,['boar','spore'],'encounters.specialEnemyCaps');for(const [id,value] of Object.entries(c.specialEnemyCaps)){reference(id,enemyIds,'encounters.specialEnemyCaps');integer(value,`encounters.specialEnemyCaps.${id}`,1);}
  requireKeys(c.caps,['wave','castle'],'encounters.caps');for(const [id,profile] of Object.entries(c.caps)){reference(profile.fallback,enemyIds,`encounters.caps.${id}.fallback`);refs(profile.limits,new Set(Object.keys(c.specialEnemyCaps)),`encounters.caps.${id}.limits`,1);unique(profile.limits,`encounters.caps.${id}.limits`);}
  requireKeys(c.hutGuardPacks,['default','shipwreck','mine'],'encounters.hutGuardPacks');for(const [id,pack] of Object.entries(c.hutGuardPacks))refs(pack,enemyIds,`encounters.hutGuardPacks.${id}`,1);
  for(const pack of array(c.castleGuardPacks,'encounters.castleGuardPacks',1))refs(pack,enemyIds,'encounters.castleGuardPacks',1);
  object(c.castleSidePacks,'encounters.castleSidePacks');refs(c.castleSidePacks.early,enemyIds,'encounters.castleSidePacks.early',1);refs(c.castleSidePacks.late,enemyIds,'encounters.castleSidePacks.late',1);integer(c.castleSidePacks.lateAfter,'encounters.castleSidePacks.lateAfter');
  refs(c.eliteEligibleTypes,enemyIds,'encounters.eliteEligibleTypes',1);
  const spawn=object(c.ordinarySpawnRules,'encounters.ordinarySpawnRules');reference(spawn.fallback,enemyIds,'encounters.ordinarySpawnRules.fallback');string(spawn.baselineWorld,'encounters.ordinarySpawnRules.baselineWorld');numeric(spawn,'lateAfter','encounters.ordinarySpawnRules');positive(spawn,'latePeriod','encounters.ordinarySpawnRules');
  numeric(spawn.brute,'after max base growth','encounters.ordinarySpawnRules.brute');numeric(spawn.bat,'after max base growth','encounters.ordinarySpawnRules.bat');numeric(spawn.beetle,'after min offset','encounters.ordinarySpawnRules.beetle');
  for(const rule of array(spawn.specials,'encounters.ordinarySpawnRules.specials',1,30)){reference(rule.type,enemyIds,'encounters.ordinarySpawnRules.specials.type');number(rule.at,'encounters.ordinarySpawnRules.specials.at');reference(rule.type,new Set(Object.keys(c.specialEnemyCaps)),'encounters.ordinarySpawnRules.specials.type');number(rule.weight,'encounters.ordinarySpawnRules.specials.weight',0,1);number(rule.rollAbove,'encounters.ordinarySpawnRules.specials.rollAbove',0,1);if(rule.rollThrough!==null)number(rule.rollThrough,'encounters.ordinarySpawnRules.specials.rollThrough',rule.rollAbove,1);if(rule.rollThrough===undefined)fail('encounters.ordinarySpawnRules.specials','rollThrough is required; null means unbounded');}
  const specialists=object(c.specialistSpawnRules,'encounters.specialistSpawnRules');integer(specialists.globalCap,'encounters.specialistSpawnRules.globalCap',1,16);number(specialists.maxChance,'encounters.specialistSpawnRules.maxChance',0,.35);
  unique(array(specialists.entries,'encounters.specialistSpawnRules.entries',1,30).map(x=>x.type),'encounters.specialistSpawnRules.entries');
  for(const entry of specialists.entries){reference(entry.type,new Set(specialistIds),'specialist type');reference(entry.type,new Set(Object.keys(c.specialEnemyCaps)),'specialist cap');number(entry.at,'specialist unlock time',1);number(entry.weight,'specialist spawn weight',0,.2);}
  const wave=c.waveRules;numeric(wave,'initialRest exploration warning attackLimit spawnWindow clearRest escapeRest firstWaveSize waveSizeStep maxWaveSize maxEnemies lootRadius bossWarningPadding blockedRetry tierSizeStep easySizeMultiplier batches batchInterval entrySlots entryStride entryAngleStep rewardCrystalsBase rewardCrystalsMax rewardWaveStep rewardCrystalsStep','encounters.waveRules');positive(wave,'batches batchInterval entrySlots rewardWaveStep warning attackLimit spawnWindow','encounters.waveRules');for(const key of ['firstWaveSize','maxWaveSize','maxEnemies','batches','entrySlots','entryStride'])integer(wave[key],`encounters.waveRules.${key}`,1);for(const key of ['alternateAngles','probeAngles'])for(const angle of array(wave[key],`encounters.waveRules.${key}`,1,100))number(angle,`encounters.waveRules.${key}`,-Math.PI*2,Math.PI*2);if(wave.maxWaveSize<wave.firstWaveSize)fail('encounters.waveRules','maximum wave size is below first wave size');
  for(const direction of array(c.waveDirections,'encounters.waveDirections',1,32)){string(direction.id,'encounters.waveDirections.id');string(direction.label,'encounters.waveDirections.label');number(direction.angle,'encounters.waveDirections.angle',-Math.PI*2,Math.PI*2);}unique(c.waveDirections.map(d=>d.id),'encounters.waveDirections');
  numeric(c.objectiveRules,'bossWarning campEngage houseEngage treasureEngage encounterPadding treasureChestEngage trappedCampSpacing clearedCampSpacing','encounters.objectiveRules');positive(c.arenaRules,'warmup batchSize batchInterval warning spawnDistance enemyLimit','encounters.arenaRules');number(c.arenaRules.spawnGrace,'encounters.arenaRules.spawnGrace');integer(c.arenaRules.batchSize,'encounters.arenaRules.batchSize',1);integer(c.arenaRules.enemyLimit,'encounters.arenaRules.enemyLimit',1);
  const event=object(c.eventRules,'encounters.eventRules');refs(event.types,new Set(['treasure','hunt']),'encounters.eventRules.types',1);numeric(event,'initialDelay retryDelay nextDelay abandonDistance enemyLimit encounterRadius','encounters.eventRules');
  positive(event.treasure,'life radius baseHp healthTimeCap easySpeed speed fleeRange waitRange fleeDistance returnDistance idleDistance','encounters.eventRules.treasure');numeric(event.treasure,'healthTimeGrowth damage xp returnSpeedMultiplier idleSpeedMultiplier wobbleFrequency wobbleAmplitude','encounters.eventRules.treasure');if(event.treasure.fleeRange>=event.treasure.waitRange)fail('encounters.eventRules.treasure','flee range must be less than wait range');
  positive(event.hunt,'life goal relicGoal healthMultiplier','encounters.eventRules.hunt');numeric(event.hunt,'xp playerEngagePadding guardEngagePadding','encounters.eventRules.hunt');integer(event.hunt.goal,'encounters.eventRules.hunt.goal',1);integer(event.hunt.relicGoal,'encounters.eventRules.hunt.relicGoal',1);
  requireKeys(event.rewards,['treasure','hunt','relicHunt'],'encounters.eventRules.rewards');for(const [id,reward] of Object.entries(event.rewards)){numeric(reward,'gold crystals',`encounters.eventRules.rewards.${id}`);reference(reward.pickup,new Set(['magnet','fury']),`encounters.eventRules.rewards.${id}.pickup`);string(reward.source,`encounters.eventRules.rewards.${id}.source`);}
  positive(event.placement,'huntClearance treasureClearance huntObjectiveRadius treasureObjectiveRadius huntSiteRadius treasureSiteRadius hazardClearance propClearance huntChestClearance treasureChestClearance huntAttempts treasureAttempts huntSlots treasureSlots huntStartRadius huntRadiusStep treasureStartRadius treasureRings treasureRadiusStep viewPadding','encounters.eventRules.placement');
  positive(event.arenaPlacement,'slots retryDelay','encounters.eventRules.arenaPlacement');integer(event.arenaPlacement.slots,'encounters.eventRules.arenaPlacement.slots',1,1000);for(const radius of array(event.arenaPlacement.radii,'encounters.eventRules.arenaPlacement.radii',1,100))number(radius,'encounters.eventRules.arenaPlacement.radii',1);
}
function validateDifficulty(d,c,enemyIds){
  positive(d.balance,'firstXp xpBase firstBossAt bossInterval spawnBase spawnMax maxEnemyBullets','difficulty.balance');numeric(d.balance,'xpLinear xpCurve spawnGrowth','difficulty.balance');positive(d.xp,'exponent','difficulty.xp');
  numeric(d.pressure,'dangerSeconds timeCap timeFactor connectionCap connectionSeconds waveDanger waveConnection waveTimeCap','difficulty.pressure');positive(d.pressure,'wavePeriod endlessWavePeriod','difficulty.pressure');
  numeric(d.enemyGrowth,'lateAfter enduranceAfter bossHealthLinear bossHealthCurve healthTimeCap healthTimeGrowth enduranceLinear enduranceCurve bossDamageGrowth damageLateGrowth speedTimeGrowth bossXpGrowth xpLateGrowth initialChargeCooldown initialCastCooldown','difficulty.enemyGrowth');positive(d.enemyGrowth,'minute enduranceExponent speedMax easySpeedMultiplier easyDamageMultiplier','difficulty.enemyGrowth');
  positive(d.explorationSpawn,'maxRate easyMultiplier bossMultiplier enemyLimit','difficulty.explorationSpawn');numeric(d.explorationSpawn,'timeGrowth initialCount testStartRadius testRadiusStep','difficulty.explorationSpawn');integer(d.explorationSpawn.initialCount,'difficulty.explorationSpawn.initialCount',0,100);integer(d.explorationSpawn.enemyLimit,'difficulty.explorationSpawn.enemyLimit',1,1000);reference(d.explorationSpawn.initialType,enemyIds,'difficulty.explorationSpawn.initialType');
}
