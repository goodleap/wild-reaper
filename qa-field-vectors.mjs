import assert from 'node:assert/strict';
import { FieldVectorArt } from './dist/field-vector-art.js';
import { SuperArt } from './dist/super-art.js';

const methods=['moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath'];
class RecordedPath{
  constructor(){this.commands=[];for(const method of methods)this[method]=(...values)=>{assert(values.every(Number.isFinite),'compiled geometry is finite');assert(values.every(value=>Math.abs(value)<160),'field silhouettes stay bounded');this.commands.push([method,...values]);};}
}
function recorder(){
  const calls=[],paints=[];let commands=[];const ctx={calls,paints,globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:1};
  for(const method of methods)ctx[method]=(...args)=>{calls.push([method,...args]);commands.push([method,...args]);};
  ctx.beginPath=()=>{commands=[];calls.push(['beginPath']);};
  ctx.fill=path=>paints.push({kind:'fill',color:ctx.fillStyle,commands:path?.commands??commands});
  ctx.stroke=path=>paints.push({kind:'stroke',color:ctx.strokeStyle,width:ctx.lineWidth,commands:path?.commands??commands});
  for(const method of ['save','restore','scale','translate','rotate','drawImage'])ctx[method]=(...args)=>calls.push([method,...args]);
  return ctx;
}
const fields=new FieldVectorArt({makePath:()=>new RecordedPath()}),fallback=new FieldVectorArt({makePath:()=>null});
const drawAll=(art,ctx)=>{for(let variant=0;variant<3;variant++)for(const raised of [false,true])art.drawThorns(ctx,variant,{raised});for(const layer of [0,1])art.drawVortexRibbon(ctx,layer);art.drawVortexCore(ctx);};
const compiled=recorder(),replayed=recorder();drawAll(fields,compiled);drawAll(fallback,replayed);
assert.deepEqual(compiled.paints,replayed.paints,'non-Path2D headless fallback preserves exactly the same silhouettes and materials');
assert.equal(compiled.calls.length,0,'native paths require only fill/stroke calls, no geometry replay');
assert.equal(fields.stats.entries,9,'three root and raised variants, two ribbons and one core are the entire bounded collection');
assert(fields.stats.pathBuilds<=64,'same material is batched into a small fixed number of paths');
assert(fields.stats.commands<3000,'vector paths have a bounded geometric footprint');
const warm={...fields.stats};
for(let frame=0;frame<300;frame++){
  const ctx=recorder();ctx.scale(frame%2?1:2,frame%2?1:2);ctx.rotate(frame/30);drawAll(fields,ctx);
  assert(ctx.calls.every(call=>call[0]==='scale'||call[0]==='rotate'),'hot frames transform compiled paths without rebuilding geometry');
}
assert.deepEqual(fields.stats,warm,'device scale and animation never rebuild or multiply vector caches');
for(const variant of [-22,23,Infinity,NaN])fields.drawThorns(recorder(),variant);
assert.deepEqual(fields.stats,warm,'untrusted visual seeds cannot expand the variant cache');
let allocations=0;const art=new SuperArt(()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})}),{makePath:()=>{allocations++;return new RecordedPath();}});
for(const kind of ['thorns','vortex']){
  const field={kind,x:20,y:30,r:180,seed:3,life:2,maxLife:3},ctx=recorder();
  // No particles in this test: body quality and cost are independent of debris.
  art._data=()=>({seed:3,particles:[]});
  if(kind==='vortex'){art._data=()=>({seed:3,particles:Array.from({length:3},()=>({a:0,r:.5,size:3}))});ctx.ellipse=()=>{};}
  art.drawField(ctx,field,{reduced:true,dense:true});
  assert.equal(ctx.calls.filter(call=>call[0]==='drawImage').length,1,'only the low-opacity halo uses an image');
  assert(ctx.paints.length<=23,'each complete field uses a small bounded number of vector paints');
  const count=allocations;field.r=360;art.drawField(recorderFor(art,kind),field,{reduced:true,dense:true});assert.equal(allocations,count,'zooming enlarges paths, not cached bitmaps');
}
function recorderFor(){const ctx=recorder();ctx.ellipse=()=>{};return ctx;}
console.log(`Field vectors: ${warm.entries} reusable groups, ${warm.pathBuilds} material paths, ${warm.commands} commands; native/fallback parity, sharp scalable bodies and zero warm-frame path allocation passed.`);
