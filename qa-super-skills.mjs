import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { SUPER_SKILLS, SUPER_RULES } from './dist/super-skills.js';
let seed=739151;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(terrain=new Terrain({obstacles:[]})){const g=new Game({terrain,adventure:false,encounters:false,environment:false,settlements:false});g.enemies=[];g.gems=[];g.coins=[];g.events=[];g.effects=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;g._updatePressure=()=>{};return g;}
function enemy(g,x=150,y=0,type='slime',hp=10000){const e=g._spawnEnemy(type);Object.assign(e,{x,y,hp,maxHp:hp,speed:0});return e;}
function advance(g,t){for(let left=t;left>1e-8;left-=.025)g.update(Math.min(.025,left));}
function acquire(g,id){const def=SUPER_SKILLS.find(s=>s.id===id);assert(g.superSkills.offer(def.source,def.regionId));g.status='super';assert(g.superSkills.choose(id));g.status='playing';return def;}
assert.equal(SUPER_SKILLS.length,6);assert.equal(new Set(SUPER_SKILLS.map(s=>s.id)).size,6);assert(SUPER_SKILLS.every(s=>s.automatic&&s.maxLevel===3));
const locked=arena();assert.deepEqual(locked.superSkills.getUpgradeChoices(),[]);assert.deepEqual(locked.getSuperChoices(),[]);
for(let i=0;i<50;i++){locked._choices=null;assert(!locked.getUpgradeChoices().some(c=>c.id.startsWith('super:')),'ordinary upgrade pool cannot unlock an unearned super');}
locked.status='upgrade';assert.equal(locked.superSkills.upgrade('super:meteor'),false);
locked.status='playing';assert(locked.superSkills.offer('region','marsh'));const offer=locked.getSuperChoices(),ids=offer.map(s=>s.id);
assert.equal(ids[0],'miasma');assert.equal(offer.length,3);assert(offer.every(s=>s.source==='region'));assert.equal(locked.superSkills.offer('castle'),false,'another reward cannot overwrite a pending offer');
for(let i=0;i<5;i++)assert.deepEqual(locked.getSuperChoices().map(s=>s.id),ids);
assert.equal(locked.superSkills.choose(ids[0]),false,'a reward cannot be claimed outside its modal');locked.status='super';assert.equal(locked.superSkills.choose('meteor'),false);assert.equal(locked.superSkills.choose('missing'),false);
assert(locked.superSkills.choose('miasma'));assert.equal(locked.superSkills.choose('miasma'),false);assert.equal(locked.superSkills.owned.miasma,1);assert.equal(locked.superSkills.getUpgradeChoices()[0].id,'super:miasma');
locked.status='playing';locked.crystalsNext=40;locked.crystals=40;locked.update(0);let card;
for(let i=0;i<80;i++){locked._choices=null;card=locked.getUpgradeChoices().find(c=>c.id==='super:miasma');if(card)break;}
assert(card);const oldCooldown=locked.superSkills.cooldowns.miasma;assert(locked.chooseUpgrade(card.id));assert.equal(locked.superSkills.owned.miasma,2);assert.equal(locked.crystals,0);assert.equal(locked.superSkills.cooldowns.miasma,oldCooldown,'reinforcement cannot instantly recast a cooling skill');
locked.status='upgrade';assert(locked.superSkills.upgrade('super:miasma'));assert.equal(locked.superSkills.owned.miasma,3);assert.equal(locked.superSkills.upgrade('super:miasma'),false);assert(!locked.superSkills.getUpgradeChoices().some(c=>c.skillId==='miasma'));
for(const source of ['region','castle']){const g=arena();for(const def of SUPER_SKILLS.filter(s=>s.source===source))for(let i=0;i<3;i++)acquire(g,def.id);assert(g.superSkills.offer(source));assert.deepEqual(g.getSuperChoices().map(c=>c.id),['super:resource']);g.status='super';assert(g.superSkills.choose('super:resource'));const expected=source==='castle'?SUPER_RULES.castleFallback:SUPER_RULES.regionFallback;assert.equal(g.gold,expected.gold);assert.equal(g.crystals,expected.crystals);assert.equal(g.superSkills.choose('super:resource'),false);assert.equal(g.gold,expected.gold);}

for(const def of SUPER_SKILLS){
 const g=arena();acquire(g,def.id);const target=enemy(g),hidden=enemy(g,1500);g.superSkills.cooldowns[def.id]=0;
 advance(g,1.65);assert(target.hp<10000,`${def.name} deals real automatically scheduled damage`);assert.equal(hidden.hp,10000,`${def.name} does not select hidden targets`);
 assert(!target.bleed&&!target.shock,'super damage cannot recursively borrow ordinary status procs');
 for(const state of ['paused','upgrade','shop','super','relic','dead']){g.status=state;const frozen=structuredClone({hp:target.hp,fields:g.superSkills.fields,volleys:g.superSkills._volleys,cooldowns:g.superSkills.cooldowns});advance(g,.5);g.superSkills.update(.05);assert.deepEqual({hp:target.hp,fields:g.superSkills.fields,volleys:g.superSkills._volleys,cooldowns:g.superSkills.cooldowns},frozen,`${state} freezes ${def.id}`);}
 const preserved=structuredClone({owned:g.superSkills.owned,cooldowns:g.superSkills.cooldowns});g.superSkills.clearScene();assert.equal(g.superSkills.fields.length,0);assert.equal(g.superSkills._volleys.length,0);assert.deepEqual({owned:g.superSkills.owned,cooldowns:g.superSkills.cooldowns},preserved,'scene cleanup preserves earned skills and cooldowns');
}
const rooted=arena();acquire(rooted,'thorns');const runner=enemy(rooted),boss=enemy(rooted,210,0,'boss');runner.speed=80;rooted.superSkills.cooldowns.thorns=0;rooted.update(.025);
assert.equal(rooted.superSkills.movementMultiplier(runner),0);assert.equal(rooted.superSkills.movementMultiplier(boss),1);const rootedX=runner.x;advance(rooted,.5);assert.equal(runner.x,rootedX,'rooting stops actual enemy navigation');advance(rooted,.55);assert.equal(rooted.superSkills.movementMultiplier(runner),1);
const meteor=arena();acquire(meteor,'meteor');const marked=enemy(meteor);meteor.superSkills.cooldowns.meteor=0;meteor.update(.025);assert(meteor.superSkills.fields.every(f=>f.stage==='warning'));advance(meteor,.65);assert.equal(marked.hp,10000,'star impact has a visible delay');advance(meteor,.4);assert(marked.hp<10000);
const swords=arena();acquire(swords,'swords');const small=enemy(swords,80),royal=enemy(swords,200,0,'boss');swords.superSkills.cooldowns.swords=0;advance(swords,.3);assert(royal.hp<10000);assert.equal(small.hp,10000,'royal swords prioritize the Boss');
const barrier=new Terrain({obstacles:[{id:'super-wall',type:'log',x:100,y:19.8,r:18,halfLength:220,angle:Math.PI/2}]});
for(const def of SUPER_SKILLS){const g=arena(barrier);acquire(g,def.id);const hidden=enemy(g,200);g.superSkills.cooldowns[def.id]=0;advance(g,2);assert.equal(hidden.hp,10000,`${def.id} cannot bypass a closed castle wall`);}
const vortex=arena();acquire(vortex,'vortex');const anchor=enemy(vortex,130),dragged=enemy(vortex,200),heavy=enemy(vortex,175,0,'boss');vortex.superSkills.cooldowns.vortex=0;advance(vortex,.6);assert(dragged.x<200);assert.equal(heavy.x,175,'a vortex does not drag Boss telegraphs');assert(vortex.terrain.isFree(dragged.x,dragged.y+groundOffset(dragged),dragged.r));
const dense=arena();for(const def of SUPER_SKILLS)acquire(dense,def.id);for(let i=0;i<180;i++)enemy(dense,130+i%12*8,-80+Math.floor(i/12)*9,'slime',1e6);dense.player.invuln=30;
for(let i=0;i<400;i++){dense.update(.025);assert(dense.superSkills.fields.length<=SUPER_RULES.maxFields);assert(dense.superSkills._volleys.length<=2);assert(dense.effects.length<=201);assert(dense.enemies.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.hp)));}
console.log('Super skills: exclusive Boss pools, earned-only reinforcement, stable choices, cap fallback, six automatic attacks, visible timing, wall separation, pauses and effect bounds passed.');
