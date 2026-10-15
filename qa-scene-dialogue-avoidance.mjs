import assert from 'node:assert/strict';
import { sceneDialogueAvoidance } from './dist/scene-dialogue-avoidance.js';
import { layoutSceneDialogue } from './dist/scene-dialogue-renderer.js';
import { actorShape,ACTOR_VISUALS } from './dist/actor-visuals.js';

const options={offsetX:40,offsetY:25,width:800,height:600,isVisible:e=>!e.hidden};
const game=()=>({player:{x:400,y:400},enemies:[],companions:{members:[],camps:[]},settlements:{sites:[]},relicSites:{sites:[]},abilities:{effects:[],visualBursts:[]},effects:[],enemyBullets:[]});
const enemy=(extra={})=>({id:1,type:'slime',x:500,y:350,r:18,hp:80,maxHp:100,...extra});
const covers=(rects,x,y)=>rects.some(r=>x+options.offsetX>=r.x&&x+options.offsetX<=r.x+r.width&&y+options.offsetY>=r.y&&y+options.offsetY<=r.y+r.height);
function protectedPoint(g,x,y,message){assert(covers(sceneDialogueAvoidance(g,options),x,y),message);}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}

const g=game(),e=enemy({elite:true});g.enemies=[e];
protectedPoint(g,e.x,e.y-e.r-14,'elite health bar follows its real world anchor');
protectedPoint(g,e.x,e.y-actorShape(e).top*(e.r/actorShape(e).radius),'the upper body is protected');
e.hidden=true;assert.equal(sceneDialogueAvoidance(g,options).length,0,'hidden enemies neither occupy UI nor expose a position');
e.hidden=false;e.hp=0;assert.equal(sceneDialogueAvoidance(g,options).length,0,'dead enemies do not reserve space');

for(const [state,point] of [
  [{slam:{x:110,y:110,r:30,life:.2}},[110,110]],
  [{cast:{angle:Math.PI,life:.2}},[482,357]],
  [{charge:{phase:'windup',startX:120,startY:120,dx:1,dy:0,length:200}},[290,120]],
  [{bloomAttack:{kind:'fan',x:100,y:130,angle:0,spread:.5,life:.3}},[330,130]],
  [{bloomAttack:{kind:'burst',life:.3,circles:[{x:130,y:160,r:25}]}},[130,160]],
  [{specialAttack:{kind:'leap',phase:'rush',circles:[{x:110,y:170,r:30}]}},[110,170]],
  [{specialAttack:{kind:'tentacles',phase:'strikes',circles:[{x:180,y:120,r:25,done:false}]}},[180,120]],
  [{specialAttack:{kind:'frostCharge',phase:'windup',x:100,y:100,angle:Math.PI/2,length:200,r:20}},[100,280]],
  [{specialMarks:[{x:180,y:160,r:24,life:2,delay:.3}]},[180,160]],
  [{affix:{id:'summoner',phase:'windup',life:.2,castX:170,castY:180}},[170,180]]
]){
  const world=game();world.enemies=[enemy(state)];protectedPoint(world,...point,`visible warning ${Object.keys(state)[0]}`);
}
const completed=game();completed.enemies=[enemy({specialAttack:{phase:'strikes',circles:[{x:100,y:100,r:30,done:true}]}})];
assert(!covers(sceneDialogueAvoidance(completed,options),100,100),'completed strike targets release their space');

for(const [shape,point,parameters] of [
  ['zone',[100,120],{radius:24}],['field',[100,120],{radius:25}],['ring',[100,120],{radius:40}],
  ['beam',[260,120],{radius:12,range:200}],['cone',[260,120],{range:200,spread:.4}],
  ['wave',[100,170],{radius:70}],['projectile',[100,100],{radius:8}]
]){
  const world=game();world.abilities.effects=[{shape,hostile:true,x:100,y:100,groundOffset:20,angle:0,remaining:1,age:.1,windup:.8,parameters}];
  protectedPoint(world,...point,`hostile ${shape} geometry includes ground offset`);
  world.abilities.effects[0].hostile=false;assert.equal(sceneDialogueAvoidance(world,options).length,0,'friendly visuals do not suppress incidental speech');
}
const landings=game();landings.abilities.visualBursts=[{hostile:true,x:100,y:100,groundOffset:20,radius:30,age:0,life:.4}];
protectedPoint(landings,100,120,'hostile landing burst');
landings.effects=[{type:'bossSlam',x:160,y:140,r:30,life:.3}];protectedPoint(landings,160,140,'legacy enemy impact');
landings.enemyBullets=[{x:200,y:140,r:8,life:1}];protectedPoint(landings,200,140,'enemy bullet body');
landings.environment={props:[{x:250,y:140,state:'armed',blastRadius:35}],mechanisms:{props:[{x:300,y:140,state:'warn',r:40}]}};
protectedPoint(landings,250,140,'armed explosive');protectedPoint(landings,300,140,'active environment warning');

const friends=game();friends.settlements.sites=[{id:'shop',type:'merchant',x:300,y:300,state:'ready'}];
protectedPoint(friends,300,300-19.8-53,'NPC label includes the shared town actor ground offset');
friends.companions.members=[{id:2,kind:'dog',isCompanion:true,name:'猎犬',state:'active',x:450,y:330,r:12,hp:40,maxHp:50}];
protectedPoint(friends,450,330-24-9,'companion nameplate uses its own shape');
friends.companions.camps=[{id:'captivity',kind:'warden',name:'守卫',x:200,y:350,state:'trapped'}];
protectedPoint(friends,200,350-19.8-35*1.1-9,'captive nameplate includes projected height');

const story=game();story.story={actors:[{id:'story:princess',storyActor:true,name:'公主',heroId:'princess',x:300,y:300,r:15,hp:1},{id:'story:angel',storyActor:true,type:'angel',kind:'angel',x:500,y:350,r:15,hp:1}]};
protectedPoint(story,300,300-ACTOR_VISUALS.player.top,'the story princess body has the full hero height');
protectedPoint(story,500,350-19.8-53,'the story angel label uses her rendered town-actor anchor');
const trial=game();trial.realms={getMarkers:()=>[{kind:'tribulationBoundary',x:200,y:200,r:200},{kind:'tribulationWarning',x:200,y:200,r:40}]};
protectedPoint(trial,200,200,'player tribulation landing warning');
assert(!covers(sceneDialogueAvoidance(trial,options),200,300),'the trial boundary itself does not suppress all dialogue');

// A greeting can still fit above its own label/body. The helper must not turn
// every nearby actor into a screen-sized blocker or reserve an entire cone box.
const greeting=game();greeting.settlements.sites=[{id:'shop',type:'merchant',x:300,y:300,state:'ready'}];
const items=[{id:1,priority:30,text:'王子，来看看。',speaker:{x:300,y:280.2,headOffset:58}}];
assert.equal(layoutSceneDialogue(items,{...options,project:(x,y)=>({x:x+options.offsetX,y:y+options.offsetY}),avoid:sceneDialogueAvoidance(greeting,options)}).length,1);
const diagonal=game();diagonal.enemies=[enemy({charge:{phase:'windup',startX:100,startY:100,dx:1,dy:1,length:300}})];
assert(!covers(sceneDialogueAvoidance(diagonal,options),100,280),'diagonal charge leaves unrelated bounding-box corners available');
const round=game();round.abilities.effects=[{shape:'zone',hostile:true,x:200,y:200,parameters:{radius:100},remaining:1}];
assert(!covers(sceneDialogueAvoidance(round,options),295,295),'large circular warnings do not occupy their empty square corners');

const offscreen=game();offscreen.enemies=[enemy({x:-500,y:-500})];assert.equal(sceneDialogueAvoidance(offscreen,options).length,0);
offscreen.abilities.effects=[{shape:'beam',hostile:true,x:-100,y:100,angle:0,remaining:1,parameters:{radius:10,range:300}}];
assert(sceneDialogueAvoidance(offscreen,options).length,'visible incoming telegraph survives an offscreen origin');
const fog=game();fog.enemies=[enemy()];fog.dungeon={active:{},vision:{isVisible:()=>false}};
assert.equal(sceneDialogueAvoidance(fog,options).length,0,'dungeon fog is respected even without a custom predicate');
const before=JSON.stringify(friends);freeze(friends);const random=Math.random;Math.random=()=>{throw new Error('presentation must not consume RNG');};
try{
  const first=sceneDialogueAvoidance(friends,options);assert.deepEqual(sceneDialogueAvoidance(friends,options),first);
  assert.equal(JSON.stringify(friends),before);
  for(const r of first)assert(Object.values(r).every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.x+r.width<=options.width&&r.y+r.height<=options.height);
}finally{Math.random=random;}
console.log('Dialogue avoidance: live body/health/name anchors, legacy and specialist warnings, hostile ability/landing geometry, fog, clipping, compact free space and read-only deterministic presentation passed.');
