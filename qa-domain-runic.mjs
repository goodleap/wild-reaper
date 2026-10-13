import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { weaponStats } from './dist/combat-stats.js';
import { getSuperSkillStats } from './dist/super-skills.js';
import { SuperArt } from './dist/super-art.js';
let seed=73183;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(obstacles=[]){
 const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
 g.terrain=new Terrain({obstacles});g.enemies=[];g.effects=[];g.events=[];g.player.x=0;g.player.y=0;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
 g._spawn=Infinity;g.nextBossAt=Infinity;g._updatePressure=()=>{};return g;
}
function enemy(g,x=160,y=0,type='slime'){const e=g._spawnEnemy(type);Object.assign(e,{x,y,hp:10000,maxHp:10000,speed:0});return e;}
function advance(g,t){for(let left=t;left>1e-8;left-=.025){const dt=Math.min(.025,left);if(g.status==='playing')g._clock+=dt;g.superSkills.update(dt);}}
function domain(g,branch){assert(g.build.awardDomain(branch));g.superSkills.cooldowns.domain=0;}
function runic(g){assert(g.build.awardRuneArrow());return weaponStats(g,'arrow');}
const choices=arena();assert(choices.superSkills.offer('region','forest'));
const initial=choices.getSuperChoices();assert.deepEqual(initial.map(c=>c.id),['domain:binding','domain:erosion','runeArrow']);
assert(initial.filter(c=>c.domainBranch).every(c=>c.category==='skill'&&c.ownerId==='domain'&&!c.branch));
choices.status='super';assert(choices.superSkills.choose('domain:binding'));assert.equal(choices.build.getSkill('domain').branch,'binding');
assert(choices.superSkills.offer('region','marsh'));assert.deepEqual(choices.getSuperChoices().map(c=>c.id),['domain','runeArrow'],'owned fields offer one branch upgrade, not two identical cards');
assert.equal(choices.getSuperChoices()[0].domainBranch,'binding');assert.equal(choices.build.awardDomain('erosion'),false);
choices.status='super';assert.equal(choices.superSkills.choose('domain:erosion'),false);
const stale=arena();domain(stale,'binding');assert(stale.superSkills.offer('region'));assert(stale.build.awardDomain('binding'));assert(stale.build.awardDomain('binding'));
assert.deepEqual(stale.getSuperChoices().map(c=>c.id),['runeArrow'],'a pending reward refreshes after other progression');
const ricochet=arena();assert(ricochet.build.increment('arrow'));ricochet.levels.rapid=3;assert(ricochet.build.selectBranch('arrow','ricochet'));
assert(ricochet.superSkills.offer('region'));assert(!ricochet.getSuperChoices().some(c=>c.id==='runeArrow'));for(let i=0;i<3;i++)assert(ricochet.build.awardDomain('erosion'));
assert.deepEqual(ricochet.getSuperChoices().map(c=>c.id),['super:resource'],'incompatible weapons do not block the mastered reward');

const binding=arena();domain(binding,'binding');const ground=enemy(binding),boss=enemy(binding,195,0,'boss'),flyer=enemy(binding,175,0,'bat');
ground.charge={phase:'rush'};ground._chargeSegment={x1:0,x2:120};advance(binding,.025);
assert.equal(ground.hp,9960);assert.equal(ground.charge,null);assert.equal(ground._chargeSegment,null);assert.equal(binding.superSkills.movementMultiplier(ground),0);
assert.equal(boss.superRootUntil,undefined);assert.equal(binding.superSkills.movementMultiplier(boss),.85);assert.equal(flyer.hp,10000);assert.equal(binding.superSkills.movementMultiplier(flyer),1);
advance(binding,.5);assert.equal(binding.superSkills.movementMultiplier(ground),1,'roots release between repeated pulses');advance(binding,.25);
assert.equal(ground.hp,9932);assert.equal(binding.superSkills.movementMultiplier(ground),0,'the next field pulse briefly roots again');
const empty=arena();domain(empty,'binding');advance(empty,.025);assert(empty.superSkills.cooldowns.domain<=.2,'an empty field cast retries soon instead of spending the full cooldown');const late=enemy(empty);advance(empty,.25);assert(late.hp<10000);
for(const branch of ['binding','erosion']){
 const g=arena();domain(g,branch);const armored=enemy(g);armored.affix={id:'shield',shield:1000,maxShield:1000,color:'#9acbdf'};
 advance(g,1);assert.equal(armored.hp,10000);assert(armored.affix.shield<1000);
 assert.equal(armored.superRootUntil,undefined);assert.equal(armored.superSlowUntil,undefined);assert.equal(g.superSkills._erosion.size,0,'absorbed hits cannot leak control or erosion through a shield');
}
const guardian=arena();domain(guardian,'binding');const guard=enemy(guardian,150,0,'boss');
Object.assign(guard,{portalId:'domain-guardian',guardActive:false,_portalAnnounced:false});
guardian.regions.portals=[{id:'domain-guardian',x:150,y:19.8,state:'locked'}];
assert(guardian.superSkills._visible(guard));assert.equal(guard.guardActive,false,'acquisition stays pure');advance(guardian,.025);
assert(guard.hp<10000);assert.equal(guard.guardActive,true,'a valid field hit awakens a visible portal guardian');
for(let level=1;level<=3;level++){
 const g=arena();for(let n=0;n<level;n++)assert(g.build.awardDomain('erosion'));const target=enemy(g);g.superSkills.cooldowns.domain=0;advance(g,.025);
 const stats=getSuperSkillStats('domain',level,'erosion');assert.equal(target.hp,10000-stats.impactDamage);assert.equal(g.superSkills.movementMultiplier(target),.8);
 advance(g,.475);assert.equal(target.hp,10000-stats.impactDamage,'no periodic damage precedes the half-second tick');advance(g,.025);
 assert.equal(target.hp,10000-stats.impactDamage-stats.damage);advance(g,4.8);
 assert.equal(10000-target.hp,stats.impactDamage+stats.damage*9,'eight field ticks and two half-damage residual ticks have one damage owner each');
}
const escape=arena();domain(escape,'erosion');const escaping=enemy(escape);advance(escape,.025);escaping.x=390;advance(escape,1.15);assert.equal(10000-escaping.hp,56,'leaving the field retains two weaker ticks');advance(escape,.5);assert.equal(escape.superSkills.movementMultiplier(escaping),1);
const low={id:'low',type:'log',x:80,y:19.8,r:12,halfLength:180,angle:Math.PI/2};
const high={...low,id:'high',structureType:'castle-wall'};
for(const branch of ['binding','erosion'])for(const obstacle of [low,high]){
 const g=arena([obstacle]);domain(g,branch);const target=enemy(g,160);advance(g,.4);assert.equal(target.hp,10000,`${branch} cannot propagate through ground cover`);
}
const separated=arena();domain(separated,'erosion');const leaving=enemy(separated);advance(separated,.025);leaving.x=330;separated.terrain=new Terrain({obstacles:[{...high,x:240}]});advance(separated,1.2);assert.equal(leaving.hp,9968,'residue does not tick through a newly intervening wall');
binding.superSkills.clearScene();assert.equal(binding.superSkills.fields.length,0);assert.equal(binding.superSkills.movementMultiplier(ground),1);assert.equal(binding.superSkills.movementMultiplier(boss),1);assert.equal(binding.superSkills._erosion.size,0);

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
console.log('Domain / runic: exclusive branches, distinct control and lingering damage, flight/wall rules, earned weapon rewards, arrow-only timed beams, pause/equipment cleanup and bounded artwork passed.');
