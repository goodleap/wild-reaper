import { defineStage } from './define-stage.js';

export default defineStage({
  id:'volcano-trial',themeId:'volcano',name:'火山试炼',shortName:'火山',difficultyLabel:'高危',
  summary:'避开熔岩与喷口，备足实力再挑战更强的核心首领。',
  outer:{name:'熔火外岛',seed:7,boss:{kind:'bloom',index:1,hp:3100,easyHp:2250,damage:26,speed:1,xp:230}},
  core:{name:'火山核心岛',seed:1872,profile:{x:1180,y:1120,phase:3.95,bays:.02},layout:{stageBoss:{x:0,y:0,r:360},stageExit:{x:0,y:-620,r:150},'portal:volcano-outer':{x:0,y:620,r:150}},boss:{kind:'ancient',index:2,hp:6800,easyHp:4900,damage:36,speed:1.1,xp:380}},
  coreReward:{gold:46,crystals:69}
});
