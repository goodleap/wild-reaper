import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { getStormGeometry, stormBrightness, stormImpactBrightness, STORM_DURATION } from './dist/storm-geometry.js';
const target=(x,y,seed=1,r=14)=>({x,y,seed,r});
const snapshot=(targets=[],w=1100,h=700)=>({x:0,y:0,viewWidth:w,viewHeight:h,life:STORM_DURATION,maxLife:STORM_DURATION,targets});
const counts={};
function inspect(name,storm){
  const rng=Math.random;Math.random=()=>{throw Error('visual geometry used gameplay randomness');};
  let geometry;try{geometry=getStormGeometry(storm);}finally{Math.random=rng;}
  assert.equal(getStormGeometry(storm),geometry,'one cached snapshot per cast');
  assert.deepEqual(getStormGeometry(structuredClone(storm)),geometry,'same cast always creates the same strokes');
  assert(geometry.mainBolts.length>=8);assert(geometry.mainBolts.length<=geometry.boltLimit);
  assert.equal(geometry.impacts.length,storm.targets.length,'every victim has independent hit feedback, even after death');
  assert.deepEqual(geometry.impacts.map(p=>p.targetIndex),storm.targets.map((_,i)=>i));
  const allPaths=geometry.mainBolts.flatMap(b=>[b.trunk,...b.branches]).concat(geometry.waves.flatMap(w=>w.links),geometry.impacts.flatMap(p=>p.paths));
  assert(allPaths.flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  for(const wave of geometry.waves){
    assert(wave.delay>=0&&wave.delay<.2);
    for(const path of wave.links)assert(Math.hypot(path.at(-1).x-path[0].x,path.at(-1).y-path[0].y)<=72.01,'secondary links stay local');
  }
  for(const bolt of geometry.mainBolts.filter(b=>b.empty)){
    assert(Math.abs(bolt.target.x-storm.x)<storm.viewWidth/2&&Math.abs(bolt.target.y-storm.y)<storm.viewHeight/2,'empty strikes stay within cast viewport');
    assert(Math.hypot(bolt.target.x-storm.x,bolt.target.y-storm.y)>35,'fillers avoid the player');
  }
  counts[name]={targets:storm.targets.length,clusters:geometry.clusterCount,main:geometry.mainBolts.length,empty:geometry.mainBolts.filter(b=>b.empty).length,impacts:geometry.impacts.length,links:geometry.waves.reduce((n,w)=>n+w.links.length,0)};
  return geometry;
}
inspect('empty',snapshot());
const sparse=inspect('sparse',snapshot([target(-100,40,1),target(140,-90,2)]));
assert.equal(sparse.mainBolts.filter(b=>!b.empty).length,2);
assert.equal(sparse.mainBolts.filter(b=>b.empty).length,6);
const dense=inspect('dense',snapshot(Array.from({length:90},(_,i)=>target(90+(i%10)*3,20+Math.floor(i/10)*3,i+1))));
assert.equal(dense.mainBolts.filter(b=>!b.empty).length,1,'a compact horde shares a single sky stroke');
assert.equal(dense.waves.reduce((n,w)=>n+w.links.length,0),89);
const dispersed=inspect('dispersed',snapshot(Array.from({length:20},(_,i)=>target(-390+(i%5)*180,-220+Math.floor(i/5)*145,i+1))));
assert.equal(dispersed.mainBolts.length,20,'widely distributed enemies receive more sky strokes');
const desktop=inspect('desktop180',snapshot(Array.from({length:180},(_,i)=>target(-500+(i%18)*58,-290+Math.floor(i/18)*64,i+1))));
assert.equal(desktop.mainBolts.length,32);
const mobile=inspect('mobile180',snapshot(Array.from({length:180},(_,i)=>target(-177+(i%12)*32,-300+Math.floor(i/12)*41,i+1)),393,717));
assert.equal(mobile.mainBolts.length,24);
inspect('tinyEmpty',snapshot([],280,280));
const caster=snapshot([target(80,60)]),geometry=getStormGeometry(caster),positions=JSON.stringify(geometry);
for(const age of [0,.02,.08,.16,.3,.55,.8]){
  caster.life=caster.maxLife-age;
  assert.equal(JSON.stringify(getStormGeometry(caster)),positions,'advancing or pausing never rebuilds/randomizes the geometry');
  for(const calm of [false,true])for(const wave of geometry.waves){
    const brightness=stormBrightness(caster,calm,wave.delay),impact=stormImpactBrightness(caster,calm,wave.delay);
    assert(Number.isFinite(brightness)&&brightness>=0&&brightness<=1);assert(Number.isFinite(impact)&&impact>=0&&impact<=1);
    if(age+1e-10<wave.delay)assert.equal(brightness,0,'sky strokes wait for their own wave');
    if(age===0)assert(impact>0,'each damage event has immediate contact feedback before delayed main stroke');
  }
}
// Actual combat remains immediate and once per target. Offscreen/hidden targets
// keep their HP; killed-frame snapshots outlive capped generic particle effects.
const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,companions:false,settlements:false});
game.enemies=[];game.effects=[];game.player.xpNext=Infinity;game.crystalsNext=Infinity;game.viewWidth=393;game.viewHeight=717;
for(let i=0;i<180;i++){const e=game._spawnEnemy('slime',1);Object.assign(e,{x:-177+(i%12)*32,y:-300+Math.floor(i/12)*41,hp:100,maxHp:100,speed:0});}
const offscreen=game._spawnEnemy('slime',1);Object.assign(offscreen,{x:900,y:0,hp:100,maxHp:100,speed:0});
const covered=game.enemies.filter(e=>Math.hypot(e.x-game.player.x,e.y-game.player.y)<=300),outside=game.enemies.filter(e=>!covered.includes(e));
game._castStorm();assert.equal(game.kills,covered.length);assert(covered.every(e=>e.hp<=0));assert(outside.every(e=>e.hp===100),'visible targets outside 300 retain HP');assert.equal(game.storm.targets.length,covered.length);assert.equal(game.player.skillCooldown,15);
const clear=getStormGeometry(game.storm);assert.equal(clear.impacts.length,covered.length);assert(game.effects.length<=201);
assert(clear.mainBolts.every(b=>Math.hypot(b.target.x-game.storm.x,b.target.y-game.storm.y)<=300),'decorative empty strikes respect the actual radius');
const state=JSON.stringify(clear);game.player.x=2000;game.player.y=-3000;game.viewWidth=900;game.viewHeight=400;
assert.equal(JSON.stringify(getStormGeometry(game.storm)),state,'leaving/resizing the cast viewport never attaches thunder to the camera');
game.status='paused';const life=game.storm.life;game.update(.2,{});assert.equal(game.storm.life,life);
console.log('Storm coverage, deterministic caching, clustered local links, min/caps, stagger/reduced timing and immediate damage passed:',JSON.stringify(counts));
