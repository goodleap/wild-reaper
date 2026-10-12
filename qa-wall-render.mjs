import assert from 'node:assert/strict';
import { Terrain } from './dist/terrain.js';
import { DungeonVision } from './dist/dungeon-vision.js';
import { DungeonWallArt, wallOcclusionOpacity } from './dist/dungeon-wall-art.js';

const wall=(id,x,y,halfLength,angle=0,variant='castle-wall')=>({id,type:'log',variant,x,y,halfLength,angle,r:14});
const back=wall('back',0,150,200),divider=wall('divider',0,0,55,Math.PI/2);
const terrain=new Terrain({obstacles:[back,divider]}),state={terrain,bounds:{minX:-350,minY:-350,maxX:350,maxY:350}};
const game={player:{x:0,y:100-19.8},viewWidth:700,viewHeight:700};
const dungeon={active:state,game,_playerFoot(){return {x:game.player.x,y:game.player.y+19.8};}};
const vision=new DungeonVision(dungeon),art=new DungeonWallArt();vision.update();
assert.equal(vision.knownWallSegments(back.id).length,17);
assert.equal(vision.knownWallSegments('unknown-wall').length,0);

let time=0,previous=null,maxStep=0;const changed=new Set();
for(let frame=0;frame<151;frame++){
  // Normal one-pixel movement sweeps the divider's corner shadow across the
  // opposite wall, changing some pieces without flashing the entire wall.
  game.player.x=-75+frame;game.player.y=-150-19.8;time+=1/60;vision.update();
  const plan=art.plan(back,game.player,vision,time),current=new Map(plan.map(p=>[p.id,p.alpha]));
  if(previous)for(const [id,alpha] of current){const delta=Math.abs(alpha-previous.get(id));maxStep=Math.max(maxStep,delta);if(delta>.002)changed.add(id);}
  previous=current;
  // Different light levels may be present on one physical wall.
  assert.ok(plan.every(p=>p.alpha>=.1&&p.alpha<=1&&p.rect.width>0&&p.rect.height>0));
  const ordered=[...plan].sort((a,b)=>a.rect.x-b.rect.x);
  for(let i=1;i<ordered.length;i++)assert.ok(ordered[i-1].rect.x+ordered[i-1].rect.width<=ordered[i].rect.x+.000001,'Sprite strips may touch but never overpaint a pixel.');
}
assert.ok(changed.size>=2,'Movement must exercise real corner visibility changes.');
assert.ok(maxStep<.12,`Wall tone must not jump by 75%: worst one-pixel frame delta ${maxStep}.`);
const paused=art.plan(back,game.player,vision,time);
for(let i=0;i<100;i++)assert.deepEqual(art.plan(back,game.player,vision,time),paused,'Paused render cannot advance wall lighting.');
const rememberedBefore=vision.stats.exploredTiles;
for(let i=0;i<100;i++)art.plan(back,game.player,vision,time);
assert.equal(vision.stats.exploredTiles,rememberedBefore,'Wall rendering cannot discover rooms.');
assert.deepEqual(art.plan(wall('unseen',200,200,100),game.player,vision,time),[],'No discovered segments means no wall sprite.');

// Horizontal and vertical strips include their raised tops and lower end cap
// once. They must remain disjoint for short scaled castle walls and huts.
for(const variant of ['castle-wall','hut-wall'])for(const angle of [0,Math.PI/2]){
  const prop=wall('test',0,0,90,angle,variant),vertical=angle!==0;
  const parts=Array.from({length:8},(_,i)=>({id:`test:${i}`,ax:vertical?0:-90+i*22.5,ay:vertical?-90+i*22.5:0,bx:vertical?0:-90+(i+1)*22.5,by:vertical?-90+(i+1)*22.5:0,r:14}));
  const stub={dungeon:{active:{}},knownWallSegments:()=>parts,isVisible:()=>true};
  const plan=art.plan(prop,{x:-200,y:-200},stub,0).sort((a,b)=>vertical?a.rect.y-b.rect.y:a.rect.x-b.rect.x);
  for(let i=1;i<plan.length;i++)assert.ok(vertical?plan[i-1].rect.y+plan[i-1].rect.height<=plan[i].rect.y+.000001:plan[i-1].rect.x+plan[i-1].rect.width<=plan[i].rect.x+.000001);
  if(vertical){assert.ok(plan[0].rect.y<-90);assert.ok(plan.at(-1).rect.y+plan.at(-1).rect.height>=90);}
  let previousAlpha=null,maxDelta=0;
  for(let y=-200;y<=200;y++){const alpha=wallOcclusionOpacity(prop,{x:0,y:y-19.8});if(previousAlpha!==null)maxDelta=Math.max(maxDelta,Math.abs(alpha-previousAlpha));previousAlpha=alpha;}
  assert.ok(maxDelta<.045,'Walking behind a wall fades continuously rather than switching to 40% alpha.');
}

// Native Canvas rectangular clips can antialias their common edge twice. The
// helper pixel-aligns all world-space strips with the same current transform.
const clips=[],draws=[],stack=[];let rects=[];
const ctx={globalAlpha:.8,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},beginPath(){rects=[];},rect(x,y,w,h){rects.push({x,y,w,h});},clip(){clips.push(rects);},getTransform(){return {a:2,b:0,c:0,d:2,e:37.31,f:18.47};}};
art.draw(ctx,back,game.player,vision,time,(target,prop)=>draws.push({alpha:target.globalAlpha,prop}));
assert.equal(ctx.globalAlpha,.8,'Caller alpha must be restored.');assert.ok(draws.length>0&&draws.length<=17);
for(const group of clips)for(const r of group){assert.ok(Math.abs((r.x*2+37.31)-Math.round(r.x*2+37.31))<1e-8);assert.ok(Math.abs(((r.x+r.w)*2+37.31)-Math.round((r.x+r.w)*2+37.31))<1e-8);}
console.log(`Wall render QA passed: one-pixel corner sweep, independent strips, no overpaint, paused lighting, hidden walls, smooth obstruction (max tone step ${maxStep.toFixed(3)}).`);
