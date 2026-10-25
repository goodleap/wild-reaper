import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { NavigationRoute } from './dist/navigation-route.js';
import { STORY_CHAPTERS, getStoryChapter } from './dist/story-chapters.js';
import { drawStoryChapterProp } from './dist/story-chapter-art.js';

let seed=8831;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const foot=a=>({x:a.x,y:a.y+groundOffset(a,!!a.heroId)});
const read=s=>{for(let i=0;s.dialogueBlocking&&s.step!=='departure'&&i<30;i++)assert(s.advanceDialogue());};
assert.equal(getStoryChapter('missing'),null);
assert.deepEqual(STORY_CHAPTERS.map(chapter=>chapter.id),['prologue','false-orders']);
const game=new Game({mode:'story',storyId:'false-orders'}),story=game.story;
assert.equal(story.step,'meeting');assert.equal(game.mode,'story');assert(!game.worldSave);
assert(!game.sceneContent.allows('worldContent'));
assert.equal(game.build.getRank('sword'),story.definition.startingBuild.sword);
assert(!game.canUseSkill('storm'));assert(!story.useAction('story:take-records'));
assert(!game.enemies.includes(story.officer),'the transport officer is a fleeing actor, not a kill objective');
assert(story.getProps().some(p=>p.storyProp==='records'));assert(game.terrain._structureOwners.has(story.id));
const actions=[],steps=new Set(),bosses=new Set(),dialogueCounts=new Map();let damageTaken=0,oldHp=game.player.hp;
// This fixture uses normal movement input, the real route, collision, attack
// telegraphs and ordinary damage. It does not claim first-time human usability.
function inputAlongGuide(g,guide){
  const p=foot(g.player),target=guide.waypoint;let input={};
  if(target){const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),amount=Math.min(1,d/(g.player.speed*.05));if(d>1)input={x:dx/d*amount,y:dy/d*amount};}
  const danger=g.enemies.filter(e=>e.hp>0&&e._chapterAwake).map(e=>e.type==='boss'?e.specialAttack:e.specialist)
    .filter(a=>a?.phase==='windup'&&Math.hypot(a.x-p.x,a.y-p.y)<(a.reach||200)+60);
  if(!danger.length)return input;
  let best=-Infinity;
  for(let dir=0;dir<16;dir++){
    const angle=dir*Math.PI/8,x=Math.cos(angle),y=Math.sin(angle),q={x:p.x+x*110,y:p.y+y*110};
    if(!g.terrain.isFree(q.x,q.y,g.player.r+3)||g.terrain.firstBlocker(p.x,p.y,q.x,q.y,g.player.r,'ground'))continue;
    let score=0;
    for(const a of danger){const dx=q.x-a.x,dy=q.y-a.y,d=Math.hypot(dx,dy),diff=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-a.angle),Math.cos(Math.atan2(dy,dx)-a.angle)));score+=d>a.reach+25?150:diff>(a.arc||.2)+.3?100:-200/(a.life+.1);}
    score-=target?Math.hypot(q.x-target.x,q.y-target.y)*.02:0;
    if(score>best){best=score;input={x,y};}
  }
  return input;
}
for(let frame=0;frame<5000&&story.step!=='departure';frame++){
  if(story.dialogueBlocking){dialogueCounts.set(story.step,story.dialogue.length);read(story);}
  steps.add(story.step);
  for(const enemy of game.enemies)if(enemy.type==='boss')bosses.add(enemy.bossKind);
  const action=story.getAction();
  if(action?.enabled){actions.push(action.id);assert(story.useAction(action.id));continue;}
  const guide=story.getGuide();assert(guide?.complete,`complete walkable guide in ${story.step}`);
  game.update(.05,inputAlongGuide(game,guide));game.events=[];
  damageTaken+=Math.max(0,oldHp-game.player.hp);oldHp=game.player.hp;
  assert.equal(game.status,'playing',`normal combat remains survivable in ${story.step}`);
}
assert.equal(story.step,'departure','real combat, evidence collection and escort reach the north road');
assert(damageTaken>0,'the chapter encounters exercise real hostile damage');
assert(game.kills>=20);assert.deepEqual([...bosses].sort(),['escortmarshal','searchcaptain']);
assert.deepEqual([...story.evidence].sort(),['ledger','records']);assert(story.rescued);assert(story.officerEscaped);
assert.equal(story.workers.length,2);assert(story.workers.every(worker=>Math.hypot(worker.x-story.anchors.rally.x,foot(worker).y-story.anchors.rally.y)<165));
assert(story.officer.hidden);assert(!game.enemies.includes(story.officer));
for(const id of ['read-notice','ask-villager','scout','enter-camp','take-records','take-ledger','free-workers','compare-evidence','inspect-tracks'])assert(actions.includes(`story:${id}`),`actual ${id} interaction`);
assert(story._waves>0,'leaving the transmission rig intact admits reinforcements');
assert(dialogueCounts.has('debrief'));
assert(game.runTime>35,'the chapter requires traversal and combat in addition to reading');
assert(story.advanceDialogue(true));assert(story.getDialogue().departure);assert(!story.advanceDialogue(true));
assert(!story.completed);assert.equal(game.status,'playing','skipping the final invitation does not complete a chapter');
assert(story.advanceDialogue());assert(game.sceneTransition.active);
for(let i=0;i<20;i++)game.update(.05,{});
assert(story.completed);assert.equal(game.status,'victory');
assert.equal(game.events.filter(e=>e.type==='storyCompleted').length,1);
assert.equal(story.actors.length,0);assert.equal(story.getProps().length,0);assert(!game.enemies.some(e=>e.storyId===story.id));
assert(!game.terrain._structureOwners.has(story.id));assert(game.sceneContent.isolated);

// A separate route fixture isolates tactical choice and rescue prerequisites.
const other=new Game({mode:'story',storyId:'false-orders'}),s=other.story;
read(s);s.flow.go('scout');
function place(point){other.player.x=point.x;other.player.y=point.y-groundOffset(other.player,true);}
function clearGroup(){for(const e of other.enemies)e.hp=0;other._rebuildGrid();}
clearGroup();place(s.anchors.scout);assert.equal(s.getAction().id,'story:scout');s.useAction('story:scout');read(s);
assert.equal(s.step,'infiltrate');
const optionalRoute=new NavigationRoute(other.terrain).update(foot(other.player),s.anchors.signal,{radius:other.player.r+4,bodyRadius:other.player.r,time:0});
assert(optionalRoute.complete,'the optional transmission rig has a real walkable approach');
place(s.anchors.signal);assert(s.useAction('story:cut-signal'));assert(s.signalDisabled);
place(s._approach(s.anchors.records));assert(s.useAction('story:enter-camp'));
const officerStart=foot(s.officer);other.player.invuln=100;
for(let i=0;i<300;i++)other.update(.05,{});
assert.equal(s._waves,0,'cutting the signal changes the actual reinforcement roster');
assert(Math.hypot(s.officer.x-officerStart.x,foot(s.officer).y-officerStart.y)>400,'the officer uses real movement to escape');
assert(s.officerEscaped);assert.equal(s.step,'rescue','killing guards or elapsed time alone cannot finish collection and rescue');
clearGroup();place(s._approach(s.anchors.records));assert(s.useAction('story:take-records'));
assert.equal(s.evidence.size,1);assert(!s.useAction('story:take-records'));
place(s._approach(s.anchors.ledger));assert(s.useAction('story:take-ledger'));assert.equal(s.step,'rescue');
place(foot(s.worker));assert(s.useAction('story:free-workers'));s.update(.05);assert.equal(s.step,'withdraw');
place(s.anchors.rally);s.update(.05);assert(!s.rescued,'moving the hero alone cannot complete escort');
assert(!s.useAction('story:compare-evidence'));
const supply=s.props.find(p=>p.storyProp==='supplies');place(s._approach(supply));other.player.hp=30;
assert(s.useAction(`story:supply:${supply.id}`));assert(other.player.hp>30);assert(!s.useAction(`story:supply:${supply.id}`));
s.cleanup('retry');assert(s.disposed);assert.equal(s.props.length,0);assert.equal(s.actors.length,0);assert(!other.terrain._structureOwners.has(s.id));
assert(!other.enemies.some(e=>e.storyId===s.id));
const retry=new Game({mode:'story',storyId:'false-orders'});assert.equal(retry.story.step,'meeting');assert.equal(retry.story.evidence.size,0);assert(!retry.story.signalDisabled);assert(!retry.story.worker.following);assert(!retry.story.officerEscaped);retry.dispose();

// Every chapter prop executes the shared depth renderer without a bitmap.
const calls=[],ctx=new Proxy({},{get(_,name){return (...args)=>{assert(args.filter(x=>typeof x==='number').every(Number.isFinite),`${String(name)} coordinates are finite`);calls.push(name);};},set(){return true;}});
for(const storyProp of ['notice','records','ledger','signal','supplies','grain','tent'])for(const state of ['ready','taken','used','disabled'])assert(drawStoryChapterProp(ctx,{type:'storyProp',storyProp,x:0,y:0,state}));
assert(calls.includes('fill'));assert.equal(drawStoryChapterProp(ctx,{type:'other'}),false);
console.log(`P01 chapter QA passed: ${game.kills} real defeats, ${game.runTime.toFixed(1)}s movement/combat, ${damageTaken.toFixed(1)} damage; evidence, escort, tactical route, explicit completion and retry cleanup.`);
