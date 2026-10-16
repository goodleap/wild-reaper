import assert from 'node:assert/strict';
import { PlayerDialogue,playerBlockedDialogue,playerCombatContext } from './dist/player-dialogue.js';
import { SceneDialogue } from './dist/scene-dialogue.js';

const fixture=(id='traveler')=>({mode:'world',hero:{id},status:'playing',mapId:'world:forest',terrain:{},player:{heroId:id,x:0,y:-19.8,hp:100,maxHp:100},enemies:[],companions:{members:[],camps:[]},settlements:{sites:[]},relicSites:{sites:[]},events:[]});
const enemy=(id,x=100,extra={})=>({id,x,y:0,hp:100,maxHp:100,r:15,guardActive:true,...extra});
const visible={isVisible:()=>true};
const tick=(dialogue,game,dt=0)=>{dialogue.present(dialogue.items(visible));dialogue.observe(game,dt,visible);};

// The doorway's existing hint range is the activation boundary. Re-entry has
// no greeting/repeat cooldown, but standing still never creates a speech loop.
const g=fixture(),d=new PlayerDialogue(),spoken=[];
let choice={id:'locked',type:'portal',enabled:false,description:'击败驻门首领 · 解锁双向通道'};
g.getInteraction=()=>choice;
const observe=(dt=0,exclusive=false)=>d.observe(g,dt,{exclusive,say:line=>{spoken.push(line);return true;}});
observe();assert.equal(spoken.length,1);assert.equal(spoken[0].channel,'hint');
observe(1);assert.equal(spoken.length,1);choice=null;observe();choice={id:'locked',type:'portal',enabled:false,description:'击败驻门首领 · 解锁双向通道'};observe();
assert.equal(spoken.length,2,'Immediately returning to the activation range can explain the same unmet condition.');
assert.equal(playerBlockedDialogue({...choice,description:'可自由往返'},g),null,'An open portal awaiting physical contact is not a locked entrance.');
choice=null;observe();choice={id:'door',type:'riftShortcut',enabled:false};observe(0,true);assert.equal(spoken.length,2);observe();assert.equal(spoken.length,3,'A doorway cue deferred by story dialogue remains eligible.');

// HP loss means an actual hurt; blocked hits cannot trigger speech. The class
// cooldown and global cooldown apply even when every hit is a new event.
for(const role of ['traveler','princess','elder']){
  const game=fixture(role),observer=new PlayerDialogue(),out=[];
  const sample=dt=>observer.observe(game,dt,{say:line=>{out.push(line);return true;}});
  sample(0);game.events=[{type:'hurt'}];sample(0);assert.equal(out.length,0);
  game.player.hp=90;sample(.1);assert.equal(out[0].key,`player:${role}:hurt`);
  game.player.hp=80;sample(6);assert.equal(out.length,1);
  game.player.hp=70;sample(6);assert.equal(out.length,2);
  assert.notEqual(out[0].text,out[1].text,'Successive reactions rotate rather than repeating.');
}

const battle=fixture(),contextual=new PlayerDialogue(),battleLines=[];
const sample=(dt=0)=>contextual.observe(battle,dt,{say:line=>{battleLines.push(line);return true;}});
battle.enemies=[enemy(1,100,{territoryState:'idle'}),enemy(2,800),enemy(3,100,{guardActive:false})];sample();
assert.equal(playerCombatContext(battle).enemies.length,0);assert.equal(battleLines.length,0);
battle.enemies.push(enemy(4),enemy(5),enemy(6),enemy(7));sample(.3);assert.match(battleLines[0].key,/surrounded/);
battle.companions.members=[{id:9,kind:'warden',isCompanion:true,state:'active',hp:100,x:0,y:-19.8,_combatTargetId:4},{id:10,kind:'golem',isCompanion:true,state:'recovering',hp:100,x:0,y:0},{id:11,kind:'dog',isCompanion:true,state:'active',hp:100,x:0,y:0}];
assert.equal(playerCombatContext(battle).allies.length,1);
battle.player.hp=20;sample(5);assert.match(battleLines.at(-1).key,/retreat/);
const count=battleLines.length;sample(21);assert.equal(battleLines.length,count,'Remaining at low HP cannot repeatedly replay retreat intent.');

const casting=fixture(),casts=new PlayerDialogue(),castLines=[];
const castSample=dt=>casts.observe(casting,dt,{say:line=>{castLines.push(line);return true;}});
castSample(0);casting.events=[{type:'superCast',skillId:'runeArrow'}];castSample(0);assert.equal(castLines.length,0);
casting.events=[{type:'skill'}];castSample(0);assert.match(castLines[0].key,/storm/);
castSample(20);assert.equal(castLines.length,1,'The same event object cannot be counted twice.');
casting.events=[{type:'superCast',skillId:'meteor'}];castSample(0);assert.match(castLines.at(-1).key,/meteor/);
casting.events=[{type:'superCast',skillId:'swords'}];castSample(5);assert.equal(castLines.length,2,'Big spells share a class cooldown.');
casting.events=[{type:'superCast',skillId:'swords'}];castSample(10);assert.match(castLines.at(-1).key,/swords/);

// Nonstory scenes retain the generic external queue and its legacy .story
// adapter. Safe presentation, ordering and acknowledgements still apply there;
// the actual story mode uses a fixed panel and never enters this bubble queue.
const plot=fixture(),presented=[],finished=[];
plot.story={actors:{princess:{id:'princess',heroId:'princess',x:100,y:-19.8}},dialogue:[{id:'wake',speaker:'player',text:'我重生了？'},{id:'meet',speaker:'princess',text:'跟上，先离开这里。'}],onDialoguePresented:id=>presented.push(id),onDialogueFinished:id=>finished.push(id)};
const scene=new SceneDialogue();scene.observe(plot,0,visible);assert.equal(scene.items(visible).length,1);assert.equal(scene.items(visible)[0].externalId,'wake');
for(let i=0;i<10;i++)scene.observe(plot,2,visible);
assert.deepEqual(presented,[]);assert.deepEqual(finished,[]);assert.equal(scene.items(visible)[0].remaining,3.6);
tick(scene,plot,2);assert.deepEqual(presented,['wake']);assert.deepEqual(finished,[]);
tick(scene,plot,1.6);assert.deepEqual(finished,['wake']);assert.equal(scene.items(visible)[0].externalId,'meet');
tick(scene,plot,3.6);assert.deepEqual(presented,['wake','meet']);assert.deepEqual(finished,['wake','meet']);
scene.observe(plot,1,visible);assert.equal(scene.items(visible).length,0,'Stable IDs make a retained plot array idempotent.');

const ordered=fixture(),orderedDialogue=new SceneDialogue();ordered.story={actors:[{id:'princess',heroId:'princess',x:100,y:-19.8,hidden:true}],dialogue:[{id:'first',speaker:'princess',text:'先听我说。'},{id:'second',speaker:'player',text:'我在听。'}]};
orderedDialogue.observe(ordered,0,visible);assert.equal(orderedDialogue.items(visible).length,0,'A later visible speaker cannot skip an earlier unseen story line.');
ordered.story.actors[0].hidden=false;orderedDialogue.observe(ordered,0,visible);assert.equal(orderedDialogue.items(visible)[0].externalId,'first');
orderedDialogue.observe(ordered,20,visible);assert.equal(orderedDialogue.items(visible)[0].externalId,'first','Unread story speech keeps its place indefinitely.');

const revised=fixture(),revisionDialogue=new SceneDialogue(),revisionFinished=[];
const lineA={id:'background',speaker:'player',text:'我记得那场祭仪。'},lineB={id:'old-warning',speaker:'player',text:'追兵来了！'},lineC={id:'pill-instruction',speaker:'player',text:'药效只能维持片刻。'};
revised.story={dialogue:[lineA,lineB,lineC],onDialogueFinished:id=>revisionFinished.push(id)};
revisionDialogue.observe(revised,0,visible);tick(revisionDialogue,revised,1);
revised.story.dialogue=[lineA,lineC];revisionDialogue.observe(revised,0,visible);
assert.equal(revisionDialogue.items(visible)[0].externalId,'background');
tick(revisionDialogue,revised,2.6);assert.equal(revisionDialogue.items(visible)[0].externalId,'pill-instruction','An explicitly removed obsolete warning cannot survive in the renderer cache.');
assert.deepEqual(revisionFinished,['background'],'Cancellation does not fake a reading acknowledgement.');

const cancel=fixture(),cancelDialogue=new SceneDialogue();cancel.story={dialogue:[{id:'cancel-current',speaker:'player',text:'先读完这一句。'}]};
cancelDialogue.observe(cancel,0,visible);tick(cancelDialogue,cancel,1);cancel.story.dialogue=[];
cancelDialogue.observe(cancel,0,visible);assert.equal(cancelDialogue.items(visible).length,1,'Explicit cancellation preserves a currently readable line until its minimum.');
tick(cancelDialogue,cancel,1);assert.equal(cancelDialogue.items(visible).length,0);

const reorder=fixture(),reorderDialogue=new SceneDialogue();reorder.story={dialogue:[lineA,lineB,lineC]};
reorderDialogue.observe(reorder,0,visible);reorder.story.dialogue=[lineA,lineC,lineB];tick(reorderDialogue,reorder,3.6);
assert.equal(reorderDialogue.items(visible)[0].externalId,'pill-instruction','The plot array can promote a new instruction ahead of unread cached lines.');
tick(reorderDialogue,reorder,3.6);assert.equal(reorderDialogue.items(visible)[0].externalId,'old-warning','Reordering retained lines does not discard them.');

// The module boundary suppresses all speech for the mode, independently of
// the app bypass, chapter activity, speaker visibility and elapsed game time.
const silent=fixture(),silentPlayer=new PlayerDialogue(),silentScene=new SceneDialogue(),silenceCalls=[];
silent.getInteraction=()=>({id:'silent-door',type:'riftShortcut',enabled:false});
silent.settlements.sites=[{id:'silent-angel',type:'angel',x:40,y:0,state:'ready',healing:true},{id:'silent-merchant',type:'merchant',x:100,y:0,state:'ready'}];
silent.enemies=[enemy('silent-boss',70,{type:'boss',bossKind:'ancient'})];
silentScene.observe(silent,0,visible);assert(silentScene.items(visible).length,'the same ordinary scene still has eligible speech');
silent.mode='story';
silent.story={active:true,dialogue:[{id:'panel-only',speaker:'player',text:'这句只应在固定面板显示。'}],onDialoguePresented:()=>silenceCalls.push('presented'),onDialogueFinished:()=>silenceCalls.push('finished')};
for(const active of [true,false]){
  silent.story.active=active;
  for(let i=0;i<4;i++){
    silent.player.hp-=5;silent.events=[{type:'hurt'},{type:'skill'},{type:'superCast',skillId:'meteor'}];
    silentPlayer.observe(silent,70,{say:line=>{silenceCalls.push(line);return true;}});
    silentScene.observe(silent,70,visible);silentScene.present(silentScene.items(visible));
    assert.deepEqual(silentScene.items(visible),[],'story mode cannot emit NPC, monster, hero or external bubbles');
  }
}
assert.deepEqual(silenceCalls,[],'disabled speech cannot call panel reading/completion hooks');
assert.equal(silentPlayer.clock,0,'disabled speech does not accumulate idle/cooldown observation time');
silentScene.enqueue({id:'late-external',speaker:'player',text:'也不能作为旧气泡排队。'});silentScene.observe(silent,0,visible);assert.deepEqual(silentScene.items(visible),[]);
// Returning this observer to an ordinary scene is still supported.
silent.mode='world';delete silent.story;silentScene.observe(silent,0,visible);assert(silentScene.items(visible).length);

const immutable=fixture(),before=JSON.stringify(immutable),readOnly=new PlayerDialogue();
const random=Math.random;Math.random=()=>{throw new Error('Dialogue consumed combat RNG');};
try{readOnly.observe(immutable,60,{say:()=>true});}finally{Math.random=random;}
assert.equal(JSON.stringify(immutable),before);
const gated=fixture(),gatedLines=[];gated.story={active:true};gated.getInteraction=()=>null;gated.regions={getInteraction:()=>choice};
new PlayerDialogue().observe(gated,0,{say:line=>{gatedLines.push(line);return true;}});assert.equal(gatedLines.length,0,'Story-disabled world entrances cannot leak hints through subsystem queries.');
const bounded=fixture();let rays=0;bounded.enemies=[enemy(1)];bounded.terrain.firstBlocker=()=>{rays++;return null;};
const cached=new PlayerDialogue();for(let i=0;i<60;i++)cached.observe(bounded,1/60,{say:()=>true});assert(rays<=5,'Combat-context sight rays use a quarter-second snapshot rather than running every frame.');
console.log('Player/external dialogue and story-mode silence QA passed: actual HP/combat/skill context, hero voices, doorway re-entry, cooldowns, plot exclusivity and actual-presentation acknowledgements, deterministic read-only observation.');
