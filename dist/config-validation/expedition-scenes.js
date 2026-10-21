const fail=path=>{throw new TypeError(`Invalid expedition scene configuration: ${path}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path);return value;};
const list=(value,path,min,max)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(path);return value;};
const number=(value,path,min,max)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path);return value;};
const text=(value,path)=>{if(typeof value!=='string'||!value.trim()||value.length>160)fail(path);return value;};
const id=(value,path)=>{if(typeof value!=='string'||!/^[a-z][a-z0-9:-]{0,95}$/.test(value))fail(path);return value;};
const integer=(value,path,min,max)=>{number(value,path,min,max);if(!Number.isSafeInteger(value))fail(path);return value;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function edgeDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function inside(p,points){
  let result=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];if(edgeDistance(p,a,b)<.01)return true;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }
  return result;
}
function point(value,path,bounds){object(value,path);number(value.x,path+'.x',bounds.minX,bounds.maxX);number(value.y,path+'.y',bounds.minY,bounds.maxY);return value;}
function polygon(value,path,bounds){
  const points=list(value,path,3,128);let area=0;
  for(let i=0;i<points.length;i++){
    const a=point(points[i],path+'.'+i,bounds),b=point(points[(i+1)%points.length],path+'.next',bounds);
    if(distance(a,b)<.01)fail(path+'.duplicate edge');area+=a.x*b.y-a.y*b.x;
  }
  if(Math.abs(area)<2)fail(path+'.area');
  for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
    if(i===0&&j===points.length-1)continue;
    const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
    if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)fail(path+'.self intersection');
    if(edgeDistance(c,a,b)<.01||edgeDistance(d,a,b)<.01||edgeDistance(a,c,d)<.01||edgeDistance(b,c,d)<.01)fail(path+'.touching edges');
  }
  return points;
}
function bodyFree(scene,p,r){
  if(!inside(p,scene.outline)||scene.outline.some((a,i)=>edgeDistance(p,a,scene.outline[(i+1)%scene.outline.length])<r-.01))return false;
  return !scene.solids.some(s=>inside(p,s.points)||s.points.some((a,i)=>edgeDistance(p,a,s.points[(i+1)%s.points.length])<r-.01));
}
function standing(scene,p,path,r=24){point(p,path,scene.bounds);if(!bodyFree(scene,p,r))fail(path+'.standing space');}
const strictlyInside=(p,ring)=>inside(p,ring)&&ring.every((a,i)=>edgeDistance(p,a,ring[(i+1)%ring.length])>.01);
function overlapping(a,b){
  if(Math.abs(a.x-b.x)>=(a.width+b.width)/2-.01||Math.abs(a.y-b.y)>=(a.depth+b.depth)/2-.01)return false;
  if(a.points.some(p=>strictlyInside(p,b.points))||b.points.some(p=>strictlyInside(p,a.points))||strictlyInside(a,b.points)||strictlyInside(b,a.points))return true;
  return a.points.some((p,i)=>b.points.some((q,j)=>{const next=a.points[(i+1)%a.points.length],other=b.points[(j+1)%b.points.length];return cross(p,next,q)*cross(p,next,other)<0&&cross(q,other,p)*cross(q,other,next)<0;}));
}

// Each scene owns one collision/art source. Runtime state and the current
// view are separate; there is no second single-map layout to fall back to.
export function validateExpeditionScenes(d,path,{enemyIds,pickupTypes}){
  if(d.worldMapId!=null||d.axis==='arena')fail(path+'.scene mode');
  for(const key of ['bounds','obstacles','paths','details','supplies'])if(Object.hasOwn(d,key))fail(path+'.duplicate '+key);
  const scenes=list(d.scenes,path+'.scenes',2,8),byId=new Map();
  for(const [i,scene]of scenes.entries()){
    const p=`${path}.scenes.${i}`;object(scene,p);id(scene.id,p+'.id');if(byId.has(scene.id))fail(p+'.duplicate id');byId.set(scene.id,scene);
    text(scene.name,p+'.name');if(!['deck','hold'].includes(scene.kind))fail(p+'.kind');
    const b=object(scene.bounds,p+'.bounds');for(const key of ['minX','maxX','minY','maxY'])number(b[key],p+'.bounds.'+key,-10000,10000);
    for(const length of [b.maxX-b.minX,b.maxY-b.minY])number(length,p+'.bounds.size',300,4096);
    polygon(scene.outline,p+'.outline',b);const solidIds=new Set();
    for(const [j,solid]of list(scene.solids,p+'.solids',0,64).entries()){
      const q=`${p}.solids.${j}`;object(solid,q);id(solid.id,q+'.id');if(solidIds.has(solid.id))fail(q+'.duplicate id');solidIds.add(solid.id);
      if(!['cabin','cargo','bulkhead','mast','capstan','barrels','bunks','charttable','shelf'].includes(solid.kind))fail(q+'.kind');
      point(solid,q,b);number(solid.width,q+'.width',8,1600);number(solid.depth,q+'.depth',8,1600);number(solid.height,q+'.height',1,400);
      number(solid.corner,q+'.corner',0,Math.min(solid.width,solid.depth)/2);if(!['high','low'].includes(solid.heightBand))fail(q+'.heightBand');
      polygon(solid.points,q+'.points',b);
      for(const [axis,size]of [['x','width'],['y','depth']]){
        const values=solid.points.map(p=>p[axis]);
        if(Math.abs(Math.min(...values)-(solid[axis]-solid[size]/2))>.1||Math.abs(Math.max(...values)-(solid[axis]+solid[size]/2))>.1)fail(q+'.footprint dimensions');
      }
      for(const [k,vertex]of solid.points.entries()){
        const next=solid.points[(k+1)%solid.points.length];
        if(!inside(vertex,scene.outline)||!inside({x:(vertex.x+next.x)/2,y:(vertex.y+next.y)/2},scene.outline))fail(q+'.outside outline');
      }
    }
    for(let a=0;a<scene.solids.length;a++)for(let b=a+1;b<scene.solids.length;b++)if(overlapping(scene.solids[a],scene.solids[b]))fail(p+'.overlapping solids');
    if(scene.obstacles!=null)list(scene.obstacles,p+'.obstacles',0,0);
    for(const [j,route]of list(scene.paths,p+'.paths',1,24).entries()){
      const q=`${p}.paths.${j}`;number(route.width,q+'.width',40,320);
      const points=list(route.points,q+'.points',2,64);
      for(const [k,vertex]of points.entries()){
        standing(scene,vertex,q+'.points.'+k,20);
        if(!k)continue;const a=points[k-1],steps=Math.ceil(distance(a,vertex)/20);
        for(let step=1;step<steps;step++){const t=step/steps,at={x:a.x+(vertex.x-a.x)*t,y:a.y+(vertex.y-a.y)*t};if(!bodyFree(scene,at,20))fail(`${q}.blocked route at ${Math.round(at.x)},${Math.round(at.y)}`);}
      }
    }
    for(const [j,detail]of list(scene.details,p+'.details',0,64).entries()){
      const q=`${p}.details.${j}`;if(!['hatch','rope','grate','scuff','lamp','rug'].includes(detail.kind))fail(q+'.kind');
      point(detail,q,b);number(detail.rx,q+'.rx',1,320);number(detail.ry,q+'.ry',1,320);
    }
    for(const [j,supply]of list(scene.supplies,p+'.supplies',0,16).entries()){
      const q=`${p}.supplies.${j}`;standing(scene,supply,q,20);if(!pickupTypes.includes(supply.drop))fail(q+'.drop');
    }
    list(scene.links,p+'.links',1,8);
  }
  const sceneFor=(value,p)=>{object(value,p);const scene=byId.get(value.sceneId);if(!scene)fail(p+'.sceneId');return scene;};
  standing(sceneFor(d.start,path+'.start'),d.start,path+'.start',40);
  number(d.exit?.r,path+'.exit.r',20,160);standing(sceneFor(d.exit,path+'.exit'),d.exit,path+'.exit',d.exit.r+20);
  const segments=list(d.segments,path+'.segments',1,8);
  for(const [i,segment]of segments.entries()){
    const p=`${path}.segments.${i}`,scene=sceneFor(segment,p);text(segment.name,p+'.name');standing(scene,segment.center,p+'.center',40);
    number(segment.triggerRadius,p+'.triggerRadius',40,1600);number(segment.healthMultiplier,p+'.healthMultiplier',.01,100);
    if(Object.hasOwn(segment,'gate'))fail(p+'.single-map gate');
    let count=0;
    for(const [type,n]of Object.entries(object(segment.enemies,p+'.enemies'))){if(type==='boss'||!enemyIds.has(type))fail(p+'.enemy');count+=integer(n,p+'.enemies.'+type,1,40);}
    if(count<1||count>60)fail(p+'.enemy count');
  }
  const linkIds=new Set();
  for(const scene of scenes)for(const link of scene.links){
    const p=`${path}.scenes.${scene.id}.links`;object(link,p);id(link.id,p+'.id');if(linkIds.has(link.id))fail(p+'.duplicate id');linkIds.add(link.id);
    if(!['stairs','door'].includes(link.kind))fail(p+'.kind');text(link.label,p+'.label');standing(scene,link,p,32);
    const target=byId.get(link.to);if(!target||target===scene)fail(p+'.to');standing(target,link.arrival,p+'.arrival',40);
    object(link.direction,p+'.direction');number(link.direction.x,p+'.direction.x',-1,1);number(link.direction.y,p+'.direction.y',-1,1);
    if(Math.abs(Math.hypot(link.direction.x,link.direction.y)-1)>.001)fail(p+'.direction.length');
    if(link.requiresSegment!=null)integer(link.requiresSegment,p+'.requiresSegment',0,segments.length-1);
    if(!target.links.some(other=>other.to===scene.id))fail(p+'.return link');
  }
  const reachable=(from,completed)=>{
    const reached=new Set([from]),queue=[from];
    for(const current of queue)for(const link of byId.get(current).links)if((link.requiresSegment==null||link.requiresSegment<completed)&&!reached.has(link.to)){reached.add(link.to);queue.push(link.to);}
    return reached;
  };
  for(const [i,segment]of segments.entries())if(!reachable(d.start.sceneId,i).has(segment.sceneId))fail(path+'.locked segment '+i);
  if(reachable(d.start.sceneId,segments.length).size!==scenes.length||!reachable(d.exit.sceneId,segments.length).has(d.start.sceneId))fail(path+'.disconnected scene graph');
  return true;
}
