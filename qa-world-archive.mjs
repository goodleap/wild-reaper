import assert from 'node:assert/strict';
import fs from 'node:fs';
import { worldArchiveHTML, worldArchiveSelection, WORLD_ARCHIVE_CATEGORIES, WORLD_ARCHIVE_WORLDS, WORLD_ARCHIVE_LOCATIONS } from './dist/world-archive.js';
import { WorldArchiveArt } from './dist/world-archive-art.js';
import { archivePanelHTML } from './dist/archive-panel.js';
import { REGIONS } from './dist/regions.js';
import { ARMY_SITE_RULES } from './dist/relic-sites.js';
import { ANGEL_RULES } from './dist/settlements.js';
import { REGIONAL_MECHANISM_RULES } from './dist/regional-mechanisms.js';

assert.deepEqual(WORLD_ARCHIVE_WORLDS.map(({id,name})=>({id,name})),REGIONS.map(({id,name})=>({id,name})),'world names come from the actual game catalog');
const byId=new Map(WORLD_ARCHIVE_LOCATIONS.map(item=>[item.id,item]));
assert.equal(byId.size,WORLD_ARCHIVE_LOCATIONS.length,'stable unique location IDs');
for(const id of ['castle','hunt','rescue','owlroost','golemaltar','rune','stonevault','occupied','supply','merchant','angel','dogcamp','shipwreck','belltower','mine','icealtar','furnace'])assert.ok(byId.has(id),`${id} documented`);
assert.equal(WORLD_ARCHIVE_WORLDS.length,8);
for(const world of WORLD_ARCHIVE_WORLDS)for(const key of ['theme','risk','tip'])assert.ok(world[key]?.length>0,`${world.id} has actual gameplay reference`);
assert.ok(byId.get('rune').feature.includes(`${REGIONAL_MECHANISM_RULES.runeDuration} 秒`));
assert.ok(byId.get('dogcamp').trigger.includes(`${ARMY_SITE_RULES.dogCost} 金币`));
assert.ok(byId.get('stonevault').feature.includes(`${ARMY_SITE_RULES.vaultGold} 金币与 ${ARMY_SITE_RULES.vaultCrystals} 灵晶`));
assert.ok(byId.get('angel').feature.includes(`半径 ${ANGEL_RULES.guardRadius}`));
assert.equal(byId.get('castle').group,'relics');
assert.equal(byId.get('merchant').group,'waypoints');
assert.equal(byId.get('angel').group,'waypoints');
for(const item of [...WORLD_ARCHIVE_WORLDS,...WORLD_ARCHIVE_LOCATIONS]){
  assert.ok(!('x' in item||'y' in item||'discovered' in item),'the handbook contains no run map positions or discovery state');
}
assert.deepEqual(WORLD_ARCHIVE_CATEGORIES.map(item=>item.id),['worlds','relics','waypoints']);
const allArtKeys=new Set();
for(const category of WORLD_ARCHIVE_CATEGORIES){
  const {entries}=worldArchiveSelection({category:category.id});
  assert.equal(entries.length,category.count);
  for(const selected of entries){
    const html=worldArchiveHTML({category:category.id,selectedId:selected.id});
    assert.equal((html.match(/data-archive-world-entry=/g)||[]).length,entries.length);
    assert.equal((html.match(/data-world-archive-detail/g)||[]).length,1);
    assert.match(html,new RegExp(`data-archive-world-entry="${selected.id}" aria-pressed="true"`));
    assert.ok(html.includes(selected.risk||selected.feature),'selected card displays its actual world/location detail');
    assert.ok(!/data-archive-entry=|data-archive-category=|未发现|<details|<script|on\w+=|javascript:/.test(html),'independent guide has no discovery gate or ordinary codex controls');
    for(const match of html.matchAll(/data-world-archive-art="([^"]+)"/g))allArtKeys.add(match[1]);
  }
}
assert.equal(allArtKeys.size,WORLD_ARCHIVE_WORLDS.length+WORLD_ARCHIVE_LOCATIONS.length);
assert.equal(worldArchiveSelection({category:'unknown',selectedId:'stonevault'}).selected.id,'forest');
assert.equal(worldArchiveSelection({category:'relics',selectedId:'forest'}).selected.id,'castle');
assert.match(archivePanelHTML({}, {tab:'world',worldCategory:'relics',worldSelectedId:'stonevault'}),/进入宝库获得/);
assert.match(worldArchiveHTML(),/关卡模式：[\s\S]*往返[\s\S]*自由探索：[\s\S]*跨世界通道/,'the guide distinguishes trial travel from world connections');
assert.match(worldArchiveHTML(),/具体位置留待每局冒险中探索/);

// Exercise every portrait through the real gameplay painters. The canvas fake
// checks finite geometry/state and cache lifetime, without claiming browser QA.
let draws=0;
const imageDraws=[];
const contexts=[];
function context(){
  const stack=[],state={globalAlpha:1,lineWidth:1};
  const ctx=new Proxy(state,{get(object,key){
    if(key in object)return object[key];
    if(key==='save')return()=>stack.push({...object});
    if(key==='restore')return()=>{assert(stack.length,'balanced canvas state');Object.assign(object,stack.pop());};
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({addColorStop(){}});
    return (...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${String(key)} argument must be finite`);if(key==='drawImage'){draws++;imageDraws.push(args);}};
  }});
  contexts.push({stack,state});return ctx;
}
const makeCanvas=()=>{const ctx=context();return {width:480,height:300,getContext:()=>ctx};};
const art=new WorldArchiveArt(makeCanvas);
for(const category of WORLD_ARCHIVE_CATEGORIES){
  const html=worldArchiveHTML({category:category.id});
  const canvases=[...html.matchAll(/data-world-archive-art="([^"]+)"/g)].map(([,key])=>Object.assign(makeCanvas(),{dataset:{worldArchiveArt:key}}));
  const container={querySelectorAll:()=>canvases};
  art.draw(container);const warmed=art.cacheStats.builds;art.draw(container);
  assert.equal(art.cacheStats.builds,warmed,'same category/detail repaint reuses completed portraits');
  assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'portrait storage is bounded');
}
const compact=Object.assign(makeCanvas(),{width:320,height:240,dataset:{worldArchiveArt:'world:forest'}});
art.draw({querySelectorAll:()=>[compact]});
const [portrait,x,y,width,height]=imageDraws.at(-1);
assert.equal(width/portrait.width,height/portrait.height,'compact cards retain scenery proportions');
assert(x>=0&&y>=0&&x+width<=compact.width&&y+height<=compact.height,'the complete portrait remains inside the compact card');
assert(draws>200,'all world and location gameplay painters are exercised');
for(const {stack} of contexts)assert.equal(stack.length,0,'all painter transforms restore');
const css=fs.readFileSync(new URL('./dist/archive.css',import.meta.url),'utf8');
assert.match(css,/world-archive-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css,/world-archive-detail:focus-visible/);
console.log('World codex checked: 8 worlds/17 locations, isolated category/selection, unchanged guide access, gameplay art, bounded warm cache and finite geometry.');
