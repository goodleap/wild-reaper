import { TERRAIN_GENERATOR_IDS } from '../worlds/generator-ids.js';
import { validateWorldLayout } from './world-layout.js';
import { validateRiftLayout } from './rift-layout.js';

const persistentWorldIds=['forest','marsh','ruins','beach','city','mountain','snow','volcano'];
const fail=path=>{throw new TypeError(`Invalid world configuration: ${path}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path);return value;};
const list=(value,path,min=0,max=256)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(path);return value;};
const text=(value,path)=>{if(typeof value!=='string'||!value.trim()||value.length>2048)fail(path);return value;};
const number=(value,path,min=0,max=1e8)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path);return value;};
const positive=(value,path)=>{number(value,path);if(value<=0)fail(path);return value;};
const integer=(value,path,min=0,max=1e8)=>{number(value,path,min,max);if(!Number.isSafeInteger(value))fail(path);return value;};
const ref=(id,ids,path)=>{if(!ids.has(id))fail(path);};
const bool=(value,path)=>{if(typeof value!=='boolean')fail(path);};
const profile=(value,path)=>{object(value,path);positive(value.x,path+'.x');positive(value.y,path+'.y');number(value.phase,path+'.phase',-1e5,1e5);number(value.bays,path+'.bays',0,.5);};
const reward=(value,path)=>{object(value,path);integer(value.gold,path+'.gold');integer(value.crystals,path+'.crystals');};
const numericRecord=(value,path)=>{object(value,path);for(const[key,n]of Object.entries(value))number(n,path+'.'+key);};
const requiredNumbers=(value,keys,path)=>{numericRecord(value,path);for(const key of keys)number(value[key],path+'.'+key);};

function placements(terrain,path){
  const groups=object(terrain.placements,path+'.placements');
  list(groups.default,path+'.placements.default',0,64);
  for(const [zone,items]of Object.entries(groups))for(const [i,item]of list(items,path+'.placements.'+zone,0,64).entries()){
    const p=`${path}.placements.${zone}[${i}]`;object(item,p);
    if(!['tree','rock','log'].includes(item.type))fail(p+'.type');text(item.variant,p+'.variant');
    number(item.x,p+'.x',-1e4,1e4);number(item.y,p+'.y',-1e4,1e4);
    if(item.condition){object(item.condition,p+'.condition');integer(item.condition.roll,p+'.condition.roll',0,10000);number(item.condition.above,p+'.condition.above',0,1);}
    if(item.properties)for(const[key,value]of Object.entries(object(item.properties,p+'.properties'))){
      if(!['r','scale','halfLength','angle','rockForm','treeForm'].includes(key))fail(p+'.properties.'+key);
      if(typeof value==='number')number(value,p+'.properties.'+key,-1e4,1e4);
      else {object(value,p+'.properties.'+key);number(value.base,p+'.base',-1e4,1e4);number(value.gain,p+'.gain',-1e4,1e4);integer(value.roll,p+'.roll',0,10000);}
      if(['r','scale','halfLength'].includes(key)){
        const min=typeof value==='number'?value:Math.min(value.base,value.base+value.gain);
        if(min<=0)fail(p+'.properties.'+key);
      }
    }
  }
}

export function validateWorlds(sections){
  const worlds=object(sections.worlds,'worlds'),stages=object(sections.stages,'stages'),geo=object(sections.geography,'geography');
  const worldDefs=list(worlds.definitions,'worlds.definitions',1),order=list(worlds.order,'worlds.order',1),worldIds=new Set(worldDefs.map(w=>w.id));
  if(worldIds.size!==worldDefs.length||new Set(order).size!==order.length||order.length!==worldDefs.length)fail('world identity/order');
  for(const[id,index]of persistentWorldIds.map((id,index)=>[id,index]))if(order[index]!==id)fail('persistent world order');
  for(const id of order)ref(id,worldIds,'worlds.order');
  const enemyIds=new Set(Object.keys(object(sections.enemies?.definitions,'enemies.definitions'))),bossIds=new Set(Object.keys(object(sections.enemies?.bosses,'enemies.bosses')));
  const edges=new Set();for(const edge of list(worlds.connections,'worlds.connections',1,512)){
    list(edge,'world connection',2,2);for(const id of edge)ref(id,worldIds,'world connection');
    const key=[...edge].sort().join(':');if(edge[0]===edge[1]||edges.has(key))fail('duplicate/self world connection');edges.add(key);
  }
  for(const w of worldDefs){
    const p='world '+text(w.id,'world.id');for(const key of ['name','shortName'])text(w[key],p+'.'+key);
    validateWorldLayout(w.layout,bossIds,p+'.layout');
    if(w.authored){const neighbors=worlds.connections.flatMap(([a,b])=>a===w.id?[order.indexOf(b)]:b===w.id?[order.indexOf(a)]:[]);validateRiftLayout(w.authored,p+'.authored',bossIds,geo.siteReservations.map(spec=>spec[0]),neighbors,w.id);}
    profile(w.profile,p+'.profile');positive(w.danger,p+'.danger');object(w.colors,p+'.colors');
    for(const key of ['ground','light','dark','accent','mist','grass','stone'])text(w.colors[key],p+'.colors.'+key);
    for(const[key,n]of Object.entries(object(w.enemyWeights,p+'.enemyWeights'))){ref(key,enemyIds,p+'.enemyWeights');number(n,p+'.enemyWeights.'+key);}
    if(!Object.values(w.enemyWeights).some(n=>n>0))fail(p+'.enemyWeights');
    object(w.coast,p+'.coast');for(const[key,n]of Object.entries(w.coast))number(n,p+'.coast.'+key);
    list(w.biomeZones,p+'.biomeZones',0,64);for(const zone of w.biomeZones)text(zone,p+'.biomeZones');
    const t=object(w.terrain,p+'.terrain');if(!TERRAIN_GENERATOR_IDS.includes(t.generatorId))fail(p+'.generatorId');integer(t.hashOffset,p+'.hashOffset');object(t.variants,p+'.variants');
    if(t.generatorId==='scenery')placements(t,p+'.terrain');
    if(t.generatorId==='natural'&&!Object.hasOwn(geo.naturalTerrainLayouts||{},t.layoutId))fail(p+'.terrain.layoutId');
    const e=object(w.environment,p+'.environment');integer(e.hashOffset,p+'.environment.hashOffset');number(e.mushroomChance,p+'.mushroomChance',0,1);
    const water=object(e.water,p+'.water');number(water.chance,p+'.water.chance',0,1);integer(water.families,p+'.water.families',1,32);bool(water.innerIslands,p+'.water.innerIslands');
    if(!['water','snow','ice','lava'].includes(water.kind))fail(p+'.water.kind');
    if(water.zoneKinds)for(const[zone,kind]of Object.entries(object(water.zoneKinds,p+'.water.zoneKinds'))){if(!w.biomeZones.includes(zone)||!['water','snow','ice','lava'].includes(kind))fail(p+'.water.zoneKinds');}
    if(e.mechanism){object(e.mechanism,p+'.mechanism');if(!['vine','gas','rune'].includes(e.mechanism.type))fail(p+'.mechanism.type');number(e.mechanism.chance,p+'.mechanism.chance',0,1);}
    if(e.hazard){object(e.hazard,p+'.hazard');if(!['rockfall','vent','tide'].includes(e.hazard.type)||!['water','terrain'].includes(e.hazard.source))fail(p+'.hazard');number(e.hazard.chance,p+'.hazard.chance',0,1);}
    if(e.damagingSurface!==null&&e.damagingSurface!=='lava')fail(p+'.damagingSurface');
    for(const key of ['waterMovement','waterImmersion']){object(e[key],p+'.'+key);for(const state of ['idle','active'])number(e[key][state],p+'.'+key+'.'+state,0,3);}
    object(w.art,p+'.art');for(const palette of Object.values(w.art))for(const value of Object.values(object(palette,p+'.palette'))){if(typeof value==='number')number(value,p+'.palette',0,10);else text(value,p+'.palette');}
  }
  const stageIds=new Set(),mapIds=new Set();
  for(const s of list(stages.definitions,'stages.definitions',1)){
    const p='stage '+text(s.id,'stage.id');if(stageIds.has(s.id))fail(p+'.duplicate');stageIds.add(s.id);ref(s.themeId,worldIds,p+'.themeId');
    for(const key of ['name','shortName','summary','difficultyLabel'])text(s[key],p+'.'+key);
    const prefix=s.id.endsWith('-trial')?s.id.slice(0,-6):s.id;
    for(const [key,suffix]of [['outer','outer'],['core','heart']]){
      const island=object(s[key],p+'.'+key),id=island.id??`${prefix}-${suffix}`;text(id,p+'.mapId');if(mapIds.has(id))fail(p+'.duplicate map');mapIds.add(id);
      text(island.name,p+'.island.name');integer(island.seed,p+'.seed',-2147483648,2147483647);
      const boss=object(island.boss,p+'.boss');ref(boss.kind,bossIds,p+'.boss.kind');
      for(const k of ['hp','easyHp','damage','speed','xp'])positive(boss[k],p+'.boss.'+k);integer(boss.index,p+'.boss.index',1,1e6);if(boss.easyHp>boss.hp)fail(p+'.boss.easyHp');
      if(island.profile){const world=worldDefs.find(w=>w.id===s.themeId);profile({...world.profile,...island.profile},p+'.profile');}
      if(island.layout)for(const point of Object.values(object(island.layout,p+'.layout'))){object(point,p+'.layout point');number(point.x,p+'.layout.x',-1e6,1e6);number(point.y,p+'.layout.y',-1e6,1e6);positive(point.r,p+'.layout.r');}
    }
    if(s.core.boss.hp<=s.outer.boss.hp)fail(p+'.core boss strength');reward(s.coreReward,p+'.reward');
  }
  const expeditionIds=new Set();
  for(const d of list(stages.expeditions||[],'stages.expeditions',0,32)){
    const p='expedition '+text(d.id,'expedition.id');if(expeditionIds.has(d.id)||stageIds.has(d.id))fail(p+'.duplicate');expeditionIds.add(d.id);
    for(const key of ['name','shortName','summary','objective','rewardLabel','color'])text(d[key],p+'.'+key);
    ref(d.themeId,worldIds,p+'.themeId');if(!['arena','x','y'].includes(d.axis))fail(p+'.axis');reward(d.reward,p+'.reward');
    const bounds=object(d.bounds,p+'.bounds');for(const key of ['minX','maxX','minY','maxY'])number(bounds[key],p+'.bounds.'+key,-1e5,1e5);
    if(bounds.maxX-bounds.minX<300||bounds.maxY-bounds.minY<300)fail(p+'.bounds.size');
    const point=(value,path,margin=0)=>{object(value,path);number(value.x,path+'.x',bounds.minX+margin,bounds.maxX-margin);number(value.y,path+'.y',bounds.minY+margin,bounds.maxY-margin);};
    point(d.start,p+'.start',40);positive(d.exit?.r,p+'.exit.r');point(d.exit,p+'.exit',d.exit.r+20);
    if(Math.hypot(d.start.x-d.exit.x,d.start.y-d.exit.y)<d.exit.r+150)fail(p+'.exit.distance');
    for(const [index,prop]of list(d.obstacles,p+'.obstacles',0,96).entries()){
      const q=p+'.obstacles.'+index;positive(prop.r,q+'.r');point(prop,q,prop.r+20);
      if(!['expedition-cargo','expedition-mast','expedition-moonrock','expedition-wreck','expedition-tree','expedition-camprock','expedition-log'].includes(prop.variant))fail(q+'.variant');
      if(prop.treeForm!=null)integer(prop.treeForm,q+'.treeForm',0,4);
      if(prop.scale!=null)number(prop.scale,q+'.scale',.5,1.5);
      if(prop.variant==='expedition-log'){
        number(prop.halfLength,q+'.halfLength',1,100);number(prop.angle,q+'.angle',-Math.PI*2,Math.PI*2);
        for(const sign of [-1,1])point({x:prop.x+Math.cos(prop.angle)*prop.halfLength*sign,y:prop.y+Math.sin(prop.angle)*prop.halfLength*sign},q+'.endpoint',prop.r+20);
      }
      if(Math.hypot(prop.x-d.start.x,prop.y-d.start.y)<prop.r+40||Math.hypot(prop.x-d.exit.x,prop.y-d.exit.y)<prop.r+d.exit.r)fail(q+'.route endpoint');
    }
    for(const [index,path]of list(d.paths||[],p+'.paths',0,24).entries()){
      const q=p+'.paths.'+index;number(path.width,q+'.width',40,240);
      for(const [i,vertex]of list(path.points,q+'.points',2,64).entries())point(vertex,q+'.points.'+i,10);
    }
    for(const [index,detail]of list(d.details||[],p+'.details',0,48).entries()){
      const q=p+'.details.'+index;if(!['hatch','rope','crater','landing','wreckage','clearing','grove','camp'].includes(detail.kind))fail(q+'.kind');
      number(detail.rx,q+'.rx',1,320);number(detail.ry,q+'.ry',1,320);point(detail,q);
    }
    for(const [index,supply]of list(d.supplies||[],p+'.supplies',0,12).entries()){
      const q=p+'.supplies.'+index;point(supply,q,30);
      if(!sections.economy?.pickups?.types?.includes(supply.drop))fail(q+'.drop');
    }
    const segments=list(d.segments,p+'.segments',0,8);
    if(d.axis==='arena'){positive(d.duration,p+'.duration');if(segments.length)fail(p+'.arena segments');}
    else {
      if(!segments.length)fail(p+'.segments');let previous=d.axis==='x'?d.start.x:d.start.y;
      const end=d.exit[d.axis],direction=Math.sign(end-previous);if(!direction)fail(p+'.axis direction');
      for(const [index,segment]of segments.entries()){
        const q=p+'.segments.'+index;text(segment.name,q+'.name');point(segment.center,q+'.center',190);positive(segment.triggerRadius,q+'.triggerRadius');positive(segment.healthMultiplier,q+'.healthMultiplier');
        number(segment.gate,q+'.gate',d.axis==='x'?bounds.minX:bounds.minY,d.axis==='x'?bounds.maxX:bounds.maxY);
        if(direction*(segment.center[d.axis]-previous)<=0||direction*(segment.gate-segment.center[d.axis])<190||direction*(end-segment.gate)<=0)fail(q+'.route order');previous=segment.gate;
        let count=0;for(const [id,n]of Object.entries(object(segment.enemies,q+'.enemies'))){ref(id,enemyIds,q+'.enemies');if(id==='boss')fail(q+'.boss');integer(n,q+'.enemies.'+id,1,40);count+=n;}
        if(count<1||count>60)fail(q+'.enemy count');
      }
    }
  }
  const reservations=new Set();for(const spec of list(geo.siteReservations,'geography.siteReservations',1,128)){
    list(spec,'site reservation',4,4);text(spec[0],'reservation.id');if(reservations.has(spec[0]))fail('duplicate site reservation');reservations.add(spec[0]);number(spec[1],'reservation.angle',-1e5,1e5);positive(spec[2],'reservation.distance');positive(spec[3],'reservation.radius');
  }
  for(const[id,f]of Object.entries(object(geo.siteFeatures,'siteFeatures'))){
    object(f,'siteFeature');if(id!==f.id)fail('siteFeature.id');ref(f.world,worldIds,'siteFeature.world');text(f.name,'siteFeature.name');if(!['occupied','castle','rune'].includes(f.type))fail('siteFeature.type');
    if(f.guardPackId&&!Object.hasOwn(sections.encounters?.hutGuardPacks||{},f.guardPackId))fail('siteFeature.guardPackId');
    if(f.reward)reward(f.reward,'siteFeature.reward');
    for(const key of ['width','depth','interiorSize','interiorHeight','cols','rows','cellSize','bossDistance','guardHp','bossHp','bossIndex'])if(f[key]!=null)positive(f[key],'siteFeature.'+key);
  }
  for(const[id,name]of Object.entries(object(geo.hutNames,'hutNames'))){ref(id,worldIds,'hutNames.world');text(name,'hutNames.name');}
  const h=object(geo.hazardRules,'hazardRules');integer(h.maxProps,'hazardRules.maxProps',1,64);positive(h.safeRadius,'hazardRules.safeRadius');positive(h.hitInterval,'hazardRules.hitInterval');
  for(const type of ['rockfall','vent'])requiredNumbers(h[type],['radius','warning','active','rest','playerDamage','enemyDamage'],'hazardRules.'+type);
  requiredNumbers(h.tide,['warning','active','rest'],'hazardRules.tide');requiredNumbers(h.lava,['playerDamage','enemyDamage'],'hazardRules.lava');
  for(const type of ['rockfall','vent','tide'])for(const key of ['warning','active','rest'])positive(h[type][key],'hazardRules.'+type+'.'+key);
  requiredNumbers(geo.regionalMechanismRules,['maxProps','safeRadius','vineRadius','vineWarning','vineActive','vineSlow','gasRadius','gasWarning','gasActive','gasInterval','gasPlayerDamage','gasEnemyDamage','runeRadius','runeCharge','runeDuration','runeInterval','runeTargets','runeRange'],'regionalMechanismRules');
  requiredNumbers(geo.regionalMechanismCombat,['runeDamage','runeGrowthTimeCap','runeGrowthTimePeriod','runeFirstShot','frostDuration','frostBossSpeed','frostEnemySpeed'],'regionalMechanismCombat');positive(geo.regionalMechanismCombat.runeGrowthTimePeriod,'runeGrowthTimePeriod');
  const interior=object(geo.interiors,'interiors');for(const key of ['dungeon','hut']){numericRecord(interior[key],'interiors.'+key);integer(interior[key].maxStatesPerWorld,'interiors.'+key+'.maxStatesPerWorld',1,32);positive(interior[key].cellSize,'interiors.'+key+'.cellSize');}
  requiredNumbers(interior.dungeon,['cols','rows','cellSize','wallRadius','doorWidth','interactRadius','sideChests','bossDistance','roomCrystals','maxRoomEnemies','maxStatesPerWorld'],'interiors.dungeon');
  for(const key of ['cols','rows'])integer(interior.dungeon[key],'dungeon.'+key,2,32);
  requiredNumbers(interior.hut,['cellSize','wallRadius','doorWidth','maxStatesPerWorld','guards'],'interiors.hut');
  for(const value of Object.values(object(interior.rewards,'interior rewards')))reward(value,'interior reward');
  for(const layout of Object.values(object(interior.hutLayouts,'hut layouts'))){
    object(layout,'hut layout');ref(layout.terrain,worldIds,'hut layout terrain');
    for(const key of ['rocks','props','guardPoints'])for(const point of list(layout[key],'hut layout.'+key,0,128)){object(point,'hut point');number(point.x,'hut point.x',-1e5,1e5);number(point.y,'hut point.y',-1e5,1e5);if(key==='props'&&!['table','stool','bed','shelf','rug','cargo','barrel','minecart'].includes(point.type))fail('hut prop.type');}
  }
  ref(interior.castleProfile?.terrain,worldIds,'castle profile terrain');
  numericRecord(geo.coastRules,'coastRules');for(const key of ['shallowWidth','beachWidth','waterSetback'])number(geo.coastRules[key],'coastRules.'+key);
  for(const p of Object.values(object(geo.placementPolicies,'placementPolicies'))){object(p,'placementPolicy');if(!['inland','dry','coastal'].includes(p.surface)||!['allow','avoid'].includes(p.water))fail('placement policy');number(p.coastSetback,'placement coastSetback');number(p.waterGap,'placement waterGap');}
  requiredNumbers(geo.portalRules,['engageRadius','leashRadius','interactRadius'],'portalRules');requiredNumbers(geo.portalGuardian,['timeProgressCap','timeProgressPeriod','hpGrowth','damageGrowth','xpGrowth','endlessConnections'],'portalGuardian');positive(geo.portalGuardian.timeProgressPeriod,'portalGuardian.timeProgressPeriod');integer(geo.portalGuardian.endlessConnections,'portalGuardian.endlessConnections',1,512);
  for(const layout of Object.values(object(geo.naturalTerrainLayouts,'naturalTerrainLayouts'))){
    object(layout,'naturalTerrainLayout');
    requiredNumbers(layout.tree,['threshold','sizeThreshold','scaleBase','scaleGain','largeScaleBase','largeScaleGain','largeScaleSpan','crownWidthBase','crownWidthGain','crownHeightBase','crownHeightGain','x','y','radius'],'naturalTerrain.tree');
    requiredNumbers(layout.ground,['x','xJitter','y','yJitter'],'naturalTerrain.ground');
    requiredNumbers(layout.log,['threshold','radiusBase','radiusGain','lengthBase','lengthGain'],'naturalTerrain.log');
    requiredNumbers(layout.rock,['sizeThreshold','scaleBase','scaleGain','largeScaleBase','largeScaleGain','radius'],'naturalTerrain.rock');
    for(const [type,key]of [['tree','threshold'],['tree','sizeThreshold'],['log','threshold'],['rock','sizeThreshold']])number(layout[type][key],'naturalTerrain.'+type+'.'+key,0,1);
    positive(layout.tree.largeScaleSpan,'naturalTerrain.tree.largeScaleSpan');
  }
  const env=object(geo.environmentRules,'environmentRules');
  requiredNumbers(env.balance,['maxProps','maxMuds','mushroomFuse','blastRadius','mudMultiplier','safeRadius','despawnDistance'],'environmentRules.balance');
  integer(env.balance.maxProps,'environmentRules.balance.maxProps',1,128);integer(env.balance.maxMuds,'environmentRules.balance.maxMuds',1,128);
  for(const key of ['mushroomFuse','blastRadius','safeRadius','despawnDistance'])positive(env.balance[key],'environmentRules.balance.'+key);
  for(const size of list(env.waterSizes,'waterSizes',5,5))positive(size,'water size');
  for(const angle of list(env.waterAngles,'waterAngles',3,3))number(angle,'water angle',-Math.PI,Math.PI);
  for(const point of list(env.waterPlacements,'waterPlacements',1,64)){list(point,'water placement',2,2);for(const value of point)number(value,'water placement coordinate',0,1);}
  list(env.waterSizeThresholds,'waterSizeThresholds',4,4);let previous=0;for(const threshold of env.waterSizeThresholds){number(threshold,'waterSizeThreshold',0,1);if(threshold<=previous)fail('water size threshold order');previous=threshold;}
  for(const key of ['snowImmersion','snowMovement','shoreSlowPerDepth','otherHeightSinkFactor'])number(env[key],'environmentRules.'+key,0,1);
  for(const key of ['waterBankClearance','humanoidMaxSink','otherMaxSink'])number(env[key],'environmentRules.'+key);
  requiredNumbers(env.mushroom,['pairThreshold','pairDistance','enemyDamage','friendlyDamage','growthTimeCap','growthTimePeriod'],'environmentRules.mushroom');number(env.mushroom.pairThreshold,'mushroom pair threshold',0,1);positive(env.mushroom.growthTimePeriod,'mushroom growth period');
  return true;
}
