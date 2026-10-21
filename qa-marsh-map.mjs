import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { RiftCollision } from './dist/rift-collision.js';
import { WORLD_IDS, worldNeighbors } from './dist/world-definitions.js';
import { containsWater } from './dist/water-geometry.js';
import { portalDoor } from './dist/portal-geometry.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const definitions=JSON.parse(readFileSync(new URL('./dist/config/worlds.json',import.meta.url))).definitions;
assert.equal(createHash('sha256').update(JSON.stringify(definitions.filter(w=>w.id!=='marsh'))).digest('hex'),'6cb0902cebf1d61ae3acbb08c56844bddca38dde846e5b2a8a1fc23c92041cf5','the other eleven complete map definitions remain exact');
const island=new Island({region:'marsh',seed:1}),layout=island.layout;
assert.equal(layout.id,'marsh:1');assert.equal(layout.worldId,'marsh');assert.equal(layout.artTheme,'marsh');
assert.equal(WORLD_IDS.indexOf('marsh'),1);assert.deepEqual(new Set(worldNeighbors(1)),new Set([2,11]));
assert.deepEqual(layout.bounds,{minX:-7200,minY:-5400,maxX:7200,maxY:5400});
assert.equal(new Island({region:'marsh',seed:91}).layout,layout,'fixed terrain and content do not reroll with a new run seed');
assert(layout.areas.length>=14&&layout.areas.length<=18);
assert.equal(layout.passages.filter(p=>p.kind==='bridge').length,3);
assert.equal(layout.encounters.filter(e=>e.kind==='boss').length,2);
assert.deepEqual(new Set(layout.encounters.filter(e=>e.kind==='boss').map(e=>e.bossKind)),new Set(['broodmother','deepcaller']));
assert.equal(layout.interactions.caves.length,3);assert(layout.interactions.chests.length>=8);
const outline=new RiftCollision(layout);let sweeps=0;
for(const passage of layout.passages)for(const radius of [15,24,49])for(let i=1;i<passage.waypoints.length;i++){
  const a=passage.waypoints[i-1],b=passage.waypoints[i];
  assert(outline.circleFree(a.x,a.y,radius),`${passage.id}: r${radius} starts on dry ground`);
  assert(!outline.firstBlocker(a.x,a.y,b.x,b.y,radius),`${passage.id}: complete body sweep retains the route`);
  assert(distance(outline.step(a.x,a.y,b.x,b.y,radius),b)<.03,`${passage.id}: movement follows the complete route`);sweeps++;
}

const terrain=new Terrain({region:'marsh',seed:1,island});let waterSides=0,slides=0,high=0,low=0;
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
assert(low>20&&high>20,'the map contains actual deep water and separate raised vegetation barriers');
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

const game=new Game({mode:'world',worldId:'marsh'}),foot=()=>({x:game.player.x,y:game.player.y+groundOffset(game.player,true)});
assert.equal(game.debug,false);assert.equal(game.worldId,'marsh');assert.equal(game.player.speed,320);
assert.equal(game.terrain.island.layout,layout);assert.equal(game.enemies.filter(e=>e.worldBoss).length,2);
assert.equal(game.territories.groups.length,layout.encounters.length,'every finite authored domain actually initializes');
assert.equal(game.regions.portals.length,2);
assert(game.regions.portals.every(p=>p.natural&&p.state==='active'),'the two existing neighbors use real natural exits');
// Shallow pools remain ordinary wading water and reload through the existing
// viewport cache when the player leaves and returns.
game.viewWidth=540;game.viewHeight=985;
const put=p=>{game.player.x=p.x;game.player.y=p.y-groundOffset(game.player,true);};
const environment=game.environment,surfaces=layout.surfaces;
assert(surfaces.length>=2&&surfaces.length<=3);
assert.deepEqual(environment.watersInBounds(layout.bounds).map(s=>s.id).sort(),surfaces.map(s=>s.id).sort(),'fixed pools retain their complete placement inventory');
for(const surface of surfaces){
  let wet=null;
  for(let x=surface.x-surface.rx*.7;x<surface.x+surface.rx*.7&&!wet;x+=18)for(let y=surface.y-surface.ry*.7;y<surface.y+surface.ry*.7;y+=18){
    if(containsWater(surface,x,y)&&game.terrain.isFree(x,y,game.player.r)){wet={x,y};break;}
  }
  assert(wet,`${surface.id}: shallow water has reachable ordinary ground`);
  put(wet);environment._refreshClock=0;environment.update(0);
  assert(environment.muds.some(p=>p.id===surface.id),'nearby shallow water loads into the visible cache');
  assert(environment.getImmersion(game.player)?.depth>0,'ordinary units visibly wade');
  assert.equal(environment.movementMultiplier(game.player),game.region.environment.waterMovement.idle,'wading retains the configured movement reduction');
  game.player.flying=true;assert.equal(environment.getImmersion(game.player),null);assert.equal(environment.movementMultiplier(game.player),1);game.player.flying=false;
  const far=[...layout.areas].sort((a,b)=>distance(b.center,wet)-distance(a.center,wet))[0].center;
  put(far);environment._refreshClock=0;environment.update(0);
  assert(!environment.muds.some(p=>p.id===surface.id),'distant shallow water leaves the visible cache');
  put(wet);environment._refreshClock=0;environment.update(0);
  assert(environment.muds.some(p=>p.id===surface.id),'returning reloads the same pool');
}
put(layout.spawn);environment._refreshClock=0;environment.update(0);

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
for(const target of [11,2]){
  const exit=game.regions.portals.find(p=>p.nextRegionIndex===target);assert(exit);
  walk({id:`exit:${target}`,...portalDoor(exit)});game.regionGrace=0;
  const gold=game.gold;assert(game.enterPortal(exit.id));assert.equal(game.regionIndex,target);
  const back=game.regions.portals.find(p=>p.nextRegionIndex===1);assert(back&&back.state==='active');
  const at=portalDoor(back);game.player.x=at.x;game.player.y=at.y-groundOffset(game.player,true);game.regionGrace=0;
  assert(game.enterPortal(back.id));assert.equal(game.worldId,'marsh');assert.equal(game.riftExploration,exploration);
  assert.equal(game.gold,gold,'round trips cannot duplicate route or treasure rewards');
  assert(exploration.sites.filter(s=>s.kind==='chest').every(s=>s.state==='claimed'),'visited treasure state persists after cross-world travel');
}
console.log(JSON.stringify({marsh:'passed',areas:layout.areas.length,objectives:goals,sweeps,waterSides,slides,steps,walked:Math.round(walked),roundTrips:2,unchangedOtherMaps:11}));
