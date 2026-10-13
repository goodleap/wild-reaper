// Reuses the royal sword sprite verbatim; only its position and tangent change.
export function drawSwordFlight(ctx,flight,sprite,{reduced=false,dense=false}={}){
  if(flight.done||!sprite)return;
  const trail=flight.trail,first=Math.max(0,trail.length-(reduced?3:dense?6:10));
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
  if(trail.length-first>1){
    ctx.beginPath();ctx.moveTo(trail[first].x,trail[first].y);
    for(let i=first+1;i<trail.length;i++)ctx.lineTo(trail[i].x,trail[i].y);
    ctx.globalAlpha=reduced?.15:.28;ctx.strokeStyle='#d9bd76';ctx.lineWidth=3.4;ctx.stroke();
    ctx.globalAlpha=reduced?.28:.55;ctx.strokeStyle='#fff0be';ctx.lineWidth=1.1;ctx.stroke();
  }
  ctx.translate(flight.x,flight.visualY);ctx.rotate(flight.visualAngle??flight.angle);ctx.globalAlpha=1;
  const t=Math.min(1,Math.max(0,flight.age/.18)),blend=t*t*(3-2*t),width=47+(128.8-47)*blend,height=20+(55.2-20)*blend;
  // Sprite tip is x=98/112. Placing it at the simulated point aligns contact.
  ctx.drawImage(sprite,-width*98/112,-height*.5,width,height);ctx.restore();
}
