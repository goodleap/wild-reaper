import { getConfigSection } from '../content-config.js';
import { getWaterContours, waterIntersectsCircle, waterIntersectsCapsule } from '../water-geometry.js';
import { groundFootprint, surfaceAllows } from '../placement-rules.js';

const TAU=Math.PI*2;
const hash=n=>{const x=Math.sin(n*127.1+41.7)*43758.5453;return x-Math.floor(x);};
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
export function pointSegmentDistance(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l)):0;return Math.hypot(x-ax-dx*t,y-ay-dy*t);}
function segmentDistance(a,b){
  const ux=a.bx-a.ax,uy=a.by-a.ay,vx=b.bx-b.ax,vy=b.by-b.ay,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10){const t=((b.ax-a.ax)*vy-(b.ay-a.ay)*vx)/den,s=((b.ax-a.ax)*uy-(b.ay-a.ay)*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
  return Math.min(pointSegmentDistance(a.ax,a.ay,b.ax,b.ay,b.bx,b.by),pointSegmentDistance(a.bx,a.by,b.ax,b.ay,b.bx,b.by),pointSegmentDistance(b.ax,b.ay,a.ax,a.ay,a.bx,a.by),pointSegmentDistance(b.bx,b.by,a.ax,a.ay,a.bx,a.by));
}
export function patchContains(p,x,y,inset=0){const dx=x-p.x,dy=y-p.y,c=Math.cos(p.angle||0),s=Math.sin(p.angle||0),rx=p.rx-inset,ry=p.ry-inset;return rx>0&&ry>0&&((dx*c+dy*s)/rx)**2+((-dx*s+dy*c)/ry)**2<=1;}
export function layoutCleared(layout,x,y,r=0){return layout?.clearings.some(p=>Math.hypot(x-p.x,y-p.y)<p.r+r)||false;}
export function layoutWet(layout,ax,ay,bx,by,r=0){return layout?.lakes.some(m=>waterIntersectsCapsule(m,ax,ay,bx,by,r))||false;}

// Layout creation runs once per island. Every consumer receives the same
// permanent geometry; loading cells in a different order cannot move a road.
export function createWorldLayout(island,plan){
  const world=getConfigSection('worlds').definitions.find(w=>w.id===island.region),recipe=world?.layout;if(!recipe)return null;
  const theme=world.authored?.artTheme??island.region;
  const sx=island.profile.x/4000,sy=island.profile.y/4000,scale=Math.min(sx,sy),seed=island.seed,region=island.region;
  const point=([x,y])=>({x:x*sx,y:y*sy});
  const routes=[],nodes=[],clearings=[],lakes=[],patches=[],obstacles=[];
  const addNode=p=>{const old=nodes.find(q=>Math.hypot(p.x-q.x,p.y-q.y)<1);if(old)return old;nodes.push(p);return p;};
  const segment=(a,b,kind='main',radius=100)=>{
    if(Math.hypot(a.x-b.x,a.y-b.y)<1)return;
    if(!island.containsCapsule(a.x,a.y,b.x,b.y,radius+20)){
      // The radial coast remains star-shaped. A dry central leg provides a
      // deterministic fallback for an authored branch near a deep coastal bay.
      if(Math.hypot(a.x,a.y)>1&&Math.hypot(b.x,b.y)>1){segment(a,{x:0,y:0},kind,radius);segment({x:0,y:0},b,kind,radius);}return;
    }
    routes.push({id:`route:${region}:${routes.length}`,kind,ax:a.x,ay:a.y,bx:b.x,by:b.y,r:radius});addNode(a);addNode(b);
  };
  for(const path of recipe.paths){const points=path.map(point);for(let i=1;i<points.length;i++)segment(points[i-1],points[i]);}
  addNode({x:0,y:0});
  // Site and portal anchors are unchanged. Their last leg always approaches
  // the front, preserving doors, guardian arenas and stored map identities.
  for(const [key,p]of Object.entries(plan)){
    const end={x:p.x,y:p.y+96},nearest=[...nodes].sort((a,b)=>Math.hypot(a.x-end.x,a.y-end.y)-Math.hypot(b.x-end.x,b.y-end.y)).find(n=>island.containsCapsule(n.x,n.y,end.x,end.y,120));
    segment(nearest||{x:0,y:0},end,'main',100);
  }
  const reserved=(x,y,r)=>Math.hypot(x,y)<300+r||Object.values(plan).some(p=>Math.hypot(x-p.x,y-p.y)<r+p.r+55);
  const canClear=(p,r)=>island.isDry(p.x,p.y,r+75)&&!reserved(p.x,p.y,r)&&clearings.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>r+q.r+90);
  const candidates=[];
  for(const [i,p]of nodes.entries())for(const side of [-1,1]){const a=(i*2.3999632297+seed*.07);candidates.push({x:p.x+Math.cos(a)*330*side,y:p.y+Math.sin(a)*330*side});}
  // Route-facing clearings are selected first; the bounded staggered fallback
  // fills only unused land and differs with the authored network in each world.
  for(let gy=-5;gy<=5;gy++)for(let gx=-5;gx<=5;gx++)candidates.push({x:(gx*620+(gy%2)*290)*sx,y:gy*590*sy});
  const distanceToRoad=p=>Math.min(...routes.map(r=>pointSegmentDistance(p.x,p.y,r.ax,r.ay,r.bx,r.by)));
  const bossCandidates=[...candidates].filter(p=>Math.hypot(p.x,p.y)>2000*scale&&canClear(p,340)).sort((a,b)=>Math.abs(distanceToRoad(a)-360)-Math.abs(distanceToRoad(b)-360));
  if(bossCandidates[0])clearings.push({id:`clearing:${region}:boss`,...bossCandidates[0],r:340,kind:'boss',tier:4,bossKind:recipe.bossKind});
  const ordered=[...candidates].sort((a,b)=>distanceToRoad(a)-distanceToRoad(b)||Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y));
  for(const p of ordered){
    if(clearings.filter(c=>c.kind!=='boss').length>=17)break;
    const r=225;if(!canClear(p,r))continue;const i=clearings.length,kind=i<=2?'guard':'combat';
    clearings.push({id:`clearing:${region}:${i}`,x:p.x,y:p.y,r,kind,tier:Math.min(4,Math.floor(Math.hypot(p.x,p.y)/800))});
  }
  // Two optional pockets sit off the busiest roads and carry no forced fight.
  for(const p of [...candidates].sort((a,b)=>distanceToRoad(b)-distanceToRoad(a))){if(clearings.filter(c=>c.kind==='secret').length>=2)break;if(canClear(p,170))clearings.push({id:`clearing:${region}:secret:${clearings.length}`,x:p.x,y:p.y,r:170,kind:'secret',tier:2});}
  for(const c of clearings){const nearest=[...nodes].sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y)).find(n=>island.containsCapsule(n.x,n.y,c.x,c.y,90));if(nearest)segment(nearest,c,'trail',70);}
  const routeClear=m=>!routes.some(p=>waterIntersectsCapsule(m,p.ax,p.ay,p.bx,p.by,p.r+28));
  for(const [i,spec]of recipe.lakes.entries()){
    const [xx,yy,rx,ry,angle,shape]=spec,origin=point([xx,yy]);let chosen=null;
    for(const shrink of [1,.85,.7]){for(let attempt=0;attempt<49;attempt++){
      const a=attempt*2.3999632297+hash(seed+i)*TAU,d=attempt?120*Math.sqrt(attempt):0;
      const m={id:`layout-lake:${region}:${i}`,type:'mud',kind:theme==='ember'?'lava':'water',x:origin.x+Math.cos(a)*d,y:origin.y+Math.sin(a)*d,rx:rx*sx*shrink,ry:ry*sy*shrink,angle,shape,seed:hash(seed*17+i+291),scale:rx*sx*shrink/80,deep:true,layout:true};
      const ring=getWaterContours(m).outer;
      if(!ring.every(p=>island.isDry(p.x,p.y,70))||waterIntersectsCircle(m,0,0,340)||Object.values(plan).some(p=>waterIntersectsCircle(m,p.x,p.y,p.r+50))||clearings.some(p=>waterIntersectsCircle(m,p.x,p.y,p.r+30))||!routeClear(m)||lakes.some(p=>Math.hypot(m.x-p.x,m.y-p.y)<Math.max(m.rx,m.ry)+Math.max(p.rx,p.ry)+90))continue;
      chosen=m;break;
    }if(chosen)break;}if(chosen)lakes.push(chosen);
  }
  for(const [i,[kind,x,y,rx,ry,angle,density=1]]of recipe.patches.entries())patches.push({id:`patch:${region}:${i}`,kind,...point([x,y]),rx:rx*sx,ry:ry*sy,angle,density,seed:hash(seed*13+i+71)});
  const layout={id:`layout:${region}:${seed}`,routes,patches,lakes,clearings,encounters:clearings.filter(c=>c.kind!=='secret').sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y)),obstacles};
  const clearObstacle=o=>{
    const f=groundFootprint(o);
    if(!surfaceAllows(island,'debris',f)||pointSegmentDistance(0,0,f.ax,f.ay,f.bx,f.by)<300+f.r)return false;
    if([...Object.values(plan),...clearings].some(p=>pointSegmentDistance(p.x,p.y,f.ax,f.ay,f.bx,f.by)<p.r+f.r+20)||layoutWet(layout,f.ax,f.ay,f.bx,f.by,f.r+15))return false;
    return !routes.some(p=>segmentDistance(f,p)<p.r+f.r+20);
  };
  for(const [index,line]of recipe.ridges.entries()){
    const values=Array.isArray(line[0])?line.flat():line,a=point(values.slice(0,2)),b=point(values.slice(2)),length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.ceil(length/135),angle=Math.atan2(b.y-a.y,b.x-a.x);
    for(let i=0;i<steps;i++){
      const t=(i+.5)/steps,o={id:`layout-ridge:${region}:${index}:${i}`,type:'log',variant:['city','ruins'].includes(theme)?'world-city-wall':'world-ridge',region,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,halfLength:length/steps*.52,r:theme==='ruins'?25:36,angle,scale:1,seed:hash(index*17+i+seed)};
      if(clearObstacle(o))obstacles.push(o);
    }
  }
  if(theme==='city')for(const [pi,p]of patches.entries())if(p.kind==='city')for(let row=-1;row<=1;row++)for(let col=-1;col<=1;col++){
    const o={id:`layout-block:${pi}:${row}:${col}`,type:'log',variant:'world-building',region,x:p.x+col*160,y:p.y+row*180,halfLength:68,r:42,angle:0,scale:1,seed:hash(pi*19+row*3+col+seed)};if(clearObstacle(o))obstacles.push(o);
  }
  return freeze(layout);
}

// Dense woodland uses a triangular lattice: every interior gap is narrower
// than a player body. Tree trunks remain the physical barriers, with their
// existing canopy fading, depth and projectile rules intact.
export function layoutTerrainCell({layout,tx,ty,cell,region,seed,add}){
  if(!layout)return;
  const theme=getConfigSection('worlds').definitions.find(w=>w.id===region)?.authored?.artTheme??region;
  const forests=layout.patches.filter(p=>p.kind==='forest'),step=70,rowStep=step*Math.sqrt(3)/2;
  const minX=tx*cell,maxX=minX+cell,minY=ty*cell,maxY=minY+cell;
  for(let gy=Math.floor(minY/rowStep);gy<=Math.floor(maxY/rowStep);gy++)for(let gx=Math.floor((minX-35)/step);gx<=Math.floor((maxX+35)/step);gx++){
    const x=gx*step+(Math.abs(gy)%2)*35,y=gy*rowStep;if(x<minX||x>=maxX||y<minY||y>=maxY)continue;
    const p=forests.find(p=>patchContains(p,x,y));if(!p)continue;
    const n=hash(gx*13+gy*31+seed*17);if(p.density<1&&(n>p.density*.32||gx%2||gy%2))continue;
    const dense=p.density>=1,variant=theme==='marsh'?'dead-tree':theme==='beach'?'world-palm':theme==='snow'?'world-snowpine':theme==='ember'?'world-charred':theme==='mountain'||theme==='city'?'world-pine':undefined;
    add({id:`wood:${region}:${gx}:${gy}`,region,zone:p.id,type:'tree',variant,x,y,r:dense?28.5:20,scale:dense?1.22+n*.12:.9+n*.2,seed:n,treeForm:Math.floor(n*5),crownWidth:1.03,crownHeight:1,angle:0,halfLength:0,layoutPatch:p.id});
  }
}
