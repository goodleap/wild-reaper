import { defineStage } from './define-stage.js';

export default defineStage({
  id:'city-trial',themeId:'city',name:'古城试炼',shortName:'古城',difficultyLabel:'进阶',
  summary:'穿行街区与庭院，利用建筑间隙战斗并完成整备。',
  outer:{name:'暮钟外岛',seed:4,boss:{kind:'ancient',index:1,hp:2700,easyHp:2000,damage:24,speed:1,xp:210}},
  core:{name:'古城核心岛',seed:1461,profile:{x:1200,y:1140,phase:2.65,bays:.015},layout:{stageBoss:{x:0,y:0,r:360},stageExit:{x:0,y:-620,r:150},'portal:city-outer':{x:0,y:620,r:150}},boss:{kind:'bloom',index:2,hp:6000,easyHp:4400,damage:32,speed:1.08,xp:340}},
  coreReward:{gold:38,crystals:57}
});
