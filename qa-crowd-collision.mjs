import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { RiftCollision } from './dist/rift-collision.js';

const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
const countQueries=terrain=>{
  let calls=0;const query=terrain.query.bind(terrain);
  terrain.query=(...args)=>{calls++;return query(...args);};
  return ()=>calls;
};

// A bounded separation query keeps the old high-ID order and stops reading
// the bucket immediately. Ordinary combat queries still return every actor.
const probe=Object.create(Game.prototype);probe._cell=100;
const actors=Array.from({length:320},(_,i)=>({id:i+1,type:'slime'}));let visits=0;
probe._grid=new Map([['0,0',{*[Symbol.iterator](){for(const actor of actors){visits++;yield actor;}}}]]);
const scratch=['old'],found=probe._nearby(50,50,0,{afterId:5,limit:9,result:scratch});
assert.equal(found,scratch);assert.deepEqual(found,actors.slice(5,14));assert.equal(visits,14);
visits=0;assert.equal(probe._nearby(50,50,0).length,320);assert.equal(visits,320);
const deer={id:1,type:'boss',bossKind:'frostcrown'},plain={id:2,type:'slime'};
probe._grid=new Map([['0,0',[deer]],['0,1',[deer,plain]]]);
assert.deepEqual(probe._nearby(50,100,50,{afterId:0,limit:2}),[deer,plain],'multi-cell body consumes one candidate slot');

// Repeated pushes retain exact movement while avoiding broad queries for
// every start/sweep. Test both independent obstacles and combined outlines.
let cachedQueries=0,uncachedQueries=0;
for(const outlined of [false,true])for(const profile of ['ground','air']){
  const make=()=>{
    const t=new Terrain({obstacles:[{type:'log',x:100,y:75,halfLength:75,angle:Math.PI/2,r:10,heightBand:'high'},{type:'rock',x:40,y:85,r:12,heightBand:'low'}]});
    if(outlined)t.rift=new RiftCollision({boundaries:[[[0,0],[200,0],[200,200],[0,200]].map(([x,y])=>({x,y}))]});
    return t;
  };
  const cached=make(),original=make(),cachedCount=countQueries(cached),originalCount=countQueries(original),cache={};
  let a={x:55,y:35},b={...a};
  for(let i=0;i<120;i++){
    a=cached.moveCircle(a.x,a.y,.65,-.3,15,profile,cache);
    b=original.moveCircle(b.x,b.y,.65,-.3,15,profile);
    close(a.x,b.x);close(a.y,b.y);assert.equal(a.blocked,b.blocked);
  }
  cachedQueries+=cachedCount();uncachedQueries+=originalCount();
  assert(cached.isFree(a.x,a.y,15,profile));
}
assert(cachedQueries<uncachedQueries/10,'dense local pushes reuse the broad phase');

// Coverage, radius, movement height, terrain replacement and live structures
// all invalidate safely; never reuse a stale obstacle-free neighborhood.
const cache={},terrain=new Terrain({obstacles:[]});
terrain.moveCircle(0,0,1,0,15,'ground',cache);
terrain.setStructures([{type:'log',x:40,y:0,halfLength:100,angle:Math.PI/2,r:10}]);
let moved=terrain.moveCircle(1,0,80,0,15,'ground',cache);assert(moved.x<=15.001);
terrain.setStructures([]);moved=terrain.moveCircle(1,0,80,0,15,'ground',cache);close(moved.x,81);
const low=new Terrain({obstacles:[{type:'rock',x:400,y:0,r:15,heightBand:'low'}]});
low.moveCircle(0,0,1,0,15,'ground',cache);
moved=low.moveCircle(340,0,90,0,15,'ground',cache);assert(moved.x<=370.001,'leaving the cached neighborhood finds the next obstacle');
moved=low.moveCircle(340,0,90,0,15,'air',cache);close(moved.x,430);
moved=low.moveCircle(340,0,90,0,25,'ground',cache);assert(moved.x<=360.001);
const high=new Terrain({obstacles:[{type:'tree',x:40,y:0,r:15}]});
moved=high.moveCircle(0,0,80,0,15,'air',cache);assert(moved.x<=10.001,'a replacement terrain cannot inherit another terrain cache');
moved=high.moveCircle(40,0,0,0,15,'ground',cache);assert(high.isFree(moved.x,moved.y,15),'overlapping starts retain the full correction path');

// Compare a complete dense-horde frame with the former unbounded-query /
// uncached-movement behavior, including all sequential pair displacements.
function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[{type:'rock',x:480,y:430,r:24}]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.enemies=[];g._spawn=g.nextBossAt=g.player.xpNext=g.crystalsNext=Infinity;
  for(const id of ['sword','arrow','orbit'])g.build.setEquipped(id,false);
  for(let i=0;i<300;i++)g.enemies.push({id:i+1,type:'slime',x:400+i%18*2,y:400+Math.floor(i/18)*2,r:12,hp:10000,maxHp:10000,speed:0,damage:1,hit:0,phase:0,attackCooldown:0,guardActive:true});
  return g;
}
const fast=arena(),reference=arena();
reference._nearby=function(x,y,r,options){
  const all=Game.prototype._nearby.call(this,x,y,r);
  return options?all.filter(e=>e.id>options.afterId).slice(0,options.limit):all;
};
reference._moveEntity=function(e,dx,dy,isPlayer=false){return Game.prototype._moveEntity.call(this,e,dx,dy,isPlayer);};
const fastQueries=countQueries(fast.terrain),referenceQueries=countQueries(reference.terrain);
fast.update(1/60);reference.update(1/60);
const fastCalls=fastQueries(),referenceCalls=referenceQueries();
assert.equal(fast.enemies.length,300);assert.equal(reference.enemies.length,300);
for(let i=0;i<300;i++){
  const a=fast.enemies[i],b=reference.enemies[i];close(a.x,b.x);close(a.y,b.y);assert.equal(a.hp,b.hp);
  assert(fast.terrain.isFree(a.x,a.y+groundOffset(a),a.r),'crowd displacement remains outside terrain');
}
assert(fastCalls<referenceCalls/2,'a complete crowd frame performs materially fewer terrain queries');
console.log(JSON.stringify({crowdCollision:'passed',boundedCandidates:9,localPushQueries:{cached:cachedQueries,uncached:uncachedQueries},denseFrameQueries:{cached:fastCalls,uncached:referenceCalls},enemies:300}));
