import { BALANCE } from './engine.js';
import { getSuperSkillStats } from './super-skills.js';

// Presentation only: the mixed reward pool, prices and upgrade rules stay in Game.
const RARITIES=Object.freeze({
  common:{name:'普通',color:'#c0c9bd'},uncommon:{name:'精良',color:'#a8d798'},
  rare:{name:'稀有',color:'#8fc9ed'},epic:{name:'史诗',color:'#d3afea'},legendary:{name:'传说',color:'#f1cd83'}
});
const SUPER_RARITY={thorns:'rare',miasma:'rare',runes:'epic',swords:'epic',meteor:'legendary',vortex:'legendary'};
const NAMES={arrow:'翠羽飞矢',orbit:'环刃',pulse:'大地回响',lightning:'唤雷'};
const numeric=n=>Number(Number(n).toFixed(2));
const num=(n,suffix='')=>`${numeric(n)}${suffix}`;
const change=(label,before,after,suffix='')=>({label,before:before===null?null:num(before,suffix),after:num(after,suffix)});
const fixed=(label,value)=>({label,before:null,after:String(value)});
const ATTRIBUTES=new Set(['power','speed','magnet','vitality','regen','endlessPower','endlessVitality','endlessRegen']);
const bonus=game=>game.levels.power*25+game.levels.endlessPower*8+(game.rescuePower||0)*8+(game.player.level-1);

export function presentUpgrade(choice,game) {
  const id=choice.id,current=game.levels[id]||0,next=current+1;
  const model={name:choice.name,icon:choice.icon,color:choice.color,category:'skill',action:'升级',scope:'自动攻击',description:choice.desc,rows:[],levelLabel:'',note:'',rarity:'common'};
  const setRarity=id=>{model.rarity=id;model.quality=RARITIES[id];model.summary=compactSummary(choice,game,model);};
  if(id==='super:resource') {
    Object.assign(model,{category:'resource',action:'领取',scope:'满阶奖励',levelLabel:'资源宝藏',note:'该类超级技能已全部满阶'});
    setRarity('legendary');return model;
  }
  const superId=choice.skillId||(id.startsWith('super:')?id.slice(6):SUPER_RARITY[id]?id:null);
  if(superId) {
    const level=game.superSkills.owned[superId]||0,after=getSuperSkillStats(superId,level+1),before=level?getSuperSkillStats(superId,level):null;
    Object.assign(model,{action:level?'升级':'新获得',scope:'超级技能 · 自动攻击',levelLabel:level?`Lv.${level} → ${level+1}`:'获得 Lv.1',note:'最高 3 级 · 本局持续生效'});
    if(superId==='miasma')model.rows=[change('初始爆发',before?.impactDamage??null,after.impactDamage),change('每次侵蚀',before?.damage??null,after.damage),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    else if(superId==='swords')model.rows=[change('单剑基础伤害',before?.damage??null,after.damage),change('每轮灵剑',before?.count??null,after.count,'柄'),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    else if(superId==='thorns')model.rows=[change('基础伤害',before?.damage??null,after.damage),change('定身时长',before?.root??null,after.root,'秒'),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    else if(superId==='meteor')model.rows=[change('单颗基础伤害',before?.damage??null,after.damage),change('每轮星陨',before?.count??null,after.count,'颗'),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    else if(superId==='vortex')model.rows=[change('每次基础伤害',before?.damage??null,after.damage),change('牵引速度',before?.pull??null,after.pull),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    else model.rows=[change('基础伤害',before?.damage??null,after.damage),fixed('贯穿射线','3 道'),change('施放间隔',before?.cooldown??null,after.cooldown,'秒')];
    setRarity(SUPER_RARITY[superId]);return model;
  }
  if(ATTRIBUTES.has(id)) {
    const endless=id.startsWith('endless');
    Object.assign(model,{category:'attribute',action:'加强',scope:'角色属性 · 本局生效',levelLabel:`累计强化 ${next} 次`,note:endless?'无尽成长 · 无次数上限':'对角色持续生效'});
    if(id==='power'||id==='endlessPower')model.rows=[change('通用伤害加成',bonus(game),bonus(game)+(id==='power'?25:8),'%')];
    if(id==='speed')model.rows=[change('移动速度加成',current*8,next*8,'%')];
    if(id==='magnet')model.rows=[change('基础拾取范围',BALANCE.magnet*(1+current*.35),BALANCE.magnet*(1+next*.35))];
    if(id==='vitality'||id==='endlessVitality') {
      const extra=id==='vitality'?25:12,heal=id==='vitality'?35:24;
      model.rows=[change('最大生命',game.player.maxHp,game.player.maxHp+extra),fixed('立即恢复',`最多 ${heal} 生命`)];
    }
    if(id==='regen'||id==='endlessRegen') {
      const rate=game.levels.regen*.8+game.levels.endlessRegen*.3;
      model.rows=[change('每秒生命恢复',rate,rate+(id==='regen'?.8:.3))];
    }
    setRarity(id==='regen'?'uncommon':'common');return model;
  }
  if(choice.branch) {
    const weapon=choice.weaponId,branch=choice.branch;
    Object.assign(model,{action:'分支',scope:`${NAMES[weapon]} · 二选一`,levelLabel:weapon==='arrow'?'飞矢分支':'Lv.4 → 5',note:'选择后本局固定，也可先选其他强化'});
    if(weapon==='arrow')model.rows=[change('单箭最多命中',1,3,'个目标'),fixed('后续单段伤害','保留上一段的 65%')];
    if(weapon==='pulse')model.rows=[change('基础伤害',80,90),branch==='echoes'?fixed('追加回波','0.35秒后 · 60%伤害'):change('冲击范围',140,210)];
    if(weapon==='lightning')model.rows=branch==='chain'?[change('最多攻击目标',3,5),fixed('新增两段伤害','基础伤害的 40%')]:[change('单目标基础伤害',78,220),fixed('索敌优先级','首领 → 高生命敌人')];
    setRarity(weapon==='lightning'?'epic':weapon==='pulse'?'rare':'uncommon');return model;
  }
  if(id==='rapid'||id==='multishot') {
    const level=1+game.levels.rapid+game.levels.multishot;
    Object.assign(model,{scope:'翠羽飞矢 · 专属强化',levelLabel:`飞矢 Lv.${level} → ${level+1}`,note:'仅影响飞矢，不改变其他技能'});
    model.rows=id==='rapid'?[change('飞矢攻击频率加成',current*15,next*15,'%'),change('基础发射间隔',BALANCE.arrowInterval/(1+current*.15),BALANCE.arrowInterval/(1+next*.15),'秒')]:[change('每轮箭矢',1+current,1+next,'支'),fixed('主箭 / 副箭伤害','100% / 60%')];
    setRarity(id==='multishot'?'uncommon':'common');return model;
  }
  Object.assign(model,{action:current?(choice.evolves?'进化':'升级'):'新获得',scope:`${NAMES[id]||choice.name} · 自动攻击`,levelLabel:current?`Lv.${current} → ${next}`:'获得 Lv.1'});
  if(id==='orbit') {
    if(choice.evolves)model.name='裂风环刃';
    model.rows=[change('基础伤害',current?24+current*6:null,24+next*6),change('环绕利刃',current?2+Math.floor((current-1)/2):null,2+Math.floor((next-1)/2),'枚'),choice.evolves?fixed('新增效果','每3秒扩张并收拢'):change('环绕半径',current?70+current*4:null,70+next*4)];
    model.note=choice.evolves?'已达到最终形态':'附加流血 · 5级进化';
  } else if(id==='pulse') {
    model.rows=[change('基础伤害',current?40+current*10:null,40+next*10),change('冲击范围',current?100+current*10:null,100+next*10),fixed('施放间隔','2.6 秒')];model.note='消耗流血增伤 · 升至5级选择分支';
  } else if(id==='lightning') {
    model.rows=[change('单段基础伤害',current?38+current*10:null,38+next*10),fixed('连锁目标','最多 3 个'),fixed('施放间隔','2.8 秒')];model.note='附加感电 · 升至5级选择分支';
  }
  setRarity(id==='lightning'||choice.evolves?'rare':'uncommon');return model;
}

// One short effect sentence replaces the repeated description, stat table and note.
// Keep rows as precise, non-mutating preview data for reward/number verification.
function compactSummary(choice,game,model) {
  const id=choice.id,level=game.levels[id]||0;
  const pair=(before,after)=>before===after?num(after):`${num(before)}→${num(after)}`;
  if(id==='super:resource')return choice.desc.replace('该类超级技能已全部满阶，','');
  const superId=choice.skillId||(id.startsWith('super:')?id.slice(6):SUPER_RARITY[id]?id:null);
  if(superId) {
    const current=game.superSkills.owned[superId]||0,after=getSuperSkillStats(superId,current+1),before=current?getSuperSkillStats(superId,current):null;
    const newly={
      thorns:`荆棘造成 ${after.damage} 范围伤害，定身普通敌人 ${after.root} 秒。`,
      miasma:`瘴气爆发 ${after.impactDamage} 伤害，持续 ${after.duration} 秒、每半秒侵蚀 ${after.damage}。`,
      runes:`三道射线贯穿沿途敌人，造成 ${after.damage} 伤害，同轮不重复命中。`,
      meteor:`锁定敌群落下 ${after.count} 颗星陨，每颗造成 ${after.damage} 范围伤害。`,
      swords:`每轮 ${after.count} 柄追击灵剑，每剑 ${after.damage} 伤害，优先首领。`,
      vortex:`持续 ${after.duration} 秒，每 ${after.interval} 秒造成 ${after.damage} 伤害并聚怪；首领免牵引。`
    };
    if(!current)return newly[superId];
    return {
      thorns:`伤害 ${pair(before.damage,after.damage)}，定身 ${pair(before.root,after.root)} 秒；范围扩大、冷却缩短。`,
      miasma:`爆发 ${pair(before.impactDamage,after.impactDamage)}，每跳 ${pair(before.damage,after.damage)}；范围扩大、冷却缩短。`,
      runes:`伤害 ${pair(before.damage,after.damage)}；射线加宽，冷却 ${pair(before.cooldown,after.cooldown)} 秒。`,
      meteor:`伤害 ${pair(before.damage,after.damage)}${before.count!==after.count?`，星陨 ${pair(before.count,after.count)} 颗`:''}；爆炸扩大、冷却缩短。`,
      swords:`每剑伤害 ${pair(before.damage,after.damage)}，灵剑 ${pair(before.count,after.count)} 柄；冷却缩短。`,
      vortex:`每跳伤害 ${pair(before.damage,after.damage)}，牵引 ${pair(before.pull,after.pull)}；范围扩大、冷却缩短。`
    }[superId];
  }
  if(model.category==='attribute')return {
    power:'全局基础伤害加成 ＋25 个百分点。',
    endlessPower:'全局基础伤害加成 ＋8 个百分点。',
    speed:'移动速度加成 ＋8 个百分点。',
    magnet:`拾取范围 ${num(BALANCE.magnet*(1+level*.35))}→${num(BALANCE.magnet*(1+(level+1)*.35))}。`,
    vitality:'最大生命 ＋25，立即恢复最多 35 生命。',
    endlessVitality:'最大生命 ＋12，立即恢复最多 24 生命。',
    regen:'每秒生命恢复 ＋0.8。',endlessRegen:'每秒生命恢复 ＋0.3。'
  }[id];
  if(choice.branch)return {
    'branch:arrow:pierce':'飞矢最多贯穿 3 个目标，后续每段保留 65% 伤害。',
    'branch:arrow:ricochet':'飞矢向附近目标弹射 2 次，后续每跳保留 65% 伤害。',
    'branch:pulse:echoes':'伤害 80→90；0.35 秒后追加更大回波，造成 60% 伤害。',
    'branch:pulse:control':'伤害 80→90、范围 140→210；强力震退，普通敌人减速 35%、持续 1.1 秒。',
    'branch:lightning:chain':'伤害 78→88，连锁 3→5 个目标，末两跳造成 40% 伤害。',
    'branch:lightning:focus':'集中轰击一个目标，伤害 78→220，优先首领与强敌。'
  }[id];
  if(id==='rapid')return `飞矢攻速加成 ＋15 个百分点，发射间隔 ${pair(BALANCE.arrowInterval/(1+level*.15),BALANCE.arrowInterval/(1+(level+1)*.15))} 秒。`;
  if(id==='multishot')return `飞矢每轮 ${1+level}→${2+level} 支；主箭保持全伤，副箭为 60% 伤害。`;
  if(id==='orbit') {
    if(!level)return '2 枚利刃环绕护身，每次 30 伤害并附加流血。';
    const count=2+Math.floor((level-1)/2),nextCount=2+Math.floor(level/2);
    if(choice.evolves)return `伤害 ${24+level*6}→${30+level*6}，利刃 ${count}→${nextCount} 枚；每 3 秒扩张收拢。`;
    return `伤害 ${24+level*6}→${30+level*6}，${count!==nextCount?`利刃 ${count}→${nextCount} 枚，`:''}半径 ${70+level*4}→${74+level*4}。`;
  }
  if(id==='pulse')return level?`伤害 ${40+level*10}→${50+level*10}，范围 ${100+level*10}→${110+level*10}。`:'每 2.6 秒震退周围敌人，造成 50 伤害；消耗流血增伤 25%。';
  if(id==='lightning')return level?`连锁每段伤害 ${38+level*10}→${48+level*10}，保持最多 3 个目标。`:'每 2.8 秒连锁最多 3 个目标，每段 48 伤害并附加感电。';
  return choice.desc;
}

const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const TYPE_ICONS={skill:'<path d="m13 2-8 10h6l-1 8 9-12h-6l2-6Z"/>',attribute:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>',resource:'<path d="m12 3 9 9-9 9-9-9 9-9Z"/>'};
export function upgradeCardHTML(model) {
  const type=model.category==='attribute'?'属性':model.category==='resource'?'宝藏':'技能';
  const level=model.category==='skill'?model.levelLabel:'';
  const context=model.scope.includes('超级技能')?'超级技能':model.scope.includes('专属强化')?'飞矢专属':model.action==='分支'?model.scope.split(' · ')[0]:model.note.includes('无尽')?'无尽成长':'';
  const summary=String(model.summary??'').split(/(\d+(?:\.\d+)?(?:→\d+(?:\.\d+)?)?%?)/g).map((part,index)=>index%2?`<b>${escape(part)}</b>`:escape(part)).join('');
  const action=model.category==='attribute'?'加强属性':model.action==='分支'?'确定分支':model.action==='新获得'?'学习技能':model.category==='resource'?'领取宝藏':'强化技能';
  return `<span class="choice-top"><span class="choice-category"><svg viewBox="0 0 24 24" aria-hidden="true">${TYPE_ICONS[model.category]}</svg>${type} · ${escape(model.action)}</span><span class="choice-quality">${escape(model.quality.name)}</span></span><span class="choice-heading"><span class="upgrade-icon" style="color:${escape(model.color)}" aria-hidden="true">${escape(model.icon)}</span><strong>${escape(model.name)}</strong><span class="choice-level">${escape(level)}</span></span><span class="choice-summary">${summary}</span><span class="select-arrow"><span>${escape(context)}</span><span>${action} <span aria-hidden="true">↗</span></span>`;
}
