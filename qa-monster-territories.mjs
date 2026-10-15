import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { TERRITORY_RULES } from './dist/monster-territories.js';
import { validateTerritories } from './dist/config-validation/territories.js';
import { getConfigSnapshot } from './dist/content-config.js';

const options={mode:'world',encounters:false,companions:false,environment:false,settlements:false,elites:false};
const feet=e=>({x:e.x,y:e.y+groundOffset(e)});
const place=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const step=(g,seconds,{move=true}={})=>{for(let left=seconds;left>0;left-=.05){g._clock+=.05;g.territories.update(.05);if(move)for(const enemy of g.enemies)if(enemy.hp>0)g.territories.updateEnemy(enemy,.05);}};
const g=new Game(options),territories=g.territories;
assert.equal(g.mode,'world');assert.equal(g.difficulty,'normal');assert(territories.groups.length>=10,'world receives a meaningful finite population');
assert(territories.groups.length<=TERRITORY_RULES.maxGroups);
assert(g.enemies.filter(e=>e.territoryId).every(e=>e.guardActive===false&&e.territoryState==='idle'));
assert(g.enemies.every(e=>e.territoryId||e.portalId),'world startup has no unowned ambient chasers');
const signatures=game=>game.territories.groups.map(group=>({id:group.id,x:group.x,y:group.y,members:group.members.map(e=>({type:e.type,x:e.x,y:e.y,hp:e.hp}))}));
const fresh=new Game(options);assert.deepEqual(signatures(fresh),signatures(g),'same world has fixed group locations, composition and strength');
const first=territories.groups[0],enemy=first.members[0],other=territories.groups.find(group=>Math.hypot(group.x-first.x,group.y-first.y)>1200);
assert(other);const home={...enemy.territoryHome},start=feet(enemy);
step(g,2);assert.equal(enemy.territoryState,'idle');
assert(Math.hypot(enemy.x-home.x,feet(enemy).y-home.y)<=TERRITORY_RULES.patrolRadius+5,'idle stays near home');
assert(Math.hypot(enemy.x-start.x,feet(enemy).y-start.y)>0,'nearby idle groups patrol');
place(g,first);territories.update(.05);
assert.equal(first.members.filter(e=>e.territoryState==='chasing').length,1,'one nearby discoverer starts the alarm');
assert(first.members.some(e=>e.territoryState==='alert'),'same group responds after a delay');
assert(other.members.every(e=>e.territoryState==='idle'),'unrelated groups do not inherit an alarm');
step(g,3,{move:false});assert(first.members.every(e=>e.territoryState==='chasing'));
assert.equal(g.events.filter(e=>e.type==='territoryAlert'&&e.territoryId===first.id).length,1,'no repeated group greeting on each frame');

// Actual damage resolution alerts an untouched group even outside its boundary.
const second=other,victim=second.members[0];place(g,{x:second.x+second.radius+30,y:second.y});
const beforeHp=victim.hp;g._hurtEnemy(victim,1,0,g.player,'raw');
assert.equal(victim.hp,beforeHp-1);assert.equal(victim.territoryState,'chasing');assert.equal(victim.guardActive,true);
assert(second.members.some(e=>e.territoryState==='alert'));
// A pure target query must not awaken another idle member/group.
const untouched=territories.groups.find(group=>group!==first&&group!==second);g.combat.canTarget(untouched.members[0]);assert(untouched.members.every(e=>e.territoryState==='idle'));

// Pursuit drops after a short sustained retreat, preserving health and position.
victim.x=victim.territoryHome.x+130;victim.y=victim.territoryHome.y-groundOffset(victim);
place(g,{x:second.x+TERRITORY_RULES.leash+300,y:second.y});step(g,TERRITORY_RULES.provokedDuration+TERRITORY_RULES.disengageDelay+.2,{move:false});
assert.equal(victim.territoryState,'returning');assert.equal(victim.guardActive,false);assert.equal(victim.hp,beforeHp-1);
const returnStart=feet(victim);territories.updateEnemy(victim,.05);const afterReturn=feet(victim);
assert(Math.hypot(afterReturn.x-returnStart.x,afterReturn.y-returnStart.y)<=victim.speed*.1,'return is walking, never teleportation');
assert.equal(victim.hp,beforeHp-1,'return does not heal');
// Re-entry only activates after the return, unless the player attacks again.
g._hurtEnemy(victim,1,0,g.player,'raw');assert.equal(victim.territoryState,'chasing','a hit during retreat still has a response');

// Death, distance culling, and region snapshots never manufacture a respawn.
for(const member of first.members)member.hp=0;territories.update(.05);assert(first.cleared);
const killedIds=new Set(first.memberIds),remaining=g.enemies.filter(e=>e.territoryId&&e.hp>0).map(e=>e.id);
place(g,{x:0,y:0});g.time=3600;g.phaseEndsAt=0;g._spawn=0;g._shot=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;g.adventure._nextTreasureAt=Infinity;
g.update(.05);
assert.equal(g.waveDirector.count,0);assert.equal(g.pressurePhase,'steady');assert.equal(g.regions.endlessUnlocked,false);
assert.deepEqual(g.enemies.filter(e=>e.territoryId).map(e=>e.id),remaining,'camera distance retains finite living groups');
assert(!g.enemies.some(e=>killedIds.has(e.id)));
const saved=signatures(g),origin=g.regionIndex,out=g.regions.portals[0];assert(out);
g._switchRegion(out);assert.notEqual(g.regionIndex,origin);assert.notEqual(g.territories,territories);
const back=g.regions.portals.find(p=>p.nextRegionIndex===origin);assert(back);g._switchRegion(back);
assert.equal(g.territories,territories);assert(first.cleared);assert(!g.enemies.some(e=>killedIds.has(e.id)));assert.deepEqual(signatures(g),saved,'revisiting preserves populations and damage');
assert.equal(new Game(options).territories.groups[0].cleared,false,'a new exploration resets defeated groups');
// Existing elite content moves into fixed groups. Their summons inherit the
// same territory instead of becoming ambient global pursuers.
const eliteWorld=new Game({...options,elites:true});assert(eliteWorld.enemies.some(e=>e.territoryId&&e.affix),'outer territories retain elite monsters');
const summoning=new Game(options),owner=summoning.territories.groups.flatMap(group=>group.members).find(e=>summoning.elites._eligible(e));
assert(summoning.elites.promote(owner,'summoner'));place(summoning,{x:owner.x+140,y:feet(owner).y});summoning.territories.awaken(owner);
owner.affix.phase='windup';owner.affix.life=0;summoning.elites.resolve();
const summons=summoning.enemies.filter(e=>e.summonerId===owner.id);assert(summons.length>0,'test uses actual elite summon resolution');
summoning.territories.update(.05);assert(summons.every(e=>e.territoryId===owner.territoryId&&e.territoryState==='chasing'&&e.xp===0));
place(summoning,{x:owner.territoryHome.x+1800,y:owner.territoryHome.y});step(summoning,4,{move:false});
assert(summons.every(e=>e.territoryState==='returning'),'summoned creatures obey the group leash');
const early=new Game(options),late=new Game(options);late.time=9000;late.regions.unlockedConnections=new Set(['0:1','0:2','1:2']);
assert.equal(late._difficultyTime(),early._difficultyTime(),'world strength depends on region, not elapsed time or cleared gates');
assert.equal(new Game({...options,difficulty:'casual'}).easy,false,'explicit formal mode cannot retain an old hidden difficulty multiplier');
const isolated=new Game({adventure:false,difficulty:'casual'});assert.equal(isolated.easy,true);assert.equal(isolated.territories.groups.length,0,'isolated fixtures keep the existing controllable mechanics');

const survival=new Game({mode:'dungeon',dungeonId:'survival'});assert.equal(survival.territories.groups.length,0);assert(survival.expedition.allowAmbient);
survival.time=survival.phaseEndsAt;survival._updatePressure(.05);assert.equal(survival.pressurePhase,'warning','directed monster waves live in survival');
survival.time=survival.phaseEndsAt;survival._updatePressure(.05);survival.time+=.05;survival._updatePressure(.05);assert(survival.waveDirector.spawned>0,'survival actually spawns its promised wave');
for(const id of ['ship','moon']){const run=new Game({mode:'dungeon',dungeonId:id});run.time=600;run._spawn=0;run._updatePressure(.05);assert.equal(run.waveDirector.count,0);assert.equal(run.territories.groups.length,0);}
const clone=structuredClone(getConfigSnapshot().sections);clone.difficulty.territories.leash=10;assert.throws(()=>validateTerritories(clone),/boundaries/);

// The alert boundary and the two pursuit limits are world distances. Moving
// the camera must not awaken a group or extend its pursuit budget.
const boundary=new Game(options),boundaryGroup=boundary.territories.groups[0],sentry=boundaryGroup.members[0];
boundary.territories.groups=[boundaryGroup];boundaryGroup.members=[sentry];boundary.regionGrace=0;
const resetSentry=(x=boundaryGroup.x)=>{
  Object.assign(sentry,{x,y:boundaryGroup.y-groundOffset(sentry),territoryState:'idle',guardActive:false,_territoryAway:0,_territoryProvokedUntil:0});
  boundaryGroup.announced=false;
};
for(const viewWidth of [480,540,600]){
  boundary.viewWidth=viewWidth;resetSentry();
  place(boundary,{x:boundaryGroup.x+boundaryGroup.radius+1,y:boundaryGroup.y});boundary.territories.update(0);
  assert.equal(sentry.territoryState,'idle','Crossing the camera cannot extend the territory.');
  place(boundary,{x:boundaryGroup.x+boundaryGroup.radius,y:boundaryGroup.y});boundary.territories.update(0);
  assert.equal(sentry.territoryState,'chasing','Entering the boundary alerts a nearby sentry.');
  resetSentry(boundaryGroup.x+TERRITORY_RULES.notice+1);place(boundary,boundaryGroup);boundary.territories.update(0);
  assert.equal(sentry.territoryState,'idle','A distant member does not discover the player solely from group membership.');
  sentry.x=boundaryGroup.x+TERRITORY_RULES.notice;boundary.territories.update(0);
  assert.equal(sentry.territoryState,'chasing','The local notice limit includes its boundary.');
  for(const limit of ['leash','enemyLeash']){
    resetSentry();sentry.territoryState='chasing';sentry.guardActive=true;place(boundary,boundaryGroup);
    if(limit==='leash')place(boundary,{x:boundaryGroup.x+TERRITORY_RULES.leash,y:boundaryGroup.y});
    else sentry.x=boundaryGroup.x+TERRITORY_RULES.enemyLeash;
    boundary.territories.update(TERRITORY_RULES.disengageDelay);
    assert.equal(sentry.territoryState,'chasing',`${limit} permits pursuit at its boundary.`);
    if(limit==='leash')boundary.player.x+=1;else sentry.x+=1;
    boundary.territories.update(TERRITORY_RULES.disengageDelay/2);
    assert.equal(sentry.territoryState,'chasing','Retreat still requires the full delay.');
    boundary.territories.update(TERRITORY_RULES.disengageDelay/2);
    assert.equal(sentry.territoryState,'returning',`${limit} ends pursuit after a sustained crossing.`);
  }
}
console.log('Monster territories: deterministic finite populations, patrol and staggered local response, provoked combat, bounded retreat without healing, persistent region clear state, fixed world strength, normal formal modes, and dungeon-only waves passed.');
