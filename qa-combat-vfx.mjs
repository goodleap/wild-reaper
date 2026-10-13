import assert from 'node:assert/strict';
import { CombatVfx } from './dist/combat-vfx.js';

// A strict Canvas recorder checks the presentation contract without a browser.
// It catches non-finite geometry/state and records actual command sequences.
function context(record=true){
  const calls=[],stack=[];let state={globalAlpha:1,lineWidth:1,shadowBlur:0,fillStyle:'#000',strokeStyle:'#000',lineCap:'butt',lineJoin:'miter'};
  const target={calls,save(){stack.push({...state});if(record)calls.push(['save']);},restore(){assert(stack.length,'Canvas state must balance');state=stack.pop();if(record)calls.push(['restore']);},get depth(){return stack.length;},createRadialGradient(...args){args.forEach(v=>assert(Number.isFinite(v)));return{addColorStop(offset,color){assert(offset>=0&&offset<=1);assert.equal(typeof color,'string');}};}};
  for(const method of ['translate','rotate','scale','beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','rect','clip','fill','stroke','fillRect','drawImage'])target[method]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${method}: finite coordinates`);
    if(method==='arc')assert(args[2]>=0,'arc radius');if(method==='ellipse')assert(args[2]>=0&&args[3]>=0,'ellipse radius');
    if(record)calls.push([method,...args.filter(a=>typeof a!=='object'),state.globalAlpha,state.lineWidth,state.fillStyle,state.strokeStyle]);
  };
  return new Proxy(target,{get:(t,key)=>key in t?t[key]:state[key],set:(t,key,value)=>{if(key==='globalAlpha')assert(Number.isFinite(value)&&value>=0&&value<=1,`valid alpha ${value}`);if(key==='lineWidth')assert(Number.isFinite(value)&&value>0);if(key==='shadowBlur')assert.equal(value,0,'no runtime blur');state[key]=value;return true;}});
}
const fixtures=[
  {type:'mushroomBlast',r:82},
  {type:'bossSlam',r:104},
  {type:'bloomBurst',r:92},
  {type:'superBurst',skillId:'meteor',r:86},
  {type:'defeat',boss:true,r:37}
].map(e=>({...e,x:117,y:-64,maxLife:.65,life:.55,seed:91}));
const hit=source=>({type:'hit',source,x:117,y:-64,r:17,strength:.7,angle:.83,maxLife:.24,life:.21,seed:91});
const art=new CombatVfx();
const oldRandom=Math.random;Math.random=()=>{throw Error('rendering must not consume gameplay randomness');};
try{
  for(const reduced of [false,true])for(const dense of [false,true])for(const progress of [0,.02,.12,.32,.58,.85,.999]){
    const options={reduced,dense};art.beginFrame(options);const ctx=context();
    for(const source of ['arrow','orbit','lightning','pulse','super','mushroom','bleed']){
      const e=hit(source);e.life=e.maxLife*(1-progress);const before=structuredClone(e);assert(art.drawHit(ctx,e,options));assert.deepEqual(e,before,'rendering does not mutate combat state');
    }
    for(const e0 of fixtures){
      const e={...e0,life:e0.maxLife*(1-progress)},before=structuredClone(e);
      assert(art.drawBurst(ctx,e,options,'ground'));assert(art.drawBurst(ctx,e,options,'air'));assert.deepEqual(e,before);
    }
    assert.equal(ctx.depth,0);assert(art.stats.particles<=art.stats.budget);
    if(reduced)assert.equal(art.stats.particles,0,'reduced motion uses only readable calm forms');
  }
  const unexpected=context();art.beginFrame();
  for(const e of [{type:'superBurst',skillId:'swords'},{type:'superBurst',skillId:'miasma'},{type:'superBurst',skillId:'thorns'},{type:'defeat',boss:false},{type:'ring'}])assert.equal(art.drawBurst(unexpected,e),false,'unrelated renderers keep ownership');
  assert.equal(art.drawHit(unexpected,{type:'lightning'}),false);assert.equal(unexpected.calls.length,0);
  for(const e of [...fixtures,hit('arrow')])for(const life of [0,-1,NaN]){
    const ctx=context(),expired={...e,life};if(e.type==='hit')assert(art.drawHit(ctx,expired));else assert(art.drawBurst(ctx,expired));assert.equal(ctx.calls.length,0,'expired effects draw nothing');
  }
  // Same life produces the same pixels regardless of wall-clock time or other
  // effects having warmed the geometry cache. Pausing cannot advance particles.
  for(const e of [...fixtures,hit('orbit'),hit('lightning')]){
    const draw=(renderer,clock)=>{const options={time:clock};renderer.beginFrame(options);const ctx=context();if(e.type==='hit')renderer.drawHit(ctx,e,options);else{renderer.drawBurst(ctx,e,options,'ground');renderer.drawBurst(ctx,e,options,'air');}return ctx.calls;};
    const renderer=new CombatVfx(),first=draw(renderer,1),builds=renderer.stats.geometryBuilds;
    assert.deepEqual(draw(renderer,9999),first);assert.equal(renderer.stats.geometryBuilds,builds,'warm frames reuse geometry');assert.deepEqual(draw(new CombatVfx(),99),first,'seeds reproduce geometry');
  }
  // Saturation never removes an essential hit core or resolved blast shape.
  for(const dense of [false,true]){
    const renderer=new CombatVfx(),ctx=context(false);renderer.beginFrame({dense});
    for(let i=0;i<180;i++)renderer.drawHit(ctx,{...hit('arrow'),seed:i});
    for(let i=0;i<32;i++){const e={...fixtures[i%fixtures.length],seed:i};renderer.drawBurst(ctx,e,{dense},'ground');renderer.drawBurst(ctx,e,{dense},'air');}
    assert.equal(renderer.stats.budget,dense?110:240);assert.equal(renderer.stats.particles,renderer.stats.budget);assert.equal(renderer.stats.remaining,0);assert.equal(renderer.stats.coreDraws,212);
    renderer.beginFrame({dense,particleBudget:3});assert.equal(renderer.stats.particles,0);assert.equal(renderer.stats.budget,3);
    renderer.beginFrame({dense,particleBudget:9999});assert.equal(renderer.stats.budget,dense?110:240,'caller cannot bypass global bound');
  }
  for(const e of fixtures){
    const renderer=new CombatVfx();renderer.beginFrame({particleBudget:0});const ctx=context();renderer.drawBurst(ctx,e,{},'ground');renderer.drawBurst(ctx,e,{},'air');assert(ctx.calls.some(c=>c[0]==='fill'||c[0]==='stroke'),'budget exhaustion keeps the attack shape');assert.equal(renderer.stats.particles,0);
  }
  // Broken pressure crests stay inside the actual ground footprint, including
  // their line width. Boss defeat deliberately has no pressure-circle warning.
  for(const e0 of fixtures)for(const r of [1,12,86,240])for(const progress of [0,.08,.3,.7,.99]){
    const e={...e0,r,life:e0.maxLife*(1-progress)},renderer=new CombatVfx(),ctx=context();renderer.beginFrame({particleBudget:0});renderer.drawBurst(ctx,e,{},'ground');
    const arcs=ctx.calls.filter(c=>c[0]==='arc');for(const call of arcs)assert(call[3]+call[7]*.5<=r+.00001,'pressure stroke fits the damage radius');
    if(e.boss)assert.equal(arcs.length,0,'boss defeat is not an enemy telegraph');
  }
  // With an actual canvas factory, nine fixed palettes bound the bitmap cache.
  let builds=0;const cached=new CombatVfx(()=>{builds++;return{width:0,height:0,getContext:()=>context(false)};}),ctx=context(false);
  const all=[...['arrow','orbit','lightning','pulse','super','mushroom','bleed'].map(hit),...fixtures];
  for(let pass=0;pass<4;pass++){cached.beginFrame();for(const e of all)if(e.type==='hit')cached.drawHit(ctx,e);else{cached.drawBurst(ctx,e,{},'ground');cached.drawBurst(ctx,e,{},'air');}}
  assert.equal(builds,9);assert.equal(cached.stats.spriteCount,9);assert.equal(cached.stats.spritePixels,41472);assert.equal(cached.stats.geometryBuilds,all.length);
}finally{Math.random=oldRandom;}
console.log('Combat VFX: deterministic lifetime phases, immutable damage data, per-frame particle budgets, cached geometry/palettes, reduced motion, isolated ownership, bounded footprints, and pause-stable layered effects passed.');
