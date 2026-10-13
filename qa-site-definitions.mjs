import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { createHutState, populateHut } from './dist/hut-interior.js';
import { SETTLEMENT_DEFINITIONS, RELIC_SITE_DEFINITIONS, WORLD_RELIC_DEFINITIONS, relicSiteEntries, relicSiteEnabled, relicSiteProfile, createRelicMechanism } from './dist/site-definitions.js';
import { hutProfileFor, interiorRewardFor } from './dist/interior-profiles.js';
import { WORLD_SITE_FEATURES, worldSettlementDefinition } from './dist/world-sites.js';
import { HUT_GUARD_PACKS } from './dist/encounter-definitions.js';

const arena=()=>new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false});
for(const definition of [...SETTLEMENT_DEFINITIONS,...RELIC_SITE_DEFINITIONS,...Object.values(WORLD_RELIC_DEFINITIONS).flat()]){
 assert(Object.isFrozen(definition));
 assert.throws(()=>{definition.name='mutation';},TypeError);
}
const game={region:{id:'snow'},environment:{mechanisms:{}},_features:{encounters:false,companions:false}};
const entries=relicSiteEntries(game);assert.deepEqual(entries.map(entry=>entry.key),['hunt','rescue','rescue-warden','dogcamp','owlroost','golemaltar','stonevault','rune']);
assert.deepEqual(entries.filter(entry=>relicSiteEnabled(game,entry)).map(entry=>entry.key),['rune']);
const rune=entries.at(-1),first=createRelicMechanism({id:'first',x:0,y:0},rune),second=createRelicMechanism({id:'second',x:100,y:0},rune);
first.remaining=4;first.state='active';assert.equal(second.remaining,0);assert.equal(second.state,'idle');assert.equal(relicSiteProfile(rune).mechanism.remaining,0);
assert.equal(first.element,'frost');assert.notEqual(first.id,second.id);
assert.equal(WORLD_SITE_FEATURES.shipwreck.guardTypes,HUT_GUARD_PACKS.shipwreck,'feature and encounter catalog share one immutable enemy definition');
for(const [id,type] of [['default','supply'],['shipwreck','occupied'],['mine','occupied']]){
 const site={id:`isolation:${id}`,type,featureId:id==='default'?undefined:id,name:id};
 const one=createHutState(arena(),site,923),two=createHutState(arena(),{...site,id:`other:${id}`},923);
 const original=two.props[0].x;one.props[0].x+=71;one.walls[0].x+=9;one.chests[0].state='claimed';one.visited.add(8);
 assert.equal(two.props[0].x,original);assert.equal(hutProfileFor(site).props[0].x,original);assert.notEqual(one.walls[0].x,two.walls[0].x);assert.equal(two.chests[0].state,'closed');assert.equal(two.visited.has(8),false);
 assert(Object.isFrozen(interiorRewardFor(site)));assert.throws(()=>{interiorRewardFor(site).gold=1;},TypeError);
}
// A feature can replace its pack without adding a parallel feature-ID entry
// to the spawn catalog. Exercise the real population loop with that override.
const customGame=arena(),customSite={id:'custom-pack',type:'occupied',featureId:'shipwreck',name:'custom-pack'},customState=createHutState(customGame,customSite,582);
const customTypes=Object.freeze(['bat','slime','boar','spore','brute','beetle']);
const customFeature=Object.freeze({...WORLD_SITE_FEATURES.shipwreck,guardTypes:customTypes});
customGame.enemies=[];customGame.terrain=customState.terrain;
populateHut(customGame,customState,customFeature);
assert.deepEqual(customGame.enemies.map(enemy=>enemy.type),customTypes,'feature guardTypes is the actual spawn source, including a known feature ID');
assert.equal(customState.rooms.get(0).total,customGame.enemies.length);
assert.equal(WORLD_SITE_FEATURES.shipwreck.guardTypes,HUT_GUARD_PACKS.shipwreck,'test overrides never alter registered content');

const definition=SETTLEMENT_DEFINITIONS.find(site=>site.type==='castle'),city=worldSettlementDefinition('city',definition),volcano=worldSettlementDefinition('volcano',definition);
city.name='instance title';assert.equal(volcano.name,'熔炉神殿');assert.equal(definition.name,'古堡入口');assert.equal(WORLD_SITE_FEATURES.belltower.name,'暮钟塔');
const g=arena(),site={id:'maze-isolation',type:'castle',seed:.2};const castle=g.dungeon._makeState(site),other=g.dungeon._makeState({...site,id:'other-maze'});
castle.cells[0].open.push(7);castle.visited.add(99);castle.walls[0].x+=10;
assert(!other.cells[0].open.includes(7));assert(!other.visited.has(99));assert.notEqual(castle.walls[0],other.walls[0]);
console.log('Site definitions: immutable catalogs, unchanged eligibility/order, shared spawn packs and isolated runtime mechanisms, furnishings, walls, chests, rewards and maze state passed.');
