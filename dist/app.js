import { drawBossGround, bossPhaseLabel, bossWarning, bossWindingUp, bossSound } from './enemy-presentation.js';
import { enemyVisual, enemyBob } from './enemy-visuals.js';
import { bossDefinition } from './boss-definitions.js';
import { DungeonWallArt } from './dungeon-wall-art.js';
import { Game, RELICS } from './engine.js';
import { SceneryArt } from './scenery-art.js';
import { CombatArt } from './combat-art.js';
import { CombatVfx } from './combat-vfx.js';
import { drawWeaponTrail } from './weapon-trails.js';
import { drawSwordSlash, swordSlashPose } from './sword-art.js';
import { drawSwordEnergy } from './sword-energy-art.js';
import { drawGuardianBarrier, drawBarrierEffect } from './guardian-art.js';
import { getStormGeometry, lightningPath, stormBrightness, stormImpactBrightness } from './storm-geometry.js';
import { MonsterArt } from './monster-art.js';
import { HumanoidArt } from './humanoid-art.js';
import { CompanionArt, COMPANION_VISUALS } from './companion-art.js';
import { companionDefinition } from './companion-catalog.js';
import { armyPanelHTML } from './army-panel.js';
import { HutArt } from './hut-art.js';
import { RegionalArt } from './regional-art.js';
import { WorldArt } from './world-art.js';
import { WorldSiteArt } from './world-site-art.js';
import { WorldHazardArt } from './world-hazard-art.js';
import { WaterArt } from './water-art.js';
import { IslandArt } from './island-art.js';
import { SuperArt } from './super-art.js';
import { PropArt } from './prop-art.js';
import { EncounterArt } from './encounter-art.js';
import { RelicArt } from './relic-art.js';
import { AngelArt } from './angel-art.js';
import { ImmersionArt } from './immersion-art.js';
import { presentUpgrade, upgradeCardHTML } from './upgrade-presentation.js';
import { characterPanelHTML } from './character-panel.js';
import { AdventureArchive } from './adventure-archive.js';
import { ARCHIVE_ENTRIES, ARCHIVE_CATEGORIES, ARCHIVE_TABS } from './archive-catalog.js';
import { archivePanelHTML, drawArchiveArt, archiveMilestones } from './archive-panel.js';
import { groundOffset, rockShadowParts } from './terrain.js';
import { isGrounded, obstacleHeight } from './height-rules.js';
import { WorldMap, minimapBounds, landmarkLabel, landmarkState } from './world-map.js';
import { backingResolution, RenderSchedule, FrameMetrics } from './render-performance.js';
import { FrameDiagnostics } from './frame-diagnostics.js';
import { MapLightCache, MAP_SUN_ANGLE, MAP_SUN_DIRECTION } from './map-light-cache.js';
import { ShadowRenderer, ShadowGeometryCache, shadowFrameBounds } from './shadow-renderer.js';
import { debugConfigFromSearch } from './debug-mode.js';
import { drawTrainingDummy } from './training-art.js';
import { ACTOR_VISUALS, actorShape } from './actor-visuals.js';
import { drawDamageOverlay } from './damage-numbers.js';
import { drawCastleActivation } from './relic-activation.js';
import { sceneEntityVisible, sceneItemVisible, sceneItemLayer, compareSceneDepth } from './scene-rendering.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas'), ctx = canvas.getContext('2d', {alpha:false});
const shadowRenderer=new ShadowRenderer(()=>document.createElement('canvas'));
const shadowGeometry=new ShadowGeometryCache();
const mapLightCache=new MapLightCache(()=>document.createElement('canvas'));
const decorativeShadowShapes=[];
const sceneryArt=new SceneryArt(()=>document.createElement('canvas'));
const combatArt=new CombatArt(()=>document.createElement('canvas'));
const combatVfx=new CombatVfx(()=>document.createElement('canvas'));
const monsterArt=new MonsterArt(()=>document.createElement('canvas'));
const humanoidArt=new HumanoidArt(()=>document.createElement('canvas'));
const companionArt=new CompanionArt(()=>document.createElement('canvas'));
const regionalArt=new RegionalArt(()=>document.createElement('canvas'));
const worldArt=new WorldArt(()=>document.createElement('canvas'));
const worldSiteArt=new WorldSiteArt(()=>document.createElement('canvas'));
const worldHazardArt=new WorldHazardArt(()=>document.createElement('canvas'));
const waterArt=new WaterArt(()=>document.createElement('canvas'));
const islandArt=new IslandArt();
const hutArt=new HutArt(()=>document.createElement('canvas'));
const superArt=new SuperArt(()=>document.createElement('canvas'));
const propArt=new PropArt(()=>document.createElement('canvas'));
const encounterArt=new EncounterArt(()=>document.createElement('canvas'));
const relicArt=new RelicArt(()=>document.createElement('canvas'));
const angelArt=new AngelArt(()=>document.createElement('canvas'));
const immersionArt=new ImmersionArt();
const worldMap=new WorldMap();
const arena = $('arena'), TAU = Math.PI * 2;
// One world-space sunlight direction drives every beam and actor projection.
const SUN_ANGLE=MAP_SUN_ANGLE,SUN=MAP_SUN_DIRECTION;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const hash = (x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const timeLabel = (n)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const debugConfig=debugConfigFromSearch(window.location?.search||'');
const debugMode=debugConfig.enabled;
const diagnostics=debugMode?new FrameDiagnostics():null;
let frameHudMs=0,diagnosticNotice='尚未采样',diagnosticSequence=null;
const diagnosticModes=['default','hud-off','lights-off'];
const diagnosticLabels={default:'默认','hud-off':'停更 HUD','lights-off':'关闭光影'};
const debugFpsNode=$('debug-fps');
const debugPerformanceNode=debugMode?document.createElement('span'):null;
const frameMetrics=new FrameMetrics();
const renderSchedule=new RenderSchedule();
if(debugFpsNode){
  debugFpsNode.classList.remove('hidden');
  debugFpsNode.title='每秒提交绘制帧数；暂停时复用最后一帧';
}
if(debugPerformanceNode){
  debugPerformanceNode.id='debug-performance';debugPerformanceNode.className='debug-performance';
  debugPerformanceNode.setAttribute('aria-label','性能：RAF 回调间隔；U 逻辑 CPU；D 绘制提交 CPU，均为毫秒，不含 GPU；渲染倍率与像素数');
  // Stay inside the narrow pause column without adding a gameplay overlay.
  $('pause-button').parentElement?.append(debugPerformanceNode);
}
function resetDebugFps(){frameMetrics?.reset();if(debugFpsNode)debugFpsNode.textContent='-- FPS';if(debugPerformanceNode)debugPerformanceNode.textContent='';}
function updateDebugFps(now,rendered,updateMs,renderMs,state){
  if(!debugFpsNode)return;
  if(document.hidden){frameMetrics.reset();return;}
  const sample=frameMetrics.sample(now,{rendered,updateMs,renderMs});if(!sample)return;
  debugFpsNode.textContent=renderSchedule.isLive(state)?`${sample.fps} FPS`:'已暂停';
  if(!debugPerformanceNode)return;
  debugPerformanceNode.textContent=`Δ${sample.rafMs.toFixed(1)}ms
U${sample.updateMs.toFixed(1)}ms
D${sample.renderMs.toFixed(1)}ms
${dpr.toFixed(2)}×${(canvas.width*canvas.height/1e6).toFixed(1)}M`;
  debugPerformanceNode.title=`RAF 回调间隔 ${sample.rafMs.toFixed(2)} ms；逻辑 CPU ${sample.updateMs.toFixed(2)} ms；绘制提交 CPU ${sample.renderMs.toFixed(2)} ms（不含 GPU）；画布 ${canvas.width} × ${canvas.height}`;
}
if(debugMode){$('game-version').textContent+=debugConfig.full?' · DEBUG FULL':' · DEBUG';$('game-version').setAttribute('aria-label','游戏版本，调试模式');}
let width=1100,height=700,dpr=1,scaleX=1,scaleY=1,nativeDpr=0,game=null,paused=false,helpOpen=false,mapOpen=false,characterOpen=false,archiveOpen=false,runEnded=false;
let mapReturnFocus=null,characterReturnFocus=null,characterTab='attributes',characterPointer=null;
const characterTabs=['attributes','weapons','skills','army','status'];
let archiveReturnFocus=null,archiveObserveAt=0,archiveMilestonesBefore=new Set();
let archiveView={tab:'codex',category:'enemies',difficulty:'normal',selectedId:null};
let archiveStorage=null;try{archiveStorage=localStorage;}catch{}
const archive=new AdventureArchive({storage:archiveStorage});
let sceneInputRevision=0;const blockedTransitionKeys=new Set();
const dungeonWallArt=new DungeonWallArt();
let clock=0,last=0,shake=0,toastTimer=0,toastPriority=0,toastUntil=0,upgradeLevel=0,lastLoadout='',hudTick=0;
let keys=new Set(),skillRequested=false,touch=null,input={x:0,y:0,skill:false};
let pendingEvolutions=[],relicChoiceKey='',lastRelics='';
let portalRequested=false,superChoiceKey='',lastSupers='',shopKey='';
let selectedDifficulty='normal';
try{const saved=JSON.parse(localStorage.getItem('wild-echoes-setup'));if(saved?.difficulty==='casual')selectedDifficulty='casual';}catch{}
let soundOn=false,audio=null;
try{soundOn=localStorage.getItem('wild-echoes-sound')==='on';}catch{}
const show=(id,yes=true)=>$(id).classList.toggle('hidden',!yes);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
const combatOptions={reduced,dense:false,time:0,pixelRatio:1};
const hudInsets={top:0,right:0};
function resize(){
  const style=window.getComputedStyle?.(arena);for(const side of ['top','right'])hudInsets[side]=parseFloat(style?.getPropertyValue(`--safe-${side}`))||0;
  const r=arena.getBoundingClientRect();
  if(diagnostics?.running&&(r.width!==width||r.height!==height||(window.devicePixelRatio||1)!==nativeDpr)){cancelDiagnosticCapture();diagnosticNotice='窗口尺寸变化，采样已取消，请重新开始。';refreshDiagnostics();}
  width=Math.max(1,r.width);height=Math.max(1,r.height);nativeDpr=window.devicePixelRatio||1;
  const buffer=backingResolution(width,height,nativeDpr);dpr=buffer.pixelRatio;scaleX=buffer.scaleX;scaleY=buffer.scaleY;combatOptions.pixelRatio=dpr;
  if(canvas.width!==buffer.width)canvas.width=buffer.width;if(canvas.height!==buffer.height)canvas.height=buffer.height;
  renderSchedule.invalidate();
  arena.classList.toggle('compact-hud',width<600||height<430);arena.classList.toggle('narrow-hud',width<600);arena.classList.toggle('short-hud',height<430);
  if(game){game.viewWidth=width;game.viewHeight=height;lastLoadout='';lastSupers='';updateWeaponHUD();updateSuperHUD();}
  if(mapOpen)renderExpandedMap();
}
new ResizeObserver(resize).observe(arena);resize();

function syncSound(){document.body.classList.toggle('sound-enabled',soundOn);$('sound-button').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('sound-button').title=soundOn?'关闭音效':'开启音效';$('sound-button').setAttribute('aria-pressed',String(soundOn));$('pause-sound-button').setAttribute('aria-pressed',String(soundOn));$('pause-sound-button').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('pause-sound-button').textContent=soundOn?'音效：开':'音效：关';}
function initAudio(){if(!soundOn)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{soundOn=false;syncSound();}}
function tone(freq,duration=.07,type='sine',volume=.035,end=freq){if(!soundOn||!audio||audio.state!=='running')return;const now=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(Math.max(30,end),now+duration);gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+duration);}
let feedbackGame=null,superToneAt=-Infinity,superImpactAt=-Infinity;
function playSuperFeedback(event){
  if(feedbackGame!==game){feedbackGame=game;superToneAt=superImpactAt=-Infinity;}
  const now=game._clock;
  if(event.type==='superImpact'){
    if(now-superImpactAt<.35||!game._inView({x:event.x,y:event.y,r:30}))return;
    superImpactAt=now;shake=reduced?shake:Math.max(shake,2.2);
    tone(92,.24,'triangle',.035,35);tone(310,.1,'sine',.012,110);return;
  }
  if(now-superToneAt<.22)return;superToneAt=now;
  const voices={domain:[190,350,'triangle'],runeArrow:[470,880,'sine'],meteor:[200,390,'sine'],swords:[690,430,'triangle'],vortex:[135,65,'sine']};
  const voice=voices[event.skillId];if(voice)tone(voice[0],.16,voice[2],.018,voice[1]);
}
function notify(message,priority=0){if(Date.now()<toastUntil&&priority<toastPriority)return;toastPriority=priority;toastUntil=Date.now()+3200;$('toast').textContent=message;$('toast').classList.add('visible');if(game)updatePortalHUD();clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').classList.remove('visible');toastPriority=0;toastUntil=0;if(game)updatePortalHUD();},3200);}
function refreshArchiveEntry(){
  const count=ARCHIVE_ENTRIES.filter(entry=>archive.data.entries[entry.id]?.seen).length;
  $('archive-entry-count').textContent=`${count} / ${ARCHIVE_ENTRIES.length}`;
  $('archive-button').setAttribute('aria-label',`冒险档案，已发现 ${count} 项，共 ${ARCHIVE_ENTRIES.length} 项`);
  $('archive-entry-note').textContent='图鉴 · 记录 · 里程碑';
}
syncSound();refreshArchiveEntry();
function saveSetup(){try{localStorage.setItem('wild-echoes-setup',JSON.stringify({difficulty:selectedDifficulty}));}catch{}}
for(const difficulty of ['normal','casual']){const radio=$(`difficulty-${difficulty}`);radio.checked=difficulty===selectedDifficulty;radio.addEventListener('change',()=>{if(radio.checked){selectedDifficulty=difficulty;saveSetup();refreshArchiveEntry();}});}


function clearInput(){keys.clear();skillRequested=false;portalRequested=false;touch=null;input={x:0,y:0,skill:false};show('joystick',false);$('joystick-thumb').style.transform='';}
function startGame(){if(game&&!runEnded)archive.finish(game,'restart');resetArchivePanel();archiveMilestonesBefore=new Set(archiveMilestones(archive.data).filter(item=>item.complete).map(item=>item.id));cancelDiagnosticCapture();diagnostics?.reset();diagnosticNotice='尚未采样';resetDebugFps();sceneInputRevision=0;blockedTransitionKeys.clear();mapOpen=false;mapReturnFocus=null;characterOpen=false;characterReturnFocus=null;characterPointer=null;characterTab='attributes';$('character-button').setAttribute('aria-expanded','false');show('character-overlay',false);$('map-button').setAttribute('aria-expanded','false');show('map-overlay',false);pendingEvolutions=[];relicChoiceKey='';lastRelics='';superChoiceKey='';lastSupers='';shopKey='';selectedDifficulty=$('difficulty-casual').checked?'casual':'normal';saveSetup();game=new Game({difficulty:selectedDifficulty,debug:debugMode,debugFull:debugConfig.full,debugWorld:debugConfig.world});game.viewWidth=width;game.viewHeight=height;archive.begin(game);const archiveGame=game;game.onEnemyDefeated=enemy=>archive.recordDefeat(archiveGame,enemy);archiveObserveAt=0;paused=false;runEnded=false;helpOpen=false;upgradeLevel=0;lastLoadout='';shake=0;toastPriority=0;toastUntil=0;clearInput();for(const id of ['intro','upgrade-overlay','pause-overlay','end-overlay','help-overlay','boss-bar','buff-status','encounter-status','companion-status','portal-action','relic-overlay','super-overlay','shop-overlay'])show(id,false);show('hud');show('run-summary');show('game-bottom');show('touch-skill',coarse);arena.classList.add('playing');initAudio();tone(440,.13,'sine',.045,660);notify(debugMode?(debugConfig.full?'完整调试 · 武器技能满级 · 3 倍移速':'调试模式 · 3 倍移速 · 500 金币 · 天雷无冷却'):'击杀获得经验 · 灵晶强化属性、武器与技能。');worldMap.discover(game,{viewportWidth:width,viewportHeight:height});updateHUD();canvas.focus({preventScroll:true});}
function home(){if(game)archive.finish(game,'quit');resetArchivePanel();cancelDiagnosticCapture();diagnostics?.setMode('default');sceneInputRevision=0;blockedTransitionKeys.clear();mapOpen=false;mapReturnFocus=null;characterOpen=false;characterReturnFocus=null;characterPointer=null;characterTab='attributes';$('character-button').setAttribute('aria-expanded','false');show('character-overlay',false);helpOpen=false;$('map-button').setAttribute('aria-expanded','false');show('map-overlay',false);pendingEvolutions=[];relicChoiceKey='';lastRelics='';superChoiceKey='';lastSupers='';shopKey='';game=null;paused=false;runEnded=false;clearInput();for(const id of ['hud','run-summary','game-bottom','upgrade-overlay','pause-overlay','end-overlay','help-overlay','boss-bar','touch-skill','buff-status','encounter-status','companion-status','portal-action','relic-overlay','super-overlay','shop-overlay'])show(id,false);show('intro');arena.classList.remove('playing');arena.classList.remove('has-encounter');arena.classList.remove('has-relics');arena.classList.remove('near-portal');arena.classList.remove('has-companion');arena.classList.remove('has-rescue-power');arena.classList.remove('has-supers');arena.classList.remove('in-dungeon');$('terrain-code').textContent='01 / THE WHISPERING WOODS';$('terrain-name').textContent='低语之森';$('toast').classList.remove('visible');refreshArchiveEntry();$('start-button').focus({preventScroll:true});}
function pause(){if(!game||!['playing','relic','upgrade','super','shop'].includes(game.status)||runEnded)return;paused=true;checkpointArchive();diagnostics?.breakContinuity();clearInput();show('pause-overlay');refreshDiagnostics();$(archiveOpen?'close-archive':helpOpen?'close-help':characterOpen?'close-character':mapOpen?'close-map':'resume-button').focus({preventScroll:true});}
function focusGameDialog(){const id={relic:'relic-cards',upgrade:'upgrade-cards',super:'super-cards',shop:'shop-items'}[game?.status];if(id)$(id).querySelector('button:not(:disabled)')?.focus({preventScroll:true});else canvas.focus({preventScroll:true});}
function resume(){if(mapOpen||characterOpen||helpOpen||archiveOpen)return;paused=false;clearInput();show('pause-overlay',false);initAudio();focusGameDialog();refreshDiagnosticIndicator();}

function observeArchive(){
  if(!game)return;
  const visibleEnemies=game.sceneTransition?.active?[]:game.enemies.filter(enemy=>enemy.hp>0&&game._inView(enemy)&&sceneVisible(enemy));
  archive.observe(game,{visibleEnemies});
}
function checkpointArchive(){if(game){observeArchive();archive.checkpoint(game,{force:true});}else archive.flush();}
function resetArchivePanel(){archiveOpen=false;archiveReturnFocus=null;show('archive-overlay',false);}
function renderArchive(){
  const content=$('archive-content');
  content.innerHTML=archivePanelHTML(archive.data,{...archiveView,storageOk:archive.storageOk});
  drawArchiveArt(content);
}
function openArchive(){
  if(archiveOpen||game?.sceneTransition?.active)return;
  checkpointArchive();archiveReturnFocus=document.activeElement;archiveOpen=true;clearInput();
  diagnostics?.breakContinuity();renderSchedule.invalidate();renderArchive();show('archive-overlay');
  $('close-archive').focus({preventScroll:true});
}
function closeArchive(){
  if(!archiveOpen)return;archiveOpen=false;clearInput();show('archive-overlay',false);renderSchedule.invalidate();
  if(archiveReturnFocus?.isConnected)archiveReturnFocus.focus({preventScroll:true});
  else if(paused)$('resume-button').focus({preventScroll:true});else if(runEnded)$('restart-button').focus({preventScroll:true});else if(game)focusGameDialog();else $('start-button').focus({preventScroll:true});
  archiveReturnFocus=null;
}
function renderArchiveSummary(report){
  const target=$('end-archive-summary');
  if(report?.excluded){target.textContent='本次冒险未建立记录';return;}
  const parts=[];
  if(report?.discoveries?.length)parts.push(`新增 ${report.discoveries.length} 项图鉴`);
  if(report?.records?.length)parts.push(`刷新 ${report.records.length} 项纪录`);
  const milestones=archiveMilestones(archive.data).filter(item=>item.complete&&!archiveMilestonesBefore.has(item.id));
  if(milestones.length)parts.push(`达成 ${milestones.length} 项里程碑`);
  target.textContent=parts.join(' · ')||(archive.storageOk?'本次冒险已记录':'本次记录仅在当前页面保留');
  if(!archive.storageOk&&parts.length)target.textContent+=' · 暂未保存';
}

function openHelp(){helpOpen=true;clearInput();show('help-overlay');$('close-help').focus({preventScroll:true});}
function closeHelp(){helpOpen=false;show('help-overlay',false);if(!game)$('help-button').focus({preventScroll:true});else if(characterOpen)$('close-character').focus({preventScroll:true});else if(mapOpen)$('close-map').focus({preventScroll:true});else if(paused)$('resume-button').focus({preventScroll:true});else focusGameDialog();}
// The map is an independent pause reason: closing it never consumes an upgrade,
// unpauses an existing pause menu, or resumes a run behind the help dialog.
function openMap(){
  if(!game||runEnded||helpOpen||archiveOpen||game.sceneTransition?.active||!['playing','relic','upgrade','super','shop'].includes(game.status))return;
  if(characterOpen)closeCharacter();
  mapReturnFocus=document.activeElement;mapOpen=true;clearInput();show('map-overlay');$('map-button').setAttribute('aria-expanded','true');renderExpandedMap();$('close-map').focus({preventScroll:true});
}
function closeMap(){
  if(!mapOpen)return;mapOpen=false;clearInput();show('map-overlay',false);$('map-button').setAttribute('aria-expanded','false');
  if(helpOpen)$('close-help').focus({preventScroll:true});else if(paused)$('resume-button').focus({preventScroll:true});else if(game?.status!=='playing')focusGameDialog();else if(mapReturnFocus?.isConnected)mapReturnFocus.focus({preventScroll:true});else canvas.focus({preventScroll:true});mapReturnFocus=null;
}
function renderExpandedMap(){
  if(!game||!mapOpen)return;
  const target=$('expanded-map-canvas'),mapCtx=target.getContext('2d'),side=420;
  target.width=side;target.height=side;const list=$('map-landmarks');list.replaceChildren();
  const add=(name,detail,index)=>{const row=document.createElement('li'),title=document.createElement('strong'),note=document.createElement('span');title.textContent=(index?`${index}. `:'')+name;note.textContent=detail;row.append(title);row.append(note);list.append(row);};
  $('map-title').textContent=game.dungeon?.active?.name||game.region.name;
  const indoor=!!game.dungeon?.active,result=worldMap.draw(mapCtx,game,{width:side,height:side,expanded:true});
  $('map-note').textContent=indoor?'时间已暂停 · 周围 900 范围 · 粗线为已探索墙体':game.terrain?.island?`时间已暂停 · 全岛地图 · 已探索 ${result.explored}%`:'时间已暂停 · 周围 900 范围 · 仅显示已发现的建筑';
  if(game.debug)$('map-note').textContent=indoor?'时间已暂停 · 调试地标全显 · 迷雾保留':`时间已暂停 · 调试地标全显 · 已探索 ${result.explored??0}%`;
  target.setAttribute('aria-label',game.debug?'调试地图：地标全部显示，未探索迷雾保留':'探索地图：显示已发现的地标');
  result.markers.forEach((marker,index)=>add(landmarkLabel(marker),`${landmarkState(marker)} · 距离 ${Math.round(marker.distance)}`,index+1));
  if(!result.markers.length)add(game.terrain?.island&&!indoor?'尚未发现岛上地标':'附近尚无已发现地标',indoor?'沿门口继续探索，迷雾会随视野展开。':'靠近建筑后会记录位置；已完成的建筑仍会保留。');
  $('map-legend').textContent=indoor?'箭头：你与朝向　门：出口　箱子：宝箱　菱形：已发现首领。墙体缺口为通路，暗处保留探索记忆。':'箭头：你　拱门：传送门　双翼：天使　屋顶：小屋　城垛：城堡　菱形：遗迹。灰雾尚未探索；绿门可往返，红门有首领。';
  if(game.debug&&indoor)$('map-legend').textContent='箭头：你与朝向　门：出口　箱子：宝箱　菱形：首领。地标预览不解锁房间视野；墙体随探索显示。';
}
function openUpgrades(){
  if(upgradeLevel===game.progressionTier)return;
  const alreadyOpen=!$('upgrade-overlay').classList.contains('hidden');
  upgradeLevel=game.progressionTier;clearInput();const cards=$('upgrade-cards');cards.replaceChildren();
  const choices=game.getUpgradeChoices(),hasBranches=choices.some(choice=>choice.branch);
  $('upgrade-title').textContent=hasBranches?'选择战斗分支':'灵晶的馈赠';
  $('upgrade-description').textContent=hasBranches?'同一能力分支互斥，选路后仍可继续强化。':game.progressionTier===1?'获得一件武器或一项技能。':`第 ${game.progressionTier} 次灵晶强化 · 选择一项`;
  $('upgrade-note').textContent='时间已暂停 · 伤害为基础值 · 灵晶保留';
  for(const upgrade of choices){
    const card=createChoiceCard(upgrade);
    card.onclick=()=>{
      if(game?.status!=='upgrade'||paused||helpOpen||mapOpen||characterOpen||archiveOpen||!game.chooseUpgrade(upgrade.id))return;tone(540,.18,'sine',.05,810);clearInput();
      // Surplus crystals open the next choice in this same panel, without a hide/show.
      if(game.status==='upgrade')openUpgrades();else show('upgrade-overlay',false);updateHUD();
    };
    cards.append(card);
  }
  if(!alreadyOpen)show('upgrade-overlay');
  if(alreadyOpen)cards.querySelector('button')?.focus({preventScroll:true});
  else setTimeout(()=>cards.querySelector('button')?.focus({preventScroll:true}),80);
}
function createChoiceCard(choice){
  const model=presentUpgrade(choice,game),card=document.createElement('button');
  card.type='button';card.className=`upgrade-card choice-card choice-${model.category}${choice.evolves?' evolution-card':''}${choice.branch?' branch-card':''}`;
  card.style.setProperty('--quality',model.quality.color);
  card.setAttribute('data-category',model.category);card.setAttribute('data-rarity',model.rarity);card.setAttribute('data-tier',model.tier||'regular');card.setAttribute('data-owner',model.ownerId||'character');
  card.innerHTML=upgradeCardHTML(model);return card;
}
function openRelics(){
  const choices=game.getRelicChoices(),key=choices.map(choice=>choice.id).join(',');
  if(key===relicChoiceKey&&!$('relic-overlay').classList.contains('hidden'))return;
  relicChoiceKey=key;clearInput();show('upgrade-overlay',false);const cards=$('relic-cards');cards.replaceChildren();
  $('relic-description').textContent=`选择遗物，前往${game.portal?.nextRegion?.name||'下一区域'}。`;
  cards.style.gridTemplateColumns=`repeat(${Math.min(3,Math.max(1,choices.length))}, minmax(0, 1fr))`;
  for(const relic of choices){
    const card=document.createElement('button');card.className='upgrade-card relic-card';
    card.innerHTML=`<span class="upgrade-icon" style="color:${relic.color}">${relic.icon}</span><span class="upgrade-type">整局遗物</span><h3>${relic.name}</h3><p>${relic.desc}</p><span class="select-arrow"><span>唯一珍藏</span><span>选择并前往 ↗</span></span>`;
    card.onclick=()=>{if(game?.status!=='relic'||paused||helpOpen||mapOpen||characterOpen||archiveOpen)return;if(!game.chooseRelic(relic.id))return;relicChoiceKey='';show('relic-overlay',false);clearInput();tone(540,.25,'sine',.04,960);updateHUD();canvas.focus({preventScroll:true});};cards.append(card);
  }
  show('portal-action',false);show('relic-overlay');cards.querySelector('button')?.focus({preventScroll:true});
}
function updatePortalHUD(){
  const interaction=game?.getInteraction?.();
  const warning=toastPriority>=2&&Date.now()<toastUntil&&$('toast').classList.contains('visible');
  const visible=!!interaction&&game.status==='playing'&&!game.sceneTransition.active&&!runEnded&&!paused&&!helpOpen&&!mapOpen&&!characterOpen&&!archiveOpen&&!warning;
  show('portal-action',visible);arena.classList.toggle('near-portal',visible);arena.classList.toggle('entrance-hint-visible',visible);if(!visible)return;
  // Stable text and one CSS animation; frequent HUD refreshes do not restart it.
  if($('portal-action').textContent!==interaction.label)$('portal-action').textContent=interaction.label;
}
function openSuperChoices(){
  const choices=game.getSuperChoices(),pending=game.superSkills?.pending,key=choices.map(c=>`${c.id}:${c.level}`).join(',')+pending?.source;
  if(key===superChoiceKey&&!$('super-overlay').classList.contains('hidden'))return;
  superChoiceKey=key;clearInput();show('upgrade-overlay',false);show('relic-overlay',false);show('portal-action',false);
  const castle=pending?.source==='castle';$('super-title').textContent=castle?(game.dungeon?.active?.treasureName||'王城深处的秘藏'):'荒野领主的秘藏';
  $('super-description').textContent=castle?'城堡首领奖励 · 选择一项超级技能':'选择领域分支或武器秘术 · 传送门已激活';
  const cards=$('super-cards');cards.replaceChildren();cards.style.gridTemplateColumns=`repeat(${Math.min(3,Math.max(1,choices.length))},minmax(0,1fr))`;
  for(const choice of choices){const card=createChoiceCard(choice);
    card.onclick=()=>{if(game?.status!=='super'||paused||helpOpen||mapOpen||characterOpen||archiveOpen||!game.chooseSuper(choice.id))return;superChoiceKey='';show('super-overlay',false);clearInput();tone(540,.3,'sine',.04,1080);updateHUD();canvas.focus({preventScroll:true});};cards.append(card);
  }
  show('super-overlay');cards.querySelector('button')?.focus({preventScroll:true});
}
function openShop(force=false){
  if(game?.status!=='shop'||!game.settlements?.activeShop)return;
  const items=game.settlements?.getShopItems()||[],site=game.settlements?.activeShop,key=JSON.stringify([site?.id,game.gold,game.player.hp,items]);
  if(!force&&key===shopKey&&!$('shop-overlay').classList.contains('hidden'))return;
  const entering=$('shop-overlay').classList.contains('hidden');shopKey=key;clearInput();show('portal-action',false);$('shop-title').textContent=site?.name||'荒野商人的货摊';$('shop-gold').textContent=game.gold;
  const cards=$('shop-items');cards.replaceChildren();for(const item of items){const button=document.createElement('button');button.className='shop-item';button.disabled=item.available===false||item.stock<=0||game.gold<item.price;
    button.innerHTML=`<span class="shop-icon" style="color:${item.color}">${item.icon}</span><span class="shop-copy"><strong>${item.name}</strong><small>${item.desc}</small><em>${item.stock<=0?'已售罄':item.reason||`剩余 ${item.stock} 份`}</em></span><span class="shop-price">◉ ${item.price}</span>`;
    button.onclick=()=>{if(game?.status!=='shop'||paused||helpOpen||mapOpen||characterOpen||archiveOpen)return;if(game.buyShopItem(item.id)){tone(660,.13,'sine',.035,880);shopKey='';show('shop-overlay',false);clearInput();notify(`已购买${item.name} · 游商已离开`,2);canvas.focus({preventScroll:true});}else{$('shop-feedback').textContent='暂时无法购买，请检查金币或当前状态。';openShop(true);}updateHUD();};cards.append(button);
  }
  if(force)cards.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  if(entering){$('shop-feedback').textContent='购买一件后游商离开 · 交易期间时间暂停';show('shop-overlay');$('shop-close').focus({preventScroll:true});}
}
function closeShop(){if(game?.status!=='shop'||paused||helpOpen||mapOpen||characterOpen||archiveOpen)return;game.closeShop();shopKey='';show('shop-overlay',false);clearInput();updateHUD();canvas.focus({preventScroll:true});}
const uiEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function skillKind(skill){return `${skill.tier==='super'?'超级 · ':''}${skill.activation==='manual'?'手动':'自动'}${skill.binding==='weapon'?' · 武器绑定':''}`;}
function capabilityTitle(item){return `${item.name} · Lv.${item.level}${item.branchName?' · '+item.branchName:''}${item.evolved?' · 已进化':''}`;}
const hudNumber=value=>value>=10000?`${Math.floor(value/100)/10}k`:String(Math.floor(value));
function hudSlotLimit(kind='skills'){
  const fallback=width<600?Math.min(184,Math.max(100,width-186)):height<430?172:208;
  const panelWidth=Math.min($('character-hud').getBoundingClientRect().width||fallback,fallback);
  const total=Math.max(3,Math.min(7,Math.floor((panelWidth-4)/26)));
  const weapons=Math.min(2,game.build.getWeaponLoadout().filter(item=>item.equipped).length);
  return kind==='weapons'?Math.max(1,weapons):Math.max(1,total-weapons);
}
function visibleLoadout(items,kind='skills'){const limit=hudSlotLimit(kind),count=items.length>limit?limit-1:items.length;return {visible:items.slice(0,count),remaining:items.length-count};}
const loadoutOverflow=count=>count?`<span class="combat-slot loadout-overflow" title="另有 ${count} 项，点击查看全部" aria-label="另有 ${count} 项">+${count}</span>`:'';
function updateSuperHUD(){
  const owned=game.build.getSkillLoadout(),barrier=game.barrier;
  const barrierState=barrier?.active?'active':barrier?.ready?'ready':'cooldown';
  const barrierText=barrierState==='active'?'护':barrierState==='ready'?'•':String(Math.ceil(barrier?.cooldown??0));
  const barrierLabel=barrierState==='active'?'屏障保护中':barrierState==='ready'?'屏障就绪待命':`屏障恢复中，${barrierText} 秒`;
  const key=JSON.stringify([hudSlotLimit(),owned.map(s=>[s.id,s.level,s.branch,s.evolved]),barrierState,barrierText]);
  show('super-loadout',owned.length>0);arena.classList.toggle('has-supers',owned.length>0);
  if(key===lastSupers)return;lastSupers=key;
  const {visible,remaining}=visibleLoadout(owned);
  $('super-loadout').innerHTML='<span class="loadout-label">技能</span>'+visible.map(s=>`<div class="combat-slot skill-slot${s.tier==='super'?' super-slot':''}${s.id==='barrier'?` barrier-slot barrier-${barrierState}`:''}" title="${uiEscape(capabilityTitle(s)+' · '+skillKind(s)+(s.id==='barrier'?' · '+barrierLabel:''))}" aria-label="${uiEscape(capabilityTitle(s)+'，'+skillKind(s)+(s.id==='barrier'?'，'+barrierLabel:''))}"><span style="color:${uiEscape(s.color)}">${uiEscape(s.icon)}</span><small>${s.level}</small>${s.id==='barrier'?`<i class="barrier-state" aria-hidden="true">${barrierText}</i>`:''}</div>`).join('')+loadoutOverflow(remaining);
}
function updateWeaponHUD(){
  const equipped=game.build.getWeaponLoadout().filter(w=>w.equipped),key=JSON.stringify([hudSlotLimit('weapons'),equipped.map(w=>[w.id,w.level,w.branch,w.evolved])]);
  if(key===lastLoadout)return;lastLoadout=key;
  const {visible,remaining}=visibleLoadout(equipped,'weapons');
  $('loadout').innerHTML='<span class="loadout-label">武器</span>'+visible.map(w=>`<div class="combat-slot weapon-slot${w.evolved?' evolved':''}${w.branch?' branched':''}" title="${uiEscape(capabilityTitle(w))}" aria-label="${uiEscape(capabilityTitle(w))}"><span>${uiEscape(w.icon)}</span><small>${w.level}</small></div>`).join('')+loadoutOverflow(remaining);
}
function renderCharacter(){
  if(!game||!characterOpen)return;
  $('character-title').textContent=`${game.hero.name} · Lv.${game.player.level}`;
  $('character-note').textContent='时间已暂停 · 数值计入当前强化与增益';
  for(const tab of characterTabs){const button=$(`character-tab-${tab}`),active=tab===characterTab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  $('character-content').setAttribute('aria-labelledby',`character-tab-${characterTab}`);
  $('character-content').innerHTML=characterTab==='army'?armyPanelHTML(game):characterPanelHTML(game,characterTab);
}
function openCharacter(tab='attributes'){
  if(!game||runEnded||helpOpen||archiveOpen||game.sceneTransition?.active||!['playing','relic','upgrade','super','shop'].includes(game.status))return;
  if(mapOpen)closeMap();
  characterReturnFocus=document.activeElement;characterTab=characterTabs.includes(tab)?tab:'attributes';characterOpen=true;characterPointer=null;
  clearInput();renderCharacter();show('character-overlay');$('character-button').setAttribute('aria-expanded','true');$('close-character').focus({preventScroll:true});
}
function closeCharacter(){
  if(!characterOpen)return;characterOpen=false;characterPointer=null;clearInput();show('character-overlay',false);$('character-button').setAttribute('aria-expanded','false');
  if(helpOpen)$('close-help').focus({preventScroll:true});else if(paused)$('resume-button').focus({preventScroll:true});else if(game?.status!=='playing')focusGameDialog();else if(characterReturnFocus?.isConnected)characterReturnFocus.focus({preventScroll:true});else canvas.focus({preventScroll:true});
  characterReturnFocus=null;
}

function updateRelicHUD(){
  const owned=game.relics?.owned||[],key=owned.join(',');arena.classList.toggle('has-relics',owned.length>0);show('relic-loadout',owned.length>0);
  if(key===lastRelics)return;lastRelics=key;
  $('relic-loadout').innerHTML=owned.map(id=>{const relic=RELICS.find(item=>item.id===id);return relic?`<span class="relic-badge" style="color:${relic.color}" title="${relic.name} · ${relic.desc}" aria-label="${relic.name}，${relic.desc}">${relic.icon}</span>`:'';}).join('');
}
function requestPortal(){const interaction=game?.getInteraction?.();if(game?.status==='playing'&&!game.sceneTransition.active&&!paused&&!helpOpen&&!mapOpen&&!characterOpen&&!archiveOpen&&interaction&&interaction.enabled!==false){portalRequested=true;initAudio();}}
function combatPhaseLabel(){
  const phase=bossPhaseLabel(game.enemies,sceneVisible);
  if(phase)return phase;
  if(game.enemies.some(enemy=>enemy.type==='boss'&&enemy.hp>0&&enemy.guardActive!==false&&sceneVisible(enemy)))return '领主来袭';
  if(game.dungeon?.active){const room=game.dungeon.getPacing();return room?.remaining?`视野内守卫 · ${room.remaining}`:game.dungeon.active.kind==='hut'?'探索屋内补给':'穿过门口 · 探索迷宫';}
  const wave=game.waveDirector.summary();
  if(wave.phase==='warning')return `${wave.directionLabel}来袭 · ${wave.seconds}s`;
  if(wave.phase==='siege')return `${wave.name} · 剩余 ${wave.remaining}`;
  if(wave.phase==='relief')return `收集战利品 · ${wave.seconds}s`;
  return game.regions.endlessUnlocked?'无尽怪潮':`岛屿探索 · 已开 ${game.regions.defeatedConnectionsCount??0} 条通路`;
}
function waveProgressLabel(){
  if(game.dungeon?.active){const room=game.dungeon.getPacing();return game.dungeon.active.kind==='hut'?game.dungeon.active.name:`已清理 ${room.clearedRooms} 间`; }
  const wave=game.waveDirector.summary();
  return wave.phase==='warning'||wave.phase==='siege'?`第 ${game.wave} 波 · ${wave.directionLabel}`:wave.phase==='relief'?(wave.cleared?'怪潮已击破':'兽群攻势放缓'):`${game.region.shortName||game.region.name} · 探索补给`;
}
function announceCombatEvents(events){
  for(const event of events)if(event.type==='evolution'&&!pendingEvolutions.some(item=>item.weaponId===event.weaponId)&&pendingEvolutions.length<3)pendingEvolutions.push(event);
  const boss=game.enemies.find(enemy=>enemy.type==='boss'&&sceneVisible(enemy));
  if(events.some(event=>event.type==='worldsConnected'))notify('三条通路已打通 · 无尽怪潮开启，继续探索其他世界',3);
  else if(events.some(event=>event.type==='dungeonBossKill'))notify('最终首领已击败 · 靠近宝藏领取超级技能',3);
  else if(events.some(event=>event.type==='dungeonCleared')){const event=events.find(event=>event.type==='dungeonCleared'),reward=event.reward||{gold:80,crystals:100};notify(`${event.treasureName||'王城宝藏'}已领取 · 超级技能、${reward.gold}金币与${reward.crystals}灵晶`,3);}
  else if(events.some(event=>event.type==='dungeonEnter'))notify(`进入${game.dungeon?.active?.name||'遗迹'} · ${game.dungeon?.active?.kind==='hut'?'探索内部，寻找宝藏':'探索迷雾中的房间'}`,2);
  else if(events.some(event=>event.type==='dungeonRoomCleared'))notify('房间已清理 · 拾取补给后继续深入',1);
  else if(events.some(event=>event.type==='dungeonExit'))notify('重返荒野 · 室内探索进度已保留',2);
  else if(events.some(event=>event.type==='houseCleared'))notify('守卫已清除 · 开启内部宝箱',2);
  else if(events.some(event=>event.type==='houseGuard'))notify('遗迹守卫现身 · 清除守卫后领取宝藏',2);
  else if(events.some(event=>event.type==='angelBlessing'))notify(events.find(event=>event.type==='angelBlessing').healed?'天使的祝福 · 生命已恢复':'天使的祝福 · 获得护盾',2);
  else if(events.some(event=>event.type==='houseOpened'))notify(`${game.dungeon?.active?.treasureName||'小屋宝藏'}已领取 · 金币与灵晶已入账`,1);
  else if(events.some(event=>event.type==='dungeonChest'))notify('古堡宝箱已开启 · 金币、灵晶与恢复补给',1);
  else if(boss&&events.some(event=>event.type==='boss'))notify(enemyVisual(boss).arrival(game.bossCount),3);
  else if(events.some(event=>event.type==='bossKill'))notify(game.portal?`领主已击败 · 超级技能已解锁，已开 ${game.regions.defeatedConnectionsCount??0} 条通路`:'领主已击败 · 无尽挑战继续',3);
  else if(boss&&bossWarning(events,boss))notify(bossWarning(events,boss),3);
  else if(events.some(event=>event.type==='bossWindup')||game.enemies.some(enemy=>(bossWindingUp(enemy))&&sceneVisible(enemy)))return;
  else if(pendingEvolutions.length&&(Date.now()>=toastUntil||toastPriority<2)){const evolution=pendingEvolutions.shift();notify(`${evolution.name} · ${evolution.weaponId==='orbit'?'武器已进化':'技能分支已解锁'}`,2);}
  else if(events.some(event=>event.type==='companionJoined')){const joined=events.find(event=>event.type==='companionJoined');notify(`${joined.name}加入军团 · 每 30 秒支付维持费`,2);}
  else if(events.some(event=>event.type==='rescueReady'))notify('围困怪物已清除 · 靠近受困者完成解救',2);
  else if(events.some(event=>event.type==='rescueExpired'))notify('营救机会已错过 · 继续寻找其他旅人',1);
  else if(events.some(event=>event.type==='companionUpkeepWarning'))notify('军团维持费不足 · 请及时补充金币',2);
  else if(events.some(event=>event.type==='companionRecoveryBlocked')){const event=events.find(event=>event.type==='companionRecoveryBlocked');notify(`${event.name}等待救治 · 需要 ${event.cost} 金币`,2);}
  else if(events.some(event=>event.type==='companionRecovering')){const event=events.find(event=>event.type==='companionRecovering');notify(`${event.name}暂时退战 · 恢复需 ${event.cost} 金币`,1);}
  else if(events.some(event=>event.type==='companionRecovered')){const event=events.find(event=>event.type==='companionRecovered');notify(`${event.name}恢复战斗 · 救治花费 ${event.cost} 金币`,1);}
  else if(events.some(event=>event.type==='stonevaultOpened'))notify('岩灵击碎封石 · 秘藏入口已打开',2);
  else if(events.some(event=>event.type==='rescueAppeared'))notify('发现受困旅人 · 循指引清除围困怪物',1);
  else if(events.some(event=>event.type==='companionLeft')){const left=events.find(event=>event.type==='companionLeft');notify(`${left.name}离队${left.reason==='unpaid'?' · 金币不足':''}`,1);}
  else if(events.some(event=>event.type==='regionEnter'))notify(`已抵达${game.region.name} · 探索岛屿，寻找野生传送门`,2);
  else if(events.some(event=>event.type==='portalOpened'))notify(`传送门已激活 · 已开 ${game.regions.defeatedConnectionsCount??0} 条通路 · 可往返`,2);
  else if(events.some(event=>event.type==='encounterComplete'))notify('林间挑战完成 · 资源已入账，靠近拾取补给',2);
  else if(events.some(event=>event.type==='treasureOpened'))notify('守卫宝箱已开启 · 金币与灵晶已入账',2);
  else if(events.some(event=>event.type==='treasureUnlocked'))notify('守卫已击败 · 靠近宝箱领取奖励',2);
  else if(events.some(event=>event.type==='treasureGuard'))notify('精英守卫现身 · 击败它可解锁宝箱',2);
  else if(events.some(event=>event.type==='waveCleared'))notify('怪潮击破 · 灵晶奖励到账，战利品汇聚',2);
  else if(events.some(event=>event.type==='branchChosen'))notify(`${events.find(event=>event.type==='branchChosen').name} · 分支已确定，可继续强化`,2);
  else if(events.some(event=>event.type==='weaponAcquired')){const acquired=events.find(event=>event.type==='weaponAcquired');notify(`${acquired.category==='skill'?'学会技能':'获得武器'} · ${acquired.name}`,2);}
  else if(events.some(event=>event.type==='wave'))notify(`${game.waveDirector.summary().directionLabel}兽群逼近 · 留意来袭方向`,1);
  else if(events.some(event=>event.type==='siege'))notify(`${game.waveDirector.summary().name} · 击破这一波怪群`,1);
  else if(events.some(event=>event.type==='encounterHunt'))notify('林间狩猎 · 可前往标记区域挑战',1);
  else if(events.some(event=>event.type==='encounterTreasure'))notify('宝物精出现 · 追击它可获得丰厚金币',1);
  else if(events.some(event=>event.type==='encounterExpired'))notify('林间事件已结束 · 继续探索',1);
  else if(events.some(event=>event.type==='fury'))notify('狂暴涌动 · 火力暂时增强',1);
  else if(events.some(event=>event.type==='magnet'))notify('磁力涌动 · 灵晶持续汇聚',1);
  else if(events.some(event=>event.type==='herb'))notify(events.some(event=>event.type==='herb'&&event.healed>0)?'拾取药草 · 恢复生命':'拾取药草 · 生命已满',1);
  else if(events.some(event=>event.type==='treasure'))notify('林间出现守卫宝箱 · 可循金色指引挑战',1);
  else if(events.some(event=>event.type==='relief'))notify('攻势放缓 · 趁机拾取补给，调整位置',1);
}
function endGame(){if(runEnded)return;runEnded=true;cancelDiagnosticCapture();clearInput();const report=archive.finish(game,'death');const newBest=!!report?.records?.some(item=>item.key==='time');renderArchiveSummary(report);$('end-emblem').textContent=newBest?'♜':'✦';$('end-kicker').textContent=newBest?'A NEW PERSONAL BEST':'THE JOURNEY CONTINUES';$('end-title').textContent=newBest?'你的极限，又远了一点。':'荒野记住了你。';$('end-description').textContent=`抵达第 ${game.wave} 波 · 击败 ${game.bossKills} 位领主。下一次，再远一点。`;$('end-time').textContent=timeLabel(game.runTime??game.time);$('end-kills').textContent=game.kills;$('end-level').textContent=game.player.level;show('end-overlay');show('touch-skill',false);show('buff-status',false);show('encounter-status',false);show('companion-status',false);show('portal-action',false);tone(220,.4,'sine',.06,110);$('restart-button').focus({preventScroll:true});}
function updateBuffHUD(){const adventure=game?.adventure,fury=adventure?.furyTime||0,magnet=adventure?.magnetTime||0;show('buff-status',!runEnded&&(fury>0||magnet>0));show('fury-buff',fury>0);show('magnet-buff',magnet>0);$('fury-time').textContent=Math.ceil(fury);$('magnet-time').textContent=Math.ceil(magnet);}
function rescueCamps(){return game?.companions?.camps||(game?.companions?.camp?[game.companions.camp]:[]);}
function activeEncounters(){return game?.encounters?.activities||(game?.encounters?.active?[game.encounters.active]:[]);}
function updateEncounterHUD(){
  const foot={x:game?.player.x||0,y:(game?.player.y||0)+ACTOR_VISUALS.player.foot*1.1};
  const candidates=[...rescueCamps().map(entity=>({entity,rescue:true})),...activeEncounters().map(entity=>({entity,rescue:false}))];
  for(const item of candidates){item.distance=Math.hypot(item.entity.x-foot.x,item.entity.y-foot.y);item.engaged=item.rescue?item.distance<(item.entity.state==='ready'?100:240):item.distance<(item.entity.type==='hunt'?item.entity.r:330);}
  candidates.sort((a,b)=>Number(b.engaged)-Number(a.engaged)||a.distance-b.distance);
  const selected=candidates[0],active=selected?.entity,camp=selected?.rescue?active:null,visible=!!active&&!runEnded;
  show('encounter-status',visible);arena.classList.toggle('has-encounter',visible);if(!active)return;
  const hunt=!camp&&active.type==='hunt',inside=hunt&&selected.distance<=active.r;
  $('encounter-status').classList.toggle('with-boss',game.enemies.some(enemy=>enemy.type==='boss'&&enemy.hp>0&&enemy.guardActive!==false&&sceneVisible(enemy)));
  $('encounter-status').classList.toggle('treasure-event',!camp&&!hunt);$('encounter-status').classList.toggle('rescue-event',!!camp);$('encounter-status').classList.toggle('rescue-ready',camp?.state==='ready');$('encounter-status').classList.toggle('urgent',active.life<=10);
  $('encounter-icon').textContent=camp?(camp.kind==='stormcaller'?'ϟ':'◈'):hunt?'◎':'◇';
  $('encounter-name').textContent=camp?`营救${camp.name}`:hunt?'林间狩猎':'追逐宝物精';
  $('encounter-goal').textContent=camp?(camp.state==='ready'?'围困已解除 · 靠近解救':`清除围困怪物 · ${Math.max(0,camp.guardTotal-camp.remainingGuards)} / ${camp.guardTotal}`):hunt?`${inside?'擂台击败':'进入擂台'} · ${active.progress} / ${active.goal}`:'击败金色宝物精 · 夺取补给';
  $('encounter-time').textContent=active.siteId?'遗迹':`${Math.max(0,Math.ceil(active.life))}秒`;
}
function updateCompanionHUD(){
  const team=game.companions,members=team?.members||[],power=game.rescuePower||0,visible=!runEnded&&!!(members.length||power);
  show('companion-status',visible);show('companion-detail',!!members.length);show('rescue-power',power>0);
  arena.classList.toggle('has-companion',members.length>0&&!runEnded);arena.classList.toggle('has-rescue-power',power>0&&!runEnded);
  if(members.length){
    const fee=team.upkeep,recovering=members.filter(m=>m.state==='recovering').length;
    $('companion-icon').textContent='♟';$('companion-name').textContent=`军团 ${members.length} 位伙伴${recovering?`，${recovering} 位恢复中`:''}`;
    $('companion-time').textContent=`${members.length} · ${fee}◉/30s`;
    $('companion-status').classList.toggle('army-unpaid',!!team.graceUntil);
    $('companion-status').title=`${members.map(m=>m.name).join('、')} · 点击主角详情查看军团`;
  }
  $('rescue-power').textContent=`援助 Lv.${power} · 基础伤害 +${power*8}%`;
}
function updateHUD(){if(!game)return;
  if(diagnostics?.hudDisabled&&renderSchedule.isLive(frameState())){
    // Input handlers still enforce real cooldowns while numeric HUD is frozen.
    if($('skill-button').disabled)$('skill-button').disabled=false;
    if($('touch-skill').disabled)$('touch-skill').disabled=false;
    return;
  }
  const measureHud=diagnostics?.running,hudBegan=measureHud?cpuNow():0;
  try{renderSchedule.invalidate();arena.classList.toggle('in-dungeon',!!game.dungeon?.active);updateBuffHUD();updateEncounterHUD();updateCompanionHUD();updatePortalHUD();updateRelicHUD();updateSuperHUD();$('terrain-code').textContent=`${String(game.regionIndex+1).padStart(2,'0')} / ${game.region.id.toUpperCase()}`;$('terrain-name').textContent=game.dungeon?.active?.name||game.region.name;const p=game.player;$('hp-label').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;$('health-fill').style.width=`${100*p.hp/p.maxHp}%`;$('health-fill').style.background=p.hp/p.maxHp<.3?'#e59578':'#c4e69c';$('xp-fill').style.width=`${Math.min(100,100*p.xp/p.xpNext)}%`;$('level-label').textContent=`LV. ${p.level}`;$('xp-caption').textContent=`${hudNumber(p.xp)} / ${hudNumber(p.xpNext)}`;$('crystal-fill').style.width=`${Math.min(100,100*(game.crystals||0)/(game.crystalsNext||1))}%`;$('crystal-label').textContent=`${hudNumber(game.crystals||0)} / ${hudNumber(game.crystalsNext||0)}`;$('gold-label').textContent=hudNumber(game.gold||0);$('timer').textContent=timeLabel(game.runTime??game.time);$('phase-label').textContent=combatPhaseLabel();$('wave-label').textContent=width<600?`第 ${game.wave} 波`:waveProgressLabel();$('kills').textContent=game.kills;$('skill-button').title=`天雷轰击 · 超级技能 Lv.${game.build.getSkill('storm').level} · 空格 · 冷却 ${p.skillCooldownMax} 秒`;$('skill-label').textContent=p.skillCooldown>0?`天雷 ${p.skillCooldown.toFixed(1)}s`:'天雷轰击 · 就绪';$('skill-fill').style.width=`${100*clamp((p.skillCooldownMax>0?1-p.skillCooldown/p.skillCooldownMax:1),0,1)}%`;$('touch-skill').classList.toggle('cooldown',p.skillCooldown>0);$('skill-button').disabled=p.skillCooldown>0;$('touch-skill').disabled=p.skillCooldown>0;$('skill-symbol').textContent=p.skillCooldown>0?`${Math.ceil(p.skillCooldown)}s`:'ϟ';$('touch-skill-label').textContent=p.skillCooldown>0?'冷却中':'天雷';$('touch-skill').setAttribute('aria-label',p.skillCooldown>0?`天雷轰击，冷却 ${Math.ceil(p.skillCooldown)} 秒`:'释放天雷轰击');const boss=game.enemies.find(e=>e.type==='boss'&&e.hp>0&&sceneVisible(e)&&e.guardActive!==false);show('boss-bar',!!boss);$('boss-bar').classList.toggle('bloom-boss',enemyVisual(boss)?.barClass==='bloom-boss');if(boss){$('boss-name').textContent=boss.dungeonBoss?`${boss.name||'王城守望者'} · 最终首领`:`${bossDefinition(boss.bossKind||'ancient').name} · 第 ${game.bossCount} 位`;$('boss-fill').style.width=`${100*boss.hp/boss.maxHp}%`;$('boss-hp').textContent=`${Math.ceil(100*boss.hp/boss.maxHp)}%`;}updateWeaponHUD();}finally{if(measureHud)frameHudMs+=cpuNow()-hudBegan;}
}

function debugArmyAction(recruit){
  if(!debugMode||!game||runEnded||game.status!=='playing'||game.sceneTransition.active)return;
  if(recruit){for(const kind of ['stormcaller','warden','dog','owl','golem'])game.companions.recruit(kind,{sourceId:'debug'});game.companions.onSceneChange();archive.observe(game);notify('五位伙伴已就位 · 主角详情可查看军团',2);}
  else for(const member of [...game.companions.members])game.companions.dismiss(member.id,'dismissed');
  updateHUD();if(characterOpen)renderCharacter();renderSchedule.invalidate();
}
$('debug-recruit-army').onclick=()=>debugArmyAction(true);
$('debug-dismiss-army').onclick=()=>debugArmyAction(false);
function refreshDiagnostics(){
  if(!diagnostics)return;
  show('debug-diagnostics');
  for(const mode of diagnosticModes)$(`diagnostic-${mode}`).setAttribute('aria-pressed',String(mode===diagnostics.mode));
  const ready=!!game&&game.status==='playing'&&!game.sceneTransition.active&&!runEnded;
  $('debug-recruit-army').disabled=!ready;$('debug-dismiss-army').disabled=!ready;
  $('diagnostic-start').disabled=!ready;
  $('diagnostic-start').textContent='单组 15 秒';
  $('diagnostic-auto').disabled=!ready;
  $('diagnostic-copy').disabled=diagnostics.reports.length===0;
  $('diagnostic-status').textContent=diagnostics.running?`${diagnosticSequence?`全自动 ${diagnosticSequence.index+1}/3 · `:''}${diagnosticLabels[diagnostics.mode]}采样已暂停，继续冒险可接着记录。`:diagnosticNotice;
  $('diagnostic-output').value=diagnostics.exportText();
  show('diagnostic-details',diagnostics.reports.length>0);refreshDiagnosticIndicator();
}
function refreshDiagnosticIndicator(){
  if(!diagnostics)return;
  const visible=diagnostics.running&&!paused&&!!game&&!runEnded;
  show('diagnostic-live',visible);
  if(visible)$('diagnostic-live').textContent=diagnosticSequence?`性能对照 ${diagnosticSequence.index+1}/3 · ${diagnosticLabels[diagnostics.mode]} · 5 秒`:`单组采集 · ${diagnosticLabels[diagnostics.mode]} · 15 秒`;
}
function cancelDiagnosticCapture(){
  if(!diagnostics)return;
  diagnostics.cancel();
  if(diagnosticSequence)diagnostics.setMode('default');
  diagnosticSequence=null;refreshDiagnosticIndicator();
}
function diagnosticMetadata(){
  return {version:$('game-version').textContent,viewport:`${width} × ${height}`,buffer:`${canvas.width} × ${canvas.height}`,nativeDpr,renderDpr:dpr,browser:globalThis.navigator?.userAgent||'unknown',scene:game.dungeon?.active?.name||game.region.name,position:`${Math.round(game.player.x)}, ${Math.round(game.player.y)}`,enemies:game.enemies.length};
}
function beginDiagnosticStage(){
  const sequence=diagnosticSequence;
  if(sequence)diagnostics.setMode(diagnosticModes[sequence.index]);
  const metadata=diagnosticMetadata();
  if(sequence)Object.assign(metadata,{capture:'全自动',batch:sequence.id,stage:`${sequence.index+1}/3`});
  else metadata.capture='单组';
  diagnostics.start(metadata,sequence?{durationMs:5000}:{});
  diagnosticNotice='采样中';renderSchedule.invalidate();refreshDiagnosticIndicator();
  if(diagnostics.hudDisabled){$('skill-button').disabled=false;$('touch-skill').disabled=false;}
}
function startDiagnosticCapture(automatic=false){
  if(!diagnostics||!game||game.status!=='playing'||game.sceneTransition.active||runEnded)return;
  const selectedMode=diagnostics.mode;
  cancelDiagnosticCapture();
  if(automatic)diagnosticSequence={index:0,id:new Date().toISOString()};
  else diagnostics.setMode(selectedMode);
  beginDiagnosticStage();refreshDiagnostics();resume();
}
function finishDiagnosticStage(){
  if(diagnosticSequence&&diagnosticSequence.index<diagnosticModes.length-1){
    diagnosticSequence.index++;beginDiagnosticStage();return;
  }
  const wasAutomatic=!!diagnosticSequence;
  cancelDiagnosticCapture();
  diagnosticNotice=wasAutomatic?'全自动采样完成：三组结果已保留，已恢复默认显示。':`采样完成，已保留 ${diagnostics.reports.length} 组结果。`;
  pause();updateHUD();
}
async function copyDiagnostics(){
  if(!diagnostics?.reports.length)return;
  const text=diagnostics.exportText(),output=$('diagnostic-output');output.value=text;
  try{
    if(!globalThis.navigator?.clipboard?.writeText)throw new Error('clipboard unavailable');
    await globalThis.navigator.clipboard.writeText(text);
    diagnosticNotice=`已复制 ${diagnostics.reports.length} 组结果，可直接粘贴到对话。`;refreshDiagnostics();
  }catch{
    $('diagnostic-details').open=true;output.focus();output.select();
    diagnosticNotice='请在已选中的结果中复制（Mac：⌘C）。';$('diagnostic-status').textContent=diagnosticNotice;
  }
}
if(diagnostics){
  for(const mode of diagnosticModes)$(`diagnostic-${mode}`).onclick=()=>{
    cancelDiagnosticCapture();diagnostics.setMode(mode);diagnosticNotice='已切换对照项，请开始采样。';renderSchedule.invalidate();updateHUD();refreshDiagnostics();
  };
  $('diagnostic-start').onclick=()=>startDiagnosticCapture();$('diagnostic-auto').onclick=()=>startDiagnosticCapture(true);$('diagnostic-copy').onclick=copyDiagnostics;
}

$('upgrade-pause').onclick=pause;$('super-pause').onclick=pause;$('shop-pause').onclick=pause;$('shop-close').onclick=closeShop;
$('map-button').onclick=openMap;$('close-map').onclick=closeMap;$('map-done').onclick=closeMap;
$('map-button').addEventListener('pointerdown',e=>{e.stopPropagation();clearInput();});
$('map-overlay').addEventListener('pointerdown',e=>e.stopPropagation());
$('character-button').addEventListener('pointerdown',e=>{e.stopPropagation();characterPointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,blocked:!!touch};$('character-button').setPointerCapture?.(e.pointerId);});
const moveCharacterPointer=e=>{if(characterPointer?.id===e.pointerId&&Math.hypot(e.clientX-characterPointer.x,e.clientY-characterPointer.y)>8)characterPointer.moved=true;};
$('character-button').addEventListener('pointermove',moveCharacterPointer);
$('character-button').addEventListener('pointerup',moveCharacterPointer);
$('character-button').addEventListener('pointercancel',()=>{if(characterPointer)characterPointer.moved=true;});
$('character-button').onclick=e=>{e?.stopPropagation();const rejected=e?.detail!==0&&(characterPointer?.moved||characterPointer?.blocked);characterPointer=null;if(!rejected)openCharacter();};
$('pause-character-button').onclick=()=>openCharacter();
$('close-character').onclick=$('character-done').onclick=closeCharacter;
$('character-overlay').addEventListener('pointerdown',e=>e.stopPropagation());
for(const [index,tab] of characterTabs.entries()){
  const button=$(`character-tab-${tab}`);
  button.onclick=()=>{if(!characterOpen)return;characterTab=tab;renderCharacter();};
  button.addEventListener('keydown',e=>{
    if(!characterOpen||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();const next=e.key==='Home'?0:e.key==='End'?characterTabs.length-1:(index+(e.key==='ArrowRight'?1:characterTabs.length-1))%characterTabs.length;
    characterTab=characterTabs[next];renderCharacter();$(`character-tab-${characterTab}`).focus({preventScroll:true});
  });
}
$('character-content').addEventListener('click',e=>{
  const dismiss=e.target.closest?.('button[data-dismiss-companion]');
  if(dismiss&&characterOpen&&game?.status==='playing'){game.companions.dismiss(Number(dismiss.getAttribute('data-dismiss-companion')),'dismissed');renderCharacter();updateHUD();$('character-tab-army').focus({preventScroll:true});return;}
  const button=e.target.closest?.('button[data-weapon-id]');
  if(!button||button.disabled||!characterOpen||helpOpen||mapOpen||game?.status!=='playing')return;
  const id=button.getAttribute('data-weapon-id');
  if(game.setWeaponEquipped(id,button.getAttribute('data-equipped')!=='true')){
    renderCharacter();updateHUD();$(`character-equip-${id}`).focus({preventScroll:true});
  }
});

for(const id of ['archive-button','pause-archive-button','end-archive-button'])$(id).onclick=openArchive;
$('close-archive').onclick=closeArchive;
$('archive-overlay').addEventListener('pointerdown',e=>e.stopPropagation());
$('archive-content').addEventListener('click',e=>{
  const button=e.target.closest?.('button');if(!button||!archiveOpen)return;
  for(const [attribute,key,allowed] of [['tab','tab',ARCHIVE_TABS.map(item=>item.id)],['category','category',ARCHIVE_CATEGORIES.map(item=>item.id)],['difficulty','difficulty',['normal','casual']],['entry','selectedId',null]]){
    const value=button.getAttribute(`data-archive-${attribute}`);if(value===null||value===undefined||allowed&&!allowed.includes(value))continue;
    archiveView[key]=value;if(key==='category')archiveView.selectedId=null;
    renderArchive();
    if(key==='selectedId'&&width<=650)$('archive-content').querySelector('[data-archive-detail]')?.focus({preventScroll:false});
    else $('archive-content').querySelector(`[data-archive-${attribute}="${value}"]`)?.focus({preventScroll:true});
    break;
  }
});
window.addEventListener('pagehide',checkpointArchive);
$('start-button').onclick=startGame;$('restart-button').onclick=startGame;$('home-button').onclick=home;$('quit-button').onclick=home;$('pause-button').onclick=pause;$('resume-button').onclick=resume;$('help-button').onclick=openHelp;$('pause-help-button').onclick=openHelp;$('close-help').onclick=closeHelp;$('help-done').onclick=closeHelp;
$('sound-button').onclick=$('pause-sound-button').onclick=()=>{soundOn=!soundOn;syncSound();try{localStorage.setItem('wild-echoes-sound',soundOn?'on':'off');}catch{}initAudio();if(soundOn)tone(660,.1);};
canvas.tabIndex=-1;
// Cancel browser selection/callouts before child UI can stop bubbling. Keep
// pointer/touch input untouched so holds, multi-touch controls and scrolling work.
const gameInputRoot=arena.closest('.app');
function suppressGameCallout(e){
  const target=e.target?.nodeType===3?e.target.parentElement:e.target;
  if(!target||target.isContentEditable||target.closest?.('input,textarea,select'))return;
  if(e.cancelable)e.preventDefault();
}
for(const type of ['contextmenu','selectstart','dragstart']){
  gameInputRoot.addEventListener(type,suppressGameCallout,{capture:true,passive:false});
}
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='Escape'||e.code==='KeyP'){if(e.repeat)return;if(archiveOpen){e.preventDefault();closeArchive();return;}if(helpOpen){e.preventDefault();closeHelp();return;}if(characterOpen){e.preventDefault();closeCharacter();return;}if(mapOpen){e.preventDefault();closeMap();return;}if(game&&['playing','relic','upgrade','super','shop'].includes(game.status)){e.preventDefault();paused?resume():pause();}return;}if(e.code==='KeyC'){if(!game||runEnded||helpOpen||archiveOpen)return;e.preventDefault();if(!e.repeat)characterOpen?closeCharacter():openCharacter();return;}if(e.code==='KeyM'){if(!game||runEnded||helpOpen||archiveOpen)return;e.preventDefault();if(!e.repeat)mapOpen?closeMap():openMap();return;}if(['BUTTON','SUMMARY'].includes(e.target.tagName)&&['Space','Enter'].includes(e.code))return;if(!game||game.status!=='playing'||paused||helpOpen||mapOpen||characterOpen||archiveOpen)return;if(game.sceneTransition.active||blockedTransitionKeys.has(e.code)){blockedTransitionKeys.add(e.code);e.preventDefault();return;}if(e.code==='KeyE'){e.preventDefault();if(!e.repeat)requestPortal();return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)requestSkill();}});
window.addEventListener('keyup',e=>{keys.delete(e.code);blockedTransitionKeys.delete(e.code);});
window.addEventListener('blur',()=>{clearInput();if(game?.status==='playing')pause();});document.addEventListener('visibilitychange',()=>{diagnostics?.breakContinuity();last=0;clearInput();renderSchedule.invalidate();resetDebugFps();if(document.hidden){checkpointArchive();if(game?.status==='playing')pause();}});
canvas.addEventListener('pointerdown',e=>{if(!game||game.status!=='playing'||game.sceneTransition.active||paused||helpOpen||mapOpen||characterOpen||archiveOpen||touch)return;e.preventDefault();const r=canvas.getBoundingClientRect();touch={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top,dx:0,dy:0};canvas.setPointerCapture(e.pointerId);$('joystick').style.left=`${touch.x}px`;$('joystick').style.top=`${touch.y}px`;show('joystick');initAudio();});
canvas.addEventListener('pointermove',e=>{if(!touch||touch.id!==e.pointerId)return;const r=canvas.getBoundingClientRect();let dx=e.clientX-r.left-touch.x,dy=e.clientY-r.top-touch.y;const d=Math.hypot(dx,dy),m=Math.min(d,40)/(d||1);touch.dx=dx*m/40;touch.dy=dy*m/40;$('joystick-thumb').style.transform=`translate(${dx*m}px,${dy*m}px)`;});
function releaseTouch(e){if(touch?.id===e.pointerId){touch=null;show('joystick',false);}}
canvas.addEventListener('pointerup',releaseTouch);canvas.addEventListener('pointercancel',releaseTouch);canvas.addEventListener('lostpointercapture',releaseTouch);
function requestSkill(){if(game?.status==='playing'&&!game.sceneTransition.active&&!paused&&!helpOpen&&!mapOpen&&!characterOpen&&!archiveOpen&&game.player.skillCooldown<=0){skillRequested=true;initAudio();}}
$('relic-pause').onclick=pause;
$('skill-button').onclick=requestSkill;
$('touch-skill').onclick=requestSkill;
$('touch-skill').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();requestSkill();});
// Keep keyboard focus inside whichever dialog is currently active.
document.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const dialog=[...document.querySelectorAll('.modal-layer')].reverse().find(x=>!x.classList.contains('hidden'));if(!dialog)return;const focusable=[...dialog.querySelectorAll('button:not(:disabled),select,a[href],summary')];if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}});

function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
function line(x1,y1,x2,y2,color,w=1){ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function diamond(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r*.66,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r*.66,y);ctx.closePath();ctx.fill();}
function glow(x,y,r,color,target=ctx){const g=target.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');target.fillStyle=g;target.fillRect(x-r,y-r,r*2,r*2);}
function grass(x,y,s,seed){ctx.strokeStyle=['#5c765038','#67845744','#8b9c5f33'][Math.floor(seed*3)];ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x-4*s,y);ctx.quadraticCurveTo(x-6*s,y-5*s,x-9*s,y-7*s);ctx.moveTo(x,y);ctx.quadraticCurveTo(x-1*s,y-9*s,x+1*s,y-13*s);ctx.moveTo(x+4*s,y);ctx.quadraticCurveTo(x+5*s,y-6*s,x+9*s,y-7*s);ctx.stroke();}
function stone(x,y,s,seed){decorativeShadowShapes.push({x,y:y+3*s,rx:14*s,ry:7*s});ellipse(x,y+3*s,14*s,7*s,'#10241950');ctx.fillStyle=seed>.5?'#59634e':'#475744';ctx.beginPath();ctx.moveTo(x-12*s,y+2*s);ctx.lineTo(x-8*s,y-8*s);ctx.lineTo(x+4*s,y-11*s);ctx.lineTo(x+12*s,y-3*s);ctx.lineTo(x+10*s,y+5*s);ctx.closePath();ctx.fill();ctx.fillStyle='#8a927454';ctx.beginPath();ctx.moveTo(x-8*s,y-8*s);ctx.lineTo(x+4*s,y-11*s);ctx.lineTo(x+6*s,y-4*s);ctx.lineTo(x-6*s,y-1*s);ctx.closePath();ctx.fill();grass(x+8*s,y+7*s,.7*s,seed);}
function flower(x,y,s,seed){line(x,y,x+2*s,y-9*s,'#8b966255',1);ellipse(x+2*s,y-10*s,2.5*s,2*s,seed>.5?'#d5d8a37a':'#9eaca67a');ellipse(x+4*s,y-7*s,1.8*s,1.8*s,'#e0daa877');}
function fern(x,y,s,seed){ctx.save();ctx.translate(x,y);ctx.rotate(seed*1.5-.75);for(let i=0;i<5;i++){const a=(i-2)*.36;ctx.save();ctx.rotate(a);line(0,0,0,-25*s,'#77996055',1.2);for(let k=0;k<5;k++){const yy=-5*s-k*4*s;ctx.fillStyle=k%2?'#537847aa':'#76935490';ctx.beginPath();ctx.ellipse(-3*s,yy,5*s,1.7*s,.5,0,TAU);ctx.ellipse(3*s,yy,5*s,1.7*s,-.5,0,TAU);ctx.fill();}ctx.restore();}ctx.restore();}
function tree(x,y,s,seed){decorativeShadowShapes.push({x:x+12*s,y:y+20*s,rx:50*s,ry:32*s});ctx.save();ctx.translate(x,y);ellipse(12*s,20*s,50*s,32*s,'#0a1c1440');line(0,6*s,-3*s,-35*s,'#4d5137',12*s);for(let i=0;i<7;i++){const a=i*2.4,rr=(18+(i%3)*7)*s,cx=Math.cos(a)*rr,cy=-20*s+Math.sin(a)*rr*.6;ellipse(cx,cy,29*s,23*s,['#284631','#304e33','#375438'][i%3]);ellipse(cx-5*s,cy-8*s,18*s,7*s,'#72835110');}for(let i=0;i<7;i++)ellipse((hash(seed+i)*60-30)*s,(-45+hash(i,seed)*40)*s,3*s,1.3*s,'#95a57228');ctx.restore();}
// Light patches are generated from map cells, never from the player or viewport center.
function sunBeamGeometry(x,y,verticalSpan,nearWidth,farWidth){
  return {x,y,endX:x+SUN.x/SUN.y*verticalSpan,endY:y+verticalSpan,nearWidth,farWidth};
}
function sunBeamPath(beam,target=ctx){
  const {x,y,endX,endY,nearWidth,farWidth}=beam,nx=SUN.y,ny=-SUN.x;
  target.beginPath();target.moveTo(x-nx*nearWidth,y-ny*nearWidth);target.lineTo(x+nx*nearWidth,y+ny*nearWidth);
  target.lineTo(endX+nx*farWidth,endY+ny*farWidth);target.lineTo(endX-nx*farWidth,endY-ny*farWidth);target.closePath();
}
function drawMapLights(camX,camY,target=ctx,viewWidth=width,viewHeight=height){mapLightCache.draw(target,{camX,camY,width:viewWidth,height:viewHeight,region:game?.region?.id||'forest'});}
function drawIntroLights(target){const pad=Math.max(40,width*.08);target.save();target.globalAlpha=.075;target.fillStyle='#dee8a0';sunBeamPath(sunBeamGeometry(width*.74-SUN.x/SUN.y*pad,-pad,height+pad*2,width*.04,width*.07),target);target.fill();target.restore();}
function background(camX,camY,intro){
  if(!intro&&!game?.dungeon?.active&&game?.terrain?.island){decorativeShadowShapes.length=0;islandArt.draw(ctx,game.terrain.island,{camX,camY,width,height,time:game._clock,reduced,dense:combatOptions.dense},()=>backgroundLand(camX,camY,false));return;}
  backgroundLand(camX,camY,intro);
}
function backgroundLand(camX,camY,intro){decorativeShadowShapes.length=0;if(!intro&&game?.dungeon?.active){drawDungeonBackground(camX,camY);return;}if(!intro&&game?.region?.id!=='forest'&&game?.region){drawRegionBackground(camX,camY);return;}ctx.fillStyle='#2b4130';ctx.fillRect(0,0,width,height);const hX=intro?(width<760?.62:.73)*width:width*.5,hY=intro?(width<760?.71:.52)*height:height*.5;if(intro)glow(hX,hY,width*.6,'#76995b30');
  sceneryArt.drawGround(ctx,camX,camY,width,height);
  // Clusters are decorative ground cover; the central fighting space stays readable.
  if(intro){tree(width*.93,height*.14,1.7,.7);tree(width*.99,height*.48,1.2,.3);tree(width*.85,height*.97,1.5,.5);fern(width*.78,height*.88,2,.4);fern(width*.97,height*.8,1.7,.3);stone(hX-100,hY+72,1.5,.7);stone(hX+95,hY-96,1.3,.4);}
}
function drawRegionBackground(camX,camY){if(!worldArt.drawGround(ctx,game.region.id,camX,camY,width,height,{seed:game.regionIndex}))regionalArt.drawGround(ctx,game.region.id,camX,camY,width,height);}
function runeCircle(x,y,r,t,alpha=.5){ctx.save();ctx.translate(x,y);ctx.scale(1,.6);ctx.rotate(t*.11);ctx.globalAlpha=alpha;ctx.strokeStyle='#c4e699';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();ctx.setLineDash([2,8]);ctx.beginPath();ctx.arc(0,0,r-10,0,TAU);ctx.stroke();ctx.setLineDash([]);for(let i=0;i<8;i++){const a=i*TAU/8;ctx.save();ctx.rotate(a);ctx.translate(r,0);diamond(0,0,4,'#cced9e');line(-6,0,6,0,'#c4e699',1);ctx.restore();}ctx.restore();}

// All three humanoids share the traveler's body envelope and grounded shadow.
const HERO_VISUALS={traveler:ACTOR_VISUALS.player,warden:ACTOR_VISUALS.player,stormcaller:{...ACTOR_VISUALS.player,top:40,halfWidth:39}};
function actorVisual(entity,isPlayer=false,scaleOverride){
  const companionShape=(entity.isCompanion||entity.isCaptive)&&COMPANION_VISUALS[entity.kind||entity.heroId];
  const type=isPlayer?'player':entity.type,shape=companionShape||(isPlayer?(HERO_VISUALS[entity.heroId||'traveler']||HERO_VISUALS.traveler):actorShape(entity));
  const scale=scaleOverride??(companionShape?(entity.r||shape.radius)/shape.radius:isPlayer?1.1:entity.r/shape.radius);
  return {x:entity.x,y:entity.y,type,scale,immersion:game?.environment?.getImmersion(entity,isPlayer)||null,footY:entity.y+shape.foot*scale,orderId:isPlayer?-1:(entity.id||0),entity,isPlayer,shape};
}
function sortActors(actors){return actors.sort((a,b)=>a.footY-b.footY||a.orderId-b.orderId||a.x-b.x||a.type.localeCompare(b.type));}
function actorInView(actor,offsetX=0,offsetY=0){
  const {x,y,scale,footY,shape}=actor,cx=x+offsetX,cy=y+offsetY;
  // Include the entire projected shadow, not just the actor's collision radius.
  return cx+(shape.halfWidth+5)*scale>=0&&cx-(shape.halfWidth+shape.shadowLength*.45+5)*scale<=width
    &&cy-(shape.top+5)*scale<=height&&footY+offsetY+(shape.shadowLength+shape.shadowWidth*.4+5)*scale>=0;
}
function actorShadowShapes(actors){
  const shapes=[];
  for(const actor of actors){
    const {x,footY,scale,shape,immersion}=actor,depth=immersion?.depth||0,length=shape.shadowLength*scale*(1-depth*.35),offset=length*.39;
    shapes.push({x:x+SUN.x*offset,y:footY+SUN.y*offset,rx:shape.shadowWidth*scale*(1-depth*.12),ry:length*.63,angle:SUN_ANGLE,flying:!isGrounded(actor.entity)});
  }
  return shapes;
}
function staticShadowShapes(terrain,adventureProps,sceneKey){
  shadowGeometry.setScene(sceneKey);const shapes=[];
  for(const [kind,props,draw]of [['terrain',terrain,drawTerrainShadowPaths],['prop',adventureProps,drawAdventureShadowPaths]])for(const prop of props){
    const visual=prop.visual||{};
    // Values that affect the projection, rather than transient HP or animation,
    // allow cloned props and regenerated terrain cells to reuse the same mask.
    const signature=JSON.stringify([prop.type,prop.variant,prop.x,prop.y,prop.r,prop.scale,prop.angle,prop.halfLength,prop.rockForm,prop.visual===false,prop.structureId,visual.shadowOffset,visual.shadowWidth,visual.shadowLength,prop.isHutFurniture,prop.isSettlement,prop.width,prop.depth,prop.shadowWidth,prop.shadowHeight,prop.shadowRevision]);
    const key=kind+':'+(prop.id??`${prop.type}:${prop.x}:${prop.y}`);
    const shape=shadowGeometry.get(key,signature,target=>draw(target,[prop]));if(!shape.empty)shapes.push(shape);
  }
  return shapes;
}
function drawActorShadows(actors,offsetX=0,offsetY=0,terrain=[],adventureProps=[],drawLight=null){
  if(game&&diagnostics?.lightsDisabled)return;
  if(width<=0||height<=0)return;
  const sceneKey=game?.terrain||null;
  if(game){
    const b=shadowFrameBounds(width,height,offsetX,offsetY),tile=512;
    // Query complete visible cache tiles plus caster reach. A fractional camera
    // shift inside this grid must not keep changing its collection of props.
    const minX=Math.floor(b.minX/tile)*tile,minY=Math.floor(b.minY/tile)*tile,maxX=Math.ceil(b.maxX/tile)*tile,maxY=Math.ceil(b.maxY/tile)*tile;
    terrain=game.terrain.query(minX-260,minY-260,maxX+260,maxY+260);
    adventureProps=adventureSceneProps((minX+maxX)/2,(minY+maxY)/2,maxX-minX,maxY-minY);
  }
  shadowRenderer.draw(ctx,{width,height,scaleX,scaleY,offsetX,offsetY,actors:actorShadowShapes(actors),staticShapes:staticShadowShapes(terrain,adventureProps,sceneKey),sceneKey,
    decorativeShapes:decorativeShadowShapes.map(s=>({...s,angle:0})),drawLight});
}
function drawActorBody(actor){const e=actor.entity;if(e.isTownNpc){drawTownNpc(actor);return;}if(e.isCompanion||e.isCaptive)drawCompanion(actor);else if(actor.isPlayer)player(actor.x,actor.y,clock,actor.scale,e.facing||0,e.hurtFlash||0,e);else{drawEliteAura(e);enemy(e,game?._clock??clock);drawStatusMarks(e);drawEliteMark(e);if(e.rescueId){ctx.save();ctx.textAlign='center';ctx.font='600 9px system-ui,sans-serif';ctx.fillStyle='#e9c894';ctx.fillText('围困者',e.x,e.y-actor.shape.top*actor.scale-16);ctx.restore();}}}
function drawActor(actor){
  const grace=actor.entity.rescueSpawnGrace||actor.entity.spawnGrace||0;if(grace>0){ctx.save();ctx.globalAlpha*=.45+.3*(1-Math.min(1,grace/.8));}
  const water=actor.immersion;if(!water){drawActorBody(actor);if(grace>0)ctx.restore();return;}
  const margin=actor.shape.halfWidth*actor.scale+55,top=actor.y-actor.shape.top*actor.scale-100;
  ctx.save();ctx.beginPath();ctx.rect(actor.x-margin,top,margin*2,Math.max(0,water.waterY-top));ctx.clip();ctx.translate(0,water.sink);drawActorBody(actor);ctx.restore();
  immersionArt.drawSurface(ctx,water,combatOptions);if(grace>0)ctx.restore();
}
function drawActors(actors){for(const actor of sortActors(actors))drawActor(actor);}
// Solid terrain shares one world-space source with movement collision. The
// old decorative trees are retained only on the title screen.
function terrainInView(camX,camY){
  return game?.terrain?.query(camX-width/2-260,camY-height/2-260,camX+width/2+260,camY+height/2+260)||[];
}
function sceneVisible(entity){return sceneEntityVisible(entity,game?.dungeon?.active?game.dungeon.vision:null);}
function flightCrossesProp(actor,prop){
  const half=prop.type==='log'?(prop.halfLength||0):0,dx=Math.cos(prop.angle||0),dy=Math.sin(prop.angle||0);
  const along=clamp((actor.x-prop.x)*dx+(actor.footY-prop.y)*dy,-half,half);
  const radius=(prop.r||0)+(actor.entity.r||actor.shape.radius*actor.scale);
  return (actor.x-prop.x-dx*along)**2+(actor.footY-prop.y-dy*along)**2<=radius*radius;
}
function flightOverlapsSilhouette(actor,prop){
  const visual=prop.visual||{},half=prop.type==='log'?(prop.halfLength||0):0;
  const halfWidth=visual.halfWidth??Math.max(Math.abs(Math.cos(prop.angle||0))*half+(prop.r||0),prop.width?prop.width*.5+16:40);
  const top=visual.top??(Math.abs(Math.sin(prop.angle||0))*half+(prop.isSettlement?prop.type==='castle'?175:(prop.depth||28)+95:80));
  const bottom=visual.bottom??Math.abs(Math.sin(prop.angle||0))*half+(prop.r||16);
  return actor.x+actor.shape.halfWidth*actor.scale>=prop.x-halfWidth&&actor.x-actor.shape.halfWidth*actor.scale<=prop.x+halfWidth
    &&actor.footY>=prop.y-top&&actor.y-actor.shape.top*actor.scale<=prop.y+bottom;
}
function sceneDrawList(actors,props,adventureProps=[],weaponItems=[]){
  const items=actors.map(actor=>({kind:'actor',sortY:actor.footY,actor}));
  for(const prop of props)if(prop.visual!==false&&(!prop.structureId||prop.variant==='castle-wall'||prop.variant==='hut-wall'))items.push({kind:'terrain',sortY:prop.sortY??prop.y,prop});
  for(const prop of adventureProps)items.push({kind:'adventure',sortY:prop.sortY??prop.y,prop});
  const scenery=items.filter(item=>item.kind!=='actor'),low=scenery.filter(item=>item.kind==='terrain'&&obstacleHeight(item.prop)==='low');
  for(const item of items){
    if(item.kind!=='actor'||isGrounded(item.actor.entity))continue;
    let front=item.sortY;
    // Only raise draw order while crossing a nearby low footprint. Body and
    // shadow anchors stay unchanged; distant foreground scenery still wins.
    for(const prop of low)if(prop.sortY>=front&&flightCrossesProp(item.actor,prop.prop))front=prop.sortY+.01;
    if(front===item.sortY)continue;
    // Keep a total, stable depth order and preserve tall silhouettes in front
    // of flight. A global air layer would incorrectly paint bats over roofs.
    for(const prop of scenery)if(prop.sortY>item.sortY&&prop.sortY<=front&&(prop.kind!=='terrain'||obstacleHeight(prop.prop)==='high')&&flightOverlapsSilhouette(item.actor,prop.prop))front=Math.min(front,prop.sortY-.01);
    item.sortY=Math.max(item.sortY,front);
  }
  // Transient weapon art shares terrain depth; it cannot cover every wall
  // merely because combat effects normally draw after the scene.
  items.push(...weaponItems);
  return items.sort(compareSceneDepth);
}
function drawScene(actors,props,mainPlayer,adventureProps=[]){
  const vision=game?.dungeon?.active?game.dungeon.vision:null;
  const actor=actors.find(item=>item.entity===mainPlayer),weaponItems=[];
  if(actor){
    const options={...combatOptions,actor,bodyY:humanoidPose(mainPlayer).bodyY*actor.scale};
    for(const effect of game.effects){
      if(effect.type!=='swordSlash'||!(effect.life>0)||!sceneVisible(effect)||!effectInView(effect))continue;
      const pose=swordSlashPose(effect,game,options);
      weaponItems.push({kind:'sword',sortY:pose.sortY,effect,options:{...options,pose}});
    }
  }
  for(const item of sceneDrawList(actors,props,adventureProps,weaponItems)){
    if(!sceneItemVisible(item,vision))continue;
    // Only ground artwork follows the floor polygon. All visible raised
    // objects use complete silhouettes and the same foot/base depth order.
    ctx.save();if(vision&&sceneItemLayer(item)==='ground')vision.clipVisible(ctx);
    if(item.kind==='terrain')drawTerrain(item.prop,mainPlayer);else if(item.kind==='adventure')drawAdventureProp(item.prop);else if(item.kind==='sword')drawSwordSlash(ctx,item.effect,game,item.options);else drawActor(item.actor);
    ctx.restore();
  }
}
function terrainCapsulePath(target,halfLength,radius){
  target.moveTo(-halfLength,-radius);target.lineTo(halfLength,-radius);
  target.arc(halfLength,0,radius,-Math.PI/2,Math.PI/2);
  target.lineTo(-halfLength,radius);target.arc(-halfLength,0,radius,Math.PI/2,Math.PI*1.5);target.closePath();
}
const rockShadowOutlines=new WeakMap();
function rubbleShadowPaths(prop){
  const cached=rockShadowOutlines.get(prop);if(cached?.radius===prop.r)return cached.outlines;
  let outlines;
  const parts=rockShadowParts(prop);if(!parts)return null;
  const turn=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  outlines=parts.map(({points,offset})=>{
    // The convex hull joins each fragment's real base to its short projection.
    // Cache in local coordinates: camera movement never rebuilds this geometry.
    const vertices=[...points,...points.map(p=>({x:p.x+SUN.x*offset,y:p.y+SUN.y*offset}))].sort((a,b)=>a.x-b.x||a.y-b.y);
    const lower=[],upper=[];
    for(const p of vertices){while(lower.length>1&&turn(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(let i=vertices.length-1;i>=0;i--){const p=vertices[i];while(upper.length>1&&turn(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  });
  rockShadowOutlines.set(prop,{radius:prop.r,outlines});return outlines;
}
function drawTerrainShadowPaths(mask,props){
  for(const prop of props){
    if(prop.visual===false||prop.variant==='castle-wall'||prop.variant==='hut-wall'||prop.structureId)continue;
    const {x,y,r,type,scale=1}=prop;
    if(type==='log'){
      const offset=r*.7,angle=prop.angle||0,dx=Math.cos(angle),dy=Math.sin(angle),radius=r*1.08;
      const cx=x+SUN.x*offset,cy=y+SUN.y*offset,ax=cx-dx*prop.halfLength,ay=cy-dy*prop.halfLength,bx=cx+dx*prop.halfLength,by=cy+dy*prop.halfLength;
      mask.moveTo(ax+dy*radius,ay-dx*radius);mask.lineTo(bx+dy*radius,by-dx*radius);
      mask.arc(bx,by,radius,angle-Math.PI/2,angle+Math.PI/2);mask.lineTo(ax-dy*radius,ay+dx*radius);
      mask.arc(ax,ay,radius,angle+Math.PI/2,angle+Math.PI*1.5);mask.closePath();
    }else if(type==='rock'&&prop.rockForm===3&&prop.variant!=='pillar'){
      for(const points of rubbleShadowPaths(prop)||[]){
        mask.moveTo(x+points[0].x,y+points[0].y);
        for(let i=1;i<points.length;i++)mask.lineTo(x+points[i].x,y+points[i].y);
        mask.closePath();
      }
    }else{
      const dead=prop.variant==='dead-tree',pillar=prop.variant==='pillar',visual=prop.visual||{},offset=visual.shadowOffset??(type==='tree'&&visual.shadowLength?visual.shadowLength*.68:type==='tree'?35*scale:pillar?r*.9:r*.48),cx=x+SUN.x*offset,cy=y+SUN.y*offset;
      const rx=visual.shadowWidth??(type==='tree'?(dead?18:39)*scale:r*.88),ry=visual.shadowLength??(type==='tree'?51*scale:pillar?r*1.75:r*1.07);
      mask.moveTo(cx+rx*Math.cos(SUN_ANGLE),cy+rx*Math.sin(SUN_ANGLE));mask.ellipse(cx,cy,rx,ry,SUN_ANGLE,0,TAU);mask.closePath();
    }
  }
}
function treeCanopyOpacity(prop,mainPlayer){
  if(!mainPlayer)return 1;
  const scale=prop.scale||1,playerFoot=mainPlayer.y+ACTOR_VISUALS.player.foot*1.1;
  if(playerFoot>=(prop.sortY??prop.y))return 1;
  const visual=prop.visual||{},cx=prop.x+(visual.canopyX??0),cy=prop.y+(visual.canopyY??-67*scale);
  const distance=Math.hypot((mainPlayer.x-cx)/((visual.canopyRx??68*scale)+14),(mainPlayer.y-7-cy)/((visual.canopyRy??46*scale)+23));
  return 1-.65*clamp((1.12-distance)/.38,0,1);
}
function drawTerrainTree(prop,mainPlayer){sceneryArt.drawTree(ctx,prop,treeCanopyOpacity(prop,mainPlayer));}
function drawTerrainRock(prop){sceneryArt.drawRock(ctx,prop);}
function drawTerrainLog(prop){sceneryArt.drawLog(ctx,prop);}
function drawDeadTree(prop,mainPlayer){regionalArt.drawDeadTree(ctx,prop,treeCanopyOpacity(prop,mainPlayer));}
function drawRuinsStone(prop){regionalArt.drawRuinsStone(ctx,prop);}
function drawRuinsWall(prop){regionalArt.drawRuinsWall(ctx,prop);}
function drawTerrain(prop,mainPlayer){if(prop.visual===false)return;if(prop.variant==='castle-wall'||prop.variant==='hut-wall'){drawDungeonWall(prop,mainPlayer);return;}if(prop.structureId)return;
  if(worldArt.drawProp(ctx,prop,{canopyAlpha:treeCanopyOpacity(prop,mainPlayer)}))return;
  if(prop.variant==='dead-tree'){drawDeadTree(prop,mainPlayer);return;}
  if(prop.variant==='pillar'||prop.variant==='slab'){drawRuinsStone(prop);return;}
  if(prop.variant==='wall'){drawRuinsWall(prop);return;}
  if(prop.variant==='moss-rock'){drawTerrainRock(prop);if(prop.rockForm===3)return;ctx.save();ellipse(prop.x-prop.r*.15,prop.y-prop.r*.65,prop.r*.63,prop.r*.18,'#85aaa17a');ctx.restore();return;}
  if(prop.variant==='sunken-log'){drawTerrainLog(prop);ctx.save();ctx.translate(prop.x,prop.y);ctx.rotate(prop.angle||0);ellipse(0,0,prop.halfLength+prop.r*.8,prop.r*.75,'#40676a52');ctx.restore();return;}
  if(prop.type==='tree')drawTerrainTree(prop,mainPlayer);
  else if(prop.type==='rock')drawTerrainRock(prop);
  else if(prop.type==='log')drawTerrainLog(prop);
}
function adventureSceneProps(camX,camY,viewWidth=width,viewHeight=height){
  const adventure=game?.adventure;
  const visible=prop=>Math.abs(prop.x-camX)<viewWidth/2+70&&Math.abs(prop.y-camY)<viewHeight/2+112;
  const props=(adventure?.props||[]).filter(prop=>prop.hp>0&&visible(prop));
  if(adventure?.treasure&&visible(adventure.treasure))props.push({...adventure.treasure,type:'treasure'});
  props.push(...(game?.environment?.props||[]).filter(prop=>prop.state!=='spent'&&visible(prop)));
  if(!game.dungeon?.active)for(const portal of game.regions?.portals||[])if(visible({...portal,y:portal.y-30}))props.push({...portal,type:'portal',sortY:portal.y});
  if(!game.dungeon?.active)for(const site of game.settlements?.sites||[])if(site.type!=='merchant'&&Math.abs(site.x-camX)<viewWidth/2+200&&Math.abs(site.y-camY)<viewHeight/2+230)props.push({...site,isSettlement:true});
  if(game.dungeon?.active){const dungeon=game.dungeon.active;for(const chest of [dungeon.treasure,...(dungeon.chests||[])])if(chest&&visible(chest)&&sceneVisible(chest))props.push({...chest,type:'treasure',isDungeonTreasure:true,royal:chest===dungeon.treasure,sortY:chest.y});}
  if(game.dungeon?.active?.kind==='hut')for(const prop of game.dungeon.active.props||[])if(visible(prop))props.push({...prop,isHutFurniture:true,sortY:prop.y+(prop.type==='rug'?-1000:0)});
  if(!game.dungeon?.active)for(const site of game.relicSites?.sites||[]){const special=site.type==='stonevault'||site.type==='dogcamp'||site.appearance==='golemaltar';props.push(...(special?companionArt.props(site):site.type==='hunt'?encounterArt.props(site):relicArt.props(site)).filter(visible));}
  for(const encounter of activeEncounters())if(encounter.type==='hunt'&&!encounter.siteId)props.push(...encounterArt.props(encounter).filter(visible));
  return props;
}
function drawAdventureShadowPaths(mask,props){
  for(const prop of props){if(prop.isHutFurniture)continue;if(prop.type==='rescueRelicPart'||prop.type==='runeRelicPart'||prop.type==='companionSitePart'){const w=(prop.shadowWidth||16)*.5,len=prop.shadowHeight||26,x=prop.x,y=prop.y;mask.moveTo(x-w,y-3);mask.lineTo(x+w,y-3);mask.lineTo(x+w+SUN.x*len,y+SUN.y*len);mask.lineTo(x-w+SUN.x*len,y+SUN.y*len);mask.closePath();continue;}if(prop.isSettlement){if(prop.type!=='angel'&&prop.type!=='merchant'){const w=prop.width||140,d=prop.depth||70,length=prop.type==='castle'?44:26;mask.moveTo(prop.x-w/2,prop.y-d*.5);mask.lineTo(prop.x+w/2,prop.y-d*.5);mask.lineTo(prop.x+w/2+SUN.x*length,prop.y+SUN.y*length);mask.lineTo(prop.x-w/2+SUN.x*length,prop.y+SUN.y*length);mask.closePath();}continue;}if(prop.type==='portal')continue;if(prop.type==='huntMarker'){const x=prop.x,y=prop.y,dx=SUN.x*23,dy=SUN.y*23;mask.moveTo(x-10,y-6);mask.lineTo(x+10,y-6);mask.lineTo(x+10+dx,y+8+dy);mask.lineTo(x-10+dx,y+8+dy);mask.closePath();continue;}const large=prop.type==='treasure',mushroom=prop.type==='mushroom',offset=large?14:mushroom?5:10,rx=large?25:mushroom?14:19,ry=large?21:mushroom?12:16,cx=prop.x+SUN.x*offset,cy=prop.y+SUN.y*offset;
    mask.moveTo(cx+rx*Math.cos(SUN_ANGLE),cy+rx*Math.sin(SUN_ANGLE));mask.ellipse(cx,cy,rx,ry,SUN_ANGLE,0,TAU);mask.closePath();}
}
function drawAdventureProp(prop){if(worldSiteArt.drawProp(ctx,prop,combatOptions))return;if(companionArt.drawProp(ctx,prop,combatOptions))return;if(prop.isHutFurniture){hutArt.drawProp(ctx,prop);return;}
  if(prop.type==='rescueRelicPart'||prop.type==='runeRelicPart'){relicArt.drawProp(ctx,prop,combatOptions);return;}
  if(prop.type==='huntMarker'){encounterArt.drawMarker(ctx,prop,combatOptions);return;}
  if(prop.isSettlement){drawSettlement(prop);return;}if(prop.isDungeonTreasure){drawDungeonChest(prop);return;}
  propArt.drawProp(ctx,prop,combatOptions);
  ctx.save();ctx.translate(prop.x,prop.y);ctx.textAlign='center';ctx.font='600 9px ui-monospace,monospace';
  if(prop.type==='portal'){ctx.fillStyle=prop.nextRegion.colors?.accent||'#b8decb';ctx.font='600 10px ui-monospace,monospace';ctx.fillText(prop.state==='locked'?'封印传送门 · 首领驻守':`通往${prop.nextRegion.name}`,0,-91);}
  else if(prop.type==='supply'&&prop.hp<prop.maxHp){ctx.fillStyle='#1b2c20';ctx.fillRect(-17,-39,34,3);ctx.fillStyle='#d9bc77';ctx.fillRect(-17,-39,34*Math.max(0,prop.hp/prop.maxHp),3);}
  else if(prop.type==='treasure'&&prop.state!=='opened'){const unlocked=prop.state==='unlocked';ctx.fillStyle=unlocked?'#eddda0':'#c2bb8f';ctx.fillText(unlocked?'可领取':prop.state==='active'?'击败守卫':'守卫宝箱',0,-47);}
  ctx.restore();
}
function drawMudGround(){
  for(const mud of game.environment?.muds||[]){
    waterArt.draw(ctx,mud,{...combatOptions,region:game.region.id});
  }
}
function drawEnvironmentWarnings(){
  ctx.save();ctx.lineCap='round';
  for(const prop of game.environment?.props||[]){
    if(prop.state!=='armed')continue;const {x,y}=prop,r=prop.blastRadius||82,progress=clamp(1-prop.fuse/(prop.maxFuse||.9),0,1);
    ctx.globalAlpha=.085;ctx.fillStyle='#efaa57';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.globalAlpha=.82;ctx.strokeStyle='#efb765';ctx.lineWidth=1.7;ctx.setLineDash([7,4]);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle='#ffe0a4';ctx.lineWidth=2.1;ctx.beginPath();ctx.arc(x,y,r-4,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();
    for(let i=0;i<3;i++){const a=i*TAU/3-Math.PI/2,xx=x+Math.cos(a)*(r-12),yy=y+Math.sin(a)*(r-12);ctx.save();ctx.translate(xx,yy);ctx.rotate(a);ctx.beginPath();ctx.moveTo(-4,-3);ctx.lineTo(0,0);ctx.lineTo(-4,3);ctx.stroke();ctx.restore();}
  }

  ctx.restore();
}
// Region machinery is grounded in world coordinates, below actors and Boss warnings.
function drawRegionMechanisms(){
  for(const prop of game.environment?.mechanisms?.props||[]){
    const {x,y,r,state,seed=0}=prop;if(Math.abs(x-game.player.x)>width/2+r+25||Math.abs(y-game.player.y)>height/2+r+25)continue;
    ctx.save();ctx.translate(x,y);ctx.lineCap='round';ctx.lineJoin='round';ctx.textAlign='center';ctx.font='600 9px "PingFang SC",system-ui,sans-serif';
    if(prop.type==='vine'){
      const warning=state==='windup',active=state==='active',color=active?'#d6b078':warning?'#e0c789':'#80915c';
      if(warning||active){ctx.fillStyle=active?'#c6a35b10':'#d9bc6810';ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.setLineDash(active?[]:[5,5]);ctx.stroke();ctx.setLineDash([]);if(warning){ctx.strokeStyle='#f3dda2';ctx.lineWidth=2.3;ctx.beginPath();ctx.arc(0,0,r-4,-Math.PI/2,-Math.PI/2+TAU*clamp(prop.warning,0,1));ctx.stroke();}}
      // Short thorned tendrils identify a cuttable plant even before it wakes.
      const reach=active?r*.86:r*.45;
      for(let i=0;i<5;i++){const a=i*TAU/5+seed,dx=Math.cos(a),dy=Math.sin(a),rr=reach*(.72+hash(i,seed)*.28);ctx.strokeStyle='#263f29';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(dx*rr*.4-dy*9,dy*rr*.4+dx*9,dx*rr,dy*rr);ctx.stroke();ctx.strokeStyle=active?'#9ab672':'#688959';ctx.lineWidth=3;ctx.stroke();for(const sign of [-1,1]){const xx=dx*rr*.6,yy=dy*rr*.6;line(xx,yy,xx-dy*6*sign-dx*3,yy+dx*6*sign-dy*3,'#c8bd84',1.3);}ellipse(dx*rr,dy*rr,3,2,'#aec97f');}
      ellipse(0,0,9,7,'#465d3b');diamond(0,-1,4,'#bad184');ctx.fillStyle=color;ctx.fillText(active?'缠绕 · 可切断':warning?'藤蔓将起 · 离圈':'藤蔓 · 可切断',0,-r-9);
    }else if(prop.type==='gas'){
      const warning=state==='warn',active=state==='active',color=active?'#d4d775':warning?'#e3d590':'#9ca66e';
      if(warning||active){ctx.fillStyle=active?'#bfd46716':'#e2d7820b';ctx.strokeStyle=color;ctx.lineWidth=active?2:1.6;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.setLineDash(warning?[7,5]:[]);ctx.stroke();ctx.setLineDash([]);if(warning){ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,0,r-4,-Math.PI/2,-Math.PI/2+TAU*clamp(prop.warning,0,1));ctx.stroke();}}
      for(let i=0;i<4;i++){const a=i*TAU/4+seed,rr=r*(.15+hash(i,seed)*.42),xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;ellipse(xx,yy,7,3.5,'#283b32');ellipse(xx,yy-1,3,1.5,'#9baa6b70');if(active){const drift=reduced?0:Math.sin(clock*1.1+i)*5;ellipse(xx+drift,yy-9,11,5,'#becf7025');ellipse(xx-drift,yy-20,15,6,'#becf7017');}}
      if(warning||active){ctx.fillStyle=color;ctx.fillText(active?'毒雾喷发 · 离圈':'毒雾将至 · 离圈',0,-r-9);}
    }else if(prop.type==='rune'){
      const active=state==='active',charging=state==='charging',spent=state==='spent',frost=prop.element==='frost',color=spent?'#747962':active?(frost?'#d7f6ff':'#9df0df'):(frost?'#c1deec':'#b1c8ac');
      ctx.fillStyle=active?'#7be8d50d':'#b8c4a10a';ctx.strokeStyle=color;ctx.lineWidth=active?2:1.3;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.stroke();ctx.globalAlpha=spent?.35:.7;ctx.beginPath();for(let i=0;i<=6;i++){const a=-Math.PI/2+i*TAU/6;ctx[i?'lineTo':'moveTo'](Math.cos(a)*(r-9),Math.sin(a)*(r-9));}ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.4,r*.23);ctx.lineTo(0,-r*.47);ctx.lineTo(r*.4,r*.23);ctx.closePath();ctx.stroke();diamond(0,0,6,color);
      for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/6,xx=Math.cos(a)*r,yy=Math.sin(a)*r;diamond(xx,yy,3,color);}ctx.globalAlpha=1;
      if(charging||active){const fraction=charging?clamp(prop.charge,0,1):clamp(prop.remaining/12,0,1);ctx.strokeStyle='#a9f3e1';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r+5,-Math.PI/2,-Math.PI/2+TAU*fraction);ctx.stroke();}
      ctx.fillStyle=color;ctx.fillText(spent?'符文已熄灭':active?`${frost?'寒霜支援':'符文助攻'} · ${Math.ceil(prop.remaining)}秒`:charging?'符文蓄能中':'踏入符文 · 蓄能',0,-r-13);
    }
    ctx.restore();
  }
}
function drawEliteAura(enemy){
  const affix=enemy.affix;if(!affix||enemy.hp<=0)return;ctx.save();
  if(affix.id==='shield'&&affix.shield>0){
    const {x,y,r}=enemy;ctx.strokeStyle='#b6dfed';ctx.lineWidth=1.3;ctx.globalAlpha=.65;ctx.beginPath();ctx.ellipse(x,y-3,r+6,r+10,0,0,TAU);ctx.stroke();ctx.fillStyle='#a4d4e0';ctx.globalAlpha=!reduced&&affix.hit>0?.2:.035;ctx.fill();
  }else if(affix.id==='swift'&&affix.phase==='rush'){
    const dx=game.player.x-enemy.x,dy=game.player.y-enemy.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;
    for(const side of [-1,1])line(enemy.x-nx*enemy.r-ny*side*7,enemy.y-ny*enemy.r+nx*side*7,enemy.x-nx*(enemy.r+16)-ny*side*7,enemy.y-ny*(enemy.r+16)+nx*side*7,'#e0c77a66',2);
  }
  ctx.restore();
}
function drawEliteMark(enemy){
  const affix=enemy.affix;if(!affix&&!enemy.summoned)return;ctx.save();ctx.textAlign='center';
  if(affix){
    const shape=actorShape(enemy),top=enemy.y-shape.top*(enemy.r/shape.radius)-10;
    ctx.font='600 8px ui-monospace,monospace';ctx.fillStyle=affix.color;ctx.fillText(`${affix.name}精英`,enemy.x,top);
    if(affix.id==='shield'&&affix.maxShield>0){ctx.fillStyle='#163139';ctx.fillRect(enemy.x-16,top+3,32,2);ctx.fillStyle=affix.color;ctx.fillRect(enemy.x-16,top+3,32*Math.max(0,affix.shield/affix.maxShield),2);}
    if(affix.id==='summoner'){ctx.strokeStyle=affix.color;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(enemy.x-5,top-12);ctx.lineTo(enemy.x,top-18);ctx.lineTo(enemy.x+5,top-12);ctx.closePath();ctx.stroke();}
    else if(affix.id==='swift'){line(enemy.x-4,top-13,enemy.x,top-17,affix.color,1.5);line(enemy.x,top-17,enemy.x+4,top-13,affix.color,1.5);}
  }else diamond(enemy.x,enemy.y-enemy.r-6,2.5,'#cdb7d6aa');ctx.restore();
}
function drawEliteGroundEffects(){
  ctx.save();ctx.lineCap='round';
  for(const enemy of game.enemies){if(!sceneVisible(enemy))continue;const affix=enemy.affix;if(!affix||affix.phase!=='windup'||affix.life<=0)continue;
    const progress=clamp(1-affix.life/affix.maxLife,0,1),summon=affix.id==='summoner',r=summon?40:enemy.r+11,x=affix.castX,y=affix.castY;
    ctx.strokeStyle=affix.color;ctx.lineWidth=1.6;ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(x,y,r,r*.64,0,0,TAU);ctx.stroke();ctx.globalAlpha=.9;ctx.beginPath();ctx.ellipse(x,y,r-4,(r-4)*.64,0,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();
    if(summon){for(let i=0;i<3;i++){const a=-Math.PI/2+i*TAU/3;diamond(x+Math.cos(a)*r*.8,y+Math.sin(a)*r*.5,3,affix.color);}}
    else{line(x-5,y+3,x,y-2,affix.color,1.6);line(x,y-2,x+5,y+3,affix.color,1.6);}
  }
  for(const effect of game.effects){if(!sceneVisible(effect))continue;if(effect.type!=='eliteSummon')continue;const alpha=clamp(effect.life/effect.maxLife,0,1);ctx.globalAlpha=alpha*.7;ctx.strokeStyle='#d0b8e3';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(effect.x,effect.y,effect.r,effect.r*.64,0,0,TAU);ctx.stroke();for(let i=0;i<3;i++)diamond(effect.x+(i-1)*19,effect.y-8-(reduced?0:(1-alpha)*16),3,'#d0b8e3');}
  ctx.restore();
}
function drawStatusMarks(enemy){
  if(enemy.hp<=0)return;const bleed=enemy.bleed?.life>0,shock=enemy.shock?.life>0;if(!bleed&&!shock)return;
  const x=enemy.x+enemy.r+5,y=enemy.y-enemy.r*.48;ctx.save();ctx.lineCap='round';
  if(bleed){ctx.globalAlpha=Math.min(1,.4+enemy.bleed.life*2);line(x-2,y-4,x+2,y+3,'#edab8d',1.8);line(x+2,y-6,x+6,y+1,'#c9846c',1.5);}
  if(shock){const yy=y+(bleed?12:0);ctx.globalAlpha=Math.min(1,.4+enemy.shock.life*2);ctx.strokeStyle='#bde8fa';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x+4,yy-6);ctx.lineTo(x-1,yy);ctx.lineTo(x+3,yy);ctx.lineTo(x-2,yy+6);ctx.stroke();}ctx.restore();
}
function drawAdventurePickups(){
  for(const item of game.adventure?.pickups||[]){if(!sceneVisible(item))continue;
    if(Math.abs(item.x-game.player.x)>width/2+30||Math.abs(item.y-game.player.y)>height/2+35)continue;
    propArt.drawPickup(ctx,item,combatOptions);
  }
}
function drawEnemyBullets(){
  for(const bullet of game.enemyBullets||[]){if(!sceneVisible(bullet))continue;
    if(Math.abs(bullet.x-game.player.x)>width/2+24||Math.abs(bullet.y-game.player.y)>height/2+24)continue;
    propArt.drawEnemyBullet(ctx,bullet,combatOptions);
  }
}
const enemyTelegraphHelpers=Object.freeze({capsulePath:terrainCapsulePath});
function drawEnemyTelegraphs(){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(const enemy of game.enemies){if(!sceneVisible(enemy))continue;
    monsterArt.drawTelegraph(ctx,enemy,enemyTelegraphHelpers);
  }
  ctx.restore();
}
// World art uses roughly 32 units per metre; this is only a distance label.
function edgePointer(target,reserved=null){
  const dx=target.x-game.player.x,dy=target.y-game.player.y;
  if(Math.abs(dx)<=width/2-70&&Math.abs(dy)<=height/2-100)return null;
  const angle=Math.atan2(dy,dx),cx=Math.cos(angle),cy=Math.sin(angle);
  let edge=Math.min((width/2-38)/Math.max(.01,Math.abs(cx)),(height/2-100)/Math.max(.01,Math.abs(cy)));
  const map=minimapBounds(width,height,hudInsets),mapBottom=map.y+map.height;
  const position=distance=>{let x=width/2+cx*distance,y=height/2+cy*distance;if((coarse||width<650)&&x>width-125&&y>height-185)y=Math.max(100,height-190);if(x>map.x-72&&y>map.y-22&&y<mapBottom+28)y=mapBottom+30;return{x,y};};
  let {x,y}=position(edge);
  for(const point of (Array.isArray(reserved)?reserved:[reserved]))if(point&&Math.hypot(x-point.x,y-point.y)<64){edge=Math.max(25,edge-67);({x,y}=position(edge));}
  return{x,y,angle,distance:Math.hypot(dx,dy)};
}
function drawObjectivePointers(){
  const reserved=[];
  const draw=(entity,label,color)=>{
    const pointer=edgePointer(entity,reserved);if(!pointer)return false;reserved.push(pointer);
    ctx.save();ctx.translate(pointer.x,pointer.y);ctx.save();ctx.rotate(pointer.angle);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,-5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
    if(label){const textX=pointer.x<width/2?8:-8;ctx.textAlign=pointer.x<width/2?'left':'right';ctx.font='600 9px ui-monospace,monospace';ctx.fillStyle=color;ctx.fillText(`${label} · ${Math.max(1,Math.round(pointer.distance/32))} m`,textX,18);}ctx.restore();return true;
  };
  // Indoor objectives belong to the discovered map; never point through unexplored rooms.
  if(game.dungeon?.active)return;
  const boss=game.enemies.find(enemy=>enemy.type==='boss'&&enemy.hp>0&&enemy.guardActive!==false);
  if(boss)draw(boss,null,enemyVisual(boss).edgeColor);
  const treasure=game.adventure?.treasure,targets=[];
  const distance=entity=>Math.hypot(entity.x-game.player.x,entity.y-game.player.y-ACTOR_VISUALS.player.foot*1.1);
  for(const member of game.companions?.members||[]){const target=member.state==='active'&&(member.kind==='dog'?member.treasureTarget:member.scoutCount>=5||member.scoutTarget?.boss?member.scoutTarget:null);if(target)targets.push({entity:target,label:member.kind==='dog'?'寻宝犬发现':member.scoutTarget?.boss?'首领警戒':'敌群警戒',color:member.kind==='dog'?'#edca91':'#c2dceb',priority:1});}
  for(const camp of rescueCamps())targets.push({entity:camp,label:camp.state==='ready'?'解救':'营救',color:camp.state==='ready'?'#c8e8ae':'#e8c994',priority:distance(camp)<(camp.state==='ready'?100:240)?0:1});
  for(const encounter of activeEncounters())targets.push({entity:encounter,label:encounter.type==='hunt'?'猎区':'宝物精',color:encounter.type==='hunt'?'#bbd6b0':'#e8cf83',priority:distance(encounter)<(encounter.type==='hunt'?encounter.r:330)?0:1});
  if(treasure&&treasure.state!=='opened')targets.push({entity:treasure,label:'宝箱',color:'#e8cf83',priority:treasure.state==='active'&&distance(treasure)<600?0:2});
  for(const gate of game.regions?.portals||[])if(gate.discovered)targets.push({entity:gate,label:gate.state==='locked'?'封印门':'传送门',color:gate.state==='locked'?'#ceaa83':'#b5dccf',priority:2});
  const nearestSite=(game.settlements?.sites||[]).filter(site=>site.discovered&&site.state!=='spent'&&site.state!=='claimed').sort((a,b)=>distance(a)-distance(b))[0];
  if(nearestSite)targets.push({entity:nearestSite,label:nearestSite.type==='castle'?'城堡':nearestSite.type==='merchant'?'商人':nearestSite.type==='angel'?'天使':'小屋',color:nearestSite.type==='castle'?'#c6b6e6':'#d5c698',priority:3});
  targets.sort((a,b)=>a.priority-b.priority||distance(a.entity)-distance(b.entity));
  for(const {entity,label,color} of targets){if(reserved.length>=2)break;draw(entity,label,color);}
}
function drawRelicGround(){
  if(game.dungeon?.active)return;
  const p=game.player;
  for(const site of game.relicSites?.sites||[]){
    if(Math.abs(site.x-p.x)>width/2+280||Math.abs(site.y-p.y)>height/2+280)continue;
    if(worldSiteArt.drawGround(ctx,site,combatOptions)){}else if(site.type==='hunt')encounterArt.drawGround(ctx,site,{...combatOptions,encounter:activeEncounters().find(event=>event.siteId===site.id)||null});else if(!companionArt.drawGround(ctx,site,combatOptions))relicArt.drawGround(ctx,site,combatOptions);
    ctx.save();ctx.textAlign='center';ctx.font='600 10px system-ui';ctx.fillStyle=site.state==='cleared'?'#9eaf91':'#d7c79b';
    ctx.fillText(site.name+(site.state==='cleared'?' · 已完成':site.state==='active'?' · 挑战中':''),site.x,site.y-(site.type==='hunt'?245:site.type==='rune'?104:120));ctx.restore();
  }
  for(const site of game.settlements?.sites||[])if(site.type==='angel'&&Math.abs(site.x-p.x)<width/2+(site.guardRadius||150)+20&&Math.abs(site.y-p.y)<height/2+(site.guardRadius||150)+20)angelArt.drawAura(ctx,site,combatOptions);
}
function drawEncounterGround(){
  for(const active of activeEncounters()){
  if(active.siteId)continue;
  ctx.save();
  if(active.type==='hunt'){
    encounterArt.drawGround(ctx,active,combatOptions);
  }else{
    const x=active.x,y=active.y;ctx.strokeStyle='#e4c57088';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y,25,13,0,0,TAU);ctx.stroke();
  }
  ctx.restore();
  }
}
function drawRescueGround(){
  for(const camp of rescueCamps()){
  if(camp.siteId)continue;const ready=camp.state==='ready',color=ready?'#c4e9a6':'#dcb981';
  ctx.save();ctx.translate(camp.x,camp.y);ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.globalAlpha=.38;ctx.setLineDash(ready?[]:[4,8]);ctx.beginPath();ctx.arc(0,0,65,0,TAU);ctx.stroke();ctx.setLineDash([]);
  ctx.globalAlpha=.65;ctx.beginPath();ctx.ellipse(0,0,33,17,0,0,TAU);ctx.stroke();
  if(!ready){for(let i=0;i<camp.guardTotal;i++){const a=-Math.PI/2+i*TAU/camp.guardTotal;diamond(Math.cos(a)*65,Math.sin(a)*65,3.5,i<camp.guardTotal-camp.remainingGuards?'#cfdeb1':'#987d53');}}
  else{ctx.globalAlpha=reduced?.5:.45+Math.sin(clock*3)*.15;ctx.beginPath();ctx.arc(0,0,40,0,TAU);ctx.stroke();}
  ctx.globalAlpha=.9;ctx.textAlign='center';ctx.font='600 10px "PingFang SC",system-ui,sans-serif';ctx.fillStyle=color;ctx.fillText(ready?'靠近解救':`围困者 ${camp.remainingGuards} / ${camp.guardTotal}`,0,83);ctx.restore();
  }
}
function drawCompanion(actor){
  const e=actor.entity,captive=e.isCaptive,storm=e.heroId==='stormcaller',color=companionDefinition(e.kind||e.heroId)?.color||'#d9c28c';
  if(!captive){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(e.x,actor.footY,20,10,0,0,TAU);ctx.stroke();ctx.restore();}
  ctx.save();ctx.translate(actor.x,actor.y);ctx.scale(actor.scale,actor.scale);ctx.lineCap='round';ctx.lineJoin='round';
  const pose=humanoidPose(e);if(e.state==='recovering')ctx.globalAlpha=.58;const art=COMPANION_VISUALS[e.kind||e.heroId]?companionArt:humanoidArt;art.draw(ctx,e.kind||e.heroId||'warden',{pose,entity:e,time:game?._clock??clock,reduced,pixelRatio:dpr});
  if(captive&&e.state==='trapped'){
    // A low thorn restraint leaves the companion's face and class silhouette clear.
    for(const side of [-1,1]){line(side*24,-3,side*22,20,'#4c5139',4);line(side*24,-1,side*30,-7,'#8f8353',1.5);line(side*22,10,side*29,6,'#8f8353',1.5);}
    ctx.strokeStyle='#b29e68';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-24,7);ctx.quadraticCurveTo(0,16,24,7);ctx.moveTo(-24,13);ctx.quadraticCurveTo(0,21,24,13);ctx.stroke();
  }
  ctx.restore();
  const target=e.state==='active'&&(e.kind==='dog'?e.treasureTarget:e.scoutCount>=5||e.scoutTarget?.boss?e.scoutTarget:null);
  if(target&&(!game.dungeon?.active||sceneVisible(target))){
    const angle=Math.atan2(target.y-actor.footY,target.x-e.x),label=e.kind==='dog'?'宝藏':e.scoutTarget?.boss?'首领':`敌群 ${e.scoutCount}`;
    ctx.save();ctx.translate(e.x,actor.footY);ctx.rotate(angle);ctx.translate(29,0);ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-4,-4);ctx.lineTo(1,0);ctx.lineTo(-4,4);ctx.stroke();ctx.restore();
    ctx.save();ctx.textAlign='center';ctx.font='600 9px system-ui';ctx.fillStyle=color;ctx.fillText(label,e.x,actor.footY+15);ctx.restore();
  }
  ctx.save();ctx.textAlign='center';ctx.font='600 9px "PingFang SC",system-ui,sans-serif';ctx.fillStyle=captive?(e.state==='ready'?'#d2ecb9':'#edd6ad'):color;ctx.shadowColor='#102017';ctx.shadowBlur=3;ctx.fillText(captive?`${e.name} · ${e.state==='ready'?'等待同行':e.kind==='golem'?'沉睡':'受困'}`:e.name+(e.state==='recovering'?' · 恢复中':''),actor.x,actor.y-actor.shape.top*actor.scale-9);if(!captive&&e.hp<e.maxHp&&e.state!=='recovering'){const y=actor.y-actor.shape.top*actor.scale-5;ctx.fillStyle='#182b23';ctx.fillRect(actor.x-14,y,28,3);ctx.fillStyle=color;ctx.fillRect(actor.x-14,y,28*Math.max(0,e.hp/e.maxHp),3);}ctx.restore();
}
// Phase advances in the simulation from distance actually travelled, including
// collision and terrain slowing. Feet stay on their ground anchor while the
// torso rises slightly; no clock-driven stepping when waiting or blocked.
function humanoidPose(entity={},intro=false,t=0){
  const moving=!!entity.moving&&entity.walkSpeed>.1,phase=Number.isFinite(entity.walkPhase)?entity.walkPhase:0;
  const strength=moving?clamp(entity.walkSpeed/220,.2,1.15):0,step=Math.sin(phase)*strength;
  const motion=reduced?.65:1;
  return {step:step*motion,leftLift:Math.max(0,step)*3.2*motion,rightLift:Math.max(0,-step)*3.2*motion,
    bodyY:reduced?0:moving?-Math.abs(step)*1.15:intro?Math.sin(t*2)*.65:0,
    arm:reduced?0:step*1.8,cloakLift:intro?0:clamp(entity.cloakLift??(moving?1:0),0,1),cloth:reduced?0:moving?step*1.7:intro?Math.sin(t*3)*.65:0};
}
function player(x,y,t,scale=1,facing=0,hurtFlash=0,entity={}){
  const time=game?._clock??t,pose=humanoidPose(entity,!game,time);
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  if(hurtFlash>0&&Math.floor(time*18)%2===0)ctx.globalAlpha=.65;
  humanoidArt.draw(ctx,'traveler',{pose,entity,time,reduced,pixelRatio:dpr});ctx.restore();
}
function enemy(e,t){const {x,y,r,type}=e;ctx.save();ctx.translate(x,y);const s=r/(actorShape(e).radius);ctx.scale(s,s);const bob=enemyBob(e,t,reduced);ctx.translate(0,bob);const hit=e.hit>0;
  // A brief foot-anchored compression and lean makes a landed hit tangible.
  // It is presentation only: collision, damage and movement remain unchanged.
  if(hit&&!reduced){const recoil=Math.sin(Math.PI*clamp(e.hit/.12,0,1))*(enemyVisual(e)?.hitRecoil??.11)*(.65+(e.hitStrength||0)*.35),foot=actorShape(e).foot;ctx.translate(0,foot);ctx.transform(1,0,-Math.cos(e.hitAngle||0)*recoil*.55,1,0,0);ctx.scale(1+recoil,1-recoil*.7);ctx.translate(0,-foot);}

  if(e.trainingDummy)drawTrainingDummy(ctx,e,t);else monsterArt.draw(ctx,e,{time:t,reduced,dense:combatOptions.dense,playerX:game?.player.x??e.x+1});
  if(e.eventRole==='treasure'){
    ctx.fillStyle=hit?'#f7e5ad':'#c6a75b';ctx.strokeStyle='#71613b';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-13,-14);ctx.quadraticCurveTo(-18,-27,0,-30);ctx.quadraticCurveTo(18,-27,13,-14);ctx.lineTo(12,5);ctx.quadraticCurveTo(0,13,-12,5);ctx.closePath();ctx.fill();ctx.stroke();
    line(-10,-10,10,-10,'#f0d58c',3);line(-7,-24,-8,5,'#816d41',2);line(7,-24,8,5,'#816d41',2);diamond(0,-5,6,'#f2df9a');diamond(0,-5,2.5,'#899962');
    line(-5,-28,-8,-35,'#d9bc73',2);line(5,-28,8,-34,'#d9bc73',2);diamond(0,-43,4,'#efdb99');
  }
  if(e.elite){const top=actorShape(e).top;diamond(0,-top-4,5,'#e6c579');line(-14,0,-9,8,'#e1bf71',2.5);line(14,0,9,8,'#e1bf71',2.5);}
  ctx.restore();if((e.hp<e.maxHp||e.elite)&&e.type!=='boss'){const w=r*(e.elite?2.1:1.7),barY=y-r-(e.elite?14:10);ctx.fillStyle='#102114';ctx.fillRect(x-w/2,barY,w,e.elite?4:3);ctx.fillStyle=e.elite?'#dfc079':'#adc990';ctx.fillRect(x-w/2,barY,w*Math.max(0,e.hp/e.maxHp),e.elite?4:3);if(e.elite){ctx.font='600 9px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#d9c890';ctx.fillText('精英守卫',x,barY-5);}}}

function effectInView(e){
  if(!game)return true;
  const margin=(e.r||0)+65,px=game.player.x,py=game.player.y,x2=e.x2??e.x,y2=e.y2??e.y;
  return Math.max(e.x,x2)+margin>=px-width/2&&Math.min(e.x,x2)-margin<=px+width/2&&Math.max(e.y,y2)+margin>=py-height/2&&Math.min(e.y,y2)-margin<=py+height/2;
}
function effects(e){if(e.type==='damage'||!sceneVisible(e))return;if(e.type==='rescueWarning'){const age=1-e.life/e.maxLife,r=e.r||24;ctx.save();ctx.globalAlpha=.7;ctx.fillStyle='#e5b77222';ctx.strokeStyle='#efd2a0';ctx.lineWidth=1.8;ctx.beginPath();ctx.ellipse(e.x,e.y,r,r*.65,0,0,TAU);ctx.fill();ctx.stroke();ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(e.x,e.y,r+4,(r+4)*.65,0,-Math.PI/2,-Math.PI/2+TAU*age);ctx.stroke();for(let i=0;i<4;i++){const a=i*TAU/4;diamond(e.x+Math.cos(a)*(r+9),e.y+Math.sin(a)*(r+9)*.65,3,'#eac994');}ctx.restore();return;}if(angelArt.drawStrike(ctx,e,combatOptions))return;
  if(!effectInView(e)||drawBarrierEffect(ctx,e,game,combatOptions)||combatVfx.drawHit(ctx,e,combatOptions)||combatVfx.drawBurst(ctx,e,combatOptions,'air')||combatArt.drawEffect(ctx,e,combatOptions)||superArt.drawEffect(ctx,e,combatOptions))return;
  const alpha=clamp(e.life/e.maxLife,0,1),progress=1-alpha;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=e.color||'#e9e4b7';ctx.fillStyle=e.color||'#e9e4b7';
  if(e.type==='ring'){
    if(e.control||e.branch==='control'){ctx.strokeStyle='#9fe5cf';ctx.fillStyle='#9fe5cf';}
    const radius=e.r*(reduced?1:.2+.8*progress);ctx.lineWidth=(e.echo?3.5:3)*alpha;ctx.beginPath();ctx.arc(e.x,e.y,radius,0,TAU);ctx.stroke();ctx.globalAlpha=alpha*(e.echo?.035:.06);ctx.fill();
    if(e.control||e.branch==='control'){ctx.strokeStyle='#9fe5cf';ctx.globalAlpha=alpha*.65;ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,TAU);ctx.stroke();for(let i=0;i<12;i++){const a=i*TAU/12,dx=Math.cos(a),dy=Math.sin(a),xx=e.x+dx*radius,yy=e.y+dy*radius;line(xx-dx*5-dy*3,yy-dy*5+dx*3,xx,yy,'#c4f1e0',1.5);line(xx-dx*5+dy*3,yy-dy*5-dx*3,xx,yy,'#c4f1e0',1.5);}}
    else if(e.evolved){ctx.globalAlpha=alpha*.65;ctx.strokeStyle=e.echo?'#eee0a3':'#c1e9ce';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(0,radius-6),0,TAU);ctx.stroke();if(e.echo){for(let i=0;i<8;i++){const a=i*TAU/8;diamond(e.x+Math.cos(a)*radius,e.y+Math.sin(a)*radius,3,'#e3dda0');}}}
  }else if(e.type==='hit'){for(let i=0;i<5;i++){const a=i*TAU/5;line(e.x+Math.cos(a)*3,e.y+Math.sin(a)*3,e.x+Math.cos(a)*e.r*(1+progress),e.y+Math.sin(a)*e.r*(1+progress),e.color,2);}}
  else if(e.type==='lightning'&&(e.focus||e.branch==='focus')){
    const end={x:e.x2,y:e.y2},path=lightningPath({x:e.x,y:e.y},end,Number(e.seed)||Math.round(end.x+end.y),4,.2);ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowColor='#d7cefa';ctx.shadowBlur=reduced?0:9;ctx.strokeStyle='#c8b6f0';ctx.lineWidth=4;ctx.beginPath();path.forEach((point,i)=>ctx[i?'lineTo':'moveTo'](point.x,point.y));ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#f7f1ff';ctx.lineWidth=1.6;ctx.stroke();ctx.strokeStyle='#cbbbee';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(end.x,end.y+6,17+progress*8,7+progress*3,0,0,TAU);ctx.stroke();for(let i=0;i<4;i++){const a=i*TAU/4+.3;line(end.x+Math.cos(a)*6,end.y+Math.sin(a)*6,end.x+Math.cos(a)*17,end.y+Math.sin(a)*17,'#eee3fa',1.3);}
  }else if(e.type==='lightning'){
    const evolved=e.evolved,color=e.color||(evolved?'#eddfa8':'#bedaf0');ctx.shadowBlur=reduced?0:evolved?12:10;ctx.shadowColor=color;ctx.strokeStyle=color;ctx.lineWidth=evolved?3:2.3;ctx.beginPath();ctx.moveTo(e.x,e.y);
    const dx=e.x2-e.x,dy=e.y2-e.y,d=Math.hypot(dx,dy)||1;for(let i=1;i<=7;i++){let jitter=i===7?0:Math.sin(i*43+e.x)*13;ctx.lineTo(e.x+dx*i/7-dy/d*jitter,e.y+dy*i/7+dx/d*jitter);}ctx.stroke();
    if(evolved){ctx.shadowBlur=0;ctx.strokeStyle='#fff3d4';ctx.lineWidth=1;ctx.stroke();diamond(e.x2,e.y2,4,'#f6e8b2');}
  }else if(e.type==='arrowRicochet'){
    const angle=Math.atan2((e.y2??e.y-9)-e.y,(e.x2??e.x+10)-e.x),dx=Math.cos(angle),dy=Math.sin(angle);ctx.strokeStyle='#e8d8a3';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(e.x-dx*10-dy*7,e.y-dy*10+dx*7);ctx.lineTo(e.x,e.y);ctx.lineTo(e.x+dx*17,e.y+dy*17);ctx.stroke();diamond(e.x,e.y,3,'#f4e6bb');
  }else if(e.type==='runeBolt'){
    const mx=(e.x+e.x2)/2,my=(e.y+e.y2)/2-12;ctx.strokeStyle='#93e6db';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.quadraticCurveTo(mx,my,e.x2,e.y2);ctx.stroke();diamond(e.x2,e.y2,4,'#d0f8e9');
  }else if(e.type==='vineCut'){
    for(let i=0;i<6;i++){const a=i*TAU/6,r=(e.r||35)*(.35+progress*.65);line(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r,e.x+Math.cos(a)*r+5,e.y+Math.sin(a)*r-4,'#b5d291',2);}
  }else if(e.type==='shieldBreak'){
    const r=(e.r||25)*(reduced?1:.7+.4*progress);ctx.strokeStyle='#b6dcec';ctx.lineWidth=1.6;for(let i=0;i<7;i++){const a=i*TAU/7;ctx.beginPath();ctx.arc(e.x,e.y,r,a,a+.25);ctx.stroke();}
  }else if(e.type==='bleedBurst'){
    const radius=(e.r||20)*(reduced?.8:.5+progress*.6);ctx.lineWidth=1.8;ctx.strokeStyle='#e8a486';for(let i=0;i<5;i++){const a=i*TAU/5+.25;line(e.x+Math.cos(a)*radius*.5,e.y+Math.sin(a)*radius*.5,e.x+Math.cos(a)*radius,e.y+Math.sin(a)*radius,'#e8a486',1.8);}
  }else if(e.type==='conduction'){
    const dx=e.x2-e.x,dy=e.y2-e.y,d=Math.hypot(dx,dy)||1,mx=e.x+dx*.5,my=e.y+dy*.5;ctx.strokeStyle='#bde5f9';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+dx*.32-dy/d*7,e.y+dy*.32+dx/d*7);ctx.lineTo(mx+dy/d*5,my-dx/d*5);ctx.lineTo(e.x2,e.y2);ctx.moveTo(mx+dy/d*5,my-dx/d*5);ctx.lineTo(mx+dx/d*5+dy/d*12,my+dy/d*5-dx/d*12);ctx.stroke();
  }else if(e.type==='heal'){ctx.font='600 15px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(e.text||'',e.x,e.y);}
  ctx.restore();
}
// A fixed ground boundary shows the exact danger zone; only its countdown
// advances. All marks sit beneath the depth-sorted actors and solid terrain.
function drawBossGroundEffects(){drawBossGround(ctx,game.enemies,sceneVisible,{line,diamond});}
function stormExposure(storm){
  if(reduced||!storm||storm.life<=0)return 0;
  return .09*Math.max(0,1-(storm.maxLife-storm.life)/.095)**2;
}
function appendLightningPath(points){ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);}
function drawStorm(){
  const storm=game.storm;if(!storm||storm.life<=0)return;
  const geometry=getStormGeometry(storm);
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0;
  // Five short waves keep a crowded cast readable. Each wave shares the same
  // stroke passes: no per-enemy gradients, glow filters or render-time geometry.
  for(const wave of geometry.waves){
    const brightness=stormBrightness(storm,reduced,wave.delay);
    if(brightness>0){
      ctx.beginPath();for(const bolt of wave.mainBolts)appendLightningPath(bolt.trunk);
      for(const [strokeWidth,color,opacity] of [[12,'#5199ff',.075],[7,'#73b8ff',.2],[3.7,'#abdfff',.8],[1.65,'#ffffff',1]]){
        ctx.lineWidth=strokeWidth;ctx.strokeStyle=color;ctx.globalAlpha=brightness*opacity;ctx.stroke();
      }
      ctx.beginPath();for(const bolt of wave.mainBolts)for(const branch of bolt.branches)appendLightningPath(branch);for(const link of wave.links)appendLightningPath(link);
      ctx.strokeStyle='#83c5ff';ctx.lineWidth=2.7;ctx.globalAlpha=brightness*.28;ctx.stroke();
      ctx.strokeStyle='#d5f1ff';ctx.lineWidth=.95;ctx.globalAlpha=brightness*.85;ctx.stroke();
    }
    const impactAlpha=stormImpactBrightness(storm,reduced,wave.delay);
    ctx.beginPath();for(const impact of wave.impacts)for(const path of impact.paths)appendLightningPath(path);
    ctx.strokeStyle='#6dbbff';ctx.lineWidth=3.6;ctx.globalAlpha=impactAlpha*.24;ctx.stroke();
    ctx.strokeStyle='#e5f6ff';ctx.lineWidth=1.25;ctx.globalAlpha=impactAlpha;ctx.stroke();
    ctx.beginPath();for(const impact of wave.impacts){ctx.moveTo(impact.x+2.2,impact.y);ctx.ellipse(impact.x,impact.y,2.2,1.6,0,0,TAU);}
    ctx.fillStyle='#ffffff';ctx.globalAlpha=impactAlpha;ctx.fill();
  }
  ctx.restore();
}
// Each mote belongs to a map cell. Camera movement only changes its projection;
// bounded drift never wraps at a screen edge or follows a resized viewport.
function mapAmbientMotes(camX,camY,time=game?._clock??clock,viewWidth=width,viewHeight=height){
  const spacing=240,margin=30,motes=[],t=reduced?0:time;
  const left=Math.floor((camX-viewWidth/2-margin)/spacing),right=Math.floor((camX+viewWidth/2+margin)/spacing);
  const top=Math.floor((camY-viewHeight/2-margin)/spacing),bottom=Math.floor((camY+viewHeight/2+margin)/spacing);
  for(let gx=left;gx<=right;gx++)for(let gy=top;gy<=bottom;gy++){
    if(hash(gx+19,gy+41)>.84)continue;
    const anchorX=(gx+hash(gx+67,gy+23))*spacing,anchorY=(gy+hash(gx+31,gy+79))*spacing,phase=hash(gx+101,gy+53)*TAU;
    const x=anchorX+Math.sin(t*.32+phase)*12,y=anchorY+Math.cos(t*.26+phase)*10;
    if(Math.abs(x-camX)>viewWidth/2+9||Math.abs(y-camY)>viewHeight/2+9)continue;
    motes.push({id:`${gx},${gy}`,x,y,anchorX,anchorY,alpha:reduced?.15:.15+Math.sin(t*1.4+phase)*.1});
  }
  return motes;
}
function ambient(intro,camX=0,camY=0){
  const motes=intro?Array.from({length:25},(_,i)=>{const t=reduced?0:clock;return {x:(hash(i,9)*width+Math.sin(t*.2+i)*25+width)%width,y:(hash(i,8)*height-t*(3+hash(i,7)*5)%height+height)%height,alpha:reduced?.15:.15+Math.sin(t*1.4+i)*.13};}):mapAmbientMotes(camX,camY);
  ctx.save();if(!intro)ctx.translate(width/2-camX,height/2-camY);
  for(const mote of motes){ctx.globalAlpha=mote.alpha;glow(mote.x,mote.y,7,'#daed9daa');ellipse(mote.x,mote.y,1.5,1.5,'#f1f5b3');}ctx.restore();
}
// Houses, town NPCs and dungeon walls share the same ground depth order as actors.
function drawTownNpc(actor){
  const e=actor.entity,angel=e.townKind==='angel',pose=humanoidPose(e);
  ctx.save();ctx.translate(e.x,e.y);ctx.scale(actor.scale,actor.scale);
  humanoidArt.draw(ctx,angel?'angel':'merchant',{pose,entity:e,time:game?._clock??clock,reduced,pixelRatio:dpr});
  ctx.restore();ctx.save();ctx.textAlign='center';ctx.font='600 9px system-ui,sans-serif';ctx.fillStyle=angel?'#f0e8c6':'#e5d3a0';ctx.fillText(e.name,e.x,e.y-53);ctx.restore();
}
function drawSmallHut(site){
  const {x,y,width:w,depth,state}=site,roofTop=-depth-32;
  const behind=game.player.y+19.8<y+4&&Math.abs(game.player.x-x)<w/2+20&&game.player.y>y+roofTop-14;
  sceneryArt.drawHut(ctx,site,behind);
  ctx.save();ctx.translate(x,y);ctx.textAlign='center';ctx.font='600 10px system-ui,sans-serif';ctx.fillStyle=state==='spent'?'#a3b39a':'#dfd3ad';ctx.shadowColor='#10251c';ctx.shadowBlur=3;ctx.fillText(site.name,0,roofTop-17);ctx.shadowBlur=0;
  if(state==='spent'){ctx.font='9px system-ui';ctx.fillStyle='#99ad91';ctx.fillText('已探索',0,20);}else if(site.type==='occupied'&&state==='active'){ctx.font='9px system-ui';ctx.fillStyle='#edc29c';ctx.fillText('屋内尚有守卫',0,20);}
  ctx.restore();
}
function drawSettlement(site){
  if(site.type==='merchant')return;
  if(worldSiteArt.drawSettlement(ctx,site,{...combatOptions,player:game.player}))return;
  if(site.type==='supply'||site.type==='occupied'){drawSmallHut(site);return;}
  const {x,y,type}=site,w=site.width||140,depth=site.depth||70,castle=type==='castle',marsh=site.region==='marsh',ruins=site.region==='ruins';
  ctx.save();ctx.translate(x,y);ctx.lineJoin='round';
  if(type==='angel'){ctx.restore();return;}
  const foot=game.player.y+19.8,behind=foot<y+4&&Math.abs(game.player.x-x)<w/2+27&&game.player.y>y-depth-135;
  ctx.restore();regionalArt.drawCastle(ctx,site,behind);drawCastleActivation(ctx,site,behind);ctx.save();ctx.translate(x,y);ctx.textAlign='center';ctx.font='600 10px system-ui,sans-serif';ctx.fillStyle=site.state==='spent'?'#a3b39a':castle?'#d5c6e2':'#dfd3ad';ctx.shadowColor='#10251c';ctx.shadowBlur=3;ctx.fillText(site.name||({merchant:'旅人商铺',supply:'林间小屋',occupied:'被占据的小屋',castle:'旧王城堡'}[type]),0,castle?-164:-depth-82);ctx.shadowBlur=0;
  if(site.state==='spent'||site.state==='claimed'||site.explored){ctx.font='9px system-ui';ctx.fillStyle='#99ad91';ctx.fillText('已探索',0,33);}else if(site.type==='occupied'&&site.state==='active'){ctx.font='9px system-ui';ctx.fillStyle='#edc29c';ctx.fillText('屋内尚有守卫',0,35);}
  ctx.restore();
}
function drawDungeonBackground(camX,camY){const dungeon=game.dungeon.active;if(dungeon.kind==='hut')hutArt.drawGround(ctx,dungeon,camX,camY,width,height);else regionalArt.drawDungeonGround(ctx,dungeon,camX,camY,width,height);}
function drawDungeonWall(prop,mainPlayer){
  dungeonWallArt.draw(ctx,prop,mainPlayer,game.dungeon.vision,game._clock,(target,wall)=>{
    if(wall.variant==='hut-wall')hutArt.drawWall(target,wall,false);
    else regionalArt.drawDungeonWall(target,wall,false);
  });
}
function drawDungeonGround(){
  const dungeon=game.dungeon?.active;if(!dungeon)return;const e=dungeon.entrance;ctx.save();ctx.strokeStyle='#a2d5c58c';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y,42,24,0,0,TAU);ctx.stroke();ctx.font='600 10px system-ui';ctx.textAlign='center';ctx.fillStyle='#c9e3c7';ctx.fillText('返回荒野',e.x,e.y+41);for(const side of [-1,1]){line(e.x+side*30,e.y-14,e.x+side*30,e.y+10,'#9eaa8377',4);}ctx.restore();
}
function drawDungeonChest(prop){
  propArt.drawProp(ctx,prop,combatOptions);
  const claimed=prop.state==='claimed',royal=prop.royal,locked=prop.state==='locked';
  ctx.save();ctx.translate(prop.x,prop.y);if(royal)ctx.scale(1.3,1.3);ctx.textAlign='center';ctx.font='600 9px system-ui';ctx.fillStyle=royal?'#ddcbe9':'#dac89d';
  ctx.fillText(claimed?'已领取':locked?'击败最终首领':royal?(game.dungeon?.active?.treasureName||'王城宝藏'):prop.hut?(game.dungeon?.active?.treasureName||'屋内补给'):'支路宝箱',0,claimed?-77:-48);ctx.restore();
}
function drawWorldMap(){worldMap.draw(ctx,game,minimapBounds(width,height,hudInsets));}
function drawSwordEnergyWaves(){
  for(const wave of game.attacks?.sword?.energyWaves||[]){
    if(wave.delay>0||wave.life<=0||!sceneVisible(wave)||!effectInView(wave))continue;
    drawSwordEnergy(ctx,wave,combatOptions);
  }
}
function drawCoins(){for(const coin of game.coins||[]){if(!sceneVisible(coin))continue;if(Math.abs(coin.x-game.player.x)>width/2+20||Math.abs(coin.y-game.player.y)>height/2+20)continue;ellipse(coin.x,coin.y+5,5,2,'#172a1855');ellipse(coin.x,coin.y,4.5,5.5,'#a08037');ellipse(coin.x-.7,coin.y-.8,3.2,4.2,'#e7c469');line(coin.x,coin.y-2.5,coin.x,coin.y+2,'#fff0aa',1);}}
function drawSuperFields(air=false){
  for(const field of game.superSkills?.fields||[]){if(!sceneVisible(field))continue;
    const margin=field.r+(air?200:0);
    if(Math.abs(field.x-game.player.x)>width/2+margin||Math.abs(field.y-game.player.y)>height/2+margin)continue;
    if(air)superArt.drawFieldAir(ctx,field,combatOptions);else superArt.drawField(ctx,field,combatOptions);
  }
}
function renderIntro(){
  combatOptions.time=clock;combatOptions.dense=width<600;
  background(0,0,true);const mobile=width<760&&height>width*.72,compact=height<450&&width>height,x=width*(mobile?.63:compact?.8:.735),y=height*(mobile?(height<570?.89:.81):.51),s=mobile?(height<570?1.35:1.65):compact?2.05:2.7;
  const surrounds=mobile?[[105,25,'slime',14],[-95,50,'slime',12],[125,-65,'bat',8]]:[[145,40,'slime',22],[-165,95,'slime',17],[210,-105,'bat',13],[-68,-133,'beetle',19],[160,158,'brute',24]];
  const actors=surrounds.map(([dx,dy,type,r],id)=>actorVisual({x:x+dx,y:y+dy,r,type,id:id+1,hp:10,maxHp:10,hit:0}));
  actors.push(actorVisual({x,y,facing:0,heroId:'traveler'},true,s));
  const visible=actors.filter(actor=>actorInView(actor));
  drawActorShadows(visible,0,0,[],[],(target,view)=>{target.save();target.translate(view.width/2-view.camX,view.height/2-view.camY);drawIntroLights(target);glow(x,y-15,135,'#b9d68116',target);target.restore();});runeCircle(x,y+30*s,70*s,clock,.28);runeCircle(x,y+30*s,51*s,-clock,.12);
  for(let i=0;i<7;i++){let a=i*2.4,rr=mobile?60:115,gx=x+Math.cos(a)*rr,gy=y+35+Math.sin(a)*rr*.45;diamond(gx,gy,4+(i%2),'#c0e79099');}
  drawActors(visible);
  ambient(true);
}
function renderGame(){combatOptions.time=game._clock;combatOptions.dense=width<600||game.enemies.length>95||game.effects.length>90;const p=game.player,camX=p.x,camY=p.y;let sx=0,sy=0;if(shake>0&&!reduced){sx=(hash(game._clock,23)-.5)*shake;sy=(hash(game._clock,67)-.5)*shake;}
  const offsetX=width/2-camX+sx,offsetY=height/2-camY+sy;
  combatOptions.screenTopWorldY=-offsetY;combatOptions.viewWidth=width;
  combatOptions.viewBounds={minX:-offsetX,minY:-offsetY,maxX:width-offsetX,maxY:height-offsetY};
  combatVfx.beginFrame(combatOptions);
  background(camX-sx,camY-sy,false);
  const actors=game.enemies.filter(sceneVisible).map(e=>actorVisual(e));actors.push(actorVisual(p,true));for(const ally of game.companions?.members||[])if(sceneVisible(ally))actors.push(actorVisual(ally,true));if(!game.dungeon?.active)for(const site of game.settlements?.sites||[])if((site.type==='merchant'||site.type==='angel')&&site.state!=='spent'){const npc={x:site.x,y:site.y-19.8,isTownNpc:true,townKind:site.type,flying:site.flying,heroId:'traveler',site,name:site.type==='merchant'?'商人':'天使',id:site.id,castFace:site.castFace||0,facing:0};actors.push(actorVisual(npc,true));}for(const camp of rescueCamps()){const definition=companionDefinition(camp.kind);actors.push(actorVisual({...camp,y:camp.y-(definition?.groundOffset??19.8),r:definition?.r||15,groundOffset:definition?.groundOffset??19.8,flying:!!definition?.flying,heroId:camp.kind,isCaptive:true},true));}if(!game.dungeon?.active)for(const site of game.relicSites?.sites||[])if((site.type==='rescue'||site.type==='dogcamp')&&site.state==='ready'){const definition=companionDefinition(site.kind);actors.push(actorVisual({x:site.x,y:site.y-(definition?.groundOffset??19.8),r:definition?.r||15,heroId:site.kind,kind:site.kind,name:definition?.name||'伙伴',groundOffset:definition?.groundOffset??19.8,flying:!!definition?.flying,state:site.appearance==='golemaltar'?'dormant':site.type==='dogcamp'?'ready':'trapped',isCaptive:true},true));};for(let i=actors.length-1;i>=0;i--)if(!actorInView(actors[i],offsetX,offsetY))actors.splice(i,1);
  const terrain=terrainInView(camX,camY),adventureProps=adventureSceneProps(camX,camY);
  const vision=game.dungeon?.active?game.dungeon.vision:null;
  if(vision){
    // Only static scenery is drawn underneath remembered fog. Enemies, loot,
    // shadows, telegraphs and effects are drawn afterwards under the live clip.
    ctx.save();ctx.translate(offsetX,offsetY);
    if(game.dungeon.active.kind==='hut')for(const prop of game.dungeon.active.props||[])hutArt.drawProp(ctx,prop);
    ctx.restore();vision.drawFog(ctx,offsetX,offsetY,width,height);
  }
  ctx.save();if(vision)vision.clipVisible(ctx,offsetX,offsetY);
  ctx.save();ctx.translate(offsetX,offsetY);drawEncounterGround();drawRelicGround();drawMudGround();drawDungeonGround();ctx.restore();
  drawActorShadows(actors,offsetX,offsetY,terrain,adventureProps,game.dungeon?.active?null:(target,view)=>drawMapLights(view.camX,view.camY,target,view.width,view.height));ctx.save();ctx.translate(offsetX,offsetY);
  for(const gem of game.gems){if(!sceneVisible(gem))continue;if(Math.abs(gem.x-p.x)>width/2+20||Math.abs(gem.y-p.y)>height/2+20)continue;ellipse(gem.x,gem.y+5,gem.r,2,'#152b1b66');diamond(gem.x,gem.y,gem.r,'#a5d78b');diamond(gem.x-1,gem.y-1,gem.r*.45,'#def3b4');}
  drawCoins();drawSuperFields();
  combatArt.drawStormGround(ctx,game.storm,combatOptions);
  for(const e of game.effects)if(sceneVisible(e)&&effectInView(e))combatVfx.drawBurst(ctx,e,combatOptions,'ground');
  // Waiting swords sit behind the hero; launched swords use the air pass below.
  for(const e of game.effects)if(e.type==='superBurst'&&e.skillId==='swords')effects(e);
  for(const e of game.effects)if(e.type==='ring'||e.type==='rescueWarning')effects(e);drawRescueGround();
  drawAdventurePickups();drawEnemyTelegraphs();drawEnvironmentWarnings();drawRegionMechanisms();worldHazardArt.draw(ctx,game.environment,combatOptions);drawEliteGroundEffects();drawBossGroundEffects();
  ctx.restore();ctx.restore();
  ctx.save();ctx.translate(offsetX,offsetY);drawScene(actors,terrain,p,adventureProps);ctx.restore();
  ctx.save();if(vision)vision.clipVisible(ctx,offsetX,offsetY);ctx.save();ctx.translate(offsetX,offsetY);
  drawSuperFields(true);drawEnemyBullets();
  drawGuardianBarrier(ctx,game,p,combatOptions);
  for(const b of game.bullets)if(sceneVisible(b)&&Math.abs(b.x-p.x)<width/2+100&&Math.abs(b.y-p.y)<height/2+100){drawWeaponTrail(ctx,b,combatOptions);combatArt.drawArrow(ctx,b,combatOptions);}
  drawSwordEnergyWaves();
  for(const sword of game.superSkills?.swordFlights||[]){
    if(!sceneVisible(sword)||Math.abs(sword.x-p.x)>width/2+100||Math.abs(sword.visualY-p.y)>height/2+100)continue;
    superArt.drawSwordFlight(ctx,sword,combatOptions);
  }
  for(const b of game.orbitals){drawWeaponTrail(ctx,b,combatOptions);propArt.drawBlade(ctx,b,combatOptions);}
  for(const e of game.effects)if(e.type!=='ring'&&e.type!=='rescueWarning'&&e.type!=='eliteSummon'&&e.type!=='swordSlash'&&!(e.type==='superBurst'&&e.skillId==='swords'))effects(e);
  drawStorm();combatArt.drawStormAir(ctx,game.storm,combatOptions);
  ctx.restore();
  const exposure=stormExposure(game.storm);if(exposure>0){ctx.fillStyle=`rgba(177,219,255,${exposure})`;ctx.fillRect(0,0,width,height);}
  ctx.restore();
  if(!game.dungeon?.active)ambient(false,camX-sx,camY-sy);
  // Combat text is an overlay: visible hit sources only, outside floor clips.
  ctx.save();ctx.translate(offsetX,offsetY);
  drawDamageOverlay(ctx,game.effects,combatOptions,sceneVisible,effectInView);ctx.restore();
  drawWorldMap();
  drawObjectivePointers();drawWaveCue();
  if(p.hp/p.maxHp<.3){const danger=ctx.createRadialGradient(width/2,height/2,height*.2,width/2,height/2,Math.max(width,height)*.65);danger.addColorStop(0,'transparent');danger.addColorStop(1,'#ae392144');ctx.fillStyle=danger;ctx.fillRect(0,0,width,height);}
  drawRegionTransition();
}
// Screen-edge combat UI marks the incoming flank; scenery remains world-fixed.
function drawWaveCue(){
  if(game.dungeon?.active||game.pressurePhase!=='warning')return;
  const wave=game.waveDirector.summary(),angle=wave.direction;
  if(!Number.isFinite(angle))return;
  const dx=Math.cos(angle),dy=Math.sin(angle),edge=Math.min((width/2-18)/Math.max(.001,Math.abs(dx)),(height/2-18)/Math.max(.001,Math.abs(dy)));
  const x=width/2+dx*edge,y=height/2+dy*edge;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=reduced?.85:.65+Math.sin(game.time*5)*.18;
  ctx.fillStyle='#efd099';ctx.shadowColor='#edba69';ctx.shadowBlur=reduced?0:12;
  for(const offset of [-22,0,22]){ctx.beginPath();ctx.moveTo(-10,offset);ctx.lineTo(1,offset-6);ctx.lineTo(-3,offset);ctx.lineTo(1,offset+6);ctx.closePath();ctx.fill();}
  ctx.restore();
}
function drawRegionTransition(){
  const transition=game.sceneTransition;if(!transition?.active)return;
  ctx.save();ctx.fillStyle=`rgba(8,12,10,${transition.opacity})`;ctx.fillRect(0,0,width,height);
  if(transition.phase==='in'){
    ctx.globalAlpha=transition.opacity;ctx.textAlign='center';ctx.font='600 18px "PingFang SC",system-ui,sans-serif';
    ctx.fillStyle='#e0e8cc';ctx.fillText(transition.name,width/2,height*.46);
  }
  ctx.restore();
}
function syncSceneInput(){
  if(sceneInputRevision===game.sceneTransition.inputRevision)return;
  sceneInputRevision=game.sceneTransition.inputRevision;
  for(const key of keys)blockedTransitionKeys.add(key);
  clearInput();shake=0;
  updatePortalHUD();
}
function bossFeedbackVisible(){return game.enemies.some(enemy=>enemy.type==='boss'&&enemy.hp>0&&sceneVisible(enemy));}
function frameState(){return {game,scene:game?.dungeon?.active??game?.regionIndex??null,status:game?.status??'intro',paused,helpOpen,mapOpen,characterOpen,archiveOpen,runEnded,hidden:!!document.hidden};}
const cpuNow=()=>globalThis.performance?.now?.()??Date.now();
function updateGameFrame(dt){input.x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+(touch?.dx||0);input.y=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+(touch?.dy||0);input.skill=skillRequested;input.interact=portalRequested;skillRequested=false;portalRequested=false;game.update(dt,input);syncSceneInput();if((game.runTime??0)>=archiveObserveAt||game.status!=='playing'){observeArchive();archiveObserveAt=(game.runTime??0)+.25;}if(!game.sceneTransition.active)worldMap.discover(game,{viewportWidth:width,viewportHeight:height});let hitSound=false;for(const e of game.events){if(e.type==='superCast'||e.type==='superImpact')playSuperFeedback(e);if(e.type==='shoot')tone(700,.045,'triangle',.012,330);if(e.type==='swordSwing')tone(e.branch==='heavy'?240:430,.075,'triangle',.012,e.branch==='heavy'?80:140);if(e.type==='kill')hitSound=true;if(e.type==='hurt'){shake=8;tone(150,.1,'triangle',.055,70);}if(e.type==='skill'){updateHUD();shake=reduced?0:5;tone(85,.48,'triangle',.065,32);tone(720,.25,'sawtooth',.02,90);}if(e.type==='level')tone(650,.24,'sine',.05,1200);if(e.type==='evolution'){tone(620,.3,'sine',.045,1240);}if(e.type==='companionJoined'){archive.recordRecruit?.(game,e.kind);tone(540,.3,'sine',.035,1080);}if(e.type==='encounterComplete')tone(540,.22,'sine',.03,880);if(e.type==='mushroomArmed')tone(480,.08,'sine',.012,650);if(e.type==='mushroomBlast')tone(120,.14,'triangle',.025,55);if(bossSound(e.type)&&bossFeedbackVisible()){if(e.type==='bossSlam')shake=reduced?0:Math.max(shake,3);tone(...bossSound(e.type));}if(e.type==='bossKill'){shake=reduced?0:Math.max(shake,4);tone(95,.35,'triangle',.045,40);}if(e.type==='boss'&&bossFeedbackVisible())tone(130,.5,'triangle',.07,75);if(e.type==='heal')tone(600,.1,'sine',.015,900);}if(hitSound)tone(170,.04,'triangle',.018,95);announceCombatEvents(game.events);game.events.length=0;}
function frame(now){
  const frameBegan=diagnostics?.running?cpuNow():0;frameHudMs=0;
  const capture=diagnostics?.running,fromX=capture?game?.player.x:0,fromY=capture?game?.player.y:0;
  // A DPR-only monitor/zoom change may not resize the CSS content box.
  if(nativeDpr!==(window.devicePixelRatio||1))resize();
  const dt=Math.max(0,Math.min((now-(last||now))/1000,.04));last=now;
  let state=frameState(),updateMs=0,renderMs=0,rendered=false;
  const live=renderSchedule.isLive(state);
  if(live){
    if(!game?.sceneTransition.active)clock+=dt;
    if(game){const began=debugMode?cpuNow():0;updateGameFrame(dt);if(debugMode)updateMs=cpuNow()-began;}
  }
  state=frameState();
  if(renderSchedule.shouldRender(state)){
    if(game&&!paused&&!helpOpen&&!mapOpen&&!characterOpen&&!archiveOpen&&!runEnded){
      if(game.status==='upgrade')openUpgrades();if(game.status==='relic')openRelics();if(game.status==='super')openSuperChoices();if(game.status==='shop')openShop();if(game.status==='dead')endGame();
    }
    const began=debugMode?cpuNow():0;
    ctx.setTransform(scaleX,0,0,scaleY,0,0);
    if(game)renderGame();else renderIntro();
    if(debugMode)renderMs=cpuNow()-began;rendered=true;
    if(game){
      hudTick+=dt;
      if(!renderSchedule.isLive(state)||hudTick>.07){updateHUD();hudTick=0;}
      if(game.status==='playing'&&!game.sceneTransition.active&&!paused&&!helpOpen&&!mapOpen&&!characterOpen&&!archiveOpen)shake=Math.max(0,shake-dt*40);
    }
    // UI callbacks and resize can invalidate a frozen scene once. Committing
    // after HUD refresh retains that freshly drawn frame until a real change.
    state=frameState();renderSchedule.commit(state);
  }
  updateDebugFps(now,rendered,updateMs,renderMs,state);
  requestAnimationFrame(frame);
  if(diagnostics?.running){
    if(game?.sceneTransition.active){cancelDiagnosticCapture();diagnosticNotice='场景切换，采样已取消，请在同一地图重新开始。';refreshDiagnostics();return;}
    const active=!!game&&live&&rendered&&renderSchedule.isLive(state);
    const report=diagnostics.sample(now,{active,updateMs,renderMs,hudMs:frameHudMs,totalMs:cpuNow()-frameBegan,moving:!!game&&(Math.abs(game.player.x-fromX)+Math.abs(game.player.y-fromY)>.01)});
    if(report)finishDiagnosticStage();
  }
}
requestAnimationFrame(frame);
