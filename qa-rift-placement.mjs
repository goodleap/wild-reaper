import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { placementAllowed } from './dist/placement-rules.js';
import { getConfigSection } from './dist/content-config.js';

const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let movementSteps=0,claimed=0;
function walk(g,target){
  const navigation=terrainNavigation(g.terrain);
  for(let legs=0;distance(foot(g),target)>.02&&legs<80;legs++){
    const path=navigation.find(foot(g),target,g.player.r,'ground');
    assert(path?.length,`walking route to ${target.id??JSON.stringify(target)}`);
    for(const waypoint of path){
      for(let step=0;distance(foot(g),waypoint)>.02&&step<3000;step++){
        const before=foot(g),d=distance(before,waypoint),travel=Math.min(11,d);
        g._moveEntity(g.player,(waypoint.x-before.x)/d*travel,(waypoint.y-before.y)/d*travel,true);
        const after=foot(g);
        assert(distance(before,after)>.001,'ordinary movement must progress, not rely on teleport recovery');
        assert(distance(before,after)<=travel+.05,'walking cannot teleport through a barrier');
        assert(g.terrain.isFree(after.x,after.y,g.player.r),'the entire player body remains on walkable ground');
        g.adventure.update(0);movementSteps++;
      }
      assert(distance(foot(g),waypoint)<.03,'local route completes through real collision');
    }
  }
  assert(distance(foot(g),target)<.03,'the interaction position is actually reached');
}

const results=[];
for(const view of [null,{width:540,height:985}]){
  const g=new Game({mode:'world'});
  if(view){g.viewWidth=view.width;g.viewHeight=view.height;}
  const end=getConfigSection('economy').treasure.firstAt+.1;
  while(g.time<end-.00001&&g.status==='playing')g.update(Math.min(.05,end-g.time));
  assert(g.time>=end-.00001,'normal scheduling reaches the first treasure without debug time jumps');
  const treasure=g.adventure.treasure;
  assert(treasure,'the fix must still allow a timed treasure');
  const supplies=[...g.adventure.props];assert(supplies.length>0,'the fix must retain actual supplies');
  for(const item of [...supplies,treasure,...g.riftExploration.sites.filter(s=>s.kind==='chest')]){
    assert(g.terrain.isFree(item.x,item.y,item.r),`${item.id}: real footprint`);
    assert(g.terrain.isFree(item.x,item.y,g.player.r),`${item.id}: valid collection stance`);
  }
  // Freeze encounter time after the real scheduling replay. Traversal below
  // exercises normal movement, activation, defeat and collection individually.
  g.adventure.generation=false;
  walk(g,treasure);assert.equal(treasure.state,'active');
  const guardian=g.enemies.find(e=>e.id===treasure.guardianId);assert(guardian);
  const guardFoot=()=>({x:guardian.x,y:guardian.y+groundOffset(guardian)}),initialGuard=guardFoot();
  assert(g.terrain.isFree(initialGuard.x,initialGuard.y,guardian.r),'the scaled guardian fits its actual body');
  for(let i=0;i<8;i++)g._moveEnemy(guardian,.025,foot(g));
  assert(distance(initialGuard,guardFoot())>1,'the guardian can leave its spawn and approach the player');
  assert(g.terrain.isFree(guardFoot().x,guardFoot().y,guardian.r));
  g._hurtEnemy(guardian,guardian.hp+1);assert.equal(treasure.state,'unlocked');
  const gems=[...g.gems],crystals=g.crystals;assert(gems.length>0);
  for(let i=0;i<100&&gems.some(gem=>gem.value>0);i++)g._collectDrops(g.gems,.05,'crystals');
  assert(gems.every(gem=>gem.value===0)&&g.crystals>crystals,'guard crystals retain their real magnetic collection path');
  const before={gold:g.gold,crystals:g.crystals};g.adventure.update(0);
  assert.equal(treasure.state,'opened');assert(g.gold>before.gold&&g.crystals>before.crystals);claimed++;
  for(const pickup of [...g.adventure.pickups]){walk(g,pickup);assert.equal(pickup.life,0,'treasure reward is actually collected');claimed++;}
  const supply=supplies.find(s=>g.adventure.props.includes(s));assert(supply);
  walk(g,supply);assert(!g.adventure.props.includes(supply),'physical approach opens a supply');
  g.adventure._refreshSupplies(true);
  assert(!g.adventure.props.some(o=>o.id===supply.id),'a consumed supply stays consumed when its cells reload');
  for(const pickup of [...g.adventure.pickups]){walk(g,pickup);assert.equal(pickup.life,0,'supply reward is collected');claimed++;}
  results.push({viewport:view??'engine-default',supplies:supplies.length,treasure:{x:treasure.x,y:treasure.y}});
}

const g=new Game({mode:'world',environment:false}),layout=g.terrain.island.layout;
g.adventure.generation=false;
// Both authored rewards require real cross-region walking from the camp.
for(const chest of g.riftExploration.sites.filter(s=>s.kind==='chest')){
  walk(g,chest);
  for(const enemy of [...g.enemies])if(distance({x:enemy.x,y:enemy.y+groundOffset(enemy)},chest)<190)g._hurtEnemy(enemy,enemy.hp+1);
  g.status='playing';assert.equal(g.riftExploration.interact(chest.id),true);assert.equal(chest.state,'claimed');claimed++;
  for(const pickup of [...g.adventure.pickups]){walk(g,pickup);assert.equal(pickup.life,0);claimed++;}
}
let natural=0;
for(let tx=Math.floor(layout.bounds.minX/520);tx<=Math.floor(layout.bounds.maxX/520);tx++)for(let ty=Math.floor(layout.bounds.minY/520);ty<=Math.floor(layout.bounds.maxY/520);ty++){
  const item=g.adventure._supplyAt(tx,ty);if(!item)continue;natural++;
  assert(placementAllowed(g,'loot',{...item,r:38}));assert(g.terrain.isFree(item.x,item.y,g.player.r));
}
assert(natural>=8,'whole-world validation must retain supplies across multiple areas');
// Boundary deaths can drop a reward on a wall/shore. Relocation must preserve
// the real pickup path, not merely find a locally empty pocket.
let relocated=0;
for(const edge of g.terrain.rift.high.edges){
  if(relocated===3)break;
  if(g.terrain.isFree(edge.x,edge.y,18))continue;
  const pickup=g.adventure.dropPickup('herb',edge.x,edge.y);if(!pickup)continue;
  assert(g.terrain.isFree(pickup.x,pickup.y,18));walk(g,pickup);assert.equal(pickup.life,0);relocated++;claimed++;
}
assert.equal(relocated,3,'several boundary rewards relocate to collectible ground');
assert(g.adventure._reachablePoints.size<=256,'placement route results have a bounded cache');
assert(g.adventure._reachableLegs.size<=512,'shared route legs have a bounded cache');
const candidate=layout.landmarks.treasure18;
g.adventure._reachable(candidate.x,candidate.y);const beforeRevision=g.adventure._placementRevision;
g.terrain.setRiftGate('bell-shortcut',true);assert(g.adventure._reachable(candidate.x,candidate.y));
assert.notEqual(g.adventure._placementRevision,beforeRevision,'opening a gate invalidates cached placement paths');
g.terrain.setRiftGate('bell-shortcut',false);assert(g.adventure._reachable(candidate.x,candidate.y),'closing the shortcut revalidates the remaining long route');
const paced=new Game({mode:'world',environment:false}),area=paced.terrain.island.layout.areas.find(a=>a.id==='09');
paced.viewWidth=540;paced.viewHeight=985;paced.player.x=area.center.x;paced.player.y=area.center.y-groundOffset(paced.player,true);
const originalSupplyAt=paced.adventure._supplyAt.bind(paced.adventure);let queries=0,totalQueries=0;
paced.adventure._supplyAt=(...args)=>{queries++;totalQueries++;return originalSupplyAt(...args);};
for(let frame=0;frame<30;frame++){
  queries=0;paced.adventure.update(1/60);
  assert(queries<=1,'runtime generation performs at most one new cell query per frame');
}
assert(totalQueries>=4,'the nearby queue advances on intervening frames, without waiting for another half-second refresh');
console.log(JSON.stringify({riftPlacement:'passed',runtime:results,naturalSupplies:natural,actualClaims:claimed,movementSteps,relocatedBoundaryRewards:relocated}));
