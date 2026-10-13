import { groundOffset } from '../terrain.js';
import { isGrounded } from '../height-rules.js';
import { selectFriendlyTarget, friendlyTargets, friendlyFoot, isFriendlyActive, damageFriendly } from '../friendly-combat.js';
import { ANCIENT_BOSS } from '../boss-definitions.js';

export function updateAncientBoss(game,e,dt) {
  e.slamCooldown=Math.max(0,(e.slamCooldown||0)-dt);
  e.slamRecovery=Math.max(0,(e.slamRecovery||0)-dt);
  if(e.slam){e.slam.life=Math.max(0,e.slam.life-dt);return true;}
  if(e.slamRecovery>0)return true;
  const x=e.x,y=e.y+groundOffset(e),p=selectFriendlyTarget(game,e);
  if(e.slamCooldown<=0&&Math.hypot(x-p.x,y-p.y-groundOffset(p,true))<=ANCIENT_BOSS.range) {
    e.slam={x,y,r:ANCIENT_BOSS.radius,life:ANCIENT_BOSS.windup,maxLife:ANCIENT_BOSS.windup};e.slamCooldown=ANCIENT_BOSS.cooldown;game._emit('bossWindup');return true;
  }
  return false;
}

export function resolveAncientBoss(game,e) {
  if(e.hp>0&&e.slam&&e.slam.life<=0) {
    const slam=e.slam;e.slam=null;e.slamRecovery=ANCIENT_BOSS.recovery;
    game._effect(slam.x,slam.y,'bossSlam',.5,slam.r,'#edaa78');game._emit('bossSlam');
    for(const target of friendlyTargets(game)){
      if(!isFriendlyActive(game,target)||!isGrounded(target))continue;
      const foot=friendlyFoot(target);
      if(Math.hypot(foot.x-slam.x,foot.y-slam.y)<slam.r+target.r&&!game.terrain.firstBlocker(slam.x,slam.y,foot.x,foot.y,0,'ground'))damageFriendly(game,target,e.damage*ANCIENT_BOSS.damageMultiplier,e);
    }
  }
}
