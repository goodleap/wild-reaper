import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {actorShape} from './dist/actor-visuals.js';
import {sceneGroundAnchor} from './dist/scene-rendering.js';
import {enemyArchiveId} from './dist/archive-catalog.js';
import {BOSS_DEFS} from './dist/boss-definitions.js';
import {initBoss} from './dist/bosses.js';
import {resolveBloomBoss} from './dist/bosses/bloom.js';
import {getConfigSection} from './dist/content-config.js';
import {BOSS_APPEARANCES,bossAppearanceId} from './dist/boss-appearances.js';
import {enemyArtId,enemyVisual,ENEMY_VISUALS,enemyBob} from './dist/enemy-visuals.js';
import {enemyAnimationPose,hasEnemyAnimation,updateEnemyLocomotion} from './dist/enemy-animation.js';
import {MonsterArt} from './dist/monster-art.js';
import {ENEMY_ART} from './dist/enemy-art/registry.js';

const near=(a,b,message)=>assert(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);
const entity=(bossKind='ancient',extra={})=>({type:'boss',bossKind,id:1,x:100,y:20,r:49,hp:2300,maxHp:2300,...extra});
const worldCases=[
  ['forest','clearing:rift:11-boss','drownedwatcher'],
  ['forest','clearing:rift:17-boss','innertreeking'],
  ['verdant-rift','clearing:verdant:15-boss','windtreeking'],
  ['verdant-rift','clearing:verdant:17-boss','crownwatcher']
];
const worldGames=new Map();
for(const worldId of ['forest','verdant-rift']){
  const g=new Game({mode:'world',worldId});
  worldGames.set(worldId,g);
  for(const [,source,id] of worldCases.filter(([world])=>world===worldId)){
    const e=g.enemies.find(e=>e.worldBoss&&e.territoryId.endsWith(`:${source}`));
    assert(e,`${worldId}/${source}: actual authored Boss is present`);
    assert.equal(enemyArtId(e),id);
    const restored=JSON.parse(JSON.stringify(e));restored.name='Renamed display text';
    assert.equal(enemyArtId(restored),id,'world appearance survives snapshots and display-name changes');
    restored.appearanceId='../unknown';assert.equal(enemyArtId(restored),id,'unknown appearance cannot override a valid scene identity');
  }
}
for(const [worldId,expected] of [['forest','castleguardian'],['city','towerguardian'],['volcano','forgeguardian']]){
  const g=worldGames.get(worldId)||new Game({mode:'world',worldId});
  const site=g.settlements.sites.find(site=>site.type==='castle');assert(site,`${worldId}: native castle site exists`);
  g.player.x=site.door.x;g.player.y=site.door.y-groundOffset(g.player,true);
  assert(g.dungeon.enter(site),`${worldId}: enter through the actual dungeon API`);
  const boss=g.enemies.find(e=>e.dungeonBoss);assert(boss);
  assert.equal(enemyArtId(boss),expected,'native castle population retains enough identity for the independent body');
  assert.equal(enemyArchiveId(boss),'boss:castle');
}

const dungeonCases=[
  ['旧王城守卫','ancient','castleguardian'],
  ['旧王城守卫','bloom','castleguardian'],
  ['暮钟守卫','bloom','towerguardian'],
  ['熔炉守卫','ancient','forgeguardian'],
  ['暗河守卫','bloom','riverguardian']
];
for(const [name,bossKind,id] of dungeonCases){
  const e=entity(bossKind,{name,dungeonBoss:true,dungeonId:'site:legacy:castle'});
  assert.equal(enemyArtId(e),id);
  assert.equal(enemyArchiveId(e),'boss:castle','appearances cannot create new persisted archive identities');
  delete e.dungeonBoss;assert.equal(enemyArtId(e),bossKind,'a copied display name alone never selects a dungeon appearance');
}
assert.equal(enemyArtId(entity('ancient',{dungeonBoss:true,dungeonId:'rift:underground-passage',name:'Renamed cave guardian'})),'riverguardian');
assert.equal(enemyArtId(entity('ancient',{storyProfile:'captain',storyId:'prologue'})),'pursuitcaptain');
assert.equal(enemyArtId(entity('ancient',{archiveId:'boss:castle'})),'castleguardian','the real portrait adapter preserves its archive identity separately from its numeric fixture ID');
assert.equal(enemyArtId(entity('ancient',{id:'boss:castle'})),'castleguardian');
assert.equal(bossAppearanceId({type:'slime',appearanceId:'castleguardian'}),null,'Boss appearances never dispatch player or ordinary-enemy drawings');
for(const appearanceId of ['missing','__proto__','constructor','deepcaller','drownedwatcher']){
  assert.equal(enemyArtId(entity('ancient',{appearanceId})), 'ancient',`${appearanceId}: unknown or incompatible appearance falls back safely`);
}
assert.equal(enemyArtId(entity('ancient',{appearanceId:'ancient',dungeonBoss:true})),'ancient','an explicit compatible canonical appearance remains usable');
for(const id of Object.keys(BOSS_DEFS))assert.equal(enemyArtId(entity(id)),id,'the six original combat kinds keep their standard appearances');

for(const [id,appearance] of Object.entries(BOSS_APPEARANCES))for(const bossKind of appearance.bossKinds){
  const base=entity(bossKind),e={...base,appearanceId:id},before=JSON.stringify(e);
  assert.equal(enemyArtId(e),id);assert.equal(enemyVisual(e),enemyVisual(base));
  assert.equal(actorShape(e),actorShape(base),'occlusion, shadow and body bounds keep the existing shape object');
  assert.equal(groundOffset(e),groundOffset(base));
  assert.deepEqual(sceneGroundAnchor(e),sceneGroundAnchor(base));
  assert.equal(enemyArchiveId(e),enemyArchiveId(base));
  assert.equal(ENEMY_VISUALS[id],ENEMY_VISUALS[appearance.baseVisual],'appearance metadata is only a bounded sprite frame alias');
  assert.equal(JSON.stringify(e),before,'source resolution never writes appearance or identity fields');
}

function arena(appearanceId,bossKind='ancient'){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.enemies=[];g._spawn=g.nextBossAt=g.crystalsNext=g.player.xpNext=Infinity;
  g.player.x=g.player.y=0;g.player.invuln=1e9;
  for(const id of Object.keys(g.build.weapons))g.build.setEquipped(id,false);
  g._refreshWeapons();
  const e=g._spawnEnemy('boss',1);initBoss(e,bossKind);
  Object.assign(e,{x:300,y:19.8-groundOffset(e),appearanceId});g._rebuildGrid();
  return {g,e};
}
const original=arena('ancient'),variant=arena('pursuitcaptain');
original.e.slamCooldown=variant.e.slamCooldown=Infinity;
for(let i=0;i<90;i++){
  original.g.update(1/60,{x:0,y:0});variant.g.update(1/60,{x:0,y:0});
  near(variant.e.x,original.e.x,'appearance locomotion leaves real movement unchanged');
  near(variant.e.y,original.e.y,'appearance locomotion leaves real terrain projection unchanged');
  assert.equal(variant.e.hp,original.e.hp);assert.equal(variant.g.player.hp,original.g.player.hp);
}
assert(variant.e.walkPhase>0&&variant.e.moving,'legacy appearances receive actual resolved-distance gait through the existing engine hook');
assert(!hasEnemyAnimation(original.e));assert(hasEnemyAnimation(variant.e));
assert.notEqual(enemyBob(original.e,1),0);assert.equal(enemyBob(variant.e,1),0,'the authored gait has no second whole-body bob');
const phase=variant.e.walkPhase;updateEnemyLocomotion(variant.e,variant.e.x,variant.e.y,1/60);
assert.equal(variant.e.walkPhase,phase);assert.equal(variant.e.moving,false,'blocked or stationary bodies do not march');

function sampleReadOnly(e){
  const before=JSON.stringify(e),pose=enemyAnimationPose(e,{time:2});
  assert.equal(JSON.stringify(e),before,'sampling actions cannot write a second combat state machine');
  assert.deepEqual(enemyAnimationPose(e,{time:2}),pose,'repeated paused sampling is deterministic');
  return pose;
}
const legacyRules=getConfigSection('enemies').bosses;
{
  const {g,e}=arena('pursuitcaptain');e.x=100;e.slamCooldown=0;
  g._updateBoss(e,0);assert(e.slam,'the native behavior creates the attack warning');
  g._updateBoss(e,e.slam.maxLife/2);
  let pose=sampleReadOnly(e);assert.equal(pose.mode,'windup');assert.equal(pose.action,'slam');near(pose.progress,.5,'native slam warning progress');
  g._updateBoss(e,e.slam.life);g._resolveBossSlams();
  pose=sampleReadOnly(e);assert.equal(pose.mode,'recovery');assert.equal(pose.action,'slam');assert.equal(pose.progress,0,'release starts the recoil pose');
  g._updateBoss(e,legacyRules.ancient.parameters.recovery/2);
  near(sampleReadOnly(e).progress,.5,'slam recoil uses the configured original recovery duration');
  const base={...e,appearanceId:'ancient'};assert.equal(sampleReadOnly(base).action,'','unmodified ancient retains its old sampling contract');
}
for(const action of ['fan','burst']){
  const {g,e}=arena('towerguardian','bloom');e.x=150;e.bloomCooldown=0;e.bloomNext=action;
  g._updateBoss(e,0);assert.equal(e.bloomAttack?.kind,action);
  g._updateBoss(e,e.bloomAttack.maxLife/2);
  let pose=sampleReadOnly(e);assert.equal(pose.mode,'windup');assert.equal(pose.action,action);near(pose.progress,.5,'native bloom warning progress');
  g._updateBoss(e,e.bloomAttack.life);resolveBloomBoss(g,e);
  pose=sampleReadOnly(e);assert.equal(pose.mode,'recovery');assert.equal(pose.action,'bloomCast');assert.equal(pose.progress,0);
  g._updateBoss(e,legacyRules.bloom.parameters.recovery/2);
  near(sampleReadOnly(e).progress,.5,'bloom recoil uses its original recovery duration');
}
for(const bossKind of ['ancient','bloom']){
  const e=entity(bossKind,{appearanceId:bossKind==='ancient'?'pursuitcaptain':'towerguardian',guardActive:false,slam:{life:.1,maxLife:1},bloomAttack:{kind:'burst',life:.1,maxLife:1}});
  const pose=sampleReadOnly(e);assert.equal(pose.mode,'idle');assert.equal(pose.action,'');
}

// Actual MonsterArt caches must discriminate appearance IDs while sharing the
// unchanged framing and finite pose set. Canvas commands are recorded here;
// browser screenshots provide the separate visual inspection.
function recordingContext(){
  const calls=[],stack=[],ctx={};
  ctx.save=()=>stack.push(1);ctx.restore=()=>{assert(stack.length);stack.pop();};
  ctx.createLinearGradient=ctx.createRadialGradient=(...args)=>{assert(args.every(Number.isFinite));return {addColorStop(){}};};
  const proxy=new Proxy(ctx,{get(target,key){
    if(key in target)return target[key];
    return (...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${String(key)} receives finite coordinates`);calls.push([key,...args]);};
  }});
  return {ctx:proxy,calls,stack};
}
const canvases=[],makeCanvas=()=>{const record=recordingContext(),canvas={width:0,height:0,record,getContext:()=>record.ctx};canvases.push(canvas);return canvas;};
const art=new MonsterArt(makeCanvas),drawn=[];
const target=recordingContext();target.ctx.drawImage=(canvas,...args)=>drawn.push({canvas,args});
const random=Math.random;Math.random=()=>{throw Error('Boss painting must not consume gameplay randomness');};
try{
  const silhouettes=new Set(),identityImages=[];
  for(const [id,appearance] of Object.entries(BOSS_APPEARANCES)){
    const painter=ENEMY_ART[id];assert(painter,`${id}: body painter registered`);assert.equal(painter.animated,true);
    for(const hook of ['ground','phaseLabel','notice','sounds'])assert.equal(painter[hook],undefined,'an appearance cannot duplicate behavior-owned warnings or sounds');
    const e=entity(appearance.bossKinds[0],{appearanceId:id}),snapshot=JSON.stringify(e);
    assert(art.draw(target.ctx,e,{time:1,reduced:true}));const image=drawn.at(-1).canvas;
    identityImages.push(image);
    silhouettes.add(JSON.stringify(image.record.calls.filter(call=>['moveTo','lineTo','quadraticCurveTo','bezierCurveTo','ellipse','arc'].includes(call[0]))));
    const builds=art.cacheStats.builds;
    assert(art.draw(target.ctx,e,{time:2,reduced:true}));assert.equal(drawn.at(-1).canvas,image);assert.equal(art.cacheStats.builds,builds);
    assert.equal(JSON.stringify(e),snapshot);
    e.moving=true;e.walkPhase=2.2;art.draw(target.ctx,e,{time:3});const held=drawn.at(-1).canvas;
    e.walkPhase=5;e.visualFacing=Math.PI;e.hit=.1;art.draw(target.ctx,e,{time:4,frozen:true});assert.equal(drawn.at(-1).canvas,held,'freeze holds the whole last material pose');
  }
  assert.equal(silhouettes.size,Object.keys(BOSS_APPEARANCES).length,'different Boss identities have different geometry, not only changed palettes');
  assert.equal(new Set(identityImages).size,Object.keys(BOSS_APPEARANCES).length,'independent appearances never reuse another identity\'s cached sprite');
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);assert(canvases.every(canvas=>canvas.record.stack.length===0));assert.equal(target.stack.length,0);
}finally{Math.random=random;}
console.log('Boss appearances: real authored sources, legacy dungeon/portrait/story identities, safe fallback, unchanged physics/archive/combat movement, read-only native slam/fan/burst recovery, unique bounded caches and frozen poses passed (recorded Canvas).');
