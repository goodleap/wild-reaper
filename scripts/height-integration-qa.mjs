import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Game } from '../dist/engine.js';
import { Terrain, groundOffset } from '../dist/terrain.js';
import { Island } from '../dist/islands.js';
import { Environment } from '../dist/environment.js';
import { isGrounded, movementProfile, obstacleHeight } from '../dist/height-rules.js';
import { weaponStats } from '../dist/combat-stats.js';
import { compareSceneDepth } from '../dist/scene-rendering.js';

let seed=184219;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const barrier=heightBand=>({id:`${heightBand}-barrier`,type:'log',heightBand,x:0,y:0,r:14,halfLength:80,angle:Math.PI/2});
function arena(obstacles=[],island=null){
  const g=new Game({terrain:new Terrain({obstacles,island}),adventure:false,encounters:false,environment:false,settlements:false,companions:false,elites:false});
  g.levels.arrow=1;g.build.setEquipped('sword',false);
  g.enemies=[];g.effects=[];g.events=[];g.gems=[];g.coins=[];g.bullets=[];g.enemyBullets=[];
  g._spawn=g._shot=g._pulse=g._lightning=g.nextBossAt=Infinity;
  g.player.xpNext=g.crystalsNext=Infinity;g._updatePressure=()=>{};
  return g;
}
function place(g,e,x,y){e.x=x;e.y=y-groundOffset(e,e===g.player||e.isCompanion);}
function enemy(g,type,x,y){const e=g._spawnEnemy(type,1);assert(e);Object.assign(e,{speed:0,hp:10000,maxHp:10000,guardActive:true});place(g,e,x,y);return e;}
function projectile(g,fromX,toX,footY=0){
  const arrow={weaponId:'arrow',x:fromX,y:footY-groundOffset(g.player,true),r:4,vx:toX-fromX,vy:0,life:2,damage:32,pierce:1,targetLimit:1,hitIds:new Set()};
  g._rebuildGrid();g.attacks.updateArrow(arrow,1);return arrow;
}

// Real engine displacement and steering must use the same band. A flyer that
// physically crosses a log but still steers around it has not gained passage.
for(const band of ['low','high']){
  const g=arena([barrier(band)]);
  for(const type of ['slime','bat']){
    const e=enemy(g,type,-120,0),moved=g._moveEntity(e,240,0);
    assert.equal(moved.blocked,band==='high'||type==='slime',`${type} displacement at ${band} barrier`);
    assert.equal(e.x>0,band==='low'&&type==='bat');
    assert(g.terrain.isFree(e.x,e.y+groundOffset(e),e.r,movementProfile(e)));
    place(g,e,-120,0);e._navTimer=0;e.speed=100;
    g._moveEnemy(e,.025,{x:120,y:0});
    assert.equal(!!e._navObstacle,band==='high'||type==='slime',`${type} steering matches its collision band`);
  }
  place(g,g.player,-120,0);assert(g._moveEntity(g.player,240,0,true).blocked);assert(g.player.x<0);
  const ally={id:999,type:'companion',isCompanion:true,kind:'mage',r:15,x:0,y:0};place(g,ally,-120,0);
  assert(g._moveEntity(ally,240,0).blocked,'walking allies retain foot collision');
}

// Ordinary enemy and player projectiles use identical terrain clearance even
// for a single step longer than the entire barrier and target separation.
for(const band of ['low','high']){
  const arrows=arena([barrier(band)]);place(arrows,arrows.player,-140,0);
  const target=enemy(arrows,'slime',140,0),shot=projectile(arrows,-140,200);
  assert.equal(target.hp<10000,band==='low',`player arrow ${band} sweep`);assert(shot.life<=0);
  const spores=arena([barrier(band)]);place(spores,spores.player,140,0);
  spores.enemyBullets.push({id:1,type:'spore',x:-140,y:0,r:6,vx:340,vy:0,life:2,damage:10});
  spores._resolveEnemyAttacks(1);
  assert.equal(spores.player.hp<spores.player.maxHp,band==='low',`enemy projectile ${band} sweep`);
  assert.equal(spores.enemyBullets.length,0);
}

// A blocked closest foe cannot waste every automatic volley when another
// nearby enemy has a usable trajectory; the low equivalent remains eligible.
for(const band of ['low','high']){
  const g=arena([{...barrier(band),halfLength:22}]);place(g,g.player,-100,0);
  const obscured=enemy(g,'slime',90,0),clear=enemy(g,'slime',-100,210);
  assert.equal(g._nearest(g.player.x,g.player.y,400),band==='high'?clear:obscured);
  g._shot=0;g.attacks.updateBasic(0);assert.equal(g.bullets.length,1);
  const shot=g.bullets[0];assert.equal(Math.abs(shot.vy)>Math.abs(shot.vx),band==='high','the actual volley uses the eligible target');
}

// Ricochet and chain lightning choose their next leg from the hit position.
// Their bounds cannot be bypassed by starting a cast on the near side.
for(const band of ['low','high']){
  const ricochet=arena([barrier(band)]);place(ricochet,ricochet.player,-140,0);
  const first=enemy(ricochet,'slime',-55,0),next=enemy(ricochet,'slime',55,0);
  const b={weaponId:'arrow',x:-140,y:ricochet.player.y,r:4,vx:400,vy:0,speed:400,life:2,damage:32,pierce:3,targetLimit:3,maxBounces:2,bounces:0,branch:'ricochet',retention:.65,hitIds:new Set()};
  ricochet._rebuildGrid();ricochet.attacks.updateArrow(b,1);
  assert(first.hp<10000);assert.equal(next.hp<10000,band==='low');
  assert.equal(ricochet.effects.some(e=>e.type==='arrowRicochet'),band==='low','ricochet does not announce an impossible next leg');
  const chain=arena([barrier(band)]);place(chain,chain.player,-140,0);
  const charged=enemy(chain,'slime',-55,0),receiver=enemy(chain,'slime',55,0);
  chain.levels.lightning=5;chain.branches.lightning='chain';chain._lightning=0;chain.attacks.updateLightning(0);
  assert(charged.hp<10000);assert.equal(receiver.hp<10000,band==='low');
  assert.equal(chain.effects.filter(e=>e.type==='lightning').length,band==='low'?2:1);
  const orbit=arena([{...barrier(band),x:-40,r:8}]);place(orbit,orbit.player,-80,0);orbit.levels.orbit=1;orbit._clock=0;
  const victim=enemy(orbit,'slime',orbit.player.x+weaponStats(orbit,'orbit').radius,0);victim.y=orbit.player.y;victim.orbitHit=0;
  orbit._rebuildGrid();orbit.attacks.updateOrbit();
  assert.equal(victim.hp<10000,band==='low','orbit cannot cut a target behind a tall solid');
  assert.equal(orbit.orbitals.some(o=>Math.abs(o.x-victim.x)<1&&Math.abs(o.y-victim.y)<1),band==='low','blocked orbit geometry is not drawn through the solid');
  const mushrooms=arena([barrier(band)]);place(mushrooms,mushrooms.player,-100,0);mushrooms.environment=new Environment(mushrooms,{generation:false});
  const prop={id:'covered-mushroom',type:'mushroom',x:80,y:0,r:17,aimY:-13,state:'idle'};mushrooms.environment.props.push(prop);
  mushrooms._castPulse(mushrooms.player.x,mushrooms.player.y,240,90,0);assert.equal(prop.state,'idle','ground pulse cannot activate a mushroom through a solid');
}

// Ground shockwaves cannot inherit anti-air from direct attacks. Outdoor
// overhead lightning remains useful against both flight and tall cover.
const ground=arena();place(ground,ground.player,0,0);
const slime=enemy(ground,'slime',70,0),bat=enemy(ground,'bat',100,0);
ground._rebuildGrid();ground._castPulse(ground.player.x,ground.player.y,170,90,0);
assert(slime.hp<10000);assert.equal(bat.hp,10000,'ground pulse excludes flying targets');
ground._castStorm();assert(bat.hp<10000,'overhead storm retains anti-air');
const covered=arena([barrier('high')]);place(covered,covered.player,-120,0);
const sheltered=enemy(covered,'brute',120,0);covered._castStorm();assert(sheltered.hp<10000,'outdoor overhead storm reaches behind tall cover');

// Outdoor height clearance must never become authority to reveal a room or
// penetrate its wall. Both awake normal guards and a Boss are protected.
const castle=arena();assert(castle.dungeon.enter({id:'height-castle',door:{x:0,y:19.8}}));
castle.terrain=new Terrain({obstacles:[{...barrier('high'),x:85,halfLength:300,structureType:'castle-wall'}]});
castle.dungeon.active.terrain=castle.terrain;castle.enemies=[];castle.effects=[];place(castle,castle.player,0,19.8);
const near=enemy(castle,'slime',35,19.8),behind=enemy(castle,'brute',150,19.8),boss=enemy(castle,'boss',230,19.8);
for(const e of [near,behind,boss]){e.dungeonId=castle.dungeon.active.id;e.guardActive=true;}
castle._castStorm();assert(near.hp<10000);assert.equal(behind.hp,10000);assert.equal(boss.hp,10000);
assert.equal(castle.storm.targets.length,1,'blocked entities never enter the storm effect target list');

// Low objects inside an already visible room remain visible over cover. The
// same shape tagged as a real wall was rejected by the preceding scenario.
castle.terrain=new Terrain({obstacles:[{...barrier('low'),x:85,halfLength:300}]});castle.dungeon.active.terrain=castle.terrain;
assert(castle.dungeon.canDamage(behind,castle.player),'a fallen log does not become an opaque indoor wall');
assert.equal(castle._nearest(castle.player.x,castle.player.y,400,new Set([near.id])),behind);
const throughLog=projectile(castle,50,210,19.8);assert(behind.hp<10000);assert(throughLog.life<=0);

// A fixed low-air band changes obstacle interaction, not world membership or
// the already established water rules. It never opens deep ocean traversal.
const island=new Island({region:'marsh',seed:3}),coast=arena([],island);
const edge=island.points[0],start=island.constrain(edge.x,edge.y,50);
const flier=enemy(coast,'bat',start.x,start.y),edgeMove=coast._moveEntity(flier,1500,0);
assert(edgeMove.blocked);assert(island.contains(flier.x,flier.y+groundOffset(flier),flier.r));
const wet=arena();wet.environment=new Environment(wet,{generation:false});
wet.environment.muds.push({id:'height-marsh',type:'mud',x:0,y:0,rx:180,ry:100,seed:.5});
place(wet,wet.player,0,0);const wetBat=enemy(wet,'bat',0,0);
assert(wet.environment.getImmersion(wet.player,true)?.sink>0);
assert(wet.environment.movementMultiplier(wet.player,true)<1);
assert.equal(wet.environment.getImmersion(wetBat),null);assert.equal(wet.environment.movementMultiplier(wetBat),1);
// Execute the actual scene ordering function without a browser. This probes
// depth relationships while keeping the actor and its ground shadow immutable.
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const depthCode=app.slice(app.indexOf('function flightCrossesProp('),app.indexOf('function drawScene('));
const context={clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),isGrounded,obstacleHeight,compareSceneDepth};vm.createContext(context);vm.runInContext(depthCode,context);
const flierActor={entity:{type:'bat',r:11},x:0,y:40,footY:60,shape:{radius:11,halfWidth:20,top:27},scale:1,orderId:1};
const lowProp={id:'depth-low',type:'rock',heightBand:'low',x:0,y:70,r:20},tree={id:'depth-high',type:'tree',x:0,y:65,r:14,visual:{halfWidth:35,top:100,bottom:15}};
const order=(actor,props)=>context.sceneDrawList([actor],props).map(item=>item.kind==='actor'?'actor':item.prop.id).join(',');
const actorSnapshot=structuredClone(flierActor);
assert.equal(order(flierActor,[lowProp]),'depth-low,actor');
assert.equal(order({...flierActor,entity:{type:'slime',r:16}},[lowProp]),'actor,depth-low');
assert.equal(order(flierActor,[lowProp,tree]),'actor,depth-high,depth-low','tall silhouette caps flight draw-order promotion');
assert.equal(order(flierActor,[lowProp,{...tree,x:300}]),'depth-high,depth-low,actor','a remote tall prop does not incorrectly cover the flyer');
assert.equal(order(flierActor,[{...lowProp,type:'log',x:15,halfLength:55,angle:Math.PI/3}]),'depth-low,actor','rotated low capsule is crossed in the same depth pass');
assert.deepEqual(flierActor,actorSnapshot,'depth adjustment preserves body and ground shadow coordinates');
console.log('Height integration: actor passage/steering, symmetric swept shots, reachable targeting, ricochet/chain/orbit paths, grounded pulse, prop activation, overhead storm, castle sight, coast/water and flight depth passed.');
