import assert from 'node:assert/strict';
import { initBoss, updateBoss, resolveBossPhase } from './dist/bosses.js';
import { bossDefinition } from './dist/boss-definitions.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Game } from './dist/engine.js';
import { AbilityRuntime } from './dist/ability-runtime.js';

const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!e.heroId)});
function fixture(kind){
  const e={id:1,type:'boss',x:0,y:0,r:49,hp:5000,maxHp:5000,damage:30,speed:77,phase:0,guardActive:true};
  initBoss(e,kind);e.y=-groundOffset(e);
  const player={id:0,heroId:'traveler',x:0,y:0,r:14,hp:10000};
  const calls=[],game={status:'playing',player,enemies:[e],enemyBullets:[],_id:1,visible:true,moves:0,pursue:false,free:true,
    terrain:{firstBlocker:()=>null,isFree:()=>game.free,island:{isDry:()=>true}},
    abilities:{isFrozen:()=>false,cast(id,owner,options){calls.push({id,owner,options});return true;}},
    _inView:()=>game.visible,_effect(){},_emit(){},_hurtPlayer:()=>true,
    _moveEnemy(who,dt){game.moves++;if(game.pursue){const a=foot(who),b=foot(player),d=Math.hypot(b.x-a.x,b.y-a.y),step=Math.min(d,who.speed*dt);who.x+=(b.x-a.x)/d*step;who.y+=(b.y-a.y)/d*step;}},
    _moveEntity(who,dx,dy){who.x+=dx;who.y+=dy;return {blocked:false};},
    _spawnEnemy:()=>null
  };
  const position=(distance,angle=0)=>{const a=foot(e);player.x=a.x+Math.cos(angle)*distance;player.y=a.y+Math.sin(angle)*distance-groundOffset(player,true);};
  const tick=(dt=.01)=>{updateBoss(game,e,dt);resolveBossPhase(game,'slam');resolveBossPhase(game,'ranged');};
  return {e,game,player,calls,position,tick,p:bossDefinition(kind).parameters};
}

const sequences={
  broodmother:[['domainRange',260],['summonRange',260],['leapRange',240]],
  deepcaller:[['strikeRange',280],['vortexRange',260],['waveActivationRange',280]],
  frostcrown:[['fanRange',260],['chargeRange',220],['shatterRange',260],['frostRange',155]],
  furnace:[['marchRange',220],['eruptionRange',260],['fireballActivationRange',260],['flameActivationRange',190]]
};
for(const [kind,sequence] of Object.entries(sequences))for(let step=0;step<sequence.length;step++){
  const [key,range]=sequence[step];
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const f=fixture(kind);assert.equal(f.p[key],range);
    f.e.specialStep=step;f.e.specialCooldown=0;f.position(range+1,angle);f.tick();
    assert.equal(f.e.specialStep,step,`${kind}/${key} waits outside its own reach`);
    assert.equal(f.calls.length,0);assert.equal(f.e.specialAttack,null);assert(f.game.moves>0,'pending short skills continue approaching');
    f.position(range-.001,angle);f.tick();
    assert.equal(f.e.specialStep,step+1,`${kind}/${key} starts inside reach from every direction`);
    assert(f.e.specialAttack||f.calls.length>0);
    if(f.e.specialAttack?.phase==='windup')assert(f.e.specialAttack.life>=Math.min(f.p.windup,f.p.shatterDelay||Infinity,f.p.eruptionDelay||Infinity));
    for(const c of f.calls)assert.equal(c.options.windup,f.p.windup,'the full existing spell warning is preserved');
  }
}

for(const [kind,step] of [['frostcrown',3],['furnace',3]]){
  const f=fixture(kind);f.e.specialStep=step;f.e.specialCooldown=0;f.position(230);f.game.pursue=true;
  for(let i=0;i<200&&f.e.specialStep===step;i++)f.tick(.02);
  assert.equal(f.e.specialStep,step+1,`${kind} approaches far enough for its shorter pending attack`);
}
const blocked=fixture('broodmother');blocked.e.specialStep=2;blocked.e.specialCooldown=0;blocked.position(220);blocked.game.free=false;blocked.tick();
assert.equal(blocked.e.specialStep,2,'an obstructed leap destination does not consume or skip the attack');
blocked.game.free=true;blocked.tick();assert.equal(blocked.e.specialStep,3);

for(const kind of Object.keys(sequences)){
  const f=fixture(kind);f.e.specialCooldown=0;f.position(100);f.game.visible=false;f.tick();
  assert.equal(f.e.specialStep,0,`${kind}'s current attacks still require a visible start`);assert(f.game.moves>0);
}
for(const [kind,step,lengthKey] of [['frostcrown',1,'chargeLength'],['furnace',0,'marchLength']]){
  const f=fixture(kind);f.e.specialStep=step;f.e.specialCooldown=0;f.position(210);f.tick();
  const attack=f.e.specialAttack;assert.equal(attack.length,220);
  f.game.visible=false;f.position(900);
  for(let i=0;i<100&&f.e.specialAttack;i++)f.tick(.19);
  assert.equal(f.e.specialAttack,null);assert(Math.abs(f.e.x-f.p[lengthKey])<1e-6,'a committed rush stops exactly at its warned distance even with large time steps');
  assert(f.e.specialMarks.length>0,'moving beyond the camera does not delete committed terrain marks');
  f.e.guardActive=false;f.tick();assert.equal(f.e.specialMarks.length,0,'encounter dormancy still cleans up attacks');
}
const leap=fixture('broodmother');leap.e.specialStep=2;leap.e.specialCooldown=0;leap.position(240);leap.tick();
assert.equal(leap.e.specialAttack.destination.x,240);leap.game.visible=false;leap.position(900);
for(let i=0;i<40&&leap.e.specialAttack;i++)leap.tick(.05);
assert(Math.abs(leap.e.x-240)<1e-6,'the warned leap retains its capped destination offscreen');

const ancient=fixture('ancient');ancient.position(151);ancient.tick();assert(!ancient.e.slam);
ancient.position(150);ancient.tick();assert.equal(ancient.e.slam.r,110);assert.equal(ancient.e.slam.life,1);
const bloom=fixture('bloom');bloom.e.bloomCooldown=0;bloom.position(261);bloom.tick();assert.equal(bloom.e.bloomAttack,null);assert(bloom.game.moves>0);
bloom.position(260);bloom.tick();assert.equal(bloom.e.bloomAttack.life,bloom.p.fanWindup);
for(let i=0;i<110;i++)bloom.tick(.01);
assert.equal(bloom.game.enemyBullets.length,bloom.p.fanCount);
assert(bloom.game.enemyBullets.every(b=>Math.hypot(b.vx,b.vy)*b.life<=330+1e-6),'spore fan projectiles have finite travel');
assert(bloom.p.burstSpacing-2*bloom.p.burstRadius>=bloom.player.r*2+10,'three-circle warning preserves a traversable gap');

// Exercise the real cast admission and geometry in all directions. Foot-based
// activation must not turn into a shorter cast because the Boss is taller.
for(const [kind,step,id,range] of [['broodmother',0,'domain',260],['deepcaller',1,'vortex',260]])for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.player.x=Math.cos(angle)*(range-.001);g.player.y=Math.sin(angle)*(range-.001)-groundOffset(g.player,true);
  const e=g._spawnEnemy('boss',1);initBoss(e,kind);Object.assign(e,{x:0,y:-groundOffset(e),specialStep:step,specialCooldown:0,guardActive:true});
  updateBoss(g,e,.01);
  const cast=g.abilities.effects.find(effect=>effect.abilityId===id);assert(cast,`${kind}'s ground cast works at its directional boundary`);
  assert.equal(cast.parameters.range,range);
}
const wave=fixture('deepcaller');wave.e.specialStep=2;wave.e.specialCooldown=0;wave.position(280);wave.tick();
assert.equal(wave.calls.length,2);
const [left,right]=wave.calls.map(c=>c.options);
assert.equal(left.range,340);assert(left.speed*left.duration>=left.range,'lifetime supports the authored wave range');
assert(Math.hypot(left.origin.x-right.origin.x,left.origin.y-right.origin.y)-left.radius-right.radius>=110-1e-6,'shortened waves retain their safe central lane');
const moving=fixture('deepcaller');moving.game.abilities=new AbilityRuntime(moving.game);moving.e.specialStep=2;moving.e.specialCooldown=0;moving.position(280);moving.tick();
const released=[...moving.game.abilities.effects];assert.equal(released.length,2);moving.game.visible=false;
for(let i=0;i<40;i++)moving.game.abilities.update(.1);
assert(released.every(effect=>Math.abs(effect.distance-340)<1e-6),'real waves stop at the authored travel cap after release');
assert.equal(moving.game.abilities.effects.length,0);
console.log('Boss range QA passed: per-skill boundaries, continued approach, complete warnings, capped rushes, directional field casts, offscreen persistence and encounter cleanup.');
