import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';

const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.heroId)});
const held={x:1,y:1,skill:true,interact:true};
const place=(actor,point)=>{actor.x=point.x;actor.y=point.y-groundOffset(actor,!!actor.heroId);if('groundY' in actor)actor.groundY=point.y;};
const scriptTick=(game,seconds)=>{for(let i=0;i<seconds/.05;i++){game._clock+=.05;game.story.update(.05);}};
const sample=g=>({
  step:g.story.step,time:g.time,runTime:g.runTime,clock:g._clock,chapterClock:g.story._clock,
  phaseAge:g.story.flow.elapsed,pursuitClock:g.story.pursuit.clock,
  player:{x:g.player.x,y:g.player.y,hp:g.player.hp,invuln:g.player.invuln,skillCooldown:g.player.skillCooldown},
  medicine:g.story.temporary.remaining,kills:g.kills,xp:g.player.xp,gold:g.gold,crystals:g.crystals,
  enemies:g.enemies.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp,shot:e.shot,attack:e.attackCooldown})),
  bullets:structuredClone(g.bullets),enemyBullets:structuredClone(g.enemyBullets),effects:structuredClone(g.effects),
  actors:g.story.actors.map(a=>({id:a.id,x:a.x,y:a.y,groundY:a.groundY,castFace:a.castFace})),
});
function freeze(g){
  assert(g.story.dialogueBlocking);const before=sample(g),line=g.story.getDialogue();
  for(let i=0;i<240;i++)g.update(.05,held);
  assert.deepEqual(sample(g),before,'Reading leaves combat, movement, clocks and temporary power untouched even with held input.');
  assert.deepEqual(g.story.getDialogue(),line,'A line cannot expire or advance because the player takes time to read it.');
  const markers=g.story.getSceneDialogue();assert.equal(markers.length,1);assert.equal(markers[0].text,'…');assert.equal(markers[0].speaker,line.speaker);assert.equal(markers[0].id,line.id,'The world marker remains attached to the current line while simulation is paused.');
}
function readBlock(story){
  const lines=[];
  for(let i=0;story.dialogueBlocking&&i<30;i++){
    const line=story.getDialogue();assert(line?.text&&line.name,'Every line identifies its speaker independently of a world actor.');
    const markers=story.getSceneDialogue();assert.equal(markers.length,1);assert.equal(markers[0].text,'…');assert.equal(markers[0].speaker,line.speaker);
    assert.equal(markers[0].actor,line.speaker==='player'?story.game.player:story[line.speaker],'Only the actual current speaker receives the marker.');
    lines.push(line.text);assert(story.advanceDialogue());
  }
  assert(!story.dialogueBlocking,'Manual confirmation completes this dialogue block.');return lines;
}

const opening=new Game({mode:'story'}),story=opening.story;
assert(story.dialogueBlocking);assert.equal(story.step,'awakening');
assert.equal(story.getAction(),null);assert.equal(story._medicineReceivedAt??null,null);
assert(story.princess,'The princess is already present at the meeting point before the player discovers her.');
assert(Math.hypot(foot(story.princess).x-story.anchors.meeting.x,foot(story.princess).y-story.anchors.meeting.y)<160);
freeze(opening);
const first=story.getDialogue();assert(story.advanceDialogue());
assert.equal(story.step,'awakening','Advancing one opening line cannot skip the remaining introduction.');
assert.notEqual(story.getDialogue().id,first.id);assert.equal(story.getDialogue().index,first.index+1);
freeze(opening);
assert.equal(readBlock(story).length,story.definition.dialogue.awakening.length-1);
assert.equal(story.step,'search');assert.equal(story.getDialogue(),null);assert.equal(story.advanceDialogue(),false);
assert(story.getGuide(),'The first controllable phase immediately supplies a route.');
const x=opening.player.x;opening.update(.05,{x:1});assert(opening.player.x>x,'Ordinary movement resumes after reading.');
opening.dispose('quit');

const skipped=new Game({mode:'story'});assert(skipped.story.advanceDialogue(true));
assert.equal(skipped.story.step,'search','Skip advances only the current conversation, not the whole chapter.');
assert.equal(skipped.story.completed,false);assert.equal(skipped.story.pillUsed,false);skipped.dispose('quit');

// These isolated stage fixtures exercise timing and lifecycle invariants. The
// separate route test reaches the same stages through real movement/combat.
const medicine=new Game({mode:'story'}),chapter=medicine.story;
chapter.advanceDialogue(true);chapter.flow.go('pill');
assert(chapter.dialogueBlocking);assert.equal(chapter.getAction(),null,'The medicine cannot be consumed before its handover is explained.');
assert.equal(chapter._medicineReceivedAt??null,null,'Reinforcement escalation does not start before the actual handover.');
freeze(medicine);readBlock(chapter);
assert.equal(chapter._medicineReceivedAt,chapter._clock);
assert.equal(chapter.getAction()?.id,'story:take-pill');
chapter.princess.x-=800;
assert.equal(chapter.getAction()?.id,'story:take-pill','Carried medicine is usable without returning to the princess.');
assert(chapter.useAction('story:take-pill'));assert.equal(chapter.useAction('story:take-pill'),false);
assert.equal(chapter.step,'burst');assert(chapter.temporary.active);
chapter.flow.go('sanctuary');assert(chapter.dialogueBlocking);
const enemy=medicine._spawnEnemy('slime',1);Object.assign(enemy,{x:medicine.player.x,y:medicine.player.y,storyId:chapter.id,storyEnemy:true});
medicine.player.hp=50;medicine.player.skillCooldown=4;
chapter.princess.castFace=.25;
medicine.enemyBullets.push({x:medicine.player.x,y:medicine.player.y,vx:1,vy:1,life:3,r:5,damage:10});
medicine.effects.push({type:'ring',x:medicine.player.x,y:medicine.player.y,life:.6,maxLife:.6,r:10});
freeze(medicine);
assert(chapter.advanceDialogue(true));assert(!chapter.dialogueBlocking);
const remaining=chapter.temporary.remaining;medicine.update(.05);assert(chapter.temporary.remaining<remaining,'The temporary build resumes its timer with gameplay.');
assert(chapter.princess.castFace<.25,'The princess’s expression timer resumes after the paused dialogue.');
medicine.dispose('quit');assert.equal(chapter.getDialogue(),null);assert.equal(chapter.advanceDialogue(),false);

const progress=new Game({mode:'story'}),progressStory=progress.story;
progressStory.advanceDialogue(true);progressStory.flow.go('pill');progressStory.advanceDialogue(true);assert(progressStory.useAction('story:take-pill'));
scriptTick(progress,1);
assert.equal(progressStory._prayerProgress,0,'Staying with the princess at the medicine handover cannot summon the angel.');
assert.equal(progressStory._summoning,false);assert.equal(progressStory.getProgress().label,'燃脉药效');
assert.deepEqual(progressStory.objectivePoint,progressStory.anchors.refuge,'The medicine phase continues navigation to the real summoning destination.');
place(progressStory.princess,progressStory.anchors.refuge);place(progress.player,progressStory.anchors.refuge);
scriptTick(progress,.5);assert(progressStory._summoning);
assert(progressStory.getProgress().value>=.45,'Prayer begins after both actors reach the summoning location.');
const summonBubble=progressStory.getSceneDialogue();assert.equal(summonBubble.length,1);assert.equal(summonBubble[0].speaker,'princess');
assert.equal(summonBubble[0].text,progressStory.definition.summonLine);assert.notEqual(summonBubble[0].text,'…');
const begun=progressStory._prayerProgress;place(progress.player,progressStory.anchors.wake);scriptTick(progress,1);
assert.equal(progressStory._prayerProgress,begun,'Leaving the summoner pauses the earned progress.');
assert.match(progressStory.getProgress().detail,/返回公主/);
place(progress.player,progressStory.anchors.refuge);
for(let i=0;i<100&&!progressStory.angel;i++)scriptTick(progress,.05);
assert(progressStory.angel?.arrival,'Completed prayer starts a visible arrival instead of instantly enabling a hidden guardian.');
assert(!progressStory._helpReady);assert.equal(progressStory.guardReduction,0);
const arriving=progressStory.angel,arrivalEnd=arriving.arrival.startedAt+arriving.arrival.duration;
for(let i=0;i<100&&!progressStory._helpReady;i++)scriptTick(progress,.05);
assert(progress._clock>=arrivalEnd&&progressStory._helpReady);assert(progressStory.guardReduction>0,'The angel’s completed arrival immediately enables protection during the medicine phase.');
assert.deepEqual(progressStory.getSceneDialogue(),[],'The scripted summoning bubble ends after the arrival, without enabling ambient chatter.');
const target=progress._spawnEnemy('slime',1);Object.assign(target,{x:arriving.x+50,y:arriving.y-groundOffset(target),hp:1000,maxHp:1000,storyId:progressStory.id,guardActive:true});
progress.player.hp=50;const targetHp=target.hp;scriptTick(progress,.3);
assert(progress.player.hp>50,'The newly arrived guardian immediately uses ordinary aura healing.');
assert(target.hp<targetHp,'The newly arrived guardian attacks before the final ultimate.');
progressStory.flow.go('sanctuary');progressStory.advanceDialogue(true);
place(progress.player,progressStory.anchors.wake);const auraStart=progressStory.getProgress().value;
scriptTick(progress,1);
assert.equal(progressStory.getProgress().value,auraStart,'Time outside the actual aura cannot complete its defense objective.');
assert.match(progressStory.getProgress().detail,/暂停/);
place(progress.player,arriving);scriptTick(progress,1);
const earned=progressStory.getProgress().value;assert(earned>auraStart+.9);
place(progress.player,progressStory.anchors.wake);scriptTick(progress,1);
assert.equal(progressStory.getProgress().value,earned,'Leaving pauses the earned defense progress instead of awarding idle time or erasing progress.');
progress.dispose('quit');

const ending=new Game({mode:'story'}),endingStory=ending.story;
endingStory.advanceDialogue(true);endingStory.flow.go('conversation');
assert(endingStory.dialogueBlocking);assert.equal(endingStory.getAction(),null);
ending.player.x=endingStory.anchors.wake.x;ending.player.y=endingStory.anchors.wake.y-groundOffset(ending.player,true);
freeze(ending);
const before=sample(ending),inputRevision=ending.sceneTransition.inputRevision;
ending.sceneContent.restoreWorld=()=>assert.fail('Chapter completion must not generate an unrelated exploration scene.');
let completedCount=0;const emit=ending._emit.bind(ending);
ending._emit=(type,event)=>{if(type==='storyCompleted'){completedCount++;assert.equal(ending.sceneTransition.opacity,1,'Victory commits only beneath an opaque transition.');}return emit(type,event);};
assert(endingStory.advanceDialogue(true),'The conclusion is readable even when the world actors are far away.');
assert(!ending.sceneTransition.active,'Skip reaches the final line but cannot silently finish the run.');
assert.equal(endingStory.getDialogue().nextLabel,'正式启航');
assert.equal(endingStory.getDialogue().index,endingStory.getDialogue().total);
assert(endingStory.dialogueBlocking);freeze(ending);
endingStory.advanceDialogue(true);assert(!ending.sceneTransition.active,'Repeated skip still requires explicit departure confirmation.');
assert(endingStory.advanceDialogue(false),'The player explicitly selects 正式启航.');
assert(ending.sceneTransition.active);assert(!endingStory.completed,'Confirming the conclusion first starts the transition.');
assert.equal(ending.sceneContent.allows('worldContent'),false);assert.equal(endingStory.advanceDialogue(true),false);
for(let i=0;i<32&&ending.sceneTransition.active;i++)ending.update(.025,held);
assert(!ending.sceneTransition.active);assert(endingStory.completed);assert.equal(completedCount,1);
assert.equal(ending.status,'victory');assert.equal(ending.sceneContent.allows('worldContent'),false);assert.equal(ending.sceneTransition.inputRevision,inputRevision+2);
assert.equal(ending.runTime,before.runTime,'The final fade does not add combat time.');
assert.equal(endingStory.actors.length,0);assert.equal(endingStory.getDialogue(),null);assert.equal(endingStory.advanceDialogue(true),false);
ending.dispose('quit');
const dying=new Game({mode:'story'});dying.status='dead';dying.update(.05);
assert(dying.story.disposed);assert.equal(dying.story.getDialogue(),null);assert.equal(dying.story.advanceDialogue(),false);
console.log('Story dialogue: manual reading, per-block skip, full simulation freeze, carried medicine handover, timer resumption, destination-only summoning, speaker markers, arrival healing/attacks, aura progress, explicit remote departure and one opaque victory commit passed.');
