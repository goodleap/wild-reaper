import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {NavigationRoute} from './dist/navigation-route.js';
import {foot,distance} from './dist/sidequests/base.js';
import {cleanSidequestState} from './dist/sidequests/state.js';

const add=(p,x=0,y=0)=>({x:p.x+x,y:p.y+y});
function create(world,id){
 const game=new Game({mode:'world',worldId:world,questStorage:null,environment:false});
 // Isolate authored quest mechanics from ambient combat. All player/actor
 // movement below still uses the shipped terrain, navigation and collision.
 game.enemies=[];game.player.invuln=Infinity;game._spawn=game.nextBossAt=Infinity;
 const scene=game.quests.sidequests.scenes.get(id);assert(scene);
 const start=foot(scene.actors.get('giver'));game.player.x=start.x;game.player.y=start.y-19.8;
 game.quests.update();assert(game.quests.accept(id));return {game,scene};
}
function tick(g,seconds=.05){
 for(let left=seconds;left>.0001;left-=.05){const dt=Math.min(left,.05);g._clock=(g._clock||0)+dt;g.runTime+=dt;g.quests.sidequests.update(dt);
  for(const e of [...g.enemies])if(e.hp>0)g.quests.sidequests.beforeEnemy(e,dt);g.dungeon.update(0);
 }
}
function walk(g,point,{speed=320}={}){
 const route=new NavigationRoute(g.terrain).update(foot(g.player),point,{radius:17,bodyRadius:g.player.r,profile:'ground',time:g._clock||0});
 assert(route?.complete,`complete walking route to ${JSON.stringify(point)} from ${JSON.stringify(foot(g.player))}`);
 for(const waypoint of route.path.slice(1))for(let frame=0;frame<3000;frame++){
  const p=foot(g.player),d=distance(p,waypoint);if(d<.1)break;
  const travel=Math.min(d,speed*.05);g._moveEntity(g.player,(waypoint.x-p.x)/d*travel,(waypoint.y-p.y)/d*travel,true);tick(g);
  assert(distance(p,foot(g.player))>.001,`actual walking stalled at ${JSON.stringify(p)}`);
 }
 assert(distance(foot(g.player),point)<1);
}
function use(g,s,key,choice){
 const action=s.actions().find(a=>a.action===key);assert(action,`${s.id}:${key} exists`);
 assert(distance(foot(g.player),action)<=action.range,`${s.id}:${key} in range`);
 const shown=g.getInteraction();assert.equal(shown?.id,action.id,`${s.id}:${key} is reachable through normal interaction, got ${shown?.id}`);
 assert(g.requestInteraction(action.id),`${s.id}:${key} executes`);
 for(let i=0;i<50&&g.sceneTransition.active;i++)g.sceneTransition.update(.05);
 if(choice){assert.equal(g.status,'sidequest-choice');assert(g.quests.sidequests.choose(choice));assert.equal(g.status,'playing');}
 tick(g,.05);
}
function roundtrip(s){s.checkpoint();const cleaned=cleanSidequestState(s.state);assert.deepEqual(cleaned,s.state,`${s.id} durable state survives validation`);}

for(const calfFirst of [false,true]){
 const {game:g,scene:s}=create('rift-forest','bow-rest');
 const relic=g.relicSites.sites.find(site=>site.key==='hunt');assert(Math.hypot(Math.max(0,Math.abs(relic.x-s.c.x)-115),Math.max(0,Math.abs(relic.y-s.c.y)-130))>relic.r+15,'pen does not cover the pre-existing hunting relic artwork');
 assert(!g.enemies.some(e=>e.sideQuestAnimal));assert(g.terrain.firstBlocker(s.c.x,s.c.y-60,s.c.x,s.c.y+60,12),'inner gate physically closed');
 walk(g,add(s.c,75,205));use(g,s,'bell',calfFirst?'calf':'herd');
 walk(g,add(s.c,0,100));use(g,s,'crank');
 tick(g,4);
 const staged=calfFirst?['calf']:['leader','doe','calf'];
 assert(staged.every(k=>foot(s.actors.get(k)).y>s.c.y+15),'called animals actually cross the inner gate');
 use(g,s,'crank');walk(g,add(s.c,0,245));tick(g,3);
 assert(staged.every(k=>s.state.flags[`free-${k}`]));
 if(calfFirst){
  assert(!s.state.flags['free-leader'],'calf choice does not silently release the herd');
  walk(g,add(s.c,75,205));use(g,s,'bell','herd');walk(g,add(s.c,0,100));use(g,s,'crank');tick(g,4);use(g,s,'crank');walk(g,add(s.c,0,245));tick(g,3);
 }
 assert(s.record.objectives.released);walk(g,foot(s.giver));use(g,s,'farewell');assert(s.completed);assert([...s.gates.values()].every(gate=>gate.open));roundtrip(s);g.dispose();
}
console.log('Nature: deer herding, calf alternative, alternating collision gates passed.');

for(const home of ['porch','bay']){
 const {game:g,scene:s}=create('rift-forest','fish-thief');walk(g,s.watch);use(g,s,'watch');tick(g,2.1);
 if(home==='porch'){
  walk(g,foot(s.otter));tick(g,.1);assert(!s.state.flags.watching,'premature approach scares the visitor and permits retry');walk(g,s.watch);use(g,s,'watch');
 }
 tick(g,8);assert(s.record.objectives.witnessed);assert.equal(s.props.get('rack').state,'taken');assert(s.getProps().some(p=>p.questArt==='fish-trail'));
 walk(g,s.nest);tick(g,2);assert(s.record.objectives.found);use(g,s,'settle',home);const before=foot(s.otter);walk(g,home==='porch'?s.porch:s.bay,{speed:150});tick(g,3);
 assert(distance(before,foot(s.otter))>30,'otter actually travels to the selected home');assert(s.completed);assert(!s.props.get('bowl').hidden);roundtrip(s);g.dispose();
}
console.log('Nature: observed fish theft, scare/retry, both real animal relocation outcomes passed.');

for(const lateCache of [false,true]){
 const {game:g,scene:s}=create('verdant-rift','divided-stone');walk(g,s.cave);
 const entrance=g.getInteraction();assert(entrance);assert(g.requestInteraction(entrance.id));for(let n=0;n<50&&g.sceneTransition.active;n++)g.sceneTransition.update(.05);
 assert.equal(g.dungeon.active?.site.caveId,'west-maze');assert(s.inside);g.enemies=[];
 walk(g,s.call);use(g,s,'call');tick(g,4);assert(s.record.objectives.contact);assert(g.dungeon.active.mechanisms.find(m=>m.closedLink?.includes(19)).opened);
 walk(g,foot(s.explorer));use(g,s,'direct','hold');tick(g,5);assert(distance(foot(s.explorer),s.plate)<30,JSON.stringify({helper:foot(s.explorer),plate:s.plate,speed:s.explorer.speed,hold:s.state.flags.holding}));assert(s.gates.get('cooperation').open);
 walk(g,s.latch);use(g,s,'latch');assert(s.record.objectives.latch);assert(s.gates.get('cooperation').open);
 if(!lateCache){walk(g,s.cache,{speed:150});tick(g,5);use(g,s,'cache');assert(s.record.objectives.cache);}
 walk(g,s.exit,{speed:170});tick(g,6);assert(s.completed,'helper physically returns to the existing cave exit');
 if(lateCache){
  assert(!s.record.objectives.cache);assert(!s.explorer.hidden,'rescued helper remains available for optional cache');
  const exit=g.dungeon.active.riftExits[0];walk(g,exit);assert(g.requestInteraction(exit.id));for(let n=0;n<50&&g.sceneTransition.active;n++)g.sceneTransition.update(.05);
  assert(!g.dungeon.active);assert.equal(s.giver.name,'归来的探险者');walk(g,s.cave);assert(g.requestInteraction(g.getInteraction().id));for(let n=0;n<50&&g.sceneTransition.active;n++)g.sceneTransition.update(.05);
  assert(s.gates.get('cooperation').open,'opened cooperation gate survives revisit');assert(g.dungeon.active.mechanisms.find(m=>m.closedLink?.includes(19)).opened,'original shortcut remains open');
  g.enemies=[];walk(g,s.cache,{speed:160});tick(g,5);use(g,s,'cache');assert(s.record.objectives.cache,'optional cache can be collected after the main rescue');
 }
 roundtrip(s);g.dispose();
}
console.log('Nature: real root cave, opposite-side NPC mechanism, cooperative gate/latch, paired optional cache and return passed.');

for(const lose of [false,true]){
 const {game:g,scene:s}=create('verdant-rift','courier-race');walk(g,s.start);use(g,s,'start');const origin=foot(s.runner);tick(g,1);assert(distance(origin,foot(s.runner))>50,'runner physically moves');
 if(lose)tick(g,90);
 for(const p of s.checks)walk(g,p);for(let n=0;n<300&&!s.state.flags['runner-finished'];n++)tick(g,1);
 assert(s.state.flags['player-finished']&&s.state.flags['runner-finished'],'both traverse all checkpoints');walk(g,foot(s.runner));use(g,s,'result');assert(s.completed);
 assert.equal(!!s.state.flags['first-win'],!lose,'win/loss follows actual crossing times');roundtrip(s);walk(g,s.start);use(g,s,'start');assert(s.state.flags.racing);assert([...s.props.values()].filter(p=>p.questArt==='checkpoint').every(p=>p.state==='ready'));
 s.onDeactivate();assert(!s.state.flags.racing);g.dispose();
}
console.log('Nature: physical courier route, ordered checkpoints, win/loss, replay and interrupted attempt passed.');

{
 const {game:g,scene:s}=create('marsh','last-rollcall');walk(g,s.c);use(g,s,'main');assert.equal(s.alive('listeners').length,3);
 const initial=s.alive('listeners').map(e=>foot(e));walk(g,s.side);use(g,s,'side');walk(g,add(s.c,-160,0));tick(g,3);
 assert(s.alive('listeners').some((e,i)=>distance(foot(e),initial[i])>100),'bell redirects actual enemy routes');
 for(const key of ['one','two','three']){const actor=s.actors.get(`soul-${key}`);walk(g,foot(actor));use(g,s,`name-${key}`);}
 assert(s.record.objectives.names);walk(g,foot(s.giver));use(g,s,'memorial');assert(s.completed);assert.equal(s.props.get('stone').state,'named');assert(!s.getActors().some(a=>a.sideQuestGhost));roundtrip(s);g.dispose();
}
console.log('Nature: physical bell lure, neutral souls, durable named memorial passed.');

for(const light of [false,true]){
 const {game:g,scene:s}=create('marsh','moon-moss');use(g,s,'borrow');assert(!s.state.flags.lit);assert.equal(s.alive('sleepers').length,2);
 assert(s.alive('sleepers').every(e=>!g.combat.canTarget(e,g.player)),'sleepers are not automatic attack targets');
 if(light){use(g,s,'lantern');assert(s.state.flags.lit);assert(s.getProps().filter(p=>p.questArt==='stepping-stone').every(p=>p.state==='lit'));tick(g,1);assert(s.alive('sleepers').some(e=>e.guardActive),'lantern actually wakes nearby creatures');
  // This branch isolates collecting after combat, without testing unrelated
  // weapon balance. The dark branch below must finish with beasts alive.
  for(const e of s.alive('sleepers'))e.hp=0;
 }else{
  for(const p of s.stones)walk(g,p,{speed:200});assert(s.alive('sleepers').every(e=>e.guardActive===false),'long dark route avoids waking beasts');
 }
 walk(g,s.flower);use(g,s,'collect');walk(g,foot(s.giver));use(g,s,'gift');assert(s.completed);assert(!s.props.get('window').hidden);assert(!s.state.flags.lit);if(!light)assert.equal(s.alive('sleepers').length,2);roundtrip(s);g.dispose();
}
console.log('Nature: lamp/stepping indicators, real sleeping creatures, dark noncombat route, flowers at home passed.');
