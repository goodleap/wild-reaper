import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain} from './dist/terrain.js';
import {UPGRADE_DEFS,canTakeUpgrade,INITIAL_WEAPON_IDS,LEVEL_CAPS} from './dist/combat-catalog.js';
let seed=934821;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const arena=id=>new Game({initialWeaponId:id,terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
const related=(card,id)=>card.ownerId===id&&card.category==='weapon'||card.weaponId===id&&!!card.branch;
for(const id of INITIAL_WEAPON_IDS){
  const g=arena(id),slots=new Set();
  for(let i=0;i<100;i++){
    g._choices=null;const cards=g.getUpgradeChoices();
    assert.equal(cards.length,3);assert.equal(new Set(cards.map(c=>c.id)).size,3);
    assert(cards.some(c=>related(c,id)),`${id} is represented on every eligible panel`);
    assert.equal(g.getUpgradeChoices(),cards,'opening the same panel cannot reroll');
    cards.forEach((card,index)=>{if(related(card,id))slots.add(index);assert(canTakeUpgrade(g.build,card.id));});
  }
  assert(slots.size>1,'the primary weapon has no reserved card position');
  assert.equal(g.build.getWeapon(id).baseRank,1,'guaranteeing an offer grants no free ranks');
  g.levels.arrow=1;g.levels.orbit=1;g.levels.sword=1;g.levels.pulse=1;g.progressionTier=5;
  const seen=new Set();
  for(let i=0;i<1400;i++){g._choices=null;for(const c of g.getUpgradeChoices())seen.add(c.id);}
  for(const def of UPGRADE_DEFS.filter(d=>canTakeUpgrade(g.build,d.id)))assert(seen.has(def.id),`secondary option ${def.id} still appears for ${id}`);
  if(id==='orbit')g.levels.orbit=5;
  else if(id==='sword'){g.levels.sword=4;g._choices=null;assert.equal(g.getUpgradeChoices().filter(c=>c.weaponId===id&&c.branch).length,2);g.build.selectBranch('sword','sweep');}
  else {g.levels.rapid=3;g._choices=null;assert.equal(g.getUpgradeChoices().filter(c=>c.weaponId===id&&c.branch).length,2);g.build.selectBranch('arrow','pierce');}
  for(const def of UPGRADE_DEFS.filter(d=>d.ownerId===id&&d.category==='weapon'))g.levels[def.id]=LEVEL_CAPS[def.id];
  g._choices=null;assert(g.getUpgradeChoices().every(c=>!related(c,id)),'a capped primary leaves the slots available');
}
const branches=arena('arrow');branches.levels.sword=4;branches._choices=null;
let offers=branches.getUpgradeChoices();assert.equal(offers.filter(c=>c.branch).length,2);assert(offers.some(c=>related(c,'arrow')),'another weapon branch panel keeps a primary option');
branches.levels.rapid=3;branches._choices=null;offers=branches.getUpgradeChoices();
assert.equal(offers.filter(c=>c.branch&&c.weaponId==='arrow').length,2,'a ready primary branch offers both exclusive alternatives');
branches.crystals=branches.crystalsNext;branches.status='upgrade';const price=branches.crystalsNext;
assert(branches.chooseUpgrade(offers.find(c=>c.branch).id));assert.equal(branches.crystals,0);assert(price>0);assert.equal(branches.initialWeaponId,'arrow');
console.log('Primary weapon: every eligible offer, varied slots, secondary opportunities, branch pairs, capped fallback, cached choices and paid progression passed.');
