import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { enemyDefinition } from './dist/enemy-definitions.js';
import { initBoss, updateBoss, resolveBossPhase } from './dist/bosses.js';
import { updateBoar } from './dist/enemies/boar.js';
import { updateSpecialist } from './dist/enemies/specialists.js';
import { Encounters } from './dist/encounters.js';
import { Adventure } from './dist/adventure.js';

let seed=83713;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const near=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-6,`${label}: ${actual} != ${expected}`);
const arena=(options={})=>new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,...options});
const speeds={slime:145,beetle:170,bat:250,brute:110,boar:150,spore:100,boss:140,rootbinder:90,boglurker:140,prismguard:90,tidepriest:105,shieldguard:100,stoneape:105,windhunter:210,frostmage:95,flamelizard:120,spiderling:230};

// Measure displacement through the real navigation/terrain path. The clock and
// phase stay at zero here to isolate forward speed from the bat's side weaving.
for(const [type,speed] of Object.entries(speeds)){
  const g=arena(),e=g._spawnEnemy(type,1);g.player.x=2000;g.player.y=-groundOffset(g.player,true);
  Object.assign(e,{x:0,y:-groundOffset(e),phase:0});
  for(let frame=0;frame<60;frame++)g._moveEnemy(e,1/60);
  near(e.x,speed,`${type} actual one-second advance`);near(e.y,-groundOffset(e),`${type} stays on course`);
}
for(const [difficulty,time,growth] of [['normal',600,1.36],['normal',6000,1.85],['casual',0,.9]]){
  const g=arena({difficulty});g.time=time;const e=g._spawnEnemy('slime',1);
  near(e.speed,145*growth,`${difficulty}/${time} preserves one difficulty multiplier`);
}

// Each Boss retains its movement style and surge, using the larger shared base
// once. Actual decisions must approach an out-of-range target instead of cast.
for(const [kind,multiplier] of Object.entries({ancient:1,bloom:.75,broodmother:.8,deepcaller:.65,frostcrown:.8,furnace:.75}))for(const surge of [1,2.15]){
  const g=arena(),e=g._spawnEnemy('boss',1);initBoss(e,kind);
  Object.assign(e,{x:0,y:-groundOffset(e),guardActive:true});g.player.x=2000;g.player.y=-groundOffset(g.player,true);
  g._clock=surge===1?0:Math.PI/2/.85;
  for(let frame=0;frame<60;frame++)if(!updateBoss(g,e,1/60))g._moveEnemy(e,1/60);
  near(e.x,140*multiplier*surge,`${kind} real approach at surge ${surge}`);
  assert(!e.slam&&!e.bloomAttack&&!e.specialAttack,`${kind} only approaches outside attack range`);
}

// Authored scene factories can override ordinary spawn stats. Exercise the
// public scene entries so none silently restores the former slow values.
for(const [difficulty,castleSpeed] of [['normal',140],['casual',124]]){
  const g=arena({difficulty});assert(g.dungeon.enter({id:`movement-${difficulty}`,door:{x:0,y:groundOffset(g.player,true)}}));
  near(g.enemies.find(e=>e.dungeonBoss).speed,castleSpeed,`${difficulty} castle Boss`);
}
{
  const g=new Game({stageId:'forest-trial'}),e=g.enemies.find(enemy=>enemy.stageBoss);
  assert(e,'stage initialization spawned its authored Boss');
  near(e.speed,140*g.stage.currentIsland.boss.speed,'stage Boss keeps its individual multiplier');
}
{
  const g=arena(),portal={id:'movement-guardian',x:1200,y:0};g.regions._spawnGuardian(portal);
  near(g.enemies.find(e=>e.id===portal.bossId).speed,140,'world guardian uses the shared Boss speed');
  g.adventure=new Adventure(g,{generation:false});g.adventure.treasure={id:'movement-treasure',x:100,y:0,r:27,state:'locked'};g.adventure._treasureCount=1;g.adventure._activateTreasure();
  const guard=g.enemies.find(e=>e.guardianId==='movement-treasure');assert(guard,'treasure entry spawned its guard');
  near(guard.speed,enemyDefinition(guard.type).baseSpeed*1.1,'treasure guard keeps its authored boost once');
}
for(const id of ['ship','moon']){
  const g=new Game({mode:'dungeon',dungeonId:id});assert(g.enemies.length>0);
  for(const e of g.enemies)near(e.speed,speeds[e.type],`${id} finite group ${e.type}`);
}

for(const [difficulty,speed] of [['normal',200],['casual',180]]){
  const g=arena({difficulty});g.encounters=new Encounters(g,{generation:false});
  const event=g.encounters.spawn('treasure',1000,0);assert(event,'treasure encounter spawns');
  const e=g.enemies.find(enemy=>enemy.id===event.enemyId);near(e.speed,speed,`${difficulty} treasure runner`);
  // Keep the hero nearby so the complete second exercises fleeing rather than
  // the deliberate idle/return behavior once the runner has opened a gap.
  for(let i=0;i<60;i++){
    g.player.x=e.x-100;g.player.y=e.y+groundOffset(e)-groundOffset(g.player,true);
    g.encounters.updateEnemy(e,1/60);
  }
  near(e.x-1000,speed,`${difficulty} runner's actual one-second flee`);
  assert(e.speed<g.player.speed,'unboosted heroes can catch the runner on foot');
}

function attackFixture(type,slow=1){
  const g=arena(),e=g._spawnEnemy(type==='frostcrown'||type==='furnace'?'boss':type,1);
  Object.assign(e,{x:0,y:0,groundOffset:0,guardActive:true,chargeCooldown:0});
  Object.assign(g.player,{x:type==='boglurker'?210:220,y:0,groundOffset:0,hp:100000});
  g.environment={movementMultiplier:()=>slow};
  let tick,state;
  if(e.type==='boss'){
    initBoss(e,type);e.specialCooldown=0;e.specialStep=type==='frostcrown'?1:0;
    tick=dt=>{updateBoss(g,e,dt);resolveBossPhase(g,'ranged');};state=()=>e.specialAttack;
  }else if(type==='boar'){tick=dt=>updateBoar(g,e,dt);state=()=>e.charge;}
  else {e.specialist.cooldown=0;tick=dt=>updateSpecialist(g,e,dt);state=()=>e.specialist;}
  return {g,e,tick,state};
}
const attacks={
  boar:{speed:450,warning:.8,budget:220,cap:220,phase:'rush'},
  boglurker:{speed:470,warning:.85,budget:210,cap:210,phase:'active'},
  frostcrown:{speed:460,warning:1,budget:304.5,cap:220,phase:'rush'},
  furnace:{speed:210,warning:1.1,budget:231,cap:220,phase:'rush'},
  windhunter:{speed:300,warning:.55,budget:126,cap:Infinity,phase:'active'}
};
for(const [type,rule] of Object.entries(attacks))for(const slow of [1,.5,1.5])for(const frameTime of [1/60,.19]){
  const f=attackFixture(type,slow);f.tick(.000001);
  assert.equal(f.state().phase,'windup',`${type} begins with warning`);
  f.tick(rule.warning-.01);near(Math.hypot(f.e.x,f.e.y),0,`${type} never moves early`);
  assert.equal(f.state().phase,'windup');f.tick(.011);assert.equal(f.state().phase,rule.phase);
  // A target leaving after commitment must not stretch the locked attack.
  f.g.player.x=type==='windhunter'?300:2000;
  f.tick(.01);near(Math.hypot(f.e.x,f.e.y),rule.speed*slow*.01,`${type} actual first rush step`);
  for(let i=0;i<200&&f.state()?.phase===rule.phase;i++)f.tick(frameTime);
  assert.notEqual(f.state()?.phase,rule.phase,`${type} completes under frame size ${frameTime}`);
  near(Math.hypot(f.e.x,f.e.y),Math.min(rule.cap,rule.budget*slow),`${type} preserves travel on terrain factor ${slow}`);
  if(type==='windhunter'){
    const slash=f.g.abilities.effects.find(effect=>effect.abilityId==='windSlash');assert(slash,'the faster strafe still releases its projectile');
    near(slash.parameters.speed,240,'movement tuning does not accelerate the projectile');
    near(slash.parameters.range,300,'movement tuning does not extend the projectile');
  }
}
console.log('Enemy movement: all archetype advances, six Boss approaches/surges, difficulty growth, castle/stage/world/treasure/expedition spawns, full warnings and terrain-adjusted rush/strafe endpoints passed.');
