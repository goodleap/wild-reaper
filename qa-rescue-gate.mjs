import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { RelicSites } from './dist/relic-sites.js';
import { RESCUE_RULES } from './dist/companions.js';

let seed=956723;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const feet=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
function world() {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,companions:false,environment:false,settlements:false});
  g.enemies=[];g.events=[];g.effects=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g._features.companions=true;g.relicSites=new RelicSites(g);
  return {g,site:g.relicSites.sites.find(s=>s.type==='rescue')};
}
const {g,site}=world();assert(site);
const gateId=`${site.id}:collision:gate`;
const atGate=()=>g.terrain._structures.some(o=>o.id===gateId);
assert(atGate(),'the ready ruin has a solid closed gate');
for(const [from,delta] of [[{x:site.x,y:site.y-130},{x:0,y:160}],[{x:site.x-140,y:site.y},{x:180,y:0}],[{x:site.x+140,y:site.y},{x:-180,y:0}],[{x:site.x,y:site.y+140},{x:0,y:-150}]]) {
  const moved=g.terrain.moveCircle(from.x,from.y,delta.x,delta.y,15);
  assert(moved.blocked,'all four approaches encounter closed masonry or the gate');
  assert(!g.relicSites.insideRescue(site.id,moved,15));
}

// Distinct systems retain their walls when either layer updates or disappears.
g.terrain.setStructures([{id:'qa-hut',type:'rock',x:site.x+900,y:site.y,r:40}],'settlements');
g.relicSites._setStructures();assert(g.terrain._structures.some(o=>o.id==='qa-hut'));
assert(atGate());g.terrain.setStructures([],'settlements');assert(atGate());

feet(g,site.door);assert(g.relicSites.interact(site.id));
const camp=g.companions.camp,guards=g.enemies.filter(e=>e.rescueId===camp.id);
assert.equal(guards.length,9);assert.equal(site.gateOpen,false);
const initial=guards.map(e=>({x:e.x,y:e.y,hp:e.hp}));
for(const enemy of guards) {
  const point={x:enemy.x,y:enemy.y+groundOffset(enemy)};
  assert(Math.hypot(point.x-g.player.x,point.y-site.door.y)>=RESCUE_RULES.spawnDistance);
  assert(point.y>site.door.y&&Math.abs(point.x-site.x)>=140,'guards spawn outside and beside the doorway approach');
  assert(g.terrain.isFree(point.x,point.y,enemy.r));
  assert.equal(enemy.rescueSpawnGrace,.8);assert.equal(enemy.guardActive,false);
  assert.equal(g._hurtEnemy(enemy,100000),0,'telegraphing bodies cannot be killed');
}
assert.equal(g.effects.filter(e=>e.type==='rescueWarning').length,9,'every pending guard has a visible warning');
g.status='paused';for(const enemy of guards)g.companions.updateEnemy(enemy,.5);
assert(guards.every(e=>e.rescueSpawnGrace===.8));g.status='playing';
for(let i=0;i<15;i++)for(const enemy of guards)g.companions.updateEnemy(enemy,.05);
assert.deepEqual(guards.map(e=>({x:e.x,y:e.y,hp:e.hp})),initial,'guards remain still and harmless for the preview duration');
assert(guards.every(e=>e.guardActive===false&&e.rescueSpawnGrace>0));
for(let i=0;i<2;i++)for(const enemy of guards)g.companions.updateEnemy(enemy,.05);
assert(guards.every(e=>e.rescueSpawnGrace===0&&e.guardActive===true));
for(const enemy of guards)g._hurtEnemy(enemy,enemy.hp+1);
assert.equal(camp.state,'ready');assert.equal(site.state,'active');assert.equal(site.gateOpen,true);assert(!atGate());
assert.equal(g.rescuePower,0,'opening the gate is not yet the rescue reward');
for(const point of [{x:site.x,y:site.y-60},{x:site.x+61,y:site.y},{x:site.x,y:site.y+62}]) {
  feet(g,point);assert.equal(g.companions._join(),false,'nearby players outside the walls cannot rescue through them');
}
const throughDoor=g.terrain.moveCircle(site.x,site.door.y+25,0,-95,15);
assert(!throughDoor.blocked,'the player can walk through the opened door');
feet(g,throughDoor);assert(g.companions._join());assert.equal(site.state,'cleared');assert.equal(g.rescuePower,1);
assert(g.terrain._structures.some(o=>o.structureId===site.id),'completed ruins retain their masonry');
assert.equal(g.relicSites.interact(site.id),false);assert.equal(g.companions._join(),false);assert.equal(g.rescuePower,1);

// A blocked formation is declined as a whole, never spawned at the player.
const blocked=world();feet(blocked.g,blocked.site.door);
blocked.g.terrain.setStructures([{id:'qa-block-spawns',type:'log',x:blocked.site.x,y:blocked.site.door.y+175,angle:0,halfLength:400,r:155}],'blocked-approach');
assert.equal(blocked.g.relicSites.interact(blocked.site.id),false);
assert.equal(blocked.g.companions.camp,null);assert.equal(blocked.g.enemies.length,0);assert.equal(blocked.site.state,'ready');
assert.equal(blocked.g.effects.filter(e=>e.type==='rescueWarning').length,0);
console.log('Rescue gates: solid masonry, owner-preserved collisions, safe complete formations, harmless paused warnings, pre-rescue gate opening and unique interior rescue passed.');
