import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {groundOffset} from './dist/terrain.js';
import {NavigationRoute} from './dist/navigation-route.js';
import {visitSceneUnits} from './dist/unit-counts.js';
const g=new Game({mode:'world',worldId:'rift-forest',hero:'traveler'}),id='ranger-home';
const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!e.heroId||!!e.isCompanion)}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let ticks=0,minHp=g.player.hp,maxEscortGap=0,upgrades=[],guardFightStart=null,guardFightEnd=null;
function frame(input={}){
 if(g.status==='upgrade'){let choices=g.getUpgradeChoices(),choice=choices.find(c=>c.ownerId==='sword')||choices[0];upgrades.push(choice.id);g.chooseUpgrade(choice.id);}
 assert(g.status==='playing',`normal play interrupted: ${g.status}, hp ${g.player.hp}`);
 assert(!g.dungeon.active,'route unexpectedly entered a dungeon');
 const priorGuards=g.quests.commissions._guards(id);g.update(1/30,input);ticks++;
 if(guardFightStart===null&&priorGuards.some(e=>e.hp<e.maxHp))guardFightStart=g.runTime;
 if(guardFightStart!==null&&guardFightEnd===null&&!g.quests.commissions._guards(id).length)guardFightEnd=g.runTime;minHp=Math.min(minHp,g.player.hp);if(ticks>12000)throw Error('exceeded 400 seconds');
 const actor=g.quests.commissions.actor;if(actor&&g.quests.store.record(id).objectives.freed)maxEscortGap=Math.max(maxEscortGap,dist(foot(actor),foot(g.player)));
}
function moveTo(target){
 const path=new NavigationRoute(g.terrain).update(foot(g.player),target,{radius:18,bodyRadius:15,profile:'ground',time:g._clock});assert(path?.complete,'normal route is complete');
 let stuck=0;
 for(const waypoint of path.path.slice(1)){
  for(let n=0;n<1000;n++){
   const from=foot(g.player),d=dist(from,waypoint);if(d<3)break;
   const amount=Math.min(1,d/(g.player.speed/30));frame({x:(waypoint.x-from.x)/d*amount,y:(waypoint.y-from.y)/d*amount});
   if(dist(from,foot(g.player))<.05){if(++stuck>90)throw Error('player stuck against terrain');}else stuck=0;
  }
 }
}
const initial={hp:g.player.hp,attack:g.player.attack,defense:g.player.defense,speed:g.player.speed,weapon:g.build.getWeapon('sword').baseRank};
const board=g.quests.boards.find(b=>b.questId===id);moveTo(board);g.quests.update();assert(g.quests.accept(id));frame();
const actor=g.quests.getActors()[0];assert(actor&&actor.appearanceId==='warden'&&actor.isCaptive,'captive uses the existing warden instead of inheriting the prince');
let rendered=false;visitSceneUnits(g,entity=>{if(entity===actor)rendered=true;});assert(rendered,'escort participates in the shared dynamic actor/shadow queue');assert(!g.quests.getProps().some(prop=>prop.entity===actor),'walking escort never invalidates static prop shadow tiles');
const points=g.quests.commissions.points(id);moveTo(points.primary);
for(let n=0;n<2400&&g.quests.commissions._guards(id).length;n++){
 const from=foot(g.player),enemy=g.quests.commissions._guards(id).sort((a,b)=>dist(a,g.player)-dist(b,g.player))[0],target=foot(enemy),d=dist(from,target);
 // Keep a sword's reach; circle the shield guard during wind-up rather than
 // rewriting HP. All damage uses the shipped automatic sword.
 let dx=(target.x-from.x)/(d||1),dy=(target.y-from.y)/(d||1);
 if(d<55){const a=Math.atan2(dy,dx)+Math.PI/2;dx=Math.cos(a)*.7;dy=Math.sin(a)*.7;}
 frame({x:dx,y:dy});
}
assert.equal(g.quests.commissions._guards(id).length,0,'ordinary automatic sword defeats the quest guards');
moveTo(points.primary);if(!g.quests.store.record(id).objectives.freed)assert(g.requestInteraction(`quest:${id}:freed`));
moveTo(points.delivery);for(let n=0;n<300&&!g.quests.store.record(id).completed;n++)frame();
assert(g.quests.store.record(id).completed,'normal input walking and shared follow finish the escort');
console.log('Normal-input forest escort smoke (one run, not a balance benchmark):',JSON.stringify({initial,totalSeconds:+g.runTime.toFixed(2),combatSeconds:+(guardFightEnd-guardFightStart).toFixed(2),minHp,hp:g.player.hp,level:g.player.level,kills:g.kills,maxEscortGap:+maxEscortGap.toFixed(1),upgrades,completed:true},null,2));g.dispose();
