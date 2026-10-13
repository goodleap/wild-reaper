import { ROYAL_SWORD_SIZE } from './royal-sword-art.js';

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
