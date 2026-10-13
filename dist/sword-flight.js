const TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const turnDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

export const SWORD_FLIGHT_RULES=Object.freeze({maxFlights:12,maxLife:2.4,outwardTime:.09,outwardSpeed:250,speed:610,turnRate:12,step:.0125,radius:4,trailPoints:10});

// Shared by the waiting formation and release, in body-space coordinates.
export function swordFormationAnchor(player,index,count){
  const a=-Math.PI/2+TAU*index/Math.max(1,count),dx=Math.cos(a)*35,dy=Math.sin(a)*25;
  return {x:player.x+dx,y:player.y-13+dy,angle:Math.atan2(dy,dx)};
}

export function createSwordFlight({id,anchor,groundLift,target,targetPoint,damage}){
  const x=anchor.x,y=anchor.y+groundLift;
  return {id,skillId:'swords',x,y,groundY:y,visualY:anchor.y,angle:anchor.angle,visualAngle:anchor.angle,groundLift,launchLift:groundLift,
    target,targetPoint:{...targetPoint},targetDefeated:false,damage,age:0,life:SWORD_FLIGHT_RULES.maxLife,
    r:SWORD_FLIGHT_RULES.radius,trail:[{x,y:anchor.y}],done:false};
}

function rememberTrail(flight){
  const previous=flight.trail[flight.trail.length-1];
  flight.groundY=flight.y;flight.visualY=flight.y-flight.groundLift;
  if(previous&&Math.hypot(flight.x-previous.x,flight.visualY-previous.y)>1e-6)flight.visualAngle=Math.atan2(flight.visualY-previous.y,flight.x-previous.x);
  flight.trail.push({x:flight.x,y:flight.visualY});
  if(flight.trail.length>SWORD_FLIGHT_RULES.trailPoints)flight.trail.shift();
}

// The retained target reference survives removal from the enemy list. Death
// freezes its exact final point once, so launched swords finish that strike.
export function advanceSwordFlight(flight,dt,{pointOf,blocked,onImpact}){
  if(flight.done||!Number.isFinite(dt)||dt<=0)return;
  const rules=SWORD_FLIGHT_RULES;
  if(!flight.targetDefeated){
    flight.targetPoint={...pointOf(flight.target)};
    if(!(flight.target.hp>0))flight.targetDefeated=true;
  }
  const destination=flight.targetPoint;
  let remaining=Math.min(.05,dt);
  while(remaining>1e-9&&!flight.done){
    const step=Math.min(rules.step,remaining,flight.life);remaining-=step;
    if(!(step>0)){flight.done=true;flight.reason='expired';break;}
    const old={x:flight.x,y:flight.y,groundY:flight.y},dx=destination.x-old.x,dy=destination.y-old.y;
    const wanted=Math.atan2(dy,dx),outward=flight.age<rules.outwardTime;
    if(!outward)flight.angle+=clamp(turnDelta(flight.angle,wanted),-rules.turnRate*step,rules.turnRate*step);
    const misalignment=Math.abs(turnDelta(flight.angle,wanted));
    // Turning radius must shrink with remaining distance. Once aligned the
    // cap opens again, so this does not trail a running enemy at a fixed gap.
    const bend=Math.max(.12,Math.sin(Math.min(Math.PI/2,misalignment)));
    const turnSpeed=rules.turnRate*Math.max(1,Math.hypot(dx,dy))*.62/bend;
    const speed=outward?rules.outwardSpeed:Math.min(rules.speed*(.3+.7*Math.max(0,Math.cos(misalignment))),turnSpeed);
    let nx=old.x+Math.cos(flight.angle)*speed*step,ny=old.y+Math.sin(flight.angle)*speed*step;
    const sx=nx-old.x,sy=ny-old.y,length=sx*sx+sy*sy;
    const t=length?clamp((dx*sx+dy*sy)/length,0,1):0;
    const arrivalRadius=flight.targetDefeated?4:clamp((flight.target.r||12)*.4,5,12);
    const arrived=!outward&&Math.hypot(old.x+sx*t-destination.x,old.y+sy*t-destination.y)<=arrivalRadius;
    if(arrived){nx=destination.x;ny=destination.y;}
    if(blocked(old,{x:nx,y:ny},rules.radius)){
      // Only a blocked segment needs refinement; normal flight has one query.
      let lo=0,hi=1;
      for(let i=0;i<5;i++){const mid=(lo+hi)/2;if(blocked(old,{x:old.x+(nx-old.x)*mid,y:old.y+(ny-old.y)*mid},rules.radius))hi=mid;else lo=mid;}
      flight.x=old.x+(nx-old.x)*lo;flight.y=old.y+(ny-old.y)*lo;
      flight.done=true;flight.reason='blocked';rememberTrail(flight);onImpact(flight,old,false);break;
    }
    flight.x=nx;flight.y=ny;flight.age+=step;flight.life=Math.max(0,flight.life-step);
    const blend=clamp(flight.age/.35,0,1),smooth=blend*blend*(3-2*blend);
    flight.groundLift=flight.launchLift+(destination.lift-flight.launchLift)*smooth;
    if(arrived)flight.groundLift=destination.lift;
    rememberTrail(flight);
    if(arrived){flight.done=true;flight.reason='arrived';onImpact(flight,old,!flight.targetDefeated&&flight.target.hp>0);}
    else if(flight.life<=1e-9){flight.done=true;flight.reason='expired';}
  }
}
