import { riftPointInPolygon } from '../rift-collision.js';

const cache=new WeakMap();
const SIZES=Object.freeze({
  rock:[[64,48,38],[80,60,48],[96,68,60]],
  reef:[[96,64,58],[120,76,72],[144,88,84]],
  driftwood:[[116,26,14],[140,30,18],[168,34,20]],
  post:[[22,22,38],[26,26,46],[28,28,50]],
  crate:[[44,38,34],[52,44,42],[64,48,46]],
});
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
const identity=value=>[...String(value)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,17);
const bounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
function axis(p){const length=p.halfLength||0,dx=Math.cos(p.angle||0)*length,dy=Math.sin(p.angle||0)*length;return {a:{x:p.x-dx,y:p.y-dy},b:{x:p.x+dx,y:p.y+dy}};}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function separated(a,b,space=70){
  const aa=axis(a),bb=axis(b),ux=aa.b.x-aa.a.x,uy=aa.b.y-aa.a.y,vx=bb.b.x-bb.a.x,vy=bb.b.y-bb.a.y,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-8){const x=bb.a.x-aa.a.x,y=bb.a.y-aa.a.y,t=(x*vy-y*vx)/den,s=(x*uy-y*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return false;}
  return Math.min(distance(aa.a,bb.a,bb.b),distance(aa.b,bb.a,bb.b),distance(bb.a,aa.a,aa.b),distance(bb.b,aa.a,aa.b))>=a.r+b.r+space;
}
function coastProp(kind,x,y,n,angle=0){
  const index=Math.floor(hash(n+3)*3),[width,depth,height]=SIZES[kind][index],halfLength=(width-depth)/2;
  const visibleHeight=['rock','reef'].includes(kind)?height*.67:height;
  return {variant:'beach-native',beachKind:kind,type:halfLength?'log':'rock',x,y,width,depth,height,halfLength,r:depth/2,angle,scale:1,seed:hash(n),heightBand:visibleHeight>=56?'high':'low',region:'beach'};
}
function greenery(kind,x,y,n,{palms=false}={}){
  const scale=kind==='tree'?.8+Math.floor(hash(n+2)*3)*.08:.66+Math.floor(hash(n+2)*3)*.1;
  const palm=kind==='tree'&&palms&&hash(n+9)<.28;
  return {type:'tree',x,y,r:(kind==='tree'?palm?9:12:10)*scale,scale,seed:hash(n),riftPalette:true,region:'beach',treeForm:Math.floor(hash(n+4)*5),...(palm?{variant:'world-palm'}:{}),...(kind==='shrub'?{riftShrub:true,heightBand:'low'}:{})};
}

// The shoreline and continuous rocky/wooded banks come from the shared map
// masks. Only separate objects on dry land add colliders; water-edge dressing
// never becomes a second, invisible wall around a bay.
export function createBeachScenery(layout,collision,island){
  if(cache.has(layout))return cache.get(layout);
  const props=[],solids=[],protectedPoints=[...layout.areas.map(a=>({...a.center,r:105})),...Object.values(layout.landmarks||{}).map(p=>({...p,r:135})),...(layout.interactions?.caves||[]).flatMap(p=>[p,p.approach].filter(Boolean).map(q=>({...q,r:150}))),...(layout.interactions?.chests||[]).flatMap(p=>[p,p.approach].filter(Boolean).map(q=>({...q,r:110})))];
  const safe=(prop,area)=>{
    const {a,b}=axis(prop),margin=prop.r+62;
    if(island.isReservedCapsule(a.x,a.y,b.x,b.y,prop.r+52))return false;
    if(![a,b,prop].every(p=>(!area||riftPointInPolygon(p,area.points))&&collision.circleFree(p.x,p.y,margin,'ground')))return false;
    if(collision.firstBlocker(a.x,a.y,b.x,b.y,margin,'ground'))return false;
    if(protectedPoints.some(p=>distance(p,a,b)<p.r+prop.r))return false;
    return solids.every(p=>separated(prop,p));
  };
  for(const area of layout.areas){
    const seed=identity(area.id),box=bounds(area.points),forest=area.material==='forest',harbor=['camp','village'].includes(area.kind),target=area.kind==='camp'?1:area.kind==='village'?3:2;
    let count=0;
    for(let attempt=0;attempt<150&&count<target;attempt++){
      const n=seed+attempt*47,x=box.minX+hash(n)*(box.maxX-box.minX),y=box.minY+hash(n+13)*(box.maxY-box.minY),angle=Math.floor(hash(n+19)*4)*Math.PI/4,c=Math.cos(angle),s=Math.sin(angle);
      if(!riftPointInPolygon({x,y},area.points))continue;
      const pieces=harbor?[[-70,-45,'crate'],[125,-20,'post'],[-110,130,'driftwood'],[140,150,'shrub']]:forest?[[-100,-55,'tree'],[105,-25,'driftwood'],[-90,140,'shrub'],[145,155,'tree']]:[[-100,-65,'reef'],[125,-25,'rock'],[-80,145,'shrub'],[145,165,'driftwood']];
      const group=[];
      for(const [i,[dx,dy,kind]]of pieces.entries()){
        const px=x+dx*c-dy*s,py=y+dx*s+dy*c,q=n+i*23,p=['tree','shrub'].includes(kind)?greenery(kind,px,py,q,{palms:area.kind!=='grove'}):coastProp(kind,px,py,q,angle);
        Object.assign(p,{id:`beach-group:${area.id}:${count}:${i}`,riftArea:area.id,area:area.id,beachGroup:`${area.id}:${count}`});
        if(safe(p,area)&&group.every(other=>separated(p,other)))group.push(p);
      }
      if(group.length<3)continue;
      props.push(...group);solids.push(...group);count++;
    }
  }
  for(const [index,patch]of (layout.patches||[]).entries()){
    const b=bounds(patch.points),seed=identity(patch.id);let count=0;
    for(let attempt=0;attempt<80&&count<3;attempt++){
      const n=seed+attempt*37,x=b.minX+hash(n)*(b.maxX-b.minX),y=b.minY+hash(n+11)*(b.maxY-b.minY);
      if(!riftPointInPolygon({x,y},patch.points))continue;
      const prop=greenery(count===0?'tree':'shrub',x,y,n);prop.id=`beach-patch:${index}:${count}`;prop.layoutPatch=patch.id;
      if(safe(prop)){props.push(prop);solids.push(prop);count++;}
    }
  }
  const occupied=new Map();
  const near=(x,y)=>{for(let gx=Math.floor(x/100)-1;gx<=Math.floor(x/100)+1;gx++)for(let gy=Math.floor(y/100)-1;gy<=Math.floor(y/100)+1;gy++)if((occupied.get(`${gx}:${gy}`)||[]).some(p=>Math.hypot(p.x-x,p.y-y)<72))return true;return false;};
  const record=p=>{const key=`${Math.floor(p.x/100)}:${Math.floor(p.y/100)}`;if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(p);};
  for(const [ringIndex,ring]of (layout.solidBoundaries||layout.boundaries).entries()){
    let along=0,next=31,sample=0;
    for(let i=0;i<ring.points.length;i++){
      const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      const nx=-dy/length,ny=dx/length;
      while(next<along+length){
        const t=(next-along)/length,n=ringIndex*9743+sample*59,px=a.x+dx*t,py=a.y+dy*t,side=collision.circleFree(px+nx*3,py+ny*3,0,'air')?-1:1;
        next+=96+hash(n+1)*25;sample++;
        const area=layout.areas.reduce((best,p)=>(p.center.x-px)**2+(p.center.y-py)**2<(best.center.x-px)**2+(best.center.y-py)**2?p:best),forest=area.material==='forest',roll=hash(n+7);
        const kind=forest?(roll<.42?'tree':roll<.8?'shrub':'rock'):(roll<.67?'reef':roll<.86?'rock':'shrub');
        const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/8))*(Math.PI/8),p=['tree','shrub'].includes(kind)?greenery(kind,px,py,n,{palms:area.kind==='shore'}):coastProp(kind,px,py,n,angle);
        const offset=p.r+(kind==='tree'?16:kind==='shrub'?16:9);
        p.x=px+nx*side*offset;p.y=py+ny*side*offset;
        if(!island.contains(p.x,p.y)||collision.circleFree(p.x,p.y,0,'air')||near(p.x,p.y))continue;
        if(layout.passages.some(passage=>passage.kind==='bridge'&&passage.deck?.length===2&&distance(p,passage.deck[0],passage.deck[1])<passage.width/2+80))continue;
        let footprint=axis(p);
        const blockedFoot=()=>{
          const steps=Math.max(1,Math.ceil((p.halfLength||0)*2/16));
          for(let j=0;j<=steps;j++){
            const q={x:footprint.a.x+(footprint.b.x-footprint.a.x)*j/steps,y:footprint.a.y+(footprint.b.y-footprint.a.y)*j/steps};
            if(collision.high.inside(q.x,q.y)||(collision.high.nearest(q.x,q.y,p.r+4)?.distance??Infinity)<p.r+2)return false;
          }
          return true;
        };
        if(!blockedFoot()){
          if(!['reef','rock'].includes(kind))continue;
          Object.assign(p,coastProp('rock',p.x,p.y,n));p.width=52;p.depth=40;p.r=20;p.halfLength=6;p.height=32;footprint=axis(p);
          if(!blockedFoot())continue;
        }
        Object.assign(p,{id:`beach-edge:${ringIndex}:${sample}`,collision:false,riftEdge:true,beachEdge:true,riftArea:area.id,area:area.id});
        props.push(p);record(p);
      }
      along+=length;
    }
  }
  const result=Object.freeze(props.map(Object.freeze));cache.set(layout,result);return result;
}
