import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { RiftCollision } from './dist/rift-collision.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { createEmberScenery } from './dist/worlds/ember-scenery.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { validateWorlds } from './dist/config-validation/worlds.js';

const sections=Object.fromEntries(['worlds','stages','geography','enemies','encounters','economy'].map(id=>[id,JSON.parse(readFileSync(new URL(`./dist/config/${id}.json`,import.meta.url)))]));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(digest(sections.worlds.definitions.slice(0,10)),'c1d617ff5f2783b37bb2867754917d5671b7ca1e37012a56648886d8102df628','all existing maps retain their complete definitions');
assert(validateWorlds(sections));
const world=sections.worlds.definitions.at(-1),layout=createRiftLayout('ember-realm-large'),scene=layout.emberScene;
assert.equal(world.id,'ember-realm-large');assert.equal(world.name,'熔火之境·区域样板');
assert.deepEqual(layout.bounds,{minX:-7200,minY:-5400,maxX:7200,maxY:5400});
assert.equal(scene.sample,true);assert.equal(layout.areas.length,2);assert.equal(layout.encounters.length,1);
assert.deepEqual(scene.groundRings,layout.boundaries);assert.deepEqual(scene.highOpenRings,layout.solidBoundaries);
assert.deepEqual(scene.bridge.points,layout.passages[0].points);assert.equal(scene.bridge.width,160);
assert.deepEqual(world.terrain.placements,{default:[]});assert.equal(world.environment.hazard,null);
for(const mutate of [
  w=>{w.authored.emberScene.sample=false;},
  w=>{w.authored.encounters[0].kind='boss';},
  w=>{w.authored.emberScene.bridge.width=159;},
  w=>{w.authored.emberScene.groundRings[0].points[0].x+=1;},
  w=>{w.authored.emberScene.props[0].r+=1;},
  w=>{w.authored.interactions.caves[0].approach.y+=200;},
  w=>{w.authored.plan.castle={x:0,y:0,r:150};}
]){
  const altered=structuredClone(sections);mutate(altered.worlds.definitions.at(-1));
  assert.throws(()=>validateWorlds(altered),/Invalid world configuration/,'sample geometry and lifecycle constraints reject invalid content');
}

const island=new Island({region:'ember-realm-large'}),terrain=new Terrain({island,region:'ember-realm-large'}),outline=new RiftCollision(layout);
const props=createEmberScenery(layout);assert.equal(createEmberScenery(layout),props,'authored scenery is cached');
assert.equal(props.length,47);assert.equal(props.filter(p=>p.collision).length,36);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const capsuleDistance=(p,o)=>Math.hypot(p.x-Math.max(o.x-o.halfLength,Math.min(o.x+o.halfLength,p.x)),p.y-o.y);
let samples=0,legs=0,slides=0;
// Compare independent grounded body capsules with the production collision
// query. This does not replace review of their normal-size visible drawings.
for(let x=scene.sampleBounds.minX;x<=scene.sampleBounds.maxX;x+=24)for(let y=scene.sampleBounds.minY;y<=scene.sampleBounds.maxY;y+=24){
  for(const r of [0,15]){
    const expected=outline.circleFree(x,y,r)&&props.every(o=>!o.collision||capsuleDistance({x,y},o)>=o.r+r-.001);
    assert.equal(terrain.isFree(x,y,r),expected,`no extra implicit collider at ${x},${y},r=${r}`);samples++;
  }
}
function move(from,to,r=15,profile='ground'){
  assert(terrain.isFree(from.x,from.y,r,profile),'movement begins with a full free body');
  const result=terrain.moveCircle(from.x,from.y,to.x-from.x,to.y-from.y,r,profile);
  assert(terrain.isFree(result.x,result.y,r,profile),'movement ends with the full body free');
  assert(distance(from,result)<=distance(from,to)+.01,'movement preserves its original travel budget');
  legs++;return result;
}
for(const r of [8,15,28,49,75])for(const sign of [-1,1]){
  const from={x:-600*sign,y:600},to={x:600*sign,y:600};
  assert(distance(move(from,to,r),to)<.02,`unchanged ${r}-radius body can cross the bridge in either direction`);
}
assert(!terrain.isFree(0,600,81),'the actual 160-unit deck rejects a body larger than its passage');
assert(!terrain.isFree(0,430,15),'walkers cannot walk off the visible bridge bank');
assert(terrain.isFree(0,430,15,'air'),'the low lava channel is not a high wall for flyers');
assert(terrain.isFree(0,430,15,'projectile'),'the low channel does not add projectile blocking');
assert(!terrain.isFree(-3000,0,15,'air'),'unmade surrounding land is a visible continuous high rock mass');

// Hold movement into both sides of every usable contour segment. Long merged
// faces and their short corner segments use the same full-body slide solver.
for(const ring of layout.boundaries){
  for(let i=0;i<ring.points.length;i++){
    const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],length=distance(a,b);if(length<28)continue;
    const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
    for(const side of [-1,1]){
      const nx=-uy*side,ny=ux*side,mid={x:(a.x+b.x)/2+nx*15.03,y:(a.y+b.y)/2+ny*15.03};
      if(!terrain.isFree(mid.x,mid.y,15))continue;
      for(const direction of [-1,1]){
        const to={x:mid.x+ux*direction*3-nx*.7,y:mid.y+uy*direction*3-ny*.7};
        const after=move(mid,to),forward=(after.x-mid.x)*ux*direction+(after.y-mid.y)*uy*direction;
        assert(forward>2.8,'holding along a clear continuous edge does not stall');slides++;
      }
    }
  }
}

const navigation=terrainNavigation(terrain);
const goals=[...scene.roads.flatMap(road=>road.points),...layout.interactions.caves.map(s=>s.approach),...layout.interactions.chests.map(s=>s.approach),layout.encounters[0]];
for(const r of [15,28,49])for(const target of goals){
  assert(terrain.isFree(target.x,target.y,r),'an exploration or interaction goal retains real standing space');
  let at=layout.spawn;
  for(let segment=0;distance(at,target)>.02&&segment<32;segment++){
    const path=navigation.find(at,target,r,'ground');assert(path?.length,'an actual full-body route reaches every retained goal');
    const before=at;
    for(const waypoint of path){const reached=move(at,waypoint,r);assert(distance(reached,waypoint)<.02,'planned route is playable without recovery placement');at=reached;}
    assert(distance(before,at)>.02,'successive macro-route legs make real progress');
  }
  assert(distance(at,target)<.02,'ordinary terrain navigation reaches the actual goal, not only the first region');
}

const game=new Game({mode:'world',worldId:'ember-realm-large'});
assert.equal(game.terrain.island.layout.artTheme,'ember');assert.equal(game.territories.groups.length,1,'only the authored ordinary encounter spawns');
assert.equal(game.settlements.sites.length,0);assert.equal(game.relicSites.sites.length,0);assert.equal(game.companions.camps.length,0,'legacy objectives do not populate the region sample');
assert.equal(game.riftExploration.sites.length,2);assert.equal(game.enemies.some(e=>e.worldBoss),false,'the sample does not create an open Boss');
assert.equal(game.environment.muds.length,0);assert.equal(game.environment.props.length,0,'random environment content cannot cover the sample');
for(const site of game.riftExploration.sites){
  const approach=site.approach;game.player.x=approach.x;game.player.y=approach.y-groundOffset(game.player,true);
  assert(game.terrain.isFree(approach.x,approach.y,game.player.r));
  assert.equal(game.riftExploration.getInteraction()?.id,site.id,'the real approach position activates the actual interaction');
}
console.log(JSON.stringify({sampledBodyChecks:samples,continuousSlides:slides,verifiedMovementLegs:legs,goals:goals.length,props:props.length,authoredEncounters:game.territories.groups.length}));
