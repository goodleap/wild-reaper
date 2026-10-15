// Fixed world boundaries are baked offline. Spatially indexed outline edges
// define solid landforms; individual decorative trees never seal the world.
const CELL=384,EPS=.025;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=(x,y)=>`${x},${y}`;
function nearest(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?clamp(((x-a.x)*dx+(y-a.y)*dy)/d,0,1):0;return {x:a.x+dx*t,y:a.y+dy*t};}
function distanceSq(x,y,a,b){const q=nearest(x,y,a,b);return (q.x-x)**2+(q.y-y)**2;}
function segmentDistanceSq(a,b,c,d){
  const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10){const t=((c.x-a.x)*vy-(c.y-a.y)*vx)/den,s=((c.x-a.x)*uy-(c.y-a.y)*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
  return Math.min(distanceSq(a.x,a.y,c,d),distanceSq(b.x,b.y,c,d),distanceSq(c.x,c.y,a,b),distanceSq(d.x,d.y,a,b));
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
  step(fromX,fromY,x,y,r){
    if(this.circleFree(x,y,r)&&!this.firstBlocker(fromX,fromY,x,y,r))return {x,y,blocked:false};
    const dx=x-fromX,dy=y-fromY,travel=Math.hypot(dx,dy),nearestEdge=this.nearest(x,y,r+travel+4)?.edge;
    const candidates=[];
    if(nearestEdge){const dot=dx*nearestEdge.nx+dy*nearestEdge.ny;candidates.push({x:fromX+dx-nearestEdge.nx*Math.min(0,dot),y:fromY+dy-nearestEdge.ny*Math.min(0,dot)});}
    candidates.push({x,y:fromY},{x:fromX,y});
    candidates.sort((a,b)=>Math.hypot(b.x-fromX,b.y-fromY)-Math.hypot(a.x-fromX,a.y-fromY));
    for(const p of candidates)if(Math.hypot(p.x-fromX,p.y-fromY)<=travel+.001&&this.circleFree(p.x,p.y,r)&&!this.firstBlocker(fromX,fromY,p.x,p.y,r))return {...p,blocked:true};
    return {x:fromX,y:fromY,blocked:true};
  }
}
export class RiftCollision{
  constructor(layout){this.ground=new BoundaryMask(layout.boundaries,'ground');this.high=new BoundaryMask(layout.solidBoundaries??layout.boundaries,'high');}
  mask(profile='ground'){return ['air','projectile','sight'].includes(profile)?this.high:profile==='overhead'?null:this.ground;}
  circleFree(x,y,r,profile){return this.mask(profile)?.circleFree(x,y,r)??true;}
  firstBlocker(ax,ay,bx,by,r,profile){return this.mask(profile)?.firstBlocker(ax,ay,bx,by,r)??null;}
  constrain(x,y,r,profile){return this.mask(profile)?.constrain(x,y,r)??{x,y,blocked:false};}
  step(ax,ay,x,y,r,profile){return this.mask(profile)?.step(ax,ay,x,y,r)??{x,y,blocked:false};}
}
