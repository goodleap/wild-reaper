// Stable identities remain separate from the names shown in menus and records.
const percent=value=>`${value>0?'+':''}${Math.round(value*100)}%`;
function hero({id,name,role,summary,color,hpMultiplier=1,moveMultiplier=1,damageMultiplier=1,baseDefense=0,magnetMultiplier=1}) {
  const traits=[];
  if(hpMultiplier!==1||baseDefense)traits.push([hpMultiplier!==1?`生命 ${percent(hpMultiplier-1)}`:'',baseDefense?`防御 +${baseDefense}`:''].filter(Boolean).join(' · '));
  if(moveMultiplier!==1||damageMultiplier!==1)traits.push([moveMultiplier!==1?`移速 ${percent(moveMultiplier-1)}`:'',damageMultiplier!==1?`伤害 ${percent(damageMultiplier-1)}`:''].filter(Boolean).join(' · '));
  if(magnetMultiplier!==1)traits.push(`拾取范围 ${percent(magnetMultiplier-1)}`);
  const details=[`初始生命 ${percent(hpMultiplier-1)}（标准 ${Math.round(100*hpMultiplier)} / 轻松 ${Math.round(140*hpMultiplier)}）`,`初始防御 ${baseDefense}，后续正常成长`,`自身武器与技能伤害 ${percent(damageMultiplier-1)}`,`基础移速 ${percent(moveMultiplier-1)}`,`拾取范围 ${percent(magnetMultiplier-1)}`];
  return Object.freeze({id,name,role,summary,tagline:role,passive:summary,color,hpMultiplier,baseSpeed:Math.round(220*moveMultiplier*100)/100,damageMultiplier,baseDefense,magnetMultiplier,skillCooldown:15,initialUpgrade:null,traits:Object.freeze(traits),details:Object.freeze(details)});
}
export const HEROES=Object.freeze([
  hero({id:'traveler',name:'帅气王子',role:'稳健均衡',summary:'生命和防御更充足，适合稳步成长与近身应战。',color:'#a8d8a0',hpMultiplier:1.1,baseDefense:8}),
  hero({id:'princess',name:'美丽公主',role:'灵巧游走',summary:'走位与收集更轻松，生命和伤害略低，擅长灵活周旋。',color:'#e9b3c8',hpMultiplier:.9,moveMultiplier:1.12,damageMultiplier:.92,magnetMultiplier:1.2}),
  hero({id:'elder',name:'年迈的老登',role:'挑战角色',summary:'生命、移速和伤害偏低，为熟悉荒野的玩家增加挑战。',color:'#c6cfbb',hpMultiplier:.85,moveMultiplier:.92,damageMultiplier:.88})
]);
export const getHero=id=>HEROES.find(hero=>hero.id===id)||HEROES[0];
