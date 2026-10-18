import { terrainNavigation } from './terrain-navigation.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const copy=p=>({x:p.x,y:p.y});
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

export function routeLengths(path){const lengths=[0];for(let i=1;i<path.length;i++)lengths.push(lengths.at(-1)+distance(path[i-1],path[i]));return lengths;}
export function pointOnRoute(path,lengths,along){
  if(!path?.length)return null;
  along=Math.max(0,Math.min(lengths.at(-1),along));
  for(let i=1;i<path.length;i++)if(lengths[i]>=along){const length=lengths[i]-lengths[i-1];return {...mix(path[i-1],path[i],length?(along-lengths[i-1])/length:0),angle:Math.atan2(path[i].y-path[i-1].y,path[i].x-path[i-1].x),index:i};}
  return {...path.at(-1),index:path.length-1};
}
export function projectOnRoute(path,lengths,point,{near=null,span=Infinity}={}){
  let best=null;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,length=lengths[i]-lengths[i-1];if(length<.001)continue;
    const lo=near===null?0:Math.max(0,(near-span-lengths[i-1])/length),hi=near===null?1:Math.min(1,(near+span-lengths[i-1])/length);if(lo>hi)continue;
    const t=Math.max(lo,Math.min(hi,((point.x-a.x)*dx+(point.y-a.y)*dy)/(length*length))),p=mix(a,b,t),gap=distance(point,p),along=lengths[i-1]+length*t;
    if(!best||gap<best.gap)best={...p,gap,along,index:i};
  }
  return best;
}

// Quadratic corner rounding is accepted only after sweeping the same physical
// body along every sample. Narrow corners reduce the trim, never the clearance.
export function smoothNavigationRoute(path,navigation,radius,profile='ground'){
  if(path.length<3)return path.map(copy);
  const result=[copy(path[0])];
  for(let i=1;i<path.length-1;i++){
    const a=path[i-1],b=path[i],c=path[i+1],left=distance(a,b),right=distance(b,c);let curve=null;
    for(let trim=Math.min(90,left*.3,right*.3);trim>=2;trim*=.5){
      const entry=mix(b,a,trim/left),exit=mix(b,c,trim/right),samples=[entry],count=Math.max(4,Math.ceil(trim/8));
      for(let j=1;j<=count;j++){const t=j/count,u=1-t;samples.push({x:u*u*entry.x+2*u*t*b.x+t*t*exit.x,y:u*u*entry.y+2*u*t*b.y+t*t*exit.y});}
      if(navigation.clearSegment(result.at(-1),entry,radius,profile)&&samples.every((point,j)=>!j||navigation.clearSegment(samples[j-1],point,radius,profile))&&navigation.clearSegment(exit,c,radius,profile)){curve=samples;break;}
    }
    result.push(...(curve||[copy(b)]));
  }
  result.push(copy(path.at(-1)));return result;
}

// Complete, persistent route for navigation displays and guide actors. The
// authored graph chooses all world legs; ordinary terrain navigation resolves
// physical props on each leg. An unfinished/failed plan is never advertised as
// a route to the destination. This is separate from cheap local combat pursuit.
export class NavigationRoute {
  constructor(terrain,{routeBackbone=null}={}){this.terrain=terrain;this.navigation=terrainNavigation(terrain);this.routeBackbone=routeBackbone;this.path=[];this.lengths=[];this.progress=0;this.plans=0;this._revision=-1;this._retryAt=0;this._markOffset=0;}
  _plan(from,target,radius,bodyRadius,profile){
    this.plans++;
    const nav=this.navigation,backbone=this.routeBackbone?this.routeBackbone(from,target,radius,profile):nav.rift?.route(from,target,radius,profile)||[target],path=[copy(from)];
    if(!backbone?.length)return null;
    for(const endpoint of backbone){
      const start=path.at(-1);if(distance(start,endpoint)<.01)continue;
      const clearance=path.length===1?bodyRadius:radius;
      const leg=nav.clearSegment(start,endpoint,clearance,profile)&&this.terrain.isFree(endpoint.x,endpoint.y,radius,profile)?[endpoint]:nav.findLocal(start,endpoint,radius,profile,1800,clearance);
      if(!leg?.length||distance(leg.at(-1),endpoint)>.1)return null;
      for(const point of leg){if(!nav.clearSegment(path.at(-1),point,path.length===1?bodyRadius:radius,profile))return null;if(distance(path.at(-1),point)>.01)path.push(copy(point));}
    }
    if(distance(path.at(-1),target)>.1)return null;
    // A wall-contact origin may have only body clearance. Preserve that first
    // attachment; all rounded turns beyond it keep the planning margin.
    const safeOrigin=this.terrain.isFree(from.x,from.y,radius,profile);
    return safeOrigin?smoothNavigationRoute(path,nav,radius,profile):[path[0],...smoothNavigationRoute(path.slice(1),nav,radius,profile)];
  }
  update(from,target,{radius=18,bodyRadius=radius,profile='ground',time=0}={}){
    if(!finite(from)||!finite(target))return null;
    const revision=this.terrain.structureRevision||0;
    // Rendering, guide actors and spawn direction may read the same frame.
    // Share one result instead of advancing a transition on each reader.
    const key=[from.x,from.y,target.x,target.y,radius,bodyRadius,profile,time,revision].join(':');
    if(key===this._snapshotKey)return this._snapshot;
    const finish=result=>{this._snapshotKey=key;this._snapshot=result;this._lastFrom=copy(from);return result;};
    const shapeChanged=this._revision!==revision||this.radius!==radius||this.bodyRadius!==bodyRadius||this.profile!==profile;
    let targetChanged=!this.target||distance(this.target,target)>.01;
    // A moving destination can adjust its final clear leg continuously, while
    // retaining the chosen corridor and the preceding ground-arrow anchors.
    if(!shapeChanged&&targetChanged&&this.path.length>1&&distance(this.target,target)<=64){
      const before=this.path.at(-2);
      if(this.terrain.isFree(target.x,target.y,radius,profile)&&this.navigation.clearSegment(before,target,radius,profile)){
        this.path=[...this.path.slice(0,-1),copy(target)];this.lengths=routeLengths(this.path);this.target=copy(target);targetChanged=false;
      }
    }
    const changed=shapeChanged||targetChanged;
    this._time=time;
    let projection=!changed&&this.path.length>1?projectOnRoute(this.path,this.lengths,from,{near:this.progress,span:this._lastFrom?distance(from,this._lastFrom)*2+160:Infinity}):null;
    if(projection)this.progress=projection.along;
    // Reconnect locally on every movement. Distance from an old centreline is
    // not, by itself, a reason to replace a still usable complete route.
    const connected=!changed&&this.path.length?this.snapshot(from):null;
    if(connected?.complete)return finish(connected);
    const movedSinceFailure=!this._failedFrom||distance(from,this._failedFrom)>48;
    const targetMovedSinceFailure=!this._failedTarget||distance(target,this._failedTarget)>48;
    // Only unsuccessful searches are throttled. An invalid connection never
    // advertises a route through a wall while waiting for the next attempt.
    if(!shapeChanged&&time<this._retryAt&&!movedSinceFailure&&!targetMovedSinceFailure)return finish(this.unavailable());
    const oldEnd=this._markOffset+(this.lengths.at(-1)||0),hadPath=this.path.length>1;
    this.target=copy(target);this.radius=radius;this.bodyRadius=bodyRadius;this.profile=profile;this._revision=revision;
    const path=this._plan(from,target,radius,bodyRadius,profile);
    this.path=path||[];this.lengths=routeLengths(this.path);this.progress=0;
    if(path){
      // Matching distance from the unchanged endpoint preserves arrows on a
      // shared suffix when a local obstacle really does require another route.
      this._markOffset=!targetChanged&&hadPath?oldEnd-this.lengths.at(-1):0;
      this._retryAt=0;this._failedFrom=null;this._failedTarget=null;this._replannedAt=hadPath?time:null;
    }else{
      this._retryAt=time+.8;this._failedFrom=copy(from);this._failedTarget=copy(target);
    }
    return finish(this.snapshot(from));
  }
  unavailable(){return {complete:false,path:[],routePath:[],lengths:[],progress:0,target:this.target,waypoint:null};}
  _connection(from,projection){
    const total=this.lengths.at(-1),gap=projection.gap;
    if(gap<.01)return {path:[copy(from)],join:projection.along};
    // Only the nearby part bends towards the current feet. The deformation
    // reaches zero with zero slope at the join, so the far road stays still.
    const reach=Math.min(total-projection.along,Math.max(144,Math.min(384,144+gap*1.6)));
    for(const fraction of [1,.65,.3,0]){
      const span=reach*fraction,join=projection.along+span,points=[copy(from)];
      if(span<.01){
        if(this.navigation.clearSegment(from,projection,this.bodyRadius,this.profile))return {path:[copy(from),copy(projection)],join};
        continue;
      }
      const positions=new Set([join]);
      for(let along=projection.along+12;along<join;along+=12)positions.add(along);
      for(const along of this.lengths)if(along>projection.along&&along<join)positions.add(along);
      const dx=from.x-projection.x,dy=from.y-projection.y;
      let safe=true;
      for(const along of [...positions].sort((a,b)=>a-b)){
        const t=(along-projection.along)/span,w=1-t*t*(3-2*t),base=pointOnRoute(this.path,this.lengths,along);
        const next={x:base.x+dx*w,y:base.y+dy*w};
        if(!this.navigation.clearSegment(points.at(-1),next,points.length===1?this.bodyRadius:this.radius,this.profile)){safe=false;break;}
        points.push(next);
      }
      if(safe)return {path:points,join};
    }
    return null;
  }
  snapshot(from){
    if(!this.path.length)return this.unavailable();
    const projection=projectOnRoute(this.path,this.lengths,from,{near:this.progress,span:160});
    const arrived=distance(from,this.target)<10&&this.navigation.clearSegment(from,this.target,this.bodyRadius,this.profile);
    if(!projection)return arrived?{complete:true,path:[copy(from)],routePath:[copy(from)],lengths:[0],progress:0,target:this.target,waypoint:null}:this.unavailable();
    const connection=this._connection(from,projection);if(!connection)return this.unavailable();
    const prefix=connection.path,prefixLength=routeLengths(prefix).at(-1),remaining=this.path.filter((_,i)=>this.lengths[i]>connection.join+.001);
    const path=[...prefix,...remaining],lengths=routeLengths(path);
    let waypoint=null;
    for(const point of path.slice(1)){
      if(distance(from,point)<1)continue;
      if(this.navigation.clearSegment(from,point,this.bodyRadius,this.profile))waypoint=point;
      break;
    }
    if(!waypoint&&!arrived)return this.unavailable();
    return {complete:true,path,routePath:path,lengths,progress:0,target:this.target,waypoint,
      markOffset:this._markOffset+connection.join-prefixLength,
      opacity:this._replannedAt===null||this._replannedAt===undefined?1:Math.min(1,Math.max(0,(this._time-this._replannedAt)/.18))};
  }
  point(along){return pointOnRoute(this.path,this.lengths,along);}
  project(point){return projectOnRoute(this.path,this.lengths,point);}
}
