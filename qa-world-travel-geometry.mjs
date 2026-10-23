import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { getConfigSection } from './dist/content-config.js';
import { groundOffset } from './dist/terrain.js';
import { NavigationRoute } from './dist/navigation-route.js';

const travel=getConfigSection('worlds').travel;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let routes=0,endpoints=0,samples=0;
function completeRoute(game,from,to,label){
  assert(game.terrain.isFree(from.x,from.y,18),`${label}: start has physical clearance`);
  assert(game.terrain.isFree(to.x,to.y,18),`${label}: destination has physical clearance`);
  const result=new NavigationRoute(game.terrain).update(from,to,{radius:18,bodyRadius:18});
  assert(result?.complete&&result.path?.length,`${label}: complete real navigation route`);
  assert(distance(result.path.at(-1),to)<.05,`${label}: route reaches the exact destination`);
  let previous=from;
  for(const p of result.path){
    assert(!game.terrain.firstBlocker(previous.x,previous.y,p.x,p.y,18),`${label}: route never crosses a solid object`);
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
  for(const edge of travel.connections.filter(c=>c.from===region.worldId||c.to===region.worldId)){
    const target=edge.from===region.worldId?edge.to:edge.from,endpoint=edge.endpoints[region.worldId];
    assert(distance(core,endpoint)>core.radius+500,`${edge.id}: exits belong to wilderness`);
    const passage=layout.passages.find(p=>p.id===`travel:${target}`);
    assert(passage&&passage.from===endpoint.areaId&&passage.kind==='exit',`${edge.id}: preview and terrain share the approach`);
    assert(passage.width>=endpoint.transition.width+50,`${edge.id}: accents fit inside the road`);
    const area=layout.areas.find(a=>a.id===endpoint.areaId);
    completeRoute(game,area.center,endpoint,`${region.worldId}→${target}`);
    completeRoute(game,endpoint,area.center,`${region.worldId}←${target}`);
    const d=endpoint.arrivalDirection;
    for(let along=0;along<=endpoint.transition.length;along+=20){
      const p={x:endpoint.x+d.x*along,y:endpoint.y+d.y*along};
      assert(game.terrain.isFree(p.x,p.y,18),`${region.worldId}→${target}: transition ${along} remains walkable`);
      samples++;
    }
    const portal=game.regions.portals.find(p=>p.nextRegion.id===target);
    assert(portal&&distance(portal,endpoint)<.01,`${edge.id}: live entrance uses the authored point`);
    assert(game.terrain.isFree(endpoint.x+d.x*140,endpoint.y+d.y*140,18),`${edge.id}: arrival clears the transfer trigger`);
    endpoints++;
  }
}
assert.equal(endpoints,travel.connections.length*2);
console.log(`World travel geometry: ${travel.regions.length} safe cores, ${routes} full routes, ${endpoints} wilderness entrances, ${samples} transition samples passed.`);
