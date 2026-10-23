import {paint as boglurker} from './boglurker.js';
import {paint as stoneape} from './stoneape.js';
import {paint as windhunter} from './windhunter.js';
import {paint as flamelizard} from './flamelizard.js';
import { TAU, clamp, poly, line, oval, grad, leaf } from './drawing.js';
import { paintShieldguard, shieldOverlay } from './shieldguard.js';
import { paintFrostmage, paintTidepriest } from './robed-casters.js';
import { BOSS_SPECIALIST_ART } from './specialist-bosses.js';

// Body poses are cached by MonsterArt. Only the directional shield is live:
// its exact facing is also the angle used by combat to resolve front damage.
const eyes=(c,x,y,gap=5,color='#182b30')=>{for(const side of [-1,1]){oval(c,x+side*gap,y,1.7,2.1,color);oval(c,x+side*gap+.45,y-.6,.48,.65,'#f5f3d5');}};
const foot=(c,x,y,p,color='#44544a')=>poly(c,[[x-4,y-9],[x+3,y-9],[x+5+p,y-1],[x+3+p,y+1],[x-6+p,y+1]],color,'#263d37',.8);
const jewel=(c,x,y,r,color='#c5eced')=>{poly(c,[[x,y-r],[x+r*.6,y],[x,y+r],[x-r*.6,y]],color,'#476473',.8);line(c,[[x,y-r],[x,y],[x+r*.6,y]],'#effffe',.7);};
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function state(p,pose){
  const mode=pose.mode||'move',t=clamp(pose.progress||0,0,1),cycle=Number.isFinite(pose.cycle)?pose.cycle:Math.asin(clamp(p,-1,1));
  return {mode,t,cycle,moving:mode==='move'||mode==='air'||!!pose.moving,step:mode==='move'||mode==='air'||pose.moving?p:0,
    prepare:mode==='windup'?smooth(t):0,release:mode==='active'||mode==='rush'?1:0,
    settle:mode==='recovery'?1-smooth(t):0,hit:mode==='hit'?1-smooth(t):0};
}
function profile(e,{playerX,facings}){
  const attack=e.specialAttack||(e.specialist?.phase!=='idle'?e.specialist:null);
  const angle=Number.isFinite(attack?.angle)?attack.angle:Number.isFinite(e.visualFacing)?e.visualFacing:Math.atan2(0,playerX-e.x),dx=Math.cos(angle);
  const direction=Math.abs(dx)<.12?(facings?.get(e)||1):dx<0?-1:1;
  facings?.set(e,direction);return direction;
}
function rootbinder(c,p,flip=1,pose={}){
  const a=state(p,pose),cast=a.prepare+a.release+a.settle*.65,bodyY=cast*2-a.hit*2;
  c.save();c.scale(flip,1);
  for(const side of [-1,1])for(let i=0;i<2;i++){
    const phase=a.cycle+side*.9+i*Math.PI,step=a.moving?Math.sin(phase)*3:0,lift=a.moving?Math.max(0,Math.cos(phase))*2:0;
    line(c,[[side*(6+i*3),8],[side*(12+i*3),14+step],[side*(22+i*3),19-lift]],i?'#40513a':'#526742',4-i);
    line(c,[[side*(13+i*3),14+step],[side*(22+i*3),18-lift]],'#a3ad75',.9);
  }
  for(const side of [-1,1]){
    const elbowY=mix(0,9,cast),handX=mix(24,19,cast),handY=mix(8,19,cast);
    line(c,[[side*11,-6+bodyY],[side*20,elbowY],[side*handX,handY]],'#536c42',5);
    line(c,[[side*11,-7+bodyY],[side*20,elbowY-1],[side*handX,handY-1]],'#a0af76',1.2);
    leaf(c,side*20,elbowY,12,4,side*(.65+cast*.4),'#a4ba6f');
    if(cast>.1)for(let k=0;k<2;k++)line(c,[[side*handX,handY],[side*(handX+3+k*3),20-k],[side*(handX+5+k*3),21-k]],'#8ba75c',1);
  }
  c.translate(a.hit*-1,bodyY);
  poly(c,[[-13,12],[-16,-9],[-10,-23],[2,-29],[14,-19],[16,8],[7,18],[-5,17]],grad(c,-16,18,13,-27,['#465842','#829364','#c2bd83']),'#304735',1.4);
  for(const x of [-8,0,8]){line(c,[[x,-17],[x-2,-4],[x+1,10]],'#536c42',1.3);line(c,[[x-2,-11],[x+2,-7]],'#c0bb8b',.65);}
  oval(c,6,7,3.3,4.7,'#556b46');oval(c,6,7,1.5,2.7,'#a5ad77');
  for(const [x,y,angle]of[[-12,-21,-.8],[-4,-28,-.5],[6,-27,.5],[14,-19,.8]])leaf(c,x,y,17,5,angle+cast*.13,'#88a55f');
  eyes(c,0,-7,5,'#233b29');line(c,[[-4,1],[1,3],[6,0]],'#3b5333',1.2);
  if(cast)jewel(c,0,-18,2+cast*2,'#c8e6a1');c.restore();
}
function prismguard(c,p,flip=1,pose={}){
  const a=state(p,pose),charge=a.prepare+a.release,open=charge*.9+a.settle*.35;
  c.save();c.scale(flip,1);c.translate(-a.release*1.6+a.hit*-1,0);
  for(const side of [-1,1]){
    foot(c,side*9,19,a.step*side*2,'#566d83');
    c.save();c.translate(side*13,-6);c.rotate(-side*open*.42);
    poly(c,[[0,0],[side*10,4],[side*11,16],[side*4,19],[0,10]],'#738e9d','#3c5266',1);jewel(c,side*8,10,5,charge?'#e2fff9':'#c5e3ec');c.restore();
  }
  poly(c,[[-15,-10],[-8,-21],[9,-21],[16,-9],[13,12],[0,18],[-13,12]],grad(c,-16,17,15,-21,['#4d637c','#8ba0b1','#d3dce0']),'#344b64',1.3);
  poly(c,[[-12,-9],[0,-17],[12,-9],[0,5]],'#4b647d');jewel(c,0,-5,12,charge?'#d8fff7':'#a7e2e3');
  line(c,[[-11,4],[-4,10],[0,6],[5,11],[12,4]],'#d6e6de',.9);
  if(charge){oval(c,0,-5,2+charge*3,2+charge*3,'#f7ffef');for(const side of [-1,1])line(c,[[side*13,-5],[side*7,-5]],'#b7f6ed',1.3);}
  poly(c,[[-10,-22],[0,-34],[11,-22],[8,-14],[-7,-14]],'#8da9b7','#39556c',1);poly(c,[[0,-32],[8,-22],[1,-18]],'#c7dce0');line(c,[[-5,-22],[5,-22]],'#ecfff4',2);c.restore();
}
function spiderling(c,p,flip=1,pose={}){
  const a=state(p,pose),bodyLift=a.moving?-Math.abs(Math.sin(a.cycle*2))*.8:0;
  c.save();c.scale(flip,1);
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const y=-8+i*5,phase=a.cycle+i*Math.PI*.85+(side<0?Math.PI:0),step=a.moving?Math.sin(phase)*2.6:0,lift=a.moving?Math.max(0,Math.cos(phase))*2.4:0;
    line(c,[[side*6,y],[side*(13+i%2),y-4+step],[side*(20-i*.6),y+4-lift]],'#5b5a5b',2.1);
    line(c,[[side*7,y],[side*(13+i%2),y-4+step]],'#b2a994',.65);
  }
  c.translate(0,bodyLift+a.hit*1.3);
  oval(c,0,-6,9,10,grad(c,-9,4,8,-16,['#4e4f51','#81777f','#b3a596']));
  poly(c,[[-5,-13],[0,-15],[5,-13],[3,-6],[0,-9],[-3,-6]],'#c4ad9d');
  oval(c,0,5,7,6,'#9c9586');eyes(c,0,4,3,'#382f35');
  line(c,[[-3,10],[-2,12]],'#dcd1b8',1.3);line(c,[[3,10],[2,12]],'#dcd1b8',1.3);c.restore();
}
const art=(paint,extra={})=>Object.freeze({paint,animated:true,facing:profile,...extra});
export const SPECIALIST_ART=Object.freeze({
  rootbinder:art(rootbinder),
  boglurker:art(boglurker),
  prismguard:art(prismguard),
  tidepriest:art(paintTidepriest),
  shieldguard:art(paintShieldguard,{overlay:shieldOverlay}),
  stoneape:art(stoneape),
  windhunter:art(windhunter,{frequency:13}),
  frostmage:art(paintFrostmage),
  flamelizard:art(flamelizard),
  spiderling:art(spiderling,{frequency:14}),
  ...BOSS_SPECIALIST_ART
});
