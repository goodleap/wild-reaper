// Data-only validation. No runtime catalog imports or executable configuration.
const fail=path=>{throw new TypeError(`Invalid content configuration: ${path}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path);return value;};
const array=(value,path)=>{if(!Array.isArray(value)||!value.length)fail(path);return value;};
const text=(value,path)=>{if(typeof value!=='string'||!value.trim())fail(path);};
const number=(value,path,min=0,max=1e7)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path);};
const integer=(value,path,min=0,max=10000)=>{number(value,path,min,max);if(!Number.isInteger(value))fail(path);};
const numeric=(value,path,keys,min=0)=>{object(value,path);for(const key of keys)number(value[key],`${path}.${key}`,min);};
const names=(value,path,keys)=>{for(const key of keys)text(value[key],`${path}.${key}`);};
const unique=(entries,path,key='id')=>{const ids=new Set();for(const entry of array(entries,path)){object(entry,path);text(entry[key],`${path}.${key}`);if(ids.has(entry[key]))fail(`${path}.${entry[key]} duplicate`);ids.add(entry[key]);}return ids;};
const oneOf=(value,values,path)=>{if(!values.includes(value))fail(path);};
const KNOWN_COMPANIONS=['stormcaller','warden','dog','owl','golem'];
const KNOWN_RELICS=['thunderstone','bloodstone','herbalEcho','leafWard','swiftFeather','deepRoot'];
const SITE_TYPES=['merchant','angel','supply','occupied','castle'];
const RELIC_TYPES=['hunt','rescue','stonevault','dogcamp','rune'];
const requiredIds=(ids,expected,path)=>{for(const id of expected)if(!ids.has(id))fail(`${path}.${id} missing`);};

export function validateContent(sections){
  object(sections,'sections');
  const sites=object(sections.sites,'sites'),companions=object(sections.companions,'companions'),economy=object(sections.economy,'economy'),codex=object(sections.codex,'codex');
  numeric(sites.settlementRules,'sites.settlementRules',['maxSites','interactRadius','ward','guards']);
  numeric(sites.angelRules,'sites.angelRules',['guardRadius','auraRadius','attackRange','healingPerSecond','strikeRadius','attackInterval','damage','connectionGrowth','maxGrowthConnections']);
  number(sites.angelRules.attackInterval,'sites.angelRules.attackInterval',.02,60);
  if(sites.angelRules.guardRadius!==sites.angelRules.auraRadius||sites.angelRules.guardRadius!==sites.angelRules.attackRange)fail('sites.angelRules unified radius');
  numeric(sites.relicSiteRules,'sites.relicSiteRules',['rescueGuards','interactRadius','huntTouchRadius']);
  numeric(sites.armySiteRules,'sites.armySiteRules',['dogCost','vaultGold','vaultCrystals','smashDuration','smashReach','altarTouchRadius']);
  numeric(sites.rescueBuilding,'sites.rescueBuilding',['halfWidth','doorHalfWidth','wallRadius'],1);
  number(sites.rescueBuilding.back,'sites.rescueBuilding.back',-10000,10000);number(sites.rescueBuilding.front,'sites.rescueBuilding.front',-10000,10000);
  if(sites.rescueBuilding.back>=sites.rescueBuilding.front||sites.rescueBuilding.doorHalfWidth>=sites.rescueBuilding.halfWidth)fail('sites.rescueBuilding geometry');
  unique(sites.settlementDefinitions,'sites.settlementDefinitions','type');
  for(const def of sites.settlementDefinitions){oneOf(def.type,SITE_TYPES,'sites.settlementDefinitions.type');text(def.name,'sites.settlementDefinitions.name');numeric(def,`site.${def.type}`,['width','depth','radius'],1);number(def.angle,`site.${def.type}.angle`,-100,100);}
  object(sites.settlementTypes,'sites.settlementTypes');
  for(const id of SITE_TYPES){const def=object(sites.settlementTypes[id],`sites.settlementTypes.${id}`);oneOf(def.interaction,[null,'interior','shop'],`sites.settlementTypes.${id}.interaction`);if(def.interior)oneOf(def.interior,['hut','castle'],`site.${id}.interior`);number(def.doorOffset,`site.${id}.doorOffset`);for(const key of ['foundation','bodyOffset'])if(typeof def[key]!=='boolean')fail(`site.${id}.${key}`);}
  for(const id of Object.keys(sites.settlementTypes))oneOf(id,SITE_TYPES,'sites.settlementTypes');
  object(sites.relicSiteTypes,'sites.relicSiteTypes');object(sites.relicAppearances,'sites.relicAppearances');
  for(const id of ['default',...RELIC_TYPES]){const def=object(sites.relicSiteTypes[id],`sites.relicSiteTypes.${id}`);numeric(def,`relicType.${id}`,['r','width','depth','doorOffset','clearance','hazardRadius']);if(def.goal!=null)integer(def.goal,`relicType.${id}.goal`,1);if(def.feature)oneOf(def.feature,['companions','encounters'],`relicType.${id}.feature`);if(def.mechanism){oneOf(def.mechanism.type,['rune'],'relic mechanism');numeric(def.mechanism,'relic mechanism',['r','charge','remaining','maxRemaining']);}}
  unique(sites.relicSiteDefinitions,'sites.relicSiteDefinitions','key');
  object(sites.worldRelicDefinitions,'sites.worldRelicDefinitions');
  const worldIds=new Set(sections.worlds?.order||[]),featureIds=new Set(Object.keys(sections.geography?.siteFeatures||{}));
  const siteEntries=[...sites.relicSiteDefinitions];
  for(const [world,entries] of Object.entries(sites.worldRelicDefinitions)){if(!worldIds.has(world))fail(`sites.worldRelicDefinitions.${world}`);unique(entries,`worldRelics.${world}`,'key');siteEntries.push(...entries);}
  for(const def of siteEntries){oneOf(def.type,RELIC_TYPES,`relic.${def.key}.type`);text(def.name,`relic.${def.key}.name`);if(def.kind)oneOf(def.kind,KNOWN_COMPANIONS,`relic.${def.key}.kind`);if(def.guardCount!=null)integer(def.guardCount,`relic.${def.key}.guardCount`,1,100);if(def.featureId&&!featureIds.has(def.featureId))fail(`relic.${def.key}.featureId`);}
  numeric(sites.settlementGuards,'sites.settlementGuards',['leaderXp','guardXp','leaderHp','guardHp']);
  const castle=object(sites.castleCombat,'sites.castleCombat');numeric(castle,'sites.castleCombat',['difficultyPeriod','difficultyCap','difficultyGrowth','guardHp','guardXpMultiplier','minGuardXp','maxGuardXp','healEveryRooms','shieldRoute','eliteRoute','eliteChance','shieldChance']);
  number(castle.difficultyPeriod,'castle difficultyPeriod',1);integer(castle.healEveryRooms,'castle healEveryRooms',1);number(castle.eliteChance,'castle eliteChance',0,1);number(castle.shieldChance,'castle shieldChance',0,1);
  const boss=object(castle.boss,'sites.castleCombat.boss');text(boss.name,'castle boss name');for(const key of ['hp','damage'])numeric(boss[key],`castle boss ${key}`,['easy','normal'],1);numeric(boss.speedMultiplier,'castle boss speedMultiplier',['easy','normal'],.01);numeric(boss,'castle boss',['damageGrowthPeriod','xp','xpGrowthPeriod'],1);

  numeric(companions.rules,'companions.rules',['maxMembers','payrollInterval','gracePeriod','recoveryDuration','hitImmunity','guardRadius','guardMultiplier','recoveryHealth','recoveryImmunity','initialAttackDelay','retryAttackDelay']);
  integer(companions.rules.maxMembers,'companions maxMembers',1,20);number(companions.rules.recoveryHealth,'companions recoveryHealth',0,1);number(companions.rules.guardMultiplier,'companions guardMultiplier',0,1);number(companions.rules.payrollInterval,'companions payrollInterval',1);
  numeric(companions.followRules,'companions.followRules',['restartGap','taskStart','taskStop','contactGap','workLeash','dogLeadDistance','meleeLeash','meleeStandOff','golemCatchup','catchup','acceleration','strandedDistance','strandedTime']);
  if(companions.followRules.taskStart<=companions.followRules.taskStop)fail('companions follow hysteresis');
  const companionIds=unique(companions.definitions,'companions.definitions');requiredIds(companionIds,KNOWN_COMPANIONS,'companions.definitions');
  for(const def of companions.definitions){oneOf(def.kind,KNOWN_COMPANIONS,`companion.${def.id}.kind`);if(def.id!==def.kind)fail(`companion.${def.id}.identity`);names(def,`companion.${def.id}`,['name','role','skill','description','color']);numeric(def,`companion.${def.id}`,['upkeep','recoveryCost','defense']);numeric(def,`companion.${def.id}`,['followDistance','r','maxHp','speed','groundOffset'],1);}
  numeric(companions.rescueRules,'companions.rescueRules',['firstAt','campDuration','interval','guards','rescueRadius','spawnGrace','spawnDistance','siteGuards','siteEngageRadius','campGuardRadius','guardXp','siteGuardHp','campGuardHp']);
  const skillKeys={stormcaller:['damage','growthPeriod','growth','hits','chainRange','range','cooldown'],warden:['damage','growthPeriod','growth','radius','cooldown','knockback','echoKnockback'],golem:['damage','growthPeriod','growth','targetRange','queryRange','radius','halfAngle','interrupt','knockback','cooldown'],dog:['scanInterval','range','leadDuration'],owl:['scanInterval','range','groupThreshold']};
  object(companions.skills,'companions.skills');for(const [id,keys] of Object.entries(skillKeys)){numeric(companions.skills[id],`companions.skills.${id}`,keys);for(const key of ['growthPeriod','cooldown','scanInterval'])if(key in companions.skills[id])number(companions.skills[id][key],`skills.${id}.${key}`,.02);}
  integer(companions.skills.stormcaller.hits,'stormcaller hits',1,32);

  const relicIds=unique(economy.relics,'economy.relics');requiredIds(relicIds,KNOWN_RELICS,'economy.relics');for(const relic of economy.relics){oneOf(relic.id,KNOWN_RELICS,'relic behavior');names(relic,`relic.${relic.id}`,['name','icon','color','desc']);for(const match of relic.desc.matchAll(/\{([^}]+)\}/g))if(!['thunderReduction','thunderWindowLabel','thunderWindowReduction','lowHealthPercent','lowHealthDamagePercent','herbRadius','herbDamage','barrierCapacityPercent','barrierCooldownPercent','movementPercent','herbHealingPercent','herbBaseHealing','herbTotalHealing'].includes(match[1]))fail(`relic.${relic.id}.description placeholder`);}
  numeric(economy.relicRules,'economy.relicRules',['thunderReduction','thunderWindow','thunderLimit','lowHealthThreshold','lowHealthDamage','herbRadius','herbDamage','herbHealing','barrierCapacityMultiplier','barrierCooldownMultiplier','movement','collectionHeal','maxWard','choiceCount']);
  integer(economy.relicRules.choiceCount,'relic choices',1,KNOWN_RELICS.length);integer(economy.relicRules.thunderLimit,'thunder limit',1,100);number(economy.relicRules.lowHealthThreshold,'lowHealthThreshold',0,1);number(economy.relicRules.collectionHeal,'collectionHeal',0,1);
  const shop=object(economy.shop,'economy.shop');number(shop.relicPrice,'shop.relicPrice');object(shop.stock,'shop.stock');const itemIds=unique(shop.items,'shop.items');requiredIds(itemIds,['heal','magnet','fury','shield'],'shop.items');
  for(const def of shop.items){oneOf(def.id,['heal','magnet','fury','shield'],'shop behavior');names(def,`shop.${def.id}`,['name','description','icon','color','reason']);number(def.price,`shop.${def.id}.price`);integer(shop.stock[def.id],`shop.stock.${def.id}`);if(def.id==='heal')number(def.healing,'shop.heal.healing',1);if(['magnet','fury'].includes(def.id))number(def.duration,`shop.${def.id}.duration`,.1,60);for(const match of def.description.matchAll(/\{([^}]+)\}/g))if(!['healing','duration','ward'].includes(match[1]))fail(`shop.${def.id}.description placeholder`);}
  integer(shop.stock.relic,'shop.stock.relic');
  const worldShops=object(economy.worldShops,'economy.worldShops');
  integer(worldShops.inventoryLimit,'economy.worldShops.inventoryLimit',1,999);
  for(const [key,category,catalog] of [['weaponPrices','weapon',sections.combat?.weapons],['skillPrices','skill',sections.combat?.skills]]){
    const prices=object(worldShops[key],`economy.worldShops.${key}`);
    if(!Object.keys(prices).length)fail(`economy.worldShops.${key}`);
    for(const [id,price] of Object.entries(prices)){
      const def=catalog?.[id],upgrade=sections.combat?.upgrades?.find(entry=>entry.id===id);
      if(!def||def.category!==category||def.tier!=='regular'||!upgrade||upgrade.upgradeKind!=='rank'||upgrade.ownerId!==id||upgrade.requires.length)fail(`economy.worldShops.${key}.${id} base ability`);
      integer(price,`economy.worldShops.${key}.${id}`,1,10000);
    }
  }
  const supply=object(worldShops.skillSupply,'economy.worldShops.skillSupply');
  for(const id of worldIds){
    const entries=array(supply[id],`economy.worldShops.skillSupply.${id}`);
    if(new Set(entries).size!==entries.length)fail(`economy.worldShops.skillSupply.${id} duplicates`);
    for(const skill of entries)if(!Object.hasOwn(worldShops.skillPrices,skill))fail(`economy.worldShops.skillSupply.${id}.${skill}`);
  }
  for(const id of Object.keys(supply))if(!worldIds.has(id))fail(`economy.worldShops.skillSupply.${id} world`);
  numeric(economy.pickups,'economy.pickups',['buffDuration','minBuffDuration','maxBuffDuration','herbHealing','furyDamage','furyFireRate','magnetRange','magnetAttractRange','life','supplyHp','supplyChance']);number(economy.pickups.supplyChance,'supplyChance',0,1);for(const type of array(economy.pickups.types,'pickup types'))oneOf(type,['herb','magnet','fury'],'pickup behavior');if(economy.pickups.minBuffDuration>economy.pickups.maxBuffDuration)fail('pickup duration range');
  numeric(economy.treasure,'economy.treasure',['firstAt','spawnInterval','life','unlockedLife','despawnDelay','openDelay','engageRange','playerLeash','guardLeash','returnRange']);numeric(economy.treasure.reward,'treasure reward',['gold','crystals']);numeric(economy.treasure.guardian,'treasure guardian',['radius','hp','damage','speed','xp']);

  const milestones=array(codex.milestones,'codex.milestones');if(milestones.length>100)fail('codex.milestones size');unique(milestones,'codex.milestones');
  for(const entry of milestones){
    if(!/^[a-z][a-z0-9-]{0,63}$/.test(entry.id))fail('codex milestone ID');
    names(entry,`codex.milestones.${entry.id}`,['name','description']);
    oneOf(entry.progressKey,['kills','bossKills','knownEnemies','knownWeapons','bestTime','branches','knownSkills','knownCompanions'],`codex.milestones.${entry.id}.progressKey`);
    integer(entry.target,`codex.milestones.${entry.id}.target`,1,1e9);
    if(entry.unit!==undefined)oneOf(entry.unit,['time'],`codex.milestones.${entry.id}.unit`);
    if((entry.unit==='time')!==(entry.progressKey==='bestTime'))fail(`codex.milestones.${entry.id}.unit mismatch`);
  }
  const tabIds=unique(codex.tabs,'codex.tabs');requiredIds(tabIds,['codex','world','records','milestones'],'codex.tabs');
  const categories=unique(codex.categories,'codex.categories');requiredIds(categories,['enemies','bosses','weapons','skills','weaponSkills','companions'],'codex.categories');
  for(const group of [codex.tabs,codex.categories,codex.worldCategories])for(const entry of group)text(entry.name,'codex category name');
  const combat=sections.combat||{},equipmentIds=new Set([...Object.keys(combat.weapons||{}),...Object.keys(combat.skills||{}),...(combat.superSkills||[]).map(def=>def.id)]);object(codex.equipment,'codex.equipment');
  for(const id of equipmentIds){const copy=object(codex.equipment[id],`codex.equipment.${id}`);names(copy,`codex.equipment.${id}`,['role','description','growth','advice']);}
  for(const id of Object.keys(codex.equipment))if(!equipmentIds.has(id))fail(`codex equipment reference ${id}`);
  unique(codex.weaponSkills,'codex.weaponSkills');for(const entry of codex.weaponSkills){if(!combat.weapons?.[entry.ownerId])fail(`codex weaponSkill owner ${entry.ownerId}`);names(entry,`codex.${entry.id}`,['modifierId','name','color','tier','role','description','growth','advice','source']);}
  object(codex.companions,'codex.companions');for(const id of companionIds)names(object(codex.companions[id],`codex.companions.${id}`),`codex.companions.${id}`,['role','description','advice','source']);
  names(object(codex.castleBoss,'codex.castleBoss'),'codex.castleBoss',['id','name','role','description','advice','type','bossKind','color','source']);
  object(codex.worldDescriptions,'codex.worldDescriptions');for(const id of worldIds)names(object(codex.worldDescriptions[id],`codex.world.${id}`),`codex.world.${id}`,['theme','risk','tip']);
  const categoryIds=unique(codex.worldCategories,'codex.worldCategories');requiredIds(categoryIds,['worlds','relics','waypoints'],'codex.worldCategories');
  unique(codex.locations,'codex.locations');const locationIds=new Set([...SITE_TYPES,...siteEntries.map(entry=>entry.key),...siteEntries.map(entry=>entry.appearance).filter(Boolean),...featureIds]);
  for(const entry of codex.locations){if(!locationIds.has(entry.id))fail(`codex location ${entry.id}`);oneOf(entry.group,['relics','waypoints'],'codex location group');names(entry,`codex.location.${entry.id}`,['name','tag','summary','trigger','feature']);for(const value of [entry.trigger,entry.feature])for(const match of value.matchAll(/\{([^}]+)\}/g)){const ref=match[1];if(['REGIONAL_MECHANISM_RULES.runeDuration','ARMY_SITE_RULES.vaultGold','ARMY_SITE_RULES.vaultCrystals','ARMY_SITE_RULES.dogCost','ANGEL_RULES.guardRadius'].includes(ref))continue;const feature=ref.match(/^WORLD_SITE_FEATURES\.([a-z]+)\.(reward\.(gold|crystals)|guardTypes\.length)$/);if(!feature||!featureIds.has(feature[1]))fail(`codex placeholder ${ref}`);}}
  return true;
}
