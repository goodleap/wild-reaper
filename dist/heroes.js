// Stable identities remain separate from the names shown in menus and records.
const percent=value=>`${value>0?'+':''}${Math.round(value*100)}%`;
const STAT_LABELS=Object.freeze({maxHealth:'最大生命',attack:'自身伤害',defense:'防御',moveSpeed:'移速',pickupRange:'拾取范围'});
const signed=value=>`${value>0?'+':''}${value}`;
function normalizeModifiers(modifiers={}) {
  return Object.freeze(Object.fromEntries(Object.keys(STAT_LABELS).map(key=>{
    const source=modifiers[key]??{};
    return [key,Object.freeze({multiplier:Number.isFinite(source.multiplier)?source.multiplier:1,fixed:Number.isFinite(source.fixed)?source.fixed:0})];
  })));
}

// Apply once to a fully accumulated common stat; never compound on refresh.
export function applyHeroStat(hero,key,base) {
  const modifier=hero?.statModifiers?.[key];
  return base*(modifier?.multiplier??1)+(modifier?.fixed??0);
}

function hero({id,name,role,summary,color,statModifiers={}}) {
  const modifiers=normalizeModifiers(statModifiers),identity={statModifiers:modifiers};
  const persistent=[],fixed=[];
  for(const [key,label] of Object.entries(STAT_LABELS)) {
    const modifier=modifiers[key];
    if(modifier.multiplier!==1)persistent.push(`${label} ${percent(modifier.multiplier-1)}`);
    if(modifier.fixed!==0)fixed.push(`${label} ${signed(modifier.fixed)}`);
  }
  const traits=[];
  for(let index=0;index<persistent.length;index+=2)traits.push(`持续特性：${persistent.slice(index,index+2).join(' · ')}`);
  if(fixed.length)traits.push(`固定加值：${fixed.join(' · ')}`);
  const details=[
    `持续特性：${persistent.join(' · ')||'无'}（对成长后的属性持续生效）`,
    `固定加值：${fixed.join(' · ')||'无'}（在持续特性计算后加入）`,
    `初始生命：标准 ${Math.round(applyHeroStat(identity,'maxHealth',100))} / 轻松 ${Math.round(applyHeroStat(identity,'maxHealth',140))}`,
    '自身伤害影响武器与技能；固定加值保持原数值，不随成长同比增加。'
  ];
  return Object.freeze({id,name,role,summary,tagline:role,passive:summary,color,statModifiers:modifiers,
    hpMultiplier:modifiers.maxHealth.multiplier,baseSpeed:Math.round(applyHeroStat(identity,'moveSpeed',220)*100)/100,
    damageMultiplier:modifiers.attack.multiplier,baseDefense:modifiers.defense.fixed,magnetMultiplier:modifiers.pickupRange.multiplier,
    skillCooldown:15,initialUpgrade:null,traits:Object.freeze(traits),details:Object.freeze(details)});
}
export const HEROES=Object.freeze([
  hero({id:'traveler',name:'帅气王子',role:'稳健均衡',summary:'生命和防御更充足，适合稳步成长与近身应战。',color:'#a8d8a0',statModifiers:{maxHealth:{multiplier:1.1},defense:{fixed:8}}}),
  hero({id:'princess',name:'美丽公主',role:'灵巧游走',summary:'走位与收集更轻松，生命和伤害略低，擅长灵活周旋。',color:'#e9b3c8',statModifiers:{maxHealth:{multiplier:.9},moveSpeed:{multiplier:1.12},attack:{multiplier:.92},pickupRange:{multiplier:1.2}}}),
  hero({id:'elder',name:'年迈的老登',role:'挑战角色',summary:'生命、移速和伤害偏低，为熟悉荒野的玩家增加挑战。',color:'#c6cfbb',statModifiers:{maxHealth:{multiplier:.85},moveSpeed:{multiplier:.92},attack:{multiplier:.88}}})
]);
export const getHero=id=>HEROES.find(hero=>hero.id===id)||HEROES[0];
