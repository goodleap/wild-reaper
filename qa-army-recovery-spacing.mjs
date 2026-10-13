import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {COMPANION_DEFINITIONS,COMPANION_RULES,COMPANION_FOLLOW_RULES} from './dist/companion-catalog.js';
import {armyPanelHTML} from './dist/army-panel.js';
const arena=()=>{const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});g.enemies=[];g.effects=[];g.events=[];g.gold=1000;g._spawn=Infinity;g.nextBossAt=Infinity;g._shot=Infinity;g._updatePressure=()=>{};g.crystalsNext=Infinity;g.player.xpNext=Infinity;g.build.setEquipped('sword',false);return g;};
const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,true)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const tick=(g,seconds)=>{for(let t=0;t<seconds-1e-8;t+=.025){g.time+=.025;g.runTime+=.025;g.companions.update(.025);}};

for(const def of COMPANION_DEFINITIONS){
  const g=arena(),member=g.companions.recruit(def.kind);g.gold=def.recoveryCost-1;
  assert(g.companions.takeDamage(member,100000));assert.equal(g.companions.upkeep,0);
  const waitingGold=g.gold;tick(g,COMPANION_RULES.recoveryDuration+45);
  assert.equal(member.state,'recovering');assert.equal(member.hp,0);assert.equal(g.gold,waitingGold,'a recovering member pays no upkeep and cannot partially spend treatment funds');
  assert(g.companions.members.includes(member),'lack of treatment money never dismisses an injured member');
  assert.equal(g.events.filter(e=>e.type==='companionRecoveryBlocked').length,1,'treatment warning is emitted once per injury');
  assert.match(armyPanelHTML(g),new RegExp(`待救治 · 需 ${def.recoveryCost} 金币`));
  g.gold++;g.status='paused';g.companions.update(.05);assert.equal(g.gold,def.recoveryCost);assert.equal(member.state,'recovering');
  g.status='playing';g.companions.update(0);assert.equal(member.state,'active');assert.equal(g.gold,0);assert.equal(member.hp,member.maxHp*.65);
  g.companions.update(.025);assert.equal(g.gold,0);assert.equal(g.events.filter(e=>e.type==='companionRecovered').length,1,'one injury is paid exactly once');
  assert.equal(g.events.find(e=>e.type==='companionRecovered').cost,def.recoveryCost);
}

const grace=arena(),injured=grace.companions.recruit('stormcaller'),dog=grace.companions.recruit('dog');
grace.companions.takeDamage(injured,100000);injured.recovery=0;grace.gold=0;grace.time=grace.runTime=30;grace.companions.update(0);
assert.equal(grace.companions.unpaidCost,1);assert.equal(grace.companions.graceUntil,50);
grace.gold=61;grace.time=grace.runTime=50;grace.companions.update(0);assert.equal(grace.gold,0);assert.equal(injured.state,'active');assert(grace.companions.members.includes(dog));assert.equal(grace.companions.graceUntil,0);assert.equal(grace.companions.nextPayrollAt,80);
grace.companions.update(.025);assert.equal(grace.companions.members.length,2,'an old wage deadline cannot dismiss a just-recovered companion');

const formation=arena();formation.player.facing=0;
for(const def of COMPANION_DEFINITIONS)formation.companions.recruit(def.kind);
tick(formation,4);
for(const member of formation.companions.members){const f=foot(member);assert(formation.terrain.isFree(f.x,f.y,member.r,member.flying?'air':'ground'),`${member.kind} has a safe arrival point`);assert(distance(f,foot(formation.player))<=member.followDistance+25);}
const positions=formation.companions.members.map(foot);
for(let n=0;n<100;n++){formation.player.facing=n*.5;formation.companions.update(.025);}
for(let i=0;i<positions.length;i++)assert(distance(positions[i],foot(formation.companions.members[i]))<.01,'turning in place does not orbit the party');
for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert(distance(positions[i],positions[j])>=formation.companions.members[i].r+formation.companions.members[j].r+COMPANION_FOLLOW_RULES.contactGap-.01,'safe arrival avoids body contact without requiring a wide formation');
const owl=formation.companions.members.find(m=>m.kind==='owl'),warden=formation.companions.members.find(m=>m.kind==='warden');
assert.equal(formation.companions.protectionMultiplier(formation.player),.75,'ordinary warden spacing still protects its leader');
owl.x=warden.x;owl.y=foot(warden).y-owl.groundOffset;formation.companions._separate(.05);assert(distance(foot(owl),foot(warden))>0,'air and ground allies visually separate without sharing a collision profile');

const corridor=arena();corridor.player.facing=-Math.PI/2;
corridor.terrain=new Terrain({obstacles:[-45,45].map((x,i)=>({id:`corridor-${i}`,type:'log',structureType:'wall',x,y:20,r:8,halfLength:400,angle:Math.PI/2}))});
for(const def of COMPANION_DEFINITIONS)corridor.companions.recruit(def.kind);
corridor.companions.onSceneChange();
for(const member of corridor.companions.members){const f=foot(member);assert(corridor.terrain.isFree(f.x,f.y,member.r,member.flying?'air':'ground'));assert(!corridor.terrain.firstBlocker(foot(corridor.player).x,foot(corridor.player).y,f.x,f.y,0,member.flying?'air':'ground'),'constrained arrivals never cross sealed corridor walls');}
console.log('Army recovery and spacing: per-role payment, insufficient funds, paused recovery, upkeep exemption/grace, stationary arrivals, body-contact separation and constrained scene placement passed.');
