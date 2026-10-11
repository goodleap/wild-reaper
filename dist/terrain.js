const CELL=520, TAU=Math.PI*2, EPS=.02;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};

export function groundOffset(entity,isPlayer=false) {
  if(isPlayer) return 19.8;
  const offsets={slime:[14,16],bat:[20,11],beetle:[18,18],brute:[23,26],boar:[20,22],spore:[18,20],boss:[41,49]};
  const [offset,radius]=offsets[entity.type]||[0,entity.r||1];
  return offset*(entity.r/radius);
}
function axis(o) {
  const length=o.type==='log'?o.halfLength:0,dx=Math.cos(o.angle||0)*length,dy=Math.sin(o.angle||0)*length;
  return {ax:o.x-dx,ay:o.y-dy,bx:o.x+dx,by:o.y+dy};
}
function pointOnSegment(x,y,ax,ay,bx,by) {
  const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?clamp(((x-ax)*dx+(y-ay)*dy)/l,0,1):0;
  return {x:ax+dx*t,y:ay+dy*t};
}
function pointDistanceSq(x,y,ax,ay,bx,by) {
  const q=pointOnSegment(x,y,ax,ay,bx,by);return (x-q.x)**2+(y-q.y)**2;
}
function segmentDistanceSq(ax,ay,bx,by,cx,cy,dx,dy) {
  const ux=bx-ax,uy=by-ay,vx=dx-cx,vy=dy-cy,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10) {
    const t=((cx-ax)*vy-(cy-ay)*vx)/den,s=((cx-ax)*uy-(cy-ay)*ux)/den;
    if(t>=0&&t<=1&&s>=0&&s<=1)return 0;
  }
  return Math.min(pointDistanceSq(ax,ay,cx,cy,dx,dy),pointDistanceSq(bx,by,cx,cy,dx,dy),pointDistanceSq(cx,cy,ax,ay,bx,by),pointDistanceSq(dx,dy,ax,ay,bx,by));
}
function obstacle(spec,index=0) {
  const o={id:spec.id??`fixed:${index}`,type:'rock',r:36,scale:1,seed:hash(index+37,19),angle:0,halfLength:0,...spec};
  if(o.type==='log'&&!spec.halfLength)o.halfLength=55;
  const a=axis(o);
  o.bounds=Object.freeze({minX:Math.min(a.ax,a.bx)-o.r,minY:Math.min(a.ay,a.by)-o.r,maxX:Math.max(a.ax,a.bx)+o.r,maxY:Math.max(a.ay,a.by)+o.r});
  o.sortY=spec.sortY??o.y;
  return Object.freeze(o);
}

export class Terrain {
  constructor({obstacles,cacheLimit=192}={}) {
    this.cacheLimit=Math.max(16,Math.min(512,cacheLimit));this._cache=new Map();
    this._fixed=obstacles===undefined?null:obstacles.map((o,i)=>obstacle(o,i));
  }
  get cacheSize(){return this._cache.size;}
  _cell(tx,ty) {
    const key=`${tx},${ty}`;
    if(this._cache.has(key)){const value=this._cache.get(key);this._cache.delete(key);this._cache.set(key,value);return value;}
    const items=[],n=hash(tx+31,ty+17);
    if(n>.62){const scale=.65+n*.4;items.push(obstacle({id:`tree:${key}`,type:'tree',x:tx*CELL+110,y:ty*CELL+50,r:24*scale,scale,seed:n}));}
    // One extra prop lives in the roomy opposite quarter of every cell.
    // Adjacent props retain a wide passage even for the largest enemy.
    const x=tx*CELL+240+hash(tx+71,ty+13)*90,y=ty*CELL+245+hash(tx+19,ty+81)*85,seed=hash(tx+41,ty+63);
    if(seed>.49)items.push(obstacle({id:`log:${key}`,type:'log',x,y,r:14+hash(tx+29,ty+47)*4,halfLength:48+seed*18,angle:hash(tx+83,ty+23)*TAU,scale:1,seed}));
    else{const r=31+seed*24;items.push(obstacle({id:`rock:${key}`,type:'rock',x,y,r,scale:r/36,seed}));}
    const clear=items.filter(o=>{const q=this.closestPoint(o,0,0);return Math.hypot(q.x,q.y)>190+o.r;});
    this._cache.set(key,clear);
    while(this._cache.size>this.cacheLimit)this._cache.delete(this._cache.keys().next().value);
    return clear;
  }
  query(minX,minY,maxX,maxY) {
    const intersects=o=>o.bounds.maxX>=minX&&o.bounds.minX<=maxX&&o.bounds.maxY>=minY&&o.bounds.minY<=maxY;
    if(this._fixed)return this._fixed.filter(intersects);
    const result=[];
    // A neighboring cell can own a long prop that crosses a query edge.
    for(let tx=Math.floor((minX-110)/CELL);tx<=Math.floor((maxX+110)/CELL);tx++)
      for(let ty=Math.floor((minY-110)/CELL);ty<=Math.floor((maxY+110)/CELL);ty++)
        for(const o of this._cell(tx,ty))if(intersects(o))result.push(o);
    return result;
  }
  closestPoint(o,x,y) {const a=axis(o);return pointOnSegment(x,y,a.ax,a.ay,a.bx,a.by);}
  isFree(x,y,r=0) {
    return !this.query(x-r,y-r,x+r,y+r).some(o=>{const q=this.closestPoint(o,x,y);return (x-q.x)**2+(y-q.y)**2<(r+o.r-.001)**2;});
  }
  _resolve(x,y,r,items,fromX=x,fromY=y) {
    let blocked=false;
    for(let pass=0;pass<6;pass++) {
      let hit=false;
      for(const o of items) {
        const q=this.closestPoint(o,x,y),dx=x-q.x,dy=y-q.y,d=Math.hypot(dx,dy),required=r+o.r;
        if(d>=required)continue;
        let nx,ny;
        if(d>1e-8){nx=dx/d;ny=dy/d;}
        else {
          const previous=this.closestPoint(o,fromX,fromY),px=fromX-previous.x,py=fromY-previous.y,pd=Math.hypot(px,py);
          if(pd>1e-8){nx=px/pd;ny=py/pd;}
          else{const a=o.type==='log'?o.angle+Math.PI/2:o.seed*TAU;nx=Math.cos(a);ny=Math.sin(a);}
        }
        x=q.x+nx*(required+EPS);y=q.y+ny*(required+EPS);blocked=hit=true;
      }
      if(!hit)break;
    }
    return {x,y,blocked};
  }
  resolveCircle(x,y,r) {
    if(this.isFree(x,y,r))return {x,y,blocked:false};
    const originalX=x,originalY=y;let blocked=false;
    for(let pass=0;pass<8;pass++) {
      const resolved=this._resolve(x,y,r,this.query(x-r-110,y-r-110,x+r+110,y+r+110));
      x=resolved.x;y=resolved.y;blocked||=resolved.blocked;
      if(this.isFree(x,y,r))return {x,y,blocked};
    }
    // Only relevant to overlapping injected obstacles; procedural props are sparse.
    for(let radius=24;radius<=1024;radius+=24)for(let i=0;i<24;i++){
      const a=i*TAU/24,nx=originalX+Math.cos(a)*radius,ny=originalY+Math.sin(a)*radius;
      if(this.isFree(nx,ny,r))return {x:nx,y:ny,blocked:true};
    }
    return {x,y,blocked};
  }
  moveCircle(x,y,dx,dy,r) {
    const start=this.resolveCircle(x,y,r);x=start.x;y=start.y;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/Math.max(3,Math.min(6,r*.45))));
    const sx=dx/steps,sy=dy/steps;let blocked=start.blocked;
    const items=this.query(Math.min(x,x+dx)-r-110,Math.min(y,y+dy)-r-110,Math.max(x,x+dx)+r+110,Math.max(y,y+dy)+r+110);
    if(!items.length)return {x:x+dx,y:y+dy,blocked};
    for(let i=0;i<steps;i++) {
      const next=this._resolve(x+sx,y+sy,r,items,x,y);blocked||=next.blocked;
      if(!items.some(o=>{const q=this.closestPoint(o,next.x,next.y);return Math.hypot(next.x-q.x,next.y-q.y)<r+o.r-.001;})){x=next.x;y=next.y;}
      else blocked=true;
    }
    return {x,y,blocked};
  }
  firstBlocker(x1,y1,x2,y2,r=0) {
    let found=null,best=Infinity;const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy||1;
    for(const o of this.query(Math.min(x1,x2)-r,Math.min(y1,y2)-r,Math.max(x1,x2)+r,Math.max(y1,y2)+r)) {
      const a=axis(o),rr=r+o.r;
      if(segmentDistanceSq(x1,y1,x2,y2,a.ax,a.ay,a.bx,a.by)<rr*rr) {
        const t=clamp(((o.x-x1)*dx+(o.y-y1)*dy)/length,0,1);
        if(t<best){best=t;found=o;}
      }
    }
    return found;
  }
}
