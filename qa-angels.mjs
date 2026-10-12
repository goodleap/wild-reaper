import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Settlements, ANGEL_RULES } from './dist/settlements.js';

function arena(){const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,elites:false,companions:false,settlements:false});g.enemies=[];g.events=[];g.effects=[];g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;return g;}
function angel(g,x=0,y=0,id='angel:fixture'){const site={id,type:'angel',name:'守望天使',x,y,door:{x,y},width:40,depth:20,r:15,interactRadius:0,state:'ready',flying:true,auraRadius:ANGEL_RULES.auraRadius,_attack:0};g.settlements.sites.push(site);return site;}
function feet(g,x,y){g.player.x=x;g.player.y=y-groundOffset(g.player,true);}
function enemy(g,x,y,hp=300){const e=g._spawnEnemy('slime',1);e.x=x;e.y=y-groundOffset(e);e.hp=e.maxHp=hp;e.speed=0;return e;}

const disabled=arena();disabled.settlements.update(.1);assert.equal(disabled.settlements.sites.length,0,'disabled generation fixtures never silently acquire an angel');
const healing=arena(),haven=angel(healing);feet(healing,0,0);healing.player.hp=40;
assert.equal(healing.settlements.getInteraction(),null,'the aura needs no one-shot blessing button');assert.equal(healing.settlements.interact(haven.id),false);
healing.settlements.update(2);assert.equal(healing.player.hp,46);assert.equal(haven.state,'ready');assert.equal(haven.healing,true);
feet(healing,ANGEL_RULES.auraRadius+.01,0);healing.settlements.update(4);assert.equal(healing.player.hp,46,'leaving the visible healing reach stops recovery');assert.equal(haven.healing,false);
feet(healing,0,0);angel(healing,10,0,'angel:overlap');healing.settlements.update(1);assert.equal(healing.player.hp,49,'overlapping havens do not multiply recovery');
healing.player.hp=99;healing.settlements.update(2);assert.equal(healing.player.hp,100);assert.equal(healing.relics.wardAmount,0,'full health no longer creates a one-shot shield');
for(const status of ['paused','shop','super','upgrade','dead']){healing.player.hp=60;healing.status=status;haven._attack=1;healing.settlements.update(1);assert.equal(healing.player.hp,60);assert.equal(haven._attack,1,'pause states freeze angel cooldowns');}healing.status='playing';
healing.dungeon.active={id:'fixture'};healing.settlements.update(1);assert.equal(healing.player.hp,60,'an overworld aura cannot heal through a castle transition');healing.dungeon.active=null;
healing.terrain=new Terrain({obstacles:[{x:25,y:0,r:12}]});feet(healing,55,0);healing.settlements.update(1);assert.equal(healing.player.hp,60,'solid walls block aura recovery');

const combat=arena(),guardian=angel(combat);feet(combat,0,0);const first=enemy(combat,75,0,40),splash=enemy(combat,112,0),far=enemy(combat,215,0),outside=enemy(combat,235,0),sleeping=enemy(combat,40,0);sleeping.guardActive=false;
combat.settlements.update(.025);assert(first.hp<=0);assert.equal(combat.kills,1);assert.equal(combat.player.xp,first.xp,'angel kills use the ordinary kill and experience path');assert(combat.gems.length>0,'normal crystal loot remains available');
assert.equal(splash.hp,300-ANGEL_RULES.damage);assert.equal(splash.hitSource,'angel');assert.equal(far.hp,300);assert.equal(outside.hp,300);assert.equal(sleeping.hp,300,'dormant guarded objectives cannot be cleared remotely');
const strike=combat.effects.find(e=>e.type==='angelStrike');assert(strike);assert.equal(strike.x,75);assert.equal(strike.y,0);assert.equal(strike.sourceX,guardian.x);assert.equal(strike.sourceY,guardian.y);assert.equal(strike.r,ANGEL_RULES.strikeRadius);
combat.settlements.update(2);assert.equal(splash.hp,185);combat.settlements.update(.50001);assert.equal(splash.hp,70);assert.equal(outside.hp,300);
const fixed={x:guardian.x,y:guardian.y};feet(combat,1500,1500);combat.settlements.update(5);assert.equal(splash.hp,70,'offscreen angels do not farm distant monsters');assert.deepEqual({x:guardian.x,y:guardian.y},fixed,'the guardian never follows the player or a target');
const wall=arena();angel(wall);feet(wall,0,0);wall.terrain=new Terrain({obstacles:[{x:50,y:0,r:20}]});const shielded=enemy(wall,100,0);wall.settlements.update(5);assert.equal(shielded.hp,300,'nearby lightning cannot strike through a building wall');
const inCastle=enemy(wall,0,45);inCastle.dungeonId='castle';wall.settlements.update(5);assert.equal(inCastle.hp,300,'castle enemies are excluded even if their numeric coordinates overlap the haven');

const generation=arena();generation.regions={portals:[]};generation.portal=null;generation.settlements=new Settlements(generation);
const spawnAngel=generation.settlements.sites.find(s=>s.id==='angel:spawn:0');assert(spawnAngel);assert(Math.hypot(spawnAngel.x,spawnAngel.y-19.8)<=145.01);assert(spawnAngel.flying);
const locked={id:'portal:one',x:800,y:300,state:'locked'};generation.regions.portals=[locked];generation.portal=locked;generation.settlements.ensureAngels();assert.equal(generation.settlements.sites.filter(s=>s.type==='angel').length,1);
locked.state='active';generation.settlements.ensureAngels();const doorAngel=generation.settlements.sites.find(s=>s.id==='angel:portal:one');assert(doorAngel);assert(Math.hypot(doorAngel.x-locked.x,doorAngel.y-locked.y)<=145.01);
const retained=generation.settlements.sites.slice();for(let i=0;i<5;i++)generation.settlements.ensureAngels();assert.deepEqual(generation.settlements.sites,retained,'active portals never clone their angels on revisits');
generation.regionIndex=1;generation.regions.portals=[{id:'portal:back',x:0,y:19.8,state:'active'}];generation.portal=null;generation.settlements.resetRegion();assert(!generation.settlements.sites.some(s=>s.id==='angel:spawn:0'));assert(generation.settlements.sites.some(s=>s.id==='angel:portal:back'),'the activated return portal also has a persistent guardian');

console.log('Angels: persistent spawn/active-portal guardians, deduplication, flying state, continuous capped nonstacking aura, pause/castle/wall isolation, local splash lightning, cooldowns and ordinary kill rewards passed.');
