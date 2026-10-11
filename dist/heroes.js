// A starting weapon level is a normal upgrade: it shares the same cap and uses
// a secondary-weapon slot. Hero traits remain separate from later upgrades.
export const HEROES=Object.freeze([
  Object.freeze({id:'ranger',name:'游侠',tagline:'疾步穿林 · 灵巧远袭',loadout:'翠羽飞矢 · 疾风连射 Lv.1',passive:'移动速度 +8%',tradeoff:'初始没有副武器',color:'#a8d8a0',baseSpeed:220*1.08,hpMultiplier:1,skillCooldown:15,initialUpgrade:'rapid'}),
  Object.freeze({id:'warden',name:'守林人',tagline:'厚甲守望 · 环刃护身',loadout:'翠羽飞矢 + 环刃 Lv.1',passive:'初始生命 +25%',tradeoff:'移动速度 −8%',color:'#e4c487',baseSpeed:220*.92,hpMultiplier:1.25,skillCooldown:15,initialUpgrade:'orbit'}),
  Object.freeze({id:'stormcaller',name:'唤雷者',tagline:'雷鸣引路 · 以攻代守',loadout:'翠羽飞矢 + 唤雷 Lv.1',passive:'天雷冷却缩短至 12 秒',tradeoff:'初始生命 −15%',color:'#bcb0ed',baseSpeed:220,hpMultiplier:.85,skillCooldown:12,initialUpgrade:'lightning'})
]);

export const getHero=(id)=>HEROES.find(hero=>hero.id===id)||HEROES[0];
