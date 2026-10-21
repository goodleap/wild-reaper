import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { EXPEDITIONS } from './dist/expedition-definitions.js';
import { ExpeditionTerrain } from './dist/expedition-run.js';
import { groundOffset } from './dist/terrain.js';
import { validateContentPack } from './dist/content-schema.js';
import { getConfigSnapshot } from './dist/content-config.js';

// Check actual movement edges rather than accepting isolated free targets.
function reachable(terrain,start,r,targets=[]){
  // Challenge objectives stay near the start even when they borrow a larger
  // island. Search that relevant area rather than scanning every coastline.
  const extents=[start,...targets],bounds=terrain.bounds;
  const b=terrain.island?{minX:Math.max(bounds.minX,Math.min(...extents.map(p=>p.x))-520),maxX:Math.min(bounds.maxX,Math.max(...extents.map(p=>p.x))+520),minY:Math.max(bounds.minY,Math.min(...extents.map(p=>p.y))-520),maxY:Math.min(bounds.maxY,Math.max(...extents.map(p=>p.y))+520)}:bounds;
  const step=30,cols=Math.floor((b.maxX-b.minX)/step)+1,rows=Math.floor((b.maxY-b.minY)/step)+1;
  const point=index=>({x:b.minX+(index%cols)*step,y:b.minY+Math.floor(index/cols)*step});
  const free=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows),queue=[];
  for(let i=0;i<free.length;i++){const p=point(i);free[i]=terrain.isFree(p.x,p.y,r)?1:0;}
  const clear=(a,z)=>!terrain.firstBlocker(a.x,a.y,z.x,z.y,r);
  for(let i=0;i<free.length;i++)if(free[i]&&Math.hypot(point(i).x-start.x,point(i).y-start.y)<=step*1.5&&clear(start,point(i))){seen[i]=1;queue.push(i);}
  for(let head=0;head<queue.length;head++){
    const i=queue[head],x=i%cols,y=Math.floor(i/cols);
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nx=x+dx,ny=y+dy,j=ny*cols+nx;if(nx<0||nx>=cols||ny<0||ny>=rows||seen[j]||!free[j])continue;
      if(dx&&dy&&(!free[y*cols+nx]||!free[ny*cols+x]))continue;
      if(!clear(point(i),point(j)))continue;seen[j]=1;queue.push(j);
    }
  }
  return target=>{
    if(!terrain.isFree(target.x,target.y,r))return false;
    for(const i of queue){const p=point(i);if(Math.hypot(p.x-target.x,p.y-target.y)<=step*1.5&&clear(p,target))return true;}
    return false;
  };
}

for(const d of EXPEDITIONS){
  const terrain=new ExpeditionTerrain(d),canReach=reachable(terrain,d.start,22,[d.exit,...d.supplies,...d.segments.map(s=>s.center)]);
  assert(canReach(d.exit),`${d.id}: exit reachable at companion radius`);
  for(const p of [...d.supplies,...d.segments.map(s=>s.center)])assert(canReach(p),`${d.id}: objective/supply ${p.x},${p.y} reachable`);
  for(const path of d.paths)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i];
    assert(!terrain.firstBlocker(a.x,a.y,b.x,b.y,15),`${d.id}: marked path ${a.x},${a.y} → ${b.x},${b.y} has body clearance`);
  }
  for(const prop of terrain.query(-4000,-4000,4000,4000)){
    assert(!terrain.isFree(prop.x,prop.y,15),`${d.id}: visible solid has physical collision`);
    assert(prop.visual&&prop.visual.halfWidth>0&&prop.visual.top>0,'solid has an explicit visual footprint');
  }
  const g=new Game({mode:'dungeon',dungeonId:d.id}),run=g.expedition;
  for(const group of run.groups)for(const e of group.members){
    const foot={x:e.x,y:e.y+groundOffset(e)};
    assert(g.terrain.isFree(foot.x,foot.y,e.r),`${d.id}: group ${group.index} spawns outside solid scenery`);
    assert.deepEqual(e.expeditionHome,foot,'home uses the resolved spawn, not an obstructed original point');
  }
  const count=g.adventure.props.length,supply=g.adventure.props[0];
  assert(g.adventure.hitSupply(supply,supply.hp));assert.equal(g.adventure.props.length,count-1);
  assert.equal(g.adventure.pickups.length,1);assert.equal(g.adventure.hitSupply(supply,999),false,'supply cannot be farmed');
  for(let i=0;i<20;i++)g.adventure.update(.05);
  assert.equal(g.adventure.props.length,count-1,'authored supplies do not respawn');
  assert.equal(new Game({mode:'dungeon',dungeonId:d.id}).adventure.props.length,count,'new expedition restores its own supplies');
}

for(const [id,from,to]of [
  ['ship',{x:-960,y:0},{x:-620,y:0}],
  ['moon',{x:0,y:130},{x:0,y:-180}],
])for(const companion of [false,true]){
  const g=new Game({mode:'dungeon',dungeonId:id}),e=g._spawnEnemy('beetle');
  Object.assign(e,{x:from.x,y:from.y-groundOffset(e,companion),r:22,speed:140,isCompanion:companion});
  // Set the foot again after radius adjustment, which can scale enemy art.
  e.y=from.y-groundOffset(e,companion);g.enemies=[e];
  assert(g.terrain.firstBlocker(from.x,from.y,to.x,to.y,e.r),'fixture requires a real obstacle detour');
  for(const target of [to,from]){
    for(let i=0;i<600;i++){
      const before={x:e.x,y:e.y+groundOffset(e,companion)};
      if(Math.hypot(before.x-target.x,before.y-target.y)<12)break;
      g._clock+=.05;g._moveEnemy(e,.05,target);
      const after={x:e.x,y:e.y+groundOffset(e,companion)};
      assert(g.terrain.isFree(after.x,after.y,e.r),`${id}: actor remains outside solids`);
      assert(Math.hypot(after.x-before.x,after.y-before.y)<12,`${id}: walking never teleports across scenery`);
    }
    assert(Math.hypot(e.x-target.x,e.y+groundOffset(e,companion)-target.y)<12,`${id}: ${companion?'companion':'enemy'} walks around obstacles in both directions`);
  }
}

for(const mutate of [
  d=>{d.paths[0].width=Infinity;},d=>{d.paths[0].points[0].x=1e8;},
  d=>{d.details[0].kind='unhandled';},d=>{d.details[0].rx=-1;},
  d=>{d.supplies[0].drop='unknown';},d=>{d.obstacles[0].treeForm=8;},
]){
  const pack=structuredClone(getConfigSnapshot());mutate(pack.sections.stages.expeditions[1]);
  assert.throws(()=>validateContentPack(pack),/Invalid world configuration|Non-finite number/);
}
console.log('Expedition layouts: route clearance, objective/supply connectivity, enemy/companion detours and return, resolved spawns, once-only supplies and schema passed.');
