import assert from 'node:assert/strict';
import { beginUnitArrival, unitArrivalAlpha, unitArrivalComplete, drawUnitArrival } from './dist/unit-arrival.js';

const calls=[],game={_clock:12,_effect(...args){calls.push(args);}},actor={id:'arrival:angel',type:'angel',x:70,y:90,r:15};
beginUnitArrival(game,actor);
assert.equal(calls.length,1);assert.deepEqual(calls[0].slice(0,5),[70,90,'unitArrival',1.1,44]);
assert.equal(unitArrivalAlpha(actor,12),0);assert.equal(unitArrivalComplete(actor,12),false);
assert.equal(unitArrivalAlpha(actor,12.2),0,'the ground light appears before the unit');
assert(unitArrivalAlpha(actor,12.5)>0&&unitArrivalAlpha(actor,12.5)<1,'the unit fades into the gathered light');
assert.equal(unitArrivalAlpha(actor,12.9),1);assert.equal(unitArrivalComplete(actor,12.9),false,'the light finishes contracting after the unit is visible');
assert.equal(unitArrivalComplete(actor,13.11),true);assert.equal(unitArrivalAlpha({},0),1,'ordinary units do not need arrival state');
assert.equal(unitArrivalAlpha(actor,12.5),unitArrivalAlpha(actor,12.5),'pause preserves reveal progress');
const hero={id:'arrival:hero',heroId:'traveler',x:5,y:10,r:14};beginUnitArrival(game,hero);assert.equal(calls[1][1],29.8,'the pool stays on the actual humanoid feet');

function recording(){
  const marks=[],stack=[],ctx={globalAlpha:.64};
  for(const name of ['translate','scale','beginPath','arc','ellipse','moveTo','lineTo','quadraticCurveTo','closePath','stroke','fill','fillRect'])ctx[name]=(...args)=>{assert(args.every(n=>typeof n!=='number'||Number.isFinite(n)));marks.push([name,...args]);};
  for(const name of ['createRadialGradient','createLinearGradient'])ctx[name]=(...args)=>{marks.push([name,...args]);return {addColorStop(...values){marks.push(['stop',...values]);}};};
  ctx.save=()=>stack.push(ctx.globalAlpha);ctx.restore=()=>{ctx.globalAlpha=stack.pop();};return {ctx,marks,stack};
}
const effect={type:'unitArrival',x:70,y:90,r:44,color:'#f4edc0',life:.55,maxLife:1.1};
const originalRandom=Math.random;Math.random=()=>{throw Error('render must not consume gameplay randomness');};
try{
  for(const layer of ['ground','air']){
    const first=recording(),second=recording();assert(drawUnitArrival(first.ctx,effect,{},layer));drawUnitArrival(second.ctx,effect,{},layer);
    assert.deepEqual(first.marks,second.marks,'paused entrance has stable geometry');assert.equal(first.ctx.globalAlpha,.64);assert.equal(first.stack.length,0);
    assert(first.marks.some(call=>call[0]===(layer==='ground'?'ellipse':'createLinearGradient')));
  }
  const full=recording(),reduced=recording();drawUnitArrival(full.ctx,effect);drawUnitArrival(reduced.ctx,effect,{reduced:true});assert(reduced.marks.length<full.marks.length,'reduced motion skips rising motes');
  const expired=recording();assert(drawUnitArrival(expired.ctx,{...effect,life:0}));assert.equal(expired.marks.length,0);
  assert.equal(drawUnitArrival(expired.ctx,{...effect,type:'ring'}),false);
}finally{Math.random=originalRandom;}
console.log('Unit arrival: ground anchoring, light before actor reveal, deterministic pause, independent ground/air layers, finite geometry, reduced motion and effect expiry passed.');
