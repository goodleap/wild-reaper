const TAU=Math.PI*2;
// One shared stride length for the traveler and rescued allies. Travel is
// measured after collision, so blocked feet and idle characters never march.
const PHASE_PER_PIXEL=17/220;

export function resetLocomotion(entity) {
  entity.walkPhase=0;entity.walkSpeed=0;entity.moving=false;entity.cloakLift=0;
}

export function updateLocomotion(entity,oldX,oldY,dt) {
  const traveled=Math.hypot(entity.x-oldX,entity.y-oldY);
  entity.moving=dt>0&&traveled>.001;
  entity.walkSpeed=entity.moving?traveled/dt:0;
  if(dt>0&&Number.isFinite(dt))entity.cloakLift=(entity.cloakLift||0)+((entity.moving?1:0)-(entity.cloakLift||0))*(1-Math.exp(-dt*12));
  if(entity.moving)entity.walkPhase=((entity.walkPhase||0)+traveled*PHASE_PER_PIXEL)%TAU;
}
