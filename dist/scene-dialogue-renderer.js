const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const inside=(r,w,h)=>r.x>=8&&r.y>=8&&r.x+r.width<=w-8&&r.y+r.height<=h-8;
const placements=new WeakMap();

function wrap(text,measure,maxWidth){
  const rows=[];let row='';
  for(const char of text){
    if(row&&measure(row+char)>maxWidth){rows.push(row);row='';}
    row+=char;
  }
  if(row)rows.push(row);
  return rows.length<=2?rows:null;
}

// All coordinates and exclusion rectangles use CSS pixels. No input handlers,
// world sorting, camera changes, or simulation effects belong in this overlay.
export function layoutSceneDialogue(items,{project,width,height,avoid=[],measure=text=>Array.from(text).length*12}={}){
  if(typeof project!=='function'||width<100||height<100)return [];
  const result=[],occupied=avoid.filter(rect=>rect&&Number.isFinite(rect.x)&&Number.isFinite(rect.y)&&rect.width>0&&rect.height>0);
  for(const item of [...items].sort((a,b)=>b.priority-a.priority||a.id-b.id)){
    if(result.length>=2)break;
    const s=item.speaker,anchor=project(s.x,s.y-(s.headOffset||58));
    if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)||anchor.x<0||anchor.x>width||anchor.y<0||anchor.y>height)continue;
    let saved=placements.get(item),rows=saved?.rows??wrap(item.text,measure,Math.min(204,width-40));if(!rows)continue;
    const w=saved?.width??Math.max(48,...rows.map(measure))+20,h=saved?.height??rows.length*18+14;
    // Choose a safe spot once. Subsequent frames preserve the offset from the
    // speaker; a new warning hides this bubble instead of pushing it sideways.
    const spots=saved?[{x:anchor.x+saved.dx,y:anchor.y+saved.dy}]:[{x:anchor.x-w/2,y:anchor.y-h-12},{x:anchor.x-w-12,y:anchor.y-h-12},{x:anchor.x+12,y:anchor.y-h-12},{x:anchor.x-w/2,y:anchor.y-h-38}];
    const rect=spots.map(p=>({...p,width:w,height:h})).find(rect=>inside({...rect,height:h+5},width,height)&&occupied.every(other=>!intersects({...rect,height:h+5},other)));
    if(!rect){if(saved){saved.blockedAt=item.clock??0;saved.edgeBlocked=!inside({...spots[0],width:w,height:h+5},width,height);}continue;}
    if(saved?.blockedAt!=null){
      // The extra edge skirt and brief clear interval prevent a one-pixel
      // camera oscillation from flashing text repeatedly along the viewport.
      if(saved.edgeBlocked&&(rect.x<14||rect.y<14||rect.x+w>width-14||rect.y+h+5>height-14)){saved.blockedAt=item.clock??0;continue;}
      if((item.clock??0)-saved.blockedAt<.12)continue;saved.blockedAt=null;saved.edgeBlocked=false;
    }
    if(!saved){saved={dx:rect.x-anchor.x,dy:rect.y-anchor.y,width:w,height:h,rows};placements.set(item,saved);}
    occupied.push({...rect,x:rect.x-5,y:rect.y-5,width:rect.width+10,height:rect.height+10});
    result.push({item,rect,rows,anchor});
  }
  return result;
}

export function drawSceneDialogue(ctx,items,options={}){
  ctx.save();ctx.font='600 12px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  const placed=layoutSceneDialogue(items,{...options,measure:text=>ctx.measureText(text).width});
  for(const {item,rect,rows,anchor}of placed){
    ctx.globalAlpha=Math.min(1,Math.max(0,item.remaining)/.35);
    ctx.fillStyle='#17261fef';ctx.strokeStyle=item.priority>=90?'#d6b68a':'#aebc94';ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(rect.x,rect.y,rect.width,rect.height,7);ctx.fill();ctx.stroke();
    // The short pointer stays within the bubble's free margin; it cannot reach
    // across an excluded body or hazard to a distant anchor.
    const tail=Math.max(rect.x+10,Math.min(rect.x+rect.width-10,anchor.x));
    ctx.beginPath();ctx.moveTo(tail-4,rect.y+rect.height);ctx.lineTo(tail,rect.y+rect.height+5);ctx.lineTo(tail+4,rect.y+rect.height);ctx.fill();
    ctx.fillStyle='#f1eddc';rows.forEach((row,index)=>ctx.fillText(row,rect.x+rect.width/2,rect.y+16+index*18));
  }
  ctx.restore();return placed;
}
