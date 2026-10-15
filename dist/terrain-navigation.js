import { RiftNavigation } from './rift-navigation.js';
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
function endpoints(obstacle){const dx=Math.cos(obstacle.angle||0)*(obstacle.halfLength||0),dy=Math.sin(obstacle.angle||0)*(obstacle.halfLength||0);return [{x:obstacle.x-dx,y:obstacle.y-dy},{x:obstacle.x+dx,y:obstacle.y+dy}];}
export class TerrainNavigation {
  constructor(terrain){this.terrain=terrain;this.rift=terrain.rift?new RiftNavigation(terrain):null;this.revision=terrain.structureRevision||0;this.layers=new Map();this.plans=0;this.searches=0;this.expanded=0;this.lastExpanded=0;}
  clear(){this.layers.clear();this.revision=this.terrain.structureRevision||0;}
  layer(radius,profile){
    if(this.revision!==(this.terrain.structureRevision||0))this.clear();
    const r=Math.ceil(radius/4)*4,id=`${profile}:${r}`;
    let layer=this.layers.get(id);
    // Authored outdoor roads are at least 140 units wide. The coarser outdoor
    // grid cuts cold forest/lake searches substantially; room and expedition
    // passages retain the finer grid for ordinary bodies.
    if(!layer){
      layer=remember(this.layers,id,{r,profile,step:r<=28&&!this.terrain.island?.layout?32:48,cells:new Map(),edges:new Map(),routes:new Map()},LIMITS.layers);
      this.connectDoors(layer);
    }
    return layer;
  }
  connectDoors(layer){
    const groups=new Map();layer.doors=[];layer.doorLinks=new Map();
    for(const wall of this.terrain._structures||[]){
      if(wall.variant!=='rescue-wall'||!wall.structureId)continue;
      let group=groups.get(wall.structureId);if(!group){group={};groups.set(wall.structureId,group);}
      group[wall.id.split(':').at(-1)]=wall;
    }
    for(const [id,group] of groups){
      if(!group.frontLeft||!group.frontRight||!group.back)continue;
      const pairs=endpoints(group.frontLeft).flatMap(a=>endpoints(group.frontRight).map(b=>({a,b,d:Math.hypot(a.x-b.x,a.y-b.y)}))).sort((a,b)=>a.d-b.d),{a,b}=pairs[0];
      const x=(a.x+b.x)/2,y=(a.y+b.y)/2,dx=x-group.back.x,dy=y-group.back.y,d=Math.hypot(dx,dy)||1,depth=Math.max(layer.step,layer.r+Math.max(group.frontLeft.r,group.frontRight.r)+6);
      const points=[-1,1].map(side=>({x:x+dx/d*depth*side,y:y+dy/d*depth*side}));
      // The gap is a real collision-tested connection, not permission to pass
      // through a closed gate. Its coordinates do not depend on grid alignment.
      if(points.some(p=>!this.terrain.isFree(p.x,p.y,layer.r,layer.profile))||!this.clearSegment(points[0],points[1],layer.r,layer.profile))continue;
      const doors=points.map((point,i)=>({id:`door:${id}:${i}`,x:point.x/layer.step,y:point.y/layer.step,point,door:true,links:[]}));
      doors[0].links.push(doors[1]);doors[1].links.push(doors[0]);
      for(const door of doors){
        const sx=Math.round(door.x),sy=Math.round(door.y);
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
          const x=sx+dx,y=sy+dy,point={x:x*layer.step,y:y*layer.step};
          if(!this.free(layer,x,y)||!this.clearSegment(door.point,point,layer.r,layer.profile))continue;
          const node={id:key(x,y),x,y,point};door.links.push(node);
          if(!layer.doorLinks.has(node.id))layer.doorLinks.set(node.id,[]);layer.doorLinks.get(node.id).push(door);
        }
      }
      layer.doors.push(...doors);
    }
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
  find(start,target,radius,profile='ground',budget=LIMITS.expanded,bodyRadius=radius){
    if(!this.rift||this.clearSegment(start,target,bodyRadius,profile))return this.findLocal(start,target,radius,profile,budget,bodyRadius);
    this.lastExpanded=0;if(budget<=0)return null;this.plans++;
    const route=this.rift.route(start,target,bodyRadius,profile);
    if(!route?.length)return this.findLocal(start,target,radius,profile,budget,bodyRadius);
    // Return the first reachable leg. waypoint() plans the following leg once
    // reached, so a distant world target never triggers a full-world A* scan.
    for(const point of route){
      if(Math.hypot(point.x-start.x,point.y-start.y)<8)continue;
      return this.findLocal(start,point,radius,profile,budget,bodyRadius);
    }
    return null;
  }
  findLocal(start,target,radius,profile='ground',budget=LIMITS.expanded,bodyRadius=radius){
    const layer=this.layer(radius,profile),{r,step}=layer;
    // Collision resolution may leave a body resting against a wall. The
    // initial attachment uses its actual radius until it reaches a node with
    // full planning clearance; otherwise a legal foot position has no exits.
    const attachRadius=this.terrain.isFree(start.x,start.y,r,profile)?r:Math.min(radius,Math.max(0,bodyRadius));
    this.lastExpanded=0;
    if(this.clearSegment(start,target,attachRadius,profile)&&this.terrain.isFree(target.x,target.y,r,profile))return [target];
    const sx=Math.round(start.x/step),sy=Math.round(start.y/step),gx=Math.round(target.x/step),gy=Math.round(target.y/step),cacheKey=`${sx},${sy}:${gx},${gy}`;
    const cached=layer.routes.get(cacheKey);
    if(cached&&this.clearSegment(start,cached[0],attachRadius,profile)&&this.clearSegment(cached.at(-1),target,r,profile))return [...cached,target];
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
      if(!this.free(layer,x,y)||!this.clearSegment(start,point,attachRadius,profile))continue;
      const g=Math.hypot(point.x-start.x,point.y-start.y),node={id:key(x,y),x,y,point,g,f:g+heuristic(x,y),parent:null,closed:false};nodes.set(node.id,node);push(heap,node);
    }
    for(const door of layer.doors){
      const g=Math.hypot(door.point.x-start.x,door.point.y-start.y);
      if(g>step*4||!this.clearSegment(start,door.point,attachRadius,profile))continue;
      const node={...door,g,f:g+heuristic(door.x,door.y),parent:null,closed:false};nodes.set(node.id,node);push(heap,node);
    }
    this.searches++;
    let goal=null;
    while(heap.length&&this.lastExpanded<Math.min(budget,LIMITS.expanded)){
      const node=pop(heap);if(node.closed||nodes.get(node.id)!==node)continue;
      node.closed=true;this.lastExpanded++;
      const distance=heuristic(node.x,node.y),point=node.point;
      if(distance<=step*2.5&&(targetFree?this.clearSegment(point,target,r,profile):distance<=r+step)){goal=node;break;}
      const neighbors=node.door?[...node.links]:[...(layer.doorLinks.get(node.id)||[])];
      if(!node.door)for(const [dx,dy] of DIRECTIONS){
        const x=node.x+dx,y=node.y+dy;if(x<minX||x>maxX||y<minY||y>maxY)continue;
        const previous=nodes.get(key(x,y)),g=node.g+step*(dx&&dy?Math.SQRT2:1);
        if(previous&&(previous.closed||previous.g<=g)||!this.edge(layer,node.x,node.y,x,y))continue;
        neighbors.push({id:key(x,y),x,y,point:{x:x*step,y:y*step}});
      }
      for(const neighbor of neighbors){
        const g=node.g+Math.hypot(neighbor.point.x-point.x,neighbor.point.y-point.y),previous=nodes.get(neighbor.id);
        if(previous&&(previous.closed||previous.g<=g))continue;
        const next={...neighbor,g,f:g+heuristic(neighbor.x,neighbor.y),parent:node,closed:false};nodes.set(next.id,next);push(heap,next);
      }
    }
    this.expanded+=this.lastExpanded;
    if(!goal)return null;
    const raw=[];for(let node=goal;node;node=node.parent)raw.push(node.point);raw.reverse();
    if(targetFree)raw.push({x:target.x,y:target.y});
    // Greedy visibility smoothing removes grid zigzags without cutting a
    // corner; every retained segment has the same full-body clearance.
    const path=[];let anchor=start,index=0;
    while(index<raw.length){let end=raw.length-1;while(end>index&&!this.clearSegment(anchor,raw[end],path.length?r:attachRadius,profile))end--;path.push(raw[end]);anchor=raw[end];index=end+1;}
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
    const bodyRadius=Math.min(radius,entity.r??radius),targetMoved=state.target&&Math.hypot(state.target.x-target.x,state.target.y-target.y)>64;
    const path=state.path;
    let fallback=null;
    if(path?.length){
      // Reaching the vicinity of a doorway is not the same as having passed
      // through it. Drop a turn only when the following segment is usable.
      while(path.length>1&&Math.hypot(path[0].x-start.x,path[0].y-start.y)<22&&this.clearSegment(start,path[1],bodyRadius,profile))path.shift();
      // A moving target may become directly reachable after a corner.
      if(this.clearSegment(start,target,bodyRadius,profile)&&this.terrain.isFree(target.x,target.y,bodyRadius,profile)){state.path=null;return target;}
      for(let i=Math.min(path.length-1,4);i>0;i--)if(this.clearSegment(start,path[i],bodyRadius,profile)){path.splice(0,i);break;}
      if(Math.hypot(path[0].x-start.x,path[0].y-start.y)>.05&&this.clearSegment(start,path[0],bodyRadius,profile))fallback=path[0];
      if(!fallback)state.path=null;
      else if(!targetMoved)return fallback;
    }
    // A moving leader must not erase an unfinished exit while the next search
    // is waiting for its budget. Keep the safe next step, or briefly hold.
    if(time<state.nextSearch)return fallback??start;
    if(this.frame!==frame){this.frame=frame;this.frameExpanded=0;this.frameSearches=0;this.framePlans=0;}
    const remaining=LIMITS.frameExpanded-this.frameExpanded,budget=this.frameSearches<LIMITS.frameSearches&&this.framePlans<LIMITS.frameSearches&&remaining>=800?remaining:0,searches=this.searches,plans=this.plans;
    const replacement=this.find(start,target,radius,profile,budget,bodyRadius);
    if(replacement){state.target={...target};state.path=replacement;}
    this.frameExpanded+=this.lastExpanded;this.frameSearches+=this.searches-searches;this.framePlans+=this.plans-plans;
    // Large populations share a per-frame work budget. Cache hits still work
    // when it is spent; the remaining actors retry in staggered short turns.
    state.nextSearch=time+(budget>0?.7+(Math.abs(entity.id||0)%5)*.06:.06+(Math.abs(entity.id||0)%4)*.015);
    return replacement?.[0]??fallback??(budget>0?null:start);
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
