import assert from 'node:assert/strict';
import {createRiftLayout} from './dist/worlds/rift-layout.js';
import {RiftArt,RIFT_PALETTE,drawRiftOverview,drawRiftLandmark} from './dist/worlds/rift-art.js';
import {SnowMapArt,SNOW_MAP_PALETTE} from './dist/worlds/snow-map-art.js';
import {RiftCollision} from './dist/rift-collision.js';

function context(record=false){
  const values={globalAlpha:.72,lineWidth:1},stack=[],calls=[],fills=[],strokes=[],clips=[],colors=new Set();let path=[];
  const copyPath=()=>path.map(p=>({key:p.key,args:[...p.args]}));
  const c=new Proxy(values,{set(target,key,value){target[key]=value;if(key==='fillStyle'&&typeof value==='string')colors.add(value);return true;},get(target,key){
    if(key in target)return target[key];if(key==='save')return()=>stack.push({...target});
    // The current path is deliberately NOT saved: real Canvas2D restores only
    // drawing state. This catches borders accidentally stroking a texture path.
    if(key==='restore')return()=>{assert(stack.length,'balanced canvas state');const prior=stack.pop();for(const k of Object.keys(target))delete target[k];Object.assign(target,prior);};
    if(key==='createLinearGradient'||key==='createRadialGradient')return(...args)=>{assert(args.every(Number.isFinite));return {addColorStop(offset,color){assert(Number.isFinite(offset)&&typeof color==='string');}};};
    return(...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${String(key)} needs finite coordinates`);if(!record)return;if(key==='beginPath')path=[];else if(['moveTo','lineTo','closePath','rect','arc','ellipse','bezierCurveTo','quadraticCurveTo'].includes(key))path.push({key,args});
      else if(key==='fill')fills.push({style:target.fillStyle,path:copyPath(),rule:args[0]});else if(key==='stroke')strokes.push({style:target.strokeStyle,path:copyPath()});else if(key==='clip')clips.push({path:copyPath(),rule:args[0]});
      if(['drawImage','translate','scale','fillText'].includes(key))calls.push({key,args});
    };
  }});return {c,values,stack,calls,fills,strokes,clips,colors};
}
const vertices=path=>path.filter(p=>p.key==='moveTo'||p.key==='lineTo').map(p=>p.args.join(','));
const pointKeys=points=>points.map(p=>`${p.x},${p.y}`);
const sameVertices=(path,points)=>JSON.stringify(vertices(path))===JSON.stringify(pointKeys(points));
const snow=createRiftLayout('frostmirror-highlands'),forest=createRiftLayout(),before=JSON.stringify(snow),originalRandom=Math.random;
const allContexts=[],canvases=[],factory=()=>{const ctx=context(),canvas={width:0,height:0,getContext:()=>ctx.c,colors:ctx.colors};allContexts.push(ctx);canvases.push(canvas);return canvas;};
Math.random=()=>{throw new Error('Artwork must not consume simulation randomness');};
try{
  const mapped=context(true);assert(drawRiftOverview(mapped.c,snow,{scale:.1,labels:true,landmarks:true}));
  const ground=mapped.fills.find(p=>p.style===SNOW_MAP_PALETTE.ground&&p.rule==='evenodd');assert(ground,'snow overview paints the collision union');
  assert.deepEqual(vertices(ground.path),snow.boundaries.flatMap(r=>pointKeys(r.points)),'map floor uses every exact collision boundary vertex, including holes');
  for(const lake of snow.lakes)assert(mapped.fills.some(p=>p.style===SNOW_MAP_PALETTE.water&&sameVertices(p.path,lake.points)),'deep water appears at its authored polygon');
  const icy=snow.areas.filter(a=>a.snowTerrain==='ice');assert(icy.length,'map contains real authored ice terrain');
  for(const area of icy)assert(mapped.fills.some(p=>p.style===SNOW_MAP_PALETTE.ice&&sameVertices(p.path,area.points)),'walkable ice uses its own region polygon rather than a shifted decorative pool');
  assert.equal(mapped.calls.filter(p=>p.key==='fillText').length,snow.areas.length,'only the expanded map includes every region label');
  const collision=new RiftCollision(snow);
  for(const bridge of snow.passages.filter(p=>p.kind==='bridge')){
    const [a,b]=bridge.deck,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),nx=-dy/length*bridge.width/2,ny=dx/length*bridge.width/2,deck=[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
    assert(mapped.clips.some(p=>sameVertices(p.path,deck)),`${bridge.id}: bridge art clips to the physical deck`);
    assert(mapped.calls.some(p=>p.key==='translate'&&p.args[0]===a.x&&p.args[1]===a.y),`${bridge.id}: planks begin at the deck end`);
    assert(!mapped.calls.some(p=>p.key==='translate'&&p.args[0]===bridge.waypoints[0].x&&p.args[1]===bridge.waypoints[0].y),'approach route is not mistaken for a long wooden deck');
    for(let i=0;i<=4;i++){const t=i/4;assert(collision.circleFree(a.x+dx*t,a.y+dy*t,49),`${bridge.id}: visible deck has full large-body standing clearance`);}
  }
  const art=new RiftArt(factory),screen=context(),snowIsland={region:'frostmirror-highlands',layout:snow},forestIsland={region:'forest',layout:forest};
  const paint=(island,point)=>art.drawGround(screen.c,island,{camX:point.x,camY:point.y,width:540,height:985});
  paint(forestIsland,forest.spawn);const fx=Math.floor(forest.spawn.x/384),fy=Math.floor(forest.spawn.y/384),forestTile=art._tile(forest,fx,fy);assert(forestTile.canvas.colors.has(RIFT_PALETTE.ground));
  paint(snowIsland,snow.spawn);const sx=Math.floor(snow.spawn.x/384),sy=Math.floor(snow.spawn.y/384),snowTile=art._tile(snow,sx,sy);assert(snowTile.canvas.colors.has(SNOW_MAP_PALETTE.ground));assert.notEqual(snowTile,forestTile,'world identity separates floor tiles');
  assert.equal(art._tile(forest,fx,fy),forestTile,'switching themes preserves the original forest cache entry');assert(!forestTile.canvas.colors.has(SNOW_MAP_PALETTE.ground),'snow painting never recolors an existing forest tile');
  const warmed=art.cacheStats.builds;for(let frame=0;frame<60;frame++)paint(snowIsland,{x:snow.spawn.x+frame*.01,y:snow.spawn.y});assert.equal(art.cacheStats.builds,warmed,'warm 540 viewport reuses both floor and sprite caches');
  const local=new SnowMapArt(factory),iceView=context(true),area=icy[0],view={minX:area.center.x-196,minY:area.center.y-196,maxX:area.center.x+196,maxY:area.center.y+196};local.paintTile(iceView.c,snow,view);
  assert(iceView.strokes.some(p=>p.style==='#e7f0e7aa'&&sameVertices(p.path,area.points)),'ice edge strokes its original polygon after texture painting changes the current path');
  for(const decoration of snow.decorations||[]){const draw=context(true);assert(drawRiftLandmark(draw.c,{...decoration,artTheme:'snow'}));assert(draw.calls.some(p=>p.key==='translate'&&p.args[0]===decoration.x&&p.args[1]===decoration.y),'landmark stays at its authored ground-depth anchor');if(decoration.scale&&decoration.scale!==1)assert(draw.calls.some(p=>p.key==='scale'&&p.args[0]===decoration.scale&&p.args[1]===decoration.scale),'authored landmark scale reaches shared art');assert.equal(draw.stack.length,0);}
  for(let i=0;i<70;i++){const area=snow.areas[i%snow.areas.length];paint(snowIsland,{x:area.center.x+(i%4)*93,y:area.center.y+(i%3)*87});assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'exploration evicts distant floor and sprite images');}
  assert(canvases.every(c=>c.width<=388&&c.height<=388),'rendering never allocates a full-world bitmap');assert(art.snowArt.cacheStats.bytes>0,'snow sprite bytes are included in the shared diagnostics');
  for(const ctx of [...allContexts,screen,mapped,iceView]){assert.equal(ctx.stack.length,0);assert.equal(ctx.values.globalAlpha,.72,'drawing restores its input alpha');}
}finally{Math.random=originalRandom;}
assert.equal(JSON.stringify(snow),before,'map rendering cannot mutate the shared collision or interaction layout');
console.log('Snow map art: exact collision/ice/water polygons, bridge deck clearance, deterministic rendering, landmark scale/depth anchors, warm 540 cache, forest isolation and bounded tile memory passed.');
