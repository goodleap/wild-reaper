import { defineStage } from './define-stage.js';

export default defineStage({
  id:'forest-trial',themeId:'forest',name:'森林试炼',shortName:'森林',difficultyLabel:'标准',
  summary:'探索林间遗迹、积累实力，再挑战森林核心首领。',
  outer:{name:'林间外岛',seed:0,boss:{kind:'ancient',index:1,hp:2300,easyHp:1700,damage:22,speed:1,xp:180}},
  core:{name:'森林核心岛',seed:913,boss:{kind:'bloom',index:2,hp:5200,easyHp:3800,damage:30,speed:1.08,xp:300}},
  coreReward:{gold:30,crystals:45}
});
