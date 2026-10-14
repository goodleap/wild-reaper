import assert from 'node:assert/strict';
import { initBoss, updateBoss, resolveBossPhase, clearBossAttacks } from './dist/bosses.js';
import { bossDefinition } from './dist/boss-definitions.js';
import { groundOffset } from './dist/terrain.js';
import { STAGES } from './dist/stage-definitions.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

function fixture(kind){
  const e={id:1,type:'boss',x:0,y:0,r:49,hp:5000,maxHp:5000,damage:30,speed:49,phase:0,guardActive:true};
  initBoss(e,kind);e.y=-groundOffset(e);
  const player={id:0,heroId:'traveler',x:220,y:0,r:14,hp:10000};player.y=-groundOffset(player,true);
  const calls=[],hits=[];
  const game={status:'playing',player,enemies:[e],_clock:0,block:false,free:true,frozen:false,visible:true,
    terrain:{firstBlocker(){return game.block?{id:'wall'}:null;},isFree(){return game.free;},island:{isDry:()=>true}},
    abilities:{cast(id,owner,options){calls.push({id,owner,options});return true;},isFrozen(){return game.frozen;}},
    _inView:()=>game.visible,_effect(){},_hurtPlayer(amount){hits.push(amount);return true;},
    _moveEnemy(){},_branchMovementMultiplier:()=>1,
    _moveEntity(who,dx,dy){if(!game.block){who.x+=dx;who.y+=dy;}return {blocked:game.block};},
    _spawnEnemy(type){const child={id:game.enemies.length+1,type,r:11,x:0,y:0,hp:24,maxHp:24,xp:0};game.enemies.push(child);return child;}
  };
  const tick=(dt=.05)=>{game._clock+=dt;updateBoss(game,e,dt);resolveBossPhase(game,'ranged');};
  const run=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++)tick(.05);};
  const step=value=>{e.specialStep=value;e.specialCooldown=0;e.specialRecovery=0;e.specialAttack=null;tick(.01);};
  return {game,e,player,calls,hits,tick,run,step,p:bossDefinition(kind).parameters};
}

for(const [theme,kind] of [['forest','broodmother'],['beach','deepcaller'],['snow','frostcrown'],['volcano','furnace']]){
  const stage=STAGES.find(s=>s.themeId===theme);assert.equal(stage.islands.find(s=>s.role==='boss').boss.kind,kind);
  const f=fixture(kind);f.run(25);assert(f.calls.length>0,`${kind} runs its actual ability sequence`);
  assert(f.e.specialMarks.length<= (f.p.markCap??0));
  const dormant=fixture(kind);dormant.e.guardActive=false;dormant.run(20);assert.equal(dormant.calls.length,0);
  const paused=fixture(kind);paused.game.status='paused';paused.run(20);assert.equal(paused.calls.length,0);assert.equal(paused.e.specialCooldown,paused.p.initialCooldown);
  const wall=fixture(kind);wall.game.block=true;wall.run(20);assert.equal(wall.calls.length,0,`${kind} never begins a cast through an opaque wall`);
  const frozen=fixture(kind);frozen.game.frozen=true;frozen.run(20);assert.equal(frozen.calls.length,0);
}

const spider=fixture('broodmother');spider.step(1);spider.run(spider.p.windup+.1);
assert(spider.e.specialSummons.length>0);assert(spider.e.specialSummons.length<=spider.p.summonCap);
assert(spider.e.specialSummons.every(e=>e.type==='spiderling'&&e.xp===0&&e.summonerId===spider.e.id));
for(let i=0;i<5;i++){spider.step(1);spider.run(spider.p.windup+.1);}
assert(spider.e.specialSummons.length<=spider.p.summonCap,'repeated summons stay bounded');
const children=[...spider.e.specialSummons];spider.e.hp=0;resolveBossPhase(spider.game,'ranged');
assert(children.every(e=>e.hp===0));assert.equal(spider.e.specialSummons.length,0);
const leap=fixture('broodmother');leap.step(2);const locked={...leap.e.specialAttack.destination};
leap.player.x+=180;leap.run(leap.p.windup+leap.p.leapDuration+.1);
assert(Math.abs(leap.e.x-locked.x)<.001);assert.equal(leap.hits.length,0,'a leap commits to the warned point instead of tracking');
assert(leap.e.specialRecovery>0&&leap.e.specialLift===0);
const canceled=fixture('broodmother');canceled.step(2);canceled.e.hp=0;canceled.run(2);assert.equal(canceled.hits.length,0);assert.equal(canceled.e.specialAttack,null);

const deep=fixture('deepcaller');deep.step(0);assert.equal(deep.e.specialAttack.circles.length,3);
deep.run(deep.p.windup+.1);assert(deep.hits.length>0);assert.equal(deep.e.specialAttack?.phase,'strikes');
deep.run(deep.p.strikeInterval*3);assert.equal(deep.e.specialAttack,null);
deep.step(2);const waves=deep.calls.filter(c=>c.id==='tidalWave');assert.equal(waves.length,2);
assert(Math.hypot(waves[0].options.origin.x-waves[1].options.origin.x,waves[0].options.origin.y-waves[1].options.origin.y)-deep.p.waveWidth>=deep.p.waveGap-1e-6,'parallel waves preserve the promised central gap');
assert(deep.e.specialRecovery>=deep.p.cycleRecovery);

const frost=fixture('frostcrown');frost.step(0);assert.equal(frost.calls.length,frost.p.fanCount);
assert(new Set(frost.calls.map(c=>c.options.angle)).size===frost.p.fanCount);
frost.step(1);const heading=frost.e.specialAttack.angle;frost.player.y+=200;frost.run(frost.p.windup+.1);
assert.equal(frost.e.specialAttack.angle,heading);assert.equal(frost.e.specialAttack.phase,'rush');
frost.run(frost.p.chargeDuration+.1);assert(frost.e.specialMarks.length>0&&frost.e.specialMarks.length<=frost.p.markCap);
frost.step(2);assert(frost.e.specialMarks.every(m=>m.delay!==null));frost.run(frost.p.shatterDelay+frost.p.markCap*frost.p.shatterInterval+.2);assert.equal(frost.e.specialMarks.length,0);
const blocked=fixture('frostcrown');blocked.step(1);blocked.game.block=true;blocked.run(blocked.p.windup+.1);assert.equal(blocked.e.x,0,'charge respects collision');

const furnace=fixture('furnace');furnace.step(0);furnace.run(furnace.p.windup+furnace.p.marchDuration+.1);
assert(furnace.e.specialMarks.length>0&&furnace.e.specialMarks.length<=furnace.p.markCap);
furnace.step(1);const delays=furnace.e.specialMarks.map(m=>m.delay);assert(delays.every((d,i)=>!i||d>delays[i-1]));
furnace.run(furnace.p.eruptionDelay+furnace.p.markCap*furnace.p.eruptionInterval+.1);assert.equal(furnace.e.specialMarks.length,0);
furnace.step(3);assert.equal(furnace.calls.at(-1).id,'flameStream');assert(furnace.e.specialRecovery>furnace.p.flameDuration+furnace.p.cycleRecovery);
furnace.e.specialMarks.push({life:5});furnace.e.specialLift=20;clearBossAttacks(furnace.e);
assert.equal(furnace.e.specialLift,0);assert.equal(furnace.e.specialMarks.length,0);

// The real Game loop and permissions must accept the spells, not merely the
// focused sequence fixture. Keep ordinary spawns and hero damage out of this run.
for(const [kind,expected] of [['broodmother',['domain']],['deepcaller',['vortex','tidalWave']],['frostcrown',['frostbolt','frostRing']],['furnace',['fireball','flameStream']]]){
  const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  game.enemies=[];game._spawn=game.nextBossAt=Infinity;game.player.hp=game.player.maxHp=100000;
  game.player.x=220;game.player.y=-groundOffset(game.player,true);
  for(const id of ['sword','arrow','orbit'])game.build.setEquipped(id,false);
  const boss=game._spawnEnemy('boss',1);initBoss(boss,kind);boss.x=0;boss.y=-groundOffset(boss);boss.damage=1;boss.guardActive=true;boss.hp=boss.maxHp=100000;
  const casts=new Set(),original=game.abilities.cast.bind(game.abilities);
  game.abilities.cast=(id,caster,options)=>{const ok=original(id,caster,options);if(ok)casts.add(id);return ok;};
  for(let frame=0;frame<600;frame++)game.update(.05);
  assert.equal(game.status,'playing');for(const id of expected)assert(casts.has(id),`${kind} can really execute ${id}`);
}

console.log('Specialist Boss QA passed: four stage owners, distinct sequences, locked attacks, terrain, gaps, bounded summons, freeze/pause/death cleanup.');
