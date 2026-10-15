import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { updateEnemyBehavior } from './dist/enemy-behaviors.js';
import { getConfigSnapshot } from './dist/content-config.js';
import { validateStory } from './dist/config-validation/story.js';

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

for(const [width,height] of [[540,1080],[1100,650]]){
  const {game,story,director}=chapter(width,height);
  story.flow.go('search');
  assert(director.living().length>0,'The initial real forest supports offscreen, reachable patrol admission.');
  const patrol=director.living()[0],start=foot(patrol);
  assert(patrol.storySearching&&patrol.guardActive===false);
  director.beforeEnemy(patrol,.1);assert.deepEqual(foot(patrol),start,'Admission warning precedes movement or attacks.');
  for(const enemy of director.living()){
    assert(!game._inView(enemy,32),'New pursuers begin outside the actual viewport.');
    assert(game.terrain.isFree(...Object.values(foot(enemy)),enemy.r));
    const nav=terrainNavigation(game.terrain),route=nav.rift.route(foot(enemy),foot(game.player),enemy.r+3,'ground');
    assert(route?.length,'A patrol must connect to the player through the authored region graph.');
    assert(['shieldguard','frostmage'].includes(enemy.type),'The patrol uses humanoid troops.');
  }
  simulate(game,director,1.2);assert(distance(foot(patrol),start)>0,'Patrol walks its real route after admission.');
  story.flow.go('escape');simulate(game,director,6);
  assert(director.active().length>=6,'An alert produces sustained local pursuit on both mobile and desktop.');
  assert(director.living().some(enemy=>enemy.storyLeader&&enemy.bossKind==='ancient'),'A real Boss executor leads the pursuers.');
  assert(director.living().every(enemy=>!enemy.storySearching),'Discovery activates the entire search cohort.');
  const soldier=director.living().find(enemy=>enemy.storyProfile==='soldier');
  assert(soldier.speed>game.player.speed&&soldier.speed<game.player.speed*2,'Light infantry can maintain pressure, while the pill still outruns it.');
  assert.equal(story.step,'escape');
  const oldIds=new Set(director.living().map(enemy=>enemy.id));
  for(const enemy of director.living())enemy.hp=0;
  simulate(game,director,6);
  assert(director.active().length>0&&director.living().every(enemy=>!oldIds.has(enemy.id)),'Killing a squad leads to new pursuit, never a cleared escape stage.');
  assert.equal(story.step,'escape','Only travel/script objectives advance the escape.');
}

{
  const {game,story,director}=chapter();story.flow.go('search');story.flow.go('escape');simulate(game,director,5);
  const leader=director.living().find(enemy=>enemy.storyLeader);assert(leader);
  const rewards={bossKills:game.bossKills,bossDefeated:game.bossDefeated,gold:game.gold,crystals:game.crystals};
  leader.x=game.player.x;leader.y=foot(game.player).y-groundOffset(leader);
  game._hurtEnemy(leader,100000,0,game.player,'raw');
  assert(leader.hp<=0,'A leader is killable through ordinary combat.');
  assert.deepEqual({bossKills:game.bossKills,bossDefeated:game.bossDefeated,gold:game.gold,crystals:game.crystals},rewards,'Story captains never complete a world, open a portal or pay its Boss currency reward.');
  simulate(game,director,6);assert(director.living().some(enemy=>enemy.storyLeader&&enemy!==leader),'An escape captain is replenished after defeat.');
  story.flow.go('escort');story.flow.go('pill');
  assert.equal(story._medicineReceivedAt,story._clock,'Pressure starts when the princess hands over the medicine.');
  assert.equal(director.targetPopulation,24);
  simulate(game,director,10);const beforeDose=director.targetPopulation;
  assert(beforeDose>24&&beforeDose<64,'The army grows while the player is still holding the unused medicine.');
  story.flow.go('burst');assert.equal(director.targetPopulation,beforeDose,'Taking the medicine does not reset accumulated pursuit pressure.');
  simulate(game,director,21);
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
  const beforeStrike=director.sequence;
  for(const enemy of director.living())game.combat.storyJudgment(enemy,{x:game.player.x,y:game.player.y});
  simulate(game,director,1);
  assert(director.living().length>0&&director.sequence>beforeStrike,'Entering judgment and clearing the crowd must not close the reinforcement source.');
  story._judgmentStartedAt=story._clock;
  for(const enemy of director.living())game.combat.storyJudgment(enemy,{x:game.player.x,y:game.player.y});
  simulate(game,director,2.5);
  assert(director.living().length>0,'Actual arrivals continue while more than one second of the angel ultimate remains.');
  story._clock=story._judgmentStartedAt+story.rules.judgmentDuration-1;
  const finalSecond=director.sequence;
  director.update(.1);
  assert(director.stopped,'The configured battle window closes exactly at its final second.');
  for(const enemy of director.living())game.combat.storyJudgment(enemy,{x:game.player.x,y:game.player.y});
  simulate(game,director,20);
  assert.equal(director.living().length,0,'The real judgment clears infantry and the Boss together.');
  assert.equal(director.sequence,finalSecond,'The last second and aftermath never admit another enemy.');
  director.clear('exit');director.clear('exit');assert.equal(director.living().length,0);
}

{
  const {game,story,director}=chapter();story.flow.go('search');director.clear();
  const original=game.terrain.firstBlocker;
  game.terrain.firstBlocker=()=>({id:'sealed-test-boundary'});
  story.flow.go('escape');director.update(1);
  assert.equal(director.living().length,0,'An unreachable approach cannot fall back to spawning inside the view.');
  game.terrain.firstBlocker=original;
  director.update(2);assert(director.living().length>0,'A temporary blocked approach retries when it becomes usable.');
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
console.log('Story pursuit QA passed: reachable offscreen patrols, medicine-triggered army growth, sustained Boss pursuit, bounded retirement and the final-second cutoff.');
