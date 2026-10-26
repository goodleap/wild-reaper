import assert from 'node:assert/strict';
import { Terrain,groundOffset } from './dist/terrain.js';
import { SideQuestScene,foot,distance } from './dist/sidequests/base.js';
import { cleanSidequestState } from './dist/sidequests/state.js';

const unsafe=JSON.parse('{"flags":{"ok":true,"bad key":true,"constructor":true},"values":{"elapsed":12,"too-big":1e20},"choices":{"route":"long","html":"<b>"},"actors":{"outside-helper":{"x":10,"y":20,"facing":1},"escaped":{"x":1000000,"y":0}}}');
const cleaned=cleanSidequestState(unsafe);
assert.deepEqual(cleaned.flags,{ok:true});assert.deepEqual(cleaned.values,{elapsed:12});assert.deepEqual(cleaned.choices,{route:'long'});
assert.deepEqual(cleaned.actors,{'outside-helper':{x:10,y:20,facing:1}});
assert.equal(Object.prototype.polluted,undefined);

const records={},events=[];let writes=0,id=0;
const game={terrain:new Terrain({obstacles:[]}),worldId:'rift-forest',mode:'world',status:'playing',_clock:0,runTime:0,gold:100,
  player:{x:0,y:-19.8,r:15,hp:50,maxHp:100,speed:320,heroId:'traveler'},enemies:[],dungeon:{active:null},worldShops:{inventory:{heal:0,magnet:0,fury:0,shield:0}},
  _moveEntity(entity,dx,dy){const offset=groundOffset(entity),next=this.terrain.moveCircle(entity.x,entity.y+offset,dx,dy,entity.r);entity.x=next.x;entity.y=next.y-offset;},
  _spawnEnemy(type){const enemy={id:++id,type,x:0,y:0,r:16,hp:20,maxHp:20,damage:5,speed:100,xp:1};this.enemies.push(enemy);return enemy;},
  _rebuildGrid(){},_emit(type,data){events.push({type,...data});},_scheduleWorldSave(){writes++;}};
const definition={id:'fixture',name:'Fixture',objectives:[{id:'done'}],discovery:{area:'01',name:'Fixture'}};
const quests={game,store:{dirty:false},_record(key){return records[key]??={accepted:true,completed:false,objectives:{}};},_changed(){writes++;},_objective(objective,key){this._record(key).objectives[objective]=true;return true;}};
const scene=new SideQuestScene({game,quests},definition),actor=scene.actor('helper',{x:0,y:0},{kind:'warden'});
assert(!game.enemies.includes(actor));assert.equal(actor.neutral,true);
const gate=scene.gate('door',{x:120,y:-80},{x:120,y:80});
assert(game.terrain.firstBlocker(0,0,240,0,15));
const revision=game.terrain.structureRevision;
for(let n=0;n<10;n++)scene.gate('door',{x:120,y:-80},{x:120,y:80});
assert.equal(game.terrain.structureRevision,revision,'unchanged gate state cannot rebuild navigation every frame');
assert.equal(gate.width,160);assert.deepEqual(gate.a,{x:120,y:-80});assert.equal(gate.radius,8);
let detour=false;
for(let frame=0;frame<500&&distance(foot(actor),{x:240,y:0})>13;frame++){
  game._clock+=.05;scene.move(actor,{x:240,y:0},.05,{speed:180});
  assert(game.terrain.isFree(foot(actor).x,foot(actor).y,actor.r-.1),'actual movement stays outside collider');
  if(Math.abs(foot(actor).y)>85)detour=true;
}
assert(distance(foot(actor),{x:240,y:0})<=13,'navigation reaches the destination without teleporting');assert(detour,'closed visible gate caused a real detour');
scene.gate('door',{x:120,y:-80},{x:120,y:80},{open:true});
assert(!game.terrain.firstBlocker(0,0,240,0,15),'opening removes the same visible barrier');
scene.checkpoint();const surfaceX=actor.x;
scene.clearFixtures();game.dungeon.active={id:'fixture-interior'};game.terrain=new Terrain({obstacles:[]});
const inside=scene.actor('helper',{x:1000,y:1000},{kind:'warden'});assert.equal(inside.x,1000,'surface actor coordinates are never reused inside');
scene.placeActor(inside,{x:1100,y:1010});scene.checkpoint();scene.clearFixtures();game.dungeon.active=null;
const outside=scene.actor('helper',{x:0,y:0},{kind:'warden'});assert.equal(outside.x,surfaceX,'returning restores surface actor state independently');

scene.spawnGroup('guards',{x:400,y:0},['royalguard','royallancer'],{hp:40});
assert.equal(scene.alive('guards').length,2);scene.spawnGroup('guards',{x:400,y:0},['royalguard']);assert.equal(scene.alive('guards').length,2,'guard ledger prevents duplicate spawning');
assert(!scene.groupCleared('guards'));for(const enemy of scene.alive('guards'))enemy.hp=0;assert(scene.groupCleared('guards'));
scene.clearGroup('guards',{reset:true});assert(!scene.groupCleared('guards'));scene.spawnGroup('guards',{x:400,y:0},['royalguard']);assert.equal(scene.alive('guards').length,1);

scene.say(outside,'第一句',.1);scene.say(outside,'第二句',.1);scene.tickDialogue(2.9);assert.equal(scene.getDialogue()[0].text,'第一句');scene.tickDialogue(.2);assert.equal(scene.getDialogue()[0].text,'第二句');
assert(!scene.buySupply('heal',5),'unearned service cannot sell supplies');records.fixture.completed=true;
assert(scene.buySupply('heal',5));assert.equal(game.gold,95);assert.equal(game.worldShops.inventory.heal,1);assert.equal(events.at(-1).type,'shopBought');
assert(!scene.buySupply('heal',-1));assert(!scene.buySupply('unknown',5));assert(!scene.buySupply('fury',1000));
game.terrain.setStructures([{id:'other',type:'log',x:500,y:500,r:12,halfLength:50,angle:0}],'other-owner');scene.gate('door',{x:200,y:0},{x:200,y:100});scene.dispose();
assert(game.terrain._structureOwners.has('other-owner'),'cleanup preserves unrelated owners');assert(!game.terrain._structureOwners.has('sidequest:fixture'));
assert(writes>0);
console.log('Sidequest foundation: bounded state, real gate collision/navigation, stable invalidation, scene actor isolation, guard retries, bubble lifetime and paid services passed.');
