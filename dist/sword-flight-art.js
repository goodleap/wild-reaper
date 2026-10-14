import { ROYAL_SWORD_SIZE } from './royal-sword-art.js';
import { visitAttackDepthBands } from './attack-depth.js';

// Flight owns the point and tangent; the vector body is drawn behind that point.
export function drawSwordFlight(ctx,flight,sword,{reduced=false,dense=false}={}){
  if(flight.done||!sword)return;
  const trail=flight.trail,first=Math.max(0,trail.length-(reduced?3:dense?6:10));
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
  if(trail.length-first>1){
    ctx.beginPath();ctx.moveTo(trail[first].x,trail[first].y);
    for(let i=first+1;i<trail.length;i++)ctx.lineTo(trail[i].x,trail[i].y);
    ctx.globalAlpha=reduced?.15:.28;ctx.strokeStyle='#d9bd76';ctx.lineWidth=3.4;ctx.stroke();
    ctx.globalAlpha=reduced?.28:.55;ctx.strokeStyle='#fff0be';ctx.lineWidth=1.1;ctx.stroke();
  }
  ctx.translate(flight.x,flight.visualY);ctx.rotate(flight.visualAngle??flight.angle);ctx.globalAlpha=1;
  const t=Math.min(1,Math.max(0,flight.age/.18)),blend=t*t*(3-2*t),{waiting,flight:full}=ROYAL_SWORD_SIZE;
  sword.draw(ctx,waiting.width+(full.width-waiting.width)*blend,waiting.height+(full.height-waiting.height)*blend);ctx.restore();
}

export function visitSwordFlightDepthItems(flight,sword,options={},visit){
  if(flight.done||!sword)return 0;
  const {reduced=false,dense=false}=options,trail=flight.trail,first=Math.max(0,trail.length-(reduced?3:dense?6:10));
  const t=Math.min(1,Math.max(0,flight.age/.18)),blend=t*t*(3-2*t),{waiting,flight:full}=ROYAL_SWORD_SIZE;
  const width=waiting.width+(full.width-waiting.width)*blend,height=waiting.height+(full.height-waiting.height)*blend;
  const angle=flight.visualAngle??flight.angle,baseY=flight.visualY-Math.sin(angle)*width*92/112,baseX=flight.x-Math.cos(angle)*width*92/112;
  const halfHeight=Math.abs(Math.cos(angle))*height*11/48,halfWidth=Math.abs(Math.sin(angle))*height*11/48;
  let minX=Math.min(flight.x,baseX)-halfWidth,maxX=Math.max(flight.x,baseX)+halfWidth;
  let minY=Math.min(flight.visualY,baseY)-halfHeight,maxY=Math.max(flight.visualY,baseY)+halfHeight;
  for(let i=first;i<trail.length;i++){minX=Math.min(minX,trail[i].x);maxX=Math.max(maxX,trail[i].x);minY=Math.min(minY,trail[i].y);maxY=Math.max(maxY,trail[i].y);}
  const groundLift=Number.isFinite(options.groundLift)?options.groundLift:flight.groundLift;
  // Keep the blade over its own trail inside each band. Sorting the tip and
  // the tail separately could otherwise paint an upward sword's trail over
  // its hilt even when no other scene object overlaps it.
  return visitAttackDepthBands(flight,{...options,minX:minX-2,maxX:maxX+2,minY,maxY,groundLift,draw:ctx=>drawSwordFlight(ctx,flight,sword,options)},visit);
}
