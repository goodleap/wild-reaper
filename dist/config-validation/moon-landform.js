const fail=path=>{throw new TypeError(`Invalid world configuration: ${path}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path);return value;};
const list=(value,path,min,max)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(path);return value;};
const number=(value,path,min,max)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path);return value;};
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function edgeDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function inside(p,ring){
  let hit=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];if(edgeDistance(p,a,b)<.01)return true;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }
  return hit;
}
function point(p,path,b){object(p,path);number(p.x,path+'.x',b.minX,b.maxX);number(p.y,path+'.y',b.minY,b.maxY);return p;}
function polygon(ring,path,b,max){
  list(ring,path,3,max);let area=0;
  for(let i=0;i<ring.length;i++){
    const a=point(ring[i],`${path}.${i}`,b),c=point(ring[(i+1)%ring.length],path+'.next',b);
    if(distance(a,c)<.01)fail(path+'.duplicate edge');area+=a.x*c.y-a.y*c.x;
  }
  if(Math.abs(area)<2)fail(path+'.area');
  for(let i=0;i<ring.length;i++)for(let j=i+2;j<ring.length;j++){
    if(i===0&&j===ring.length-1)continue;
    const a=ring[i],b=ring[(i+1)%ring.length],c=ring[j],d=ring[(j+1)%ring.length];
    if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)fail(path+'.self intersection');
    if(edgeDistance(c,a,b)<.01||edgeDistance(d,a,b)<.01||edgeDistance(a,c,d)<.01||edgeDistance(b,c,d)<.01)fail(path+'.touching edges');
  }
}
const strictlyInside=(p,ring)=>inside(p,ring)&&ring.every((a,i)=>edgeDistance(p,a,ring[(i+1)%ring.length])>.01);
function overlap(a,b){
  if(Math.abs(a.x-b.x)>=(a.width+b.width)/2-.01||Math.abs(a.y-b.y)>=(a.depth+b.depth)/2-.01)return false;
  if(a.points.some(p=>strictlyInside(p,b.points))||b.points.some(p=>strictlyInside(p,a.points)))return true;
  if(strictlyInside(a,a.points)&&strictlyInside(a,b.points)||strictlyInside(b,b.points)&&strictlyInside(b,a.points))return true;
  for(const [ring,other]of [[a.points,b.points],[b.points,a.points]])for(let i=0;i<ring.length;i++){
    const p=ring[i],q=ring[(i+1)%ring.length],mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
    if(strictlyInside(mid,other))return true;
  }
  const onBoundary=(p,ring)=>ring.some((q,i)=>edgeDistance(p,q,ring[(i+1)%ring.length])<.01);
  if(a.points.every(p=>onBoundary(p,b.points))&&b.points.every(p=>onBoundary(p,a.points)))return true;
  return a.points.some((p,i)=>b.points.some((q,j)=>{const next=a.points[(i+1)%a.points.length],other=b.points[(j+1)%b.points.length];return cross(p,next,q)*cross(p,next,other)<0&&cross(q,other,p)*cross(q,other,next)<0;}));
}
function bodyFree(land,p,r){
  if(!inside(p,land.outline)||land.outline.some((a,i)=>edgeDistance(p,a,land.outline[(i+1)%land.outline.length])<r-.01))return false;
  return !land.solids.some(s=>inside(p,s.points)||s.points.some((a,i)=>edgeDistance(p,a,s.points[(i+1)%s.points.length])<r-.01));
}
function standing(land,p,path,b,r=24){point(p,path,b);if(!bodyFree(land,p,r))fail(path+'.standing space');}
function gateCoverage(land,segment,path,b){
  const span=object(segment.gateSpan,path+'.gateSpan'),y=segment.gate;
  number(span.minX,path+'.gateSpan.minX',b.minX,b.maxX);number(span.maxX,path+'.gateSpan.maxX',b.minX,b.maxX);
  if(span.maxX-span.minX<64)fail(path+'.gateSpan.width');
  // Intersect the exact collision rings, rather than estimating the opening
  // from the terrain's bounding box or a few points along the visible gate.
  const cuts=[b.minX,b.maxX];
  for(const ring of [land.outline,...land.solids.map(s=>s.points)])for(let i=0;i<ring.length;i++){
    const a=ring[i],c=ring[(i+1)%ring.length];
    if(Math.abs(a.y-y)<.001)cuts.push(a.x);
    if((a.y>y)!==(c.y>y))cuts.push(a.x+(c.x-a.x)*(y-a.y)/(c.y-a.y));
  }
  cuts.sort((a,c)=>a-c);let open=false;
  for(let i=1;i<cuts.length;i++){
    const left=cuts[i-1],right=cuts[i];if(right-left<.01)continue;
    const mid={x:(left+right)/2,y};if(!inside(mid,land.outline)||land.solids.some(s=>inside(mid,s.points)))continue;
    open=true;if(left<span.minX-.1||right>span.maxX+.1)fail(path+'.gateSpan does not seal opening');
  }
  if(!open)fail(path+'.gateSpan has no passage');
}

// Authored contours own the lunar floor, physical obstacles and map drawing.
// Validate the full route before either the client or the server accepts it.
export function validateMoonLandform(d,path){
  if(d.id!=='moon'||d.axis!=='y'||d.worldMapId!=null||d.scenes!=null)fail(path+'.landform mode');
  list(d.obstacles,path+'.obstacles',0,0);const b=d.bounds,land=object(d.landform,path+'.landform');
  polygon(land.outline,path+'.landform.outline',b,512);const ids=new Set();
  for(const [i,s]of list(land.solids,path+'.landform.solids',1,96).entries()){
    const p=`${path}.landform.solids.${i}`;object(s,p);
    if(typeof s.id!=='string'||!s.id||s.id.length>96||ids.has(s.id))fail(p+'.id');ids.add(s.id);
    if(!['ridge','crater','wreck','equipment'].includes(s.kind))fail(p+'.kind');
    point(s,p,b);number(s.width,p+'.width',8,2400);number(s.depth,p+'.depth',8,2400);number(s.height,p+'.height',1,400);
    number(s.seed,p+'.seed',0,2147483647);if(!['high','low'].includes(s.heightBand))fail(p+'.heightBand');
    polygon(s.points,p+'.points',b,128);
    for(const [axis,size]of [['x','width'],['y','depth']]){
      const values=s.points.map(v=>v[axis]);
      if(Math.abs(Math.min(...values)-(s[axis]-s[size]/2))>.1||Math.abs(Math.max(...values)-(s[axis]+s[size]/2))>.1)fail(p+'.footprint dimensions');
    }
    for(let j=0;j<s.points.length;j++){
      const a=s.points[j],c=s.points[(j+1)%s.points.length],n=Math.ceil(distance(a,c)/16);
      for(let k=0;k<=n;k++)if(!inside({x:a.x+(c.x-a.x)*k/n,y:a.y+(c.y-a.y)*k/n},land.outline))fail(p+'.outside outline');
    }
  }
  for(let a=0;a<land.solids.length;a++)for(let c=a+1;c<land.solids.length;c++)if(overlap(land.solids[a],land.solids[c]))fail(path+'.landform overlapping solids');
  standing(land,d.start,path+'.start',b,40);standing(land,d.exit,path+'.exit',b,d.exit.r+20);
  for(const [i,s]of list(d.supplies,path+'.supplies',0,12).entries())standing(land,s,`${path}.supplies.${i}`,b);
  list(d.paths,path+'.paths',1,24);
  for(const [i,route]of d.paths.entries())for(let j=0;j<route.points.length;j++){
    const c=route.points[j],p=`${path}.paths.${i}.points.${j}`;standing(land,c,p,b);
    if(!j)continue;const a=route.points[j-1],n=Math.ceil(distance(a,c)/16);
    for(let k=1;k<n;k++)if(!bodyFree(land,{x:a.x+(c.x-a.x)*k/n,y:a.y+(c.y-a.y)*k/n},24))fail(p+'.blocked route');
  }
  for(const [i,s]of d.segments.entries()){
    standing(land,s.center,`${path}.segments.${i}.center`,b,40);gateCoverage(land,s,`${path}.segments.${i}`,b);
  }
  return true;
}
