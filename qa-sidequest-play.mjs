import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { NavigationRoute } from './dist/navigation-route.js';
import { foot,distance } from './dist/sidequests/base.js';

const dt=.05;
function launch(worldId,initialWeaponId='sword'){
  const game=new Game({mode:'world',worldId,initialWeaponId,environment:false,encounters:false,elites:false,companions:false,settlements:false,questStorage:null});
  game.enemies=[];game.territories.groups=[];game.territories.byId.clear();game._rebuildGrid();return game;
}
function place(game,point){const before=foot(game.player);game.player.x+=point.x-before.x;game.player.y+=point.y-before.y;}
function tick(game,input={}){game.update(dt,input);assert.equal(game.status,'playing','normal play does not die or become stuck in a modal');game.events=[];}
function walk(game,goal,{stop=18,max=1200}={}){
  const plan=new NavigationRoute(game.terrain).update(foot(game.player),goal,{radius:game.player.r,bodyRadius:game.player.r,time:game._clock});
  assert(plan?.complete,'the actual player footprint has a complete walking route');let index=1;
  for(let frame=0;frame<max;frame++){
    const here=foot(game.player);if(distance(here,goal)<=stop)return;
    while(index<plan.path.length-1&&distance(here,plan.path[index])<12)index++;
    const target=plan.path[index]||goal,dx=target.x-here.x,dy=target.y-here.y,d=Math.hypot(dx,dy),scale=Math.min(1,d/(game.player.speed*dt));
    tick(game,{x:dx/Math.max(d,1)*scale,y:dy/Math.max(d,1)*scale});
  }
  assert.fail(`full-frame movement stalled: ${JSON.stringify({here:foot(game.player),goal})}`);
}
function accept(game,id){
  const scene=game.quests.sidequests.scenes.get(id);place(game,foot(scene.actors.get('giver')));tick(game);
  assert(game.requestInteraction(`sidequest:${id}:discover`));assert(game.quests.accept(id));tick(game);return scene;
}
function use(game,scene,key){
  const action=scene.actions().find(action=>action.action===key);assert(action,`${scene.id}: ${key} is offered`);
  walk(game,action,{stop:24});assert(game.requestInteraction(action.id),`${key} goes through the normal interaction dispatcher`);tick(game);
}

// Keep the enemy AI, starter sword and normal health: a full-loop sparring
// result is nonlethal and both participants can immediately try again.
{
  const game=launch('mountain'),scene=accept(game,'summit-duel');use(game,scene,'start-spear');
  let frames=0,moved=false,hurt=false;const initial=foot(scene.alive('practice')[0]),hp=game.player.hp;
  while(scene.state.choices.active&&frames++<1500){
    const opponent=scene.alive('practice')[0];assert(opponent);const p=foot(game.player),enemy=foot(opponent),angle=Math.atan2(p.y-enemy.y,p.x-enemy.x)+.32;
    moved||=distance(initial,enemy)>8;hurt||=game.player.hp<hp;
    const target={x:Math.max(scene.narrow.x-80,Math.min(scene.narrow.x+80,enemy.x+Math.cos(angle)*65)),y:Math.max(scene.narrow.y-140,Math.min(scene.narrow.y+140,enemy.y+Math.sin(angle)*65))};
    const dx=target.x-p.x,dy=target.y-p.y,length=Math.hypot(dx,dy);tick(game,{x:dx/Math.max(1,length),y:dy/Math.max(1,length),skill:true});
  }
  assert(frames<1500,'ordinary starter combat resolves the duel');assert(moved,'the opponent runs its normal movement AI');
  assert(scene.done('spear')||hurt,'either a real victory or a real nonlethal defeat occurred');assert(game.player.hp>0);assert.equal(scene.alive('practice').length,0);
  use(game,scene,'start-spear');assert.equal(scene.state.choices.active,'spear');use(game,scene,'stop');assert.equal(scene.alive('practice').length,0);game.dispose();
}

// Carrying is exercised through the entire input/combat loop, with living
// room guards. No movement, automatic attack or enemy update is stubbed.
{
  const game=launch('ruins','arrow'),scene=accept(game,'overdue-book');use(game,scene,'enter');use(game,scene,'open-side');use(game,scene,'carry');
  assert(scene.blocksPlayerAttacks);const from=foot(game.player),volley=game._volley||0,guards=scene.alive('book-guards');assert(guards.length);
  const health=guards.map(enemy=>enemy.hp);walk(game,{x:340,y:-105});for(let i=0;i<20;i++)tick(game);
  assert(distance(from,foot(game.player))>50,'the box moves with actual player input');assert.equal(game._volley||0,volley,'carrying pauses automatic weapon volleys');
  assert.deepEqual(guards.map(enemy=>enemy.hp),health,'living guards receive no residual hero damage while carrying');
  use(game,scene,'put-down');assert.equal(scene.blocksPlayerAttacks,false);
  for(let i=0;i<100&&!(guards.some((enemy,index)=>enemy.hp<health[index])&&(game._volley||0)>volley);i++)tick(game);
  assert((game._volley||0)>volley,'putting the box down resumes normal automatic attacks');assert(guards.some((enemy,index)=>enemy.hp<health[index]),'resumed attacks deal actual damage');
  use(game,scene,'carry');walk(game,{x:-400,y:280},{stop:55});
  assert(scene.record.objectives.rescued,'the full update loop delivers the box at the actual exit');assert.equal(scene.blocksPlayerAttacks,false);assert(game.player.hp>0);game.dispose();
}
console.log('Sidequest full-frame play passed: normal nonlethal duel/retry and moving book carry with actual attack pause/resume and delivery.');
