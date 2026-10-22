import { riftPointInPolygon } from '../rift-collision.js';

const cache=new WeakMap();
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
const identity=value=>[...String(value)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,17);
const bounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
function axis(p){const length=p.halfLength||0,dx=Math.cos(p.angle||0)*length,dy=Math.sin(p.angle||0)*length;return {a:{x:p.x-dx,y:p.y-dy},b:{x:p.x+dx,y:p.y+dy}};}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function separated(a,b,space=68){const aa=axis(a),bb=axis(b);return Math.min(distance(aa.a,bb.a,bb.b),distance(aa.b,bb.a,bb.b),distance(bb.a,aa.a,aa.b),distance(bb.b,aa.a,aa.b))>=a.r+b.r+space;}
function masonry(kind,x,y,n,angle=0){
  const index=Math.floor(hash(n+3)*3);
  const dimensions=kind==='column'?[[32,32,64],[40,40,80],[40,40,96]][index]:kind==='wall'?[[140,32,40],[180,36,56],[220,40,72]][index]:kind==='plinth'?[[64,44,24],[80,48,32],[96,52,32]][index]:[[64,40,20],[80,44,24],[96,48,28]][index];
  const [width,depth,height]=dimensions,halfLength=(width-depth)/2;
  return {variant:'ruins-native',ruinsKind:kind,type:halfLength?'log':'rock',x,y,width,depth,height,halfLength,r:depth/2,angle,scale:1,seed:hash(n),heightBand:height>=56?'high':'low'};
}
function greenery(kind,x,y,n){
  const scale=kind==='tree'?.8+Math.floor(hash(n+2)*3)*.08:.68+Math.floor(hash(n+2)*3)*.1;
  return {type:kind==='rock'?'rock':'tree',x,y,r:kind==='rock'?28+Math.floor(hash(n+3)*3)*5:kind==='tree'?12*scale:10*scale,scale,seed:hash(n),riftPalette:true,treeForm:Math.floor(hash(n+4)*5),rockForm:[0,1,2,4][Math.floor(hash(n+5)*4)],...(kind==='shrub'?{riftShrub:true,heightBand:'low'}:{})};
}

// Complete ruins remain part of the baked ground mask. These independent
// columns and fallen fragments leave generous body-width detours, while the
// contour dressing below adds no second set of movement colliders.
export function createRuinsScenery(layout,collision,island){
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
    const seed=identity(area.id),box=bounds(area.points),forest=area.material==='forest',target=area.kind==='fortress'?3:area.kind==='camp'?1:2;
    let count=0;
    for(let attempt=0;attempt<150&&count<target;attempt++){
      const n=seed+attempt*47,x=box.minX+hash(n)*(box.maxX-box.minX),y=box.minY+hash(n+13)*(box.maxY-box.minY),angle=hash(n+19)<.5?0:Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
      if(!riftPointInPolygon({x,y},area.points))continue;
      const pieces=forest?[[-95,-55,'tree'],[105,-10,'rock'],[-55,140,'shrub'],[120,155,'column']]:[[-55,-35,area.kind==='secret'?'plinth':'wall'],[155,-35,'column'],[-105,140,'rubble'],[140,150,'shrub']];
      const group=[];
      for(const [i,[dx,dy,kind]]of pieces.entries()){
        const px=x+dx*c-dy*s,py=y+dx*s+dy*c,q=n+i*23,p=['tree','rock','shrub'].includes(kind)?greenery(kind,px,py,q):masonry(kind,px,py,q,angle);
        Object.assign(p,{id:`ruins-group:${area.id}:${count}:${i}`,riftArea:area.id,area:area.id,ruinsGroup:`${area.id}:${count}`});
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
      const prop=greenery(count===0?'tree':'shrub',x,y,n);prop.id=`ruins-patch:${index}:${count}`;prop.layoutPatch=patch.id;
      if(safe(prop)){props.push(prop);solids.push(prop);count++;}
    }
  }
  const occupied=new Map(),nearby=(x,y)=>{const result=[];for(let gx=Math.floor(x/100)-1;gx<=Math.floor(x/100)+1;gx++)for(let gy=Math.floor(y/100)-1;gy<=Math.floor(y/100)+1;gy++)result.push(...(occupied.get(`${gx}:${gy}`)||[]));return result;};
  const record=p=>{const key=`${Math.floor(p.x/100)}:${Math.floor(p.y/100)}`;if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(p);};
  for(const [ringIndex,ring]of (layout.solidBoundaries||layout.boundaries).entries()){
    let along=0,next=31,sample=0;
    for(let i=0;i<ring.points.length;i++){
      const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      const nx=-dy/length,ny=dx/length;
      while(next<along+length){
        const t=(next-along)/length,n=ringIndex*9743+sample*59,px=a.x+dx*t,py=a.y+dy*t,side=collision.circleFree(px+nx*3,py+ny*3,0,'air')?-1:1;
        next+=85+hash(n+1)*23;sample++;
        const area=layout.areas.reduce((best,p)=>(p.center.x-px)**2+(p.center.y-py)**2<(best.center.x-px)**2+(best.center.y-py)**2?p:best),forest=area.material==='forest',roll=hash(n+7);
        const kind=forest?(roll<.38?'tree':roll<.8?'shrub':'rubble'):(roll<.53?'wall':roll<.76?'rubble':roll<.88?'column':'shrub');
        const offset=kind==='tree'?30:kind==='shrub'?28:kind==='column'?26:34,x=px+nx*side*offset,y=py+ny*side*offset;
        if(!island.contains(x,y)||collision.circleFree(x,y,0,'air')||nearby(x,y).some(p=>Math.hypot(p.x-x,p.y-y)<66))continue;
        if(layout.passages.some(p=>p.kind==='bridge'&&p.deck?.length===2&&distance({x,y},p.deck[0],p.deck[1])<p.width/2+80))continue;
        const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/8))*(Math.PI/8);
        const p=['tree','shrub'].includes(kind)?greenery(kind,x,y,n):masonry(kind,x,y,n,angle);
        // Curved ends may point back across walkable ground. Shrink to a
        // compact fragment there, then reject if its full footing still leaks.
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
          if(!['wall','rubble'].includes(kind))continue;
          Object.assign(p,masonry('rubble',x,y,n));p.width=48;p.depth=36;p.r=18;p.halfLength=6;p.height=24;footprint=axis(p);
          if(!blockedFoot())continue;
        }
        Object.assign(p,{id:`ruins-edge:${ringIndex}:${sample}`,collision:false,riftEdge:true,ruinsEdge:true,riftArea:area.id,area:area.id});
        props.push(p);record(p);
      }
      along+=length;
    }
  }
  const result=Object.freeze(props.map(Object.freeze));cache.set(layout,result);return result;
}
