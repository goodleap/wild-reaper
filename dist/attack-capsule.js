// Straight attack footprints share rounded ends in their warning, body and hit.
export function beamCapsule(x,y,angle,length,radius){
  const r=Math.min(radius,length/2),ux=Math.cos(angle),uy=Math.sin(angle);
  return {x:x+ux*r,y:y+uy*r,x2:x+ux*(length-r),y2:y+uy*(length-r),r};
}
export function capsulePath(ctx,{x,y,x2,y2,r}){
  const angle=Math.atan2(y2-y,x2-x),ux=Math.cos(angle),uy=Math.sin(angle);
  ctx.moveTo(x+uy*r,y-ux*r);ctx.lineTo(x2+uy*r,y2-ux*r);
  ctx.arc(x2,y2,r,angle-Math.PI/2,angle+Math.PI/2);
  ctx.lineTo(x-uy*r,y+ux*r);ctx.arc(x,y,r,angle+Math.PI/2,angle+Math.PI*1.5);ctx.closePath();
}
export function capsuleHitsCircle(capsule,x,y,r=0){
  const dx=capsule.x2-capsule.x,dy=capsule.y2-capsule.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((x-capsule.x)*dx+(y-capsule.y)*dy)/length)):0;
  return Math.hypot(x-capsule.x-dx*t,y-capsule.y-dy*t)<=capsule.r+r;
}
