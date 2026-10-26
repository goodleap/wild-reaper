import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {foot,distance} from './dist/sidequests/base.js';
import {terrainNavigation} from './dist/terrain-navigation.js';
import {cleanSidequestState} from './dist/sidequests/state.js';

let checks=0,motionSteps=0;
const equal=(a,b,message)=>{assert.equal(a,b,message);checks++;};
const ok=(a,message)=>{assert.ok(a,message);checks++;};
function fixture(world,id){
  const game=new Game({mode:'world',worldId:world,environment:false,encounters:false,companions:false});
  game.enemies=[];game._shot=game._pulse=game._lightning=Infinity;game.nextBossAt=Infinity;game.player.xpNext=game.crystalsNext=Infinity;
  const scene=game.quests.sidequests.scenes.get(id);game.quests._discover(id);ok(game.quests.accept(id),`${id}: explicitly accept at journal`);
  return {game,scene};
}
function place(game,p){game.player.x=p.x;game.player.y=p.y-19.8;game.dungeon.update(0);}
function tick(scene,seconds,follow){
  for(let t=0;t<seconds;t+=.05){scene.game._clock+=.05;scene.game.time+=.05;if(follow)follow(.05);scene.update(.05);}
}
function use(scene,key,choice){
  const action=scene.actions().find(a=>a.action===key);ok(action,`${scene.id}/${key} is offered`);
  place(scene.game,action);ok(scene.game.terrain.isFree(action.x,action.y,scene.game.player.r),`${key} has an unblocked player approach`);
  equal(scene.game.getInteraction()?.id,action.id,`${key} is reachable through the actual HUD action`);ok(scene.game.requestInteraction(action.id),`${key} executes through real proximity and choice dispatcher`);
  if(choice!==undefined){equal(scene.game.status,'sidequest-choice',`${key} opens paused real choice UI`);ok(scene.host.choose(choice),`${key}/${choice} applies valid choice`);equal(scene.game.status,'playing','choice returns to gameplay');}
}
function walk(scene,goal,{seconds=40,onStep}={}){
  const game=scene.game,nav=terrainNavigation(game.terrain);let steps=0;
  for(;steps<seconds*20&&distance(foot(game.player),goal)>8;steps++){
    game._clock+=.05;const from=foot(game.player),way=nav.waypoint(game.player,from,goal,game.player.r+2,'ground',game._clock,game._clock);
    if(way){const length=distance(from,way),amount=Math.min(15,length);if(length>.001)game._moveEntity(game.player,(way.x-from.x)/length*amount,(way.y-from.y)/length*amount,true);}
    ok(game.terrain.isFree(foot(game.player).x,foot(game.player).y,game.player.r),'walking stays outside real walls');scene.update(.05);onStep?.();motionSteps++;
  }
  ok(distance(foot(game.player),goal)<=8,`${scene.id}: actual collision movement reaches destination`);
}
function guide(scene,label){const g=scene.game.quests.getGuide();ok(g?.complete,`${label}: real quest guide reaches its target`);const goal=scene.targets()[0];ok(distance(g.target,goal)<.1,`${label}: guide targets quest mechanism rather than generic exit`);let from=foot(scene.game.player);for(const p of g.path){ok(!scene.game.terrain.firstBlocker(from.x,from.y,p.x,p.y,scene.game.player.r),'guide never crosses a solid wall');from=p;}return g;}
function exit(scene){place(scene.game,scene.game.dungeon.active.entrance);ok(scene.game.dungeon.exit(),`${scene.id}: normal door returns outside`);}

// Library: real closed/open alternative passage; carry -> put down -> fight ->
// carry along the actual navigable route -> reward once.
{
  const {game,scene}=fixture('ruins','overdue-book');use(scene,'enter');
  equal(game.dungeon.active.chests.length,0,'quest room adds no ordinary duplicate treasure');guide(scene,'closed-side-door book route');walk(scene,{x:-230,y:-210});
  equal(game.terrain.isFree(-200,-210,16),false,'side passage is physically shut');
  use(scene,'open-side');ok(game.terrain.isFree(-200,-210,16),'side passage becomes physically traversable');
  walk(scene,scene.boxPoint);use(scene,'carry');guide(scene,'carrying book exit route');ok(scene.blocksPlayerAttacks,'carrying disables player attacks');use(scene,'put-down');equal(scene.blocksPlayerAttacks,false,'putting box down restores attacks');
  use(scene,'carry');walk(scene,{x:-400,y:280});ok(scene.record.objectives.rescued,'box is physically delivered');equal(scene.blocksPlayerAttacks,false,'delivery restores attacks');
  exit(scene);use(scene,'return');ok(scene.completed,'book quest completed');ok(scene.props.has('bookstall'),'completed bookstall exists');
  const gold=game.gold;equal(scene.actions().some(a=>a.action==='return'),false,'hand-in is no longer offered');equal(game.gold,gold,'no repeat reward');
  equal(cleanSidequestState(scene.state).flags['side-door'],true,'door state survives strict save sanitation');
}
// Wreck: doors stop passage, each valve changes real terrain; the survivor has
// to navigate two offset doors instead of teleporting out.
{
  const {game,scene}=fixture('beach','wreck-knocking');use(scene,'enter');
  guide(scene,'first water valve');equal(game.terrain.isFree(-200,180,16),false,'first flooded doorway blocks walking');
  equal(game.terrain.isFree(200,-100,16),false,'second flooded doorway blocks walking');
  use(scene,'drain-1');guide(scene,'second water valve');ok(game.terrain.isFree(-200,180,16),'first valve opens first physical doorway');
  walk(scene,{x:15,y:30});use(scene,'drain-2');guide(scene,'survivor across open main hold');ok(game.terrain.isFree(200,-100,16),'second valve opens second physical doorway');
  walk(scene,{x:430,y:55});use(scene,'rescue');
  const survivor=scene.actors.get('survivor'),start=foot(survivor);walk(scene,{x:-400,y:280});tick(scene,12);
  ok(distance(start,foot(survivor))>700,'survivor walks across compartments');ok(scene.record.objectives.rescued,'survivor arrived at real entrance');
  walk(scene,{x:310,y:100});use(scene,'drain-3');ok(game.terrain.isFree(400,-220,16),'optional hold physically opens');walk(scene,{x:440,y:-310});use(scene,'salvage');
  equal(cleanSidequestState(scene.state).values['water-stage'],3,'water stage survives save sanitation');
  exit(scene);use(scene,'return');ok(scene.completed,'rescue completed');ok(scene.actions().some(a=>a.action==='salvage-supply'),'salvage station offers actual inventory purchase');
}
// Oath: holding the circle and physically escorting are distinct alternatives;
// leaving the circle cancels safely and can restart without repeated rewards.
for(const mode of ['guard','rescue']){
  const {game,scene}=fixture('ruins','half-oath');use(scene,'read-stone');use(scene,'read-relief');use(scene,'choose-trial',mode);
  if(mode==='guard'){
    place(game,{x:scene.circle.x+240,y:scene.circle.y});tick(scene,2);equal(scene.state.flags.active,false,'leaving guard circle cancels trial');
    use(scene,'choose-trial','guard');for(const e of scene.alive('oath-guards'))e.hp=0;tick(scene,12.5);ok(scene.record.objectives.proved,'timed guard trial completes in circle');
  }else{
    equal(scene.actions().find(a=>a.action==='release').enabled,false,'rescue gate is guarded');for(const e of scene.alive('rescue-guards'))e.hp=0;
    use(scene,'release');ok(game.terrain.isFree(scene.rescuePoint.x,scene.rescuePoint.y+55,16),'rescue cell actually opens');
    walk(scene,scene.home);tick(scene,8);ok(scene.record.objectives.proved,'actual escort returns to the scholar');
  }
  use(scene,'inscribe','protect');ok(scene.completed,`${mode} alternative completes independently`);
  scene.checkpoint();scene.record.sidequest=cleanSidequestState(JSON.parse(JSON.stringify(scene.state)));
  game.quests.sidequests.enterWorld();const restored=game.quests.sidequests.scenes.get('half-oath');
  equal(restored.props.get('stone').label,'只为身后仍有人','chosen inscription survives save sanitation and scene re-entry');
  if(mode==='rescue'){
    const saved=restored.actors.get('captive');equal(saved.hidden,false,'rescued NPC remains visible after save and re-entry');
    ok(distance(foot(saved),restored.home)<100,'rescued NPC remains beside scholar after re-entry');
    ok(game.terrain.isFree(foot(saved).x,foot(saved).y,saved.r),'returned NPC has a valid standing footprint');
  }

}
// Beacons: visible rays are blocked at rocks for the wrong detent, hit visible
// markers at the correct one, and the ship travels continuously on water.
{
  const {game,scene}=fixture('beach','twin-beacons');use(scene,'observe');
  ok(scene.beamGeometry(0).occluded,'wrong angle ray actually stops at reef geometry');equal(scene.beamGeometry(0).hit,false,'blocked beam cannot light marker');
  use(scene,'turn-0','angle-1');equal(scene.state.flags.sailing,undefined,'one light alone cannot summon boat');use(scene,'turn-1','angle-1');
  ok(scene.record.objectives.aligned,'both geometric rays reach markers');let before={...scene.props.get('boat')};
  tick(scene,1);const during=scene.props.get('boat');ok(distance(before,during)>30&&distance(during,scene.dock.arrival)>100,'boat really moves before arrival');
  for(let t=0;t<=1;t+=.04)ok(scene.isWater({x:scene.dock.start.x+(scene.dock.arrival.x-scene.dock.start.x)*t,y:scene.dock.start.y+(scene.dock.arrival.y-scene.dock.start.y)*t},30),'entire boat approach stays in real water');
  tick(scene,12);ok(!scene.actors.get('visitor').hidden,'merchant appears only after physical arrival');use(scene,'greet');ok(scene.completed,'beacon harbor unlock completes');
}
// Market: watch an actual neutral moving thief, then test both genuine outcomes.
for(const outcome of ['intercept','follow']){
  const {game,scene}=fixture('clockshadow-city','market-pickpocket');use(scene,'watch');
  place(game,scene.watch);for(let i=0;i<240&&scene.state.choices.phase!=='running';i++)tick(scene,.05);equal(scene.state.choices.phase,'running','theft is witnessed only after thief walks up and takes goods');
  const thief=scene.actors.get('thief');ok(!game.enemies.includes(thief),'thief is not an automatic combat target');
  if(outcome==='intercept')use(scene,'intercept','return');
  else{
    // Keep a visible following distance and let the neutral actor traverse the
    // actual city collision geometry; no teleport moves the thief.
    const trail=[];for(let i=0;i<600&&scene.state.choices.phase==='running';i++){
      const p=foot(thief);ok(game.terrain.isFree(p.x,p.y,thief.r),'thief follows actual traversable city ground');trail.push(p);if(trail.length>18)place(game,trail.shift());tick(scene,.05);
    }
    equal(scene.state.choices.phase,'stash','shadowing reaches actual hideout');use(scene,'recover');
  }
  use(scene,'return');ok(scene.completed,`${outcome} outcome completes`);
  if(outcome==='follow'){const gold=game.gold;use(scene,'stash-find');equal(game.gold,gold+16,'hideout yields one-time recovered money');equal(scene.actions().some(a=>a.action==='stash-find'),false,'hideout cannot duplicate its reward');}
  else ok(scene.actors.has('watchman'),'interception leaves a market watchman');
}
// Stage: knowingly bad arrangements fail the marked physical route. Clear
// placements require an actual full walk before opening and persist as scenery.
{
  const {game,scene}=fixture('clockshadow-city','courtyard-stage');
  for(const key of ['stage','seat','crate'])use(scene,`place-${key}`,'across');
  use(scene,'rehearse');tick(scene,3);equal(scene.state.flags.rehearsing,false,'blocked rehearsal stops');equal(!!scene.record.objectives.rehearsed,false,'blocked layout cannot pass');
  for(const key of ['stage','seat','crate'])use(scene,`place-${key}`,'clear');
  const actor=scene.actors.get('performer');use(scene,'rehearse');const start=foot(actor);tick(scene,8);
  ok(scene.record.objectives.rehearsed,'clear rehearsal finishes by walking the full route');ok(distance(start,foot(actor))>350,'performer really traverses stage route');
  use(scene,'open');ok(scene.completed,'plaza performance unlocked');equal([...scene.actors.keys()].filter(k=>k.startsWith('audience-')).length,3,'persistent audience exists');
}
console.log(`Settlement sidequests: ${checks} checks, ${motionSteps} real walking steps; all 6 quests and alternative routes passed.`);
