import assert from 'node:assert/strict';
import { RiftArt } from './dist/worlds/rift-art.js';
import { WorldLayoutArt } from './dist/worlds/world-layout-art.js';

const ctx={save(){},restore(){},setTransform(){},drawImage(){}};
const factory=()=>({width:0,height:0,getContext:()=>ctx});
const city=()=>({kind:'rift-forest',artTheme:'city',artStyle:'clockshadow-renewed'});
function harness(){
  let clock=0,cost=2;const art=new RiftArt(factory,{now:()=>clock}),paints=[];
  art.cityArt={paintTile(c,layout,view){paints.push({layout,view});clock+=cost;},cacheStats:{}};
  return {art,paints,setCost(value){cost=value;},tick(value){clock=value;},now:()=>clock};
}
const tileKeys=(art,layout,view)=>{const keys=[];for(let ty=Math.floor((view.camY-view.height/2)/384);ty<=Math.floor((view.camY+view.height/2)/384);ty++)for(let tx=Math.floor((view.camX-view.width/2)/384);tx<=Math.floor((view.camX+view.width/2)/384);tx++)keys.push(art._key(layout,tx,ty));return keys;};
const base={camX:-2500,camY:2900,width:1728,height:874,prefetch:true};
const h=harness(),layout=city(),island={layout};
let totalMisses=0,totalPrefetch=0,firstVisible=0;
for(let frame=0;frame<240;frame++){
  h.tick(frame*16.667+100);const view={...base,camX:base.camX+frame*16};
  h.art.drawGround(ctx,island,view);
  const misses=h.art.groundStats.lastVisibleBuilds;if(!frame)firstVisible=misses;else totalMisses+=misses;
  const visible=tileKeys(h.art,layout,view);assert(visible.every(key=>h.art.cache.has(key)),'the current viewport stays resident before prefetch');
  const result=h.art.prepareGround({budgetMs:3,now:h.now()});totalPrefetch+=result.built;
  assert(result.built<=1,'only one optional tile may be built in a rendered frame');
  assert(!misses||!result.built,'a visible cold frame cannot also do speculative work');
  assert(visible.every(key=>h.art.cache.has(key)),'prefetch cannot evict a currently visible tile');
  assert.equal(h.art.prepareGround({budgetMs:3,now:h.now()}).built,0,'calling preparation twice cannot spend another tile');
  assert(h.art.pixels<=6*1024*1024,'the floor bitmap cache remains capped');
}
assert(totalPrefetch>20,'travel prepares successive leading strips');
assert(totalMisses<=4,`continuous high-speed travel avoids bulk visible cold strips (${totalMisses} misses)`);
assert(h.art.groundStats.prefetchHits>=totalPrefetch-8,'leading tiles are used rather than an unused surrounding ring');
assert.equal(h.art.groundStats.budgetOverruns,0);
// Diagonal movement needs both approaching edges, while still avoiding the
// complete surrounding ring that would evict the visible working set.
const diagonal=harness(),diagonalLayout=city();let diagonalMisses=0;
for(let frame=0;frame<180;frame++){
  diagonal.tick(frame*16.667+100);const view={...base,camX:base.camX+frame*11.314,camY:base.camY+frame*11.314};
  diagonal.art.drawGround(ctx,{layout:diagonalLayout},view);if(frame)diagonalMisses+=diagonal.art.groundStats.lastVisibleBuilds;
  assert(diagonal.art.prepareGround({budgetMs:3,now:diagonal.now()}).built<=1);
  assert(tileKeys(diagonal.art,diagonalLayout,view).every(key=>diagonal.art.cache.has(key)));
}
assert.equal(diagonalMisses,0,'diagonal travel prepares both approaching edges in time');
const legacy=harness(),legacyLayout={...city(),artStyle:'city-native'};
for(let frame=0;frame<8;frame++){legacy.tick(frame*16.667+100);legacy.art.drawGround(ctx,{layout:legacyLayout},{...base,camX:base.camX+frame*16});assert.equal(legacy.art.prepareGround({budgetMs:3,now:legacy.now()}).built,0,'legacy city art does not opt into new speculative work');}
// Stationary frames and inactive views do not spend time warming a perimeter.
const stop={...base,camX:base.camX+239*16};
for(let frame=240;frame<250;frame++){h.tick(frame*16.667+100);h.art.drawGround(ctx,island,stop);assert.equal(h.art.prepareGround({budgetMs:3,now:h.now()}).built,0);}
h.tick(5000);h.art.drawGround(ctx,island,{...stop,camX:stop.camX+16,prefetch:false});assert.equal(h.art.prepareGround({budgetMs:3,now:h.now()}).built,0,'disabled prefetch cancels the travel state');
// Reversal replaces candidates immediately; no queue keeps working behind us.
for(let frame=0;frame<12;frame++){h.tick(5020+frame*16.667);h.art.drawGround(ctx,island,{...stop,camX:stop.camX-16*(frame+1)});if(h.art.pending){const center=stop.camX-16*(frame+1);assert(h.art.pending.tiles.every(tile=>tile.tx*384<center-base.width/2),'reversal only anticipates the new leading edge');}h.art.prepareGround({budgetMs:3,now:h.now()});}
// Exhausted budgets skip optional work without caching incomplete/blank tiles.
const b=harness(),bl=city();b.tick(100);b.art.drawGround(ctx,{layout:bl},base);
b.tick(200);b.art.drawGround(ctx,{layout:bl},{...base,camX:base.camX+16});
assert.equal(b.art.prepareGround({budgetMs:.5,now:b.now()}).built,0);assert.equal(b.art.groundStats.budgetSkips,1);
b.tick(216.667);b.art.drawGround(ctx,{layout:bl},{...base,camX:base.camX+32});b.setCost(6);
const expensive=b.art.prepareGround({budgetMs:3,now:b.now()});assert.equal(expensive.built,1);assert.equal(expensive.overBudget,true);assert.equal(expensive.elapsedMs,6);assert.equal(b.art.groundStats.budgetOverruns,1,'an indivisible tile exceeding its admission budget is reported honestly');
// Stale frames, large camera jumps, resizing and a different scene do not use
// the preceding direction; the current scene is always fully drawn first.
for(const [time,view,nextLayout]of [[500,{...base,camX:-700},bl],[517,{...base,camX:4000},bl],[534,{...base,camX:4016,width:540},bl],[551,{...base,camX:4032,width:540},city()]]){b.tick(time);b.art.drawGround(ctx,{layout:nextLayout},view);assert.equal(b.art.prepareGround({budgetMs:3,now:b.now()}).built,0);}
b.tick(600);b.art.drawGround(ctx,{layout:bl},base);b.tick(616.667);b.art.drawGround(ctx,{layout:bl},{...base,camX:base.camX+16});b.tick(1000);assert.equal(b.art.prepareGround({budgetMs:3,now:b.now()}).built,0,'expired frame work cannot resume in a later scene');
const cancelled=harness();cancelled.tick(100);cancelled.art.drawGround(ctx,island,base);cancelled.tick(200);cancelled.art.drawGround(ctx,island,{...base,camX:base.camX+16});cancelled.art.cancelGroundPreparation();assert.equal(cancelled.art.prepareGround({budgetMs:3,now:cancelled.now()}).built,0,'scene owners can explicitly cancel before rendering another surface');
const wrapper=new WorldLayoutArt(factory);let forwarded=false;wrapper.riftArt.drawGround=(c,island,options)=>{forwarded=options.prefetch;return true;};wrapper.drawGround(ctx,{layout:bl},{...base,prefetch:true});assert(forwarded,'world-art facade forwards the opt-in');wrapper.riftArt.prepareGround=options=>({built:options.budgetMs});assert.equal(wrapper.prepareGround({budgetMs:2}).built,2,'preparation stays under the caller frame timer');
console.log(JSON.stringify({cityGroundPrefetch:'passed',frames:240,speed:960,viewport:'1728x874',initialVisibleBuilds:firstVisible,movingVisibleMisses:totalMisses,prefetchBuilds:totalPrefetch,usedPrefetchedTiles:h.art.groundStats.prefetchHits,cacheEntries:h.art.cache.size,cacheBytes:h.art.pixels*4,coverage:'one optional tile per frame; visible protection; leading strips; stops, reversal, inactive and stale scenes; budget skipping and explicit non-preemptible overruns; capped memory; no incomplete tiles'}));
