import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {COMPANION_DEFINITIONS,COMPANION_RULES} from './dist/companion-catalog.js';
const arena=()=>{const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false});g.enemies=[];g.effects=[];g.events=[];g.gold=1000;g._spawn=Infinity;g.nextBossAt=Infinity;g._shot=Infinity;g._updatePressure=()=>{};g.crystalsNext=Infinity;g.player.xpNext=Infinity;g.build.setEquipped('sword',false);return g;};
const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.isCompanion)});
const enemy=(g,x,y,{type='slime',...extra}={})=>Object.assign(g._spawnEnemy(type,1),{x,y,speed:0,hp:10000,maxHp:10000,...extra});
const tick=(g,seconds)=>{for(let t=0;t<seconds-1e-8;t+=.025)g.update(Math.min(.025,seconds-t));};

const team=arena();for(const def of COMPANION_DEFINITIONS)assert(team.companions.recruit(def.kind));
assert.equal(team.companions.members.length,5);assert.equal(team.companions.combatants().length,5);assert.equal(team.companions.upkeep,12);
assert.equal(team.companions.recruit('golem'),null);assert.equal(team.rescuePower,0,'ordinary recruitment/debug recruitment never grants rescue growth');
for(const member of team.companions.members){assert(Number.isFinite(member.groundOffset));assert(team.terrain.isFree(foot(member).x,foot(member).y,member.r));}
const owl=team.companions.members.find(member=>member.kind==='owl');assert(owl.flying);
team.time=team.runTime=30;team.companions.update(0);assert.equal(team.gold,988);assert.equal(team.companions.nextPayrollAt,60);
team.status='paused';team.time=team.runTime=60;team.companions.update(.05);assert.equal(team.gold,988,'paused update cannot deduct payroll');team.status='playing';
team.gold=0;team.companions.update(0);assert.equal(team.companions.graceUntil,80);assert.equal(team.companions.members.length,5,'unpaid members allow grace before departing');
assert(team.events.some(event=>event.type==='companionUpkeepWarning'));
team.gold=12;team.time=team.runTime=70;team.companions.update(0);assert.equal(team.gold,0);assert.equal(team.companions.graceUntil,0);assert.equal(team.companions.nextPayrollAt,100);
team.time=team.runTime=100;team.companions.update(0);team.gold=2;team.time=team.runTime=120;team.companions.update(0);
assert.deepEqual(team.companions.members.map(member=>member.kind).sort(),['dog','owl'],'partial payroll retains the inexpensive adventure companions');assert.equal(team.gold,0);

const hurt=arena(),defender=hurt.companions.recruit('warden',{x:0,y:19.8}),mage=hurt.companions.recruit('stormcaller',{x:60,y:19.8});
const before=mage.hp;assert(hurt.companions.takeDamage(mage,100));assert(Math.abs(before-mage.hp-100/1.08*.75)<1e-8,'defense and ward apply once');
const after=mage.hp;assert.equal(hurt.companions.takeDamage(mage,100),false);assert.equal(mage.hp,after,'per-member hit immunity prevents contact pileup');
mage.invuln=0;hurt.companions.takeDamage(mage,10000);assert.equal(mage.state,'recovering');assert(!hurt.companions.combatants().includes(mage));
const target=enemy(hurt,80,0);hurt._rebuildGrid();mage._attack=0;defender._attack=999;hurt.companions.resolve();assert.equal(target.hp,10000,'recovering caster does not attack');
hurt.enemies=[];tick(hurt,COMPANION_RULES.recoveryDuration+.1);assert.equal(mage.state,'active');assert(mage.hp>0);assert(hurt.companions.combatants().includes(mage));
defender.x=0;defender.y=0;mage.x=100;mage.y=0;hurt.terrain=new Terrain({obstacles:[{id:'ward-wall',type:'log',x:50,y:20,r:8,halfLength:100,angle:Math.PI/2,structureType:'wall'}]});
assert.equal(hurt.companions.protectionMultiplier(mage),1,'ward does not extend through a sealed wall');

const smash=arena(),golem=smash.companions.recruit('golem',{x:0,y:22});
const boar=enemy(smash,75,2,{type:'boar',charge:{phase:'windup',life:.5},chargeCooldown:0});
smash._rebuildGrid();golem._attack=0;smash.companions.resolve();assert(boar.hp<10000);assert.equal(boar.charge,null);assert(boar._weaponPush?.distance>13,'golem heavy hit pushes harder than an ordinary hit');
const farBoss=enemy(smash,100,0,{type:'boss'});golem._attack=0;smash._rebuildGrid();smash.companions.resolve();assert(farBoss.hp<10000,'heavy strikes can damage bosses without needing to displace them');

const find=arena(),dog=find.companions.recruit('dog',{x:0,y:11}),scout=find.companions.recruit('owl',{x:20,y:13});
const cache={id:'treasure',type:'supply',name:'小屋补给',x:250,y:20,door:{x:250,y:30},state:'ready',discovered:false};find.settlements.sites=[cache];
find.companions._sniff(dog);assert.equal(dog.treasureTarget.id,cache.id);assert.equal(cache.discovered,false,'sniff provides direction without revealing an unseen map marker');
const tracked=enemy(find,170,0,{type:'boss'});for(let n=0;n<5;n++)enemy(find,200+n*10,30);find._rebuildGrid();find.companions._scout(scout);assert.equal(scout.scoutCount,6);assert.equal(scout.scoutTarget.id,tracked.id);
find.terrain=new Terrain({obstacles:[{id:'scout-wall',type:'log',x:100,y:20,r:10,halfLength:200,angle:Math.PI/2,structureType:'wall'}]});find.companions._sniff(dog);find.companions._scout(scout);assert.equal(dog.treasureTarget,null);assert.equal(scout.scoutTarget,null,'scouts never expose enemies behind sealed walls');
find.terrain=new Terrain({obstacles:[]});find.dungeon.active={chests:[],treasure:null};find.dungeon.vision.isVisible=()=>false;find.dungeon.canDamage=()=>true;find.companions._scout(scout);assert.equal(scout.scoutCount,0,'unexplored indoor rooms remain secret even if target gate allows a candidate');

const following=arena();for(const def of COMPANION_DEFINITIONS)following.companions.recruit(def.kind);
following.player.x=340;following.terrain=new Terrain({obstacles:[{id:'follow-rock',type:'rock',x:140,y:20,r:40}]});
for(let n=0;n<360;n++){following.update(.025);for(const member of following.companions.members){const p=foot(member);assert(following.terrain.isFree(p.x,p.y,member.r,member.flying?'air':'ground'),'all following uses each member collision profile');}}
for(const member of following.companions.members)assert(Math.hypot(member.x-following.player.x,member.y-following.player.y)<180,'every role catches up around obstacles');
for(const member of following.companions.members){member._echoes=[{life:2}];member.workTarget={x:99,y:99};}
following.companions.onSceneChange();
for(let i=0;i<following.companions.members.length;i++){const member=following.companions.members[i];assert.equal(member._echoes.length,0);assert.equal(member.workTarget,null);for(let j=i+1;j<following.companions.members.length;j++){const other=following.companions.members[j];assert(Math.hypot(foot(member).x-foot(other).x,foot(member).y-foot(other).y)>=member.r+other.r+5,'transition placement keeps the party separated');}}
// Scene relocation must not pick a free point in the next sealed room.
const enclosed=arena();for(const def of COMPANION_DEFINITIONS)enclosed.companions.recruit(def.kind);
enclosed.terrain=new Terrain({obstacles:[{id:'closed-room',type:'log',x:-40,y:20,r:8,halfLength:220,angle:Math.PI/2,structureType:'wall'}]});
enclosed.companions.onSceneChange();
for(const member of enclosed.companions.members)assert(foot(member).x>-32,'scene arrivals remain on the hero side of a sealed room wall');
console.log('Army: five distinct persistent members, payroll/grace, recovery/protection, heavy melee, wall-safe exploration, following and scene continuity passed.');
