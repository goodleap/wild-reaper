import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { movementProfile } from './dist/height-rules.js';
import { enemyDefinition } from './dist/enemy-definitions.js';
import { TerrainNavigation, terrainNavigation, NAVIGATION_LIMITS } from './dist/terrain-navigation.js';
import { getWaterContours } from './dist/water-geometry.js';

const wall=(id,x,y,halfLength,angle=0,r=18)=>({id,type:'log',variant:'world-city-wall',x,y,halfLength,angle,r});
const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!e.isCompanion)});
const gameFor=terrain=>new Game({terrain,adventure:false,environment:false,elites:false,companions:false,settlements:false});
const actor=(point,{r=16,isCompanion=false,type='slime'}={})=>({id:1,type,x:point.x,y:point.y-groundOffset({type,r},isCompanion),r,isCompanion,speed:130,phase:0,hp:100});
function walk(game,entity,target,label,seconds=24,move=null){
  let furthest=0,steps=0;const start=foot(entity),profile=movementProfile(entity);
  for(;steps<seconds*40;steps++){
    const before=foot(entity);if(Math.hypot(before.x-target.x,before.y-target.y)<18)break;
    game._clock+=.025;if(move)move(.025);else game._moveEnemy(entity,.025,target);
    const after=foot(entity),distance=Math.hypot(after.x-before.x,after.y-before.y);
    const surge=entity.isCompanion?null:enemyDefinition(entity.type)?.surge,multiplier=surge?1+Math.max(0,Math.sin(game._clock*surge.frequency))*surge.amplitude:1;
    assert(distance<=entity.speed*.025*multiplier+.06,`${label}: movement never teleports or accelerates around obstacles`);
    assert(game.terrain.isFree(after.x,after.y,entity.r,profile),`${label}: every foot position stays collision-free`);
    furthest=Math.max(furthest,Math.hypot(after.x-start.x,after.y-start.y));
  }
  assert(steps<seconds*40,`${label}: actor reaches the target instead of sticking to a corner (${JSON.stringify(foot(entity))})`);
  return {steps,furthest};
}

// The only exit is behind the actor: local tangent steering alone repeatedly
// chooses the closed end. Both pursuit and return-home walk the same opening.
const courtyard=new Terrain({obstacles:[wall('west',-160,0,240,Math.PI/2),wall('east',160,0,240,Math.PI/2),wall('north',0,-240,160)]});
const g=gameFor(courtyard),enemy=actor({x:0,y:-100});
const outward=walk(g,enemy,{x:0,y:-430},'U courtyard pursuit');
assert(outward.furthest>400,'the actor must first leave through the south opening');
const home={x:0,y:-100},group={id:'navigation-home',members:[enemy],x:home.x,y:home.y,radius:195};
g.territories.groups=[group];g.territories.byId.set(group.id,group);
Object.assign(enemy,{territoryId:group.id,territoryHome:home,territoryState:'returning',guardReturnTarget:home});
walk(g,enemy,home,'U courtyard actual territory return',24,dt=>g.territories.updateEnemy(enemy,dt));
for(let i=0;i<12&&enemy.territoryState!=='idle';i++)g.territories.updateEnemy(enemy,.025);
assert.equal(enemy.territoryState,'idle','a returning domain monster completes its real state transition');
assert.equal(enemy.guardReturnTarget,null);
const companion=actor({x:0,y:-100},{r:22,isCompanion:true});
walk(g,companion,{x:0,y:-430},'companion follows around courtyard');
assert(!JSON.stringify(companion).includes('"_routeTerrain"')&&!JSON.stringify(companion).includes('"_terrainRoute"'),'actor snapshots never include live terrain caches');

// Overlapping forest trunks make a real continuous boundary. The route must
// turn around its end; a route through tiny spaces between crowns is invalid.
const trunks=Array.from({length:15},(_,i)=>({id:`grove:${i}`,type:'tree',x:0,y:-350+i*50,r:30}));
const forest=new Terrain({obstacles:trunks}),forestGame=gameFor(forest),hunter=actor({x:-180,y:0});
walk(forestGame,hunter,{x:180,y:0},'continuous grove detour');
walk(forestGame,hunter,{x:-180,y:0},'continuous grove homeward');

// Two corners require multiple changes of direction without diagonal cuts.
const streets=new Terrain({obstacles:[wall('block-a',0,-100,200,Math.PI/2,44),wall('block-b',260,220,200,Math.PI/2,44)]});
walk(gameFor(streets),actor({x:-180,y:0},{r:22,isCompanion:true}),{x:470,y:0},'town staggered corners');
walk(gameFor(streets),actor({x:-180,y:0},{r:49,type:'boss'}),{x:470,y:0},'large actor clearance');

// Movement profiles remain independent: a fallen trunk blocks walkers while
// an airborne ally can fly across it. High grove trunks still stop flyers.
const low=new Terrain({obstacles:[{id:'fallen',type:'log',x:0,y:0,r:18,halfLength:170,angle:Math.PI/2}]}),lowNav=terrainNavigation(low);
const from={x:-180,y:0},to={x:180,y:0};
assert(lowNav.find(from,to,20,'ground').length>1);
assert.equal(lowNav.find(from,to,20,'air').length,1);
assert(terrainNavigation(forest).find(from,to,20,'air').length>1);

// Failed searches have a hard work limit and never fabricate a route through
// a sealed room. Shared geometry caches are bounded across radius/profile use.
const sealed=new Terrain({obstacles:[wall('l',-160,0,160,Math.PI/2),wall('r',160,0,160,Math.PI/2),wall('t',0,-160,160),wall('b',0,160,160)]});
const bounded=new TerrainNavigation(sealed);
assert.equal(bounded.find({x:0,y:0},{x:400,y:0},20),null);
assert(bounded.lastExpanded<=NAVIGATION_LIMITS.expanded);
for(let i=0;i<24;i++)bounded.layer(12+i*4,i%2?'air':'ground');
assert(bounded.cacheSize.layers<=NAVIGATION_LIMITS.layers);
const crowd=new TerrainNavigation(sealed);
for(let i=0;i<160;i++)crowd.waypoint({id:i},{x:0,y:0},{x:400+i*2,y:i*3},20,'ground',1,1);
assert(crowd.searches<=NAVIGATION_LIMITS.frameSearches,'a full population cannot start hundreds of searches in one frame');
assert(crowd.frameExpanded<=NAVIGATION_LIMITS.frameExpanded,'the shared per-frame node budget is respected');
const firstFrameSearches=crowd.searches;
crowd.waypoint({id:200},{x:0,y:0},{x:600,y:0},20,'ground',2,2);
assert(crowd.searches>firstFrameSearches,'the next frame can make progress without a global cooldown');

// Reusing a nearby actor's route must validate its first segment, and an open
// gate must invalidate cached occupancy. A scene swap gets a separate cache.
const gate=new Terrain({obstacles:[]});
gate.setStructures([wall('gate',0,0,170,Math.PI/2)],'gate');
const nav=terrainNavigation(gate),route=nav.find(from,to,20);
assert(route.length>1);const searches=nav.searches;
assert(nav.find({...from,y:5},to,20));assert.equal(nav.searches,searches,'nearby actors share a verified route');
gate.setStructures([],'gate');
assert.equal(nav.find(from,to,20).length,1,'opened gates permit the new direct route');
assert(nav.free(nav.layer(20,'ground'),0,0),'opened gates invalidate previously blocked grid cells');
assert.notEqual(terrainNavigation(new Terrain({obstacles:[]})),nav,'scene transitions cannot retain another terrain cache');
for(const layer of nav.layers.values()){
  assert(layer.cells.size<=NAVIGATION_LIMITS.cells);assert(layer.edges.size<=NAVIGATION_LIMITS.edges);assert(layer.routes.size<=NAVIGATION_LIMITS.routes);
}

// Exercise the actual authored geometry, including registered site walls and
// exact deep-water contours. These actors use the production movement method.
const actual=[];
for(const region of ['forest','city','mountain','marsh']){
  const world=new Game({mode:'world',debug:true,debugWorld:region}),terrain=world.terrain,layout=terrain.island.layout;
  assert(layout,`${region}: the real world has a layout`);
  let pair=null;
  if(layout.kind==='rift-forest'){
    pair={from:{...layout.areas.find(a=>a.id==='13').center},to:{...layout.areas.find(a=>a.id==='08').center}};
    assert(!terrain.riftGateOpen('bell-shortcut'),'the closed shortcut requires walking the eastern connection');
  }else if(region==='forest'){
    const patch=layout.patches.find(p=>p.kind==='forest'&&p.density>=1),d=Math.max(patch.rx,patch.ry)+80;
    for(let i=0;i<6&&!pair;i++){
      const a=i*Math.PI/6,from={x:patch.x-Math.cos(a)*d,y:patch.y-Math.sin(a)*d},to={x:patch.x+Math.cos(a)*d,y:patch.y+Math.sin(a)*d};
      if(terrain.isFree(from.x,from.y,26)&&terrain.isFree(to.x,to.y,26)&&terrain.firstBlocker(from.x,from.y,to.x,to.y,25)?.id.startsWith('wood:'))pair={from,to};
    }
  }else if(region==='marsh'){
    const lake=layout.lakes[0],ring=getWaterContours(lake).outer;
    const outside=p=>{const d=Math.hypot(p.x-lake.x,p.y-lake.y);return {x:p.x+(p.x-lake.x)/d*65,y:p.y+(p.y-lake.y)/d*65};};
    for(let i=0;i<ring.length&&!pair;i+=6){const from=outside(ring[i]),to=outside(ring[(i+ring.length/2)%ring.length]);if(terrain.isFree(from.x,from.y,26)&&terrain.isFree(to.x,to.y,26))pair={from,to};}
    assert(terrain.firstBlocker(pair.from.x,pair.from.y,pair.to.x,pair.to.y,25)?.water,'lake pursuit is blocked by real deep water');
  }else{
    const variant=region==='city'?'world-building':'world-ridge';
    for(const obstacle of layout.obstacles.filter(o=>o.variant===variant)){
      const a=(obstacle.angle||0)+Math.PI/2,d=obstacle.r+100,from={x:obstacle.x-Math.cos(a)*d,y:obstacle.y-Math.sin(a)*d},to={x:obstacle.x+Math.cos(a)*d,y:obstacle.y+Math.sin(a)*d};
      if(terrain.isFree(from.x,from.y,26)&&terrain.isFree(to.x,to.y,26)){pair={from,to};break;}
    }
  }
  assert(pair,`${region}: a real obstruction exposes a reachable crossing pair`);
  assert(terrain.firstBlocker(pair.from.x,pair.from.y,pair.to.x,pair.to.y,25),`${region}: the fixture requires a detour`);
  const walker=actor(pair.from,{r:22}),follower=actor(pair.from,{r:22,isCompanion:true});
  const outward=walk(world,walker,pair.to,`${region} actual chase`,65);
  walk(world,walker,pair.from,`${region} actual homeward`,65);
  walk(world,follower,pair.to,`${region} actual companion`,65);
  actual.push({region,seconds:outward.steps/40,searches:terrainNavigation(terrain).searches});
}
console.log(JSON.stringify({navigation:'passed',actual,coverage:'U courtyards, continuous forests, city corners, mountain passes, deep lakes, companions, homeward routes, large bodies, flight, bounded frame work and opened gates'}));
