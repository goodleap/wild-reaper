// Boss identity and selection do not depend on the runtime or renderer.
export const ANCIENT_BOSS=Object.freeze({name:'荒野领主',range:165,radius:115,windup:1,cooldown:7,recovery:.3,damageMultiplier:1.3});
export const BLOOM_BOSS = Object.freeze({
  name:'孢冠领主',range:430,preferredMin:230,preferredMax:300,
  cooldown:5.2,enragedCooldown:4.8,recovery:1.1,
  fanWindup:1,fanSpread:.8,fanCount:5,bulletSpeed:150,bulletLife:4.5,
  burstWindup:1.1,burstRadius:52,burstSpacing:145,maxEnemyBullets:60
});

const define=(id,parameters,codex)=>Object.freeze({id,name:parameters.name,visual:id,behavior:id,parameters,codex:Object.freeze(codex)});
export const BOSS_DEFS=Object.freeze({
  ancient:define('ancient',ANCIENT_BOSS,{role:'区域首领 · 震地',description:'守卫世界传送门的巨大领主，逼近后会蓄力发动范围震击。',advice:'离开震地预警区，在攻击后的停顿中反击；击败后领取奖励并激活传送门。',color:'#e7bc8a',source:'区域传送门的守卫'}),
  bloom:define('bloom',BLOOM_BOSS,{role:'区域首领 · 远程',description:'以扇形孢子弹和定点孢爆封锁走位，并尝试保持攻击距离。',advice:'绕向扇射侧面，离开地面孢爆预警；高大障碍可以遮挡飞行孢子。',color:'#d7aada',source:'区域传送门的守卫'})
});
export const BOSS_ROTATION=Object.freeze(['ancient','bloom']);
export function bossDefinition(kind){
  if(!Object.hasOwn(BOSS_DEFS,kind))throw new RangeError(`Unknown boss kind: ${String(kind)}`);
  return BOSS_DEFS[kind];
}
export function bossKindFor(index){
  const offset=((index||1)-1)%BOSS_ROTATION.length;
  return BOSS_ROTATION[(offset+BOSS_ROTATION.length)%BOSS_ROTATION.length];
}
