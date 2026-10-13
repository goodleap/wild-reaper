import { REGIONS } from './world-definitions.js';
import { featureForSite } from './world-sites.js';

const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const DUNGEON_RULES=freeze({cols:5,rows:5,cellSize:360,wallRadius:14,doorWidth:180,interactRadius:74,sideChests:3,bossDistance:8,roomCrystals:6,maxRoomEnemies:6,bossGold:80,bossCrystals:100,maxStates:REGIONS.length*2});
export const HUT_RULES=freeze({cellSize:400,wallRadius:12,doorWidth:90,maxStates:REGIONS.length*3,guards:4});
const HUT_LAYOUTS=freeze({
  default:{terrain:'forest',rocks:[],props:[{type:'table',x:-118,y:-83},{type:'stool',x:-118,y:-32},{type:'bed',x:120,y:-92},{type:'shelf',x:0,y:-140},{type:'rug',x:0,y:55}],guardPoints:[{x:-100,y:-90},{x:100,y:-90},{x:-65,y:-45},{x:65,y:-45}]},
  shipwreck:{terrain:'forest',rocks:[],props:[{type:'cargo',x:-175,y:-75},{type:'cargo',x:175,y:-65},{type:'barrel',x:-180,y:80}],guardPoints:[{x:-120,y:-110},{x:120,y:-110},{x:-155,y:-60},{x:155,y:-60},{x:-155,y:0},{x:155,y:0}]},
  mine:{terrain:'mountain',rocks:[{x:-98,y:12,r:25,rockForm:1},{x:98,y:12,r:25,rockForm:1}],props:[{type:'minecart',x:-145,y:-130},{type:'cargo',x:153,y:-130}],guardPoints:[{x:-135,y:-105},{x:135,y:-105},{x:0,y:-150},{x:-145,y:-35},{x:145,y:-35}]}
});
export const INTERIOR_REWARDS=freeze({supply:{gold:4,crystals:12},occupied:{gold:24,crystals:40},castle:{gold:DUNGEON_RULES.bossGold,crystals:DUNGEON_RULES.bossCrystals},castleSide:{gold:12,crystals:24}});
export const CASTLE_PROFILE=freeze({name:'旧王城迷宫',treasureName:'王城宝藏',bossName:'旧王城守卫',terrain:'ruins',guardHp:1,bossHp:1,cols:DUNGEON_RULES.cols,rows:DUNGEON_RULES.rows,cellSize:DUNGEON_RULES.cellSize,bossDistance:DUNGEON_RULES.bossDistance});
export function castleProfileFor(site){return {...CASTLE_PROFILE,...(featureForSite(site)||{})};}
export function hutProfileFor(site){const feature=featureForSite(site),layout=HUT_LAYOUTS[feature?.id]||HUT_LAYOUTS.default;return {...layout,size:feature?.interiorSize||HUT_RULES.cellSize,height:feature?.interiorHeight||feature?.interiorSize||HUT_RULES.cellSize,chestY:feature?-90:-25,guardHp:feature?.guardHp||1};}
export function interiorRewardFor(site){return featureForSite(site)?.reward||INTERIOR_REWARDS[site?.type]||INTERIOR_REWARDS.castle;}
