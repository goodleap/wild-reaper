import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { getConfigSection } from './dist/content-config.js';
import { groundOffset } from './dist/terrain.js';
import { NavigationRoute } from './dist/navigation-route.js';
import { portalDoor, portalEntranceContains, portalExitGeometry } from './dist/portal-geometry.js';

const travel=getConfigSection('worlds').travel;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let routes=0,endpoints=0,samples=0;
function completeRoute(game,from,to,label,radius=18){
  assert(game.terrain.isFree(from.x,from.y,radius),`${label}: start has physical clearance`);
  assert(game.terrain.isFree(to.x,to.y,radius),`${label}: destination has physical clearance`);
  const result=new NavigationRoute(game.terrain).update(from,to,{radius,bodyRadius:radius});
  assert(result?.complete&&result.path?.length,`${label}: complete real navigation route`);
  assert(distance(result.path.at(-1),to)<.05,`${label}: route reaches the exact destination`);
  let previous=from;
  for(const p of result.path){
    assert(!game.terrain.firstBlocker(previous.x,previous.y,p.x,p.y,radius),`${label}: route never crosses a solid object`);
    previous=p;
  }
  routes++;
}
for(const region of travel.regions){
  const game=new Game({mode:'world',worldId:region.worldId}),layout=game.terrain.island.layout,core=region.core;
  const door={x:core.waypoint.x,y:core.waypoint.y+30};
  completeRoute(game,{x:game.player.x,y:game.player.y+groundOffset(game.player,true)},door,`${region.worldId} spawn→waypoint`);
  for(const facility of core.facilities){
    const goal={x:facility.x,y:facility.y+30};
    completeRoute(game,door,goal,`${region.worldId} ${facility.kind}`);
    assert(distance(core,goal)<core.radius-18,'all service doors lie in the safe core');
  }
  completeRoute(game,core.spawn,door,`${region.worldId} spawn r24`,24);
  for(const facility of core.facilities){
    completeRoute(game,door,{x:facility.x,y:facility.y+30},`${region.worldId} ${facility.kind} r24`,24);
    const perimeter=[...Array.from({length:9},(_,i)=>facility.x-facility.width/2+i*facility.width/8).flatMap(x=>[{x,y:facility.y-facility.depth-25},{x,y:facility.y+25}]),
      ...Array.from({length:7},(_,i)=>facility.y-facility.depth+i*facility.depth/6).flatMap(y=>[{x:facility.x-facility.width/2-25,y},{x:facility.x+facility.width/2+25,y}])];
    for(const p of perimeter){
      const blocker=game.terrain.firstBlocker(p.x,p.y,p.x,p.y,24);
      assert(!blocker||blocker.riftBoundary,`${region.worldId} ${facility.kind}: freestanding structures leave a body-wide lane; authored cliff backs remain solid`);
    }
    for(const x of [facility.x-facility.width/2,facility.x,facility.x+facility.width/2])for(const y of [facility.y-facility.depth,facility.y-facility.depth/2,facility.y]){
      assert(game.terrain.rift.circleFree(x,y,0,'ground'),`${region.worldId} ${facility.kind}: complete foundation lies on existing land`);
      assert(distance(core,{x,y})<core.radius-18,`${region.worldId} ${facility.kind}: whole foundation stays in town`);
    }
  }
  for(const [index,street] of core.ground.streets.entries())for(const radius of [18,24])for(let n=1;n<street.points.length;n++){
    const a=street.points[n-1],b=street.points[n];
    assert(!game.terrain.firstBlocker(a.x,a.y,b.x,b.y,radius),`${region.worldId} street ${index}: r${radius} can walk the complete paved centre line`);
  }
  for(const passage of layout.passages.filter(p=>p.kind!=='exit'&&(p.from===core.areaId||p.to===core.areaId)))for(let n=1;n<passage.waypoints.length;n++){
    const a=passage.waypoints[n-1],b=passage.waypoints[n],blocker=game.terrain.firstBlocker(a.x,a.y,b.x,b.y,24);
    assert(!blocker||!String(blocker.id).includes('foundation'),`${region.worldId} ${passage.id}: town buildings keep the original main road clear`);
  }
  assert(layout.encounters.every(e=>distance(e,core)>=core.radius+e.r),`${region.worldId}: every authored encounter remains outside town`);
  for(const edge of travel.connections.filter(c=>c.from===region.worldId||c.to===region.worldId)){
    const target=edge.from===region.worldId?edge.to:edge.from,endpoint=edge.endpoints[region.worldId];
    assert(distance(core,endpoint)>core.radius+500,`${edge.id}: exits belong to wilderness`);
    const passage=layout.passages.find(p=>p.id===`travel:${target}`);
    assert(passage&&passage.from===endpoint.areaId&&passage.kind==='exit',`${edge.id}: preview and terrain share the approach`);
    assert(passage.width>=endpoint.transition.width+50,`${edge.id}: accents fit inside the road`);
    const area=layout.areas.find(a=>a.id===endpoint.areaId);
    const portal=game.regions.portals.find(p=>p.nextRegion.id===target),entrance=portalDoor(portal),exit=portalExitGeometry(portal);
    completeRoute(game,area.center,entrance,`${region.worldId}→${target}`);
    completeRoute(game,entrance,area.center,`${region.worldId}←${target}`);
    assert(exit&&exit.halfWidth*2===passage.width,`${edge.id}: the exit trigger spans the complete road`);
    const d=endpoint.arrivalDirection;
    for(let along=24;along<=endpoint.transition.length;along+=20){
      const p={x:endpoint.x+d.x*along,y:endpoint.y+d.y*along};
      assert(game.terrain.isFree(p.x,p.y,18),`${region.worldId}→${target}: transition ${along} remains walkable`);
      samples++;
    }
    assert(portal&&distance(portal,endpoint)<.01,`${edge.id}: live entrance uses the authored point`);
    const arrival=game.regions.arrivalPoint(portal,game.player.r);
    assert(arrival&&game.terrain.isFree(arrival.x,arrival.y,game.player.r+4)&&!portalEntranceContains(portal,arrival,game.player.r+24),`${edge.id}: arrival clears the complete transfer strip`);
    endpoints++;
  }
}
assert.equal(endpoints,travel.connections.length*2);
console.log(`World travel geometry: ${travel.regions.length} safe cores, ${routes} full routes, ${endpoints} wilderness entrances, ${samples} transition samples passed.`);
