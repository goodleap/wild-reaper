import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { COAST_RULES } from './dist/placement-rules.js';
import { IslandArt, traceIslandContour } from './dist/island-art.js';
import { ImmersionArt } from './dist/immersion-art.js';
import { WORLD_IDS } from './dist/world-definitions.js';
function recording(){const calls=[],stack=[],ctx={globalAlpha:1};for(const name of ['beginPath','moveTo','lineTo','closePath','fill','stroke','fillRect','translate','clip','ellipse'])ctx[name]=(...args)=>calls.push([name,...args]);ctx.save=()=>stack.push(ctx.globalAlpha);ctx.restore=()=>{ctx.globalAlpha=stack.pop();};ctx.createLinearGradient=(...args)=>{calls.push(['gradient',...args]);return{addColorStop(...args){calls.push(['stop',...args]);}};};return{ctx,calls,stack};}
// The opening forest now uses a fixed rift mask with zero coast bands. Keep
// the full procedural shoreline/immersion contract on a real coastal world.
const art=new IslandArt(),island=new Island({region:'marsh',seed:29}),shore=island.contour(45)[0];
const draw=(options={})=>{const rec=recording();assert(art.draw(rec.ctx,island,{camX:shore.x,camY:shore.y,width:1100,height:700,time:3,...options},()=>rec.calls.push(['ground'])));assert.equal(rec.stack.length,0);assert.equal(rec.ctx.globalAlpha,1);return rec.calls;};
const before=draw();assert.deepEqual(draw(),before,'paused coast has identical geometry, highlights and ripples');assert.notDeepEqual(draw({time:12}),before);assert.deepEqual(draw({reduced:true,time:10}),draw({reduced:true,time:200}));
assert(before.filter(c=>c[0]==='ground').length===1,'regional ground is drawn exactly once');
assert(before.length<6000,'visible shoreline work stays bounded rather than painting all-island textures');
const shape=art._shape(island);assert.equal(shape.outer,island.points);assert.equal(shape.shallow,island.contour(COAST_RULES.shallowWidth));assert.equal(shape.grass,island.contour(COAST_RULES.inlandInset));
const expected=recording();traceIslandContour(expected.ctx,island.points);const first=before.findIndex(c=>c[0]==='beginPath');assert.deepEqual(before.slice(first,first+expected.calls.length),expected.calls,'outer coast uses the exact shared collision outline');
const inland=draw({camX:0,camY:0});assert.deepEqual(inland,[['ground']],'inland ground has no radial road overlay');
const random=Math.random;Math.random=()=>{throw new Error('coast art cannot consume simulation RNG');};try{draw();draw({width:390,height:760});}finally{Math.random=random;}
// Shore immersion clips ripples to the true ocean shelf: no fake ellipse over
// dry beach or deep sea, and no full island bitmap is created per character.
const immersion={x:shore.x,waterY:shore.y,depth:.34,width:13,mud:{type:'shore',island,x:0,y:0,rx:1,ry:1}},rec=recording();new ImmersionArt().drawSurface(rec.ctx,immersion,{time:4});const clip=rec.calls.findIndex(c=>c[0]==='clip');assert.equal(rec.calls[clip][1],'evenodd');assert.equal(rec.calls.slice(0,clip).filter(c=>c[0]==='closePath').length,2);assert.equal(rec.calls.slice(0,clip).filter(c=>c[0]==='ellipse').length,0);assert.equal(rec.stack.length,0);
for(const region of WORLD_IDS){
  const current=new Island({region,seed:29}),shape=art._shape(current),shallow=current.shallowWidth,inland=shallow+current.beachWidth;
  assert.equal(shape.outer,current.points);assert.equal(shape.shallow,current.contour(shallow));assert.equal(shape.grass,current.contour(inland));
  if(current.layout?.kind==='rift-forest'){
    assert.equal(shallow,0);assert.equal(inland,0);assert.equal(shape.shallow,current.points);assert.equal(shape.grass,current.points,'authored forest painting cannot invent the old procedural shallow/beach bands');
    const rec=recording();assert(art.draw(rec.ctx,current,{camX:0,camY:0,width:540,height:720},()=>rec.calls.push(['ground'])));assert.deepEqual(rec.calls,[['ground']]);
  }else {
    assert(shallow>0&&inland>shallow);assert.notEqual(shape.shallow,current.points);assert.notEqual(shape.grass,shape.shallow);
    const coast=current.contour(shallow/2)[0],rec=recording();assert(art.draw(rec.ctx,current,{camX:coast.x,camY:coast.y,width:540,height:720,time:3},()=>rec.calls.push(['ground'])));
    assert.equal(rec.stack.length,0);assert.equal(rec.ctx.globalAlpha,1);assert.equal(rec.calls.filter(call=>call[0]==='ground').length,1);
  }
}
console.log('Island art: exact procedural coast contours, authored zero-band rift geometry, world-fixed paused/reduced sea, bounded detail, natural ground and true shallow-ring immersion clips passed for all configured worlds.');
