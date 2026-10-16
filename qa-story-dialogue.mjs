import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';

const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.heroId)});
const held={x:1,y:1,skill:true,interact:true};
const sample=g=>({
  step:g.story.step,time:g.time,runTime:g.runTime,clock:g._clock,chapterClock:g.story._clock,
  phaseAge:g.story.flow.elapsed,pursuitClock:g.story.pursuit.clock,
  player:{x:g.player.x,y:g.player.y,hp:g.player.hp,invuln:g.player.invuln,skillCooldown:g.player.skillCooldown},
  medicine:g.story.temporary.remaining,kills:g.kills,xp:g.player.xp,gold:g.gold,crystals:g.crystals,
  enemies:g.enemies.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp,shot:e.shot,attack:e.attackCooldown})),
  bullets:structuredClone(g.bullets),enemyBullets:structuredClone(g.enemyBullets),effects:structuredClone(g.effects),
  actors:g.story.actors.map(a=>({id:a.id,x:a.x,y:a.y,groundY:a.groundY})),
});
function freeze(g){
  assert(g.story.dialogueBlocking);const before=sample(g),line=g.story.getDialogue();
  for(let i=0;i<240;i++)g.update(.05,held);
  assert.deepEqual(sample(g),before,'Reading leaves combat, movement, clocks and temporary power untouched even with held input.');
  assert.deepEqual(g.story.getDialogue(),line,'A line cannot expire or advance because the player takes time to read it.');
}
function readBlock(story){
  const lines=[];
  for(let i=0;story.dialogueBlocking&&i<30;i++){
    const line=story.getDialogue();assert(line?.text&&line.name,'Every line identifies its speaker independently of a world actor.');
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
medicine.enemyBullets.push({x:medicine.player.x,y:medicine.player.y,vx:1,vy:1,life:3,r:5,damage:10});
medicine.effects.push({type:'ring',x:medicine.player.x,y:medicine.player.y,life:.6,maxLife:.6,r:10});
freeze(medicine);
assert(chapter.advanceDialogue(true));assert(!chapter.dialogueBlocking);
const remaining=chapter.temporary.remaining;medicine.update(.05);assert(chapter.temporary.remaining<remaining,'The temporary build resumes its timer with gameplay.');
medicine.dispose('quit');assert.equal(chapter.getDialogue(),null);assert.equal(chapter.advanceDialogue(),false);

const progress=new Game({mode:'story'}),progressStory=progress.story;
progressStory.advanceDialogue(true);progressStory.flow.go('pill');progressStory.advanceDialogue(true);assert(progressStory.useAction('story:take-pill'));
progressStory.princess.x=progress.player.x+1000;
for(let i=0;i<20;i++)progressStory.update(.05);
assert.equal(progressStory.getProgress().value,0,'Prayer does not advance when the hero abandons the princess.');
assert.match(progressStory.getProgress().detail,/靠近公主/);
progressStory.princess.x=progress.player.x;progressStory.princess.y=progress.player.y;
for(let i=0;i<20;i++)progressStory.update(.05);
assert(progressStory.getProgress().value>.9,'Nearby protection produces measurable prayer progress.');
progressStory.flow.go('sanctuary');progressStory.advanceDialogue(true);
const auraStart=progressStory.getProgress().value;
for(let i=0;i<20;i++)progressStory.update(.05);
assert.equal(progressStory.getProgress().value,auraStart,'Time outside the actual aura cannot complete its defense objective.');
assert.match(progressStory.getProgress().detail,/暂停/);
progress.player.x=progressStory.angel.x;progress.player.y=progressStory.angel.y-groundOffset(progress.player,true);
for(let i=0;i<20;i++)progressStory.update(.05);
const earned=progressStory.getProgress().value;assert(earned>auraStart+.9);
progress.player.x=progressStory.anchors.wake.x;progress.player.y=progressStory.anchors.wake.y-groundOffset(progress.player,true);
for(let i=0;i<20;i++)progressStory.update(.05);
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
assert(endingStory.advanceDialogue(true),'The conclusion is readable and finishable even when the world actors are far away.');
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
console.log('Story dialogue: manual reading, per-block skip, full simulation freeze, carried medicine handover, timer resumption, location-based prayer/aura progress, remote conclusion and one opaque victory commit passed.');
