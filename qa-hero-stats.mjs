import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { HEROES, getHero } from './dist/heroes.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { weaponStats, skillStats, resolveCharacterStats, defenseDamageMultiplier } from './dist/combat-stats.js';
import { getSuperSkillStats } from './dist/super-skills.js';
import { ANGEL_RULES } from './dist/settlements.js';

let seed=830614;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const near=(a,b,what)=>assert(Math.abs(a-b)<1e-8,`${what}: ${a} != ${b}`);
function arena(options={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,...options});
  g.enemies=[];g.gems=[];g.coins=[];g.effects=[];g.events=[];
  g._spawn=g.nextBossAt=g._shot=g._pulse=g._lightning=Infinity;g._updatePressure=()=>{};
  g.player.xpNext=g.crystalsNext=Infinity;g.player.x=g.player.y=0;return g;
}
function target(g,x=100){const e=g._spawnEnemy('slime');Object.assign(e,{x,y:0,hp:10000,maxHp:10000,speed:0,xp:0});g._rebuildGrid();return e;}
const advance=(g,t,input={})=>{for(let left=t;left>1e-9;left-=.025)g.update(Math.min(left,.025),input);};
assert.deepEqual(HEROES.map(h=>h.id),['traveler','princess','elder']);
for(const invalid of [undefined,null,'','warden','stormcaller','ranger','unknown','__proto__',{},['princess']])assert.equal(getHero(invalid).id,'traveler');
const expected={traveler:{hp:110,speed:220,damage:1,defense:8,magnet:105},princess:{hp:100,speed:246.4,damage:1,defense:0,magnet:126},elder:{hp:85,speed:202.4,damage:.88,defense:0,magnet:105}};
for(const hero of HEROES) {
  const baseline=expected[hero.id];
  for(const difficulty of ['normal','casual'])for(const initialWeaponId of ['sword','arrow','orbit']) {
    const g=arena({hero:hero.id,difficulty,initialWeaponId}),s=resolveCharacterStats(g);
    assert.equal(g.player.heroId,hero.id);assert.equal(g.player.r,15);assert.equal(groundOffset(g.player,true),19.8);
    assert.equal(g.player.hp,Math.round((difficulty==='casual'?140:100)*hero.hpMultiplier));assert.equal(g.player.hp,g.player.maxHp);
    near(s.moveSpeed,baseline.speed,'initial movement');near(s.attack,32*baseline.damage,'initial attack');assert.equal(s.defense,baseline.defense);near(s.magnet,baseline.magnet,'pickup');
    assert.equal(g.player.level,1);assert.equal(g.progressionTier,1);assert.equal(g.gold,0);assert.equal(g.crystals,0);
    assert.deepEqual(g.weapons.map(w=>w.id),[initialWeaponId]);assert.deepEqual(g.skills.map(s=>s.id),['storm']);
    assert.equal(g.player.skillCooldownMax,15);assert.equal(g.build.attributes.defense,0,'innate defense is not an earned upgrade');
  }
  const moving=arena({hero:hero.id});advance(moving,.25,{x:1,y:0});near(moving.player.x,baseline.speed*.25,'real movement');
  const hurt=arena({hero:hero.id}),hp=hurt.player.hp;assert(hurt._hurtPlayer(40));near(hp-hurt.player.hp,40*defenseDamageMultiplier(baseline.defense),'real defense');
  const gather=arena({hero:hero.id});gather.gems=[{x:115,y:0,value:1,r:5,phase:0}];gather._collectDrops(gather.gems,.025,'crystals');
  assert.equal(!!gather.gems[0].attracted,hero.id==='princess','pickup advantage attracts a real drop outside the baseline range');
  const grown=arena({hero:hero.id});grown.player.level=11;grown.levels.power=2;grown.levels.speed=2;grown.levels.magnet=1;grown.levels.toughness=2;grown.levels.vitality=1;grown._refreshStats();
  const s=resolveCharacterStats(grown);near(s.attack,32*baseline.damage*1.6,'hero factor remains after shared growth');near(s.moveSpeed,baseline.speed*1.16,'movement upgrades');near(s.magnet,baseline.magnet*1.35,'pickup upgrades');assert.equal(s.defense,baseline.defense+50);assert.equal(grown.player.maxHp,Math.round((100+20+25)*hero.hpMultiplier));
  const before=JSON.stringify(s);for(let i=0;i<8;i++)grown._refreshStats();assert.equal(JSON.stringify(resolveCharacterStats(grown)),before,'refresh never reapplies innate grants');
  const debug=arena({hero:hero.id,debug:true,debugOptions:{fullLoadout:true}});near(debug.player.speed,debug.hero.baseSpeed*3,'debug speed preserves role; full mode grants no attributes');assert.equal(debug.player.skillCooldownMax,0);assert.equal(debug.hero.id,hero.id);
}

// Exercise real attack paths, including a delayed super snapshot. Character
// damage applies once, while weapon-local coefficients remain unchanged.
for(const hero of HEROES)for(const [id,base] of [['sword',64],['arrow',32],['orbit',30],['pulse',50],['lightning',48],['storm',160]]) {
  const g=arena({hero:hero.id});g.build.setEquipped('sword',false);
  if(['sword','arrow','orbit','pulse','lightning'].includes(id)){g.levels[id]=1;if(['sword','arrow','orbit'].includes(id))g.build.setEquipped(id,true);}
  const e=target(g,id==='sword'?55:id==='orbit'?74:100);
  if(id==='sword'){g._refreshWeapons();advance(g,.22);}
  else if(id==='arrow'){g._shot=0;g.update(0);g._shot=Infinity;advance(g,.2);}
  else if(id==='storm')g.update(0,{skill:true});
  else {if(id==='pulse')g._pulse=0;if(id==='lightning')g._lightning=0;g._updateWeapons(0);}
  near(10000-e.hp,base*hero.damageMultiplier,`${hero.id} ${id} actual damage`);
}
for(const hero of HEROES) {
  const g=arena({hero:hero.id});g.build.setEquipped('sword',false);const e=target(g,180);
  assert(g.superSkills._cast('meteor',1));
  const fields=g.superSkills.fields.filter(f=>f.kind==='meteor');assert(fields.length);
  near(fields[0].damage,getSuperSkillStats('meteor',1).damage*hero.damageMultiplier,'super snapshot');
  const frozenDamage=fields[0].damage;g.levels.power=6;g._refreshStats();advance(g,.725);
  near(10000-e.hp,frozenDamage,'delayed super uses cast-time role scaling once');
  const ally={id:'qa-role-ally',x:0,y:0,r:15,isCompanion:true,kind:'stormcaller',_echoes:[]};
  e.x=100;e.hp=10000;e.shock=null;g._rebuildGrid();assert(g.companions._castLightning(ally));near(10000-e.hp,105,'companion ignores player role and power');
  e.hp=10000;e.shock=null;g.companions._castQuake({...ally,kind:'warden'});near(10000-e.hp,32,'defensive companion uses own damage');
  const angel={id:'qa-role-angel',type:'angel',x:0,y:groundOffset(g.player,true),_attack:0,state:'ready'};
  e.hp=10000;e.bleed=null;g.settlements.sites=[angel];g.settlements._updateAngels(.025,{x:0,y:angel.y});near(10000-e.hp,ANGEL_RULES.damage,'angel ignores player role and power');
}
console.log('Hero stats: three roles and weapons, real damage/movement/pickup/defense, shared growth, delayed super snapshots, ally isolation and debug composition passed.');
