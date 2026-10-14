import assert from 'node:assert/strict';
import { SPECIALIST_ART } from './dist/enemy-art/specialists.js';

function recordingContext(){
  const calls=[],stack=[];let matrix=[1,0,0,1,0,0];
  const bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
  const point=(x,y)=>{const X=matrix[0]*x+matrix[2]*y+matrix[4],Y=matrix[1]*x+matrix[3]*y+matrix[5];bounds.left=Math.min(bounds.left,X);bounds.right=Math.max(bounds.right,X);bounds.top=Math.min(bounds.top,Y);bounds.bottom=Math.max(bounds.bottom,Y);};
  const transform=(a,b,c,d,e,f)=>{const [A,B,C,D,E,F]=matrix;matrix=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];};
  const ctx={};
  for(const method of ['beginPath','closePath','fill','stroke'])ctx[method]=(...args)=>calls.push([method,...args]);
  for(const method of ['moveTo','lineTo','quadraticCurveTo','bezierCurveTo'])ctx[method]=(...args)=>{
    assert(args.every(Number.isFinite),`${method}: finite positions`);calls.push([method,...args]);for(let i=0;i<args.length;i+=2)point(args[i],args[i+1]);
  };
  ctx.ellipse=(x,y,rx,ry,a,start,end)=>{
    assert([x,y,rx,ry,a,start,end].every(Number.isFinite));assert(rx>=0&&ry>=0);calls.push(['ellipse',x,y,rx,ry,a,start,end]);
    for(let i=0;i<32;i++){const t=i*Math.PI/16;point(x+Math.cos(t)*rx*Math.cos(a)-Math.sin(t)*ry*Math.sin(a),y+Math.cos(t)*rx*Math.sin(a)+Math.sin(t)*ry*Math.cos(a));}
  };
  ctx.save=()=>stack.push([...matrix]);ctx.restore=()=>{assert(stack.length,'balanced restore');matrix=stack.pop();};
  ctx.translate=(x,y)=>{assert([x,y].every(Number.isFinite));calls.push(['translate',x,y]);transform(1,0,0,1,x,y);};
  ctx.scale=(x,y)=>{assert([x,y].every(Number.isFinite));calls.push(['scale',x,y]);transform(x,0,0,y,0,0);};
  ctx.rotate=a=>{assert(Number.isFinite(a));calls.push(['rotate',a]);transform(Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0);};
  ctx.createLinearGradient=(...args)=>{assert(args.every(Number.isFinite));return{addColorStop(at,color){assert(Number.isFinite(at));calls.push(['color',color]);}};};
  return {ctx,calls,stack,bounds};
}
const ids=['rootbinder','boglurker','prismguard','tidepriest','shieldguard','stoneape','windhunter','frostmage','flamelizard','spiderling'];
const modes=['idle','move','windup','active','recovery','rush','air','hit'];
const random=Math.random;Math.random=()=>{throw new Error('Drawing must not consume simulation randomness');};
try{
  for(const id of ids){
    assert(SPECIALIST_ART[id].animated,`${id}: cached action poses enabled`);
    const variants=new Set();
    for(const flip of [-1,1])for(const mode of modes)for(const progress of [0,.25,.5,.75,1])for(const cycle of [0,Math.PI*.5,Math.PI,Math.PI*1.5]){
      const rec=recordingContext();SPECIALIST_ART[id].paint(rec.ctx,Math.sin(cycle),flip,{mode,progress,cycle,moving:mode==='move'||mode==='air'});
      assert.equal(rec.stack.length,0,`${id}/${mode}: balanced canvas state`);assert(rec.calls.length>25);
      if(mode==='windup'||mode==='recovery')variants.add(JSON.stringify(rec.calls));
    }
    if(id!=='spiderling')assert(variants.size>=4,`${id}: action and recovery visibly change the body pose`);
  }
  for(const id of ['rootbinder','spiderling']){
    const variants=new Set();
    for(let i=0;i<8;i++){
      const cycle=i*Math.PI/4,rec=recordingContext();SPECIALIST_ART[id].paint(rec.ctx,Math.sin(cycle),1,{mode:'move',moving:true,cycle});variants.add(JSON.stringify(rec.calls));
    }
    assert(variants.size>=6,`${id}: full gait cycle retains alternating planted and lifted feet`);
  }
  const spider=recordingContext();SPECIALIST_ART.spiderling.paint(spider.ctx,0,1,{mode:'idle'});
  // Eight three-point leg paths, excluding eye ellipses and body polygons.
  const paths=[];let path=[];
  for(const call of spider.calls){if(call[0]==='beginPath')path=[];else if(call[0]==='moveTo'||call[0]==='lineTo')path.push(call);else if(call[0]==='stroke')paths.push(path);}
  assert.equal(paths.filter(path=>path.length===3).length,8,'juvenile spiders have eight segmented legs');
  const held=recordingContext(),released=recordingContext(),reloaded=recordingContext();
  SPECIALIST_ART.stoneape.paint(held.ctx,0,1,{mode:'windup',progress:.3});
  SPECIALIST_ART.stoneape.paint(released.ctx,0,1,{mode:'windup',progress:.7});
  SPECIALIST_ART.stoneape.paint(reloaded.ctx,0,1,{mode:'recovery',progress:1});
  const stoneCount=record=>record.calls.filter(call=>call[0]==='color'&&call[1]==='#d2d0b9').length;
  assert.equal(stoneCount(held),1);assert.equal(stoneCount(released),0,'thrown stone is absent from the open hand');assert.equal(stoneCount(reloaded),1,'next stone is ready after recovery');
  const facing=[];
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const rec=recordingContext();SPECIALIST_ART.shieldguard.overlay(rec.ctx,{visualFacing:0,specialist:{phase:'active',angle,timer:1,maxTime:2}},{reduced:false});assert.equal(rec.stack.length,0);facing.push(JSON.stringify(rec.calls));
    const outline=rec.calls.filter(call=>call[0]==='moveTo'||call[0]==='lineTo').slice(0,6);
    const area=Math.abs(outline.reduce((sum,v,i)=>{const next=outline[(i+1)%outline.length];return sum+v[1]*next[2]-next[1]*v[2];},0))*.5;
    assert(area>100,'side-facing shield keeps a visible plate instead of collapsing to a line');
  }
  assert.equal(new Set(facing).size,4,'shield plane tracks four combat directions independently of body flip');
}finally{Math.random=random;}
console.log('Specialist action art: finite and balanced cached poses, eight-foot gait, timed stone release/reload and directional shields passed.');
