import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HumanoidArt,humanoidFaceState} from './dist/humanoid-art.js';

function recorder(){
  const calls=[],stack=[],gradients=[];
  const c={globalAlpha:.65,lineWidth:3,fillStyle:'#abc',strokeStyle:'#def',lineCap:'butt',lineJoin:'miter'};
  for(const method of ['beginPath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath','ellipse','arc','clip','translate','scale','rotate'])c[method]=(...args)=>{for(const v of args)if(typeof v==='number')assert(Number.isFinite(v));calls.push([method,...args]);};
  const paintState=()=>({globalAlpha:c.globalAlpha,lineWidth:c.lineWidth,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,lineCap:c.lineCap,lineJoin:c.lineJoin});
  c.save=()=>{stack.push(paintState());calls.push(['save']);};
  c.restore=()=>{assert(stack.length,'balanced art state');Object.assign(c,stack.pop());calls.push(['restore']);};
  c.fill=()=>calls.push(['fill',c.fillStyle,c.globalAlpha]);
  c.stroke=()=>calls.push(['stroke',c.strokeStyle,c.lineWidth,c.lineCap,c.lineJoin,c.globalAlpha]);
  c.drawImage=(image,...args)=>calls.push(['drawImage',image.id,...args]);
  c.createLinearGradient=(...args)=>{const g={args,stops:[],addColorStop(at,color){this.stops.push([at,color]);}};gradients.push(g);return g;};
  return {c,calls,stack,gradients,paintState};
}
function artwork(Art=HumanoidArt){
  const canvases=[],art=new Art(()=>{const record=recorder(),canvas={id:canvases.length+1,width:0,height:0,record,getContext:()=>record.c};canvases.push(canvas);return canvas;});
  return {art,canvases};
}
const variants=[
  {time:2,reduced:true},
  {time:2,entity:{moving:true},pose:{step:1,leftLift:3.2,rightLift:0,bodyY:-1.15,arm:1.8,cloth:1.7,cloakLift:1}},
  {time:2,entity:{hurtFace:.2}},
  {time:2,entity:{castFace:.2,castFacing:0}},
  {time:2,entity:{rescuedFace:.2}},
  {time:0,entity:{id:0}}
];
export function travelerTrace(Art=HumanoidArt){
  const traces=[];
  for(const pixelRatio of [1,2])for(const facing of [0,Math.PI])for(const variant of variants){
    const {art,canvases}=artwork(Art),out=recorder();
    art.draw(out.c,'traveler',{...variant,pixelRatio,entity:{...variant.entity,facing}});
    traces.push({calls:out.calls,sprites:canvases.map(c=>({width:c.width,height:c.height,calls:c.record.calls}))});
  }
  return createHash('sha256').update(JSON.stringify(traces)).digest('hex');
}
// Captured from the unmodified v0.0.82 renderer: cached paths, paint colors,
// gait, cape settlement and all expressions must remain exactly unchanged.
const TRAVELER_V82='85863809ebd40e96d9ffc8cd4c53eb92dd2559c394fb8255c1af0c47cf449d3c';
if(process.argv.includes('--traveler-trace'))console.log(travelerTrace());
else {
  assert.equal(travelerTrace(),TRAVELER_V82,'the prince must retain the complete existing player artwork');
  const kinds=['traveler','princess','elder','warden','stormcaller','merchant','angel'];
  const {art,canvases}=artwork();
  function draw(kind,options={}){const out=recorder(),before=out.paintState();assert(art.draw(out.c,kind,options));assert.deepEqual(out.paintState(),before);assert.equal(out.stack.length,0);return out;}
  const random=Math.random;Math.random=()=>{throw Error('art may not use gameplay randomness');};
  try{
    for(const kind of kinds)for(const facing of [0,Math.PI])draw(kind,{entity:{facing},time:2,pixelRatio:2});
    const warm=art.cacheStats;
    assert.equal(warm.entries,70,'all seven humanoids cache five parts per facing');
    assert(warm.bytes<=warm.limitBytes,'the complete roster fits the existing shared memory bound');
    for(let i=0;i<350;i++){const v=variants[i%variants.length];draw(kinds[i%kinds.length],{...v,pixelRatio:4,entity:{...v.entity,facing:i%2?Math.PI:0}});}
    assert.equal(art.cacheStats.builds,warm.builds,'walking, expressions and high native DPR do not rebuild sprites');
    assert.equal(art.cacheStats.entries,warm.entries);
    for(const kind of ['princess','elder']){
      const normal=draw(kind,{time:2,reduced:true}),hurt=draw(kind,{time:2,entity:{hurtFace:.2}}),blink=draw(kind,{time:0,entity:{id:0}}),focus=draw(kind,{time:2,entity:{castFace:.2}});
      assert.notDeepEqual(normal.calls,hurt.calls,'damage expression is visible');
      assert.notDeepEqual(normal.calls,blink.calls,'round eyes blink');
      assert.notDeepEqual(normal.calls,focus.calls,'casting has a focus expression');
      assert.deepEqual(normal.calls,draw(kind,{time:20,reduced:true}).calls,'reduced idle is deterministic');
      const moving=draw(kind,variants[1]);assert.notDeepEqual(normal.calls,moving.calls,'boots and arms use grounded walking phase');
      assert(moving.calls.some(call=>call[0]==='lineTo'&&Math.abs(call[2]-10.8)<.001),'raised foot follows the shared 3.2 px gait');
      for(const facing of [1,-1])for(const part of ['back','body','head','left','right']){
        const sprite=art.cache.get(`${kind}:${part}:${facing}`);
        assert(sprite);assert.equal(sprite.canvas.record.stack.length,0);
        assert(sprite.canvas.record.calls.some(c=>c[0]==='fill'||c[0]==='stroke'),'every part has native vector content');
        assert(!sprite.canvas.record.calls.some(c=>c[0]==='drawImage'),'new heroes need no external image assets');
      }
    }
    const princessHead=art.cache.get('princess:head:1').canvas.record.calls,elderHead=art.cache.get('elder:head:1').canvas.record.calls;
    assert.notDeepEqual(princessHead,elderHead,'roles differ by geometry, not just palette');
    assert(canvases.every(c=>c.width<=128&&c.height<=116),'individual parts keep their original bounded dimensions');
    assert.equal(canvases.reduce((n,c)=>n+c.width*c.height*4,0),art.cacheStats.bytes);
    draw('princess',{pixelRatio:1});assert.equal(art.cacheStats.entries,5,'density changes replace retained art instead of accumulating it');
  }finally{Math.random=random;}
  assert.equal(humanoidFaceState({invuln:3},2),'normal','scene-transition protection is not a hurt expression');
  console.log('Hero art: unchanged v82 traveler trace; distinct princess/elder silhouettes; shared grounded gait and expressions; all seven kinds/facings fit original DPR/cache bounds; caller state preserved.');
}
