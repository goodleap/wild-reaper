import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { movementProfile } from './dist/height-rules.js';

let seed=628231;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(terrain=new Terrain({obstacles:[]})){
  const g=new Game({terrain,adventure:false});
  g.enemies=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.invuln=10000;
  return g;
}
function advance(g,seconds){for(let i=0;i<Math.round(seconds/.025);i++){g.update(.025);g.events.length=0;}}

// Every first choice adds a visible attack; the same crystal purchase rules
// and the second threshold still apply, without another opening interruption.
for(const weapon of ['orbit','pulse','lightning']){
  const g=arena();g.addCrystals(40);g.update(0);
  assert.deepEqual(new Set(g.getUpgradeChoices().map(c=>c.id)),new Set(['orbit','pulse','lightning']));
  const first=g.getUpgradeChoices();assert.equal(g.getUpgradeChoices(),first,'opening the panel cannot reroll it');
  assert(g.chooseUpgrade(weapon));assert.equal(g.crystals,0);assert.equal(g.crystalsNext,110);assert.equal(g.skillLevel,2);
  assert.equal(g.player.level,1);assert((weapon==='orbit'?g.weapons:g.skills).some(w=>w.id===weapon));
  const target=g._spawnEnemy('brute',1);Object.assign(target,{x:75,y:0,speed:0,hp:1000,maxHp:1000});
  advance(g,.25);
  if(weapon==='orbit')assert(g.orbitals.length>=2);
  else assert(target.hp<1000,'newly chosen spells start promptly rather than waiting a full cooldown');
}

// Exercise the real engine death callback, not just the director's unit API.
const battle=arena();battle.crystalsNext=Infinity;battle.time=20;battle.update(0);
assert.equal(battle.pressurePhase,'warning');battle.time=23;battle.update(0);
for(let i=0;i<400&&battle.pressurePhase==='siege';i++){
  battle.update(.025);
  for(const enemy of battle.enemies)if(enemy.pressureWave===1&&enemy.hp>0)battle._hurtEnemy(enemy,enemy.hp+1);
}
assert.equal(battle.pressurePhase,'relief');assert.equal(battle.waveDirector.summary().cleared,true);
assert.equal(battle.events.filter(e=>e.type==='waveCleared').length,1);
const earned=battle.crystals;assert(earned>=8);battle.update(0);assert.equal(battle.crystals,earned,'victory cannot pay twice');

// Directional calls really use the existing screen-edge/terrain placement in
// both orientations; check every flank before movement obscures the origin.
for(const [width,height] of [[1100,650],[393,717]])for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const g=arena(new Terrain());g.viewWidth=width;g.viewHeight=height;g.player.x=760;g.player.y=-410;g._moveEntity(g.player,0,0,true);
  for(let i=0;i<16;i++){
    const e=g._spawnEnemy(['slime','beetle','bat','boar'][i%4],undefined,angle+(i%11-5)*.12),dx=e.x-g.player.x,dy=e.y-g.player.y;
    assert(Math.abs(dx)-e.r>=width/2||Math.abs(dy)-e.r>=height/2,'cohorts enter outside the viewport');
    assert(dx*Math.cos(angle)+dy*Math.sin(angle)>0,'the advertised side is respected');
    assert(g.terrain.isFree(e.x,e.y+groundOffset(e),e.r,movementProfile(e)),'directed placement resolves solid terrain');
  }
}

const paused=arena();paused.time=20;paused.update(0);
for(const status of ['upgrade','shop','super','relic','dead']){
  paused.status=status;const before=JSON.stringify({time:paused.time,end:paused.phaseEndsAt,summary:paused.waveDirector.summary()});
  advance(paused,1);assert.equal(JSON.stringify({time:paused.time,end:paused.phaseEndsAt,summary:paused.waveDirector.summary()}),before);
}
paused.status='playing';
const site={id:'wave-return',door:{x:paused.player.x,y:paused.player.y+groundOffset(paused.player,true)}};
assert(paused.dungeon.enter(site));const frozen=JSON.stringify({time:paused.time,end:paused.phaseEndsAt,summary:paused.waveDirector.summary()});
advance(paused,2);
assert.equal(JSON.stringify({time:paused.time,end:paused.phaseEndsAt,summary:paused.waveDirector.summary()}),frozen,'castle play freezes the overworld wave');
assert(paused.dungeon.exit());advance(paused,2);
assert.equal(paused.pressurePhase,'warning','return grace holds the warning rather than silently discarding it');
assert(paused.phaseEndsAt-paused.time>2.9,'the player retains the full warning after return protection');
advance(paused,3.1);assert.equal(paused.pressurePhase,'siege','the stored wave resumes after safe return');

console.log('Pacing integration: first attack choices, real kill credit, directional safe spawns, modal pauses and castle return passed.');
