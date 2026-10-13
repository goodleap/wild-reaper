import assert from 'node:assert/strict';
import fs from 'node:fs';
import { worldArchiveHTML, WORLD_ARCHIVE_WORLDS, WORLD_ARCHIVE_LOCATIONS } from './dist/world-archive.js';
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
const html=worldArchiveHTML();
assert.equal((html.match(/<article /g)||[]).length,REGIONS.length);
assert.equal((html.match(/<details /g)||[]).length,WORLD_ARCHIVE_LOCATIONS.length);
assert.equal((html.match(/<summary>/g)||[]).length,WORLD_ARCHIVE_LOCATIONS.length,'native summaries are keyboard and touch accessible');
assert.equal((html.match(/<details[^>]*\sopen(?:\s|>)/g)||[]).length,0,'location reference starts compact');
assert.ok(!/<script|on\w+=|javascript:|<canvas/.test(html),'static handbook does not need code, map rendering or animation');
assert.ok(html.includes('双向通道')&&html.includes('具体位置留待每局冒险中探索'));
const css=fs.readFileSync(new URL('./dist/archive.css',import.meta.url),'utf8');
assert.match(css,/@media\(max-width:650px\)\{[^}]*[\s\S]*?\.world-archive-worlds\{grid-template-columns:1fr/);
assert.match(css,/\.world-archive-location>summary:focus-visible/);
console.log('World archive checked: current world names and gameplay values, location coverage, compact native details and responsive layout.');
