import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';
import { RiftCollision } from './dist/rift-collision.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { createEmberScenery } from './dist/worlds/ember-scenery.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { validateWorlds } from './dist/config-validation/worlds.js';
import { getWaterContours, waterIntersectsCircle, waterIntersectsCapsule } from './dist/water-geometry.js';
import { Regions } from './dist/regions.js';
import { worldNeighbors, WORLD_IDS } from './dist/world-definitions.js';

const sections=Object.fromEntries(['worlds','stages','geography','enemies','encounters','economy'].map(id=>[id,JSON.parse(readFileSync(new URL(`./dist/config/${id}.json`,import.meta.url)))]));
assert(validateWorlds(sections));
const world=sections.worlds.definitions.find(w=>w.id==='ember-realm-large'),layout=createRiftLayout('ember-realm-large'),scene=layout.emberScene;
const neighbors=worldNeighbors(WORLD_IDS.indexOf(world.id));
assert.equal(world.id,'ember-realm-large');assert.equal(world.name,'熔火之境');
assert.deepEqual(layout.bounds,{minX:-7200,minY:-5400,maxX:7200,maxY:5400});
assert.equal(scene.revision,2);assert.equal(scene.sample,false);assert.equal(layout.areas.length,17);assert.equal(layout.passages.length,23+neighbors.length);
assert.deepEqual(neighbors.map(index=>WORLD_IDS[index]).sort(),['ruins','snow']);
assert.equal(layout.passages.filter(p=>p.kind==='exit').length,neighbors.length);
assert.deepEqual(scene.groundRings,layout.boundaries);assert.deepEqual(scene.highOpenRings,layout.solidBoundaries);
assert.deepEqual(scene.bridge,scene.bridges[0]);assert.deepEqual(scene.bridges.map(b=>b.width),[160,220,240]);
assert(world.terrain.placements.default.length>0,'the volcano trial keeps its shared theme scenery recipe');
assert.equal(layout.interactions.caves.length,3);assert.equal(new Set(layout.interactions.caves.map(c=>c.caveId)).size,3);
assert.equal(layout.interactions.chests.length,10);assert.equal(layout.encounters.filter(e=>e.kind==='boss').length,2);assert(layout.encounters.filter(e=>e.kind==='guard').length>=3);
for(const mutate of [
  w=>{w.authored.emberScene.sample=true;},
  w=>{w.authored.emberScene.revision=1;},
  w=>{w.authored.emberScene.bridges[1].width=219;},
  w=>{w.authored.emberScene.groundRings[0].points[0].x+=1;},
  w=>{w.authored.emberScene.props[0].r+=1;},
  w=>{w.authored.interactions.caves[0].approach.y+=200;},
  w=>{w.authored.interactions.caves[1].caveId=w.authored.interactions.caves[0].caveId;},
  w=>{delete w.authored.plan.castle;},
  w=>{delete w.authored.plan[`portal:${neighbors[0]}`];},
  w=>{w.authored.plan['portal:999']={...w.authored.plan[`portal:${neighbors[0]}`]};},
  w=>{w.authored.emberScene.zones[0].paletteKind='incompatible';},
  w=>{w.authored.encounters.find(e=>e.kind==='boss').bossKind='invented';},
  w=>{w.authored.emberScene.surfaces[0].x=w.authored.spawn.x;w.authored.emberScene.surfaces[0].y=w.authored.spawn.y;},
  w=>{w.authored.emberScene.surfaces[0].shape='invented';},
  w=>{w.authored.emberScene.surfaces[0].rx=500;}
]){
 const altered=structuredClone(sections);mutate(altered.worlds.definitions.find(w=>w.id===world.id));
 assert.throws(()=>validateWorlds(altered),/Invalid world configuration/,'invalid shared geometry, lifecycle, identity and finite content must be rejected');
}
const island=new Island({region:'ember-realm-large'}),terrain=new Terrain({island,region:'ember-realm-large'}),outline=new RiftCollision(layout);
const props=createEmberScenery(layout);assert.equal(createEmberScenery(layout),props,'authored scenery is cached');
const placed=terrain.query(layout.bounds.minX,layout.bounds.minY,layout.bounds.maxX,layout.bounds.maxY);
assert.deepEqual(placed.map(p=>p.id).sort(),props.map(p=>p.id).sort(),'the world uses only its authored props, without adding trial scenery');
assert(props.length>=55);for(const p of props)if(p.type==='log')assert(p.halfLength>0,'a circular carrier must not invoke the default legacy log span');for(const p of props)if(p.collision&&p.halfLength>0)assert.equal(p.type,'log','every solid authored capsule must use the physical capsule carrier');assert(props.some(p=>p.emberKind==='shelter'),'the accepted mining cluster remains real scenery');
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
for(const target of neighbors){
 const portal={...layout.plan[`portal:${target}`],natural:true};
 for(const radius of [15,28,49]){
  const arrival=Regions.prototype.arrivalPoint.call({game:{terrain}},portal,radius);
  assert(arrival&&distance(arrival,portal)>=80,'return travel places the complete body beyond the portal contact zone');
  assert(terrain.isFree(arrival.x,arrival.y,radius),'arrival body is clear');
  assert(!terrain.firstBlocker(arrival.x,arrival.y,portal.x,portal.y,radius),'return travel can walk back through the same exit');
 }
}
const capsuleDistance=(p,o)=>Math.hypot(p.x-Math.max(o.x-o.halfLength,Math.min(o.x+o.halfLength,p.x)),p.y-o.y);
let samples=0,legs=0,slides=0;
// Cross-check the complete map against its only two physical sources: the
// shared land outline and actual grounded capsules. Transparency, shadows,
// roofs and tree crowns never add an enclosing implicit obstacle.
for(let x=layout.bounds.minX+32;x<layout.bounds.maxX;x+=96)for(let y=layout.bounds.minY+32;y<layout.bounds.maxY;y+=96){
 for(const r of [0,15,49]){
  const expected=outline.circleFree(x,y,r)&&props.every(o=>!o.collision||capsuleDistance({x,y},o)>=o.r+r-.001);
  assert.equal(terrain.isFree(x,y,r),expected,`no extra implicit collider at ${x},${y},r=${r}`);samples++;
 }
}
function move(from,to,r=15,profile='ground'){
 assert(terrain.isFree(from.x,from.y,r,profile),'a movement starts with its complete body free');
 const result=terrain.moveCircle(from.x,from.y,to.x-from.x,to.y-from.y,r,profile);
 assert(terrain.isFree(result.x,result.y,r,profile),'the complete body remains outside every blocker');
 assert(distance(from,result)<=distance(from,to)+.01,'movement keeps its original travel budget');legs++;return result;
}
for(const bridge of scene.bridges){
 const [a,b]=bridge.deck,center=bridge.center,half=bridge.width/2;
 for(const r of [8,15,28,49,75])for(const sign of [-1,1]){
  const from={x:(sign>0?a.x:b.x)+sign*8,y:center.y},to={x:(sign>0?b.x:a.x)-sign*8,y:center.y};
  assert(distance(move(from,to,r),to)<.02,`${bridge.id}: unchanged r${r} crosses in both directions`);
 }
 assert(!terrain.isFree(center.x,center.y,half+1),'an oversized body cannot fit the genuine bridge deck');
 for(const edge of [-1,1]){
  const y=center.y+edge*(half-15-.03),from={x:a.x+70,y},to={x:b.x-70,y};
  let at=from;
  for(let step=0;step<400&&at.x<to.x-.01;step++){
   const dx=Math.min(3,to.x-at.x),after=move(at,{x:at.x+dx,y:y+edge*.7});
   assert(after.x-at.x>dx-.25,'continuous bridge edge pressure cannot catch on independent rail seams');at=after;slides++;
  }
  assert(Math.abs(at.x-to.x)<.1&&Math.abs(at.y-to.y)<.75,'bridge edge movement reaches its opposite end');
 }
 const channel={x:center.x,y:center.y-half-100};
 assert(!terrain.isFree(channel.x,channel.y,15),'walkers cannot enter the visible low channel');
 assert(terrain.isFree(channel.x,channel.y,15,'air'),'the low chasm is open to flyers');
 assert(terrain.isFree(channel.x,channel.y,15,'projectile'),'the low channel does not gain projectile blocking');
}
assert(!terrain.isFree(-7000,-5000,15,'air'),'actual high rock masses block flight');
// Exercise both directions of every sufficiently long merged contour edge,
// for three real body sizes. A valid contact must retain tangential motion.
for(const r of [15,28,49])for(const ring of layout.boundaries)for(let i=0;i<ring.points.length;i++){
 const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],length=distance(a,b);if(length<28)continue;
 const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
 for(const side of [-1,1]){
  const nx=-uy*side,ny=ux*side,mid={x:(a.x+b.x)/2+nx*(r+.03),y:(a.y+b.y)/2+ny*(r+.03)};
  if(!terrain.isFree(mid.x,mid.y,r))continue;
  for(const direction of [-1,1]){
   const tangent={x:mid.x+ux*direction*3,y:mid.y+uy*direction*3};
   if(!terrain.isFree(tangent.x,tangent.y,r)||terrain.firstBlocker(mid.x,mid.y,tangent.x,tangent.y,r))continue;
   const after=move(mid,{x:mid.x+ux*direction*3-nx*.7,y:mid.y+uy*direction*3-ny*.7},r),forward=(after.x-mid.x)*ux*direction+(after.y-mid.y)*uy*direction;
   assert(forward>2.8,`r${r} along ${ring.id}:${i} retains real tangential motion`);slides++;
  }
 }
}
for(const surface of scene.surfaces){
 const contour=getWaterContours(surface);assert.equal(contour.outer.length,48);assert.equal(contour.holes.length,0);
 for(const p of [surface,...contour.outer])assert(terrain.isFree(p.x,p.y,49),'the complete existing lava wading surface stays on true walkable land');
 for(const p of [...Object.values(layout.plan),...layout.encounters,...layout.interactions.caves,...layout.interactions.chests])assert(!waterIntersectsCircle(surface,p.x,p.y,(p.r??90)+49),'every objective and real approach stays out of lava');
 for(const road of scene.roads)for(let i=1;i<road.points.length;i++)assert(!waterIntersectsCapsule(surface,road.points[i-1].x,road.points[i-1].y,road.points[i].x,road.points[i].y,road.width/2+49),'normal roads do not force wading damage');
}
const navigation=terrainNavigation(terrain),goals=[...new Map([...layout.areas.map(a=>({...a.center,id:'area:'+a.id})),...layout.interactions.caves.map(s=>({...s.approach,id:s.id})),...layout.interactions.chests.map(s=>({...s.approach,id:s.id})),...Object.entries(layout.plan).map(([id,p])=>({...p,id:'plan:'+id})),...layout.encounters,...scene.roads.flatMap(road=>road.points.map((p,i)=>({...p,id:`${road.id}:${i}`})))].map(p=>[`${p.x},${p.y}`,p])).values()];
for(const r of [15,28,49])for(const target of goals){
 assert(terrain.isFree(target.x,target.y,r),`${target.id} has real r${r} standing space`);
 let at=layout.spawn;
 for(let segment=0;distance(at,target)>.02&&segment<96;segment++){
  const path=navigation.find(at,target,r,'ground');assert(path?.length,`a full-body route reaches ${target.id}, r${r}`);
  const before=at;
  for(const waypoint of path){const reached=move(at,waypoint,r);assert(distance(reached,waypoint)<.02,'ordinary movement completes the planned leg');at=reached;}
  assert(distance(before,at)>.02,'successive macro-route legs make real progress');
 }
 assert(distance(at,target)<.02,`ordinary navigation reaches the actual ${target.id}, r${r}`);
}
for(const site of [...layout.interactions.caves,...layout.interactions.chests]){
 assert(!terrain.firstBlocker(site.approach.x,site.approach.y,site.x,site.y,0,'sight'),`${site.id}: the approach has an unobstructed interaction ray`);
}
console.log(JSON.stringify({worldId:world.id,sampledBodyChecks:samples,continuousSlides:slides,verifiedMovementLegs:legs,goals:goals.length,bodyRadii:[15,28,49],props:props.length,authoredEncounters:layout.encounters.length,bridges:scene.bridges.length,caves:3,chests:10}));
