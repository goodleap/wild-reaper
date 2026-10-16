// Guidance consumes the navigation controller's verified route. Rendering must
// never invent a straight shortcut between the hero and a distant objective.
const TAU=Math.PI*2;
const finite=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const ROUTE_RIBBON_RULES=Object.freeze({spacing:42,firstMark:28,opacity:.44,width:28,length:30});

export function routeRibbonMarks(guide){
  const path=guide?.routePath||guide?.path;if(guide?.complete===false||!Array.isArray(path)||path.length<2)return [];
  if(guide.kind==='hold'&&finite(guide.target)&&distance(guide.path?.[0]||path[0],guide.target)<=(guide.arrivalRadius||0))return [];
  const result=[],rules=ROUTE_RIBBON_RULES,progress=guide.progress||0,total=guide.lengths?.at(-1)||path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
  // Fixed world-distance marks remain still while the hero moves. Only marks
  // already passed disappear; viewport culling never shortens the route data.
  let travelled=0,next=rules.firstMark+Math.max(0,Math.ceil((progress+20-rules.firstMark)/rules.spacing))*rules.spacing;
  for(let i=1;i<path.length;i++){
    const from=path[i-1],to=path[i];if(!finite(from)||!finite(to))break;
    const length=distance(from,to);if(length<.01)continue;
    while(next<=travelled+length){
      const fraction=(next-travelled)/length;
      result.push({x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,angle:Math.atan2(to.y-from.y,to.x-from.x),opacity:Math.min(1,Math.max(.25,(total-next)/70)),along:next});
      next+=rules.spacing;
    }
    travelled+=length;
  }
  return result;
}

export function drawRouteRibbonGround(ctx,guide,{zoom=1,bounds=null}={}){
  if(!guide)return;
  const visible=(point,margin=30)=>!bounds||point.x>=bounds.minX-margin&&point.x<=bounds.maxX+margin&&point.y>=bounds.minY-margin&&point.y<=bounds.maxY+margin;
  const scale=1;
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  // Translucent filled chevrons share the terrain pass. Bodies, trees, walls
  // and combat effects are composited afterwards with their normal depth.
  for(const mark of routeRibbonMarks(guide)){
    if(!visible(mark))continue;
    ctx.save();ctx.translate(mark.x,mark.y);ctx.rotate(mark.angle);ctx.scale(scale,scale);
    ctx.globalAlpha=ROUTE_RIBBON_RULES.opacity*mark.opacity;
    ctx.beginPath();ctx.moveTo(-15,-14);ctx.lineTo(-2,-14);ctx.lineTo(13,0);ctx.lineTo(-2,14);ctx.lineTo(-15,14);ctx.lineTo(-1,0);ctx.closePath();
    ctx.fillStyle='#d4f0c5';ctx.fill();ctx.strokeStyle='#f2f7d2';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  }
  const target=guide.target;
  if(finite(target)&&visible(target,Math.max(80,guide.areaRadius||0))){
    const radius=guide.areaRadius>0?guide.areaRadius:27*scale;
    ctx.save();ctx.translate(target.x,target.y);ctx.globalAlpha=.35;ctx.strokeStyle='#d4f0c5';ctx.lineWidth=2*scale;
    // An unfilled destination ring remains present after entering the screen.
    ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.stroke();
    for(let i=0;i<4;i++){const angle=i*Math.PI/2,x=Math.cos(angle),y=Math.sin(angle);ctx.beginPath();ctx.moveTo(x*(radius+5*scale),y*(radius+5*scale));ctx.lineTo(x*(radius+11*scale),y*(radius+11*scale));ctx.stroke();}
    ctx.restore();
  }
  ctx.restore();
}
