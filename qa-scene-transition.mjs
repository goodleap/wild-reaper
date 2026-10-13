import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { SCENE_TRANSITION_RULES } from './dist/scene-transition.js';
import { portalDoor } from './dist/portal-geometry.js';

const fresh=()=>{
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.enemies=[];g.gems=[];g.coins=[];g.effects=[];g.events=[];
  g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g.time=31;g.runTime=39;g._clock=39;g.player.hp=73;g.player.skillCooldown=6.2;
  g.gold=17;g.crystals=23;assert(g.relics.acquire('leafWard'));g.barrier.cooldown=4.8;
  return g;
};
const place=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const site=(g,type)=>{
  const s={id:`fade:${type}`,type,name:type,x:400,y:0,door:{x:400,y:30},width:54,depth:28,interactRadius:82,state:'ready',seed:1,guardIds:[],stock:{heal:1}};
  g.settlements.sites=[s];return s;
};
const persistent=g=>({time:g.time,runTime:g.runTime,clock:g._clock,hp:g.player.hp,cooldown:g.player.skillCooldown,xp:g.player.xp,level:g.player.level,gold:g.gold,crystals:g.crystals,kills:g.kills,shield:g.relics.shieldCooldown});
const scene=g=>({x:g.player.x,y:g.player.y,invuln:g.player.invuln,grace:g.regionGrace,shot:g._shot,pulse:g._pulse,lightning:g._lightning,spawn:g._spawn,
  enemies:g.enemies.map(e=>[e.id,e.x,e.y,e.hp,e.guardActive,e.orbitHit]),effects:structuredClone(g.effects),gems:structuredClone(g.gems),coins:structuredClone(g.coins),bullets:structuredClone(g.bullets),enemyBullets:structuredClone(g.enemyBullets)});
const heldInput={x:1,y:1,skill:true,interact:true};
function finish(g){for(let i=0;g.sceneTransition.active&&i<32;i++)g.update(.025,heldInput);assert.equal(g.sceneTransition.active,false);}

assert.deepEqual(SCENE_TRANSITION_RULES,{outDuration:.15,inDuration:.25,castleRitualDuration:.2});
for(const type of ['supply','occupied','castle']){
  const g=fresh(),door=site(g,type),world=g.terrain;
  g.player.hurtFlash=.8;
  place(g,door.door);
  const enemy=g._spawnEnemy('slime',1);Object.assign(enemy,{x:door.door.x+15,y:g.player.y,hp:1000,maxHp:1000,speed:100});
  g.effects.push({type:'ring',x:door.x,y:door.y,life:.6,maxLife:.6,r:10});
  g.gems.push({x:door.door.x,y:door.door.y,value:11,r:5});g.coins.push({x:door.door.x,y:door.door.y,value:4,r:5});
  const originalInteract=g.interact.bind(g),cuts=[];
  g.interact=id=>{cuts.push({opacity:g.sceneTransition.opacity,phase:g.sceneTransition.phase});return originalInteract(id);};
  const before=persistent(g),beforeScene=scene(g),revision=g.sceneTransition.inputRevision;
  assert.equal(g.requestInteraction('missing-door'),false);assert.equal(g.sceneTransition.active,false);
  assert(g.requestInteraction(door.id));assert.equal(g.sceneTransition.phase,type==='castle'?'ritual':'out');assert.equal(g.sceneTransition.opacity,0);
  assert.equal(g.sceneTransition.inputRevision,revision+1,'queued movement is invalidated at transition start');
  assert.equal(g.requestInteraction(door.id),false,'duplicate requests cannot restart a fade');
  assert.equal(originalInteract(door.id),false,'the direct interaction entrypoint cannot bypass an active transition');
  assert.equal(g.enterPortal(),false);
  if(type==='castle'){
    for(let i=0;i<4;i++){g.update(.05,heldInput);assert.equal(g.sceneTransition.opacity,0);assert.deepEqual(persistent(g),before);assert.deepEqual(scene(g),beforeScene);}
    assert.equal(g.sceneTransition.phase,'out');assert.equal(door.activationAge,.2);
  }
  for(let i=0;i<2;i++){
    g.update(.05,heldInput);assert.equal(g.dungeon.active,null);assert.equal(g.terrain,world);
    assert(g.sceneTransition.opacity>0&&g.sceneTransition.opacity<1);
    assert.deepEqual(persistent(g),before,'clocks, health, cooldowns and resources freeze during fade-out');
    assert.deepEqual(scene(g),beforeScene,'nearby attacks, loot, effects and movement also freeze before the cut');
  }
  g.update(.05,heldInput);
  assert.equal(g.sceneTransition.opacity,1,'the scene changes only under a fully opaque frame');
  assert.equal(g.sceneTransition.phase,'in');assert.equal(g.sceneTransition.active,true);
  assert.equal(g.dungeon.active.kind,type==='castle'?'castle':'hut');assert.notEqual(g.terrain,world);
  assert(g.player.invuln>=2,'arrival protection remains active');assert.equal(g.player.hurtFlash,0,'arrival clears the old hurt flash without removing protection');
  assert.deepEqual(cuts,[{opacity:1,phase:'out'}],'exactly one scene change is committed');
  assert.deepEqual(persistent(g),before);
  const indoor=g.dungeon.active,afterCut=scene(g);
  assert.equal(g.regionTransition,null,'the old post-swap flash is replaced by the unified transition');
  for(let i=0;i<5;i++){
    g.update(.05,heldInput);
    assert.equal(g.dungeon.active,indoor);assert.deepEqual(persistent(g),before);
    assert.deepEqual(scene(g),afterCut,'fade-in cannot advance the destination scene, including its new guards');
    if(i<4)assert(g.sceneTransition.active&&g.sceneTransition.opacity>0);
  }
  assert.equal(g.sceneTransition.active,false);assert.equal(g.sceneTransition.opacity,0);assert.equal(g.sceneTransition.phase,'idle');
  assert.equal(g.sceneTransition.inputRevision,revision+2,'input is invalidated again before gameplay resumes');
  assert.equal(cuts.length,1);
  place(g,indoor.entrance);assert(g.requestInteraction(g.getInteraction().id));finish(g);
  assert.equal(g.dungeon.active,null);assert.equal(g.terrain,world);assert.deepEqual(persistent(g),before);
  assert.equal(cuts.length,2,'entering and leaving each commit one scene change');
  if(type==='castle'){
    place(g,door.door);assert(g.requestInteraction(door.id));assert.equal(g.sceneTransition.phase,'out','repeat castle entry only uses the ordinary fade');
    assert.equal(door.activationDuration,.15);finish(g);assert.equal(cuts.length,3);
  }
}

const paused=fresh(),pausedDoor=site(paused,'supply');place(paused,pausedDoor.door);
for(const status of ['paused','upgrade','shop','super','dead']){
  paused.status=status;assert.equal(paused.requestInteraction(pausedDoor.id),false);assert.equal(paused.sceneTransition.active,false);
}
paused.status='playing';assert(paused.requestInteraction(pausedDoor.id));paused.update(.05);
const progress={phase:paused.sceneTransition.phase,opacity:paused.sceneTransition.opacity,elapsed:paused.sceneTransition.elapsed};
paused.status='paused';for(let i=0;i<20;i++)paused.update(.05,heldInput);
assert.deepEqual({phase:paused.sceneTransition.phase,opacity:paused.sceneTransition.opacity,elapsed:paused.sceneTransition.elapsed},progress,'pause also freezes the transition animation');
paused.status='playing';for(const dt of [0,-1,NaN,Infinity])paused.update(dt,heldInput);
assert.deepEqual({phase:paused.sceneTransition.phase,opacity:paused.sceneTransition.opacity,elapsed:paused.sceneTransition.elapsed},progress,'invalid frame durations cannot accidentally commit a scene');
paused.update(30,heldInput);assert.equal(paused.dungeon.active,null,'a background-tab time jump is clamped instead of skipping the fade');
finish(paused);assert.equal(paused.dungeon.active.kind,'hut');

const rejected=fresh(),badDoor=site(rejected,'castle');place(rejected,badDoor.door);
const boss=rejected._spawnEnemy('boss',1);boss.guardActive=true;
assert.equal(rejected.getInteraction().enabled,false);assert.equal(rejected.requestInteraction(badDoor.id),false,'disabled entrances do not run a misleading transition');
rejected.enemies=[];assert(rejected.requestInteraction(badDoor.id));
// Simulate an externally invalidated target. The fade must recover gracefully
// without performing an unrelated interaction or leaving the screen black.
rejected.settlements.sites=[];finish(rejected);
assert.equal(rejected.dungeon.active,null);assert.equal(rejected.sceneTransition.commitSucceeded,false);assert.equal(rejected.status,'playing');

const shop=fresh(),merchant=site(shop,'merchant');place(shop,merchant.door);
assert(shop.requestInteraction(merchant.id));assert.equal(shop.status,'shop');assert.equal(shop.sceneTransition.active,false);assert.equal(shop.gold,17,'opening a shop remains immediate and never buys an item');
const chest=fresh(),hut=site(chest,'supply');place(chest,hut.door);assert(chest.interact(hut.id),'low-level setup API remains immediate outside transitions');
const box=chest.dungeon.active.chests[0];place(chest,box);chest.dungeon.update(0);
assert(chest.requestInteraction(chest.getInteraction().id));assert.equal(box.state,'claimed');assert.equal(chest.sceneTransition.active,false,'claiming a chest does not fade the world');

const deferred=fresh(),deferredHut=site(deferred,'supply');place(deferred,deferredHut.door);deferred.crystals=41;deferred.crystalsNext=40;
deferred.update(0,{interact:true});assert(deferred.sceneTransition.active,'the keyboard interaction path uses the same transition controller');
for(let i=0;i<3;i++)deferred.update(.05);
assert.equal(deferred.sceneTransition.opacity,1);assert.equal(deferred.status,'playing','surplus crystals cannot open a choice over the black midpoint');
for(let i=0;i<4;i++)deferred.update(.05);assert.equal(deferred.status,'playing');
deferred.update(.05);assert.equal(deferred.sceneTransition.active,false);assert.equal(deferred.status,'upgrade','deferred skill choices resume only after fade-in has finished');
assert.equal(deferred.crystals,41,'the transition never spends the pending upgrade resources');

const travel=fresh(),bossGate=travel._spawnEnemy('boss',1);Object.assign(bossGate,{x:180,y:0,hp:0});
travel.regions.openPortal(bossGate);travel.regions.flushReward();assert(travel.chooseSuper(travel.getSuperChoices()[0].id));
const portal=travel.portal,oldTerrain=travel.terrain;place(travel,portalDoor(portal));
const saved=persistent(travel);assert(travel.requestInteraction(portal.id));travel.update(.05);travel.update(.05);
assert.equal(travel.regionIndex,0);assert.equal(travel.terrain,oldTerrain);travel.update(.05);
assert.equal(travel.regionIndex,1);assert.equal(travel.sceneTransition.opacity,1);finish(travel);assert.deepEqual(persistent(travel),saved);
const back=travel.regions.portals.find(p=>p.direction==='back');place(travel,portalDoor(back));assert(travel.requestInteraction(back.id));finish(travel);
assert.equal(travel.regionIndex,0);assert.equal(travel.terrain,oldTerrain);assert.deepEqual(persistent(travel),saved,'portal round trips freeze time and preserve progression');
assert.equal(travel.superSkills.pending,null,'transitions do not replay the portal reward');

console.log('Scene transitions: opaque atomic cuts, short first-castle activation and 0.15/0.25-second fades, full simulation freeze, input revisions, pause/time-clamp safety, immediate shops/chests and persistent castle/hut/portal round trips passed.');
