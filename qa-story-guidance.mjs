import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawStoryGuideGround, storyRouteMarks, STORY_GUIDANCE_RULES } from './dist/story-guidance.js';
import { WorldMap, landmarkState } from './dist/world-map.js';
import { visitSceneUnits } from './dist/unit-counts.js';
import { dialogueSpeakers } from './dist/scene-dialogue.js';
import { harness } from './qa-app-harness.mjs';

// Sample the route's segments, including a corner around a blocking wall.
// The final objective is beyond this verified local route and must not be joined.
const guide={target:{x:900,y:0},waypoint:{x:0,y:220},path:[{x:0,y:0},{x:0,y:220},{x:360,y:220}],kind:'travel',label:'沿小路会合',shortLabel:'会合处',arrivalRadius:160};
const marks=storyRouteMarks(guide);
assert(marks.length>10,'larger dense guidance covers the complete route, including offscreen portions');
assert(marks.every(mark=>mark.x===0&&mark.y<=220||mark.y===220&&mark.x<=360),'marks follow the L-shaped road instead of a diagonal shortcut');
assert.equal(marks[0].angle,Math.PI/2);
assert(marks.some(mark=>mark.angle===0));
assert.equal(STORY_GUIDANCE_RULES.spacing,42);
const shifted=storyRouteMarks({...guide,routePath:guide.path,progress:6});
assert.deepEqual(shifted,marks,'small hero movement does not slide the ground arrows');
assert(marks.at(-1).x>300,'the route is not cut off at the old 460-unit drawing horizon');
assert.deepEqual(storyRouteMarks(null),[]);
assert.deepEqual(storyRouteMarks({...guide,path:[{x:0,y:0}],waypoint:null}),[],'no guessed route while navigation waits for its budget');
assert.deepEqual(storyRouteMarks({...guide,kind:'hold',target:{x:0,y:100},arrivalRadius:230}),[],'inside the guardian aura, hold position instead of continuing to its centre');
assert(storyRouteMarks({...guide,kind:'hold',target:{x:0,y:500},arrivalRadius:230}).length);

let balance=0;const arcs=[],labels=[];
const ctx=new Proxy({save(){balance++;},restore(){balance--;},arc(...args){arcs.push(args);},fillText(text){labels.push(text);}},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
drawStoryGuideGround(ctx,guide,{zoom:.73,bounds:{minX:700,minY:-100,maxX:1000,maxY:100}});
assert.equal(arcs.length,1,'the objective keeps a ground marker when it is on screen');
drawStoryGuideGround(ctx,{...guide,kind:'hold',areaRadius:230,arrivalRadius:230});
assert.equal(arcs.at(-1)[2],230,'the hold marker agrees with the actual guard radius');
drawStoryGuideGround(ctx,{...guide,kind:'hold',arrivalRadius:160});
assert.equal(arcs.at(-1)[2],27,'a conversation is a small destination marker, not a large guard aura');
assert.equal(balance,0,'ground drawing restores canvas state for later units');
assert.deepEqual(labels,[],'the ground ribbon renders no location direction labels');

// Stale or debug-revealed world data must not leak into a chapter's rendering,
// discovery, unit tally or ambient conversations, including targetless phases.
const player={id:0,x:0,y:-19.8,hp:100,heroId:'traveler'},princess={id:'princess',x:20,y:-19.8,hp:1,storyActor:true,heroId:'princess'};
const enemy={id:1,x:10,y:0,hp:10,type:'shieldguard'},pursuer={...enemy,id:2,storyEnemy:true};
const merchant={id:'merchant',type:'merchant',x:20,y:0,state:'ready',discovered:true};
const house={id:'house',type:'supply',x:30,y:0,state:'ready',discovered:false};
const scene={status:'playing',debug:true,player,enemies:[enemy,pursuer],sceneContent:{allows:()=>false},story:{active:true,actors:[princess],getGuide:()=>null},settlements:{sites:[merchant,house]},relicSites:{sites:[{id:'altar',type:'rescue',kind:'warden',x:30,y:0,state:'ready',discovered:true}]},companions:{members:[{id:3,x:0,y:0,hp:10,kind:'owl',state:'active'}],camps:[{id:'camp',kind:'warden',x:20,y:0,state:'ready'}]},regions:{portals:[{id:'portal',x:20,y:0,state:'active',discovered:true}]}};
const units=[];visitSceneUnits(scene,unit=>units.push(unit));assert.deepEqual(units,[pursuer,player,princess]);
assert.deepEqual(dialogueSpeakers(scene).map(item=>item.source),[player,princess,pursuer]);
const map=new WorldMap();assert.deepEqual(map.getMarkers(scene),[]);assert.equal(map.discover(scene),0);assert.equal(house.discovered,false);
scene.story.getGuide=()=>guide;assert.equal(map.getMarkers(scene,{range:1000}).length,1);assert.equal(map.getMarkers(scene,{range:1000})[0].type,'story');assert.equal(landmarkState(map.getMarkers(scene,{range:1000})[0]),guide.label);
assert.deepEqual(map.getMarkers(scene,{range:100}),[]);
scene.sceneContent.allows=()=>true;assert(map.getMarkers(scene).some(marker=>marker.id==='house'),'ordinary exploration still exposes debug landmarks');

const h=harness();const node=id=>h.document.getElementById(id);
h.fire(node('start-button'),'click');node('mode-story').checked=true;h.fire(node('mode-story'),'change');h.fire(node('prepare-start-button'),'click');await h.flush();
assert(node('run-summary').classList.contains('story-progress'));
h.fire(node('map-button'),'click');
assert.match(node('expanded-map-canvas').getAttribute('aria-label'),/^剧情地图/);
assert(!/洞口|木门|怪物领域|宝藏/.test(node('map-legend').textContent));
h.fire(node('close-map'),'click');
h.run(`const savedStory=game.story,savedText=ctx.fillText,guideLabels=[];ctx.fillText=text=>guideLabels.push(text);
  game.story={active:true,actors:[],getGuide:()=>null};
  game.enemies=[{id:'stray-boss',type:'boss',bossKind:'ancient',hp:20,x:game.player.x+2000,y:game.player.y}];
  game.settlements.sites=[{id:'stray-house',type:'supply',x:game.player.x,y:game.player.y,state:'ready',discovered:true}];
  game.adventure.props=[{type:'supply',x:game.player.x,y:game.player.y,hp:2}];
  drawObjectivePointers();`);
assert.equal(h.run('guideLabels.length'),0,'a targetless chapter never falls through to ordinary boss or site pointers');
assert.equal(h.run('adventureSceneProps(game.player.x,game.player.y).length'),0);
h.run(`game.story.getGuide=()=>({kind:'travel',shortLabel:'天使',target:{x:game.player.x+2000,y:game.player.y},waypoint:null,path:[]});drawObjectivePointers();`);
assert.equal(h.run('guideLabels.length'),0,'a final target cannot substitute for an unavailable navigable waypoint');
h.run(`game.story.getGuide=()=>({kind:'travel',shortLabel:'天使',target:{x:game.player.x,y:game.player.y+2000},waypoint:{x:game.player.x+2000,y:game.player.y},path:[]});drawObjectivePointers();`);
assert.equal(h.run('guideLabels.length'),0,'story ground guidance replaces duplicate location labels and edge pointers');
h.run(`game.story=savedStory;ctx.fillText=savedText;game.enemies=[{id:'leader',type:'boss',storyEnemy:true,storyLeader:true,name:'追猎统领',bossKind:'ancient',x:game.player.x+50,y:game.player.y,hp:20,maxHp:20}];updateHUD();`);
assert.match(node('boss-name').textContent,/追猎统领 · 追兵领队/);
const source=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),render=source.slice(source.indexOf('function renderGame()'),source.indexOf('function drawStoryRealmGround()'));
assert(render.indexOf('drawStoryGuideGround')<render.indexOf('drawEnemyTelegraphs()'));
assert(render.indexOf('drawStoryGuideGround')<render.indexOf('drawScene(actors'));
console.log('Story guidance: complete dense translucent ground route, fixed mark spacing, visible destinations, hold radii, no duplicate location pointers, targetless scene isolation, owned units/dialogue/map markers and leader HUD passed.');
