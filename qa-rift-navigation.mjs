import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {groundOffset} from './dist/terrain.js';
import {terrainNavigation} from './dist/terrain-navigation.js';
const g=new Game({mode:'world',debug:true,debugWorld:'rift-forest'}),t=g.terrain,l=t.island.layout;g.enemies=[];g._inView=()=>true;
const completed=[];
// Keep followers visible throughout the replay, so the offscreen recovery
// mechanism cannot disguise an unreachable route or a teleport.
function walk(a,b,{kind,open=false}={}){
 t.setRiftGate('bell-shortcut',open);const start=l.areas.find(x=>x.id===a).center,target=l.areas.find(x=>x.id===b).center;g.player.x=target.x;g.player.y=target.y-groundOffset(g.player,true);
 let entity;
 if(kind){g.companions.members=[];assert(g.companions.recruit(kind,start));entity=g.companions.members[0];entity.x=start.x;entity.y=start.y-groundOffset(entity,true);}
 else entity={id:19,type:'slime',r:20,speed:220,x:start.x,y:start.y-groundOffset({type:'slime',r:20}),phase:0,hp:100};
 let steps=0,maxX=-Infinity,length=0;const profile=entity.flying?'air':'ground',foot=()=>({x:entity.x,y:entity.y+groundOffset(entity,!!kind)});
 for(;steps<7000;steps++){
  const before=foot(),distance=Math.hypot(before.x-target.x,before.y-target.y),stop=kind?entity.followDistance+5:20;
  if(distance<stop&&!t.firstBlocker(before.x,before.y,target.x,target.y,entity.r,profile))break;
  g._clock+=.025;if(kind)g.companions._follow(entity,.025);else g._moveEnemy(entity,.025,target);
  const after=foot(),travel=Math.hypot(after.x-before.x,after.y-before.y);maxX=Math.max(maxX,after.x);length+=travel;
  assert(travel<=entity.speed*.025+.06,`teleport ${travel}`);assert(t.isFree(after.x,after.y,entity.r,profile),`collision ${JSON.stringify(after)}`);
 }
 assert(steps<7000,`${a} → ${b}/${kind??'enemy'} reaches the requested area`);completed.push({from:a,to:b,kind:kind??'enemy',open,seconds:steps/40,length:Math.round(length)});
 return {maxX,length};
}
for(const bridge of l.passages.filter(p=>p.kind==='bridge'&&p.to)){
 const [a,b]=bridge.deck,point={x:(a.x+b.x)/2,y:(a.y+b.y)/2},dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),side={x:point.x-dy/length*(bridge.width/2+50),y:point.y+dx/length*(bridge.width/2+50)};
 assert(t.isFree(point.x,point.y,22),'bridge deck is physically walkable');
 assert(!t.isFree(side.x,side.y,22),'the water beside a bridge blocks walkers');
 assert(t.isFree(side.x,side.y,13,'air'),'flying actors can cross bridge-side water');
 assert(!t.firstBlocker(side.x,side.y,point.x,point.y,0,'sight'),'low water does not block sight or projectile height');
 const corrected=t.resolveCircle(side.x,side.y,22);
 assert(corrected.blocked&&t.isFree(corrected.x,corrected.y,22),'recovering an invalid water position preserves the boundary collision flag');
 const leap=t.moveCircle(point.x,point.y,side.x-point.x,side.y-point.y,22);
 assert(leap.blocked&&t.isFree(leap.x,leap.y,22),'a single large move cannot leave a bridge for deep water');
}
const gate=l.passages.find(p=>p.gateId==='bell-shortcut').gate,gateLength=Math.hypot(gate.bx-gate.ax,gate.by-gate.ay),normal={x:-(gate.by-gate.ay)/gateLength,y:(gate.bx-gate.ax)/gateLength};
const near={x:gate.x+normal.x*140,y:gate.y+normal.y*140},far={x:gate.x-normal.x*140,y:gate.y-normal.y*140};
assert(t.isFree(near.x,near.y,20)&&t.isFree(far.x,far.y,20),'both gate approaches are real walkable land');
const closedMove=t.moveCircle(near.x,near.y,far.x-near.x,far.y-near.y,20);
assert(closedMove.blocked&&(closedMove.x-gate.x)*normal.x+(closedMove.y-gate.y)*normal.y>0,'a large single movement cannot tunnel through a closed shortcut');
const revision=t.structureRevision;t.setRiftGate('bell-shortcut',true);assert(t.structureRevision>revision);
const openedMove=t.moveCircle(near.x,near.y,far.x-near.x,far.y-near.y,20);
assert(Math.hypot(openedMove.x-far.x,openedMove.y-far.y)<.01,'opening the same gate permits the identical physical movement');
t.setRiftGate('bell-shortcut',false);
const trees=t.query(-3600,-2700,3600,2700).filter(p=>p.id.startsWith('rift-sparse:'));
assert(trees.length>=25,'sparse forest patches contain recognizable small trees');
assert(trees.every(p=>!t.island.isReserved(p.x,p.y,26)&&t.rift.circleFree(p.x,p.y,55,'ground')),'small trees preserve roads, landmarks and boundary clearance');
walk('06','08');const closed=walk('13','08');const opened=walk('13','08',{open:true});assert(closed.maxX>2500&&closed.length>opened.length*1.25);
walk('13','08',{kind:'owl'});walk('18','11',{kind:'warden'});walk('01','17');

assert(!JSON.stringify(g.companions.members).includes('_terrainRoute'),'live map caches stay out of actor snapshots');
const navigation=terrainNavigation(t);assert(navigation.rift.edgeCache.size<=3000,'the global connection cache is bounded');
const from=l.areas.find(a=>a.id==='01').center,to=l.areas.find(a=>a.id==='17').center;
for(let i=0;i<160;i++)navigation.waypoint({id:5000+i,r:20},from,to,23,'ground',1000,1000);
assert(navigation.framePlans<=2,'a crowd shares the per-frame large-region planning budget');
assert(navigation.frameExpanded<=2400,'a crowd shares the existing local A* node budget');
console.log(JSON.stringify({riftNavigation:'passed',completed,coverage:'real bridge collision and height bands; closed shortcut via area 12; opened shortcut cache invalidation; visible owl and warden following; 9,000+ unit cross-world pursuit with full-body collision and no teleports'}));
