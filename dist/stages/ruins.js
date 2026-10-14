import { defineStage } from './define-stage.js';

export default defineStage({
  id:'ruins-trial',themeId:'ruins',name:'遗迹试炼',shortName:'遗迹',difficultyLabel:'挑战',
  summary:'绕行石柱与残墙，搜寻遗迹宝藏后挑战核心首领。',
  outer:{name:'残垣外岛',seed:2,boss:{kind:'bloom',index:1,hp:2900,easyHp:2100,damage:25,speed:1,xp:220}},
  core:{name:'遗迹核心岛',seed:1187,profile:{x:1140,y:1180,phase:3.5,bays:.02},layout:{stageBoss:{x:0,y:0,r:360},stageExit:{x:0,y:-620,r:150},'portal:ruins-outer':{x:0,y:620,r:150}},boss:{kind:'ancient',index:2,hp:6400,easyHp:4650,damage:34,speed:1.08,xp:360}},
  coreReward:{gold:42,crystals:63}
});
