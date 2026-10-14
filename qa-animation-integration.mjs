import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { MonsterArt } from './dist/monster-art.js';
import { enemyAnimationPose, sampleEnemyPose, updateEnemyLocomotion } from './dist/enemy-animation.js';
import { updateSpecialist, initializeSpecialist } from './dist/enemies/specialists.js';
import { AbilityRuntime } from './dist/ability-runtime.js';

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
  for(const method of ['save','restore','translate','rotate','scale','beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','ellipse','fill','stroke','clip','fillRect','drawImage'])ctx[method]=(...args)=>calls.push([method,...args]);
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
      e.walkPhase=(frame%8+.1)*Math.PI/4;
      art.draw(ctx,e,{time:(frame%8+.1)*Math.PI/4/11});
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
