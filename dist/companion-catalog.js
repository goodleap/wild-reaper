export const COMPANION_RULES=Object.freeze({maxMembers:5,payrollInterval:30,gracePeriod:20,recoveryDuration:15,hitImmunity:.55,guardRadius:155,guardMultiplier:.75});
export const COMPANION_DEFINITIONS=Object.freeze([
  {id:'stormcaller',kind:'stormcaller',name:'唤雷者',role:'连锁输出',skill:'连锁雷电',description:'连锁雷电攻击成群敌人。',color:'#c8b9f0',upkeep:3,r:15,maxHp:130,defense:8,speed:250,groundOffset:19.8},
  {id:'warden',kind:'warden',name:'守林人',role:'队伍防护',skill:'守护脉冲',description:'减轻附近友军伤害，震退近身敌人。',color:'#b7dbaa',upkeep:3,r:15,maxHp:180,defense:18,speed:250,groundOffset:19.8},
  {id:'dog',kind:'dog',name:'寻宝犬',role:'嗅探宝藏',skill:'宝藏嗅觉',description:'嗅出附近未领取的宝藏与遗迹，带路后返回。',color:'#edca91',upkeep:1,r:12,maxHp:100,defense:4,speed:290,groundOffset:11},
  {id:'owl',kind:'owl',name:'猫头鹰',role:'危险侦察',skill:'警戒视野',description:'侦察附近敌群与首领，提醒危险方向。',color:'#c2dceb',upkeep:1,r:10,maxHp:90,defense:3,speed:270,groundOffset:13,flying:true},
  {id:'golem',kind:'golem',name:'岩灵',role:'重击破障',skill:'岩石重击',description:'重击震退敌人，击碎特殊遗迹的封门岩石。',color:'#c7d3be',upkeep:4,r:21,maxHp:260,defense:26,speed:215,groundOffset:22}
].map(Object.freeze));
export const COMPANIONS=COMPANION_DEFINITIONS;
export const companionDefinition=kind=>COMPANION_DEFINITIONS.find(def=>def.kind===kind)||null;
