import { defineStage } from './define-stage.js';

export default defineStage({
  id:'marsh-trial',themeId:'marsh',name:'沼泽试炼',shortName:'沼泽',difficultyLabel:'进阶',
  summary:'穿过湿地与毒雾，在沼泽外岛积累挑战首领的实力。',
  outer:{name:'雾泽外岛',seed:1,boss:{kind:'ancient',index:1,hp:2500,easyHp:1850,damage:23,speed:1,xp:195}},
  core:{name:'沼泽核心岛',seed:1050,profile:{x:1160,y:1160,phase:1.6,bays:.04},layout:{stageBoss:{x:0,y:0,r:360},stageExit:{x:0,y:-620,r:150},'portal:marsh-outer':{x:0,y:620,r:150}},boss:{kind:'bloom',index:2,hp:5600,easyHp:4100,damage:31,speed:1.08,xp:320}},
  coreReward:{gold:34,crystals:51}
});
