import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { updateEnemyBehavior } from './dist/enemy-behaviors.js';
import { getConfigSnapshot } from './dist/content-config.js';
import { validateStory } from './dist/config-validation/story.js';
import { Terrain } from './dist/terrain.js';

let seed=13408;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!e.heroId)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function chapter(width=540,height=1080){
  const game=new Game({mode:'story'});game.viewWidth=width;game.viewHeight=height;
  const story=game.story,director=story.pursuit;
  assert(director,'Every real story instance creates its own pursuit director.');
  return {game,story,director};
}
function simulate(game,director,seconds){
  // Exercise admission, shared enemy execution and real terrain movement while
  // omitting player weapons/damage; this isolates population lifecycle tests.
  for(let time=0;time<seconds;time+=.1){
    game._clock+=.1;director.story._clock+=.1;director.update(.1);
    for(const enemy of director.living())if(!director.beforeEnemy(enemy,.1)&&!updateEnemyBehavior(game,enemy,.1))game._moveEnemy(enemy,.1);
    game.enemies=game.enemies.filter(enemy=>enemy.hp>0);
    assert(director.living().length<=director.config.totalLimit);
    assert(director.living().filter(enemy=>enemy.storyLeader).length<=director.config.leaderLimit);
  }
}

for(const [width,height] of [[540,1080],[1100,650],[1440,900]]){
  const {game,story,director}=chapter(width,height);
  story.flow.go('search');
  // The shore can be entirely visible on a tall or wide viewport. Move along
  // the actual road before requiring admission, rather than rewarding a front
  // spawn simply to satisfy the population budget at the initial camera.
  const firstExit=director._routeAt(450);game.player.x=firstExit.x;game.player.y=firstExit.y-groundOffset(game.player,true);
  director.spawnSearch();
  assert(director.living().length>0,'Walking out of the initial clearing opens offscreen, reachable rear patrol admission.');
  const patrol=director.living()[0],start=foot(patrol);
  assert(patrol.storySearching&&patrol.guardActive===false);
  director.beforeEnemy(patrol,.1);assert.deepEqual(foot(patrol),start,'Admission warning precedes movement or attacks.');
  for(const enemy of director.living()){
    assert(!game._inView(enemy,32),'New pursuers begin outside the actual viewport.');
    assert(game.terrain.isFree(...Object.values(foot(enemy)),enemy.r));
    const nav=terrainNavigation(game.terrain),route=nav.rift.route(foot(enemy),foot(game.player),enemy.r+3,'ground');
    assert(route?.length,'A patrol must connect to the player through the authored region graph.');
    assert(['shieldguard','frostmage'].includes(enemy.type),'The patrol uses humanoid troops.');
    assert(enemy._storyEntryProgress<director.routeProgress-120,'The initial patrol enters from the already-traversed side of the chapter route.');
  }
  simulate(game,director,1.2);assert(distance(foot(patrol),start)>0,'Patrol walks its real route after admission.');
  story.flow.go('escape');simulate(game,director,6);
  assert(director.active().length>=6,'An alert produces sustained local pursuit on both mobile and desktop.');
  assert(director.living().some(enemy=>enemy.storyLeader&&enemy.bossKind==='ancient'),'A real Boss executor leads the pursuers.');
  assert(director.living().every(enemy=>!enemy.storySearching),'Discovery activates the entire search cohort.');
  const soldier=director.living().find(enemy=>enemy.storyProfile==='soldier');
  assert(soldier.speed<game.player.speed&&soldier.speed>=game.player.speed*.85,'Correct running gains distance from ordinary pursuit without needing the medicine.');
  assert(director.living().every(enemy=>enemy.speed<game.player.speed),'Leaders and support troops cannot win a permanent straight-line footrace against the base hero.');
  assert.equal(story.step,'escape');
  const oldIds=new Set(director.living().map(enemy=>enemy.id));
  for(const enemy of director.living())enemy.hp=0;
  simulate(game,director,6);
  assert(director.active().length>0&&director.living().every(enemy=>!oldIds.has(enemy.id)),'Killing a squad leads to new pursuit, never a cleared escape stage.');
  assert.equal(story.step,'escape','Only travel/script objectives advance the escape.');
}

for(const profile of ['soldier','guard','mage','captain']){
  const {game,director}=chapter();
  const exit=director._routeAt(600);game.player.x=exit.x;game.player.y=exit.y-groundOffset(game.player,true);
  const enemy=director._spawn(profile);assert(enemy,`${profile} has a legal rear entrance`);
  game.terrain=new Terrain({obstacles:[]});game.environment=null;
  Object.assign(enemy,{x:0,y:-groundOffset(enemy),_navTimer:0});
  Object.assign(game.player,{x:600,y:-groundOffset(game.player,true)});
  const before=distance(foot(enemy),foot(game.player));
  for(let i=0;i<120;i++){
    game._clock+=.05;game._moveEntity(game.player,game.player.speed*.05,0,true);game._moveEnemy(enemy,.05);
  }
  assert(distance(foot(enemy),foot(game.player))>before+150,`${profile}: real movement over six seconds lets the unboosted player gain distance, including every phase of the native Boss surge clock`);
}

{
  // Route order, rather than input heading or a straight chord to the goal,
  // defines the army entrance on turns, stops, reversals and nearby roads.
  const {game,story,director}=chapter(540,540);
  story.anchors.wake={x:0,y:0};story.paths={search:[{x:0,y:0},{x:1300,y:0},{x:1300,y:1300}],escape:[{x:1300,y:1300},{x:0,y:1300},{x:0,y:100},{x:-1300,y:100}]};
  director.route=null;director.routeProgress=0;director.lastPlayer={x:0,y:0};
  game.terrain={isFree:()=>true,island:{isDry:()=>true}};game.environment=null;
  director._reachable=()=>true;
  const profile=director.config.profiles.soldier;
  for(const progress of [500,1000,1250,1350,1650,2100,2550,2650,2700,2670,2610,2610,2610,2800,3500,3950,4400,4900]){
    const p=director._routeAt(progress);game.player.x=p.x;game.player.y=p.y-groundOffset(game.player,true);director.clock+=.1;director._updateProgress(p);
    const point=director._point(profile);assert(point,'Every open rear road admits a legal point.');
    assert(point.along<=director.routeProgress-160,'Turning, standing or walking back never admits the army farther ahead along the authored route.');
    assert(!game._inView({x:point.x,y:point.y-groundOffset({type:profile.type,r:16}),r:16},64));
    assert(Math.abs(director.routeProgress-progress)<1,'Progress stays on the locally travelled branch even when later roads pass nearby.');
  }
  // A later road is geometrically behind the player on this folded route.
  // It still must never be used as an admission fallback.
  director.routeProgress=500;director.lastPlayer={x:500,y:0};game.player.x=500;game.player.y=-groundOffset(game.player,true);
  game.terrain.isFree=(x,y)=>y>150;game.terrain.structureRevision=1;director.clock+=.1;
  assert.equal(director._point(profile),null,'A blocked travelled route cannot use a valid but unvisited road behind the camera.');
}

{
  const {game,story,director}=chapter();
  const exit=director._routeAt(450);game.player.x=exit.x;game.player.y=exit.y-groundOffset(game.player,true);
  story.flow.go('search');story.flow.go('escape');simulate(game,director,5);
  const leader=director.living().find(enemy=>enemy.storyLeader);assert(leader);
  const rewards={bossKills:game.bossKills,bossDefeated:game.bossDefeated,gold:game.gold,crystals:game.crystals};
  leader.x=game.player.x;leader.y=foot(game.player).y-groundOffset(leader);
  game._hurtEnemy(leader,100000,0,game.player,'raw');
  assert(leader.hp<=0,'A leader is killable through ordinary combat.');
  assert.deepEqual({bossKills:game.bossKills,bossDefeated:game.bossDefeated,gold:game.gold,crystals:game.crystals},rewards,'Story captains never complete a world, open a portal or pay its Boss currency reward.');
  simulate(game,director,6);assert(director.living().some(enemy=>enemy.storyLeader&&enemy!==leader),'An escape captain is replenished after defeat.');
  story.flow.go('escort');story.flow.go('pill');
  assert(!Number.isFinite(story._medicineReceivedAt),'Opening the handover dialogue does not grant the medicine or start its pressure timer.');
  story.advanceDialogue(true);
  assert.equal(story._medicineReceivedAt,story._clock,'Pressure starts when the princess hands over the medicine.');
  assert.equal(director.targetPopulation,24);
  simulate(game,director,10);const beforeDose=director.targetPopulation;
  assert(beforeDose>24&&beforeDose<64,'The army grows while the player is still holding the unused medicine.');
  story.flow.go('burst');assert.equal(director.targetPopulation,beforeDose,'Taking the medicine does not reset accumulated pursuit pressure.');
  simulate(game,director,Math.max(1,director.settings.ramp.duration-9));
  assert.equal(director.targetPopulation,64);
  assert(director.active().length>40,'Sustained real admissions build a large army through the power phase.');
  assert.equal(director.living().filter(enemy=>enemy.storyLeader).length,2,'The late army supports multiple bounded Boss leaders.');
  assert(director.living().length<=director.config.totalLimit);
  const abandoned=[...director.living()],xp=game.player.xp,kills=game.kills;
  for(const enemy of abandoned){enemy.x+=6000;enemy.y+=6000;}
  simulate(game,director,7);
  assert(abandoned.every(enemy=>!game.enemies.includes(enemy)),'Lost distant squads relinquish the total budget.');
  assert(director.active().length>0,'Faraway survivors cannot permanently block local reinforcements.');
  assert.equal(game.player.xp,xp);assert.equal(game.kills,kills,'Budget retirement grants no kill rewards.');
  story.flow.go('fading');assert.equal(director.targetPopulation,64);
  story.flow.go('sanctuary');assert.equal(director.targetPopulation,72);simulate(game,director,4);
  story.flow.go('judgment');assert.equal(director.targetPopulation,72);
  assert.equal(story._judgmentStartedAt,story._clock,'The three-second cast window begins on stage entry, including windup.');
  const beforeStrike=director.sequence;
  for(const enemy of director.living())game.combat.storyJudgment(enemy,{x:game.player.x,y:game.player.y});
  simulate(game,director,1);
  assert(director.living().length>0&&director.sequence>beforeStrike,'Entering judgment and clearing the crowd must not close the reinforcement source.');
  for(const enemy of director.living())game.combat.storyJudgment(enemy,{x:game.player.x,y:game.player.y});
  assert.equal(story.rules.judgmentDuration,3);
  assert.equal(director.settings.endWindow.stopBeforeEndSeconds,.5);
  simulate(game,director,1.2);
  assert(director.living().length>0&&!director.stopped,'Actual arrivals continue with more than half a second of the angel ultimate remaining.');
  story._clock=story._judgmentStartedAt+story.rules.judgmentDuration-.5001;director.update(.00001);
  assert(!director.stopped,'Reinforcement remains eligible immediately before the cutoff.');
  story._clock=story._judgmentStartedAt+story.rules.judgmentDuration-.5;
  const cutoffSequence=director.sequence;director.update(.00001);
  assert(director.stopped,'The configured battle window closes exactly half a second before the end.');
  for(const enemy of director.living())game.combat.storyJudgment(enemy,{x:game.player.x,y:game.player.y});
  simulate(game,director,20);
  assert.equal(director.living().length,0,'The real judgment clears infantry and the Boss together.');
  assert.equal(director.sequence,cutoffSequence,'The last half second and aftermath never admit another enemy.');
  director.clear('exit');director.clear('exit');assert.equal(director.living().length,0);
}

{
  const {game,story,director}=chapter();story.flow.go('search');director.clear();
  const exit=director._routeAt(450);game.player.x=exit.x;game.player.y=exit.y-groundOffset(game.player,true);
  const original=game.terrain.firstBlocker;
  game.terrain.firstBlocker=()=>({id:'sealed-test-boundary'});
  story.flow.go('escape');director.update(1);
  assert.equal(director.living().length,0,'An unreachable approach cannot fall back to spawning inside the view.');
  game.terrain.firstBlocker=original;
  director.update(2);assert(director.living().length>0,'A temporary blocked approach retries when it becomes usable.');
}

// Regression for the real desktop stall: the hero fits against this grove
// corner, but larger pursuers cannot stand at the hero's exact foot position.
// Previously one admission frame did over 2,000 failed route searches (~2 s).
for(const [width,height] of [[1440,900],[540,985]]){
  const {game,story,director}=chapter(width,height),p={x:story.anchors.pill.x-100,y:story.anchors.pill.y-90};
  game.player.x=p.x;game.player.y=p.y-groundOffset(game.player,true);story.flow.go('burst');story._clock=15;story._medicineReceivedAt=0;
  const reachable=director._reachable.bind(director),seen=new Set();let paths=0,totalPaths=0,maxUpdateMs=0;
  director._reachable=(...args)=>{paths++;return reachable(...args);};
  for(let i=0;i<150;i++){
    game._clock+=.1;story._clock+=.1;paths=0;const start=performance.now();director.update(.1);maxUpdateMs=Math.max(maxUpdateMs,performance.now()-start);
    assert(paths<=6,'Every admission update has a shared hard path-search budget, even across the full squad and its Boss.');totalPaths+=paths;
    for(const enemy of director.living()){
      if(!seen.has(enemy.id)){
        seen.add(enemy.id);const state=director._entryState(director.config.profiles[enemy.storyProfile],p,enemy.r),target=state.target,nav=terrainNavigation(game.terrain);
        assert(target&&distance(target,p)<=160&&game.terrain.isFree(target.x,target.y,enemy.r+3,'ground'));
        assert(nav.clearSegment(target,p,0,'ground'),'The legal approach remains on the player side of the wall.');
        assert(!game._inView(enemy,64)&&director._outsideForward(foot(enemy),p,enemy.r+5),'Cached medicine-phase entries remain offscreen and outside the whole forward guide sector.');
        assert(reachable(foot(enemy),target,enemy.r),'Each admitted troop still has a fully collision-checked route; the budget is never permission to skip reachability.');
      }
      if(!director.beforeEnemy(enemy,.1)&&!updateEnemyBehavior(game,enemy,.1))game._moveEnemy(enemy,.1);
    }
  }
  assert(director.living().length>=40&&director.living().filter(e=>game._inView(e)).length>=20,'Holding the grove corner still receives a growing visible army instead of suppressing the wave to improve performance.');
  for(const profile of ['soldier','guard','mage','captain'])assert(director.living().some(e=>e.storyProfile===profile),`${profile} is not starved by the shared budget`);
  const profile=director.config.profiles.soldier,r=director.living().find(e=>e.storyProfile==='soldier').r,old=director._entryState(profile,p,r);
  game.viewWidth+=200;assert.notEqual(director._entryState(profile,p,r),old,'A viewport change discards stale admission geometry.');
  const resized=director._entryState(profile,p,r);assert.notEqual(director._entryState(profile,{x:p.x+64,y:p.y},r),resized,'Actual movement reopens the scan instead of preserving a failed corner forever.');
  console.log(`Story corner admission ${width}x${height}: ${director.living().length} troops, ${totalPaths} path searches over 150 updates, slowest update ${maxUpdateMs.toFixed(1)} ms.`);
}

// Rotate the actual route through world directions. Admission must populate
// both flanks and the rear while preserving the full front quadrant, even
// when facing/input points backward. The angel then opens the fourth side.
for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4]){
  const {game,story,director}=chapter(540,900),p={x:0,y:0},end={x:Math.cos(angle)*1800,y:Math.sin(angle)*1800};
  game.enemies=[];game.terrain=new Terrain({obstacles:[]});game.environment=null;
  game.player.x=0;game.player.y=-groundOffset(game.player,true);game.player.facing=angle+Math.PI;
  story.anchors.wake=p;story.paths={search:[p,end],escape:[end]};
  story.getGuide=()=>({complete:true,routePath:[p,end],lengths:[0,1800],progress:0});
  director.route=null;director.routeProgress=0;director.lastPlayer=p;story.flow.go('burst');
  const admitted=[];
  for(let i=0;i<24;i++){director.clock+=.1;const enemy=director._spawn('soldier');assert(enemy,'Open terrain supplies every requested rear/flank slot.');admitted.push(enemy);}
  assert.deepEqual([...new Set(admitted.map(enemy=>enemy._storyEntrySector))].sort(),[0,1,2],'All three permitted directions receive real troops.');
  for(const enemy of admitted){
    const point=foot(enemy),length=distance(point,p),dot=point.x*Math.cos(angle)+point.y*Math.sin(angle);
    assert(dot+enemy.r+5<length*Math.SQRT1_2,'The complete forward 90-degree sector, including the enemy body, stays clear.');
    assert(!game._inView(enemy,64));assert(director._reachable(point,p,enemy.r));
  }
  for(const side of [-1,1]){
    const toward=angle+side*(Math.PI/4-.001),clear=angle+side*(Math.PI/4+.001);
    assert(!director._outsideForward({x:Math.cos(toward)*700,y:Math.sin(toward)*700},p));
    assert(director._outsideForward({x:Math.cos(clear)*700,y:Math.sin(clear)*700},p),'Both exact angular boundaries separate the whole forward sector from the flanks.');
  }
  if(angle===0){
    const free=game.terrain.isFree;
    game.terrain.isFree=(x,y)=>Math.hypot(x,y)<160||x>Math.hypot(x,y)*Math.SQRT1_2;
    game.terrain.structureRevision++;
    for(let attempt=0;attempt<8;attempt++){director.clock+=.1;assert.equal(director._point(director.config.profiles.soldier),null,'Sealing every allowed side defers admission instead of falling back to the open forward guide sector.');}
    game.terrain.isFree=free;game.terrain.structureRevision++;
  }
  const previous=director._entryState(director.config.profiles.soldier,p,admitted[0].r);
  story.angel={x:0,y:0,arrival:{startedAt:0,duration:1.1}};
  assert.equal(director.admissionMode,'surround','Visible arrival, not the end of its animation, opens all sides.');
  assert.notEqual(director._entryState(director.config.profiles.soldier,p,admitted[0].r),previous,'The formation change invalidates cached entrance geometry.');
  game.enemies=[];const surrounding=[];
  for(let i=0;i<16;i++){director.clock+=.1;const enemy=director._spawn('soldier');assert(enemy);surrounding.push(enemy);}
  assert.deepEqual([...new Set(surrounding.map(enemy=>enemy._storyEntrySector))].sort(),[0,1,2,3]);
  assert(surrounding.some(enemy=>{const point=foot(enemy);return point.x*Math.cos(angle)+point.y*Math.sin(angle)>distance(point,p)*.9;}),'After angel arrival, real troops also enter from the formerly protected front.');
}

{
  const {game,story,director}=chapter(),p={x:0,y:0};
  story.getGuide=()=>({complete:true,routePath:[p,{x:300,y:0},{x:300,y:1000}],lengths:[0,300,1300],progress:0});
  director._forwardState=null;
  assert(!director._outsideForward({x:700,y:0},p),'The initial guide direction remains protected.');
  assert(!director._outsideForward({x:300,y:700},p),'The broad direction through the upcoming bend is protected too.');
  assert(director._outsideForward({x:-700,y:0},p),'The rear remains available through a turn.');
  game.dispose();
}

for(const mutate of [
  pursuit=>pursuit.totalLimit=500,
  pursuit=>pursuit.profiles.soldier.type='missing',
  pursuit=>pursuit.stages.escape.target=500,
  pursuit=>pursuit.stages.escape.interval=0,
  pursuit=>pursuit.stages.escape.leader='soldier',
  pursuit=>pursuit.stages.burst.ramp.to=81,
  pursuit=>pursuit.stages.burst.ramp.startedAt='_medicineRecievedAt',
  pursuit=>pursuit.stages.judgment.endWindow.startedAt='_judgmentStarted',
  pursuit=>pursuit.stages.judgment.endWindow.stopBeforeEndSeconds=4,
  pursuit=>pursuit.stages.sanctuary.leaderCount=3
]){
  const sections=structuredClone(getConfigSnapshot().sections);mutate(sections.story.definitions[0].pursuit);
  assert.throws(()=>validateStory(sections));
}
for(const mutate of [chapter=>chapter.rules.judgmentWindup=0,chapter=>chapter.dialogueScopes.pill='forever',chapter=>delete chapter.dialogueScopes.escape]){
  const sections=structuredClone(getConfigSnapshot().sections);mutate(sections.story.definitions[0]);assert.throws(()=>validateStory(sections));
}
console.log('Story pursuit QA passed: reachable offscreen patrols, medicine-triggered army growth, rotated three-side admission with broad forward/bend protection, four sides on angel arrival, sustained Boss pursuit, bounded retirement and the final-half-second cutoff.');
