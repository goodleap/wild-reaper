import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { StoryFlow } from './dist/story-flow.js';
import { getConfigSnapshot } from './dist/content-config.js';
import { validateStory } from './dist/config-validation/story.js';

let seed=72291;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const foot=actor=>({x:actor.x,y:actor.y+groundOffset(actor,!!actor.heroId)});
const observedEvents=[],readStages=new Set();
function readBlock(story){
  if(!story.dialogueBlocking)return;
  readStages.add(story.step);
  for(let i=0;story.dialogueBlocking&&i<30;i++){
    assert(story.getDialogue()?.text);assert(story.advanceDialogue());
  }
  assert(!story.dialogueBlocking);
}
function tick(game,input={},read=true) {
  if(read)readBlock(game.story);
  game.update(.05,input);observedEvents.push(...game.events);game.events=[];
  assert(['playing','victory'].includes(game.status),`the actual-input route remains alive in ${game.story.step} at ${game.runTime.toFixed(2)}s`);
}
function walk(game,target) {
  // This is an integration fixture with known map paths, not first-time
  // player-experience evidence. It uses normal input, collision and damage.
  for(let i=0;i<500;i++) {
    readBlock(game.story);
    const p=foot(game.player),dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
    if(d<28)return;
    tick(game,{x:dx/d,y:dy/d});
    if(game.story.getAction()?.id==='story:take-pill')return;
  }
  assert.fail(`unreachable route point in ${game.story.step}`);
}

const flow=new StoryFlow(['a','b','c']);assert(flow.start());assert(!flow.go('a'));assert(!flow.go('missing'));
flow.update(.5);assert.equal(flow.elapsed,.5);assert(flow.next());assert.equal(flow.elapsed,0);assert(!flow.go('a'));
validateStory(getConfigSnapshot().sections);
for(const mutation of [s=>s.definitions[0].anchors.meetingArea='missing',s=>s.definitions[0].rules.damageReductionCap=1,s=>s.definitions[0].steps.push('search'),s=>s.definitions[0].dialogue.awakening[0].speaker='unknown']) {
  const sections=structuredClone(getConfigSnapshot().sections);mutation(sections.story);assert.throws(()=>validateStory(sections));
}

const game=new Game({mode:'story',hero:'elder',initialWeaponId:'arrow'}),story=game.story;
assert.equal(game.hero.id,'traveler');assert.equal(game.initialWeaponId,'sword');
assert.equal(story.step,'awakening');assert(story.active);assert.equal(story.completed,false);
assert.equal(story.getAction(),null);assert.equal(story.getBuff(),null);assert(!game.settlements.sites.some(site=>site.type==='angel'));
assert.equal(game.getInteraction(),null,'ordinary world interiors cannot interrupt the prologue');
const canonical=game.build,buildBefore=canonical.serialize();
readBlock(story);assert.equal(story.step,'search');assert(story.getGuide(),'The first controllable phase supplies an immediate destination.');
for(const point of story.paths.search)walk(game,point);
assert.equal(story.step,'escort');assert.equal(story.princess.heroId,'princess');assert.equal(story.princess.appearanceId,'princess-v2');
assert(readStages.has('escort'),'The meeting explanation is confirmed before the escort action.');
assert(!game.companions.members.includes(story.princess),'story companion has no army payroll');
const pillIndex=Math.floor(story.paths.escape.length*.42);
for(const point of story.paths.escape.slice(0,pillIndex+1)){walk(game,point);if(story.getAction())break;}
for(let i=0;i<100&&!story.getAction();i++)tick(game);
assert.equal(story.getAction()?.id,'story:take-pill');assert(readStages.has('pill'));
assert(Number.isFinite(story._medicineReceivedAt),'The horde begins to grow when medicine is received.');
assert.match(story.getAction().detail,new RegExp(`${story.rules.pillDuration} 秒`));
assert(story.useAction('story:take-pill'));assert.equal(story.step,'burst');
assert.equal(story.getAction(),null);assert(!story.useAction('story:take-pill'));
assert.equal(story.getBuff().speedPercent,100);assert.equal(story.getBuff().damageReduction,.99);
assert.equal(game.player.speed,640);assert.equal(game.build.getRank('sword'),5);assert.equal(game.build.getRank('swordEnergy'),3);assert.equal(game.build.getRank('orbit'),5);
assert.equal(game.build.getRank('barrier'),3);assert.equal(game.superSkills.owned.swords,3);
assert.equal(game.build.getSkill('fireball').baseRank,0);assert.equal(game.canonicalBuild,canonical);assert.deepEqual(canonical.serialize(),buildBefore);
const levelBefore=game.player.level;
assert.equal(story.getProgress().label,'公主求援');
for(let i=0;i<Math.ceil(story.rules.prayerDuration/.05)+40&&!story._helpReady;i++)tick(game);
assert(story._helpReady,'Staying near the princess visibly completes the prayer.');
assert(story.angel);assert.equal(story.getProgress().label,'燃脉药效');
assert(story.temporary.remaining>0,'The retreat opens while the temporary power still protects the hero.');
assert.match(story.objective,/撤/);
for(const point of story.paths.escape.slice(pillIndex))walk(game,point);
assert(story.temporary.active,'The announced retreat can be completed before medicine expires.');
let warned=false;
for(let i=0;i<500&&story.step==='burst';i++){
  tick(game);if(story.temporary.active&&story.temporary.remaining<=6){warned=true;assert.match(story.objective,/即将消退/);}
}
assert(warned,'Expiry is announced while power remains, not after it disappears.');
assert.equal(story.step,'sanctuary');assert.equal(story.getBuff(),null);assert.equal(game.build,canonical);
assert.equal(game.levels,canonical.levels);assert.equal(game.superSkills.owned,canonical.superLevels);assert.equal(game.player.speed,320);
assert(game.player.level>levelBefore,'Real scripted enemies grant XP and level attributes.');
assert.equal(game.crystals,0);assert.equal(game.progressionTier,1);assert.deepEqual(canonical.serialize(),buildBefore);
readBlock(story);assert.equal(story.getProgress().label,'天使引雷');assert(story.guardReduction>0);
for(let i=0;i<500&&story.step!=='judgment';i++)tick(game);
assert.equal(story.step,'judgment');assert.equal(story.dialogueBlocking,false,'The thunder sequence does not wait on a combat bubble.');
const castKillsBefore=game.kills,castDefeated=new Set();
game.onArchiveDefeat=enemy=>{assert(!castDefeated.has(enemy.id),'An enemy cannot receive duplicate defeat credit across thunder pulses');castDefeated.add(enemy.id);};
for(let i=0;i<200&&!story._judgmentStartedAt;i++)tick(game);
assert(story._judgmentStartedAt);assert.equal(story.step,'judgment');
const judgmentEvent=observedEvents.find(event=>event.type==='storyJudgment');
assert(judgmentEvent?.count>0);assert.equal(judgmentEvent.damage,9999);
let boltFrames=0;
for(let i=0;i<60;i++) {
  tick(game);assert.equal(story.step,'judgment');
  const bolts=game.effects.filter(effect=>effect.storyJudgment);if(bolts.length)boltFrames++;
  assert(bolts.every(effect=>effect.type==='angelStrike'&&effect.maxLife===.18));
  assert.equal(game.kills,castKillsBefore+castDefeated.size,'Later arrivals receive damage without duplicate kill credit.');
}
assert(boltFrames>20);
for(let i=0;i<100&&story.step!=='conversation';i++)tick(game,{},false);
assert.equal(story.step,'conversation');
assert(!game.effects.some(effect=>effect.storyJudgment),'Finished rescue lightning cannot freeze behind the concluding dialogue.');assert.equal(story._living().length,0);assert(game._clock-story._judgmentStartedAt>=4);
assert(story.dialogueBlocking);assert.equal(story.getAction(),null,'The conclusion directly opens its dialogue instead of asking the player to find a moving NPC.');
readBlock(story);assert(game.sceneTransition.active);
for(let i=0;i<32&&game.sceneTransition.active;i++)tick(game,{},false);
assert(story.completed);assert(!story.active);assert.equal(story.step,'complete');assert.equal(story.actors.length,0);
assert.equal(game.status,'victory');assert.equal(story.completionTime,game.runTime);
assert(game.enemies.every(enemy=>enemy.hp<=0&&enemy.storyId===story.id),'Finishing ends the run without admitting any ordinary world residents.');
assert.equal(game.sceneContent.allows('worldContent'),false);assert.equal(game.settlements.sites.length,0);
assert.deepEqual(game.build.serialize(),buildBefore);assert.equal(game.progressionTier,1);assert.equal(game.crystals,0);
assert(!game.regions.rewardPortal);assert.equal(game.bossKills,0);
assert.deepEqual([...readStages],['awakening','escort','pill','sanctuary','conversation'],'Every necessary conversation is reached and deliberately confirmed in order.');
const replay=new Game({mode:'story'});assert.equal(replay.story.step,'awakening');assert.equal(replay.player.level,1);assert(!replay.story.pillUsed);assert(replay.story.dialogueBlocking);
game.dispose();replay.dispose();
console.log('Story route: normal input/collision/combat, confirmed conversations, medicine handover, nearby prayer progress, powered retreat with expiry warning, guarded rescue, one-time thunder damage, victory transition and clean replay passed.');
