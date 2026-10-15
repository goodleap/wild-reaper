// Guidance consumes the navigation controller's verified route. Rendering must
// never invent a straight shortcut between the hero and a distant objective.
const TAU=Math.PI*2;
const finite=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const STORY_GUIDANCE_RULES=Object.freeze({spacing:86,firstMark:68,maxMarks:5,maxRoute:460});

export function storyRouteMarks(guide){
  const path=guide?.path;if(!Array.isArray(path)||path.length<2)return [];
  if(guide.kind==='hold'&&finite(guide.target)&&distance(path[0],guide.target)<=(guide.arrivalRadius||0))return [];
  const result=[],rules=STORY_GUIDANCE_RULES;let travelled=0,next=rules.firstMark;
  for(let i=1;i<path.length&&result.length<rules.maxMarks;i++){
    const from=path[i-1],to=path[i];if(!finite(from)||!finite(to))break;
    const length=distance(from,to);if(length<.01)continue;
    while(next<=travelled+length&&next<=rules.maxRoute&&result.length<rules.maxMarks){
      const fraction=(next-travelled)/length;
      result.push({x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,angle:Math.atan2(to.y-from.y,to.x-from.x)});
      next+=rules.spacing;
    }
    travelled+=length;if(travelled>rules.maxRoute)break;
  }
  return result;
}

export function drawStoryGuideGround(ctx,guide,{zoom=1,bounds=null}={}){
  if(!guide)return;
  const visible=(point,margin=30)=>!bounds||point.x>=bounds.minX-margin&&point.x<=bounds.maxX+margin&&point.y>=bounds.minY-margin&&point.y<=bounds.maxY+margin;
  const scale=Math.max(.7,Math.min(1.45,1/zoom));
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  // Only small unfilled chevrons: threats and actors are drawn over this pass.
  for(const mark of storyRouteMarks(guide)){
    if(!visible(mark))continue;
    ctx.save();ctx.translate(mark.x,mark.y);ctx.rotate(mark.angle);ctx.scale(scale,scale);
    ctx.beginPath();ctx.moveTo(-7,-7);ctx.lineTo(1,0);ctx.lineTo(-7,7);
    ctx.strokeStyle='#183b38';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#b9eadf';ctx.lineWidth=2.5;ctx.stroke();ctx.restore();
  }
  const target=guide.target;
  if(finite(target)&&visible(target,Math.max(80,guide.areaRadius||0))){
    const radius=guide.areaRadius>0?guide.areaRadius:27*scale;
    ctx.save();ctx.translate(target.x,target.y);ctx.strokeStyle='#c4f2e5';ctx.lineWidth=2*scale;
    // An unfilled destination ring remains present after entering the screen.
    ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.stroke();
    for(let i=0;i<4;i++){const angle=i*Math.PI/2,x=Math.cos(angle),y=Math.sin(angle);ctx.beginPath();ctx.moveTo(x*(radius+5*scale),y*(radius+5*scale));ctx.lineTo(x*(radius+11*scale),y*(radius+11*scale));ctx.stroke();}
    ctx.restore();
  }
  ctx.restore();
}

const guideLabel=guide=>guide.shortLabel||guide.target?.shortLabel||(guide.kind==='hold'?'返回目标附近':'沿路前进');
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export function storyGuidePointerPlacement(guide,pointer,{width=540,height=960,avoid=[]}={}){
  if(!guide||!pointer)return null;
  const label=guideLabel(guide),labelWidth=Math.max(36,Array.from(label).length*12),vertical=pointer.x<width*.3||pointer.x>width*.7;
  for(const shift of [0,-54,54,-108,108,-162,162]){
    const x=pointer.x+(vertical?0:shift),y=pointer.y+(vertical?shift:0),left=x<width*.5;
    const rect={x:Math.min(x-17,left?x+3:x-labelWidth-11),y:y-17,width:Math.max(34,labelWidth+28),height:51};
    if(rect.x<8||rect.y<8||rect.x+rect.width>width-8||rect.y+rect.height>height-8||avoid.some(other=>intersects(rect,other)))continue;
    return {...pointer,x,y,rect};
  }
  return null;
}

export function drawStoryGuidePointer(ctx,guide,pointer,{width=540,height=960,avoid=[]}={}){
  pointer=storyGuidePointerPlacement(guide,pointer,{width,height,avoid});if(!pointer)return false;
  const label=guideLabel(guide);
  ctx.save();ctx.translate(pointer.x,pointer.y);ctx.lineJoin='round';ctx.lineCap='round';
  ctx.save();ctx.rotate(pointer.angle);ctx.beginPath();ctx.moveTo(-10,-10);ctx.lineTo(6,0);ctx.lineTo(-10,10);
  ctx.strokeStyle='#17352f';ctx.lineWidth=8;ctx.stroke();ctx.strokeStyle='#d1f3e4';ctx.lineWidth=4;ctx.stroke();ctx.restore();
  const left=pointer.x<width*.5;
  ctx.font='650 12px "PingFang SC",system-ui,sans-serif';ctx.textAlign=left?'left':'right';
  ctx.strokeStyle='#17352f';ctx.lineWidth=4;ctx.strokeText(label,left?7:-7,28);ctx.fillStyle='#e2f7e9';ctx.fillText(label,left?7:-7,28);
  ctx.restore();return true;
}
