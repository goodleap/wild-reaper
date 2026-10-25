import { clamp, line, oval, poly } from './drawing.js';
import { capsulePath } from '../attack-capsule.js';
import { humanAttackCapsules } from '../royal-attack-geometry.js';

const P={edge:'#3d493e',metal:'#a5b0a2',metalDark:'#788b80',light:'#d9ddc3',cloth:'#9e6b57',clothDark:'#725244',linen:'#d9cba1',gold:'#c7ab70',skin:'#e5c9a0',skinDark:'#bd9e7c',eye:'#354334',leather:'#665845'};
const fill=(c,color,edge=P.edge,width=1.2)=>{c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function state(p,pose){const t=smooth(pose.progress||0);return {step:pose.mode==='move'||pose.moving?p:0,ready:pose.mode==='windup'?t:pose.mode==='active'?1:pose.mode==='recovery'?1-t:0,hit:pose.mode==='hit'?1-t:0};}
function boot(c,x,lift){
  line(c,[[x,9],[x,16-lift]],P.metalDark,5);
  c.beginPath();c.moveTo(x-3.5,15-lift);c.quadraticCurveTo(x+.3,14.4-lift,x+3.1,16-lift);c.quadraticCurveTo(x+5.5,18-lift,x+3.6,20-lift);c.quadraticCurveTo(x,21.2-lift,x-4.1,19.2-lift);c.lineTo(x-3.5,15-lift);fill(c,P.leather);
  line(c,[[x-2,16.5-lift],[x+1.7,16.5-lift]],P.gold,.8);
}
function arm(c,shoulder,hand,color=P.metalDark){
  const elbow=[shoulder[0]*.4+hand[0]*.6,shoulder[1]*.45+hand[1]*.55+2];
  line(c,[shoulder,elbow,hand],P.edge,6.4);line(c,[shoulder,elbow,hand],color,4.2);
}
function glove(c,x,y){oval(c,x,y,3.1,2.9,P.edge);oval(c,x+.3,y-.3,2.2,2.1,P.skin);}
function face(c,kind){
  // The far cheek and smaller far eye keep every face three-quarter, while
  // the rounded brow and short chin retain the hero's broad-headed scale.
  c.beginPath();c.moveTo(-9,-24);c.quadraticCurveTo(0,-31,10,-24);c.quadraticCurveTo(15,-20,13,-11);c.quadraticCurveTo(12,-4,5,-3.6);c.quadraticCurveTo(-5,-3,-9,-10);c.quadraticCurveTo(-12,-18,-9,-24);fill(c,P.skin);
  c.beginPath();c.moveTo(-8,-22);c.lineTo(-3,-24);c.quadraticCurveTo(-6,-10,1,-4.7);c.quadraticCurveTo(-8,-5,-9,-12);c.closePath();fill(c,P.skinDark,null);
  oval(c,-8.5,-14,2.7,3.4,P.skin);line(c,[[-9.2,-15],[-8,-13.4]],P.skinDark,.7);
  oval(c,0,-14.3,1.25,1.8,P.eye);oval(c,7.8,-13.6,1.65,2.15,P.eye);
  line(c,[[-1.3,-18],[1.1,-17.7]],P.eye,1);line(c,[[6.1,-17.2],[9,-17.6]],P.eye,1);
  line(c,[[4.7,-11.5],[5.5,-10.5],[4.1,-10]],P.skinDark,.7);
  line(c,[[3.3,-7.1],[6.4,-7]],'#a28566',.8);
  if(kind==='searchcaptain'){
    c.beginPath();c.moveTo(1,-8);c.quadraticCurveTo(4,-10,5,-8.5);c.quadraticCurveTo(8,-10,10,-7.5);c.quadraticCurveTo(6,-6.6,5,-7.4);c.quadraticCurveTo(2,-6.4,1,-8);fill(c,'#66513e',null);
  }else if(kind==='escortmarshal'){
    c.beginPath();c.moveTo(-3,-9);c.quadraticCurveTo(1,-6,5,-7);c.quadraticCurveTo(9,-6,12,-9);c.quadraticCurveTo(12,-3,7,-.8);c.quadraticCurveTo(1,-.3,-3,-5);c.closePath();fill(c,'#64594a',P.edge,.8);line(c,[[3,-4],[6,-3],[9,-4]],'#a39777',.7);
  }
}
function helmet(c,kind){
  if(kind==='royalmage'){
    c.beginPath();c.moveTo(-11,-6);c.quadraticCurveTo(-18,-12,-15,-23);c.quadraticCurveTo(-12,-32,-4,-32);c.quadraticCurveTo(8,-35,16,-22);c.quadraticCurveTo(6,-27,-3,-23);c.quadraticCurveTo(-9,-17,-6,-7);c.lineTo(-11,-6);fill(c,'#826778');
    c.beginPath();c.moveTo(-13,-22);c.quadraticCurveTo(-11,-28,-3,-30);c.lineTo(1,-28);c.quadraticCurveTo(-7,-24,-9,-17);c.closePath();fill(c,'#ac8991',null);line(c,[[-6,-25],[4,-27],[11,-25]],P.gold,1);return;
  }
  if(kind==='royalarbalist'){
    c.beginPath();c.moveTo(-13,-17);c.quadraticCurveTo(-17,-30,-3,-31);c.quadraticCurveTo(6,-34,12,-27);c.lineTo(9,-24);c.quadraticCurveTo(1,-26,-9,-18);c.closePath();fill(c,'#687d62');
    c.beginPath();c.moveTo(-12,-20);c.quadraticCurveTo(1,-26,13,-23);c.quadraticCurveTo(18,-22,16,-19);c.quadraticCurveTo(4,-23,-11,-17);c.closePath();fill(c,P.leather);line(c,[[-8,-27],[-1,-29],[4,-29]],'#9bab7c',1);return;
  }
  const boss=kind==='searchcaptain'||kind==='escortmarshal';
  c.beginPath();c.moveTo(-13,-13);c.quadraticCurveTo(-18,-30,-3,-33);c.quadraticCurveTo(10,-36,15,-24);c.lineTo(15,-18);c.quadraticCurveTo(5,-24,-5,-20);c.lineTo(-6,-10);c.lineTo(-11,-6);c.closePath();fill(c,kind==='royallancer'?'#ada782':P.metal);
  c.beginPath();c.moveTo(-12,-24);c.quadraticCurveTo(-10,-30,-4,-31);c.lineTo(-6,-21);c.lineTo(-8,-11);c.lineTo(-11,-10);c.closePath();fill(c,P.metalDark,null);
  c.beginPath();c.moveTo(-13,-20);c.quadraticCurveTo(0,-26,15,-20);c.lineTo(15,-16.7);c.quadraticCurveTo(2,-21,-12,-16.8);c.closePath();fill(c,boss?P.gold:P.light,P.edge,.9);
  if(kind!=='royallancer'){
    poly(c,[[-12,-18],[-6,-19],[-6,-8],[-9,-5],[-12,-8]],P.metalDark,P.edge,.85);
    poly(c,[[12,-17],[15,-16],[14,-8],[11,-5],[10,-8]],P.metal,P.edge,.85);
  }
  if(kind==='searchcaptain'){
    c.beginPath();c.moveTo(-5,-31);c.quadraticCurveTo(-10,-39,-2,-41);c.quadraticCurveTo(7,-42,12,-34);c.quadraticCurveTo(4,-37,1,-30);c.closePath();fill(c,P.cloth);line(c,[[-3,-37],[1,-38],[7,-35]],'#c58b6d',1);
  }else if(kind==='escortmarshal'){
    poly(c,[[-4,-32],[0,-37],[4,-32],[3,-23],[-2,-23]],P.gold,P.edge,.9);
  }else line(c,[[-2,-32],[-1,-25]],P.light,1.4);
}
function torso(c,kind,a){
  const mage=kind==='royalmage',boss=kind==='searchcaptain'||kind==='escortmarshal',cloth=mage?'#826778':kind==='royalarbalist'?'#9f936f':P.cloth;
  if(boss||mage){
    c.beginPath();c.moveTo(-9,-7);c.quadraticCurveTo(-15,-6,-18,11+a.step);c.quadraticCurveTo(-11,17,-5,12);c.lineTo(4,8);c.lineTo(12,14);c.quadraticCurveTo(17,16,19,11-a.step);c.lineTo(11,-6);c.closePath();fill(c,boss?P.clothDark:'#604f60');
  }
  c.beginPath();c.moveTo(-9,-7);c.quadraticCurveTo(0,-11,10,-5);c.quadraticCurveTo(11,3,mage?15:12,13);c.quadraticCurveTo(2,17,-13,12);c.quadraticCurveTo(-11,2,-9,-7);c.closePath();fill(c,cloth);
  if(!mage){
    c.beginPath();c.moveTo(-9,-4);c.quadraticCurveTo(1,-7,10,-3);c.lineTo(10,5);c.quadraticCurveTo(2,9,-10,5);c.closePath();fill(c,kind==='royalarbalist'?'#b7ac84':P.metal,P.edge,1);
    poly(c,[[-3,-5],[4,-4],[5,13],[-4,13]],boss?P.clothDark:P.linen,null);
    if(boss){for(const side of [-1,1]){oval(c,side*10,-3,6,3.2,P.edge);oval(c,side*10,-4,5.2,2.4,P.gold);}}
  }else{
    poly(c,[[-6,-7],[1,-4],[8,-6],[5,-1],[2,2],[-2,0]],P.linen,P.edge,.8);
    line(c,[[0,3],[2,13]],P.gold,1.3);line(c,[[-10,11],[-2,13],[10,12]],'#b29a98',.9);
  }
  line(c,[[-10,7],[1,9],[11,7]],P.leather,2.7);poly(c,[[0,7],[3,7],[3,10],[0,10]],P.gold,P.edge,.65);
  if(kind==='royalarbalist')line(c,[[-8,-3],[7,12]],P.leather,2.8);
}
function sword(c,x,y,a,saber=false){
  c.save();c.translate(x,y);c.rotate(-.42-a*.68);
  c.beginPath();c.moveTo(-1.5,-3);c.lineTo(-1.8,-23);c.quadraticCurveTo(0,-29,2,-31);c.quadraticCurveTo(saber?6:3,-17,2.5,-3);c.closePath();fill(c,P.light,P.edge,1);line(c,[[.3,-24],[.4,-5]],P.metalDark,.7);
  line(c,[[-5,-2],[4,-2]],P.gold,2.5);line(c,[[0,-1],[0,6]],P.leather,3);oval(c,0,7,2,1.5,P.gold);c.restore();
}
function shield(c,x,y,a){
  c.save();c.translate(x+a*2,y-a*2);
  c.beginPath();c.moveTo(-9,-13);c.quadraticCurveTo(1,-17,11,-11);c.lineTo(10,4);c.quadraticCurveTo(7,11,1,14);c.quadraticCurveTo(-6,10,-9,3);c.closePath();fill(c,P.metal,P.edge,1.5);
  c.beginPath();c.moveTo(-6,-10);c.quadraticCurveTo(1,-13,8,-8);c.lineTo(7,3);c.lineTo(1,10);c.lineTo(-6,2);c.closePath();fill(c,P.cloth,P.light,.8);
  line(c,[[0,-10],[1,7]],P.linen,2.2);line(c,[[-4,-3],[6,-2]],P.linen,1.6);c.restore();
}
function spear(c,x,y,a){
  c.save();c.translate(x,y);c.rotate(.48-a*.7);
  line(c,[[0,20],[0,-35]],P.edge,3.8);line(c,[[0,19],[0,-35]],'#ae9168',2);
  poly(c,[[0,-48],[-4,-36],[0,-31],[4,-36]],P.light,P.edge,1);line(c,[[0,-45],[0,-33]],P.metalDark,.7);
  c.beginPath();c.moveTo(1,-32);c.quadraticCurveTo(10,-31,10,-23);c.lineTo(5,-26);c.lineTo(1,-26);c.closePath();fill(c,P.cloth,P.edge,.7);c.restore();
}
function crossbow(c,x,y,a){
  c.save();c.translate(x,y);c.rotate(-.28-a*.2);
  line(c,[[-5,12],[2,-10]],P.edge,5);line(c,[[-5,12],[2,-10]],'#a48860',3);
  c.beginPath();c.moveTo(-14,-2);c.quadraticCurveTo(0,-13,15,-2);c.strokeStyle=P.edge;c.lineWidth=3.8;c.stroke();c.strokeStyle=P.metal;c.lineWidth=2;c.stroke();
  line(c,[[-14,-2],[0,4],[15,-2]],P.linen,.9);line(c,[[0,6],[1,-14]],P.gold,1.3);poly(c,[[1,-18],[-1,-12],[3,-12]],P.light,P.edge,.6);c.restore();
}
function staff(c,x,y,a){
  c.save();c.translate(x,y);c.rotate(.35-a*.17);
  line(c,[[0,18],[0,-28]],P.edge,4);line(c,[[0,18],[0,-28]],'#9d825e',2.3);
  c.beginPath();c.moveTo(-3,-25);c.quadraticCurveTo(-10,-29,-6,-36);c.quadraticCurveTo(0,-41,6,-35);c.quadraticCurveTo(9,-29,3,-25);c.strokeStyle=P.edge;c.lineWidth=4;c.stroke();c.strokeStyle=P.gold;c.lineWidth=2;c.stroke();
  oval(c,0,-32,3.6,4.6,'#d4a18d');oval(c,1,-33.2,1.4,2,'#f3d4a8');c.restore();
}
function hammer(c,x,y,a){
  c.save();c.translate(x,y);c.rotate(.66-a*.8);
  line(c,[[0,18],[0,-28]],P.edge,4.2);line(c,[[0,18],[0,-28]],'#a0855f',2.3);
  poly(c,[[-9,-34],[8,-36],[12,-31],[12,-22],[-7,-21],[-11,-25]],P.metal,P.edge,1.4);
  poly(c,[[-9,-34],[8,-36],[11,-31],[-6,-29]],P.light,P.edge,.7);line(c,[[-2,-31],[-2,-24]],P.gold,3);c.restore();
}
export function paintRoyalUnit(c,kind,p=0,flip=1,pose={}){
  const a=state(p,pose),scale=kind==='searchcaptain'?1.25:kind==='escortmarshal'?1.33:1;
  c.save();c.scale(flip*scale,scale);c.translate(-a.hit,0);
  boot(c,-6+a.step*1.3,Math.max(0,a.step)*1.7);boot(c,6-a.step*1.3,Math.max(0,-a.step)*1.7);
  c.translate(a.ready*.6,-Math.abs(a.step)*.5+a.ready*.6);
  if(kind==='royalarbalist'){
    poly(c,[[-15,-15],[-9,-16],[-6,6],[-12,8]],P.leather,P.edge,1);for(let i=0;i<3;i++){line(c,[[-14+i*2,-11],[-16+i*2,-24]],P.gold,1);poly(c,[[-16+i*2,-25],[-18+i*2,-21],[-14+i*2,-22]],P.linen,null);}
  }
  const left=[-15-a.ready*2,5-a.ready*4],right=[15+a.ready*2,6-a.ready*4];
  arm(c,[-8,-3],left);if(kind==='royalguard'||kind==='searchcaptain')sword(c,...left,a.ready,kind==='searchcaptain');
  torso(c,kind,a);face(c,kind);helmet(c,kind);
  if(kind==='royalguard'){glove(c,...left);arm(c,[9,-2],right);shield(c,...right,a.ready);}
  else if(kind==='searchcaptain'){glove(c,...left);arm(c,[10,-2],right);glove(c,...right);line(c,[[right[0]-1,right[1]],[right[0]+4,right[1]-3]],P.light,1.2);}
  else if(kind==='royallancer'){
    const grip=[16+a.ready*2,3-a.ready*3];arm(c,[9,-2],grip);spear(c,...grip,a.ready);glove(c,...grip);arm(c,[-8,0],[9,10]);glove(c,9,10);
  }else if(kind==='royalarbalist'){
    arm(c,[-8,-1],[1,7-a.ready*4],P.clothDark);arm(c,[9,-1],[15,6-a.ready*4],P.clothDark);crossbow(c,8,3-a.ready*4,a.ready);glove(c,2,8-a.ready*4);glove(c,15,5-a.ready*4);
  }else if(kind==='royalmage'){
    arm(c,[9,-1],right,'#826778');staff(c,...right,a.ready);glove(c,...right);glove(c,...left);
  }else{
    const grip=[14,5-a.ready*4];arm(c,[10,-1],grip);hammer(c,...grip,a.ready);glove(c,...grip);arm(c,[-9,-1],[7,10-a.ready*3]);glove(c,7,10-a.ready*3);
  }
  c.restore();
}
function facing(e,{playerX,facings}){
  const a=e.specialAttack||(e.specialist?.phase!=='idle'?e.specialist:null),angle=Number.isFinite(a?.angle)?a.angle:e.visualFacing;
  const dx=Number.isFinite(angle)?Math.cos(angle):playerX-e.x,flip=Math.abs(dx)<.12?(facings?.get(e)||1):dx<0?-1:1;
  facings?.set(e,flip);return flip;
}
function telegraph(c,e){
  const a=e.specialAttack||e.specialist;if(e.hp<=0||e.guardActive===false||a?.phase!=='windup'||a.kind==='royalSpell')return;
  const progress=clamp(1-a.life/a.maxLife,0,1);c.save();c.beginPath();
  if(a.kind==='royalSweep'){c.moveTo(a.x,a.y);c.arc(a.x,a.y,a.reach,a.angle-a.arc,a.angle+a.arc);c.closePath();}
  else for(const capsule of humanAttackCapsules(a))capsulePath(c,capsule);
  c.fillStyle=`rgba(194,96,63,${.12+progress*.15})`;c.fill();c.strokeStyle='#c47953';c.globalAlpha=.65+progress*.3;c.lineWidth=1.8;c.stroke();c.restore();
}
export const ROYAL_ART=Object.freeze(Object.fromEntries(['royalguard','royallancer','royalarbalist','royalmage','searchcaptain','escortmarshal'].map(kind=>[kind,Object.freeze({animated:true,facing,telegraph,paint:(c,p,flip,pose)=>paintRoyalUnit(c,kind,p,flip,pose)})])));
