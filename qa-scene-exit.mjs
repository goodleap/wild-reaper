import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {movementProfile} from './dist/height-rules.js';
import {portalDoor,portalExitGeometry} from './dist/portal-geometry.js';

let seed=780921;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const foot=m=>({x:m.x,y:m.y+groundOffset(m,true)});
const place=(m,point)=>{m.x=point.x;m.y=point.y-groundOffset(m,true);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function recruit(g){for(const kind of ['stormcaller','warden','dog','owl','golem'])assert(g.companions.recruit(kind));}
function quiet(g){g._spawn=g._shot=g.nextBossAt=g.player.xpNext=g.crystalsNext=Infinity;g.gold=1000;g.build.setEquipped('sword',false);}
function verifyParty(g,door,direction=1,forwardLimit=125){
  const p=foot(g.player),members=g.companions.members;assert.equal(members.length,5);
  const normal=typeof direction==='number'?{x:0,y:direction}:direction,tangent={x:-normal.y,y:normal.x};
  const projection=(point,origin,axis)=>(point.x-origin.x)*axis.x+(point.y-origin.y)*axis.y;
  assert(g.terrain.isFree(p.x,p.y,g.player.r),'player receives a walkable doorway position');
  assert(Math.abs(projection(p,door,tangent))<=56&&Math.abs(projection(p,door,normal))<=forwardLimit,'player remains near the receiving doorway');
  for(const member of members){
    const point=foot(member),profile=movementProfile(member);
    assert(projection(point,p,normal)<0,`${member.kind} receives a trailing position, not a ring around the player`);
    assert(distance(point,door)<170,`${member.kind} stays beside the same doorway`);
    assert(g.terrain.isFree(point.x,point.y,member.r,profile),`${member.kind} clears walls with its own movement profile`);
    assert(!g.terrain.firstBlocker(p.x,p.y,point.x,point.y,member.r,profile),`${member.kind} can reach the hero`);
    assert(distance(point,p)>=g.player.r+member.r+4,'arrivals do not overlap the player');
    assert.equal(member._following,false);assert.equal(member.moving,false);
    for(const other of members)if(other!==member)assert(distance(point,foot(other))>=member.r+other.r+4,'arrival bodies do not overlap');
    member._scan=member._attack=Infinity;
  }
  const held=members.map(foot);
  // New positions are just initial conditions: small player movement must not
  // make the party reform; a large departure must use ordinary following.
  for(const dx of [0,12,-12,0]){
    place(g.player,{x:p.x+dx,y:p.y});g.companions.update(.05);
    members.forEach((member,i)=>assert(distance(foot(member),held[i])<1e-7,'allies hold their doorway positions inside their leash'));
  }
  place(g.player,p);
}
function finish(g){for(let i=0;i<32&&g.sceneTransition.active;i++)g.update(.025);assert.equal(g.sceneTransition.active,false);}

const world=new Game();quiet(world);recruit(world);
for(const type of ['supply','occupied','castle','weapons','skills','supplies']){
  const site=world.settlements.sites.find(s=>s.worldFacility===type||!s.worldFacility&&s.type===type);assert(site);
  const terrain=world.terrain,oldPoint={x:site.door.x+55,y:site.door.y};place(world.player,oldPoint);
  assert(world.dungeon.enter(site));const inside=world.dungeon.active;
  verifyParty(world,inside.entrance,-1);
  if(inside.enemies.length){inside.enemies[0].hp-=1;}
  const enemyState=inside.enemies.map(enemy=>[enemy.id,enemy.hp]);
  place(world.player,inside.entrance);assert(world.dungeon.exit());
  assert.equal(world.terrain,terrain);assert.equal(world.status,'playing');assert.equal(world.sceneTransition.active,false);
  assert(distance(foot(world.player),oldPoint)>50,'exit uses the door instead of the arbitrary pre-entry interaction point');
  verifyParty(world,site.door);
  for(let i=0;i<4;i++){world.touchInteractions.update();assert.equal(world.sceneTransition.active,false,'standing at the receiving door cannot trigger a return');}
  const p=foot(world.player);world.update(.025,{y:1});assert(foot(world.player).y>p.y,'the first gameplay frame accepts player movement');
  place(world.player,site.door);assert(world.dungeon.enter(site));assert.equal(world.dungeon.active,inside);
  assert.deepEqual(inside.enemies.map(enemy=>[enemy.id,enemy.hp]),enemyState,'moving the arrival does not reset room progress');
  // Boundary correction is not a scene change and must not reposition allies.
  const held=world.companions.members.map(foot);world.dungeon._placePlayer(inside.landing);
  assert.deepEqual(world.companions.members.map(foot),held);
  place(world.player,inside.entrance);assert(world.dungeon.exit());
}

// The same five-member placement is exercised at actual paired world gates,
// including active guardian angels and both outbound and return directions.
const originIndex=world.regionIndex,gate=world.regions.portals.find(p=>p.nextRegionIndex===1),boss=world.enemies.find(e=>e.id===gate.bossId);
if(boss){place(world.player,{x:gate.x,y:gate.y+250});world.regionGrace=0;world.regions.update();
world._hurtEnemy(boss,boss.hp+1);world.regions.flushReward();assert(world.chooseSuper(world.getSuperChoices()[0].id));}
else assert(gate.natural&&gate.state==='active');
for(const target of [gate.nextRegionIndex,originIndex]){
  const departure=world.regions.portals.find(p=>p.nextRegionIndex===target);place(world.player,portalDoor(departure));
  assert(world.requestInteraction(departure.id));finish(world);assert.equal(world.regionIndex,target);
  const arrival=world.regions.portals.find(p=>p.connectionId===departure.connectionId),edge=portalExitGeometry(arrival);
  verifyParty(world,portalDoor(arrival),edge?.normal||arrival.arrivalDirection||{x:0,y:1},edge?180:125);
  for(let i=0;i<4;i++){world.touchInteractions.update();assert.equal(world.sceneTransition.active,false);assert.equal(world.regionIndex,target);}
}

// A blocked preferred doorway point falls back on the same front apron.
const blocked=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false});
const door={x:0,y:0};blocked.terrain.setStructures([{id:'front-rock',type:'rock',x:0,y:72,r:22}],'qa-blocked-apron');
const safe=blocked.dungeon._returnPoint({door,returnPoint:{x:0,y:-300}});
assert(safe.y>=0&&blocked.terrain.isFree(safe.x,safe.y,blocked.player.r+4));

// Ordinary following resumes only when the leader really leaves the leash.
const follow=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false});
quiet(follow);follow.enemies=[];recruit(follow);place(follow.player,{x:0,y:72});follow.companions.onSceneChange({doorway:door,direction:{x:0,y:1}});
const before=follow.companions.members.map(foot);place(follow.player,{x:0,y:400});
for(let i=0;i<8;i++){for(const member of follow.companions.members)member._scan=Infinity;follow.companions.update(.025);}
follow.companions.members.forEach((member,i)=>assert(foot(member).y>before[i].y,'each ally naturally follows a distant leader'));
console.log('Scene exits: five companions at safe trailing door positions, hut/castle progress, immediate control, idle hysteresis, ordinary pursuit, paired portals, return latch, blocked aprons and correction isolation passed.');
