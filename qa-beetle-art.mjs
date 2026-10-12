import assert from 'node:assert/strict';
import { MonsterArt } from './dist/monster-art.js';

// Record the cached drawing, including the transform at gradient creation, to
// check orientation and world lighting without requiring a browser or canvas.
function recordingContext(){
  const calls=[],gradients=[],stack=[];let matrix=[1,0,0,1,0,0];
  const transform=(a,b,c,d,e,f)=>{const [A,B,C,D,E,F]=matrix;matrix=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];};
  const point=(x,y)=>({x:matrix[0]*x+matrix[2]*y+matrix[4],y:matrix[1]*x+matrix[3]*y+matrix[5]});
  const ctx={};
  for(const method of ['beginPath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','ellipse','arc','closePath','fill','stroke','clip','fillRect','drawImage'])ctx[method]=(...args)=>calls.push([method,...args]);
  ctx.save=()=>stack.push([...matrix]);ctx.restore=()=>{matrix=stack.pop();};
  ctx.translate=(x,y)=>transform(1,0,0,1,x,y);ctx.scale=(x,y)=>transform(x,0,0,y,0,0);
  ctx.rotate=a=>{calls.push(['rotate',a]);transform(Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0);};
  ctx.createLinearGradient=(x1,y1,x2,y2)=>{const result={from:point(x1,y1),to:point(x2,y2),colors:[],addColorStop(at,color){this.colors.push([at,color]);}};gradients.push(result);return result;};
  return {ctx,calls,gradients,stack};
}
const canvases=[],art=new MonsterArt(()=>{const recording=recordingContext(),canvas={width:0,height:0,...recording,getContext:()=>recording.ctx};canvases.push(canvas);return canvas;});
const base={type:'beetle',id:9,x:0,y:0,r:18,visualFacing:0,walkPhase:0,moving:false,walkSpeed:0};
function draw(entity={},options={}){const {ctx,calls}=recordingContext();assert(art.draw(ctx,{...base,...entity},options));assert.equal(calls.length,1,'a beetle needs a single cached-image draw per frame');return calls[0][1];}
const resting=draw();assert.equal(resting.width,128);assert.equal(resting.height,108);
for(const time of [0,.5,8,50,1000])assert.equal(draw({}, {time}),resting,'idle beetles do not crawl from the render clock');
const walking=draw({moving:true,walkSpeed:100,walkPhase:Math.PI/2});assert.notEqual(walking,resting);
assert.equal(draw({moving:false,walkSpeed:0,walkPhase:Math.PI/2},{time:800}),walking,'stopping holds the last foot pose without a clock-driven reset');
assert.equal(draw({moving:true,walkSpeed:100,walkPhase:Math.PI/2},{time:800}),walking,'the same travelled distance has the same pose');
const opposite=draw({moving:true,walkSpeed:100,walkPhase:-Math.PI/2});assert.notEqual(opposite,walking,'alternating tripods visibly change the foot placements');
assert.notDeepEqual(opposite.calls,walking.calls);
assert.equal(draw({moving:true,walkPhase:2},{reduced:true}),resting,'reduced motion uses a steady neutral gait');

const directions=new Set();
for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,sprite=draw({visualFacing:angle});directions.add(sprite);
  assert.equal(draw({visualFacing:angle+Math.PI*2}),sprite,'equivalent full turns share a cache entry');
  assert(sprite.calls.some(call=>call[0]==='rotate'&&Math.abs(call[1]-angle)<1e-9));
  for(const g of sprite.gradients){
    assert(Math.abs((g.to.x-g.from.x)-64)<1e-8,'the bright end stays on world right for every facing');
    assert(Math.abs((g.to.y-g.from.y)+72)<1e-8,'the bright end stays above for every facing');
  }
  assert.equal(sprite.stack.length,0,'cache construction balances canvas state');
}
assert.equal(directions.size,8,'cardinal and diagonal travel each have a matching head direction');
assert.equal(draw({visualFacing:NaN,walkPhase:NaN}),resting,'legacy or unset locomotion metadata remains horizontal and finite');

const random=Math.random;Math.random=()=>{throw new Error('sprite painting must not consume gameplay randomness');};
try{
  for(let hit=0;hit<2;hit++)for(let direction=0;direction<8;direction++)for(const phase of [-Math.PI/2,-Math.PI/6,0,Math.PI/6,Math.PI/2])draw({hit,visualFacing:direction*Math.PI/4,walkPhase:phase});
  const warmBuilds=art.cacheStats.builds;
  for(let frame=0;frame<500;frame++)draw({hit:frame%2,visualFacing:(frame%8)*Math.PI/4,walkPhase:[-Math.PI/2,-Math.PI/6,0,Math.PI/6,Math.PI/2][frame%5]},{time:frame*.1});
  assert.equal(art.cacheStats.builds,warmBuilds,'dense moving crowds reuse the entire warmed beetle pose set without rebuilding gradients');
  assert(art.cacheStats.bytes<2_700_000,'all eight directions, three poses and hit variants fit inside 2.7 MB, leaving room for mixed crowds');
  for(const type of ['slime','bat','brute','boar','spore','boss'])for(let hit=0;hit<2;hit++)for(let i=0;i<24;i++){
    const {ctx}=recordingContext();art.draw(ctx,{type,id:i,x:0,y:0,hit,bossKind:i%2?'bloom':'ancient'},{time:i});
    assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'mixed monster species share the existing bounded 6 MB cache');
  }
}finally{Math.random=random;}
console.log('Beetle art: horizontal eight-direction crawl, distance-driven/frozen leg poses, alternating tripods, fixed world lighting and single-image draws within the shared 6 MB cache passed.');
