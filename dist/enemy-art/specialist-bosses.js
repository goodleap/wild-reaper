import { paint as frostcrown } from './frostcrown.js';
import { frostcrownFacing, frostcrownBodyPose } from '../enemy-body-geometry.js';
import { TAU, clamp, poly, line, oval, grad, star } from './drawing.js';

const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
function state(p,pose={}){
  const mode=pose.mode||(p?'move':'idle'),progress=clamp(pose.progress||0,0,1);
  const moving=pose.moving??(mode==='move'||mode==='rush');
  return {mode,progress,moving,action:pose.action||'',cycle:Number.isFinite(pose.cycle)?pose.cycle:Math.asin(clamp(p,-1,1)),
    prepare:mode==='windup'?smooth(progress):0,release:mode==='active'?1:0,
    rest:mode==='recovery'?1-smooth(progress):0};
}
function joint(c,points,width,base,light){
  line(c,points,'#28383f',width+1.8);line(c,points,base,width);
  line(c,points.map(([x,y])=>[x-.65,y-1]),light,Math.max(.8,width*.2));
  for(const [x,y] of points.slice(1,-1))oval(c,x,y,width*.58,width*.53,base);
}
function crystal(c,x,y,r,color='#d7f2f0'){
  poly(c,[[x,y-r],[x+r*.55,y],[x,y+r],[x-r*.55,y]],color,'#4d788a',.8);
  line(c,[[x,y-r],[x,y],[x+r*.55,y]],'#f5fff4',.85);
}
function eye(c,x,y,rx,color){oval(c,x,y,rx,rx*1.1,color);oval(c,x+.6,y-.7,.65,.85,'#fff5d8');}

function broodmother(c,p,flip=1,pose={}){
  const s=state(p,pose),leap=s.action==='leap',air=s.mode==='air'||leap&&s.mode==='rush';
  const crouch=leap?s.prepare*5-s.rest*2:0,bodyY=crouch+(s.moving?Math.cos(s.cycle*2)*.8:0);
  const weave=s.action==='domain'||s.action==='web',spawn=s.action==='summon';
  const abdomenLift=weave?(s.prepare*5+s.release*6+s.rest*3):spawn?s.prepare*2:0;
  // Every leg has a planted half-cycle and a lifting half-cycle. Opposite
  // groups exchange support instead of sliding all eight feet together.
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const phase=s.cycle+(i%2)*Math.PI+(side<0?Math.PI:0),stride=s.moving?Math.cos(phase)*6:0;
    const lift=s.moving?Math.max(0,Math.sin(phase))*7:0,y=-18+i*11;
    const fold=air?Math.sin(Math.PI*clamp(s.progress,.05,.95))*.8:0;
    const spread=leap&&s.mode==='recovery'?s.rest*6:0;
    const footX=side*(65+i*2+spread-fold*23),footY=y+20+stride-lift-fold*10;
    const kneeX=side*(39+i*4-fold*9),kneeY=y-12+bodyY+(air?5:0);
    joint(c,[[side*17,y+bodyY],[kneeX,kneeY],[footX,footY-6],[footX-side*3,footY]],7.4-i*.7,'#5e5660','#b5a59b');
    oval(c,kneeX,kneeY,3.4-i*.25,3,'#8f7a87');
    line(c,[[footX-side*3,footY],[footX-side*6,footY+2]],'#d4c8b0',1.5);
  }
  c.save();c.translate(0,bodyY);
  const swell=spawn?(s.prepare+s.release)*1.6:0;
  oval(c,0,-16-abdomenLift,31+swell,28+swell,grad(c,-29,12,27,-43,['#3e414b','#776979','#b79999']));
  for(const side of [-1,1]){
    poly(c,[[side*5,-38-abdomenLift],[side*21,-31-abdomenLift],[side*25,-13-abdomenLift],[side*14,-18-abdomenLift]],'#bca99e','#746779',1.1);
    line(c,[[side*5,-34-abdomenLift],[side*14,-28-abdomenLift],[side*17,-19-abdomenLift]],'#d9c8b4',1.1);
  }
  line(c,[[0,-39-abdomenLift],[0,-7-abdomenLift]],'#4f4858',1.8);
  crystal(c,0,-24-abdomenLift,9,'#d5b3cd');
  oval(c,0,14,25,18,grad(c,-23,31,21,-4,['#3f4047','#89807d','#c6b69d']));
  poly(c,[[-20,6],[-8,0],[0,3],[8,0],[20,6],[15,15],[0,18],[-15,15]],'#665964');
  for(const [x,y,r]of[[-13,7,3.4],[-5,5,3],[5,5,3],[13,7,3.4],[-18,13,2.2],[18,13,2.2]])eye(c,x,y,r,'#edb29d');
  const fangOpen=leap?(s.prepare*3+(air?4:0)):spawn?s.prepare*2:0;
  for(const side of [-1,1]){
    joint(c,[[side*14,19],[side*(18+fangOpen),25],[side*(10+fangOpen),34]],4.5,'#9c8d7f','#d9cbb0');
    poly(c,[[side*(10+fangOpen),30],[side*(9+fangOpen),38],[side*(5+fangOpen),31]],'#e5d5b7','#6b625d',.8);
  }
  if(weave&&(s.prepare||s.release||s.rest)){
    const strength=Math.max(s.prepare,s.release,s.rest*.5);
    for(const side of [-1,1])line(c,[[side*9,-30-abdomenLift],[side*27,-8],[side*(38+strength*8),19]],'#dcd2df',.8);
  }
  if(spawn&&s.prepare>0)for(const side of [-1,1])oval(c,side*12,-14,2+s.prepare,3,'#dbc5bb');
  c.restore();
}

function curvePoint(a,b,d,t){const u=1-t;return [u*u*a[0]+2*u*t*b[0]+t*t*d[0],u*u*a[1]+2*u*t*b[1]+t*t*d[1]];}
function tentacle(c,a,b,d,width,{back=false,suckers=true}={}){
  const points=Array.from({length:7},(_,i)=>curvePoint(a,b,d,i/6));
  for(let i=0;i<6;i++){
    const w=width*(1-i*.105);
    line(c,[points[i],points[i+1]],back?'#365b72':'#335f75',w+2);
    line(c,[points[i],points[i+1]],back?'#638d9f':'#7bb4be',w);
    line(c,[[points[i][0]-.6,points[i][1]-1],[points[i+1][0]-.6,points[i+1][1]-1]],'#b0d4d1',Math.max(.7,w*.17));
    if(suckers&&i>1&&i<5)oval(c,points[i][0],points[i][1]+2,Math.max(1,w*.17),Math.max(.75,w*.12),'#d5ddc3');
  }
}
function deepcaller(c,p,flip=1,pose={}){
  const s=state(p,pose),attack=s.action==='tentacles',wave=s.action==='tidalWave',vortex=s.action==='vortex';
  const ready=s.prepare,release=s.release,rest=s.rest;
  const sway=s.moving?Math.sin(s.cycle)*1.3:0;
  // Far arms appear behind the mantle; front arms keep their own traction
  // cycle and tapered silhouette instead of moving as a single fringe.
  for(const back of [true,false]){
    for(let i=0;i<4;i++){
      const x=(i-1.5)*(back?17:14),side=x<0?-1:1;
      const phase=s.cycle+i*Math.PI*.5+(back?Math.PI:0),push=s.moving?Math.sin(phase)*8:0,lift=s.moving?Math.max(0,Math.cos(phase))*5:0;
      const raise=attack?(ready*25*(i%2?.8:1)+release*(i%2?5:18)):wave?ready*17:vortex?ready*12:0;
      const spread=wave?(ready*8+release*12):0;
      const end=[x+side*(20+Math.abs(x)*.35+spread)+push*.35,(back?14:31)-lift-raise+rest*3];
      const bend=[x+side*(18+spread)-push,(back?26:46)-raise*.45];
      tentacle(c,[x,(back?0:15)+sway],bend,end,back?11:13,{back});
      if(vortex&&(ready||release))line(c,[[end[0]-side*3,end[1]],[end[0]-side*10,end[1]-5]],'#d0ece2',1.2);
    }
    if(back){
      c.save();c.translate(0,sway+(wave?ready*2-release*2:0));
      oval(c,0,-9,36,38,grad(c,-35,29,29,-48,['#345f7c','#699da9','#b3d5cb']));
      poly(c,[[-27,-24],[-20,-48],[-9,-43],[0,-59],[10,-44],[23,-49],[28,-25]],'#7aabb9','#345b76',1.5);
      line(c,[[-20,-35],[-12,-27],[0,-30],[13,-26],[21,-36]],'#d4e3d4',1.7);
      for(const side of [-1,1]){
        line(c,[[side*28,-18],[side*23,-2],[side*27,12]],'#477d91',1.3);
        oval(c,side*13,1,7,7.5,'#dce7d1');oval(c,side*12,2,2.7,rest>0?3:5,'#244657');
        line(c,[[side*6,-7+ready*2],[side*20,-10]],'#487c91',2.5);
      }
      oval(c,0,18,5+release*2,3+release*2,'#36586f');crystal(c,0,-27,8,'#ead9a5');
      c.restore();
    }
  }
}

function boot(c,x,y,lean,color){
  poly(c,[[x-8,y-13],[x+7,y-13],[x+8+lean,y-3],[x+11+lean,y],[x+9+lean,y+3],[x-11+lean,y+3],[x-12+lean,y-2]],color,'#293b3e',1.6);
  line(c,[[x-9+lean,y],[x+8+lean,y]],'#a7aaa0',1.1);line(c,[[x-7,y-9],[x+5,y-9]],'#eead69',1.1);
}
function furnace(c,p,flip=1,pose={}){
  const s=state(p,pose),fire=s.action==='flameStream'||s.action==='fireball',march=s.action==='furnaceMarch';
  const step=s.moving?Math.sin(s.cycle):0,lift=s.moving?Math.max(0,Math.cos(s.cycle)):0;
  const lean=fire?(s.prepare*2+s.release*4+s.rest):march?s.prepare*1.5:0;
  const heat=clamp((s.mode==='windup'?.3+s.prepare*.7:s.mode==='active'||s.mode==='rush'?1:s.mode==='recovery'?s.rest*.65:.28),0,1);
  for(const side of [-1,1]){
    const swing=step*side,raised=s.moving?Math.max(0,swing)*5:0;
    joint(c,[[side*18,20],[side*20+swing*2,29-raised],[side*22+swing*4,37-raised]],13,'#5e6c66','#9b9d87');
    boot(c,side*22+swing*4,39-raised,swing*2,'#59615b');
  }
  c.save();c.translate(step*1.4,lean+(s.moving?-lift*.9:0));c.rotate(step*.018);
  for(const side of [-1,1]){
    const swing=s.moving?step*side*6:0,brace=fire?(s.prepare*4+s.release*7):0;
    const elbow=[side*(43+brace*.35),-1-swing],wrist=[side*(43+brace),18-swing-(s.action==='eruption'?s.prepare*8:0)];
    joint(c,[[side*29,-22],elbow,wrist],14,'#646e67','#a8a78e');
    poly(c,[[side*22,-29],[side*35,-31],[side*43,-18],[side*33,-10],[side*24,-14]],'#899082','#334743',1.5);
    oval(c,wrist[0],wrist[1]+3,10,10,'#5c6861');line(c,[[wrist[0]-4,wrist[1]],[wrist[0]-4,wrist[1]+8]],'#abb09a',1.1);
    line(c,[[side*35,-17],[elbow[0],elbow[1]-4],[wrist[0],wrist[1]-7]],heat>.6?'#ffc775':'#ad8052',1.9);
  }
  poly(c,[[-28,-28],[-15,-36],[18,-36],[30,-25],[34,22],[21,35],[-21,35],[-34,22]],grad(c,-34,35,32,-36,['#354446','#65736b','#afa88b']),'#283a3d',2);
  poly(c,[[-27,-24],[-17,-30],[-18,-11],[-30,-1]],'#849084','#a2a28a',.7);
  poly(c,[[18,-29],[28,-23],[30,-1],[20,-11]],'#4b5d58','#9c9d80',.7);
  line(c,[[-30,20],[-22,27],[-15,27]],'#b5a381',1.7);line(c,[[15,27],[24,25],[30,18]],'#b5a381',1.7);
  poly(c,[[-21,-11],[-12,-20],[12,-20],[22,-10],[19,16],[0,24],[-19,16]],'#283738','#b5a27a',2.1);
  oval(c,0,1,15,17,heat>.7?'#dc7941':heat>.4?'#a85336':'#754832');
  const flame=heat*5;
  poly(c,[[-10,13],[-13,3],[-7,-3],[-5,-8-flame],[0,-4],[5,-12-flame],[9,-3],[12,6],[5,15]],heat>.6?'#ffd180':'#dc9554');
  poly(c,[[-4,13],[-6,5],[0,-2-flame*.5],[2,3],[5,8],[2,15]],heat>.7?'#fff4c3':'#f4c17a');
  for(const x of [-11,0,11])line(c,[[x,-14],[x,18]],'#53635b',3.4);
  line(c,[[-18,-9],[18,-9]],'#77806a',2.4);
  const sag=s.mode==='recovery'?2:0;
  poly(c,[[-17,-36+sag],[-16,-52+sag],[-7,-60+sag],[11,-61+sag],[21,-50+sag],[18,-34+sag]],'#839184','#3b5149',1.6);
  poly(c,[[-10,-55+sag],[8,-56+sag],[13,-49+sag],[-12,-49+sag]],'#a5aa8e');
  line(c,[[-11,-44+sag],[-3,-42+sag]],heat>.65?'#fff0ab':'#e0b67d',2.8);
  line(c,[[7,-42+sag],[15,-45+sag]],heat>.65?'#fff0ab':'#e0b67d',2.8);
  for(const side of [-1,1]){
    poly(c,[[side*19,-34],[side*25,-53],[side*32,-50],[side*29,-25]],side<0?'#687d70':'#8c9987','#3b5149',1.2);
    oval(c,side*28,-51,4,2.2,'#334744');
    if(s.mode==='recovery'){line(c,[[side*28,-54],[side*27,-58],[side*30,-61]],'#b9c6ad',1.2);}
  }
  c.restore();
}

const phaseNames=Object.freeze({web:'织网',summon:'召集幼蛛',leap:'跃袭',tentacles:'触腕拍击',wave:'潮汐横扫',frost:'冰棱散射',frostCharge:'霜径冲锋',shatter:'碎冰震荡',furnaceMarch:'炽热踏步',eruption:'熔压喷发',domain:'荒野领域',vortex:'虚空漩涡',frostRing:'寒霜环',flameStream:'焰流',tidalWave:'潮汐波',fireball:'火球术',frostbolt:'冰霜术'});
function label(e,kind){
  if(e.bossKind!==kind)return null;
  const a=e.specialAttack||e._visualCast;
  const name=action=>kind==='broodmother'&&action==='domain'?'织网':phaseNames[action];
  if(a)return `${name(a.kind||a.abilityId)||'首领攻击'}${a.phase==='windup'?' · 蓄力':''}`;
  return e.specialRecovery>0?(name(e.specialPose)||'攻击间歇'):null;
}
function overlay(kind,color){return(c,e,{dense=false,reduced=false}={})=>{
  if(e.bossKind!==kind)return;
  const a=e.specialAttack||e._visualCast;if(a?.phase!=='windup')return;
  const t=Number.isFinite(a.progress)?clamp(a.progress,0,1):clamp(1-(a.life??a.remaining??0)/(a.maxLife||a.duration||1),0,1);
  if(kind==='broodmother'){
    for(const side of [-1,1])star(c,side*5,5,1+t,color);
  }else if(kind==='deepcaller'){
    star(c,0,-27,2+t*2,color);
  }else if(kind==='furnace'){
    if(!dense&&!reduced)for(const side of [-1,1])line(c,[[side*28,-53],[side*29,-57-t*3]],color,1.1);
  }
};}
const art=(kind,paint,color,extra={})=>Object.freeze({paint,animated:true,poseWave:e=>Math.sin(e.walkPhase||0),
  isStill:e=>e.specialist?.phase==='windup'||e.specialist?.phase==='recovery'||(e.specialAttack&&e.specialAttack.phase!=='rush')||e._visualCast?.phase==='windup'||e.specialRecovery>0,
  frequency:3,overlay:overlay(kind,color),windingUp:e=>e.bossKind===kind&&(e.specialAttack||e._visualCast)?.phase==='windup',phaseLabel:e=>label(e,kind),...extra});
export const BOSS_SPECIALIST_ART=Object.freeze({
  broodmother:art('broodmother',broodmother,'#e7b7a8'),
  deepcaller:art('deepcaller',deepcaller,'#bcebea'),
  frostcrown:art('frostcrown',frostcrown,'#e1f9ff',{facing:frostcrownFacing,samplePose:frostcrownBodyPose}),
  furnace:art('furnace',furnace,'#ffd699')
});

// World-space attack limbs use the captured collision targets. Their tips
// never track a moving player and this function never advances combat state.
export function drawSpecialistBossGround(c,game,options={}){
  c.save();c.lineCap='round';c.lineJoin='round';
  for(const e of game.enemies||[]){
    if(e.hp<=0||e.bossKind!=='deepcaller')continue;
    const current=e.specialAttack?.kind==='tentacles'?e.specialAttack:null;
    const lingering=e.specialVisualStrikes;
    const a=current||lingering;if(!a)continue;
    const recovery=current?0:clamp(1-(a.life||0)/(a.maxLife||.35),0,1);
    const prepare=current?.phase==='windup'?clamp(1-current.life/Math.max(.001,current.maxLife),0,1):1;
    for(const [i,target] of (a.circles||[]).entries()){
      if(options.visible&&!options.visible(e)&&!options.visible(target))continue;
      const maxDelay=target.maxDelay??i*.4,delay=Math.max(0,target.delay||0);
      const waiting=current?.phase==='strikes'&&!target.done;
      const fall=waiting?clamp(1-delay/Math.max(.15,Math.min(.4,maxDelay||.4)),0,1):0;
      const struck=target.done||!current,age=target.visualAge??0;
      const retract=struck?Math.max(recovery,clamp(age/.35,0,1)):0;
      const extension=current?.phase==='windup'?smooth(prepare)*.86:struck?1-smooth(retract)*.75:1;
      const base=[e.x+(i-1)*13,e.y+15],tip=[mix(base[0],target.x,extension),mix(base[1],target.y,extension)];
      const lift=options.reduced?0:current?.phase==='windup'?35+prepare*25:waiting?(1-fall)*60:struck?Math.sin(retract*Math.PI)*24:0;
      tip[1]-=lift;
      const bend=[mix(base[0],tip[0],.48)+(i-1)*16,mix(base[1],tip[1],.48)-Math.min(48,Math.hypot(target.x-base[0],target.y-base[1])*.15)-lift*.2];
      const b=options.viewBounds;
      if(b&&(Math.max(base[0],bend[0],tip[0])+20<b.minX||Math.min(base[0],bend[0],tip[0])-20>b.maxX||Math.max(base[1],bend[1],tip[1])+20<b.minY||Math.min(base[1],bend[1],tip[1])-20>b.maxY))continue;
      c.globalAlpha=struck?1-retract*.65:.88;
      tentacle(c,base,bend,tip,options.dense?10:13,{suckers:!options.dense});
      if(struck&&retract<.5&&!options.reduced){
        c.globalAlpha=(1-retract*2)*.7;c.strokeStyle='#c9eee3';c.lineWidth=2;
        c.beginPath();c.ellipse(target.x,target.y,9+retract*35,4+retract*14,0,0,TAU);c.stroke();
      }
    }
  }
  c.restore();
}
