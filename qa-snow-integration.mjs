import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { movementProfile } from './dist/height-rules.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { WORLD_IDS, worldNeighbors } from './dist/world-definitions.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';

const ID='frostmirror-highlands',distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=(g,e=g.player)=>({x:e.x,y:e.y+groundOffset(e,true)});
const game=new Game({mode:'world',worldId:ID}),forest=new Game({mode:'world',worldId:'forest'}),trial=new Game({stageId:'snow-trial'});
const layout=game.terrain.island.layout;
assert.equal(game.worldId,ID,'ordinary world identity selects the snow map without debug overrides');
assert.equal(game.startWorldId,ID);assert.equal(game.debug,false);assert.equal(game.debugOptions.fastMovement,false);
assert.equal(game.player.speed,forest.player.speed);assert.equal(game.player.r,forest.player.r);
assert.equal(layout,createRiftLayout(ID));assert.equal(layout.bounds.maxX-layout.bounds.minX,14400);assert.equal(layout.bounds.maxY-layout.bounds.minY,10800);
assert.equal(layout.worldId,ID);assert.notEqual(layout,createRiftLayout('forest'));assert.notEqual(layout,createRiftLayout('verdant-rift'));
assert.deepEqual(WORLD_IDS.slice(0,9),['forest','marsh','ruins','beach','city','mountain','snow','volcano','verdant-rift'],'saved numeric IDs remain stable');
assert.deepEqual(worldNeighbors(WORLD_IDS.indexOf(ID)),[],'independent map has no invented cross-world exits');
assert.equal(trial.region.id,'snow');assert.equal(trial.stage.id,'snow-trial');assert.notEqual(trial.terrain.island.layout,layout,'the existing snow trial stays an independent trial');
for(const g of [game,forest,trial])assert(g.terrain.isFree(foot(g).x,foot(g).y,g.player.r),'normal spawn clears the complete player body');
assert(game.enemies.some(e=>e.worldBoss),'ordinary snow selection creates the existing open boss population');
assert.equal(game.territories.groups.length,layout.encounters.length,'the baked encounter reservations create real finite populations');
assert(game.riftExploration.sites.length,'normal selection creates authored exploration targets');
for(const site of game.riftExploration.sites)assert(site.id.startsWith(`rift:${ID}:`),'objectives carry a map-specific persistent identity');
const forestIds=new Set(forest.riftExploration.sites.map(s=>s.id));assert(game.riftExploration.sites.every(s=>!forestIds.has(s.id)));

// Walking is isolated from combat outcomes, using the shipped physical movement
// and navigation with every scenery, hazard, reservation, and body size intact.
// The separate Chromium suite retains default enemies and exercises real input.
game.enemies=[];game.adventure.generation=false;game.viewWidth=540;game.viewHeight=985;
assert(game.companions.recruit('stormcaller'));assert(game.companions.recruit('owl'));
let frames=0,walked=0,recoveries=0,claims=0;
const recover=game.companions._safeReturn.bind(game.companions);
game.companions._safeReturn=member=>{recoveries++;return recover(member);};
function walk(target,followers=false){
 const navigation=terrainNavigation(game.terrain),dt=1/60,speed=game.player.speed;
 const initial=walked;
 for(let leg=0;distance(foot(game),target)>.04&&leg<300;leg++){
  const path=navigation.find(foot(game),target,game.player.r,'ground');
  assert(path?.length,`ordinary navigation reaches ${target.id??`${target.x},${target.y}`}`);
  for(const waypoint of path){
   let last=Infinity,stalled=0;
   for(let step=0;distance(foot(game),waypoint)>.025&&step<6000;step++){
    const before=foot(game),d=distance(before,waypoint),travel=Math.min(speed*dt,d);
    game._moveEntity(game.player,(waypoint.x-before.x)/d*travel,(waypoint.y-before.y)/d*travel,true);
    const after=foot(game),moved=distance(before,after);
    assert(moved<=travel+.01,'walking retains the unchanged movement budget');
    assert(game.terrain.isFree(after.x,after.y,game.player.r),'the full body remains in playable terrain');
    assert(!game.terrain.firstBlocker(before.x,before.y,after.x,after.y,game.player.r),'each real step has complete swept clearance');
    stalled=distance(after,waypoint)>=last-.0001?stalled+1:0;last=distance(after,waypoint);assert(stalled<10,'navigation does not grind indefinitely against terrain');
    frames++;walked+=moved;game.adventure.update(0);
    if(followers){
     const old=new Map(game.companions.members.map(member=>[member,foot(game,member)]));
     game._clock+=dt;game.companions.update(dt);
     for(const member of game.companions.members){
      const p=foot(game,member),profile=movementProfile(member);
      assert(game.terrain.isFree(p.x,p.y,member.r,profile),'ground and flying allies retain full-body terrain clearance');
      if(game._inView(member,40))assert(distance(old.get(member),p)<=member.speed*dt+3,'visible followers do not teleport');
     }
    }
   }
   assert(distance(foot(game),waypoint)<.04,'every planned local walking leg completes');
  }
 }
 assert(distance(foot(game),target)<.04,'the exact interaction standing point is reached');
 return walked-initial;
}
const standing=area=>{
 for(let radius=0;radius<=240;radius+=20)for(let i=0;i<24;i++){
  const p={id:area.id,x:area.center.x+Math.cos(i*Math.PI/12)*radius,y:area.center.y+Math.sin(i*Math.PI/12)*radius};
  if(game.terrain.isFree(p.x,p.y,game.player.r))return p;
 }
 assert.fail(`no standing space in area ${area.id}`);
};
const byArea=new Map(layout.areas.map(a=>[a.id,standing(a)]));
const followTargets=layout.areas.filter(a=>['02','08'].includes(a.id));
assert(followTargets.length>=1,'snow map has an initial forest walking route');
for(const area of followTargets)walk(byArea.get(area.id),true);
for(let i=0;i<240;i++){game._clock+=1/60;game.companions.update(1/60);}
for(const member of game.companions.members)assert(distance(foot(game,member),foot(game))<240,'followers finish beside the moving leader');
assert.equal(recoveries,0,'the visible main route does not require unseen companion recovery');
game.companions.members=[];
for(const target of byArea.values())walk(target);
for(const site of [...game.settlements.sites,...game.relicSites.sites].filter(s=>s.door))walk({id:site.id,...site.door});
for(const cave of game.riftExploration.sites.filter(s=>s.kind==='cave'))walk(cave);
const gate=game.riftExploration.sites.find(s=>s.kind==='shortcut');assert(gate);
const west={id:'snow-gate-west',x:gate.x-76,y:gate.y},east={id:'snow-gate-east',x:gate.x+76,y:gate.y};
walk(west);assert.equal(game.riftExploration.getInteraction()?.enabled,false);assert.equal(game.riftExploration.interact(gate.id),false);
assert(game.terrain.firstBlocker(west.x,west.y,east.x,east.y,game.player.r),'the closed crossbar physically blocks the bridge');
const detour=walk(east);assert(detour>5000,'the locked south bridge requires walking the real existing loop');
assert(game.riftExploration.interact(gate.id));assert(game.terrain.riftGateOpen(gate.gateId));
const shortcut=walk(west);assert(shortcut<200,'opening the bridge creates the actual short return');

// Walk the seeded underground connection room by room. Scene transitions use
// the ordinary request/update interface; no entrance or exit placement is used.
const caves=game.riftExploration.sites.filter(s=>s.kind==='cave');
const paired=caves.filter(c=>caves.filter(other=>other.caveId===c.caveId).length===2);assert.equal(paired.length,2);
function request(id){
 assert(game.requestInteraction(id),`request ${id}`);
 for(let i=0;i<32&&game.sceneTransition.active;i++)game.sceneTransition.update(.05);
 assert.equal(game.sceneTransition.active,false);assert.equal(game.sceneTransition.commitSucceeded,true);
}
walk(paired[0]);request(paired[0].id);const underground=game.dungeon.active;assert.equal(underground.artTheme,'snow');assert.equal(underground.riftExits.length,2);
const departure=underground.riftExits.find(e=>e.key===paired[1].key),cell=game.dungeon._cellAt(foot(game).x,foot(game).y,underground),goal=game.dungeon._cellAt(departure.x,departure.y,underground);
const queue=[cell],parents=new Map([[cell.id,null]]);
for(let i=0;i<queue.length&&!parents.has(goal.id);i++)for(const next of game.dungeon._neighbors(queue[i],underground))if(!parents.has(next.id)){parents.set(next.id,queue[i]);queue.push(next);}
assert(parents.has(goal.id));const rooms=[];for(let c=goal;c;c=parents.get(c.id))rooms.push(c);rooms.reverse();assert(rooms.length>=5,'the shortcut requires an actual underground journey');
const caveStart=walked;
for(const room of rooms.slice(1))walk(room);
walk(departure);game.dungeon.update(0);request(departure.id);
assert.equal(game.dungeon.active,null);assert(distance(foot(game),paired[1])<190,'the opposite cave returns to its own surface mouth');
assert.equal(game.terrain.island.layout,layout);assert(game.terrain.riftGateOpen(gate.gateId),'cave travel preserves the opened surface shortcut');
walk(paired[1]);request(paired[1].id);assert.equal(game.dungeon.active,underground,'opposite cave mouths share the same seeded instance');
const returnExit=underground.riftExits.find(e=>e.key===paired[1].key);walk(returnExit);game.dungeon.update(0);request(returnExit.id);
const caveWalked=walked-caveStart;
const chest=game.riftExploration.sites.find(s=>s.kind==='chest');
assert(chest);walk(chest);const gold=game.gold;assert(game.riftExploration.interact(chest.id));assert(game.gold>gold);assert.equal(game.riftExploration.interact(chest.id),false);claims++;
assert(forest.riftExploration.sites.filter(s=>s.kind==='chest').every(s=>s.state==='closed'),'snow rewards do not claim forest rewards');
const snapshot=game.regions.saveWorld(),index=WORLD_IDS.indexOf(ID);
assert.equal(game.regions.states.get(index),snapshot);assert.equal(game.regions.restoreWorld(0),false);assert.equal(game.regions.restoreWorld(index),true);assert.equal(game.riftExploration.sites.find(s=>s.id===chest.id).state,'claimed');

// Check actual barrier semantics, independently of graph connectivity. Bodies
// approaching a wall stay outside, and an ice clearing remains traversable.
let barrierSamples=0;
for(const boundary of layout.boundaries){
 for(let i=0;i<boundary.points.length&&barrierSamples<20;i++){
  const a=boundary.points[i],b=boundary.points[(i+1)%boundary.points.length],length=distance(a,b);if(length<120)continue;
  const p={x:(a.x+b.x)/2,y:(a.y+b.y)/2},nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
  for(const side of [-1,1]){
   const start={x:p.x+nx*side*45,y:p.y+ny*side*45},end={x:p.x-nx*side*45,y:p.y-ny*side*45};
   if(!game.terrain.isFree(start.x,start.y,game.player.r)||game.terrain.isFree(end.x,end.y,game.player.r))continue;
   assert(game.terrain.firstBlocker(start.x,start.y,end.x,end.y,game.player.r));
   const moved=game.terrain.moveCircle(start.x,start.y,end.x-start.x,end.y-start.y,game.player.r);
   assert(distance(moved,end)>game.player.r,'a normal full-body move cannot cross the continuous wall');assert(game.terrain.isFree(moved.x,moved.y,game.player.r));barrierSamples++;
  }
 }
 if(barrierSamples>=20)break;
}
assert(barrierSamples>=5,'the large map retains actual continuous impassable terrain');
console.log(JSON.stringify({snowIntegration:'passed',world:ID,size:[14400,10800],view:[540,985],areasWalked:byArea.size,caveMouthsWalked:game.riftExploration.sites.filter(s=>s.kind==='cave').length,movementFrames:frames,walkedUnits:Math.round(walked),companionRecoveries:recoveries,barrierSamples,claims,bridgeDetour:Math.round(detour),openedShortcut:Math.round(shortcut),undergroundRooms:rooms.length,undergroundWalked:Math.round(caveWalked),method:'Shipped navigation and movement at unchanged body sizes/speed; default-enemy browser checks are separate'}));
