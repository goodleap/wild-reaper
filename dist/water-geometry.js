// One bounded contour is shared by water paint, wading and dry-ground tests.
// Legacy ellipse fixtures intentionally retain their exact old footprint.
const TAU=Math.PI*2,SEGMENTS=48,cache=new WeakMap();
export const WATER_SHAPES=Object.freeze(['rounded','elongated','kidney','bays','branching']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const valid=m=>!!m&&Number.isFinite(m.x)&&Number.isFinite(m.y)&&Number.isFinite(m.rx)&&Number.isFinite(m.ry)&&m.rx>0&&m.ry>0;
const radial=(shape,a,phase)=>{
  if(shape==='kidney'){const d=Math.atan2(Math.sin(a),Math.cos(a));return .94+.045*Math.sin(a*3+phase)-.47*Math.exp(-d*d/.34);}
  if(shape==='bays')return .80+.14*Math.cos(a*2-.35)+.095*Math.sin(a*3+phase*.2);
  if(shape==='branching')return .76+.19*Math.cos(a*3+.35)+.055*Math.sin(a*5+phase*.2);
  if(shape==='elongated')return .96+.03*Math.sin(a*3+phase)+.015*Math.cos(a*5);
  return .93+.045*Math.sin(a*3+phase)+.025*Math.cos(a*5-phase);
};
function ring(m,hole=false){
  const out=[],angle=m.angle||0,ca=Math.cos(angle),sa=Math.sin(angle),phase=Math.floor((m.seed||0)*3)*1.7;
  // Holes stay well inside the central body of every supported silhouette.
  const count=hole?24:SEGMENTS;
  for(let i=0;i<count;i++){
    const a=(hole?-1:1)*i*TAU/count,r=hole?1+.075*Math.sin(a*3+phase):radial(m.shape,a,phase);
    const x=hole?m.rx*(-.12+Math.cos(a)*.17*r):Math.cos(a)*m.rx*r;
    const y=hole?m.ry*(.015+Math.sin(a)*.22*r):Math.sin(a)*m.ry*r;
    out.push({x:x*ca-y*sa,y:x*sa+y*ca});
  }
  return out;
}
function geometry(m){
  if(!valid(m))return null;
  const prior=cache.get(m);if(prior&&prior.rx===m.rx&&prior.ry===m.ry&&prior.shape===m.shape&&prior.angle===m.angle&&prior.seed===m.seed&&prior.island===m.island)return prior;
  const outer=m.shape?ring(m):Array.from({length:64},(_,i)=>({x:Math.cos(i*TAU/64)*m.rx,y:Math.sin(i*TAU/64)*m.ry}));
  const holes=m.shape&&m.island?[ring(m,true)]:[],bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(const p of outer){bounds.minX=Math.min(bounds.minX,p.x);bounds.minY=Math.min(bounds.minY,p.y);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.maxY=Math.max(bounds.maxY,p.y);}
  const result={rx:m.rx,ry:m.ry,shape:m.shape,angle:m.angle,seed:m.seed,island:m.island,outer,holes,bounds};cache.set(m,result);return result;
}
export function getWaterContours(m,{local=false}={}){
  const g=geometry(m);if(!g)return {outer:[],holes:[]};
  if(local)return {outer:g.outer,holes:g.holes};
  const move=points=>points.map(p=>({x:p.x+m.x,y:p.y+m.y}));
  return {outer:move(g.outer),holes:g.holes.map(move)};
}
export function waterBounds(m,padding=0){
  const g=geometry(m);if(!g)return {minX:0,minY:0,maxX:0,maxY:0};
  return {minX:m.x+g.bounds.minX-padding,minY:m.y+g.bounds.minY-padding,maxX:m.x+g.bounds.maxX+padding,maxY:m.y+g.bounds.maxY+padding};
}
export function traceWaterPath(ctx,m,{local=false}={}){
  ctx.beginPath();if(!valid(m))return;
  const x=local?0:m.x,y=local?0:m.y;
  if(!m.shape){ctx.ellipse(x,y,m.rx,m.ry,0,0,TAU);return;}
  const g=geometry(m);
  const trace=points=>{ctx.moveTo(x+points[0].x,y+points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(x+points[i].x,y+points[i].y);ctx.closePath();};
  trace(g.outer);for(const hole of g.holes)trace(hole);
}
function inRing(points,x,y){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
function edgeDistanceSquared(points,x,y){
  let best=Infinity;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i],dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?clamp(((x-a.x)*dx+(y-a.y)*dy)/d,0,1):0;
    best=Math.min(best,(x-a.x-t*dx)**2+(y-a.y-t*dy)**2);
  }
  return best;
}
function pointSegmentDistanceSquared(x,y,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy,t=length?clamp(((x-ax)*dx+(y-ay)*dy)/length,0,1):0;
  return (x-ax-t*dx)**2+(y-ay-t*dy)**2;
}
function segmentDistanceSquared(ax,ay,bx,by,cx,cy,dx,dy){
  const ux=bx-ax,uy=by-ay,vx=dx-cx,vy=dy-cy,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10){
    const t=((cx-ax)*vy-(cy-ay)*vx)/den,s=((cx-ax)*uy-(cy-ay)*ux)/den;
    if(t>=0&&t<=1&&s>=0&&s<=1)return 0;
  }
  return Math.min(pointSegmentDistanceSquared(ax,ay,cx,cy,dx,dy),pointSegmentDistanceSquared(bx,by,cx,cy,dx,dy),pointSegmentDistanceSquared(cx,cy,ax,ay,bx,by),pointSegmentDistanceSquared(dx,dy,ax,ay,bx,by));
}
function ellipseDistanceSquared(m,x,y){
  x=Math.abs(x);y=Math.abs(y);if((x/m.rx)**2+(y/m.ry)**2<=1)return 0;
  const aa=m.rx*m.rx,bb=m.ry*m.ry,at=t=>(m.rx*x/(t+aa))**2+(m.ry*y/(t+bb))**2;
  let lo=0,hi=Math.max(m.rx*x,m.ry*y,1);while(at(hi)>1)hi*=2;
  for(let i=0;i<30;i++){const mid=(lo+hi)*.5;if(at(mid)>1)lo=mid;else hi=mid;}
  return (x-aa*x/(hi+aa))**2+(y-bb*y/(hi+bb))**2;
}
function inBounds(g,x,y,r=0){const b=g.bounds;return x>=b.minX-r&&x<=b.maxX+r&&y>=b.minY-r&&y<=b.maxY+r;}
export function containsWater(m,x,y){
  if(!valid(m))return false;
  x-=m.x;y-=m.y;
  if(!m.shape)return (x/m.rx)**2+(y/m.ry)**2<=1;
  const g=geometry(m);return inBounds(g,x,y)&&inRing(g.outer,x,y)&&!g.holes.some(h=>inRing(h,x,y));
}
export function waterDepth(m,x,y){
  if(!valid(m))return 0;
  x-=m.x;y-=m.y;let t;
  if(!m.shape)t=clamp((1-Math.hypot(x/m.rx,y/m.ry))/.6,0,1);
  else{
    const g=geometry(m);if(!inBounds(g,x,y)||!inRing(g.outer,x,y)||g.holes.some(h=>inRing(h,x,y)))return 0;
    let d=edgeDistanceSquared(g.outer,x,y);for(const hole of g.holes)d=Math.min(d,edgeDistanceSquared(hole,x,y));
    // Large wetlands deepen at a readable bank distance, never sink a body
    // farther merely because the same shoreline belongs to a larger pool.
    t=clamp(Math.sqrt(d)/clamp(Math.min(m.rx,m.ry)*.45,18,54),0,1);
  }
  return t*t*(3-2*t);
}
export function waterIntersectsCircle(m,x,y,r=0){
  if(!valid(m)||!Number.isFinite(r)||r<0)return false;
  x-=m.x;y-=m.y;const g=geometry(m);if(!inBounds(g,x,y,r))return false;
  if(!m.shape){
    // Closest point on an axis-aligned ellipse, including its rounded banks.
    return ellipseDistanceSquared(m,x,y)<=(r+1e-6)**2;
  }
  if(inRing(g.outer,x,y)&&!g.holes.some(h=>inRing(h,x,y)))return true;
  if(edgeDistanceSquared(g.outer,x,y)<=r*r)return true;
  return g.holes.some(h=>edgeDistanceSquared(h,x,y)<=r*r);
}

// Entire rotated log footprint, including its round ends. Sampling only its
// midpoint or endpoints misses a shoreline crossing the middle of a long log.
export function waterIntersectsCapsule(m,ax,ay,bx,by,r=0){
  if(!valid(m)||![ax,ay,bx,by,r].every(Number.isFinite)||r<0)return false;
  const g=geometry(m),b=g.bounds;ax-=m.x;ay-=m.y;bx-=m.x;by-=m.y;
  if(Math.max(ax,bx)+r<b.minX||Math.min(ax,bx)-r>b.maxX||Math.max(ay,by)+r<b.minY||Math.min(ay,by)-r>b.maxY)return false;
  if(!m.shape){
    const dx=bx-ax,dy=by-ay;
    // Distance to a convex ellipse is convex along this segment. The bounded
    // minimization retains exact legacy ellipses instead of a polygon proxy.
    let lo=0,hi=1;
    for(let i=0;i<42;i++){const a=(2*lo+hi)/3,c=(lo+2*hi)/3;if(ellipseDistanceSquared(m,ax+dx*a,ay+dy*a)<=ellipseDistanceSquared(m,ax+dx*c,ay+dy*c))hi=c;else lo=a;}
    const t=(lo+hi)*.5;
    return Math.min(ellipseDistanceSquared(m,ax,ay),ellipseDistanceSquared(m,bx,by),ellipseDistanceSquared(m,ax+dx*t,ay+dy*t))<=(r+1e-6)**2;
  }
  const wet=(x,y)=>inRing(g.outer,x,y)&&!g.holes.some(h=>inRing(h,x,y));
  if(wet(ax,ay)||wet(bx,by))return true;
  const crosses=ring=>{for(let i=0,j=ring.length-1;i<ring.length;j=i++)if(segmentDistanceSquared(ax,ay,bx,by,ring[j].x,ring[j].y,ring[i].x,ring[i].y)<=r*r)return true;return false;};
  return crosses(g.outer)||g.holes.some(crosses);
}
