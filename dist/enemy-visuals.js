import { ENEMY_DEFS } from './enemy-definitions.js';
import { bossDefinition } from './boss-definitions.js';

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
  const visual=enemyVisual(entity);
  if(visual?.bobMode==='steps')return entity.moving?-Math.abs(Math.sin(entity.walkPhase||0))*.45:0;
  return Math.sin(time*(visual?.bobFrequency??5)+(entity.id||0))*(visual?.bobAmplitude??1.5);
}
