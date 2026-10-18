import { riftPointInPolygon } from './rift-collision.js';
import { blocksObstacle } from './height-rules.js';
// The authored region/entrance graph chooses the large detour. The existing
// bounded grid search handles only the next ordinary walking leg.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const same=(a,b)=>!!a&&!!b&&distance(a,b)<.01;
function pointSegmentDistanceSq(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return (p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2;}
function segmentDistanceSq(a,b,c,d){
  const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10){const t=((c.x-a.x)*vy-(c.y-a.y)*vx)/den,s=((c.x-a.x)*uy-(c.y-a.y)*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
  return Math.min(pointSegmentDistanceSq(a,c,d),pointSegmentDistanceSq(b,c,d),pointSegmentDistanceSq(c,a,b),pointSegmentDistanceSq(d,a,b));
}
export class RiftNavigation{
  constructor(terrain){
    this.terrain=terrain;this.layout=terrain.island.layout;this.gates=this.layout.passages.filter(p=>p.gateId);this.nodes=[];this.links=new Map();this.groups=[];this.edgeCache=new Map();
    const add=(id,point)=>{const node={id,x:point.x,y:point.y};this.nodes.push(node);this.links.set(id,[]);return node;};
    this.areas=new Map(this.layout.areas.map(area=>[area.id,add(`area:${area.id}`,area.center)]));
    const link=(a,b)=>{if(a.id===b.id)return;const cost=distance(a,b);this.links.get(a.id).push({node:b,cost});this.links.get(b.id).push({node:a,cost});};
    for(const passage of this.layout.passages){
      const group={points:passage.points,nodes:[]};this.groups.push(group);
      const points=passage.waypoints||[],from=this.areas.get(passage.from),to=this.areas.get(passage.to)??add(`${passage.id}:end`,points.at(-1));let previous=from;group.nodes.push(from,to);
      for(const [i,point] of points.entries()){
        const next=same(point,from)?from:same(point,to)?to:add(`${passage.id}:${i}`,point);
        group.nodes.push(next);link(previous,next);previous=next;
      }
      link(previous,to);
    }
    for(const area of this.layout.areas)this.groups.push({points:area.points,nodes:this.nodes.filter(node=>riftPointInPolygon(node,area.points))});
  }
  nearby(point){const nodes=new Set();for(const group of this.groups)if(riftPointInPolygon(point,group.points))for(const node of group.nodes)nodes.add(node);return nodes.size?nodes:new Set([...this.nodes].sort((a,b)=>distance(point,a)-distance(point,b)).slice(0,16));}
  edgeClear(a,b,r,profile){
    const radius=Math.ceil(r),key=`${profile}:${radius}:${a.id}:${b.id}`;
    if(!this.edgeCache.has(key)){this.edgeCache.set(key,!this.terrain.rift.hasBlocker(a.x,a.y,b.x,b.y,radius,profile));if(this.edgeCache.size>3000)this.edgeCache.delete(this.edgeCache.keys().next().value);}
    // Only immutable outlines are cached. A door constrains the legs that
    // physically touch it, including rounded endcaps, in its current state.
    return this.edgeCache.get(key)&&this.gatesClear(a,b,radius,profile);
  }
  gatesClear(a,b,r,profile){
    if(profile==='overhead')return true;
    for(const passage of this.gates){
      if(this.terrain.riftGateOpen(passage.gateId))continue;
      const gate=passage.gate;
      if(segmentDistanceSq(a,b,{x:gate.ax,y:gate.ay},{x:gate.bx,y:gate.by})<(r+(gate.r??16))**2)return false;
    }
    // Dynamic route barriers participate in the same large-scale graph as
    // authored gates. Local steering alone cannot find a kilometre-long detour.
    if(this._barrierRevision!==this.terrain.structureRevision){this._barrierRevision=this.terrain.structureRevision;this._routeBarriers=(this.terrain._structures||[]).filter(barrier=>barrier.navigationBarrier);}
    for(const barrier of this._routeBarriers||[]){
      if(!blocksObstacle(barrier,profile))continue;
      const dx=Math.cos(barrier.angle||0)*(barrier.halfLength||0),dy=Math.sin(barrier.angle||0)*(barrier.halfLength||0);
      if(segmentDistanceSq(a,b,{x:barrier.x-dx,y:barrier.y-dy},{x:barrier.x+dx,y:barrier.y+dy})<(r+(barrier.r||0))**2)return false;
    }
    return true;
  }
  clear(a,b,r,profile){return !this.terrain.rift.hasBlocker(a.x,a.y,b.x,b.y,r,profile)&&this.gatesClear(a,b,r,profile);}
  route(start,target,r,profile){
    if(this.clear(start,target,r,profile))return [target];
    const frontier=[],costs=new Map(),parents=new Map(),targetLinks=new Map();
    for(const node of this.nearby(start)){
      if(this.clear(start,node,r,profile)){const cost=distance(start,node);costs.set(node.id,cost);frontier.push({node,cost});parents.set(node.id,null);}
    }
    for(const node of this.nearby(target))if(this.clear(node,target,r,profile))targetLinks.set(node.id,distance(node,target));
    let best=null,bestCost=Infinity;
    while(frontier.length){
      frontier.sort((a,b)=>b.cost-a.cost);const current=frontier.pop();if(current.cost!==costs.get(current.node.id)||current.cost>=bestCost)continue;
      const final=targetLinks.get(current.node.id);if(final!==undefined&&current.cost+final<bestCost){best=current.node;bestCost=current.cost+final;}
      for(const edge of this.links.get(current.node.id)){
        if(!this.edgeClear(current.node,edge.node,r,profile))continue;
        const cost=current.cost+edge.cost;if(cost>=(costs.get(edge.node.id)??Infinity))continue;
        costs.set(edge.node.id,cost);parents.set(edge.node.id,current.node);frontier.push({node:edge.node,cost});
      }
    }
    if(!best)return null;
    const route=[target];for(let node=best;node;node=parents.get(node.id))route.push({x:node.x,y:node.y});route.reverse();
    // Only outline-validated shortcuts are accepted. Decorative props and
    // occupied doorways are handled during each short local search below.
    const path=[];let anchor=start,index=0;
    while(index<route.length){let end=route.length-1;while(end>index&&!this.clear(anchor,route[end],r,profile))end--;if(distance(anchor,route[end])>.01)path.push(route[end]);anchor=route[end];index=end+1;}
    return path;
  }
}
