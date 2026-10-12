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
  const setRarity=id=>{model.rarity=id;model.quality=RARITIES[id];};
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

const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const TYPE_ICONS={skill:'<path d="m13 2-8 10h6l-1 8 9-12h-6l2-6Z"/>',attribute:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>',resource:'<path d="m12 3 9 9-9 9-9-9 9-9Z"/>'};
export function upgradeCardHTML(model) {
  const type=model.category==='attribute'?'属性':model.category==='resource'?'宝藏':'技能';
  const rows=model.rows.map(row=>`<span class="choice-stat"><span>${escape(row.label)}</span><span class="choice-values">${row.before!==null&&row.before!==row.after?`<s>${escape(row.before)}</s><i aria-hidden="true">→</i>`:''}<b>${escape(row.after)}</b></span></span>`).join('');
  return `<span class="choice-top"><span class="choice-category"><svg viewBox="0 0 24 24" aria-hidden="true">${TYPE_ICONS[model.category]}</svg>${type} · ${escape(model.action)}</span><span class="choice-quality">${escape(model.quality.name)}</span></span><span class="choice-heading"><span class="upgrade-icon" style="color:${escape(model.color)}" aria-hidden="true">${escape(model.icon)}</span><span><span class="choice-scope">${escape(model.scope)}</span><strong>${escape(model.name)}</strong></span></span><span class="choice-description">${escape(model.description)}</span><span class="choice-stats">${rows}</span><span class="choice-note">${escape(model.note)}</span><span class="select-arrow"><span>${escape(model.levelLabel)}</span><span>${model.category==='attribute'?'加强属性':model.action==='分支'?'确定分支':model.action==='新获得'?'学习技能':model.category==='resource'?'领取宝藏':'强化技能'} <span aria-hidden="true">↗</span></span>`;
}
