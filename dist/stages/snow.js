import { defineStage } from './define-stage.js';

export default defineStage({
  id:'snow-trial',themeId:'snow',name:'雪原试炼',shortName:'雪原',difficultyLabel:'进阶',
  summary:'穿过雪松、积雪与冰面，在霜雪中整备并挑战首领。',
  outer:{name:'霜雪外岛',seed:6,boss:{kind:'bloom',index:1,hp:2600,easyHp:1900,damage:23,speed:1,xp:200}},
  core:{name:'雪原核心岛',seed:1735,profile:{x:1220,y:1160,phase:5.35,bays:.03},layout:{stageBoss:{x:0,y:0,r:360},stageExit:{x:0,y:-620,r:150},'portal:snow-outer':{x:0,y:620,r:150}},boss:{kind:'ancient',index:2,hp:5800,easyHp:4200,damage:32,speed:1.08,xp:330}},
  coreReward:{gold:36,crystals:54}
});
