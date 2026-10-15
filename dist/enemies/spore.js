import { getConfigSection } from '../content-config.js';
import { groundOffset } from '../terrain.js';
import { selectFriendlyTarget, friendlyFoot } from '../friendly-combat.js';
import { retreatRangedEnemy } from '../combat-tactics.js';

export const SPORE_RULES=getConfigSection('enemies').behaviorRules.spore;

export function updateSpore(game,e,dt) {
  e.castCooldown=Math.max(0,(e.castCooldown||0)-dt);
  if(e.cast){e.cast.life=Math.max(0,e.cast.life-dt);return true;}
  const p=selectFriendlyTarget(game,e),dx=p.x-e.x,dy=p.y+groundOffset(p,true)-e.y-groundOffset(e),distance=Math.hypot(dx,dy);
  if(game._inView(e)&&distance<=SPORE_RULES.range&&!game.terrain.firstBlocker(e.x,e.y+groundOffset(e),p.x,p.y+groundOffset(p,true),6,'projectile')) {
    if(e.castCooldown<=0){e.cast={life:SPORE_RULES.windup,maxLife:SPORE_RULES.windup,angle:Math.atan2(dy,dx),targetId:p===game.player?null:p.id,targetPoint:friendlyFoot(p)};e.castCooldown=SPORE_RULES.cooldown;game._emit('sporeWindup');return true;}
    if(retreatRangedEnemy(game,e,p,dt,SPORE_RULES.range)||distance<=SPORE_RULES.holdRange)return true;
  }
  return false;
}

export function resolveSpore(game,e,{px,py,maxEnemyBullets}) {
  if(e.cast&&e.cast.life<=0) {
    const cast=e.cast;e.cast=null;
    const actor=cast.targetId===null?game.player:game.companions?.members.find(member=>member.id===cast.targetId);
    const target=actor?friendlyFoot(actor):cast.targetPoint||{x:px,y:py};
    if(game._inView(e)&&Math.hypot(target.x-e.x,target.y-e.y-groundOffset(e))<=SPORE_RULES.releaseRange&&game.enemyBullets.length<maxEnemyBullets) {
      game.enemyBullets.push({id:++game._id,ownerId:e.id,type:'spore',x:e.x,y:e.y+groundOffset(e),r:SPORE_RULES.bulletRadius,vx:Math.cos(cast.angle)*SPORE_RULES.bulletSpeed,vy:Math.sin(cast.angle)*SPORE_RULES.bulletSpeed,life:SPORE_RULES.bulletLife,maxLife:SPORE_RULES.bulletLife,color:SPORE_RULES.color,damage:e.damage});
      game._emit('sporeShot');
    }
  }
}
