import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';

const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
function arena(){
  const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  game.enemies=[];return game;
}
const enemy=(id,x,y=0,extra={})=>({id,type:'slime',x,y,r:12,hp:100,maxHp:100,speed:0,guardActive:false,...extra});
function measured(game){
  let queries=0;const nearby=game._nearby.bind(game);
  game._nearby=(x,y,r,options)=>{if(options?.limit===9)queries++;return nearby(x,y,r,options);};
  return ()=>queries;
}
const addDistantSleepers=game=>{for(let i=0;i<20;i++)game.enemies.push(enemy(100+i,1500+i*5,1800));};

// Both ID orders must push the mover out of a stationary body. A naive
// "only query moving actors" change loses the lower-ID stationary owner.
for(const lowerStationaryId of [true,false])for(const kind of ['sleeping','frozen','charging','boss','dummy']){
  const game=arena(),staticActor=enemy(lowerStationaryId?1:2,0),moving=enemy(lowerStationaryId?2:1,8,0,{guardActive:true});
  if(kind!=='sleeping')staticActor.guardActive=true;
  if(kind==='frozen')game.abilities.statuses.set(staticActor,{frozenUntil:100});
  if(kind==='charging')staticActor.charge={};
  if(kind==='boss')staticActor.type='boss';
  if(kind==='dummy')staticActor.trainingDummy=true;
  game.enemies=[staticActor,moving];addDistantSleepers(game);game._rebuildGrid();
  const queries=measured(game);game._separateEnemies(1/60);
  close(staticActor.x,0);close(staticActor.y,0);close(moving.x,8.25);close(moving.y,0);
  assert(queries()<=2,`${kind}: distant stationary actors do not issue crowd queries`);
  assert(game._nearby(1500,1800,100).some(e=>e.id===100),'sleepers remain in ordinary combat queries');
  game.dispose('test-complete');
}

// Recompute eligibility and cells on each pass: activation, freeze/thaw,
// externally applied displacement and scene replacement cannot leave stale
// masks that make a nearby moving actor pass through a sleeping one.
{
  const game=arena(),stationary=enemy(1,0),moving=enemy(2,8);game.enemies=[stationary,moving];addDistantSleepers(game);
  const queries=measured(game);game._rebuildGrid();game._separateEnemies(1/60);assert.equal(queries(),0);
  moving.guardActive=true;game._separateEnemies(1/60);close(moving.x,8.25);
  game.abilities.statuses.set(moving,{frozenUntil:100});const before=queries();game._separateEnemies(1/60);assert.equal(queries(),before);
  game.abilities.statuses.delete(moving);moving.x=2000;stationary.x=1992;game._rebuildGrid();game._separateEnemies(1/60);close(moving.x,2000.25);
  game.enemies=[enemy(5,-9,0,{guardActive:true}),enemy(6,0)];game._rebuildGrid();game._separateEnemies(1/60);close(game.enemies[0].x,-9.25);
  game.dispose('test-complete');
}

// Real world update, not an artificial all-frozen fixture. Count only crowd
// candidate queries; the rest of combat/territory activation continues normally.
const world=new Game({mode:'world'}),queries=measured(world);
const initialCount=world.enemies.length;
const distant=world.enemies.filter(e=>e.guardActive===false&&Math.hypot(e.x-world.player.x,e.y-world.player.y)>1200);
const positions=distant.map(e=>({actor:e,x:e.x,y:e.y}));
let formerQueries=0;
for(let frame=0;frame<120;frame++){
  formerQueries+=world.enemies.filter(e=>e.hp>0).length;
  world.update(1/60,{x:0,y:0});
}
assert(distant.length>80,'the probe exercises a populated world with distant territories');
assert(queries()<formerQueries/10,'idle exploration removes almost all no-op crowd queries');
for(const {actor,x,y} of positions){close(actor.x,x);close(actor.y,y);assert.equal(actor.guardActive,false);}
assert.equal(world.enemies.length,initialCount,'optimization does not remove actors');
world.dispose('test-complete');
console.log(JSON.stringify({sleepingCrowd:'passed',frames:120,enemies:initialCount,distantSleeping:distant.length,separationQueries:{before:formerQueries,after:queries()},note:'Call counts, not phone timing or energy measurements.'}));
