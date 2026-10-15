import assert from 'node:assert/strict';
import {Island} from './dist/islands.js';
import {WORLD_IDS,worldNeighbors} from './dist/world-definitions.js';
import {Terrain} from './dist/terrain.js';
import {Environment,waterObstacleFootprint} from './dist/environment.js';
import {getWaterContours,waterIntersectsCapsule,waterIntersectsCircle} from './dist/water-geometry.js';
const TAU=Math.PI*2;
const inPolygon=(points,x,y)=>{let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};
const gameFor=(terrain,region)=>({terrain,region:{id:region},regionIndex:0,player:{x:0,y:-19.8,r:15},viewWidth:960,viewHeight:720});
let boundaryChecks=0,propsChecked=0,watersChecked=0,largeWaters=0;
const shapes=[];
// Authored forests have a bounded rectangle around an immutable baked land
// union. Their empty areas are solid ridges/deep water, not a procedural coast
// with a shallow wading band. Exercise that actual collision contract directly.
let authoredSamples=0;
for(const region of WORLD_IDS){
  const island=new Island({region});if(island.layout?.kind!=='rift-forest')continue;
  const layout=island.layout,b=island.bounds,copy=new Island({region,seed:29});
  assert.equal(copy.layout,layout);assert.deepEqual(copy.points,island.points);assert.equal(island.spawn,layout.spawn);assert.equal(island.plan,layout.plan);assert.equal(island.routes,layout.routes);
  assert.deepEqual(island.points,[{x:b.minX,y:b.minY},{x:b.maxX,y:b.minY},{x:b.maxX,y:b.maxY},{x:b.minX,y:b.maxY}]);
  assert.equal(island.shallowWidth,0);assert.equal(island.beachWidth,0);assert.equal(island.contour(0),island.points);
  if(region==='forest'){assert.equal(b.maxX-b.minX,7200);assert.equal(b.maxY-b.minY,5400);shapes.push(JSON.stringify(island.points));}
  for(const edge of island._edges){
    const x=(edge.a.x+edge.b.x)/2+edge.nx*45,y=(edge.a.y+edge.b.y)/2+edge.ny*45;
    assert(island.isDry(x,y,20));assert.equal(island.depthAt(x,y),0);
    const outside={x:(edge.a.x+edge.b.x)/2-edge.nx*25,y:(edge.a.y+edge.b.y)/2-edge.ny*25};
    assert.equal(island.contains(outside.x,outside.y),false);assert.equal(island.depthAt(outside.x,outside.y),1);
    const constrained=island.constrain(outside.x,outside.y,49);assert(constrained.blocked);assert(island.contains(constrained.x,constrained.y,49));boundaryChecks++;
  }
  const terrain=new Terrain({island,region,cacheLimit:24}),spawn=layout.spawn;
  assert(terrain.rift);assert(terrain.isFree(spawn.x,spawn.y,24),'the authored spawn must fit the actual player and companion bodies');
  assert(island.isReserved(spawn.x,spawn.y,24));
  // Independent even/odd polygon membership checks the full baked union, not
  // only the convenient centers used by the navigation graph.
  for(let x=b.minX+101;x<b.maxX;x+=241)for(let y=b.minY+83;y<b.maxY;y+=227){
    const expected=layout.boundaries.reduce((inside,ring)=>inside!==inPolygon(ring.points,x,y),false);
    assert.equal(terrain.rift.circleFree(x,y,0),expected,`${region} baked land at ${x},${y}`);
    if(!expected)assert.equal(terrain.isFree(x,y,15),false,'a body cannot enter a masked-out ridge or deep-water region');
    authoredSamples++;
  }
  for(const route of island.routes){
    assert(island.containsCapsule(route.ax,route.ay,route.bx,route.by,15));
    assert.equal(terrain.rift.firstBlocker(route.ax,route.ay,route.bx,route.by,15),null,'authored centerline links fit a complete player body inside the baked walkable union');
  }
  const envGame=gameFor(terrain,region);envGame.player.x=spawn.x;envGame.player.y=spawn.y-19.8;
  const environment=new Environment(envGame,{generation:false});
  for(let x=-9;x<=8;x++)for(let y=-9;y<=8;y++)assert.equal(environment._mudAt(x,y),null,'procedural pools cannot repaint or close authored passages');
  assert.equal(environment.getImmersion(envGame.player,true),null);assert.equal(environment.movementMultiplier(envGame.player,true),1);
  const hit=terrain.moveCircle(spawn.x,spawn.y,20000,0,15);assert(hit.blocked);assert(terrain.isFree(hit.x,hit.y,15));assert(island.contains(hit.x,hit.y,15));
}
assert(authoredSamples>1000);
for(const region of ['marsh','ruins']){
  const island=new Island({region});shapes.push(JSON.stringify(island.points));
  assert.deepEqual(new Island({region}).points,island.points);
  assert(island.bounds.maxX-island.bounds.minX>7000&&island.bounds.maxX-island.bounds.minX<9500);
  assert(island.isDry(0,0,260));assert.equal(island.depthAt(0,0),0);
  // Ray-cast is independent from the production angular-sector classifier.
  for(let i=0;i<island.points.length;i++){
    const a=island.points[i],b=island.points[(i+1)%island.points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
    for(const t of [.04,.3,.5,.96])for(const inset of [-25,-.1,.1,10,50,100,180]){
      const x=a.x+(b.x-a.x)*t+nx*inset,y=a.y+(b.y-a.y)*t+ny*inset;
      assert.equal(island.contains(x,y),inPolygon(island.points,x,y),`${region} edge inclusion ${i}/${t}/${inset}`);boundaryChecks++;
    }
    const x=(a.x+b.x)*.5+nx*45,y=(a.y+b.y)*.5+ny*45;
    assert(island.contains(x,y,20));assert(!island.isDry(x,y,20));assert(island.depthAt(x,y)>0);
    const relocated=island.constrain((a.x+b.x)*.5-nx*900,(a.y+b.y)*.5-ny*900,49);
    assert(relocated.blocked);assert(island.contains(relocated.x,relocated.y,49));
  }
  assert(!island.contains(Infinity,0));assert(!island.contains(0,0,-1));
  assert.equal(Object.keys(island.plan).filter(k=>k.startsWith('portal:')).length,worldNeighbors(island.worldId).length);
  for(const p of Object.values(island.plan)){assert(island.isDry(p.x,p.y,p.r));assert(island.isReserved(p.x,p.y));}
  for(const p of island.routes)assert(island.containsCapsule(p.ax,p.ay,p.bx,p.by,p.r,island.shallowWidth),'entire wide planned route must be dry');
  const terrain=new Terrain({island,region,cacheLimit:24}),props=terrain.query(-5200,-5200,5200,5200);
  for(const p of props){const f=waterObstacleFootprint(p);assert(island.containsCapsule(f.ax,f.ay,f.bx,f.by,f.r,island.shallowWidth),'full natural ground footprint on dry land');assert(!island.isReservedCapsule(f.ax,f.ay,f.bx,f.by,f.r));propsChecked++;}
  const signature=terrain.query(-1300,-1300,1300,1300);
  for(let i=0;i<160;i++)terrain.query(i*620,-i*540,i*620+400,-i*540+400);
  assert(terrain.cacheSize<=24);assert.deepEqual(terrain.query(-1300,-1300,1300,1300),signature);
  assert.equal(terrain.query(9000,9000,10000,10000).length,0);
  const environment=new Environment(gameFor(terrain,region),{generation:false});
  for(let x=-9;x<=8;x++)for(let y=-9;y<=8;y++){
    const mud=environment._mudAt(x,y);if(!mud)continue;watersChecked++;if(mud.scale===3.6)largeWaters++;
    const ring=getWaterContours(mud).outer;
    for(let j=0;j<ring.length;j++){const a=ring[j],b=ring[(j+1)%ring.length];assert(island.containsCapsule(a.x,a.y,b.x,b.y,8,island.shallowWidth),'whole pond and bank stay inside dry land');}
    for(const p of Object.values(island.plan))assert(!waterIntersectsCircle(mud,p.x,p.y,p.r+8));
    for(const p of island.routes)assert(!waterIntersectsCapsule(mud,p.ax,p.ay,p.bx,p.by,p.r+8));
  }
  assert(environment._waterCandidates.size<=192);
  // No-prop early-return must still sweep the coast; test ordinary movement,
  // extreme knockback and tangential sliding without a collision obstacle.
  const empty=new Terrain({island,obstacles:[]});
  const hit=empty.moveCircle(0,0,20000,0,15);assert(hit.blocked&&island.contains(hit.x,hit.y,15));assert(hit.x<island.bounds.maxX);
  let moving={x:hit.x,y:hit.y};for(let j=0;j<100;j++){moving=empty.moveCircle(moving.x,moving.y,8,4,15);assert(island.contains(moving.x,moving.y,15));}
  assert(moving.y-hit.y>100,'coast input should slide rather than pin the actor');
  const e=island._edges[27],p={x:(e.a.x+e.b.x)*.5+e.nx*45,y:(e.a.y+e.b.y)*.5+e.ny*45};
  const g=gameFor(empty,region);g.player.x=p.x;g.player.y=p.y-19.8;
  const env=new Environment(g,{generation:false}),immersion=env.getImmersion(g.player,true);
  assert(immersion?.mud.type==='shore'&&immersion.depth>0&&immersion.sink<=16);assert(env.movementMultiplier(g.player,true)<1);
  assert.equal(env.getImmersion({...g.player,flying:true},false),null);assert.equal(env.movementMultiplier({...g.player,type:'bat'},false),1);
}
assert.equal(new Set(shapes).size,3);assert(watersChecked>40);assert(largeWaters>0);
// A chord across a concave marsh bay may connect two land points while crossing
// deep sea. Swept movement must meet the near shore instead of teleporting.
const marsh=new Island({region:'marsh'}),empty=new Terrain({island:marsh,obstacles:[]});let bay=null;
for(let i=0;i<128&&!bay;i++)for(let j=3;j<48&&!bay;j++){
  const a=marsh.points[i],b=marsh.points[(i+j)%128],p={x:a.x*.988,y:a.y*.988},q={x:b.x*.988,y:b.y*.988};
  if(marsh.contains(p.x,p.y,15)&&marsh.contains(q.x,q.y,15)&&!marsh.containsCapsule(p.x,p.y,q.x,q.y,15)&&Array.from({length:19},(_,k)=>(k+1)/20).some(t=>!inPolygon(marsh.points,p.x+(q.x-p.x)*t,p.y+(q.y-p.y)*t)))bay={p,q};
}
assert(bay,'fixture should exercise a real concave coast');
const result=empty.moveCircle(bay.p.x,bay.p.y,bay.q.x-bay.p.x,bay.q.y-bay.p.y,15);assert(result.blocked);assert(marsh.contains(result.x,result.y,15));assert(Math.hypot(result.x-bay.q.x,result.y-bay.q.y)>2,'long movement cannot skip the bay');
console.log(JSON.stringify({islands:'passed',boundaryChecks,propsChecked,watersChecked,largeWaters,authoredSamples,coastalWorlds:2,configuredWorlds:WORLD_IDS.length}));
