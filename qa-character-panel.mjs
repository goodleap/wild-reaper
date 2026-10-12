import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { characterPanelHTML, characterPanelTitle } from './dist/character-panel.js';

const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,settlements:false,companions:false});
const value=(html,id)=>html.match(new RegExp(`data-stat="${id}"><dt>[^<]*</dt><dd>([^<]*)</dd>`))?.[1];
const item=(html,id)=>html.match(new RegExp(`data-capability-id="${id}">([\\s\\S]*?)</article>`))?.[1];
const panel=tab=>characterPanelHTML(g,tab);
const snapshot=()=>JSON.stringify({build:g.build.serialize(),player:g.player,events:g.events,enemies:g.enemies,gold:g.gold,crystals:g.crystals,status:g.status});

const start=snapshot();
for(const tab of ['attributes','weapons','skills','status'])assert.doesNotMatch(panel(tab),/NaN|undefined/);
assert.equal(snapshot(),start,'opening all tabs does not mutate game state or awaken targets');
assert.equal(value(panel('attributes'),'attack'),'32');
assert.equal(value(panel('attributes'),'moveSpeed'),'220');
assert.equal(value(panel('attributes'),'damageBonus'),'+0%');
assert.equal(value(panel('attributes'),'magnet'),'105');
assert.match(panel('weapons'),/id="character-equip-arrow"[^>]* disabled/,'last equipped weapon cannot be removed');
assert.equal(value(item(panel('skills'),'storm'),'damage'),'160');
assert.equal(characterPanelTitle(g),'旅人 · Lv.1');
assert.equal(panel('constructor'),panel('attributes'),'unknown tab safely returns attributes');

// A role upgrade affects all sources once, an arrow modifier stays local, and
// a timed buff is shown separately from the character's own attack attribute.
g.build.levels.power=2;g.build.levels.arrowPower=2;g.build.levels.orbit=5;g.build.evolutions.orbit=true;
g.player.level=11;g.rescuePower=3;
g.adventure={furyTime:6,magnetTime:4,damageMultiplier:()=>1.35,fireRateMultiplier:()=>1.2,magnetRange:base=>Math.max(base,320)};
g.relics.owned=['bloodstone','swiftFeather','leafWard'];g.player.hp=10;g.relics.shieldReady=true;
g.environment={movementMultiplier:()=>.74};
g._refreshStats();g._refreshWeapons();
const attr=panel('attributes');
assert.equal(value(attr,'attack'),'58.88','attack includes role level, power and rescue; no external buff');
assert.equal(value(attr,'damageBonus'),'+68.75%','fury and low-health relic multiply');
assert.equal(value(attr,'moveSpeed'),'175.82','current movement includes feather and terrain');
assert.equal(value(attr,'magnet'),'320','timed pickup buff overrides base pickup range');
assert.equal(value(item(panel('weapons'),'arrow'),'damage'),'129.17','local arrow power and role/buff scale once');
assert.equal(value(item(panel('weapons'),'orbit'),'damage'),'167.67','arrow-only power does not leak to orbit');
assert.equal(value(item(panel('skills'),'storm'),'damage'),'496.8','storm has role and external scaling, no arrow modifier');
assert.doesNotMatch(panel('weapons'),/id="character-equip-arrow"[^>]* disabled/,'two owned equipped weapons allow removal');
g.build.setEquipped('orbit',false);
assert.match(panel('weapons'),/data-capability-id="orbit"/,'unequipped acquired weapon remains inspectable');
assert.match(panel('weapons'),/id="character-equip-orbit"[^>]*data-equipped="false"/);
assert.match(panel('weapons'),/id="character-equip-arrow"[^>]* disabled/);
g.status='upgrade';
assert.match(panel('weapons'),/id="character-equip-orbit"[^>]* disabled/,'reward modal cannot be bypassed by equipment');
g.status='playing';

// Super-skill ticks, initial burst, counts, focus and echoes need different
// labels: presenting all of these as unscaled generic damage is misleading.
g.build.superLevels.miasma=2;g.build.superLevels.meteor=2;g.build.superLevels.swords=1;
g.build.levels.lightning=5;g.build.branches.lightning='focus';g.build.evolutions.lightning=true;
g.build.levels.pulse=5;g.build.branches.pulse='echoes';g.build.evolutions.pulse=true;
const skills=panel('skills');
assert.equal(value(item(skills,'miasma'),'damage'),'96.26');
assert.equal(value(item(skills,'miasma'),'impactDamage'),'124.2');
assert.equal(value(item(skills,'meteor'),'damage'),'574.43');
assert.equal(value(item(skills,'meteor'),'count'),'3');
assert.equal(value(item(skills,'swords'),'count'),'4');
assert.equal(value(item(skills,'lightning'),'damage'),'683.1');
assert.equal(value(item(skills,'lightning'),'targetLimit'),'1');
assert.equal(value(item(skills,'pulse'),'echoDamage'),'167.67');

g.companions.active={name:'<img src=x onerror=bad()>',kind:'warden',remaining:12};
g.relics.wardAmount=24;
const state=panel('status');
assert.match(state,/狂暴/);assert.match(state,/磁力涌动/);assert.match(state,/地形减速/);
assert.match(state,/营救援助/);assert.match(state,/铁叶护罩/);assert.match(state,/24/);
assert.match(state,/高级地震/);assert.match(state,/12 秒/);
assert.doesNotMatch(state,/<img/,'names are escaped before HTML insertion');
assert.match(state,/&lt;img src=x onerror=bad\(\)&gt;/);
const before=snapshot();for(const tab of ['attributes','weapons','skills','status'])panel(tab);
assert.equal(snapshot(),before,'rendering progressed states remains read-only');
console.log('Character panel: effective stats, source isolation, super skills, equipment guards, safe rendering passed.');
