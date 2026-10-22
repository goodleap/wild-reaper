import { riftPointInPolygon } from '../rift-collision.js';

const cache=new WeakMap();
// Dimensions include the whole visible ground capsule; height is the actual
// painted elevation, so flight and projectile bands agree with the artwork.
const SIZES=Object.freeze({
  rock:[[72,56,38],[96,70,50],[120,84,64]],
  ledge:[[128,56,36],[168,70,48],[208,82,60]],
  scree:[[80,48,22],[104,60,28],[128,68,34]],
  waymark:[[28,28,42],[36,30,52],[44,36,58]],
});
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
const identity=value=>[...String(value)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,17);
const bounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
function axis(p){const length=p.halfLength||0,dx=Math.cos(p.angle||0)*length,dy=Math.sin(p.angle||0)*length;return {a:{x:p.x-dx,y:p.y-dy},b:{x:p.x+dx,y:p.y+dy}};}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function separated(a,b,space=72){
  const aa=axis(a),bb=axis(b),ux=aa.b.x-aa.a.x,uy=aa.b.y-aa.a.y,vx=bb.b.x-bb.a.x,vy=bb.b.y-bb.a.y,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-8){const x=bb.a.x-aa.a.x,y=bb.a.y-aa.a.y,t=(x*vy-y*vx)/den,s=(x*uy-y*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return false;}
  return Math.min(distance(aa.a,bb.a,bb.b),distance(aa.b,bb.a,bb.b),distance(bb.a,aa.a,aa.b),distance(bb.b,aa.a,aa.b))>=a.r+b.r+space;
}
function mountainProp(kind,x,y,n,angle=0){
  const index=Math.floor(hash(n+3)*3),[width,depth,height]=SIZES[kind][index],halfLength=(width-depth)/2;
  return {variant:'mountain-native',mountainKind:kind,type:halfLength?'log':'rock',x,y,width,depth,height,halfLength,r:depth/2,angle,scale:1,seed:hash(n),heightBand:height>=56?'high':'low',region:'mountain'};
}
function greenery(kind,x,y,n,{pines=true}={}){
  const scale=kind==='tree'?.8+Math.floor(hash(n+2)*3)*.08:.64+Math.floor(hash(n+2)*3)*.1,pine=kind==='tree'&&pines&&hash(n+9)<.58;
  return {type:'tree',x,y,r:(kind==='tree'?pine?11:12:10)*scale,scale,seed:hash(n),riftPalette:true,region:'mountain',treeForm:Math.floor(hash(n+4)*5),...(pine?{variant:'world-pine'}:{}),...(kind==='shrub'?{riftShrub:true,heightBand:'low'}:{})};
}

// Long ridges use the baked high-ground boundary for collision. Independent
// shelves and fallen stones form small, spaced detours inside broad valleys;
// neither these clusters nor the deep-edge dressing close an authored route.
export function createMountainScenery(layout,collision,island){
  if(cache.has(layout))return cache.get(layout);
  const props=[],solids=[],protectedPoints=[...layout.areas.map(a=>({...a.center,r:105})),...Object.values(layout.landmarks||{}).map(p=>({...p,r:135})),...(layout.interactions?.caves||[]).flatMap(p=>[p,p.approach].filter(Boolean).map(q=>({...q,r:150}))),...(layout.interactions?.chests||[]).flatMap(p=>[p,p.approach].filter(Boolean).map(q=>({...q,r:110})))];
  const safe=(prop,area)=>{
    const {a,b}=axis(prop),margin=prop.r+64;
    if(island.isReservedCapsule(a.x,a.y,b.x,b.y,prop.r+54))return false;
    if(![a,b,prop].every(p=>(!area||riftPointInPolygon(p,area.points))&&collision.circleFree(p.x,p.y,margin,'ground')))return false;
    if(collision.firstBlocker(a.x,a.y,b.x,b.y,margin,'ground'))return false;
    if(protectedPoints.some(p=>distance(p,a,b)<p.r+prop.r))return false;
    return solids.every(p=>separated(prop,p));
  };
  for(const area of layout.areas){
    const seed=identity(area.id),box=bounds(area.points),forest=area.material==='forest',target=area.kind==='quarry'?3:area.kind==='camp'||area.kind==='pass'?1:2;
    let count=0;
    for(let attempt=0;attempt<160&&count<target;attempt++){
      const n=seed+attempt*47,x=box.minX+hash(n)*(box.maxX-box.minX),y=box.minY+hash(n+13)*(box.maxY-box.minY),angle=Math.floor(hash(n+19)*4)*Math.PI/4,c=Math.cos(angle),s=Math.sin(angle);
      if(!riftPointInPolygon({x,y},area.points))continue;
      const pieces=forest?[[-105,-45,'tree'],[110,-15,area.kind==='camp'?'waymark':'rock'],[-90,155,'shrub'],[145,175,'tree']]:[[-100,-50,'ledge'],[165,-25,'rock'],[-90,175,'scree'],[155,185,'shrub']];
      const group=[];
      for(const [i,[dx,dy,kind]]of pieces.entries()){
        const px=x+dx*c-dy*s,py=y+dx*s+dy*c,q=n+i*23,p=['tree','shrub'].includes(kind)?greenery(kind,px,py,q):mountainProp(kind,px,py,q,angle);
        Object.assign(p,{id:`mountain-group:${area.id}:${count}:${i}`,riftArea:area.id,area:area.id,mountainGroup:`${area.id}:${count}`,mineral:area.kind==='quarry'&&['rock','ledge'].includes(kind)&&hash(q+21)>.62});
        if(safe(p,area)&&group.every(other=>separated(p,other)))group.push(p);
      }
      if(group.length<3)continue;
      props.push(...group);solids.push(...group);count++;
    }
  }
  // A few low waymarks sit beside broad trail mouths rather than randomly in
  // empty courtyards. Their shaft is a real small obstacle with full clearance.
  let signs=0;
  for(const [index,passage]of layout.passages.entries()){
    if(signs>=5||passage.kind==='bridge'||passage.kind==='exit'||!passage.to||index%2)continue;
    const [a,b]=passage.waypoints;if(!b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<50)continue;
    const n=identity(passage.id),prop=mountainProp('waymark',0,0,n,Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4);
    for(const side of [1,-1]){
      const offset=passage.width/2+prop.r+74,along=Math.min(130,length*.4);
      prop.x=a.x+dx/length*along-dy/length*offset*side;prop.y=a.y+dy/length*along+dx/length*offset*side;
      Object.assign(prop,{id:`mountain-waymark:${index}`,riftArea:passage.from,area:passage.from});
      if(safe(prop)){props.push(prop);solids.push(prop);signs++;break;}
    }
  }
  for(const [index,patch]of (layout.patches||[]).entries()){
    const b=bounds(patch.points),seed=identity(patch.id);let count=0;
    for(let attempt=0;attempt<80&&count<3;attempt++){
      const n=seed+attempt*37,x=b.minX+hash(n)*(b.maxX-b.minX),y=b.minY+hash(n+11)*(b.maxY-b.minY);
      if(!riftPointInPolygon({x,y},patch.points))continue;
      const prop=greenery(count===0?'tree':'shrub',x,y,n);prop.id=`mountain-patch:${index}:${count}`;prop.layoutPatch=patch.id;
      if(safe(prop)){props.push(prop);solids.push(prop);count++;}
    }
  }
  const occupied=new Map();
  const near=(x,y)=>{for(let gx=Math.floor(x/112)-1;gx<=Math.floor(x/112)+1;gx++)for(let gy=Math.floor(y/112)-1;gy<=Math.floor(y/112)+1;gy++)if((occupied.get(`${gx}:${gy}`)||[]).some(p=>Math.hypot(p.x-x,p.y-y)<80))return true;return false;};
  const record=p=>{const key=`${Math.floor(p.x/112)}:${Math.floor(p.y/112)}`;if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(p);};
  for(const [ringIndex,ring]of (layout.solidBoundaries||layout.boundaries).entries()){
    let along=0,next=31,sample=0;
    for(let i=0;i<ring.points.length;i++){
      const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      const nx=-dy/length,ny=dx/length;
      while(next<along+length){
        const t=(next-along)/length,n=ringIndex*9743+sample*59,px=a.x+dx*t,py=a.y+dy*t,side=collision.circleFree(px+nx*3,py+ny*3,0,'air')?-1:1;
        next+=102+hash(n+1)*31;sample++;
        const area=layout.areas.reduce((best,p)=>(p.center.x-px)**2+(p.center.y-py)**2<(best.center.x-px)**2+(best.center.y-py)**2?p:best),forest=area.material==='forest',roll=hash(n+7);
        const kind=forest?(roll<.44?'tree':roll<.78?'shrub':roll<.94?'rock':'scree'):(roll<.48?'ledge':roll<.8?'rock':roll<.93?'scree':'shrub');
        const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/8))*(Math.PI/8),p=['tree','shrub'].includes(kind)?greenery(kind,px,py,n):mountainProp(kind,px,py,n,angle);
        const offset=p.r+(kind==='tree'||kind==='shrub'?16:12);
        p.x=px+nx*side*offset;p.y=py+ny*side*offset;
        if(!island.contains(p.x,p.y)||collision.circleFree(p.x,p.y,0,'air')||near(p.x,p.y))continue;
        if(layout.passages.some(passage=>passage.kind==='bridge'&&passage.deck?.length===2&&distance(p,passage.deck[0],passage.deck[1])<passage.width/2+85))continue;
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
          if(!['rock','ledge','scree'].includes(kind))continue;
          Object.assign(p,mountainProp('scree',p.x,p.y,n));p.width=56;p.depth=40;p.r=20;p.halfLength=8;p.height=22;p.heightBand='low';footprint=axis(p);
          if(!blockedFoot())continue;
        }
        Object.assign(p,{id:`mountain-edge:${ringIndex}:${sample}`,collision:false,riftEdge:true,mountainEdge:true,riftArea:area.id,area:area.id,mineral:area.kind==='quarry'&&p.mountainKind==='rock'&&hash(n+21)>.85});
        props.push(p);record(p);
      }
      along+=length;
    }
  }
  const result=Object.freeze(props.map(Object.freeze));cache.set(layout,result);return result;
}
