const placements=new WeakMap();

// Script-owned speech follows its actor directly. It has no ambient queue,
// combat interruption, or layout reflow; the script owns its lifetime.
export function drawScriptedSceneDialogue(ctx,items,{project,width,height,isVisible=()=>true}={}){
  if(typeof project!=='function')return [];
  if(!items?.length){placements.delete(ctx);return [];}
  let saved=placements.get(ctx);if(!saved){saved=new Map();placements.set(ctx,saved);}
  const activeIds=new Set(items.map(item=>item.id));for(const id of saved.keys())if(!activeIds.has(id))saved.delete(id);
  const placed=[];
  ctx.save();ctx.font='600 12px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const item of items){
    const actor=item.actor;if(!actor||!item.text)continue;
    const speaker={entity:actor,source:actor,headOffset:58};
    if(!isVisible(speaker))continue;
    const anchor=project(actor.x,actor.y-58),marker=item.text==='…',rows=[];
    let row='';
    for(const char of item.text){if(row&&ctx.measureText(row+char).width>Math.min(204,width-40)){rows.push(row);row='';}row+=char;}
    if(row)rows.push(row);if(rows.length>3)continue;
    const w=marker?34:Math.max(48,...rows.map(text=>ctx.measureText(text).width))+20,h=marker?24:rows.length*18+14;
    let placement=saved.get(item.id);
    if(!placement||placement.actor!==actor||placement.text!==item.text||placement.viewport!==width){
      // Pick an inset once, including a side position when a visible speaker
      // stands near an edge. Later movement carries this same actor-relative
      // offset, rather than causing the text to bounce between placements.
      const left=Math.max(6,Math.min(width-w-6,anchor.x-w/2));
      placement={actor,text:item.text,viewport:width,dx:left-anchor.x};saved.set(item.id,placement);
    }
    const rect={x:anchor.x+placement.dx,y:anchor.y-h-7,width:w,height:h};
    if(rect.x<6||rect.x+w>width-6||rect.y<6||rect.y+h>height-6)continue;
    ctx.fillStyle='#182e25ef';ctx.strokeStyle=marker?'#d5cfab':'#d8c99f';ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(rect.x,rect.y,w,h,marker?9:6);ctx.fill();ctx.stroke();
    const tail=Math.max(rect.x+8,Math.min(rect.x+w-8,anchor.x));
    ctx.beginPath();ctx.moveTo(tail-4,rect.y+h);ctx.lineTo(tail,rect.y+h+5);ctx.lineTo(tail+4,rect.y+h);ctx.fill();
    ctx.fillStyle='#f1eddc';rows.forEach((text,index)=>ctx.fillText(text,rect.x+w/2,rect.y+(marker?11:16)+index*18));
    placed.push({item,rect,anchor,rows});
  }
  ctx.restore();return placed;
}
