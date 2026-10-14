const finite=Number.isFinite;

function clipBounds(ctx,viewBounds){
  const m=ctx.getTransform?.(),canvas=ctx.canvas;
  if(m&&canvas&&finite(canvas.width)&&finite(canvas.height)){
    if(Math.abs(m.b)<1e-10&&Math.abs(m.c)<1e-10&&Math.abs(m.a)>1e-12&&Math.abs(m.d)>1e-12){
      const x0=-m.e/m.a,x1=(canvas.width-m.e)/m.a,y0=-m.f/m.d,y1=(canvas.height-m.f)/m.d;
      return {m,minX:Math.min(x0,x1)-1,maxX:Math.max(x0,x1)+1,minY:Math.min(y0,y1)-1,maxY:Math.max(y0,y1)+1};
    }
    const determinant=m.a*m.d-m.b*m.c;
    if(finite(determinant)&&Math.abs(determinant)>1e-12){
      const points=[[0,0],[canvas.width,0],[0,canvas.height],[canvas.width,canvas.height]].map(([x,y])=>({
        x:(m.d*(x-m.e)-m.c*(y-m.f))/determinant,
        y:(m.a*(y-m.f)-m.b*(x-m.e))/determinant,
      }));
      return {m,minX:Math.min(...points.map(p=>p.x))-1,maxX:Math.max(...points.map(p=>p.x))+1,
        minY:Math.min(...points.map(p=>p.y))-1,maxY:Math.max(...points.map(p=>p.y))+1};
    }
  }
  const b=viewBounds;
  return {m,minX:finite(b?.minX)?b.minX-1:-1e7,maxX:finite(b?.maxX)?b.maxX+1:1e7,
    minY:finite(b?.minY)?b.minY-1:-1e7,maxY:finite(b?.maxY)?b.maxY+1:1e7};
}

function drawDepthBand(ctx,lower,upper,draw,viewBounds,clipCache){
  // A collected item's callbacks share one world-space render pass. Its
  // painters save/restore their transforms, so viewport inversion is reusable.
  if(clipCache.ctx!==ctx){clipCache.ctx=ctx;clipCache.bounds=clipBounds(ctx,viewBounds);}
  const b=clipCache.bounds,m=b.m;
  // Shared boundaries land on device pixels, so adjacent translucent bands
  // neither overlap nor leave an antialiased seam while the camera moves.
  const snap=m&&Math.abs(m.b)<1e-10&&Math.abs(m.c)<1e-10&&Math.abs(m.d)>1e-12
    ?y=>(Math.round(y*m.d+m.f)-m.f)/m.d:y=>y;
  const minY=finite(lower)?snap(lower):b.minY,maxY=finite(upper)?snap(upper):b.maxY;
  if(maxY<=b.minY||minY>=b.maxY||maxY<=minY)return;
  ctx.save();ctx.beginPath();ctx.rect(b.minX,minY,b.maxX-b.minX,maxY-minY);ctx.clip();
  draw(ctx);ctx.restore();
}

// Preserve the complete painter (including joins, gradients and local layer
// order) while distributing its visible pixels through the scene's Y order.
// Only internal bounds clip geometry; the first and last band reach the view
// edges so conservative depth extents cannot cut off a glow or a weapon tip.
export function visitAttackDepthBands(effect,{minX,maxX,minY,maxY,groundLift=0,step=24,maxBands=12,draw,viewBounds,sortYAt,depthCuts,depthCutsFor,depthTransform}={},visit){
  if(!finite(minY)||!finite(maxY)||typeof draw!=='function'||typeof visit!=='function')return 0;
  if(maxY<minY)[minY,maxY]=[maxY,minY];
  const span=maxY-minY,lift=finite(groundLift)?groundLift:0;
  const depthAt=typeof sortYAt==='function'?y=>{const depth=sortYAt(y);return finite(depth)?depth:y+lift;}:y=>y+lift;
  const bandStep=finite(step)&&step>0?step:24,limit=finite(maxBands)?Math.max(1,Math.min(24,Math.floor(maxBands))):12;
  const sceneCuts=Array.isArray(depthCuts)||typeof depthCutsFor==='function';
  // Between consecutive known occluders the painter has one scene ordering.
  // Redrawing extra uniform slices there adds work without changing coverage.
  const count=sceneCuts?1:Math.min(limit,Math.max(1,Math.ceil(span/bandStep)));
  const boundaries=[minY,maxY];
  for(let i=1;i<count;i++)boundaries.push(minY+span*i/count);
  const firstDepth=depthAt(minY),lastDepth=depthAt(maxY),depthSpan=lastDepth-firstDepth;
  // Scene actor feet are ground-space values. A caller may provide a linear
  // screen-to-ground mapping for beams joining actors of different heights.
  // Exact actor cuts replace uniform subdivision when scene depths are known.
  let actorCuts=Array.isArray(depthCuts)?depthCuts:[];
  if(typeof depthCutsFor==='function'){
    const x=finite(effect?.x)?effect.x:0,x2=finite(effect?.x2)?effect.x2:x,r=finite(effect?.r)?Math.abs(effect.r):0;
    const from=finite(minX)?minX:Math.min(x,x2)-r-24,to=finite(maxX)?maxX:Math.max(x,x2)+r+24;
    const localCuts=depthCutsFor(Math.min(from,to),Math.max(from,to));
    if(Array.isArray(localCuts))actorCuts=actorCuts.concat(localCuts);
  }
  if(Math.abs(depthSpan)>1e-9)for(const cut of actorCuts){
    if(!finite(cut))continue;
    const position=(cut-firstDepth)/depthSpan;
    if(position>0&&position<1)boundaries.push(minY+position*span);
  }
  boundaries.sort((a,b)=>a-b);
  let cuts=boundaries.filter((value,index)=>!index||value-boundaries[index-1]>1e-8);
  const m=depthTransform;
  if(m&&finite(m.d)&&finite(m.f)&&Math.abs(m.b)<1e-10&&Math.abs(m.c)<1e-10&&Math.abs(m.d)>1e-12){
    // Different crowd feet can hit the same final raster row. Those clips had
    // zero visible height already; merge them before queuing any draw work.
    const snapped=[minY];
    for(let i=1;i<cuts.length-1;i++){
      const y=(Math.round(cuts[i]*m.d+m.f)-m.f)/m.d;
      if(y>snapped[snapped.length-1]+1e-8&&y<maxY-1e-8)snapped.push(y);
    }
    snapped.push(maxY);cuts=snapped;
  }
  if(cuts.length<=2){visit({sortY:depthAt((minY+maxY)/2),draw,effect});return 1;}
  const clipCache={ctx:null,bounds:null};
  for(let i=0;i<cuts.length-1;i++){
    const lower=i?cuts[i]:-Infinity,upper=i<cuts.length-2?cuts[i+1]:Infinity;
    visit({sortY:depthAt((cuts[i]+cuts[i+1])/2),effect,draw:ctx=>drawDepthBand(ctx,lower,upper,draw,viewBounds,clipCache)});
  }
  return cuts.length-1;
}
