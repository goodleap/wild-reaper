import assert from 'node:assert/strict';
import { AdventureArchive, ARCHIVE_STORAGE_KEY } from './dist/adventure-archive.js';
import { CombatBuild } from './dist/combat-build.js';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

function memory(initial={}){const data=new Map(Object.entries(initial));return {data,writes:0,getItem:key=>data.get(key)??null,setItem(key,value){this.writes++;data.set(key,value);}};}
function run(extra={}){return {difficulty:'normal',debug:false,debugFull:false,runTime:0,kills:0,bossKills:0,wave:1,player:{level:1},build:new CombatBuild(),...extra};}
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);

const storage=memory(),archive=new AdventureArchive({storage}),g=run();
assert(archive.begin(g));assert(archive.begin(g));
assert.equal(archive.data.totals.runs,1,'begin is idempotent for one game');
assert.equal(storage.writes,1,'departure and initial equipment saved immediately');
assert.equal(archive.data.entries['weapon:sword'].acquisitions,1);
assert.equal(archive.data.entries['skill:storm'].acquisitions,1);
assert(!archive.data.entries['weapon:arrow'],'unowned equipment stays unknown');
const slime={type:'slime',hp:10},dummy={type:'trainingDummy',trainingDummy:true,hp:999};
archive.observe(g,{visibleEnemies:[slime,dummy]});
assert(archive.data.entries['enemy:slime'].seen);
assert.equal(archive.data.entries['enemy:slime'].defeats,0);
assert(!Object.keys(archive.data.entries).some(id=>id.includes('Dummy')));
assert.equal(storage.writes,1);
g.runTime=4.9;g.kills=3;g.player.level=2;archive.checkpoint(g);
assert.equal(storage.writes,1,'no storage writes before five gameplay seconds');
g.runTime=5;archive.checkpoint(g);assert.equal(storage.writes,2);
archive.checkpoint(g);assert.equal(storage.writes,2);
near(archive.data.totals.time,5);assert.equal(archive.data.totals.kills,3);
assert(archive.recordDefeat(g,slime));assert(!archive.recordDefeat(g,slime));
assert.equal(archive.data.entries['enemy:slime'].defeats,1,'repeated defeat callback cannot duplicate a kill');
const regional={type:'boss',bossKind:'ancient',hp:0},castle={type:'boss',dungeonBoss:true,hp:0};
archive.recordDefeat(g,regional);archive.recordDefeat(g,castle);
g.kills=5;g.bossKills=1;g.runTime=5.7;
g.build.weapons.sword.baseRank=5;g.build.weapons.sword.branch='sweep';g.build.weapons.sword.evolved=true;g.build.weapons.sword.modifiers.swordEnergy=2;
g.build.weapons.arrow.baseRank=1;g.build.weapons.arrow.equipped=false;g.build.weapons.arrow.branch='pierce';g.build.weapons.arrow.modifiers.arrowRune=1;
g.build.skills.barrier.baseRank=3;
archive.checkpoint(g,{force:true});
assert.equal(archive.data.entries['weapon:arrow'].acquisitions,1,'unequipped owned weapon is still learned');
assert.equal(archive.data.entries['weaponSkill:swordEnergy'].maxLevel,2);
assert.equal(archive.data.entries['weaponSkill:arrowRune'].maxLevel,1);
assert.deepEqual(archive.data.entries['weapon:sword'].branches,['sweep']);
assert(archive.data.entries['weapon:sword'].evolved);
assert.equal(archive.data.entries['weapon:sword'].modifiers.swordEnergy,2);
assert.equal(archive.data.entries['skill:barrier'].maxLevel,3);
const ended=archive.finish(g);
assert.equal(ended.run.bossKills,2,'Boss totals include both regional and castle Bosses');
assert.equal(archive.data.totals.bossKills,2);
assert.equal(archive.data.entries['boss:ancient'].defeats,1);
assert.equal(archive.data.entries['boss:castle'].defeats,1);
assert(ended.records.some(item=>item.key==='time'&&item.previous===0&&item.value===5.7));
const frozen=JSON.stringify(archive.data),writes=storage.writes;
archive.finish(g);archive.checkpoint(g,{force:true});archive.observe(g,{visibleEnemies:[{type:'bat',hp:1}]});archive.recordDefeat(g,{type:'bat',hp:0});
assert.equal(JSON.stringify(archive.data),frozen);assert.equal(storage.writes,writes);
assert.deepEqual(archive.summary(g),ended,'summary survives repeated settlement and later reads');

const second=run({difficulty:'casual'});archive.begin(second);second.runTime=2.25;second.kills=2;second.player.level=4;
archive.finish(second,'exit');
assert.equal(archive.data.totals.runs,2);near(archive.data.totals.time,7.95);assert.equal(archive.data.totals.kills,7);
assert.equal(archive.data.best.normal.time,5.7);assert.equal(archive.data.best.casual.time,2.25);
assert.equal(archive.data.best.normal.level,2);assert.equal(archive.data.best.casual.level,4);assert.equal(archive.data.totals.maxLevel,4);
assert.equal(archive.data.entries['weapon:sword'].acquisitions,2,'default loadout counts once per departure');
const restored=new AdventureArchive({storage});assert.deepEqual(restored.data,archive.data,'short sessions survive an immediate browser reload');
const third=run();restored.begin(third);third.runTime=1;restored.finish(third);
assert(!restored.summary(third).records.some(item=>item.key==='time'),'best comparison uses the previous difficulty baseline');
near(restored.data.totals.time,8.95);
const unstarted=run({runTime:99,kills:999});const beforeUnstarted=JSON.stringify(restored.data);
restored.observe(unstarted);restored.checkpoint(unstarted);restored.finish(unstarted);assert.equal(JSON.stringify(restored.data),beforeUnstarted,'observation must never start a run implicitly');

const debugStorage=memory(),debugArchive=new AdventureArchive({storage:debugStorage});
for(const extra of [{debug:true},{debug:true,debugFull:true},{debugFull:true}]){
  const debug=run(extra);assert(!debugArchive.begin(debug));debug.runTime=500;debug.kills=900;debug.player.level=99;
  debugArchive.observe(debug,{visibleEnemies:[{type:'boss',hp:99}]});debugArchive.recordDefeat(debug,{type:'boss',hp:0});debugArchive.checkpoint(debug,{force:true});
  assert(debugArchive.finish(debug).excluded);
}
assert.equal(debugArchive.data.totals.runs,0);assert.deepEqual(debugArchive.data.entries,{});assert.equal(debugStorage.writes,0,'debug never persists formal progress');

const legacy=memory({'wild-echoes-endless-record':JSON.stringify({time:222,kills:777,bossKills:2})});
const migrated=new AdventureArchive({storage:legacy});
assert.deepEqual(migrated.data.legacy,{time:222,kills:777,bossKills:2});assert.equal(migrated.data.totals.kills,0);assert.equal(migrated.data.best.normal.time,0);assert.equal(migrated.data.best.casual.time,0);
migrated.begin(run());assert.equal(legacy.data.get('wild-echoes-endless-record'),JSON.stringify({time:222,kills:777,bossKills:2}),'legacy record is preserved and never reassigned to a formal difficulty');
const corrupt=new AdventureArchive({storage:memory({[ARCHIVE_STORAGE_KEY]:'{bad json'})});assert(corrupt.begin(run()));assert.equal(corrupt.data.totals.runs,1);
const dirty=memory({[ARCHIVE_STORAGE_KEY]:JSON.stringify({version:1,totals:{runs:-1,time:'999',kills:4},best:{normal:{time:-9,level:'99'},casual:{}},entries:{'enemy:slime':{seen:true,defeats:-10,branches:['safe','<script>'],maxLevel:1e50,modifiers:{swordEnergy:99,unknown:100}},unknown:{seen:true}},legacy:{kills:'10'}})});
const cleaned=new AdventureArchive({storage:dirty});
assert.equal(cleaned.data.totals.runs,0);assert.equal(cleaned.data.totals.time,0);assert.equal(cleaned.data.totals.kills,4);
assert.equal(cleaned.data.entries['enemy:slime'].defeats,0);assert.equal(cleaned.data.entries['enemy:slime'].maxLevel,1e6);assert.deepEqual(cleaned.data.entries['enemy:slime'].branches,['safe']);
assert.deepEqual(cleaned.data.entries['enemy:slime'].modifiers,{swordEnergy:3});assert(!cleaned.data.entries.unknown);assert.equal(cleaned.data.legacy,null);
const futureStorage=memory({[ARCHIVE_STORAGE_KEY]:JSON.stringify({version:2,important:'keep'})}),future=new AdventureArchive({storage:futureStorage});future.begin(run());future.flush();assert.equal(futureStorage.writes,0,'unknown future format is never overwritten');
const blocked=new AdventureArchive({storage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}}}),offline=run();blocked.begin(offline);offline.runTime=2;blocked.finish(offline);assert(!blocked.storageOk);assert.equal(blocked.data.totals.time,2,'unavailable storage still permits session play and stats');
const absent=new AdventureArchive({storage:null});assert.doesNotThrow(()=>absent.begin(run()));assert(!absent.storageOk);

const battle=new Game({terrain:new Terrain({obstacles:[]}),adventure:false}),combatArchive=new AdventureArchive({storage:memory()});
combatArchive.begin(battle);battle.onEnemyDefeated=enemy=>combatArchive.recordDefeat(battle,enemy);
battle.enemies=[];battle.events=Array.from({length:100},()=>({type:'fill'}));
const foe=battle._spawnEnemy('slime',1,0);foe.hp=1;foe.xp=0;
assert(battle._hurtEnemy(foe,100));assert.equal(battle._hurtEnemy(foe,100),0);
const castleBoss=battle._spawnEnemy('boss',1,0);castleBoss.hp=1;castleBoss.xp=0;castleBoss.dungeonBoss=true;
assert(battle._hurtEnemy(castleBoss,100));combatArchive.finish(battle);
assert.equal(battle.events.length,100);assert(!battle.events.some(event=>event.type==='kill'),'test exercises a saturated UI-event buffer');
assert.equal(combatArchive.data.entries['enemy:slime'].defeats,1);assert.equal(combatArchive.data.entries['boss:castle'].defeats,1);
assert.equal(combatArchive.data.totals.kills,2);assert.equal(combatArchive.data.totals.bossKills,1,'direct defeat hook records castle Boss despite dropped UI events');

console.log('Adventure archive QA passed: bounded persistence, codex progress, all Bosses, difficulty records, legacy separation and debug isolation.');
