import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { PARTY_COMBAT_RULES } from './dist/companions.js';
import { provokeEnemyGroup, enemyGroupProvoked } from './dist/combat-tactics.js';

const arena=()=>{
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.gold=1000;g.viewWidth=g.viewHeight=1400;
  g.player.x=0;g.player.y=-groundOffset(g.player,true);return g;
};
const addEnemy=(g,x=100,y=0)=>{
  const enemy={id:++g._id,type:'slime',x,y:y-groundOffset({type:'slime',r:16}),r:16,hp:100000,maxHp:100000,guardActive:true};
  g.enemies.push(enemy);return enemy;
};
const trackRoster=g=>{
  const count={reads:0};
  g.enemies=new Proxy(g.enemies,{get(array,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))count.reads++;return Reflect.get(array,key,receiver);}});
  return count;
};

// Damage without a party must not build or scan a party threat history.
const solo=arena(),soloFoe=addEnemy(solo),soloReads=trackRoster(solo);
for(let hit=0;hit<100;hit++)solo.companions.alert(soloFoe);
assert.equal(soloReads.reads,0);assert.equal(solo.companions._combatThreats.size,0);

const battle=arena(),ally=battle.companions.recruit('warden',{x:0,y:0});
const foes=Array.from({length:300},(_,i)=>addEnemy(battle,i<100?100+i:900+i));
const hitReads=trackRoster(battle);
for(const foe of foes.slice(0,100))battle.companions.alert(foe);
const hundredAlerts=hitReads.reads;
assert(hundredAlerts<=5050,'100 distinct hits only locate their own source, never rescan all prior threats');
assert.equal(battle.companions._combatThreats.size,100);
assert(ally._combatAlertUntil>battle._clock);assert.equal(ally._combatRetargetAt,0);
battle.companions._combatPlan(ally);const nextSelection=ally._combatRetargetAt;
battle._clock+=.05;battle.companions.alert(foes[0]);
assert.equal(ally._combatRetargetAt,nextSelection,'a repeated hit refreshes the alarm without defeating selection throttling');
assert.equal(ally._combatAlertUntil,battle._clock+PARTY_COMBAT_RULES.alertDuration);
assert.equal(battle.companions._combatThreats.get(foes[0].id),ally._combatAlertUntil);
const newFoe=addEnemy(battle,90);battle.companions.alert({ownerId:newFoe.id});
assert.equal(ally._combatRetargetAt,0,'a newly encountered projectile owner prompts immediate selection');
battle._clock+=7;battle.companions.alert(newFoe);
assert.equal(battle.companions._combatThreats.size,1,'expired IDs are pruned without a roster survival sweep');
battle.companions.onSceneChange();assert.equal(battle.companions._combatThreats.size,0);assert.equal(ally._combatTarget,null);

// An empty result is cached, but an actor that was selected and then removed,
// killed or moved out of range is reconsidered on the very next call.
const quiet=arena(),guard=quiet.companions.recruit('warden',{x:0,y:0});
for(let i=0;i<300;i++)addEnemy(quiet,1500+i);
const idleReads=trackRoster(quiet);
assert.equal(quiet.companions._combatPlan(guard),null);const firstScan=idleReads.reads;
for(let frame=0;frame<10;frame++){quiet._clock+=.01;assert.equal(quiet.companions._combatPlan(guard),null);}
assert.equal(idleReads.reads,firstScan,'no-target frames perform no enemy lookup or roster rescan before the retry');
quiet._clock=guard._combatRetargetAt;quiet.companions._combatPlan(guard);assert.equal(idleReads.reads,firstScan*2);
const selected=addEnemy(quiet,65),replacement=addEnemy(quiet,95);
quiet.companions.alert(selected);quiet.companions._combatPlan(guard);assert.equal(guard._combatTarget,selected);
quiet.enemies.splice(quiet.enemies.indexOf(selected),1,{...selected,id:++quiet._id,x:1800});
assert.equal(guard._combatTarget,null,'same-array, same-length replacement cannot leave a stale live target');
quiet.companions._combatPlan(guard);assert.equal(guard._combatTarget,replacement);
replacement.hp=0;quiet.companions._combatPlan(guard);assert.equal(guard._combatTarget,null,'dead selected actors immediately invalidate');
replacement.hp=100;quiet.companions.alert(replacement);quiet.companions._combatPlan(guard);assert.equal(guard._combatTarget,replacement);
replacement.x=2000;quiet.companions._combatPlan(guard);assert.equal(guard._combatTarget,null,'leaving the leash invalidates before the next scheduled scan');

// Group refreshes must see live changes even within one tick; no permanent
// membership cache may lose reinforcements or wake a different dungeon room.
const grouped=arena(),a=addEnemy(grouped),b=addEnemy(grouped),other=addEnemy(grouped);
for(const enemy of [a,b,other])Object.assign(enemy,{dungeonId:'d',dungeonRoom:'one',guardActive:false});
other.dungeonRoom='two';provokeEnemyGroup(grouped,a);
assert(a.guardActive&&b.guardActive);assert.equal(other.guardActive,false);
const reinforced={...b,id:++grouped._id,guardActive:false,_groupProvokedUntil:0};
grouped.enemies.splice(grouped.enemies.indexOf(b),1,reinforced);provokeEnemyGroup(grouped,a);
assert(reinforced.guardActive,'same-tick reinforcement gets the first alarm immediately');
const grace=addEnemy(grouped);Object.assign(grace,{dungeonId:'d',dungeonRoom:'one',guardActive:false,rescueSpawnGrace:1});
provokeEnemyGroup(grouped,a);assert.equal(grace.guardActive,false);
grace.rescueSpawnGrace=0;provokeEnemyGroup(grouped,a);assert(grace.guardActive,'finishing spawn grace is observed immediately');
grouped._clock=2;provokeEnemyGroup(grouped,a);assert.equal(reinforced._groupProvokedUntil,5);
grouped._clock=5.01;assert.equal(enemyGroupProvoked(grouped,reinforced),false);

// The preliminary quake probe stops at its first usable target. Its actual
// area hit still validates every victim and cannot hit through a wall.
const quake=arena(),warden=quake.companions.recruit('warden',{x:0,y:0});
const victims=Array.from({length:20},(_,i)=>addEnemy(quake,40+i));quake._rebuildGrid();
const clear=quake.combat.clearPath.bind(quake.combat);let pathChecks=0;
quake.combat.clearPath=(...args)=>{pathChecks++;return clear(...args);};
assert(quake.companions._castQuake(warden));assert(victims.every(enemy=>enemy.hp<enemy.maxHp));
assert.equal(pathChecks,21,'twenty area victims need one acquisition path check plus twenty execution checks');
const blocked=arena(),blockedWarden=blocked.companions.recruit('warden',{x:0,y:0}),blockedFoe=addEnemy(blocked,70);
blocked.terrain=new Terrain({obstacles:[{type:'log',variant:'castle-wall',x:35,y:0,r:10,halfLength:100,angle:Math.PI/2}]});
blocked._rebuildGrid();assert.equal(blocked.companions._castQuake(blockedWarden),false);assert.equal(blockedFoe.hp,blockedFoe.maxHp);
console.log(JSON.stringify({partyWorkload:'passed',soloRosterReads:soloReads.reads,distinctAlerts:100,rosterSize:300,alertRosterReads:hundredAlerts,noTargetReadsAcrossElevenCalls:firstScan,quakeTargets:20,quakePathChecks:pathChecks,coverage:'alarm refresh/new threats, empty-target throttle, removal/death/leash invalidation, scene reset, same-tick reinforcements, spawn grace, room isolation and blocked quake'}));
