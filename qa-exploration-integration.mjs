import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { AdventureArchive } from './dist/adventure-archive.js';
import { archivePanelHTML } from './dist/archive-panel.js';
import { EXPEDITIONS } from './dist/expedition-definitions.js';
import { STAGES } from './dist/stage-definitions.js';
import { WorldMap, landmarkLabel, landmarkState } from './dist/world-map.js';
import { groundOffset } from './dist/terrain.js';

let seed=197201;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const memory=()=>{const data=new Map();return {writes:0,getItem:key=>data.get(key)??null,setItem(key,value){this.writes++;data.set(key,value);}};};
const storage=memory(),archive=new AdventureArchive({storage});
const make=(id,hero='traveler')=>{const g=new Game({mode:'dungeon',dungeonId:id,hero});g.player.xpNext=g.crystalsNext=Infinity;g.player.invuln=1e6;return g;};
const place=(g,point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
function clearObjectives(g){
  const run=g.expedition;
  if(run.id==='survival')for(let frame=0;frame<run.definition.duration*10+1;frame++)run.update(.1);
  else for(const group of run.groups){
    place(g,group.definition.center);run.update(.05);
    for(const enemy of group.members)assert(g._hurtEnemy(enemy,enemy.hp+1)>0);
    run.update(.05);
  }
  assert(run.exitOpen);assert.equal(run.completed,false);assert.equal(g.status,'playing');
}
function finishAtExit(g,time){
  clearObjectives(g);g.runTime=time;place(g,g.expedition.definition.exit);
  assert(g.expedition.complete());assert.equal(g.status,'victory');
  return archive.finish(g,'victory');
}

for(const [index,definition]of EXPEDITIONS.entries()){
  const id=definition.id,g=make(id);assert(archive.begin(g));
  const report=finishAtExit(g,200+index*10);
  assert.equal(report.stageCompletion.id,id);assert.equal(report.stageCompletion.heroId,'traveler');assert.equal(report.stageCompletion.clears,1);
  assert.equal(report.stageCompletion.time,200+index*10);assert(report.stageCompletion.isBest);
  assert.equal(archive.data.stages[id].normal.clears,1);assert.equal(archive.data.stages[id].casual.clears,0,'new modes only create normal records');
  const before=JSON.stringify(archive.data),writes=storage.writes;
  assert.equal(g.expedition.complete(),false);archive.finish(g,'victory');archive.checkpoint(g,{force:true});
  assert.equal(JSON.stringify(archive.data),before);assert.equal(storage.writes,writes,'repeated end handling does not persist another clear');
  assert.deepEqual(new AdventureArchive({storage}).data,archive.data,'expedition identity and hero survive reload');

  const fake=make(id);archive.begin(fake);fake.status='victory';
  assert.equal(archive.finish(fake,'victory').stageCompletion,null,'a victory label alone cannot forge a clear');assert.equal(archive.data.stages[id].normal.clears,1);
  const unfinished=make(id);archive.begin(unfinished);clearObjectives(unfinished);
  assert.equal(archive.finish(unfinished,'exit').stageCompletion,null,'clearing all enemies or finishing the timer is not exiting the expedition');
  assert.equal(archive.data.stages[id].normal.clears,1);
  const dead=make(id);archive.begin(dead);clearObjectives(dead);dead.status='dead';dead.player.hp=0;place(dead,dead.expedition.definition.exit);
  assert.equal(dead.expedition.complete(),false);assert.equal(archive.finish(dead,'death').stageCompletion,null,'death at an open exit is not a clear');assert.equal(archive.data.stages[id].normal.clears,1);

  const restarted=make(id,'princess');assert.equal(restarted.expedition.completed,false);assert.equal(restarted.expedition.elapsed,0);assert.equal(restarted.expedition.rewardClaimed,false);
  archive.begin(restarted);const better=finishAtExit(restarted,190+index*10);
  assert.equal(better.stageCompletion.clears,2);assert(better.stageCompletion.isBest);assert.equal(archive.data.stages[id].normal.bestHeroId,'princess');assert.equal(archive.data.stages[id].normal.lastHeroId,'princess');
  assert.equal(archive.data.stages[id].normal.bestTime,190+index*10);
}
assert.deepEqual(Object.keys(archive.data.stages).sort(),EXPEDITIONS.map(d=>d.id).sort(),'new dungeon clears cannot overwrite a world-trial identity');

const currentRecords=archivePanelHTML(archive.data,{tab:'records',difficulty:'normal'}),historicRecords=archivePanelHTML(archive.data,{tab:'records',difficulty:'casual'});
const visibleRecordIds=html=>[...html.matchAll(/data-stage-record="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(visibleRecordIds(currentRecords),[...EXPEDITIONS,...STAGES].map(stage=>stage.id),'current records show all three new expeditions before the eight retained trials');
assert.deepEqual(visibleRecordIds(historicRecords),STAGES.map(stage=>stage.id),'historical casual records contain only the eight original trials');
for(const definition of EXPEDITIONS){
  const card=currentRecords.split(`data-stage-record="${definition.id}"`)[1].split('</div>')[0];
  assert(card.includes(definition.name));assert(card.includes('通关 <b>2</b> 次'));assert(card.includes('最快 <b>3 分'),'earned expedition completion time is visible');
  assert.doesNotMatch(historicRecords,new RegExp(`data-stage-record="${definition.id}"`));
}
for(const html of [currentRecords,historicRecords]){
  assert.match(html,/data-archive-difficulty="normal"[^>]*>当前记录/);assert.match(html,/data-archive-difficulty="casual"[^>]*>旧版轻松记录/);
  assert.match(html,/当前冒险不再选择难度/);assert.doesNotMatch(html,/纪录难度|>标准试炼<|>轻松漫游</);
}
const historicalData=structuredClone(archive.data);historicalData.stages['forest-trial']={normal:{clears:0,bestTime:0},casual:{clears:4,bestTime:125}};
const savedHistory=JSON.stringify(historicalData),historyPanel=archivePanelHTML(historicalData,{tab:'records',difficulty:'casual'});
assert.match(historyPanel,/通关 <b>4<\/b> 次/);assert.match(historyPanel,/最快 <b>2 分 5 秒<\/b>/);assert.equal(JSON.stringify(historicalData),savedHistory,'viewing archived difficulty records never migrates or resets stored progress');

const map=new WorldMap(),world=new Game({mode:'world'}),group=world.territories.groups[0];assert(group);
const worldMarkers=()=>map.getMarkers(world,{range:10000}).filter(marker=>marker.type==='territory');
assert.equal(worldMarkers().length,0,'undiscovered monster territories are hidden');
place(world,group);map.discover(world);assert(group.discovered);
let territory=worldMarkers().find(marker=>marker.id===group.id);assert(territory);assert.equal(landmarkLabel(territory),'怪物领域');assert.equal(territory.completed,false);
assert(!landmarkState(territory).includes('可探索'),'territory list describes enemies instead of a generic ruin');
place(world,{x:0,y:0});assert(worldMarkers().some(marker=>marker.id===group.id),'known territory persists when the player leaves');
for(const enemy of group.members)enemy.hp=0;world.territories.update(.05);
territory=worldMarkers().find(marker=>marker.id===group.id);assert.equal(territory.completed,true);assert.match(landmarkState(territory),/清理|完成/);
const freshWorld=new Game({mode:'world'});assert.equal(map.getMarkers(freshWorld,{range:10000}).filter(marker=>marker.type==='territory').length,0,'new worlds do not inherit discovered or cleared territory markers');

let balance=0;const drawnTexts=[],drawnRects=[];
const ctx=new Proxy({}, {get(target,key){if(key==='save')return()=>balance++;if(key==='restore')return()=>balance--;if(key==='fillText'||key==='strokeText')return text=>drawnTexts.push(String(text));if(key==='fillRect'||key==='strokeRect')return(...args)=>{assert(args.every(Number.isFinite));drawnRects.push({key,args});};return target[key]??((...args)=>{for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),`finite map ${key}`);});},set(target,key,value){target[key]=value;return true;}});
for(const definition of EXPEDITIONS){
  const g=make(definition.id),run=g.expedition,markers=()=>map.getMarkers(g,{range:10000});
  const initial=markers();assert.equal(initial.length,definition.id==='survival'?1:2,'only the current enemy group and exit are objectives');
  for(const source of run.markers){const marker=initial.find(item=>item.id===source.id);assert(marker);assert.equal(landmarkLabel(marker),source.name);assert.equal(marker.label,source.label);assert.equal(marker.color,source.color);assert.equal(landmarkState(marker),source.label);}
  const initialExit=initial.find(marker=>marker.id==='expedition:exit');assert.equal(initialExit.active,false);assert.equal(initialExit.completed,false);
  const discovery=map.discover(g);assert.equal(map.discover(g),0,'public route markers have no repeated discovery side effects');assert.equal(discovery,0);
  const before=JSON.stringify(run.markers),enemies=JSON.stringify(g.enemies.map(enemy=>[enemy.id,enemy.hp,enemy.guardActive]));
  map.draw(ctx,g,{width:128,height:128});const expanded=map.draw(ctx,g,{width:440,height:440,expanded:true});
  assert.equal(balance,0);assert.equal(JSON.stringify(run.markers),before);assert.equal(JSON.stringify(g.enemies.map(enemy=>[enemy.id,enemy.hp,enemy.guardActive])),enemies,'drawing the route never activates or defeats enemies');
  assert(expanded.markers.some(marker=>marker.id==='expedition:exit'),'expanded expedition map includes the destination even beyond local map range');
  clearObjectives(g);const opened=markers().find(marker=>marker.id==='expedition:exit');assert(opened.active);assert.equal(opened.completed,false);assert.match(landmarkState(opened),/出口/);assert.equal(markers().length,1,'cleared groups no longer appear as a current objective');
  place(g,definition.exit);assert(run.complete());const completed=markers().find(marker=>marker.id==='expedition:exit');assert.equal(completed.completed,true);assert.equal(completed.active,false);assert.match(landmarkState(completed),/完成|通关/);
  const fresh=make(definition.id);assert.equal(map.getMarkers(fresh,{range:10000}).find(marker=>marker.id==='expedition:exit').completed,false,'map state resets with each expedition');
}
assert(drawnRects.length>0);assert(drawnTexts.includes('N'));assert.equal(balance,0);
console.log('Exploration integration: real expedition exits, idempotent persisted clears, false victory/death/restart, territory discovery, route markers and read-only overview maps passed.');
