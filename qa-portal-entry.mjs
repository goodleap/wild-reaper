import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {PORTAL_GEOMETRY as GEOMETRY,portalDoor,portalEntranceContains} from './dist/portal-geometry.js';
import {waterIntersectsCircle} from './dist/water-geometry.js';

let seed=314870;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const place=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
function quiet(g){
  g.enemies=[];g.gems=[];g.coins=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.nextBossAt=Infinity;
  g.player.xpNext=Infinity;g.crystalsNext=Infinity;g.regionGrace=0;
}
function arena(debug=false){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false,debug});
  quiet(g);return g;
}
function activate(g){
  const boss=g._spawnEnemy('boss',1);boss.x=100;boss.y=0;boss.hp=0;
  const portal=g.regions.openPortal(boss);assert(portal);g.regions.flushReward();
  assert(g.chooseSuper(g.getSuperChoices()[0].id));quiet(g);return portal;
}
function finish(g){
  assert(g.sceneTransition.active);for(let i=0;g.sceneTransition.active&&i<20;i++)g.update(.025);
  assert.equal(g.sceneTransition.active,false);
}
function walkTo(g,target){
  for(let i=0;i<240;i++){
    const p=foot(g),dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
    if(d<.05)return true;
    g.update(Math.min(.025,d/g.player.speed),{x:dx/d,y:dy/d});
    if(g.sceneTransition.active)return false;
  }
  assert.fail('a clear approach path must be walkable');
}
const structures=g=>g.terrain._structureOwners.get('portals')||[];
function verifyWalls(g){
  const walls=structures(g);assert.equal(walls.length,g.regions.portals.length*3,'every portal has exactly three solid frame segments');
  assert.equal(new Set(walls.map(w=>w.id)).size,walls.length,'restoring a world must not duplicate portal collision');
  for(const p of g.regions.portals){
    assert.equal(walls.filter(w=>w.structureId===p.id).length,3);
    const d=portalDoor(p);assert(g.terrain.isFree(d.x,d.y,g.player.r),'the centered front doorway fits the player');
    for(const q of [{x:p.x-GEOMETRY.halfWidth,y:p.y},{x:p.x+GEOMETRY.halfWidth,y:p.y},{x:p.x,y:p.y+GEOMETRY.backY}])
      assert(!g.terrain.isFree(q.x,q.y,1),'the left, right and rear parts are physical terrain');
  }
}

// Hint distance is intentionally broad, but keyboard/direct entry has the same
// narrow front entrance as automatic contact. A remote E cannot skip the walk.
const manual=arena(),manualGate=activate(manual),door=portalDoor(manualGate);
place(manual,{x:door.x,y:door.y+65});
assert(manual.getInteraction(),'the wider approach still exposes a hint');
assert.equal(manual.getInteraction().enabled,false);assert.equal(manual.requestInteraction(manualGate.id),false);
assert.equal(manual.interact(manualGate.id),false);assert.equal(manual.enterPortal(manualGate.id),false);
place(manual,door);assert(manual.canEnterPortal(manualGate.id));assert(manual.requestInteraction(manualGate.id));finish(manual);
assert.equal(manual.regionIndex,1);

// Walk into each closed side and the rear with ordinary and debug movement.
// Huge real-frame jumps still clamp to the maximum simulation step and sweep
// through the solid geometry, so neither E nor speed can tunnel into a gate.
for(const debug of [false,true])for(const approach of ['left','right','back']){
  const g=arena(debug),p=activate(g),old=g.regionIndex;
  if(debug)assert.equal(g.player.speed,660);
  const side=approach==='left'?-1:1;
  place(g,approach==='back'?{x:p.x,y:p.y-100}:{x:p.x+side*100,y:p.y});
  for(let i=0;i<12;i++){
    g.update(i%2?100:.05,approach==='back'?{y:1,interact:true}:{x:-side,interact:true});
    assert.equal(g.regionIndex,old);assert.equal(g.sceneTransition.active,false);
    assert(g.terrain.isFree(foot(g).x,foot(g).y,g.player.r),'movement must not leave the player inside a portal wall');
  }
  const stopped=foot(g);
  if(approach==='back')assert(stopped.y<=p.y+GEOMETRY.backY-GEOMETRY.wallRadius-g.player.r+.05,'rear approach cannot cross the back wall');
  else assert(Math.abs(stopped.x-p.x)>=GEOMETRY.halfWidth+GEOMETRY.wallRadius+g.player.r-.05,'side approach cannot cross a jamb');
  assert.equal(g.canEnterPortal(p.id),false);assert.equal(g.requestInteraction(p.id),false);assert.equal(g.enterPortal(p.id),false);
  // Continue by walking around the frame, rather than teleporting the fixture
  // to its doorway, proving that an ordinary route to the front remains open.
  if(approach==='back'){assert(walkTo(g,{x:p.x+90,y:stopped.y}));assert(walkTo(g,{x:p.x+90,y:p.y+90}));}
  else assert(walkTo(g,{x:stopped.x,y:p.y+90}));
  assert(walkTo(g,{x:p.x,y:p.y+90}));
  assert.equal(walkTo(g,portalDoor(p)),false,'walking into the front starts automatic entry');
  assert(portalEntranceContains(p,foot(g)));finish(g);assert.equal(g.regionIndex,1);
}

const locked=arena(true),lockedGate=activate(locked);lockedGate.state='locked';
place(locked,{x:lockedGate.x,y:lockedGate.y+90});assert(walkTo(locked,portalDoor(lockedGate)));
for(let i=0;i<4;i++)locked.update(.05,{interact:true});
assert.equal(locked.regionIndex,0);assert.equal(locked.sceneTransition.active,false);assert.equal(locked.canEnterPortal(lockedGate.id),false);verifyWalls(locked);

// A blocked preferred landing must search only the front, and must respect
// water rather than choosing one of the old negative-Y/back-side offsets.
const fallback=arena(),fallbackGate=activate(fallback);
fallback.terrain.setStructures([{id:'qa-front-rock',type:'rock',x:fallbackGate.x,y:fallbackGate.y+90,r:28,structureId:'qa-front-rock'}],'qa-front');
const landed=fallback.regions.arrivalPoint(fallbackGate,fallback.player.r);
assert(landed&&landed.y>fallbackGate.y);assert(fallback.terrain.isFree(landed.x,landed.y,fallback.player.r+4));
fallback.terrain.setStructures([],'qa-front');
const pool={id:'qa-front-pool',x:fallbackGate.x,y:fallbackGate.y+100,rx:65,ry:50};
fallback.environment={muds:[pool],props:[],isHazardFree:()=>true};
const dryLanding=fallback.regions.arrivalPoint(fallbackGate,fallback.player.r);
assert(dryLanding&&dryLanding.y>fallbackGate.y);assert(!waterIntersectsCircle(pool,dryLanding.x,dryLanding.y,fallback.player.r+4));

// Real generated islands exercise independent collision owners and snapshots.
// Defeat one real gate guardian, then revisit both paired endpoints repeatedly.
const world=new Game();world._spawn=Infinity;world._shot=Infinity;world.player.xpNext=Infinity;world.crystalsNext=Infinity;
verifyWalls(world);assert(world.terrain._structureOwners.get('settlements')?.length);assert(world.terrain._structureOwners.get('relic')?.length);
const sanctuary=world.settlements.sites.find(s=>s.type==='angel'&&s.anchorId?.startsWith('spawn:'));assert(sanctuary);
const portal=world.regions.portals.find(p=>p.nextRegionIndex===1),boss=world.enemies.find(e=>e.id===portal.bossId);
place(world,{x:portal.x,y:portal.y+250});world.regionGrace=0;world.regions.update();world._hurtEnemy(boss,boss.hp+1);world.regions.flushReward();assert(world.chooseSuper(world.getSuperChoices()[0].id));
const originalTerrain=world.terrain,otherOwners=new Map([...world.terrain._structureOwners].filter(([owner])=>owner!=='portals').map(([owner,walls])=>[owner,walls.map(w=>w.id)]));
for(const target of [1,0,1,0,1,0]){
  const endpoint=world.regions.portals.find(p=>p.nextRegionIndex===target);place(world,portalDoor(endpoint));assert(world.enterPortal(endpoint.id));
  const arrival=world.regions.portals.find(p=>p.nextRegionIndex!==target&&p.connectionId===endpoint.connectionId);
  assert(arrival);assert(foot(world).y>arrival.y,'paired travel always arrives in front');assert(world.terrain.isFree(foot(world).x,foot(world).y,world.player.r));
  for(let i=0;i<4;i++){world.update(0);assert.equal(world.regionIndex,target);assert.equal(world.sceneTransition.active,false,'arrival does not bounce back automatically');}
  verifyWalls(world);assert.equal(world.settlements.sites.filter(s=>s.type==='angel'&&s.anchorId?.startsWith('portal:')).length,0,'paired travel does not recreate retired gate angels');
  if(target===0){assert.equal(world.terrain,originalTerrain);assert(world.settlements.sites.includes(sanctuary),'returning preserves the original spawn sanctuary');for(const [owner,ids] of otherOwners)assert.deepEqual(world.terrain._structureOwners.get(owner).map(w=>w.id),ids,'portal restoration must preserve other collision owners');}
}
// Scene-local collision does not leak into hut/castle interiors, and returning
// restores the same outdoor geometry rather than re-appending the frame.
const hut=world.settlements.sites.find(s=>s.type==='supply');place(world,hut.door);assert(world.interact(hut.id));
assert.equal(world.dungeon.active.kind,'hut');assert.equal(structures(world).length,0);assert(!world.terrain._structures.some(o=>o.structureType==='portal'));
place(world,world.dungeon.active.entrance);assert(world.dungeon.exit());assert.equal(world.terrain,originalTerrain);verifyWalls(world);
console.log('Portal entrances: front walk/keyboard entry, solid side/rear walls, debug 660-speed and clamped frame sweeps, locked gates, front dry arrival, persistent independent owners and spawn sanctuary, bounded round trips and interior isolation passed.');
