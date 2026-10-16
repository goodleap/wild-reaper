import assert from 'node:assert/strict';
import {paintSnowRidge,drawSnowBridge,drawSnowLandmark,drawSnowCliffs} from './dist/snow-structure-art.js';

function context(){
  const state={globalAlpha:.73,lineWidth:1,lineCap:'butt',lineJoin:'miter'},stack=[],calls=[],clips=[];let path=[];
  const c=new Proxy(state,{get(o,key){if(key in o)return o[key];if(key==='save')return()=>stack.push({...o});if(key==='restore')return()=>{assert(stack.length,'balanced canvas stack');const prior=stack.pop();for(const k of Object.keys(o))delete o[k];Object.assign(o,prior);};
    return(...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${String(key)} receives finite coordinates`);calls.push({key,args,fill:o.fillStyle,stroke:o.strokeStyle});if(key==='beginPath')path=[];else if(['moveTo','lineTo','closePath','rect'].includes(key))path.push({key,args});else if(key==='clip')clips.push({rule:args[0],path:path.map(p=>({...p,args:[...p.args]}))});};}});
  return {c,calls,clips,stack,state};
}
function inPath(clip,x,y){const rings=[];let ring=[];for(const op of clip.path){if(op.key==='moveTo'){if(ring.length)rings.push(ring);ring=[op.args];}else if(op.key==='lineTo')ring.push(op.args);else if(op.key==='closePath'){rings.push(ring);ring=[];}else if(op.key==='rect'){const [x,y,w,h]=op.args;rings.push([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);}}if(ring.length)rings.push(ring);let inside=false;for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function stable(run){const a=context(),b=context();run(a.c);run(b.c);assert.deepEqual(a.calls,b.calls,'deterministic artwork');for(const ctx of [a,b]){assert.equal(ctx.stack.length,0);assert.equal(ctx.state.globalAlpha,.73);assert.equal(ctx.state.lineCap,'butt');assert.equal(ctx.state.lineJoin,'miter');}return a;}

const outline=[[-80,0],[-60,-16],[60,-16],[80,0],[60,16],[-60,16]],upper=outline.map(([x,y],i)=>[x,y-48-i%2*5]),geometry={outline,upper,height:58,variant:2},beforeGeometry=JSON.stringify(geometry);
for(const ice of [false,true]){const ctx=stable(c=>assert(paintSnowRidge(c,{...geometry,ice})));const vertices=new Set(ctx.calls.filter(c=>c.key==='moveTo'||c.key==='lineTo').map(c=>c.args.join(',')));for(const p of [...outline,...upper])assert(vertices.has(p.join(',')),'ridge uses original foot and raised vertices');assert(ctx.clips.length,'rock detail is clipped to supplied geometry');}
assert.equal(JSON.stringify(geometry),beforeGeometry,'ridge painting does not mutate terrain geometry');assert.equal(paintSnowRidge(context().c,{}),false);

const bridge={width:104,points:[{x:100,y:200},{x:300,y:200},{x:300,y:304},{x:100,y:304}],deck:[{x:100,y:252},{x:300,y:252}],waypoints:[{x:-300,y:252},{x:700,y:252}]},beforeBridge=JSON.stringify(bridge);
for(const overview of [false,true]){const ctx=stable(c=>assert(drawSnowBridge(c,bridge,{overview})));assert.equal(ctx.clips.length,1,'wood, rails and snow share the deck clip');assert(ctx.calls.some(c=>c.key==='translate'&&c.args[0]===100&&c.args[1]===252),'planks start at physical deck');assert(!ctx.calls.some(c=>c.key==='translate'&&c.args[0]===-300),'approach corridor is not painted as bridge');}
assert.equal(JSON.stringify(bridge),beforeBridge);assert.equal(drawSnowBridge(context().c,{}),false);

for(const kind of ['cave','shortcut','exit','stele','ruins','sanctuary'])stable(c=>assert(drawSnowLandmark(c,{kind,x:40,y:65,angle:.32,width:146,variant:2})));
const closed=context(),open=context(),gateOpen=context();drawSnowLandmark(closed.c,{kind:'shortcut',x:0,y:0,width:130});drawSnowLandmark(open.c,{kind:'shortcut',x:0,y:0,width:130,open:true});drawSnowLandmark(gateOpen.c,{kind:'shortcut',x:0,y:0,width:130,gateOpen:true});assert(closed.calls.length>open.calls.length,'open gate removes planks and crossbars');assert.deepEqual(open.calls,gateOpen.calls,'both existing gate state flags remove the crossbar');const unknown=context();assert.equal(drawSnowLandmark(unknown.c,{kind:'other'}),false);assert.equal(unknown.calls.length,0);

const boundaries=[{points:[{x:0,y:0},{x:200,y:0},{x:200,y:200},{x:0,y:200}]},{points:[{x:80,y:80},{x:120,y:80},{x:120,y:120},{x:80,y:120}]}],beforeBoundaries=JSON.stringify(boundaries),viewBounds={minX:-50,minY:-50,maxX:250,maxY:250};
const cliffs=stable(c=>assert(drawSnowCliffs(c,boundaries,{viewBounds})));assert.equal(cliffs.clips.length,1);assert.equal(cliffs.clips[0].rule,'evenodd');
for(const [x,y,blocked]of [[25,25,false],[100,100,true],[-10,100,true],[150,100,false],[201,100,true]])assert.equal(inPath(cliffs.clips[0],x,y),blocked,'cliff paint is clipped to the actual blocked side including interior holes');
const selective=context(),selected=[];drawSnowCliffs(selective.c,boundaries,{viewBounds,shouldDraw:p=>{selected.push(p);return p.x===200;}});assert.equal(selected.length,8,'material filtering retains complete ring geometry');assert.equal(selective.calls.filter(c=>c.key==='stroke'&&c.stroke==='#47687e').length,1,'only selected rock edge receives a cliff face');
const distant=context();assert.equal(drawSnowCliffs(distant.c,boundaries,{viewBounds:{minX:1000,minY:1000,maxX:1100,maxY:1100}}),false);assert.equal(distant.calls.length,0,'distant viewport does not paint unrelated cliffs');
assert.equal(JSON.stringify(boundaries),beforeBoundaries,'cliff preparation leaves collision rings untouched');assert.equal(drawSnowCliffs(context().c,[]),false);
console.log('Snow structures: collision-derived ridge vertices, clipped bridge deck, open gate state, deterministic landmarks, hole-aware blocked-side cliffs, viewport culling and balanced drawing state passed.');
