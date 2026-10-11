import { Game } from './engine.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas'), ctx = canvas.getContext('2d', {alpha:false});
// One small reusable mask keeps overlapping actor shadows at a fixed darkness.
const actorShadowCanvas=document.createElement('canvas'),actorShadowCtx=actorShadowCanvas.getContext('2d');
const arena = $('arena'), TAU = Math.PI * 2;
// One world-space sunlight direction drives every beam and actor projection.
const SUN_ANGLE=Math.atan2(325,840),SUN={x:-Math.sin(SUN_ANGLE),y:Math.cos(SUN_ANGLE)};
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const hash = (x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const timeLabel = (n)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;
let width=1100,height=700,dpr=1,game=null,paused=false,helpOpen=false,runEnded=false;
let clock=0,last=0,shake=0,toastTimer=0,toastPriority=0,toastUntil=0,upgradeLevel=0,lastLoadout='',hudTick=0;
let keys=new Set(),skillRequested=false,touch=null,input={x:0,y:0,skill:false};
let pendingEvolutions=[];
let soundOn=false,audio=null,record={kills:0,time:0,bossKills:0};
try{const saved=JSON.parse(localStorage.getItem('wild-echoes-endless-record'));if(saved&&Number.isFinite(saved.kills)&&Number.isFinite(saved.time))record={kills:saved.kills,time:saved.time,bossKills:saved.bossKills||0};soundOn=localStorage.getItem('wild-echoes-sound')==='on';}catch{}
const show=(id,yes=true)=>$(id).classList.toggle('hidden',!yes);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
function resize(){const r=arena.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(game){game.viewWidth=width;game.viewHeight=height;}}
new ResizeObserver(resize).observe(arena);resize();

function syncSound(){document.body.classList.toggle('sound-enabled',soundOn);$('sound-button').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('sound-button').title=soundOn?'关闭音效':'开启音效';}
function initAudio(){if(!soundOn)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{soundOn=false;syncSound();}}
function tone(freq,duration=.07,type='sine',volume=.035,end=freq){if(!soundOn||!audio||audio.state!=='running')return;const now=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(Math.max(30,end),now+duration);gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+duration);}
function notify(message,priority=0){if(Date.now()<toastUntil&&priority<toastPriority)return;toastPriority=priority;toastUntil=Date.now()+3200;$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').classList.remove('visible');toastPriority=0;toastUntil=0;},3200);}
function bestText(){$('best-label').textContent=record.kills?`最长存活 ${timeLabel(record.time)} · 最高击败 ${record.kills}`:'新的冒险，等你书写。';}
syncSound();bestText();

function clearInput(){keys.clear();skillRequested=false;touch=null;input={x:0,y:0,skill:false};show('joystick',false);$('joystick-thumb').style.transform='';}
function startGame(){pendingEvolutions=[];game=new Game({difficulty:$('difficulty-casual').checked?'casual':'normal'});game.viewWidth=width;game.viewHeight=height;paused=false;runEnded=false;helpOpen=false;upgradeLevel=0;lastLoadout='';shake=0;toastPriority=0;toastUntil=0;clearInput();for(const id of ['intro','upgrade-overlay','pause-overlay','end-overlay','help-overlay','boss-bar','buff-status','encounter-status'])show(id,false);show('hud');show('game-bottom');show('touch-skill',coarse);arena.classList.add('playing');initAudio();tone(440,.13,'sine',.045,660);notify('保持移动，收集灵晶。你的武器会自动攻击。');updateHUD();canvas.focus({preventScroll:true});}
function home(){pendingEvolutions=[];game=null;paused=false;runEnded=false;clearInput();for(const id of ['hud','game-bottom','upgrade-overlay','pause-overlay','end-overlay','help-overlay','boss-bar','touch-skill','buff-status','encounter-status'])show(id,false);show('intro');arena.classList.remove('playing');arena.classList.remove('has-encounter');$('toast').classList.remove('visible');bestText();$('start-button').focus({preventScroll:true});}
function pause(){if(!game||game.status!=='playing'||runEnded)return;paused=true;clearInput();show('pause-overlay');$('resume-button').focus({preventScroll:true});}
function resume(){paused=false;clearInput();show('pause-overlay',false);initAudio();}
function openHelp(){helpOpen=true;clearInput();show('help-overlay');$('close-help').focus({preventScroll:true});}
function closeHelp(){helpOpen=false;show('help-overlay',false);if(!game)$('help-button').focus({preventScroll:true});else if(paused)$('resume-button').focus({preventScroll:true});else if(game.status==='upgrade')$('upgrade-cards').querySelector('button')?.focus({preventScroll:true});}
function openUpgrades(){
  if(upgradeLevel===game.player.level)return;
  const alreadyOpen=!$('upgrade-overlay').classList.contains('hidden');
  upgradeLevel=game.player.level;clearInput();const cards=$('upgrade-cards');cards.replaceChildren();
  const slots=game.player.level>=8?3:game.player.level>=5?2:1,nextSlot=game.player.level<5?5:game.player.level<8?8:0;
  $('upgrade-description').textContent=`LV. ${game.player.level} · 可携带 ${slots} 种副武器${nextSlot?`，LV. ${nextSlot} 开放下一武器位`:'，选择本次强化'}。`;
  $('upgrade-note').textContent=game.player.xp>=game.player.xpNext?'时间已暂停 · 还有升级待选择':'时间已暂停 · 选择后继续冒险';
  for(const upgrade of game.getUpgradeChoices()){
    const card=document.createElement('button');card.className=`upgrade-card${upgrade.evolves?' evolution-card':''}`;
    card.innerHTML=`<span class="upgrade-icon" style="color:${upgrade.color}">${upgrade.icon}</span><span class="upgrade-type">${upgrade.kind}</span><h3>${upgrade.name}</h3><p>${upgrade.desc}</p><span class="select-arrow"><span>LV. ${upgrade.level}</span><span>${upgrade.evolves?'满级进化 ✦':'选择强化 ↗'}</span></span>`;
    card.onclick=()=>{
      if(game?.status!=='upgrade')return;game.chooseUpgrade(upgrade.id);tone(540,.18,'sine',.05,810);clearInput();
      // Surplus XP opens the next choice in this same panel, without a hide/show.
      if(game.status==='upgrade')openUpgrades();else show('upgrade-overlay',false);updateHUD();
    };
    cards.append(card);
  }
  if(!alreadyOpen)show('upgrade-overlay');
  if(alreadyOpen)cards.querySelector('button')?.focus({preventScroll:true});
  else setTimeout(()=>cards.querySelector('button')?.focus({preventScroll:true}),80);
}
function combatPhaseLabel(){
  const bloom=game.enemies.find(enemy=>enemy.bloomAttack?.life>0);
  if(bloom)return bloom.bloomAttack.kind==='fan'?'孢冠扇射':'孢爆蓄力';
  if(game.enemies.some(enemy=>enemy.slam?.life>0))return '震地蓄力';
  if(game.enemies.some(enemy=>enemy.type==='boss'))return '领主来袭';
  return game.pressurePhase==='siege'?'怪潮围攻':game.pressurePhase==='relief'?'短暂喘息':'荒野探索';
}
function announceCombatEvents(events){
  for(const event of events)if(event.type==='evolution'&&!pendingEvolutions.some(item=>item.weaponId===event.weaponId)&&pendingEvolutions.length<3)pendingEvolutions.push(event);
  const boss=game.enemies.find(enemy=>enemy.type==='boss');
  if(events.some(event=>event.type==='boss'))notify(boss?.bossKind==='bloom'?`第 ${game.bossCount} 位领主 · 孢冠苏醒，留意紫色预警`:`第 ${game.bossCount} 位荒野领主已苏醒 · 留意震地红圈`,3);
  else if(events.some(event=>event.type==='bossKill'))notify('领主已击败 · 无尽挑战继续',3);
  else if(events.some(event=>event.type==='bloomWindup'))notify(boss?.bloomAttack?.kind==='fan'?'孢冠扇射 · 绕至侧面，借树石掩护':'孢爆将至 · 离开紫色预警圈',3);
  else if(events.some(event=>event.type==='bossWindup')||game.enemies.some(enemy=>enemy.slam?.life>0||enemy.bloomAttack?.life>0))return;
  else if(pendingEvolutions.length&&(Date.now()>=toastUntil||toastPriority<2)){const evolution=pendingEvolutions.shift();notify(`${evolution.name} · 武器已进化`,2);}
  else if(events.some(event=>event.type==='encounterComplete'))notify('林间挑战完成 · 靠近拾取补给',2);
  else if(events.some(event=>event.type==='treasureOpened'))notify('守卫宝箱已开启 · 靠近拾取补给',2);
  else if(events.some(event=>event.type==='treasureUnlocked'))notify('守卫已击败 · 靠近宝箱领取奖励',2);
  else if(events.some(event=>event.type==='treasureGuard'))notify('精英守卫现身 · 击败它可解锁宝箱',2);
  else if(events.some(event=>event.type==='siege'))notify('怪潮围攻 · 保持移动，寻找空隙',1);
  else if(events.some(event=>event.type==='encounterHunt'))notify('林间狩猎 · 可前往标记区域挑战',1);
  else if(events.some(event=>event.type==='encounterTreasure'))notify('宝物精出现 · 可追击它夺取补给',1);
  else if(events.some(event=>event.type==='encounterExpired'))notify('林间事件已结束 · 继续探索',1);
  else if(events.some(event=>event.type==='fury'))notify('狂暴涌动 · 火力暂时增强',1);
  else if(events.some(event=>event.type==='magnet'))notify('磁力涌动 · 灵晶持续汇聚',1);
  else if(events.some(event=>event.type==='herb'))notify('拾取药草 · 恢复生命',1);
  else if(events.some(event=>event.type==='treasure'))notify('林间出现守卫宝箱 · 可循金色指引挑战',1);
  else if(events.some(event=>event.type==='wave'))notify(`第 ${game.wave} 波 · 怪潮正在变强`);
}
function endGame(){if(runEnded)return;runEnded=true;clearInput();const newBest=game.time>record.time;record.kills=Math.max(record.kills,game.kills);record.time=Math.max(record.time,game.time);record.bossKills=Math.max(record.bossKills,game.bossKills);try{localStorage.setItem('wild-echoes-endless-record',JSON.stringify(record));}catch{}$('end-emblem').textContent=newBest?'♜':'✦';$('end-kicker').textContent=newBest?'A NEW PERSONAL BEST':'THE JOURNEY CONTINUES';$('end-title').textContent=newBest?'你的极限，又远了一点。':'荒野记住了你。';$('end-description').textContent=`抵达第 ${game.wave} 波 · 击败 ${game.bossKills} 位领主。下一次，再远一点。`;$('end-time').textContent=timeLabel(game.time);$('end-kills').textContent=game.kills;$('end-level').textContent=game.player.level;show('end-overlay');show('touch-skill',false);show('buff-status',false);show('encounter-status',false);tone(220,.4,'sine',.06,110);$('restart-button').focus({preventScroll:true});}
function updateBuffHUD(){const adventure=game?.adventure,fury=adventure?.furyTime||0,magnet=adventure?.magnetTime||0;show('buff-status',!runEnded&&(fury>0||magnet>0));show('fury-buff',fury>0);show('magnet-buff',magnet>0);$('fury-time').textContent=Math.ceil(fury);$('magnet-time').textContent=Math.ceil(magnet);}
function updateEncounterHUD(){
  const active=game?.encounters?.active;show('encounter-status',!!active&&!runEnded);arena.classList.toggle('has-encounter',!!active&&!runEnded);if(!active)return;
  const hunt=active.type==='hunt',inside=Math.hypot(game.player.x-active.x,game.player.y+ACTOR_VISUALS.player.foot*1.1-active.y)<=active.r;
  $('encounter-status').classList.toggle('with-boss',game.enemies.some(enemy=>enemy.type==='boss'));
  $('encounter-status').classList.toggle('treasure-event',!hunt);$('encounter-status').classList.toggle('urgent',active.life<=10);
  $('encounter-icon').textContent=hunt?'◎':'◇';$('encounter-name').textContent=hunt?'林间狩猎':'追逐宝物精';
  $('encounter-goal').textContent=hunt?`${inside?'圈内击败':'进入猎区'} · ${active.progress} / ${active.goal}`:'击败金色宝物精 · 夺取补给';
  $('encounter-time').textContent=`${Math.max(0,Math.ceil(active.life))}秒`;
}
function updateHUD(){if(!game)return;updateBuffHUD();updateEncounterHUD();const p=game.player;$('hp-label').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;$('health-fill').style.width=`${100*p.hp/p.maxHp}%`;$('health-fill').style.background=p.hp/p.maxHp<.3?'#e59578':'#c4e69c';$('xp-fill').style.width=`${Math.min(100,100*p.xp/p.xpNext)}%`;$('level-label').textContent=`LV. ${p.level}`;$('timer').textContent=timeLabel(game.time);$('phase-label').textContent=combatPhaseLabel();$('wave-label').textContent=`第 ${game.wave} 波 · 无尽模式`;$('kills').textContent=game.kills;$('skill-label').textContent=p.skillCooldown>0?`天雷 ${p.skillCooldown.toFixed(1)}s`:'天雷轰击 · 就绪';$('skill-fill').style.width=`${100*clamp(1-p.skillCooldown/p.skillCooldownMax,0,1)}%`;$('touch-skill').classList.toggle('cooldown',p.skillCooldown>0);$('skill-button').disabled=p.skillCooldown>0;$('touch-skill').disabled=p.skillCooldown>0;$('skill-symbol').textContent=p.skillCooldown>0?`${Math.ceil(p.skillCooldown)}s`:'ϟ';$('touch-skill-label').textContent=p.skillCooldown>0?'冷却中':'天雷';$('touch-skill').setAttribute('aria-label',p.skillCooldown>0?`天雷轰击，冷却 ${Math.ceil(p.skillCooldown)} 秒`:'释放天雷轰击');const boss=game.enemies.find(e=>e.type==='boss');show('boss-bar',!!boss);$('boss-bar').classList.toggle('bloom-boss',boss?.bossKind==='bloom');if(boss){$('boss-name').textContent=`${boss.bossKind==='bloom'?'孢冠领主':'荒野领主'} · 第 ${game.bossCount} 位`;$('boss-fill').style.width=`${100*boss.hp/boss.maxHp}%`;$('boss-hp').textContent=`${Math.ceil(100*boss.hp/boss.maxHp)}%`;}const loadoutKey=JSON.stringify(game.weapons);if(loadoutKey!==lastLoadout){lastLoadout=loadoutKey;$('loadout').innerHTML=game.weapons.map(w=>`<div class="weapon-slot${w.evolved?' evolved':''}" title="${w.name} · ${w.evolved?'已进化':`等级 ${w.level}${w.evolutionName?'，5 级进化为'+w.evolutionName:''}`}" aria-label="${w.name}，${w.evolved?'已进化':'等级'+w.level}"><span>${w.icon}</span><small>${w.evolved?'进化 ✦':'LV.'+w.level}</small></div>`).join('');}}

$('start-button').onclick=startGame;$('restart-button').onclick=startGame;$('home-button').onclick=home;$('quit-button').onclick=home;$('pause-button').onclick=pause;$('resume-button').onclick=resume;$('help-button').onclick=openHelp;$('close-help').onclick=closeHelp;$('help-done').onclick=closeHelp;
$('sound-button').onclick=()=>{soundOn=!soundOn;syncSound();try{localStorage.setItem('wild-echoes-sound',soundOn?'on':'off');}catch{}initAudio();if(soundOn)tone(660,.1);};
canvas.tabIndex=-1;
// Suppress selection and native drag/callout without cancelling control taps or scrolling.
for(const type of ['selectstart','dragstart'])document.addEventListener(type,e=>{if(e.target.closest?.('.app'))e.preventDefault();});
arena.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='Escape'||e.code==='KeyP'){if(e.repeat)return;if(helpOpen){closeHelp();return;}if(game?.status==='playing'){e.preventDefault();paused?resume():pause();}return;}if(!game||game.status!=='playing'||paused||helpOpen)return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)requestSkill();}});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();if(game?.status==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&game?.status==='playing')pause();});
canvas.addEventListener('pointerdown',e=>{if(!game||game.status!=='playing'||paused||helpOpen||touch)return;e.preventDefault();const r=canvas.getBoundingClientRect();touch={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top,dx:0,dy:0};canvas.setPointerCapture(e.pointerId);$('joystick').style.left=`${touch.x}px`;$('joystick').style.top=`${touch.y}px`;show('joystick');initAudio();});
canvas.addEventListener('pointermove',e=>{if(!touch||touch.id!==e.pointerId)return;const r=canvas.getBoundingClientRect();let dx=e.clientX-r.left-touch.x,dy=e.clientY-r.top-touch.y;const d=Math.hypot(dx,dy),m=Math.min(d,40)/(d||1);touch.dx=dx*m/40;touch.dy=dy*m/40;$('joystick-thumb').style.transform=`translate(${dx*m}px,${dy*m}px)`;});
function releaseTouch(e){if(touch?.id===e.pointerId){touch=null;show('joystick',false);}}
canvas.addEventListener('pointerup',releaseTouch);canvas.addEventListener('pointercancel',releaseTouch);canvas.addEventListener('lostpointercapture',releaseTouch);
function requestSkill(){if(game?.status==='playing'&&!paused&&!helpOpen&&game.player.skillCooldown<=0){skillRequested=true;initAudio();}}
$('skill-button').onclick=requestSkill;
$('touch-skill').onclick=requestSkill;
$('touch-skill').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();requestSkill();});
// Keep keyboard focus inside whichever dialog is currently active.
document.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const dialog=[...document.querySelectorAll('.modal-layer')].reverse().find(x=>!x.classList.contains('hidden'));if(!dialog)return;const focusable=[...dialog.querySelectorAll('button:not(:disabled),select,a[href]')];if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}});

function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
function line(x1,y1,x2,y2,color,w=1){ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function diamond(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r*.66,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r*.66,y);ctx.closePath();ctx.fill();}
function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
function grass(x,y,s,seed){ctx.strokeStyle=['#5c765038','#67845744','#8b9c5f33'][Math.floor(seed*3)];ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x-4*s,y);ctx.quadraticCurveTo(x-6*s,y-5*s,x-9*s,y-7*s);ctx.moveTo(x,y);ctx.quadraticCurveTo(x-1*s,y-9*s,x+1*s,y-13*s);ctx.moveTo(x+4*s,y);ctx.quadraticCurveTo(x+5*s,y-6*s,x+9*s,y-7*s);ctx.stroke();}
function stone(x,y,s,seed){ellipse(x,y+3*s,14*s,7*s,'#10241950');ctx.fillStyle=seed>.5?'#59634e':'#475744';ctx.beginPath();ctx.moveTo(x-12*s,y+2*s);ctx.lineTo(x-8*s,y-8*s);ctx.lineTo(x+4*s,y-11*s);ctx.lineTo(x+12*s,y-3*s);ctx.lineTo(x+10*s,y+5*s);ctx.closePath();ctx.fill();ctx.fillStyle='#8a927454';ctx.beginPath();ctx.moveTo(x-8*s,y-8*s);ctx.lineTo(x+4*s,y-11*s);ctx.lineTo(x+6*s,y-4*s);ctx.lineTo(x-6*s,y-1*s);ctx.closePath();ctx.fill();grass(x+8*s,y+7*s,.7*s,seed);}
function flower(x,y,s,seed){line(x,y,x+2*s,y-9*s,'#8b966255',1);ellipse(x+2*s,y-10*s,2.5*s,2*s,seed>.5?'#d5d8a37a':'#9eaca67a');ellipse(x+4*s,y-7*s,1.8*s,1.8*s,'#e0daa877');}
function fern(x,y,s,seed){ctx.save();ctx.translate(x,y);ctx.rotate(seed*1.5-.75);for(let i=0;i<5;i++){const a=(i-2)*.36;ctx.save();ctx.rotate(a);line(0,0,0,-25*s,'#77996055',1.2);for(let k=0;k<5;k++){const yy=-5*s-k*4*s;ctx.fillStyle=k%2?'#537847aa':'#76935490';ctx.beginPath();ctx.ellipse(-3*s,yy,5*s,1.7*s,.5,0,TAU);ctx.ellipse(3*s,yy,5*s,1.7*s,-.5,0,TAU);ctx.fill();}ctx.restore();}ctx.restore();}
function tree(x,y,s,seed){ctx.save();ctx.translate(x,y);ellipse(12*s,20*s,50*s,32*s,'#0a1c1440');line(0,6*s,-3*s,-35*s,'#4d5137',12*s);for(let i=0;i<7;i++){const a=i*2.4,rr=(18+(i%3)*7)*s,cx=Math.cos(a)*rr,cy=-20*s+Math.sin(a)*rr*.6;ellipse(cx,cy,29*s,23*s,['#284631','#304e33','#375438'][i%3]);ellipse(cx-5*s,cy-8*s,18*s,7*s,'#72835110');}for(let i=0;i<7;i++)ellipse((hash(seed+i)*60-30)*s,(-45+hash(i,seed)*40)*s,3*s,1.3*s,'#95a57228');ctx.restore();}
// Light patches are generated from map cells, never from the player or viewport center.
function mapLightPatches(camX,camY,viewWidth=width,viewHeight=height){
  const spacing=1080,margin=850,patches=[];
  const left=Math.floor((camX-viewWidth/2-margin)/spacing),right=Math.ceil((camX+viewWidth/2+margin)/spacing);
  const top=Math.floor((camY-viewHeight/2-margin)/spacing),bottom=Math.ceil((camY+viewHeight/2+margin)/spacing);
  for(let gx=left;gx<=right;gx++)for(let gy=top;gy<=bottom;gy++){
    const seed=hash(gx+51,gy+93);
    const x=gx*spacing+160+hash(gx+7,gy+16)*460,y=gy*spacing+100+hash(gx+34,gy+2)*400;
    patches.push({id:`${gx},${gy}`,x,y,spread:80+seed*65,alpha:.04+seed*.025});
  }
  return patches;
}
function sunBeamGeometry(x,y,verticalSpan,nearWidth,farWidth){
  return {x,y,endX:x+SUN.x/SUN.y*verticalSpan,endY:y+verticalSpan,nearWidth,farWidth};
}
function sunBeamPath(beam){
  const {x,y,endX,endY,nearWidth,farWidth}=beam,nx=SUN.y,ny=-SUN.x;
  ctx.beginPath();ctx.moveTo(x-nx*nearWidth,y-ny*nearWidth);ctx.lineTo(x+nx*nearWidth,y+ny*nearWidth);
  ctx.lineTo(endX+nx*farWidth,endY+ny*farWidth);ctx.lineTo(endX-nx*farWidth,endY-ny*farWidth);ctx.closePath();
}
function drawMapLights(camX,camY){
  ctx.save();ctx.translate(width/2-camX,height/2-camY);
  for(const light of mapLightPatches(camX,camY)){
    const {x,y,spread,alpha}=light;
    const shape=sunBeamGeometry(x+165+spread*.24,y-520,840,spread*.24,spread*.65);
    glow(shape.x+(shape.endX-shape.x)*.8,shape.y+(shape.endY-shape.y)*.8,330,'#c7d98a12');
    const beam=ctx.createLinearGradient(shape.x,shape.y,shape.endX,shape.endY);
    beam.addColorStop(0,'#e3ebaf00');beam.addColorStop(.23,`rgba(225,237,172,${alpha})`);beam.addColorStop(.8,`rgba(225,237,172,${alpha*.72})`);beam.addColorStop(1,'#e3ebaf00');
    ctx.fillStyle=beam;sunBeamPath(shape);ctx.fill();
  }
  ctx.restore();
}
function background(camX,camY,intro){ctx.fillStyle='#2b4130';ctx.fillRect(0,0,width,height);const hX=intro?(width<760?.62:.73)*width:width*.5,hY=intro?(width<760?.71:.52)*height:height*.5;if(intro)glow(hX,hY,width*.6,'#76995b30');
  // A quiet patchwork of moss and pale leaves remains fixed in world space.
  const tile=140,offX=width/2-camX,offY=height/2-camY;
  const sx=Math.floor(-offX/tile)-1,sy=Math.floor(-offY/tile)-1,ex=Math.ceil((width-offX)/tile)+1,ey=Math.ceil((height-offY)/tile)+1;
  for(let tx=sx;tx<ex;tx++)for(let ty=sy;ty<ey;ty++){const seed=hash(tx,ty),x=tx*tile+offX,y=ty*tile+offY;ellipse(x+seed*90,y+hash(ty,tx)*100,55+seed*40,27+seed*26,'#112e1710');for(let i=0;i<6;i++){let ax=x+hash(tx*7+i,ty)*tile,ay=y+hash(ty*9+i,tx)*tile;grass(ax,ay,.6+hash(i+tx,ty)*.6,hash(tx,ty+i));}if(seed>.83)stone(x+55,y+45,.5+seed*.6,seed);else if(seed>.61)fern(x+30,y+80,.7,seed);if(seed<.4)for(let i=0;i<3;i++)flower(x+35+i*9,y+100+hash(i,tx)*10,.7,seed);for(let i=0;i<5;i++){ctx.fillStyle=i%2?'#89977425':'#142d233a';ctx.fillRect(x+hash(i+tx,ty+7)*140,y+hash(i+ty,tx+6)*140,2+i%2,1);}}
  // Clusters are decorative ground cover; the central fighting space stays readable.
  if(intro){tree(width*.93,height*.14,1.7,.7);tree(width*.99,height*.48,1.2,.3);tree(width*.85,height*.97,1.5,.5);fern(width*.78,height*.88,2,.4);fern(width*.97,height*.8,1.7,.3);stone(hX-100,hY+72,1.5,.7);stone(hX+95,hY-96,1.3,.4);}
  if(intro){const pad=Math.max(40,width*.08);ctx.save();ctx.globalAlpha=.075;ctx.fillStyle='#dee8a0';sunBeamPath(sunBeamGeometry(width*.74-SUN.x/SUN.y*pad,-pad,height+pad*2,width*.04,width*.07));ctx.fill();ctx.restore();}
  else drawMapLights(camX,camY);
}
function runeCircle(x,y,r,t,alpha=.5){ctx.save();ctx.translate(x,y);ctx.scale(1,.6);ctx.rotate(t*.11);ctx.globalAlpha=alpha;ctx.strokeStyle='#c4e699';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();ctx.setLineDash([2,8]);ctx.beginPath();ctx.arc(0,0,r-10,0,TAU);ctx.stroke();ctx.setLineDash([]);for(let i=0;i<8;i++){const a=i*TAU/8;ctx.save();ctx.rotate(a);ctx.translate(r,0);diamond(0,0,4,'#cced9e');line(-6,0,6,0,'#c4e699',1);ctx.restore();}ctx.restore();}
const ACTOR_VISUALS={
  player:{radius:15,foot:18,halfWidth:29,top:35,shadowWidth:14,shadowLength:24},
  slime:{radius:16,foot:14,halfWidth:22,top:20,shadowWidth:14,shadowLength:17},
  bat:{radius:11,foot:20,halfWidth:31,top:27,shadowWidth:18,shadowLength:16},
  beetle:{radius:18,foot:18,halfWidth:25,top:22,shadowWidth:14,shadowLength:18},
  brute:{radius:26,foot:23,halfWidth:33,top:32,shadowWidth:23,shadowLength:27},
  boar:{radius:22,foot:20,halfWidth:36,top:29,shadowWidth:23,shadowLength:25},
  spore:{radius:20,foot:18,halfWidth:27,top:34,shadowWidth:18,shadowLength:21},
  boss:{radius:49,foot:41,halfWidth:60,top:68,shadowWidth:39,shadowLength:44}
};
function actorVisual(entity,isPlayer=false,scaleOverride){
  const type=isPlayer?'player':entity.type,shape=ACTOR_VISUALS[type]||ACTOR_VISUALS.slime;
  const scale=scaleOverride??(isPlayer?1.1:entity.r/shape.radius);
  return {x:entity.x,y:entity.y,type,scale,footY:entity.y+shape.foot*scale,orderId:isPlayer?-1:(entity.id||0),entity,isPlayer,shape};
}
function sortActors(actors){return actors.sort((a,b)=>a.footY-b.footY||a.orderId-b.orderId||a.x-b.x||a.type.localeCompare(b.type));}
function actorInView(actor,offsetX=0,offsetY=0){
  const {x,y,scale,footY,shape}=actor,cx=x+offsetX,cy=y+offsetY;
  // Include the entire projected shadow, not just the actor's collision radius.
  return cx+(shape.halfWidth+5)*scale>=0&&cx-(shape.halfWidth+shape.shadowLength*.45+5)*scale<=width
    &&cy-(shape.top+5)*scale<=height&&footY+offsetY+(shape.shadowLength+shape.shadowWidth*.4+5)*scale>=0;
}
function drawActorShadows(actors,offsetX=0,offsetY=0,terrain=[],adventureProps=[]){
  if(width<=0||height<=0)return;
  const maskWidth=Math.max(1,Math.ceil(width*.5)),maskHeight=Math.max(1,Math.ceil(height*.5));
  if(actorShadowCanvas.width!==maskWidth||actorShadowCanvas.height!==maskHeight){actorShadowCanvas.width=maskWidth;actorShadowCanvas.height=maskHeight;}
  const mask=actorShadowCtx;mask.setTransform(1,0,0,1,0,0);mask.clearRect(0,0,maskWidth,maskHeight);
  mask.setTransform(maskWidth/width,0,0,maskHeight/height,0,0);mask.translate(offsetX,offsetY);
  mask.fillStyle='#10271d';mask.globalCompositeOperation='source-over';
  // A single nonzero fill per group forms a union. Hundreds of overlapping
  // shapes therefore stay as light as one shadow, including flying enemies.
  for(const flying of [true,false]){
    mask.globalAlpha=flying?.55:1;mask.beginPath();
    for(const actor of actors){
      if((actor.type==='bat')!==flying)continue;
      const {x,footY,scale,shape}=actor,length=shape.shadowLength*scale;
      const offset=length*.39,cx=x+SUN.x*offset,cy=footY+SUN.y*offset,rx=shape.shadowWidth*scale,ry=length*.63;
      // Sunlight falls from the upper right; all projections point down-left.
      const rotation=SUN_ANGLE;mask.moveTo(cx+rx*Math.cos(rotation),cy+rx*Math.sin(rotation));
      mask.ellipse(cx,cy,rx,ry,rotation,0,TAU);mask.closePath();
    }
    if(!flying){drawTerrainShadowPaths(mask,terrain);drawAdventureShadowPaths(mask,adventureProps);}
    mask.fill('nonzero');
  }
  mask.globalAlpha=1;
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=.3;ctx.globalCompositeOperation='source-over';
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(actorShadowCanvas,0,0,maskWidth,maskHeight,0,0,width,height);ctx.restore();
}
function drawActor(actor,moving=false){const e=actor.entity;if(actor.isPlayer)player(actor.x,actor.y,clock,actor.scale,e.facing||0,moving,e.invuln||0);else enemy(e,clock);}
function drawActors(actors,moving=false){for(const actor of sortActors(actors))drawActor(actor,moving);}
// Solid terrain shares one world-space source with movement collision. The
// old decorative trees are retained only on the title screen.
function terrainInView(camX,camY){
  return game?.terrain?.query(camX-width/2-180,camY-height/2-180,camX+width/2+180,camY+height/2+180)||[];
}
function sceneDrawList(actors,props,adventureProps=[]){
  const items=actors.map(actor=>({kind:'actor',sortY:actor.footY,actor}));
  for(const prop of props)items.push({kind:'terrain',sortY:prop.sortY??prop.y,prop});
  for(const prop of adventureProps)items.push({kind:'adventure',sortY:prop.sortY??prop.y,prop});
  return items.sort((a,b)=>a.sortY-b.sortY||(a.kind===b.kind?(a.kind==='actor'?a.actor.orderId-b.actor.orderId:String(a.prop.id).localeCompare(String(b.prop.id))):({terrain:0,adventure:1,actor:2}[a.kind]-{terrain:0,adventure:1,actor:2}[b.kind])));
}
function drawScene(actors,props,mainPlayer,moving,adventureProps=[]){
  for(const item of sceneDrawList(actors,props,adventureProps)){
    if(item.kind==='terrain')drawTerrain(item.prop,mainPlayer);else if(item.kind==='adventure')drawAdventureProp(item.prop);else drawActor(item.actor,moving);
  }
}
function terrainCapsulePath(target,halfLength,radius){
  target.moveTo(-halfLength,-radius);target.lineTo(halfLength,-radius);
  target.arc(halfLength,0,radius,-Math.PI/2,Math.PI/2);
  target.lineTo(-halfLength,radius);target.arc(-halfLength,0,radius,Math.PI/2,Math.PI*1.5);target.closePath();
}
function drawTerrainShadowPaths(mask,props){
  for(const prop of props){
    const {x,y,r,type,scale=1}=prop;
    if(type==='log'){
      const offset=r*.7,angle=prop.angle||0,dx=Math.cos(angle),dy=Math.sin(angle),radius=r*1.08;
      const cx=x+SUN.x*offset,cy=y+SUN.y*offset,ax=cx-dx*prop.halfLength,ay=cy-dy*prop.halfLength,bx=cx+dx*prop.halfLength,by=cy+dy*prop.halfLength;
      mask.moveTo(ax+dy*radius,ay-dx*radius);mask.lineTo(bx+dy*radius,by-dx*radius);
      mask.arc(bx,by,radius,angle-Math.PI/2,angle+Math.PI/2);mask.lineTo(ax-dy*radius,ay+dx*radius);
      mask.arc(ax,ay,radius,angle+Math.PI/2,angle+Math.PI*1.5);mask.closePath();
    }else{
      const offset=type==='tree'?35*scale:r*.48,cx=x+SUN.x*offset,cy=y+SUN.y*offset;
      const rx=type==='tree'?39*scale:r*.88,ry=type==='tree'?51*scale:r*1.07;
      mask.moveTo(cx+rx*Math.cos(SUN_ANGLE),cy+rx*Math.sin(SUN_ANGLE));mask.ellipse(cx,cy,rx,ry,SUN_ANGLE,0,TAU);mask.closePath();
    }
  }
}
function treeCanopyOpacity(prop,mainPlayer){
  if(!mainPlayer)return 1;
  const scale=prop.scale||1,playerFoot=mainPlayer.y+ACTOR_VISUALS.player.foot*1.1;
  if(playerFoot>=(prop.sortY??prop.y))return 1;
  const distance=Math.hypot((mainPlayer.x-prop.x)/(68*scale+14),(mainPlayer.y-7-(prop.y-67*scale))/(46*scale+23));
  return 1-.65*clamp((1.12-distance)/.38,0,1);
}
const terrainCanopyCache=new Map();
function treeCanopyImage(seed){
  if(terrainCanopyCache.has(seed))return terrainCanopyCache.get(seed);
  const bitmap=document.createElement('canvas');bitmap.width=256;bitmap.height=256;
  const ink=bitmap.getContext('2d');ink.setTransform(2,0,0,2,128,248);
  const oval=(x,y,rx,ry,color)=>{ink.fillStyle=color;ink.beginPath();ink.ellipse(x,y,rx,ry,0,0,TAU);ink.fill();};
  const clusters=[[-30,-57,29,25],[-7,-47,34,24],[25,-60,30,27],[-27,-83,28,24],[3,-86,35,29],[29,-85,26,23],[0,-68,38,30]];
  for(let i=0;i<clusters.length;i++){const [x,y,rx,ry]=clusters[i];oval(x,y,rx,ry,['#24462f','#2f5033','#385b37','#345638'][i%4]);}
  for(let i=0;i<11;i++){
    const x=(hash(seed+13,i)-.5)*88,y=-91+hash(seed+27,i)*47;
    oval(x+3,y-4,10+hash(seed,i)*7,5+hash(i,seed)*4,i%3?'#64805225':'#91a56629');
    ink.strokeStyle='#163b2327';ink.lineWidth=1.2;ink.beginPath();ink.moveTo(x-4,y+4);ink.lineTo(x+4,y+2);ink.stroke();
  }
  oval(20,-98,14,5,'#a4b27a1c');
  if(terrainCanopyCache.size>=24)terrainCanopyCache.delete(terrainCanopyCache.keys().next().value);
  terrainCanopyCache.set(seed,bitmap);return bitmap;
}
function drawTerrainTree(prop,mainPlayer){
  const scale=prop.scale||1,r=prop.r/scale,seed=prop.seed||0;
  ctx.save();ctx.translate(prop.x,prop.y);ctx.scale(scale,scale);
  // The solid root crown fits the circular collision base; foliage is overhead.
  ellipse(0,1,r*.92,r*.72,'#273626');ctx.fillStyle='#666345';ctx.strokeStyle='#34422e';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-9,-12);ctx.lineTo(-r*.9,-r*.28);ctx.lineTo(-r*.83,r*.17);ctx.lineTo(-12,7);ctx.lineTo(-r*.4,r*.92);ctx.lineTo(-r*.1,r*.9);ctx.lineTo(3,11);ctx.lineTo(r*.64,r*.74);ctx.lineTo(r*.8,r*.55);ctx.lineTo(12,4);ctx.lineTo(r*.98,-r*.08);ctx.lineTo(r*.87,-r*.28);ctx.lineTo(8,-14);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#736647';ctx.beginPath();ctx.moveTo(-11,8);ctx.quadraticCurveTo(-8,-21,-10,-62);ctx.lineTo(5,-72);ctx.quadraticCurveTo(5,-22,10,8);ctx.quadraticCurveTo(0,16,-11,8);ctx.fill();ctx.stroke();
  line(-4,-50,-3,4,'#464c34',2);line(2,-52,4,1,'#9a86582e',3);line(-8,-34,-28,-58,'#626044',7);line(1,-44,24,-65,'#796849',7);
  line(-7,2,-r*.64,r*.45,'#8b79524d',2);line(7,5,r*.52,r*.48,'#a18b593d',1.5);
  // Fade the complete canopy once; overlapping leaf clusters stay equally clear.
  ctx.save();ctx.globalAlpha=treeCanopyOpacity(prop,mainPlayer);ctx.drawImage(treeCanopyImage(seed),-64,-124,128,128);ctx.restore();
  for(let i=0;i<3;i++)grass((i-1)*r*.6,r*.65,.55,hash(seed,i));ctx.restore();
}
function drawTerrainRock(prop){
  const {r}=prop,seed=prop.seed||0;ctx.save();ctx.translate(prop.x,prop.y);ctx.scale(r,r);
  ctx.lineJoin='round';ctx.lineWidth=1.8/r;ctx.strokeStyle='#354438';
  ctx.fillStyle='#677160';ctx.beginPath();ctx.moveTo(-.94,.1);ctx.lineTo(-.78,-.89);ctx.lineTo(-.13,-1.5);ctx.lineTo(.61,-1.19);ctx.lineTo(.98,-.31);ctx.lineTo(.89,.53);ctx.lineTo(.31,.96);ctx.lineTo(-.54,.83);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#919681';ctx.beginPath();ctx.moveTo(-.78,-.89);ctx.lineTo(-.13,-1.5);ctx.lineTo(.61,-1.19);ctx.lineTo(.98,-.31);ctx.lineTo(.25,-.51);ctx.lineTo(-.25,-.39);ctx.closePath();ctx.fill();
  ctx.fillStyle='#77816c';ctx.beginPath();ctx.moveTo(.25,-.51);ctx.lineTo(.98,-.31);ctx.lineTo(.89,.53);ctx.lineTo(.31,.96);ctx.lineTo(.14,.22);ctx.closePath();ctx.fill();
  ctx.fillStyle='#4f5f50';ctx.beginPath();ctx.moveTo(-.94,.1);ctx.lineTo(-.78,-.89);ctx.lineTo(-.25,-.39);ctx.lineTo(.14,.22);ctx.lineTo(.31,.96);ctx.lineTo(-.54,.83);ctx.closePath();ctx.fill();
  line(-.13,-1.5,.2,-.92,'#bcc0a245',1.4/r);line(.2,-.92,.6,-1.18,'#bbc3a645',1.2/r);
  line(-.2,-.36,-.43,.06,'#374f4038',1.8/r);line(-.43,.06,-.27,.3,'#374f4038',1.8/r);
  for(let i=0;i<5;i++){
    const x=-.52+hash(seed+i,4)*.75,y=-.88+hash(seed+i,8)*.38;
    ellipse(x,y,.17+hash(i,seed)*.09,.065+hash(seed,i)*.06,['#79965b','#6e8c52','#8fa36d'][i%3]);
  }
  ellipse(-.55,.69,.3,.11,'#5a77434d');ctx.restore();grass(prop.x-r*.66,prop.y+r*.73,.7,seed);
}
function drawTerrainLog(prop){
  const {r,halfLength:length}=prop,seed=prop.seed||0;ctx.save();ctx.translate(prop.x,prop.y);ctx.rotate(prop.angle||0);
  ctx.lineJoin='round';ctx.lineCap='round';ctx.fillStyle='#68573b';ctx.strokeStyle='#33402d';ctx.lineWidth=2;
  ctx.beginPath();terrainCapsulePath(ctx,length,r);ctx.fill();ctx.stroke();
  ctx.fillStyle='#89724a';ctx.beginPath();ctx.moveTo(-length,-r*.86);ctx.quadraticCurveTo(0,-r*1.05,length,-r*.85);ctx.lineTo(length,-r*.22);ctx.quadraticCurveTo(0,-r*.46,-length,-r*.16);ctx.closePath();ctx.fill();
  ctx.fillStyle='#4d4a32';ctx.beginPath();ctx.moveTo(-length,r*.47);ctx.quadraticCurveTo(0,r*.7,length,r*.41);ctx.lineTo(length,r*.9);ctx.lineTo(-length,r*.9);ctx.closePath();ctx.fill();
  for(let i=0;i<5;i++){
    const yy=(-.7+i*.33)*r;ctx.strokeStyle=i%2?'#a188554c':'#3a412d66';ctx.lineWidth=i%2?1.2:1.8;
    ctx.beginPath();ctx.moveTo(-length+7,yy);ctx.lineTo(-length*.3,yy+(hash(seed,i)-.5)*r*.35);ctx.lineTo(length*.3,yy+(hash(i,seed)-.5)*r*.3);ctx.lineTo(length-6,yy);ctx.stroke();
  }
  // Exposed cut ends, growth rings and a snapped branch distinguish fallen wood.
  for(const side of [-1,1]){
    ellipse(side*length,0,r*.74,r*.93,side>0?'#bc9c65':'#9b8155');ctx.strokeStyle='#6b613e';ctx.lineWidth=1.5;ctx.stroke();
    ctx.strokeStyle='#856f454d';ctx.lineWidth=1;for(const fraction of [.36,.64]){ctx.beginPath();ctx.ellipse(side*length,0,r*.74*fraction,r*.93*fraction,0,0,TAU);ctx.stroke();}
    line(side*length,0,side*length+r*.36,r*.47,'#73624170',1.1);
  }
  line(-length*.28,-r*.66,-length*.07,-r*1.26,'#655739',r*.31);ellipse(-length*.07,-r*1.26,r*.16,r*.12,'#b39a62');
  ellipse(length*.18,-r*.55,length*.27,r*.21,'#6f864a');ellipse(length*.09,-r*.62,length*.16,r*.12,'#97a96366');ctx.restore();
}
function drawTerrain(prop,mainPlayer){
  if(prop.type==='tree')drawTerrainTree(prop,mainPlayer);
  else if(prop.type==='rock')drawTerrainRock(prop);
  else if(prop.type==='log')drawTerrainLog(prop);
}
function adventureSceneProps(camX,camY){
  const adventure=game?.adventure;if(!adventure)return[];
  const visible=prop=>Math.abs(prop.x-camX)<width/2+70&&Math.abs(prop.y-camY)<height/2+80;
  const props=(adventure.props||[]).filter(prop=>prop.hp>0&&visible(prop));
  if(adventure.treasure&&visible(adventure.treasure))props.push({...adventure.treasure,type:'treasure'});
  return props;
}
function drawAdventureShadowPaths(mask,props){
  for(const prop of props){const large=prop.type==='treasure',offset=large?14:10,rx=large?25:19,ry=large?21:16,cx=prop.x+SUN.x*offset,cy=prop.y+SUN.y*offset;
    mask.moveTo(cx+rx*Math.cos(SUN_ANGLE),cy+rx*Math.sin(SUN_ANGLE));mask.ellipse(cx,cy,rx,ry,SUN_ANGLE,0,TAU);mask.closePath();}
}
function drawAdventureProp(prop){
  ctx.save();ctx.translate(prop.x,prop.y);ctx.lineJoin='round';ctx.lineWidth=1.5;
  if(prop.type==='supply'){
    ctx.fillStyle=prop.hit>0?'#dcc58f':'#967548';ctx.strokeStyle='#4d4c32';ctx.beginPath();ctx.moveTo(-17,-24);ctx.lineTo(17,-24);ctx.lineTo(17,0);ctx.lineTo(-17,0);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#b19058';ctx.beginPath();ctx.moveTo(-17,-24);ctx.lineTo(-10,-32);ctx.lineTo(24,-32);ctx.lineTo(17,-24);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#77633e';ctx.beginPath();ctx.moveTo(17,-24);ctx.lineTo(24,-32);ctx.lineTo(24,-8);ctx.lineTo(17,0);ctx.closePath();ctx.fill();ctx.stroke();
    for(const x of [-6,6])line(x,-23,x,-1,'#625437',1.2);
    line(-13,-20,13,-4,'#bd9c65',4);line(-13,-4,13,-20,'#bd9c65',4);
    for(const x of [-13,13])for(const y of [-20,-4])ellipse(x,y,1,1,'#4b4931');
    if(prop.hp<prop.maxHp){ctx.fillStyle='#1b2c20';ctx.fillRect(-17,-39,34,3);ctx.fillStyle='#d9bc77';ctx.fillRect(-17,-39,34*Math.max(0,prop.hp/prop.maxHp),3);}
  }else{
    const opened=prop.state==='opened',unlocked=prop.state==='unlocked',active=prop.state==='active';
    if(unlocked){ellipse(0,0,33,17,'#e8c57218');ellipse(0,0,27,12,'#ffe2a718');}
    ctx.fillStyle='#81653e';ctx.strokeStyle='#4d4b2f';ctx.beginPath();ctx.moveTo(-24,-21);ctx.lineTo(22,-21);ctx.lineTo(22,0);ctx.lineTo(-24,0);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=opened?'#343c2b':'#a3834c';ctx.beginPath();ctx.moveTo(-24,-21);ctx.quadraticCurveTo(-25,-37,-14,-38);ctx.lineTo(12,-38);ctx.quadraticCurveTo(23,-36,22,-21);ctx.closePath();ctx.fill();ctx.stroke();
    if(opened){ctx.fillStyle='#a48852';ctx.beginPath();ctx.moveTo(-23,-29);ctx.lineTo(-19,-49);ctx.lineTo(20,-48);ctx.lineTo(22,-30);ctx.closePath();ctx.fill();ctx.stroke();line(-14,-44,14,-44,'#d7bc77',2);}
    for(const x of [-16,14])line(x,opened?-46:-34,x,-2,'#ccad65',3.5);line(-22,-3,20,-3,'#b89550',2);
    if(!opened){ctx.fillStyle=unlocked?'#f5db91':'#bda96d';ctx.fillRect(-5,-23,9,12);diamond(-.5,-17,2.3,unlocked?'#fff6c7':'#49503a');}
    if(active){ctx.strokeStyle='#dcc380';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-20,-27);ctx.lineTo(18,-7);ctx.moveTo(18,-27);ctx.lineTo(-20,-7);ctx.stroke();}
    if(!opened){ctx.font='600 9px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle=unlocked?'#eddda0':'#c2bb8f';ctx.fillText(unlocked?'可领取':active?'击败守卫':'守卫宝箱',0,-47);}
  }
  ctx.restore();
}
function drawAdventurePickups(){
  for(const item of game.adventure?.pickups||[]){
    if(Math.abs(item.x-game.player.x)>width/2+30||Math.abs(item.y-game.player.y)>height/2+35)continue;
    const bob=reduced?0:Math.sin(clock*2.2+hash(item.x,item.y)*TAU)*1.6,colors={herb:'#b9dc91',magnet:'#c2b5eb',fury:'#efc57f'},color=colors[item.type]||'#d5ddaf';
    ctx.save();ctx.translate(item.x,item.y);ellipse(0,2,9,4,'#12271944');ellipse(0,-9+bob,17,17,`${color}10`);ellipse(0,-9+bob,12,12,`${color}16`);ctx.translate(0,-9+bob);
    if(item.type==='herb'){line(0,7,0,-6,'#aacb7c',2);ctx.save();ctx.rotate(-.55);ellipse(-4,-2,4,7,'#b8d98c');ctx.restore();ctx.save();ctx.rotate(.65);ellipse(4,-1,4,6,'#89b96d');ctx.restore();line(-2,6,3,6,'#e2e9b8',1.5);}
    else if(item.type==='magnet'){ctx.strokeStyle='#bcb4e9';ctx.lineWidth=4.6;ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(-6,1);ctx.arc(0,1,6,Math.PI,0,true);ctx.lineTo(6,-6);ctx.stroke();line(-6,-6,-6,-2,'#e8dfad',4.6);line(6,-6,6,-2,'#e8dfad',4.6);}
    else{ctx.fillStyle='#f1cb84';ctx.beginPath();ctx.moveTo(3,-10);ctx.lineTo(-7,2);ctx.lineTo(-1,2);ctx.lineTo(-3,10);ctx.lineTo(8,-3);ctx.lineTo(2,-3);ctx.closePath();ctx.fill();}
    ctx.restore();
  }
}
function drawEnemyBullets(){
  for(const bullet of game.enemyBullets||[]){
    if(Math.abs(bullet.x-game.player.x)>width/2+24||Math.abs(bullet.y-game.player.y)>height/2+24)continue;
    const radius=bullet.r||6,speed=Math.hypot(bullet.vx,bullet.vy)||1;if(bullet.type==='bloom'){ctx.save();ctx.strokeStyle='#f2c9e9';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(bullet.x,bullet.y,radius+3,0,TAU);ctx.stroke();ctx.restore();}
    line(bullet.x-bullet.vx/speed*13,bullet.y-bullet.vy/speed*13,bullet.x,bullet.y,'#b998d550',3);
    ellipse(bullet.x,bullet.y,radius*1.7,radius*1.7,'#c39bdb18');ellipse(bullet.x,bullet.y,radius,radius,'#a677bb');ellipse(bullet.x-1,bullet.y-1,radius*.64,radius*.64,'#e0b8ed');ellipse(bullet.x-2,bullet.y-2,1.4,1.4,'#fff0df');
  }
}
function drawEnemyTelegraphs(){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(const enemy of game.enemies){
    const charge=enemy.charge;if(enemy.type!=='boar'||charge?.phase!=='windup')continue;
    const progress=clamp(1-charge.life/charge.maxLife,0,1),r=enemy.r,length=charge.length||256;
    ctx.save();ctx.translate(charge.startX,charge.startY);ctx.rotate(Math.atan2(charge.dy,charge.dx));ctx.translate(length/2,0);
    ctx.beginPath();terrainCapsulePath(ctx,length/2,r);ctx.fillStyle='#d9825533';ctx.fill();ctx.strokeStyle='#dfb278';ctx.lineWidth=1.8;ctx.globalAlpha=.75;ctx.stroke();
    ctx.globalAlpha=.9;ctx.strokeStyle='#f0cf8b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-length/2,0);ctx.lineTo(-length/2+length*progress,0);ctx.stroke();
    for(let i=1;i<=3;i++){const x=-length/2+length*i/4;ctx.beginPath();ctx.moveTo(x-7,-6);ctx.lineTo(x,0);ctx.lineTo(x-7,6);ctx.stroke();}ctx.restore();
  }
  ctx.restore();
}
// World art uses roughly 32 units per metre; this is only a distance label.
function edgePointer(target,reserved=null){
  const dx=target.x-game.player.x,dy=target.y-game.player.y;
  if(Math.abs(dx)<=width/2-70&&Math.abs(dy)<=height/2-100)return null;
  const angle=Math.atan2(dy,dx),cx=Math.cos(angle),cy=Math.sin(angle);
  let edge=Math.min((width/2-38)/Math.max(.01,Math.abs(cx)),(height/2-100)/Math.max(.01,Math.abs(cy)));
  const position=distance=>{let x=width/2+cx*distance,y=height/2+cy*distance;if((coarse||width<650)&&x>width-125&&y>height-185)y=Math.max(100,height-190);return{x,y};};
  let {x,y}=position(edge);
  if(reserved&&Math.hypot(x-reserved.x,y-reserved.y)<64){edge=Math.max(25,edge-67);({x,y}=position(edge));}
  return{x,y,angle,distance:Math.hypot(dx,dy)};
}
function drawObjectivePointers(){
  const boss=game.enemies.find(enemy=>enemy.type==='boss'),bossPointer=boss?edgePointer(boss):null;
  if(bossPointer){ctx.save();ctx.translate(bossPointer.x,bossPointer.y);ctx.rotate(bossPointer.angle);ctx.fillStyle=boss.bossKind==='bloom'?'#ddb0e6':'#ebbd91';ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,-6);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.restore();}
  // A single optional target keeps competing chest / encounter markers legible.
  const encounter=game.encounters?.active,treasure=game.adventure?.treasure;
  const target=encounter||(treasure?.state!=='opened'?treasure:null);if(!target)return;
  const pointer=edgePointer(target,bossPointer);if(!pointer)return;
  const hunt=encounter?.type==='hunt',color=hunt?'#bbd6b0':'#e8cf83',label=encounter?(hunt?'猎区':'宝物精'):'宝箱';
  ctx.save();ctx.translate(pointer.x,pointer.y);ctx.save();ctx.rotate(pointer.angle);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,-5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
  const textX=pointer.x<width/2?8:-8;ctx.textAlign=pointer.x<width/2?'left':'right';ctx.font='600 9px ui-monospace,monospace';ctx.fillStyle=color;ctx.fillText(`${label} · ${Math.max(1,Math.round(pointer.distance/32))} m`,textX,18);ctx.restore();
}
function drawEncounterGround(){
  const active=game.encounters?.active;if(!active)return;
  ctx.save();
  if(active.type==='hunt'){
    const {x,y,r,goal,progress}=active;ctx.fillStyle='#a6c98e08';ctx.strokeStyle='#bfce9270';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.stroke();
    ctx.setLineDash([5,10]);ctx.lineWidth=1;ctx.strokeStyle='#c7db9e55';ctx.beginPath();ctx.arc(x,y,r-7,0,TAU);ctx.stroke();ctx.setLineDash([]);
    for(let i=0;i<goal;i++){const angle=-Math.PI/2+i*TAU/goal,dx=Math.cos(angle),dy=Math.sin(angle);diamond(x+dx*r,y+dy*r,4,i<progress?'#e2d999':'#788e6577');}
    ctx.font='600 10px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#c5d6a7';ctx.fillText('林间猎区',x,y-r+26);
    ctx.strokeStyle='#c5d6a72f';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,17,0,TAU);ctx.stroke();line(x-6,y,x+6,y,'#c5d6a744',1);line(x,y-6,x,y+6,'#c5d6a744',1);
  }else{
    const x=active.x,y=active.y;ctx.strokeStyle='#e4c57088';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y,25,13,0,0,TAU);ctx.stroke();
  }
  ctx.restore();
}
function player(x,y,t,scale=1,facing=0,moving=false,invuln=0){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);if(invuln>0&&Math.floor(t*18)%2===0)ctx.globalAlpha=.65;const b=moving?Math.sin(t*17)*1.3:Math.sin(t*2)*.65;ctx.translate(0,b);const flip=Math.cos(facing)<-.1?-1:1;ctx.scale(flip,1);
  // Cloak, boots, soft hood and the little lantern make a readable silhouette.
  ctx.strokeStyle='#253c2a';ctx.lineWidth=1.6;ctx.fillStyle='#567b49';ctx.beginPath();ctx.moveTo(-10,-4);ctx.quadraticCurveTo(-17,6,-16,15);ctx.quadraticCurveTo(0,21,15,14);ctx.lineTo(9,-7);ctx.closePath();ctx.fill();ctx.stroke();
  ellipse(-6+(moving?Math.sin(t*17)*2:0),15,4.2,3.6,'#383e2b');ellipse(6-(moving?Math.sin(t*17)*2:0),15,4.2,3.6,'#383e2b');ctx.fillStyle='#adc19a';ctx.beginPath();ctx.moveTo(-7,-6);ctx.lineTo(8,-6);ctx.lineTo(10,12);ctx.quadraticCurveTo(0,16,-9,11);ctx.closePath();ctx.fill();ctx.fillStyle='#e4dfb8';ctx.beginPath();ctx.moveTo(-14,-8);ctx.quadraticCurveTo(-17,-26,0,-32);ctx.quadraticCurveTo(17,-28,16,-8);ctx.quadraticCurveTo(10,1,-12,-2);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#32452f';ctx.beginPath();ctx.ellipse(2,-12,10,9,0,0,TAU);ctx.fill();ellipse(-2,-12,1.5,2,'#ecf6c8');ellipse(6,-12,1.5,2,'#ecf6c8');ctx.strokeStyle='#b5ab82';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-13,-11);ctx.quadraticCurveTo(-7,-27,3,-28);ctx.stroke();
  ctx.fillStyle='#70964f';ctx.beginPath();ctx.moveTo(-12,-2);ctx.lineTo(11,-3);ctx.lineTo(9,3);ctx.lineTo(-11,4);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-8,1);ctx.quadraticCurveTo(-18,4,-24,1+Math.sin(t*3)*2);ctx.lineTo(-21,8);ctx.quadraticCurveTo(-13,9,-8,5);ctx.fill();line(17,-14,17,15,'#776346',2.8);ellipse(17,-16,4,5,'#d0dc9f');glow(17,-16,12,'#cceea34a');ellipse(17,3,3,3,'#d8d1a7');line(-6,8,8,8,'#788a5b',2);diamond(1,8,2.2,'#e2c276');ctx.restore();}
function movingLeg(t,id,side){return Math.sin(t*12+(id||0)+side)*1.6;}
function enemy(e,t){const {x,y,r,type}=e;ctx.save();ctx.translate(x,y);const s=r/(ACTOR_VISUALS[type]?.radius||16);ctx.scale(s,s);const bob=Math.sin(t*(type==='bat'?14:5)+(e.id||0))*(type==='bat'?3:1.5);ctx.translate(0,bob);const hit=e.hit>0;
  if(type==='slime'){ctx.fillStyle=hit?'#e6f3ba':'#8baf61';ctx.strokeStyle='#425b3a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-17,9);ctx.bezierCurveTo(-21,-3,-10,-16,0,-17);ctx.bezierCurveTo(12,-17,20,-3,17,10);ctx.quadraticCurveTo(3,16,-17,9);ctx.fill();ctx.stroke();ellipse(-5,-8,6,3,hit?'#fff7d5':'#c4d98980');ellipse(-5,0,2,3,'#354933');ellipse(5,0,2,3,'#354933');line(-2,6,2,6,'#466041',1.1);ellipse(10,6,3,1.5,'#dce59066');}
  else if(type==='bat'){const wing=Math.sin(t*18+(e.id||0))*7;ctx.fillStyle=hit?'#f5e6d9':'#a8a5b6';ctx.strokeStyle='#525567';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-5,-3);ctx.lineTo(-28,-13+wing);ctx.lineTo(-22,5+wing*.2);ctx.lineTo(-13,3);ctx.lineTo(-5,9);ctx.lineTo(5,9);ctx.lineTo(13,3);ctx.lineTo(22,5+wing*.2);ctx.lineTo(28,-13+wing);ctx.lineTo(5,-3);ctx.closePath();ctx.fill();ctx.stroke();ellipse(0,0,8,11,hit?'#e9e4e4':'#6e7180');ctx.fillStyle='#6e7180';ctx.beginPath();ctx.moveTo(-7,-6);ctx.lineTo(-6,-15);ctx.lineTo(-1,-8);ctx.lineTo(5,-15);ctx.lineTo(7,-5);ctx.fill();ellipse(-3,-1,1.5,2,'#eed79f');ellipse(3,-1,1.5,2,'#eed79f');}
  else if(type==='beetle'){for(let i=-1;i<=1;i++){const a=Math.sin(t*12+i)*3;line(-10,i*6,-21,i*9+a,'#7b6145',2.5);line(10,i*6,21,i*9-a,'#7b6145',2.5);}ellipse(0,0,15,18,hit?'#e9d9ae':'#b18956');ctx.strokeStyle='#68593d';ctx.lineWidth=1.5;ctx.stroke();ellipse(-5,-5,6,10,hit?'#f5e8c6':'#c8a46c');line(0,-16,0,15,'#776446',2);ellipse(0,-13,10,7,'#777b49');ellipse(-4,-15,1.6,2,'#e5d998');ellipse(4,-15,1.6,2,'#e5d998');}
  else if(type==='brute'){ellipse(-9,19,9,5,'#595a38');ellipse(9,19,9,5,'#595a38');ctx.fillStyle=hit?'#f3e8bb':'#c6bd8e';ctx.beginPath();ctx.moveTo(-16,-6);ctx.lineTo(15,-6);ctx.quadraticCurveTo(12,8,19,16);ctx.quadraticCurveTo(0,23,-19,16);ctx.closePath();ctx.fill();ellipse(0,-9,30,19,hit?'#ffead8':'#b9825c');ellipse(-9,-17,7,4,'#e5c594');ellipse(12,-12,5,3,'#e5c594');ellipse(-15,-4,4,2,'#e5c594');ellipse(-6,6,2,3,'#625c40');ellipse(6,6,2,3,'#625c40');}
  else if(type==='boar'){
    const direction=e.charge?.dx??(game?.player.x-e.x),flip=direction<0?-1:1;ctx.save();ctx.scale(flip,1);
    for(const x of [-13,12]){line(x,8,x+(e.charge&&e.charge.phase!=='rush'?0:movingLeg(t,e.id,x)),17,'#484c39',5);ellipse(x,18,4,2.2,'#414431');}
    ellipse(-2,-2,25,15,hit?'#dfcfa3':'#8e8261');ellipse(-9,-7,12,7,'#a3946f');
    ctx.fillStyle=hit?'#e4d1a8':'#716f53';ctx.beginPath();ctx.moveTo(-19,-12);ctx.lineTo(-15,-23);ctx.lineTo(-10,-16);ctx.lineTo(-4,-25);ctx.lineTo(1,-15);ctx.lineTo(7,-20);ctx.lineTo(13,-9);ctx.closePath();ctx.fill();
    ellipse(19,-1,13,11,hit?'#eddab1':'#a89976');ellipse(29,3,7,6,'#c0a481');ellipse(30,1,1.3,1.8,'#514d3a');ellipse(32,4,1.3,1.6,'#514d3a');
    ctx.fillStyle='#dcd8b6';ctx.beginPath();ctx.moveTo(20,8);ctx.quadraticCurveTo(32,10,29,-3);ctx.quadraticCurveTo(26,4,21,4);ctx.closePath();ctx.fill();
    ellipse(18,-5,2,2,e.charge?.phase==='windup'?'#f2c47e':'#ede4b4');line(-26,-3,-31,-10,'#78795a',2);ctx.restore();
    if(e.charge?.phase==='stunned'){for(let i=0;i<3;i++){const a=i*TAU/3+(reduced?0:t*1.5),xx=Math.cos(a)*18,yy=-30+Math.sin(a)*5;diamond(xx,yy,3,'#eed89a');}}
  }
  else if(type==='spore'){
    for(const x of [-9,0,9])line(x,7,x*1.4,16,'#788568',4);
    ellipse(0,3,14,15,hit?'#e4d5d8':'#7c927b');ellipse(-7,3,5,8,'#97ad8b');
    ctx.fillStyle=hit?'#ecd8ed':'#9476a2';ctx.strokeStyle='#5d5e65';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-24,-7);ctx.bezierCurveTo(-25,-26,-10,-31,2,-30);ctx.bezierCurveTo(19,-30,28,-17,23,-7);ctx.quadraticCurveTo(0,2,-24,-7);ctx.fill();ctx.stroke();
    ellipse(-10,-18,6,5,'#c2a2cc');ellipse(10,-22,4.5,3.5,'#ccb0d5');ellipse(17,-10,3,2,'#baa0c5');
    ellipse(-5,4,1.7,2.4,'#303f38');ellipse(5,4,1.7,2.4,'#303f38');ellipse(0,10,3,2,'#495b4b');
    if(e.cast){const progress=clamp(1-e.cast.life/e.cast.maxLife,0,1),cx=Math.cos(e.cast.angle)*18,cy=7+Math.sin(e.cast.angle)*10;ellipse(cx,cy,5+progress*5,5+progress*5,'#d2a7e326');ellipse(cx,cy,3+progress*2.5,3+progress*2.5,'#e4beed');}
  }
  else if(type==='boss'&&e.bossKind==='bloom'){
    // Broad tiered cap and luminous crown read apart from the antlered tree lord.
    for(const side of [-1,1]){ctx.save();ctx.scale(side,1);line(28,3,46,24,'#718271',9);ellipse(46,27,7,9,'#687666');ellipse(18,35,14,7,'#596b5d');ctx.restore();}
    ctx.fillStyle=hit?'#e3ded0':'#b3bf99';ctx.strokeStyle='#4d6656';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-25,-15);ctx.lineTo(24,-15);ctx.quadraticCurveTo(20,15,29,32);ctx.quadraticCurveTo(0,43,-29,32);ctx.quadraticCurveTo(-20,13,-25,-15);ctx.fill();ctx.stroke();
    for(const x of [-15,-5,5,15])line(x,-5,x*.8,26,'#859c7e',2);
    ctx.fillStyle=hit?'#e8d8ee':'#a37bab';ctx.strokeStyle='#5d526c';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-53,-17);ctx.bezierCurveTo(-54,-48,-29,-56,0,-54);ctx.bezierCurveTo(30,-55,54,-41,53,-17);ctx.quadraticCurveTo(0,5,-53,-17);ctx.fill();ctx.stroke();
    ellipse(0,-14,47,10,'#73596f');for(let i=-3;i<=3;i++)line(i*12,-17,i*10,-7,'#c1a0bd',1.8);
    for(const [x,y,rr] of [[-32,-29,8],[-14,-43,7],[15,-36,10],[36,-26,6]])ellipse(x,y,rr,rr*.55,'#d4aec7');
    for(let i=-2;i<=2;i++){const xx=i*15,yy=-54+Math.abs(i)*4;line(xx,yy+7,xx,yy-6,'#9b82a4',3);ellipse(xx,yy-8,5.5,7,e.bloomAttack?'#edd1f2':'#c5a2d3');ellipse(xx-1,yy-10,2,2,'#f0d3e7');}
    ellipse(-9,10,3,4,'#364a3d');ellipse(9,10,3,4,'#364a3d');line(-13,6,-5,8,'#e7c493',2);line(5,8,13,6,'#e7c493',2);diamond(0,26,7,'#d4a4dc');
  }
  else if(type==='boss'){for(const flip of [-1,1]){ctx.save();ctx.scale(flip,1);line(26,0,49,24,'#806b46',13);line(40,20,50,35,'#62593b',12);line(18,-26,27,-53,'#927d51',6);line(27,-45,40,-50,'#927d51',4);line(26,-46,22,-61,'#927d51',4);ctx.restore();}ellipse(-18,34,13,8,'#71623d');ellipse(18,34,13,8,'#71623d');ctx.fillStyle=hit?'#e6d7a8':'#7c8850';ctx.beginPath();ctx.moveTo(-32,-27);ctx.lineTo(29,-29);ctx.lineTo(37,25);ctx.quadraticCurveTo(0,48,-36,25);ctx.closePath();ctx.fill();ctx.strokeStyle='#435639';ctx.lineWidth=4;ctx.stroke();for(let i=0;i<6;i++)ellipse((hash(i,1)-.5)*60,-24+(i%3)*6,14,8,['#8caa63','#657e46','#9bac6b'][i%3]);ctx.fillStyle='#4c5536';ctx.beginPath();ctx.moveTo(-21,-12);ctx.lineTo(-6,-7);ctx.lineTo(-10,4);ctx.lineTo(-23,1);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(21,-12);ctx.lineTo(6,-7);ctx.lineTo(10,4);ctx.lineTo(23,1);ctx.closePath();ctx.fill();line(-19,-4,-9,-2,'#f2dc95',3);line(9,-2,19,-4,'#f2dc95',3);diamond(0,20,10,hit?'#fff4cf':'#dfbc78');glow(0,20,23,'#edc86530');}
  if(e.eventRole==='treasure'){
    ctx.fillStyle=hit?'#f7e5ad':'#c6a75b';ctx.strokeStyle='#71613b';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-13,-14);ctx.quadraticCurveTo(-18,-27,0,-30);ctx.quadraticCurveTo(18,-27,13,-14);ctx.lineTo(12,5);ctx.quadraticCurveTo(0,13,-12,5);ctx.closePath();ctx.fill();ctx.stroke();
    line(-10,-10,10,-10,'#f0d58c',3);line(-7,-24,-8,5,'#816d41',2);line(7,-24,8,5,'#816d41',2);diamond(0,-5,6,'#f2df9a');diamond(0,-5,2.5,'#899962');
    line(-5,-28,-8,-35,'#d9bc73',2);line(5,-28,8,-34,'#d9bc73',2);diamond(0,-43,4,'#efdb99');
  }
  if(e.elite){const top=ACTOR_VISUALS[type]?.top||32;diamond(0,-top-4,5,'#e6c579');line(-14,0,-9,8,'#e1bf71',2.5);line(14,0,9,8,'#e1bf71',2.5);}
  ctx.restore();if((e.hp<e.maxHp||e.elite)&&e.type!=='boss'){const w=r*(e.elite?2.1:1.7),barY=y-r-(e.elite?14:10);ctx.fillStyle='#102114';ctx.fillRect(x-w/2,barY,w,e.elite?4:3);ctx.fillStyle=e.elite?'#dfc079':'#adc990';ctx.fillRect(x-w/2,barY,w*Math.max(0,e.hp/e.maxHp),e.elite?4:3);if(e.elite){ctx.font='600 9px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#d9c890';ctx.fillText('精英守卫',x,barY-5);}}}

function blade(x,y,angle,s=1,evolved=false){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(s,s);ctx.strokeStyle='#32492b';ctx.lineWidth=1;ctx.fillStyle=evolved?'#f6dfa0':'#e9eac3';ctx.beginPath();ctx.moveTo(0,-17);ctx.quadraticCurveTo(12,-4,5,13);ctx.lineTo(0,5);ctx.lineTo(-4,11);ctx.quadraticCurveTo(-9,-4,0,-17);ctx.fill();ctx.stroke();line(0,-12,1,8,'#9fae72',1);ctx.restore();}
function effects(e){
  const alpha=clamp(e.life/e.maxLife,0,1),progress=1-alpha;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=e.color||'#e9e4b7';ctx.fillStyle=e.color||'#e9e4b7';
  if(e.type==='ring'){
    const radius=e.r*(reduced?1:.2+.8*progress);ctx.lineWidth=(e.echo?3.5:3)*alpha;ctx.beginPath();ctx.arc(e.x,e.y,radius,0,TAU);ctx.stroke();ctx.globalAlpha=alpha*(e.echo?.035:.06);ctx.fill();
    if(e.evolved){ctx.globalAlpha=alpha*.65;ctx.strokeStyle=e.echo?'#eee0a3':'#c1e9ce';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(0,radius-6),0,TAU);ctx.stroke();if(e.echo){for(let i=0;i<8;i++){const a=i*TAU/8;diamond(e.x+Math.cos(a)*radius,e.y+Math.sin(a)*radius,3,'#e3dda0');}}}
  }else if(e.type==='hit'){for(let i=0;i<5;i++){const a=i*TAU/5;line(e.x+Math.cos(a)*3,e.y+Math.sin(a)*3,e.x+Math.cos(a)*e.r*(1+progress),e.y+Math.sin(a)*e.r*(1+progress),e.color,2);}}
  else if(e.type==='lightning'){
    const evolved=e.evolved,color=evolved?'#eddfa8':e.color;ctx.shadowBlur=reduced?0:evolved?12:10;ctx.shadowColor=color;ctx.strokeStyle=color;ctx.lineWidth=evolved?3:2.3;ctx.beginPath();ctx.moveTo(e.x,e.y);
    const dx=e.x2-e.x,dy=e.y2-e.y,d=Math.hypot(dx,dy)||1;for(let i=1;i<=7;i++){let jitter=i===7?0:Math.sin(i*43+e.x)*13;ctx.lineTo(e.x+dx*i/7-dy/d*jitter,e.y+dy*i/7+dx/d*jitter);}ctx.stroke();
    if(evolved){ctx.shadowBlur=0;ctx.strokeStyle='#fff3d4';ctx.lineWidth=1;ctx.stroke();diamond(e.x2,e.y2,4,'#f6e8b2');}
  }else if(e.type==='damage'||e.type==='heal'){ctx.font=`600 ${e.type==='heal'?15:11}px ui-monospace,monospace`;ctx.textAlign='center';ctx.fillText(e.text||'',e.x,e.y);}
  ctx.restore();
}
// A fixed ground boundary shows the exact danger zone; only its countdown
// advances. All marks sit beneath the depth-sorted actors and solid terrain.
function drawBossGroundEffects(){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(const enemy of game.enemies){
    const attack=enemy.bloomAttack;if(!attack||attack.life<=0)continue;
    const progress=clamp(1-attack.life/attack.maxLife,0,1);
    if(attack.kind==='fan'){
      // Short directional arrows describe the locked fan, not its travel limit.
      for(let i=0;i<5;i++){const angle=attack.angle-attack.spread/2+i*attack.spread/4,dx=Math.cos(angle),dy=Math.sin(angle),length=240;
        ctx.globalAlpha=.33;line(attack.x+dx*25,attack.y+dy*25,attack.x+dx*length,attack.y+dy*length,'#c99bd3',7);
        ctx.globalAlpha=.9;line(attack.x+dx*25,attack.y+dy*25,attack.x+dx*(30+progress*210),attack.y+dy*(30+progress*210),'#efd4f1',1.5);
        const xx=attack.x+dx*length,yy=attack.y+dy*length;ctx.beginPath();ctx.moveTo(xx-dx*9-dy*4,yy-dy*9+dx*4);ctx.lineTo(xx,yy);ctx.lineTo(xx-dx*9+dy*4,yy-dy*9-dx*4);ctx.strokeStyle='#d4aedf';ctx.lineWidth=1.6;ctx.stroke();
      }
    }else for(const circle of attack.circles||[]){
      const {x,y,r}=circle;ctx.globalAlpha=.14;ctx.fillStyle='#c38adb';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.globalAlpha=.9;ctx.strokeStyle='#dba8e8';ctx.lineWidth=2.4;ctx.stroke();
      ctx.globalAlpha=.95;ctx.strokeStyle='#f6d7fa';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r-5,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();
      for(let i=0;i<4;i++){const angle=i*TAU/4+Math.PI/4;line(x+Math.cos(angle)*(r-14),y+Math.sin(angle)*(r-14),x+Math.cos(angle)*(r-21),y+Math.sin(angle)*(r-21),'#ebc7eb',1.6);}diamond(x,y,5,'#d9afe2');
    }
  }
  for(const effect of game.effects){
    if(effect.type!=='bloomBurst')continue;
    const alpha=clamp(effect.life/effect.maxLife,0,1),progress=1-alpha,{x,y,r}=effect;
    ctx.globalAlpha=alpha*.16;ctx.fillStyle='#c28bdd';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.globalAlpha=alpha*.85;ctx.strokeStyle='#e5b4ef';ctx.lineWidth=3*alpha+1;ctx.stroke();
    for(let i=0;i<9;i++){const angle=i*TAU/9,rr=r*(reduced?.6:.2+.65*progress);ellipse(x+Math.cos(angle)*rr,y+Math.sin(angle)*rr,3.5,3.5,'#e8c4ed');}
  }
  ctx.globalAlpha=1;

  for(const enemy of game.enemies){
    const slam=enemy.slam;if(!slam||slam.life<=0)continue;
    const progress=clamp(1-slam.life/slam.maxLife,0,1),{x,y,r}=slam;
    ctx.globalAlpha=.12+progress*.07;ctx.fillStyle='#e36d45';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
    ctx.globalAlpha=.92;ctx.strokeStyle='#e79567';ctx.lineWidth=2.6;ctx.stroke();
    ctx.globalAlpha=.7;ctx.strokeStyle='#e7b574';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r-7,0,TAU);ctx.stroke();
    ctx.globalAlpha=.95;ctx.strokeStyle='#ffe1a0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r-4,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();
    // Four inward ticks keep the damage boundary readable in dense grass.
    ctx.beginPath();for(let i=0;i<4;i++){const angle=i*Math.PI/2;ctx.moveTo(x+Math.cos(angle)*(r-13),y+Math.sin(angle)*(r-13));ctx.lineTo(x+Math.cos(angle)*(r-20),y+Math.sin(angle)*(r-20));}ctx.lineWidth=2;ctx.stroke();
  }
  for(const effect of game.effects){
    if(effect.type!=='bossSlam')continue;
    const alpha=clamp(effect.life/effect.maxLife,0,1),progress=1-alpha,{x,y,r}=effect;
    ctx.globalAlpha=alpha*.09;ctx.fillStyle='#eaa572';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
    ctx.globalAlpha=alpha*.85;ctx.strokeStyle='#f2bd7b';ctx.lineWidth=4*alpha+1;ctx.beginPath();ctx.arc(x,y,reduced?r:r*(.78+.24*progress),0,TAU);ctx.stroke();
    ctx.globalAlpha=alpha*.6;ctx.strokeStyle='#ed9d67';ctx.lineWidth=1.5;
    ctx.beginPath();for(let i=0;i<8;i++){const angle=i*TAU/8+.14,dx=Math.cos(angle),dy=Math.sin(angle),length=r*(.76+hash(i,4)*.14);ctx.moveTo(x+dx*r*.34,y+dy*r*.34);ctx.lineTo(x+dx*length*.65-dy*6,y+dy*length*.65+dx*6);ctx.lineTo(x+dx*length,y+dy*length);}ctx.stroke();
  }
  ctx.restore();
}
// Build the discharge once per cast. Pausing freezes its age and its geometry.
const stormGeometryCache=new WeakMap();
function lightningPath(start,end,seed,depth=5,roughness=.2){
  const points=[start];
  function split(a,b,level,key){
    if(level<=0){points.push(b);return;}
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
    const along=.4+hash(seed,key)*.2,offset=(hash(seed+19,key)-.5)*d*roughness*2;
    const midpoint={x:a.x+dx*along-dy/d*offset,y:a.y+dy*along+dx/d*offset};
    split(a,midpoint,level-1,key*2+1);split(midpoint,b,level-1,key*2+2);
  }
  split(start,end,depth,1);return points;
}
function getStormGeometry(storm){
  if(stormGeometryCache.has(storm))return stormGeometryCache.get(storm);
  const viewWidth=storm.viewWidth||width,viewHeight=storm.viewHeight||height;
  const targets=storm.targets.length?storm.targets:[{x:storm.x-90,y:storm.y+70,r:14,seed:1},{x:storm.x+110,y:storm.y-75,r:14,seed:2},{x:storm.x+15,y:storm.y+140,r:14,seed:3}];
  const boltLimit=viewWidth<600?8:14,selected=[];
  // Large targets lead; farthest-point selection spreads detailed bolts across
  // the viewport instead of hiding the entire horde under full-height strokes.
  if(targets.length<=boltLimit)selected.push(...targets);
  else{
    let next=targets.reduce((best,target)=>target.r>best.r?target:best,targets[0]);
    const remaining=new Set(targets),distances=new Map();
    while(selected.length<boltLimit&&remaining.size){
      selected.push(next);remaining.delete(next);let farthest=-1,candidate=null;
      for(const target of remaining){
        const distance=((target.x-next.x)/viewWidth)**2+((target.y-next.y)/viewHeight)**2;
        const nearest=Math.min(distances.get(target)??Infinity,distance);distances.set(target,nearest);
        if(nearest>farthest){farthest=nearest;candidate=target;}
      }
      next=candidate;
    }
  }
  const selectedSet=new Set(selected),mainBolts=selected.map((target,index)=>{
    const seed=(target.seed||index+1)*13.7;
    const end={x:target.x,y:target.y+3};
    const start={x:target.x+(hash(seed,2)-.5)*Math.min(180,viewWidth*.35),y:Math.min(storm.y-viewHeight/2-45,end.y-190)};
    const trunk=lightningPath(start,end,seed,5,.17),branches=[];
    for(let i=0;i<3;i++){
      const at=7+i*6+Math.floor(hash(seed,i+4)*4),origin=trunk[at];
      const side=hash(seed,i+11)>.5?1:-1,length=40+hash(seed,i+17)*70;
      const tip={x:origin.x+side*length*.72,y:origin.y+length*(.55+hash(seed,i+20)*.55)};
      const branch=lightningPath(origin,tip,seed+i*23+3,3,.24);branches.push(branch);
      if(i===1){const fork=branch[4];branches.push(lightningPath(fork,{x:fork.x-side*length*.35,y:fork.y+length*.4},seed+83,2,.2));}
    }
    return{trunk,branches};
  });
  const impacts=targets.map((target,index)=>{
    const seed=target.seed||index+1,hero=selectedSet.has(target),radius=clamp(target.r*.65+7,13,35),paths=[];
    for(let i=0;i<(hero?5:2);i++){
      const angle=(i/(hero?5:2)+hash(seed,i)*.19)*TAU,length=radius*(.75+hash(seed,i+6)*.55);
      const dx=Math.cos(angle),dy=Math.sin(angle)*.48;
      paths.push([{x:target.x+dx*3,y:target.y+3+dy*3},{x:target.x+dx*length*.45-dy*5,y:target.y+3+dy*length*.45+dx*3},{x:target.x+dx*length*.7+dy*3,y:target.y+3+dy*length*.7-dx*2},{x:target.x+dx*length,y:target.y+3+dy*length}]);
    }
    return{x:target.x,y:target.y+3,r:radius,paths,hero};
  });
  const geometry={mainBolts,impacts,targetCount:storm.targets.length,boltLimit};
  stormGeometryCache.set(storm,geometry);return geometry;
}
function stormBrightness(storm,calm=reduced){
  const progress=clamp(1-storm.life/storm.maxLife,0,1),age=progress*storm.maxLife;
  if(calm)return .8*(1-progress);
  // One main discharge, one weaker return stroke, then a faint afterglow.
  const first=age<.045?1:Math.exp(-(age-.045)*18);
  const returnStroke=.5*Math.exp(-Math.pow((age-.185)/.028,2));
  return clamp(first+returnStroke+.22*(1-progress),0,1);
}
function stormExposure(storm){
  if(reduced||!storm||storm.life<=0)return 0;
  return .09*Math.max(0,1-(storm.maxLife-storm.life)/.095)**2;
}
function appendLightningPath(points){ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);}
function drawStorm(){
  const storm=game.storm;if(!storm||storm.life<=0)return;
  const geometry=getStormGeometry(storm),brightness=stormBrightness(storm),progress=clamp(1-storm.life/storm.maxLife,0,1);
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0;
  ctx.beginPath();for(const bolt of geometry.mainBolts)appendLightningPath(bolt.trunk);
  // Batch the shared glow passes; there is no per-enemy blur or gradient.
  for(const [strokeWidth,color,opacity] of [[14,'#5199ff',.09],[8,'#73b8ff',.22],[4,'#abdfff',.8],[1.9,'#ffffff',1]]){
    ctx.lineWidth=strokeWidth;ctx.strokeStyle=color;ctx.globalAlpha=brightness*opacity;ctx.stroke();
  }
  ctx.beginPath();for(const bolt of geometry.mainBolts)for(const branch of bolt.branches)appendLightningPath(branch);
  ctx.strokeStyle='#83c5ff';ctx.lineWidth=3;ctx.globalAlpha=brightness*.3;ctx.stroke();
  ctx.strokeStyle='#d5f1ff';ctx.lineWidth=.9;ctx.globalAlpha=brightness*.8;ctx.stroke();
  // Even targets killed on the casting frame retain their own impact snapshot.
  const impactAlpha=reduced?brightness:Math.max(brightness*.8,.65*(1-progress)**1.5);
  ctx.beginPath();for(const impact of geometry.impacts)for(const path of impact.paths)appendLightningPath(path);
  ctx.strokeStyle='#6dbbff';ctx.lineWidth=4;ctx.globalAlpha=impactAlpha*.24;ctx.stroke();
  ctx.strokeStyle='#e5f6ff';ctx.lineWidth=1.25;ctx.globalAlpha=impactAlpha;ctx.stroke();
  ctx.beginPath();for(const impact of geometry.impacts){ctx.moveTo(impact.x+2.2,impact.y);ctx.ellipse(impact.x,impact.y,2.2,1.6,0,0,TAU);}
  ctx.fillStyle='#ffffff';ctx.globalAlpha=impactAlpha;ctx.fill();ctx.restore();
}
function ambient(intro){const count=intro?25:13;for(let i=0;i<count;i++){const x=(hash(i,9)*width+Math.sin(clock*.2+i)*25+width)%width,y=(hash(i,8)*height-clock*(3+hash(i,7)*5)%height+height)%height,alpha=(.15+Math.sin(clock*1.4+i)*.13);ctx.globalAlpha=alpha;glow(x,y,7,'#daed9daa');ellipse(x,y,1.5,1.5,'#f1f5b3');}ctx.globalAlpha=1;}
function renderIntro(){
  background(0,0,true);const mobile=width<760&&height>width*.72,x=width*(mobile?.63:.735),y=height*(mobile?.715:.51),s=mobile?1.7:2.7;
  const surrounds=mobile?[[105,25,'slime',14],[-95,50,'slime',12],[125,-65,'bat',8]]:[[145,40,'slime',22],[-165,95,'slime',17],[210,-105,'bat',13],[-68,-133,'beetle',19],[160,158,'brute',24]];
  const actors=surrounds.map(([dx,dy,type,r],id)=>actorVisual({x:x+dx,y:y+dy,r,type,id:id+1,hp:10,maxHp:10,hit:0}));
  actors.push(actorVisual({x,y,facing:0},true,s));
  const visible=actors.filter(actor=>actorInView(actor));
  glow(x,y-15,135,'#b9d68116');drawActorShadows(visible);runeCircle(x,y+30*s,70*s,clock,.28);runeCircle(x,y+30*s,51*s,-clock,.12);
  for(let i=0;i<7;i++){let a=i*2.4,rr=mobile?60:115,gx=x+Math.cos(a)*rr,gy=y+35+Math.sin(a)*rr*.45;diamond(gx,gy,4+(i%2),'#c0e79099');}
  drawActors(visible);
  for(let i=0;i<2;i++){const a=clock*.6+i*Math.PI,xx=x+Math.cos(a)*s*36,yy=y+Math.sin(a)*s*20;glow(xx,yy,25,'#e5edaf12');blade(xx,yy,a+.8,s*.7);}ambient(true);
}
function renderGame(){const p=game.player,camX=p.x,camY=p.y;background(camX,camY,false);let sx=0,sy=0;if(shake>0&&!reduced){sx=(Math.random()-.5)*shake;sy=(Math.random()-.5)*shake;}
  const offsetX=width/2-camX+sx,offsetY=height/2-camY+sy;
  const actors=game.enemies.map(e=>actorVisual(e)).filter(actor=>actorInView(actor,offsetX,offsetY));actors.push(actorVisual(p,true));
  const terrain=terrainInView(camX,camY),adventureProps=adventureSceneProps(camX,camY);
  drawActorShadows(actors,offsetX,offsetY,terrain,adventureProps);ctx.save();ctx.translate(offsetX,offsetY);
  for(const gem of game.gems){if(Math.abs(gem.x-p.x)>width/2+20||Math.abs(gem.y-p.y)>height/2+20)continue;ellipse(gem.x,gem.y+5,gem.r,2,'#152b1b66');diamond(gem.x,gem.y,gem.r,'#a5d78b');diamond(gem.x-1,gem.y-1,gem.r*.45,'#def3b4');}
  for(const e of game.effects)if(e.type==='ring')effects(e);
  drawEncounterGround();drawAdventurePickups();drawEnemyTelegraphs();drawBossGroundEffects();
  drawScene(actors,terrain,p,Math.hypot(input.x,input.y)>.1,adventureProps);
  drawEnemyBullets();
  for(const b of game.bullets){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);line(-18,0,0,0,'#c2eda83b',5);line(-9,0,5,0,b.color,2.8);ctx.fillStyle='#f6f6cf';ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-1,-3.5);ctx.lineTo(-1,3.5);ctx.closePath();ctx.fill();ctx.restore();}
  for(const b of game.orbitals){if(b.evolved){ellipse(b.x,b.y,14,14,'#e5d69713');if(b.surge>0)line(b.x-Math.cos(b.angle)*14,b.y-Math.sin(b.angle)*14,b.x,b.y,'#f0dca677',2);}blade(b.x,b.y,b.angle+clock,b.evolved?1.12:1,b.evolved);}
  for(const e of game.effects)if(e.type!=='ring'&&e.type!=='bossSlam'&&e.type!=='bloomBurst')effects(e);
  drawStorm();
  ctx.restore();
  const exposure=stormExposure(game.storm);if(exposure>0){ctx.fillStyle=`rgba(177,219,255,${exposure})`;ctx.fillRect(0,0,width,height);}
  ambient(false);
  drawObjectivePointers();
  if(p.hp/p.maxHp<.3){const danger=ctx.createRadialGradient(width/2,height/2,height*.2,width/2,height/2,Math.max(width,height)*.65);danger.addColorStop(0,'transparent');danger.addColorStop(1,'#ae392144');ctx.fillStyle=danger;ctx.fillRect(0,0,width,height);}
}
function frame(now){const dt=Math.min((now-(last||now))/1000,.04);last=now;if(!paused&&!helpOpen)clock+=dt;ctx.setTransform(dpr,0,0,dpr,0,0);if(game){if(!paused&&!helpOpen&&!runEnded){input.x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+(touch?.dx||0);input.y=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+(touch?.dy||0);input.skill=skillRequested;skillRequested=false;game.update(dt,input);let hitSound=false;for(const e of game.events){if(e.type==='shoot')tone(700,.045,'triangle',.012,330);if(e.type==='kill')hitSound=true;if(e.type==='hurt'){shake=8;tone(150,.1,'triangle',.055,70);}if(e.type==='skill'){updateHUD();shake=reduced?0:5;tone(85,.48,'triangle',.065,32);tone(720,.25,'sawtooth',.02,90);}if(e.type==='level')tone(650,.24,'sine',.05,1200);if(e.type==='evolution'){tone(620,.3,'sine',.045,1240);}if(e.type==='encounterComplete')tone(540,.22,'sine',.03,880);if(e.type==='bloomWindup')tone(270,.28,'sine',.025,390);if(e.type==='bloomShot')tone(400,.13,'triangle',.025,220);if(e.type==='bloomBurst')tone(170,.3,'triangle',.035,70);if(e.type==='bossWindup')tone(145,.24,'sine',.025,210);if(e.type==='bossSlam'){shake=reduced?0:Math.max(shake,3);tone(90,.28,'triangle',.045,40);}if(e.type==='boss')tone(130,.5,'triangle',.07,75);if(e.type==='heal')tone(600,.1,'sine',.015,900);}if(hitSound)tone(170,.04,'triangle',.018,95);announceCombatEvents(game.events);game.events.length=0;if(game.status==='upgrade')openUpgrades();if(game.status==='dead')endGame();}renderGame();hudTick+=dt;if(hudTick>.07){updateHUD();hudTick=0;}shake=Math.max(0,shake-dt*40);}else renderIntro();requestAnimationFrame(frame);}
requestAnimationFrame(frame);
