import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Terrain } from './dist/terrain.js';
import { DungeonVision } from './dist/dungeon-vision.js';

const wall=(id,x,y,halfLength,angle=Math.PI/2)=>({id,type:'log',variant:'castle-wall',x,y,halfLength,angle,r:14});
function scene(obstacles){
  const terrain=new Terrain({obstacles}),state={bounds:{minX:-300,minY:-300,maxX:300,maxY:300},terrain};
  const game={player:{x:-150,y:-19.8},viewWidth:700,viewHeight:600,terrain,status:'playing'};
  const dungeon={game,active:state,_playerFoot(){return {x:game.player.x,y:game.player.y+19.8};}};
  const vision=new DungeonVision(dungeon);return {game,dungeon,state,vision};
}
function inside(point,polygon){
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }
  return result;
}
const solid=scene([wall('wall',0,0,300)]);solid.vision.update();
assert.equal(solid.vision.isVisible(-100,0),true);
assert.equal(solid.vision.isVisible(100,0),false,'A solid wall blocks live vision.');
assert.equal(solid.vision.isVisible(100,0,25),false,'Large actors behind a wall cannot reveal themselves.');
assert.equal(solid.vision.isExplored(144,0),false,'A room behind a wall does not become explored.');
assert.equal(inside({x:100,y:0},solid.vision.polygon),false,'Dynamic clipping excludes the hidden room.');
assert.equal(solid.vision.isVisible(-150,299),false,'Viewport is centred on player body, not feet.');
assert.equal(solid.vision.isVisible(-150,-299),true);
assert.equal(solid.vision.isVisible(-400,0),false,'Outside finite scene bounds remains hidden.');

const door=scene([wall('upper',0,-185,115),wall('lower',0,185,115)]);door.vision.update();
assert.equal(door.vision.isVisible(144,0),true,'An open doorway reveals the corridor without entering the room.');
assert.equal(door.vision.isVisible(144,192),false,'Doorway visibility does not reveal the entire adjacent room.');
assert.equal(inside({x:144,y:0},door.vision.polygon),true);
assert.equal(inside({x:144,y:192},door.vision.polygon),false);
assert.equal(door.vision.isExplored(144,192),false);
// Check polygon free-space classification against the authoritative capsule
// LOS away from the narrow sub-pixel silhouette approximation boundary.
let checked=0;
for(let y=-270;y<260;y+=13)for(let x=-280;x<280;x+=13){
  if(!door.state.terrain.isFree(x,y,1.5))continue;
  const point={x,y},clear=door.vision.isVisible(x,y);
  if(inside(point,door.vision.polygon))assert.equal(clear,true,`No fog clip leak at ${x},${y}`);
  checked++;
}
assert.ok(checked>1000);
const before=door.vision.stats.exploredTiles,knownBefore=door.vision.knownWallSegments().length;
door.game.player.x=150;door.vision.ensureCurrent();
assert.equal(door.vision.isVisible(144,192),true);
assert.equal(door.vision.isExplored(144,192),false,'View reads and redraws must not discover rooms.');
assert.equal(door.vision.stats.exploredTiles,before);
assert.equal(door.vision.knownWallSegments().length,knownBefore);
door.vision.update();assert.equal(door.vision.isExplored(144,192),true);
door.game.player.x=-150;door.vision.update();
assert.equal(door.vision.isExplored(144,192),true,'Exploration survives retreat.');
assert.equal(door.vision.isVisible(144,192),false,'Exploration memory never grants live monster vision.');

const ops=[];const ctx={beginPath(){ops.push('begin');},moveTo(){},lineTo(){},closePath(){},clip(rule){ops.push(`clip:${rule||'normal'}`);},save(){},restore(){},rect(){},fillRect(){}};
const exploredAfter=door.vision.stats.exploredTiles,knownAfter=door.vision.knownWallSegments().length,builds=door.vision.stats.rebuilds,polygon=door.vision.polygon;
for(let i=0;i<60;i++){door.vision.drawFog(ctx,300,300,600,600);door.vision.clipVisible(ctx,300,300);door.vision.getExploredRects();}
assert.equal(door.vision.stats.exploredTiles,exploredAfter,'Paused redraws cannot explore.');
assert.equal(door.vision.knownWallSegments().length,knownAfter);
assert.equal(door.vision.stats.rebuilds,builds,'A stationary paused view reuses its polygon.');
assert.equal(door.vision.polygon,polygon);
assert.ok(ops.includes('clip:evenodd')&&ops.includes('clip:normal'));
assert.ok(door.vision.getExploredRects().every(r=>r.width>0&&r.height>0));
assert.ok(door.vision.knownWallSegments().every(w=>[w.ax,w.ay,w.bx,w.by,w.r].every(Number.isFinite)));
const originalState=door.dungeon.active;door.dungeon.active=null;assert.equal(door.vision.isVisible(10000,10000),true);door.dungeon.active=originalState;door.vision.update();
assert.equal(door.vision.isExplored(144,192),true,'Leaving and re-entering preserves the same scene memory.');
door.game.viewWidth=300;door.game.viewHeight=420;door.vision.ensureCurrent();
assert.equal(door.vision.isVisible(144,0),false,'Resize updates current clipping without growing exploration.');
assert.equal(door.vision.stats.exploredTiles,exploredAfter);

// Seen wall memory must include obliquely viewed ends, not just the short
// portion whose centre happens to point almost straight towards the player.
for(const angle of [0,Math.PI/2,Math.PI/4]){
  const oblique=scene([wall('oblique',0,0,200,angle)]);
  const ux=Math.cos(angle),uy=Math.sin(angle);
  oblique.game.player.x=-200*ux-50*uy;
  oblique.game.player.y=-200*uy+50*ux-19.8;
  oblique.game.viewWidth=oblique.game.viewHeight=1000;
  oblique.vision.update();
  assert.equal(oblique.vision.knownWallSegments().length,Math.ceil(400/24),'All unobstructed near-face pieces should be discovered at oblique angles.');
}
const concealed=scene([wall('front',0,0,300),wall('hidden',120,0,200)]);concealed.vision.update();
assert.equal(concealed.vision.knownWallSegments().some(w=>w.id.startsWith('hidden:')),false,'Near-face discovery still respects intervening walls.');

// A full 5x5 maze is a finite workload even with an unusually large viewport.
const mazeWalls=[];
for(let i=0;i<=5;i++)for(let j=0;j<5;j++){
  mazeWalls.push(wall(`v${i}-${j}`,-900+i*360,-900+j*360+90,90));
  mazeWalls.push(wall(`h${i}-${j}`,-900+j*360+90,-900+i*360,90,0));
}
const dense=scene(mazeWalls);dense.state.bounds={minX:-900,minY:-900,maxX:900,maxY:900};dense.game.viewWidth=1800;dense.game.viewHeight=1800;
const start=performance.now();
for(let i=0;i<80;i++){dense.game.player.x=-110+i*.25;dense.vision.update();}
const elapsed=performance.now()-start;
assert.ok(dense.vision.stats.rays<1800,'Polygon work remains bounded by nearby fixed walls.');
assert.ok(dense.vision.stats.exploredTiles<=75*75);
assert.ok(dense.vision.polygon.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
assert.ok(elapsed<5000,`80 worst-case view updates should not take ${elapsed.toFixed(0)}ms`);
console.log(`Dungeon vision QA passed: door LOS, opaque rooms, static memory, immutable redraw, finite bounds (${Math.round(elapsed)}ms / 80 stress updates).`);
