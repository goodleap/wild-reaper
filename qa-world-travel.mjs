import assert from 'node:assert/strict';
import { WorldTravel } from './dist/world-travel.js';
import { WorldSafety } from './dist/world-safety.js';
import { SceneTransition } from './dist/scene-transition.js';
import { REGIONS, WORLD_IDS } from './dist/world-definitions.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { damageFriendly } from './dist/friendly-combat.js';
import { CombatResolution } from './dist/combat-resolution.js';
import { AbilityRuntime } from './dist/ability-runtime.js';

const definition=(worldId,x,y)=>({worldId,atlas:{x,y},core:{id:`core:${worldId}`,name:worldId,kind:'camp',x:0,y:0,radius:300,artTheme:'forest',facilities:[],waypoint:{x:0,y:0,width:56,depth:36}}});
const config={startWorldId:'rift-forest',regions:[definition('rift-forest',0,0),definition('marsh',1,0),definition('verdant-rift',0,1)],
  connections:[{id:'forest-marsh',from:'rift-forest',to:'marsh',name:'林间湿地路',endpoints:{'rift-forest':{x:550,y:0,arrivalDirection:{x:-1,y:0}},marsh:{x:-500,y:0,arrivalDirection:{x:1,y:0}}}}]};
const place=(g,x,y)=>{g.player.x=x;g.player.y=y-groundOffset(g.player,true);};
const create=(options={})=>{
  const g={mode:'world',_worldExploration:true,worldId:'rift-forest',regionIndex:WORLD_IDS.indexOf('rift-forest'),region:REGIONS[WORLD_IDS.indexOf('rift-forest')],
    debug:false,status:'playing',sceneKind:'world',player:{x:0,y:0,r:15,hp:100,heroId:'traveler'},dungeon:{active:null},events:[],saved:[],
    terrain:{structures:new Map(),setStructures(props,owner){this.structures.set(owner,props);},isFree(){return true;},firstBlocker(){return null;}},
    _emit(type,data){this.events.push({type,...data});},_scheduleWorldSave(reason){this.saved.push(reason);},_trySkillUpgrade(){},...options};
  g.sceneTransition=new SceneTransition(g);g.worldTravel=new WorldTravel(g,{config});
  g._switchRegion=portal=>{g.regionIndex=portal.nextRegionIndex;g.region=REGIONS[g.regionIndex];g.worldId=g.region.id;g.worldTravel.prepareRegion();
    const arrival=g.worldTravel.arrivalPoint(portal);assert(arrival,'fast travel has a checked waypoint landing');place(g,arrival.x,arrival.y);g.worldTravel.onRegionEntered();return true;};
  return g;
};
const enter=(g,id)=>{g.worldId=id;g.regionIndex=WORLD_IDS.indexOf(id);g.region=REGIONS[g.regionIndex];g.worldTravel.onRegionEntered();};

const g=create();place(g,0,75);g.worldTravel.initialize();
assert.deepEqual(g.worldTravel.serialize().discovered,['rift-forest']);assert(g.worldTravel.activated.has('rift-forest'));
assert.equal(g.terrain.structures.get('world-waypoints')[0].halfLength,10,'56 × 36 waypoint has its measured ground footprint');
const foundation=g.terrain.structures.get('world-waypoints')[0];
assert.equal(foundation.y,-18,'waypoint anchor is the front edge, matching the painter');
assert.equal(foundation.y-foundation.r,-36);assert.equal(foundation.y+foundation.r,0,'collision never projects beyond the visible front edge');
const doorwayTerrain=new Terrain();doorwayTerrain.setStructures([foundation],'world-waypoints');
assert(doorwayTerrain.isFree(0,30,18),'a complete body can stand at the declared waypoint door');
assert(!doorwayTerrain.isFree(0,-18,15),'the waypoint body remains solid');
assert.equal(g.worldTravel.canTravel('marsh'),false);assert.match(g.worldTravel.travelReason('marsh'),/尚未到达/);
place(g,700,0);enter(g,'marsh');assert(g.worldTravel.discovered.has('marsh'));assert(!g.worldTravel.activated.has('marsh'),'entering a region does not activate a remote waypoint');
place(g,0,75);g.worldTravel.update();assert(g.worldTravel.activated.has('marsh'));
enter(g,'rift-forest');place(g,700,0);assert.equal(g.worldTravel.canTravel('marsh'),false,'the atlas does not enable travel from the field');
place(g,0,75);assert(g.worldTravel.canTravel('marsh'));assert(g.worldTravel.interact('waypoint:rift-forest'));
assert.equal(g.events.at(-1).type,'worldTravelOpen');
const atlas=g.worldTravel.getAtlas();assert.equal(atlas.regions.length,3);assert.equal(atlas.regions.find(r=>r.worldId==='verdant-rift').discovered,false);assert.equal(atlas.connections[0].connected,true);
const portal=g.worldTravel.portalTo(WORLD_IDS.indexOf('marsh'));assert.equal(portal.natural,true);assert.equal(portal.state,'active');assert.equal(portal.connectionId,[WORLD_IDS.indexOf('rift-forest'),WORLD_IDS.indexOf('marsh')].sort((a,b)=>a-b).join(':'));assert.equal(portal.x,550);
assert.equal(g.worldTravel.portalTo(WORLD_IDS.indexOf('verdant-rift')),null,'no invented direct connection');

let switches=0;const switchRegion=g._switchRegion;g._switchRegion=portal=>{switches++;assert.equal(g.sceneTransition.opacity,1,'destination changes under a fully opaque frame');return switchRegion(portal);};
assert(g.worldTravel.requestTravel('marsh'));assert(g.worldTravel.pending);assert.equal(g.worldTravel.requestTravel('marsh'),false);
g.sceneTransition.update(.05);g.sceneTransition.update(.05);assert.equal(switches,0);
g.sceneTransition.update(.05);assert.equal(switches,1);assert.equal(g.worldId,'marsh');assert.equal(g.worldTravel.pending,null);
for(let i=0;i<6;i++)g.sceneTransition.update(.05);assert.equal(g.sceneTransition.active,false);assert.equal(switches,1);
assert(g.worldTravel.setRestAnchor({id:'rest:marsh',x:65,y:90}));assert.equal(g.worldTravel.getRestAnchor().worldId,'marsh');
assert.equal(g.worldTravel.setRestAnchor({id:'bad',x:900,y:900}),false,'rest anchors belong to the protected core');
const restored=create();assert(restored.worldTravel.restore(g.worldTravel.serialize()));assert(restored.worldTravel.activated.has('marsh'));assert.equal(restored.worldTravel.getRestAnchor().facilityId,'rest:marsh');
assert.equal(restored.worldTravel.portalTo(WORLD_IDS.indexOf('marsh')).connectionId,portal.connectionId,'serialized travel and canonical region connection IDs remain aligned');
const debug=create({debug:true});assert.equal(debug.worldTravel.restore(g.worldTravel.serialize()),false);place(debug,0,75);debug.worldTravel.initialize();
assert(debug.worldTravel.enabled&&debug.worldTravel.activated.has('rift-forest'),'debug exercises the same world mechanics');assert.equal(debug.saved.length,0,'debug does not write formal progression');assert(!debug.worldTravel.activated.has('marsh'),'debug does not read formal progression');
for(const options of [{mode:'story'},{mode:'dungeon'},{stage:{}},{expedition:{}},{worldId:'forest'}])assert.equal(create(options).worldTravel.enabled,false);

const safety=g.worldTravel.safety;place(g,0,0);
assert(safety.protects(g.player));assert.equal(safety.allowsSpawn(280,0,25),false);assert(safety.allowsSpawn(450,0,20));
assert(safety.blocksSegment(-500,0,500,0,5),'fast bullets cannot tunnel across the whole core');assert(!safety.blocksSegment(-500,450,500,450,5));
const enemy={type:'slime',r:20,x:450,y:0,hp:50,territoryHome:{x:500,y:0},territoryId:'group',territoryState:'chasing',charge:{},cast:{},_territoryProvokedUntil:100};
enemy.y=-groundOffset(enemy);
const move=safety.limitMovement(enemy,-1000,0);assert(enemy.x+move.dx>=326,'swept movement stops before the body enters town');assert.equal(move.dy,0);
enemy.x=50;assert(safety.resolveEnemyPosition(enemy));assert(safety.allowsSpawn(enemy.x,enemy.y+groundOffset(enemy),enemy.r),'forced displacement is resolved outside the boundary without a kill');assert.equal(enemy.hp,50);
g._clearRegionalBossAttacks=()=>{};g._moveEnemy=()=>{};assert(safety.updateEnemy(enemy,.05));assert.equal(enemy.territoryState,'returning');assert.equal(enemy.charge,null);
let hurts=0;g._hurtPlayer=()=>{hurts++;return true;};assert.equal(damageFriendly(g,g.player,12,'enemy'),false);assert.equal(hurts,0);
assert.equal(new CombatResolution(g).damagePlayer(12,'lava'),false,'direct player damage also respects safety');
const ally={x:20,y:0,r:15,hp:20,isCompanion:true,state:'following'};ally.y=-groundOffset(ally,true);
g.companions={members:[ally],takeDamage(){hurts++;return true;}};assert.equal(damageFriendly(g,ally,12,'enemy'),false);assert.equal(hurts,0);
const abilities=new AbilityRuntime(g);assert.equal(abilities.eligible({hostile:true,profile:'ground',caster:enemy},g.player),false,'hostile pull and debuffs cannot target a protected character');
g.dungeon.active={id:'cave'};assert.equal(safety.protects(g.player),false,'surface cores do not leak into interior coordinates');
const inactive=new WorldSafety(g);assert.equal(inactive.contains(0,0),false);
console.log('World travel, waypoint activation, atomic transitions, session isolation and town safety checks passed.');
