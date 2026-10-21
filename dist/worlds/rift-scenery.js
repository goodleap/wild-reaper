import { riftPointInPolygon } from '../rift-collision.js';
import { createCityScenery } from './city-scenery.js';
import { createEmberScenery } from './ember-scenery.js';

const TAU=Math.PI*2;
const hash=n=>{const value=Math.sin(n*127.1+41.7)*43758.5453;return value-Math.floor(value);};
const identity=text=>[...String(text)].reduce((value,char)=>(Math.imul(value,31)+char.charCodeAt(0))>>>0,17);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rocks=new Set(['quarry','ravine','pass']);
const ruins=new Set(['ruins','fortress','village']);
const sceneryCache=new WeakMap();
function footprint(prop){
  const length=prop.type==='log'?prop.halfLength:0,dx=Math.cos(prop.angle||0)*length,dy=Math.sin(prop.angle||0)*length;
  return {ax:prop.x-dx,ay:prop.y-dy,bx:prop.x+dx,by:prop.y+dy,r:prop.r};
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function separated(prop,placed,clearance=55){
  const f=footprint(prop),a={x:f.ax,y:f.ay},b={x:f.bx,y:f.by};
  return placed.every(other=>{
    const q=footprint(other),c={x:q.ax,y:q.ay},d={x:q.bx,y:q.by};
    return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b))>=prop.r+other.r+clearance;
  });
}

// The fixed world keeps repeatable local groups independently of terrain-cell
// load order. Paths, event arenas and entrances remain the authored authority.
export function createRiftScenery(layout,collision,island){
  if(layout.artTheme==='city')return createCityScenery(layout,collision,island);
  if(layout.artTheme==='ember')return createEmberScenery(layout);
  if(sceneryCache.has(layout))return sceneryCache.get(layout);
  const marsh=layout.artTheme==='marsh',props=[],solid=[];
  const themed=prop=>{
    if(!marsh)return prop;
    prop.region='marsh';
    if(prop.type==='tree'&&!prop.riftShrub&&hash(identity(prop.id)+19)<.46){
      prop.variant='dead-tree';prop.r=Math.min(prop.r,11*(prop.scale||1)*[1.08,.74,.92,.58,1.22][prop.treeForm||0]);
    }else if(prop.type==='rock')prop.variant='moss-rock';
    else if(prop.type==='log')prop.variant='sunken-log';
    return prop;
  };
  const safe=(prop,area)=>{
    const f=footprint(prop),clearance=f.r+55;
    if(island.isReservedCapsule(f.ax,f.ay,f.bx,f.by,f.r+26))return false;
    for(const p of [{x:f.ax,y:f.ay},{x:f.bx,y:f.by},prop]){
      if(area&&!riftPointInPolygon(p,area.points)||!collision.circleFree(p.x,p.y,clearance,'ground'))return false;
    }
    if(collision.firstBlocker(f.ax,f.ay,f.bx,f.by,clearance,'ground'))return false;
    // Graph anchors also serve as follower destinations, even in a clearing
    // without an encounter. Leave a full standing disk around each one.
    if(layout.areas.some(a=>pointSegmentDistance(a.center,{x:f.ax,y:f.ay},{x:f.bx,y:f.by})<90+f.r))return false;
    if(Object.values(layout.landmarks).some(p=>pointSegmentDistance(p,{x:f.ax,y:f.ay},{x:f.bx,y:f.by})<110+f.r))return false;
    return separated(prop,solid);
  };
  const add=(prop,area)=>{themed(prop);if(!safe(prop,area))return false;solid.push(prop);props.push(prop);return true;};

  // The sparse groves retain room between roots. Raised crowns can overlap,
  // while every trunk still leaves a full-body route around its neighbors.
  for(const [index,patch] of layout.patches.entries()){
    const minX=Math.min(...patch.points.map(p=>p.x)),maxX=Math.max(...patch.points.map(p=>p.x)),minY=Math.min(...patch.points.map(p=>p.y)),maxY=Math.max(...patch.points.map(p=>p.y));
    let count=0;
    for(let attempt=0;attempt<200&&count<6;attempt++){
      const seed=identity(patch.id)+attempt*37,x=minX+hash(seed)*(maxX-minX),y=minY+hash(seed+13)*(maxY-minY);
      if(!riftPointInPolygon({x,y},patch.points))continue;
      const prop={id:`rift-sparse:${index}:${count}`,type:'tree',x,y,r:12,scale:.74+hash(seed+7)*.15,treeForm:count%5,seed:hash(seed+3),riftPalette:true,layoutPatch:patch.id};
      if(add(prop))count++;
    }
  }

  for(const area of layout.areas){
    const seed=identity(area.id),stone=rocks.has(area.kind),masonry=ruins.has(area.kind),bounds={minX:Math.min(...area.points.map(p=>p.x)),maxX:Math.max(...area.points.map(p=>p.x)),minY:Math.min(...area.points.map(p=>p.y)),maxY:Math.max(...area.points.map(p=>p.y))};
    const target=area.kind==='quarry'?5:area.kind==='grove'?(marsh?5:3):(marsh?3:2);let groups=0;
    for(let attempt=0;attempt<130&&groups<target;attempt++){
      const n=seed+attempt*43,x=bounds.minX+hash(n)*(bounds.maxX-bounds.minX),y=bounds.minY+hash(n+17)*(bounds.maxY-bounds.minY),angle=masonry?(hash(n+8)<.5?0:Math.PI/2):hash(n+5)*TAU,c=Math.cos(angle),s=Math.sin(angle);
      // Broken arcs are small local detours, never a second wall spanning a
      // region. The long entrances and the large navigation graph stay open.
      const pieces=masonry?[[-65,0,'wall'],[62,50,'rock'],[-48,95,'shrub']]:stone?[[-65,-15,'rock'],[28,-45,'rock'],[88,30,'rock'],[-20,75,'shrub']]:marsh?[[-65,-15,'tree'],[24,-55,'tree'],[90,43,'log'],[-12,80,'shrub']]:[[-65,-15,'tree'],[24,-55,'tree'],[85,35,'shrub'],[-12,80,'shrub']];
      const group=[];
      for(const [i,[dx,dy,kind]] of pieces.entries()){
        const q=n+i*19,scale=.76+hash(q+11)*.2,long=kind==='wall'||kind==='log',prop={id:`rift-group:${area.id}:${groups}:${i}`,type:long?'log':kind==='rock'?'rock':'tree',x:x+dx*c-dy*s,y:y+dx*s+dy*c,r:long?19:kind==='rock'?31+hash(q+4)*12:kind==='tree'?15:10,scale,seed:hash(q+3),riftPalette:true,riftArea:area.id,riftGroup:`${area.id}:${groups}`,angle:long?angle:0};
        if(kind==='wall'){prop.variant='world-city-wall';prop.halfLength=48;}
        if(kind==='log'){prop.halfLength=35+hash(q+9)*12;prop.logForm=Math.floor(hash(q+5)*3);prop.r=12+hash(q+8)*4;}
        if(kind==='rock')prop.rockForm=[0,1,2,4][Math.floor(hash(q+7)*4)];
        if(kind==='tree')prop.treeForm=Math.floor(hash(q+2)*5);
        if(kind==='shrub'){prop.riftShrub=true;prop.heightBand='low';}
        themed(prop);
        if(safe(prop,area)&&separated(prop,group,8))group.push(prop);
      }
      if(group.length<2)continue;
      props.push(...group);solid.push(...group);groups++;
    }
  }

  // Roots on the blocked side dress the exact collision contour. These props
  // join the usual depth/fading queue, but never add a second collision wall.
  const edgeProps=[];
  for(const [ringIndex,ring] of (layout.solidBoundaries??layout.boundaries).entries()){
    const points=ring.points??ring;let next=35,travelled=0,sample=0;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      const nx=-dy/length,ny=dx/length;
      while(next<travelled+length){
        const t=(next-travelled)/length,n=identity(`${ringIndex}:${sample}`),px=a.x+dx*t,py=a.y+dy*t,side=collision.circleFree(px+nx*4,py+ny*4,0,'air')?-1:1,offset=25+hash(n+8)*17,x=px+nx*side*offset,y=py+ny*side*offset;
        next+=82+hash(n+1)*27;sample++;
        // Water excludes ground movement but is not a raised landform. Its
        // shores and bridge sides must never acquire floating trees or rocks.
        if(collision.circleFree(x,y,0,'air')||!island.contains(x,y,0)||edgeProps.some(p=>Math.hypot(p.x-x,p.y-y)<68))continue;
        if(layout.passages.some(p=>p.kind==='bridge'&&p.deck?.length>=2&&pointSegmentDistance({x,y},p.deck[0],p.deck[1])<p.width/2+90))continue;
        const area=layout.areas.reduce((best,item)=>distance(item.center,{x:px,y:py})<distance(best.center,{x:px,y:py})?item:best,layout.areas[0]),stone=rocks.has(area.kind),roll=hash(n+11),kind=stone?(roll<.78?'rock':'shrub'):(roll<.44?'tree':roll<.92?'shrub':'rock'),scale=kind==='tree'?.78+hash(n+12)*.25:.78+hash(n+12)*.32;
        const prop={id:`rift-edge:${ringIndex}:${sample}`,type:kind==='rock'?'rock':'tree',x,y,r:kind==='rock'?20+hash(n+13)*15:12,scale,seed:hash(n+3),riftPalette:true,collision:false,riftEdge:true,riftArea:area.id,treeForm:Math.floor(hash(n+4)*5),rockForm:[0,1,2,4][Math.floor(hash(n+5)*4)]};
        if(kind==='shrub'){prop.riftShrub=true;prop.heightBand='low';}
        edgeProps.push(themed(prop));
      }
      travelled+=length;
    }
  }
  const result=Object.freeze([...props,...edgeProps].map(Object.freeze));sceneryCache.set(layout,result);return result;
}
