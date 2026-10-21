import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { EXPEDITIONS } from './dist/expedition-definitions.js';
import { STAGES } from './dist/stage-definitions.js';
import { groundOffset } from './dist/terrain.js';
import { drawExpeditionGround, drawExpeditionObjectives, drawExpeditionProp, drawExpeditionPreview } from './dist/expedition-art.js';
import { ENVIRONMENT_BALANCE } from './dist/environment.js';
import { validateContentPack } from './dist/content-schema.js';
import { getConfigSnapshot } from './dist/content-config.js';

let seed=71813;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const place=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const make=id=>{const g=new Game({mode:'dungeon',dungeonId:id});g.player.xpNext=g.crystalsNext=Infinity;g.player.invuln=1e6;return g;};
const advance=(g,seconds)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)g.update(.05);};
assert.equal(STAGES.length,8,'the eight existing trials remain available');
assert.deepEqual(EXPEDITIONS.map(d=>d.id),['survival','ship','moon']);
for(const d of EXPEDITIONS){
  const g=make(d.id),run=g.expedition,scene=run.sceneDefinition;
  assert.equal(g.stage,null);assert.equal(g.territories.groups.length,0);
  assert.equal(g.regions.portals.length,0);assert.equal(g.settlements.sites.length,0);assert.equal(g.environment.props.length,0);assert.equal(g.relicSites.sites.length,0);
  assert.equal(g.encounters,null);assert.equal(g.environment.generation,false);assert.equal(g.adventure.generation,false);assert.equal(g.companions.generation,false);
  assert.equal(g.adventure.props.length,scene.supplies.length,'authored side routes reuse ordinary supplies');
  assert.equal(run.markers.at(-1).discovered,true);
  assert(g.terrain.isFree(d.start.x,d.start.y,g.player.r));
  if(!d.scenes||d.exit.sceneId===run.currentSceneId)assert(g.terrain.isFree(d.exit.x,d.exit.y,g.player.r));
  for(const [dx,dy]of [[-10000,0],[10000,0],[0,-10000],[0,10000]]){
    const p=g.terrain.moveCircle(d.start.x,d.start.y,dx,dy,15);
    assert(p.x>=scene.bounds.minX+15&&p.x<=scene.bounds.maxX-15&&p.y>=scene.bounds.minY+15&&p.y<=scene.bounds.maxY-15,'bounds constrain foot movement');
  }
  assert.equal(run.complete(),false);
  if(!d.scenes||d.exit.sceneId===run.currentSceneId){place(g,d.exit);run.update(.05);assert.equal(g.status,'playing','reaching an unopened exit cannot complete');place(g,d.start);}
  const before=run.elapsed;g.status='paused';run.update(10);g.update(.05);assert.equal(run.elapsed,before);g.status='dead';run.update(10);assert.equal(run.elapsed,before);assert.equal(run.complete(),false);g.status='playing';
}

// The ship's connected scenes, independent populations and return state are
// exercised by qa-ship-scenes.mjs. The moon retains its full linear gate checks.
for(const id of ['moon']){
  const g=make(id),run=g.expedition,d=run.definition,axis=d.axis;
  const count=g.enemies.length;
  advance(g,2);assert.equal(g.enemies.length,count,'distant fixed groups survive ordinary enemy culling');assert.equal(g.waveDirector.count,0);
  assert(g.enemies.every(enemy=>enemy.guardActive===false),'groups wait for the hero to approach');
  for(const group of run.groups){
    const next=run.groups[group.index+1]?.members[0];
    if(next){const hp=next.hp;assert.equal(g._hurtEnemy(next,hp+1),0,'later groups cannot be sniped through a closed segment gate');assert.equal(next.hp,hp);}
    const center=group.definition.center;place(g,center);run.update(.05);assert(group.members.every(enemy=>enemy.guardActive),'approach activates the current group');
    const gate=group.definition.gate,direction=axis==='x'?1:-1,from={x:axis==='x'?gate-direction*60:0,y:axis==='y'?gate-direction*60:0},delta={x:axis==='x'?direction*120:0,y:axis==='y'?direction*120:0};
    const closed=g.terrain.moveCircle(from.x,from.y,delta.x,delta.y,15);
    assert(direction*(closed[axis]-gate)<0,'closed gate blocks forward movement');
    assert(g.enemies.includes(group.members[0]));
    for(const enemy of group.members)assert(g._hurtEnemy(enemy,enemy.hp+1)>0);
    run.update(.05);assert(group.cleared);assert.equal(run.currentSegment,group.index+1);
    const open=g.terrain.moveCircle(from.x,from.y,delta.x,delta.y,15);assert(direction*(open[axis]-gate)>0,'clearing a group opens its physical gate');
    assert.equal(g.status,'playing','segment completion does not end the run');
  }
  assert(run.exitOpen);assert.equal(g.waveDirector.count,0);const rewardBefore={gold:g.gold,crystals:g.crystals};
  place(g,d.exit);g.status='paused';assert.equal(run.complete(),false);g.status='dead';assert.equal(run.complete(),false);g.status='playing';
  assert(run.complete());assert.equal(g.status,'victory');assert.equal(g.gold-rewardBefore.gold,d.reward.gold);assert.equal(g.crystals-rewardBefore.crystals,d.reward.crystals);
  const snapshot={gold:g.gold,crystals:g.crystals,time:g.runTime};assert.equal(run.complete(),false);g.update(.05);
  assert.deepEqual({gold:g.gold,crystals:g.crystals,time:g.runTime},snapshot);assert.equal(g.events.filter(e=>e.type==='victory').length,1);
  const fresh=make(id);assert.equal(fresh.expedition.currentSegment,0);assert.equal(fresh.expedition.completed,false);assert.equal(fresh.expedition.rewardClaimed,false);assert.equal(fresh.enemies.length,count);
}

const survival=make('survival'),run=survival.expedition;
assert.equal(run.definition.worldMapId,'forest');
assert.equal(survival.terrain.island.region,'forest','the first challenge uses the restored island');
assert.equal(survival._islandWorlds,false,'terrain reuse does not enable cross-island progression');
survival.time=120;assert.equal(survival._difficultyTime(),120);assert.equal(survival._waveTier(),null);survival.time=0;
const surfaces=survival.region.naturalIsland.surfaces;
assert(surfaces.length>0,'the restored layout includes its inland water');
assert.equal(survival.environment.watersInBounds(survival.terrain.bounds).length,surfaces.length,'placement sees water outside the visible cache');
assert(survival.environment.muds.length<=ENVIRONMENT_BALANCE.maxMuds,'water retains the existing bounded visible cache');
const distantSurface=surfaces.find(surface=>Math.hypot(surface.x,surface.y)>1500);
assert(distantSurface);place(survival,distantSurface);survival.environment.update(.6);
assert(survival.environment.muds.some(surface=>surface.id===distantSurface.id),'moving across the island loads the existing fixed water');
assert.equal(survival.environment.props.length,0,'fixed water does not enable mushrooms or ambient events');
place(survival,run.definition.start);survival.environment.update(.6);
advance(survival,1);assert(survival.enemies.length>0,'survival retains ambient attacks from outside the view');
advance(survival,run.definition.duration+1);assert.equal(survival.status,'playing');assert(run.exitOpen);assert(survival.waveDirector.count>0,'survival retains authored horde waves');assert.equal(run.allowAmbient,false);
const count=survival.enemies.length,waves=survival.waveDirector.count;survival._spawn=0;advance(survival,.5);assert(survival.enemies.length<=count);assert.equal(survival.waveDirector.count,waves,'no new wave starts after evacuation opens');
place(survival,run.definition.exit);run.update(.05);assert.equal(survival.status,'victory');assert(run.rewardClaimed);
assert.equal(make('survival').expedition.elapsed,0,'a new run resets its survival timer');

for(const mutate of [d=>{d.axis='z';},d=>{d.reward.gold=-1;},d=>{d.exit.x=1e9;},d=>{d.segments[0].enemies.unknown=1;}]){
  const pack=structuredClone(getConfigSnapshot());mutate(pack.sections.stages.expeditions[1]);assert.throws(()=>validateContentPack(pack),/Invalid (?:world|expedition scene) configuration/);
}
{const pack=structuredClone(getConfigSnapshot()),moon=pack.sections.stages.expeditions[2];moon.segments[1].gate=moon.segments[0].gate;assert.throws(()=>validateContentPack(pack),/Invalid world configuration/);}
const calls=[],ctx=new Proxy({}, {get(target,key){return target[key]??((...args)=>{for(const n of args)if(typeof n==='number')assert(Number.isFinite(n),`finite draw argument ${key}`);calls.push(key);});},set(target,key,value){target[key]=value;return true;}});
ctx.createLinearGradient=ctx.createRadialGradient=()=>({addColorStop(){}});
ctx.measureText=text=>({width:String(text).length*7});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
for(const id of ['survival','ship','moon']){
  const g=make(id),borrowed=!!g.expedition.definition.worldMapId;
  assert.equal(drawExpeditionGround(ctx,g,g.player.x,g.player.y,900,600),!borrowed);
  if(borrowed)assert(drawExpeditionObjectives(ctx,g,g.player.x,g.player.y,900,600));else assert(drawExpeditionPreview(ctx,id,280,150));
  for(const prop of g.terrain.query(-4000,-4000,4000,4000))if(prop.visual!==false){
    const handled=drawExpeditionProp(ctx,prop);
    assert(handled||prop.type==='tree'||prop.type==='log'||borrowed&&prop.type==='rock','expedition props reuse their existing depth rendering');
  }
}
assert.equal(calls.filter(key=>key==='save').length,calls.filter(key=>key==='restore').length,'art preserves the actor depth renderer context');
console.log('Expeditions: catalogue/schema, bounds, fixed groups, gated routes, survival waves, pause/death, exit rewards, restarts and finite artwork passed.');
