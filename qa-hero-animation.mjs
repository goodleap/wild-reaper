import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain} from './dist/terrain.js';
import {HeroAnimator,recordHeroAction} from './dist/hero-animation.js';
import {HumanoidArt} from './dist/humanoid-art.js';
import {DirectionalHeroArt} from './dist/hero-directional-art.js';

const TAU=Math.PI*2,heroIds=['traveler','princess','elder'];
const directions={front:Math.PI/2,back:-Math.PI/2,right:0,left:Math.PI};
const actor=(heroId='traveler',extra={})=>({id:1,heroId,appearanceId:`${heroId}-v2`,hp:100,facing:0,walkPhase:0,walkSpeed:0,moving:false,...extra});
const expectedView=direction=>['left','right'].includes(direction)?'side':direction;
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);

for(const heroId of heroIds){
  for(const [direction,facing] of Object.entries(directions)){
    const animator=new HeroAnimator(),entity=actor(heroId,{facing}),pose=animator.sample(entity,{time:1});
    assert.equal(pose.view,expectedView(direction));assert.equal(pose.flip,direction==='left'?-1:1);
    assert.deepEqual(animator.sample(entity,{time:1}),pose,'repeated paused draws cannot advance animation');
    entity.facing=direction==='left'?0:Math.PI;
    assert.equal(animator.sample(entity,{time:1.1}).flip,pose.flip,'stationary input-facing changes do not turn a remembered idle pose');
  }
  const animator=new HeroAnimator(),entity=actor(heroId,{moving:true,walkSpeed:200,walkPhase:.4});
  const walking=animator.sample(entity,{time:1});
  entity.walkPhase=.4+Math.PI;const opposite=animator.sample(entity,{time:1.1});
  near(walking.leftFoot.x,opposite.rightFoot.x,'feet exchange their stance after half a cycle');
  near(walking.rightFoot.x,opposite.leftFoot.x,'feet exchange their swing after half a cycle');
  for(let i=0;i<120;i++){
    entity.walkPhase=i/120*TAU;const pose=animator.sample(entity,{time:2+i/120});
    assert(pose.leftFoot.planted||pose.rightFoot.planted,'walking keeps at least one supporting foot');
    for(const foot of [pose.leftFoot,pose.rightFoot]){
      assert(foot.lift>=0&&foot.lift<=4,'step height stays within the authored silhouette');
      if(foot.planted)assert.equal(foot.lift,0,'a supporting foot remains on the ground');
    }
  }
  const phase=entity.walkPhase;entity.moving=false;entity.walkSpeed=0;
  for(let i=0;i<12;i++)animator.sample(entity,{time:4+i*.1});
  const stopped=animator.sample(entity,{time:5.2});
  assert.equal(stopped.phase,phase);assert.equal(stopped.stride,0);assert.equal(stopped.action,'idle');
  assert.equal(stopped.leftFoot.lift,0);assert.equal(stopped.rightFoot.lift,0);
  entity.moving=true;entity.walkSpeed=200;entity.walkPhase=1.6;
  const freezePose=animator.sample(entity,{time:6});
  entity.facing=Math.PI;entity.moveFacing=Math.PI;entity.walkPhase=4;entity.hurtFace=.2;
  for(const time of [6.1,6.2,8])assert.deepEqual(animator.sample(entity,{time,frozen:true}),freezePose,'freeze holds the whole last pose, face and direction');
  const thaw=animator.sample(entity,{time:8.05});assert.equal(thaw.flip,-1);
  entity.hp=0;const fallen=animator.sample(entity,{time:8.1,frozen:true});
  assert.equal(fallen.action,'fall');assert.equal(fallen.actionProgress,1,'death overrides a previously frozen walking pose');
  const reducedActor=actor(heroId,{facing:Math.PI/2}),reducedAnimator=new HeroAnimator();
  assert.deepEqual(reducedAnimator.sample(reducedActor,{time:1,reduced:true}),reducedAnimator.sample(reducedActor,{time:2,reduced:true}),'reduced idle poses do not drift or blink');
  const previewActor=actor(heroId,{walkPhase:2.2,heroAnimationPreview:{direction:'front',action:'walk',progress:.1}});
  assert.equal(new HeroAnimator().sample(previewActor,{time:1}).phase,2.2,'selection walking uses the same distance phase as live play');
}

// A small diagonal input wobble retains its direction; a deliberate turn changes
// to the next view and retains that direction when movement stops.
{
  const animator=new HeroAnimator(),entity=actor('princess',{moving:true,walkSpeed:220,moveFacing:0});
  assert.equal(animator.sample(entity,{time:0}).view,'side');
  entity.moveFacing=Math.PI/4+.07;assert.equal(animator.sample(entity,{time:.1}).view,'side');
  entity.moveFacing=Math.PI/4+.2;assert.equal(animator.sample(entity,{time:.2}).view,'front');
  entity.moveFacing=Math.PI/4-.07;assert.equal(animator.sample(entity,{time:.3}).view,'front');
  entity.moveFacing=-Math.PI/2;assert.equal(animator.sample(entity,{time:.4}).view,'back');
  entity.moving=false;entity.walkSpeed=0;entity.facing=0;
  assert.equal(animator.sample(entity,{time:.5}).view,'back');
}

const arena=hero=>{
  const game=new Game({hero,appearanceId:`${hero}-v2`,terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false});
  game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.regionGrace=Infinity;
  game.crystalsNext=game.player.xpNext=Infinity;game.player.invuln=Infinity;return game;
};
const advance=(game,frames,input={})=>{for(let i=0;i<frames;i++)game.update(1/60,input);};
for(const hero of heroIds){
  const fast=arena(hero),slow=arena(hero);advance(fast,6,{x:1});advance(slow,12,{x:.5});
  near(fast.player.x,slow.player.x,'equal travel at different speeds');near(fast.player.walkPhase,slow.player.walkPhase,'gait follows actual distance');
  const phase=fast.player.walkPhase;advance(fast,12);assert.equal(fast.player.walkPhase,phase);assert.equal(fast.player.moving,false);
  const wall=arena(hero);wall.terrain=new Terrain({obstacles:[{id:'hero-step-wall',type:'rock',x:45,y:19.8,r:30}]});
  advance(wall,18,{x:1});const x=wall.player.x,blockedPhase=wall.player.walkPhase;
  advance(wall,18,{x:1});near(wall.player.x,x,'wall collision');assert.equal(wall.player.walkPhase,blockedPhase);assert.equal(wall.player.moving,false);
  const frozen=arena(hero),animator=new HeroAnimator();advance(frozen,6,{x:1});
  const pose=animator.sample(frozen.player,{time:frozen._clock});
  frozen.abilities.statusFor(frozen.player).frozenUntil=frozen.abilities.clock+1;
  const old={x:frozen.player.x,y:frozen.player.y,phase:frozen.player.walkPhase};advance(frozen,10,{x:0,y:-1});
  assert.equal(frozen.player.x,old.x);assert.equal(frozen.player.y,old.y);assert.equal(frozen.player.walkPhase,old.phase);
  assert.deepEqual(animator.sample(frozen.player,{time:frozen._clock,frozen:frozen.abilities.isFrozen(frozen.player)}),pose);
  frozen.status='paused';const clock=frozen._clock;advance(frozen,20,{x:-1});assert.equal(frozen._clock,clock);
}

// Combat presentation owns only pose metadata, with a lock that prevents each
// simultaneous auto attack from redirecting the same body.
{
  const player=actor(),game={player,_clock:1,abilities:{isFrozen:()=>false}};
  assert(recordHeroAction(game,{kind:'melee',angle:0,duration:.6,priority:3}));const action=player._heroAction;
  for(const priority of [1,2,3])assert.equal(recordHeroAction(game,{kind:'cast',angle:Math.PI,priority}),false);
  assert.equal(player._heroAction,action);
  assert(recordHeroAction(game,{kind:'cast',angle:Math.PI/2,priority:4}));
  const animator=new HeroAnimator(),pose=animator.sample(player,{time:1.2});assert.equal(pose.action,'cast');
  game._clock=3;assert(recordHeroAction(game,{kind:'ranged',angle:Math.PI,priority:1}),'an expired pose does not suppress later attacks');
  const legacy={player:{...player,appearanceId:'traveler',_heroAction:undefined},_clock:3};
  assert.equal(recordHeroAction(legacy,{kind:'melee'}),false);assert.equal(legacy.player._heroAction,undefined);
}

function context(){
  const calls=[],stack=[],c={globalAlpha:.6,lineWidth:2,fillStyle:'#123',strokeStyle:'#456',lineCap:'butt',lineJoin:'miter'};
  const state=()=>({globalAlpha:c.globalAlpha,lineWidth:c.lineWidth,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,lineCap:c.lineCap,lineJoin:c.lineJoin});
  for(const method of ['beginPath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath','ellipse','arc','clip','translate','scale','rotate','fillRect','clearRect'])c[method]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),'all canvas geometry is finite');calls.push([method,...args]);
  };
  c.save=()=>{stack.push(state());calls.push(['save']);};c.restore=()=>{assert(stack.length);Object.assign(c,stack.pop());calls.push(['restore']);};
  c.fill=()=>calls.push(['fill',c.fillStyle]);c.stroke=()=>calls.push(['stroke',c.strokeStyle,c.lineWidth]);
  c.drawImage=(image,...args)=>calls.push(['drawImage',image.id,...args]);
  c.createLinearGradient=(...args)=>({args,stops:[],addColorStop(at,color){this.stops.push([at,color]);}});
  return {c,calls,stack,state};
}
const canvases=[],makeCanvas=()=>{const record=context(),canvas={id:canvases.length+1,width:0,height:0,record,getContext:()=>record.c};canvases.push(canvas);return canvas;};
const art=new DirectionalHeroArt(makeCanvas),legacyArt=new HumanoidArt(makeCanvas);
function draw(renderer,kind,options={}){
  const out=context(),before=out.state();assert(renderer.draw(out.c,kind,options),`${kind} must paint through the actual appearance-ID entry point`);
  assert.deepEqual(out.state(),before);assert.equal(out.stack.length,0);return JSON.parse(JSON.stringify(out.calls));
}
const random=Math.random;Math.random=()=>{throw Error('hero art must not consume gameplay randomness');};
try{
  for(const ratio of [1,2])for(const hero of heroIds)for(const [direction,facing] of Object.entries(directions)){
    const entity=actor(hero,{facing});draw(art,`${hero}-v2`,{entity,pixelRatio:ratio,time:2,reduced:true});
  }
  const warm=art.cacheStats;
  assert(warm.bytes<=warm.limitBytes);assert(warm.entries>0);
  for(const hero of heroIds){
    const head=view=>JSON.parse(JSON.stringify(art.cache.get(`${hero}:${view}:head:1:2`).canvas.record.calls));
    assert.notDeepEqual(head('front'),head('back'),'back view has distinct head geometry');
    assert.notDeepEqual(head('front'),head('side'),'side view is independently drawn');
    const entity=actor(hero,{moving:true,walkSpeed:220,walkPhase:2.2});
    draw(legacyArt,hero,{entity:{...entity,appearanceId:hero},time:2,pixelRatio:2});
    const oldStats={...legacyArt.cacheStats};
    const oldCalls=draw(legacyArt,hero,{entity:{...entity,appearanceId:hero},time:2,pixelRatio:2});
    const newCalls=draw(legacyArt,`${hero}-v2`,{entity,time:2,pixelRatio:2});
    assert.notDeepEqual(oldCalls,newCalls);assert.deepEqual(legacyArt.cacheStats,oldStats,'new appearances cannot evict or rebuild old hero sprites');
    const still=draw(art,`${hero}-v2`,{entity,time:2,pixelRatio:2});
    entity.facing=Math.PI;entity.moveFacing=Math.PI;entity.walkPhase=5;entity.hurtFace=.2;
    assert.deepEqual(draw(art,`${hero}-v2`,{entity,time:3,pixelRatio:2,frozen:true}),still,'the rendered body, feet and face stay exactly frozen');
  }
  for(let i=0;i<600;i++){
    const hero=heroIds[i%3],direction=Object.keys(directions)[i%4],action=['walk','idle','melee','ranged','cast','hurt','fall'][i%7];
    const entity=actor(hero,{facing:directions[direction],walkPhase:i*.17,heroAnimationPreview:{direction,action,progress:(i%19)/18}});
    draw(art,`${hero}-v2`,{entity,pixelRatio:i%2?1:4,time:i*.016});
    assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);
  }
  assert.equal(art.cacheStats.builds,warm.builds,'direction/action/frame changes reuse the bounded material set');
  assert.equal(art.cacheStats.bytes,[...art.cache.values()].reduce((sum,sprite)=>sum+sprite.canvas.width*sprite.canvas.height*4,0));
  assert(canvases.every(canvas=>canvas.record.stack.length===0));
}finally{Math.random=random;}
console.log('Hero animation: real distance/collision/freeze/pause, four directions and diagonal hysteresis, grounded alternating feet, stop settlement, action ownership, preview phase, visible appearance dispatch, exact frozen render, independent bounded caches and caller state passed.');
