import { COAST_RULES } from './placement-rules.js';
// Deterministic island outlines are shared by coast paint, collision, spawning
// and natural terrain generation. The radius varies smoothly: no hidden
// rectangular world wall and no narrow pixel-scale bays trapping a creature.
const TAU=Math.PI*2,COUNT=128,EPS=.025;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(n)=>{const value=Math.sin(n*127.1+41.7)*43758.5453;return value-Math.floor(value);};
function closest(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,d=dx*dx+dy*dy,t=d?clamp(((x-ax)*dx+(y-ay)*dy)/d,0,1):0;return {x:ax+dx*t,y:ay+dy*t};}
function distanceSq(x,y,ax,ay,bx,by){const p=closest(x,y,ax,ay,bx,by);return (x-p.x)**2+(y-p.y)**2;}
function segmentDistanceSq(ax,ay,bx,by,cx,cy,dx,dy){
  const ux=bx-ax,uy=by-ay,vx=dx-cx,vy=dy-cy,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10){const t=((cx-ax)*vy-(cy-ay)*vx)/den,s=((cx-ax)*uy-(cy-ay)*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
  return Math.min(distanceSq(ax,ay,cx,cy,dx,dy),distanceSq(bx,by,cx,cy,dx,dy),distanceSq(cx,cy,ax,ay,bx,by),distanceSq(dx,dy,ax,ay,bx,by));
}
export class Island {
  constructor({region='forest',seed=0}={}){
    this.region=['forest','marsh','ruins'].includes(region)?region:'forest';this.seed=Number.isFinite(seed)?Math.trunc(seed):0;
    this.worldId=['forest','marsh','ruins'].indexOf(this.region);this.shallowWidth=COAST_RULES.shallowWidth;this.routeRadius=80;
    const profile=this.region==='marsh'?{x:4450,y:3950,phase:1.6,bays:.14}:this.region==='ruins'?{x:4250,y:4050,phase:3.5,bays:.115}:{x:4350,y:4100,phase:.2,bays:.08};
    const phase=profile.phase+(hash(this.seed+11)-.5)*.36;
    this.points=Object.freeze(Array.from({length:COUNT},(_,i)=>{
      const a=i*TAU/COUNT,radial=.94+.075*Math.cos(a*2+phase)+profile.bays*Math.sin(a*3-phase)+.032*Math.sin(a*5+phase*2);
      const radius=profile.x*profile.y/Math.hypot(profile.y*Math.cos(a),profile.x*Math.sin(a));
      return Object.freeze({x:Math.cos(a)*radius*radial,y:Math.sin(a)*radius*radial});
    }));
    this.bounds=Object.freeze({minX:Math.min(...this.points.map(p=>p.x)),minY:Math.min(...this.points.map(p=>p.y)),maxX:Math.max(...this.points.map(p=>p.x)),maxY:Math.max(...this.points.map(p=>p.y))});
    this._edges=this.points.map((a,i)=>{const b=this.points[(i+1)%COUNT],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);return {a,b,nx:-dy/len,ny:dx/len};});
    this._innerRadius=Math.sqrt(Math.min(...this._edges.map(e=>distanceSq(0,0,e.a.x,e.a.y,e.b.x,e.b.y))));
    this._contours=new Map([[0,this.points]]);
    const rotate=this.worldId*.52+(hash(this.seed+19)-.5)*.16;
    const specs=[['merchant',.18,710,105],['supply',2.25,1050,125],['occupied',4.30,1730,225],['castle',2.80,2610,360],['hunt',.94,1830,280],['rescue',5.42,2060,240],['rune',3.73,2280,185],['rescue-warden',3.80,1120,240],['dogcamp',.25,1430,115],['owlroost',2.91,1570,240],['golemaltar',4.62,2630,270],['stonevault',.13,2830,240]];
    const destinations=[0,1,2].filter(id=>id!==this.worldId);specs.push([`portal:${destinations[0]}`,1.73,3050,310],[`portal:${destinations[1]}`,5.69,3150,310]);
    const plan={};for(const [key,angle,radius,r] of specs){const a=angle+rotate;let d=radius;while(d>500&&!this.isDry(Math.cos(a)*d,Math.sin(a)*d,r+100))d-=40;plan[key]=Object.freeze({x:Math.cos(a)*d,y:Math.sin(a)*d,r});}
    this.plan=Object.freeze(plan);this.routes=Object.freeze(Object.values(plan).map(p=>Object.freeze({ax:0,ay:0,bx:p.x,by:p.y+96,r:this.routeRadius})));
  }
  _inside(x,y){
    // All outlines are star-shaped around the origin, so one angular edge is
    // sufficient for point inclusion. Circular clearance still checks edges.
    if(x===0&&y===0)return true;
    const a=(Math.atan2(y,x)+TAU)%TAU,index=Math.floor(a/TAU*COUNT)%COUNT,e=this._edges[index];
    return (e.b.x-e.a.x)*(y-e.a.y)-(e.b.y-e.a.y)*(x-e.a.x)>=-1e-7;
  }
  _nearest(x,y){let best=Infinity,result=null;for(const e of this._edges){const q=closest(x,y,e.a.x,e.a.y,e.b.x,e.b.y),d=(q.x-x)**2+(q.y-y)**2;if(d<best){best=d;result={...q,nx:e.nx,ny:e.ny};}}return {...result,distance:Math.sqrt(best)};}
  contains(x,y,r=0){
    if(![x,y,r].every(Number.isFinite)||r<0)return false;
    if(Math.hypot(x,y)+r<=this._innerRadius)return true;
    const b=this.bounds;if(x-r<b.minX||x+r>b.maxX||y-r<b.minY||y+r>b.maxY||!this._inside(x,y))return false;
    return r===0||this._nearest(x,y).distance+1e-7>=r;
  }
  isDry(x,y,r=0){return this.contains(x,y,r+this.shallowWidth);}
  depthAt(x,y){if(!Number.isFinite(x)||!Number.isFinite(y))return 0;if(Math.hypot(x,y)+this.shallowWidth<=this._innerRadius)return 0;if(!this._inside(x,y))return 1;const t=clamp(1-this._nearest(x,y).distance/this.shallowWidth,0,1);return t*t*(3-2*t);}
  containsCapsule(ax,ay,bx,by,r=0,inset=0){
    if(![ax,ay,bx,by,r,inset].every(Number.isFinite)||r<0||inset<0)return false;
    const clearance=r+inset;if(!this.contains(ax,ay,clearance)||!this.contains(bx,by,clearance))return false;
    if(Math.max(Math.hypot(ax,ay),Math.hypot(bx,by))+clearance<=this._innerRadius)return true;
    return !this._edges.some(e=>segmentDistanceSq(ax,ay,bx,by,e.a.x,e.a.y,e.b.x,e.b.y)<(clearance+1e-7)**2);
  }
  constrain(x,y,r=0){
    if(this.contains(x,y,r))return {x,y,blocked:false};
    if(!Number.isFinite(x)||!Number.isFinite(y))return {x:0,y:0,blocked:true};
    let px=x,py=y;
    for(let i=0;i<8;i++){const q=this._nearest(px,py);px=q.x+q.nx*(r+EPS);py=q.y+q.ny*(r+EPS);if(this.contains(px,py,r))return {x:px,y:py,blocked:true};}
    // At a concave vertex several inward normals can disagree. The radial
    // fallback is deterministic and remains inside this star-shaped island.
    let lo=0,hi=1;for(let i=0;i<32;i++){const t=(lo+hi)*.5;if(this.contains(x*t,y*t,r+EPS))lo=t;else hi=t;}return {x:x*lo,y:y*lo,blocked:true};
  }
  contour(inset=0){
    const amount=Number.isFinite(inset)?inset:0;if(this._contours.has(amount))return this._contours.get(amount);
    const points=this.points.map((p,i)=>{const before=this._edges[(i+COUNT-1)%COUNT],after=this._edges[i],nx=before.nx+after.nx,ny=before.ny+after.ny,len=Math.hypot(nx,ny),dot=(nx/len)*after.nx+(ny/len)*after.ny;return Object.freeze({x:p.x+nx/len*amount/Math.max(.65,dot),y:p.y+ny/len*amount/Math.max(.65,dot)});});
    if(this._contours.size<12)this._contours.set(amount,Object.freeze(points));return points;
  }
  isReserved(x,y,r=0){return this.isReservedCapsule(x,y,x,y,r);}
  isReservedCapsule(ax,ay,bx,by,r=0){
    if(distanceSq(0,0,ax,ay,bx,by)<(260+r)**2)return true;
    if(Object.values(this.plan).some(p=>distanceSq(p.x,p.y,ax,ay,bx,by)<(p.r+r)**2))return true;
    return this.routes.some(p=>segmentDistanceSq(ax,ay,bx,by,p.ax,p.ay,p.bx,p.by)<(p.r+r)**2);
  }
  naturalCircleFree(x,y,r=0){return this.isDry(x,y,r)&&!this.isReserved(x,y,r);}
  naturalCapsuleFree(ax,ay,bx,by,r=0){return this.containsCapsule(ax,ay,bx,by,r,this.shallowWidth)&&!this.isReservedCapsule(ax,ay,bx,by,r);}
}
