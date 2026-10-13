const feature=(id,world,type,name,spec)=>Object.freeze({id,world,type,name,...spec});

// Per-site parameters keep finite scenes on the same persistence/reward path.
export const WORLD_SITE_FEATURES=Object.freeze({
  shipwreck:feature('shipwreck','beach','occupied','沉船宝库',{width:78,depth:36,interiorSize:460,interiorHeight:330,guardTypes:Object.freeze(['brute','beetle','beetle','bat','beetle','slime']),guardHp:1.05,reward:Object.freeze({gold:60,crystals:35}),treasureName:'沉船珍藏'}),
  belltower:feature('belltower','city','castle','暮钟塔',{width:136,depth:70,cols:3,rows:4,cellSize:320,bossDistance:5,guardHp:1.1,bossHp:1.1,shieldRooms:true,bossIndex:2,bossName:'暮钟守卫',treasureName:'钟楼秘藏',reward:Object.freeze({gold:100,crystals:125})}),
  mine:feature('mine','mountain','occupied','废弃矿洞',{width:74,depth:38,interiorSize:440,guardTypes:Object.freeze(['brute','beetle','beetle','brute','beetle']),guardHp:1.2,reward:Object.freeze({gold:28,crystals:100}),treasureName:'矿脉珍藏'}),
  icealtar:feature('icealtar','snow','rune','冰封祭坛',{element:'frost',treasureName:'寒霜支援'}),
  furnace:feature('furnace','volcano','castle','熔炉神殿',{width:212,depth:86,cols:4,rows:4,cellSize:340,bossDistance:6,guardHp:1.2,bossHp:1.3,bossIndex:1,bossName:'熔炉守卫',treasureName:'熔炉秘藏',reward:Object.freeze({gold:130,crystals:165})})
});
export const featureForSite=site=>WORLD_SITE_FEATURES[site?.featureId]||null;
export function worldSettlementDefinition(world,definition){
  const match=Object.values(WORLD_SITE_FEATURES).find(item=>item.world===world&&item.type===definition.type);
  return match?{...definition,name:match.name,width:match.width,depth:match.depth,featureId:match.id}:definition;
}
export const WORLD_HUT_NAMES=Object.freeze({forest:'林间小屋',marsh:'沼泽高脚屋',ruins:'遗迹石屋',beach:'海岸渔舍',city:'街角民居',mountain:'山间石屋',snow:'雪原木屋',volcano:'黑岩驿站'});
