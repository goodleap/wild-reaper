import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { StoryFlow } from './dist/story-flow.js';
import { StoryRun,STORY_DEFINITIONS } from './dist/story-run.js';
import { SceneDialogue,DIALOGUE_RULES } from './dist/scene-dialogue.js';
import { layoutSceneDialogue } from './dist/scene-dialogue-renderer.js';
import { getConfigSnapshot } from './dist/content-config.js';
import { validateStory } from './dist/config-validation/story.js';

let seed=72291;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const foot=actor=>({x:actor.x,y:actor.y+groundOffset(actor,!!actor.heroId)});
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const acknowledged=story=>{for(const line of [...story.dialogue]){story.onDialoguePresented(line.id);story.onDialogueFinished(line.id);}};
const observedEvents=[];
function tick(game,input={},read=true) {
  game.update(.05,input);if(read)acknowledged(game.story);
  observedEvents.push(...game.events);game.events=[];
  assert.equal(game.status,'playing',`the scripted journey remains playable in ${game.story.step}`);
}
function walk(game,target,{read=true}={}) {
  // These are the map's real baked walking routes, using actual input and
  // collision. No position teleport, invulnerability or damage bypass.
  for(let i=0;i<500;i++) {
    const p=foot(game.player),dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
    if(d<28)return;
    tick(game,{x:dx/d,y:dy/d},read);
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

// Exercise phase cancellation through the real presentation scheduler. A
// reaction already read for 2.45 seconds used to block judgment indefinitely
// when its fixed bubble was later covered by the following princess.
function dialogueChapter(){
  const g={hero:{id:'traveler',dialogueName:'王子'},status:'playing',mapId:'world:forest',terrain:{},player:{heroId:'traveler',x:300,y:300},enemies:[],companions:{members:[],camps:[]},settlements:{sites:[]},relicSites:{sites:[]}};
  const chapter=Object.assign(Object.create(StoryRun.prototype),{game:g,id:'prologue',definition:STORY_DEFINITIONS[0],initialized:true,completed:false,disposed:false,dialogue:[],_lineId:0,_lineState:new Map(),actors:[{id:'story:angel',kind:'angel',type:'angel',x:460,y:300}]});
  g.story=chapter;return g;
}
const dialogueVisible={isVisible:()=>true},dialogueLayout={project:(x,y)=>({x,y}),width:800,height:600};
for(const shown of [1,2.45]){
  const g=dialogueChapter(),chapter=g.story,dialogue=new SceneDialogue();chapter._queue('burst');
  const reactionId=chapter.dialogue[0].id;dialogue.observe(g,0,dialogueVisible);
  const read=dt=>{const placed=layoutSceneDialogue(dialogue.items(dialogueVisible),dialogueLayout);assert.equal(placed.length,1);dialogue.present(placed);dialogue.observe(g,dt,dialogueVisible);};
  read(shown);chapter._enter('judgment');dialogue.observe(g,0,dialogueVisible);
  assert(!chapter.dialogue.some(line=>line.id===reactionId),'A passed reaction is removed from the authoritative plot queue even after presentation.');
  if(shown<DIALOGUE_RULES.minDuration){
    assert.equal(dialogue.items(dialogueVisible)[0].externalId,reactionId,'A currently readable reaction retains its original minimum after the phase changes.');
    read(DIALOGUE_RULES.minDuration-shown);
  }
  const judgmentId=chapter.dialogue[0].id;
  assert.equal(dialogue.items(dialogueVisible)[0].externalId,judgmentId,'The next key instruction proceeds once the obsolete reaction has satisfied its minimum.');
  assert.equal(chapter._lineState.get(reactionId).finished,false,'Cancelling an obsolete reaction does not fake full reading.');
  dialogue.present([]);dialogue.observe(g,60,dialogueVisible);
  assert.equal(chapter._linesFinished('judgment'),false,'A key line still waits for actual drawing, with no time-based acknowledgement.');
  assert.equal(dialogue.items(dialogueVisible)[0].remaining,3.6);
  read(3.6);assert(chapter._linesFinished('judgment'),'The normal full reading receipt completes the key line.');
}
const retainedChapter=dialogueChapter().story;
for(const step of ['awakening','escort','pill','sanctuary','judgment','conversation'])retainedChapter._queue(step);
const retainedIds=retainedChapter.dialogue.map(line=>line.id);
for(const step of ['search','escape','burst','fading'])retainedChapter._queue(step);
for(const line of retainedChapter.dialogue)retainedChapter.onDialoguePresented(line.id);
retainedChapter._enter('judgment');
assert.deepEqual(retainedChapter.dialogue.slice(0,retainedIds.length).map(line=>line.id),retainedIds,'All key plot lines retain their order across the phase edge.');
assert(retainedChapter.dialogue.every(line=>!['search','escape','burst','fading'].includes(retainedChapter._lineState.get(line.id).step)));

const game=new Game({mode:'story',hero:'elder',initialWeaponId:'arrow'}),story=game.story;
assert.equal(game.hero.id,'traveler');assert.equal(game.initialWeaponId,'sword');
assert.equal(story.step,'awakening');assert(story.active);assert.equal(story.completed,false);
assert.equal(story.getAction(),null);assert.equal(story.getBuff(),null);assert(!game.settlements.sites.some(site=>site.type==='angel'));
assert.equal(game.getInteraction(),null,'ordinary world interiors cannot interrupt the prologue');
const canonical=game.build,buildBefore=canonical.serialize();
for(let i=0;i<200&&story.step!=='escape';i++)tick(game);
assert.equal(story.step,'escape','patrol physically approaches and discovers a stationary player');
assert(game.enemies.some(enemy=>near(foot(enemy),foot(game.player))<=story.rules.noticeRange+12));
for(const point of story.paths.search)walk(game,point);
assert.equal(story.step,'escort');assert.equal(story.princess.heroId,'princess');assert.equal(story.princess.appearanceId,'princess-v2');
assert(!game.companions.members.includes(story.princess),'story companion has no army payroll');
for(const point of story.paths.escape.slice(0,Math.floor(story.paths.escape.length*.42)+1)){walk(game,point);if(story.getAction())break;}
for(let i=0;i<100&&!story.getAction();i++)tick(game);
assert.equal(story.getAction()?.id,'story:take-pill');
assert(story.useAction('story:take-pill'));assert.equal(story.step,'burst');
assert.equal(story.getAction(),null,'successful medicine action disappears immediately');assert(!story.useAction('story:take-pill'));
assert.equal(story.getBuff().speedPercent,100);assert.equal(story.getBuff().damageReduction,.99);
assert.equal(game.player.speed,640,'local buff doubles current ordinary prince speed');
assert.equal(game.build.getRank('sword'),5);assert.equal(game.build.getRank('swordEnergy'),3);assert.equal(game.build.getRank('orbit'),5);
assert.equal(game.build.getRank('barrier'),3);assert.equal(game.superSkills.owned.swords,3);
assert.equal(game.build.getSkill('fireball').baseRank,0,'unrelated skills are not silently granted');
assert.equal(game.canonicalBuild,canonical);assert.deepEqual(canonical.serialize(),buildBefore);
const levelBefore=game.player.level;
for(let i=0;i<605;i++)tick(game);
assert.equal(story.step,'fading');assert.equal(story.getBuff(),null);assert.equal(game.build,canonical);
assert.equal(game.levels,canonical.levels);assert.equal(game.superSkills.owned,canonical.superLevels);
assert.equal(game.player.speed,320);assert(game.player.level>levelBefore,'script kills grant ordinary XP and level attributes');
assert.equal(game.crystals,0);assert.equal(game.progressionTier,1,'no story upgrade cards, including no backlog');
assert.deepEqual(canonical.serialize(),buildBefore);
for(const point of story.paths.escape.slice(Math.floor(story.paths.escape.length*.42)))walk(game,point);
for(let i=0;i<800&&story.step!=='judgment';i++)tick(game);
assert.equal(story.step,'judgment');assert(story.angel);assert(story.guardReduction>0);
for(let i=0;i<200&&!story._judgmentStartedAt;i++)tick(game);
assert(story._judgmentStartedAt);assert.equal(story.step,'judgment');
const killsAfterStrike=game.kills,judgmentEvent=observedEvents.find(event=>event.type==='storyJudgment');
assert(judgmentEvent?.count>0,'the final pursuers receive a real rescue strike');assert.equal(judgmentEvent.damage,9999);
let boltFrames=0;
for(let i=0;i<60;i++) {
  tick(game);assert.equal(story.step,'judgment','the spectacle continues after enemies are dead');
  const bolts=game.effects.filter(effect=>effect.storyJudgment);
  if(bolts.length)boltFrames++;
  assert(bolts.every(effect=>effect.type==='angelStrike'&&effect.maxLife===.18),'individual bolts retain their original duration');
  assert.equal(game.kills,killsAfterStrike,'ongoing visual strikes cannot repeat kill credit');
}
assert(boltFrames>20,'multiple ordinary bolt animations run throughout the full cast');
for(let i=0;i<100&&story.step!=='conversation';i++)tick(game,{},false);
assert.equal(story.step,'conversation');assert.equal(story._living().length,0);
assert(game._clock-story._judgmentStartedAt>=4);

// Leave while the fixed angel has unspoken information. The objective must
// lead back to her, rather than follow the princess around an endless loop.
const target=story.getObjectiveTarget();assert.match(target.label,/返回守望天使/);assert.equal(target.x,story.angel.x);assert.equal(target.y,story.angel.y);
assert.equal(story.getAction(),null,'unread dialogue is never acknowledged by a timer');
for(const point of [...story.paths.escape].reverse().slice(0,5))walk(game,point,{read:false});
assert.equal(story.getObjectiveTarget().x,story.angel.x);assert.equal(story.getAction(),null);
for(const point of story.paths.escape.slice(-5))walk(game,point,{read:false});
acknowledged(story);tick(game);
for(let i=0;i<100&&!story.getAction();i++)tick(game);
assert.equal(story.getAction()?.id,'story:finish');assert(story.useAction('story:finish'));
assert(story.completed);assert(!story.active);assert.equal(story.step,'complete');assert.equal(story.actors.length,0);
assert.equal(story.completionTime,game.runTime);assert(!story.useAction('story:finish'));
assert(game.enemies.length>0,'distant original world encounters resume after the chapter');
assert.deepEqual(game.build.serialize(),buildBefore);assert.equal(game.progressionTier,1);assert.equal(game.crystals,0);
assert(!game.regions.rewardPortal);assert.equal(game.bossKills,0,'script cleanup never pays regional boss rewards');
const replay=new Game({mode:'story'});assert.equal(replay.story.step,'awakening');assert.equal(replay.player.level,1);assert(!replay.story.pillUsed);
game.dispose();replay.dispose();
console.log('Story: actual route movement, patrol discovery, princess escort, explained medicine action, real XP without cards, reversible preview, guarded rescue, sustained original bolts, return guidance, chapter completion and clean replay passed.');
