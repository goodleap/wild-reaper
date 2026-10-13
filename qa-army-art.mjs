import assert from 'node:assert/strict';
import {CompanionArt,COMPANION_VISUALS} from './dist/companion-art.js';

function recorder(){
  const calls=[],stack=[],c={globalAlpha:.7,lineWidth:3,fillStyle:'#123456',strokeStyle:'#234567',lineCap:'butt',lineJoin:'miter'};
  for(const method of ['beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','ellipse','arc','fill','stroke','fillRect','scale','translate','rotate','setTransform'])c[method]=(...args)=>calls.push([method,...args]);
  c.drawImage=(image,...args)=>calls.push(['drawImage',image.id,...args]);
  c.createLinearGradient=(...coords)=>({coords,addColorStop(){}});
  c.save=()=>{stack.push(Object.fromEntries(['globalAlpha','lineWidth','fillStyle','strokeStyle','lineCap','lineJoin'].map(k=>[k,c[k]])));calls.push(['save']);};
  c.restore=()=>{assert(stack.length,'balanced canvas state');Object.assign(c,stack.pop());calls.push(['restore']);};
  return{c,calls,stack};
}
const canvases=[],art=new CompanionArt(()=>{const context=recorder(),canvas={id:canvases.length+1,width:0,height:0,getContext:()=>context.c};canvases.push(canvas);return canvas;});
const draw=(kind,options={})=>{const r=recorder(),state=Object.fromEntries(['globalAlpha','lineWidth','fillStyle','strokeStyle','lineCap','lineJoin'].map(k=>[k,r.c[k]]));assert(art.draw(r.c,kind,options));assert.equal(r.stack.length,0);for(const key of Object.keys(state))assert.equal(r.c[key],state[key]);return r.calls;};
const random=Math.random;Math.random=()=>{throw new Error('Rendering cannot consume gameplay random numbers');};
try{
  for(const kind of ['dog','owl','golem'])for(const facing of [0,Math.PI])draw(kind,{entity:{facing},reduced:true});
  const warm=art.cacheStats;assert(warm.entries>=20);assert(warm.bytes<1_000_000);
  for(let i=0;i<120;i++)for(const kind of ['dog','owl','golem'])draw(kind,{entity:{id:i%7,facing:i%2?Math.PI:0,walkPhase:i*.3,moving:true,walkSpeed:180,castFace:i%3?.1:0,hurtFace:i%7?.0:.1},time:i/60,pixelRatio:3});
  assert.equal(art.cacheStats.builds,warm.builds,'Walking, casting and many facing angles reuse cached parts');
  assert.equal(art.cacheStats.bytes,warm.bytes);assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);
  for(const kind of ['dog','owl','golem']){
    const options={entity:{id:7,facing:Math.PI,walkPhase:.4,moving:true,walkSpeed:170},time:7.32};
    assert.deepEqual(draw(kind,options),draw(kind,options),'Paused simulation time is stable');
    assert.deepEqual(draw(kind,{time:1,reduced:true}),draw(kind,{time:8,reduced:true}),'Reduced idle motion stays still');
    assert.notDeepEqual(draw(kind,{entity:{hurtFace:.2},reduced:true}),draw(kind,{reduced:true}),'Recovering/hurt expressions are visible without blinking invulnerability');
  }
  const statsBefore=art.cacheStats;draw('dog',{pixelRatio:1});assert.equal(art.cacheStats.pixelRatio,1);assert(art.cacheStats.bytes<statsBefore.bytes);const builds=art.cacheStats.builds;draw('dog',{pixelRatio:1});assert.equal(art.cacheStats.builds,builds);
  for(const kind of ['dog','owl','golem'])assert(COMPANION_VISUALS[kind].foot>0&&COMPANION_VISUALS[kind].top>0);
  const empty=recorder();assert.equal(art.draw(empty.c,'unknown'),false);assert.equal(empty.calls.length,0);
  const site={id:'vault',type:'stonevault',x:30,y:40,state:'ready',gateOpen:false},ground=recorder();assert(art.drawGround(ground.c,site));
  const closed=art.props(site),gate=closed.find(p=>p.type==='companionSitePart');assert(gate);assert(!closed.some(p=>p.part?.startsWith('gate')),'Stone door replaces ordinary wooden doors');assert.equal(gate.y,101);assert.equal(closed.find(p=>p.type==='treasure').state,'locked');
  const closedHeight=gate.shadowHeight,closedCalls=recorder();assert(art.drawProp(closedCalls.c,gate));
  site.gateOpen=true;site.state='opened';const openedProps=art.props(site),opened=openedProps.find(p=>p.type==='companionSitePart'),openCalls=recorder();art.drawProp(openCalls.c,opened);assert(opened.shadowHeight<closedHeight/3,'Broken boulder has a low rubble shadow');assert.equal(opened.shadowRevision,'opened');assert.notDeepEqual(closedCalls.calls,openCalls.calls);assert.equal(openedProps.find(p=>p.type==='treasure').state,'unlocked');site.state='cleared';assert.equal(art.props(site).find(p=>p.type==='treasure').state,'opened');
  for(const special of [{id:'altar',type:'rescue',appearance:'golemaltar',state:'active',x:0,y:0},{id:'camp',type:'dogcamp',x:0,y:0}])assert(art.drawGround(recorder().c,special,{time:3}));
  assert.equal(art.drawGround(recorder().c,{type:'castle'}),false);assert.equal(art.drawProp(recorder().c,{type:'treasure'}),false);
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);
}finally{Math.random=random;}
console.log('Companion artwork: actual grounded gait, owl flight, expressive eyes, bounded material caches, stable paused/reduced motion, permanent altar and broken stone-gate rubble passed.');
