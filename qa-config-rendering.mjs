import assert from 'node:assert/strict';
import { loadContentConfig,getConfigSnapshot,getConfigLoadStatus } from './dist/content-config.js';

// Text remains unrestricted data (including ordinary apostrophes), while each
// HTML boundary escapes it. The fixture is installed before catalogue imports.
const payload=`O'Brien & "Mage" <img src=x onerror=alert(1)>`;
const escaped='O&#39;Brien &amp; &quot;Mage&quot; &lt;img src=x onerror=alert(1)&gt;';
const pack=structuredClone(getConfigSnapshot());pack.contentVersion='qa-rendering';
for(const relic of pack.sections.economy.relics)for(const field of ['name','desc','icon'])relic[field]=payload;
for(const item of pack.sections.economy.shop.items)for(const field of ['name','description','reason','icon'])item[field]=payload;
for(const group of ['tabs','categories','worldCategories'])for(const item of pack.sections.codex[group])item.name=payload;
Object.assign(pack.sections.enemies.definitions.slime.codex,{name:payload,description:payload,advice:payload});
pack.sections.worlds.definitions[0].name=payload;pack.sections.heroes.definitions[0].name=payload;
Object.assign(pack.sections.codex.milestones[0],{name:payload,description:payload,target:2});
await loadContentConfig({url:'https://configuration.invalid/text',fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify(pack)})});
assert.equal(getConfigLoadStatus().fallback,false,getConfigLoadStatus().reason);
const [{archivePanelHTML,archiveMilestones},{worldArchiveHTML},{presentUpgrade,upgradeCardHTML},{getUpgradeDefinition},{harness}]=await Promise.all([
  import('./dist/archive-panel.js'),import('./dist/world-archive.js'),import('./dist/upgrade-presentation.js'),import('./dist/combat-catalog.js'),import('./qa-app-harness.mjs')
]);
const safe=(html,label)=>{assert(html.includes(escaped),`${label}: text is preserved through escaping`);assert(!html.includes('<img'),`${label}: data never creates an element`);assert(!html.includes('"Mage"'),`${label}: quotes cannot break an attribute`);};
safe(archivePanelHTML({entries:{'enemy:slime':{seen:true,defeats:1}}},{tab:'codex',category:'enemies',selectedId:'enemy:slime'}),'codex detail/category/tab');
safe(worldArchiveHTML(),'world category/detail');
safe(archivePanelHTML({totals:{kills:1}},{tab:'milestones'}),'milestone name/description');
const milestone=archiveMilestones({totals:{kills:1}})[0];assert.equal(milestone.target,2);assert.equal(milestone.progress,1);assert.equal(milestone.complete,false,'configured threshold uses the fixed statistics resolver');
const h=harness();h.nodes['start-button'].onclick();assert.equal(h.nodes['hero-selection-name'].textContent,payload,'textContent preserves ordinary apostrophes and literal markup');
h.nodes['prepare-start-button'].onclick();await h.flush();
h.run('game.relics.offer();game.status="relic";openRelics();');
for(const card of h.nodes['relic-cards'].children)safe(card.innerHTML,'relic card');
h.run('game.status="playing";game.relics.acquire("thunderstone");updateRelicHUD();');safe(h.nodes['relic-loadout'].innerHTML,'relic HUD attributes');
h.run('game.status="shop";game.gold=100;game.settlements.activeShop={id:"qa-shop",stock:{heal:1,magnet:1,fury:1,shield:1,relic:0},state:"ready"};openShop(true);');
for(const card of h.nodes['shop-items'].children)safe(card.innerHTML,'shop name/description/icon/reason');
const game=h.run('game'),choice={...getUpgradeDefinition('sword'),name:payload,desc:payload,icon:payload};
safe(upgradeCardHTML(presentUpgrade(choice,game)),'upgrade card');
assert.equal(h.document.querySelectorAll('img').length,0,'real shipped handlers add no injected image nodes (VM parser)');
console.log('Configuration text: apostrophes/quotes/markup remain data across relic cards/HUD, shop, upgrade and codex/world HTML boundaries (VM DOM; no browser claim).');
