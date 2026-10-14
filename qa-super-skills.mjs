import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { SUPER_SKILLS, SUPER_RULES, getSuperSkillStats } from './dist/super-skills.js';
import { swordFormationAnchor } from './dist/sword-flight.js';
let seed=739151;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(terrain=new Terrain({obstacles:[]})){
 const g=new Game({terrain,adventure:false,encounters:false,environment:false,settlements:false});
 g.enemies=[];g.gems=[];g.coins=[];g.events=[];g.effects=[];g._spawn=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;g._updatePressure=()=>{};
 for(const weapon of Object.values(g.build.weapons))weapon.equipped=false;
 return g;
}
function enemy(g,x=150,y=0,type='slime',hp=10000){const e=g._spawnEnemy(type);Object.assign(e,{x,y,hp,maxHp:hp,speed:0});return e;}
function advance(g,t){for(let left=t;left>1e-8;left-=.025){const dt=Math.min(.025,left);if(g.status==='playing')g._clock+=dt;g.superSkills.update(dt);}}
function acquire(g,id,branch='binding'){
 const def=SUPER_SKILLS.find(s=>s.id===id);assert(def);assert(g.superSkills.offer(def.source,def.regionId));g.status='super';
 const choice=id==='domain'&&!g.superSkills.owned.domain?`domain:${branch}`:id;
 assert(g.superSkills.choose(choice));g.status='playing';return def;
}
assert.equal(SUPER_SKILLS.length,2);assert.equal(new Set(SUPER_SKILLS.map(s=>s.id)).size,2);assert(SUPER_SKILLS.every(s=>s.automatic&&s.maxLevel===3));
assert.equal(getSuperSkillStats('missing'),null);assert.equal(getSuperSkillStats('meteor',0),null);assert.equal(getSuperSkillStats('meteor',4),null);
assert(Object.isFrozen(getSuperSkillStats('meteor',1)),'choice-card stats cannot mutate combat tuning');
const locked=arena();assert.deepEqual(locked.superSkills.getUpgradeChoices(),[]);assert.deepEqual(locked.getSuperChoices(),[]);
for(let i=0;i<20;i++){locked._choices=null;assert(!locked.getUpgradeChoices().some(c=>c.id.startsWith('super:')),'ordinary upgrades cannot unlock an unearned super');}
locked.status='upgrade';assert.equal(locked.superSkills.upgrade('super:meteor'),false);
locked.status='playing';assert(locked.superSkills.offer('region','marsh'));const offer=locked.getSuperChoices(),ids=offer.map(s=>s.id);
assert.deepEqual(ids,['meteor','swords','runeArrow']);assert(offer.every(s=>s.source==='region'));
assert.equal(locked.superSkills.offer('castle'),false,'another reward cannot overwrite a pending offer');
for(let i=0;i<5;i++)assert.deepEqual(locked.getSuperChoices().map(s=>s.id),ids);
assert.equal(locked.superSkills.choose(ids[0]),false,'a reward cannot be claimed outside its modal');locked.status='super';assert.equal(locked.superSkills.choose('domain:binding'),false);assert.equal(locked.superSkills.choose('missing'),false);
assert(locked.superSkills.choose('meteor'));assert.equal(locked.superSkills.choose('swords'),false);
assert.equal(locked.superSkills.owned.meteor,1);assert.equal(locked.superSkills.getUpgradeChoices()[0].id,'super:meteor');
const oldCooldown=locked.superSkills.cooldowns.meteor;locked.status='upgrade';assert(locked.superSkills.upgrade('super:meteor'));
assert.equal(locked.superSkills.owned.meteor,2);assert.equal(locked.superSkills.cooldowns.meteor,oldCooldown,'reinforcement cannot instantly recast a cooling skill');
assert(locked.superSkills.upgrade('super:meteor'));assert.equal(locked.superSkills.upgrade('super:meteor'),false);assert(!locked.superSkills.getUpgradeChoices().some(c=>c.skillId==='meteor'));
for(const source of ['region','castle']){
 const g=arena();for(const def of SUPER_SKILLS.filter(s=>(s.rewardSources||[s.source]).includes(source)))for(let i=0;i<3;i++)acquire(g,def.id);
 if(source==='region')for(let i=0;i<3;i++)assert(g.build.awardRuneArrow());
 assert(g.superSkills.offer(source));assert.deepEqual(g.getSuperChoices().map(c=>c.id),['super:resource']);g.status='super';assert(g.superSkills.choose('super:resource'));
 const expected=source==='castle'?SUPER_RULES.castleFallback:SUPER_RULES.regionFallback;
 assert.equal(g.gold,expected.gold);assert.equal(g.crystals,expected.crystals);assert.equal(g.superSkills.choose('super:resource'),false);assert.equal(g.gold,expected.gold);
}
for(const def of SUPER_SKILLS){
 const g=arena();acquire(g,def.id);const target=enemy(g),hidden=enemy(g,1500);g.superSkills.cooldowns[def.id]=0;
 advance(g,1.65);assert(target.hp<10000,`${def.name} deals scheduled damage`);assert.equal(hidden.hp,10000,`${def.name} excludes offscreen targets`);
 assert(!target.bleed&&!target.shock,'super damage does not borrow ordinary status procs');
 for(const state of ['paused','upgrade','shop','super','relic','dead']){
  g.status=state;const frozen=structuredClone({hp:target.hp,fields:g.superSkills.fields,volleys:g.superSkills._volleys,cooldowns:g.superSkills.cooldowns});advance(g,.5);g.superSkills.update(.05);
  assert.deepEqual({hp:target.hp,fields:g.superSkills.fields,volleys:g.superSkills._volleys,cooldowns:g.superSkills.cooldowns},frozen,`${state} freezes ${def.id}`);
 }
 const preserved=structuredClone({owned:g.superSkills.owned,cooldowns:g.superSkills.cooldowns});g.superSkills.clearScene();
 assert.equal(g.superSkills.fields.length,0);assert.equal(g.superSkills._volleys.length,0);assert.deepEqual({owned:g.superSkills.owned,cooldowns:g.superSkills.cooldowns},preserved);
}
const meteor=arena();acquire(meteor,'meteor');const marked=enemy(meteor);meteor.superSkills.cooldowns.meteor=0;advance(meteor,.025);
assert(meteor.superSkills.fields.every(f=>f.stage==='warning'));advance(meteor,.65);assert.equal(marked.hp,10000,'stars show a real warning before impact');assert(!meteor.events.some(e=>e.type==='superImpact'));advance(meteor,.4);
assert.equal(meteor.events.filter(e=>e.type==='superImpact'&&e.skillId==='meteor').length,2,'both landing events coincide with damage');
const swords=arena();acquire(swords,'swords');const small=enemy(swords,80),royal=enemy(swords,200,0,'boss');swords.superSkills.cooldowns.swords=0;advance(swords,1);assert(royal.hp<10000);assert.equal(small.hp,10000,'royal swords prioritize the Boss');
const staged=arena();acquire(staged,'swords');const duelist=enemy(staged);staged.superSkills.cooldowns.swords=0;advance(staged,.175);assert.equal(duelist.hp,10000);advance(staged,.025);assert.equal(duelist.hp,10000,'a released sword must travel before damage');assert.equal(staged.superSkills.swordFlights.length,1);advance(staged,.225);assert.equal(staged.superSkills.swordFlights.length,2,'release cadence remains staggered');advance(staged,1.8);assert.equal(duelist.hp,9504);
const walking=arena();acquire(walking,'swords');enemy(walking,260);walking.superSkills.cooldowns.swords=0;advance(walking,.025);
const formation=walking.effects.find(e=>e.type==='superBurst'&&e.skillId==='swords'),castPosition={x:walking.player.x,y:walking.player.y};let firstSword;
for(let i=0;i<9;i++){
 walking.player.x+=2;walking.player.y+=1;advance(walking,.025);assert.equal(formation.x,walking.player.x);assert.equal(formation.y,walking.player.y);
 const strike=walking.superSkills.swordFlights[0];
 if(strike&&!firstSword){firstSword=strike;const anchor=swordFormationAnchor(walking.player,0,4);assert(Math.abs(strike.x-anchor.x)<1e-8);assert(Math.abs(strike.visualY-anchor.y)<1e-8);assert.equal(formation.released,1);}
}
assert(firstSword);assert.equal(formation.castX,castPosition.x);assert.equal(formation.castY,castPosition.y,'only the seal remains at the cast position');
walking.status='paused';const pausedFormation=structuredClone(formation);advance(walking,.3);assert.deepEqual(formation,pausedFormation);
const completeCast={domain:[152,207,262],meteor:[290,555,675],swords:[496,780,1128],vortex:[216,296,376]};
for(const def of SUPER_SKILLS)for(let level=1;level<=3;level++){
 const g=arena();for(let i=0;i<level;i++)acquire(g,def.id);const target=enemy(g),sleeper=enemy(g,155,5,'boss');sleeper.rescueSpawnGrace=10;g.superSkills.cooldowns[def.id]=0;
 advance(g,['domain','vortex'].includes(def.id)?3.4:def.id==='swords'?2.6:1.6);
 assert.equal(10000-target.hp,completeCast[def.id][level-1],`${def.id} Lv.${level} complete cast output`);assert.equal(sleeper.hp,10000);
}
const barrier=new Terrain({obstacles:[{id:'super-wall',type:'log',structureType:'castle-wall',x:100,y:19.8,r:18,halfLength:220,angle:Math.PI/2}]});
for(const def of SUPER_SKILLS){
 const g=arena();assert(g.dungeon.enter({id:'super-castle',door:{x:0,y:19.8}}));g.terrain=barrier;g.dungeon.active.terrain=barrier;g.enemies=[];g.player.x=0;g.player.y=0;
 acquire(g,def.id);const hidden=enemy(g,200);hidden.dungeonId=g.dungeon.active.id;hidden.guardActive=true;g.superSkills.cooldowns[def.id]=0;advance(g,2);assert.equal(hidden.hp,10000,`${def.id} respects closed walls`);
}
const restricted=arena();assert.equal(restricted.superSkills._cast('domain',1),false);assert.equal(restricted.superSkills._cast('vortex',1),false);
const dense=arena();for(const def of SUPER_SKILLS)acquire(dense,def.id);for(let i=0;i<180;i++)enemy(dense,130+i%12*8,-80+Math.floor(i/12)*9,'slime',1e6);
for(let i=0;i<400;i++){advance(dense,.025);dense.effects=dense.effects.filter(e=>{e.life-=.025;return e.life>0;});assert(dense.superSkills.fields.length<=SUPER_RULES.maxFields);assert(dense.superSkills._volleys.length<=2);assert(dense.effects.length<=201);assert(dense.enemies.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.hp)));}
console.log('Super skills: player-only Boss rewards, earned-only reinforcement, fresh snapshots, cap fallback, two automatic supers, full cast damage, wall separation, pauses and bounded effects passed.');
