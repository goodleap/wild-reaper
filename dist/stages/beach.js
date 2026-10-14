import { defineStage } from './define-stage.js';

export default defineStage({
  id:'beach-trial',themeId:'beach',name:'海岸试炼',shortName:'海岸',difficultyLabel:'标准',
  summary:'沿沙滩、椰林与礁石探索，再前往潮汐核心岛。',
  outer:{name:'潮汐外岛',seed:3,boss:{kind:'bloom',index:1,hp:2400,easyHp:1750,damage:22,speed:1,xp:185}},
  core:{name:'海岸核心岛',seed:1324,profile:{x:1260,y:1080,phase:.85,bays:.035},layout:{stageBoss:{x:0,y:0,r:360},stageExit:{x:0,y:-620,r:150},'portal:beach-outer':{x:0,y:620,r:150}},boss:{kind:'ancient',index:2,hp:5400,easyHp:3950,damage:30,speed:1.08,xp:310}},
  coreReward:{gold:32,crystals:48}
});
