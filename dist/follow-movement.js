import { groundOffset } from './terrain.js';
import { movementProfile } from './height-rules.js';
import { updateLocomotion } from './locomotion.js';
import { COMPANION_FOLLOW_RULES as RULES } from './companion-catalog.js';

// Movement only: recruitment, work, combat and recovery remain with the caller.
// Both ordinary companions and the chapter cast use this same distance band,
// acceleration and catch-up policy instead of issuing frame-by-frame stops.
export function updateFollowMovement(game,actor,{target,mode='leader',stop,start=stop+RULES.restartGap,baseSpeed,catchup=RULES.catchup,hold=false,from=null,direct=null,move=null},dt) {
  if(actor._followMode!==mode){
    actor._followMode=mode;actor._following=false;actor._followSpeed=0;
    actor._navTimer=0;actor._navObstacle=null;actor._coastTarget=null;actor._stuckFor=0;
  }
  from??={x:actor.x,y:actor.y+groundOffset(actor,!!actor.heroId||!!actor.isCompanion)};
  const d=Math.hypot(from.x-target.x,from.y-target.y),oldX=actor.x,oldY=actor.y;
  direct??=!game.terrain.firstBlocker(from.x,from.y,target.x,target.y,actor.r,movementProfile(actor));
  if(hold||actor._following&&d<=stop&&direct)actor._following=false;
  else if(!actor._following&&(d>start||!direct)){actor._following=true;actor._navTimer=0;}
  if(actor._following&&dt>0){
    const desiredSpeed=Math.min(Math.max(baseSpeed,game.player.speed*catchup),Math.max(40,(d-stop)*7));
    const acceleration=RULES.acceleration*dt,previousSpeed=actor._followSpeed||0;
    actor._followSpeed=Math.max(previousSpeed-acceleration,Math.min(previousSpeed+acceleration,desiredSpeed));
    actor.speed=actor._followSpeed;
    if(move)move(actor,dt,target);else game._moveEnemy(actor,dt,target);
    const moved=Math.hypot(actor.x-oldX,actor.y-oldY);
    if(moved>.001)actor.facing=Math.atan2(actor.y-oldY,actor.x-oldX);
    actor._stuckFor=moved<.3&&d>stop+20?actor._stuckFor+dt:0;
  }else {actor._stuckFor=0;actor._followSpeed=0;}
  updateLocomotion(actor,oldX,oldY,dt);
  return {distance:d,direct,moved:Math.hypot(actor.x-oldX,actor.y-oldY)};
}
