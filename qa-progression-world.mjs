import assert from 'node:assert/strict';
import { Game, xpCost, crystalCost } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

// Resource identity is checked through real kill and pickup paths. Test fixtures
// suppress only unrelated random spawns and scenery, never resource mutations.
let seed=913721;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(){const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false});g.build.setEquipped('sword',false);g.enemies=[];g.gems=[];g.coins=[];g.effects=[];g.events=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g._updatePressure=()=>{};return g;}
function monster(g,{type='slime',x=250,y=0,hp=1}={}){const e=g._spawnEnemy(type);Object.assign(e,{x,y,hp,maxHp:hp,speed:0});return e;}
const sum=list=>list.reduce((n,p)=>n+p.value,0);
const kill=arena(),victim=monster(kill),value=victim.xp;
kill._hurtEnemy(victim,2);
assert.equal(kill.player.xp,value,'kill XP is awarded before any collection');assert.equal(kill.gems.length,1);assert.equal(sum(kill.gems),value);
assert.equal(kill.crystals,0,'distant loot is not automatically collected');assert.equal(kill.status,'playing');
kill._hurtEnemy(victim,10);assert.equal(kill.player.xp,value);assert.equal(sum(kill.gems),value,'repeated lethal calls cannot duplicate either progression resource');
kill.player.x=250;kill.update(0);
assert.equal(kill.crystals,value);assert.equal(kill.player.xp,value,'crystal pickup does not award kill XP again');assert.equal(kill.gems.length,0);

const leveling=arena(),xpBudget=xpCost(1)+xpCost(2)+7;
leveling.player.hp=63;const initialDamage=leveling.stats.damage,initialSpeed=leveling.player.speed;
assert(leveling.addExperience(xpBudget));
assert.equal(leveling.player.level,3);assert.equal(leveling.player.xp,7);assert.equal(leveling.player.maxHp,104);assert.equal(leveling.player.hp,67,'automatic levels heal only their gained max HP');
assert(Math.abs(leveling.stats.damage-initialDamage-.02)<1e-10,'character growth adds a restrained one percent base damage per level');
assert.equal(leveling.player.speed,initialSpeed);assert.equal(leveling.status,'playing');assert.equal(leveling.skillLevel,1);assert.equal(leveling.crystals,0);
assert.equal(leveling.events.filter(e=>e.type==='skillUpgrade').length,0,'automatic levels never open a skill selection');
const resourcesBefore={xp:leveling.player.xp,crystals:leveling.crystals,gold:leveling.gold};
for(const invalid of [NaN,Infinity,-1,0]){assert.equal(leveling.addExperience(invalid),false);assert.equal(leveling.addCrystals(invalid),false);assert.equal(leveling.addGold(invalid),false);}
assert.deepEqual({xp:leveling.player.xp,crystals:leveling.crystals,gold:leveling.gold},resourcesBefore);

const batch=arena();batch.crystals=batch.crystalsNext-1;
for(let i=0;i<5;i++)monster(batch,{x:80+i*50});
let observedKills=0;const realAdd=batch.addCrystals.bind(batch);
batch.addCrystals=(n)=>{assert.equal(batch.status,'playing','collecting resource does not interrupt an ongoing target loop');observedKills=batch.kills;return realAdd(n);};
batch.gems.push({x:0,y:0,r:5,value:1});batch.update(0,{skill:true});
assert.equal(batch.kills,5,'all targets in the same active attack resolve before choices');assert.equal(observedKills,5);assert.equal(batch.status,'upgrade');
const pendingCost=batch.crystalsNext,pending=structuredClone(batch.getUpgradeChoices()),bank=batch.crystals;
assert.equal(batch.chooseUpgrade('missing-skill'),false);assert.equal(batch.crystals,bank);assert.deepEqual(batch.getUpgradeChoices(),pending);
const heroLevel=batch.player.level,heroXp=batch.player.xp;assert(batch.chooseUpgrade(pending[0].id));
assert.equal(batch.crystals,bank-pendingCost);assert.equal(batch.skillLevel,2);assert.equal(batch.player.level,heroLevel);assert.equal(batch.player.xp,heroXp);
assert.equal(batch.chooseUpgrade(pending[0].id),false,'double click cannot spend again');
const unfunded=arena();unfunded.status='upgrade';const offered=unfunded.getUpgradeChoices()[0];assert.equal(unfunded.chooseUpgrade(offered.id),false,'an injected unfunded panel cannot grant a free skill');

const coins=arena();coins.player.xpNext=Infinity;coins.crystalsNext=Infinity;
const random=Math.random;
try{Math.random=()=>.079;coins._hurtEnemy(monster(coins),2);}finally{Math.random=random;}
assert.equal(sum(coins.coins),1,'a low normal drop roll yields one coin');
try{Math.random=()=>.081;coins._hurtEnemy(monster(coins),2);}finally{Math.random=random;}
assert.equal(sum(coins.coins),1,'a normal drop roll above eight percent yields no coin');
const elite=monster(coins);coins.elites.promote(elite,'swift');elite.hp=1;coins._hurtEnemy(elite,2);assert.equal(sum(coins.coins),4,'an affixed elite guarantees three coins');
const summon=monster(coins);summon.summoned=true;summon.xp=99;const beforeSummon={xp:coins.player.xp,crystals:sum(coins.gems),gold:sum(coins.coins)};coins._hurtEnemy(summon,2);
assert.deepEqual({xp:coins.player.xp,crystals:sum(coins.gems),gold:sum(coins.coins)},beforeSummon,'summoned enemies cannot farm any of the three resources');
coins.player.x=250;coins.update(0);assert.equal(coins.gold,4);assert.equal(sum(coins.coins),0);assert.equal(coins.player.xp,beforeSummon.xp);

const bounded=arena();let crystalBudget=0,goldBudget=0;
for(let i=0;i<750;i++){const value=i%7+1;bounded.dropCrystals(1000+i%20,1000+i,value);crystalBudget+=value;bounded.dropGold(1100+i%20,1000+i,1);goldBudget++;}
assert(bounded.gems.length<=500&&bounded.coins.length<=120,'ground drops remain bounded during prolonged exploration');
assert.equal(sum(bounded.gems),crystalBudget);assert.equal(sum(bounded.coins),goldBudget,'compaction conserves loot instead of discarding rewards');
for(const state of ['paused','upgrade','shop','super','relic','dead']){bounded.status=state;const frozen={runTime:bounded.runTime,time:bounded.time,clock:bounded._clock,gems:structuredClone(bounded.gems),coins:structuredClone(bounded.coins)};bounded.update(.05,{x:1,skill:true});assert.deepEqual({runTime:bounded.runTime,time:bounded.time,clock:bounded._clock,gems:bounded.gems,coins:bounded.coins},frozen,`${state} freezes the entire resource world`);}

const regional=arena();regional.player.xpNext=Infinity;regional.crystalsNext=Infinity;const boss=monster(regional,{type:'boss'});regional._hurtEnemy(boss,2);
assert.equal(regional.gold,30);assert.equal(regional.crystals,45);assert.equal(regional.player.xp,boss.xp);assert.equal(regional.gems.length,0,'regional Boss resources use the direct reward path once');
const pendingBoss=structuredClone(regional.getSuperChoices());regional._hurtEnemy(boss,2);assert.equal(regional.gold,30);assert.equal(regional.crystals,45);assert.deepEqual(regional.getSuperChoices(),pendingBoss);
assert.equal(crystalCost(1),40,'the first skill still arrives from a short opening collection');
console.log('Split progression: immediate kill XP, automatic modest stats, separate crystal choices, independent gold, finite loot, safe modal timing and Boss reward idempotency passed.');
