import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
// Reuse the current app DOM model so input guards, debug controls and scene
// tests share the same parent relationships and browser surface.
const {nodes,listeners,document,run}=harness('?debug');
const key=(code,repeat=false)=>listeners['window:keydown']({code,key:code==='Escape'?'Escape':code,repeat,target:nodes['game-canvas'],preventDefault(){}});
nodes['start-button'].onclick();nodes['prepare-start-button'].onclick();
// Freeze rendering only: the actual frame, game clock, input and HUD run normally.
run('renderGame=()=>{};renderIntro=()=>{}');
assert(run('game.status')==='playing');
run("keys.add('KeyW');skillRequested=true;touch={id:1,dx:1,dy:0};");
nodes['map-button'].onclick();
assert(run('mapOpen'));assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert.equal(run('skillRequested'),false);
assert.equal(nodes['map-button'].getAttribute('aria-expanded'),'true');assert.equal(document.activeElement.id,'close-map');
const before=run('game.runTime??game.time');run('frame(1000);frame(1040);');assert.equal(run('game.runTime??game.time'),before,'opening map freezes simulation');
key('KeyW');key('Space');key('KeyE');assert.equal(run('keys.size'),0);assert.equal(run('skillRequested'),false);assert.equal(run('portalRequested'),false);
listeners['game-canvas:pointerdown']({pointerId:4,clientX:130,clientY:200,preventDefault(){}});assert.equal(run('touch'),null,'map does not leak pointer movement');
key('Escape');assert.equal(run('mapOpen'),false);assert.equal(run('paused'),false);assert.equal(nodes['map-button'].getAttribute('aria-expanded'),'false');
// Opening over an already paused upgrade restores both layers, not gameplay.
run("game.status='upgrade';pause();");key('KeyM');assert(run('mapOpen&&paused'));key('Escape');assert.equal(run('game.status'),'upgrade');assert(run('paused'));assert.equal(document.activeElement.id,'resume-button');
run('resume();');assert.equal(run('game.status'),'upgrade');assert.equal(run('paused'),false);
key('KeyM');nodes['help-button'].onclick();assert(run('helpOpen&&mapOpen'));key('Escape');assert.equal(run('helpOpen'),false);assert(run('mapOpen'));assert.equal(document.activeElement.id,'close-map');key('Escape');assert.equal(run('game.status'),'upgrade');
// Real choice buttons cannot spend crystals or accept a boss reward behind the map.
run("game.crystals=game.crystalsNext;game.status='upgrade';upgradeLevel=0;openUpgrades();");
const upgrade=nodes['upgrade-cards'].children[0];assert(upgrade?.onclick);
const upgradeBefore=run('game.skillLevel');key('KeyM');upgrade.onclick();assert.equal(run('game.skillLevel'),upgradeBefore);key('Escape');upgrade.onclick();assert.equal(run('game.skillLevel'),upgradeBefore+1);assert.equal(run('game.status'),'playing');
run("game.regions.rewardPortal={rewardClaimed:false};game.superSkills.offer('region',game.region.id);game.status='super';openSuperChoices();");
const superChoice=nodes['super-cards'].children[0];assert(superChoice?.onclick);
key('KeyM');superChoice.onclick();assert.equal(run('Object.values(game.superSkills.owned).filter(level=>level>0).length'),0);assert.equal(run('game.status'),'super');key('Escape');superChoice.onclick();assert.equal(run('Object.values(game.superSkills.owned).filter(level=>level>0).length'),1);assert.equal(run('game.status'),'playing');
// The expanded map obeys exactly the minimap's discovery rules.
run("game.status='playing';game.settlements.sites=[{id:'visible',type:'castle',name:'已知城堡',x:40,y:0,state:'ready',discovered:true},{id:'secret',type:'castle',name:'隐藏城堡',x:50,y:0,state:'ready',discovered:false}];game.relicSites.sites=[];game.regions.portals=[];");
key('KeyM');const mapCopy=nodes['map-landmarks'].children.flatMap(row=>row.children.map(child=>child.textContent)).join(' ');assert(mapCopy.includes('已知城堡'));assert(!mapCopy.includes('隐藏城堡'));assert.equal(run('game.settlements.sites[1].discovered'),false);
listeners['window:blur']();assert(run('paused&&mapOpen'));assert.equal(document.activeElement.id,'close-map');nodes['map-done'].onclick();assert(run('paused'),'window blur keeps run paused when map closes');
// Objective pointers reserve both the map and the adjacent pause control,
// using the same bounds in the wilderness and the castle.
run('width=1100;height=700;');
const normalPointer=run('edgePointer({x:game.player.x+2500,y:game.player.y-1400})');assert(normalPointer.y>=174);
run('game.dungeon.active={};');const castlePointer=run('edgePointer({x:game.player.x+2500,y:game.player.y-1400})');assert.equal(castlePointer.y,normalPointer.y);run('game.dungeon.active=null;');
// A visible-screen but occluded Boss must not leak through any HUD phase,
// cast label, map landmark, toast, or HP bar before it is discovered.
run(`game.status='playing';game.enemies=[];game.viewWidth=900;game.viewHeight=700;game.dungeon.enter({id:'qa-fog-hud',type:'castle',x:game.player.x,y:game.player.y+19.8});
let fogPoint=null;for(let yy=game.player.y-250;yy<game.player.y+250&&!fogPoint;yy+=20)for(let xx=game.player.x-390;xx<game.player.x+390;xx+=20)if(game.terrain.isFree(xx,yy,50)&&!game.dungeon.vision.isVisible(xx,yy,50)){fogPoint={x:xx,y:yy};break;}
if(!fogPoint)throw new Error('missing occluded on-screen fixture');
game.enemies=[{id:9009,type:'boss',x:fogPoint.x,y:fogPoint.y-groundOffset({type:'boss',r:49}),r:49,hp:200,maxHp:200,guardActive:true,dungeonBoss:true,bloomAttack:{life:1,kind:'fan'},slam:{life:1}}];updateHUD();`);
assert(nodes['boss-bar'].classList.contains('hidden'));assert.equal(run('bossFeedbackVisible()'),false,'unseen Boss cannot emit positional cast feedback');
assert.equal(nodes['phase-label'].textContent,'穿过门口 · 探索迷宫','hidden casts and boss presence do not override exploration HUD');
assert.equal(run("worldMap.getMarkers(game).some(marker=>marker.type==='boss')"),false);
run(`const capturedNotices=[];notify=(...args)=>capturedNotices.push(args);pendingEvolutions=[];announceCombatEvents([{type:'boss'},{type:'bloomWindup'}]);`);
assert.equal(run('capturedNotices.length'),0,'unseen Boss spawn/cast does not produce a toast');
// A royal chest's raised open lid crosses the north wall's floor silhouette.
// Its ground anchor still controls discovery, while world depth controls which
// wall can cover the sprite. Exercise the real castle, visibility and draw list.
const chestRendering=JSON.parse(run(`JSON.stringify((()=>{
  const previous=game,originalTerrain=drawTerrain,originalProp=drawAdventureProp,save=ctx.save,restore=ctx.restore;
  let vision,originalClip;
  try{
    game=new Game({terrain:new previous.terrain.constructor({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
    game.enemies=[];game.viewWidth=1100;game.viewHeight=700;
    if(!game.dungeon.enter({id:'qa-raised-chest',type:'castle',x:0,y:groundOffset(game.player,true)}))throw new Error('castle fixture failed');
    const state=game.dungeon.active,chest=state.treasure,room=state.bossRoom;
    vision=game.dungeon.vision;originalClip=vision.clipVisible;
    game.player.x=room.x;game.player.y=room.y+230-groundOffset(game.player,true);vision.update();
    const hidden=adventureSceneProps(game.player.x,game.player.y).some(p=>p.id===chest.id);
    const hiddenBehindWall=!!game.terrain.firstBlocker(room.x,room.y+230,chest.x,chest.y,0);
    game.player.y=room.y+40-groundOffset(game.player,true);chest.state='claimed';vision.update();
    const visible=adventureSceneProps(game.player.x,game.player.y).find(p=>p.id===chest.id);
    const lidBeyondFloor=!vision.isVisible(chest.x,chest.y-80);
    const north=state.walls.find(w=>w.angle===0&&w.x===room.x&&w.y===room.y-state.cellSize/2);
    const south=state.walls.find(w=>w.angle===0&&w.x===room.x&&w.y===room.y+state.cellSize/2);
    if(!visible||!north||!south)throw new Error('missing visible chest or real surrounding walls');
    const calls=[],stack=[];let clipped=false,clips=0;
    ctx.save=()=>{stack.push(clipped);save.call(ctx);};ctx.restore=()=>{restore.call(ctx);clipped=stack.pop();};
    vision.clipVisible=function(...args){clips++;clipped=true;return originalClip.apply(this,args);};
    drawTerrain=p=>calls.push({id:p.id,clipped});drawAdventureProp=p=>calls.push({id:p.id,state:p.state,clipped});
    const floorProp={id:'qa-floor-prop',type:'rug',renderLayer:'ground',x:chest.x,y:chest.y+10};
    drawScene([],[south,north],game.player,[floorProp,visible]);
    return {hidden,hiddenBehindWall,lidBeyondFloor,visible:visible.isDungeonTreasure&&visible.royal,calls,clips,north:north.id,south:south.id,chest:chest.id};
  }finally{if(vision)vision.clipVisible=originalClip;ctx.save=save;ctx.restore=restore;drawTerrain=originalTerrain;drawAdventureProp=originalProp;game=previous;}
})())`));
assert(chestRendering.hiddenBehindWall);assert.equal(chestRendering.hidden,false,'a chest in a wall-separated castle room never enters the scene draw list');
assert(chestRendering.visible&&chestRendering.lidBeyondFloor,'the open royal lid must actually extend beyond the ground visibility mask');
assert.deepEqual(chestRendering.calls.map(call=>call.id),[chestRendering.north,chestRendering.chest,'qa-floor-prop',chestRendering.south],'north wall stays behind the chest; a foreground wall still draws over it');
assert.equal(chestRendering.calls[1].state,'claimed');assert.equal(chestRendering.calls[1].clipped,false,'the visible chest and its entire open lid bypass the floor-only clip');
assert.equal(chestRendering.calls[2].clipped,true);assert.equal(chestRendering.clips,1,'ordinary floor props still retain their visibility clipping');
nodes['quit-button'].onclick();assert.equal(run('game'),null);assert.equal(run('mapOpen'),false);assert(nodes['map-overlay'].classList.contains('hidden'));
// Drive the real frame and native UI handlers across a door fade. Only drawing
// is stubbed: movement, input revisions and the scene controller are live.
nodes['start-button'].onclick();nodes['prepare-start-button'].onclick();
run(`game=new Game({terrain:new game.terrain.constructor({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;
const fadeHut={id:'ui-fade-hut',type:'supply',name:'测试小屋',x:400,y:0,door:{x:400,y:30},width:54,depth:28,interactRadius:82,state:'ready',seed:1,guardIds:[]};
game.settlements.sites=[fadeHut];game.player.x=fadeHut.door.x;game.player.y=fadeHut.door.y-groundOffset(game.player,true);last=2000;
const originalDiscover=worldMap.discover.bind(worldMap);let transitionDiscoveries=0;worldMap.discover=(...args)=>{transitionDiscoveries++;return originalDiscover(...args);};`);
let frameTime=2000;
const tick=()=>run(`frame(${frameTime+=40})`);
const keyup=code=>listeners['window:keyup']({code});
const pointer=(type,id,x=130,y=200)=>listeners[`game-canvas:${type}`]({pointerId:id,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});
key('KeyW');pointer('pointerdown',81);pointer('pointermove',81,170,200);
assert(run("keys.has('KeyW')&&touch?.id===81&&touch.dx>0"));
tick();assert(run('game.sceneTransition.active'));assert.equal(run('game.dungeon.active'),null);
assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert(run("blockedTransitionKeys.has('KeyW')"));
assert.equal(run('sceneInputRevision'),1);assert.equal(run('skillRequested||portalRequested'),false);assert(nodes.joystick.classList.contains('hidden'));
const fadeClock=run('clock'),fadeRunTime=run('game.runTime');
key('KeyW',true);key('KeyD');key('Space');key('KeyE');nodes['skill-button'].onclick();
listeners['touch-skill:pointerdown']({preventDefault(){},stopPropagation(){}});
nodes['map-button'].onclick();key('KeyM');pointer('pointerdown',82);pointer('pointermove',81,180,250);
assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert.equal(run('skillRequested||portalRequested'),false);assert.equal(run('mapOpen'),false);
assert(run("blockedTransitionKeys.has('KeyD')"),'new held keys pressed during the fade are also blocked until release');
tick();assert.equal(run('clock'),fadeClock);assert.equal(run('game.runTime'),fadeRunTime);assert.equal(run('transitionDiscoveries'),0,'a frozen transition cannot discover new landmarks');
nodes['pause-button'].onclick();assert(run('paused'));
const pausedFade=run('game.sceneTransition.elapsed');tick();tick();assert.equal(run('game.sceneTransition.elapsed'),pausedFade,'the pause menu stops an in-progress fade');
nodes['resume-button'].onclick();tick();assert(run('game.sceneTransition.elapsed')>pausedFade);assert.equal(run('paused'),false);
nodes['help-button'].onclick();assert(run('helpOpen'));
const helpFade=run('game.sceneTransition.elapsed');tick();tick();assert.equal(run('game.sceneTransition.elapsed'),helpFade,'help also stops the fade without losing it');
nodes['close-help'].onclick();assert.equal(run('helpOpen'),false);
for(let i=0;run('game.sceneTransition.active')&&i<20;i++)tick();
assert.equal(run('game.sceneTransition.active'),false);assert.equal(run('game.dungeon.active.kind'),'hut');
assert.equal(run('sceneInputRevision'),2);assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert.equal(run('skillRequested||portalRequested'),false);
assert.equal(run('game.runTime'),fadeRunTime);assert.equal(run('clock'),fadeClock,'visual and simulation clocks stay frozen until the transition finishes');
const landed=run('JSON.stringify([game.player.x,game.player.y])');
key('KeyW',true);key('KeyD',true);pointer('pointermove',81,300,400);pointer('pointerup',81);tick();
assert.equal(run('JSON.stringify([game.player.x,game.player.y])'),landed,'old keyboard repeats and a stale touch pointer cannot resume movement in the destination');
assert.equal(run('touch'),null);assert.equal(run('keys.size'),0);
keyup('KeyW');key('KeyW');tick();assert.notEqual(run('JSON.stringify([game.player.x,game.player.y])'),landed,'movement resumes after a deliberate key release and new press');keyup('KeyW');keyup('KeyD');
pointer('pointerdown',83);pointer('pointermove',83,170,200);const beforeTouch=run('game.player.x');tick();assert(run('game.player.x')>beforeTouch,'a new touch gesture controls the new scene normally');
pointer('pointerup',83);const afterTouch=run('game.player.x');tick();assert.equal(run('game.player.x'),afterTouch);
nodes['quit-button'].onclick();assert.equal(run('game'),null);assert.equal(run('blockedTransitionKeys.size'),0);
// Pause and the independent character panel share one detail view. Equipment
// controls, tab state, gestures and reward guards are covered by
// qa-character-hud.mjs with a DOM that parses the new dynamic panel markup.
nodes['start-button'].onclick();nodes['prepare-start-button'].onclick();nodes['pause-button'].onclick();
assert(run('paused'));nodes['pause-character-button'].onclick();
assert(run('paused&&characterOpen'));assert(nodes['character-content'].innerHTML.includes('攻击'));
nodes['character-done'].onclick();assert(run('paused&&!characterOpen'));
nodes['resume-button'].onclick();assert.equal(run('paused'),false);assert.equal(document.activeElement.id,'game-canvas');
nodes['quit-button'].onclick();assert.equal(run('game'),null);

// Drive real live-play RAF callbacks at distinct display rates. The readout
// counts rendered frames; clamped simulation deltas cannot distort telemetry.
const fpsNode=nodes['debug-fps'];
assert(!fpsNode.classList.contains('hidden'),'debug mode exposes the FPS readout');
let fpsText=fpsNode.textContent,fpsWrites=[];
Object.defineProperty(fpsNode,'textContent',{get:()=>fpsText,set:value=>{fpsText=String(value);fpsWrites.push(fpsText);},configurable:true});
nodes['start-button'].onclick();nodes['prepare-start-button'].onclick();
let fpsNow=100000;
const sampleRate=rate=>{
  // A new game is a real reset boundary, not a direct call to telemetry internals.
  nodes['restart-button'].onclick();assert.equal(fpsNode.textContent,'-- FPS');
  run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
  fpsWrites=[];fpsNow+=10000;run(`frame(${fpsNow})`);
  const interval=1000/rate,halfFrames=rate/2;
  for(let i=1;i<halfFrames;i++)run(`frame(${fpsNow+i*interval})`);
  assert.deepEqual(fpsWrites,[],'FPS text is not rewritten before the half-second window');
  run(`frame(${fpsNow+500})`);assert.equal(fpsNode.textContent,`${rate} FPS`);
  for(let i=halfFrames+1;i<=rate;i++)run(`frame(${fpsNow+i*interval})`);
  assert.equal(fpsNode.textContent,`${rate} FPS`);assert(fpsWrites.length<=2,'FPS text updates at most twice per second');
  assert.equal(run('paused'),false);assert(run('game.runTime')>0,'FPS samples come from actual live gameplay');
};
sampleRate(60);sampleRate(120);sampleRate(10);
// Frozen scenes keep sampling RAF cadence but must not display an apparent
// performance failure merely because retaining the canvas skips submissions.
nodes['pause-button'].onclick();assert(run('paused'));
const fpsRunTime=run('game.runTime');fpsNow+=2000;run(`frame(${fpsNow})`);
for(let i=1;i<=60;i++)run(`frame(${fpsNow+i*1000/60})`);
assert.equal(fpsNode.textContent,'已暂停');assert.equal(run('game.runTime'),fpsRunTime);
// Background time cannot enter the first foreground sample, even if the
// browser sends a throttled RAF while the document is hidden.
document.hidden=true;listeners['document:visibilitychange']();assert.equal(fpsNode.textContent,'-- FPS');
run(`frame(${fpsNow+60000})`);assert.equal(fpsNode.textContent,'-- FPS');
document.hidden=false;listeners['document:visibilitychange']();fpsNow+=120000;
run(`frame(${fpsNow})`);assert.equal(fpsNode.textContent,'-- FPS');
for(let i=1;i<=30;i++)run(`frame(${fpsNow+i*1000/60})`);
assert.equal(fpsNode.textContent,'已暂停','returning from a background tab starts a fresh sample while preserving pause');
// FPS is visible in ordinary play too, without enabling debug diagnostics.
for(const search of ['','?debug=0','?debug=false']){
  const normal=harness(search),normalFps=normal.nodes['debug-fps'];
  assert(!normalFps.classList.contains('hidden'));
  assert.equal(normal.run('debugPerformanceNode'),null);
  normal.run('startGame();game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;frame(1000);');
  for(let i=1;i<=60;i++)normal.run(`frame(${1000+i*1000/60})`);
  assert.equal(normalFps.textContent,'60 FPS');
  normal.run('pause();');
  for(let i=1;i<=31;i++)normal.run(`frame(${2000+i*1000/60})`);
  assert.equal(normalFps.textContent,'已暂停');
  normal.listeners['document:visibilitychange']();assert.equal(normalFps.textContent,'-- FPS');
}

console.log('HUD map and scene transitions: compact bounds, modal pause, discovery privacy, held-key/touch reset, blocked actions, pause/help continuity, clean re-press behavior, all-mode live FPS and debug-only diagnostics with paused labeling and visibility resets passed.');
