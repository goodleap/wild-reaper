// Appearance identities are presentation only. Combat, rewards and archive
// ownership continue to use the original bossKind and scene fields.
const define=(baseVisual,bossKinds=[baseVisual],stride=144)=>Object.freeze({
  baseVisual,bossKinds:Object.freeze(bossKinds),stride,animated:true
});
export const BOSS_APPEARANCES=Object.freeze({
  drownedwatcher:define('deepcaller',['deepcaller'],168),
  innertreeking:define('ancient',['ancient'],150),
  windtreeking:define('ancient',['ancient'],150),
  crownwatcher:define('deepcaller',['deepcaller'],168),
  castleguardian:define('ancient',['ancient','bloom']),
  towerguardian:define('bloom',['bloom']),
  forgeguardian:define('ancient',['ancient']),
  riverguardian:define('ancient',['ancient','bloom']),
  pursuitcaptain:define('ancient',['ancient'],132)
});
const CANONICAL=Object.freeze(['ancient','bloom','broodmother','deepcaller','frostcrown','furnace']);
const WORLD_SOURCES=Object.freeze([
  ['clearing:rift:11-boss','drownedwatcher'],
  ['clearing:rift:17-boss','innertreeking'],
  ['clearing:verdant:15-boss','windtreeking'],
  ['clearing:verdant:17-boss','crownwatcher']
]);
// Dungeon instances retain their names and IDs, but not the site's featureId.
// Limit this legacy-name fallback to actual dungeon Boss ownership.
const DUNGEON_NAMES=Object.freeze({
  '旧王城守卫':'castleguardian',
  '王城守望者':'castleguardian',
  '暮钟守卫':'towerguardian',
  '熔炉守卫':'forgeguardian',
  '暗河守卫':'riverguardian'
});
const compatible=(id,kind)=>Object.hasOwn(BOSS_APPEARANCES,id)&&BOSS_APPEARANCES[id].bossKinds.includes(kind);

export function bossAppearanceId(entity){
  if(entity?.type!=='boss')return null;
  const kind=entity.bossKind||'ancient',explicit=entity.appearanceId;
  if(typeof explicit==='string'){
    if(compatible(explicit,kind))return explicit;
    if(CANONICAL.includes(explicit)&&explicit===kind)return explicit;
  }
  if(entity.storyProfile==='captain'&&compatible('pursuitcaptain',kind))return 'pursuitcaptain';
  if(entity.worldBoss&&typeof entity.territoryId==='string'){
    for(const [source,id] of WORLD_SOURCES){
      if((entity.territoryId===source||entity.territoryId.endsWith(`:${source}`))&&compatible(id,kind))return id;
    }
  }
  if(entity.dungeonBoss){
    const cave=typeof entity.dungeonId==='string'&&entity.dungeonId.startsWith('rift:');
    const id=cave?'riverguardian':Object.hasOwn(DUNGEON_NAMES,entity.name)?DUNGEON_NAMES[entity.name]:'castleguardian';
    if(compatible(id,kind))return id;
  }
  if((entity.id==='boss:castle'||entity.archiveId==='boss:castle')&&compatible('castleguardian',kind))return 'castleguardian';
  return null;
}

export function bossAppearance(entity){
  const id=bossAppearanceId(entity);
  return id&&Object.hasOwn(BOSS_APPEARANCES,id)?BOSS_APPEARANCES[id]:null;
}
export const isAnimatedBossAppearance=entity=>bossAppearance(entity)?.animated===true;
