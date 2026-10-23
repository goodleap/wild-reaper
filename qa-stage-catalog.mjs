import assert from 'node:assert/strict';
import { STAGES, getStageDefinition } from './dist/stage-definitions.js';
import { defineStage } from './dist/stages/define-stage.js';
import { StageRun } from './dist/stage-run.js';
import { WORLD_IDS, regionFor } from './dist/world-definitions.js';
import { initBoss, bossKindFor } from './dist/bosses.js';

const releasedStageIds=['forest','marsh','ruins','beach','city','mountain','snow','volcano'].map(id=>`${id}-trial`);
const releasedStageThemes=['forest','marsh','ruins','beach','clockshadow-city','mountain','snow','ember-realm-large'];
assert.deepEqual(STAGES.map(stage=>stage.themeId),releasedStageThemes,'all eight trials use current world themes');
assert.deepEqual(STAGES.map(stage=>stage.id),releasedStageIds,'retiring world maps does not rename the released trials');
assert(WORLD_IDS.includes('verdant-rift'),'the independent exploration world remains registered');
assert.equal(getStageDefinition('verdant-rift-trial'),null,'an exploration world does not implicitly create an unauthored stage');
assert.equal(getStageDefinition('removed-stage'),null);
const allIds=[];
for(const stage of STAGES){
  assert.equal(getStageDefinition(stage.id),stage);
  assert.equal(stage.themeId,WORLD_IDS[stage.themeIndex]);
  assert.equal(stage.color,regionFor(stage.themeIndex).colors.accent);
  assert.equal(stage.dangerFactor,regionFor(stage.themeIndex).danger);
  assert(stage.name&&stage.shortName&&stage.summary&&stage.difficultyLabel);
  assert(Object.isFrozen(stage)&&Object.isFrozen(stage.coreReward));
  assert.equal(stage.islands.length,2);
  const [outer,core]=stage.islands;
  const scenePrefix=stage.id.slice(0,-6);
  assert.equal(outer.id,`${scenePrefix}-outer`);assert.equal(core.id,`${scenePrefix}-heart`,'trial scene identities remain independent of their current world theme');
  assert.equal(stage.startMapId,outer.id);assert.equal(stage.coreMapId,core.id);
  assert.equal(outer.role,'outer');assert.equal(outer.boss.role,'optional');
  assert.equal(core.role,'boss');assert.equal(core.boss.role,'core');
  assert(core.boss.hp>outer.boss.hp&&core.boss.xp>outer.boss.xp);
  assert(stage.coreReward.gold>0&&stage.coreReward.crystals>0,'core reward is additional to the shared boss reward');
  assert.equal(outer.connections[0].targetMapId,core.id);
  assert.equal(core.connections[0].targetMapId,outer.id);
  assert.equal(outer.connections[0].id,core.connections[0].id);
  const runtime=fixture(stage.id).run;
  assert.equal(runtime.id,stage.id);assert.equal(runtime.currentMapId,outer.id);assert.equal(runtime.currentIsland,outer);
  assert.equal(runtime.island(core.id),core);assert.equal(runtime.completed,false);assert.equal(runtime.coreDefeated,false);
  assert.deepEqual([...runtime.objectives.keys()],stage.islands.map(map=>map.id));
  assert([...runtime.objectives.values()].every(objective=>!objective.defeated&&!objective.rewardClaimed),'each released stage starts with its own fresh playable objectives');
  for(const map of stage.islands){
    allIds.push(map.id);assert.equal(map.themeIndex,stage.themeIndex);assert.equal(map.themeId,stage.themeId);
    assert(Object.isFrozen(map)&&Object.isFrozen(map.boss)&&Object.isFrozen(map.connections));
    const enemy=initBoss({type:'boss',bossIndex:map.boss.index},map.boss.kind);
    assert.equal(enemy.bossKind,map.boss.kind,'authored behavior overrides index rotation');
    if(map.boss.kind==='bloom')assert.equal(enemy.bloomNext,'fan','the selected behavior is initialized');
  }
}
assert.equal(new Set(allIds).size,allIds.length,'theme-sharing islands never share snapshot identities');
for(let index=1;index<=8;index++)assert.equal(initBoss({type:'boss',bossIndex:index}).bossKind,bossKindFor(index),'free exploration keeps the existing rotation');
assert.throws(()=>initBoss({type:'boss',bossIndex:1},'missing'),/Unknown boss kind/);

const forest=getStageDefinition('forest-trial');
assert.equal(forest.startMapId,'forest-outer');assert.equal(forest.coreMapId,'forest-heart');
assert.deepEqual(forest.islands.map(map=>({id:map.id,seed:map.seed,hp:map.boss.hp,easyHp:map.boss.easyHp,damage:map.boss.damage,speed:map.boss.speed,xp:map.boss.xp})),[
  {id:'forest-outer',seed:0,hp:2300,easyHp:1700,damage:22,speed:1,xp:180},
  {id:'forest-heart',seed:913,hp:5200,easyHp:3800,damage:30,speed:1.08,xp:300}
],'the already released forest encounter remains compatible');
assert.deepEqual(forest.coreReward,{gold:30,crystals:45});
const stronger=[...STAGES].sort((a,b)=>a.dangerFactor-b.dangerFactor);
for(let index=1;index<stronger.length;index++){
  const a=stronger[index-1],b=stronger[index];
  assert(b.islands[1].boss.hp>=a.islands[1].boss.hp);
  assert(b.coreReward.gold>=a.coreReward.gold&&b.coreReward.crystals>=a.coreReward.crystals);
}

const recipe={...forest,outer:{...forest.islands[0]},core:{...forest.islands[1]}};
assert.throws(()=>defineStage({...recipe,themeId:'unknown'}),/Unknown stage theme/);
assert.throws(()=>defineStage({...recipe,coreReward:{gold:1.5,crystals:10}}),/Invalid stage reward/);
assert.throws(()=>defineStage({...recipe,outer:{...recipe.outer,boss:{...recipe.outer.boss,kind:'unknown'}}}),/Unknown boss kind/);
const secondForest=defineStage({...recipe,id:'forest-expedition',outer:{...recipe.outer,id:undefined},core:{...recipe.core,id:undefined}});
assert.notEqual(secondForest.startMapId,forest.startMapId,'a later stage may reuse the theme without sharing map identities');
assert.equal(secondForest.themeId,forest.themeId);

function fixture(stageId){
  const grants=[],events=[];
  const game={region:{id:getStageDefinition(stageId).themeId},terrain:{island:{plan:{stageExit:{x:0,y:-620}}}},regions:{portals:[],_rewardQueue:[],_offerReward(){},_setStructures(){}},grantResources(reward,source){grants.push({reward,source});},_emit(type,data){events.push({type,data});},_effect(){}};
  return {run:new StageRun(game,stageId),grants,events,game};
}
const a=fixture('volcano-trial'),b=fixture('volcano-trial');
const optional={stageBoss:a.run.currentMapId,stageBossRole:'optional',hp:0};
assert(a.run.onBossKilled(optional));assert.equal(a.grants.length,0);assert.equal(a.game.regions.portals.length,0);
a.run.currentMapId=a.run.definition.coreMapId;
const core={stageBoss:a.run.currentMapId,stageBossRole:'core',hp:1};
assert.equal(a.run.onBossKilled(core),null,'living bosses cannot award completion');
core.hp=0;assert(a.run.onBossKilled(core));assert.equal(a.grants.length,1);
assert.deepEqual(a.grants[0],{reward:{gold:46,crystals:69},source:'stageCoreBoss'});
assert.equal(a.run.onBossKilled(core),null,'one boss death cannot duplicate rewards');
assert.equal(a.grants.length,1);assert.equal(a.game.regions.portals.length,1);
assert.equal(b.run.coreDefeated,false,'completion is owned by a run, not shared configuration');
assert.equal(b.grants.length,0);assert.equal(b.game.regions.portals.length,0);
assert.equal(a.run.objectives.get(core.stageBoss).rewardClaimed,false);
a.run.claimReward(core.stageBoss);assert.equal(a.run.objectives.get(core.stageBoss).rewardClaimed,true);
assert.equal(b.run.objectives.get(core.stageBoss).rewardClaimed,false);
console.log('Stage catalog: eight themes, independent routes, forest compatibility, explicit boss behaviors and per-run rewards passed.');
