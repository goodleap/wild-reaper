import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { StoryFlow } from './dist/story-flow.js';
import { getConfigSnapshot } from './dist/content-config.js';
import { validateStory } from './dist/config-validation/story.js';
import { CombatBuild } from './dist/combat-build.js';

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
function followGuideUntil(game,done,{seconds=60}={}) {
  // Integration fixture: route data drives ordinary input, collision and
  // damage. This is not evidence of first-time human navigation usability.
  for(let i=0;i<seconds/.05;i++) {
    readBlock(game.story);if(done())return;
    const guide=game.story.getGuide();assert(guide?.complete,'The displayed navigation has a complete route to its destination.');
    const p=foot(game.player),target=guide.waypoint;
    if(!target){tick(game);continue;}
    const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
    const amount=Math.min(1,d/(game.player.speed*.05));
    tick(game,d>1?{x:dx/d*amount,y:dy/d*amount}:{});
  }
  assert.fail(`navigation did not complete its objective in ${game.story.step}`);
}

const flow=new StoryFlow(['a','b','c']);assert(flow.start());assert(!flow.go('a'));assert(!flow.go('missing'));
flow.update(.5);assert.equal(flow.elapsed,.5);assert(flow.next());assert.equal(flow.elapsed,0);assert(!flow.go('a'));
validateStory(getConfigSnapshot().sections);
for(const mutation of [s=>s.definitions[0].anchors.meetingArea='missing',s=>s.definitions[0].rules.damageReductionCap=1,s=>s.definitions[0].steps.push('search'),s=>s.definitions[0].dialogue.awakening[0].speaker='unknown',s=>s.definitions[0].rules.arrivalDuration=0,s=>s.definitions[0].rules.prayerDuration=0,s=>s.definitions[0].rules.judgmentWindup=s.definitions[0].rules.judgmentDuration,s=>s.definitions[0].summonLine='']) {
  const sections=structuredClone(getConfigSnapshot().sections);mutation(sections.story);assert.throws(()=>validateStory(sections));
}

const game=new Game({mode:'story',hero:'elder',initialWeaponId:'arrow'}),story=game.story;
assert.equal(game.hero.id,'traveler');assert.equal(game.initialWeaponId,'sword');
assert.equal(story.step,'awakening');assert(story.active);assert.equal(story.completed,false);
assert.equal(story.getAction(),null);assert.equal(story.getBuff(),null);assert(!game.settlements.sites.some(site=>site.type==='angel'));
assert.equal(game.getInteraction(),null,'ordinary world interiors cannot interrupt the prologue');
const canonical=game.build,buildBefore=canonical.serialize();
assert.equal(game.canUseSkill('storm'),false);assert.equal(game.build.getSkill('storm').acquired,false);
assert(!game.skills.some(skill=>skill.id==='storm'),'The prologue does not own the ordinary thunder skill.');
assert.deepEqual(CombatBuild.fromSnapshot(buildBefore).serialize(),buildBefore,'An unlearned starter skill survives serialization without being silently restored.');
assert.equal(game._castStorm(),false);assert.equal(game.attacks.castStorm(),false);assert.equal(game.storm,null,'Neither direct combat entry point can bypass chapter ownership.');
readBlock(story);assert.equal(story.step,'search');assert(story.getGuide(),'The first controllable phase supplies an immediate destination.');
tick(game,{skill:true});assert.equal(game.storm,null,'Held ordinary-skill input cannot cast the chapter-restricted attack.');
followGuideUntil(game,()=>!!story.getAction());
assert.equal(story.princess.heroId,'princess');assert.equal(story.princess.appearanceId,'princess-v2');
assert(readStages.has('escort'),'The meeting explanation is confirmed before the escort action.');
assert(!game.companions.members.includes(story.princess),'story companion has no army payroll');
assert.equal(story.getAction()?.id,'story:take-pill');assert(readStages.has('pill'));
assert(Number.isFinite(story._medicineReceivedAt),'The horde begins to grow when medicine is received.');
assert.match(story.getAction().detail,new RegExp(`${story.rules.pillDuration} 秒`));
assert(story.useAction('story:take-pill'));assert.equal(story.step,'burst');
assert.equal(story.getAction(),null);assert(!story.useAction('story:take-pill'));
assert.equal(story.getBuff().speedPercent,100);assert.equal(story.getBuff().damageReduction,.99);
assert.equal(game.player.speed,640);assert.equal(game.build.getRank('sword'),5);assert.equal(game.build.getRank('swordEnergy'),3);assert.equal(game.build.getRank('orbit'),5);
assert.equal(game.build.getRank('barrier'),3);assert.equal(game.superSkills.owned.swords,3);
assert.equal(game.build.getSkill('fireball').baseRank,5);assert.equal(game.build.getSkill('frostbolt').baseRank,5);assert.equal(game.build.getSkill('storm').baseRank,0);
assert(!game.canUseSkill('storm'));assert.equal(game._castStorm(),false);
assert.equal(game.canonicalBuild,canonical);assert.deepEqual(canonical.serialize(),buildBefore);
const levelBefore=game.player.level;
assert.deepEqual(story.objectivePoint,story.anchors.refuge,'Taking the medicine immediately provides the onward destination.');
assert.equal(story._prayerProgress,0,'Summoning cannot finish while the player remains at the medicine handover.');
followGuideUntil(game,()=>story._helpReady);
assert(story.angel,'Following the complete route reaches the princess’s summoning and the angel’s arrival.');
assert.equal(story.princess.castFace,0,'The completed summoning does not leave the princess permanently casting.');
assert.equal(story._prayerProgress,story.rules.prayerDuration);
assert.equal(story.getProgress().label,'燃脉药效');
assert(story.temporary.remaining>0,'The journey and summoning complete while temporary power still protects the hero.');
assert(story.guardReduction>0,'The newly visible angel protects the hero before the final sanctuary stage.');
let warned=false;
for(let i=0;i<500&&story.step==='burst';i++){
  tick(game);if(story.temporary.active&&story.temporary.remaining<=6){warned=true;assert.match(story.objective,/即将消退/);}
}
assert(warned,'Expiry is announced while power remains, not after it disappears.');
assert.equal(story.step,'sanctuary');assert.equal(story.getBuff(),null);assert.equal(game.build,canonical);
assert(!story.dialogueBlocking);assert.equal(story.getDialogue(),null);assert.equal(story.getSceneDialogue()[0].speaker,'princess');
assert(!game.canUseSkill('storm'),'Medicine expiry restores the original chapter ownership restriction.');
assert.equal(game.levels,canonical.levels);assert.equal(game.superSkills.owned,canonical.superLevels);assert.equal(game.player.speed,320);
assert(game.player.level>levelBefore,'Real scripted enemies grant XP and level attributes.');
assert.equal(game.crystals,0);assert.equal(game.progressionTier,1);assert.deepEqual(canonical.serialize(),buildBefore);
readBlock(story);assert.equal(story.getProgress().label,'天使引雷');assert(story.guardReduction>0);
for(let i=0;i<500&&story.step!=='judgment';i++)tick(game);
assert.equal(story.step,'judgment');assert.equal(story.dialogueBlocking,false,'The thunder sequence does not wait on a combat bubble.');
const castKillsBefore=game.kills,castDefeated=new Set(),judgmentStarted=story._judgmentStartedAt;
assert(Number.isFinite(judgmentStarted));assert.equal(story.rules.judgmentDuration,3);
game.onArchiveDefeat=enemy=>{assert(!castDefeated.has(enemy.id),'An enemy cannot receive duplicate defeat credit across thunder pulses');castDefeated.add(enemy.id);};
let boltFrames=0,maxBolts=0;
for(let i=0;i<100&&story.step==='judgment';i++) {
  tick(game,{},false);
  const bolts=game.effects.filter(effect=>effect.storyJudgment);if(bolts.length)boltFrames++;
  maxBolts=Math.max(maxBolts,bolts.length);
  assert(bolts.every(effect=>effect.type==='angelStrike'&&effect.maxLife===.18));
  assert.equal(game.kills,castKillsBefore+castDefeated.size,'Later arrivals receive damage without duplicate kill credit.');
}
const judgmentEvent=observedEvents.find(event=>event.type==='storyJudgment');
assert(judgmentEvent?.count>0);assert.equal(judgmentEvent.damage,9999);
assert(boltFrames>10,'The three-second ultimate is animated across multiple real simulation frames.');
assert(maxBolts<=4,'The visual burst stays sparse even against a large pursuing army.');
assert.equal(story.step,'conversation');
assert(!game.effects.some(effect=>effect.storyJudgment),'Finished rescue lightning cannot freeze behind the concluding dialogue.');
assert.equal(story._living().length,0);
assert(story._clock-judgmentStarted>=3-1e-8&&story._clock-judgmentStarted<=3.1,'The final cast takes three seconds including its initial windup.');
assert(story.dialogueBlocking);assert.equal(story.getAction(),null,'The conclusion directly opens its dialogue instead of asking the player to find a moving NPC.');
readBlock(story);assert(game.sceneTransition.active);
for(let i=0;i<32&&game.sceneTransition.active;i++)tick(game,{},false);
assert(story.completed);assert(!story.active);assert.equal(story.step,'complete');assert.equal(story.actors.length,0);
assert.equal(game.status,'victory');assert.equal(story.completionTime,game.runTime);
assert(game.enemies.every(enemy=>enemy.hp<=0&&enemy.storyId===story.id),'Finishing ends the run without admitting any ordinary world residents.');
assert.equal(game.sceneContent.allows('worldContent'),false);assert.equal(game.settlements.sites.length,0);
assert.deepEqual(game.build.serialize(),buildBefore);assert.equal(game.progressionTier,1);assert.equal(game.crystals,0);
assert(!game.regions.rewardPortal);assert.equal(game.bossKills,0);
assert.deepEqual([...readStages],['awakening','escort','pill','conversation'],'Every necessary conversation is reached and deliberately confirmed in order; the rescue guidance remains live.');
const replay=new Game({mode:'story'});assert.equal(replay.story.step,'awakening');assert.equal(replay.player.level,1);assert(!replay.story.pillUsed);assert(replay.story.dialogueBlocking);
game.dispose();replay.dispose();
console.log('Story route: normal input/collision/combat, confirmed conversations, medicine handover, complete guided journey, destination summoning with arrival protection, expiry warning, guarded rescue, one-time thunder damage, victory transition and clean replay passed.');
