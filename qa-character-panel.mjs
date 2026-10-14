import assert from 'node:assert/strict';
import { armyPanelHTML } from './dist/army-panel.js';
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
assert.equal(value(panel('attributes'),'defense'),'8');
assert.equal(value(panel('attributes'),'damageReduction'),'7.41%');
assert.equal(value(panel('attributes'),'moveSpeed'),'220');
assert.equal(value(panel('attributes'),'damageBonus'),'+0%');
assert.equal(value(panel('attributes'),'magnet'),'105');
assert.match(panel('weapons'),/id="character-equip-sword"[^>]* disabled/,'last equipped weapon cannot be removed');
assert.equal(value(item(panel('skills'),'storm'),'damage'),'160');
assert.equal(value(item(panel('weapons'),'sword'),'damage'),'64');
assert.doesNotMatch(panel('weapons'),/data-capability-id="arrow"/,'arrows must be acquired before appearing');
assert.equal(characterPanelTitle(g),'帅气王子 · Lv.1');
assert.equal(panel('constructor'),panel('attributes'),'unknown tab safely returns attributes');

// A role upgrade affects all sources once, an arrow modifier stays local, and
// a timed buff is shown separately from the character's own attack attribute.
g.build.levels.arrow=1;g.build.levels.power=2;g.build.levels.arrowPower=2;g.build.levels.orbit=5;g.build.evolutions.orbit=true;
g.player.level=11;g.rescuePower=3;
g.adventure={furyTime:6,magnetTime:4,damageMultiplier:()=>1.35,fireRateMultiplier:()=>1.2,magnetRange:base=>Math.max(base,320)};
g.relics.owned=['bloodstone','swiftFeather'];g.relics.acquire('leafWard');g.player.hp=10;
g.environment={movementMultiplier:()=>.74};
g._refreshStats();g._refreshWeapons();
const attr=panel('attributes');
assert.equal(value(attr,'attack'),'58.88','attack includes role level, power and rescue; no external buff');
assert.equal(value(attr,'defense'),'18','role level contributes natural defense growth');
assert.equal(value(attr,'damageReduction'),'15.25%');
assert.equal(value(attr,'damageBonus'),'+68.75%','fury and low-health relic multiply');
assert.equal(value(attr,'moveSpeed'),'175.82','current movement includes feather and terrain');
assert.equal(value(attr,'magnet'),'320','timed pickup buff overrides base pickup range');
assert.equal(value(item(panel('weapons'),'arrow'),'damage'),'129.17','local arrow power and role/buff scale once');
assert.equal(value(item(panel('weapons'),'orbit'),'damage'),'130.41','arrow-only power does not leak to orbit');
assert.match(item(panel('weapons'),'orbit'),/每 0.5 秒 造成 19.56 伤害，持续 2 秒；单层刷新/,'bleed preview uses the source hit damage, including current buffs');
assert.equal(value(item(panel('weapons'),'orbit'),'range'),'74—129','base leveling does not inflate orbit radius');
assert.equal(value(item(panel('weapons'),'orbit'),'rotation'),'2.17 秒','rotation rate stays fixed while blades grow');
assert.equal(value(item(panel('weapons'),'orbit'),'contact'),'每枚每次接触一次');
assert.doesNotMatch(item(panel('weapons'),'orbit'),/同敌命中间隔|0.42 秒/);
assert.doesNotMatch(item(panel('weapons'),'arrow'),/同轮对同一目标/,'a single arrow does not need a multishot cap explanation');
g.build.levels.multishot=3;
assert.equal(value(item(panel('weapons'),'arrow'),'secondaryDamage'),'58.13','secondary arrow preview uses 45% of current main-arrow damage');
assert.match(item(panel('weapons'),'arrow'),/同轮对同一目标累计最多造成主箭伤害的 145%/);
assert.equal(value(item(panel('skills'),'storm'),'damage'),'496.8','storm has role and external scaling, no arrow modifier');
assert.doesNotMatch(panel('weapons'),/id="character-equip-sword"[^>]* disabled/,'two owned equipped weapons allow removal');
g.build.setEquipped('arrow',false);g.build.setEquipped('orbit',false);
assert.match(panel('weapons'),/data-capability-id="orbit"/,'unequipped acquired weapon remains inspectable');
assert.match(panel('weapons'),/id="character-equip-orbit"[^>]*data-equipped="false"/);
assert.match(panel('weapons'),/id="character-equip-sword"[^>]* disabled/);
g.status='upgrade';
assert.match(panel('weapons'),/id="character-equip-orbit"[^>]* disabled/,'reward modal cannot be bypassed by equipment');
g.status='playing';

// Super-skill ticks, initial burst, counts, focus and echoes need different
// labels: presenting all of these as unscaled generic damage is misleading.
g.build.awardDomain('erosion');g.build.superLevels.domain=2;g.build.superLevels.meteor=2;g.build.superLevels.swords=1;
g.build.levels.lightning=5;g.build.branches.lightning='focus';g.build.evolutions.lightning=true;
g.build.levels.pulse=5;g.build.branches.pulse='echoes';g.build.evolutions.pulse=true;
const skills=panel('skills');
assert.equal(value(item(skills,'barrier'),'capacity'),'44.85','barrier preview includes current health and the relic modifier');
assert.equal(value(item(skills,'barrier'),'cooldown'),'12.75 秒');
assert.match(skills,/就绪待命/);
assert.doesNotMatch(item(skills,'barrier'),/data-stat="damage"/,'automatic protection does not pretend to deal damage');
assert.equal(value(item(skills,'domain'),'damage'),'96.26');
assert.equal(value(item(skills,'domain'),'impactDamage'),'124.2');
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
assert.match(state,/营救援助/);assert.match(state,/铁叶护符/);assert.match(state,/24/);
assert.match(state,/军团 1 位伙伴/);const army=armyPanelHTML(g);assert.match(army,/守护脉冲/);
assert.doesNotMatch(state,/<img/,'names are escaped before HTML insertion');
assert.match(army,/&lt;img src=x onerror=bad\(\)&gt;/);assert.doesNotMatch(army,/<img/);
const before=snapshot();for(const tab of ['attributes','weapons','skills','status'])panel(tab);
assert.equal(snapshot(),before,'rendering progressed states remains read-only');

// Defense sources remain inspectable without adding another top-level stat or
// exposing attribute investments as skill levels. Every source appears once.
const defensive=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,settlements:false,companions:false});
defensive.player.level=21;defensive.build.attributes.defense=7;
defensive.levels.toughness=5;defensive.levels.endlessToughness=3;defensive._refreshStats();
const defenseSnapshot=JSON.stringify({build:defensive.build.serialize(),player:defensive.player,events:defensive.events});
const defenseHTML=characterPanelHTML(defensive,'attributes');
assert.equal(value(defenseHTML,'defense'),'165','base, level, ordinary and endless defense add once');
assert.equal(value(defenseHTML,'damageReduction'),'62.26%');
for(const text of ['帅气王子：角色初始防御 +8','基础防御 +7','角色等级：最大生命 +40 · 防御 +20','坚韧 ×5：防御 +100','百炼坚韧 ×3：防御 +30'])assert.equal(defenseHTML.split(text).length-1,1,`source is included exactly once: ${text}`);
assert.match(defenseHTML,/<details class="character-source"><summary>防御、生命与其他来源<\/summary>/,'defense breakdown is folded with other attribute sources');
assert.doesNotMatch(characterPanelHTML(defensive,'skills'),/坚韧/,'defense investments do not create skills');
assert.equal(JSON.stringify({build:defensive.build.serialize(),player:defensive.player,events:defensive.events}),defenseSnapshot,'defense inspection does not alter combat state');
defensive.player.invuln=0;defensive.player.hp=defensive.player.maxHp;
const hp=defensive.player.hp;defensive._hurtPlayer(40);
assert.equal(`${Number(((1-(hp-defensive.player.hp)/40)*100).toFixed(2))}%`,value(defenseHTML,'damageReduction'),'inspector reduction agrees with actual damage');
const energyGame=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,settlements:false,companions:false});
energyGame.levels.sword=3;energyGame.levels.swordEnergy=2;energyGame._refreshWeapons();
const energySnapshot=JSON.stringify(energyGame.build.serialize()),energyPanel=characterPanelHTML(energyGame,'weapons'),energySword=item(energyPanel,'sword');
assert.equal(value(energySword,'swordEnergyRank'),'2 / 3');
assert.equal(value(energySword,'swordEnergyBonus'),'+14%');
assert.equal(value(energySword,'range'),'100','melee reach remains distinct from flying energy');
assert.equal(value(energySword,'swordEnergyRange'),'180');
assert.equal(value(energySword,'swordEnergyCount'),'3 道');
assert.equal(value(energySword,'swordEnergyDamage'),'76.61');
assert.match(energySword,/向前分散飞行/);
assert.match(energySword,/每个目标最多命中一次/);
assert.doesNotMatch(energySword,/NaN|undefined|随挥剑扩大/);
assert.doesNotMatch(characterPanelHTML(energyGame,'skills'),/剑气/,'sword energy remains under its weapon');
assert.equal(JSON.stringify(energyGame.build.serialize()),energySnapshot,'opening energy details does not alter rank');
console.log('Character panel: effective stats, source isolation, super skills, equipment guards, safe rendering passed.');
