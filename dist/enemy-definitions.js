// Content data stays independent of Game, renderers and encounter generation.
const codex=(name,role,description,advice,color)=>Object.freeze({name,role,description,advice,color,source:'在荒野、事件与遗迹中遭遇'});
const define=(id,r,baseHp,baseSpeed,damage,xp,movement,behavior,extra={})=>Object.freeze({id,r,baseHp,baseSpeed,damage,xp,movement,behavior,visual:id,...extra});
export const ENEMY_DEFS=Object.freeze({
  slime:define('slime',16,26,85,9,4,'ground','chase',{codex:codex('绿叶史莱姆','地面 · 近身','成群接近的林间生物，单体威胁不高，却会逐渐压缩走位空间。','边移动边清理前方，避免被四面的史莱姆包围。','#a9cb84')}),
  beetle:define('beetle',18,43,100,12,6,'ground','chase',{locomotion:true,codex:codex('硬壳甲虫','地面 · 追击','贴地爬行的甲虫，比史莱姆更结实，会持续逼近。','提前清理行进路线上的甲虫，避免在障碍附近被围堵。','#d5ba7c')}),
  bat:define('bat',11,24,145,7,4,'air','chase',{wobble:Object.freeze({frequency:5,amplitude:.52}),codex:codex('夜翼蝙蝠','飞行 · 快速','移动轻快的飞行敌人，可以越过水面和低矮障碍。','留意侧后方的追击；低矮石块挡不住它，利用高大障碍拉开距离。','#b9b1cf')}),
  brute:define('brute',26,115,60,17,13,'ground','chase',{codex:codex('林地巨兽','地面 · 强壮','体型大、生命厚重、步伐较慢，近身接触更危险。','保留退路，利用远程攻击或集中伤害削减生命，不要硬挤过去。','#b7bd86')}),
  boar:define('boar',22,80,75,14,7,'ground','boar',{codex:codex('冲锋野猪','地面 · 冲撞','蓄力后沿锁定方向高速冲锋，撞上障碍时会短暂眩晕。','看准蓄力方向向侧面避开，也可以诱导它撞向树石。','#c9a982')}),
  spore:define('spore',20,65,55,12,7,'ground','spore',{codex:codex('孢子菇','地面 · 远程','在中距离蓄力发射孢子，借助敌群从后方施压。','横向移动躲开孢子，利用高大树石挡住弹道，寻找机会近身。','#d7aed8')}),
  boss:define('boss',49,2300,49,22,160,'ground','boss',{easyHp:1700,surge:Object.freeze({frequency:.85,amplitude:1.15})}),
});
export const ENEMY_IDS=Object.freeze(Object.keys(ENEMY_DEFS));
export const ENEMY_CODEX_IDS=Object.freeze(['slime','bat','beetle','brute','boar','spore']);
export function enemyDefinition(type){
  if(!Object.hasOwn(ENEMY_DEFS,type))throw new RangeError(`Unknown enemy type: ${String(type)}`);
  return ENEMY_DEFS[type];
}
