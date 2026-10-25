import assert from 'node:assert/strict';
import { getConfigSnapshot, loadContentConfig, getConfigLoadStatus } from './dist/content-config.js';
import { validateStory } from './dist/config-validation/story.js';

const pack=structuredClone(getConfigSnapshot()),sections=pack.sections;
const chapter=data=>data.story.definitions.find(entry=>entry.id==='false-orders');
assert.equal(validateStory(sections),true);
function reject(change,pattern){
  const value=structuredClone(sections);change(chapter(value),value);
  assert.throws(()=>validateStory(value),pattern);
}
reject(c=>c.anchors.campArea='missing',/anchors.campArea/);
reject(c=>c.anchors.exitArea=c.anchors.contactArea,/reinforcementPassage/);
reject(c=>c.requiredChapterId='missing',/chapter/);
reject(c=>c.steps.splice(4,1),/steps/);
reject(c=>c.startingBuild.sword=99,/startingBuild.sword/);
reject(c=>c.startingBuild.health=2,/startingBuild/);
reject(c=>c.dialogue.meeting[0].speaker='missing',/dialogue.meeting/);
reject(c=>c.sceneLines.healed.text='<script>',/sceneLines.healed/);
reject(c=>delete c.sceneLines.recordsTaken,/sceneLines/);
reject(c=>c.encounters.troops.royalguard.hp=-1,/royalguard.hp/);
reject(c=>c.encounters.bosses.searchcaptain.speed=641,/searchcaptain.speed/);
reject(c=>c.encounters.reinforcement.waves=100,/reinforcement.waves/);
reject(c=>c.encounters.support.interval=0,/support.interval/);
reject((c,s)=>delete s.enemies.bosses.searchcaptain,/Invalid story/);
reject((c,s)=>s.story.definitions[0].anchors.entryPassage='missing',/anchors.entryPassage/);

// Load before importing the game: fetched values must drive actual chapter
// actors and combat rather than an independent hard-coded chapter catalogue.
const remote=chapter(sections);
remote.encounters.troops.royalguard.hp=313;
remote.encounters.troops.royalguard.damage=17;
remote.sceneLines.healed.text='配置中的补给对白';
pack.contentVersion='qa-story-remote';
await loadContentConfig({url:'https://config.invalid/story',fetchImpl:async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(pack)})});
assert.equal(getConfigLoadStatus().source,'remote');
const [{Game},{getStoryChapter}]=await Promise.all([import('./dist/engine.js'),import('./dist/story-chapters.js')]);
assert(Object.isFrozen(getStoryChapter('false-orders').encounters.troops));
const game=new Game({mode:'story',storyId:'false-orders'});
while(game.story.dialogueBlocking)game.story.advanceDialogue();
const guard=game.enemies.find(enemy=>enemy.type==='royalguard');
assert(guard);assert.equal(guard.hp,313);assert.equal(guard.damage,17);
game.story._sayLine('healed');
assert(game.story.getSceneDialogue().some(line=>line.text==='配置中的补给对白'));
game.dispose();
console.log('Story configuration QA passed: chapter references, bounded combat values, dialogue validation and fetched runtime configuration.');
