import { ENEMY_DEFS } from './enemy-definitions.js';
import { bossDefinition } from './boss-definitions.js';
import { hasEnemyAnimation } from './enemy-animation.js';

// Pure presentation metadata: no canvas, game state, or world generation.
// Body extents, feet, immersion and sprite framing share the same identity.
const define=(radius,foot,halfWidth,top,shadowWidth,shadowLength,bodyHeight,box,frames,extra={})=>Object.freeze({radius,foot,halfWidth,top,shadowWidth,shadowLength,bodyHeight,immersionBody:bodyHeight==null?null:Object.freeze([bodyHeight,radius]),box:Object.freeze(box),frames,bobFrequency:5,bobAmplitude:1.5,...extra});
const boss=define(49,41,60,68,39,44,109,[128,120,64,73],3,{hitRecoil:.035,portraitScale:.78,portraitRadius:49});
export const ENEMY_VISUALS=Object.freeze({
  slime:define(16,14,22,20,14,17,34,[48,40,24,23],1),
  bat:define(11,20,31,27,18,16,null,[66,52,33,30],5,{bobFrequency:14,bobAmplitude:3}),
  beetle:define(18,18,30,27,16,18,40,[64,54,32,30],3,{bobMode:'steps'}),
  brute:define(26,23,33,32,23,27,55,[72,62,36,35],3),
  boar:define(22,20,36,29,23,25,49,[80,58,40,33],5),
  spore:define(20,18,27,34,18,21,52,[60,60,30,38],3),
  rootbinder:define(18,20,31,35,19,23,55,[68,64,34,40],3,{bobMode:'steps'}),
  boglurker:define(20,18,36,24,23,24,42,[80,50,40,29],3,{bobMode:'steps'}),
  prismguard:define(19,20,31,35,18,22,55,[68,64,34,40],3,{bobMode:'steps'}),
  tidepriest:define(18,20,28,35,17,22,55,[62,62,31,39],3,{bobMode:'steps'}),
  shieldguard:define(21,22,29,34,20,23,56,[66,64,33,38],3,{bobMode:'steps'}),
  stoneape:define(22,24,35,34,23,25,58,[80,70,40,40],3,{bobMode:'steps'}),
  windhunter:define(17,15,39,33,23,22,null,[86,56,43,37],3,{bobFrequency:11,bobAmplitude:2}),
  frostmage:define(18,20,28,38,17,23,58,[62,66,31,42],3,{bobMode:'steps'}),
  flamelizard:define(21,19,39,24,25,25,43,[86,52,43,29],3,{bobMode:'steps'}),
  spiderling:define(11,12,22,17,12,13,29,[50,36,25,20],3,{bobMode:'steps'}),
  broodmother:define(49,39,75,46,43,41,85,[164,100,82,53],3,{hitRecoil:.035,portraitScale:.7,portraitRadius:49,edgeColor:'#e4b9ab',arrival:count=>`第 ${count} 位领主 · 织巢蛛后苏醒`}),
  deepcaller:define(49,40,66,61,41,42,101,[146,112,73,66],3,{hitRecoil:.035,portraitScale:.78,portraitRadius:49,edgeColor:'#a6dce0',arrival:count=>`第 ${count} 位领主 · 深潮巨章苏醒`}),
  frostcrown:define(49,40,71,96,39,43,110,[144,144,72,100],3,{cacheRatio:1.5,hitRecoil:.035,portraitScale:.72,portraitRadius:49,edgeColor:'#c2e7f4',arrival:count=>`第 ${count} 位领主 · 霜冠巨鹿苏醒`}),
  furnace:define(49,42,66,64,39,43,106,[144,128,72,74],3,{hitRecoil:.025,portraitScale:.8,portraitRadius:49,edgeColor:'#f1c28e',arrival:count=>`第 ${count} 位领主 · 熔炉巨像苏醒`}),
  boss,
  ancient:Object.freeze({...boss,edgeColor:'#ebbd91',barClass:null,arrival:count=>`第 ${count} 位荒野领主已苏醒 · 留意震地红圈`}),
  bloom:Object.freeze({...boss,edgeColor:'#ddb0e6',barClass:'bloom-boss',arrival:count=>`第 ${count} 位领主 · 孢冠苏醒，留意紫色预警`})
});
export function enemyArtId(entity){
  if(entity?.type==='boss')return bossDefinition(entity.bossKind||'ancient').visual;
  const type=typeof entity==='string'?entity:entity?.type;
  return ENEMY_DEFS[type]?.visual||type;
}
export function enemyVisual(entity){return ENEMY_VISUALS[enemyArtId(entity)]||null;}
export const ENEMY_BODY_HEIGHTS=Object.freeze(Object.fromEntries(Object.values(ENEMY_DEFS).filter(def=>ENEMY_VISUALS[def.visual]?.bodyHeight!=null).map(def=>{const visual=ENEMY_VISUALS[def.visual];return [def.id,Object.freeze([visual.bodyHeight,visual.radius])];})));
export function enemyBob(entity,time,reduced=false){
  if(reduced||entity.trainingDummy)return 0;
  // Authored animated bodies own their planted feet and body-weight shift.
  if(hasEnemyAnimation(entity))return 0;
  const visual=enemyVisual(entity);
  if(visual?.bobMode==='steps')return entity.moving?-Math.abs(Math.sin(entity.walkPhase||0))*.45:0;
  return Math.sin(time*(visual?.bobFrequency??5)+(entity.id||0))*(visual?.bobAmplitude??1.5);
}
