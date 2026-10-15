import assert from 'node:assert/strict';
import { Terrain } from './dist/terrain.js';
import { TerrainNavigation, NAVIGATION_LIMITS } from './dist/terrain-navigation.js';

const wall=(id,x,y,halfLength,angle=0,r=18)=>({id,type:'log',variant:'world-city-wall',x,y,halfLength,angle,r});
const closedRoom=()=>new Terrain({obstacles:[wall('left',-160,0,160,Math.PI/2),wall('right',160,0,160,Math.PI/2),wall('top',0,-160,160),wall('bottom',0,160,160)]});
const origin={x:0,y:0},outside={x:400,y:0},radius=18,body=15;

// Story actors use stable string IDs. A sealed room must impose a finite
// cooldown instead of spending a search every frame through NaN comparisons.
const blocked=new TerrainNavigation(closedRoom()),princess={id:'story:princess',r:body},attempts=[];
let firstDeadline;
for(let frame=0;frame<600;frame++){
  const time=frame/60,before=blocked.searches,result=blocked.waypoint(princess,origin,outside,radius,'ground',time,time);
  assert(result===null||result===origin,'an unreachable target never fabricates a walking step');
  assert(Number.isFinite(princess._terrainRoute.nextSearch),'string actor IDs retain finite retry deadlines');
  if(frame===0)firstDeadline=princess._terrainRoute.nextSearch;
  if(blocked.searches>before)attempts.push(time);
  assert(blocked.frameExpanded<=NAVIGATION_LIMITS.frameExpanded);
}
assert(attempts.length>=10&&attempts.length<=15,'a continuously blocked actor retries occasionally, not every frame or never');
for(let i=1;i<attempts.length;i++)assert(attempts[i]-attempts[i-1]>=.7-1e-8,'failed searches honor the existing retry interval');
const repeat=new TerrainNavigation(closedRoom()),sameId={id:'story:princess',r:body};
repeat.waypoint(sameId,origin,outside,radius,'ground',0,0);
assert.equal(sameId._terrainRoute.nextSearch,firstDeadline,'string staggering is deterministic');

// Existing numeric IDs retain their exact stagger, including negative IDs
// and numeric strings that the old scheduler already accepted.
for(const id of [0,1,-2,19,'3']){
  const nav=new TerrainNavigation(closedRoom()),entity={id,r:body};
  nav.waypoint(entity,origin,outside,radius,'ground',2,2);
  assert.equal(entity._terrainRoute.nextSearch,2+(.7+(Math.abs(id||0)%5)*.06));
}

// An ordinary clear pursuit must not allocate grid layers, call find(), or
// alternate between moving and waiting for a search that it does not need.
const field=new Terrain({obstacles:[]}),direct=new TerrainNavigation(field),walker={id:'story:direct',r:body};
let searchesRequested=0,point={x:0,y:0};
const find=direct.find.bind(direct);direct.find=(...args)=>{searchesRequested++;return find(...args);};
for(let frame=0;frame<180;frame++){
  const target={x:point.x+120,y:Math.sin(frame/40)*35},time=frame/60;
  assert.equal(direct.waypoint(walker,point,target,radius,'ground',time,time),target,'clear movement always gets the current target');
  const dx=target.x-point.x,dy=target.y-point.y,d=Math.hypot(dx,dy);
  const next=field.moveCircle(point.x,point.y,dx/d*4,dy/d*4,body);
  assert(Math.hypot(next.x-point.x,next.y-point.y)>3.99,'each clear movement frame advances');point=next;
}
assert.equal(searchesRequested,0);assert.equal(direct.searches,0);assert.equal(direct.plans,0);assert.equal(direct.cacheSize.layers,0);

// Turning a corner used to clear state.path, then leave the next frame held
// by the old search deadline. Both that frame and later ones must stay direct.
const cornerTerrain=new Terrain({obstacles:[wall('divider',0,0,160,Math.PI/2)]}),corner=new TerrainNavigation(cornerTerrain);
const follower={id:'story:corner',r:body},start={x:-180,y:0},target={x:180,y:0};
const first=corner.waypoint(follower,start,target,radius,'ground',0,0);
assert(first&&first!==target&&first!==start);assert(follower._terrainRoute.path?.length);
const afterPlan=corner.searches,deadline=follower._terrainRoute.nextSearch;
const changed={x:180,y:90},retained=corner.waypoint(follower,start,changed,radius,'ground',.01,.01);
assert(retained&&retained!==start,'a moving leader retains a usable detour while replanning is throttled');
assert(corner.clearSegment(start,retained,body,'ground'));assert.equal(corner.searches,afterPlan);
for(let frame=1;frame<=20;frame++){
  const visible={x:-180,y:100+frame},time=frame/60;
  assert(time<deadline);assert.equal(corner.waypoint(follower,start,visible,radius,'ground',time,time),visible);
  assert.equal(follower._terrainRoute.path,null);
}
assert.equal(corner.searches,afterPlan,'visible targets never trigger another detour search');

// A clear center line alone is insufficient: the actor's flank still hits
// this trunk. Every shortcut and returned detour must clear its full body.
const grazingTerrain=new Terrain({obstacles:[{id:'grazing',type:'tree',x:0,y:20,r:8}]}),grazing=new TerrainNavigation(grazingTerrain);
const left={x:-100,y:0},right={x:100,y:0};
assert(grazing.clearSegment(left,right,0));assert(!grazing.clearSegment(left,right,body));
const around=grazing.waypoint({id:'story:grazing',r:body},left,right,radius,'ground',0,0);
assert(around&&around!==right&&around!==left);assert(grazing.clearSegment(left,around,body));
assert(grazingTerrain.isFree(around.x,around.y,body));

// String populations share the same frame work cap and finite short retries
// when other actors have already consumed that frame's budget.
const crowd=new TerrainNavigation(closedRoom()),members=Array.from({length:160},(_,i)=>({id:`story:crowd:${i}`,r:body}));
for(const member of members){
  crowd.waypoint(member,origin,outside,radius,'ground',1,1);
  assert(Number.isFinite(member._terrainRoute.nextSearch));
}
assert(crowd.searches<=NAVIGATION_LIMITS.frameSearches);assert(crowd.frameExpanded<=NAVIGATION_LIMITS.frameExpanded);
assert(members.at(-1)._terrainRoute.nextSearch>=1.06&&members.at(-1)._terrainRoute.nextSearch<=1.105+1e-8);
const numericDeferred={id:-7,r:body};crowd.waypoint(numericDeferred,origin,outside,radius,'ground',1,1);
assert.equal(numericDeferred._terrainRoute.nextSearch,1+(.06+(7%4)*.015),'budget-deferred numeric actors retain the old short retry schedule');
const spent=crowd.searches;crowd.waypoint(members.at(-1),origin,outside,radius,'ground',1.2,1.2);
assert(crowd.searches>spent,'deferred actors can search in a later frame');
console.log(JSON.stringify({navigationFollowThrottle:'passed',blockedAttempts:attempts.length,coverage:'finite stable string IDs, unchanged numeric staggering, continuous direct travel, full-body clearance, moving-target fallback and shared frame budget'}));
