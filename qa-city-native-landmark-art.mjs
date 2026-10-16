import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game } from './dist/engine.js';
import { CITY_ART_SPRITES } from './dist/city-art-manifest.js';
import { drawNativeCityLandmark, nativeCitySettlementVisual, drawNativeCitySettlement } from './dist/city-native-landmark-art.js';

const near=(a,b,message)=>assert(Math.abs(a-b)<1e-8,`${message}: ${a} versus ${b}`);
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const clone=value=>freeze(structuredClone(value));
function context(throwAt=''){
  const initial={globalAlpha:.61,globalCompositeOperation:'source-over',textAlign:'left',font:'11px serif',lineWidth:1,strokeStyle:'#000',fillStyle:'#fff'},state={...initial},stack=[],calls=[];
  const c=new Proxy(state,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>stack.push({...target});
    if(key==='restore')return()=>{assert(stack.length,'balanced drawing context');const old=stack.pop();for(const k of Object.keys(target))delete target[k];Object.assign(target,old);};
    return(...args)=>{if(key===throwAt)throw new Error(`context:${key}`);for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),`${key} has finite coordinates`);calls.push({key,args,alpha:target.globalAlpha});};
  }});
  return{c,calls,stack,assertRestored(){assert.equal(stack.length,0);assert.deepEqual(state,initial);}};
}
function library({covers=false,throwDraw=false,throwCover=false}={}){
  const draws=[],coverage=[];
  return{draws,coverage,draw(c,key,rect,options={}){if(throwDraw)throw new Error('library:draw');draws.push({key,rect:structuredClone(rect),options:structuredClone(options)});return true;},coversPlayer(key,rect,player,standing){if(throwCover)throw new Error('library:coversPlayer');coverage.push({key,rect:structuredClone(rect),player:structuredClone(player),standing});return covers;}};
}
const game=new Game({mode:'world',worldId:'clockshadow-city'}),trial=new Game({stageId:'city-trial'}),forest=new Game({mode:'world',worldId:'forest'});
const original=JSON.stringify({sites:game.settlements.sites,rift:game.riftExploration.sites,trial:trial.settlements.sites,forest:forest.settlements.sites});
const sites=game.settlements.sites.filter(site=>site.featureId==='belltower'||['supply','occupied'].includes(site.type)).map(clone);
assert.equal(sites.length,3,'the real city has one interactive clocktower and two small houses');
assert.equal(sites.filter(site=>site.featureId==='belltower').length,1);
const caves=game.riftExploration.sites.filter(site=>site.kind==='cave').map(site=>clone({...site,type:site.kind,isRiftLandmark:true,sortY:site.y}));
assert.equal(caves.length,3,'all three actual authored underground entrances use native art');
for(const site of caves){
  const c=context(),art=library();assert(drawNativeCityLandmark(c.c,site,{library:art}));assert.equal(art.draws.length,1);assert.equal(art.draws[0].key,'sewer');
  const {rect}=art.draws[0],spec=CITY_ART_SPRITES.sewer;
  near(rect.x+spec.footX/spec.sw*rect.width,site.x,'sewer preserves its original ground center X');
  near(rect.y+spec.footY/spec.sh*rect.height,site.y+17,'sewer retains its old 68 by 34 footprint front edge');
  near(rect.width,spec.sw*68/spec.footprintWidth,'sewer uses its real atlas width');near(rect.height,34+48*spec.projectionHeightFactor,'sewer uses its real atlas projection');
  assert(!c.calls.some(call=>['fillRect','strokeRect','fill'].includes(call.key)),'entrance art is native image work delegated to the library');c.assertRestored();
  for(const state of['ready','entered','cleared','spent']){const next=clone({...site,state}),before=JSON.stringify(next);assert(drawNativeCityLandmark(c.c,next,{library:art}));assert.equal(JSON.stringify(next),before,'entrance art cannot change exploration state');}
}
for(const rejected of[null,{...caves[0],artTheme:'forest'},{...caves[0],isRiftLandmark:false},{...caves[0],kind:'shortcut',featureId:undefined},{...caves[0],kind:'exit',featureId:undefined}]){
  const c=context(),art=library();assert.equal(drawNativeCityLandmark(c.c,rejected,{library:art}),false);assert.equal(art.draws.length,0);c.assertRestored();
}
for(const site of sites){
  const visual=nativeCitySettlementVisual(site),spec=CITY_ART_SPRITES[visual.sprite],before=JSON.stringify(site);
  assert.equal(visual.sprite,site.featureId==='belltower'?'belltower':'house');
  near(visual.rect.x+spec.footX/spec.sw*visual.rect.width,site.x,'interactive front anchor X');near(visual.rect.y+spec.footY/spec.sh*visual.rect.height,site.y,'interactive front anchor Y stays site.y');
  near(visual.sortY,site.y,'image front edge keeps the original depth order');near(visual.top,site.y-visual.rect.y,'full native image top participates in culling and attack occlusion');
  near(visual.bottom,visual.rect.y+visual.rect.height-site.y,'full native image bottom participates in bounds');
  assert.deepEqual(visual.maxBounds,{minX:visual.rect.x,minY:visual.rect.y,maxX:visual.rect.x+visual.rect.width,maxY:visual.rect.y+visual.rect.height});
  assert(visual.halfWidth>=site.x-visual.rect.x&&visual.halfWidth>=visual.rect.x+visual.rect.width-site.x);
  for(const [description,player,footY,pixels,expected,coverage]of[
    ['covered behind',{x:site.x,y:site.y-29.8},site.y-10,true,.48,1],
    ['transparent opening',{x:site.x,y:site.y-29.8},site.y-10,false,1,1],
    ['in front',{x:site.x,y:site.y+10},site.y+10,true,1,0],
    ['outside silhouette horizontally',{x:site.x+visual.rect.width+40,y:site.y-30},site.y-10,true,1,0],
    ['above full silhouette',{x:site.x,y:visual.rect.y-30},visual.rect.y-10,true,1,0],
    ['explicit physical foot overrides body animation',{x:site.x,y:site.y+9999},site.y-10,true,.48,1],
    ['default physical foot offset',{x:site.x,y:site.y-29.8},undefined,true,.48,1]
  ]){
    const c=context(),art=library({covers:pixels});assert(drawNativeCitySettlement(c.c,site,{library:art,player,footY}));assert.equal(art.draws.length,1);assert.equal(art.draws[0].key,visual.sprite);assert.deepEqual(art.draws[0].rect,visual.rect);assert.equal(art.draws[0].options.alpha,expected,`${site.id}: ${description}`);assert.equal(art.coverage.length,coverage,description);c.assertRestored();
  }
  for(const [state,explored,label]of[['ready',false,null],['active',false,site.type==='occupied'?'屋内尚有守卫':null],['spent',false,'已探索'],['claimed',false,'已探索'],['ready',true,'已探索']]){
    const next=clone({...site,state,explored}),c=context(),art=library();assert(drawNativeCitySettlement(c.c,next,{library:art}));assert.equal(art.draws[0].options.alpha,1);
    assert(c.calls.some(call=>call.key==='fillText'&&call.args[0]===site.name&&call.args[1]===site.x&&call.args[2]===site.y+31),'site name stays attached to the original anchor');
    const status=c.calls.filter(call=>call.key==='fillText'&&call.args[0]!==site.name);assert.equal(status.length,label?1:0);if(label)assert.deepEqual(status[0].args,[label,site.x,site.y+48]);c.assertRestored();
  }
  const activated=clone({...site,activationAge:.175,activationDuration:.7}),c=context(),art=library();assert(drawNativeCitySettlement(c.c,activated,{library:art}));
  const ring=c.calls.find(call=>call.key==='ellipse');assert(ring);assert.deepEqual(ring.args,[site.x,site.y+8,site.featureId==='belltower'?31:18,7,0,Math.PI,Math.PI*2]);near(ring.alpha,.61*Math.sin(Math.PI*.25),'activation strength uses the existing exploration age');c.assertRestored();
  for(const method of['ellipse','stroke','strokeText','fillText']){
    const failure=context(method);assert.throws(()=>drawNativeCitySettlement(failure.c,activated,{library:library()}),new RegExp(`context:${method}`));failure.assertRestored();
  }
  for(const [options,message]of[[{throwDraw:true},'library:draw'],[{throwCover:true},'library:coversPlayer']]){
    const failure=context();assert.throws(()=>drawNativeCitySettlement(failure.c,site,{library:library(options),player:{x:site.x,y:site.y-29.8},footY:site.y-10}),new RegExp(message));failure.assertRestored();
  }
  assert.equal(JSON.stringify(site),before,'native rendering leaves identity, coordinates, footprint, door, state and guards untouched');
}
for(const site of game.settlements.sites.filter(site=>!sites.some(candidate=>candidate.id===site.id))){const c=context(),art=library();assert.equal(nativeCitySettlementVisual(site),null);assert.equal(drawNativeCitySettlement(c.c,site,{library:art}),false);assert.equal(art.draws.length,0);c.assertRestored();}

// Execute the shipped app's dispatch functions with small injected scene
// dependencies. This checks the real world guard and visual metadata without
// a DOM, browser, native-image decode or a second copy of renderer logic.
const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
function appFunction(name,scope){const start=app.indexOf(`function ${name}(`);assert(start>=0,`${name} exists in app`);const end=app.indexOf('\nfunction ',start+1);return vm.runInNewContext(`(${app.slice(start,end<0?app.length:end)})`,scope);}
for(const source of[trial,forest,game]){
  const c=context(),art=library(),calls={native:0,legacy:0},render=appFunction('drawSettlement',{
    game:{worldId:source.worldId,player:{x:1e6,y:1e6}},ctx:c.c,cityArtLibrary:art,groundOffset:()=>19.8,
    drawNativeCitySettlement(...args){calls.native++;return drawNativeCitySettlement(...args);},worldSiteArt:{drawSettlement(){calls.legacy++;return true;}},combatOptions:{}
  });
  const actual=source.settlements.sites.filter(site=>site.featureId==='belltower'||['supply','occupied'].includes(site.type));for(const site of actual)render(clone(site));
  assert.equal(calls.native,source.worldId==='clockshadow-city'?actual.length:0,'the app replaces interactive art only inside the authored clockshadow city');assert.equal(calls.legacy,source.worldId==='clockshadow-city'?0:actual.length,'legacy city trial and forest settlement dispatch stays intact');c.assertRestored();
}
const sceneGame={worldId:game.worldId,dungeon:null,adventure:{props:[]},riftExploration:{sites:game.riftExploration.sites.map(clone)},settlements:{sites:game.settlements.sites.map(clone)},sceneContent:{allows:()=>true}};
const collect=appFunction('adventureSceneProps',{game:sceneGame,activeEncounters:()=>[],nativeCitySettlementVisual});
for(const site of sites){
  const props=collect(site.x,site.y,540,450),prop=props.find(value=>value.id===site.id);assert(prop?.isSettlement);assert.deepEqual(prop.visual,nativeCitySettlementVisual(site));near(prop.sortY,site.y,'app scene queue preserves interactive front depth');
  for(const key of['id','x','y','width','depth','state','door'])assert.equal(JSON.stringify(prop[key]),JSON.stringify(site[key]),`scene carriers retain the actual ${key}`);
}
const tower=sites.find(site=>site.featureId==='belltower'),towerVisual=nativeCitySettlementVisual(tower);
assert(collect(tower.x,towerVisual.rect.y+5,540,450).some(prop=>prop.id===tower.id),'the actual native tower remains collected when only its upper body enters the view');
let attackOptions;
const attack=appFunction('collectAttackDepthItems',{game:{player:{x:tower.x,y:tower.y},bullets:[],enemyBullets:[],orbitals:[],effects:[]},ctx:{getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0})},sceneViewport:()=>({width:540,height:450}),groundOffset:()=>19.8,combatOptions:{},sceneVisible:()=>true,drawSwordEnergyWaves(){},visitAbilityDepthItems(g,options){attackOptions=options;}});
attack([],[],[{...tower,isSettlement:true,sortY:tower.y,visual:towerVisual}]);
const y=towerVisual.rect.y+2,path={x:towerVisual.rect.x-10,y,x2:towerVisual.rect.x+towerVisual.rect.width+10,y2:y,radius:0};
assert.deepEqual([...attackOptions.depthCutsFor(path.x,path.x2,path)],[tower.y],'attack depth uses the complete native tower top, not the shorter old castle fallback');
const above={...path,y:towerVisual.rect.y-1,y2:towerVisual.rect.y-1};assert.deepEqual([...attackOptions.depthCutsFor(path.x,path.x2,above)],[],'an attack above the native image does not gain a false occluder');
assert.equal(JSON.stringify({sites:game.settlements.sites,rift:game.riftExploration.sites,trial:trial.settlements.sites,forest:forest.settlements.sites}),original,'rendering and app dispatch do not change actual Game state');
console.log(JSON.stringify({cityNativeLandmarkArt:'passed',authoredEntrances:caves.length,interactiveNativeSites:sites.length,coverage:'actual Game identities and footprints; native sewer image branch; original center/front anchors; atlas-derived bounds; pixel-confirmed .48 fade; exploration labels and activation rings; exception restoration; app world guard; complete-tower attack depth; frozen render inputs'}));
