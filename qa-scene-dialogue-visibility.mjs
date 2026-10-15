import assert from 'node:assert/strict';
import { Terrain } from './dist/terrain.js';
import { DungeonVision } from './dist/dungeon-vision.js';
import { sceneGroundAnchor } from './dist/scene-rendering.js';
import { sceneDialogueVisible } from './dist/scene-dialogue-visibility.js';
import { SceneDialogue,DIALOGUE_RULES,dialogueSpeakers } from './dist/scene-dialogue.js';
import { RelicSites } from './dist/relic-sites.js';

const viewport={width:800,height:700};
const wall=(id,x,y,halfLength,angle=0)=>({id,type:'log',variant:'castle-wall',x,y,halfLength,angle,r:14});
function world(obstacles=[],x=-150,y=0){
  return {status:'playing',hero:{dialogueName:'公主'},player:{heroId:'princess',x,y:y-19.8},viewWidth:800,viewHeight:700,terrain:new Terrain({obstacles}),enemies:[],companions:{members:[],camps:[]},settlements:{sites:[]},relicSites:{sites:[]}};
}
function speaker(x,y=0,options={}){
  const source={id:'speaker',type:'merchant',x,y,...options},entity={id:source.id,x:source.x,y:source.y-19.8,r:15,isTownNpc:true,heroId:'traveler',townKind:source.type};
  return {id:'site:speaker',kind:'site',source,entity,x:entity.x,y:entity.y,headOffset:58};
}
function dungeon(obstacles){
  const g=world(obstacles),active={id:'room',terrain:g.terrain,bounds:{minX:-500,minY:-500,maxX:500,maxY:500}};
  g.dungeon={game:g,active,_playerFoot:()=>sceneGroundAnchor(g.player)};
  g.dungeon.vision=new DungeonVision(g.dungeon);g.dungeon.vision.update();return g;
}
const isVisible=(g,s,extra={})=>sceneDialogueVisible(g,s,{...viewport,...extra});

// Indoor speech uses current real floor visibility, never exploration memory.
const closed=dungeon([wall('divider',0,0,350,Math.PI/2)]),otherRoom=speaker(144);
assert.equal(isVisible(closed,otherRoom),false);
closed.player.x=140;closed.dungeon.vision.update();assert.equal(isVisible(closed,otherRoom),true);
closed.player.x=-150;closed.dungeon.vision.update();const discovered=closed.dungeon.vision.stats.exploredTiles;
for(let i=0;i<20;i++)assert.equal(isVisible(closed,otherRoom),false,'A previously visited room cannot reveal its live speaker through a closed wall.');
assert.equal(closed.dungeon.vision.stats.exploredTiles,discovered,'Dialogue visibility never discovers extra floor.');
const door=dungeon([wall('north-post',0,-205,145,Math.PI/2),wall('south-post',0,205,145,Math.PI/2)]);
assert.equal(isVisible(door,otherRoom),true,'A real open doorway admits a visible speaker.');
assert.equal(isVisible(door,speaker(144,230)),false,'A doorpost still conceals the adjacent corner.');

// Outdoors also needs actual line of sight. Low terrain follows the same
// height policy as the existing sight/projectile simulation.
const highRock={id:'boulder',type:'rock',x:0,y:0,r:40,rockForm:2};
assert.equal(isVisible(world([highRock]),otherRoom),false);
const lowLog={id:'fallen-log',type:'log',x:0,y:0,r:14,halfLength:60,angle:Math.PI/2};
assert.equal(isVisible(world([lowLog]),otherRoom),true);
assert.equal(isVisible(world([{...lowLog,heightBand:'high'}]),otherRoom),false,'A high override cannot inherit fallen-log sight behavior.');
assert.equal(isVisible(world([{...highRock,heightBand:'low'}]),otherRoom),true);
assert.equal(isVisible(world([{...lowLog,structureId:'wall-foundation'}]),otherRoom),false,'Foundation capsules remain high even when their primitive type is log.');
const flying=speaker(144,0,{type:'angel'});flying.entity.flying=true;
assert.equal(isVisible(world([highRock]),flying),false,'Flying NPCs cannot speak through a high occluder.');
assert.equal(isVisible(world([lowLog]),flying),true,'Low obstacles do not falsely conceal flying NPCs.');

// Sprite silhouettes can conceal a body without blocking its ground ray.
const clear=world(),front={type:'tree',x:144,y:60,r:14,scale:1};
const anonymous=speaker(144);delete anonymous.source.id;delete anonymous.entity.id;
assert.equal(isVisible(clear,anonymous,{terrainProps:[front]}),false,'Anonymous foreground props cannot be mistaken for the anonymous speaker.');
assert.equal(isVisible(clear,otherRoom,{terrainProps:[{...front,y:-60}]}),true,'Behind-body scenery never hides foreground speech.');
assert.equal(isVisible(clear,otherRoom,{terrainProps:[{...front,sortY:0}]}),true,'At an equal ground depth, terrain is painted before the actor.');
assert.equal(isVisible(clear,otherRoom,{terrainProps:[{...front,visual:false}]}),true,'Collision-only pieces do not create phantom painted silhouettes.');
assert.equal(isVisible(clear,otherRoom,{sceneProps:[{...front,renderLayer:'ground'}]}),true);
assert.equal(isVisible(clear,otherRoom,{sceneProps:[{...front,isHutFurniture:true,type:'rug'}]}),true);
assert.equal(isVisible(clear,otherRoom,{sceneProps:[{id:'roof',type:'supply',isSettlement:true,x:144,y:30,width:140,depth:70}]}),false,'Foreground roofs suppress a concealed character’s text.');
const tiny={id:'enemy:tiny',kind:'enemy',source:{id:22},entity:{id:22,type:'slime',x:145,y:-15,r:16,hp:100},headOffset:24};
const longWall=wall('long-wall',0,20,220);
assert.equal(isVisible(clear,tiny,{terrainProps:[longWall]}),false,'A long raised wall uses its full half-length and crest, not merely its collision radius.');
assert.equal(isVisible(clear,otherRoom,{sceneProps:[otherRoom.source]}),true,'A speaker does not occlude itself.');

for(const offscreen of [speaker(-800),speaker(800),speaker(144,-500),speaker(144,500)])assert.equal(isVisible(clear,offscreen),false);
assert.equal(isVisible(clear,otherRoom,{offsetX:-900,offsetY:350}),false,'Visibility follows the actual render projection, including camera offsets.');
clear.sceneTransition={active:true};assert.equal(isVisible(clear,otherRoom),false);clear.sceneTransition.active=false;
assert.equal(isVisible(clear,{...otherRoom,entity:{...otherRoom.entity,hp:0}}),false);
assert.equal(sceneDialogueVisible(clear,otherRoom),false,'Missing viewport dimensions fail closed.');
assert.equal(isVisible(clear,otherRoom,{width:NaN}),false);

// Avoid N terrain ray tests for a finite map's distant or dormant population.
// Real frame costs are bounded by nearby cue candidates, while every actor's
// departure bookkeeping still observes its current distance and state.
const population=world([],0),dialogue=new SceneDialogue();
population.enemies=Array.from({length:180},(_,id)=>({id,type:'slime',x:900+id*10,y:0,r:16,hp:100,territoryId:`territory:${Math.floor(id/6)}`,territoryState:'idle',guardActive:false}));
population.enemies.push({id:181,type:'slime',x:1200,y:0,r:16,hp:100,guardActive:true});
population.settlements.sites=[{id:'merchant:far',type:'merchant',x:DIALOGUE_RULES.merchantFar-10,y:0,state:'ready'},{id:'angel:near',type:'angel',x:-140,y:0,state:'ready',guardRadius:190}];
let visibilityCalls=0;
const check={isVisible:s=>{visibilityCalls++;return isVisible(population,s);}};
dialogue.observe(population,0,check);assert.equal(visibilityCalls,3,'Only the player and two nearby NPCs require visibility checks; 181 distant or dormant enemies do not.');
assert.equal(dialogue.items(check).length,2);assert(dialogue.items(check).some(item=>item.speaker.source.type==='merchant'),'The distant visible shop greeting survives proximity pruning.');
for(let i=0;i<60;i++)dialogue.observe(population,1/60,check);
const afterFrames=visibilityCalls;dialogue.observe(population,1/60,check);assert.equal(visibilityCalls-afterFrames,3);
population.enemies[0].x=200;population.enemies[0].guardActive=true;population.enemies[0].territoryState='chasing';dialogue.observe(population,.1,check);
assert.equal(dialogue.items(check).length,1);assert.equal(dialogue.items(check)[0].speaker.kind,'enemy','A nearby newly alerted group still speaks immediately.');

// Segmented expeditions have a stable group identity too. They must not emit
// one line from every member, nor share a latch with the next segment.
const expedition=world([],0),expeditionDialogue=new SceneDialogue();
expedition.enemies=[1,2].map(id=>({id,type:'shieldguard',x:150+id*10,y:0,r:21,hp:100,guardActive:true,expeditionId:'ship',expeditionSegment:0}));
const admitted={isVisible:()=>true};expeditionDialogue.observe(expedition,0,admitted);assert.equal(expeditionDialogue.items(admitted).length,1);
expeditionDialogue.present(expeditionDialogue.items(admitted));
expeditionDialogue.observe(expedition,4,admitted);assert.equal(expeditionDialogue.items(admitted).length,0);
expedition.enemies=[{...expedition.enemies[0],id:3,expeditionSegment:1}];expeditionDialogue.observe(expedition,0,admitted);assert.equal(expeditionDialogue.items(admitted).length,1);

// Prison bars are sight-blocking collision for combat, but the open-air
// enclosure must not permanently mute its own visibly captive occupant.
const prison=world([],0,180),cell={id:'cell:one',type:'rescue',kind:'warden',x:0,y:0,state:'active',gateOpen:false};
prison.relicSites=new RelicSites(prison,{generation:false});prison.relicSites.sites=[cell];prison.relicSites._setStructures();
prison.companions.camps=[{id:'camp:one',siteId:cell.id,kind:'warden',x:0,y:0,state:'trapped'}];
const captive=dialogueSpeakers(prison).find(s=>s.kind==='captive');assert(captive);
assert(prison.terrain.firstBlocker(0,180,0,0,0,'sight'),'The gate remains a real sight/combat barrier.');
for(const [x,y]of [[0,180],[150,0],[-150,0],[0,-150]]){prison.player.x=x;prison.player.y=y-19.8;assert(isVisible(prison,captive),`Own open-air prison permits the captive call from ${x},${y}`);}
prison.player.x=0;prison.player.y=180-19.8;
prison.terrain.setStructures([wall('other-prison-wall',0,100,60)],'test');assert.equal(isVisible(prison,captive),false,'Ignoring the first own bar never ignores a different wall farther along the ray.');
prison.terrain.setStructures([{id:'foreground-tree',type:'tree',x:0,y:100,r:20,scale:1}],'test');assert.equal(isVisible(prison,captive),false,'Trees outside the prison still suppress dialogue.');
prison.terrain.setStructures([],'test');assert.equal(isVisible(prison,captive,{sceneProps:[{type:'tree',x:0,y:60,r:14,scale:1}]}),false,'A foreground canopy still hides a captive despite its own-wall exception.');
const outsider={...captive,kind:'enemy',entity:{...captive.entity,type:'slime',hp:100}};assert.equal(isVisible(prison,outsider),false,'An unrelated speaker cannot borrow the captive prison exception.');

console.log('Dialogue visibility QA passed: actual dungeon fog/doors, outdoor LOS and height bands, foreground roofs/canopies/long walls, depth ties, hidden/invalid/offscreen/transition states, finite-population LOS pruning, distant merchant, segmented group warnings.');
