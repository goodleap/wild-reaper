import { ACTOR_VISUALS } from './actor-visuals.js';
import { groundOffset } from './terrain.js';

// Visibility lives on the ground; sprite height never changes discovery or
// line of sight. Raised sprites are then occluded by the shared depth order.
export function sceneGroundAnchor(entity){
  const humanoid=!!(entity.heroId||entity.isCompanion||entity.isCaptive||entity.isTownNpc||entity.type==='player');
  const actor=humanoid||!!ACTOR_VISUALS[entity.type];
  const offset=humanoid?groundOffset(entity,true):actor&&Number.isFinite(entity.r)?groundOffset(entity):0;
  return {x:entity.groundX??entity.x,y:entity.groundY??entity.y+offset,r:actor?entity.r||0:0};
}

export function sceneEntityVisible(entity,vision){
  if(!vision)return true;
  const point=sceneGroundAnchor(entity);
  return vision.isVisible(point.x,point.y,point.r);
}

export function sceneItemLayer(item){
  return item.layer??item.prop?.renderLayer??(item.prop?.isHutFurniture&&item.prop.type==='rug'?'ground':'raised');
}

function terrainVisible(prop,vision){
  if(vision.isVisible(prop.x,prop.y))return true;
  // A solid object's centre blocks its own sight ray. Admit its visible near
  // face instead, using the same circle/capsule footprint as collision.
  const radius=prop.r||0;if(!radius)return false;
  const observer=vision.dungeon._playerFoot(),half=prop.type==='log'?prop.halfLength||0:0;
  const dx=Math.cos(prop.angle||0),dy=Math.sin(prop.angle||0);
  const along=Math.max(-half,Math.min(half,(observer.x-prop.x)*dx+(observer.y-prop.y)*dy));
  const near=position=>{
    const x=prop.x+dx*position,y=prop.y+dy*position,vx=observer.x-x,vy=observer.y-y,distance=Math.hypot(vx,vy)||1;
    return vision.isVisible(x+vx/distance*(radius+.75),y+vy/distance*(radius+.75));
  };
  return near(along)||(half>0&&(near(-half)||near(half)));
}

export function sceneItemVisible(item,vision){
  if(!vision||sceneItemLayer(item)==='ground')return true;
  if(item.kind==='actor')return vision.isVisible(item.actor.x,item.actor.footY,item.actor.entity.r||0);
  if(item.kind==='sword'||item.kind==='attack')return sceneEntityVisible(item.effect,vision);
  const prop=item.prop;
  // Walls own remembered-segment rendering, not live actor visibility. Their
  // existing fixed structure pieces keep foreground occlusion depth-sorted.
  if(prop.variant==='castle-wall'||prop.variant==='hut-wall')return true;
  return item.kind==='terrain'?terrainVisible(prop,vision):vision.isVisible(prop.x,prop.y,prop.r||0);
}

const KIND_ORDER={terrain:0,adventure:1,actor:2,sword:3,attack:4};
export function compareSceneDepth(a,b){
  return a.sortY-b.sortY||(a.kind===b.kind?(a.kind==='actor'?a.actor.orderId-b.actor.orderId:a.kind==='attack'?(a.orderId||0)-(b.orderId||0):a.kind==='sword'?(a.effect.seed||0)-(b.effect.seed||0):String(a.prop.id).localeCompare(String(b.prop.id))):KIND_ORDER[a.kind]-KIND_ORDER[b.kind]);
}
