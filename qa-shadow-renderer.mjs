import assert from 'node:assert/strict';
import { ShadowGeometryCache, ShadowRenderer, shadowFrameBounds } from './dist/shadow-renderer.js';

function context(){
  const calls=[],stack=[],state={globalAlpha:1,globalCompositeOperation:'source-over',fillStyle:'#000',imageSmoothingEnabled:true,imageSmoothingQuality:'high',transform:[1,0,0,1,0,0]};
  let path=[];
  const ctx=new Proxy({}, {get:(_,key)=>state[key],set:(_,key,value)=>(state[key]=value,true)});
  const record=(name,args)=>calls.push({name,args,alpha:ctx.globalAlpha,operation:ctx.globalCompositeOperation,fillStyle:ctx.fillStyle,transform:[...state.transform],path:[...path]});
  ctx.save=()=>stack.push({...state,transform:[...state.transform]});
  ctx.restore=()=>Object.assign(state,stack.pop());
  ctx.setTransform=(...args)=>{state.transform=args;record('setTransform',args);};
  ctx.beginPath=()=>{path=[];record('beginPath',[]);};
  for(const name of ['moveTo','lineTo','ellipse','arc','rect','closePath'])ctx[name]=(...args)=>{path.push([name,...args]);record(name,args);};
  for(const name of ['clearRect','fill','fillRect','drawImage','clip'])ctx[name]=(...args)=>record(name,args);
  return {ctx,calls,stack};
}
function fixture(){
  const canvases=[],renderer=new ShadowRenderer(()=>{const c=context(),canvas={width:0,height:0,...c,getContext:()=>c.ctx};canvases.push(canvas);return canvas;});
  return {renderer,canvases};
}
const ellipse=(x,y,flying=false)=>({x,y,rx:14,ry:8,angle:.2,flying});
const base={width:128,height:128,actors:[ellipse(25,25),ellipse(28,25),ellipse(70,25,true),ellipse(72,25,true)],sceneKey:'forest'};
const f=fixture(),main=context();main.ctx.globalAlpha=.6;main.ctx.globalCompositeOperation='screen';
const lightRequests=[];
f.renderer.draw(main.ctx,{...base,scaleX:1.5,scaleY:1.4,drawLight:(ctx,view)=>{lightRequests.push(view);ctx.fillStyle='#e1edac';ctx.globalAlpha=.2;ctx.fillRect(0,0,view.width,view.height);ctx.globalAlpha=1;}});
const presented=main.calls.filter(c=>c.name==='drawImage');
assert.equal(presented.length,1,'light and shadow share one final main-canvas image');
assert.equal(presented[0].args[0],f.renderer.light);assert.equal(presented[0].alpha,1);
assert.equal(presented[0].operation,'source-over');assert.deepEqual(presented[0].transform,[1.5,0,0,1.4,0,0]);
assert.equal(main.ctx.globalAlpha,.6);assert.equal(main.ctx.globalCompositeOperation,'screen');assert.equal(main.stack.length,0);

const maskCalls=f.renderer.mask.calls,lightCalls=f.renderer.light.calls;
const ground=maskCalls.find(c=>c.name==='fill'&&c.path.filter(p=>p[0]==='ellipse').length===2&&c.operation==='source-over');
assert(ground);assert.equal(ground.alpha,1,'all grounded dynamic shadows are one opaque union');
const flying=maskCalls.find(c=>c.name==='fill'&&c.operation==='destination-over');
assert(flying);assert.equal(flying.alpha,.55);assert.equal(flying.path.filter(p=>p[0]==='ellipse').length,2);
const removed=lightCalls.find(c=>c.name==='drawImage'&&c.operation==='destination-out');
assert(removed);assert.equal(removed.args[0],f.renderer.mask);assert.equal(removed.alpha,1);
const flyingLightRemoval=lightCalls.find(c=>c.name==='fill'&&c.operation==='destination-out');
assert(flyingLightRemoval);assert.equal(flyingLightRemoval.alpha,1,'flying footprints fully remove sunlight despite lighter cast shadows');
assert.equal(flyingLightRemoval.path.filter(p=>p[0]==='ellipse').length,2);
assert.deepEqual(flyingLightRemoval.transform,[1,0,0,1,0,0],'destructive fill uses device coordinates to avoid transformed-path clipping differences');
const eraseBounds=shadowFrameBounds(base.width,base.height,0,0);
const firstEraseEllipse=flyingLightRemoval.path.find(p=>p[0]==='ellipse');
assert.equal(firstEraseEllipse[1],(70-eraseBounds.minX)*.5);assert.equal(firstEraseEllipse[2],(25-eraseBounds.minY)*.5);
assert.equal(firstEraseEllipse[3],7);assert.equal(firstEraseEllipse[4],4);
const tinted=lightCalls.find(c=>c.name==='drawImage'&&c.operation==='source-over');
assert(tinted);assert.equal(tinted.alpha,.3);assert.equal(tinted.args[0],f.renderer.mask);
assert.equal(lightRequests.length,1);

// Interior alpha math for the actual recorded sequence: shared paths union
// before applying opacity; flying coverage is placed behind grounded coverage.
const unionAlpha=(grounded,airborne)=>grounded+airborne*.55*(1-grounded);
assert.equal(unionAlpha(1,0)*tinted.alpha,.3);
assert.equal(unionAlpha(0,1)*tinted.alpha,.165);
assert.equal(unionAlpha(1,1)*tinted.alpha,.3,'ground/flying overlap never becomes a darker second layer');
const lightAlpha=.2,shadowAlpha=.3,erasedLight=lightAlpha*(1-removed.alpha);
assert.equal(erasedLight,0);assert.equal(shadowAlpha+erasedLight*(1-shadowAlpha),.3);
assert.equal(lightAlpha*(1-0),lightAlpha,'sunlight outside shadow coverage retains its color and alpha');

const interior=fixture(),interiorMain=context();interior.renderer.draw(interiorMain.ctx,base);
const interiorImages=interiorMain.calls.filter(c=>c.name==='drawImage');
assert.equal(interiorImages.length,1);assert.equal(interiorImages[0].args[0],interior.renderer.mask);assert.equal(interiorImages[0].alpha,.3);
assert.equal(interior.renderer.light.calls.length,0,'interiors skip the sunlight composition surface');

const decorative=fixture();decorative.renderer.draw(context().ctx,{width:128,height:128,decorativeShapes:[ellipse(50,50)],drawLight(){}});
const decorationErase=decorative.renderer.light.calls.find(c=>c.name==='fill'&&c.operation==='destination-out');
assert.equal(decorationErase.path.filter(p=>p[0]==='ellipse').length,1);
assert.equal(decorative.renderer.mask.calls.filter(c=>c.name==='ellipse').length,0,'decorative shadows already in ground art only exclude sunlight here');

// World raster origins snap to half-resolution pixels; the source crop carries
// the remaining fraction. This equation must stay continuous across tile and
// raster boundaries, including negative camera positions.
for(const offset of [-1024.25,-1024,-1023.75,-512.25,-512,-511.75,-.25,0,.25,511.75,512.25]){
  const b=shadowFrameBounds(393,852,offset,offset+.375);
  assert(Number.isInteger(b.minX*.5)&&Number.isInteger(b.minY*.5));
  assert(b.sourceX>=0&&b.sourceY>=0&&b.sourceX+393*.5<=b.pixelWidth&&b.sourceY+852*.5<=b.pixelHeight);
  for(const worldX of [-1200,-512,0,511.8,1300])assert(Math.abs(((worldX-b.minX)*.5-b.sourceX)/.5-(worldX+offset))<1e-9);
  for(const worldY of [-1200,0,1300])assert(Math.abs(((worldY-b.minY)*.5-b.sourceY)/.5-(worldY+offset+.375))<1e-9);
}

const geometry=new ShadowGeometryCache(2);let appendCalls=0;
function descriptor(key,signature,x){return geometry.get(key,signature,c=>{appendCalls++;c.moveTo(x,30);c.ellipse(x,30,12,5,.3,0,Math.PI*2);c.closePath();});}
geometry.setScene('forest');const rock=descriptor('rock','whole',40);
assert.equal(descriptor('rock','whole',40),rock);assert.equal(appendCalls,1,'warm static shapes reuse recorded geometry');
const pieces=descriptor('rock','broken',44);assert.notEqual(pieces,rock);assert.equal(appendCalls,2);
assert(pieces.bounds.minX<44&&pieces.bounds.maxX>44);assert(pieces.bounds.minY<30&&pieces.bounds.maxY>30);
const scene=fixture(),sceneMain=context(),view={width:128,height:128,staticShapes:[rock],sceneKey:'forest'};
scene.renderer.draw(sceneMain.ctx,view);const built=scene.renderer.staticCache.cacheStats.builds;
scene.renderer.draw(context().ctx,view);assert.equal(scene.renderer.staticCache.cacheStats.builds,built);
scene.renderer.draw(context().ctx,{...view,staticShapes:[pieces]});assert(scene.renderer.staticCache.cacheStats.builds>built,'changed shape signature refreshes cached pixels');
const oldTiles=[...scene.renderer.staticCache.cache.values()].filter(e=>e.canvas).map(e=>e.canvas);
scene.renderer.draw(context().ctx,{...view,sceneKey:'castle',staticShapes:[]});
assert(oldTiles.every(canvas=>canvas.width===0&&canvas.height===0),'scene changes release prior scene shadow tiles');
assert.equal(scene.renderer.staticCache.cacheStats.pixels,0);
geometry.setScene('castle');assert.equal(geometry.entries.size,0);assert.notEqual(descriptor('rock','whole',40),rock);
descriptor('a','1',10);descriptor('b','1',20);assert.equal(geometry.entries.size,2,'geometry cache remains bounded');
scene.renderer.clear();assert.equal(scene.renderer.staticCache.cacheStats.entries,0);
console.log('Shadow renderer: one final composite, ground/flying union opacity, opaque light removal, decorative exclusion, fractional world crops and scene/geometry invalidation passed.');
