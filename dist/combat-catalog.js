// Shared definitions describe ownership, growth and scope; runtime combat state
// lives in CombatBuild. A rank is an investment, never a second attack level.
const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const ATTRIBUTE_DEFS=freeze({
  power:{id:'power',name:'攻击',scope:'character'},
  vitality:{id:'vitality',name:'生命',scope:'character'},
  defense:{id:'defense',name:'防御',scope:'character',defaultValue:0},
  speed:{id:'speed',name:'移动',scope:'character'},
  regen:{id:'regen',name:'恢复',scope:'character'},
  magnet:{id:'magnet',name:'拾取',scope:'character'}
});
export const WEAPON_DEFS=freeze({
  arrow:{id:'arrow',name:'翠羽飞矢',icon:'➶',color:'#a7dab7',category:'weapon',binding:'weapon',activation:'automatic',tier:'regular',source:'innate',initialRank:1,maxBaseRank:1,attackId:'arrow'},
  orbit:{id:'orbit',name:'环刃',icon:'◈',color:'#f0d28a',category:'weapon',binding:'weapon',activation:'automatic',tier:'regular',source:'crystal',initialRank:0,maxBaseRank:5,attackId:'orbit'}
});
export const SUPER_SKILL_DEFS=freeze([
  {id:'thorns',name:'荆棘缚阵',desc:'在敌群脚下召出荆棘，造成范围伤害并短暂定身普通敌人',icon:'♧',color:'#a9d888',source:'region',regionId:'forest',rewardTier:'区域超级技能'},
  {id:'miasma',name:'瘴雾侵蚀',desc:'在敌群脚下爆发瘴气，留下持续 4 秒的侵蚀雾，每半秒造成范围伤害',icon:'♨',color:'#cea1da',source:'region',regionId:'marsh',rewardTier:'区域超级技能'},
  {id:'runes',name:'符文穿击',desc:'朝敌人展开三道符文射线，贯穿沿途目标，同次攻击不重复命中',icon:'✧',color:'#89ddd8',source:'region',regionId:'ruins',rewardTier:'区域超级技能'},
  {id:'meteor',name:'星陨',desc:'标记数处敌群位置，短暂蓄能后落下星陨，造成高额范围伤害',icon:'✦',color:'#f1bc79',source:'castle',regionId:null,rewardTier:'城堡超级技能'},
  {id:'swords',name:'王庭剑阵',desc:'连续唤出追击灵剑，优先攻击附近首领和强敌',icon:'⚔',color:'#f0dda3',source:'castle',regionId:null,rewardTier:'城堡超级技能'},
  {id:'vortex',name:'虚空漩涡',desc:'生成持续漩涡，牵引普通敌人并反复造成伤害；首领不受牵引',icon:'◉',color:'#b7a3ed',source:'castle',regionId:null,rewardTier:'城堡超级技能'}
].map(def=>({...def,category:'skill',ownerId:def.id,binding:'character',activation:'automatic',tier:'super',automatic:true,initialRank:0,maxBaseRank:3,maxLevel:3})));
export const SKILL_DEFS=freeze({
  pulse:{id:'pulse',name:'大地回响',icon:'◎',color:'#80d5bd',category:'skill',binding:'character',activation:'automatic',tier:'regular',source:'crystal',initialRank:0,maxBaseRank:5},
  lightning:{id:'lightning',name:'唤雷',icon:'ϟ',color:'#b6bafa',category:'skill',binding:'character',activation:'automatic',tier:'regular',source:'crystal',initialRank:0,maxBaseRank:5},
  storm:{id:'storm',name:'天雷轰击',icon:'ϟ',color:'#d4e7ff',category:'skill',binding:'character',activation:'manual',tier:'super',source:'innate',initialRank:1,maxBaseRank:3},
  ...Object.fromEntries(SUPER_SKILL_DEFS.map(def=>[def.id,def]))
});
const owned=id=>({kind:'owned',id});
const rank=(id,min)=>({kind:'rank',id,min});
const route=id=>({kind:'branch',id});
const effect=(stat,value,operation='add')=>({stat,value,operation});
const upgrade=(def)=>({requires:[],effects:[],...def});
export const UPGRADE_DEFS=freeze([
  upgrade({id:'power',name:'锋芒',desc:'角色通用伤害加成提高 25%，作用于武器和独立技能',kind:'属性强化',icon:'✦',color:'#e6be73',category:'attribute',ownerId:'power',upgradeKind:'rank',cap:6,effects:[effect('damageBonus',.25)]}),
  upgrade({id:'rapid',name:'疾风连射',desc:'翠羽飞矢攻击速度提升 15%',kind:'武器强化',icon:'»',color:'#89d8ad',category:'weapon',ownerId:'arrow',upgradeKind:'modifier',cap:5,requires:[owned('arrow')],effects:[effect('attackRateBonus',.15)]}),
  upgrade({id:'multishot',name:'分裂箭',desc:'保留全伤主箭，每轮增加一支 60% 伤害的副箭',kind:'武器强化',icon:'⋔',color:'#a7dab7',category:'weapon',ownerId:'arrow',upgradeKind:'modifier',cap:3,requires:[owned('arrow')],effects:[effect('projectileCount',1)]}),
  upgrade({id:'orbit',name:'环刃',desc:'环绕利刃附加流血，可由大地回响引爆',kind:'获得武器',icon:'◈',color:'#f0d28a',category:'weapon',ownerId:'orbit',upgradeKind:'rank',cap:5}),
  upgrade({id:'pulse',name:'大地回响',desc:'环形冲击波击退敌人；消耗流血时伤害增加 25%',kind:'学习技能',icon:'◎',color:'#80d5bd',category:'skill',ownerId:'pulse',upgradeKind:'rank',cap:5,branchAtRank:4}),
  upgrade({id:'lightning',name:'唤雷',desc:'连锁闪电附加 2.5 秒感电，飞矢或环刃命中可向附近敌人传导',kind:'学习技能',icon:'ϟ',color:'#b6bafa',category:'skill',ownerId:'lightning',upgradeKind:'rank',cap:5,branchAtRank:4}),
  upgrade({id:'speed',name:'轻盈步伐',desc:'移动速度提升 8%，更轻松穿过兽群',kind:'属性强化',icon:'↗',color:'#9acbcc',category:'attribute',ownerId:'speed',upgradeKind:'rank',cap:4,effects:[effect('moveSpeedBonus',.08)]}),
  upgrade({id:'magnet',name:'林间引力',desc:'灵晶和金币拾取范围增加 35%',kind:'属性强化',icon:'✧',color:'#a1cf98',category:'attribute',ownerId:'magnet',upgradeKind:'rank',cap:4,effects:[effect('pickupRangeBonus',.35)]}),
  upgrade({id:'vitality',name:'古树之心',desc:'最大生命增加 25，并恢复 35 生命',kind:'属性强化',icon:'♥',color:'#e7a68b',category:'attribute',ownerId:'vitality',upgradeKind:'rank',cap:5,effects:[effect('maxHealth',25),effect('heal',35)]}),
  upgrade({id:'regen',name:'生生不息',desc:'每秒恢复 0.8 生命',kind:'属性强化',icon:'✚',color:'#a4dc9d',category:'attribute',ownerId:'regen',upgradeKind:'rank',cap:3,effects:[effect('healthRegen',.8)]}),
  upgrade({id:'arrowPower',name:'飞矢淬锋',desc:'仅翠羽飞矢基础伤害加成提高 15%',kind:'武器强化',icon:'➶',color:'#a7dab7',category:'weapon',ownerId:'arrow',upgradeKind:'modifier',cap:3,requires:[owned('arrow')],effects:[effect('baseDamageBonus',.15)]}),
  upgrade({id:'arrowRetention',name:'余势不衰',desc:'穿透或弹射后，每段伤害保留比例提高 10 个百分点',kind:'分支强化',icon:'⌁',color:'#d8d196',category:'weapon',ownerId:'arrow',upgradeKind:'modifier',cap:2,requires:[owned('arrow'),route('arrow')],effects:[effect('damageRetention',.1)]}),
  upgrade({id:'arrowReach',name:'贯流延伸',desc:'穿透最多命中目标或弹射次数增加 1',kind:'分支强化',icon:'⋔',color:'#abdca3',category:'weapon',ownerId:'arrow',upgradeKind:'modifier',cap:1,requires:[owned('arrow'),route('arrow')],effects:[effect('maxTargets',1)]}),
  upgrade({id:'orbitPower',name:'裂刃淬锋',desc:'仅环刃基础伤害加成提高 15%，进化形态持续生效',kind:'进化后强化',icon:'◈',color:'#f0d28a',category:'weapon',ownerId:'orbit',upgradeKind:'modifier',cap:2,requires:[owned('orbit'),rank('orbit',5)],effects:[effect('baseDamageBonus',.15)]}),
  upgrade({id:'orbitRadius',name:'环域延展',desc:'环刃环绕半径增加 8，进化扩张同步生效',kind:'进化后强化',icon:'◎',color:'#f0d28a',category:'weapon',ownerId:'orbit',upgradeKind:'modifier',cap:2,requires:[owned('orbit'),rank('orbit',5)],effects:[effect('radius',8)]}),
  upgrade({id:'pulseMastery',name:'地脉精研',desc:'仅大地回响及所选分支的伤害加成提高 12%',kind:'技能强化',icon:'◎',color:'#80d5bd',category:'skill',ownerId:'pulse',upgradeKind:'modifier',cap:2,requires:[owned('pulse'),rank('pulse',5),route('pulse')],effects:[effect('baseDamageBonus',.12)]}),
  upgrade({id:'lightningMastery',name:'雷鸣精研',desc:'仅唤雷及所选分支的伤害加成提高 12%',kind:'技能强化',icon:'ϟ',color:'#b6bafa',category:'skill',ownerId:'lightning',upgradeKind:'modifier',cap:2,requires:[owned('lightning'),rank('lightning',5),route('lightning')],effects:[effect('baseDamageBonus',.12)]}),
  upgrade({id:'storm',name:'天雷轰击',desc:'天雷基础伤害加成提高 15%，基础冷却缩短 10%',kind:'超级技能强化',icon:'ϟ',color:'#d4e7ff',category:'skill',ownerId:'storm',upgradeKind:'rank',tier:'super',activation:'manual',cap:2,requires:[owned('storm')],effects:[effect('baseDamageBonus',.15),effect('cooldownReduction',.1)]})
]);
export const ENDLESS_UPGRADES=freeze([
  upgrade({id:'endlessPower',name:'百炼锋芒',desc:'角色通用伤害加成提高 8%',kind:'无尽属性强化',icon:'✦',color:'#e6be73',category:'attribute',ownerId:'power',upgradeKind:'rank',cap:Infinity,effects:[effect('damageBonus',.08)]}),
  upgrade({id:'endlessVitality',name:'深根之心',desc:'本局最大生命增加 12，并恢复 24 生命',kind:'无尽属性强化',icon:'♥',color:'#e7a68b',category:'attribute',ownerId:'vitality',upgradeKind:'rank',cap:Infinity,effects:[effect('maxHealth',12),effect('heal',24)]}),
  upgrade({id:'endlessRegen',name:'林泉赐福',desc:'本局每秒生命恢复量增加 0.3',kind:'无尽属性强化',icon:'✚',color:'#a4dc9d',category:'attribute',ownerId:'regen',upgradeKind:'rank',cap:Infinity,effects:[effect('healthRegen',.3)]})
]);
export const LEVEL_CAPS=freeze(Object.fromEntries(UPGRADE_DEFS.map(def=>[def.id,def.cap])));
export const EVOLUTIONS=freeze({
  orbit:{name:'裂风环刃',desc:'每 3 秒向外扩张再收拢，扩大环刃的切割范围',category:'weapon',ownerId:'orbit',upgradeKind:'evolution',requires:[rank('orbit',5)]},
  pulse:{name:'双重回响',desc:'冲击波后在原位置追加一道范围更大的回波，造成 60% 伤害',category:'skill',ownerId:'pulse',upgradeKind:'evolution'},
  lightning:{name:'雷暴链',desc:'最多追击 5 个目标，新增的两次跳跃造成 40% 伤害',category:'skill',ownerId:'lightning',upgradeKind:'evolution'}
});
const UPGRADE_INDEX=new Map([...UPGRADE_DEFS,...ENDLESS_UPGRADES,...SUPER_SKILL_DEFS.map(def=>({...def,id:`super:${def.id}`,upgradeKind:'rank',cap:3,requires:[owned(def.id)]}))].map(def=>[def.id,freeze(def)]));
export const getUpgradeDefinition=id=>UPGRADE_INDEX.get(id)||null;
const requirements={
  owned:(build,rule)=>(build.getWeapon(rule.id)||build.getSkill(rule.id))?.baseRank>0,
  rank:(build,rule)=>build.getRank(rule.id)>=rule.min,
  branch:(build,rule)=>!!(build.getWeapon(rule.id)||build.getSkill(rule.id))?.branch
};
export const meetsUpgradeRequirements=(build,def)=>(def.requires||[]).every(rule=>requirements[rule.kind]?.(build,rule)===true);
export function canTakeUpgrade(build,id) {
  const def=typeof id==='object'?id:getUpgradeDefinition(id);
  if(!build||!def||build.getRank(def.id)>=def.cap)return false;
  if(def.branchAtRank!==undefined&&build.getRank(def.id)>=def.branchAtRank)return false;
  return meetsUpgradeRequirements(build,def);
}
