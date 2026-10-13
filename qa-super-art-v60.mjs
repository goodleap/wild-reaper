import assert from 'node:assert/strict';
import { SuperArt } from './dist/super-art.js';

function context(record=true){
  const calls=[],stack=[];let state={globalAlpha:1,lineWidth:1,shadowBlur:0};
  const target={calls,get depth(){return stack.length;},save(){stack.push({...state});},restore(){assert(stack.length,'balanced Canvas state');state=stack.pop();}};
  for(const method of ['createRadialGradient','createLinearGradient'])target[method]=(...args)=>{
    args.forEach(n=>assert(Number.isFinite(n)));if(record)calls.push([method]);
    return{addColorStop(stop,color){assert(stop>=0&&stop<=1);assert.equal(typeof color,'string');}};
  };
  for(const method of ['translate','rotate','scale','beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','rect','clip','fill','stroke','fillRect','drawImage'])target[method]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${method} finite geometry`);
    if(method==='arc')assert(args[2]>=0);if(method==='ellipse')assert(args[2]>=0&&args[3]>=0);
    if(record)calls.push([method,...args.map(v=>typeof v==='object'?v.key??'object':v),state.globalAlpha]);
  };
  return new Proxy(target,{get:(t,k)=>k in t?t[k]:state[k],set:(t,k,v)=>{
    if(k==='globalAlpha')assert(Number.isFinite(v)&&v>=0&&v<=1,`alpha ${v}`);
    if(k==='shadowBlur')assert.equal(v,0,'no runtime blur');
    if(k==='lineWidth')assert(Number.isFinite(v)&&v>0);
    state[k]=v;return true;
  }});
}
class RecordedPath {
  constructor(){for(const method of ['moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath'])this[method]=(...values)=>values.forEach(value=>assert(Number.isFinite(value)));}
}
let canvases=0;
const art=new SuperArt(()=>({key:++canvases,width:0,height:0,getContext:()=>context(false)}),{makePath:()=>new RecordedPath()});
const fields=['thorns','miasma','meteor','vortex'].flatMap(kind=>[1,2,3].map(seed=>({kind,id:seed,seed,x:200,y:180,r:120,life:3,maxLife:3.2,interval:.4})));
const effects=[
  {type:'superRunicCharge',angle:.4,r:18},
  {type:'superRay',x2:490,y2:210,r:14},
  {type:'superSword',x2:490,y2:210,r:14},
  {type:'superSword',x2:490,y2:210,r:14,impactOnly:true,angle:.4},
  ...['meteor','miasma','domain','swords'].map(skillId=>({type:'superBurst',skillId,r:120,count:6})),
].map(e=>({...e,seed:41,x:200,y:180,life:.6,maxLife:.65}));
const previousRandom=Math.random;Math.random=()=>{throw Error('render must not consume gameplay randomness');};
try{
  for(const reduced of [false,true])for(const dense of [false,true])for(const phase of [0,.04,.12,.4,.82,.999]){
    const ctx=context(),options={reduced,dense};
    for(const original of fields){const f={...original,life:original.maxLife*(1-phase)},snapshot=structuredClone(f);assert(art.drawField(ctx,f,options));art.drawFieldAir(ctx,f,options);assert.deepEqual(f,snapshot);}
    for(const original of effects){const e={...original,life:original.maxLife*(1-phase)},snapshot=structuredClone(e);assert(art.drawEffect(ctx,e,options));assert.deepEqual(e,snapshot);}
    assert.equal(ctx.depth,0);assert(!ctx.calls.some(c=>c[0].startsWith('create')),'gradients are created only inside cached sprites');
  }
  const warm=art.cacheStats;
  for(let frame=0;frame<240;frame++){
    const ctx=context(false),options={dense:!!(frame%2),reduced:frame%3===0};
    for(const f of fields){f.life=.01+(frame%190)/70;art.drawField(ctx,f,options);art.drawFieldAir(ctx,f,options);}
    for(const e of effects)art.drawEffect(ctx,e,options);
  }
  assert.equal(art.cacheStats.builds,warm.builds,'all palettes stay resident after warmup, with no cache churn');
  assert.equal(art.cacheStats.vectorPathBuilds,warm.vectorPathBuilds,'field vector paths compile only once per fixed variant');
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'fixed sprite cache remains inside its allocation budget');
  const vortex=fields.find(f=>f.kind==='vortex'),vctx=context();art.drawField(vctx,vortex);
  assert.equal(vctx.calls.filter(c=>c[0]==='drawImage').length,1,'vortex only rasterizes its quiet glow; ribbons and core stay vector');
  assert(vctx.calls.filter(c=>c[0]==='lineTo').length<65,'hot frames do not rebuild spiral ribbon geometry');
  const thorn=fields.find(f=>f.kind==='thorns'),tctx=context();art.drawField(tctx,thorn);
  assert.equal(tctx.calls.filter(c=>c[0]==='drawImage').length,1,'roots only rasterize their quiet glow; body and foliage stay vector');
  assert.equal(tctx.calls.filter(c=>c[0]==='lineTo').length,0,'root geometry is static after cache warmup');
  for(const field of [vortex,thorn]){
    const one=context(),two=context();art.drawField(one,field,{time:0});art.drawField(two,field,{time:999});assert.deepEqual(two.calls,one.calls,'effect lifetime, not wall-clock, controls animation');
  }
  const ray=effects.find(e=>e.type==='superRay'),first=context(),later=context();
  art.drawEffect(first,{...ray,life:ray.maxLife});art.drawEffect(later,{...ray,life:ray.maxLife*.55});
  const arrows=c=>c.calls.filter(x=>x[0]==='drawImage'&&x[4]===144);
  assert.equal(arrows(first).length,1);assert.equal(arrows(later).length,1);
  assert.deepEqual(arrows(first)[0].slice(0,-1),arrows(later)[0].slice(0,-1),'instant piercing attack has a fixed endpoint arrow, never a delayed traveling head');
  assert(arrows(later)[0].at(-1)<arrows(first)[0].at(-1),'the endpoint arrow is a fading afterimage');
  for(const kind of ['thorns','vortex'])for(const r of [1,22,420]){const ctx=context();assert(art.drawField(ctx,{kind,x:0,y:0,r,life:.01,maxLife:4}));assert.equal(ctx.depth,0);}
}finally{Math.random=previousRandom;}
console.log(`Super art: crisp vector field layers, compiled vortex geometry, instant runic-arrow afterimage, immutable paused simulation and stable ${art.cacheStats.bytes}-byte cache passed.`);
