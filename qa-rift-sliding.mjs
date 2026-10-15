import assert from 'node:assert/strict';
import { RiftCollision, slideCircleContacts, sweepCircleVsCapsule } from './dist/rift-collision.js';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';

const point=([x,y])=>({x,y}),length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const polygon=points=>new RiftCollision({boundaries:[points.map(point)]});
const near=(a,b,tolerance=1e-6)=>assert(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
let checkedLegs=0,cases=0;
function verify(collision,start,result,r,budget,profile='ground',hooks={}){
  assert(collision.circleFree(result.x,result.y,r,profile),'the complete body remains free');
  assert(hooks.circleFree?.(result.x,result.y,r)??true);
  const path=result.path??[start,result];let distance=0;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];distance+=length(a,b);checkedLegs++;
    assert.equal(collision.firstBlocker(a.x,a.y,b.x,b.y,r,profile),null,'no retained leg crosses the outline');
    assert(!hooks.firstBlocker?.(a.x,a.y,b.x,b.y,r),'no retained leg crosses an independent capsule');
  }
  assert(distance<=budget+1e-6,'sliding cannot create additional travel');
  if(result.distance!==undefined)near(result.distance,distance);
  cases++;return result;
}

// Analytic TOI controls: finite face, circular cap and a degenerate trunk.
const vertical={a:{x:0,y:-100},b:{x:0,y:100},r:0};
near(sweepCircleVsCapsule(-30,0,30,0,10,vertical).time,1/3);
const trunk={a:{x:0,y:0},b:{x:0,y:0},r:5};
near(sweepCircleVsCapsule(-30,0,30,0,10,trunk).time,.25);
const tangent=sweepCircleVsCapsule(-15,0,-15,20,10,trunk);assert.equal(tangent,null);
assert.equal(sweepCircleVsCapsule(-15,0,-30,0,10,trunk),null,'moving away is unrestricted');
near(sweepCircleVsCapsule(-15,0,0,0,10,trunk).time,0);
near(sweepCircleVsCapsule(-30,0,30,0,0,vertical).time,.5);

// This exact local kink used to depend on its position in the spatial grid.
// Rotations, ring starts, winding and translations preserve the same motion.
const kink=[[100,35],[10.28,18.22],[2.37,4.34],[0,0],[-33.94,8.52],[-100,25],[-100,-100],[100,-100]];
const base={x:-4.33582264870347,y:-14.397598673355105},step=220/60;
let reference=null;
for(let rotation=0;rotation<16;rotation++)for(const offset of [0,100,384,-400])for(const reverse of [false,true]){
  const angle=rotation*Math.PI/8,c=Math.cos(angle),s=Math.sin(angle),transform=p=>({x:p.x*c-p.y*s+offset,y:p.x*s+p.y*c+offset});
  let points=kink.map(point);if(reverse)points.reverse();
  const seam=(rotation+Number(reverse)*3)%points.length;points=[...points.slice(seam),...points.slice(0,seam)].map(transform);
  const collision=new RiftCollision({boundaries:[points]}),start=transform(base),dx=step*c,dy=step*s;
  const moved=verify(collision,start,collision.step(start.x,start.y,start.x+dx,start.y+dy,15),15,step);
  const advance={x:(moved.x-start.x)*c+(moved.y-start.y)*s,y:-(moved.x-start.x)*s+(moved.y-start.y)*c};
  assert(advance.x>3.3,'a legal forward tangent must not freeze');
  if(!reference)reference=advance;else {near(advance.x,reference.x);near(advance.y,reference.y);}
}

// Collinear subdivisions and the final-to-first ring seam add no contacts.
for(const split of [false,true]){
  const top=(split?[100,0,-16.97,-33.94,-100]:[100,0,-33.94,-100]).map(x=>[x,-x*.25103]);
  const collision=polygon([...top,[-100,-100],[100,-100]]);
  const moved=verify(collision,base,collision.step(base.x,base.y,base.x+step,base.y,15),15,step);
  assert(moved.x-base.x>3.3);
}

// A real concave room corner retains both blocking faces; no automatic escape.
for(const r of [8,15,28,49])for(const distance of [2,6,40,400]){
  const collision=polygon([[0,0],[200,0],[200,200],[0,200]]),start={x:200-r-1,y:200-r-1};
  const moved=verify(collision,start,collision.step(start.x,start.y,start.x+distance,start.y+distance,r),r,distance*Math.SQRT2);
  assert(moved.x<=200-r+1e-6&&moved.y<=200-r+1e-6);
  assert(moved.x>=start.x&&moved.y>=start.y);
}

// A true 40-unit neck admits a fitting body and still rejects a larger one.
const neck=polygon([[0,0],[250,0],[250,80],[350,80],[350,0],[600,0],[600,200],[350,200],[350,120],[250,120],[250,200],[0,200]]);
for(const r of [15,20,25,49]){
  const start={x:150,y:100},moved=verify(neck,start,neck.step(start.x,start.y,500,100,r),r,350);
  if(r<=20)near(moved.x,500);else assert(moved.x<=250-Math.sqrt(r*r-20*20)+1e-6);
}

// Small repeated protrusions are real outlines, not holes in a row of props.
const teeth=Array.from({length:81},(_,i)=>[i*6,40+(i%2)*2]);
const serrated=polygon([...teeth,[480,200],[0,200]]);let at={x:30,y:75};
for(let i=0;i<150;i++){
  const next=serrated.step(at.x,at.y,at.x+step,at.y-1.2,15);
  verify(serrated,at,next,15,Math.hypot(step,1.2));at=next;
}
assert(at.x>450,'holding forward against many short sloped edges keeps advancing');

// Ground water edges remain solid for walkers and absent from the high mask.
const outside=[[0,0],[600,0],[600,300],[0,300]].map(point),water=[[250,100],[350,100],[350,200],[250,200]].map(point);
const height=new RiftCollision({boundaries:[outside,water],solidBoundaries:[outside]});
for(const profile of ['ground','air','projectile','sight','overhead']){
  const start={x:100,y:150},moved=verify(height,start,height.step(100,150,500,150,15,profile),15,400,profile);
  if(profile==='ground')assert(moved.x<=235.001);else near(moved.x,500);
}

function capsuleHooks(capsules){
  const closest=(p,o)=>{const dx=o.b.x-o.a.x,dy=o.b.y-o.a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-o.a.x)*dx+(p.y-o.a.y)*dy)/d)):0;return {x:o.a.x+t*dx,y:o.a.y+t*dy};};
  return {
    circleFree:(x,y,r)=>capsules.every(o=>length({x,y},closest({x,y},o))>=r+o.r-.001),
    firstBlocker:(ax,ay,bx,by,r)=>capsules.find(o=>sweepCircleVsCapsule(ax,ay,bx,by,Math.max(0,r-.001),o)),
    firstContact:(ax,ay,bx,by,r)=>{
      const hits=capsules.map(o=>sweepCircleVsCapsule(ax,ay,bx,by,r,o)).filter(Boolean);if(!hits.length)return null;
      const time=Math.min(...hits.map(h=>h.time));return {time,contacts:hits.filter(h=>Math.abs(h.time-time)<=1e-8)};
    },
    contacts:(x,y,r)=>capsules.flatMap(o=>{const q=closest({x,y},o),d=length({x,y},q);return d>1e-12&&d<=r+o.r+.00004?[{nx:(x-q.x)/d,ny:(y-q.y)/d,edge:o}]:[];})
  };
}

// Boundary + independent gate post contacts must be solved together. A second
// contact cannot erase the first wall constraint or spend another move budget.
for(const start of [{x:60,y:30},{x:70,y:30}]){
  const room=polygon([[0,0],[200,0],[200,200],[0,200]]),wall={a:{x:100,y:0},b:{x:100,y:150},r:10},hooks=capsuleHooks([wall]);
  const moved=verify(room,start,room.step(start.x,start.y,start.x+40,start.y-40,15,'ground',hooks),15,40*Math.SQRT2,'ground',hooks);
  assert(moved.x<=75.000001&&moved.y>=14.999999);
  near(moved.x,75,.0001);near(moved.y,15,.0001);
}
const standaloneHooks=capsuleHooks([vertical]),from={x:-30,y:0};
const standalone=slideCircleContacts(-30,0,30,30,10,standaloneHooks);
assert(standalone.x<=-10&&standalone.y>29.99);assert(standalone.distance<=Math.hypot(60,30));
const overhead=polygon([[0,0],[200,0],[200,200],[0,200]]).step(-30,0,30,30,10,'overhead',standaloneHooks);
assert(overhead.x<=-10&&overhead.y>29.99,'external hooks remain active when the outline profile has no mask');

// Keep the pre-existing sub-millimetre placement tolerance without trapping
// a legal body that is moving tangent to, or away from, its touching face.
const tolerant=polygon([[0,0],[200,0],[200,200],[0,200]]),touching={x:50,y:15-.0005};
for(const delta of [{x:5,y:0},{x:0,y:5},{x:5,y:-1}]){
  assert(tolerant.circleFree(touching.x,touching.y,15));
  const moved=verify(tolerant,touching,tolerant.step(touching.x,touching.y,touching.x+delta.x,touching.y+delta.y,15),15,Math.hypot(delta.x,delta.y));
  if(delta.x)near(moved.x-touching.x,delta.x);assert(moved.y>=touching.y-1e-8);
}

// Exercise Terrain's production hook assembly rather than only callbacks in
// this test. A tree/rock touches the outline; a closed gate uses a capsule.
// Read speeds from complete current character stats, including the strongest
// existing movement upgrade/relic/debug combination rather than a guessed cap.
const movementCases=[
  {id:'standard',hero:'traveler',debug:false},
  {id:'debug',hero:'traveler',debug:true},
  {id:'grown-princess-debug',hero:'princess',debug:true,grown:true}
].map(spec=>{
  const game=new Game({mode:'world',hero:spec.hero,debug:spec.debug,debugOptions:{fastMovement:spec.debug,testFacilities:false}});
  if(spec.grown){game.levels.speed=4;game.relics.acquire('swiftFeather');game._refreshStats();}
  return {...spec,game,speed:game.player.speed};
});
assert.equal(movementCases[0].speed,320);assert.equal(movementCases[1].speed,960);
assert(movementCases[2].speed>movementCases[1].speed,'grown princess exercises the faster real movement combination');
const frameLengths=[1/30,1/60,1/120,.04];
for(const {speed} of movementCases)for(const type of ['tree','rock','gate'])for(const r of [8,15,28])for(const frameLength of frameLengths){
  const spec=type==='gate'?{type:'log',variant:'rift-gate',structureId:'test-gate',x:100,y:75,angle:Math.PI/2,halfLength:75,r:10}:{type,x:100,y:30,r:10,heightBand:'high'};
  const mixed=new Terrain({obstacles:[spec]});mixed.rift=polygon([[0,0],[200,0],[200,200],[0,200]]);
  let at={x:55,y:r+2};const step=speed*frameLength/Math.SQRT2;
  assert(mixed.isFree(at.x,at.y,r));
  for(let i=0;i<60;i++){
    const next=mixed.moveCircle(at.x,at.y,step,-step,r);
    assert(mixed.isFree(next.x,next.y,r),'mixed Terrain contacts keep the complete body free');
    assert(length(at,next)<=speed*frameLength+1e-6,'mixed Terrain contacts preserve the frame budget');
    assert(next.y>=r-.001,'the outline stays solid while sliding against a prop');
    if(type==='gate'||r>=10)assert(next.x<100,'closed gate and attached solid props are not crossed');at=next;
  }
  assert(at.x>55,'contact solver consumes a legal partial approach');cases++;
}

// Large knockback-style requests cannot tunnel through an independent gate.
const gateTerrain=new Terrain({obstacles:[{type:'log',variant:'rift-gate',structureId:'test-gate',x:250,y:150,angle:Math.PI/2,halfLength:150,r:10}]});
gateTerrain.rift=polygon([[0,0],[500,0],[500,300],[0,300]]);
const stopped=gateTerrain.moveCircle(50,150,400,0,15);
assert(stopped.blocked&&stopped.x<=225.000001&&gateTerrain.isFree(stopped.x,stopped.y,15));

// A long horizontal request follows a diagonal outline far outside its
// original narrow AABB. The next trunk must enter the refreshed broad phase.
const slopeY=x=>1000-x-15*Math.SQRT2-.02;
const longSlide=new Terrain({obstacles:[{type:'tree',x:400,y:slopeY(400),r:30}]});
longSlide.rift=polygon([[0,0],[1000,0],[0,1000]]);
const longStart={x:100,y:slopeY(100)},longEnd=longSlide.moveCircle(longStart.x,longStart.y,800,0,15);
assert(longEnd.y<longStart.y-200,'the actual slide leaves its original straight broad phase');
assert(longEnd.x<400&&longSlide.isFree(longEnd.x,longEnd.y,15),'the newly encountered trunk stays solid');
assert(length(longStart,longEnd)<=800,'a refreshed broad phase preserves the original budget');

// Exact authored-map regression at the current standard and boosted speeds.
// Keep the same spatial replay budget, so faster cases exercise this corner
// rather than reaching an unrelated obstacle farther along the world.
const terrain=movementCases[0].game.terrain,edge=terrain.rift.ground.edges.find(e=>e.id==='rift:ground:0:5');
assert.equal(movementCases[0].game.debug,false);
for(const {speed} of movementCases)for(const r of [8,13,15,20,28,49])for(const profile of ['ground','air'])for(const dt of frameLengths){
  const start={x:edge.a.x+(edge.b.x-edge.a.x)*.02+edge.nx*(r+.02),y:edge.a.y+(edge.b.y-edge.a.y)*.02+edge.ny*(r+.02)},delta=speed*dt;
  assert(terrain.isFree(start.x,start.y,r,profile));
  const moved=verify(terrain.rift,start,terrain.rift.step(start.x,start.y,start.x+delta,start.y,r,profile),r,delta,profile);
  assert(moved.x-start.x>delta*.8,'different body sizes and frame lengths slide at this corner');
}
const replays=[];
for(const {id,game:g,speed} of movementCases)for(const dt of frameLengths){
  g.player.x=-2230.3458226487037;g.player.y=-1574.447598673355-groundOffset(g.player,true);
  const initial=g.player.x;
  for(let remaining=440;remaining>1e-8;){
    const budget=Math.min(speed*dt,remaining),x=g.player.x,y=g.player.y+groundOffset(g.player,true),result=g._moveEntity(g.player,budget,0,true);
    assert(g.terrain.isFree(result.x,result.y,g.player.r));assert(length({x,y},result)<=budget+1e-6);
    remaining-=budget;
  }
  assert(g.player.x-initial>400,`${id}/${dt}: the real player no longer freezes at the authored corner`);
  replays.push({id,speed,dt,advance:g.player.x-initial});
}
console.log(JSON.stringify({riftSliding:'passed',cases,checkedLegs,bodyRadii:[8,13,15,20,28,49],frameLengths,replays,coverage:'swept face and radial cap TOI; translation, winding and seams; short protrusions; simultaneous outline and capsule contacts; real concave stops; narrow passages; original height profiles; current standard/debug/grown movement and finite travel budget'}));
