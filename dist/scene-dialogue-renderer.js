import { DIALOGUE_DISPLAY_RULES, hideDialogue, resumeDialogue } from './dialogue-display-state.js';

const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const inside=(r,w,h)=>r.x>=8&&r.y>=8&&r.x+r.width<=w-8&&r.y+r.height<=h-8;
const placements=new WeakMap();
const visibility=new WeakMap();
const expand=(rect,pad)=>({x:rect.x-pad,y:rect.y-pad,width:rect.width+pad*2,height:rect.height+pad*2});

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
    let state=visibility.get(item);if(!state){state={};visibility.set(item,state);}
    const clock=Number.isFinite(item.clock)?item.clock:0;
    const s=item.speaker,anchor=project(s.x,s.y-(s.headOffset||58));
    if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)||anchor.x<0||anchor.x>width||anchor.y<0||anchor.y>height){hideDialogue(state,clock);continue;}
    let saved=placements.get(item),rows=saved?.rows??wrap(item.text,measure,Math.min(204,width-40));if(!rows)continue;
    const w=saved?.width??Math.max(48,...rows.map(measure))+20,h=saved?.height??rows.length*18+14;
    // Choose a safe spot once. Subsequent frames preserve the offset from the
    // speaker; a new warning hides this bubble instead of pushing it sideways.
    const spots=saved?[{x:anchor.x+saved.dx,y:anchor.y+saved.dy}]:[
      {x:anchor.x-w/2,y:anchor.y-h-12},{x:anchor.x-w-12,y:anchor.y-h-12},{x:anchor.x+12,y:anchor.y-h-12},{x:anchor.x-w/2,y:anchor.y-h-38},
      // A nearby follower can occupy every low spot on a narrow screen. Try
      // a few higher, partly shifted spots before the first appearance only;
      // clamp their edges without moving an already established bubble.
      ...[38,76].flatMap(gap=>[0,-w/4,w/4,-w/2,w/2].map(shift=>({x:Math.max(8,Math.min(width-w-8,anchor.x-w/2+shift)),y:anchor.y-h-gap})))
    ];
    const clear=(rect,pad=0)=>{const bounds=expand({...rect,height:h+5},pad);return inside(bounds,width,height)&&occupied.every(other=>!intersects(bounds,other));};
    const candidates=spots.map(p=>({...p,width:w,height:h})),margin=DIALOGUE_DISPLAY_RULES.reentryMargin;
    // Prefer breathing room at the first placement, but keep compact phone
    // slots usable. Once shown, the speaker-relative offset never changes.
    const rect=(!saved&&candidates.find(candidate=>clear(candidate,margin)))||candidates.find(candidate=>clear(candidate));
    if(!rect){hideDialogue(state,clock);continue;}
    if(!resumeDialogue(state,clock,{comfortable:clear(rect,margin)}))continue;
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
