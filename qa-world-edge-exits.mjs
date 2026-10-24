import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { getConfigSection } from './dist/content-config.js';
import { groundOffset } from './dist/terrain.js';
import { portalDoor, portalEntranceContains, portalExitGeometry } from './dist/portal-geometry.js';

const place=(g,point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const pointAt=(exit,inward,across=0)=>({x:exit.point.x+exit.normal.x*inward+exit.tangent.x*across,y:exit.point.y+exit.normal.y*inward+exit.tangent.y*across});
for(const edge of ['north','south','east','west']){
  const portal={x:800,y:600,natural:true,worldConnection:true,exitTrigger:{edge,width:240,depth:48}},exit=portalExitGeometry(portal);
  for(const across of [-110,0,110]){
    assert(portalEntranceContains(portal,pointAt(exit,63,across),15),`${edge}: the foot collider touching the inner edge is enough`);
    assert(!portalEntranceContains(portal,pointAt(exit,64,across),15),`${edge}: the approach remains outside until the body arrives`);
  }
  assert(portalEntranceContains(portal,pointAt(exit,30,135),15),`${edge}: road-side contact uses the full body`);
  assert(!portalEntranceContains(portal,pointAt(exit,30,136),15));
  assert(!portalEntranceContains(portal,pointAt(exit,63,135),15),'a diagonal rectangle corner is not a square radius expansion');
  assert(!portalEntranceContains(portal,pointAt(exit,200),15),'roadside directions do not transfer the player');
}
const legacy={x:0,y:0,natural:true,touchRadius:42};
assert.equal(portalExitGeometry(legacy),null);assert(!portalEntranceContains(legacy,{x:50,y:0},15),'legacy natural contacts retain their original radius');

const travel=getConfigSection('worlds').travel;
let crossed=0;
for(const definition of travel.regions){
  const game=new Game({mode:'world',worldId:definition.worldId});
  game.enemies=[];game._spawn=game._shot=game.player.xpNext=game.crystalsNext=Infinity;
  assert(game.worldTravel.safety.contains(feet(game).x,feet(game).y),'a fresh world starts inside its current safe town');
  assert(game.worldTravel.activated.has(definition.worldId),'the relocated initial waypoint is activated by proximity');
  const originalIndex=game.regionIndex,portals=[...game.regions.portals];
  for(const portal of portals){
    const exit=portalExitGeometry(portal),label=`${definition.worldId} → ${portal.nextRegion.id}`;
    assert(exit,`${label}: a configured boundary strip exists`);
    assert(portal.sign&& !portalEntranceContains(portal,portal.sign,game.player.r),`${label}: the sign lies outside the transfer strip`);
    const bounds=game.terrain.island.layout.bounds;
    const expected={north:bounds.minY,south:bounds.maxY,east:bounds.maxX,west:bounds.minX}[portal.exitTrigger.edge];
    assert.equal(['north','south'].includes(portal.exitTrigger.edge)?portal.y:portal.x,expected,`${label}: the exit is on the actual map boundary`);
    const side=exit.halfWidth-game.player.r-8;
    if(crossed===0){
      place(game,portalDoor(portal));
      for(const [key,value] of [['status','paused'],['mode','story'],['mode','dungeon'],['stage',{}],['expedition',{}],['sceneKind','dungeon']]){
        const previous=game[key];game[key]=value;
        assert.equal(game.worldTravel.update(),false,`${key}: other scenes and paused states cannot trigger a world exit`);
        assert(!game.sceneTransition.active);game[key]=previous;
      }
      game.dungeon.active={id:'isolated-room'};assert.equal(game.worldTravel.update(),false);game.dungeon.active=null;
    }
    for(const across of [-side,0,side]){
      const at=pointAt(exit,exit.depth+game.player.r-1,across);
      assert(game.terrain.isFree(at.x,at.y,game.player.r),`${label}: all three lanes admit the complete player collider`);
      place(game,at);assert(game.canEnterPortal(portal.id),`${label}: every road lane enters without a center-distance restriction`);
    }
    place(game,portal.sign);game.update(0);assert(!game.sceneTransition.active,`${label}: touching a direction sign does not leave the map`);
    // A closer unrelated interaction must not mask a road exit, either while
    // scheduling the fade or while committing under the fully opaque frame.
    const interaction=game.getInteraction;
    game.getInteraction=()=>({id:'nearby-marker',type:'worldWaypoint',x:game.player.x,y:feet(game).y,enabled:false});
    place(game,pointAt(exit,exit.depth+game.player.r+20,side));
    const before={gold:game.gold,crystals:game.crystals,kills:game.kills};
    for(let step=0;!game.sceneTransition.active&&step<15;step++)game.update(.025,{x:-exit.normal.x,y:-exit.normal.y});
    assert(game.sceneTransition.active,`${label}: ordinary movement automatically triggers from the road side`);
    assert.equal(game.regionIndex,originalIndex,'fade-out keeps the source scene until its opaque commit');
    for(let step=0;game.sceneTransition.active&&step<30;step++)game.update(.025);
    game.getInteraction=interaction;
    assert.equal(game.regionIndex,portal.nextRegionIndex,`${label}: automatic travel reaches the paired world`);
    assert.deepEqual({gold:game.gold,crystals:game.crystals,kills:game.kills},before,'natural travel grants no combat or treasure rewards');
    const paired=game.regions.portals.find(candidate=>candidate.id===portal.targetPortalId);
    assert(paired);assert(!portalEntranceContains(paired,feet(game),game.player.r+24),'arrival clears the complete destination strip and latch margin');
    assert(game.terrain.isFree(feet(game).x,feet(game).y,game.player.r+4),'arrival has complete physical clearance');
    for(let step=0;step<6;step++)game.update(0);
    assert(!game.sceneTransition.active,'standing at an arrival does not bounce back');
    // An interrupted/restored arrival inside the band is latched by the band,
    // including its far lateral edge, until the body leaves it completely.
    const other=portalExitGeometry(paired),otherSide=other.halfWidth-game.player.r-8;
    place(game,pointAt(other,other.depth,otherSide));game.worldTravel.onRegionEntered();
    game.worldTravel.update();assert(!game.sceneTransition.active,'arrival contact is latched across the full road width');
    place(game,pointAt(other,other.depth,-otherSide));game.worldTravel.update();assert(!game.sceneTransition.active,'moving across an occupied exit does not clear its latch');
    place(game,pointAt(other,other.depth+game.player.r+50,-otherSide));game.worldTravel.update();
    place(game,portalDoor(paired));assert(game.enterPortal(paired.id),'leaving and returning permits intentional reverse travel');
    assert.equal(game.regionIndex,originalIndex);crossed++;
  }
}
assert.equal(crossed,travel.connections.length*2);
console.log(`World edge exits: ${crossed} full-width automatic boundary crossings, foot collision, independent signs, opaque commits, inset arrivals, regional latches and safe town starts passed.`);
