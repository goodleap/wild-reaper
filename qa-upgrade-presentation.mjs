import assert from 'node:assert/strict';
import { LEVEL_CAPS, UPGRADE_DEFS, getUpgradeDefinition, canTakeUpgrade } from './dist/combat-catalog.js';
import { Game, WEAPON_BRANCHES } from './dist/engine.js';
import { resolveCharacterStats, weaponStats, skillStats } from './dist/combat-stats.js';
import { Terrain } from './dist/terrain.js';
import { SUPER_SKILLS, getSuperSkillStats } from './dist/super-skills.js';
import { presentUpgrade, upgradeCardHTML } from './dist/upgrade-presentation.js';

let seed=572819;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function game(){const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});g.skillLevel=5;g.crystals=g.crystalsNext;g.status='upgrade';return g;}
function find(g,id){for(let i=0;i<1000;i++){g._choices=null;const c=g.getUpgradeChoices().find(c=>c.id===id);if(c)return c;}assert.fail(`missing real choice ${id}`);}
function after(row){return Number.parseFloat(row.after);}
const g=game(),seen=new Set(),examplesForNew=[];
const initial=JSON.stringify({levels:g.levels,player:g.player,branches:g.branches,crystals:g.crystals});
for(let i=0;i<150;i++){
  g._choices=null;
  for(const c of g.getUpgradeChoices()){
    const m=presentUpgrade(c,g),html=upgradeCardHTML(m);seen.add(c.id);
    assert(m.quality.name);assert(!html.includes('undefined')&&!html.includes('NaN'));
    assert(m.summary,'every choice has a merged effect sentence');
    assert(html.includes('choice-summary'));
    assert(!/choice-(stats|stat|description|note|scope)/.test(html),'remove repeated description and individual stat table from visible cards');
    assert.equal(m.category,getUpgradeDefinition(c.id).category);
    assert(m.category!=='attribute'||!m.levelLabel.includes('Lv.'),'attributes are not disguised as skill levels');
    assert(m.category!=='skill'||['automatic','manual'].includes(m.activation));
  }
}
assert.deepEqual([...seen].sort(),UPGRADE_DEFS.filter(def=>canTakeUpgrade(g.build,def.id)).map(def=>def.id).sort(),'real cards cover all currently eligible ordinary upgrades');
assert.equal(JSON.stringify({levels:g.levels,player:g.player,branches:g.branches,crystals:g.crystals}),initial,'presentation cannot award or modify progress');

// Compare the promise on a real choice with the result of paying for it.
for(const id of ['power','rapid','multishot','speed','magnet','vitality','toughness','regen']){
  const g=game();if(['rapid','multishot'].includes(id))g.levels.arrow=1;g.levels[id]=1;g.player.level=7;g.rescuePower=2;g._refreshStats();
  const c=find(g,id),m=presentUpgrade(c,g),cost=g.crystalsNext,before=g.crystals;assert(g.chooseUpgrade(c.id));assert.equal(g.crystals,before-cost);
  const actual={power:()=>resolveCharacterStats(g).attack,rapid:()=>g.levels.rapid*15,multishot:()=>1+g.levels.multishot,speed:()=>g.player.speed,magnet:()=>g.stats.magnet,vitality:()=>g.player.maxHp,toughness:()=>resolveCharacterStats(g).defense,regen:()=>g.levels.regen*.8}[id]();
  assert(Math.abs(actual-after(m.rows[0]))<1e-7,`${id}: preview and actual reward agree`);
}
for(const id of ['orbit','pulse','lightning']){
  const g=game();g.levels[id]=2;const c=find(g,id),m=presentUpgrade(c,g);assert.equal(m.levelLabel,'Lv.2 → 3');assert(g.chooseUpgrade(c.id));
  const e=g._spawnEnemy('slime');Object.assign(e,{x:id==='orbit'?82:40,y:0,hp:10000,maxHp:10000});g.enemies=[e];g._clock=0;g._pulse=0;g._lightning=0;g._rebuildGrid();g._updateWeapons(0);
  if(id==='orbit'){
    assert.deepEqual(m.rows.map(row=>row.label),['基础伤害','环绕利刃'],'the third orbit level advertises damage and the extra blade');
    assert.equal(after(m.rows[1]),weaponStats(g,'orbit').count);
    assert.equal(10000-e.hp,weaponStats(g,'orbit').baseDamage,'per-hit damage matches the previewed increase');
  }else assert.equal(10000-e.hp,after(m.rows[0]),`${id}: displayed base damage equals actual attack`);
}
for(const owned of [0,1,2,3,4]){
  const current=game();current.levels.orbit=owned;
  const choice=find(current,'orbit'),model=presentUpgrade(choice,current);
  const expected=[['基础伤害','环绕利刃','环绕半径'],['基础伤害','环绕利刃'],['基础伤害','环绕利刃'],['基础伤害','环绕利刃'],['基础伤害','环绕利刃','新增效果']][owned];
  assert.deepEqual(model.rows.map(row=>row.label),expected,'orbit upgrades list only new or changed effects');
  if(owned===2){assert.match(model.summary,/伤害/);assert.doesNotMatch(model.summary,/半径/,'damage growth does not imply radius growth');}
  if(owned===4)assert.match(model.summary,/每 3 秒扩张收拢/,'the fifth level clearly adds the existing evolution');
  assert(current.chooseUpgrade(choice.id));
  const actual=weaponStats(current,'orbit');
  for(const row of model.rows){
    if(row.label==='基础伤害')assert.equal(after(row),actual.baseDamage);
    if(row.label==='环绕利刃')assert.equal(after(row),actual.count);
    if(row.label==='环绕半径')assert.equal(after(row),actual.radius);
  }
}
{
  const current=game();current.levels.arrow=1;
  const model=presentUpgrade(find(current,'multishot'),current);
  assert.equal(model.rows[1].after,'100% / 45%');
  assert.match(model.summary,/副箭为 45% 伤害/);assert.doesNotMatch(model.summary,/60%/);
}
for(const [weapon,branches] of Object.entries(WEAPON_BRANCHES).filter(([id])=>id!=='domain'))for(const c of branches){
  const g=game();if(weapon==='arrow')g.levels.arrow=1;g.levels[weapon==='arrow'?'rapid':weapon]=weapon==='arrow'?3:4;
  const m=presentUpgrade(c,g);assert.equal(m.action,'分支');assert(m.note.includes('本局固定'));assert(!upgradeCardHTML(m).includes('本局固定'),'exclusive-branch explanation is shared by the panel');assert(!upgradeCardHTML(m).includes('NaN'));
}
for(const def of SUPER_SKILLS){
  const g=game();for(let owned=0;owned<3;owned++){
    g.superSkills.owned[def.id]=owned;const c={...def,level:owned+1},m=presentUpgrade(c,g),stats=getSuperSkillStats(def.id,owned+1);
    assert.equal(m.category,'skill');assert.equal(m.action,owned?'升级':'新获得');assert.equal(after(m.rows[0]),def.id==='domain'?stats.impactDamage:stats.damage);
    assert(!upgradeCardHTML(m).includes('undefined'));assert(m.summary.includes(String(def.id==='domain'?stats.impactDamage:stats.damage)),'super summary uses current combat values');assert.equal(m.rarity,def.id==='meteor'||def.id==='vortex'?'legendary':def.id==='swords'||def.id==='domain'?'epic':'rare');
  }
}
const capped=game();Object.assign(capped.levels,LEVEL_CAPS);Object.assign(capped.branches,{sword:'sweep',arrow:'pierce',pulse:'echoes',lightning:'chain'});
for(const c of capped.getUpgradeChoices()){const m=presentUpgrade(c,capped);assert.equal(m.category,'attribute');assert(m.note.includes('无尽'));assert(!upgradeCardHTML(m).includes('NaN'));}

// Defensive cards preview the real current total, including character levels
// and prior investments. Reading a card is free; buying it changes damage.
for(const id of ['toughness','endlessToughness']) {
  const current=game();current.player.level=21;
  if(id==='endlessToughness') {
    Object.assign(current.levels,LEVEL_CAPS);
    Object.assign(current.branches,{sword:'sweep',arrow:'pierce',pulse:'echoes',lightning:'chain'});
  }else current.levels.toughness=1;
  current._refreshStats();
  const choice=find(current,id),beforeDefense=resolveCharacterStats(current).defense;
  const snapshot=JSON.stringify({build:current.build.serialize(),player:current.player,crystals:current.crystals,events:current.events});
  const model=presentUpgrade(choice,current),html=upgradeCardHTML(model);
  assert.equal(JSON.stringify({build:current.build.serialize(),player:current.player,crystals:current.crystals,events:current.events}),snapshot,'defense preview does not change ranks, health, events or resources');
  assert.equal(model.category,'attribute');assert.equal(model.action,'加强');
  assert.equal(model.scope,'角色属性 · 受到伤害降低');
  assert.doesNotMatch(html,/choice-new|Lv\./,'defense is an attribute investment, not a newly acquired skill');
  assert.equal(Number(model.rows[0].before),beforeDefense);
  if(id==='toughness')assert.equal(model.summary,'防御 +20，减伤 28.57%→37.5%。');
  else assert.match(model.summary,/防御 \+10/);
  const cost=current.crystalsNext,crystals=current.crystals;
  assert(current.chooseUpgrade(id));assert.equal(current.crystals,crystals-cost);
  assert.equal(resolveCharacterStats(current).defense,after(model.rows[0]));
  current.player.invuln=0;current.player.hp=current.player.maxHp;current.barrier.cooldown=1;
  const hp=current.player.hp;current._hurtPlayer(40);
  const actualReduction=(1-(hp-current.player.hp)/40)*100;
  assert.equal(Number(actualReduction.toFixed(2)),after(model.rows[1]),'displayed reduction matches actual incoming damage after payment');
}
// Newly acquired weapons, reactive protection, and weapon-bound boss rewards
// must keep their distinct category and quote the exact paid result.
for(const id of ['arrow','barrier']){
  const current=game(),choice=find(current,id),model=presentUpgrade(choice,current);
  assert.equal(model.action,'新获得');assert.match(upgradeCardHTML(model),/choice-new/);
  assert.equal(model.category,id==='arrow'?'weapon':'skill');
  assert(current.chooseUpgrade(id));
  const actual=id==='arrow'?weaponStats(current,id).baseDamage:skillStats(current,id).capacity;
  assert.equal(after(model.rows[0]),actual,'acquisition previews the actual granted ability');
}
for(const branch of ['binding','erosion']){
  const current=game();current.status='playing';current.superSkills.offer('region','forest');
  const choice=current.superSkills.getChoices().find(c=>c.domainBranch===branch);assert(choice);
  const before=current.build.serialize(),model=presentUpgrade(choice,current);
  assert.deepEqual(current.build.serialize(),before,'domain cards do not choose a branch while rendering');
  assert.equal(model.action,'新获得');assert.equal(model.category,'skill');
  current.status='super';assert(current.superSkills.choose(choice.id));
  const actual=getSuperSkillStats('domain',1,branch);
  assert.equal(after(model.rows[0]),actual.impactDamage);assert.equal(after(model.rows[1]),actual.damage);
  assert.equal(current.build.getSkill('domain').branch,branch);
  examplesForNew.push(model);
}
for(const existing of [false,true]){
  const current=game();if(existing){current.build.awardRuneArrow();current.levels.arrowPower=2;}
  current.status='playing';current.superSkills.offer('region','ruins');
  const choice=current.superSkills.getChoices().find(c=>c.id==='runeArrow'),model=presentUpgrade(choice,current);
  assert.equal(model.category,'weapon');assert.equal(model.tier,'super');assert.equal(model.action,existing?'升级':'新获得');
  current.status='super';assert(current.superSkills.choose(choice.id));
  assert.equal(after(model.rows[0]),weaponStats(current,'arrow').runicBaseDamage);
  assert.equal(after(model.rows[1]),Number(weaponStats(current,'arrow').runicInterval.toFixed(2)));
  assert.equal(current.build.getSkill('runes'),null,'runes are not an independent skill');
  examplesForNew.push(model);
}
for(const [id,owner,branch] of [['swordMastery','sword','heavy'],['pulseMastery','pulse','echoes'],['lightningMastery','lightning','chain']]){
  const current=game();current.levels[owner]=5;current.branches[owner]=branch;current._refreshWeapons();
  const choice=find(current,id),model=presentUpgrade(choice,current);assert(current.chooseUpgrade(id));
  const actual=owner==='sword'?weaponStats(current,owner):skillStats(current,owner);
  assert.equal(after(model.rows[0]),Number((actual.primaryBaseDamage??actual.baseDamage).toFixed(2)));
  assert.equal(after(model.rows[1]),Number((actual.cooldown??actual.interval).toFixed(2)));
  assert.match(model.summary,/间隔/,'mastery cards explain cadence as well as damage');examplesForNew.push(model);
}
// Sword energy is acquired on the weapon, so its first card is NEW even
// though the innate sword is already owned. The tier and range match payment.
for(const branch of [null,'sweep','heavy'])for(const owned of [0,1,2]){
  const current=game();current.levels.sword=branch?5:3;if(branch)current.branches.sword=branch;
  current.levels.swordEnergy=owned;current._refreshWeapons();
  const choice=find(current,'swordEnergy'),before=current.build.serialize();
  const model=presentUpgrade(choice,current),html=upgradeCardHTML(model);
  assert.deepEqual(current.build.serialize(),before,'sword-energy preview remains read-only');
  assert.equal(model.category,'weapon');assert.equal(model.ownerId,'sword');
  assert.equal(model.action,owned?'升级':'新获得');assert.equal(html.includes('choice-new'),!owned);
  assert.equal(model.weaponAbility,true);assert.match(html,/武器专属能力/);
  assert.doesNotMatch(html,/获得武器|超级/,'energy is a regular weapon upgrade, not a new weapon or boss skill');
  if(!owned)assert.match(html,/获得能力/);
  const baseRank=current.build.getWeapon('sword').baseRank,skillIds=current.build.getSkillLoadout().map(item=>item.id);
  assert(current.chooseUpgrade('swordEnergy'));
  const actual=weaponStats(current,'sword');
  assert.equal(after(model.rows[0]),Number(actual.baseDamage.toFixed(2)));
  assert.equal(after(model.rows[1]),actual.range);
  assert.match(model.summary,new RegExp(`${actual.energyCount} 道飞行剑气`));
  assert.equal(current.build.getWeapon('sword').baseRank,baseRank,'energy rank does not disguise an extra sword base level');
  assert.deepEqual(current.build.getSkillLoadout().map(item=>item.id),skillIds,'energy does not create a skill slot');
  examplesForNew.push(model);
}
assert.equal(presentUpgrade({id:'super:resource',name:'满阶宝藏',desc:'领取资源',icon:'◆'},g).category,'resource');
assert(upgradeCardHTML({...presentUpgrade(find(g,'power'),g),name:'<script>bad</script>'}).includes('&lt;script&gt;'),'card strings are escaped');
// At a 320px arena: overlay 20px + card padding/borders 22px leave
// 278px for 12px body copy. Conservatively count every CJK glyph as 12px,
// ASCII as 7px. Even the longest real choice has room for two full lines.
// This is a source/text fit guard, not a browser layout claim.
const width=text=>[...text].reduce((total,ch)=>total+(/[\x00-\x7f]/.test(ch)?7:12),0);
const examples=[...examplesForNew];
for(const id of seen){
  for(const owned of [0,1,2,3,4]){
    const current=game();if(id==='sword'&&owned===0)continue;current.levels[id]=owned;if(!canTakeUpgrade(current.build,id))continue;
    const c=find(game(),id),model=presentUpgrade({...c,evolves:id==='orbit'&&owned===4},current);examples.push(model);
  }
}
for(const [id,branches] of Object.entries(WEAPON_BRANCHES).filter(([id])=>id!=='domain')){const current=game();if(id==='arrow'){current.levels.arrow=1;current.levels.rapid=3;}else current.levels[id]=4;for(const choice of branches)examples.push(presentUpgrade(choice,current));}
for(const choice of SUPER_SKILLS)for(const owned of [0,1,2]){const current=game();current.superSkills.owned[choice.id]=owned;examples.push(presentUpgrade(choice,current));}
for(const model of examples)assert(width(model.summary)<278*1.8,`${model.name}: condensed copy has two-line allowance without ellipsis`);
const pulse=game();pulse.levels.pulse=2;assert.equal(presentUpgrade(find(pulse,'pulse'),pulse).summary,'伤害 60→70，范围 148→156。');
assert(presentUpgrade(find(g,'power'),g).summary.includes('角色攻击力 32→40'));
assert(upgradeCardHTML({...presentUpgrade(find(g,'power'),g),summary:'<img onerror="bad()"> 25% \'safe\''}).includes('&lt;img onerror=&quot;bad()&quot;&gt; <b>25%</b> &#39;safe&#39;'),'summary emphasis must preserve HTML escaping');
console.log('Upgrade cards: actual mixed choices, non-mutating preview, honest paid-reward comparisons, branch/super labels and endless/resource cases passed.');
