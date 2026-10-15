// Shared, bounded navigation for solid groves, courtyard walls and lakes.
// Paths contain ordinary walking waypoints; movement/collision remains owned
// by Terrain.moveCircle. Separate clearance layers preserve flying behavior.
const NAVIGATORS=new WeakMap();
const RECENT=[];
const LIMITS=Object.freeze({expanded:1800,frameExpanded:2400,frameSearches:2,cells:4096,edges:8192,routes:64,layers:6,terrains:3});
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const key=(x,y)=>`${x},${y}`;
function remember(map,id,value,limit){map.set(id,value);if(map.size>limit)map.delete(map.keys().next().value);return value;}
function push(heap,node){
  let i=heap.length;heap.push(node);
  while(i){const parent=(i-1)>>1;if(heap[parent].f<=node.f)break;heap[i]=heap[parent];i=parent;}heap[i]=node;
}
function pop(heap){
  const first=heap[0],last=heap.pop();if(!heap.length)return first;
  let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child;}heap[i]=last;return first;
}
export class TerrainNavigation {
  constructor(terrain){this.terrain=terrain;this.revision=terrain.structureRevision||0;this.layers=new Map();this.searches=0;this.expanded=0;this.lastExpanded=0;}
  clear(){this.layers.clear();this.revision=this.terrain.structureRevision||0;}
  layer(radius,profile){
    if(this.revision!==(this.terrain.structureRevision||0))this.clear();
    const r=Math.ceil(radius/4)*4,id=`${profile}:${r}`;
    let layer=this.layers.get(id);
    // Authored outdoor roads are at least 140 units wide. The coarser outdoor
    // grid cuts cold forest/lake searches substantially; room and expedition
    // passages retain the finer grid for ordinary bodies.
    if(!layer)layer=remember(this.layers,id,{r,profile,step:r<=28&&!this.terrain.island?.layout?32:48,cells:new Map(),edges:new Map(),routes:new Map()},LIMITS.layers);
    return layer;
  }
  clearSegment(a,b,r,profile='ground'){
    return (!this.terrain.island||this.terrain.island.containsCapsule(a.x,a.y,b.x,b.y,r))&&!this.terrain.firstBlocker(a.x,a.y,b.x,b.y,r,profile);
  }
  free(layer,x,y){
    const id=key(x,y);if(layer.cells.has(id))return layer.cells.get(id);
    return remember(layer.cells,id,this.terrain.isFree(x*layer.step,y*layer.step,layer.r,layer.profile),LIMITS.cells);
  }
  edge(layer,x,y,nx,ny){
    const a=key(x,y),b=key(nx,ny),id=a<b?`${a}:${b}`:`${b}:${a}`;
    if(layer.edges.has(id))return layer.edges.get(id);
    const clear=this.free(layer,nx,ny)&&this.clearSegment({x:x*layer.step,y:y*layer.step},{x:nx*layer.step,y:ny*layer.step},layer.r,layer.profile);
    return remember(layer.edges,id,clear,LIMITS.edges);
  }
  find(start,target,radius,profile='ground',budget=LIMITS.expanded){
    const layer=this.layer(radius,profile),{r,step}=layer;
    this.lastExpanded=0;
    if(this.clearSegment(start,target,r,profile)&&this.terrain.isFree(target.x,target.y,r,profile))return [target];
    const sx=Math.round(start.x/step),sy=Math.round(start.y/step),gx=Math.round(target.x/step),gy=Math.round(target.y/step),cacheKey=`${sx},${sy}:${gx},${gy}`;
    const cached=layer.routes.get(cacheKey);
    if(cached&&this.clearSegment(start,cached[0],r,profile)&&this.clearSegment(cached.at(-1),target,r,profile))return [...cached,target];
    if(budget<=0)return null;
    // A target can stand in a gap too small for its pursuer. In that case the
    // search may approach a nearby reachable point, but never enter the gap.
    const targetFree=this.terrain.isFree(target.x,target.y,r,profile);
    const margin=768,minX=Math.min(sx,gx)-Math.ceil(margin/step),maxX=Math.max(sx,gx)+Math.ceil(margin/step),minY=Math.min(sy,gy)-Math.ceil(margin/step),maxY=Math.max(sy,gy)+Math.ceil(margin/step);
    const heuristic=(x,y)=>Math.hypot(x*step-target.x,y*step-target.y);
    const nodes=new Map(),heap=[];
    // Attach the exact foot position to several nearby cells. Rounding alone
    // can select the far side of a wall, or miss a narrow passage entirely.
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const x=sx+dx,y=sy+dy,point={x:x*step,y:y*step};
      if(!this.free(layer,x,y)||!this.clearSegment(start,point,r,profile))continue;
      const g=Math.hypot(point.x-start.x,point.y-start.y),node={x,y,g,f:g+heuristic(x,y),parent:null,closed:false};nodes.set(key(x,y),node);push(heap,node);
    }
    this.searches++;
    let goal=null;
    while(heap.length&&this.lastExpanded<Math.min(budget,LIMITS.expanded)){
      const node=pop(heap),id=key(node.x,node.y);if(node.closed||nodes.get(id)!==node)continue;
      node.closed=true;this.lastExpanded++;
      const distance=heuristic(node.x,node.y),point={x:node.x*step,y:node.y*step};
      if(distance<=step*2.5&&(targetFree?this.clearSegment(point,target,r,profile):distance<=r+step)){goal=node;break;}
      for(const [dx,dy] of DIRECTIONS){
        const x=node.x+dx,y=node.y+dy;if(x<minX||x>maxX||y<minY||y>maxY)continue;
        const nextKey=key(x,y),previous=nodes.get(nextKey),g=node.g+step*(dx&&dy?Math.SQRT2:1);
        if(previous&&(previous.closed||previous.g<=g)||!this.edge(layer,node.x,node.y,x,y))continue;
        const next={x,y,g,f:g+heuristic(x,y),parent:node,closed:false};nodes.set(nextKey,next);push(heap,next);
      }
    }
    this.expanded+=this.lastExpanded;
    if(!goal)return null;
    const raw=[];for(let node=goal;node;node=node.parent)raw.push({x:node.x*step,y:node.y*step});raw.reverse();
    if(targetFree)raw.push({x:target.x,y:target.y});
    // Greedy visibility smoothing removes grid zigzags without cutting a
    // corner; every retained segment has the same full-body clearance.
    const path=[];let anchor=start,index=0;
    while(index<raw.length){let end=raw.length-1;while(end>index&&!this.clearSegment(anchor,raw[end],r,profile))end--;path.push(raw[end]);anchor=raw[end];index=end+1;}
    remember(layer.routes,cacheKey,path.slice(),LIMITS.routes);return path;
  }
  waypoint(entity,start,target,radius,profile,time,frame=time){
    let state=entity._terrainRoute;
    if(state?.terrain!==this.terrain||state?.revision!==(this.terrain.structureRevision||0)||state?.profile!==profile||state?.radius!==radius){
      state={terrain:this.terrain,revision:this.terrain.structureRevision||0,profile,radius,path:null,target:null,nextSearch:0};
      // Navigation owns live terrain references. Keep them out of actor copies
      // and JSON snapshots, which should never serialize an entire map cache.
      Object.defineProperty(entity,'_terrainRoute',{value:state,writable:true,configurable:true,enumerable:false});
    }
    if(state.target&&Math.hypot(state.target.x-target.x,state.target.y-target.y)>64)state.path=null;
    const path=state.path;
    if(path?.length){
      while(path.length>1&&Math.hypot(path[0].x-start.x,path[0].y-start.y)<22)path.shift();
      // A moving target may become directly reachable after a corner.
      if(this.clearSegment(start,target,radius,profile)&&this.terrain.isFree(target.x,target.y,radius,profile)){state.path=null;return null;}
      for(let i=Math.min(path.length-1,4);i>0;i--)if(this.clearSegment(start,path[i],radius,profile)){path.splice(0,i);break;}
      if(Math.hypot(path[0].x-start.x,path[0].y-start.y)>6&&this.clearSegment(start,path[0],radius,profile))return path[0];
      state.path=null;
    }
    if(time<state.nextSearch)return null;
    if(this.frame!==frame){this.frame=frame;this.frameExpanded=0;this.frameSearches=0;}
    const remaining=LIMITS.frameExpanded-this.frameExpanded,budget=this.frameSearches<LIMITS.frameSearches&&remaining>=800?remaining:0,searches=this.searches;
    state.target={...target};state.path=this.find(start,target,radius,profile,budget);
    this.frameExpanded+=this.lastExpanded;this.frameSearches+=this.searches-searches;
    // Large populations share a per-frame work budget. Cache hits still work
    // when it is spent; the remaining actors retry in staggered short turns.
    state.nextSearch=time+(budget>0?.7+(Math.abs(entity.id||0)%5)*.06:.06+(Math.abs(entity.id||0)%4)*.015);
    return state.path?.[0]??null;
  }
  get cacheSize(){let cells=0,edges=0,routes=0;for(const layer of this.layers.values()){cells+=layer.cells.size;edges+=layer.edges.size;routes+=layer.routes.size;}return {layers:this.layers.size,cells,edges,routes};}
}
export function terrainNavigation(terrain){
  let navigation=NAVIGATORS.get(terrain);if(!navigation){navigation=new TerrainNavigation(terrain);NAVIGATORS.set(terrain,navigation);}
  const index=RECENT.indexOf(navigation);if(index>=0)RECENT.splice(index,1);RECENT.push(navigation);
  // Revisitable world snapshots retain their terrain. Keep navigation grids
  // only for the most recent scenes instead of multiplying them by eight maps.
  while(RECENT.length>LIMITS.terrains)RECENT.shift().clear();
  return navigation;
}
export { LIMITS as NAVIGATION_LIMITS };
