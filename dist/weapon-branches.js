// Routes are exclusive choices, not independent levels. Their modifiers can
// continue to grow after selection and live on the same weapon/skill record.
const branch=(weaponId,id,name,desc,icon,color)=>Object.freeze({
  id:`branch:${weaponId}:${id}`,weaponId,branch:id,name,desc,icon,color,
  ownerId:weaponId,category:weaponId==='arrow'?'weapon':'skill',upgradeKind:'branch',
  kind:weaponId==='arrow'?'武器分支':'技能分支',evolves:weaponId!=='arrow',evolutionName:weaponId==='arrow'?undefined:name
});
export const WEAPON_BRANCHES=Object.freeze({
  arrow:Object.freeze([
    branch('arrow','pierce','穿林飞矢','飞矢穿透最多 3 个不同目标，每次穿透后的伤害保留 65%','➶','#abdca3'),
    branch('arrow','ricochet','弹射飞矢','飞矢向 150 范围内的可见敌人弹射最多 2 次，每跳伤害保留 65%','⌁','#e3d293')
  ]),
  pulse:Object.freeze([
    branch('pulse','echoes','连续震波','升至 5 级；0.35 秒后在原位置追加范围更大的回波，造成 60% 伤害','◎','#a8dfbb'),
    branch('pulse','control','撼地重震','升至 5 级；冲击范围扩大至 210，强力震退并使非 Boss 敌人减速 35%，持续 1.1 秒','◉','#9fe5cf')
  ]),
  lightning:Object.freeze([
    branch('lightning','chain','雷暴链','升至 5 级；最多追击 5 个目标，最后两次跳跃造成 40% 伤害','ϟ','#bfc4fb'),
    branch('lightning','focus','聚雷轰击','升至 5 级；集中攻击一个目标，造成 250% 伤害，优先范围内 Boss 和高生命敌人','↯','#cadfff')
  ])
});
export const BRANCH_WEAPONS=Object.freeze(Object.keys(WEAPON_BRANCHES));
export function branchDefinition(weaponId,id) {
  return WEAPON_BRANCHES[weaponId]?.find(def=>def.branch===id)||null;
}
export function isBranchReady(game,weaponId) {
  const build=game.build||game;
  if(!WEAPON_BRANCHES[weaponId]||build.branches[weaponId])return false;
  // Preserve the established first route threshold; power-only investments do
  // not bring forward the old rapid/multishot milestone during migration.
  return weaponId==='arrow'?1+build.levels.rapid+build.levels.multishot>=4:build.levels[weaponId]>=4;
}
