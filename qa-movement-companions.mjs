import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment } from './dist/environment.js';
import { movementProfile } from './dist/height-rules.js';

// Use the real update, following, navigation, collision and locomotion paths.
// Empty arenas suppress unrelated generation; no movement or recovery method
// is replaced, so a successful catch-up cannot hide a teleport.
const dt=.025;
const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!(e.heroId||e.isCompanion))});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const caps={stormcaller:377.6,warden:377.6,dog:420,owl:395,golem:336};
function arena({hero='traveler',speedRank=0,obstacles=[]}={}){
  const g=new Game({hero,terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.enemies=[];g.effects=[];g.events=[];g.gold=10000;
  g._worldExploration=true;g._spawn=g.nextBossAt=g.crystalsNext=g.player.xpNext=Infinity;
  g.build.setEquipped('sword',false);g.levels.speed=speedRank;g._refreshStats();
  g.player.y=-groundOffset(g.player,true);g.player.invuln=1e6;
  return g;
}
function advance(g,member,seconds,input={},sample=()=>{}){
  for(let left=seconds;left>1e-8;left-=dt){
    const step=Math.min(left,dt),before=foot(member);
    g.update(step,input);
    assert.equal(g.status,'playing');
    const after=foot(member),moved=distance(before,after);
    assert(moved<=(member._followSpeed||0)*step+.001,`${member.kind}: every step is walking, without recovery teleport`);
    assert(g.terrain.isFree(after.x,after.y,member.r,movementProfile(member)),`${member.kind}: full body stays clear of terrain`);
    sample({moved,speed:moved/step,gap:distance(after,foot(g.player))});
  }
}

const results=[];
for(const hero of ['traveler','princess'])for(const speedRank of [0,4])for(const kind of Object.keys(caps)){
  const g=arena({hero,speedRank}),member=g.companions.recruit(kind,{x:-300,y:0});
  assert(member);let maximumSpeed=0,maximumGap=0;
  const sample=({speed,gap})=>{maximumSpeed=Math.max(maximumSpeed,speed);maximumGap=Math.max(maximumGap,gap);};
  // Straight running, two turns, then a full stop expose catch-up, turning and
  // arrival damping rather than checking only the configured speed number.
  advance(g,member,4,{x:1},sample);
  advance(g,member,2,{y:1},sample);
  advance(g,member,2,{x:-1},sample);
  assert(maximumGap<450,`${hero}/${speedRank}/${kind}: a fast leader never strands its follower`);
  assert(maximumSpeed>g.player.speed,`${hero}/${speedRank}/${kind}: the follower has actual catch-up headroom`);
  if(hero==='traveler'&&speedRank===0)assert(Math.abs(maximumSpeed-caps[kind])<1e-7,`${kind}: distinct baseline walking pace`);
  advance(g,member,3);
  assert(distance(foot(member),foot(g.player))<=member.followDistance+1,`${kind}: settles at follow distance`);
  const settled=foot(member);advance(g,member,1);
  assert(distance(foot(member),settled)<.01&&!member.moving,`${kind}: stops without orbiting or idle walking animation`);
  results.push({hero,speedRank,kind,leaderSpeed:g.player.speed,maxSpeed:+maximumSpeed.toFixed(2),maxGap:+maximumGap.toFixed(2)});
}

// Terrain slowing still applies exactly once to grounded companions; the owl
// retains its flying exemption even though its leader is slowed by the pool.
for(const kind of ['stormcaller','dog','owl','golem']){
  const samples=[];
  for(const wet of [false,true]){
    const g=arena(),member=g.companions.recruit(kind,{x:-300,y:0});
    g.environment=new Environment(g,{generation:false});
    if(wet)g.environment.muds.push({id:'movement-pool',type:'mud',x:0,y:0,rx:2000,ry:2000,seed:.5});
    const start=foot(member);advance(g,member,.4,{x:1});
    samples.push(distance(start,foot(member)));
  }
  assert(Math.abs(samples[1]/samples[0]-(kind==='owl'?1:.74))<1e-9,`${kind}: actual movement respects ground/flying slowing without double application`);
}

// Faster approach and cooldown retreat must retain existing cast/stop ranges.
const approach=arena(),guard=approach.companions.recruit('warden',{x:-260,y:0}),foe=approach._spawnEnemy('slime',1);
Object.assign(foe,{x:240,y:-groundOffset(foe),hp:100000,maxHp:100000,speed:0,guardActive:true});
approach._rebuildGrid();approach.companions.alert(foe);guard._attack=0;
advance(approach,guard,2);
assert(foe.hp<foe.maxHp,'a previously out-of-range ally reaches and attacks its actual target');
assert(distance(foot(guard),foot(foe))<165,'faster approach retains the existing melee reach');

const retreat=arena({obstacles:[{type:'log',variant:'castle-wall',x:-50,y:0,r:10,halfLength:100,angle:Math.PI/2}]}),mage=retreat.companions.recruit('stormcaller',{x:0,y:0}),near=retreat._spawnEnemy('slime',1);
Object.assign(near,{x:55,y:-groundOffset(near),hp:100000,maxHp:100000,speed:0,guardActive:true});
retreat._rebuildGrid();mage._attack=2;
const initialGap=distance(foot(mage),foot(near));advance(retreat,mage,.35);
assert(distance(foot(mage),foot(near))>initialGap+5,'caster still opens space while its attack is cooling down');
assert(mage.x>=-25,'faster retreat cannot cross the wall behind the caster');
assert(mage._attack>1.6&&mage._attack<1.7,'retreat never resets or skips the attack cooldown');
advance(retreat,mage,1);
assert(distance(foot(mage),foot(near))<175,'retreat remains bounded instead of fleeing indefinitely');

console.log(JSON.stringify({companionMovement:'passed',tracking:results,coverage:'320 baseline and upgraded fast hero; all five companions; continuous walking without teleport; turns and stopping; ground/flying slowdown; approach-and-attack; wall-safe cooldown retreat'}));
