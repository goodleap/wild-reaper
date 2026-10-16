import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain,groundOffset } from './dist/terrain.js';
import { NavigationRoute,pointOnRoute } from './dist/navigation-route.js';
import { storyRouteMarks } from './dist/story-guidance.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const wall=(id,x,y,halfLength,angle=0,r=16)=>({id,type:'log',variant:'world-city-wall',x,y,halfLength,angle,r});
function verifyPath(route,body=19){
  assert(route.path.length>1);
  for(let i=1;i<route.path.length;i++)assert(route.navigation.clearSegment(route.path[i-1],route.path[i],i===1?15:body,'ground'),`complete route segment ${i} has body clearance`);
}
function walk(terrain,from,to,hz=60){
  const route=new NavigationRoute(terrain),actor={heroId:'traveler',r:15,x:from.x,y:from.y-19.8},game={terrain};
  let frames=0,maxMs=0,initialMs=0,maximumDeviation=0;
  for(;frames<hz*120;frames++){
    const foot={x:actor.x,y:actor.y+groundOffset(actor,true)},time=frames/hz;
    if(distance(foot,to)<11)break;
    const start=performance.now(),guide=route.update(foot,to,{radius:19,bodyRadius:15,time}),elapsed=performance.now()-start;
    if(!frames)initialMs=elapsed;else maxMs=Math.max(maxMs,elapsed);
    assert(guide.complete&&guide.waypoint,'every movement frame retains a full usable route');
    assert(distance(guide.routePath.at(-1),to)<.01,'route reaches the true endpoint');
    maximumDeviation=Math.max(maximumDeviation,route.project(foot).gap);
    const next=guide.waypoint,d=distance(foot,next),travel=Math.min(d,320/hz);
    Game.prototype._moveEntity.call(game,actor,(next.x-foot.x)/d*travel,(next.y-foot.y)/d*travel,true);
    assert(terrain.isFree(actor.x,actor.y+groundOffset(actor,true),actor.r,'ground'));
  }
  assert(frames<hz*120,'following only the supplied guidance actually reaches the destination');
  assert.equal(route.plans,1,'normal route following never replans at bends');
  verifyPath(route);
  // Timings are generous enough for shared CI but detect accidentally invoking
  // a full search every frame. The exact plan-count assertion is deterministic.
  assert(initialMs<250&&maxMs<50,'route planning and cached advancement stay bounded');
  return {seconds:+(frames/hz).toFixed(2),plans:route.plans,length:+route.lengths.at(-1).toFixed(1),initialMs:+initialMs.toFixed(2),cachedMaxMs:+maxMs.toFixed(2),maximumDeviation:+maximumDeviation.toFixed(2),route};
}

const courtyard=new Terrain({obstacles:[wall('west',-160,0,240,Math.PI/2),wall('east',160,0,240,Math.PI/2),wall('north',0,-240,160)]});
const detour=walk(courtyard,{x:0,y:-100},{x:0,y:-430});
assert(detour.length>1000,'the complete route goes around the courtyard instead of advertising the short blocked direction');
assert(detour.route.path.length>10,'open corners are represented by collision-checked curves');
const stable=detour.route,point=pointOnRoute(stable.path,stable.lengths,300),original=stable.path;
stable.update(point,{x:0,y:-430},{radius:19,bodyRadius:15,time:10});
for(const offset of [-2,2,-1,1,0]){
  stable.update({x:point.x+offset,y:point.y},{x:0,y:-430},{radius:19,bodyRadius:15,time:10.1});
  assert.equal(stable.path,original,'small foot movement retains the exact curve and side of obstacles');
}

// Exact wall contact remains a valid starting point; only its first attachment
// uses actual body size, subsequent corners retain the wider planning margin.
const contact=new Terrain({obstacles:[wall('contact',0,0,140,Math.PI/2)]});
const wallStart=walk(contact,{x:-31.1,y:0},{x:150,y:0});

// A cached path on the other side of a thin wall is not a valid connection,
// even if the foot moved less than the retry distance while a plan is cooling.
const divider=new Terrain({obstacles:[wall('divider',0,0,140,Math.PI/2,1)]}),attached=new NavigationRoute(divider);
assert(attached.update({x:-17,y:0},{x:-100,y:0},{radius:19,bodyRadius:15,time:0}).complete);
const crossed=attached.update({x:17,y:0},{x:-100,y:0},{radius:19,bodyRadius:15,time:.1});
assert.equal(crossed.complete,false,'blocked attachment cannot advertise the stale complete route during retry cooldown');
assert.deepEqual(storyRouteMarks(crossed),[]);
const recovered=attached.update({x:17,y:0},{x:-100,y:0},{radius:19,bodyRadius:15,time:1});
assert(recovered.complete&&recovered.path.some(point=>Math.abs(point.y)>150),'replanning later restores an actual detour round the divider');

const sealed=new Terrain({obstacles:[wall('left',-100,0,100,Math.PI/2),wall('right',100,0,100,Math.PI/2),wall('top',0,-100,100),wall('bottom',0,100,100)]});
const impossible=new NavigationRoute(sealed);
for(let frame=0;frame<120;frame++){
  const result=impossible.update({x:250,y:0},{x:0,y:0},{radius:19,bodyRadius:15,time:frame/60});
  assert.equal(result.complete,false);assert.deepEqual(storyRouteMarks(result),[],'an unreachable destination never gets a fake guidance ribbon');
}
assert(impossible.plans<=3,'unreachable routes retry at a bounded cadence instead of blocking every frame');

const game=new Game({mode:'world',debug:true,debugWorld:'forest'}),layout=game.terrain.island.layout;
const forest=walk(game.terrain,layout.areas.find(a=>a.id==='01').center,layout.areas.find(a=>a.id==='03').center);
assert(forest.length>2200,'full route spans multiple real world areas and passages');
const ribbon=storyRouteMarks({routePath:forest.route.path,lengths:forest.route.lengths,progress:0,kind:'travel'});
assert(ribbon.length>45,'offscreen route data retains guidance all the way to the endpoint');
game.dispose();
for(const result of [detour,wallStart,forest])delete result.route;
console.log(JSON.stringify({navigationRoute:'passed',courtyard:detour,wallContact:wallStart,actualForest:forest,failedPlans:impossible.plans,coverage:'complete destination reach; collision-safe curved turns; shared physical walking; stationary world marks; one cached plan; wall-contact attachment; unreachable destination retry budget'}));
