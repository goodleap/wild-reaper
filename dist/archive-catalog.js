import { WEAPON_DEFS, SKILL_DEFS, UPGRADE_DEFS, EVOLUTIONS } from './combat-catalog.js';
import { WEAPON_BRANCHES } from './weapon-branches.js';

export const ARCHIVE_CATEGORIES=Object.freeze([
  {id:'enemies',name:'怪物'},{id:'bosses',name:'首领'},{id:'weapons',name:'武器'},
  {id:'skills',name:'技能'},{id:'weaponSkills',name:'武器技能'}
]);
const enemy=(id,name,role,description,advice,color)=>({id:`enemy:${id}`,category:'enemies',name,role,description,advice,color,type:id,source:'在荒野、事件与遗迹中遭遇'});
const enemies=[
  enemy('slime','绿叶史莱姆','地面 · 近身','成群接近的林间生物，单体威胁不高，却会逐渐压缩走位空间。','边移动边清理前方，避免被四面的史莱姆包围。','#a9cb84'),
  enemy('bat','夜翼蝙蝠','飞行 · 快速','移动轻快的飞行敌人，可以越过水面和低矮障碍。','留意侧后方的追击；低矮石块挡不住它，利用高大障碍拉开距离。','#b9b1cf'),
  enemy('beetle','硬壳甲虫','地面 · 追击','贴地爬行的甲虫，比史莱姆更结实，会持续逼近。','提前清理行进路线上的甲虫，避免在障碍附近被围堵。','#d5ba7c'),
  enemy('brute','林地巨兽','地面 · 强壮','体型大、生命厚重、步伐较慢，近身接触更危险。','保留退路，利用远程攻击或集中伤害削减生命，不要硬挤过去。','#b7bd86'),
  enemy('boar','冲锋野猪','地面 · 冲撞','蓄力后沿锁定方向高速冲锋，撞上障碍时会短暂眩晕。','看准蓄力方向向侧面避开，也可以诱导它撞向树石。','#c9a982'),
  enemy('spore','孢子菇','地面 · 远程','在中距离蓄力发射孢子，借助敌群从后方施压。','横向移动躲开孢子，利用高大树石挡住弹道，寻找机会近身。','#d7aed8')
];
const bosses=[
  {id:'boss:ancient',name:'荒野领主',role:'区域首领 · 震地',description:'守卫世界传送门的巨大领主，逼近后会蓄力发动范围震击。',advice:'离开震地预警区，在攻击后的停顿中反击；击败后领取奖励并激活传送门。',type:'boss',bossKind:'ancient',color:'#e7bc8a',source:'区域传送门的守卫'},
  {id:'boss:bloom',name:'孢冠领主',role:'区域首领 · 远程',description:'以扇形孢子弹和定点孢爆封锁走位，并尝试保持攻击距离。',advice:'绕向扇射侧面，离开地面孢爆预警；高大障碍可以遮挡飞行孢子。',type:'boss',bossKind:'bloom',color:'#d7aada',source:'区域传送门的守卫'},
  {id:'boss:castle',name:'王城守望者',role:'城堡首领 · 最终挑战',description:'驻守旧王城迷宫深处的强敌，击败后才能开启王城宝藏。',advice:'先确认房间退路，根据震地或孢子预警闪避；击败守卫后前往宝箱领取城堡奖励。',type:'boss',bossKind:'ancient',color:'#ddbd89',source:'旧王城迷宫深处'}
].map(def=>({...def,category:'bosses'}));
const copy={
  sword:{role:'近战 · 正面爆发',description:'自动朝附近敌人挥砍，集中打击身前一片区域。',growth:'提升基础等级强化挥砍；再选择横扫或重斩路线。剑气与剑术精研进一步扩展长剑能力。',advice:'用走位把敌人聚在正面；横扫处理敌群，重斩偏向集中爆发。'},
  arrow:{role:'远程 · 持续输出',description:'自动发射飞矢，优先保持距离并持续攻击可见目标。',growth:'分别强化射速、分裂箭和伤害；选择穿透或弹射后，还可强化后续命中。',advice:'分裂箭提升覆盖，穿透适合直线敌群，弹射适合邻近的分散敌人。'},
  orbit:{role:'近战 · 环绕切割',description:'飞刃沿周身环绕，反复掠过敌人并附加流血。每枚刃的一次穿过独立结算。',growth:'等级提升增加环刃数量与切割能力；满基础等级进化为裂风环刃，再强化伤害或半径。',advice:'让敌人靠近飞刃的环绕轨迹；流血可由大地回响消耗并增强冲击。'},
  barrier:{role:'自动 · 防护',description:'就绪后自动待命，受击时展开护盾，吸收首击与随后伤害。',growth:'升级增强护盾容量、持续时间，并缩短再次就绪的冷却。',advice:'护盾帮助缓冲失误；触发后仍应及时离开包围。'},
  pulse:{role:'自动 · 周身解围',description:'从自身向外释放环形冲击波，造成伤害并击退敌人；可消耗流血增强伤害。',growth:'升级后选择追加回波或扩大冲击与控制，再通过地脉精研强化。',advice:'配合环刃的流血清理近身敌人，为移动争取空间。'},
  lightning:{role:'自动 · 感电联动',description:'连锁闪电攻击附近敌人并附加感电；飞矢或环刃命中感电目标可传导伤害。',growth:'升级后选择更长的雷暴链，或集中攻击强敌的聚雷轰击；雷鸣精研继续强化。',advice:'与飞矢、环刃配合触发感电；根据敌群或首领压力选择分支。'},
  storm:{role:'手动 · 全屏轰击',description:'释放天雷打击屏内可见敌人，密集敌群可共享雷击；墙体隔断仍会限制目标。',growth:'强化天雷伤害并缩短冷却。',advice:'在敌群密集或需要突围时释放；只有这一项需要主动操作。'},
  domain:{role:'自动 · 地面领域',description:'在敌人附近展开持续领域，可选择荆棘束缚或瘴雾侵蚀，优先关注强敌。',growth:'获得时选择领域路线；升级增强伤害、范围与释放频率，荆棘束缚也会增强。',advice:'领域作用于地面敌人；引导敌群在领域内停留，飞行敌人需要其他攻击处理。'},
  meteor:{role:'自动 · 延迟爆发',description:'优先锁定范围内强敌所在位置，短暂预警后落下星陨，造成范围爆炸。',growth:'升级增强单次爆炸、作用范围和释放频率，并增加落点。',advice:'适合打击聚集的强敌；落点锁定后，敌人的移动会影响实际命中。'},
  swords:{role:'自动 · 追击强敌',description:'灵剑从周身分散飞出，再沿曲线追向范围内敌人，优先选择首领与精英。',growth:'升级增加灵剑数量与伤害，并缩短冷却。',advice:'灵剑会追踪存活目标；目标提前被击败时仍飞向其最后位置。'},
  vortex:{role:'自动 · 聚怪压制',description:'在敌人附近形成持续漩涡，牵引普通怪物并反复伤害，优先锁定强敌区域。',growth:'升级提升伤害、范围、牵引速度与释放频率。',advice:'利用聚怪配合范围攻击；首领会受伤，但不会被漩涡拉动。'}
};
const sourceLabel=def=>def.source==='innate'?'出场自带':def.source==='castle'?'击败城堡首领后，从王城宝藏获得':def.source==='region'?'击败区域首领后，从奖励中获得':'消耗灵晶成长时获得';
const equipment=(def,category)=>({id:`${category==='weapons'?'weapon':'skill'}:${def.id}`,ownerId:def.id,category,name:def.name,color:def.color,icon:def.icon,tier:def.tier,activation:def.activation,source:sourceLabel(def),...copy[def.id],branches:(WEAPON_BRANCHES[def.id]||[]).map(branch=>({id:branch.branch,name:branch.name,description:branch.desc})),evolution:EVOLUTIONS[def.id]||null});
const weaponSkills=[
  {id:'weaponSkill:swordEnergy',category:'weaponSkills',ownerId:'sword',modifierId:'swordEnergy',name:'剑气',color:'#a9e4dc',tier:'regular',role:'长剑专属 · 短程延伸',description:'随挥砍释放多道略微发散的剑气，飞离剑身，延伸长剑的攻击距离。',growth:'升级增加剑气距离、威力和覆盖；同次挥砍对同一敌人只命中一次。',advice:'保持长剑的正面攻击节奏，用剑气打到稍远的敌人。',source:'长剑达到基础 3 级后，在灵晶成长中获得'},
  {id:'weaponSkill:arrowRune',category:'weaponSkills',ownerId:'arrow',modifierId:'arrowRune',name:'符文穿击',color:'#89ddd8',tier:'super',role:'飞矢专属 · 贯穿重箭',description:'穿透飞矢周期性释放强力符文重箭，沿弹道贯穿敌群。',growth:'获得时进入穿透路线；后续强化符文伤害并缩短触发间隔。',advice:'与穿透路线绑定，弹射路线无法获得；利用直线站位穿过更多敌人。',source:'从区域首领奖励获得；随后可用灵晶强化'}
];
const freezeEntry=entry=>Object.freeze({...entry,branches:Object.freeze((entry.branches||[]).map(Object.freeze))});
export const ARCHIVE_ENTRIES=Object.freeze([...enemies,...bosses,...Object.values(WEAPON_DEFS).map(def=>equipment(def,'weapons')),...Object.values(SKILL_DEFS).map(def=>equipment(def,'skills')),...weaponSkills].map(freezeEntry));
export const ARCHIVE_IDS=Object.freeze(ARCHIVE_ENTRIES.map(entry=>entry.id));
export const ARCHIVE_ENTRY_BY_ID=new Map(ARCHIVE_ENTRIES.map(entry=>[entry.id,entry]));

export function enemyArchiveId(enemy){
  if(!enemy||enemy.trainingDummy||enemy.type==='trainingDummy')return null;
  if(enemy.type==='boss')return enemy.dungeonBoss?'boss:castle':enemy.bossKind==='bloom'?'boss:bloom':'boss:ancient';
  const id=`enemy:${enemy.type}`;return ARCHIVE_ENTRY_BY_ID.has(id)?id:null;
}
export function ownedArchiveEntries(build){
  if(!build)return [];
  const owned=[];
  for(const [kind,defs] of [['weapon',WEAPON_DEFS],['skill',SKILL_DEFS]])for(const def of Object.values(defs)){
    const state=kind==='weapon'?build.getWeapon?.(def.id)||build.weapons?.[def.id]:build.getSkill?.(def.id)||build.skills?.[def.id];
    if(!(state?.baseRank>0))continue;
    owned.push({id:`${kind}:${def.id}`,level:state.level||state.baseRank,branch:state.branch||null,evolved:!!state.evolved,modifiers:{...state.modifiers}});
  }
  for(const entry of weaponSkills){
    const state=build.getWeapon?.(entry.ownerId)||build.weapons?.[entry.ownerId];
    const level=state?.baseRank>0?(state.modifiers?.[entry.modifierId]||0):0;
    if(level>0)owned.push({id:entry.id,level,branch:null,evolved:false});
  }
  return owned;
}

// Compact names are read from the same catalog as upgrade choices.
export function archiveUpgradeNames(id){
  const owner=ARCHIVE_ENTRY_BY_ID.get(id)?.ownerId;
  return UPGRADE_DEFS.filter(def=>def.ownerId===owner&&def.upgradeKind==='modifier'&&def.kind!=='武器技能').map(def=>def.name);
}
