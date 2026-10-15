import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visitSceneUnits } from './dist/unit-counts.js';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { companionDefinition } from './dist/companion-catalog.js';
import { ACTOR_VISUALS, actorShape } from './dist/actor-visuals.js';
import { COMPANION_VISUALS } from './dist/companion-art.js';
import { getHero } from './dist/heroes.js';
import { DungeonVision } from './dist/dungeon-vision.js';
import { sceneEntityVisible, sceneItemVisible } from './dist/scene-rendering.js';
import { cameraViewport } from './dist/camera-viewport.js';

const collect=game=>{const units=[];const count=visitSceneUnits(game,(entity,isPlayer)=>units.push({entity,isPlayer}));assert.equal(count,units.length);return units;};
assert.equal(visitSceneUnits(null,()=>assert.fail('no game has no units')),0);
assert.deepEqual(collect({}),[]);
const player={id:0,x:0,y:-19.8,r:15,heroId:'traveler',hp:100};
const enemy=(type,id,x=0)=>({id,type,x,y:-18,r:16,hp:10});
const active={id:10,x:20,y:-19.8,r:15,heroId:'warden',kind:'warden',isCompanion:true,state:'active',hp:100};
const recovering={...active,id:11,kind:'dog',heroId:'dog',state:'recovering',hp:0};
const camp={id:'camp',kind:'owl',name:'夜枭',x:40,y:10,state:'trapped',siteId:'rescue-active'};
const game={player,enemies:[enemy('slime',1),{...enemy('slime',2),affix:{id:'shield'}},enemy('boss',3),enemy('trainingDummy',4)],
  companions:{members:[active,recovering],camps:[camp]},
  settlements:{sites:[{id:'merchant',type:'merchant',x:0,y:20,state:'ready'},{id:'angel',type:'angel',x:50,y:20,state:'ready',flying:true},
    {id:'spent',type:'merchant',x:0,y:0,state:'spent'},{id:'hut',type:'supply',x:0,y:0,state:'ready'}]},
  relicSites:{sites:[{id:'rescue-active',type:'rescue',kind:'owl',x:40,y:10,state:'active'},
    {id:'rescue-ready',type:'rescue',kind:'warden',x:80,y:20,state:'ready'},
    {id:'dog-ready',type:'dogcamp',kind:'dog',x:100,y:20,state:'ready'},
    {id:'golem-ready',type:'rescue',kind:'golem',appearance:'golemaltar',x:120,y:20,state:'ready'},
    {id:'rune',type:'rune',x:0,y:0,state:'ready'},{id:'old-rescue',type:'rescue',kind:'stormcaller',x:0,y:0,state:'cleared'}]},
  effects:[{type:'damage'}],bullets:[{}],enemyBullets:[{}],gems:[{}],coins:[{}],
  adventure:{pickups:[{}],props:[{}]},environment:{props:[{}]},
  dungeon:{active:null,_world:{enemies:[enemy('slime',999)]},states:new Map([['old',{enemies:[enemy('boss',1000)]}]])}};
const before=JSON.stringify(game),units=collect(game);
assert.equal(units.length,13,'4 enemies + hero + 2 companions + 2 town NPCs + 1 camp + 3 ready relic companions');
assert.equal(new Set(units.map(u=>u.entity)).size,units.length);
assert(units.some(u=>u.entity===recovering),'a recovering body remains present despite zero HP');
assert.equal(units.filter(u=>!u.isPlayer).length,4,'Bosses, elites and the training dummy each count once in the enemy source');
assert.equal(JSON.stringify(game),before,'enumeration and visual adaptation do not mutate simulation state');
const captive=units.find(u=>u.entity.id==='camp').entity,owl=companionDefinition('owl');
assert.equal(captive.y,camp.y-owl.groundOffset);assert.equal(captive.r,owl.r);assert.equal(captive.flying,true);
assert.equal(captive.isCaptive,true);assert.equal(captive.heroId,'owl');
assert.equal(units.find(u=>u.entity.townKind==='angel').entity.y,20-19.8);
assert.equal(units.filter(u=>u.entity.state==='dormant').length,1);
assert.equal(units.filter(u=>u.entity.isCaptive&&u.entity.kind==='dog').length,1);
assert(!units.some(u=>u.entity.id===999||u.entity.id===1000),'stored scene populations never enter the active total');

// A relic changes representation from its waiting NPC to a live rescue camp,
// then to a team member. It must not gain a second body at either transition.
const lifecycle={player,companions:{members:[],camps:[]},relicSites:{sites:[{id:'rescue',type:'rescue',kind:'warden',x:0,y:0,state:'ready'}]}};
assert.equal(collect(lifecycle).length,2);
lifecycle.relicSites.sites[0].state='active';lifecycle.companions.camps.push({...camp,kind:'warden',siteId:'rescue'});
assert.equal(collect(lifecycle).length,2);
lifecycle.relicSites.sites[0].state='cleared';lifecycle.companions.camps=[];lifecycle.companions.members.push(active);
assert.equal(collect(lifecycle).length,2);
assert.equal(collect({player,companions:{camp}}).length,2,'the legacy single-camp fallback still works');
assert.equal(collect({player,companions:{camps:[],camp}}).length,1,'an explicit empty camp list takes precedence over a legacy value');

// Reuse the actual renderer's actor projection and viewport admission. Ground
// offsets, large sprites and shadows must not be replaced with centre checks.
const source=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const visualSource=source.slice(source.indexOf('const HERO_VISUALS='),source.indexOf('function sortActors('));
const cullSource=source.slice(source.indexOf('function actorInView('),source.indexOf('function actorShadowShapes('));
const viewportSource=source.match(/^function sceneViewport\(.*$/m)?.[0];assert(viewportSource,'the actual renderer exports its viewport through the shared local helper');
function projected(game,width=400,height=300){
  const factory=new Function('game','width','height','ACTOR_VISUALS','COMPANION_VISUALS','getHero','actorShape',`const viewWidth=width,viewHeight=height;\n${viewportSource}\n${visualSource}\n${cullSource}\nreturn {actorVisual,actorInView};`);
  return factory(game,width,height,ACTOR_VISUALS,COMPANION_VISUALS,getHero,actorShape);
}
function visibleCounts(game,width=400,height=300){
  const {actorVisual,actorInView}=projected(game,width,height),vision=game.dungeon?.active?game.dungeon.vision:null;
  const offsetX=width/2-game.player.x,offsetY=height/2-game.player.y,actors=[];
  const scene=visitSceneUnits(game,(entity,isPlayer)=>{
    if(!sceneEntityVisible(entity,vision))return;
    const actor=actorVisual(entity,isPlayer);
    if(actorInView(actor,offsetX,offsetY)&&sceneItemVisible({kind:'actor',actor},vision))actors.push(actor);
  });
  return {scene,screen:actors.length,actors};
}
const edge={player,enemies:[enemy('slime',1,1000),enemy('slime',2,220)]};
const edgeCounts=visibleCounts(edge);
assert.equal(edgeCounts.scene,3);assert.equal(edgeCounts.screen,2,'a partly visible silhouette/shadow counts while a distant unit does not');
assert(edgeCounts.actors.some(a=>a.entity.id===2));
assert.equal(visibleCounts(edge,300,300).screen,1,'resizing changes the screen total, never the scene total');
const phone=cameraViewport({width:390,height:844,coarse:true}),phoneEdge={player,enemies:[enemy('slime',5,250)]};
assert.equal(phone.width,540);assert.equal(visibleCounts(phoneEdge,phone.width,phone.height).screen,2,'mobile unit counts use the shared 540-unit world view');
assert.equal(visibleCounts(phoneEdge,390,844).screen,1,'the fixture distinguishes the world view from raw canvas pixels');
const obstacle={id:'wall',type:'log',variant:'castle-wall',x:0,y:-100,halfLength:350,angle:0,r:14,sortY:-100};
const fogGame={player:{...player},enemies:[enemy('slime',21),{...enemy('slime',22),y:-170}],companions:{members:[active]},
  settlements:game.settlements,relicSites:game.relicSites};
const dungeon={game:fogGame,active:{terrain:new Terrain({obstacles:[obstacle]}),bounds:{minX:-350,minY:-350,maxX:350,maxY:350}},
  _playerFoot(){return {x:fogGame.player.x,y:fogGame.player.y+19.8};}};
fogGame.dungeon=dungeon;dungeon.vision=new DungeonVision(dungeon);dungeon.vision.update();
const fogCounts=visibleCounts(fogGame,700,700);
assert.equal(fogCounts.scene,4,'fogged enemies belong to the current scene; outdoor NPCs do not');
assert.equal(fogCounts.screen,3,'the on-screen count follows the same visibility gate as drawing');
assert(!fogCounts.actors.some(a=>a.entity.id===22));

// Exercise real scene swaps; the outdoor enemy snapshot remains in memory
// while the castle has its own finite, mostly fogged population.
const live=new Game({terrain:new Terrain({obstacles:[]}),adventure:false});
live.enemies=[];const outdoor=live._spawnEnemy('slime',1);live.companions.recruit('warden');
live.settlements.sites=[{id:'shop',type:'merchant',x:0,y:0,state:'ready'}];
live.relicSites.sites=[];
const outdoorTotal=collect(live).length,site={id:'unit-count-castle',door:{x:live.player.x,y:live.player.y+groundOffset(live.player,true)}};
assert.equal(outdoorTotal,4);assert(live.dungeon.enter(site));
const inside=collect(live);
assert.equal(inside.length,live.enemies.length+2,'only castle guards, hero and travelling companion count indoors');
assert(!inside.some(u=>u.entity===outdoor||u.entity.isTownNpc));
assert(visibleCounts(live,700,700).screen<inside.length,'unseen castle rooms remain in the scene total');
const entrance=live.dungeon.active.entrance;live.player.x=entrance.x;live.player.y=entrance.y-groundOffset(live.player,true);
assert(live.dungeon.exit());assert.equal(collect(live).length,outdoorTotal);assert(collect(live).some(u=>u.entity===outdoor));
console.log('Unit counts QA passed: shared actor sources, companion states, relic lifecycle, exact viewport/fog admission, and real interior scene swaps.');
