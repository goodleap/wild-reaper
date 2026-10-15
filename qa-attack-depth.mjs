import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { WeaponTrail } from './dist/weapon-trails.js';
import { sceneItemVisible, compareSceneDepth } from './dist/scene-rendering.js';
import { Game } from './dist/engine.js';
import { HERO_CHOICES } from './dist/heroes.js';

const h=harness('?debug');
h.run(`game=new Game({adventure:false,encounters:false,environment:false,settlements:false,companions:false});
game.terrain=new game.terrain.constructor({obstacles:[]});game.enemies=[];game.effects=[];
game.player.x=game.player.y=0;game.bullets=[];game.enemyBullets=[];game.orbitals=[];
var depthDrawLog=[],depthHeroArt=[];
const depthActorPainter=drawActor,depthArrowPainter=combatArt.drawArrow.bind(combatArt),depthHeroPainter=humanoidArt.draw.bind(humanoidArt);
drawActor=actor=>{depthDrawLog.push('body');depthActorPainter(actor);};
humanoidArt.draw=(target,kind,options)=>{depthHeroArt.push(kind);return depthHeroPainter(target,kind,options);};
combatArt.drawArrow=(target,bullet,options)=>{depthDrawLog.push(bullet.id);depthArrowPainter(target,bullet,options);};`);
const game=h.run('game'),p=game.player;
const arrows=[];
for(let i=0;i<8;i++){
  const angle=(i+.5)*Math.PI/4;
  arrows.push({id:`arrow-${i}`,x:Math.cos(angle)*12,y:Math.sin(angle)*12,angle,vx:Math.cos(angle)*640,vy:Math.sin(angle)*640,r:4,life:1});
}
game.bullets=arrows;
assert.equal(HERO_CHOICES.length,3,'only the three standard characters are selectable');
function checkHeroDepth(heroId,appearanceId){
  Object.assign(p,{heroId,appearanceId});
  h.run(`depthDrawLog=[];depthHeroArt=[];drawScene([actorVisual(game.player,true)],[],game.player);`);
  const order=Array.from(h.run('depthDrawLog')),body=order.indexOf('body');
  assert.equal(order.length,9,'each real arrow and the actor draw exactly once');
  assert.deepEqual(Array.from(h.run('depthHeroArt')),[`${heroId}-v2`],'the shipped painter uses the standard directional artwork');
  for(const arrow of arrows)assert.equal(order.indexOf(arrow.id)<body,arrow.vy<0,`${appearanceId}: actual shot direction controls body overlap`);
}
for(const hero of HERO_CHOICES)checkHeroDepth(hero.heroId,hero.appearanceId);

// Old save IDs are migration inputs, never additional selectable appearances.
// Resolving them before the first frame keeps the same eight-direction depth.
for(const hero of HERO_CHOICES)for(const appearanceId of [hero.heroId,undefined]){
  const restored=new Game({hero:hero.heroId,appearanceId,terrain:new game.terrain.constructor({obstacles:[]}),adventure:false});
  assert.equal(restored.appearanceId,hero.appearanceId);assert.equal(restored.player.appearanceId,hero.appearanceId);
  assert(!HERO_CHOICES.some(choice=>choice.id===hero.heroId));
  checkHeroDepth(restored.player.heroId,restored.player.appearanceId);
}

// Current position, not the initial launch heading or the owner's movement,
// controls a detached shot after it bounces or crosses to the other side.
game.bullets=[{...arrows[0],id:'returning',x:0,y:-30,angle:Math.PI/2,vy:640}];
p.facing=Math.PI/2;p.moveFacing=Math.PI/2;
h.run('depthDrawLog=[];drawScene([actorVisual(game.player,true)],[],game.player);');
assert.deepEqual(Array.from(h.run('depthDrawLog')),['returning','body']);
game.bullets=[{...arrows[0],id:'launch-up',x:0,y:0,angle:-Math.PI/2,vx:0,vy:-640}];
h.run('depthDrawLog=[];drawScene([actorVisual(game.player,true)],[],game.player);');
assert.deepEqual(Array.from(h.run('depthDrawLog')),['launch-up','body'],'the unchanged launch point is already behind the body');

const trail=new WeaponTrail('orbit');
for(const [i,y] of [-12,-6,0,6,12].entries())trail.add(0,y,i*.01);
game._clock=.04;game.bullets=[];game.orbitals=[{x:0,y:12,heading:Math.PI/2,trail}];
h.run('combatOptions.time=game._clock;');
let items=h.run('collectAttackDepthItems([actorVisual(game.player,true)])');
const foot=h.run('actorVisual(game.player,true).footY');
assert.equal(items.length,1,'a rigid orbital and its own trail keep their original internal drawing order');
assert(items[0].sortY>foot,'the orbital depth follows its current position');
assert(items.every(item=>Number.isFinite(item.sortY)&&item.kind==='attack'));
const before=Array.from(trail.points),clock=trail.clock;
for(const item of items)item.draw(h.nodes['game-canvas'].getContext('2d'));
assert.deepEqual(Array.from(trail.points),before);assert.equal(trail.clock,clock,'drawing never advances trail samples');

game.orbitals=[];game.enemyBullets=[{type:'spore',x:0,y:foot-1,vx:0,vy:-70,r:6,life:1}];
items=h.run('collectAttackDepthItems([actorVisual(game.player,true)])');
assert.equal(items[0].sortY,foot-1-.01,'legacy enemy bullets already contain projected ground Y, with only a directional tie break');

game.enemyBullets=[];
const wave={type:'swordEnergy',x:0,y:-12,groundY:7.8,groundLift:19.8,angle:-Math.PI/2,r:20,age:.04,life:.28,maxLife:.32,delay:0};
game.attacks.sword.energyWaves=[wave,{...wave,delay:.1},{...wave,life:0}];
items=h.run('collectAttackDepthItems([actorVisual(game.player,true)])');
assert.equal(items.length,1);assert.equal(items[0].effect,wave);assert.equal(items[0].sortY,wave.groundY);
assert(sceneItemVisible(items[0],{isVisible:(x,y)=>y<10}));
assert(!sceneItemVisible(items[0],{isVisible:(x,y)=>y>10}),'depth attacks retain ground-space dungeon visibility');

const wall={kind:'terrain',sortY:10,prop:{id:'foreground-wall'}},actor={kind:'actor',sortY:foot,actor:{orderId:1}};
assert.deepEqual([actor,wall,items[0]].sort(compareSceneDepth).map(item=>item.kind),['attack','terrain','actor'],'foreground walls still cover an attack behind their base');
const equal=[{kind:'attack',sortY:10,orderId:2},{kind:'attack',sortY:10,orderId:1}];
assert.deepEqual(equal.sort(compareSceneDepth).map(item=>item.orderId),[1,2],'same-depth effects have a stable total order');

// Exercise the shipped render pass too: a migrated arrow cannot also remain
// in the former all-foreground overlay pass.
game.attacks.sword.energyWaves=[];game.bullets=[{...arrows[5],id:'once'}];
h.run('depthDrawLog=[];shippedRenderGame();');
assert.equal(Array.from(h.run('depthDrawLog')).filter(id=>id==='once').length,1);
const state=JSON.stringify({x:p.x,y:p.y,hp:p.hp,clock:game._clock,bullet:game.bullets[0]});
h.run('shippedRenderGame();shippedRenderGame();');
assert.equal(JSON.stringify({x:p.x,y:p.y,hp:p.hp,clock:game._clock,bullet:game.bullets[0]}),state,'repeated paused draws preserve combat state');
game.bullets=[];game.effects=[];game.abilities.effects=[];
assert.equal(h.run('collectAttackDepthItems([actorVisual(game.player,true)]).length'),0,'cleared scene has no retained attack draw items');
console.log('Attack depth: three standard heroes / eight directions, explicit legacy-save migration, moving shots, rigid weapons with their own trails, projected enemy bullets, delayed energy, stable scene/wall/fog ordering, exactly-once real render and immutable combat state passed (VM DOM / mocked Canvas).');
