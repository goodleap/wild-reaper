// Fixed world boundaries are baked offline. Spatially indexed outline edges
// define solid landforms; individual decorative trees never seal the world.
const CELL=384,EPS=.025,CONTACT_EPS=1e-7,SKIN=1e-5,SLIDE_PASSES=8;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=(x,y)=>`${x},${y}`;
function nearest(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?clamp(((x-a.x)*dx+(y-a.y)*dy)/d,0,1):0;return {x:a.x+dx*t,y:a.y+dy*t};}
function distanceSq(x,y,a,b){const q=nearest(x,y,a,b);return (q.x-x)**2+(q.y-y)**2;}
function segmentDistanceSq(a,b,c,d){
  const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10){const t=((c.x-a.x)*vy-(c.y-a.y)*vx)/den,s=((c.x-a.x)*uy-(c.y-a.y)*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
  return Math.min(distanceSq(a.x,a.y,c,d),distanceSq(b.x,b.y,c,d),distanceSq(c.x,c.y,a,b),distanceSq(d.x,d.y,a,b));
}
// Earliest entry into the capsule around a finite edge. Endpoint contacts use
// their radial normal, not whichever incident edge happens to be queried first.
export function sweepCircleVsCapsule(ax,ay,bx,by,bodyRadius,edge){
  const x=ax,y=ay,dx=bx-ax,dy=by-ay,r=bodyRadius+(edge.r||0);
  const length=Math.hypot(edge.b.x-edge.a.x,edge.b.y-edge.a.y),ux=(edge.b.x-edge.a.x)/(length||1),uy=(edge.b.y-edge.a.y)/(length||1);
  const travel=Math.hypot(dx,dy),tolerance=CONTACT_EPS/Math.max(1,travel);
  let result=null;
  const accept=(time,nx,ny)=>{
    if(time < -tolerance||time > 1+tolerance||dx*nx+dy*ny>=-1e-10)return;
    time=clamp(time,0,1);
    if(!result||time<result.time)result={time,nx,ny,edge};
  };
  const q=nearest(x,y,edge.a,edge.b),qx=x-q.x,qy=y-q.y,distance=Math.hypot(qx,qy);
  // circleFree permits a one-thousandth rounding tolerance. An already
  // touching legal body still needs a t=0 constraint when it pushes inward.
  if(distance>1e-12&&distance<=r+CONTACT_EPS)accept(0,qx/distance,qy/distance);
  if(length>1e-12)for(const side of [-1,1]){
    const nx=-uy*side,ny=ux*side,signed=(x-edge.a.x)*nx+(y-edge.a.y)*ny,velocity=dx*nx+dy*ny;
    if(velocity>=-1e-10)continue;
    const time=(r-signed)/velocity,along=(x+dx*time-edge.a.x)*ux+(y+dy*time-edge.a.y)*uy;
    if(along>=-CONTACT_EPS&&along<=length+CONTACT_EPS)accept(time,nx,ny);
  }
  const speedSq=dx*dx+dy*dy;
  if(speedSq>1e-20)for(const point of [edge.a,edge.b]){
    const px=x-point.x,py=y-point.y,b=px*dx+py*dy,c=px*px+py*py-r*r,discriminant=b*b-speedSq*c;
    if(discriminant<0)continue;
    const time=(-b-Math.sqrt(Math.max(0,discriminant)))/speedSq,hx=px+dx*time,hy=py+dy*time,d=Math.hypot(hx,hy);
    if(d>1e-12)accept(time,hx/d,hy/d);
  }
  return result;
}
function mergeContacts(hits,travel){
  const valid=hits.filter(Boolean);if(!valid.length)return null;
  const time=Math.min(...valid.map(h=>h.time)),tolerance=CONTACT_EPS/Math.max(1,travel);
  return {time,contacts:valid.filter(h=>h.time<=time+tolerance).flatMap(h=>h.contacts)};
}
// The closest velocity in the intersection of all contact half-planes is the
// input, a projection onto one plane, or zero. Enumerating those candidates is
// order independent in 2D and retains genuine two-wall / narrow-gap blocking.
function contactMotion(dx,dy,contacts){
  const valid=(x,y)=>contacts.every(n=>x*n.nx+y*n.ny>=-1e-9);
  if(valid(dx,dy))return {x:dx,y:dy};
  let best={x:0,y:0},error=dx*dx+dy*dy;
  for(const n of contacts){
    const dot=dx*n.nx+dy*n.ny,x=dx-dot*n.nx,y=dy-dot*n.ny,next=(x-dx)**2+(y-dy)**2;
    if(next<error&&valid(x,y)){best={x,y};error=next;}
  }
  return best;
}
// The same bounded solver can combine authored outlines, independent trunks,
// gates and room walls. Callbacks own broad-phase queries and height filtering.
export function slideCircleContacts(fromX,fromY,x,y,r,{circleFree,firstBlocker,firstContact,contacts}){
  if(circleFree(x,y,r)&&!firstBlocker(fromX,fromY,x,y,r))return {x,y,blocked:false};
  let px=fromX,py=fromY,dx=x-fromX,dy=y-fromY,distance=0;const path=[{x:px,y:py}];
  for(let pass=0;pass<SLIDE_PASSES&&Math.hypot(dx,dy)>1e-9;pass++){
    const hit=firstContact(px,py,px+dx,py+dy,r),travel=Math.hypot(dx,dy);
    const fraction=hit?Math.max(0,hit.time-SKIN/travel):1,nx=px+dx*fraction,ny=py+dy*fraction;
    // Every retained leg, including an endcap tangent, must pass the same
    // full-body visibility and endpoint checks as ordinary movement.
    if(!circleFree(nx,ny,r)||firstBlocker(px,py,nx,ny,r))break;
    const advance=Math.hypot(nx-px,ny-py);distance+=advance;px=nx;py=ny;
    if(advance>1e-10)path.push({x:px,y:py});
    if(!hit)break;
    dx*=1-fraction;dy*=1-fraction;
    const active=contacts(px,py,r);
    // Contact normals at the exact hit remain available when approaching
    // almost tangentially leaves the conservative skin just outside range.
    for(const n of hit.contacts)if(!active.some(c=>c.nx*n.nx+c.ny*n.ny>1-1e-10))active.push(n);
    const remaining=contactMotion(dx,dy,active);dx=remaining.x;dy=remaining.y;
  }
  return {x:px,y:py,blocked:true,path,distance};
}
export function riftPointInPolygon(point,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if(distanceSq(point.x,point.y,a,b)<1e-10)return true;
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
class BoundaryMask{
  constructor(rings,label){
    this.edges=[];this.grid=new Map();this.rows=new Map();
    for(const [ringIndex,ring] of rings.entries()){
      const points=ring.points??ring;
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1e-6)continue;
        const edge={id:`rift:${label}:${ringIndex}:${i}`,type:'log',variant:'world-ridge',heightBand:'high',r:0,x:(a.x+b.x)/2,y:(a.y+b.y)/2,halfLength:length/2,angle:Math.atan2(b.y-a.y,b.x-a.x),a,b,riftBoundary:true};
        this.edges.push(edge);
        const minY=Math.floor(Math.min(a.y,b.y)/CELL),maxY=Math.floor(Math.max(a.y,b.y)/CELL);
        for(let y=minY;y<=maxY;y++){
          if(!this.rows.has(y))this.rows.set(y,[]);this.rows.get(y).push(edge);
          for(let x=Math.floor(Math.min(a.x,b.x)/CELL);x<=Math.floor(Math.max(a.x,b.x)/CELL);x++){const id=key(x,y);if(!this.grid.has(id))this.grid.set(id,[]);this.grid.get(id).push(edge);}
        }
      }
    }
    for(const edge of this.edges){
      const dx=-Math.sin(edge.angle),dy=Math.cos(edge.angle),inside=this.inside(edge.x+dx*.1,edge.y+dy*.1);edge.nx=inside?dx:-dx;edge.ny=inside?dy:-dy;
    }
  }
  inside(x,y){
    let inside=false;
    for(const edge of this.rows.get(Math.floor(y/CELL))||[]){const {a,b}=edge;if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}
    return inside;
  }
  query(minX,minY,maxX,maxY){
    const result=[],seen=new Set();
    for(let x=Math.floor(minX/CELL);x<=Math.floor(maxX/CELL);x++)for(let y=Math.floor(minY/CELL);y<=Math.floor(maxY/CELL);y++)for(const edge of this.grid.get(key(x,y))||[]){if(seen.has(edge))continue;seen.add(edge);result.push(edge);}
    return result;
  }
  circleFree(x,y,r=0){return this.inside(x,y)&&!this.query(x-r,y-r,x+r,y+r).some(e=>distanceSq(x,y,e.a,e.b)<Math.max(0,r-.001)**2);}
  firstBlocker(ax,ay,bx,by,r=0){
    const a={x:ax,y:ay},b={x:bx,y:by};let found=null,best=Infinity;
    for(const edge of this.query(Math.min(ax,bx)-r,Math.min(ay,by)-r,Math.max(ax,bx)+r,Math.max(ay,by)+r)){
      if(segmentDistanceSq(a,b,edge.a,edge.b)>Math.max(1e-10,(r-.001)**2))continue;
      const distance=distanceSq(ax,ay,edge.a,edge.b);if(distance<best){found=edge;best=distance;}
    }
    // A ray wholly inside an obstruction must also fail visibility checks.
    if(!found&&(!this.inside(ax,ay)||!this.inside(bx,by)))found=this.nearest(ax,ay)?.edge??null;
    return found;
  }
  firstContact(ax,ay,bx,by,r=0){
    const dx=bx-ax,dy=by-ay,tolerance=CONTACT_EPS/Math.max(1,Math.hypot(dx,dy));let time=Infinity,contacts=[];
    for(const edge of this.query(Math.min(ax,bx)-r-SKIN,Math.min(ay,by)-r-SKIN,Math.max(ax,bx)+r+SKIN,Math.max(ay,by)+r+SKIN)){
      const hit=sweepCircleVsCapsule(ax,ay,bx,by,r,edge);if(!hit)continue;
      if(hit.time<time-tolerance){time=hit.time;contacts=[hit];}
      else if(Math.abs(hit.time-time)<=tolerance){time=Math.min(time,hit.time);contacts.push(hit);}
    }
    return contacts.length?{time,contacts}:null;
  }
  _contacts(x,y,r){
    const contacts=[],range=r+SKIN*3+CONTACT_EPS;
    for(const edge of this.query(x-range,y-range,x+range,y+range)){
      const q=nearest(x,y,edge.a,edge.b),dx=x-q.x,dy=y-q.y,d=Math.hypot(dx,dy);
      if(d>range||d<1e-12)continue;
      const nx=dx/d,ny=dy/d;
      if(!contacts.some(n=>n.nx*nx+n.ny*ny>1-1e-10))contacts.push({nx,ny,edge});
    }
    return contacts;
  }
  nearest(x,y,range=Infinity){
    let best=null,d=Infinity;const edges=Number.isFinite(range)?this.query(x-range,y-range,x+range,y+range):this.edges;
    for(const edge of edges){const q=nearest(x,y,edge.a,edge.b),next=(q.x-x)**2+(q.y-y)**2;if(next<d){d=next;best={...q,edge,distance:Math.sqrt(next)};}}
    return best;
  }
  constrain(x,y,r=0){
    if(this.circleFree(x,y,r))return {x,y,blocked:false};
    const original={x,y};let candidates=this.query(x-r-96,y-r-96,x+r+96,y+r+96);
    if(!candidates.length)candidates=this.edges;
    let best=null,bestDistance=Infinity;
    for(const edge of candidates){
      const q=nearest(x,y,edge.a,edge.b);let px=q.x+edge.nx*(r+EPS),py=q.y+edge.ny*(r+EPS);
      // A concave corner can touch two outlines. Resolve its nearby normals,
      // then validate the resulting full circle before using that candidate.
      for(let pass=0;pass<4&&!this.circleFree(px,py,r);pass++)for(const other of this.query(px-r-1,py-r-1,px+r+1,py+r+1)){
        const p=nearest(px,py,other.a,other.b),d=Math.hypot(px-p.x,py-p.y);if(d>=r&&this.inside(px,py))continue;
        px=p.x+other.nx*(r+EPS);py=p.y+other.ny*(r+EPS);
      }
      const d=(px-original.x)**2+(py-original.y)**2;if(d<bestDistance&&this.circleFree(px,py,r)){bestDistance=d;best={x:px,y:py,blocked:true};}
    }
    return best??{x,y,blocked:true};
  }
  step(fromX,fromY,x,y,r,hooks={}){
    return slideCircleContacts(fromX,fromY,x,y,r,{
      circleFree:(x,y,r)=>this.circleFree(x,y,r)&&(hooks.circleFree?.(x,y,r)??true),
      firstBlocker:(ax,ay,bx,by,r)=>this.firstBlocker(ax,ay,bx,by,r)||hooks.firstBlocker?.(ax,ay,bx,by,r),
      firstContact:(ax,ay,bx,by,r)=>mergeContacts([this.firstContact(ax,ay,bx,by,r),hooks.firstContact?.(ax,ay,bx,by,r)],Math.hypot(bx-ax,by-ay)),
      contacts:(x,y,r)=>[...this._contacts(x,y,r),...(hooks.contacts?.(x,y,r)??[])]
    });
  }
}
export class RiftCollision{
  constructor(layout){this.ground=new BoundaryMask(layout.boundaries,'ground');this.high=new BoundaryMask(layout.solidBoundaries??layout.boundaries,'high');}
  mask(profile='ground'){return ['air','projectile','sight'].includes(profile)?this.high:profile==='overhead'?null:this.ground;}
  circleFree(x,y,r,profile){return this.mask(profile)?.circleFree(x,y,r)??true;}
  firstBlocker(ax,ay,bx,by,r,profile){return this.mask(profile)?.firstBlocker(ax,ay,bx,by,r)??null;}
  firstContact(ax,ay,bx,by,r,profile){return this.mask(profile)?.firstContact(ax,ay,bx,by,r)??null;}
  constrain(x,y,r,profile){return this.mask(profile)?.constrain(x,y,r)??{x,y,blocked:false};}
  step(ax,ay,x,y,r,profile,hooks){
    const mask=this.mask(profile);if(mask)return mask.step(ax,ay,x,y,r,hooks);
    return hooks?slideCircleContacts(ax,ay,x,y,r,{circleFree:()=>true,firstBlocker:()=>null,firstContact:()=>null,contacts:()=>[],...hooks}):{x,y,blocked:false};
  }
}
