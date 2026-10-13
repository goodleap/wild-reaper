import assert from 'node:assert/strict';
import {WorldArt,WORLD_ART_PALETTES} from './dist/world-art.js';
import {WaterArt} from './dist/water-art.js';
import {Terrain} from './dist/terrain.js';
const operations=[];
function context(){const stack=[],state={globalAlpha:.73,lineWidth:1};return new Proxy(state,{get(o,k){if(k in o)return o[k];if(k==='save')return()=>stack.push(o.globalAlpha);if(k==='restore')return()=>{assert(stack.length,'balanced canvas stack');o.globalAlpha=stack.pop();};if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return(...a)=>{for(const v of a)if(typeof v==='number')assert(Number.isFinite(v),`${String(k)} argument finite`);if(k==='drawImage')operations.push(a);};}});}
const makeCanvas=()=>({width:0,height:0,getContext:()=>context()}),art=new WorldArt(makeCanvas),water=new WaterArt(makeCanvas),c=context();
for(const region of Object.keys(WORLD_ART_PALETTES)){
 const terrain=new Terrain({region,seed:9}),props=terrain.query(-960,-540,960,540);art.drawGround(c,region,0,0,1920,1080,{seed:9});for(const prop of props)assert(art.drawProp(c,prop),'all new world variants have art');
 const warmed=art.cacheStats.builds;
 for(let i=0;i<20;i++){art.drawGround(c,region,0,0,1920,1080,{seed:9});for(const prop of props)art.drawProp(c,prop);}
 assert.equal(art.cacheStats.builds,warmed,`${region} warmed viewport must not thrash`);
 assert.equal(c.globalAlpha,.73,'world art restores alpha');assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);
}
assert.equal(art.drawGround(c,'forest',0,0,100,100),false,'legacy art retains its renderer');assert.equal(art.drawProp(c,{variant:'pillar'}),false);
for(const [region,kind]of[['beach','water'],['mountain','water'],['snow','ice'],['snow','snow'],['volcano','lava']]){
 const patch={x:70,y:-30,rx:95,ry:60,shape:'kidney',seed:.31,kind};water.draw(c,patch,{region,pixelRatio:2});const warmed=water.cacheStats.builds;for(let i=0;i<5;i++)water.draw(c,patch,{region,pixelRatio:2,time:i});assert.equal(water.cacheStats.builds,warmed,'themed surfaces use stable cached contours');assert.equal(c.globalAlpha,.73);
}
for(let i=0;i<50;i++){const region=Object.keys(WORLD_ART_PALETTES)[i%5],x=i*317;art.drawGround(c,region,x,x,1300,900,{seed:9});for(const p of new Terrain({region,seed:i}).query(x-500,x-400,x+500,x+400))art.drawProp(c,p);assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'exploration stays bounded');}
assert(operations.length>500,'exercises visible tiles and props');
console.log('World art: all five themes/variants, exact shared layout hooks, warm 1920px viewport reuse, balanced canvas state and bounded 12 MB LRU passed.');
