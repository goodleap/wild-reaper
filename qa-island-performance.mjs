import assert from 'node:assert/strict';
import { Island } from './dist/islands.js';
import { IslandArt } from './dist/island-art.js';
import { COAST_RULES } from './dist/placement-rules.js';

// The previous renderer classified each visible cell directly. Keep that
// independent reference here to compare paint coordinates and order, rather
// than merely checking that a new cache can return its own stored values.
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
class DirectIslandArt extends IslandArt {
  _samples(island,shape,view,kind){
    const result=[],grain=kind==='grain',cell=grain?19:76,margin=grain?0:1;
    const shallow=island.shallowWidth??COAST_RULES.shallowWidth,inland=shallow+COAST_RULES.beachWidth;
    for(let gy=Math.floor(view.minY/cell)-margin;gy<=Math.floor(view.maxY/cell);gy++)for(let gx=Math.floor(view.minX/cell)-margin;gx<=Math.floor(view.maxX/cell);gx++){
      if(grain){
        const seed=hash(gx+17,gy+island.seed),x=gx*19+seed*18,y=gy*19+hash(gx-31,gy)*18;
        if(island.contains(x,y,shallow+1)&&!island.contains(x,y,inland+4))result.push({gx,gy,seed,x,y});
      }else{
        const seed=hash(gx+island.seed,gy),x=gx*76+seed*45,y=gy*76+hash(gy,gx+9)*63;
        if(!island.isDry(x,y))result.push({gx,gy,seed,x,y});
      }
    }
    return result;
  }
}
function recording(){
  const calls=[],state={globalAlpha:1},stack=[];let gradientId=0;
  const ctx=new Proxy(state,{
    get(target,key){
      if(key in target)return target[key];
      if(key==='createLinearGradient')return(...args)=>{const id=++gradientId;calls.push([key,id,...args]);return{id,addColorStop(...stops){calls.push(['stop',id,...stops]);}};};
      if(key==='save')return()=>{stack.push({...state});calls.push(['save']);};
      if(key==='restore')return()=>{const saved=stack.pop();assert(saved);for(const prop of Object.keys(state))delete state[prop];Object.assign(state,saved);calls.push(['restore']);};
      return(...args)=>calls.push([key,...args]);
    },
    set(target,key,value){target[key]=value;calls.push(['set',key,value?.id?`gradient:${value.id}`:value]);return true;}
  });
  return {ctx,calls,stack};
}
const noop=()=>{},nullContext=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop:noop}):noop,set:()=>true});
const paint=(art,island,options)=>{const r=recording();art.draw(r.ctx,island,options,()=>r.calls.push(['land']));assert.equal(r.stack.length,0);return r.calls;};

const cached=new IslandArt(),direct=new DirectIslandArt();let compared=0;
for(const region of ['forest','marsh','ruins'])for(const seed of [0,29,91]){
  const island=new Island({region,seed});
  for(const [index,width,height] of [[0,393,852],[35,1512,900],[71,1800,1169],[107,720,410]]){
    const shore=island.contour(75)[index];
    const options={camX:shore.x,camY:shore.y,width,height,time:3.25};
    const expected=paint(direct,island,options);
    assert.deepEqual(paint(cached,island,options),expected,`${region}/${seed}/${index}: cold cache preserves every paint operation`);
    assert.deepEqual(paint(cached,island,options),expected,'warm cache preserves paused paint and boundary samples');
    const moved={...options,camX:shore.x+17.1,camY:shore.y-23.7,time:4.5};
    assert.deepEqual(paint(cached,island,moved),paint(direct,island,moved),'movement across both sampling grids remains world anchored');
    compared++;
  }
  const shore=island.contour(45)[0],options={camX:shore.x,camY:shore.y,width:720,height:500,time:2};
  assert.notDeepEqual(paint(cached,island,options),paint(cached,island,{...options,time:9}),'cached water classification does not freeze wave animation');
  assert.deepEqual(paint(cached,island,{...options,reduced:true}),paint(cached,island,{...options,time:99,reduced:true}),'reduced motion still freezes waves');
}

// Warm-frame classification is constant even at a large desktop viewport.
const island=new Island({seed:84}),art=new IslandArt(),options={camX:island.points[0].x-180,camY:0,width:1800,height:1169,time:3};
const counts={contains:0,isDry:0,nearest:0};
for(const [name,key] of [['contains','contains'],['isDry','isDry'],['_nearest','nearest']]){
  const original=island[name].bind(island);island[name]=(...args)=>{counts[key]++;return original(...args);};
}
art.draw(nullContext,island,options);const coldNearest=counts.nearest,warmBuilds=art.detailStats(island).builds;
assert(coldNearest>1000,'the cold reference scene exercises real coastal edge classification');
for(const key of Object.keys(counts))counts[key]=0;
for(let i=0;i<60;i++)art.draw(nullContext,island,{...options,time:i/60});
assert.equal(counts.contains,60,'only the existing whole-viewport inland fast-path check remains per frame');
assert.equal(counts.isDry,0,'sea samples do not re-query terrain on warm frames');
assert(counts.nearest<=60,'no per-pixel or per-cell edge scan remains on warm frames');
assert.equal(art.detailStats(island).builds,warmBuilds,'animated waves do not rebuild static coastal chunks');
const warmNearest=counts.nearest/60;

// A desktop can have a 4K CSS viewport. Both sample passes must fit at once;
// otherwise bounded eviction would silently rebuild the same chunks each frame.
for(const index of [0,64]){
  const large=new Island({seed:19}),largeArt=new IslandArt(),point=large.points[index];
  const largeView={camX:point.x,camY:point.y,width:3840,height:2160};
  largeArt.draw(nullContext,large,largeView);const builds=largeArt.detailStats(large).builds;
  const original=large.isDry.bind(large);let queries=0;large.isDry=(...args)=>{queries++;return original(...args);};
  for(let i=0;i<3;i++)largeArt.draw(nullContext,large,largeView);
  assert.equal(largeArt.detailStats(large).builds,builds,'4K positive/negative view retains its complete working set');
  assert.equal(queries,0,'4K warm frames do not reclassify sea cells');
  assert(largeArt.detailStats(large).chunks<=largeArt.detailStats(large).limit);
}

// Walking around an entire island evicts old data, then reconstructs it without
// changing its appearance. The cache never allocates an island-sized bitmap.
const before=paint(art,island,options);
for(let i=0;i<island.points.length;i+=3){const p=island.points[i];art.draw(nullContext,island,{...options,camX:p.x,camY:p.y,width:1100,height:700});const stats=art.detailStats(island);assert(stats.chunks<=stats.limit);assert(stats.samples<=stats.limit*(256+16));}
assert(art.detailStats(island).builds>art.detailStats(island).limit,'exploration actually exercises eviction');
assert.deepEqual(paint(art,island,options),before,'revisiting evicted chunks restores identical scenery');
const other=new Island({region:'marsh',seed:84}),otherOptions={...options,camX:other.points[0].x-180};
assert.deepEqual(paint(art,other,otherOptions),paint(direct,other,otherOptions),'different worlds cannot share an incompatible sample cache');
assert(art.cache instanceof WeakMap,'finished islands are not retained by a global strong cache');
const inland=new Island({seed:7}),inlandArt=new IslandArt();inlandArt.draw(nullContext,inland,{camX:0,camY:0,width:1100,height:700});
assert.equal(inlandArt.detailStats(inland).chunks,0,'inland rendering creates no coast sample chunks');
console.log(`Island performance: ${compared} coast/viewport cases preserve exact paint; warm frames use ${warmNearest} edge scans; bounded exploration cache, animation and revisits passed.`);
