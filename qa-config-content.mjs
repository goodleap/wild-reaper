import assert from 'node:assert/strict';
import { getConfigSnapshot,loadContentConfig,getConfigLoadStatus } from './dist/content-config.js';
import { validateContent } from './dist/config-validation/content.js';

// This process chooses a fetched pack before importing any runtime catalogue.
// Distinct values prove that real actions consume loaded configuration rather
// than parallel hard-coded defaults. No network or persistent player save used.
const original=structuredClone(getConfigSnapshot()),pack=structuredClone(original),s=pack.sections;
for(const change of [
  value=>value.companions.definitions[0].kind='unknown-script',
  value=>value.companions.skills.stormcaller.cooldown=0,
  value=>value.economy.shop.items[0].price=-1,
  value=>value.sites.relicSiteDefinitions[0].type='unknown-site',
  value=>value.codex.locations[0].feature='{WORLD_SITE_FEATURES.missing.reward.gold}',
  value=>value.codex.weaponSkills[0].ownerId='missing-weapon',
  value=>value.sites.angelRules.guardRadius++
]){const invalid=structuredClone(original.sections);change(invalid);assert.throws(()=>validateContent(invalid),/Invalid content configuration/);}
s.economy.shop.items.find(item=>item.id==='heal').price=13;
s.economy.shop.items.find(item=>item.id==='heal').healing=37;
s.economy.pickups.herbHealing=28;
s.economy.treasure.reward={gold:19,crystals:37};
s.economy.relicRules.thunderReduction=.4;
s.companions.skills.stormcaller.damage=119;
s.companions.skills.stormcaller.cooldown=4.1;
s.companions.definitions.find(def=>def.id==='stormcaller').upkeep=2;
s.sites.angelRules.damage=121;
s.sites.angelRules.guardRadius=s.sites.angelRules.auraRadius=s.sites.angelRules.attackRange=154;
s.encounters.eventRules.hunt.relicGoal=25;
s.encounters.eventRules.rewards.relicHunt={...s.encounters.eventRules.rewards.relicHunt,gold:19,crystals:73};
s.codex.equipment.sword.description='配置中的长剑说明';
pack.contentVersion='qa-content-overrides';
await loadContentConfig({url:'https://config.invalid/test',fetchImpl:async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(pack)})});
assert.equal(getConfigLoadStatus().source,'remote');assert.equal(getConfigLoadStatus().fallback,false);
const [{Game},{Terrain},{relicInteraction},{RELIC_SITE_TYPES},{ARCHIVE_ENTRIES},{RELICS},{Adventure}]=await Promise.all([
  import('./dist/engine.js'),import('./dist/terrain.js'),import('./dist/sites/relic-content.js'),import('./dist/site-definitions.js'),import('./dist/archive-catalog.js'),import('./dist/relics.js'),import('./dist/adventure.js')
]);
function arena(){const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});g.enemies=[];g.gems=[];g.coins=[];g.events=[];g.effects=[];g.player.xpNext=g.crystalsNext=Infinity;g.adventure=new Adventure(g,{generation:false});return g;}
const shop=arena();shop.gold=100;shop.player.hp=30;shop.status='shop';shop.settlements.activeShop={id:'shop:test',state:'ready',stock:{heal:1},relicId:null};
const medicine=shop.settlements.getShopItems().find(item=>item.id==='heal');
assert.equal(medicine.price,13);assert.equal(medicine.desc,'立即恢复 37 点生命');assert(shop.settlements.buy('heal'));
assert.equal(shop.player.hp,67);assert.equal(shop.gold,87);assert.equal(shop.status,'playing');
const herb=shop.adventure.dropPickup('herb',0,0);assert(herb);assert(shop.adventure._collect(herb));assert.equal(shop.player.hp,95);
shop.adventure.treasure={id:'treasure:test',state:'unlocked',x:0,y:0};shop.adventure._openTreasure();assert.equal(shop.gold,106);assert.equal(shop.crystals,37);
const companionGame=arena(),member=companionGame.companions.recruit('stormcaller',{x:0,y:19.8});assert(member);assert.equal(companionGame.companions.upkeep,2);
const enemy=companionGame._spawnEnemy('slime');Object.assign(enemy,{x:100,y:0,hp:1000,maxHp:1000,speed:0});companionGame._rebuildGrid();
assert(companionGame.companions._castLightning(member));assert.equal(enemy.hp,881);assert.equal(member._attack,4.1);
const angelGame=arena();angelGame.settlements.sites=[{id:'angel:test',type:'angel',x:0,y:0,_attack:0}];
const threat=angelGame._spawnEnemy('slime');Object.assign(threat,{x:100,y:0,hp:1000,maxHp:1000,speed:0});angelGame.settlements._updateAngels(.025,{x:0,y:19.8});assert.equal(threat.hp,879);
assert.equal(RELIC_SITE_TYPES.hunt.goal,25);assert.equal(relicInteraction({game:angelGame},{state:'ready',type:'hunt'}).description,'击败 25 名遗迹守卫 · 73 灵晶 / 19 金币');
assert.equal(ARCHIVE_ENTRIES.find(entry=>entry.id==='weapon:sword').description,'配置中的长剑说明');
assert(RELICS.find(relic=>relic.id==='thunderstone').desc.includes('0.4 秒；每秒最多减少 1.6 秒'));
assert(RELICS.find(relic=>relic.id==='deepRoot').desc.includes('从 28 点增加至 39.2 点'));
assert(Object.isFrozen(getConfigSnapshot().sections.companions.skills));
console.log('Content config: invalid behaviors/references rejected; fetched shop prices/healing, pickups, rewards, companion damage/cooldown/wages, angel attack, hunt goals and codex descriptions drive real runtime behavior.');
