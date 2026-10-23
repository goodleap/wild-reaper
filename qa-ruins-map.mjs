import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { RiftCollision } from './dist/rift-collision.js';
import { WORLD_IDS, worldNeighbors } from './dist/world-definitions.js';
import { portalDoor } from './dist/portal-geometry.js';
import { movementProfile } from './dist/height-rules.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const island=new Island({region:'ruins',seed:1}),layout=island.layout;
assert.equal(layout.id,'ruins:1');assert.equal(layout.worldId,'ruins');assert.equal(layout.artTheme,'ruins');
const worldIndex=WORLD_IDS.indexOf('ruins'),neighbors=worldNeighbors(worldIndex);
assert.equal(worldIndex,2);assert.deepEqual(new Set(neighbors),new Set([1,4,7,9]));
assert.deepEqual(layout.bounds,{minX:-7200,minY:-5400,maxX:7200,maxY:5400});
assert.equal(new Island({region:'ruins',seed:91}).layout,layout,'fixed terrain and content do not reroll with a new run seed');
assert(layout.areas.length>=14&&layout.areas.length<=18);
assert(layout.passages.filter(p=>p.kind==='bridge').length>=2);
assert.equal(layout.encounters.filter(e=>e.kind==='boss').length,2);
assert(new Set(layout.encounters.filter(e=>e.kind==='boss').map(e=>e.bossKind)).size>=1);
assert.equal(layout.interactions.caves.length,3);assert(layout.interactions.chests.length>=8);
const outline=new RiftCollision(layout);let sweeps=0;
for(const passage of layout.passages)for(const radius of [15,24,49])for(let i=1;i<passage.waypoints.length;i++){
  const a=passage.waypoints[i-1],b=passage.waypoints[i];
  assert(outline.circleFree(a.x,a.y,radius),`${passage.id}: r${radius} starts on dry ground`);
  assert(!outline.firstBlocker(a.x,a.y,b.x,b.y,radius),`${passage.id}: complete body sweep retains the route`);
  assert(distance(outline.step(a.x,a.y,b.x,b.y,radius),b)<.03,`${passage.id}: movement follows the complete route`);sweeps++;
}

const terrain=new Terrain({region:'ruins',seed:1,island});let waterSides=0,slides=0,high=0,low=0;
for(const bridge of layout.passages.filter(p=>p.kind==='bridge')){
  const [a,b]=bridge.deck,length=distance(a,b),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length,center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  assert(terrain.isFree(center.x,center.y,49),`${bridge.id}: the deck fits large existing units`);
  for(const sign of [-1,1]){
    const p={x:center.x+nx*sign*(bridge.width/2+70),y:center.y+ny*sign*(bridge.width/2+70)};
    assert(!terrain.isFree(p.x,p.y,15),`${bridge.id}: walkers cannot bypass the bridge over its visible water sides`);
    assert(terrain.isFree(p.x,p.y,15,'air'),`${bridge.id}: water does not become a high wall`);
    assert(terrain.isFree(p.x,p.y,0,'projectile'),`${bridge.id}: water permits projectiles`);waterSides++;
  }
}
for(let x=-6900;x<=6900;x+=420)for(let y=-5100;y<=5100;y+=420){
  if(outline.circleFree(x,y,15))continue;
  if(outline.circleFree(x,y,15,'air'))low++;else high++;
}
assert(low>0&&high>20,'the map contains actual deep water and raised wall/rubble barriers');
// Replay pressure along clear real contour faces. A decorative row must not
// introduce a second seam, and sliding must keep the original travel budget.
for(const ring of layout.boundaries){
  for(let i=0;i<ring.points.length&&slides<48;i+=3){
    const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],length=distance(a,b);if(length<34)continue;
    const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
    for(const sign of [-1,1]){
      const nx=-uy*sign,ny=ux*sign,p={x:(a.x+b.x)/2+nx*15.05,y:(a.y+b.y)/2+ny*15.05};
      if(!terrain.isFree(p.x,p.y,15)||terrain.firstBlocker(p.x,p.y,p.x+ux*10,p.y+uy*10,15))continue;
      const dx=ux*10-nx*2,dy=uy*10-ny*2,moved=terrain.moveCircle(p.x,p.y,dx,dy,15);
      assert(terrain.isFree(moved.x,moved.y,15),'edge pressure retains full-body clearance');
      assert(distance(p,moved)<=Math.hypot(dx,dy)+.01,'sliding never adds movement speed');
      assert((moved.x-p.x)*ux+(moved.y-p.y)*uy>8,'clear tangent movement does not snag on an edge seam');slides++;
    }
  }
}
assert(slides>=16,'representative natural edges receive actual sliding checks');

const game=new Game({mode:'world',worldId:'ruins'}),foot=()=>({x:game.player.x,y:game.player.y+groundOffset(game.player,true)});
assert.equal(game.debug,false);assert.equal(game.worldId,'ruins');assert.equal(game.player.speed,320);
assert.equal(game.terrain.island.layout,layout);assert.equal(game.enemies.filter(e=>e.worldBoss).length,2);
assert.equal(game.territories.groups.length,layout.encounters.length,'every finite authored domain actually initializes');
assert.equal(game.regions.portals.length,neighbors.length);
assert(game.regions.portals.every(p=>p.natural&&p.state==='active'),'existing neighbors use real natural exits');
for(const field of game.territories.groups)for(const enemy of field.members){
  assert(game.terrain.isFree(enemy.territoryHome.x,enemy.territoryHome.y,enemy.r,movementProfile(enemy)),`${field.id}: enemies spawn with their complete movement footprint clear`);
  assert.equal(enemy.guardActive,false,'ordinary domains wait until activated');
}
assert(game.territories.groups.filter(field=>field.kind==='guard').length>=2,'key junctions have actual guarded domains');
const portalState=game.regions.portals.map(p=>({id:p.id,state:p.state}));
game.player.xpNext=game.crystalsNext=Infinity;
for(const field of game.territories.groups.filter(field=>field.kind==='boss')){
  const boss=field.members[0];game.player.x=field.x;game.player.y=field.y-groundOffset(game.player,true);
  game.territories.update(.05);assert.equal(boss.guardActive,true);
  game._hurtEnemy(boss,boss.hp+1000,0,game.player,'raw');assert(field.cleared&&field.rewardQueued);
  assert(game.regions.flushReward());assert.equal(game.status,'super');assert(game.chooseSuper(game.getSuperChoices()[0].id));
  assert(field.rewardClaimed);game.regions.openPortal(boss);assert.equal(game.regions._rewardQueue.length,0,'an optional boss cannot yield repeated rewards');
}
assert.deepEqual(game.regions.portals.map(p=>({id:p.id,state:p.state})),portalState,'field bosses do not change the existing world exit rules');
game.player.x=layout.spawn.x;game.player.y=layout.spawn.y-groundOffset(game.player,true);
game.viewWidth=540;game.viewHeight=985;
// Isolate traversal from combat; all ordinary terrain, props and building
// colliders stay installed. The real movement and navigation functions run.
game.enemies=[];game.player.xpNext=game.crystalsNext=Infinity;game.player.invuln=Infinity;
let steps=0,walked=0,goals=0;
function walk(target){
  const nav=terrainNavigation(game.terrain),label=target.id??`${target.x},${target.y}`;
  assert(game.terrain.isFree(target.x,target.y,game.player.r),`${label}: actual standing space`);
  for(let leg=0;distance(foot(),target)>.04&&leg<300;leg++){
    const path=nav.find(foot(),target,game.player.r,'ground');
    assert(path?.length,`${label}: ordinary navigation finds the next physical leg from ${JSON.stringify(foot())}`);
    const beforeLeg=foot();
    for(const waypoint of path){
      assert(!game.terrain.firstBlocker(foot().x,foot().y,waypoint.x,waypoint.y,game.player.r),`${label}: navigation cannot cut across a wall or water`);
      for(let n=0;distance(foot(),waypoint)>.025&&n<5000;n++){
        const before=foot(),d=distance(before,waypoint),travel=Math.min(game.player.speed/30,d);
        game._moveEntity(game.player,(waypoint.x-before.x)/d*travel,(waypoint.y-before.y)/d*travel,true);
        const after=foot(),advance=distance(before,after);
        assert(advance>.0001,`${label}: movement makes progress`);assert(advance<=travel+.01,'movement retains its speed budget');
        assert(game.terrain.isFree(after.x,after.y,game.player.r),'ordinary walking keeps the full body clear');walked+=advance;steps++;
      }
      assert(distance(foot(),waypoint)<.04,`${label}: local walking leg completes`);
    }
    assert(distance(beforeLeg,foot())>.01,`${label}: route planning advances`);
  }
  assert(distance(foot(),target)<.04,`${label}: actual destination reached`);goals++;
}
for(const area of layout.areas)walk({id:`area:${area.id}`,...area.center});
for(const field of game.territories.groups)walk({id:`domain:${field.id}`,x:field.x,y:field.y});
for(const site of [...game.settlements.sites,...game.relicSites.sites].filter(s=>s.door))walk({id:`door:${site.id}`,...site.door});
const exploration=game.riftExploration;
for(const site of exploration.sites.filter(s=>s.kind==='chest')){
  walk({id:site.id,...(site.approach??site)});const gold=game.gold;
  assert.equal(exploration.getInteraction()?.id,site.id,'reaching a chest exposes its actual interaction');
  assert(exploration.interact(site.id));assert.equal(site.state,'claimed');assert(game.gold>gold);
  const claimedGold=game.gold;assert.equal(exploration.interact(site.id),false);assert.equal(game.gold,claimedGold,'fixed rewards cannot be claimed twice');
}
const caveStates=new Map();
for(const site of exploration.sites.filter(s=>s.kind==='cave')){
  if(site.approach)walk({id:`${site.id}:approach`,...site.approach});
  walk(site);
  assert.equal(exploration.getInteraction()?.id,site.id,'every cave mouth has a real unobstructed interaction approach');
  assert(exploration.interact(site.id),'the existing cave entrance actually opens');
  const state=game.dungeon.active,entry=state.riftExits.find(exit=>exit.key===site.key);
  assert.equal(state.kind,'cave');assert(entry);assert(state.enemies.length>0&&state.chests.length>0);
  assert.equal(state.riftExits.length,exploration.sites.filter(s=>s.kind==='cave'&&s.caveId===site.caveId).length);
  if(caveStates.has(site.caveId))assert.equal(state,caveStates.get(site.caveId),'paired mouths retain the same underground state');
  else caveStates.set(site.caveId,state);
  assert(game.dungeon.exit(entry.id),'the normal arrival remains close enough to return through its entrance');
  assert.equal(game.terrain.island.layout,layout);assert(game.terrain.isFree(foot().x,foot().y,game.player.r),'cave return keeps the full body outside scenery');
}
assert.equal(caveStates.size,2,'the third mouth has a separate existing cave instance');
for(const target of neighbors){
  const exit=game.regions.portals.find(p=>p.nextRegionIndex===target);assert(exit);
  walk({id:`exit:${target}`,...portalDoor(exit)});game.regionGrace=0;
  const gold=game.gold;assert(game.enterPortal(exit.id));assert.equal(game.regionIndex,target);
  const back=game.regions.portals.find(p=>p.nextRegionIndex===worldIndex);assert(back&&back.state==='active');
  const at=portalDoor(back);game.player.x=at.x;game.player.y=at.y-groundOffset(game.player,true);game.regionGrace=0;
  assert(game.enterPortal(back.id));assert.equal(game.worldId,'ruins');assert.equal(game.riftExploration,exploration);
  assert.equal(game.gold,gold,'round trips cannot duplicate route or treasure rewards');
  assert(exploration.sites.filter(s=>s.kind==='chest').every(s=>s.state==='claimed'),'visited treasure state persists after cross-world travel');
}
console.log(JSON.stringify({ruins:'passed',areas:layout.areas.length,objectives:goals,sweeps,waterSides,slides,steps,walked:Math.round(walked),roundTrips:neighbors.length}));
