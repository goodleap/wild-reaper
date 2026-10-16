import assert from 'node:assert/strict';
import {paintCityGround,paintCityHouse,paintCityWall} from './dist/city-scenery-art.js';

function recording(){
  const calls=[],stack=[],state={globalAlpha:.37,globalCompositeOperation:'multiply',fillStyle:'#123456',strokeStyle:'#abcdef',lineWidth:3,lineCap:'butt',lineJoin:'miter'},initial={...state};
  const methods={save(){stack.push({...state});calls.push(['save']);},restore(){assert(stack.length,'canvas stack stays balanced');for(const key of Object.keys(state))delete state[key];Object.assign(state,stack.pop());calls.push(['restore']);}};
  for(const name of ['beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','rect','fillRect','fill','stroke','clip','ellipse','arc','translate','scale','rotate'])methods[name]=(...args)=>{for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),`${name} has finite geometry`);calls.push([name,...args]);};
  for(const name of ['createLinearGradient','createRadialGradient'])methods[name]=(...args)=>{for(const arg of args)assert(Number.isFinite(arg));const gradient={kind:name,args,stops:[],addColorStop(at,color){assert(at>=0&&at<=1);this.stops.push([at,color]);}};calls.push([name,...args]);return gradient;};
  const c=new Proxy(state,{get(target,key){return key in methods?methods[key]:target[key];},set(target,key,value){target[key]=value;if(key!=='globalAlpha')calls.push(['style',key,value]);return true;}});
  return{c,calls,assertRestored(){assert.deepEqual(state,initial,'a painter preserves its caller canvas state');assert.equal(stack.length,0);}};
}
const paints=[];
for(let variant=0;variant<5;variant++){
  paints.push(c=>paintCityHouse(c,variant));
  for(const road of [false,true])for(const zone of [0,1,2])paints.push(c=>paintCityGround(c,{variant,zone,road}));
  for(const angle of [0,Math.PI/2,.47,-.71]){
    const dx=Math.cos(angle)*100,dy=Math.sin(angle)*100,nx=-Math.sin(angle)*18,ny=Math.cos(angle)*18,outline=[[-dx-nx,-dy-ny],[-dx+nx,-dy+ny],[dx+nx,dy+ny],[dx-nx,dy-ny]],upper=outline.map(([x,y])=>[x,y-46]);
    paints.push(c=>assert.equal(paintCityWall(c,{outline,upper,variant}),true));
    paints.push(c=>assert.equal(paintCityWall(c,{outline:[...outline].reverse(),upper:[...upper].reverse(),variant}),true));
  }
}
const random=Math.random;
try{
  Math.random=()=>{throw Error('city artwork cannot consume gameplay random state');};
  for(const paint of paints){
    const a=recording(),b=recording();paint(a.c);paint(b.c);a.assertRestored();b.assertRestored();assert.equal(JSON.stringify(a.calls),JSON.stringify(b.calls),'the same reusable sprite has deterministic geometry and colours');
  }
}finally{Math.random=random;}
const roofShapes=new Set();
for(let variant=0;variant<5;variant++){const sample=recording();paintCityHouse(sample.c,variant);roofShapes.add(JSON.stringify(sample.calls.filter(call=>['moveTo','lineTo','quadraticCurveTo'].includes(call[0]))));}
assert.equal(roofShapes.size,5,'the five houses vary their geometry as well as colours');
const malformed=recording();assert.equal(paintCityWall(malformed.c,{outline:[],upper:[]}),false);assert.equal(malformed.calls.length,0,'invalid wall data does not touch canvas state');
console.log(`City shared scenery: ${paints.length} deterministic house / paving / wall cases, five house forms, rotated and reversed wall contours, caller state and random isolation passed.`);
