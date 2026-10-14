import { getUpgradeDefinition, WEAPON_DEFS, SKILL_DEFS } from './combat-catalog.js';
import { resolveCharacterStats, resolveMaxHealth, weaponStats, skillStats, defenseReduction } from './combat-stats.js';
import { getSuperSkillStats } from './super-skills.js';

// The same build rules and derived stats power combat and non-mutating previews.
const RARITIES=Object.freeze({
  common:{name:'普通',color:'#c0c9bd'},uncommon:{name:'精良',color:'#a8d798'},
  rare:{name:'稀有',color:'#8fc9ed'},epic:{name:'史诗',color:'#d3afea'},legendary:{name:'传说',color:'#f1cd83'}
});
const SUPER_RARITY={domain:'epic',swords:'epic',meteor:'legendary',vortex:'legendary'};
const numeric=n=>Number(Number(n).toFixed(2));
const num=(n,suffix='')=>`${numeric(n)}${suffix}`;
const pair=(before,after)=>before===after?num(after):`${num(before)}→${num(after)}`;
const change=(label,before,after,suffix='')=>({label,before:before===null?null:num(before,suffix),after:num(after,suffix)});
const fixed=(label,value)=>({label,before:null,after:String(value)});
const getOwner=(build,id)=>build.getWeapon(id)||build.getSkill(id);

function previewGame(game,choice) {
  const preview=game.build.previewUpgrade(choice),build=preview||game.build,player={...game.player};
  const next={...game,build,levels:build.levels,branches:build.branches,evolutions:build.evolutions,player};
  player.maxHp=resolveMaxHealth(next);
  return next;
}
function superSummary(id,before,after,branch) {
  if(!before)return {
    domain:branch==='erosion'?`爆发 ${after.impactDamage}，每 ${after.interval} 秒侵蚀 ${after.damage}；离开后短暂残留。`:`爆发 ${after.impactDamage}，每跳 ${after.damage}；反复束缚地面小怪，减速强敌。`,
    meteor:`锁定敌群落下 ${after.count} 颗星陨，每颗造成 ${after.damage} 范围伤害。`,
    swords:`每轮 ${after.count} 柄追击灵剑，每剑 ${after.damage} 伤害，优先首领。`,
    vortex:`持续 ${after.duration} 秒，每 ${after.interval} 秒造成 ${after.damage} 伤害并聚怪；首领免牵引。`
  }[id];
  return {
    domain:`爆发 ${pair(before.impactDamage,after.impactDamage)}，每跳 ${pair(before.damage,after.damage)}；领域扩大、冷却缩短。`,
    meteor:`伤害 ${pair(before.damage,after.damage)}${before.count!==after.count?`，星陨 ${pair(before.count,after.count)} 颗`:''}；爆炸扩大、冷却缩短。`,
    swords:`每剑伤害 ${pair(before.damage,after.damage)}，灵剑 ${pair(before.count,after.count)} 柄；冷却缩短。`,
    vortex:`每跳伤害 ${pair(before.damage,after.damage)}，牵引 ${pair(before.pull,after.pull)}；范围扩大、冷却缩短。`
  }[id];
}

export function presentUpgrade(choice,game) {
  const id=choice.id,definition=getUpgradeDefinition(id),superId=choice.skillId||(id.startsWith('super:')?id.slice(6):SUPER_RARITY[id]?id:null);
  const ownerId=definition?.ownerId||choice.ownerId||choice.weaponId||superId||id,owner=WEAPON_DEFS[ownerId]||SKILL_DEFS[ownerId];
  const category=definition?.category||choice.category||(WEAPON_DEFS[ownerId]?'weapon':'skill');
  const model={name:choice.name,icon:choice.icon,color:choice.color,category,ownerId,ownerName:owner?.name||'',tier:owner?.tier||'regular',family:definition?.family||owner?.family||null,activation:owner?.activation||null,action:'升级',scope:'',description:choice.desc,rows:[],levelLabel:'',note:'',rarity:'common',summary:''};
  const finish=rarity=>{model.rarity=rarity;model.quality=RARITIES[rarity];return model;};
  if(id==='super:resource') {
    Object.assign(model,{category:'resource',action:'领取',scope:'满阶奖励',levelLabel:'资源宝藏',note:'该类超级技能已全部满阶',summary:choice.desc.replace('该类超级技能已全部满阶，','')});
    return finish('legendary');
  }
  if(superId&&SUPER_RARITY[superId]) {
    const record=game.build.getSkill(superId),level=record.baseRank,branch=choice.domainBranch||record.branch;
    const after=getSuperSkillStats(superId,level+1,branch),before=level?getSuperSkillStats(superId,level,branch):null;
    Object.assign(model,{category:'skill',tier:'super',activation:'automatic',action:level?'升级':'新获得',scope:'超级技能 · 自动攻击',levelLabel:level?`Lv.${level} → ${level+1}`:'获得 Lv.1',note:superId==='domain'?'领域分支互斥 · 最高 3 级':'最高 3 级 · 本局持续生效',summary:superSummary(superId,before,after,branch)});
    if(superId==='domain')model.rows=[change('初始爆发',before?.impactDamage??null,after.impactDamage),change('每次领域伤害',before?.damage??null,after.damage),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    else if(superId==='swords')model.rows=[change('单剑基础伤害',before?.damage??null,after.damage),change('每轮灵剑',before?.count??null,after.count,'柄'),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    else if(superId==='meteor')model.rows=[change('单颗基础伤害',before?.damage??null,after.damage),change('每轮星陨',before?.count??null,after.count,'颗'),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    else if(superId==='vortex')model.rows=[change('每次基础伤害',before?.damage??null,after.damage),change('牵引速度',before?.pull??null,after.pull),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    return finish(SUPER_RARITY[superId]);
  }
  const nextGame=previewGame(game,choice),current=game.build.getRank(id),next=nextGame.build.getRank(id);
  if(category==='attribute') {
    const before=resolveCharacterStats(game),after=resolveCharacterStats(nextGame),endless=id.startsWith('endless');
    Object.assign(model,{action:'加强',scope:'角色属性 · 武器与技能共享',levelLabel:`累计强化 ${next} 次`,note:endless?'无尽成长 · 无次数上限':'对角色持续生效'});
    if(id==='power'||id==='endlessPower'){
      model.rows=[change('角色攻击力',before.attack,after.attack)];
      model.summary=`角色攻击力 ${pair(before.attack,after.attack)}，同时增强武器与通用技能。`;
    } else if(id==='speed') {
      model.rows=[change('移动速度',before.moveSpeed,after.moveSpeed)];model.summary=`移动速度 ${pair(before.moveSpeed,after.moveSpeed)}。`;
    } else if(id==='magnet') {
      model.rows=[change('拾取范围',before.magnet,after.magnet)];model.summary=`灵晶与金币拾取范围 ${pair(before.magnet,after.magnet)}。`;
    } else if(id==='vitality'||id==='endlessVitality') {
      const heal=definition.effects.find(effect=>effect.stat==='heal').value;
      model.rows=[change('最大生命',before.maxHp,after.maxHp),fixed('立即恢复',`最多 ${heal} 生命`)];model.summary=`最大生命 ＋${num(after.maxHp-before.maxHp)}，立即恢复最多 ${heal} 生命。`;
    } else if(id==='toughness'||id==='endlessToughness') {
      const beforeReduction=defenseReduction(before.defense)*100,afterReduction=defenseReduction(after.defense)*100;
      model.scope='角色属性 · 受到伤害降低';
      model.rows=[change('防御',before.defense,after.defense),change('受击减伤',beforeReduction,afterReduction,'%')];
      model.summary=`防御 +${num(after.defense-before.defense)}，减伤 ${num(beforeReduction)}%→${num(afterReduction)}%。`;
    } else {
      model.rows=[change('每秒生命恢复',before.regen,after.regen)];model.summary=`每秒生命恢复 ${pair(before.regen,after.regen)}。`;
    }
    return finish(id==='regen'?'uncommon':'common');
  }
  const beforeOwner=getOwner(game.build,ownerId),afterOwner=getOwner(nextGame.build,ownerId),owned=beforeOwner?.level>0;
  Object.assign(model,{action:choice.branch?'分支':choice.evolves?'进化':owned?'升级':'新获得',scope:`${owner.name} · ${model.activation==='manual'?'手动施放':category==='weapon'?'自动攻击':owner.family==='exclusive'?'专有技能 · 自动':'通用技能 · 自动'}`,levelLabel:owned?`Lv.${beforeOwner.level} → ${afterOwner.level}`:'获得 Lv.1',note:choice.branch?'选择后本局固定，仍可继续强化':definition?.upgradeKind==='modifier'?`本项强化 ${next} / ${definition.cap} 次`:''});
  if(choice.evolves&&ownerId==='orbit')model.name='裂风环刃';
  const stats=category==='weapon'?weaponStats:skillStats,before=stats(game,ownerId),after=stats(nextGame,ownerId);
  const base=stats=>stats.primaryBaseDamage??stats.baseDamage;
  if(id==='swordEnergy'){
    Object.assign(model,{action:current?'升级':'新获得',weaponAbility:true,scope:'长剑 · 武器专属能力',levelLabel:current?`${current} → ${next} 阶`:'获得 1 阶',note:'随长剑生效 · 最高 3 阶'});
    model.rows=[change('挥砍基础伤害',base(before),base(after)),change('剑气覆盖距离',before.energyRank?before.range:null,after.range)];
    model.summary=`斩出 ${after.energyCount} 道飞行剑气，${current?'伤害':'挥砍伤害'} ${pair(base(before),base(after))}，覆盖 ${before.energyRank?pair(before.range,after.range):num(after.range)}。`;
    return finish('rare');
  }
  if(id==='runeArrow'||id==='arrowRune'){
    const runeBefore=before.runic||0;
    Object.assign(model,{tier:'super',activation:'automatic',action:runeBefore?'升级':'新获得',scope:'翠羽飞矢 · 武器专属能力',note:'穿透路线专属 · 最高 3 阶'});
    model.rows=[change('符文基础伤害',runeBefore?before.runicBaseDamage??before.runicDamage:null,after.runicBaseDamage??after.runicDamage),change('符文间隔',runeBefore?before.runicInterval:null,after.runicInterval,'秒')];
    model.summary=runeBefore?`符文伤害 ${pair(before.runicBaseDamage??before.runicDamage,after.runicBaseDamage??after.runicDamage)}，间隔 ${pair(before.runicInterval,after.runicInterval)} 秒。`:`飞矢获得贯穿符文，每 ${num(after.runicInterval)} 秒造成 ${num(after.runicBaseDamage??after.runicDamage)} 伤害。`;
    if(!owned)model.summary=`获得穿透飞矢；每 ${num(after.runicInterval)} 秒触发 ${num(after.runicBaseDamage??after.runicDamage)} 伤害符文。`;
    return finish('epic');
  }
  if(choice.branch) {
    if(ownerId==='sword'){
      model.rows=[change('挥砍基础伤害',base(before),base(after)),change('挥砍角度',before.arc*180/Math.PI,after.arc*180/Math.PI,'°'),change('攻击间隔',before.interval,after.interval,'秒')];
      model.summary=choice.branch==='sweep'?`伤害 ${pair(base(before),base(after))}；挥砍扩大至 ${num(after.arc*180/Math.PI)}°，清理正面敌群。`:`伤害 ${pair(base(before),base(after))}；每 ${num(after.interval)} 秒重斩，集中处理强敌。`;
    }else if(ownerId==='arrow'){
      model.rows=[change('单箭最多命中',before.targetLimit,after.targetLimit,'个目标'),fixed('后续单段伤害',`保留上一段的 ${num(after.retention*100)}%`)];
      model.summary=choice.branch==='pierce'?`飞矢最多贯穿 ${after.targetLimit} 个目标，后续每段保留 ${num(after.retention*100)}% 伤害。`:`飞矢向附近目标弹射 ${after.maxBounces} 次，后续每跳保留 ${num(after.retention*100)}% 伤害。`;
    }else if(ownerId==='pulse'){
      model.rows=[change('基础伤害',base(before),base(after)),choice.branch==='echoes'?fixed('追加回波','0.35秒后 · 60%伤害'):change('冲击范围',before.radius,after.radius)];
      model.summary=choice.branch==='echoes'?`伤害 ${pair(base(before),base(after))}；0.35 秒后追加更大回波，造成 60% 伤害。`:`伤害 ${pair(base(before),base(after))}、范围 ${pair(before.radius,after.radius)}；震退并短暂减速。`;
    }else{
      model.rows=choice.branch==='chain'?[change('最多攻击目标',before.targetLimit,after.targetLimit),fixed('后续连锁伤害',`基础伤害的 ${num(after.chainRetention*100)}%`)]:[change('单目标基础伤害',base(before),base(after)),fixed('索敌优先级','首领 → 高生命敌人')];
      model.summary=choice.branch==='chain'?`伤害 ${pair(base(before),base(after))}，连锁 ${before.targetLimit}→${after.targetLimit} 个目标，后续连锁保留 ${num(after.chainRetention*100)}%。`:`集中轰击一个目标，伤害 ${pair(base(before),base(after))}，优先首领与强敌。`;
    }
    return finish(ownerId==='lightning'?'epic':ownerId==='pulse'?'rare':'uncommon');
  }
  if(id==='rapid') {
    model.scope=`${owner.name} · 专属强化`;model.rows=[change('飞矢攻击频率加成',current*15,next*15,'%'),change('发射间隔',before.interval,after.interval,'秒')];model.summary=`飞矢发射间隔 ${pair(before.interval,after.interval)} 秒，其他武器与技能不变。`;
  }else if(id==='multishot'){
    model.scope=`${owner.name} · 专属强化`;model.rows=[change('每轮箭矢',before.count,after.count,'支'),fixed('主箭 / 副箭伤害',`100% / ${num(after.sideDamageMultiplier*100)}%`)];model.summary=`飞矢每轮 ${before.count}→${after.count} 支；主箭保持全伤，副箭为 ${num(after.sideDamageMultiplier*100)}% 伤害。`;
  }else if(id==='arrowReach'){
    model.rows=[change('单箭最多命中',before.targetLimit,after.targetLimit,'个目标')];model.summary=before.branch==='ricochet'?`弹射次数 ${before.maxBounces}→${after.maxBounces}，继承已强化的伤害保留比例。`:`飞矢最多命中 ${before.targetLimit}→${after.targetLimit} 个目标，继承穿透伤害强化。`;
  }else if(id==='arrowRetention'){
    model.rows=[change('后续伤害保留',before.retention*100,after.retention*100,'%')];model.summary=`穿透或弹射的每段伤害保留 ${pair(before.retention*100,after.retention*100)}%。`;
  }else if(id==='orbitRadius'){
    model.rows=[change('环绕半径',before.radius,after.radius)];model.summary=`环刃半径 ${pair(before.radius,after.radius)}，进化扩张同步增强。`;
  }else if(id==='pulseMastery'||id==='lightningMastery'||id==='swordMastery'){
    model.rows=[change('基础伤害',base(before),base(after)),change('攻击间隔',before.cooldown??before.interval,after.cooldown??after.interval,'秒')];
    model.summary=`伤害 ${pair(base(before),base(after))}，间隔 ${pair(before.cooldown??before.interval,after.cooldown??after.interval)} 秒${id==='lightningMastery'&&!after.focus?`，目标 ${before.targetLimit}→${after.targetLimit}`:''}。`;
  }else if(['arrowPower','orbitPower'].includes(id)){
    model.rows=[change('基础伤害',base(before),base(after))];model.summary=`${owner.name}伤害 ${pair(base(before),base(after))}，当前分支与进化继续生效。`;
  }else if(id==='sword'){
    model.rows=[change('挥砍基础伤害',owned?base(before):null,base(after)),change('挥砍距离',owned?before.range:null,after.range),change('攻击间隔',owned?before.interval:null,after.interval,'秒')];
    model.summary=owned?`挥砍伤害 ${pair(base(before),base(after))}，距离 ${pair(before.range,after.range)}；自动朝敌人斩击。`:`自动朝近身敌人挥剑，每次扇形斩击造成 ${num(base(after))} 伤害。`;
  }else if(id==='arrow'){
    model.rows=[fixed('主箭基础伤害',num(after.baseDamage)),fixed('发射间隔',`${num(after.interval)} 秒`),fixed('索敌范围',after.range)];
    model.summary=`自动远程射击，每 ${num(after.interval)} 秒发射 ${num(after.baseDamage)} 伤害飞矢。`;
  }else if(id==='barrier'){
    model.rows=[change('护盾容量',owned?before.capacity:null,after.capacity),change('恢复间隔',owned?before.cooldown:null,after.cooldown,'秒'),fixed('最长持续',`${num(after.duration)} 秒`)];
    model.summary=owned?`护盾 ${pair(before.capacity,after.capacity)}，冷却 ${pair(before.cooldown,after.cooldown)} 秒；受击自动展开。`:`受击自动展开 ${num(after.capacity)} 护盾，持续至多 ${num(after.duration)} 秒；冷却 ${num(after.cooldown)} 秒。`;
    model.scope='守护屏障 · 自动防护';model.note='触发的一击也受保护 · 最高 3 级';
  }else if(id==='fireball'){
    model.rows=[change('命中伤害',owned?before.baseDamage:null,after.baseDamage),change('每跳燃烧',owned?before.baseBurnDamage:null,after.baseBurnDamage),change('施放间隔',owned?before.cooldown:null,after.cooldown,'秒')];
    model.summary=owned?`命中伤害 ${pair(before.baseDamage,after.baseDamage)}，燃烧 ${pair(before.baseBurnDamage,after.baseBurnDamage)}/${num(after.burnInterval)} 秒；间隔 ${pair(before.cooldown,after.cooldown)} 秒。`:`自动发射火球，命中 ${num(after.baseDamage)} 伤害；每 ${num(after.burnInterval)} 秒燃烧 ${num(after.baseBurnDamage)}，持续 ${num(after.burnDuration)} 秒。`;
    model.note='通用技能 · 燃烧刷新，保留较强效果';
  }else if(id==='frostbolt'){
    model.rows=[change('命中伤害',owned?before.baseDamage:null,after.baseDamage),change('减速',owned?(1-before.slowMultiplier)*100:null,(1-after.slowMultiplier)*100,'%'),change('冻结概率',owned?before.freezeChance*100:null,after.freezeChance*100,'%')];
    model.summary=`${owned?`伤害 ${pair(before.baseDamage,after.baseDamage)}`:`命中 ${num(after.baseDamage)} 伤害`}，减速 ${num((1-after.slowMultiplier)*100)}%${after.freezeChance?`；${num(after.freezeChance*100)}% 概率冻结`:'；3 级解锁概率冻结'}。`;
    model.note='通用技能 · 目标有再次冻结保护间隔';
  }else if(id==='storm'){
    model.rows=[change('基础伤害',base(before),base(after)),change('冷却',before.cooldown,after.cooldown,'秒')];model.summary=`天雷伤害 ${pair(base(before),base(after))}，冷却 ${pair(before.cooldown,after.cooldown)} 秒。`;model.note='手动超级技能 · 最高 3 级';
  }else if(id==='orbit'){
    model.rows=[];const changes=[];
    if(!owned||base(before)!==base(after)){model.rows.push(change('基础伤害',owned?base(before):null,base(after)));changes.push(`伤害 ${pair(base(before),base(after))}`);}
    if(!owned||before.count!==after.count){model.rows.push(change('环绕利刃',owned?before.count:null,after.count,'枚'));changes.push(`利刃 ${pair(before.count,after.count)} 枚`);}
    if(!owned||before.radius!==after.radius){model.rows.push(change('环绕半径',owned?before.radius:null,after.radius));changes.push(`半径 ${pair(before.radius,after.radius)}`);}
    if(choice.evolves){model.rows.push(fixed('新增效果','每3秒扩张并收拢'));changes.push('每 3 秒扩张收拢');}
    model.summary=!owned?`${after.count} 枚利刃环绕护身，每次 ${num(base(after))} 伤害并附加流血。`:`${changes.join('，')}。`;
    model.note=choice.evolves?'进化形态 · 仍可继续强化':'附加流血 · 基础成长 5 级进化';
  }else if(id==='pulse'){
    model.rows=[change('基础伤害',owned?base(before):null,base(after)),change('冲击范围',owned?before.radius:null,after.radius),fixed('施放间隔',`${after.cooldown} 秒`)];model.summary=owned?`伤害 ${pair(base(before),base(after))}，范围 ${pair(before.radius,after.radius)}。`:`敌人靠近时震退并造成 ${num(base(after))} 伤害；消耗流血增伤 25%。`;
  }else if(id==='lightning'){
    model.rows=[change('单段基础伤害',owned?base(before):null,base(after)),fixed('连锁目标',`最多 ${after.targetLimit} 个`),fixed('施放间隔',`${after.cooldown} 秒`)];model.summary=owned?`连锁每段伤害 ${pair(base(before),base(after))}，保持最多 ${after.targetLimit} 个目标。`:`每 ${after.cooldown} 秒连锁最多 ${after.targetLimit} 个目标，每段 ${num(base(after))} 伤害并附加感电。`;
  }else model.summary=choice.desc;
  return finish(id==='storm'?'epic':['fireball','frostbolt'].includes(id)?'rare':ownerId==='lightning'||choice.evolves?'rare':id==='rapid'||id==='arrowPower'?'common':'uncommon');
}

const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const TYPE_ICONS={weapon:'<path d="m5 19 3-6 8-9 4-1-1 4-9 8-5 4Zm1-8 7 7m-9 3 3-3"/>',skill:'<path d="m13 2-8 10h6l-1 8 9-12h-6l2-6Z"/>',attribute:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>',resource:'<path d="m12 3 9 9-9 9-9-9 9-9Z"/>'};
export function upgradeCardHTML(model) {
  const type=model.category==='skill'?({general:'通用技能',exclusive:'专有技能',weapon:'武器技能'}[model.family]||'技能'):model.category==='weapon'&&(model.weaponAbility||model.tier==='super')?'武器技能':{attribute:'属性',weapon:'武器',resource:'宝藏'}[model.category];
  const level=model.category==='skill'||model.category==='weapon'?model.levelLabel:'';
  const context=model.category==='attribute'?(model.note.includes('无尽')?'无尽成长':'角色通用'):model.category==='resource'?'资源补给':model.category==='weapon'&&(model.tier==='super'||model.weaponAbility)?'武器专属能力':model.tier==='super'?(model.activation==='manual'?'手动施放':'自动施放'):model.ownerName;
  const summary=String(model.summary??'').split(/(\d+(?:\.\d+)?(?:→\d+(?:\.\d+)?)?%?)/g).map((part,index)=>index%2?`<b>${escape(part)}</b>`:escape(part)).join('');
  const action=model.category==='attribute'?'加强属性':model.action==='分支'?'确定分支':model.action==='进化'?'完成进化':model.action==='新获得'?(model.category==='weapon'?(model.tier==='super'?'获得秘术':model.weaponAbility?'获得能力':'获得武器'):'学习技能'):model.category==='resource'?'领取宝藏':model.category==='weapon'?'强化武器':'强化技能';
  return `<span class="choice-top"><span class="choice-category"><svg viewBox="0 0 24 24" aria-hidden="true">${TYPE_ICONS[model.category]}</svg>${type} · ${escape(model.action)}${model.action==='新获得'?'<em class="choice-tier choice-new" aria-hidden="true">NEW</em>':''}${model.tier==='super'?'<em class="choice-tier">超级</em>':''}</span><span class="choice-quality">${escape(model.quality.name)}</span></span><span class="choice-heading"><span class="upgrade-icon" style="color:${escape(model.color)}" aria-hidden="true">${escape(model.icon)}</span><strong>${escape(model.name)}</strong><span class="choice-level">${escape(level)}</span></span><span class="choice-summary">${summary}</span><span class="select-arrow"><span>${escape(context)}</span><span>${action} <span aria-hidden="true">↗</span></span></span>`;
}
