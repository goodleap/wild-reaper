import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game} from './dist/engine.js';
import {drawNativeCityLandmark,nativeCitySettlementVisual,drawNativeCitySettlement} from './dist/city-native-landmark-art.js';
import {questSceneProps} from './dist/quest-art.js';
const artStyle='clockshadow-renewed',near=(a,b)=>assert(Math.abs(a-b)<1e-8);
function context(){const initial={globalAlpha:.61,lineWidth:1,textAlign:'left',font:'11px serif',strokeStyle:'#000',fillStyle:'#fff'},state={...initial},stack=[],calls=[];return{calls,c:new Proxy(state,{get(o,k){if(k in o)return o[k];if(k==='save')return()=>stack.push({...o});if(k==='restore')return()=>{const old=stack.pop();assert(old);for(const key of Object.keys(o))delete o[key];Object.assign(o,old);};return(...args)=>{args.filter(a=>typeof a==='number').forEach(a=>assert(Number.isFinite(a)));calls.push({key:k,args});};}}),assertRestored(){assert.equal(stack.length,0);assert.deepEqual(state,initial);}};}
const game=new Game({mode:'world',worldId:'clockshadow-city'}),trial=new Game({stageId:'city-trial'}),forest=new Game({mode:'world',worldId:'forest'});
const original=JSON.stringify({sites:game.settlements.sites,rift:game.riftExploration.sites});
const sites=game.settlements.sites.filter(s=>s.featureId==='belltower'||['supply','occupied'].includes(s.type)),caves=game.riftExploration.sites.filter(s=>s.kind==='cave').map(s=>({...s,type:s.kind,isRiftLandmark:true}));
assert.equal(sites.filter(s=>s.featureId==='belltower').length,1,'the square owns one interactive bell tower');assert.equal(caves.length,3);
for(const site of caves){const c=context(),calls=[],painter={draw(...a){calls.push(a);}};assert(drawNativeCityLandmark(c.c,site,{artStyle,painter}));assert.equal(calls.length,1);assert.equal(calls[0][1].cityKind,'sewer');assert.equal(calls[0][1].x,site.x);assert.equal(calls[0][1].y,site.y);assert.equal(calls[0][1].width,84);assert.equal(calls[0][1].depth,58);c.assertRestored();}
for(const rejected of[null,{...caves[0],artTheme:'forest'},{...caves[0],isRiftLandmark:false},{...caves[0],kind:'shortcut',type:'shortcut',featureId:undefined}])assert.equal(drawNativeCityLandmark(context().c,rejected,{artStyle,painter:{draw(){assert.fail();}}}),false);
for(const site of sites){
  const visual=nativeCitySettlementVisual(site,{artStyle}),prop=visual.prop;assert(prop);near(prop.x,site.x);near(prop.y+prop.depth/2,site.y);near(visual.sortY,site.y);near(visual.top,site.y-visual.rect.y);near(visual.bottom,visual.rect.y+visual.rect.height-site.y);assert.equal(prop.cityKind,site.featureId==='belltower'?'belltower':'house');
  assert.deepEqual(visual.maxBounds,{minX:visual.rect.x,minY:visual.rect.y,maxX:visual.rect.x+visual.rect.width,maxY:visual.rect.y+visual.rect.height});
  if(site.type==='supply'||site.type==='occupied'){
    assert.equal(site.width,site.type==='supply'?96:104);assert.equal(site.depth,site.type==='supply'?46:50);assert.equal(prop.height,54);
    near(prop.width,site.width);near(prop.depth,site.depth);
    assert(!game.terrain.isFree(site.x,site.y-site.depth/2,1),'the broader hut has an actual solid foundation');
    assert(game.terrain.isFree(site.door.x,site.door.y,game.player.r),'the entrance approach remains walkable');
  }
  for(const[description,player,footY,expected]of[['behind',{x:site.x,y:site.y-30},site.y-10,.48],['front',{x:site.x,y:site.y+30},site.y+30,1],['horizontal outside',{x:site.x+visual.rect.width+40,y:site.y-30},site.y-10,1],['above',{x:site.x,y:visual.rect.y-50},visual.rect.y-30,1]]){
    const c=context(),calls=[],painter={draw(...args){calls.push(args);}};assert(drawNativeCitySettlement(c.c,site,{artStyle,painter,player,footY}));assert.equal(calls.length,1);assert.deepEqual(calls[0][1],prop);assert.equal(calls[0][2].canopyAlpha,expected,description);assert.equal(calls[0][2].footY,footY);c.assertRestored();
  }
  for(const[state,explored,label]of[['ready',false,null],['spent',false,'已探索'],['ready',true,'已探索']]){const c=context(),next={...site,state,explored};assert(drawNativeCitySettlement(c.c,next,{artStyle,painter:{draw(){}}}));assert(c.calls.some(call=>call.key==='fillText'&&call.args[0]===site.name));assert.equal(c.calls.some(call=>call.key==='fillText'&&call.args[0]==='已探索'),!!label);c.assertRestored();}
  const c=context();assert.throws(()=>drawNativeCitySettlement(c.c,site,{artStyle,painter:{draw(){throw new Error('draw failure');}}}),/draw failure/);c.assertRestored();
  // Old non-renewed clients retain the original library-based view.
  const legacy=nativeCitySettlementVisual(site);assert(!legacy.prop);let draws=0;drawNativeCitySettlement(c.c,site,{library:{draw(){draws++;},coversPlayer(){return false;}}});assert.equal(draws,1);c.assertRestored();
}
const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
function appFunction(name,scope){const start=app.indexOf(`function ${name}(`),end=app.indexOf('\nfunction ',start+1);assert(start>=0);return vm.runInNewContext(`(${app.slice(start,end<0?app.length:end)})`,scope);}
for(const source of[trial,forest,game]){
  const c=context(),counts={native:0,legacy:0};const draw=appFunction('drawSettlement',{game:{worldId:source.worldId,terrain:{island:{layout:{artStyle}}},player:{x:1e7,y:1e7}},ctx:c.c,cityArtLibrary:{},groundOffset:()=>19.8,drawEmberSettlement:()=>false,drawNativeCitySettlement(ctx,site,options){assert.equal(options.artStyle,artStyle);counts.native++;return true;},worldSiteArt:{drawSettlement(){counts.legacy++;return true;}},combatOptions:{}});
  const actual=source.settlements.sites.filter(s=>s.featureId==='belltower'||['supply','occupied'].includes(s.type));actual.forEach(draw);assert.equal(counts.native,source.worldId==='clockshadow-city'?actual.length:0);assert.equal(counts.legacy,source.worldId==='clockshadow-city'?0:actual.length);
}
const scopeGame={worldId:game.worldId,terrain:{island:{layout:{artStyle}}},dungeon:null,adventure:{props:[]},riftExploration:{sites:game.riftExploration.sites},settlements:{sites:game.settlements.sites},sceneContent:{allows:()=>true}};
const collect=appFunction('adventureSceneProps',{game:scopeGame,activeEncounters:()=>[],nativeCitySettlementVisual,emberSettlementVisual:()=>null,questSceneProps});
for(const site of sites){const prop=collect(site.x,site.y,540,450).find(p=>p.id===site.id);assert(prop?.isSettlement);assert.deepEqual(prop.visual,nativeCitySettlementVisual(site,{artStyle}));near(prop.sortY,site.y);}
const tower=sites.find(s=>s.featureId==='belltower'),visual=nativeCitySettlementVisual(tower,{artStyle});assert(collect(tower.x,visual.rect.y+3,540,450).some(s=>s.id===tower.id),'upper tower remains visible when its front anchor is outside the viewport');
assert.equal(JSON.stringify({sites:game.settlements.sites,rift:game.riftExploration.sites}),original);
console.log(JSON.stringify({cityNativeLandmarks:'passed',entrances:caves.length,settlements:sites.length,coverage:'one interactive tower; preserved anchors and state; complete bounds; pixel-mask painter fade contract; labels; old trial/world guard; canvas path without atlas; viewport collection'}));
