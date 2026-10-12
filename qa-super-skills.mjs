import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { SUPER_SKILLS, SUPER_RULES, getSuperSkillStats } from './dist/super-skills.js';
let seed=739151;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(terrain=new Terrain({obstacles:[]})){const g=new Game({terrain,adventure:false,encounters:false,environment:false,settlements:false});g.enemies=[];g.gems=[];g.coins=[];g.events=[];g.effects=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;g._updatePressure=()=>{};return g;}
function enemy(g,x=150,y=0,type='slime',hp=10000){const e=g._spawnEnemy(type);Object.assign(e,{x,y,hp,maxHp:hp,speed:0});return e;}
function advance(g,t){for(let left=t;left>1e-8;left-=.025)g.update(Math.min(.025,left));}
function acquire(g,id){const def=SUPER_SKILLS.find(s=>s.id===id);assert(g.superSkills.offer(def.source,def.regionId));g.status='super';assert(g.superSkills.choose(id));g.status='playing';return def;}
assert.equal(SUPER_SKILLS.length,6);assert.equal(new Set(SUPER_SKILLS.map(s=>s.id)).size,6);assert(SUPER_SKILLS.every(s=>s.automatic&&s.maxLevel===3));
assert.equal(getSuperSkillStats('missing'),null);assert.equal(getSuperSkillStats('meteor',0),null);assert.equal(getSuperSkillStats('meteor',4),null);
assert(Object.isFrozen(getSuperSkillStats('meteor',1)),'choice-card stats cannot mutate combat tuning');
const locked=arena();assert.deepEqual(locked.superSkills.getUpgradeChoices(),[]);assert.deepEqual(locked.getSuperChoices(),[]);
for(let i=0;i<50;i++){locked._choices=null;assert(!locked.getUpgradeChoices().some(c=>c.id.startsWith('super:')),'ordinary upgrade pool cannot unlock an unearned super');}
locked.status='upgrade';assert.equal(locked.superSkills.upgrade('super:meteor'),false);
locked.status='playing';assert(locked.superSkills.offer('region','marsh'));const offer=locked.getSuperChoices(),ids=offer.map(s=>s.id);
assert.equal(ids[0],'miasma');assert.equal(offer.length,3);assert(offer.every(s=>s.source==='region'));assert.equal(locked.superSkills.offer('castle'),false,'another reward cannot overwrite a pending offer');
for(let i=0;i<5;i++)assert.deepEqual(locked.getSuperChoices().map(s=>s.id),ids);
assert.equal(locked.superSkills.choose(ids[0]),false,'a reward cannot be claimed outside its modal');locked.status='super';assert.equal(locked.superSkills.choose('meteor'),false);assert.equal(locked.superSkills.choose('missing'),false);
assert(locked.superSkills.choose('miasma'));assert.equal(locked.superSkills.choose('miasma'),false);assert.equal(locked.superSkills.owned.miasma,1);assert.equal(locked.superSkills.getUpgradeChoices()[0].id,'super:miasma');
locked.status='playing';locked.crystalsNext=40;locked.crystals=40;locked.update(0);assert(locked.chooseUpgrade('orbit'),'first purchase adds the opening secondary weapon');
locked.crystals=locked.crystalsNext;locked.update(0);let card;
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
assert.equal(rooted.superSkills.movementMultiplier(runner),0);assert.equal(rooted.superSkills.movementMultiplier(boss),1);const rootedX=runner.x;advance(rooted,1.2);assert.equal(runner.x,rootedX,'rooting stops actual enemy navigation for the strengthened duration');advance(rooted,.1);assert.equal(rooted.superSkills.movementMultiplier(runner),1);
const meteor=arena();acquire(meteor,'meteor');const marked=enemy(meteor);meteor.superSkills.cooldowns.meteor=0;meteor.update(.025);assert(meteor.superSkills.fields.every(f=>f.stage==='warning'));advance(meteor,.65);assert.equal(marked.hp,10000,'star impact has a visible delay');assert(!meteor.events.some(e=>e.type==='superImpact'),'impact audio is not emitted during the warning');advance(meteor,.4);assert(marked.hp<10000);assert.equal(meteor.events.filter(e=>e.type==='superImpact'&&e.skillId==='meteor').length,2,'each landing emits feedback at the damage time');
const swords=arena();acquire(swords,'swords');const small=enemy(swords,80),royal=enemy(swords,200,0,'boss');swords.superSkills.cooldowns.swords=0;advance(swords,.3);assert(royal.hp<10000);assert.equal(small.hp,10000,'royal swords prioritize the Boss');
const impact=arena();acquire(impact,'miasma');const poisoned=enemy(impact);impact.superSkills.cooldowns.miasma=0;impact.update(.025);assert.equal(poisoned.hp,9968,'miasma deals its opening burst on the cast frame');advance(impact,.475);assert.equal(poisoned.hp,9968,'opening burst does not also pay an early periodic tick');advance(impact,.025);assert.equal(poisoned.hp,9944,'the first poison tick lands after half a second');
const staged=arena();acquire(staged,'swords');const duelist=enemy(staged);staged.superSkills.cooldowns.swords=0;staged.update(.025);advance(staged,.15);assert.equal(duelist.hp,10000,'visible sword formation precedes the first hit');advance(staged,.025);assert.equal(duelist.hp,9876);advance(staged,.175);assert.equal(duelist.hp,9876,'successive swords do not collapse into one burst');advance(staged,.05);assert.equal(duelist.hp,9752);advance(staged,.5);assert.equal(duelist.hp,9504,'all four swords finish their staged volley');
const walking=arena();acquire(walking,'swords');enemy(walking,260);walking.superSkills.cooldowns.swords=0;walking.update(.025);
const formation=walking.effects.find(e=>e.type==='superBurst'&&e.skillId==='swords'),castPosition={x:walking.player.x,y:walking.player.y};let firstSword;
for(let i=0;i<9;i++){
 walking.update(.025,{x:1,y:.4});assert.equal(formation.x,walking.player.x,'queued swords follow horizontal caster movement');assert.equal(formation.y,walking.player.y,'queued swords follow vertical caster movement');
 const strike=walking.effects.find(e=>e.type==='superSword');
 if(strike&&!firstSword){firstSword=strike;const a=-Math.PI+.35;assert(Math.abs(strike.x-(formation.x+Math.cos(a)*35))<1e-8);assert(Math.abs(strike.y-(formation.y-13+Math.sin(a)*25))<1e-8,'the launched sword starts at the corresponding moving formation slot');assert.equal(formation.released,1,'the queued sword disappears on its actual release frame');}
}
assert(firstSword);assert(walking.player.x>castPosition.x&&walking.player.y>castPosition.y);assert.equal(formation.castX,castPosition.x);assert.equal(formation.castY,castPosition.y,'only the ground seal remains at the cast location');
walking.status='paused';const pausedFormation=structuredClone(formation);walking.update(.05,{x:1,y:1});walking.superSkills.update(.05);assert.deepEqual(formation,pausedFormation,'moving formation and its release count freeze while paused');

// Measure the complete, isolated cast, not just a damage-table calculation.
// This also catches missed final field ticks and accidental second casts.
const completeCast={thorns:[84,116,148],miasma:[224,288,352],runes:[96,126,156],meteor:[290,555,675],swords:[496,780,1128],vortex:[216,296,376]};
const priorCast={thorns:[65,90,115],miasma:[160,208,256],runes:[72,95,118],meteor:[220,420,510],swords:[380,600,870],vortex:[160,224,288]};
for(const def of SUPER_SKILLS)for(let level=1;level<=3;level++){
 const g=arena();for(let i=0;i<level;i++)acquire(g,def.id);const target=enemy(g),sleeper=enemy(g,155,5,'boss');sleeper.guardActive=false;g.superSkills.cooldowns[def.id]=0;
 advance(g,def.id==='miasma'?4.2:def.id==='vortex'?3.4:1.6);
 const dealt=10000-target.hp;assert.equal(dealt,completeCast[def.id][level-1],`${def.id} level ${level} delivers its complete intended output`);
 const gain=dealt/priorCast[def.id][level-1];assert(gain>=1.25&&gain<=1.41,`${def.id} remains a measured upgrade rather than a runaway power jump`);
 assert.equal(sleeper.hp,10000,`${def.id} damage and control exclude dormant portal guards even inside an active field`);
}
const barrier=new Terrain({obstacles:[{id:'super-wall',type:'log',structureType:'castle-wall',x:100,y:19.8,r:18,halfLength:220,angle:Math.PI/2}]});
for(const def of SUPER_SKILLS){
 const g=arena();assert(g.dungeon.enter({id:'super-castle',door:{x:0,y:19.8}}));
 g.terrain=barrier;g.dungeon.active.terrain=barrier;g.enemies=[];g.player.x=0;g.player.y=0;
 acquire(g,def.id);const hidden=enemy(g,200);hidden.dungeonId=g.dungeon.active.id;hidden.guardActive=true;
 g.superSkills.cooldowns[def.id]=0;advance(g,2);assert.equal(hidden.hp,10000,`${def.id} cannot bypass a closed castle wall`);
}
const vortex=arena();acquire(vortex,'vortex');const anchor=enemy(vortex,130),dragged=enemy(vortex,200),heavy=enemy(vortex,175,0,'boss');vortex.superSkills.cooldowns.vortex=0;advance(vortex,.6);assert(dragged.x<200);assert.equal(heavy.x,175,'a vortex does not drag Boss telegraphs');assert(vortex.terrain.isFree(dragged.x,dragged.y+groundOffset(dragged),dragged.r));
const dense=arena();for(const def of SUPER_SKILLS)acquire(dense,def.id);for(let i=0;i<180;i++)enemy(dense,130+i%12*8,-80+Math.floor(i/12)*9,'slime',1e6);dense.player.invuln=30;
for(let i=0;i<400;i++){dense.update(.025);assert(dense.superSkills.fields.length<=SUPER_RULES.maxFields);assert(dense.superSkills._volleys.length<=2);assert(dense.effects.length<=201);assert(dense.enemies.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.hp)));}
console.log('Super skills: exclusive Boss pools, earned-only reinforcement, stable choices, cap fallback, six automatic attacks, full-cast damage, staged impacts, dormant guards, wall separation, pauses and effect bounds passed.');
