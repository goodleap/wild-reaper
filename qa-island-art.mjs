import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { IslandArt, traceIslandContour } from './dist/island-art.js';
import { ImmersionArt } from './dist/immersion-art.js';
function recording(){const calls=[],stack=[],ctx={globalAlpha:1};for(const name of ['beginPath','moveTo','lineTo','closePath','fill','stroke','fillRect','translate','clip','ellipse'])ctx[name]=(...args)=>calls.push([name,...args]);ctx.save=()=>stack.push(ctx.globalAlpha);ctx.restore=()=>{ctx.globalAlpha=stack.pop();};ctx.createLinearGradient=(...args)=>{calls.push(['gradient',...args]);return{addColorStop(...args){calls.push(['stop',...args]);}};};return{ctx,calls,stack};}
const art=new IslandArt(),island=new Island({region:'forest',seed:29}),shore=island.contour(45)[0];
const draw=(options={})=>{const rec=recording();assert(art.draw(rec.ctx,island,{camX:shore.x,camY:shore.y,width:1100,height:700,time:3,...options},()=>rec.calls.push(['ground'])));assert.equal(rec.stack.length,0);assert.equal(rec.ctx.globalAlpha,1);return rec.calls;};
const before=draw();assert.deepEqual(draw(),before,'paused coast has identical geometry, highlights and ripples');assert.notDeepEqual(draw({time:12}),before);assert.deepEqual(draw({reduced:true,time:10}),draw({reduced:true,time:200}));
assert(before.filter(c=>c[0]==='ground').length===1,'regional ground is drawn exactly once');
assert(before.length<6000,'visible shoreline work stays bounded rather than painting all-island textures');
const shape=art._shape(island);assert.equal(shape.outer,island.points);assert.equal(shape.shallow,island.contour(100));assert.equal(shape.grass,island.contour(135));
const expected=recording();traceIslandContour(expected.ctx,island.points);const first=before.findIndex(c=>c[0]==='beginPath');assert.deepEqual(before.slice(first,first+expected.calls.length),expected.calls,'outer coast uses the exact shared collision outline');
const inland=draw({camX:0,camY:0});assert.deepEqual(inland,[['ground']],'inland ground has no radial road overlay');
const random=Math.random;Math.random=()=>{throw new Error('coast art cannot consume simulation RNG');};try{draw();draw({width:390,height:760});}finally{Math.random=random;}
// Shore immersion clips ripples to the true ocean shelf: no fake ellipse over
// dry beach or deep sea, and no full island bitmap is created per character.
const immersion={x:shore.x,waterY:shore.y,depth:.34,width:13,mud:{type:'shore',island,x:0,y:0,rx:1,ry:1}},rec=recording();new ImmersionArt().drawSurface(rec.ctx,immersion,{time:4});const clip=rec.calls.findIndex(c=>c[0]==='clip');assert.equal(rec.calls[clip][1],'evenodd');assert.equal(rec.calls.slice(0,clip).filter(c=>c[0]==='closePath').length,2);assert.equal(rec.calls.slice(0,clip).filter(c=>c[0]==='ellipse').length,0);assert.equal(rec.stack.length,0);
console.log('Island art: exact coast contours, world-fixed paused/reduced sea, viewport-bounded detail, natural inland ground and true shallow-ring immersion clips passed.');
