import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { weaponStats } from './dist/combat-stats.js';
import { getAbilityDefinition } from './dist/ability-definitions.js';
import { SuperArt } from './dist/super-art.js';
let seed=73183;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(obstacles=[]){
 const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
 g.terrain=new Terrain({obstacles});g.enemies=[];g.effects=[];g.events=[];g.player.x=0;g.player.y=0;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
 g._spawn=Infinity;g.nextBossAt=Infinity;g._updatePressure=()=>{};return g;
}
function enemy(g,x=160,y=0,type='slime'){const e=g._spawnEnemy(type);Object.assign(e,{x,y,hp:10000,maxHp:10000,speed:0});return e;}
function advance(g,t){for(let left=t;left>1e-8;left-=.025){const dt=Math.min(.025,left);if(g.status==='playing')g._clock+=dt;g.superSkills.update(dt);}}
function runic(g){assert(g.build.awardRuneArrow());return weaponStats(g,'arrow');}
const choices=arena();assert(choices.superSkills.offer('region','forest'));
const initial=choices.getSuperChoices();assert.deepEqual(initial.map(c=>c.id),['meteor','swords','runeArrow']);
assert(!initial.some(c=>c.domainBranch),'retired player fields do not return through Boss rewards');
for(const branch of ['binding','erosion'])assert.equal(choices.build.awardDomain(branch),false);
assert.equal(choices.build.getSkill('domain'),null);assert.equal(choices.superSkills._cast('domain',1),false);
choices.status='super';assert.equal(choices.superSkills.choose('domain:binding'),false);assert(choices.superSkills.choose('meteor'));
assert.equal(choices.build.getSkill('meteor').baseRank,1);
assert(choices.superSkills.offer('region','marsh'));assert.deepEqual(choices.getSuperChoices().map(c=>c.id),['meteor','swords','runeArrow']);
assert.equal(choices.getSuperChoices()[0].currentLevel,1,'owned skills offer their next rank');
assert.equal(choices.superSkills.choose('domain:erosion'),false);
const stale=arena();assert(stale.superSkills.offer('region'));stale.build.superLevels.meteor=3;stale.build.superLevels.swords=3;
assert.deepEqual(stale.getSuperChoices().map(c=>c.id),['runeArrow'],'a pending reward refreshes after other progression');
const ricochet=arena();assert(ricochet.build.increment('arrow'));ricochet.levels.rapid=3;assert(ricochet.build.selectBranch('arrow','ricochet'));
assert(ricochet.superSkills.offer('region'));assert(!ricochet.getSuperChoices().some(c=>c.id==='runeArrow'));ricochet.build.superLevels.meteor=3;ricochet.build.superLevels.swords=3;
assert.deepEqual(ricochet.getSuperChoices().map(c=>c.id),['super:resource'],'incompatible weapons do not block the mastered reward');

// Domains are now hostile Boss abilities. Exercise their live execution path,
// including the warning, repeated hits, control, cover and scene cleanup.
const domainStats=getAbilityDefinition('domain').parameters;
function advanceDomain(g,t){for(let left=t;left>1e-8;left-=.025){const dt=Math.min(.025,left);if(g.status==='playing'){g._clock+=dt;g.player.invuln=Math.max(0,g.player.invuln-dt);}g.abilities.update(dt);}}
function hostileDomain(g){const boss=enemy(g,160,0,'boss');g.player.hp=g.player.maxHp=1000;g.player.invuln=0;assert(g.abilities.cast('domain',boss,{target:g.player}));return boss;}
const field=arena(),fieldBoss=hostileDomain(field),hp=field.player.hp;
advanceDomain(field,domainStats.windup-.05);assert.equal(field.player.hp,hp,'field warning deals no damage');
advanceDomain(field,.075);const firstHit=field.player.hp;assert(firstHit<hp);assert.equal(fieldBoss.hp,10000,'hostile fields do not damage their caster');
assert.equal(field.abilities.movementMultiplier(field.player),domainStats.slowMultiplier);
advanceDomain(field,.4);assert.equal(field.player.hp,firstHit,'a field does not deal damage every frame');
advanceDomain(field,domainStats.tickInterval-.35);assert(field.player.hp<firstHit,'later field ticks apply damage again');
field.player.x=domainStats.radius+field.player.r+20;const escapedHp=field.player.hp;
advanceDomain(field,domainStats.slowDuration+.1);assert.equal(field.player.hp,escapedHp);assert.equal(field.abilities.movementMultiplier(field.player),1,'leaving the field lets its slow expire');
const protectedField=arena();hostileDomain(protectedField);protectedField.relics.grantWard(1000);
advanceDomain(protectedField,domainStats.windup+.1);assert.equal(protectedField.player.hp,1000);assert.equal(protectedField.abilities.movementMultiplier(protectedField.player),1,'fully absorbed hits cannot apply field control');
const flying=arena();hostileDomain(flying);flying.player.flying=true;advanceDomain(flying,domainStats.windup+.1);assert.equal(flying.player.hp,1000,'ground fields cannot hit airborne targets');
const low={id:'low',type:'log',x:80,y:19.8,r:12,halfLength:180,angle:Math.PI/2};
const high={...low,id:'high',structureType:'castle-wall'};
for(const obstacle of [low,high]){
 const g=arena([obstacle]),boss=enemy(g,160,0,'boss');assert.equal(g.abilities.cast('domain',boss,{target:g.player}),false,'ground cover blocks a field cast');
}
const separated=arena();hostileDomain(separated);separated.player.x=75;separated.terrain=new Terrain({obstacles:[{...high,x:40}]});advanceDomain(separated,domainStats.windup+.1);assert.equal(separated.player.hp,1000,'a new wall blocks damage from a previously placed field');
const frozenField=arena();hostileDomain(frozenField);frozenField.status='paused';advanceDomain(frozenField,1);assert.equal(frozenField.abilities.effects[0].age,0);assert.equal(frozenField.player.hp,1000);
field.abilities.clearScene();assert.equal(field.abilities.effects.length,0);assert.equal(field.abilities.statuses.size,0);assert.equal(field.abilities.movementMultiplier(field.player),1);

const reward=arena();assert.equal(reward.build.isEquipped('arrow'),false);assert(reward.superSkills.offer('region','ruins'));const runeCard=reward.getSuperChoices()[0];assert.equal(runeCard.id,'runeArrow');assert.match(runeCard.desc,/获得翠羽飞矢/);
reward.status='super';assert(reward.superSkills.choose('runeArrow'));reward.status='playing';assert(reward.build.isEquipped('arrow'));assert(reward.build.isEquipped('sword'));assert.equal(reward.build.getWeapon('arrow').branch,'pierce');assert.equal(reward.build.getRank('arrowRune'),1);assert(!reward.build.getSkillLoadout().some(s=>s.id==='runes'));
const trigger=arena();runic(trigger);trigger._shot=0;trigger.attacks.updateBasic(.025);assert.equal(trigger.superSkills._runicShots.length,0);
enemy(trigger);trigger._shot=0;trigger.attacks.updateBasic(.025);assert.equal(trigger.superSkills._runicShots.length,1,'a real successful arrow volley arms the rune');
const shot=arena(),stats=runic(shot),first=enemy(shot,100),second=enemy(shot,200),third=enemy(shot,300),offaxis=enemy(shot,200,90);
assert(shot.superSkills.castRunicVolley(stats,first));assert.equal(shot.superSkills.castRunicVolley(stats,first),false);assert(shot.effects.some(e=>e.type==='superRunicCharge'));
advance(shot,.1);assert.equal(first.hp,10000,'visible charging precedes the beam');advance(shot,.025);
for(const e of [first,second,third]){assert.equal(e.hp,10000-stats.runicDamage);assert.equal(e.hitSource,'runeArrow');}assert.equal(offaxis.hp,10000);
assert.equal(shot.effects.filter(e=>e.type==='superRay').length,1,'one beam replaces the old triple-ray skill');
advance(shot,4.3);assert.equal(first.hp,10000-stats.runicDamage,'ready runes never fire independently of a successful arrow shot');assert(shot.superSkills.castRunicVolley(weaponStats(shot,'arrow'),first));
for(const [obstacle,canCross] of [[low,true],[high,false]]){
 const g=arena([obstacle]),s=runic(g),target=enemy(g,160);assert(g.superSkills.castRunicVolley(s,target));advance(g,.15);assert.equal(target.hp<10000,canCross,'runic arrows cross low cover and stop at high walls');
 if(!canCross){const beam=g.effects.find(e=>e.type==='superRay');assert(beam.x2<80,'the visible beam stops before the blocker');}
}
const focus=arena(),fs=runic(focus),royal=enemy(focus,160,0,'boss');assert(focus.superSkills.castRunicVolley(fs,royal));advance(focus,.15);assert.equal(royal.hp,10000-fs.runicDamage,'one target receives exactly one ray hit');
const amplified=arena();runic(amplified);amplified.levels.arrowPower=2;amplified.levels.power=2;const boosted=weaponStats(amplified,'arrow');assert.equal(boosted.runicDamage,96*1.3*1.5,'weapon-local and shared attack multipliers apply once');
const paused=arena(),ps=runic(paused),pt=enemy(paused);assert(paused.superSkills.castRunicVolley(ps,pt));paused.status='paused';const cooldown=paused.superSkills._runicCooldown;advance(paused,.5);assert.equal(paused.superSkills._runicCooldown,cooldown);assert.equal(pt.hp,10000);paused.status='playing';advance(paused,.125);assert(pt.hp<10000);
const disarmed=arena(),ds=runic(disarmed),dt=enemy(disarmed);assert(disarmed.superSkills.castRunicVolley(ds,dt));assert(disarmed.build.setEquipped('arrow',false));advance(disarmed,.15);assert.equal(dt.hp,10000);assert.equal(disarmed.superSkills._runicShots.length,0);assert.equal(disarmed.superSkills.castRunicVolley(ds,dt),false,'stale stats cannot trigger an unequipped weapon');
const reset=arena(),rs=runic(reset),rt=enemy(reset);assert(reset.superSkills.castRunicVolley(rs,rt));const remaining=reset.superSkills._runicCooldown;reset.superSkills.clearScene();assert.equal(reset.superSkills._runicShots.length,0);assert.equal(reset.superSkills._runicCooldown,remaining);assert(!reset.effects.some(e=>e.skillId==='runeArrow'));
// Renderer recognizes the short charge and both field identities without mutating simulation.
const gradient={addColorStop(){}};let paints=0;const ctx=new Proxy({createRadialGradient(){return gradient;},createLinearGradient(){return gradient;}},{get(target,key){return key in target?target[key]:(()=>{paints++;});},set(target,key,value){target[key]=value;return true;}});
const art=new SuperArt(()=>({width:0,height:0,getContext:()=>ctx}));
for(const branch of ['binding','erosion']){
 const field={id:1,kind:branch==='binding'?'thorns':'miasma',skillId:'domain',domainBranch:branch,x:0,y:0,r:120,life:2,maxLife:4,interval:.5},before=structuredClone(field);
 assert(art.drawField(ctx,field));assert(art.drawEffect(ctx,{type:'superBurst',skillId:'domain',domainBranch:branch,x:0,y:0,r:120,life:.25,maxLife:.5}));assert.deepEqual(field,before);
}
assert(art.drawEffect(ctx,{type:'superRunicCharge',skillId:'runeArrow',x:0,y:0,angle:0,r:18,life:.06,maxLife:.12}));assert(paints>0);assert(art.cacheStats.pixels<=art.cacheStats.limitBytes/4);
console.log('Domain / runic: Boss-only domains, warning and repeated damage, flight/cover/control rules, current rewards, arrow-only timed beams, pause/equipment cleanup and bounded artwork passed.');
