import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { Terrain } from './dist/terrain.js';
import { Game } from './dist/engine.js';
import { RiftCollision, riftPointInPolygon } from './dist/rift-collision.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const island=new Island({region:'verdant-rift',seed:8});
const terrain=new Terrain({region:'verdant-rift',seed:8,island});
const layout=island.layout;
assert.equal(layout?.worldId,'verdant-rift');
assert.equal(layout.id,'verdant-rift:1');
assert.equal(layout.bounds.maxX-layout.bounds.minX,14400);
assert.equal(layout.bounds.maxY-layout.bounds.minY,10800);
assert.equal(layout.areas.length,21);
assert.equal(layout.areas.filter(a=>a.kind==='secret').length,3);
assert.equal(layout.encounters.filter(e=>e.kind==='guard').length,4);
assert.equal(layout.encounters.filter(e=>e.kind==='boss').length,2);
assert.equal(layout.interactions.caves.length,3);
assert.equal(new Set(layout.interactions.caves.map(c=>c.caveId)).size,2);
assert.equal(layout.interactions.chests.length,4);
const original=new Island({region:'forest'});
assert.equal(original.layout.id,'rift-forest:1');
assert.equal(original.bounds.maxX-original.bounds.minX,7200);
assert.equal(original.layout.areas.length,18);
assert.notEqual(original.layout,layout,'map objects and their caches must remain independent');

let sweeps=0;
const pristine=new RiftCollision(layout);
for(const passage of layout.passages){
  // This checks the actual complete union, with full circle bodies; neither
  // graph adjacency nor a center-only polygon sample establishes clearance.
  for(const radius of [15,24,49])for(let i=1;i<passage.waypoints.length;i++){
    const a=passage.waypoints[i-1],b=passage.waypoints[i];
    assert(pristine.circleFree(a.x,a.y,radius),`${passage.id}: body r${radius} standing space`);
    assert(!pristine.firstBlocker(a.x,a.y,b.x,b.y,radius),`${passage.id}: body r${radius} swept clearance`);
    const moved=pristine.step(a.x,a.y,b.x,b.y,radius);
    assert(distance(moved,b)<.02,`${passage.id}: actual movement replay`);sweeps++;
  }
}
const STEP=36;
function flood(t,start,goals,radius=24){
  const b=layout.bounds,minX=Math.floor(b.minX/STEP),minY=Math.floor(b.minY/STEP),cols=Math.ceil(b.maxX/STEP)-minX+1,rows=Math.ceil(b.maxY/STEP)-minY+1;
  const states=new Uint8Array(cols*rows),queue=new Int32Array(states.length),targets=new Map(),found=new Set();
  const index=(x,y)=>(y-minY)*cols+x-minX,point=id=>({x:(id%cols+minX)*STEP,y:(Math.floor(id/cols)+minY)*STEP});
  const valid=(x,y)=>x>=minX&&y>=minY&&x<minX+cols&&y<minY+rows;
  const free=id=>{if(!states[id]){const p=point(id);states[id]=t.isFree(p.x,p.y,radius)?1:2;}return states[id]!==2;};
  function attach(p){
    const ids=[],cx=Math.round(p.x/STEP),cy=Math.round(p.y/STEP);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const x=cx+dx,y=cy+dy;if(!valid(x,y))continue;const id=index(x,y),q=point(id);
      if(free(id)&&!t.firstBlocker(p.x,p.y,q.x,q.y,radius))ids.push(id);
    }return ids;
  }
  for(const goal of goals)for(const id of attach(goal)){if(!targets.has(id))targets.set(id,[]);targets.get(id).push(goal.id);}
  let read=0,write=0;
  for(const id of attach(start)){if(states[id]===3)continue;states[id]=3;queue[write++]=id;}
  assert(write,'start has a physical grid attachment');
  while(read<write&&found.size<goals.length){
    const id=queue[read++],p=point(id),gx=id%cols+minX,gy=Math.floor(id/cols)+minY;
    for(const target of targets.get(id)||[])found.add(target);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const x=gx+dx,y=gy+dy;if(!valid(x,y))continue;
      const next=index(x,y);if(states[next]===3||!free(next))continue;const q=point(next);
      if(t.firstBlocker(p.x,p.y,q.x,q.y,radius))continue;
      states[next]=3;queue[write++]=next;
    }
  }
  return {found,visited:read};
}
function standing(t,area){
  for(let radius=0;radius<=240;radius+=20)for(let i=0;i<24;i++){
    const p={id:area.id,x:area.center.x+Math.cos(i*Math.PI/12)*radius,y:area.center.y+Math.sin(i*Math.PI/12)*radius};
    if(riftPointInPolygon(p,area.points)&&t.isFree(p.x,p.y,24))return p;
  }assert.fail(`no real standing space ${area.id}`);
}
const goals=layout.areas.map(area=>standing(terrain,area));
const goal=id=>goals.find(p=>p.id===id);
const closed=flood(terrain,layout.spawn,goals);
assert.equal(closed.found.size,21,`closed-gate unreachable regions: ${goals.filter(p=>!closed.found.has(p.id)).map(p=>p.id)}`);
terrain.setRiftGate('south-shortcut',true);
const opened=flood(terrain,layout.spawn,goals);
assert.equal(opened.found.size,21,'opened-gate full geometry is connected');

function neck(passage){
  const candidates=[];
  for(let i=1;i<passage.waypoints.length;i++){
    const a=passage.waypoints[i-1],b=passage.waypoints[i],length=distance(a,b),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
    for(let d=20;d<length-20;d+=28){
      const p={x:a.x+(b.x-a.x)*d/length,y:a.y+(b.y-a.y)*d/length};
      if(layout.areas.some(area=>riftPointInPolygon(p,area.points)))continue;
      const reach=side=>{for(let n=4;n<=passage.width+160;n+=4)if(!terrain.isFree(p.x+nx*n*side,p.y+ny*n*side,0))return n;return Infinity;};
      const left=reach(-1),right=reach(1);if(!Number.isFinite(left+right))continue;
      candidates.push({id:`qa-verdant-seal:${passage.id}`,width:left+right,type:'log',x:p.x+nx*(right-left)/2,y:p.y+ny*(right-left)/2,r:16,halfLength:(left+right)/2+20,angle:Math.atan2(ny,nx)});
    }
  }
  assert(candidates.length,`${passage.id} needs a real physical neck`);
  return candidates.sort((a,b)=>a.width-b.width)[0];
}
const bridgePassages=layout.passages.filter(p=>p.kind==='bridge');
assert.equal(bridgePassages.length,2,'two actual crossings, no accidental bridge trails');
const crossingPassages=[...bridgePassages,layout.passages.find(p=>p.id==='16-17')];
assert(crossingPassages.every(Boolean));
const crossingSeals=crossingPassages.map(neck);
const entranceSeals=new Map(layout.passages.filter(p=>p.to!==null).map(p=>[p.id,neck(p)]));
let isolated=0;
for(const area of layout.areas){
  const connections=layout.passages.filter(p=>p.to!==null&&(p.from===area.id||p.to===area.id));
  assert(connections.length,`${area.id} has declared surface entrances`);
  terrain.setStructures(connections.map(p=>entranceSeals.get(p.id)),'qa-verdant-seals');
  const result=flood(terrain,goal(area.id),goals.filter(p=>p.id!==area.id),15);
  assert.equal(result.found.size,0,`${area.id}: undeclared physical connections to ${[...result.found].join(',')}`);
  assert(result.visited>3,`${area.id}: sealed clearing retains space`);isolated++;
}
terrain.setStructures([],'qa-verdant-seals');
const crossings=[];
for(let open=0;open<crossingPassages.length;open++){
  terrain.setStructures(crossingSeals.filter((_,i)=>i!==open),'qa-verdant-seals');
  const result=flood(terrain,goal('06'),[goal('11')]);
  assert(result.found.has('11'),`${crossingPassages[open].id}: crossing remains physically usable`);
  crossings.push({id:crossingPassages[open].id,visited:result.visited});
}
terrain.setStructures(crossingSeals,'qa-verdant-seals');
assert.equal(flood(terrain,goal('06'),[goal('11')]).found.size,0,'sealing the two bridges and source pass separates east and west');
terrain.setStructures([],'qa-verdant-seals');

let waterSides=0;
for(const bridge of bridgePassages){
  const [a,b]=bridge.deck,p={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  assert(terrain.isFree(p.x,p.y,49),'a large body fits the bridge deck');
  for(const side of [-1,1]){
    const q={x:p.x,y:p.y+side*(bridge.width/2+80)};
    assert(!terrain.isFree(q.x,q.y,15),'deep water continues to block bridge-side shortcuts');
    assert(terrain.isFree(q.x,q.y,15,'air'),'water remains passable to existing flyers');
    assert(terrain.firstBlocker(p.x,p.y,q.x,q.y,15));waterSides++;
  }
}
const gate=layout.passages.find(p=>p.gateId==='south-shortcut').gate;
const west={x:gate.x-85,y:gate.y},east={x:gate.x+85,y:gate.y};
terrain.setRiftGate('south-shortcut',false);
assert(terrain.firstBlocker(west.x,west.y,east.x,east.y,15),'closed gate retains physical blocking');
terrain.setRiftGate('south-shortcut',true);
assert(!terrain.firstBlocker(west.x,west.y,east.x,east.y,49),'opening exposes the unchanged bridge corridor');

const game=new Game({mode:'world',worldId:'verdant-rift'});
assert.equal(game.region.id,'verdant-rift');
const liveGoals=layout.areas.map(area=>standing(game.terrain,area));
const doors=[...game.settlements.sites,...game.relicSites.sites].filter(s=>s.door).map(s=>({id:s.id,...s.door}));
const objectives=game.riftExploration.sites.filter(s=>s.kind!=='shortcut').map(s=>({id:s.id,x:s.x,y:s.y}));
for(const target of [...doors,...objectives])assert(game.terrain.isFree(target.x,target.y,24),`actual objective approach ${target.id}`);
const live=flood(game.terrain,layout.spawn,[...liveGoals,...doors,...objectives]);
assert.equal(live.found.size,liveGoals.length+doors.length+objectives.length,'all real doors/objectives remain reachable with gameplay structures');
assert.equal(game.territories.groups.filter(g=>g.kind==='boss').length,2,'both existing bosses actually spawn');
assert.equal(game.territories.groups.filter(g=>g.kind==='guard').length,4,'all four actual strong-enemy sites spawn');
assert(game.territories.groups.filter(g=>g.kind==='guard').every(group=>group.members.some(enemy=>enemy.affix)),'each designated strong-enemy site receives existing elite content before ordinary groups consume the cap');
assert.equal(game.environment._macroWaters.length,0,'authored water does not receive random legacy pools');
console.log(JSON.stringify({verdantLayout:'passed',regions:21,dimensions:[14400,10800],domains:game.territories.groups.length,gridStep:STEP,sweeps,isolated,crossings,waterSides,objectives:objectives.length,doors:doors.length,visited:closed.visited}));
