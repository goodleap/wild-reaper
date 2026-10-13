import assert from 'node:assert/strict';
import {drawSwordSlash} from './dist/sword-art.js';
import {drawGuardianBarrier,drawBarrierEffect} from './dist/guardian-art.js';

function recorder(){
  const calls=[],stack=[];let state={globalAlpha:1,lineWidth:1,shadowBlur:0,fillStyle:'#000',strokeStyle:'#000',lineCap:'butt',lineJoin:'miter'};
  const ctx={calls,save(){stack.push({...state});calls.push(['save']);},restore(){assert(stack.length);state=stack.pop();calls.push(['restore']);},get depth(){return stack.length;}};
  for(const name of ['translate','rotate','beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','fill','stroke'])ctx[name]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${name} must use finite coordinates`);
    if(name==='arc')assert(args[2]>=0);calls.push([name,...args,{...state}]);
  };
  return new Proxy(ctx,{get:(obj,key)=>key in obj?obj[key]:state[key],set:(obj,key,value)=>{
    if(key==='globalAlpha')assert(value>=0&&value<=1&&Number.isFinite(value));
    if(key==='lineWidth')assert(value>0&&Number.isFinite(value));if(key==='shadowBlur')assert.equal(value,0,'no runtime blur');state[key]=value;return true;
  }});
}
const source={type:'swordSlash',x:18,y:-41,r:88,angle:.44,arc:1.8,windup:.085,maxLife:.38,life:.2,seed:14};
const player=Object.freeze({x:18,y:-41}),game={player,_clock:3};
const oldRandom=Math.random;Math.random=()=>{throw Error('art cannot consume gameplay randomness');};
try{
  for(const reduced of [false,true])for(const dense of [false,true])for(const branch of [undefined,'sweep','heavy'])for(const fraction of [1,.97,.78,.65,.4,.18,.001]){
    const e=Object.freeze({...source,life:source.maxLife*fraction,branch}),ctx=recorder();
    assert(drawSwordSlash(ctx,e,game,{reduced,dense}));assert.equal(ctx.depth,0);assert.equal(ctx.globalAlpha,1);
    assert(ctx.calls.some(call=>call[0]==='fill'),'physical blade stays visible across the attack');
    assert(ctx.calls.length<160,'one attack uses a bounded amount of geometry');
    const replay=recorder();drawSwordSlash(replay,e,{_clock:9000},{reduced,dense});assert.deepEqual(replay.calls,ctx.calls,'sword poses age only with simulation life');
    for(const call of ctx.calls)if(call[0]==='arc')assert(call[3]<=e.r,'wake stays inside the weapon reach');
  }
  for(const ready of [false,true])for(const active of [false,true])for(const remaining of [0,3,30])for(const life of [.001,.2,2]){
    const barrier=Object.freeze({ready,active,remaining,capacity:30,life,cooldown:0}),snapshot=JSON.stringify(barrier),ctx=recorder();
    drawGuardianBarrier(ctx,{...game,barrier},player);assert.equal(ctx.depth,0);assert.equal(ctx.globalAlpha,1);assert.equal(JSON.stringify(barrier),snapshot);
    assert(ctx.calls.length<110,'only a player-sized shell with fixed facets');if(!ready&&!active)assert.equal(ctx.calls.length,0);
  }
  for(const type of ['barrierTrigger','barrierBreak'])for(const reduced of [false,true])for(const dense of [false,true])for(const progress of [0,.2,.7,.999]){
    const e=Object.freeze({type,x:18,y:-41,maxLife:.3,life:.3*(1-progress)}),ctx=recorder();
    assert(drawBarrierEffect(ctx,e,game,{reduced,dense}));assert.equal(ctx.depth,0);assert(ctx.calls.length<150);
    const again=recorder();drawBarrierEffect(again,e,{_clock:9000},{reduced,dense});assert.deepEqual(ctx.calls,again.calls);
  }
  const idle={...game,barrier:{ready:true}},a=recorder(),b=recorder();drawGuardianBarrier(a,idle,player,{reduced:true});drawGuardianBarrier(b,{...idle,_clock:100},player,{reduced:true});assert.deepEqual(a.calls,b.calls,'reduced idle marker does not bob');
  for(const render of [drawSwordSlash,drawBarrierEffect]){
    const unknown=recorder();assert.equal(render(unknown,{type:'meteor'}),false);assert.equal(unknown.calls.length,0);
    for(const life of [0,-1,NaN])for(const type of render===drawSwordSlash?['swordSlash']:['barrierTrigger','barrierBreak']){
      const ctx=recorder();assert(render(ctx,{...source,type,life}));assert.equal(ctx.calls.length,0,'expired effects issue no draw work');
    }
  }
}finally{Math.random=oldRandom;}
console.log('Sword / guardian artwork: bounded finite geometry, physical blade silhouette, world-space attacks, life-driven pause stability, isolated state and reduced-motion shells passed.');
