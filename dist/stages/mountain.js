import { defineStage } from './define-stage.js';

export default defineStage({
  id:'mountain-trial',themeId:'mountain',name:'山地试炼',shortName:'山地',difficultyLabel:'挑战',
  summary:'穿越山口与碎岩，留意落石、积蓄实力再战首领。',
  outer:{name:'群峰外岛',seed:5,boss:{kind:'bloom',index:1,hp:2800,easyHp:2050,damage:24,speed:1,xp:215}},
  core:{name:'山地核心岛',seed:1598,profile:{x:1100,y:1300,phase:4.2,bays:.025},layout:{stageBoss:{x:0,y:0,r:360},stageExit:{x:0,y:-620,r:150},'portal:mountain-outer':{x:0,y:620,r:150}},boss:{kind:'ancient',index:2,hp:6200,easyHp:4500,damage:33,speed:1.08,xp:350}},
  coreReward:{gold:40,crystals:60}
});
