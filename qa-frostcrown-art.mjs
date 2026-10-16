import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FROSTCROWN_ASSET, FrostcrownAssets, frostcrownAssets } from './dist/enemy-art/frostcrown-assets.js';
import { MonsterArt } from './dist/monster-art.js';
import { BOSS_SPECIALIST_ART } from './dist/enemy-art/specialist-bosses.js';
import { ENEMY_VISUALS, enemyVisual, enemyArtId } from './dist/enemy-visuals.js';
import { enemyAnimationPose, sampleEnemyPose, updateEnemyLocomotion } from './dist/enemy-animation.js';
import { groundOffset } from './dist/terrain.js';
import { frostcrownRigFeet } from './dist/enemy-art/frostcrown-rig.js';

// This is the exact RGBA source approved in the stage-2 running-game preview.
// Metadata alone cannot authorize a different replacement image.
const approvedSha='0d4e3d938dc5e6e087b53d02638c645d7de7dd384af9785d5551df1b8289b769';
const assetURL=new URL(FROSTCROWN_ASSET.path,new URL('./dist/enemy-art/frostcrown-assets.js',import.meta.url));
const png=readFileSync(assetURL);
assert.equal(createHash('sha256').update(png).digest('hex'),approvedSha,'production uses the approved source pixels');
assert.equal(FROSTCROWN_ASSET.sha256,approvedSha);
assert(assetURL.pathname.endsWith(`frostcrown-${approvedSha.slice(0,16)}.png`),'immutable image URL changes with source content');
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[1254,1254]);
assert.equal(png[25],6,'the approved PNG retains its RGBA alpha channel');

// Concurrent consumers must wait through decoding, and failure must not poison
// the next attempt or publish a half-loaded texture to the sprite cache.
{
  const assets=new FrostcrownAssets();let loadCalls=0,decodeCalls=0,resolveLoad,resolveDecode,resolveDecodeStarted;
  const loaded=new Promise(resolve=>{resolveLoad=resolve;});
  const decoded=new Promise(resolve=>{resolveDecode=resolve;});
  const decodeStarted=new Promise(resolve=>{resolveDecodeStarted=resolve;});
  const image={naturalWidth:1254,naturalHeight:1254,decode(){decodeCalls++;resolveDecodeStarted();return decoded;}};
  const first=assets.preload({load:async url=>{loadCalls++;assert.equal(url,assetURL.href);return loaded;}});
  const second=assets.preload({load:async()=>{assert.fail('concurrent consumer started a duplicate request');}});
  assert.equal(first,second);assert.equal(loadCalls,1);assert.equal(assets.ready,false);assert.equal(assets.image,null);
  resolveLoad(image);await decodeStarted;
  assert.equal(decodeCalls,1);assert.equal(assets.ready,false,'load event alone cannot publish an undecoded image');
  resolveDecode();assert.equal(await first,assets);assert.equal(assets.image,image);
  await assets.preload({load:async()=>assert.fail('ready texture was loaded twice')});
  assert.deepEqual(assets.diagnostics,{ready:true,decodes:1,bytes:1254*1254*4});
  assert.throws(()=>{assets.image={width:1,height:1};},TypeError,'consumers cannot replace the shared decoded image');
}
{
  const assets=new FrostcrownAssets();
  await assert.rejects(assets.preload({load:async()=>{throw Error('network fixture');}}),/network fixture/);
  assert.equal(assets.ready,false);
  await assert.rejects(assets.preload({load:async()=>({width:1254,height:1254,decode:async()=>{throw Error('decode fixture');}})}),/decode fixture/);
  assert.equal(assets.ready,false);
  await assert.rejects(assets.preload({load:async()=>({width:1254,height:1254,naturalWidth:12,naturalHeight:1254})}),/dimensions/);
  assert.equal(assets.ready,false);
  const valid={width:1254,height:1254};await assets.preload({load:async()=>valid});
  assert.equal(assets.image,valid);assert.equal(assets.diagnostics.decodes,1,'only a successful decoded texture counts');
}

const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const project=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
function recorder(){
  const calls=[],draws=[],clips=[],stack=[];let matrix=[1,0,0,1,0,0],path=[];
  const log=(method,args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${method}: finite coordinates`);calls.push([method,...args]);};
  const ctx={
    save(){stack.push(matrix.slice());log('save',[]);},
    restore(){assert(stack.length,'canvas state cannot underflow');matrix=stack.pop();log('restore',[]);},
    scale(x,y){log('scale',[x,y]);matrix=multiply(matrix,[x,0,0,y,0,0]);},
    translate(x,y){log('translate',[x,y]);matrix=multiply(matrix,[1,0,0,1,x,y]);},
    rotate(angle){log('rotate',[angle]);const c=Math.cos(angle),s=Math.sin(angle);matrix=multiply(matrix,[c,s,-s,c,0,0]);},
    transform(...values){log('transform',values);assert.equal(values.length,6);assert(Math.abs(values[0]*values[3]-values[1]*values[2])>1e-10,'mesh triangles cannot collapse');matrix=multiply(matrix,values);},
    beginPath(){path=[];log('beginPath',[]);},
    moveTo(x,y){path.push(project(matrix,x,y));log('moveTo',[x,y]);},
    lineTo(x,y){path.push(project(matrix,x,y));log('lineTo',[x,y]);},
    clip(...args){clips.push(path.slice());log('clip',args);},
    drawImage(image,...args){log('drawImage',args);assert(image,'image handle is present');draws.push({image,args,matrix:matrix.slice()});},
    createLinearGradient(){return{addColorStop(){}};}
  };
  for(const method of ['closePath','quadraticCurveTo','bezierCurveTo','arc','ellipse','fill','stroke','fillRect'])ctx[method]=(...args)=>log(method,args);
  return {ctx,calls,draws,clips,get depth(){return stack.length;}};
}
function canvasFactory(){
  const record=recorder();return {width:0,height:0,record,getContext:()=>record.ctx};
}
function sourcePoint(draw,x,y){
  let sx=0,sy=0,sw=draw.image.naturalWidth??draw.image.width,sh=draw.image.naturalHeight??draw.image.height,dx,dy,dw,dh;
  if(draw.args.length===8)[sx,sy,sw,sh,dx,dy,dw,dh]=draw.args;
  else if(draw.args.length===4)[dx,dy,dw,dh]=draw.args;
  else if(draw.args.length===2){[dx,dy]=draw.args;dw=sw;dh=sh;}
  else assert.fail(`unsupported drawImage argument count ${draw.args.length}`);
  return project(draw.matrix,dx+(x-sx)/sw*dw,dy+(y-sy)/sh*dh);
}
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<.002,`${message}: ${actual} != ${expected}`);
const body={type:'boss',bossKind:'frostcrown',id:23,x:0,y:0,r:49,hp:2300,maxHp:2300,speed:140,damage:22,visualFacing:0,walkPhase:0,moving:false};

// A premature draw must throw without creating a reusable transparent sprite.
assert.equal(frostcrownAssets.ready,false);
{
  const art=new MonsterArt(canvasFactory);
  assert.throws(()=>art.draw(recorder().ctx,body),/preloaded/);
  assert.deepEqual(art.diagnostics,{entries:0,size:0,pixels:0,bytes:0,limitBytes:7*1024*1024,builds:0});
}
const texture=Object.freeze({width:1254,height:1254});
await frostcrownAssets.preload({load:async()=>texture});

const painter=BOSS_SPECIALIST_ART.frostcrown;
// Check support in world coordinates, independently of how the mesh is built:
// a planted hoof must stay in place as its body travels through the stance.
{
  const positions=[];
  for(const phase of [.05,.2,.4]){
    const feet=frostcrownRigFeet({mode:'move',moving:true,cycle:phase*Math.PI*2});
    const support=feet.find(foot=>foot.id==='frontNear');
    assert(support.planted);near(support.lift,0,'stance hoof remains on its own ground plane');
    positions.push(support.target.x+phase*48);
  }
  near(positions[0],positions[1],'support stays planted across resolved travel');
  near(positions[1],positions[2],'support stays planted later in the same stance');
  const phases=[.25,.75].map(phase=>frostcrownRigFeet({mode:'move',moving:true,cycle:phase*Math.PI*2}));
  assert(phases.every(feet=>feet.some(foot=>foot.lift>1)&&feet.some(foot=>foot.planted)),'swinging feet coexist with grounded support');
  assert.notDeepEqual(phases[0].filter(foot=>foot.lift>1).map(foot=>foot.id),phases[1].filter(foot=>foot.lift>1).map(foot=>foot.id),'opposite support pairs alternate');
}
{
  const idle=recorder();painter.paint(idle.ctx,0,1,{mode:'idle',cycle:0,moving:false});
  assert.equal(idle.depth,0);assert.equal(idle.draws.length,1,'idle preserves the approved whole source instead of rebuilding its face');
  assert.equal(idle.clips.length,0,'idle does not introduce mesh seams');assert.equal(idle.draws[0].image,texture);
  const anchor=sourcePoint(idle.draws[0],731.25,1200),top=sourcePoint(idle.draws[0],731.25,75);
  near(anchor.x,0,'approved support center');near(anchor.y,40,'unchanged planted-foot origin');near(top.y,-88,'approved total visible height 128');
  assert(sourcePoint(idle.draws[0],230,650).x>0,'the left-facing original is normalized to canonical right-facing artwork');
  assert(!idle.calls.some(call=>['fill','stroke','fillRect'].includes(call[0])),'idle source colors and outlines are not redrawn');
}

const originalRandom=Math.random;Math.random=()=>{throw Error('art cannot consume gameplay RNG');};
try{
  const walkTraces=new Set();
  for(let frame=0;frame<8;frame++){
    const record=recorder(),pose={mode:'move',cycle:frame*Math.PI/4,moving:true};
    const before=JSON.stringify(pose);painter.paint(record.ctx,Math.sin(pose.cycle),1,Object.freeze(pose));
    assert.equal(record.depth,0);assert.equal(JSON.stringify(pose),before);
    assert(record.draws.length>1&&record.draws.length<=500,'animated mesh work is bounded per authored pose');
    assert(record.clips.length>0,'animated mesh uses clipped source pixels');
    assert(record.draws.every(draw=>draw.image===texture),'all gait pieces retain the approved texture');
    walkTraces.add(JSON.stringify(record.calls));
  }
  assert(walkTraces.size>=3,'walk has distinct support phases rather than whole-picture bobbing');
  for(const action of ['frostbolt','frostCharge','shatter','frostRing'])for(const mode of ['windup','active','recovery'])for(const progress of [0,.5,1]){
    const record=recorder(),pose=Object.freeze({mode,action,progress,cycle:0,moving:false});
    painter.paint(record.ctx,0,1,pose);assert.equal(record.depth,0);
    assert(record.draws.length>0&&record.draws.length<=500,'action poses remain bounded');
  }
  const art=new MonsterArt(canvasFactory),entity={...body},first=recorder();
  art.draw(first.ctx,entity,{time:1});const image=first.draws[0].image,builds=art.diagnostics.builds;
  const headOnCanvas=sourcePoint(image.record.draws[0],230,650);
  assert(sourcePoint(first.draws[0],headOnCanvas.x,headOnCanvas.y).x>0,'right-facing actor shows its muzzle on the right');
  entity.visualFacing=Math.PI;
  const frozen=recorder();art.draw(frozen.ctx,entity,{time:9,frozen:true});
  assert.equal(frozen.draws[0].image,image);assert.equal(art.diagnostics.builds,builds);
  assert(sourcePoint(frozen.draws[0],headOnCanvas.x,headOnCanvas.y).x>0,'freeze retains the previous facing');
  const thawed=recorder();art.draw(thawed.ctx,entity,{time:10});
  assert.equal(thawed.draws[0].image,image,'left/right reuse one canonical cached bitmap');
  assert(sourcePoint(thawed.draws[0],headOnCanvas.x,headOnCanvas.y).x<0,'thaw restores native left-facing orientation');
  entity.moving=true;entity.walkPhase=Math.PI/4;const moving=recorder();art.draw(moving.ctx,entity);
  entity.walkPhase=Math.PI;const held=recorder();art.draw(held.ctx,entity,{frozen:true,time:20});
  assert.equal(held.draws[0].image,moving.draws[0].image,'freeze holds the rendered gait frame');
  const resumed=recorder();art.draw(resumed.ctx,entity);assert.notEqual(resumed.draws[0].image,moving.draws[0].image);

  const stable=new MonsterArt(canvasFactory),target=recorder().ctx;
  for(let frame=0;frame<8;frame++)stable.draw(target,{...body,moving:true,walkPhase:(frame+.1)*Math.PI/4});
  const warmed=stable.diagnostics.builds;
  for(let frame=0;frame<320;frame++)stable.draw(target,{...body,moving:true,walkPhase:(frame%8+.1)*Math.PI/4,visualFacing:frame%2?0:Math.PI,hit:frame%3===0?.1:0},{time:frame/60});
  assert.equal(stable.diagnostics.builds,warmed,'time, hit feedback and mirrored direction do not multiply gait cache entries');
  const stateKeys=new Set();
  for(const action of ['frostbolt','frostCharge','shatter','frostRing'])for(const phase of ['windup','active','rush','recovery'])for(let frame=0;frame<160;frame++){
    const e={...body,moving:phase==='rush',walkPhase:frame*.07,specialAttack:phase==='recovery'?null:{kind:action,phase,life:1-frame/159,maxLife:1},specialRecovery:phase==='recovery'?1-frame/160:0,specialRecoveryMax:1,specialPose:action};
    stateKeys.add(sampleEnemyPose(enemyAnimationPose(e)).key);
    stable.draw(target,Object.freeze(e),{time:frame/31});
    assert(stable.diagnostics.bytes<=stable.diagnostics.limitBytes,'transient action poses respect the 7 MiB shared cap');
  }
  assert(stateKeys.size<130,'raw progress and render time cannot become unbounded cache keys');
}finally{Math.random=originalRandom;}

// Preserve identity, physical foot/radius and immersion while visual framing
// grows to contain the approved antlers. This does not replace browser collision QA.
const snapshot=JSON.stringify(body),art=new MonsterArt(canvasFactory);
art.draw(recorder().ctx,Object.freeze({...body}));assert.equal(JSON.stringify(body),snapshot);
assert.equal(enemyArtId(body),'frostcrown');assert.equal(groundOffset(body),40);
assert.equal(enemyVisual(body).radius,49);assert.deepEqual(enemyVisual(body).immersionBody,[110,49]);
assert.equal(ENEMY_VISUALS.frostcrown.cacheRatio,1.5);assert(ENEMY_VISUALS.frostcrown.top>=88);
const travel={...body,x:12,moving:false};updateEnemyLocomotion(travel,0,0,.2);
near(travel.walkPhase,Math.PI/2,'a quarter of the authored 48-unit visual stride');
assert.deepEqual([travel.r,travel.hp,travel.speed,travel.damage],[49,2300,140,22]);
for(const [kind,foot] of [['broodmother',39],['deepcaller',40],['furnace',42]]){
  assert.equal(ENEMY_VISUALS[kind].foot,foot);assert.equal(ENEMY_VISUALS[kind].radius,49);
  const output=recorder();BOSS_SPECIALIST_ART[kind].paint(output.ctx,0,1,{mode:'idle'});
  assert.equal(output.depth,0);assert.equal(output.draws.length,0,`${kind} retains its native vector painter`);
}
console.log('Frostcrown artwork: approved PNG/SHA, decoded single-load/retry/read-only assets, no empty cached frame, original idle anchors, finite textured motion/actions, native facing/freeze, stable bounded cache and unchanged identity/feet/other Bosses passed.');
