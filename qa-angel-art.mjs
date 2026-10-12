import assert from 'node:assert/strict';
import { AngelArt, ANGEL_FOOT_RING } from './dist/angel-art.js';
import { lightningPath } from './dist/storm-geometry.js';

function recordingContext(){
  const calls=[],ctx={globalAlpha:.7,stack:[]};
  for(const name of ['beginPath','moveTo','lineTo','closePath','fill','stroke','ellipse','arc','fillRect','translate','scale','rotate','quadraticCurveTo','drawImage'])ctx[name]=(...args)=>calls.push([name,...args]);
  ctx.save=()=>{ctx.stack.push(ctx.globalAlpha);calls.push(['save']);};
  ctx.restore=()=>{ctx.globalAlpha=ctx.stack.pop();calls.push(['restore']);};
  ctx.createRadialGradient=(...args)=>{calls.push(['createRadialGradient',...args]);return{addColorStop(){}};};
  return{ctx,calls};
}
const canvases=[],art=new AngelArt(()=>{const {ctx,calls}=recordingContext(),canvas={width:0,height:0,getContext:()=>ctx,calls};canvases.push(canvas);return canvas;});
const site={type:'angel',x:40,y:70,healing:false,_attack:0};
function aura(options){const recording=recordingContext();assert(art.drawAura(recording.ctx,site,options));assert.equal(recording.ctx.globalAlpha,.7);assert.equal(recording.ctx.stack.length,0);return recording.calls;}
const standard=aura({pixelRatio:1,time:10});assert.equal(canvases.length,1);
assert.equal(canvases[0].width,316);assert.equal(canvases[0].height,316);
assert(canvases[0].calls.some(c=>c[0]==='arc'&&c[3]===150),'cached boundary follows the actual guard radius');
assert.deepEqual(aura({pixelRatio:1,time:10}),standard,'same simulation time draws a stationary aura');
assert.notDeepEqual(aura({pixelRatio:1,time:11}),standard,'only a few motes animate');assert.equal(canvases.length,1,'steady frames reuse static artwork');
const retina=aura({pixelRatio:2,time:10});assert.equal(canvases.length,2);assert.equal(canvases[1].width,632);assert.equal(art.cacheStats.pixelRatio,2);
const image=retina.find(c=>c[0]==='drawImage');assert.deepEqual(image.slice(2),[-158,-158,316,316],'hiDPI artwork keeps the same world footprint');
const foot=retina.find(c=>c[0]==='ellipse');assert.deepEqual(foot.slice(1,5),[0,0,ANGEL_FOOT_RING.rx,ANGEL_FOOT_RING.ry]);
assert(!retina.some(c=>c[0]==='scale'),'the foot ring is never scaled up with the aura bitmap');
assert(ANGEL_FOOT_RING.rx<25&&ANGEL_FOOT_RING.ry<12,'the small ring fits a normal humanoid footprint');
for(let i=0;i<20;i++)aura({pixelRatio:3,time:i});
assert.equal(canvases.length,2,'DPR is capped at the game display density');assert.equal(art.cacheStats.entries,1);assert(art.cacheStats.bytes<1_700_000,'all guardians share a small bounded cache');
assert.deepEqual(aura({pixelRatio:2,time:5,reduced:true}),aura({pixelRatio:2,time:50,reduced:true}));
const wrong=recordingContext();assert.equal(art.drawAura(wrong.ctx,{type:'merchant'}),false);assert.equal(wrong.calls.length,0);

const effect={type:'angelStrike',x:100,y:200,r:60,seed:913,life:.18,maxLife:.18};
const viewport={screenTopWorldY:-160,viewWidth:390};
const shape=art._strike(effect,viewport),end=shape.main.at(-1),start=shape.main[0];
assert.deepEqual(shape.main,lightningPath(start,end,effect.seed,5,.16),'angel lightning shares the protagonist fractal discharge geometry');
assert(start.y<viewport.screenTopWorldY-40,'the thunder visibly enters from above the phone viewport');
assert(end.y-start.y>350,'the main bolt is a long sky stroke, not a short contact spark');
for(const point of shape.arcs.flat())assert(Math.hypot(point.x-effect.x,point.y-effect.y)<45,'ground arcs remain localized at the actual impact');
const moved=art._strike(effect,{screenTopWorldY:-190,viewWidth:390});assert.equal(moved,shape,'camera movement never rebuilds an active world-space strike');
assert(moved.main[0].y<-190,'the initial overhang covers camera movement during the short effect');
const desktop={...effect,seed:914},desktopShape=art._strike(desktop,{screenTopWorldY:-420,viewWidth:1100});
assert(desktopShape.main[0].y<-420,'desktop thunder also starts outside the actual viewport');

assert.equal(shape.branches.length,2);assert.equal(shape.arcs.length,4);assert.equal(art._strike(effect),shape);
const savedRandom=Math.random;Math.random=()=>{throw new Error('painting must not consume gameplay randomness');};
function strike(options){const recording=recordingContext();assert(art.drawStrike(recording.ctx,effect,{...viewport,...options}));assert.equal(recording.ctx.globalAlpha,.7);assert.equal(recording.ctx.stack.length,0);return recording.calls;}
try{
  const full=strike({});assert.deepEqual(strike({}),full,'paused lightning retains its geometry');assert.equal(art.cacheStats.geometryBuilds,2);
  assert(!full.some(c=>['fillRect','createRadialGradient','drawImage'].includes(c[0])),'rapid sky strikes have no fullscreen exposure or per-frame raster work');
  assert(strike({dense:true}).length<full.length);assert(strike({reduced:true}).length<full.length);
}finally{Math.random=savedRandom;}
const expired=recordingContext();assert(art.drawStrike(expired.ctx,{...effect,life:0}));assert.equal(expired.calls.length,0);
console.log('Angel art: shared hiDPI aura cache, bounded memory, independent proportional foot ring, deterministic paused/reduced drawing, protagonist-shared long sky lightning and reduced dense-work budget passed.');
