import assert from 'node:assert/strict';
import { Game, WEAPON_BRANCHES } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { SUPER_SKILLS, getSuperSkillStats } from './dist/super-skills.js';
import { presentUpgrade, upgradeCardHTML } from './dist/upgrade-presentation.js';

let seed=572819;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function game(){const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});g.skillLevel=5;g.crystals=g.crystalsNext;g.status='upgrade';return g;}
function find(g,id){for(let i=0;i<1000;i++){g._choices=null;const c=g.getUpgradeChoices().find(c=>c.id===id);if(c)return c;}assert.fail(`missing real choice ${id}`);}
function after(row){return Number.parseFloat(row.after);}
const g=game(),seen=new Set();
const initial=JSON.stringify({levels:g.levels,player:g.player,branches:g.branches,crystals:g.crystals});
for(let i=0;i<150;i++){
  g._choices=null;
  for(const c of g.getUpgradeChoices()){
    const m=presentUpgrade(c,g),html=upgradeCardHTML(m);seen.add(c.id);
    assert(m.quality.name);assert(!html.includes('undefined')&&!html.includes('NaN'));
    assert.equal(m.category,['power','speed','magnet','vitality','regen'].includes(c.id)?'attribute':'skill');
    assert(m.category!=='attribute'||!m.levelLabel.includes('Lv.'),'attributes are not disguised as skill levels');
    assert(m.category!=='skill'||m.scope.includes('自动攻击')||m.scope.includes('飞矢'));
  }
}
assert.equal(seen.size,10);assert.equal(JSON.stringify({levels:g.levels,player:g.player,branches:g.branches,crystals:g.crystals}),initial,'presentation cannot award or modify progress');

// Compare the promise on a real choice with the result of paying for it.
for(const id of ['power','rapid','multishot','speed','magnet','vitality','regen']){
  const g=game();g.levels[id]=1;g.player.level=7;g.rescuePower=2;g._refreshStats();
  const c=find(g,id),m=presentUpgrade(c,g),cost=g.crystalsNext,before=g.crystals;assert(g.chooseUpgrade(c.id));assert.equal(g.crystals,before-cost);
  const actual={power:()=>100*(g._damageMultiplier()-1),rapid:()=>g.levels.rapid*15,multishot:()=>1+g.levels.multishot,speed:()=>100*(g.stats.moveSpeed-1),magnet:()=>g.stats.magnet,vitality:()=>g.player.maxHp,regen:()=>g.levels.regen*.8}[id]();
  assert(Math.abs(actual-after(m.rows[0]))<1e-7,`${id}: preview and actual reward agree`);
}
for(const id of ['orbit','pulse','lightning']){
  const g=game();g.levels[id]=2;const c=find(g,id),m=presentUpgrade(c,g);assert.equal(m.levelLabel,'Lv.2 → 3');assert(g.chooseUpgrade(c.id));
  const e=g._spawnEnemy('slime');Object.assign(e,{x:id==='orbit'?82:40,y:0,hp:10000,maxHp:10000,orbitHit:0});g.enemies=[e];g._clock=0;g._pulse=0;g._lightning=0;g._rebuildGrid();g._updateWeapons(0);
  assert.equal(10000-e.hp,after(m.rows[0]),`${id}: displayed base damage equals actual attack`);
}
for(const [weapon,branches] of Object.entries(WEAPON_BRANCHES))for(const c of branches){
  const g=game();g.levels[weapon==='arrow'?'rapid':weapon]=weapon==='arrow'?3:4;
  const m=presentUpgrade(c,g);assert.equal(m.action,'分支');assert(m.note.includes('本局固定'));assert(!upgradeCardHTML(m).includes('NaN'));
}
for(const def of SUPER_SKILLS){
  const g=game();for(let owned=0;owned<3;owned++){
    g.superSkills.owned[def.id]=owned;const c={...def,level:owned+1},m=presentUpgrade(c,g),stats=getSuperSkillStats(def.id,owned+1);
    assert.equal(m.category,'skill');assert.equal(m.action,owned?'升级':'新获得');assert.equal(after(m.rows[0]),def.id==='miasma'?stats.impactDamage:stats.damage);
    assert(!upgradeCardHTML(m).includes('undefined'));assert.equal(m.rarity,def.id==='meteor'||def.id==='vortex'?'legendary':def.id==='swords'||def.id==='runes'?'epic':'rare');
  }
}
const capped=game();Object.assign(capped.levels,{power:6,rapid:5,multishot:3,orbit:5,pulse:5,lightning:5,speed:4,magnet:4,vitality:5,regen:3});Object.assign(capped.branches,{arrow:'pierce',pulse:'echoes',lightning:'chain'});
for(const c of capped.getUpgradeChoices()){const m=presentUpgrade(c,capped);assert.equal(m.category,'attribute');assert(m.note.includes('无尽'));assert(!upgradeCardHTML(m).includes('NaN'));}
assert.equal(presentUpgrade({id:'super:resource',name:'满阶宝藏',desc:'领取资源',icon:'◆'},g).category,'resource');
assert(upgradeCardHTML({...presentUpgrade(find(g,'power'),g),name:'<script>bad</script>'}).includes('&lt;script&gt;'),'card strings are escaped');
console.log('Upgrade cards: actual mixed choices, non-mutating preview, honest paid-reward comparisons, branch/super labels and endless/resource cases passed.');
