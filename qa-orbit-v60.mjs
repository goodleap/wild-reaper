import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { weaponStats } from './dist/combat-stats.js';
import { PropArt } from './dist/prop-art.js';

function arena(rank=1) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.player.x=0;g.player.y=0;
  g.levels.orbit=rank;g.build.setEquipped('sword',false);g._syncEvolutions(false);
  g._spawn=g._shot=g._pulse=g._lightning=g.nextBossAt=Infinity;
  g.player.xpNext=g.crystalsNext=g.player.invuln=Infinity;g._updatePressure=()=>{};
  return g;
}

for(let rank=1;rank<=5;rank++) {
  const g=arena(rank),stats=weaponStats(g,'orbit');g.attacks.updateOrbit();
  assert.equal(g.orbitals.length,rank+1,'each rank adds one actual blade');
  assert.equal(stats.count,rank+1);assert.equal(stats.radius,74);assert.equal(stats.rotationSpeed,2.9);assert.equal(stats.propHitInterval,.42);
}

// Compare the sprite tip with the real finite-difference path, including both
// phases of the evolved expansion. Drawing time and reduced motion cannot
// rotate the blade away from this simulated direction.
const art=new PropArt();art._frame=()=>({canvas:{},ox:20,oy:22,w:40,h:44});
function drawnTip(blade,options) {
  let angle;const ctx={save(){},restore(){},translate(){},scale(){},drawImage(){},rotate(value){angle=value;}};
  assert(art.drawBlade(ctx,blade,options));return {x:Math.sin(angle),y:-Math.cos(angle)};
}
for(const rank of [1,5])for(const time of [.18,.44,.71,1.4]) {
  const g=arena(rank);g._clock=time;g.attacks.updateOrbit();const before=g.orbitals;
  g._clock=time+1e-5;g.attacks.updateOrbit();
  before.forEach((blade,index)=>{
    const next=g.orbitals[index],dx=next.x-blade.x,dy=next.y-blade.y,length=Math.hypot(dx,dy);
    for(const options of [{time:0},{time:100},{time:100,reduced:true},{time:100,dense:true}]) {
      const tip=drawnTip(blade,options);
      assert((tip.x*dx+tip.y*dy)/length>.999999,'tip remains tangent, without an independent spin');
    }
  });
}
const fallback=drawnTip({x:74,y:0,angle:0},{time:100,reduced:true});
assert(Math.abs(fallback.x)<1e-8&&fallback.y>.999,'legacy unannotated blades point along the orbit too');

// A giant target overlaps every knife continuously. Each knife enters once;
// it cannot repeatedly damage merely because another simulation tick passed.
const g=arena(5),victims=[-5,5].map(x=>{
  const enemy=g._spawnEnemy('boss');Object.assign(enemy,{x,y:0,r:160,hp:1e6,maxHp:1e6,speed:0,bossKind:null,slamCooldown:Infinity,damage:0});return enemy;
});
g._nearby=()=>victims;
const hits=new Map(victims.map(e=>[e.id,[]])),hit=g._hitEnemy.bind(g);
g._hitEnemy=(enemy,amount,push,origin,source)=>{if(source==='orbit')hits.get(enemy.id).push(g._clock);return hit(enemy,amount,push,origin,source);};
for(let i=0;i<160;i++)g.update(.025);
for(const times of hits.values())assert.equal(times.length,6,'each of the six knives damages once during continuous contact');
assert.deepEqual(hits.get(victims[0].id),hits.get(victims[1].id),'contact bookkeeping is independent for each victim');
const count=[...hits.values()].reduce((n,list)=>n+list.length,0);
g.attacks.updateOrbit();g.attacks.updateOrbit();
assert.equal([...hits.values()].reduce((n,list)=>n+list.length,0),count,'render refreshes at the same simulation time cannot re-hit');
console.log('Orbit QA passed: six-blade density, actual path tangents, motion modes and independent per-blade contact damage');
