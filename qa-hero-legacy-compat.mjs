import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HumanoidArt} from './dist/humanoid-art.js';

function recorder(){
  const calls=[],stack=[],c={globalAlpha:.65,lineWidth:3,fillStyle:'#abc',strokeStyle:'#def',lineCap:'butt',lineJoin:'miter'};
  for(const name of ['beginPath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath','ellipse','arc','clip','translate','scale','rotate'])c[name]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value));
    calls.push([name,...args]);
  };
  const state=()=>({globalAlpha:c.globalAlpha,lineWidth:c.lineWidth,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,lineCap:c.lineCap,lineJoin:c.lineJoin});
  c.save=()=>{stack.push(state());calls.push(['save']);};
  c.restore=()=>{assert(stack.length);Object.assign(c,stack.pop());calls.push(['restore']);};
  c.fill=()=>calls.push(['fill',c.fillStyle,c.globalAlpha]);
  c.stroke=()=>calls.push(['stroke',c.strokeStyle,c.lineWidth,c.lineCap,c.lineJoin,c.globalAlpha]);
  c.drawImage=(image,...args)=>calls.push(['drawImage',image.id,...args]);
  c.createLinearGradient=(...args)=>({args,stops:[],addColorStop(at,color){this.stops.push([at,color]);}});
  return {c,calls,stack};
}

const variants=[
  {time:2,reduced:true},
  {time:2,entity:{moving:true},pose:{step:1,leftLift:3.2,rightLift:0,bodyY:-1.15,arm:1.8,cloth:1.7,cloakLift:1}},
  {time:2,entity:{hurtFace:.2}},
  {time:2,entity:{castFace:.2,castFacing:0}},
  {time:2,entity:{rescuedFace:.2}},
  {time:0,entity:{id:0}}
];

// Captured before the directional appearances were implemented, from published
// v0.0.90. These are low-level shared-renderer fixtures, not player choices;
// keeping the reusable cache intact also protects the existing NPC art.
const publishedTraces={
  traveler:'85863809ebd40e96d9ffc8cd4c53eb92dd2559c394fb8255c1af0c47cf449d3c',
  princess:'22602c7f83fc75a5116f5bfd1534979951c42a81d38968f393c176c94c47d5b3',
  elder:'e582e855ea85b6fc119eb9cc522932024d7ddb6d26c249de779c53ba41e18990'
};

for(const [kind,expected] of Object.entries(publishedTraces)){
  const traces=[];
  for(const pixelRatio of [1,2])for(const facing of [0,Math.PI])for(const variant of variants){
    const canvases=[],art=new HumanoidArt(()=>{
      const record=recorder(),canvas={id:canvases.length+1,width:0,height:0,record,getContext:()=>record.c};
      canvases.push(canvas);return canvas;
    }),out=recorder();
    assert(art.draw(out.c,kind,{...variant,pixelRatio,entity:{...variant.entity,facing}}));
    assert.equal(out.stack.length,0);
    for(const canvas of canvases)assert.equal(canvas.record.stack.length,0);
    traces.push({calls:out.calls,sprites:canvases.map(c=>({width:c.width,height:c.height,calls:c.record.calls}))});
  }
  assert.equal(createHash('sha256').update(JSON.stringify(traces)).digest('hex'),expected,`${kind} retains the shared low-level art fixture exactly`);
}
console.log('Shared humanoid art fixtures: original paths, materials, gait and expressions remain intact at both pixel densities and horizontal facings; old player appearances are not selectable.');
