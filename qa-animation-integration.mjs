import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { MonsterArt } from './dist/monster-art.js';
import { enemyAnimationPose, sampleEnemyPose, updateEnemyLocomotion } from './dist/enemy-animation.js';
import { updateSpecialist, initializeSpecialist } from './dist/enemies/specialists.js';
import { AbilityRuntime } from './dist/ability-runtime.js';
import { frostcrownAssets } from './dist/enemy-art/frostcrown-assets.js';
import { initBoss } from './dist/bosses.js';
import { frostcrownBodyPose, frostcrownFacing } from './dist/enemy-body-geometry.js';

await frostcrownAssets.preload({load:async()=>({width:1254,height:1254})});

function arena(){
  const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  game.enemies=[];game._spawn=Infinity;game.nextBossAt=Infinity;game.player.xpNext=Infinity;game.crystalsNext=Infinity;
  game.build.setEquipped('sword',false);game._refreshWeapons();game._shot=Infinity;game._pulse=Infinity;game._lightning=Infinity;
  game.player.x=game.player.y=0;return game;
}

// Real engine ordering must keep forced displacement out of walking distance.
for(const type of ['beetle','spiderling','flamelizard']){
  const game=arena(),e=game._spawnEnemy(type);
  Object.assign(e,{x:180,y:0,hp:10000,maxHp:10000,speed:0,xp:0,walkPhase:1,damage:0});
  if(e.specialist)e.specialist.cooldown=Infinity;
  game._rebuildGrid();game._hitEnemy(e,1,13,game.player,'sword');game.update(.04);
  assert(e.x>180,`${type}: ordinary knockback still moves the actor`);
  assert.equal(e.walkPhase,1,`${type}: knockback does not animate walking`);assert.equal(e.moving,false);
  const before={x:e.x,y:e.y,phase:e.walkPhase};
  game.status='paused';game.update(.05);assert.deepEqual({x:e.x,y:e.y,phase:e.walkPhase},before);
  game.status='playing';e._weaponPush=null;e.speed=100;
  game.abilities.statusFor(e).frozenUntil=game.abilities.clock+2;game.update(.04);
  assert.deepEqual({x:e.x,y:e.y,phase:e.walkPhase},before,`${type}: freeze holds position and feet`);
  game.abilities.statusFor(e).frozenUntil=game.abilities.clock-.01;game.update(.04);
  assert(e.x<before.x&&e.moving,`${type}: thaw resumes actual pursuit`);
  assert.notEqual(e.walkPhase,before.phase,`${type}: thaw resumes stepping without retaining the frozen flag`);
}

// Foot cycles are based on resolved distance rather than elapsed render time.
{
  const whole={type:'boss',bossKind:'broodmother',x:15,y:0,walkPhase:0};
  updateEnemyLocomotion(whole,0,0,.3);
  const split={type:'boss',bossKind:'broodmother',x:5,y:0,walkPhase:0};
  updateEnemyLocomotion(split,0,0,.1);split.x=15;updateEnemyLocomotion(split,5,0,.2);
  assert(Math.abs(whole.walkPhase-split.walkPhase)<1e-10,'equal travel has equal gait regardless of frame subdivision');
  const phase=split.walkPhase;updateEnemyLocomotion(split,15,0,.1);
  assert.equal(split.walkPhase,phase);assert.equal(split.moving,false,'blocked movement does not march in place');
  split.specialAttack={kind:'leap',phase:'rush',life:.5,maxLife:1};split.x=30;
  updateEnemyLocomotion(split,15,0,.1);assert.equal(split.walkPhase,phase);assert.equal(split.moving,false,'airborne leap does not advance ground footsteps');
}

// Moving actions retain gait sampling as well as their attack chronology.
for(const e of [
  {type:'boss',bossKind:'frostcrown',specialAttack:{kind:'frostCharge',phase:'rush',life:.5,maxLife:1}},
  {type:'boss',bossKind:'furnace',specialAttack:{kind:'furnaceMarch',phase:'rush',life:.5,maxLife:1}},
  {type:'shieldguard',specialist:{phase:'active',timer:1,maxTime:2}}
]){
  const keys=new Set(),cycles=new Set();
  for(let i=0;i<8;i++){
    e.moving=true;e.walkPhase=i*Math.PI/4;
    const pose=sampleEnemyPose(enemyAnimationPose(e));keys.add(pose.key);cycles.add(pose.cycle);
  }
  assert(keys.size>=3&&cycles.size>=3,`${e.bossKind||e.type}: running/advancing keeps alternating legs`);
}

// The real executor's launch moment drives the caster body, even while its
// AI has already entered its longer movement cooldown/recovery phase.
for(const type of ['prismguard','tidepriest','frostmage']){
  const caster={type,id:1,x:0,y:0,r:20,hp:100,damage:10},player={x:180,y:0,r:16,hp:1000,heroId:'traveler'};
  const game={status:'playing',player,enemies:[caster],companions:{members:[]},terrain:{firstBlocker:()=>null},_inView:()=>true,
    _hurtPlayer(damage){player.hp-=damage;return true;},_moveEntity(e,dx,dy){e.x+=dx;e.y+=dy;return{blocked:false};}};
  game.abilities=new AbilityRuntime(game);initializeSpecialist(caster);caster.specialist.cooldown=0;
  updateSpecialist(game,caster,.01);
  const effect=game.abilities.effects[0];assert(effect);
  updateSpecialist(game,caster,effect.windup+.01);game.abilities.update(effect.windup+.01);
  assert.equal(caster.specialist.phase,'recovery');assert.equal(caster._visualCast.phase,'active');
  const pose=enemyAnimationPose(caster);
  assert.equal(pose.mode,'active',`${type}: the visible release follows actual effect timing`);
  assert.equal(pose.action,effect.abilityId);
}

function context(){
  const calls=[],ctx={};
  for(const method of ['save','restore','translate','rotate','scale','transform','beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','ellipse','fill','stroke','clip','fillRect','drawImage'])ctx[method]=(...args)=>calls.push([method,...args]);
  ctx.createLinearGradient=()=>({addColorStop(){}});return{ctx,calls};
}
{
  const art=new MonsterArt(()=>{const {ctx}=context();return{width:0,height:0,getContext:()=>ctx};});
  const e={type:'windhunter',x:0,y:0,id:1,hp:100,visualFacing:0,moving:true,walkPhase:0};
  const first=context();art.draw(first.ctx,e,{time:.2});const sprite=first.calls.find(c=>c[0]==='drawImage')[1],builds=art.cacheStats.builds;
  e.visualFacing=Math.PI;e.walkPhase=Math.PI;
  const frozen=context();art.draw(frozen.ctx,e,{time:8,frozen:true});
  assert.equal(frozen.calls.find(c=>c[0]==='drawImage')[1],sprite,'frozen flight holds the last rendered wing pose');
  assert.equal(art.cacheStats.builds,builds);assert(!frozen.calls.some(c=>c[0]==='scale'&&c[1]===-1),'frozen body cannot flip toward a new target');
  const thawed=context();art.draw(thawed.ctx,e,{time:0,frozen:false});
  assert.notEqual(thawed.calls.find(c=>c[0]==='drawImage')[1],sprite,'thaw restores current wing phase');
  assert(thawed.calls.some(c=>c[0]==='scale'&&c[1]===-1),'thaw restores current facing');
}

// Catch-up simulation may advance the deer several times between two browser
// draws. Freezing must hold that simulated body, not an older rendered frame.
{
  const game=arena(),e=game._spawnEnemy('boss',1);initBoss(e,'frostcrown');
  Object.assign(e,{x:330,y:0,specialCooldown:3600,visualFacing:0});game.player.invuln=1e9;game._rebuildGrid();
  const art=new MonsterArt(()=>{const {ctx}=context();return{width:0,height:0,getContext:()=>ctx};});
  const first=context();art.draw(first.ctx,e,{time:game._clock});
  const oldImage=first.calls.find(call=>call[0]==='drawImage')[1],oldPose=art.lastPoses.get(e).animation.key;
  for(let step=0;step<4;step++)game.update(.04);
  assert(e.moving,'native pursuit advances during undrawn catch-up steps');
  const simulated=frostcrownBodyPose(e),facing=frostcrownFacing(e);
  assert.notEqual(simulated.key,oldPose,'the simulated body has advanced beyond the old rendered frame');
  const status=game.abilities.statusFor(e);status.frozenUntil=game.abilities.clock+1;status.visualFrozen=true;
  game.update(.04);
  const frozenBody=frostcrownBodyPose(e,{frozen:true});assert.equal(frozenBody,simulated);
  const frozen=context();art.draw(frozen.ctx,e,{time:game._clock,frozen:game.abilities.isFrozen(e)});
  assert.equal(art.lastPoses.get(e).animation,frozenBody,'render and collision read the same frozen simulation pose');
  assert.equal(art.lastPoses.get(e).flip,facing);
  assert.notEqual(frozen.calls.find(call=>call[0]==='drawImage')[1],oldImage,'freezing cannot resurrect the stale pre-catch-up bitmap');
  const position={x:e.x,y:e.y};
  for(let step=0;step<4;step++)game.update(.04);
  assert.deepEqual({x:e.x,y:e.y},position);assert.equal(frostcrownBodyPose(e),frozenBody);
  const reduced=context();art.draw(reduced.ctx,e,{time:game._clock,frozen:true,reduced:true});
  assert.equal(art.lastPoses.get(e).animation,frozenBody,'reduced motion cannot diverge from the held physical body');
  status.frozenUntil=game.abilities.clock-.01;game.update(.04);
  art.draw(context().ctx,e,{time:game._clock});
  assert.equal(art.lastPoses.get(e).animation,frostcrownBodyPose(e),'native thaw returns render and body to the same sampled state');
  assert(e.moving);
}

// A full mixed encounter must fit its recurring gait working set, not merely
// stay under the byte cap by rebuilding and evicting every animation frame.
{
  const art=new MonsterArt(()=>{const {ctx}=context();return{width:0,height:0,getContext:()=>ctx};});
  const bosses=['broodmother','deepcaller','frostcrown','furnace'];
  const types=['rootbinder','boglurker','prismguard','tidepriest','shieldguard','stoneape','windhunter','frostmage','flamelizard','spiderling'];
  const entities=[...bosses.map(bossKind=>({type:'boss',bossKind})),...types.map(type=>({type}))].map((e,id)=>({...e,id,x:0,y:0,hp:100,moving:true}));
  const ctx=context().ctx;
  function frames(count){
    for(let frame=0;frame<count;frame++)for(const e of entities){
      // Sixteen samples also visit the stone ape's odd-numbered support poses;
      // eight samples silently exercised only half of its authored gait cache.
      e.walkPhase=(frame%16+.1)*Math.PI/8;
      art.draw(ctx,e,{time:(frame%16+.1)*Math.PI/8/11});
      assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'every mixed-frame draw respects the shared byte cap');
    }
  }
  frames(16);let builds=art.cacheStats.builds;frames(80);
  assert.equal(art.cacheStats.builds,builds,'four bosses and ten specialist gaits share a stable warm cache');
  for(const e of entities)for(const mode of ['windup','active','recovery'])for(let i=0;i<5;i++){
    e.moving=false;e.specialist={phase:mode,timer:1-i/4,maxTime:1};
    art.draw(ctx,e);assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'attack-pose peaks remain bounded');
  }
  for(const e of entities){e.specialist=null;e.moving=true;}
  frames(16);builds=art.cacheStats.builds;frames(80);
  assert.equal(art.cacheStats.builds,builds,'cache settles after a transient attack-pose peak');
}
console.log('Animation integration: actual-distance gait, knockback exclusion, blocked/frozen/paused feet, moving attack gait, shared launch chronology, frozen render pose and stable bounded mixed-encounter cache passed.');
