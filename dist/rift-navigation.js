import { riftPointInPolygon } from './rift-collision.js';
// The authored region/entrance graph chooses the large detour. The existing
// bounded grid search handles only the next ordinary walking leg.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const same=(a,b)=>!!a&&!!b&&distance(a,b)<.01;
export class RiftNavigation{
  constructor(terrain){
    this.terrain=terrain;this.layout=terrain.island.layout;this.nodes=[];this.links=new Map();this.groups=[];this.edgeCache=new Map();
    const add=(id,point)=>{const node={id,x:point.x,y:point.y};this.nodes.push(node);this.links.set(id,[]);return node;};
    this.areas=new Map(this.layout.areas.map(area=>[area.id,add(`area:${area.id}`,area.center)]));
    const link=(a,b,gateId)=>{if(a.id===b.id)return;const cost=distance(a,b);this.links.get(a.id).push({node:b,cost,gateId});this.links.get(b.id).push({node:a,cost,gateId});};
    for(const passage of this.layout.passages){
      const group={points:passage.points,nodes:[]};this.groups.push(group);
      const points=passage.waypoints||[],from=this.areas.get(passage.from),to=this.areas.get(passage.to)??add(`${passage.id}:end`,points.at(-1));let previous=from;group.nodes.push(from,to);
      for(const [i,point] of points.entries()){
        const next=same(point,from)?from:same(point,to)?to:add(`${passage.id}:${i}`,point);
        group.nodes.push(next);link(previous,next,passage.gateId);previous=next;
      }
      link(previous,to,passage.gateId);
    }
    for(const area of this.layout.areas)this.groups.push({points:area.points,nodes:this.nodes.filter(node=>riftPointInPolygon(node,area.points))});
  }
  nearby(point){const nodes=new Set();for(const group of this.groups)if(riftPointInPolygon(point,group.points))for(const node of group.nodes)nodes.add(node);return nodes.size?nodes:new Set([...this.nodes].sort((a,b)=>distance(point,a)-distance(point,b)).slice(0,16));}
  edgeClear(a,b,r,profile){
    const key=`${profile}:${Math.ceil(r)}:${a.id}:${b.id}`;if(this.edgeCache.has(key))return this.edgeCache.get(key);
    const clear=!this.terrain.rift.firstBlocker(a.x,a.y,b.x,b.y,Math.ceil(r),profile);this.edgeCache.set(key,clear);if(this.edgeCache.size>3000)this.edgeCache.delete(this.edgeCache.keys().next().value);return clear;
  }
  clear(a,b,r,profile){
    if(this.terrain.rift.firstBlocker(a.x,a.y,b.x,b.y,r,profile))return false;
    for(const passage of this.layout.passages){
      if(!passage.gateId||this.terrain.riftGateOpen(passage.gateId))continue;
      const gate=passage.gate,dx=gate.bx-gate.ax,dy=gate.by-gate.ay,den=(b.x-a.x)*dy-(b.y-a.y)*dx;
      if(Math.abs(den)>1e-9){const t=((gate.ax-a.x)*dy-(gate.ay-a.y)*dx)/den,s=((gate.ax-a.x)*(b.y-a.y)-(gate.ay-a.y)*(b.x-a.x))/den;if(t>=0&&t<=1&&s>=0&&s<=1)return false;}
      // Actual full-body gate clearance is checked by the local planner. The
      // graph also rejects short legs lying alongside the closed crossbar.
      const p=this.terrain._structures.find(p=>p.id===`rift-gate:${passage.gateId}`);
      if(p&&[a,b].some(q=>{const near=this.terrain.closestPoint(p,q.x,q.y);return Math.hypot(near.x-q.x,near.y-q.y)<r+p.r;}))return false;
    }
    return true;
  }
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
        if(edge.gateId&&!this.terrain.riftGateOpen(edge.gateId)||!this.edgeClear(current.node,edge.node,r,profile))continue;
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
