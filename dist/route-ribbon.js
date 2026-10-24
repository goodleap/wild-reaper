// Guidance consumes the navigation controller's verified route. Rendering must
// never invent a straight shortcut between the hero and a distant objective.
const TAU=Math.PI*2;
const finite=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const ROUTE_RIBBON_RULES=Object.freeze({spacing:42,firstMark:28,opacity:.56,width:22.4,length:24});
const PALETTE=Object.freeze({fill:'#dcf5ff',outline:'#536d76',edge:'#f5feff'});

function strokeRibbon(ctx,opacity=1){
  // The narrow light rim separates the dark contour from shaded ground;
  // the contour remains readable on pale sand, snow and lunar terrain.
  ctx.globalAlpha=.76*opacity;ctx.strokeStyle=PALETTE.edge;ctx.lineWidth=4;ctx.stroke();
  ctx.globalAlpha=.76*opacity;ctx.strokeStyle=PALETTE.outline;ctx.lineWidth=2.2;ctx.stroke();
}

export function routeRibbonMarks(guide){
  const path=guide?.routePath||guide?.path;if(guide?.complete===false||!Array.isArray(path)||path.length<2)return [];
  if(guide.kind==='hold'&&finite(guide.target)&&distance(guide.path?.[0]||path[0],guide.target)<=(guide.arrivalRadius||0))return [];
  const result=[],rules=ROUTE_RIBBON_RULES,progress=guide.progress||0,total=guide.lengths?.at(-1)||path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
  // The local connection changes length while the remaining road keeps its
  // world-distance anchors. Passed marks fade continuously near the feet.
  const offset=guide.markOffset||0,fadeStart=12,fadeEnd=54;
  const first=Math.ceil((progress+fadeStart+offset-rules.firstMark)/rules.spacing);
  let travelled=0,next=rules.firstMark+(guide.markOffset===undefined?Math.max(0,first):first)*rules.spacing-offset;
  for(let i=1;i<path.length;i++){
    const from=path[i-1],to=path[i];if(!finite(from)||!finite(to))break;
    const length=distance(from,to);if(length<.01)continue;
    while(next<=travelled+length){
      const fraction=(next-travelled)/length;
      const fade=Math.min(1,Math.max(0,(next-progress-fadeStart)/(fadeEnd-fadeStart)));
      result.push({x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,angle:Math.atan2(to.y-from.y,to.x-from.x),opacity:fade*fade*(3-2*fade)*Math.min(1,Math.max(.25,(total-next)/70))*(guide.opacity??1),along:next});
      next+=rules.spacing;
    }
    travelled+=length;
  }
  return result;
}

export function drawRouteRibbonGround(ctx,guide,{zoom=1,bounds=null}={}){
  if(!guide)return;
  const visible=(point,margin=30)=>!bounds||point.x>=bounds.minX-margin&&point.x<=bounds.maxX+margin&&point.y>=bounds.minY-margin&&point.y<=bounds.maxY+margin;
  const scale=.8;
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  // Translucent filled chevrons share the terrain pass. Bodies, trees, walls
  // and combat effects are composited afterwards with their normal depth.
  for(const mark of routeRibbonMarks(guide)){
    if(!visible(mark))continue;
    ctx.save();ctx.translate(mark.x,mark.y);ctx.rotate(mark.angle);ctx.scale(scale,scale);
    ctx.globalAlpha=ROUTE_RIBBON_RULES.opacity*mark.opacity;
    ctx.beginPath();ctx.moveTo(-15,-14);ctx.lineTo(-2,-14);ctx.lineTo(13,0);ctx.lineTo(-2,14);ctx.lineTo(-15,14);ctx.lineTo(-1,0);ctx.closePath();
    ctx.fillStyle=PALETTE.fill;ctx.fill();strokeRibbon(ctx,mark.opacity);ctx.restore();
  }
  const target=guide.target;
  if(finite(target)&&visible(target,Math.max(80,guide.areaRadius||0))){
    const radius=guide.areaRadius>0?guide.areaRadius:27*scale;
    ctx.save();ctx.translate(target.x,target.y);
    // An unfilled destination ring remains present after entering the screen.
    ctx.beginPath();ctx.arc(0,0,radius,0,TAU);strokeRibbon(ctx,.75);
    for(let i=0;i<4;i++){const angle=i*Math.PI/2,x=Math.cos(angle),y=Math.sin(angle);ctx.beginPath();ctx.moveTo(x*(radius+5*scale),y*(radius+5*scale));ctx.lineTo(x*(radius+11*scale),y*(radius+11*scale));strokeRibbon(ctx,.75);}
    ctx.restore();
  }
  ctx.restore();
}
