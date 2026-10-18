import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {ClockshadowBuildingArt} from './dist/clockshadow-building-art.js';
import {nativeCitySettlementVisual} from './dist/city-native-landmark-art.js';

const MiB=1024*1024,canvases=[];
function context({cpu=false}={}){
  const stack=[],c={globalAlpha:.73,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},
    drawImage(canvas){assert(!cpu,'the CPU mask paints geometry without display-canvas readback');assert(canvas.width>0&&canvas.height>0,'a protected stamp must remain alive until its draw');},
    getImageData(x,y,w,h){assert(cpu);const data=new Uint8ClampedArray(w*h*4);for(let i=3;i<data.length;i+=4)data[i]=255;return{data};}};
  return new Proxy(c,{get:(o,key)=>key in o?o[key]:()=>{}});
}
function makeCanvas(){const canvas={width:0,height:0,getContext:(type,options)=>context({cpu:options?.willReadFrequently===true})};canvases.push(canvas);return canvas;}
const output=context(),game=new Game({mode:'world',worldId:'clockshadow-city'}),layout=game.terrain.island.layout;
const points=[];
// The real app regression path: entry woodland -> market -> bell-square road.
for(const id of ['01-03','03-07']){
  const way=layout.passages.find(p=>p.id===id).waypoints;
  for(let i=1;i<way.length;i++){
    const a=way[i-1],b=way[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/120);
    for(let j=0;j<=steps;j++)points.push({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps});
  }
}
function consumers(point,view){
  const {x,y}=point,{width,height}=view;
  // Match terrainInView's real 320-unit margin; testing only building centres
  // inside the viewport would hide the working set that caused the regression.
  const terrain=game.terrain.query(x-width/2-320,y-height/2-320,x+width/2+320,y+height/2+320);
  const props=terrain.filter(p=>p.variant==='city-native'&&p.visual!==false&&p.cityArt?.bounds);
  for(const site of game.riftExploration.sites)if(site.kind==='cave'&&Math.abs(site.x-x)<width/2+70&&Math.abs(site.y-y)<height/2+112)props.push({...site,cityKind:'sewer',width:68,depth:34,height:48,style:2});
  for(const site of game.settlements.sites){const v=nativeCitySettlementVisual(site,{artStyle:layout.artStyle});if(v&&Math.abs(site.x-x)<width/2+200&&Math.abs(site.y-y)<height/2+350)props.push(v.prop);}
  props.sort((a,b)=>(a.sortY??a.y+a.depth/2)-(b.sortY??b.y+b.depth/2));return{terrain,props};
}
const summaries=[];
for(const view of [{width:1728,height:874,mobile:false},{width:540,height:1036,mobile:true}]){
  const painter=new ClockshadowBuildingArt({makeCanvas});painter.setViewport(view);
  assert.equal(painter.limitBytes,(view.mobile?12:24)*MiB);
  let peak=0,peakStamps=0;
  for(const point of points){
    const {terrain,props}=consumers(point,view);
    painter.beginFrame(terrain);for(const prop of props)painter.draw(output,prop);
    const built=painter.builds;peak=Math.max(peak,painter.activeBytes);peakStamps=Math.max(peakStamps,painter.active.size);
    assert(painter.activeBytes<=painter.limitBytes,'the real supported view must fit its complete drawn building working set');
    for(let warm=0;warm<3;warm++){
      painter.beginFrame(terrain);for(const prop of props)painter.draw(output,prop);
      assert.equal(painter.builds,built,'holding the real view still must not rebuild or evict its visible buildings');
    }
    assert(painter.bytes<=painter.limitBytes);assert.equal(painter.transientBuilds,0,'normal phone and desktop views do not fall back to repeated temporary painting');
  }
  if(!view.mobile)assert(peak>12*MiB,'this real-map route must continue to exercise the old 12 MiB regression');
  const before=painter.bytes;painter.setViewport({width:540,height:540});assert.equal(painter.limitBytes,12*MiB);assert(painter.bytes<=12*MiB&&painter.bytes<=before,'zooming in trims retained surfaces immediately');
  painter.setViewport({width:100000,height:100000});assert.equal(painter.limitBytes,24*MiB,'unbounded debug views never create an unbounded budget');
  painter.setViewport({width:100000,height:100000,mobile:true});assert.equal(painter.limitBytes,12*MiB,'mobile keeps its memory ceiling even when debug zooms out');
  summaries.push({mobile:view.mobile,points:points.length,peakMiB:+(peak/MiB).toFixed(2),peakStamps,builds:painter.builds});
  painter.clear();assert.equal(painter.cache.size,0);assert.equal(painter.bytes,0);assert.equal(painter.activeBytes,0);assert.equal(painter.limitBytes,12*MiB);
}

// A deliberately undersized cache models an extreme view above the 24 MiB
// ceiling. It keeps its admitted visible subset regardless of draw order.
const small=new ClockshadowBuildingArt({makeCanvas,limitBytes:650000});
assert.equal(small.setViewport({mobile:true}),650000,'mobile preserves even a non-MiB caller-specified budget exactly');
const props=Array.from({length:5},(_,i)=>Object.freeze({variant:'city-native',region:'clockshadow-city',x:i*100,y:0,cityKind:'house',width:180+i*10,depth:100,height:90,style:0}));
small.beginFrame(props);for(const prop of props)small.draw(output,prop);
const admitted=new Map(small.cache),overflow=props.length-admitted.size;
assert(admitted.size>0&&overflow>0);assert(small.bytes<=small.limitBytes);
for(let frame=0;frame<5;frame++){
  const before=small.builds;small.beginFrame(props);for(const prop of [...props].reverse())small.draw(output,prop);
  assert.equal(small.builds-before,overflow,'only unavoidable overflow is rebuilt, never the admitted visible set');
  for(const [key,stamp] of admitted)assert.equal(small.cache.get(key),stamp,'one frame cannot evict another visible stamp');
  assert(small.bytes<=small.limitBytes);
}
const temporary=props.find(prop=>!small.cache.has(small._describe(prop).key)),beforeCanvas=canvases.length;
const throwing={globalAlpha:.73,save(){},restore(){this.globalAlpha=.73;},drawImage(){throw new Error('draw failed');}};
assert.throws(()=>small.draw(throwing,temporary),/draw failed/);assert.equal(throwing.globalAlpha,.73);
assert(canvases.slice(beforeCanvas).every(c=>c.width===0&&c.height===0),'temporary display and mask surfaces are released even after a failed draw');
small.beginFrame([]);const newcomer={...props[0],width:203,style:2};small.draw(output,newcomer);assert(small.cache.has(small._describe(newcomer).key),'previous-frame protection expires so new regions can reuse the bounded cache');
small.clear();assert.equal(small.limitBytes,650000,'clear preserves the caller-specified base budget');
assert(canvases.every(c=>c.width===0&&c.height===0),'clearing all painters releases every retained or temporary canvas');
assert.equal(output.globalAlpha,.73,'cache reuse does not change alpha composition');
console.log(JSON.stringify({cityBuildingCache:'passed',views:summaries,overflowRebuildsPerFrame:overflow,coverage:'real-map working set; warm-frame reuse; mobile and desktop caps; zoom shrink; active admission; transient release; clear and opacity'}));
