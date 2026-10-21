// Stable quest identities are independent of run-local enemy and scene IDs.
export const WORLD_QUESTS=Object.freeze([
  Object.freeze({id:'clock-bridge',worldId:'clockshadow-city',name:'重开钟桥',
    description:'钟桥的绞盘已经损坏。去被占据的作业屋找齿轮，深入地下酒窖找牵引链，再从桥西侧修复。两件零件可以自由先后寻找；南侧货运桥和地下通道仍可绕行。',
    rewardText:'永久开放钟桥捷径 · 40 金币 · 30 灵晶',reward:{gold:40,crystals:30},
    objectives:[{id:'gear',label:'从作业屋的守卫宝箱取回绞盘齿轮'},{id:'chain',label:'从地下酒窖深处的宝箱取回牵引链'},{id:'bridge',label:'在钟桥西端装回绞盘，打开栏闸'}]}),
  Object.freeze({id:'underground-return',worldId:'rift-forest',name:'暗河归路',
    description:'暗河洞穴连通林间与北境。从一个洞口进入，由另一端返回地面，再从北侧开启钟楼旧门，连成一条能够往返的探索环路。',
    rewardText:'永久开启钟楼旧门 · 30 金币 · 20 灵晶',reward:{gold:30,crystals:20},
    objectives:[{id:'crossing',label:'穿过暗河，从另一端洞口返回地面'},{id:'gate',label:'从北侧打开钟楼旧门'}]})
]);
export const questDefinition=id=>WORLD_QUESTS.find(quest=>quest.id===id)||null;
export const questsForWorld=worldId=>WORLD_QUESTS.filter(quest=>quest.worldId===worldId);
export const CLOCK_BRIDGE=Object.freeze({x:1530,y:-150,halfLength:116,r:14,angle:Math.PI/2,
  winch:Object.freeze({x:1435,y:-75}),approach:Object.freeze({x:1398,y:-75})});
