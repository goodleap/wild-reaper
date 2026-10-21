import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { movementProfile } from './dist/height-rules.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { getExpeditionDefinition } from './dist/expedition-definitions.js';
import { validateContentPack } from './dist/content-schema.js';
import { getConfigSnapshot } from './dist/content-config.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const source=JSON.parse(readFileSync(new URL('./dist/config/stages.json',import.meta.url)));
const {expeditions,...otherStages}=source;
assert.equal(hash(otherStages),'fe95a603017db97ea7e75fd15681c9f0ee6489d83e0f4c0f98f73f06861c8676','the eight island challenges are unchanged');
assert.equal(hash(expeditions.find(d=>d.id==='ship')),'8d8285ffd8f7e744ff6f752c0eb53666651ce2774be91992996cf3130abe0640','the ship scene source remains exact');
assert.equal(hash(expeditions.find(d=>d.id==='survival')),'5946a0983e20b057058f1fd6cc497f036cd8e4952c675a0a35c8149dd0227b35','survival content remains exact');
assert.equal(hash(JSON.parse(readFileSync(new URL('./dist/config/worlds.json',import.meta.url)))),'4886ad69f6c7e43fcdeff80666c5a313b9bb3d3a2665ed1f7980706f7604e92d','all twelve world definitions remain exact');

const definition=getExpeditionDefinition('ship');
assert.equal(definition.scenes.length,3);
assert.deepEqual(definition.reward,{gold:70,crystals:85});
assert.deepEqual(definition.segments.map(({enemies,healthMultiplier,triggerRadius})=>({enemies,healthMultiplier,triggerRadius})),[
  {enemies:{slime:8,beetle:4,bat:2},healthMultiplier:1,triggerRadius:410},
  {enemies:{beetle:8,slime:5,tidepriest:2,brute:2},healthMultiplier:1.15,triggerRadius:410},
  {enemies:{beetle:8,bat:5,brute:3,tidepriest:3},healthMultiplier:1.35,triggerRadius:410},
],'the remade ship retains the original combat populations and strength');
assert.deepEqual(definition.scenes.flatMap(s=>s.supplies.map(p=>p.drop)).sort(),['herb','herb','magnet'],'the existing supply rewards are redistributed, not increased');
assert.equal(definition.start.sceneId,definition.scenes[0].id);
assert.equal(definition.exit.sceneId,definition.scenes.at(-1).id);
for(const scene of definition.scenes){
  assert(scene.bounds.maxX-scene.bounds.minX<=1800&&scene.bounds.maxY-scene.bounds.minY<=1200,'each ship scene stays compact');
  assert(scene.outline.length>=4&&scene.solids.length>0,'ship contours and real internal structures replace the empty rectangle');
}

const game=new Game({mode:'dungeon',dungeonId:'ship'}),run=game.expedition;
game.player.xpNext=game.crystalsNext=Infinity;game.player.invuln=Infinity;
const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,entity===game.player||!!entity.isCompanion)});
let moves=0,walked=0,transitions=0,targets=0,detours=0;
function walk(target){
  assert(game.terrain.isFree(target.x,target.y,game.player.r),`standing space at ${JSON.stringify(target)}`);
  for(let leg=0;distance(foot(game.player),target)>.04&&leg<80;leg++){
    const start=foot(game.player),path=terrainNavigation(game.terrain).find(start,target,game.player.r,'ground');
    assert(path?.length,`${run.currentSceneId}: navigation finds the physical route to ${JSON.stringify(target)}`);
    for(const waypoint of path){
      assert(!game.terrain.firstBlocker(foot(game.player).x,foot(game.player).y,waypoint.x,waypoint.y,game.player.r),'navigation cannot cross ship structures');
      for(let i=0;distance(foot(game.player),waypoint)>.025&&i<3000;i++){
        const before=foot(game.player),d=distance(before,waypoint),step=Math.min(game.player.speed/30,d);
        game._moveEntity(game.player,(waypoint.x-before.x)*step/d,(waypoint.y-before.y)*step/d,true);
        const after=foot(game.player),advance=distance(before,after);
        assert(advance>.0001,'walking progresses without sticking');assert(advance<=step+.01,'movement never teleports across a hull or wall');
        assert(game.terrain.isFree(after.x,after.y,game.player.r),'the whole body stays on walkable floor');
        moves++;walked+=advance;
      }
      assert(distance(foot(game.player),waypoint)<.04,'the complete movement leg finishes');
    }
    assert(distance(start,foot(game.player))>.01,'navigation advances toward the target');
  }
  assert(distance(foot(game.player),target)<.04,'the real target is reached');targets++;
}
function activePopulation(){
  const active=run.groups.filter(group=>group.definition.sceneId===run.currentSceneId);
  const members=new Set(active.flatMap(group=>group.members));
  assert(game.enemies.every(enemy=>members.has(enemy)),'inactive floors do not contribute enemies or receive updates');
  for(const group of active)for(const enemy of group.members.filter(enemy=>enemy.hp>0)){
    assert(game.enemies.includes(enemy));assert(game.terrain.isFree(foot(enemy).x,foot(enemy).y,enemy.r,movementProfile(enemy)),'enemy spawns have whole-body space in their own movement layer');
  }
  assert.equal(game.waveDirector.count,0,'the ship never enables ambient monster waves');
}
function traverse(link){
  walk(link);const before=run.currentSceneId,revision=game.sceneTransition.inputRevision;
  const interaction=game.getInteraction();assert.equal(interaction?.id,link.id);assert(interaction.enabled);
  game.bullets.push({qaOldScene:true});game.enemyBullets.push({qaOldScene:true});game.effects.push({qaOldScene:true});
  assert(game.requestInteraction(link.id),'stairs use the normal scene transition');
  assert.equal(run.currentSceneId,before,'the destination does not commit before fade-out');
  assert.equal(game.requestInteraction(link.id),false,'a repeated press cannot start another handoff');
  for(let i=0;i<30&&game.sceneTransition.active;i++)game.sceneTransition.update(.05);
  assert.equal(game.sceneTransition.active,false);assert(game.sceneTransition.commitSucceeded);
  assert.equal(game.sceneTransition.inputRevision,revision+2,'one handoff releases input at both boundaries exactly once');
  assert.equal(run.currentSceneId,link.to);assert.equal(run.sceneDefinition.id,link.to);
  assert(distance(foot(game.player),link.arrival)<.1,'arrival uses the authored safe landing');
  assert(game.terrain.isFree(foot(game.player).x,foot(game.player).y,game.player.r));
  for(const items of [game.bullets,game.enemyBullets,game.effects])assert(items.every(item=>!item.qaOldScene),'old attacks and effects cannot leak across floors');
  for(const member of game.companions.members){
    assert(game.terrain.isFree(foot(member).x,foot(member).y,member.r,movementProfile(member)),'companions arrive clear of walls');
    assert(distance(foot(member),foot(game.player))<180,'companions follow the player into the destination');
    assert.equal(member._combatTarget,null,'companions drop targets on the other floor');
  }
  transitions++;activePopulation();
}
function clearCurrent(){
  const group=run.groups[run.currentSegment];assert.equal(group.definition.sceneId,run.currentSceneId);
  walk(group.definition.center);run.update(.05);assert(group.active);
  for(const enemy of group.members)if(enemy.hp>0)assert(game._hurtEnemy(enemy,enemy.hp+1)>0);
  run.update(.05);assert(group.cleared);assert.equal(run.currentSegment,group.index+1);
  assert.equal(game.status,'playing','clearing a deck does not complete the entire ship');
}
function inspectScene(){
  const scene=run.sceneDefinition;
  for(const path of scene.paths)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i];assert(!game.terrain.firstBlocker(a.x,a.y,b.x,b.y,24),`${scene.id}: marked route ${JSON.stringify(a)} → ${JSON.stringify(b)} retains companion body clearance`);
  }
  for(const target of [...scene.links,...scene.supplies,...run.groups.filter(group=>group.definition.sceneId===scene.id).map(group=>group.definition.center)])walk(target);
  if(definition.exit.sceneId===scene.id)walk(definition.exit);
  activePopulation();
  // Existing pursuit must route around an actual internal solid in both
  // directions, with both enemy and companion locomotion profiles.
  let pair=null;
  for(const solid of scene.solids){
    const from={x:solid.x-solid.width/2-65,y:solid.y},to={x:solid.x+solid.width/2+65,y:solid.y};
    if(game.terrain.isFree(from.x,from.y,22)&&game.terrain.isFree(to.x,to.y,22)&&game.terrain.firstBlocker(from.x,from.y,to.x,to.y,22)){pair={from,to};break;}
  }
  assert(pair,'the scene contains a real obstacle detour with open flanks');
  for(const companion of [false,true]){
    const actor={id:999999,type:'beetle',r:22,speed:140,phase:0,movementSurge:false,isCompanion:companion};
    actor.x=pair.from.x;actor.y=pair.from.y-groundOffset(actor,companion);
    for(const destination of [pair.to,pair.from]){
      for(let i=0;i<1400&&distance(foot(actor),destination)>=12;i++){
        const before=foot(actor);game._clock+=.05;game._moveEnemy(actor,.05,destination);
        assert(game.terrain.isFree(foot(actor).x,foot(actor).y,actor.r),'detouring bodies remain outside solids');
        assert(distance(before,foot(actor))<=actor.speed*.05+.02,'detouring does not teleport');
      }
      assert(distance(foot(actor),destination)<12,'enemy and companion detours finish in both directions');detours++;
    }
  }
}

assert.equal(run.currentSceneId,definition.start.sceneId);
assert.equal(run.groups[0].members.length,14);assert(run.groups.slice(1).every(group=>group.members.length===0),'unvisited floor populations are not simulated');
for(let i=0;i<20;i++)game.update(.05);
assert(run.groups[0].members.every(enemy=>enemy.guardActive===false),'the entry is a safe arrival before the first encounter');
assert.equal(run.complete(),false);
const firstForward=run.sceneDefinition.links.find(link=>link.to===definition.scenes[1].id);
walk(firstForward);assert.equal(game.getInteraction()?.enabled,false);assert.equal(game.requestInteraction(firstForward.id),false,'uncleared encounter locks its forward stair');
inspectScene();clearCurrent();
const firstTerrain=game.terrain,firstAdventure=game.adventure,firstSupplies=game.adventure.props.length;
const firstSupply=game.adventure.props[0];walk(firstSupply);assert(game.adventure.hitSupply(firstSupply,firstSupply.hp));
const firstPickup=game.adventure.pickups[0];assert(firstPickup);walk(firstPickup);game.adventure.update(0);assert.equal(firstPickup.life,0,'the normal pickup is actually collected');
assert.equal(game.adventure.props.length,firstSupplies-1);
const firstGems=[...game.gems];assert(firstGems.length>0,'combat produced real drops for state preservation checks');
const companion=game.companions.recruit('warden');assert(companion);companion._combatTarget=run.groups[0].members[0];
traverse(firstForward);
const secondTerrain=game.terrain,secondAdventure=game.adventure,secondEnemy=run.groups[1].members[0];
walk(run.groups[1].definition.center);run.update(.05);assert(game._hurtEnemy(secondEnemy,1)>0);const secondHp=secondEnemy.hp;
const secondSupply=game.adventure.props[0];assert(game.adventure.hitSupply(secondSupply,secondSupply.hp));const secondPickup=game.adventure.pickups[0];
assert(secondPickup?.life>0);inspectScene();
const back=run.sceneDefinition.links.find(link=>link.to===definition.start.sceneId);traverse(back);
assert.equal(game.terrain,firstTerrain);assert.equal(game.adventure,firstAdventure);
assert.equal(game.adventure.props.length,firstSupplies-1,'collected supplies do not respawn on a returned floor');
assert(!game.adventure.pickups.some(p=>p.id===firstPickup.id),'collected pickups stay collected');
assert(firstGems.every(gem=>game.gems.includes(gem)),'uncollected dropped gems persist');
assert.equal(run.currentSegment,1,'returning cannot reset challenge progress');
assert.equal(game._hurtEnemy(secondEnemy,999),0,'an enemy on the unloaded floor cannot be attacked');assert.equal(secondEnemy.hp,secondHp);
traverse(firstForward);
assert.equal(game.terrain,secondTerrain);assert.equal(game.adventure,secondAdventure);
assert.equal(secondEnemy.hp,secondHp,'retreat does not heal or reroll surviving guards');
assert(game.adventure.pickups.includes(secondPickup),'unclaimed supplies remain on their own floor');
assert(!game.adventure.props.includes(secondSupply),'broken supply container remains broken');
clearCurrent();const secondForward=run.sceneDefinition.links.find(link=>link.to===definition.exit.sceneId);traverse(secondForward);
assert.equal(run.groups[2].members.length,19);inspectScene();
walk(definition.exit);assert.equal(run.complete(),false,'standing at the final exit before clearing its guards cannot win');
clearCurrent();assert(run.exitOpen);
const finalTerrain=game.terrain,finalBack=run.sceneDefinition.links.find(link=>link.to===definition.scenes[1].id);
traverse(finalBack);walk({x:definition.exit.x,y:definition.exit.y});
assert.equal(run.complete(),false,'matching coordinates on a different floor cannot complete the ship');
traverse(secondForward);assert.equal(game.terrain,finalTerrain);assert(run.groups[2].cleared);
assert(run.groups[2].members.every(enemy=>enemy.hp<=0),'returning to the final deck does not recreate cleared guards');
walk(definition.exit);
const rewardBefore={gold:game.gold,crystals:game.crystals};
for(const status of ['paused','dead']){game.status=status;assert.equal(run.complete(),false);}game.status='playing';
assert(run.complete());assert.equal(game.status,'victory');assert.equal(game.gold-rewardBefore.gold,70);assert.equal(game.crystals-rewardBefore.crystals,85);
assert.equal(run.complete(),false);assert.equal(game.events.filter(e=>e.type==='victory').length,1,'the expedition reward and victory are issued once');
const fresh=new Game({mode:'dungeon',dungeonId:'ship'});assert.equal(fresh.expedition.currentSceneId,definition.start.sceneId);assert.equal(fresh.expedition.currentSegment,0);
assert.equal(fresh.adventure.props.length,firstSupplies);assert.equal(fresh.enemies.length,14,'a fresh run resets only its own three-floor progress');

for(const mutate of [
  d=>{delete d.scenes;},d=>{d.scenes[1].id=d.scenes[0].id;},d=>{d.scenes[0].links[0].to='missing-scene';},
  d=>{d.scenes[0].links[0].arrival.x=1e8;},d=>{d.scenes[0].links[0].requiresSegment=99;},
  d=>{const solid=d.scenes[1].solids[0];d.scenes[0].links[0].arrival={x:solid.x,y:solid.y};},
  d=>{d.scenes[0].links[0].requiresSegment=1;},d=>{d.scenes[1].links=[];},
  d=>{d.segments[0].sceneId='missing-scene';},d=>{d.start.sceneId='missing-scene';},
  d=>{d.scenes[0].outline[0].x=Infinity;},d=>{d.scenes[0].solids[0].points=[];},
]){
  const pack=structuredClone(getConfigSnapshot());mutate(pack.sections.stages.expeditions.find(d=>d.id==='ship'));
  assert.throws(()=>validateContentPack(pack),/Invalid (?:world|expedition scene) configuration|Non-finite number/,'malformed connected scenes must fail before runtime');
}
console.log(JSON.stringify({shipScenes:'passed',scenes:3,targets,moves,walked:Math.round(walked),transitions,detours,otherWorldsUnchanged:12}));
