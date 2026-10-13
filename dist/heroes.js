// The original traveler is the only playable character. Legacy hero choices
// deliberately resolve to the same starting stats, including old saved values.
export const HEROES=Object.freeze([
  Object.freeze({id:'traveler',name:'旅人',tagline:'穿行荒野 · 寻回同伴',loadout:'长剑',passive:'营救伙伴可获得本局强化',color:'#a8d8a0',baseSpeed:220,hpMultiplier:1,skillCooldown:15,initialUpgrade:null})
]);
export const getHero=()=>HEROES[0];
