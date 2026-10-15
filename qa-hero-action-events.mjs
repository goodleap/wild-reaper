import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { HeroAnimator, recordHeroAction } from './dist/hero-animation.js';
import { directionalHeroHands } from './dist/hero-directional-art.js';
import { swordSlashPose } from './dist/sword-art.js';
import { weaponStats } from './dist/combat-stats.js';

const close=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);
function arena(hero='traveler',appearanceId=`${hero}-v2`,initialWeaponId='sword'){
  const g=new Game({hero,appearanceId,initialWeaponId,terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.enemies=[];g.effects=[];g.events=[];g.player.x=g.player.y=0;
  g._spawn=Infinity;g.nextBossAt=Infinity;g.crystalsNext=Infinity;g.player.xpNext=Infinity;
  g._updatePressure=()=>{};return g;
}
function enemy(g,x=60,y=0){
  const e=g._spawnEnemy('slime');Object.assign(e,{x,y,hp:10000,maxHp:10000,speed:0,damage:0});g._rebuildGrid();return e;
}
const sample=(g,animator=new HeroAnimator())=>animator.sample(g.player,{time:g._clock,frozen:g.abilities.isFrozen(g.player)});

// These are real combat entry points, not manually fabricated animation events.
// Mirroring and moving against the attack direction must not displace the grip.
for(const hero of ['traveler','princess','elder'])for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const g=arena(hero),victim=enemy(g,Math.cos(angle)*60,Math.sin(angle)*60),p=g.player,animator=new HeroAnimator();
  Object.assign(p,{moving:true,walkSpeed:p.speed,walkPhase:1.4,moveFacing:angle+Math.PI});
  const walking=sample(g,animator);g.attacks.updateSword(0);
  const event=p._heroAction,visual=g.effects.find(effect=>effect.type==='swordSlash');
  assert.equal(event.kind,'melee');close(event.angle,visual.angle,'actual sword aiming angle');assert.equal(event.priority,3);
  assert.equal(victim.hp,10000,'animation startup must not advance damage');
  const stats=weaponStats(g,'sword');g._clock=stats.hitTime;g.attacks.updateSword(stats.hitTime);
  close(10000-victim.hp,stats.damage,'animation leaves one real contact at the original timing');
  const pose=sample(g,animator),hands=directionalHeroHands(hero,pose);
  assert.equal(pose.view,walking.view,'walking direction owns the lower body');assert.equal(pose.flip,walking.flip);
  const hand=hands[pose.view==='front'?'left':'right'];
  assert.equal(pose.action,'melee');assert.deepEqual(hand,pose.hand,'the actor right arm uses the actual sword hand anchor');
  const blade=swordSlashPose(visual,g,{actor:{entity:p,scale:1.1,shape:{halfWidth:29,top:35,foot:18},immersion:{sink:0}},bodyY:pose.bodyY*1.1});
  close(p.x+hand.x*pose.flip*1.1,blade.x+Math.cos(blade.angle)*blade.grip,'world sword grip x');
  close(p.y+(hand.y+pose.bodyY)*1.1,blade.y+Math.sin(blade.angle)*blade.grip,'world sword grip y');
  const before={hp:p.hp,speed:p.speed,cooldown:g.attacks.sword.cooldown,targetHp:victim.hp,effects:g.effects.length};
  for(let i=0;i<6;i++)sample(g,animator);
  assert.deepEqual({hp:p.hp,speed:p.speed,cooldown:g.attacks.sword.cooldown,targetHp:victim.hp,effects:g.effects.length},before,'render sampling never changes combat');
}

// Facing the camera, the actor's right shoulder is on canvas left. Keep that
// arm attached throughout the real swing, including the cross-body windup.
for(const hero of ['traveler','princess','elder']){
  const g=arena(hero),p=g.player,animator=new HeroAnimator();
  enemy(g,0,60);p.facing=p.moveFacing=Math.PI/2;g.attacks.updateSword(0);
  const visual=g.effects.find(effect=>effect.type==='swordSlash'),stats=weaponStats(g,'sword');
  let previous=0;
  for(const age of [0,stats.windup,stats.hitTime,stats.duration*.8]){
    g._clock=age;g.attacks.updateSword(age-previous);previous=age;
    const pose=sample(g,animator),hands=directionalHeroHands(hero,pose);
    assert.equal(pose.view,'front');assert.equal(pose.action,'melee');
    assert.deepEqual(hands.left,pose.hand,'front right arm owns the real sword grip');
    assert(hands.right.x>0,'the free hand stays on its own side');
    const blade=swordSlashPose(visual,g,{actor:{entity:p,scale:1.1,shape:{halfWidth:29,top:35,foot:18},immersion:{sink:0}},bodyY:pose.bodyY*1.1});
    close(p.x+hands.left.x*1.1,blade.x+Math.cos(blade.angle)*blade.grip,'front swing grip x');
    close(p.y+(hands.left.y+pose.bodyY)*1.1,blade.y+Math.sin(blade.angle)*blade.grip,'front swing grip y');
  }
  const frontPose={view:'front',flip:1,actionStrength:1,aimAngle:Math.PI/2};
  const cast=directionalHeroHands(hero,{...frontPose,action:'cast'});
  assert(cast.left.x<0&&cast.right.x>0&&cast.left.y<cast.right.y,'front casting raises the actor right hand');
  const ranged=directionalHeroHands(hero,{...frontPose,action:'ranged'});
  assert(ranged.left.x<0&&ranged.right.x>0,'front ranged pose keeps hands on their own sides');
  const aimLeft=directionalHeroHands(hero,{...frontPose,action:'ranged',aimAngle:Math.PI*.65});
  const aimRight=directionalHeroHands(hero,{...frontPose,action:'ranged',aimAngle:Math.PI*.35});
  for(const hand of ['left','right'])assert(aimRight[hand].x>ranged[hand].x&&ranged[hand].x>aimLeft[hand].x,'changing hands must not reverse diagonal aiming');
}

// One volley produces one ranged action at its true central projectile angle.
for(const hero of ['traveler','princess','elder']){
  const g=arena(hero,`${hero}-v2`,'arrow');enemy(g,-120,60);g.levels.arrow=3;g._shot=0;g.attacks.updateBasic(0);
  assert.equal(g.player._heroAction.kind,'ranged');assert.equal(g.player._heroAction.priority,3);
  close(g.player._heroAction.angle,Math.atan2(60,-120),'arrow aims at actual target');
  close(g.player._heroAction.angle,g.bullets[0].angle,'arrow action follows central shot');
  assert.equal(sample(g).action,'ranged');
}

// Primary weapon and explicit manual action ownership are stable in a full build.
const fastArrow=arena('princess','princess-v2','arrow');enemy(fastArrow,100);
for(let i=0;i<20;i++)fastArrow.build.increment('rapid');
const fastInterval=weaponStats(fastArrow,'arrow').interval;assert(fastInterval<.32);
fastArrow._shot=0;fastArrow.attacks.updateBasic(0);const firstShot=fastArrow.player._heroAction;
fastArrow._clock=fastInterval;fastArrow.attacks.updateBasic(fastInterval);
assert.notStrictEqual(fastArrow.player._heroAction,firstShot,'a new rapid primary shot starts its own action before the old recovery ends');
close(fastArrow.player._heroAction.startedAt,fastInterval,'rapid action tracks actual launch time');
const priority=arena();enemy(priority,60);priority.levels.arrow=1;priority.attacks.updateSword(0);
const swordEvent=priority.player._heroAction;priority._shot=0;priority.attacks.updateBasic(0);
assert.strictEqual(priority.player._heroAction,swordEvent,'secondary arrow does not steal a sword swing');
assert(priority.abilities.cast('fireball',priority.player,{point:{x:0,y:-160}}));
assert.strictEqual(priority.player._heroAction,swordEvent,'secondary spell does not steal a sword swing');
priority.player.facing=Math.PI/2;priority.attacks.castStorm();const stormEvent=priority.player._heroAction;
assert.equal(stormEvent.kind,'cast');assert.equal(stormEvent.priority,4);close(stormEvent.angle,Math.PI/2,'manual storm keeps its chosen facing');
assert.equal(sample(priority).action,'cast');assert(priority.storm);
priority.attacks.sword.cooldown=0;priority._shot=0;priority.attacks.updateBasic(0);priority.attacks.updateSword(.2);
assert.strictEqual(priority.player._heroAction,stormEvent,'automatic weapons do not steal a manual cast');
priority._clock=1;priority.abilities.clock=1;
assert(priority.abilities.cast('frostbolt',priority.player,{point:{x:-100,y:-100}}));
assert.equal(priority.player._heroAction.kind,'cast');assert.equal(priority.player._heroAction.priority,1);
close(priority.player._heroAction.angle,-Math.PI*.75,'spell event carries actual execution angle');
assert.equal(sample(priority).action,'cast');

const pulse=arena();enemy(pulse);pulse.levels.pulse=1;pulse._pulse=0;pulse.player.facing=-Math.PI/2;pulse.attacks.updatePulse(0);
assert.equal(pulse.player._heroAction.kind,'cast');assert.equal(pulse.player._heroAction.priority,1);
close(pulse.player._heroAction.angle,-Math.PI/2,'radial pulse preserves body facing');
for(const branch of [null,'chain','focus']){
  const lightning=arena();enemy(lightning,-80,0);enemy(lightning,-80,-80);enemy(lightning,0,-80);
  lightning.levels.lightning=branch?5:1;if(branch)lightning.branches.lightning=branch;
  lightning._lightning=0;lightning.attacks.updateLightning(0);
  const first=lightning.effects.find(effect=>effect.type==='lightning'),event=lightning.player._heroAction;
  assert.equal(event.kind,'cast');assert.equal(event.priority,1);
  close(event.angle,Math.atan2(first.y2,first.x2),'lightning body aims at first actual strike, never the last chain hop');
}

// Frozen and original appearances never start new presentation events.
for(const hero of ['traveler','princess','elder']){
  const legacy=arena(hero,hero);enemy(legacy);legacy.levels.arrow=1;legacy.attacks.updateSword(0);legacy._shot=0;legacy.attacks.updateBasic(0);
  legacy.abilities.cast('fireball',legacy.player,{point:{x:0,y:100}});legacy.attacks.castStorm();
  assert.equal(legacy.player._heroAction,undefined,'old appearance stays on its original animation path');
  const frozen=arena(hero);enemy(frozen);frozen.levels.arrow=1;frozen.abilities.statusFor(frozen.player).frozenUntil=1;
  frozen.attacks.updateSword(0);frozen._shot=0;frozen.attacks.updateBasic(0);
  assert.equal(frozen.abilities.cast('fireball',frozen.player,{point:{x:0,y:100}}),false);
  assert.equal(frozen.attacks.castStorm(),false);assert.equal(frozen.player._heroAction,undefined);
  assert.equal(recordHeroAction(frozen,{kind:'cast',priority:4}),false);
  frozen.abilities.statusFor(frozen.player).frozenUntil=0;frozen.player.hp=0;
  assert.equal(recordHeroAction(frozen,{kind:'cast',priority:4}),false,'dead actors cannot start new body actions');
}

// Interruptions cancel the real blade and its future pose, while the currently
// frozen silhouette remains exact until thaw. A later cast must be preserved.
for(const boundary of ['freeze','scene','teleport','unequip']){
  const g=arena(),p=g.player,animator=new HeroAnimator();enemy(g);g.attacks.updateSword(0);
  const held=sample(g,animator);
  if(boundary==='freeze')g.abilities.statusFor(p).frozenUntil=.05;
  else if(boundary==='scene'){g.sceneKind='hut';g.enemies=[];g._rebuildGrid();}
  else if(boundary==='teleport')p.x=2000;
  g._clock=.02;g.attacks.sword.update(.02,boundary==='unequip'?{...weaponStats(g,'sword'),equipped:false}:weaponStats(g,'sword'));
  assert.equal(g.attacks.sword.pending,null,`${boundary} interrupts real contact`);
  if(boundary==='freeze'){
    assert.deepEqual(sample(g,animator),held,'freeze holds the exact pre-freeze silhouette');
    g.abilities.clock=.06;g._clock=.06;
  }
  assert.notEqual(sample(g,animator).action,'melee',`${boundary} must not continue a cancelled sword pose`);
}
const sceneCast=arena();enemy(sceneCast);sceneCast.attacks.updateSword(0);sceneCast.attacks.castStorm();
const manualEvent=sceneCast.player._heroAction;sceneCast.attacks.sword.clearScene();
assert.strictEqual(sceneCast.player._heroAction,manualEvent,'clearing a sword never cancels a different manual action');

// Equal seeds and input produce equal simulation results for old/new artwork,
// including a mixed build, freeze, movement, contact damage and manual storm.
const originalRandom=Math.random;
function combatSnapshot(hero,appearanceId,weapon){
  let seed=340081;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const g=arena(hero,appearanceId,weapon),animator=new HeroAnimator();
  for(const [x,y] of [[60,0],[120,-40],[-100,60],[70,180]])enemy(g,x,y);
  Object.assign(g.levels,{sword:3,arrow:3,orbit:1,pulse:2,lightning:2,fireball:1,frostbolt:1});g._refreshWeapons();
  g._shot=g._pulse=g._lightning=0;g._abilityCooldowns.fireball=g._abilityCooldowns.frostbolt=0;
  for(let i=0;i<90;i++){
    if(i===22)g.abilities.statusFor(g.player).frozenUntil=g.abilities.clock+.25;
    g.update(.025,{x:i<45?1:-1,y:i%20<10?.4:-.4,skill:i===0});
    for(let draw=0;draw<3;draw++)sample(g,animator);
  }
  const p=g.player;
  return {seed,clock:g._clock,time:g.time,runTime:g.runTime,status:g.status,kills:g.kills,
    player:[p.x,p.y,p.hp,p.maxHp,p.speed,p.r,p.level,p.xp,p.skillCooldown,p.skillCooldownMax,p.walkPhase,p.walkSpeed],
    enemies:g.enemies.map(e=>[e.id,e.x,e.y,e.hp,e.r,e.speed,e.branchSlowUntil]),
    bullets:g.bullets.map(b=>[b.x,b.y,b.vx,b.vy,b.damage,b.life,b.pierce,b.bounces]),
    effects:g.effects.map(e=>[e.type,e.x,e.y,e.life,e.r,e.angle,e.attackAge,e.seed]),
    abilities:g.abilities.effects.map(e=>[e.abilityId,e.x,e.y,e.age,e.remaining,e.distance,e.parameters.damage]),
    cooldowns:[g._shot,g._pulse,g._lightning,g.attacks.sword.cooldown,{...g._abilityCooldowns}],
    events:g.events.map(e=>e.type)};
}
try{
  for(const hero of ['traveler','princess','elder'])for(const weapon of ['sword','arrow'])
    assert.deepEqual(combatSnapshot(hero,`${hero}-v2`,weapon),combatSnapshot(hero,hero,weapon),`${hero}/${weapon} new artwork changes no battle results`);
}finally{Math.random=originalRandom;}

console.log('Hero action events: real sword/arrow/spell/storm/pulse/lightning triggers, exact mirrored grip, priority, legacy isolation, freeze/cancellation and identical mixed-build battle results passed.');
