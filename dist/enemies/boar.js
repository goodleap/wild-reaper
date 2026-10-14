import { getConfigSection } from '../content-config.js';
import { groundOffset } from '../terrain.js';
import { isGrounded } from '../height-rules.js';
import { circleImpact } from '../combat-attacks.js';
import { selectFriendlyTarget, friendlyFoot, isFriendlyActive, damageFriendly, clearFriendlyPath } from '../friendly-combat.js';

export const BOAR_RULES=getConfigSection('enemies').behaviorRules.boar;

export function updateBoar(game,e,dt) {
  e.chargeCooldown=Math.max(0,(e.chargeCooldown||0)-dt);e._chargeSegment=null;
  const charge=e.charge;
  if(charge) {
    charge.life=Math.max(0,charge.life-dt);
    if(charge.phase==='windup') {
      if(charge.life<=0){charge.phase='rush';charge.life=charge.maxLife=BOAR_RULES.rushLife;}
      return true;
    }
    if(charge.phase==='stunned') {if(charge.life<=0)e.charge=null;return true;}
    const x=e.x,y=e.y+groundOffset(e);
    const speed=BOAR_RULES.speed*(game.environment?.movementMultiplier(e)||1)*game._branchMovementMultiplier(e);
    const movement=game._moveEntity(e,charge.dx*speed*dt,charge.dy*speed*dt);
    e._chargeSegment={x,y,x2:e.x,y2:e.y+groundOffset(e)};
    if(movement.blocked) {
      charge.phase='stunned';charge.life=charge.maxLife=BOAR_RULES.stunLife;game._emit('boarStun');
      game._effect(e.x,e.y,'ring',.3,35,'#ead59c');
    } else if(charge.life<=0)e.charge=null;
    return true;
  }
  const p=selectFriendlyTarget(game,e),x=e.x,y=e.y+groundOffset(e),dx=p.x-x,dy=p.y+groundOffset(p,true)-y,d=Math.hypot(dx,dy);
  if(e.chargeCooldown<=0&&d>=BOAR_RULES.minRange&&d<=BOAR_RULES.maxRange&&game._inView(e)) {
    e.charge={phase:'windup',life:BOAR_RULES.windup,maxLife:BOAR_RULES.windup,dx:dx/d,dy:dy/d,startX:x,startY:y,length:BOAR_RULES.chargeLength};
    e.chargeCooldown=BOAR_RULES.cooldown;game._emit('boarWindup');return true;
  }
  return false;
}

export function resolveBoarCharge(game,e,{targets}) {
  if(e._chargeSegment) {
    const s=e._chargeSegment;
    for(const target of targets){
      if(!isFriendlyActive(game,target)||!isGrounded(target))continue;
      const foot=friendlyFoot(target);
      if(circleImpact(s.x,s.y,s.x2-s.x,s.y2-s.y,foot.x,foot.y,e.r+target.r)<Infinity&&clearFriendlyPath(game,e,target,'ground'))damageFriendly(game,target,e.damage*BOAR_RULES.damageMultiplier,e);
    }
    e._chargeSegment=null;
  }
}
