import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { WORLD_IDS, worldNeighbors } from './dist/world-definitions.js';
import { portalDoor } from './dist/portal-geometry.js';
import { getWaterContours, containsWater, waterIntersectsCircle, waterIntersectsCapsule } from './dist/water-geometry.js';
import { riftPointInPolygon } from './dist/rift-collision.js';

const STEP=48;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const feet=(entity,isPlayer=false)=>({x:entity.x,y:entity.y+groundOffset(entity,isPlayer)});
const world=(region,seed)=>new Game({mode:'world',debug:true,debugWorld:region,terrain:new Terrain({region,seed,island:new Island({region,seed})})});
const population=g=>g.territories.groups.map(group=>({id:group.id,x:group.x,y:group.y,members:group.members.map(enemy=>({type:enemy.type,home:enemy.territoryHome,hp:enemy.hp}))}));

// This is an independent grid search over the completed, real world. It does
// not follow authored route links or use the AI's navigation implementation.
// Edges test the entire body sweep, so diagonal corner cutting cannot pass.
function reachablePaths(game,goals,radius=22){
  const terrain=game.terrain,island=terrain.island,b=island.bounds;
  const minX=Math.floor(b.minX/STEP),maxX=Math.ceil(b.maxX/STEP),minY=Math.floor(b.minY/STEP),maxY=Math.ceil(b.maxY/STEP),cols=maxX-minX+1,rows=maxY-minY+1;
  const states=new Uint8Array(cols*rows),parents=new Int32Array(cols*rows).fill(-1),queue=new Int32Array(cols*rows);
  const index=(x,y)=>(y-minY)*cols+x-minX;
  const point=id=>({x:(id%cols+minX)*STEP,y:(Math.floor(id/cols)+minY)*STEP});
  const free=id=>{if(!states[id]){const p=point(id);states[id]=terrain.isFree(p.x,p.y,radius)?2:1;}return states[id]>1;};
  const clear=(a,b)=>island.containsCapsule(a.x,a.y,b.x,b.y,radius)&&!terrain.firstBlocker(a.x,a.y,b.x,b.y,radius);
  const targets=new Map(),found=new Map();
  for(const [goalIndex,goal] of goals.entries()){
    assert(terrain.isFree(goal.x,goal.y,radius),`${island.region}/${island.seed}: blocked ${goal.id} for body ${radius}`);
    let candidates=0;
    const cx=Math.round(goal.x/STEP),cy=Math.round(goal.y/STEP);
    for(let x=cx-2;x<=cx+2;x++)for(let y=cy-2;y<=cy+2;y++){
      if(x<minX||x>maxX||y<minY||y>maxY)continue;
      const id=index(x,y),p=point(id);
      if(!free(id)||!clear(p,goal))continue;
      if(!targets.has(id))targets.set(id,[]);
      targets.get(id).push(goalIndex);candidates++;
    }
    assert(candidates,`${island.region}/${island.seed}: ${goal.id} has no open approach`);
  }
  const spawn=feet(game.player,true),starts=[];
  for(let x=Math.round(spawn.x/STEP)-2;x<=Math.round(spawn.x/STEP)+2;x++)for(let y=Math.round(spawn.y/STEP)-2;y<=Math.round(spawn.y/STEP)+2;y++){
    if(x<minX||x>maxX||y<minY||y>maxY)continue;const id=index(x,y);if(free(id)&&clear(spawn,point(id)))starts.push(id);
  }
  assert(starts.length,'the real player spawn has a body-safe grid approach');const start=starts.sort((a,b)=>distance(point(a),spawn)-distance(point(b),spawn))[0];
  let read=0,write=1;queue[0]=start;states[start]=3;
  while(read<write&&found.size<goals.length){
    const id=queue[read++],p=point(id),gx=id%cols+minX,gy=Math.floor(id/cols)+minY;
    for(const goal of targets.get(id)||[])if(!found.has(goal))found.set(goal,id);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){
      const x=gx+dx,y=gy+dy;if(x<minX||x>maxX||y<minY||y>maxY)continue;
      const next=index(x,y);if(states[next]===3||!free(next)||!clear(p,point(next)))continue;
      parents[next]=id;states[next]=3;queue[write++]=next;
    }
  }
  assert.equal(found.size,goals.length,`${island.region}/${island.seed}: unreachable ${goals.filter((_,i)=>!found.has(i)).map(p=>p.id).join(', ')}`);
  const paths=goals.map((goal,i)=>{const path=[goal];for(let id=found.get(i);id!==-1;id=parents[id])path.push(point(id));return [spawn,...path.reverse()];});
  // Replay the independently found route through actual swept movement. The
  // smaller player and the largest ground follower must both finish each edge
  // without a collision projection or a shortcut through an obstacle.
  const checked=new Set();let sweeps=0;
  for(const path of paths)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],key=`${a.x},${a.y}:${b.x},${b.y}`;if(checked.has(key))continue;checked.add(key);
    for(const r of [15,radius]){
      const moved=terrain.moveCircle(a.x,a.y,b.x-a.x,b.y-a.y,r);
      assert(distance(moved,b)<.001,`${island.region}/${island.seed}: movement blocks a reachable path at ${b.x},${b.y}, r=${r}`);
      assert(terrain.isFree(moved.x,moved.y,r));sweeps++;
    }
  }
  return {visited:read,sweeps};
}

const reports=[],networks=new Set();let lakeChecks=0;
const completeWorldIds=['forest','marsh','ruins','beach','city','mountain','snow','volcano','verdant-rift','clockshadow-city'];
assert.deepEqual(WORLD_IDS,[...completeWorldIds,'ember-realm-large'],'the complete ember world appends without changing the ten existing fixtures');
// Preserve every original population/loop/objective requirement on the ten
// existing maps. The complete ember world below uses its authored targets
// rather than assuming the old random vegetation and mission recipe.
for(const region of completeWorldIds)for(const seed of [0,7,17]){
  const game=world(region,seed),terrain=game.terrain,island=terrain.island,layout=island.layout;
  game.viewWidth=540;game.viewHeight=540*717/393;
  assert(layout,`${region}: authored world layout exists`);
  assert.equal(island.routes,layout.routes,'collision reservations and the visible route network share one layout');
  const node=(x,y)=>`${Math.round(x*1000)},${Math.round(y*1000)}`,nodes=new Set(),edges=new Set();
  for(const route of layout.routes){const a=node(route.ax,route.ay),b=node(route.bx,route.by);nodes.add(a);nodes.add(b);edges.add([a,b].sort().join(':'));}
  assert(edges.size>=nodes.size,'the world retains a loop instead of a tree of dead-end spokes');
  const fixed=layout.kind==='rift-forest';
  assert(layout.patches.length>=4&&layout.patches.some(patch=>patch.kind===(fixed?'sparse':'brush')),'connected terrain includes readable traversable vegetation patches');
  assert(layout.clearings.some(clearing=>clearing.kind==='secret'),'an optional exploration pocket remains available');
  assert(layout.encounters.some(clearing=>clearing.kind==='boss')&&layout.encounters.some(clearing=>clearing.kind==='guard'),'combat clearings have different purposes');
  if(seed===0)networks.add(JSON.stringify(layout.routes.map(({ax,ay,bx,by})=>[ax,ay,bx,by])));
  if(region!=='city')assert(layout.lakes.length>0,`${region}: named water terrain must actually generate`);
  assert.deepEqual(game.regions.portals.map(portal=>portal.nextRegionIndex).sort((a,b)=>a-b),worldNeighbors(game.regionIndex));
  for(const type of ['merchant','supply','occupied','castle'])assert(game.settlements.sites.some(site=>site.type===type),`${region}/${seed}: missing ${type}`);
  for(const kind of ['stormcaller','warden','dog','owl','golem'])assert(game.relicSites.sites.some(site=>site.kind===kind),`${region}/${seed}: missing ${kind} recruitment`);
  assert(game.relicSites.sites.some(site=>site.type==='stonevault'),`${region}/${seed}: optional vault retained`);
  const goals=[
    ...game.regions.portals.map(portal=>({id:portal.id,...portalDoor(portal)})),
    ...game.settlements.sites.map(site=>({id:site.id,...site.door})),
    ...game.relicSites.sites.map(site=>({id:site.id,...site.door})),
    ...layout.clearings.map(clearing=>({id:clearing.id,x:clearing.x,y:clearing.y}))
  ];
  const reachability=reachablePaths(game,goals);
  let mainSweeps=0;const natural=new Terrain({region,seed,island});
  for(const route of layout.routes){
    assert(island.containsCapsule(route.ax,route.ay,route.bx,route.by,route.r,island.shallowWidth),'reserved routes stay on dry land');
    const bounds={minX:Math.min(route.ax,route.bx)-route.r,minY:Math.min(route.ay,route.by)-route.r,maxX:Math.max(route.ax,route.bx)+route.r,maxY:Math.max(route.ay,route.by)+route.r};
    for(const water of game.environment.watersInBounds(bounds))assert(!waterIntersectsCapsule(water,route.ax,route.ay,route.bx,route.by,route.r),`${region}/${seed}: water crosses ${route.id}`);
    if(route.kind!=='main')continue;
    // Site centers can contain their intended architecture; the route network
    // itself is tested against permanent natural collision, and each actual
    // doorway has already been reached with all structure layers installed.
    assert(!natural.firstBlocker(route.ax,route.ay,route.bx,route.by,49),`${region}/${seed}: main route lacks Boss clearance`);
    const steps=Math.max(1,Math.ceil(Math.hypot(route.bx-route.ax,route.by-route.ay)/48));
    let p={x:route.ax,y:route.ay};
    for(let i=1;i<=steps;i++){
      const q={x:route.ax+(route.bx-route.ax)*i/steps,y:route.ay+(route.by-route.ay)*i/steps};
      p=natural.moveCircle(p.x,p.y,q.x-p.x,q.y-p.y,49);assert(distance(p,q)<.001,'a Boss can walk the main route');mainSweeps++;
    }
  }
  for(const boss of game.enemies.filter(enemy=>enemy.portalId)){
    const p=feet(boss);assert(terrain.isFree(p.x,p.y,boss.r),`${region}/${seed}: guardian starts in collision`);
    assert(distance(p,boss.portalHome)<.001,'guardians keep their authored arena footing');
  }
  for(const lake of layout.lakes){
    if(fixed){
      const ring=lake.points,box=ring.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
      let sampled=0;
      for(let y=box.minY+30;y<box.maxY;y+=90)for(let x=box.minX+30;x<box.maxX;x+=90){
        if(!riftPointInPolygon({x,y},ring)||(lake.holes||[]).some(h=>riftPointInPolygon({x,y},h.points||h)))continue;
        assert(!terrain.rift.circleFree(x,y,0,'ground'),'baked deep-water interior stays outside grounded terrain');
        assert(terrain.rift.circleFree(x,y,0,'air'),'deep water remains traversable by aerial actors');sampled++;
      }
      assert(sampled>0,'each authored water polygon has a physical interior');lakeChecks++;continue;
    }
    assert(lake.deep&&containsWater(lake,lake.x,lake.y));
    assert(!terrain.isFree(lake.x,lake.y,15),'deep water is physical terrain for grounded actors');
    assert(terrain.isFree(lake.x,lake.y,15,'air'),'deep water does not become an invisible aerial wall');
    const ring=getWaterContours(lake).outer;let shoreSweep=false;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),normal={x:dy/length,y:-dx/length},mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      assert(game.environment.watersInBounds({minX:a.x-1,minY:a.y-1,maxX:a.x+1,maxY:a.y+1}).some(water=>water.id===lake.id),'an unloaded far shore remains discoverable across owner cells');
      assert(terrain.query(a.x-1,a.y-1,a.x+1,a.y+1).some(obstacle=>obstacle.id===lake.id),'the physical far shore is indexed in every crossed cell');
      const start={x:mid.x+normal.x*45,y:mid.y+normal.y*45},end={x:mid.x-normal.x*45,y:mid.y-normal.y*45};
      if(shoreSweep||!terrain.isFree(start.x,start.y,15)||!containsWater(lake,end.x,end.y))continue;
      assert(terrain.firstBlocker(start.x,start.y,end.x,end.y,15),'the shoreline blocks a complete grounded sweep');
      const moved=terrain.moveCircle(start.x,start.y,end.x-start.x,end.y-start.y,15);
      assert(moved.blocked&&distance(moved,end)>20,'a large step cannot skip the shore');
      assert(!waterIntersectsCircle(lake,moved.x,moved.y,14.999),'collision leaves the whole body on the dry side');shoreSweep=true;
    }
    assert(shoreSweep,'each authored lake exposes a real, testable shore');lakeChecks++;
  }
  assert(game.territories.groups.length>=10,`${region}/${seed}: dense terrain erased most monster domains`);
  for(const group of game.territories.groups)for(const enemy of group.members){
    const p=feet(enemy);assert(terrain.isFree(p.x,p.y,enemy.r),`${region}/${seed}: domain member starts in collision`);
    assert(distance(p,enemy.territoryHome)<.001,'home refers to the real safe spawn');
  }
  assert.deepEqual(population(world(region,seed)),population(game),'population does not depend on camera size or combat randomness');
  reports.push({region,seed,goals:goals.length,territories:game.territories.groups.length,...reachability,mainSweeps});
}
assert.equal(networks.size,completeWorldIds.length,'the ten complete worlds have their own route geometry');
for(const seed of [0,7,17]){
  const game=world('ember-realm-large',seed),layout=game.terrain.island.layout;
  assert.equal(layout.worldId,'ember-realm-large');assert.equal(layout.artTheme,'ember');assert.equal(layout.emberScene.sample,false);assert.equal(layout.emberScene.revision,2);
  assert.equal(layout.areas.length,17);assert.equal(layout.passages.length,23);assert.equal(layout.passages.filter(p=>p.kind==='bridge').length,3);
  assert.equal(layout.encounters.filter(e=>e.kind==='boss').length,2);assert.equal(game.territories.groups.length,layout.encounters.length);
  assert.equal(game.settlements.sites.filter(site=>site.type!=='angel').length,4);assert.equal(game.relicSites.sites.length,8,'all fixed recruitment and exploration slots become real sites');
  assert.equal(game.regions.portals.length,0);assert.equal(game.regions.states.size,0);
  const goals=[
    ...layout.areas.map(area=>({id:`area:${area.id}`,...area.center})),
    ...game.settlements.sites.map(site=>({id:site.id,...site.door})),
    ...game.relicSites.sites.map(site=>({id:site.id,...site.door})),
    ...game.riftExploration.sites.filter(site=>site.kind!=='shortcut').map(site=>({id:site.id,x:site.x,y:site.y})),
    ...layout.clearings.map(clearing=>({id:clearing.id,x:clearing.x,y:clearing.y}))
  ];
  assert(goals.length>40,'complete-map reachability covers areas, all installed doors, fixed rewards, caves and encounters');
  const reachability=reachablePaths(game,goals);
  for(const route of layout.routes)for(const radius of [15,22,49])assert(!game.terrain.rift.firstBlocker(route.ax,route.ay,route.bx,route.by,radius),`${route.id}: actual route retains body clearance r=${radius}`);
  for(const group of game.territories.groups)for(const enemy of group.members){
    const point=feet(enemy);assert(game.terrain.isFree(point.x,point.y,enemy.r),`${group.id}: every finite enemy starts in free terrain`);
    assert(distance(point,enemy.territoryHome)<.001);
  }
  assert.deepEqual(population(world(game.worldId,seed)),population(game),'the complete authored population is independent of camera and combat randomness');
  reports.push({region:game.worldId,seed,goals:goals.length,uniqueGoalCoordinates:new Set(goals.map(point=>`${point.x},${point.y}`)).size,territories:game.territories.groups.length,...reachability});
}
console.log(JSON.stringify({worldLayout:'passed',completeWorlds:completeWorldIds.length+1,seeds:[0,7,17],bodyRadii:[15,22,49],lakeChecks,reports}));
