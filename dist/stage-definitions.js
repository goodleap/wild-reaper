const outer=Object.freeze({id:'forest-outer',name:'林间外岛',themeId:'forest',themeIndex:0,role:'outer',seed:0,connections:Object.freeze([{id:'forest-route',targetMapId:'forest-heart'}]),boss:Object.freeze({role:'optional',index:1,hp:2300,easyHp:1700,damage:22,speed:1,xp:180})});
const heart=Object.freeze({id:'forest-heart',name:'森林核心岛',themeId:'forest',themeIndex:0,role:'boss',seed:913,connections:Object.freeze([{id:'forest-route',targetMapId:'forest-outer'}]),boss:Object.freeze({role:'core',index:2,hp:5200,easyHp:3800,damage:30,speed:1.08,xp:300})});

export const STAGES=Object.freeze([Object.freeze({id:'forest-trial',name:'森林试炼',themeId:'forest',startMapId:outer.id,coreMapId:heart.id,islands:Object.freeze([outer,heart])})]);
export const getStageDefinition=id=>STAGES.find(stage=>stage.id===id)||null;
