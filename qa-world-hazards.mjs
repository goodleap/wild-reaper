import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment } from './dist/environment.js';
import { REGIONS } from './dist/world-definitions.js';
import { WORLD_HAZARD_RULES } from './dist/world-hazards.js';
import { WorldHazardArt } from './dist/world-hazard-art.js';

function arena(region='forest'){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  g.region=REGIONS.find(r=>r.id===region);g.regionIndex=REGIONS.indexOf(g.region);g.enemies=[];g.effects=[];g.events=[];g.player.invuln=0;
  g.environment=new Environment(g,{generation:false});return g;
}
const foot=(entity,isHero=false)=>({x:entity.x,y:entity.y+groundOffset(entity,isHero||entity.isCompanion)});
const pool=(kind)=>({id:`qa-${kind}`,type:'mud',kind,x:0,y:19.8,rx:100,ry:65,shape:'ellipse',seed:.4});
const snow=arena('snow');snow.environment.muds=[pool('snow')];
assert.equal(snow.environment.movementMultiplier(snow.player),.68);assert.equal(snow.environment.getImmersion(snow.player).depth,.35);
snow.environment.muds=[pool('ice')];assert.equal(snow.environment.movementMultiplier(snow.player),1);assert.equal(snow.environment.getImmersion(snow.player),null);
const bird={type:'bat',flying:true,x:0,y:0,r:11};snow.environment.muds=[pool('snow')];assert.equal(snow.environment.movementMultiplier(bird),1);assert.equal(snow.environment.getImmersion(bird),null);
const beach=arena('beach'),tide=pool('water');beach.environment.muds=[tide];
beach.environment.worldHazards.props=[{id:'tide',type:'tide',x:tide.x,y:tide.y,patch:tide,r:100,state:'warn',remaining:1,maxRemaining:1,warning:0}];
assert.equal(beach.environment.movementMultiplier(beach.player),.94);assert.equal(beach.environment.getImmersion(beach.player).depth,.25);
beach.environment.worldHazards.props[0].state='active';assert.equal(beach.environment.movementMultiplier(beach.player),.62);assert.equal(beach.environment.getImmersion(beach.player).depth,.8);
beach.player.x=102;assert.equal(beach.environment.movementMultiplier(beach.player),1);assert.equal(beach.environment.getImmersion(beach.player),null,'tide uses the same exact shoreline and cannot engulf dry surroundings');

const volcano=arena('volcano'),hazards=volcano.environment.worldHazards;
volcano.environment.muds=[pool('lava')];assert.equal(volcano.environment.getImmersion(volcano.player),null);assert.equal(volcano.environment.movementMultiplier(volcano.player),1);
const ground=volcano._spawnEnemy('slime',1),air=volcano._spawnEnemy('bat',1);
for(const e of [ground,air]){e.x=0;e.y=19.8-groundOffset(e);e.hp=e.maxHp=1000;}
const ally={id:99,kind:'warden',isCompanion:true,state:'following',x:8,y:0,r:15,hp:100};
volcano.companions={members:[ally],takeDamage(a,amount){a.hp-=amount;return true;}};
const heroHP=volcano.player.hp;hazards.update(0);
assert.equal(ground.hp,1000-WORLD_HAZARD_RULES.lava.enemyDamage);assert.equal(air.hp,1000,'surface lava cannot hit flying enemies');
assert.equal(volcano.player.hp,heroHP-WORLD_HAZARD_RULES.lava.playerDamage);assert.equal(ally.hp,100-WORLD_HAZARD_RULES.lava.playerDamage,'each friendly owns a separate contact interval');
const after=[volcano.player.hp,ally.hp,ground.hp];volcano.player.invuln=0;for(let i=0;i<10;i++)hazards.update(.05);
assert.deepEqual([volcano.player.hp,ally.hp,ground.hp],after,'overlapping frames never repeatedly damage one entity during its interval');
const newcomer=volcano._spawnEnemy('slime',1);newcomer.x=0;newcomer.y=19.8-groundOffset(newcomer);newcomer.hp=1000;hazards.update(0);
assert.equal(newcomer.hp,1000-WORLD_HAZARD_RULES.lava.enemyDamage,'a newcomer does not borrow another target contact immunity');
volcano.player.flying=true;volcano.player.invuln=0;for(let i=0;i<9;i++)hazards.update(.05);
assert.equal(volcano.player.hp,after[0],'flight also exempts the player');

const mountain=arena('mountain'),falls=mountain.environment.worldHazards;
falls.props=[{id:'fall',type:'rockfall',x:0,y:19.8,r:60,state:'warn',remaining:.1,maxRemaining:1.35,warning:0}];
const flyer=mountain._spawnEnemy('bat',1);flyer.x=0;flyer.y=19.8-groundOffset(flyer);flyer.hp=1000;
falls.update(.05);assert.equal(flyer.hp,1000,'warning phase cannot hit');falls.update(.05);assert.equal(flyer.hp,1000-WORLD_HAZARD_RULES.rockfall.enemyDamage,'falling rocks hit air and ground targets');
const blocked=mountain._spawnEnemy('slime',1);blocked.x=20;blocked.y=19.8-groundOffset(blocked);blocked.hp=1000;
const firstBlocker=mountain.terrain.firstBlocker;mountain.terrain.firstBlocker=()=>({type:'wall'});falls.update(0);assert.equal(blocked.hp,1000,'solid separation prevents environmental damage');mountain.terrain.firstBlocker=firstBlocker;
const frozen={clock:falls._clock,state:falls.props[0].state,remaining:falls.props[0].remaining,hp:flyer.hp};
for(const state of ['paused','upgrade','shop','super','dead']){mountain.status=state;falls.update(.05);assert.deepEqual({clock:falls._clock,state:falls.props[0].state,remaining:falls.props[0].remaining,hp:flyer.hp},frozen);}
mountain.status='playing';const current=mountain.environment;mountain.environment={};falls.update(.05);assert.equal(falls._clock,frozen.clock,'an inactive scene cannot advance its old environment');mountain.environment=current;
mountain.player.x=5000;falls.update(.05);assert.equal(falls.props[0].state,'idle');mountain.player.x=0;falls.update(.05);assert.equal(falls.props[0].state,'idle','an offscreen hazard must reenter through its full warning');

for(const id of ['beach','city','mountain','snow','volcano']){
  const g=arena(id),env=g.environment;
  assert.equal(env.region,id);assert.deepEqual(env._mushroomsAt(2,3),[]);assert.equal(env.mechanisms._candidate(2,3),null,'new worlds do not fall back to forest mushrooms or vines');
}

const frost=arena('snow'),frozenEnemy=frost._spawnEnemy('slime',1);Object.assign(frozenEnemy,{x:45,y:0,hp:1000,superSlowUntil:-1,superSlowFactor:.2});
const rune={type:'rune',element:'frost',x:0,y:19.8,r:48,state:'active',remaining:12,_shot:0};
frost.environment.mechanisms._rune(rune,0);assert.equal(frozenEnemy.superSlowFactor,.65,'an expired stronger slow cannot leak into frost support');assert.equal(frozenEnemy.superSlowUntil,1.6);
const frostHP=frozenEnemy.hp;frost.terrain.firstBlocker=()=>({type:'wall'});rune._shot=0;frost.environment.mechanisms._rune(rune,0);assert.equal(frozenEnemy.hp,frostHP,'frost support also respects sight blockers');

// The ground base is cached by a small style key; only the warning and active
// effect draw dynamically. Offscreen calls cannot allocate a new canvas.
function context(){const c={globalAlpha:1,createLinearGradient:()=>({addColorStop(){}})};for(const name of ['save','restore','setTransform','beginPath','moveTo','lineTo','closePath','fill','stroke','ellipse','arc','translate','drawImage','setLineDash','quadraticCurveTo','bezierCurveTo','clip'])c[name]=()=>{};return c;}
const art=new WorldHazardArt(()=>({width:0,height:0,getContext:context})),ctx=context(),options={pixelRatio:2,time:1,viewBounds:{minX:-200,minY:-200,maxX:200,maxY:200}};
falls.props[0].state='warn';falls.props[0].remaining=1;falls.props[0].warning=.25;
art.draw(ctx,current,options);const builds=art.builds;for(let i=0;i<30;i++)art.draw(ctx,current,{...options,time:i/60});assert.equal(art.builds,builds);
art.draw(ctx,current,{...options,viewBounds:{minX:1000,minY:1000,maxX:1500,maxY:1500}});assert.equal(art.builds,builds);
assert(art.cacheStats.entries<=art.cacheStats.maxEntries);
console.log('World hazards: exact tide/snow/ice/lava surfaces, independent actor intervals, flight bands, warning phases, solid cover, pause/scene freeze, no forest fallback and bounded cached art passed.');
