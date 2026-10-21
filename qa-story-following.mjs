import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain,groundOffset } from './dist/terrain.js';
import { StoryNavigation } from './dist/story-navigation.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { resetLocomotion } from './dist/locomotion.js';
import { getHero } from './dist/heroes.js';

const foot=actor=>({x:actor.x,y:actor.y+groundOffset(actor,!!actor.heroId)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const place=(actor,point)=>{actor.x=point.x;actor.y=point.y-groundOffset(actor,!!actor.heroId);actor.groundY=point.y;};
const wall=(id,x,y,halfLength,angle=0,r=16)=>({id,type:'log',variant:'world-city-wall',x,y,halfLength,angle,r});
function fixture({terrain=new Terrain({obstacles:[]}),speed=320,player={x:0,y:0},actor={x:-100,y:0},target={x:10000,y:0},step='escort'}={}){
  const g={terrain,_clock:0,player:{heroId:'traveler',r:15,speed,x:player.x,y:player.y-19.8},_moveEntity:Game.prototype._moveEntity};
  const princess={id:'story:princess',heroId:'princess',storyActor:true,r:15,groundOffset:19.8,x:actor.x,y:actor.y-19.8,speed:getHero('princess').baseSpeed};resetLocomotion(princess);
  const story={step,princess,_clock:0,objectivePoint:target,objective:'测试路线',rules:{guardRadius:230,arrivalRadius:160},_awaitingAngel:()=>false};
  return {g,story,navigation:new StoryNavigation(g,story),princess};
}
function tick(f,dt,input={}){
  const {g,story,navigation,princess}=f,before=foot(princess);g._clock+=dt;story._clock+=dt;
  g._moveEntity(g.player,(input.x||0)*g.player.speed*dt,(input.y||0)*g.player.speed*dt,true);
  navigation.updatePrincess(dt);
  const after=foot(princess),moved=distance(before,after);
  assert(moved<=(princess._followSpeed||0)*dt+.001,'every actor displacement is ordinary capped walking, never a recovery teleport');
  assert(g.terrain.isFree(after.x,after.y,princess.r,'ground'),'the whole princess body remains on walkable terrain');
  assert.equal(princess.groundY,after.y,'rendering and movement share the current foot position');
  return {moved,gap:distance(after,foot(g.player)),moving:princess.moving};
}
function advance(f,seconds,hz,input={},sample=()=>{}){for(let i=0;i<seconds*hz;i++)sample(tick(f,1/hz,input));}

const tracking=[];
for(const hz of [30,60,120])for(const speed of [160,320,640]){
  const f=fixture({speed});let stopped=0,toggles=0,last=null,maxGap=0;
  advance(f,3,hz,{x:1});
  advance(f,3,hz,{x:1},sample=>{if(!sample.moving)stopped++;if(last!==null&&last!==sample.moving)toggles++;last=sample.moving;maxGap=Math.max(maxGap,sample.gap);});
  assert.equal(stopped,0,`${hz}Hz/${speed}: a steadily moving hero does not cause periodic stopping`);
  assert.equal(toggles,0);assert(maxGap<220,`${hz}Hz/${speed}: normal and medicine-boosted leaders retain their companion (${maxGap}, ${f.princess._followMode})`);
  if(speed<=320)assert(f.princess.x>f.g.player.x,'the guide stays on the destination side of a normally moving hero');
  const beforeReverse=f.princess.x;advance(f,1,hz,{x:-1});assert(f.princess.x<beforeReverse,`${hz}Hz/${speed}: a turning hero is followed after crossing the shared restart band`);
  advance(f,2,hz,{x:-1});advance(f,3,hz);
  const held=foot(f.princess);advance(f,1,hz);assert(distance(held,foot(f.princess))<.001&&!f.princess.moving,'stopping waits at a stable nearby position');
  assert(distance(held,foot(f.g.player))<190,'the 90-unit lead point plus its restart band stays nearby');
  tracking.push({hz,speed,steadyStops:stopped,maxGap:+maxGap.toFixed(2)});
}

// An idle actor keeps its reached position throughout the existing 80-unit
// restart band; small hero adjustments never require a fresh formation slot.
const idle=fixture({step:'pill',target:{x:0,y:0},actor:{x:-100,y:0}}),idlePoint=foot(idle.princess);
advance(idle,1,60);assert(distance(idlePoint,foot(idle.princess))<.001);
for(const x of [15,-15,25,-25,0]){place(idle.g.player,{x,y:0});advance(idle,.2,60);assert(distance(idlePoint,foot(idle.princess))<.001);}
place(idle.g.player,{x:55,y:0});advance(idle,.2,60);assert(idle.princess.x>idlePoint.x,'crossing the shared outer distance starts following');
advance(idle,2,60);const rested=foot(idle.princess);advance(idle,1,60);assert(distance(rested,foot(idle.princess))<.001);

// Close in straight-line distance is insufficient across a wall. The actor
// must walk round its end, including when the hero stands completely still.
const near=fixture({terrain:new Terrain({obstacles:[wall('near-wall',0,0,140,Math.PI/2)]}),actor:{x:-44,y:0},player:{x:44,y:0},step:'pill',target:{x:44,y:0}});
let nearFurthest=0;advance(near,8,60,{},()=>nearFurthest=Math.max(nearFurthest,Math.abs(foot(near.princess).y)));
assert(nearFurthest>160,'close following really takes the available detour');
assert(near.princess.x>0&&distance(foot(near.princess),foot(near.g.player))<=71);

// The destination lies north, but the actual first exit is south. Guide UI and
// the leading slot share that usable direction rather than crossing the wall.
const courtyard=fixture({terrain:new Terrain({obstacles:[wall('west',-160,0,240,Math.PI/2),wall('east',160,0,240,Math.PI/2),wall('north',0,-240,160)]}),actor:{x:0,y:-100},player:{x:0,y:-100},target:{x:0,y:-430}});
const guide=courtyard.navigation.getGuide();assert(guide.waypoint.y>foot(courtyard.g.player).y);
for(let i=1;i<guide.path.length;i++)assert(terrainNavigation(courtyard.g.terrain).clearSegment(guide.path[i-1],guide.path[i],15));
advance(courtyard,2,60);assert(courtyard.princess.y>courtyard.g.player.y,'the princess indicates the opening while waiting for the hero');
assert(distance(foot(courtyard.princess),foot(courtyard.g.player))<150,'a stationary hero is never abandoned for the distant destination');

// Sanctuary/judgment/conversation stop in the refuge instead of orbiting into
// a preferred slot each frame. Leaving it still permits ordinary following.
for(const step of ['sanctuary','judgment','conversation']){
  const f=fixture({step,actor:{x:-300,y:0},target:{x:0,y:0}});f.story.angel={x:0,y:0};
  if(step!=='conversation'){
    f.story.angel={x:20,y:15};const guide=f.navigation.getGuide();assert.deepEqual(guide.target,f.story.angel);assert.equal(guide.areaRadius,230,'guidance marks the actual aura center and radius');
  }
  advance(f,4,60);assert(distance(foot(f.princess),f.story.angel)<215);
  const held=foot(f.princess);advance(f,1,60);assert(distance(held,foot(f.princess))<.001&&!f.princess.moving);
  advance(f,3,60,{x:-1});assert(distance(foot(f.princess),foot(f.g.player))<220,'walking away recalls the waiting actor without snapping');
}
const talking=fixture({step:'conversation',actor:{x:-75,y:0},player:{x:75,y:0},target:{x:0,y:0}});talking.story.angel={x:0,y:0};
advance(talking,3,60);assert(distance(foot(talking.princess),foot(talking.g.player))<145,'refuge waiting cannot strand the final conversation outside its unchanged action radius');

// After taking the medicine the full route remains active. The princess leads
// on exactly that curve, then stays at the summoning location while the hero
// moves away to fight; no separate guessed destination direction is involved.
const summonWorld=new Game({mode:'world',debug:true,debugWorld:'rift-forest'}),summonLayout=summonWorld.terrain.island.layout;
const summonStart=summonLayout.areas.find(area=>area.id==='02').center,summonEnd=summonLayout.areas.find(area=>area.id==='03').center;
const summoning=fixture({terrain:summonWorld.terrain,player:summonStart,actor:summonStart,target:summonEnd,step:'burst'});
summoning.story._helpReady=false;summoning.story.anchors={refuge:summonEnd};let summonFrames=0;
for(;summonFrames<60*15;summonFrames++){
  const guide=summoning.navigation.getGuide(),p=foot(summoning.g.player),remaining=distance(p,summonEnd);
  assert.equal(guide.kind,'travel','medicine does not remove the route or switch to an in-place prayer');
  assert(guide.complete,'the entire escape path is verified before guiding the player');
  if(remaining<14)break;
  assert(guide.waypoint,'guidance provides a physically usable next point');
  const next=guide.waypoint,d=distance(p,next),fraction=Math.min(1,d/(320/60));
  tick(summoning,1/60,{x:(next.x-p.x)/d*fraction,y:(next.y-p.y)/d*fraction});
}
assert(summonFrames<60*15);advance(summoning,1,60);
assert(distance(foot(summoning.princess),summonEnd)<100,'both actors actually arrive close enough to start summoning');
assert.equal(summoning.navigation.route.plans,1,'the guide shares the stable full player route through the actual map turns');
summoning.story._summoning=true;const summonHeld=foot(summoning.princess);
advance(summoning,1,60,{x:-1});assert(distance(summonHeld,foot(summoning.princess))<.001,'summoning stays anchored while the hero fights outside the immediate spot');
summoning.story._helpReady=true;advance(summoning,1,60,{x:-1});assert(distance(summonHeld,foot(summoning.princess))<.001,'the arriving guardian does not pull the princess back into follow mode');
summonWorld.dispose();

// Replay the real first world's 13-point passage with collision, fixed stage
// semantics and the shared local route. Combat is exercised by story-run QA.
const routeResults=[];
for(const hz of [30,60,120]){
  const g=new Game({mode:'world',debug:true,debugWorld:'rift-forest'}),layout=g.terrain.island.layout;
  const meeting=layout.areas.find(area=>area.id==='02').center,refuge=layout.areas.find(area=>area.id==='03').center;
  const path=layout.passages.find(passage=>passage.id==='02-03').waypoints;
  const f=fixture({terrain:g.terrain,player:meeting,actor:meeting,target:refuge,step:'fading'});let stopped=0,toggles=0,last=null,maxGap=0,frames=0;
  for(const target of path){
    let reached=false;
    for(let i=0;i<hz*10;i++){
      const p=foot(f.g.player),d=distance(p,target);if(d<20){reached=true;break;}
      const fraction=Math.min(1,d/(f.g.player.speed/hz)),sample=tick(f,1/hz,{x:(target.x-p.x)/d*fraction,y:(target.y-p.y)/d*fraction});
      frames++;if(!sample.moving)stopped++;if(last!==null&&last!==sample.moving)toggles++;last=sample.moving;maxGap=Math.max(maxGap,sample.gap);
    }
    assert(reached,'the actual map passage remains walkable');
  }
  assert(maxGap<220);assert(toggles<=8,'actual forest turns do not reintroduce frame-scale start/stop chatter');
  advance(f,3,hz);const held=foot(f.princess);advance(f,1,hz);assert(distance(held,foot(f.princess))<.001);
  routeResults.push({hz,seconds:+(frames/hz).toFixed(2),stopped,toggles,maxGap:+maxGap.toFixed(2)});g.dispose();
}
console.log(JSON.stringify({storyFollowing:'passed',tracking,actualForest:routeResults,coverage:'shared 80-unit band; continuous 160/320/640 pace; reversal and waiting; close-across-wall detour; real next-exit guide; stage refuge; collision and no teleport'}));
