import { groundOffset } from './terrain.js';
import { visitAttackDepthBands } from './attack-depth.js';

const finite=Number.isFinite;
const LINE_ATTACKS=new Set(['lightning','conduction','runeBolt','superRay','superSword']);

export function isDepthAttackEffect(effect){
  return !!effect&&(effect.type==='superRunicCharge'||LINE_ATTACKS.has(effect.type))&&!(effect.type==='superSword'&&effect.impactOnly);
}

function sourceGroundY(game,e){
  if(finite(e.renderGroundY))return e.renderGroundY;
  if(finite(e.renderGroundOffset))return e.y+e.renderGroundOffset;
  if(finite(e.groundY))return e.groundY;
  // Old fixtures/saves have no source snapshot. Only player-owned legacy
  // effects have a known fallback lift; never guess an ally or nearby actor.
  const playerOwned=e.type.startsWith('super')||(e.type==='lightning'&&!e.ally&&!e.chainIndex);
  return e.y+(playerOwned&&game?.player?groundOffset(game.player,true):0);
}

// The original painter is reused unchanged inside depth clips. Snapshotting
// ground endpoints at emission keeps chain hops and delayed beams independent
// of later movement, knockback, deaths and changes to the caster's shape.
export function visitLegacyAttackDepthItems(game,e,options={},draw,visit){
  if(!isDepthAttackEffect(e)||!(e.life>0)||!(e.maxLife>0)||!finite(e.x)||!finite(e.y)||typeof draw!=='function'||typeof visit!=='function')return 0;
  if(options.visible&&!options.visible(e))return 0;
  const sourceY=sourceGroundY(game,e);
  if(e.type==='superRunicCharge'){
    visit({effect:e,sortY:sourceY+Math.sin(e.angle||0)*.25,draw});return 1;
  }
  const x2=finite(e.x2)?e.x2:e.x,y2=finite(e.y2)?e.y2:e.y,dy=y2-e.y;
  const endY=finite(e.renderEndGroundY)?e.renderEndGroundY:y2+sourceY-e.y;
  const minY=Math.min(e.y,y2),maxY=Math.max(e.y,y2),bias=Math.sign(dy)*.25;
  // A truly horizontal arc has no screen-Y interval to split. Keep one
  // stable layer between its two ground anchors rather than dividing by zero.
  const sortYAt=Math.abs(dy)>1e-6
    ?y=>sourceY+(y-e.y)*(endY-sourceY)/dy+bias
    :()=> (sourceY+endY)*.5;
  const padding=e.type==='superSword'?62:Math.max(45,(e.r||0)+30);
  const depthCuts=options.depthCutsFor?.(Math.min(e.x,x2)-padding,Math.max(e.x,x2)+padding,{x:e.x,y:e.y,x2,y2,radius:padding})??options.depthCuts;
  return visitAttackDepthBands(e,{minY,maxY,sortYAt,depthCuts,draw,viewBounds:options.viewBounds,depthTransform:options.depthTransform,step:options.step,maxBands:options.maxBands},visit);
}
