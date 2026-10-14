import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { DEBUG_OPTION_DEFS } from './dist/debug-mode.js';
import { BOSS_DEFS } from './dist/boss-definitions.js';
import { ENEMY_IDS } from './dist/enemy-definitions.js';
import { WORLD_IDS } from './dist/world-definitions.js';
import { DEBUG_BOSS_RULES, DEBUG_BOSS_ROSTER, spawnDebugBosses } from './dist/debug-training.js';
import { DEBUG_MONSTER_RULES, DEBUG_MONSTER_TYPES, updateDebugMonsterStream } from './dist/debug-wave.js';
import { createCastleState, populateCastle } from './dist/sites/castle-interior.js';
import { STAGES } from './dist/stage-definitions.js';

let seed=516718;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const disabled=Object.fromEntries(DEBUG_OPTION_DEFS.map(def=>[def.id,false]));
const options=enabled=>({...disabled,...enabled});
const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!e.heroId)});
const advance=(g,seconds)=>{for(let left=seconds;left>1e-9;left-=.025)g.update(Math.min(.025,left),{});};
function arena(enabled={},gameOptions={}) {
  const g=new Game({debug:true,debugOptions:options(enabled),adventure:false,terrain:new Terrain({obstacles:[]}),...gameOptions});
  g.enemies=g.enemies.filter(e=>e.debugBoss);g._spawn=Infinity;g.nextBossAt=Infinity;g.player.invuln=1e9;
  g.player.xpNext=g.crystalsNext=Infinity;
  for(const id of Object.keys(g.build.weapons))g.build.setEquipped(id,false);
  g._refreshWeapons();return g;
}
const kinds=Object.keys(BOSS_DEFS).sort();
const rosterIds=DEBUG_BOSS_ROSTER.map(def=>def.id).sort();
const castleVariants=[
  {id:'castle:default:ancient',kind:'ancient',index:1,name:'旧王城守卫 · 震地'},
  {id:'castle:default:bloom',kind:'bloom',index:2,name:'旧王城守卫 · 孢子'},
  {id:'castle:belltower:bloom',kind:'bloom',index:2,name:'暮钟守卫',featureId:'belltower'},
  {id:'castle:furnace:ancient',kind:'ancient',index:1,name:'熔炉守卫',featureId:'furnace'}
];
assert.equal(rosterIds.length,6);assert.equal(new Set(rosterIds).size,6);
assert.deepEqual(DEBUG_BOSS_ROSTER.map(def=>def.kind).sort(),kinds,'exactly one sample per actual combat kind');
assert.equal(DEBUG_BOSS_RULES.health,100000);
assert.equal(DEBUG_MONSTER_RULES.maxEnemies,320);
assert.deepEqual([...DEBUG_MONSTER_TYPES].sort(),ENEMY_IDS.filter(id=>id!=='boss').sort());
assert(Object.isFrozen(DEBUG_MONSTER_TYPES));

// Exercise default real worlds with the nearby fixtures both on and off. Their
// buildings and hazards are precisely what can make a nearby boss disappear.
for(const world of WORLD_IDS)for(const testFacilities of [false,true]) {
  const g=new Game({debug:true,debugWorld:world,debugOptions:options({allBosses:true,testFacilities})});
  const bosses=g.enemies.filter(e=>e.debugBoss),p=foot(g.player);
  assert.deepEqual(bosses.map(e=>e.debugBossId).sort(),rosterIds,`${world}: every independent Boss combat kind is present once`);
  assert.deepEqual(bosses.map(e=>e.bossKind).sort(),kinds,`${world}: all six combat patterns are present without duplicates`);
  for(const boss of bosses) {
    assert.equal(boss.type,'boss');assert.equal(boss.hp,100000);assert.equal(boss.maxHp,100000);
    const definition=DEBUG_BOSS_ROSTER.find(def=>def.id===boss.debugBossId);
    assert.equal(boss.name,definition.name,'testing preserves each boss identity');
    assert.equal(boss.bossKind,definition.kind);
    for(const owner of ['dungeonBoss','dungeonId','dungeonRoom','dungeonHome','stageBoss','stageBossRole','stageHome','portalId','guardianId'])assert.equal(boss[owner],undefined,`${definition.id}: copied samples have no real objective owner`);
    const b=foot(boss),distance=Math.hypot(b.x-p.x,b.y-p.y);
    assert(distance>=DEBUG_BOSS_RULES.minDistance-1e-7&&distance<=DEBUG_BOSS_RULES.maxDistance+1e-7);
    assert(g.terrain.isFree(b.x,b.y,boss.r+12),`${world}: boss feet are clear`);
    assert(g.terrain.island.isDry(b.x,b.y,boss.r+12),`${world}: boss starts on dry land`);
    assert(g.environment.isHazardFree(b.x,b.y,boss.r+14));
    assert(g.settlements._hazardFree(b.x,b.y,boss.r+14));
    assert.equal(g.terrain.firstBlocker(p.x,p.y,b.x,b.y,boss.r+5),null,'boss is approachable from the spawn');
    for(const other of g.enemies)if(other!==boss) {
      const o=foot(other);
      assert(Math.hypot(b.x-o.x,b.y-o.y)>=boss.r+other.r+18-1e-7,'testing bodies do not overlap any starting actor');
    }
  }
  const ids=bosses.map(e=>e.id);assert.deepEqual(spawnDebugBosses(g),[]);
  assert.deepEqual(g.enemies.filter(e=>e.debugBoss).map(e=>e.id),ids);
  g.enemies=g.enemies.filter(e=>!e.debugBoss);assert.deepEqual(spawnDebugBosses(g),[],'defeated or left-behind bosses do not refill');
}

// Actual castle populations can rename or strengthen an existing combat kind.
// Every such population is represented once, without spawning another alias.
for(const difficulty of ['normal','casual']) {
  const testing=arena({allBosses:true},{difficulty});
  for(const variant of castleVariants) {
    const reference=arena({}, {difficulty});
    const state=createCastleState(reference.dungeon,{id:`qa-profile-${variant.id}`,type:'castle',featureId:variant.featureId,door:foot(reference.player)});
    if(!variant.featureId)state.seed=(state.seed&~1)|(variant.index===2?1:0);
    populateCastle(reference.dungeon,state);
    const real=reference.enemies.find(e=>e.dungeonBoss);
    assert(real);assert.equal(real.bossKind,variant.kind);
    const samples=testing.enemies.filter(e=>e.bossKind===real.bossKind);
    assert.equal(samples.length,1,`${difficulty} ${variant.id}: its real combat kind has one sample`);
    assert.equal(samples[0].name,BOSS_DEFS[real.bossKind].name,'samples use the canonical identity, not a castle alias');
  }
}

// Adding debug samples must not relocate, duplicate, strengthen or remove the
// existing guarded objectives; those actors still belong to their real map.
{
  const g=new Game({debug:true,debugOptions:options({})});
  const natural=g.enemies.filter(e=>e.type==='boss');
  assert(natural.length>0,'the real world supplies objective guardians');
  const snapshots=natural.map(e=>JSON.stringify(e));
  const portals=JSON.stringify(g.regions.portals);
  g.debugOptions=Object.freeze(options({allBosses:true}));
  assert.equal(spawnDebugBosses(g).length,6);
  assert.deepEqual(g.enemies.filter(e=>e.type==='boss'&&!e.debugBoss),natural);
  assert.deepEqual(natural.map(e=>JSON.stringify(e)),snapshots);
  assert.equal(JSON.stringify(g.regions.portals),portals);
}

// Killing debug samples outdoors cannot open a real castle treasury,
// complete a stage objective, unlock a portal or count as a regional Boss win.
{
  const g=new Game({debug:true,stageId:STAGES[0].id,debugOptions:options({allBosses:true})});
  g.player.xpNext=g.crystalsNext=Infinity;
  assert(g.dungeon.enter({id:'qa-debug-copy-owner',type:'castle',door:foot(g.player)}));
  const room=g.dungeon.active;assert(g.dungeon.exit());
  const before=JSON.stringify({objectives:[...g.stage.objectives],coreDefeated:g.stage.coreDefeated,bossKills:g.bossKills,portals:g.regions.portals.map(p=>({id:p.id,state:p.state}))});
  for(const boss of g.enemies.filter(e=>e.debugBoss))assert(g._hurtEnemy(boss,boss.hp+1)>0);
  assert.equal(JSON.stringify({objectives:[...g.stage.objectives],coreDefeated:g.stage.coreDefeated,bossKills:g.bossKills,portals:g.regions.portals.map(p=>({id:p.id,state:p.state}))}),before);
  assert.equal(room.bossDefeated,false);assert.equal(room.treasure.state,'locked');
  assert(!g.events.some(event=>['dungeonBossKill','bossKill'].includes(event.type)));
}
const fixtures=new Game({debug:true});
assert(fixtures.enemies.some(e=>e.trainingDummy));assert(!fixtures.enemies.some(e=>e.debugBoss),'nearby facilities no longer bundle a boss');
for(const debug of [false,true]) {
  const g=new Game({debug,debugOptions:options(debug?{}:{allBosses:true,allMonsters:true}),adventure:false,terrain:new Terrain({obstacles:[]})});
  assert.deepEqual(spawnDebugBosses(g),[]);assert.deepEqual(updateDebugMonsterStream(g,.5),[]);
  assert(!g.enemies.some(e=>e.debugBoss||e.debugMonster),'ordinary and disabled debug runs stay isolated');
}

// Four complete catalog cycles force every species through every side. Verify
// the spawn coordinates before real AI movement changes their screen position.
for(const [width,height] of [[1100,650],[393,717]]) {
  const g=arena({allMonsters:true});g.viewWidth=width;g.viewHeight=height;
  const seen=new Map(DEBUG_MONSTER_TYPES.map(type=>[type,new Set()]));
  const firstSides=new Map(['east','west','south','north'].map(side=>[side,[]]));
  for(let batch=0;batch<Math.ceil(DEBUG_MONSTER_TYPES.length*4/DEBUG_MONSTER_RULES.batchSize);batch++) {
    const spawned=updateDebugMonsterStream(g,DEBUG_MONSTER_RULES.interval);
    assert.equal(spawned.length,batch===0?64:16,'initial density and following batches are observable behavior');
    for(const e of spawned) {
      assert(e.debugMonster);assert.notEqual(e.type,'boss');assert(!g._inView(e,36),'the full body starts beyond the viewport');
      const p=foot(e);assert(g.terrain.isFree(p.x,p.y,e.r+4));
      const dx=e.x-g.player.x,dy=e.y-g.player.y;
      const side=Math.abs(dx)/(width/2)>Math.abs(dy)/(height/2)?(dx>0?'east':'west'):(dy>0?'south':'north');
      seen.get(e.type).add(side);
      if(batch===0)firstSides.get(side).push(side==='east'||side==='west'?dy:dx);
    }
    g.enemies=[];
  }
  for(const [type,sides] of seen)assert.equal(sides.size,4,`${type}: catalog cycles visit all four screen edges`);
  for(const [side,coordinates] of firstSides) {
    assert(coordinates.length>=8,`${side}: a substantial initial group arrives from every side`);
    assert(Math.max(...coordinates)-Math.min(...coordinates)>40,`${side}: entries spread along the edge instead of stacking at one point`);
  }
}

// The real Game update must keep the stream alive during Boss and wave rest,
// while every pause and interior entry freezes its clock instead of banking it.
const live=arena({allBosses:true,allMonsters:true});live._spawn=0;live.pressurePhase='relief';live.phaseEndsAt=100;
const initialIds=new Set(live.enemies.map(e=>e.id));live.update(.01);
assert.equal(live.enemies.filter(e=>!initialIds.has(e.id)).length,64,'the very first simulation frame creates a large crowd');
assert(live.enemies.filter(e=>!initialIds.has(e.id)).every(e=>e.debugMonster),'regular exploration does not add a competing random spawn');
advance(live,1);
assert(live.enemies.filter(e=>e.debugMonster).length>=128,'a full second of real boss-fight simulation sustains dense spawning during relief');
const first=live.enemies.find(e=>e.debugMonster),beforeDistance=Math.hypot(first.x-live.player.x,first.y-live.player.y);
advance(live,.1);assert(Math.hypot(first.x-live.player.x,first.y-live.player.y)<beforeDistance,'streamed monsters use their normal pursuit AI');
for(const status of ['paused','upgrade','shop','super','relic','dead']) {
  live.status=status;const state=JSON.stringify(live._debugMonsterStream),count=live.enemies.length;
  advance(live,.6);updateDebugMonsterStream(live,.5);
  assert.equal(JSON.stringify(live._debugMonsterStream),state,`${status}: stream time is paused`);assert.equal(live.enemies.length,count);
}
live.status='playing';
const pausedState=JSON.stringify(live._debugMonsterStream),countBeforeTransition=live.enemies.length;
live.sceneTransition.active=true;updateDebugMonsterStream(live,.5);
assert.equal(JSON.stringify(live._debugMonsterStream),pausedState);assert.equal(live.enemies.length,countBeforeTransition);
live.sceneTransition.active=false;
const indoor=arena({allMonsters:true});indoor.update(.01);
assert(indoor.dungeon.enter({id:'qa-debug-stream-interior',type:'castle',door:foot(indoor.player)}));
const frozen=JSON.stringify(indoor._debugMonsterStream);advance(indoor,.7);
assert.equal(JSON.stringify(indoor._debugMonsterStream),frozen);assert(!indoor.enemies.some(e=>e.debugMonster),'overworld monsters are not injected into a room');
assert(indoor.dungeon.exit());advance(indoor,.55);assert(indoor.enemies.some(e=>e.debugMonster),'the stream resumes after returning outside');

const crowded=arena({allMonsters:true}),limit=DEBUG_MONSTER_RULES.maxEnemies;
for(let i=0;i<limit-2;i++)crowded._spawnEnemy('slime',1);
assert.equal(updateDebugMonsterStream(crowded,.5).length,2);assert.equal(crowded.enemies.filter(e=>e.hp>0).length,limit);
assert.deepEqual(updateDebugMonsterStream(crowded,.5),[],'the shared live-enemy limit is respected');
for(const e of crowded.enemies.slice(0,32))e.hp=0;
assert.equal(updateDebugMonsterStream(crowded,.2).length,16,'the next rapid batch immediately replenishes vacated live slots');
assert.equal(updateDebugMonsterStream(crowded,.2).length,16,'continued replenishment restores the full crowd without restarting');
assert.equal(crowded.enemies.filter(e=>e.hp>0).length,limit);

// Procedural obstacles/coasts remain authoritative. A blocked side may yield,
// but never squeezes the cohort onto visible ground or into unsafe terrain.
let safeSpawns=0;
for(const world of WORLD_IDS) {
  const g=new Game({debug:true,debugWorld:world,debugOptions:options({allMonsters:true})});
  g.viewWidth=393;g.viewHeight=717;
  for(let i=0;i<12;i++) {
    const spawned=updateDebugMonsterStream(g,.5);safeSpawns+=spawned.length;
    for(const e of spawned) {
      const p=foot(e);assert(!g._inView(e,36));assert(g.terrain.isFree(p.x,p.y,e.r+4));
      assert(g.terrain.island.isDry(p.x,p.y,e.r+4));assert(g.environment.isHazardFree(p.x,p.y,e.r+4));
    }
    g.enemies=g.enemies.filter(e=>!e.debugMonster);
  }
}
assert(safeSpawns>0);
const sealed=arena({allMonsters:true});sealed.terrain.isFree=()=>false;
assert.deepEqual(updateDebugMonsterStream(sealed,.5),[],'a sealed map has no unsafe spawn fallback');
assert.equal(sealed.enemies.length,0);
console.log(`Debug rosters: 6 unique Boss combat kinds once at 100000 HP in ${WORLD_IDS.length} worlds, castle-kind coverage and unchanged objective owners; initial 64 with 16 per rapid batch, at least 128 in a real second, four spread offscreen sides, pause/interior isolation, 320-live cap recovery and ${safeSpawns} safe world spawns passed.`);
