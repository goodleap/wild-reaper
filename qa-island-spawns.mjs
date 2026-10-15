import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Island } from './dist/islands.js';
import { Environment } from './dist/environment.js';
import { regionFor } from './dist/world-definitions.js';

let seed=89021;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!e.heroId)});
function arena(region='forest',fixed=false) {
  const mapSeed=['forest','marsh','ruins'].indexOf(region);
  // This suite exercises ocean shores; the authored forest's enclosing
  // rectangle and internal lakes are covered by the rift suites instead.
  const island=new Island({region,seed:mapSeed,...(region==='forest'?{map:{id:'coast-spawn-fixture',themeId:region,seed:mapSeed}}:{})});
  const terrain=new Terrain({region,island,...(fixed?{obstacles:[]}:{})});
  const g=new Game({terrain,adventure:false});
  g.enemies=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.invuln=1e9;
  g.player.xpNext=g.crystalsNext=Infinity;
  return g;
}
function place(g,point){g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);g._moveEntity(g.player,0,0,true);}
let checked=0;
for(const region of ['forest','marsh','ruins'])for(const [width,height] of [[1100,650],[390,690]]) {
  const g=arena(region),island=g.terrain.island;g.viewWidth=width;g.viewHeight=height;
  for(let index=0;index<island.points.length;index+=16) {
    const edge=island.points[index],point=island.constrain(edge.x*.994,edge.y*.994,g.player.r+1);place(g,point);
    g.environment=new Environment(g,{generation:false});
    for(let i=0;i<12;i++) {
      const enemy=g._spawnEnemy(['slime','beetle','bat','brute','boar','spore'][i%6]);
      assert(enemy,`${region}: an inland spawn exists next to this coastline`);
      const p=foot(enemy);
      assert(island.isDry(p.x,p.y,enemy.r+4),'ordinary ground and flying enemies begin fully on dry land');
      assert(g.terrain.isFree(p.x,p.y,enemy.r+4),'spawns never need obstacle projection');
      assert(!g._inView(enemy,36),'ordinary enemies start beyond the visible screen plus buffer');
      assert(Math.hypot(enemy.x-g.player.x,enemy.y-g.player.y)>200,'coast rejection never squeezes a monster next to the hero');
      g.enemies=[];checked++;
    }
    const outward=Math.atan2(point.y,point.x);
    assert.equal(g._spawnEnemy('brute',undefined,outward),null,'an offshore direction never mirrors to the opposite shore');
    const beforeCount=g.waveDirector.count;g.waveDirector._warn();
    assert.equal(g.pressurePhase,'warning');assert.equal(g.waveDirector.count,beforeCount+1);
    const direction=g.waveDirector.direction.angle;g.waveDirector._attack();g.waveDirector._spawnBatch();
    assert(g.enemies.length>0,'the warning chooses a direction with valid land');
    for(const enemy of g.enemies) {
      const dx=enemy.x-g.player.x,dy=enemy.y-g.player.y;
      assert(dx*Math.cos(direction)+dy*Math.sin(direction)>0,'every wave member enters from its announced side');
      assert(!g._inView(enemy,36));const p=foot(enemy);assert(island.isDry(p.x,p.y,enemy.r+4));
    }
    g.enemies=[];g.waveDirector.reset();
  }
}

const dormant=arena();dormant.regions.guarded=true;dormant.portal={state:'locked'};dormant.nextBossAt=0;
dormant.time=dormant.phaseEndsAt;dormant.waveDirector.update(0);
assert.equal(dormant.pressurePhase,'warning','dormant gate guardians never block exploration waves through a legacy boss timer');

// Movement after a warning can invalidate its corridor. Missing members never
// become a fake victory and the wave cannot flip to another shore mid-attack.
const escaped=arena('forest',true),edge=escaped.terrain.island.points[0];
escaped.waveDirector._warn();assert.equal(escaped.waveDirector.direction.id,'east');
place(escaped,escaped.terrain.island.constrain(edge.x,edge.y,16));
escaped.waveDirector._attack();escaped.waveDirector._spawnBatch();
assert.equal(escaped.waveDirector.spawned,0);
escaped.time=escaped.phaseEndsAt;escaped.waveDirector.update(0);
assert.equal(escaped.waveDirector.cleared,false);assert.equal(escaped.crystals,0);

// Both walking and very large knockback are constrained; all flyer types keep
// their full speed over the same shallow water while respecting the outer edge.
const coast=arena('marsh',true),island=coast.terrain.island,shore=island.points[0];
place(coast,island.constrain(shore.x,shore.y,coast.player.r+18));
coast.environment=new Environment(coast,{generation:false});
const immersion=coast.environment.getImmersion(coast.player,true);
assert(immersion&&immersion.depth>0);assert(coast.environment.movementMultiplier(coast.player,true)<1);
const entities=[coast.player,...['slime','bat'].map(type=>coast._spawnEnemy(type,1)),{type:'angel',flying:true,x:coast.player.x,y:coast.player.y,r:15}];
for(const entity of entities) {
  const isPlayer=entity===coast.player;
  entity.x=coast.player.x;entity.y=coast.player.y+groundOffset(coast.player,true)-groundOffset(entity,isPlayer);
  if(entity.type==='bat'||entity.type==='angel')assert.equal(coast.environment.movementMultiplier(entity,false),1);
  const moved=coast._moveEntity(entity,1600,0,isPlayer),p={x:entity.x,y:entity.y+groundOffset(entity,isPlayer)};
  assert(moved.blocked);assert(island.contains(p.x,p.y,entity.r),'long knockback and flight cannot cross into deep ocean');
}
const summoner=coast._spawnEnemy('slime',1);summoner.x=coast.player.x;summoner.y=coast.player.y;
coast.elites.promote(summoner,'summoner');
for(let slot=0;slot<12;slot++) {
  const p=coast.elites._summonPoint(summoner,slot);
  if(p){assert(island.isDry(p.x,p.y,18));assert(Math.hypot(p.x-coast.player.x,p.y-coast.player.y-groundOffset(coast.player,true))>=95);}
}

// Find a real concave bay, with a direct path that crosses ocean. The pursuit
// goes inland first and converges, rather than sliding forever along the coast.
const chase=arena('marsh',true),outline=chase.terrain.island;
let pair=null;
for(let i=0;i<outline.points.length&&!pair;i++)for(let j=i+4;j<Math.min(i+36,outline.points.length);j++) {
  const a=outline.constrain(outline.points[i].x,outline.points[i].y,42),b=outline.constrain(outline.points[j].x,outline.points[j].y,42),d=Math.hypot(a.x-b.x,a.y-b.y);
  if(d>300&&d<1800&&!outline.containsCapsule(a.x,a.y,b.x,b.y,20)){pair={a,b,d};break;}
}
assert(pair,'a real bay must exercise the pursuit test');place(chase,pair.b);
const pursuer=chase._spawnEnemy('slime',1);pursuer.x=pair.a.x;pursuer.y=pair.a.y-groundOffset(pursuer);pursuer.speed=250;
chase._moveEnemy(pursuer,.025);assert(pursuer._coastTarget,'bay obstruction chooses an inland waypoint');
for(let i=0;i<1000;i++)chase._moveEnemy(pursuer,.025);
assert(Math.hypot(pursuer.x-pair.b.x,pursuer.y+groundOffset(pursuer)-pair.b.y)<100,'coastal navigation reaches the opposite bay');

// World populations have regional strength; waiting, opening routes, or an
// indoor terrain swap never converts exploration into a survival wave run.
const pacing=new Game({mode:'world',encounters:false,companions:false,environment:false,settlements:false});pacing.time=700;
const forest=pacing._difficultyTime();pacing.time=7000;assert.equal(pacing._difficultyTime(),forest);
pacing.regionIndex=2;pacing.region=regionFor(2);const ruins=pacing._difficultyTime();assert(ruins>=forest);
pacing.regions.unlockedConnections.add('0:1');pacing.regions.unlockedConnections.add('1:2');
assert.equal(pacing._difficultyTime(),ruins,'opening connections does not amplify region populations');
pacing.terrain=new Terrain({obstacles:[]});assert.equal(pacing._difficultyTime(),ruins,'entering a room preserves fixed regional strength');
pacing.regions.unlockedConnections.add('0:2');pacing.time+=1000;
assert.equal(pacing.regions.endlessUnlocked,false);assert.equal(pacing._difficultyTime(),ruins);
pacing._updatePressure(.05);assert.equal(pacing.waveDirector.count,0);
const isolated=new Game({adventure:false,terrain:new Terrain({obstacles:[]})});isolated.time=700;assert.equal(isolated._difficultyTime(),700,'isolated legacy arenas retain timed endless balance');
console.log(`Island spawning QA passed: ${checked} dry offscreen coast spawns, directed warnings, safe cancellation, deep-sea bounds, flyers, summons, bay pursuit and fixed world strength.`);
