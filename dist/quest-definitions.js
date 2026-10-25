// Stable quest identities are independent of run-local enemy and scene IDs.
export const WORLD_QUESTS=Object.freeze([
  Object.freeze({id:'clock-bridge',worldId:'clockshadow-city',name:'重开钟桥',
    description:'钟桥的绞盘已经损坏。去被占据的作业屋找齿轮，深入地下酒窖找牵引链，再从桥西侧修复。两件零件可以自由先后寻找；南侧货运桥和地下通道仍可绕行。',
    rewardText:'永久开放钟桥捷径 · 40 金币 · 30 灵晶',reward:{gold:40,crystals:30},
    objectives:[{id:'gear',label:'从作业屋的守卫宝箱取回绞盘齿轮'},{id:'chain',label:'从地下酒窖深处的宝箱取回牵引链'},{id:'bridge',label:'在钟桥西端装回绞盘，打开栏闸'}]}),
  Object.freeze({id:'underground-return',worldId:'rift-forest',name:'暗河归路',
    description:'暗河洞穴连通林间与北境。从一个洞口进入，由另一端返回地面，再从北侧开启钟楼旧门，连成一条能够往返的探索环路。',
    rewardText:'永久开启钟楼旧门 · 30 金币 · 20 灵晶',reward:{gold:30,crystals:20},
    objectives:[{id:'crossing',label:'穿过暗河，从另一端洞口返回地面'},{id:'gate',label:'从北侧打开钟楼旧门'}]}),
  Object.freeze({id:'moss-stone-road',worldId:'rift-forest',worldIds:['rift-forest','marsh','ruins'],name:'苔石驿路',
    description:'沼泽长堤桥的绞盘锈死了，驿队只能绕行北岸。从林海被占据的小屋取回摇柄，穿过沼泽盘根水道，再去遗迹旧水渠寻找耐水轴承。带回零件，从东岸修好长堤桥，让驿路重新连通。',
    rewardText:'永久开放沼泽长堤桥捷径 · 70 金币 · 40 灵晶',reward:{gold:70,crystals:40},
    objectives:[{id:'handle',label:'林海：从被占据小屋的守卫宝箱取回摇柄'},{id:'crossing',label:'沼泽：穿过盘根水道，从另一端返回地面'},{id:'bearing',label:'遗迹：从旧水渠深处的守卫宝箱取回耐水轴承'},{id:'bridge',label:'沼泽：返回长堤桥东岸，装回零件开启捷径'}]}),
  Object.freeze({id:'ranger-home',worldId:'rift-forest',commission:'escort',name:'巡林人归途',
    description:'巡林人被征发队扣在苔石盆地。解除看守，带他沿可通行的林道回到东岸城镇；走远了，他会原地等候。',
    rewardText:'巡林人回到城镇 · 45 金币 · 25 灵晶',reward:{gold:45,crystals:25},
    objectives:[{id:'freed',label:'击败看守，与巡林人交谈'},{id:'home',label:'与巡林人一同抵达城镇休憩处'}]}),
  Object.freeze({id:'marsh-medicine',worldId:'marsh',commission:'repair',name:'药棚重开',
    description:'芦苇曲岸的药材被扣走了。取回药箱，带到旧驿土丘的药棚，清出修整空间，让药师恢复沿途救治。',
    rewardText:'开放野外药棚治疗 · 35 金币 · 30 灵晶',reward:{gold:35,crystals:30},
    objectives:[{id:'medicine',label:'取回芦苇曲岸的药箱'},{id:'restored',label:'守住药棚附近，完成整理与修复'}]}),
  Object.freeze({id:'coastal-cargo',worldId:'beach',commission:'cargo',name:'被扣的货箱',
    description:'两箱补给分别被扣在白帆残港与叠浪望台。可以自由选择先后，夺回货物后带回潮林渔村；离开海岸不会弄丢已经取得的货物。',
    rewardText:'海岸补给铺永久九折 · 55 金币 · 30 灵晶',reward:{gold:55,crystals:30},
    objectives:[{id:'cargo-a',label:'取回白帆残港的货箱'},{id:'cargo-b',label:'取回叠浪望台的货箱'},{id:'delivered',label:'回到渔村补给铺前交付货物'}]}),
  Object.freeze({id:'city-signal',worldId:'clockshadow-city',commission:'signal',name:'断开征发信号',
    description:'军门兵营仍在用信号台调动增援。可以先从侧翼关闭信号，再攻入兵营夺回征发账册；直接强攻也行，但必须应付赶来的援兵。',
    rewardText:'停止兵营增援 · 古城补给铺永久九折 · 60 金币 · 35 灵晶',reward:{gold:60,crystals:35},
    objectives:[{id:'signal',label:'可选：关闭侧翼信号台，阻止增援',optional:true},{id:'orders',label:'击败兵营看守，取得征发账册'},{id:'reported',label:'将账册带回长街市集'}]})
]);
export const questDefinition=id=>WORLD_QUESTS.find(quest=>quest.id===id)||null;
export const questWorlds=quest=>quest.worldIds||[quest.worldId];
export const questsForWorld=worldId=>WORLD_QUESTS.filter(quest=>questWorlds(quest).includes(worldId));
export const CLOCK_BRIDGE=Object.freeze({x:1530,y:-150,halfLength:116,r:14,angle:Math.PI/2,
  winch:Object.freeze({x:1435,y:-75}),approach:Object.freeze({x:1398,y:-75})});
export const MARSH_BRIDGE=Object.freeze({x:-100,y:3400,halfLength:112,r:14,angle:Math.PI/2,
  winch:Object.freeze({x:35,y:3490}),approach:Object.freeze({x:80,y:3400})});
