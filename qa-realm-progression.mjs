import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, xpCost } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { validateRealms } from './dist/config-validation/realms.js';

const config=JSON.parse(readFileSync(new URL('./dist/config/realms.json',import.meta.url),'utf8'));
validateRealms({realms:config});
for(const mutate of [c=>c.definitions[1].minLevel=5,c=>c.definitions[3].maxLevel=40,c=>c.definitions[1].id=c.definitions[0].id,c=>c.trial.warning=10,c=>c.trial.boltRadius=200,c=>c.trial.boltSpreadRadius=0,c=>c.materials.damageReductionEach=1,c=>c.materials.starter=0,c=>c.enabledModes=['world','story'],c=>c.enabledModes=['world','dungeon']]) {
  const invalid=structuredClone(config);mutate(invalid);assert.throws(()=>validateRealms({realms:invalid}),/Invalid realm configuration/);
}

function arena(mode='world',options={}) {
  const g=new Game({mode,terrain:new Terrain({obstacles:[]}),adventure:true,environment:false,encounters:false,settlements:false,companions:false,elites:false,...options});
  assert(g.realms,'Game integrates RealmProgression');
  g.enemies=[];g.settlements.sites=[];g.regionGrace=0;g.regionTransition=null;g.nextBossAt=Infinity;
  g._spawn=Infinity;g._shot=Infinity;g._updatePressure=()=>{};g.events=[];g.effects=[];
  return g;
}
const totalXp=(first,last)=>Array.from({length:last-first+1},(_,i)=>xpCost(first+i)).reduce((a,b)=>a+b,0);
function ready(g=arena()) {g.addExperience(totalXp(1,5)+100000);assert.equal(g.player.level,5);assert.equal(g.player.xp,g.player.xpNext);return g;}
function tick(g,seconds,move=null) {
  for(let i=0;i<Math.ceil(seconds/.05);i++) {
    move?.(g,i);g.player.hurtFlash=Math.max(0,g.player.hurtFlash-.05);g.realms.update(.05);
  }
}

const cap=ready();
assert.equal(cap.realms.label,'练气');assert.equal(cap.realms.getState().nextRealmName,'筑基');
assert.equal(cap.player.maxHp,119,'XP levels retain ordinary health growth and the prince health modifier');assert.equal(cap.skillLevel,1);
assert.equal(cap.realms.talismans,3,'first full bottleneck supplies one useful set of materials');
assert.equal(cap.realms.getState().xpRemaining,0);assert.equal(cap.realms.getState().breakthroughLevel,6);
assert.equal(cap.realms.getState().recommendedMaterials,3);assert.equal(cap.realms.getAction().selectedMaterials,3);assert.equal(cap.realms.getAction().recommendedMaterials,3);
for(let i=0;i<5;i++)cap.addExperience(50000);
assert.equal(cap.player.level,5);assert.equal(cap.player.xp,cap.player.xpNext);assert.equal(cap.realms.talismans,3,'capped XP neither leaks nor repeatedly grants supplies');
cap.addCrystals(cap.crystalsNext);assert(cap.progression.tryUpgrade(),'world skill cards remain independent from realm XP');
assert.equal(cap.status,'upgrade');cap.status='playing';cap.crystals=0;

const approaching=arena();
assert.equal(approaching.realms.getState().xpRemaining,totalXp(1,5),'remaining XP includes normal levels and the first full level-five pool');
approaching.addExperience(totalXp(1,4));assert.equal(approaching.player.level,5);assert.equal(approaching.player.xp,0);
assert.equal(approaching.realms.getState().xpRemaining,xpCost(5));assert.equal(approaching.realms.talismans,0);assert.equal(approaching.realms.getAction(),null);
approaching.addExperience(xpCost(5)-1);assert.equal(approaching.realms.getState().xpRemaining,1);assert.equal(approaching.realms.getAction(),null);
approaching.addExperience(1);assert.equal(approaching.realms.getState().xpRemaining,0);assert(approaching.realms.getAction().enabled);assert.equal(approaching.realms.talismans,3);
assert.equal(approaching.crystalsNext,xpCost(1));assert.equal(approaching.skillLevel,1,'earlier realm timing does not accelerate skill growth');
for(const mode of ['dungeon','story'])for(const debug of [false,true]) {
  const disabled=arena(mode,{debug,...(mode==='story'?{terrain:null}:{})});disabled.addExperience(totalXp(1,31));
  assert.equal(disabled.player.level,32,`${mode} preserves unrestricted original XP growth with debug=${debug}`);assert.equal(disabled.realms.enabled,false);assert.equal(disabled.realms.getAction(),null);
  const state=disabled.realms.getState();assert.equal(state.realmId,null);assert.equal(state.realmName,'');assert.equal(state.nextRealmName,null);assert.equal(state.cap,null);assert.equal(state.xpRemaining,null);
  assert.equal(disabled.realms.addTalismans(3),0);assert.equal(disabled.realms.start(0),false);assert.equal(disabled.realms.talismans,0);assert.deepEqual(disabled.realms.getMarkers(),[]);
  disabled.dispose('qa');
}
const debugWorld=ready(arena('world',{debug:true}));assert.equal(debugWorld.realms.enabled,true,'world debug still exercises the real bottleneck');
const mathematical=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false,companions:false});
mathematical.addExperience(totalXp(1,10));assert.equal(mathematical.player.level,11,'legacy timed/isolated combat fixtures retain their original uncapped math');

const invalid=ready();
for(const amount of [-1,4,1.5,NaN,Infinity])assert.equal(invalid.realms.start(amount),false);
assert.equal(invalid.realms.talismans,3);assert.equal(arena().realms.start(0),false,'trial requires a full bottleneck');
invalid.story={active:true};assert.match(invalid.realms.getAction().reason,/序章/);assert.equal(invalid.realms.start(0),false);invalid.story=null;
invalid.dungeon.active={id:'cave'};assert.match(invalid.realms.getAction().reason,/室外/);invalid.dungeon.active=null;
invalid.sceneTransition.active={};assert.match(invalid.realms.getAction().reason,/场景/);invalid.sceneTransition.active=null;
invalid.status='upgrade';assert.equal(invalid.realms.getAction().enabled,false);assert.equal(invalid.realms.start(0),false);
invalid.status='paused';assert.equal(invalid.realms.getAction().enabled,true);assert.equal(invalid.realms.start(0),false,'paused panel previews an action but cannot commit the trial');invalid.status='playing';
invalid.enemies=[{id:1,hp:10,x:30,y:0,type:'slime',r:10,guardActive:true},{id:2,hp:100,x:5000,y:5000,type:'boss',guardActive:true}];invalid.player.hurtFlash=.4;
invalid.encounters={activities:[{type:'treasure',x:0,y:0,r:100}]};invalid.companions.camps=[{state:'trapped',x:0,y:0,engageRadius:300}];
invalid.settlements.sites=[{type:'angel',x:0,y:groundOffset(invalid.player,true),guardRadius:300}];
invalid.terrain.isFree=()=>false;invalid.terrain.isDry=()=>false;invalid.environment={isHazardFree:()=>false,watersInBounds:()=>[{kind:'water'}]};
assert(invalid.realms.getAction().enabled,'nearby enemies, distant bosses, active encounters, angels and narrow terrain do not prohibit a manual trial');
assert(invalid.realms.start(3),'a recently injured player can manually begin in combat');tick(invalid,.1);assert(invalid.realms.active,'guardian areas do not cancel a moving trial');

const death=ready();death.realms.talismans=0;death.player.invuln=999;death.player.defense=99999;
death.realms._random=()=>0;
death.barrier.absorbDamage=()=>0;death.abilities.absorbDamage=()=>0;
assert(death.realms.start(0),'materials assist rather than prohibit attempts without them');tick(death,9.1);
assert.equal(death.status,'dead','three unavoided unassisted strikes are lethal despite ordinary immunity and barriers');
assert.equal(death.realms.active,null);assert.equal(death.player.level,5);assert.equal(death.realms.lastResult.reason,'death');assert.equal(death.player.xp,death.player.xpNext);

const success=ready();const health=success.player.hp,maxHealth=success.player.maxHp;
success.realms._random=()=>0;
assert(success.realms.start(3));const trialId=success.realms.active.id;
assert.equal(success.realms.talismans,0,'selected materials commit at start');assert.equal(success.realms.start(0),false,'double click cannot start a second trial');
tick(success,2.1);assert(success.realms.getMarkers().some(m=>m.kind==='tribulationWarning'),'one second telegraph precedes the strike');
const mark=success.realms.active.pending;success.player.x=mark.x+100;tick(success,.95);
assert(Math.abs(success.player.hp-(health-maxHealth*.1*.55))<1e-8,'walking outside marked landing avoids direct damage but not trial pressure');
tick(success,6.1);assert.equal(success.realms.active,null);assert.equal(success.realms.label,'筑基');assert.equal(success.player.level,6);assert.equal(success.player.xp,0);
assert.equal(success.player.maxHp,121,'breakthrough uses normal level stats exactly once');assert.equal(success.realms.lastResult.success,true);
assert.equal(success.realms._settle(true,'duplicate',trialId),false);tick(success,1);assert.equal(success.player.level,6,'duplicate completion cannot grant another level');
assert.equal(success.realms.getState().xpRemaining,totalXp(6,20));
success.addExperience(1e9);assert.equal(success.player.level,20);assert.equal(success.player.xp,success.player.xpNext);assert.equal(success.realms.talismans,0,'later bottlenecks do not duplicate starter materials');
for(const [nextLevel,nextName,duration] of [[21,'金丹',12],[31,'元婴',15]]) {
  success.player.hp=success.player.maxHp;tick(success,3.6);success.realms.addTalismans(3);assert(success.realms.start(3),success.realms.getAction()?.reason);
  tick(success,duration+.1,g=>{const pending=g.realms.active?.pending;if(pending&&Math.hypot(g.player.x-pending.x,g.player.y+groundOffset(g.player,true)-pending.y)<pending.r+g.player.r+5)g.player.x+=150;});
  assert.equal(success.player.level,nextLevel);assert.equal(success.realms.label,nextName);
  if(nextLevel===21)success.addExperience(1e9);
}
assert.equal(success.realms.cap,null);assert.equal(success.realms.getState().xpRemaining,null);success.addExperience(xpCost(31)+xpCost(32));assert.equal(success.player.level,33,'terminal realm opens ordinary subsequent XP growth');

const roaming=ready();roaming.realms._random=()=>.5;assert(roaming.realms.start(3));
assert.deepEqual(roaming.realms.getMarkers(),[],'a trial has no fixed boundary marker');assert.equal('center' in roaming.realms.getState().trial,false);
tick(roaming,2.05);const firstLanding={...roaming.realms.active.pending};
assert(Math.hypot(firstLanding.x-roaming.player.x,firstLanding.y-roaming.player.y-groundOffset(roaming.player,true))<=config.trial.boltSpreadRadius);
assert(firstLanding.x!==roaming.player.x||firstLanding.y!==roaming.player.y+groundOffset(roaming.player,true),'random landing can fall beside the player');
roaming.player.x=3000;roaming.player.y=1200;tick(roaming,.1);
assert.equal(roaming.realms.active.pending.x,firstLanding.x);assert.equal(roaming.realms.active.pending.y,firstLanding.y,'a shown warning never teleports after the player');
tick(roaming,2.95);const secondLanding=roaming.realms.active.pending;assert(secondLanding);
assert(Math.hypot(secondLanding.x-roaming.player.x,secondLanding.y-roaming.player.y-groundOffset(roaming.player,true))<=config.trial.boltSpreadRadius,'the next warning follows the current position, regardless of starting distance');
assert(Math.hypot(secondLanding.x-firstLanding.x,secondLanding.y-firstLanding.y)>2000);
tick(roaming,4.1,g=>{g.player.x+=12;});assert.equal(roaming.realms.lastResult.success,true,'continuous movement and travelling far from the start still complete the trial');assert.equal(roaming.player.level,6);

const failed=ready();failed.realms._random=()=>0;failed.addCrystals(7);failed.addGold(13);failed.realms.start(2);const xp=failed.player.xp,skillLevel=failed.skillLevel;
tick(failed,3.1);const failedHp=failed.player.hp;assert(failedHp<failed.player.maxHp);failed.realms.cancel('scene-change');
assert.equal(failed.realms.lastResult.reason,'scene-change');assert.equal(failed.realms.talismans,1);assert.equal(failed.player.level,5);assert.equal(failed.player.xp,xp);
assert.equal(failed.crystals,7);assert.equal(failed.gold,13);assert.equal(failed.skillLevel,skillLevel);assert.equal(failed.player.hp,failedHp,'failure preserves growth, remaining supplies and the actual injuries');
assert.equal(failed.realms.start(1),false);tick(failed,30.1);assert(failed.realms.start(1),'failed trial becomes available after real retry cooldown');

const exit=ready();exit.realms.start(2);tick(exit,3.1);const injured=exit.player.hp;
exit.realms.dispose('exit');assert.equal(exit.realms.active,null);assert.equal(exit.realms.lastResult.reason,'exit');assert.equal(exit.realms.talismans,1);
tick(exit,20);assert.equal(exit.player.level,5);assert.equal(exit.player.hp,injured,'quit does not rewind injury or finish a pending trial');assert.equal(exit.realms.getAction()?.enabled,false);
const transition=ready();transition.realms.start(0);transition.terrain=new Terrain({obstacles:[]});tick(transition,.05);assert.equal(transition.realms.lastResult.reason,'scene-change');

const drops=arena(),elite={id:100,hp:0,affix:{id:'swift'},type:'slime'},boss={id:101,hp:0,type:'boss'};
assert(drops.realms.onEnemyDefeated(elite));assert.equal(drops.realms.talismans,1);assert.equal(drops.realms.onEnemyDefeated(elite),false);
assert.equal(drops.realms.onEnemyDefeated({...elite}),false,'duplicate defeat identity is idempotent even when event objects are copied');
assert(drops.realms.onEnemyDefeated(boss));assert.equal(drops.realms.talismans,3);
for(const e of [{id:102,hp:1,type:'boss'},{id:103,hp:0,type:'boss',summoned:true},{id:104,hp:0,type:'boss',storyEnemy:true},{id:105,hp:0,type:'boss',trainingDummy:true}])assert.equal(drops.realms.onEnemyDefeated(e),false);
assert.equal(drops.realms.talismans,3,'summons, story clear and repeated lethal notifications cannot farm materials');
const actual=arena(),victim=actual._spawnEnemy('slime');actual.elites.promote(victim,'swift');victim.hp=1;actual._hurtEnemy(victim,9999);assert.equal(actual.realms.talismans,1,'real combat defeat hook awards elite materials');actual._hurtEnemy(victim,9999);assert.equal(actual.realms.talismans,1);

for(const debug of [false,true]) {
  const authored=ready(new Game({mode:'world',debug}));authored.regionGrace=0;
  assert(authored.realms.getAction()?.enabled,'the authored starting position supports a trial without searching for a special site');
  assert(authored.realms.start(3),'real generated world geometry supports starting a trial without modifying terrain');authored.dispose('qa');
}

console.log('Realm progression: world-only level-five bottleneck, remaining XP, normal story/challenge growth, combat starts, roaming random warnings, health/material preservation and one-time breakthroughs passed.');
