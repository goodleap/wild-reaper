import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { resolveCharacterStats } from './dist/combat-stats.js';

const near=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);
function arena(options={},obstacles=[]) {
  const g=new Game({terrain:new Terrain({obstacles}),adventure:false,environment:false,...options});
  g.enemies=[];g.gems=[];g.coins=[];g._spawn=g.nextBossAt=Infinity;
  g.player.x=0;g.player.y=-groundOffset(g.player,true);
  return g;
}
function advance(g,seconds,input,hz=60) {
  const start={x:g.player.x,y:g.player.y};
  for(let left=seconds;left>1e-9;left-=1/hz)g.update(Math.min(left,1/hz),input);
  return Math.hypot(g.player.x-start.x,g.player.y-start.y);
}

// Measure real simulation displacement, including analog input and diagonals.
// A new hero without a movement modifier inherits the same common reference.
for(const [hero,speed] of [['traveler',320],['princess',358.4],['elder',294.4]]) {
  for(const hz of [30,60,120])for(const [input,factor] of [[{x:1,y:0},1],[{x:1,y:1},1],[{x:.5,y:0},.5]]) {
    const g=arena({hero});
    near(advance(g,1,input,hz),speed*factor,`${hero} ${hz} Hz input ${factor}`);
    near(g.player.walkSpeed,speed*factor,'animation reads actual movement');
    near(g.stats.moveSpeed,speed/320,'legacy stat remains a baseline ratio');
    const phase=g.player.walkPhase;
    near(advance(g,.2,{}),0,'release stops movement');
    assert.equal(g.player.moving,false);near(g.player.walkPhase,phase,'idle feet stop');
  }
}
const future=arena();future.hero={...future.hero,id:'qa-future-role',statModifiers:{}};future._refreshStats();
near(advance(future,1,{x:1}),320,'neutral future role uses shared baseline');

// Upgrade, relic, debug, ground slowing and status slowing compose once.
const grown=arena({hero:'princess',debug:true,debugOptions:{fastMovement:true}});
grown.levels.speed=4;grown.relics.acquire('swiftFeather');grown._refreshStats();
const boosted=358.4*1.32*1.08*3;
near(grown.player.speed,boosted,'grown speed');
for(let i=0;i<5;i++)grown._refreshStats();
near(grown.player.speed,boosted,'refresh does not compound speed');
grown.environment={update(){},movementMultiplier:()=>.74};
const status=grown.abilities.statusFor(grown.player);
status.slowMultiplier=.65;status.slowUntil=grown.abilities.clock+5;
near(advance(grown,.5,{x:1}),boosted*.74*.65*.5,'terrain and skill slowing');
near(resolveCharacterStats(grown).moveSpeed,boosted,'temporary slowing leaves intrinsic speed intact');
status.frozenUntil=grown.abilities.clock+1;
near(advance(grown,.25,{x:1}),0,'freeze stops boosted movement');
assert.equal(grown.player.moving,false);
status.frozenUntil=0;status.slowUntil=0;
near(advance(grown,.25,{x:1}),boosted*.74*.25,'thaw restores movement');

// Current maximum growth/debug movement must still respect full-body walls.
const wall={id:'qa-speed-wall',type:'log',x:80,y:0,r:.5,halfLength:250,angle:Math.PI/2};
const blocked=arena({hero:'princess',debug:true,debugOptions:{fastMovement:true}},[wall]);
blocked.levels.speed=4;blocked.relics.acquire('swiftFeather');blocked._refreshStats();
for(let i=0;i<30;i++) {
  blocked.update(.04,{x:1});
  const p=blocked.player;
  assert(p.x<=wall.x-wall.r-p.r+1e-7,'fast steps do not tunnel through a thin wall');
  assert(blocked.terrain.isFree(p.x,p.y+groundOffset(p,true),p.r),'full body remains outside');
}
const corridor=[-20,20].map(y=>({id:`qa-corridor-${y}`,type:'log',x:300,y,r:2,halfLength:700,angle:0}));
const moving=arena({},corridor);
near(advance(moving,1.5,{x:1}),480,'standard speed traverses a narrow clear passage');
near(advance(moving,.5,{x:-1}),160,'turning preserves speed');
near(moving.player.moveFacing,Math.PI,'animation follows the new direction');

console.log('Movement: 320 reference, role ratios, analog/diagonal input at 30/60/120 Hz, growth/slows/freeze, idle/turning and fast thin-wall collision passed.');
