import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Island } from './dist/islands.js';
import { Terrain, groundOffset } from './dist/terrain.js';

// Deliberately independent of the authored region graph and AI route planner:
// paths below are discovered by sweeping real bodies through the final terrain.
const STEP=24,RADIUS=24;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const inPolygon=(point,polygon)=>{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};
function openPoint(terrain,area,r=RADIUS){
  for(let radius=0;radius<=220;radius+=18)for(let n=0;n<32;n++){
    const angle=n*Math.PI/16,p={x:area.center.x+Math.cos(angle)*radius,y:area.center.y+Math.sin(angle)*radius};
    if(inPolygon(p,area.points)&&terrain.isFree(p.x,p.y,r))return {...p,id:area.id};
  }
  assert.fail(`No usable standing space in region ${area.id}`);
}
function search(terrain,start,goals,{radius=RADIUS,stopWhenFound=true}={}){
  const b=terrain.island.bounds,minX=Math.floor(b.minX/STEP),minY=Math.floor(b.minY/STEP),cols=Math.ceil(b.maxX/STEP)-minX+1,rows=Math.ceil(b.maxY/STEP)-minY+1,size=cols*rows;
  const state=new Uint8Array(size),parent=new Int32Array(size).fill(-1),queue=new Int32Array(size),targets=new Map(),found=new Map();
  const index=(x,y)=>(y-minY)*cols+x-minX,point=id=>({x:(id%cols+minX)*STEP,y:(Math.floor(id/cols)+minY)*STEP});
  const valid=(x,y)=>x>=minX&&y>=minY&&x<minX+cols&&y<minY+rows;
  const free=id=>{if(!state[id]){const p=point(id);state[id]=terrain.isFree(p.x,p.y,radius)?2:1;}return state[id]>=2;};
  const clear=(a,b)=>!terrain.firstBlocker(a.x,a.y,b.x,b.y,radius);
  const attach=(p)=>{const result=[];const cx=Math.round(p.x/STEP),cy=Math.round(p.y/STEP);for(let x=cx-2;x<=cx+2;x++)for(let y=cy-2;y<=cy+2;y++){if(!valid(x,y))continue;const id=index(x,y);if(free(id)&&clear(p,point(id)))result.push(id);}return result;};
  for(const [i,goal] of goals.entries())for(const id of attach(goal)){if(!targets.has(id))targets.set(id,[]);targets.get(id).push(i);}
  let read=0,write=0;for(const id of attach(start)){if(state[id]===3)continue;queue[write++]=id;state[id]=3;parent[id]=-2;}
  assert(write,`No grid attachment for start ${start.id??''} at ${start.x},${start.y}`);
  while(read<write&&(!stopWhenFound||found.size<goals.length)){
    const id=queue[read++],p=point(id),gx=id%cols+minX,gy=Math.floor(id/cols)+minY;
    for(const target of targets.get(id)||[])if(!found.has(target))found.set(target,id);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=gx+dx,y=gy+dy;if(!valid(x,y))continue;const next=index(x,y);
      if(state[next]===3||!free(next)||!clear(p,point(next)))continue;
      parent[next]=id;state[next]=3;queue[write++]=next;
    }
  }
  const paths=new Map();for(const [i,id] of found){const path=[goals[i]];for(let n=id;n>=0;n=parent[n])path.push(point(n));path.push(start);paths.set(goals[i].id,path.reverse());}
  return {paths,visited:read,foundIds:[...found.keys()].map(i=>goals[i].id)};
}
function replay(terrain,paths,radii=[15,RADIUS]){
  const checked=new Set();let sweeps=0;
  for(const path of paths.values())for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],key=`${a.x},${a.y}:${b.x},${b.y}`;if(checked.has(key))continue;checked.add(key);
    for(const r of radii){const moved=terrain.moveCircle(a.x,a.y,b.x-a.x,b.y-a.y,r);assert(distance(moved,b)<.01,`Actual body r=${r} cannot replay ${key}`);assert(terrain.isFree(moved.x,moved.y,r));sweeps++;}
  }
  return sweeps;
}
function middle(passage){
  const points=passage.waypoints,lengths=points.slice(1).map((p,i)=>distance(p,points[i]));let remain=lengths.reduce((a,b)=>a+b,0)/2;
  for(let i=0;i<lengths.length;i++){if(remain>lengths[i]){remain-=lengths[i];continue;}const a=points[i],b=points[i+1],t=lengths[i]?remain/lengths[i]:0;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)};}
  assert.fail(`Empty passage ${passage.id}`);
}
const seals=new Map();
function seal(passage){return seals.get(passage.id);}
function measureSeal(terrain,layout,passage){
  const candidates=[];
  for(let i=1;i<passage.waypoints.length;i++){
    const a=passage.waypoints[i-1],b=passage.waypoints[i],length=distance(a,b),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
    for(let d=12;d<length-12;d+=12){
      const p={x:a.x+(b.x-a.x)*d/length,y:a.y+(b.y-a.y)*d/length};
      if(layout.areas.some(area=>inPolygon(p,area.points))||!terrain.isFree(p.x,p.y,RADIUS))continue;
      const boundary=sign=>{for(let n=4;n<=passage.width+160;n+=4)if(!terrain.isFree(p.x+nx*n*sign,p.y+ny*n*sign,0))return n;return Infinity;};
      const left=boundary(-1),right=boundary(1);if(!Number.isFinite(left+right))continue;
      candidates.push({width:left+right,id:`qa-seal:${passage.id}`,type:'log',x:p.x+nx*(right-left)/2,y:p.y+ny*(right-left)/2,angle:Math.atan2(ny,nx),halfLength:(left+right)/2+24,r:16});
    }
  }
  assert(candidates.length,`Passage ${passage.id} must have a real neck outside its connected regions`);
  return candidates.sort((a,b)=>a.width-b.width)[0];
}
const island=new Island({region:'forest',seed:0}),terrain=new Terrain({region:'forest',seed:0,island}),layout=island.layout;
assert(layout?.areas,'the starting forest uses the authored region map');
assert.equal(layout.areas.length,18);assert.deepEqual(layout.areas.map(a=>a.id).sort(),Array.from({length:18},(_,i)=>String(i+1).padStart(2,'0')));
assert.equal(Math.round(island.bounds.maxX-island.bounds.minX),7200);assert.equal(Math.round(island.bounds.maxY-island.bounds.minY),5400);
const goals=layout.areas.map(a=>openPoint(terrain,a)),goal=id=>goals.find(p=>p.id===id),passages=layout.passages;
assert(!terrain.riftGateOpen('bell-shortcut'),'the 08–13 shortcut starts closed');
const baseline=search(terrain,goal('01'),goals);assert.equal(baseline.paths.size,18,`Unreachable regions: ${goals.filter(p=>!baseline.paths.has(p.id)).map(p=>p.id)}`);
let sweeps=replay(terrain,baseline.paths);
terrain.setRiftGate('bell-shortcut',true);
for(const passage of passages)seals.set(passage.id,measureSeal(terrain,layout,passage));
const opened=search(terrain,goal('01'),goals);assert.equal(opened.paths.size,18);sweeps+=replay(terrain,opened.paths);

// Measure each actual narrow passage outside the region polygons, rather than
// placing a test wall at the midpoint of a center-to-center route inside a room.
// Seal every declared entrance using real colliders, then flood the remaining
// space. If any undeclared gap exists, another region's center becomes reachable.
const isolation=[];
for(const area of layout.areas){
  const connections=passages.filter(p=>p.from===area.id||p.to===area.id);
  assert(connections.length,`Region ${area.id} must have an entrance`);
  terrain.setStructures(connections.map(seal),'qa-rift-seals');
  assert(terrain.isFree(goal(area.id).x,goal(area.id).y,RADIUS),`Entrance closures must not occupy region ${area.id}'s test point`);
  const result=search(terrain,goal(area.id),goals.filter(p=>p.id!==area.id),{radius:15,stopWhenFound:false});
  if(result.paths.size&&process.env.RIFT_QA_TRACE)console.error(JSON.stringify({area:area.id,seals:connections.map(seal),leaks:[...result.paths]}));
  assert.equal(result.paths.size,0,`Region ${area.id} leaks outside its declared entrances to: ${result.foundIds.join(',')}`);
  assert(result.visited>3,`Region ${area.id} retains usable space after sealing entrances`);
  isolation.push({id:area.id,entrances:connections.length,visited:result.visited});
}
terrain.setStructures([],'qa-rift-seals');

// All three distinct crossings must exist physically. Remove the other two,
// without consulting their declared route links during the search.
const bridges=passages.filter(p=>p.kind==='bridge'&&['06','07','08'].includes(p.from)&&['06','07','08'].includes(p.to));
assert.equal(bridges.length,2,'the center route contains two separate bridges');
const north=passages.find(p=>[p.from,p.to].includes('14')&&[p.from,p.to].includes('16'));
const south=passages.find(p=>[p.from,p.to].includes('09')&&[p.from,p.to].includes('10'));
assert(north&&south,'north and south bypasses both connect the shores');
terrain.setRiftGate('bell-shortcut',false);
const crossings=[];
for(const [name,closed] of [['bridges',[north,south]],['north',[...bridges,south]],['south',[...bridges,north]]]){
  terrain.setStructures(closed.map(seal),'qa-rift-seals');const result=search(terrain,goal('06'),[goal('08')]);assert.equal(result.paths.size,1,`${name} crossing must remain physically usable`);sweeps+=replay(terrain,result.paths);crossings.push({name,visited:result.visited,pathSteps:result.paths.get('08').length});
}
terrain.setStructures([...bridges,north,south].map(seal),'qa-rift-seals');const separated=search(terrain,goal('06'),[goal('08')]);assert.equal(separated.paths.size,0,'with all three crossings closed there is no hidden route around the lake');terrain.setStructures([],'qa-rift-seals');

let bridgeSides=0;
for(const bridge of bridges){
  const p=middle({...bridge,waypoints:bridge.deck||bridge.waypoints}),side=bridge.width/2+75;
  for(const sign of [-1,1]){
    const q={x:p.x-Math.sin(p.angle)*side*sign,y:p.y+Math.cos(p.angle)*side*sign};
    assert(terrain.isFree(p.x,p.y,15),`${bridge.id}: bridge deck is walkable`);assert(!terrain.isFree(q.x,q.y,15),`${bridge.id}: bank cannot be bypassed through deep water`);assert(terrain.isFree(q.x,q.y,15,'air'),`${bridge.id}: bridge side is water, not a hidden wall for flyers`);
    assert(terrain.firstBlocker(p.x,p.y,q.x,q.y,15));const moved=terrain.moveCircle(p.x,p.y,q.x-p.x,q.y-p.y,15);assert(moved.blocked&&distance(moved,q)>30);assert(terrain.isFree(moved.x,moved.y,15));bridgeSides++;
  }
}
const shortcut=passages.find(p=>p.gateId==='bell-shortcut');assert(shortcut&&[shortcut.from,shortcut.to].includes('08')&&[shortcut.from,shortcut.to].includes('13'));const gate=shortcut.gate;
const gateAngle=Math.atan2(gate.by-gate.ay,gate.bx-gate.ax),a={x:gate.x-Math.sin(gateAngle)*75,y:gate.y+Math.cos(gateAngle)*75},b={x:gate.x+Math.sin(gateAngle)*75,y:gate.y-Math.cos(gateAngle)*75};
assert(terrain.firstBlocker(a.x,a.y,b.x,b.y,15),'closed shortcut blocks direct passage');terrain.setRiftGate('bell-shortcut',true);assert(!terrain.firstBlocker(a.x,a.y,b.x,b.y,15),'opening the shortcut exposes its actual corridor');sweeps+=replay(terrain,new Map([['gate',[a,b]]]));

// Finally instantiate every gameplay structure: the production start and each
// actual doorway must connect, not just a pristine terrain-only topology.
const game=new Game({mode:'world'}),liveGoals=game.terrain.island.layout.areas.map(a=>openPoint(game.terrain,a));
const doorGoals=[...game.settlements.sites,...game.relicSites.sites].filter(s=>s.door).map(s=>({id:s.id,...s.door}));
for(const door of doorGoals)assert(game.terrain.isFree(door.x,door.y,RADIUS),`Actual site doorway is blocked: ${door.id}`);
const live=search(game.terrain,liveGoals.find(p=>p.id==='01'),[...liveGoals,...doorGoals]);assert.equal(live.paths.size,liveGoals.length+doorGoals.length,`Gameplay structures disconnect goals: ${[...liveGoals,...doorGoals].filter(p=>!live.paths.has(p.id)).map(p=>p.id)}`);sweeps+=replay(game.terrain,live.paths);
// The fixed lake belongs to the outline renderer/collision mask. Legacy pools
// must not float over its water or slow/sink a character standing on a bridge.
for(const point of [...liveGoals,...bridges.map(p=>middle({...p,waypoints:p.deck||p.waypoints}))]){
  game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);game.environment._refresh(true);
  assert.equal(game.environment.muds.length,0,'the authored world does not add legacy random pools');
}
for(const bridge of bridges){
  const p=middle({...bridge,waypoints:bridge.deck||bridge.waypoints});game.player.x=p.x;game.player.y=p.y-groundOffset(game.player,true);game.environment._refresh(true);
  assert.equal(game.environment.getImmersion(game.player),null,`${bridge.id}: the player stands above the lake`);
  assert.equal(game.environment.movementMultiplier(game.player),1,`${bridge.id}: deep water does not slow the bridge deck`);
}
const marsh=new Game({mode:'world',debug:true,debugWorld:'marsh'});assert(marsh.environment._macroWaters.length>0,'legacy worlds retain their own water generation');
console.log(JSON.stringify({riftLayout:'passed',regions:18,dimensions:[7200,5400],gridStep:STEP,isolationRadius:15,bodyRadii:[15,RADIUS],visited:baseline.visited,isolatedRegions:isolation,crossings,bridgeSides,sweeps,gameplayDoorways:doorGoals.length}));
