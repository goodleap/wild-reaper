import assert from 'node:assert/strict';
import {HumanoidArt,humanoidFaceState} from './dist/humanoid-art.js';

// A small Canvas contract double records transformed gradient direction and
// draw work without requiring a browser or a native graphics dependency in CI.
function recordingContext(){
  const calls=[],gradients=[],stack=[];let transform={sx:1,sy:1,x:0,y:0};
  const c={globalAlpha:.6,lineWidth:7,fillStyle:'#123456',strokeStyle:'#234567',lineCap:'butt',lineJoin:'miter'};
  const point=(x,y)=>({x:x*transform.sx+transform.x,y:y*transform.sy+transform.y});
  for(const name of ['beginPath','moveTo','lineTo','closePath','fill','stroke','ellipse','arc','fillRect','quadraticCurveTo','bezierCurveTo','clip'])c[name]=(...args)=>calls.push([name,...args]);
  c.fill=()=>calls.push(['fill',c.fillStyle]);
  c.stroke=()=>calls.push(['stroke',c.strokeStyle]);
  c.drawImage=(image,...args)=>calls.push(['drawImage',image.id,...args]);
  c.save=()=>{stack.push({transform:{...transform},state:{...c}});calls.push(['save']);};
  c.restore=()=>{assert(stack.length,'unbalanced context restore');const saved=stack.pop();transform=saved.transform;for(const key of ['globalAlpha','lineWidth','fillStyle','strokeStyle','lineCap','lineJoin'])c[key]=saved.state[key];calls.push(['restore']);};
  c.scale=(x,y)=>{transform.sx*=x;transform.sy*=y;calls.push(['scale',x,y]);};
  c.translate=(x,y)=>{transform.x+=x*transform.sx;transform.y+=y*transform.sy;calls.push(['translate',x,y]);};
  c.rotate=a=>calls.push(['rotate',a]);
  c.createLinearGradient=(x1,y1,x2,y2)=>{const gradient={start:point(x1,y1),end:point(x2,y2),stops:[],addColorStop(at,color){this.stops.push([at,color]);}};gradients.push(gradient);return gradient;};
  return {c,calls,gradients,stack};
}
const canvases=[],art=new HumanoidArt(()=>{const record=recordingContext(),canvas={id:canvases.length+1,width:0,height:0,getContext:()=>record.c,record};canvases.push(canvas);return canvas;});
const kinds=['traveler','warden','stormcaller','merchant','angel'];
function draw(kind,options={}){const record=recordingContext(),before={alpha:record.c.globalAlpha,lineWidth:record.c.lineWidth,fillStyle:record.c.fillStyle,strokeStyle:record.c.strokeStyle,lineCap:record.c.lineCap,lineJoin:record.c.lineJoin};assert(art.draw(record.c,kind,options));assert.deepEqual({alpha:record.c.globalAlpha,lineWidth:record.c.lineWidth,fillStyle:record.c.fillStyle,strokeStyle:record.c.strokeStyle,lineCap:record.c.lineCap,lineJoin:record.c.lineJoin},before,'art must preserve caller opacity and paint state');assert.equal(record.stack.length,0);return record;}
const savedRandom=Math.random;Math.random=()=>{throw new Error('artwork must not consume gameplay randomness');};
try{
  for(const kind of kinds)for(const facing of [0,Math.PI])draw(kind,{entity:{facing},pixelRatio:2,time:2});
  const warmedBuilds=art.cacheStats.builds,warmedEntries=art.cacheStats.entries;
  assert.equal(warmedEntries,50,'five static parts per kind and facing');
  assert(art.cacheStats.bytes<1_600_000,'all normal and mirrored art fits a shared small cache');
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);
  for(let i=0;i<300;i++){
    const phase=i*.21,step=Math.sin(phase);
    draw(kinds[i%5],{entity:{id:i%11,facing:i%2?Math.PI:0,hurtFace:i%7===0?.24:0,castFace:i%13===0?.25:0,rescuedFace:i%19===0?.65:0},pose:{step,leftLift:Math.max(0,step)*3.2,rightLift:Math.max(0,-step)*3.2,bodyY:-Math.abs(step),arm:step*1.8,cloth:step*1.7},time:i*.016,pixelRatio:3});
  }
  assert.equal(art.cacheStats.builds,warmedBuilds,'movement and every facial reaction reuse material sprites');
  assert.equal(art.cacheStats.entries,warmedEntries,'high-DPR screens do not multiply cache dimensions');
  for(const canvas of canvases)for(const gradient of canvas.record.gradients){
    assert(gradient.end.x>gradient.start.x,'upper-right light stays on world right for either facing');
    assert(gradient.end.y<gradient.start.y,'material highlights remain above shadow planes');
  }
  const paused={entity:{id:4,facing:0,hurtFace:.14},pose:{bodyY:-.5,step:.4,arm:.7},time:2.75};
  assert.deepEqual(draw('traveler',paused).calls,draw('traveler',paused).calls,'a fixed simulation time paints an identical face and pose');
  assert.deepEqual(draw('angel',{time:5,reduced:true}).calls,draw('angel',{time:8,reduced:true}).calls,'reduced motion keeps idle facial work steady');
  const still=draw('traveler',{time:2,reduced:true}).calls,walking=draw('traveler',{time:2,reduced:true,pose:{step:1,leftLift:3.2,rightLift:0,bodyY:-1.15,arm:1.8,cloth:1.7}}).calls;
  assert.notDeepEqual(walking,still,'caller-provided grounded movement still animates boots and cloth');
  const darkInk=color=>/^#[0-9a-f]{6}$/i.test(color)&&[1,3,5].every(i=>parseInt(color.slice(i,i+2),16)<90);
  assert(still.filter(call=>call[0]==='fill').slice(-2).every(call=>darkInk(call[1])),'the human face has two dark eyes instead of luminous monster eyes');
  assert(draw('traveler',{entity:{hurtFace:.2},time:2}).calls.filter(call=>call[0]==='stroke').slice(-2).every(call=>darkInk(call[1])),'hurt eyes keep the same understated human ink');
  for(const facing of [0,Math.PI]){
    const head=art.cache.get(`traveler:head:${facing?'-1':'1'}`).canvas.record;
    const skin=head.gradients.find(g=>g.stops.length===3&&g.stops.every(([,color])=>parseInt(color.slice(1,3),16)>parseInt(color.slice(5,7),16)));
    assert(skin,'a muted warm face remains visible under the blue hood in both facings');
  }
  const footLines=walking.filter(call=>call[0]==='lineTo'&&call[2]>9);
  assert(footLines.some(call=>Math.abs(call[2]-10.8)<.001),'raised boot follows the existing 3.2 px foot lift');
  const allCanvasBytes=canvases.reduce((sum,c)=>sum+c.width*c.height*4,0);
  assert.equal(art.cacheStats.bytes,allCanvasBytes,'cache accounting covers every retained pixel');
  draw('traveler',{pixelRatio:1});assert.equal(art.cacheStats.pixelRatio,1);assert.equal(art.cacheStats.entries,5,'a display-density change replaces old assets');
  assert(art.cacheStats.bytes<150_000);const lowBuilds=art.cacheStats.builds;draw('traveler',{pixelRatio:1});assert.equal(art.cacheStats.builds,lowBuilds);
}finally{Math.random=savedRandom;}

assert.equal(humanoidFaceState({invuln:2},2),'normal','teleport/upgrade protection alone must never look hurt');
assert.equal(humanoidFaceState({hurtFace:.2,castFace:.2,rescuedFace:.6},2),'hurt');
assert.equal(humanoidFaceState({hurtFace:0,castFace:.2,rescuedFace:.6},2),'focus');
assert.equal(humanoidFaceState({rescuedFace:.6},2),'glad');
assert.equal(humanoidFaceState({id:0},0),'blink');
assert.equal(humanoidFaceState({id:0},.2),'normal');
assert.equal(humanoidFaceState({id:0},0,true),'normal');
const rejected=recordingContext();assert.equal(art.draw(rejected.c,'dragon'),false);assert.equal(rejected.calls.length,0);
console.log('Humanoid art: stable world light in both facings; bounded DPR cache; grounded cloak gait; warm human face with dark expressive eyes; deterministic paused/reduced output; independent damage/cast/rescue expressions and caller state preservation passed.');
