import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Settlements, ANGEL_RULES } from './dist/settlements.js';

// Healing fixtures use 100 max HP independently of the selected hero's stats.
function arena(){const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,elites:false,companions:false,settlements:false});g.enemies=[];g.events=[];g.effects=[];g.nextBossAt=Infinity;g.player.hp=g.player.maxHp=100;g.player.xpNext=Infinity;g.crystalsNext=Infinity;return g;}
function angel(g,x=0,y=0,id='angel:fixture'){const site={id,type:'angel',name:'守望天使',x,y,door:{x,y},width:40,depth:20,r:15,interactRadius:0,state:'ready',flying:true,guardRadius:ANGEL_RULES.guardRadius,auraRadius:ANGEL_RULES.guardRadius,attackRange:ANGEL_RULES.guardRadius,_attack:0};g.settlements.sites.push(site);return site;}
function feet(g,x,y){g.player.x=x;g.player.y=y-groundOffset(g.player,true);}
function enemy(g,x,y,hp=300){const e=g._spawnEnemy('slime',1);e.x=x;e.y=y-groundOffset(e);e.hp=e.maxHp=hp;e.speed=0;return e;}

assert.equal(ANGEL_RULES.guardRadius,150);assert.equal(ANGEL_RULES.auraRadius,ANGEL_RULES.guardRadius);assert.equal(ANGEL_RULES.attackRange,ANGEL_RULES.guardRadius);assert.equal(ANGEL_RULES.attackInterval,.1);
const disabled=arena();disabled.settlements.update(.1);assert.equal(disabled.settlements.sites.length,0,'disabled generation fixtures never silently acquire an angel');
const healing=arena(),haven=angel(healing);feet(healing,0,0);healing.player.hp=40;
assert.equal(healing.settlements.getInteraction(),null,'the aura needs no one-shot blessing button');assert.equal(healing.settlements.interact(haven.id),false);
healing.settlements.update(2);assert.equal(healing.player.hp,46);assert.equal(haven.state,'ready');assert.equal(haven.healing,true);
feet(healing,ANGEL_RULES.auraRadius+.01,0);healing.settlements.update(4);assert.equal(healing.player.hp,46,'leaving the visible healing reach stops recovery');assert.equal(haven.healing,false);
feet(healing,0,0);angel(healing,10,0,'angel:overlap');healing.settlements.update(1);assert.equal(healing.player.hp,49,'overlapping havens do not multiply recovery');
healing.player.hp=99;healing.settlements.update(2);assert.equal(healing.player.hp,100);assert.equal(healing.relics.wardAmount,0,'full health no longer creates a one-shot shield');
for(const status of ['paused','shop','super','upgrade','dead']){healing.player.hp=60;healing.status=status;haven._attack=1;healing.settlements.update(1);assert.equal(healing.player.hp,60);assert.equal(haven._attack,1,'pause states freeze angel cooldowns');}healing.status='playing';
healing.dungeon.active={id:'fixture'};healing.settlements.update(1);assert.equal(healing.player.hp,60,'an overworld aura cannot heal through a castle transition');healing.dungeon.active=null;
healing.terrain=new Terrain({obstacles:[{x:25,y:0,r:12,structureType:'hut-wall',heightBand:'high'}]});feet(healing,55,0);healing.settlements.update(1);assert.equal(healing.player.hp,60,'solid walls block aura recovery');

const combat=arena(),guardian=angel(combat);feet(combat,0,0);const first=enemy(combat,75,0,40),splash=enemy(combat,112,0),far=enemy(combat,215,0),outside=enemy(combat,ANGEL_RULES.guardRadius+.01,0),sleeping=enemy(combat,40,0);sleeping.guardActive=false;
combat.settlements.update(.025);assert(first.hp<=0);assert.equal(combat.kills,1);assert.equal(combat.player.xp,first.xp,'angel kills use the ordinary kill and experience path');assert(combat.gems.length>0,'normal crystal loot remains available');
assert.equal(splash.hp,300-ANGEL_RULES.damage);assert.equal(splash.hitSource,'angel');assert.equal(far.hp,300);assert.equal(outside.hp,300);assert.equal(sleeping.hp,300,'dormant guarded objectives cannot be cleared remotely');
const strike=combat.effects.find(e=>e.type==='angelStrike');assert(strike);assert.equal(strike.x,75);assert.equal(strike.y,0);assert.equal(strike.sourceX,guardian.x);assert.equal(strike.sourceY,guardian.y);assert.equal(strike.r,ANGEL_RULES.strikeRadius);assert.equal(strike.maxLife,.18);assert.equal(guardian.castFace,.25,'a real attack starts the focused face');
combat.settlements.update(.099);assert.equal(splash.hp,185,'rapid guardian strikes still respect their full cooldown');combat.settlements.update(.00101);assert.equal(splash.hp,70);assert.equal(outside.hp,300);
combat.status='paused';combat.settlements.update(.1);assert.equal(guardian.castFace,.25,'pausing freezes the cast expression');combat.status='playing';
const fixed={x:guardian.x,y:guardian.y};feet(combat,1500,1500);combat.settlements.update(5);assert.equal(splash.hp,70,'offscreen angels do not farm distant monsters');assert.deepEqual({x:guardian.x,y:guardian.y},fixed,'the guardian never follows the player or a target');assert.equal(guardian.castFace,0,'the focused face fades when no target remains');
// The same 150-unit boundary is inclusive for both healing and offensive reach.
const boundary=arena();angel(boundary);feet(boundary,ANGEL_RULES.guardRadius,0);boundary.player.hp=40;
const edgeEnemy=enemy(boundary,ANGEL_RULES.guardRadius,0);boundary.settlements.update(1);
assert.equal(boundary.player.hp,43);assert.equal(edgeEnemy.hp,300-ANGEL_RULES.damage);
const beyond=arena();angel(beyond);feet(beyond,ANGEL_RULES.guardRadius+.01,0);beyond.player.hp=40;
const beyondEnemy=enemy(beyond,ANGEL_RULES.guardRadius+.01,0);beyond.settlements.update(1);
assert.equal(beyond.player.hp,40);assert.equal(beyondEnemy.hp,300,'splash does not extend the guardian reach past its visible boundary');
// On phones a guardian may be offscreen even while the player remains inside
// its aura. Visible attackers are still defended against; remote enemies never farm.
const phone=arena(),phoneAngel=angel(phone);phone.viewWidth=180;phone.viewHeight=180;feet(phone,120,0);phone.player.hp=40;
const nearbyThreat=enemy(phone,120,40,2000);assert.equal(phone._inView(phoneAngel),false);phone.settlements.update(.025);
assert.equal(nearbyThreat.hp,2000-ANGEL_RULES.damage);assert(phone.player.hp>40);
for(let i=0;i<9;i++)phone.settlements.update(.10001);
assert.equal(nearbyThreat.hp,2000-ANGEL_RULES.damage*10,'guardian attacks remain at ten strikes per second without global thunder flashes');
assert(phone.effects.filter(e=>e.type==='angelStrike').length===10);assert.equal(phone.storm,null);
// Exact cadence at 60 Hz must not lose a frame to a floating-point remainder.
const cadence=arena();angel(cadence);feet(cadence,0,0);const durable=enemy(cadence,80,0,10000);let livePeak=0;
for(let frame=0;frame<60;frame++){
  for(const effect of cadence.effects)effect.life-=1/60;
  cadence.effects=cadence.effects.filter(effect=>effect.life>0);
  cadence.settlements.update(1/60);
  livePeak=Math.max(livePeak,cadence.effects.filter(effect=>effect.type==='angelStrike').length);
}
assert.equal(durable.hp,10000-10*ANGEL_RULES.damage,'the guardian delivers ten strikes during a one-second 60 Hz window');
assert(livePeak<=2,'the brief sky-strike lifetime bounds each guardian to two simultaneous bolts');assert.equal(cadence.storm,null);
const spawning=enemy(cadence,0,30);spawning.rescueSpawnGrace=.8;cadence.settlements.update(.2);assert.equal(spawning.hp,300,'guardians respect rescue spawn safety');
const wall=arena();angel(wall);feet(wall,0,0);wall.terrain=new Terrain({obstacles:[{x:50,y:0,r:20,structureType:'hut-wall',heightBand:'high'}]});const shielded=enemy(wall,100,0);wall.settlements.update(5);assert.equal(shielded.hp,300-ANGEL_RULES.damage,'overhead angel lightning reaches an in-range outdoor target behind tall cover');
const inCastle=enemy(wall,0,45);inCastle.dungeonId='castle';wall.settlements.update(5);assert.equal(inCastle.hp,300,'castle enemies are excluded even if their numeric coordinates overlap the haven');

const generation=arena();generation.regions={portals:[]};generation.portal=null;generation.settlements=new Settlements(generation);
const spawnAngel=generation.settlements.sites.find(s=>s.id==='angel:spawn:0');assert(spawnAngel);assert(Math.hypot(spawnAngel.x,spawnAngel.y-19.8)<=145.01);assert(spawnAngel.flying);assert.equal(spawnAngel.guardRadius,ANGEL_RULES.guardRadius);assert.equal(spawnAngel.auraRadius,spawnAngel.guardRadius);assert.equal(spawnAngel.attackRange,spawnAngel.guardRadius);
const locked={id:'portal:one',x:800,y:300,state:'locked'};generation.regions.portals=[locked];generation.portal=locked;generation.settlements.ensureAngels();assert.equal(generation.settlements.sites.filter(s=>s.type==='angel').length,1);
locked.state='active';generation.settlements.ensureAngels();assert.deepEqual(generation.settlements.sites.filter(s=>s.type==='angel'),[spawnAngel],'activating a portal creates no guardian');
generation.portal={id:'portal:fallback',x:900,y:-300,state:'active'};
const retained=generation.settlements.sites.slice();for(let i=0;i<5;i++)generation.settlements.ensureAngels();assert.deepEqual(generation.settlements.sites,retained,'neither portal lists nor the fallback gate create angels on revisits');
generation.regionIndex=1;generation.regions.portals=[{id:'portal:back',x:0,y:19.8,state:'active'}];generation.portal=null;generation.settlements.resetRegion();assert(!generation.settlements.sites.some(s=>s.type==='angel'),'return portals do not receive a replacement spawn or guardian');
feet(generation,0,19.8);generation.player.hp=40;const unguarded=enemy(generation,35,19.8);generation.settlements.update(1);
assert.equal(generation.player.hp,40,'an unguarded return gate does not heal');assert.equal(unguarded.hp,300,'an unguarded return gate does not attack');

// Cached world restoration also drops old portal guardians without relocating
// them or deleting an independently placed/spawn guardian.
const restored=arena(),originalSpawn=angel(restored,0,0,'angel:spawn:0'),independent=angel(restored,900,900,'angel:fixture:independent');
originalSpawn.anchorId='spawn:0';
const byAnchor=angel(restored,800,300,'angel:legacy');byAnchor.anchorId='portal:legacy';
angel(restored,800,300,'angel:portal:legacy-id');
restored.regions.saveWorld();restored.settlements=new Settlements(restored,{generation:false});
assert(restored.regions.restoreWorld(0));
assert.deepEqual(restored.settlements.sites.filter(s=>s.type==='angel'),[originalSpawn,independent],'restoration removes gate IDs and anchors while retaining other angels');
restored.settlements.ensureAngels();assert.equal(restored.settlements.sites.length,2,'cleanup is stable when generation is disabled');

console.log('Angels: persistent spawn guardian, no portal guardians or gate aura, restored-world cleanup, deduplication, flying state, continuous capped nonstacking aura, pause/castle/wall isolation, shared 150-unit guard boundary, offscreen-guardian phone protection, local splash lightning, 0.1-second cooldowns and ordinary kill rewards passed.');
