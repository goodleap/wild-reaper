import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Terrain, groundOffset } from './dist/terrain.js';
import { DungeonVision } from './dist/dungeon-vision.js';
import { sceneGroundAnchor, sceneEntityVisible, sceneItemVisible, sceneItemLayer, compareSceneDepth } from './dist/scene-rendering.js';

const wall=(id,x,y,halfLength,angle=0)=>({id,type:'log',variant:'castle-wall',x,y,halfLength,angle,r:14,sortY:y});
function scene(obstacles,player={x:0,y:100-19.8}){
  const terrain=new Terrain({obstacles}),state={terrain,bounds:{minX:-350,minY:-350,maxX:350,maxY:350}};
  const game={player,viewWidth:700,viewHeight:700,effects:[]};
  const dungeon={game,active:state,_playerFoot(){return {x:player.x,y:player.y+19.8};}};
  game.dungeon=dungeon;dungeon.vision=new DungeonVision(dungeon);dungeon.vision.update();
  return {game,vision:dungeon.vision};
}
const actorAt=(type,x,footY,r)=>{const entity={type,x,y:footY-groundOffset({type,r}),r,id:1};return {kind:'actor',sortY:footY,actor:{entity,x,y:entity.y,footY,orderId:1}};};
const north=wall('north',0,-100,350),south=wall('south',0,70,350);
const room=scene([north,south],{x:0,y:0-19.8});
for(const [type,r] of [['boss',49],['brute',26],['slime',16],['trainingDummy',16]]){
  const item=actorAt(type,0,-35,r);
  assert.equal(sceneEntityVisible(item.actor.entity,room.vision),true,`${type} has a visible footprint.`);
  assert.equal(sceneItemVisible(item,room.vision),true,`${type} uses the same raised-object admission.`);
  const hidden=actorAt(type,0,-100-r-15,r);
  assert.equal(sceneEntityVisible(hidden.actor.entity,room.vision),false,`${type} behind a closed wall stays hidden.`);
  assert.equal(sceneItemVisible(hidden,room.vision),false);
  const order=[{kind:'terrain',prop:south,sortY:south.y},item,{kind:'terrain',prop:north,sortY:north.y}].sort(compareSceneDepth);
  assert.deepEqual(order.map(o=>o.kind==='actor'?type:o.prop.id),['north',type,'south'],'North walls are behind bodies; foreground walls retain occlusion.');
}
const ally={x:0,y:-54.8,r:15,heroId:'arcanist',isCompanion:true};
assert.equal(sceneGroundAnchor(ally).y,-35);
assert.equal(sceneEntityVisible(ally,room.vision),true);
assert.deepEqual(sceneGroundAnchor({type:'damage',x:500,y:-400,groundX:0,groundY:-35,r:200}),{x:0,y:-35,r:0},'Overlay visibility uses the impact point, never its animated position or effect radius.');
assert.equal(sceneEntityVisible({type:'damage',x:0,y:0,groundY:-170,r:200},room.vision),false,'An oversized effect does not reveal the next room.');

const doorway=scene([wall('post-north',0,-205,145,Math.PI/2),wall('post-south',0,205,145,Math.PI/2)],{x:-150,y:-19.8});
assert.equal(sceneItemVisible(actorAt('boss',144,0,49),doorway.vision),true,'Bosses are admitted through an unobstructed doorway before room entry.');
assert.equal(sceneItemVisible(actorAt('boss',144,230,49),doorway.vision),false,'Doorposts do not reveal actors around the corner.');
assert.equal(sceneItemVisible({kind:'adventure',prop:{type:'treasure',x:144,y:230,r:21}},doorway.vision),false,'Hidden chests follow the same footprint visibility rule.');

// New solid scenery needs no object-specific exemption: its near face can be
// seen even when its centre is inside its own sight-blocking collision shape.
const rock={id:'rock',type:'rock',x:0,y:-35,r:24};
const scenery=scene([north,rock]);
assert.equal(scenery.vision.isVisible(rock.x,rock.y),false);
assert.equal(sceneItemVisible({kind:'terrain',prop:rock},scenery.vision),true);
assert.equal(sceneItemVisible({kind:'adventure',prop:{...rock,type:'castlePillar',isInteriorProp:true,collision:true}},scenery.vision),true,'solid interior furniture admits its visible face, not its occluded centre');
const concealed={...rock,id:'hidden-rock',y:-200};
const hiddenScenery=scene([north,concealed]);
assert.equal(sceneItemVisible({kind:'terrain',prop:concealed},hiddenScenery.vision),false);
assert.equal(sceneItemVisible({kind:'adventure',prop:{...concealed,type:'castlePillar',isInteriorProp:true,collision:true}},hiddenScenery.vision),false,'furniture behind a closed wall remains hidden');

// Exercise the application's actual draw pass. Sprite height is deliberately
// outside the floor polygon: adding new actor types requires no clip exception.
const source=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const drawSource=source.slice(source.indexOf('function drawScene('),source.indexOf('function terrainCapsulePath('));
const draws=[],stack=[];let clipped=false,clips=0;
const ctx={save(){stack.push(clipped);},restore(){clipped=stack.pop();}};
const drawVision={...room.vision,isVisible:room.vision.isVisible.bind(room.vision),clipVisible(){clipped=true;clips++;}};
const items=[{kind:'terrain',prop:north,sortY:-100},actorAt('boss',0,-35,49),actorAt('trainingDummy',50,-20,16),actorAt('slime',0,-180,16),
  {kind:'adventure',prop:{type:'treasure',isDungeonTreasure:true,x:-60,y:-35,r:21},sortY:-35},
  {kind:'adventure',prop:{type:'rug',isHutFurniture:true,x:0,y:0},sortY:-1000},
  {kind:'terrain',prop:south,sortY:70}].sort(compareSceneDepth);
const bindings={ctx,game:{effects:[],dungeon:{active:{},vision:drawVision}},collectAttackDepthItems:()=>[],sceneDrawList:()=>items,sceneItemVisible,sceneItemLayer,
  drawTerrain:prop=>draws.push({id:prop.id,clipped}),drawAdventureProp:prop=>draws.push({id:prop.type,clipped}),drawActor:actor=>draws.push({id:actor.entity.type,clipped})};
const drawScene=new Function(...Object.keys(bindings),`${drawSource};return drawScene;`)(...Object.values(bindings));
const rebuilds=room.vision.stats.rebuilds,explored=room.vision.stats.exploredTiles;
for(let frame=0;frame<60;frame++)drawScene([],[],{});
assert.equal(clips,60,'Only one ground decoration is floor-clipped; actor count adds no polygon clips.');
assert.ok(draws.some(d=>d.id==='boss'&&!d.clipped)&&draws.some(d=>d.id==='trainingDummy'&&!d.clipped));
assert.ok(draws.some(d=>d.id==='treasure'&&!d.clipped));
assert.ok(!draws.some(d=>d.id==='slime'),'Hidden actors never reach the body renderer.');
assert.ok(draws.filter(d=>d.clipped).every(d=>d.id==='rug'));
assert.equal(room.vision.stats.rebuilds,rebuilds,'Repeated draws reuse visibility geometry.');
assert.equal(room.vision.stats.exploredTiles,explored,'Object rendering cannot discover new floor.');
assert.equal(sceneItemLayer({kind:'adventure',prop:{renderLayer:'ground'}}),'ground','Future ground decorations can declare their rendering layer.');
console.log('Scene rendering QA passed: shared actor/prop admission, closed walls and doorposts, complete raised silhouettes, foreground depth, ground-only clips, bounded redraw.');
