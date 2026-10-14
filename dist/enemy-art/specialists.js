import { TAU, clamp, poly, line, oval, grad, leaf, star } from './drawing.js';
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
function boglurker(c,p,flip=1,pose={}){
  const a=state(p,pose),crouch=a.prepare*4+a.settle*3,stretch=a.release,headDrop=a.prepare*2-a.release*2;
  c.save();c.scale(flip,1);
  for(const side of [-1,1]){
    const stride=a.step*side*4,backX=-22+a.prepare*5-a.release*6,frontX=9+stride+stretch*11;
    line(c,[[-14,5],[-23,9+crouch],[backX+stride,16]],side<0?'#355954':'#527b67',5);
    foot(c,frontX,16,stretch*3-a.settle*3,side<0?'#3b665c':'#73947c');
  }
  c.save();c.translate(-a.prepare*2+a.release*2,crouch*.65);c.scale(1+stretch*.06,1-a.prepare*.12);
  poly(c,[[-23,1],[-35,2],[-29,8],[-13,7]],'#456b5d','#2f4b41',.8);
  oval(c,-7,0,22,14,grad(c,-26,14,20,-20,['#315b55','#61877a','#a2ad80']));
  oval(c,-16,0,7,9,'#74907b');line(c,[[-21,3],[-18,9],[-10,11]],'#a9b58c',1);
  for(let i=0;i<5;i++)oval(c,-19+i*5,-6+(i%2)*3,2.8,1.6,'#a5b28c');
  c.translate(stretch*2,headDrop);
  oval(c,13,-3,15,10,'#8ba184');oval(c,25,1,8,6,'#91a88b');
  poly(c,[[1,-9],[4,-21],[12,-15],[17,-17],[21,-9]],'#5e8771','#355c50',1);
  oval(c,14,-10,3.4,3.6,a.prepare?'#e3d79a':'#c6c78a');oval(c,15,-10,1.4,2.5,'#263d34');
  line(c,[[11,4],[22,6+stretch*2],[30,3]],'#385148',1.3);for(const x of [20,26])poly(c,[[x,5],[x+2,5],[x+1,8+stretch]],'#e7dfae');
  c.restore();c.restore();
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
function robe(c,a,colors,frost=false){
  for(const side of [-1,1])foot(c,side*6,18,a.step*side*2,colors[0]);
  const hem=a.step*1.6;
  poly(c,[[-10,-8],[9,-8],[15+hem,16],[1+hem*.5,19],[-15+hem,15]],grad(c,-15,19,13,-10,colors),'#345865',1.2);
  if(frost)poly(c,[[-10,-6],[0,3],[10,-6],[5+hem*.5,10],[hem*.5,15],[-5+hem*.5,10]],'#b8d6df','#648ca6',.8);
  else for(let i=0;i<3;i++){line(c,[[-10+i,-1+i*5],[-4,2+i*5],[4,1+i*5],[10+i,3+i*4]],i===1?'#e1d7ad':'#a0cac8',1);}
  line(c,[[-6,-6],[-4+hem*.3,11]],'#ffffff35',1);line(c,[[4,-4],[7+hem*.4,12]],'#34586566',1);
}
function tidepriest(c,p,flip=1,pose={}){
  const a=state(p,pose),lift=a.prepare*5+a.release*5+a.settle*5,push=a.release*3+a.settle*3;
  c.save();c.scale(flip,1);robe(c,a,['#3a687b','#629aab','#b5d6cc']);
  oval(c,0,-15,10,11,'#a8c1b1');
  poly(c,[[-13,-16],[-10,-29],[0,-23],[9,-31],[13,-17],[5,-21],[-4,-20]],'#5f8e9c','#3c616b',1);
  for(const side of [-1,1])for(let i=0;i<3;i++)line(c,[[side*(3+i*2),-21],[side*(6+i*2),-27+i]],'#c1d8ca',.7);
  eyes(c,0,-14,4);
  const handX=19+push,handY=-2-lift,topY=-28-lift*.6;
  line(c,[[10,0],[14,-4-lift*.5],[handX,handY]],'#8fb4ae',4);
  line(c,[[handX,12-lift],[handX,topY]],'#52767b',3);line(c,[[handX-1,10-lift],[handX-1,topY]],'#b8d5c8',.8);
  poly(c,[[handX-5,topY+2],[handX-3,topY-5],[handX,topY-1],[handX+3,topY-5],[handX+5,topY+2],[handX,topY+6]],'#b7e1dc','#528f99',1);
  if(a.prepare){const r=2+a.prepare*2.4;oval(c,handX,topY,r,r,'#a8e9e1');oval(c,handX-1,topY-1,r*.35,r*.25,'#f1fff1');}
  if(a.settle)for(let i=0;i<2;i++)oval(c,handX-4+i*7,topY+9+i*5,1.1,1.8,'#9cdddb');c.restore();
}
function shieldguard(c,p,flip=1,pose={}){
  const a=state(p,pose),brace=a.prepare+a.release,lower=a.settle;
  c.save();c.scale(flip,1);c.translate(brace*.7-a.hit,brace*1.3);
  for(const side of [-1,1])foot(c,side*8,21,a.step*side*(brace?1:2),'#6c6f6c');
  poly(c,[[-13,-10],[12,-10],[16,11],[8,16],[-13,12]],grad(c,-14,15,14,-13,['#515f68','#899392','#c3c3af']),'#374852',1.2);
  for(const y of [-4,3,10])line(c,[[-10,y],[0,y+3],[11,y]],'#b9bfac',1);
  oval(c,0,-17,10,10,'#aab3af');poly(c,[[-12,-19],[-10,-29],[0,-33],[11,-28],[12,-17],[4,-16],[3,-24],[-4,-24],[-4,-16]],'#879da3','#3f535d',1.1);line(c,[[-4,-19],[4,-19]],'#2b3b40',2);
  line(c,[[-10,-6],[-17,2+lower*4]],'#9ba69a',5);line(c,[[10,-6],[16,brace?-5:3]],'#87968e',5);
  line(c,[[-21,-9],[-20,12]],'#849799',3);poly(c,[[-21,-17],[-17,-9],[-20,2],[-24,-9]],'#cfdbd8','#4e646b',.8);c.restore();
}
function shieldOverlay(c,e,{reduced=false}={}){
  const s=e.specialist,phase=s?.phase||'idle',progress=clamp(1-(s?.timer||0)/(s?.maxTime||1),0,1),active=phase==='active';
  const ready=active?1:phase==='windup'?smooth(progress):phase==='recovery'?1-smooth(progress):0;
  const angle=Number.isFinite(s?.angle)&&phase!=='idle'?s.angle:Number.isFinite(e.visualFacing)?e.visualFacing:0;
  const ux=Math.cos(angle),uy=Math.sin(angle),acrossX=-(uy<0?-1:1)*(.48+Math.abs(uy)*.52),acrossY=ux*.22,x=ux*(15+ready*3),y=4+uy*8+(1-ready)*5;
  const point=(side,height)=>[x+acrossX*side,y+acrossY*side+height];
  c.save();
  poly(c,[point(-12,-15),point(0,-18),point(12,-15),point(11,6),point(0,14),point(-11,6)],grad(c,x-12,y+14,x+10,y-18,['#425b69','#798d96','#afc1bf']),active?'#efd69a':'#2f4757',active?1.8:1.2);
  poly(c,[point(-8,-11),point(0,-13),point(8,-11),point(7,3),point(0,9),point(-7,3)],'#637e8c','#c2c9a9',.9);
  jewel(c,x,y-2,4,'#d8bc83');
  if(active){
    c.strokeStyle=e.hit>0?'#fff6cd':'#dec78e';c.lineWidth=e.hit>0?2.8:1.5;c.globalAlpha=reduced?.65:.85;
    c.beginPath();c.ellipse(0,20,24,10,0,angle-.7,angle+.7);c.stroke();
    if(e.hit>0){star(c,x+ux*3,y-3,5,'#fff0c3');}
  }c.restore();
}
function rock(c,x,y,scale=1){
  c.save();c.translate(x,y);c.scale(scale,scale);
  poly(c,[[-9,-7],[1,-10],[9,-3],[6,7],[-5,8],[-11,2]],grad(c,-10,8,8,-10,['#68756b','#9ba59a','#d2d0b9']),'#4e5c53',1.2);
  poly(c,[[-8,-6],[0,-8],[4,-2],[-3,1]],'#bcc2b0');line(c,[[-3,1],[5,5],[7,-2]],'#6d7b72',.9);c.restore();
}
function stoneape(c,p,flip=1,pose={}){
  const a=state(p,pose),throwing=a.mode==='windup',wind=throwing?smooth(Math.min(1,a.t/.5)):0;
  const released=throwing&&a.t>=.5||a.mode==='active'||a.mode==='recovery'&&a.t<.66;
  const swing=throwing&&a.t>=.5?smooth((a.t-.5)/.5):a.release?1:a.mode==='recovery'?(1-smooth(a.t))*1:0;
  const reload=a.mode==='recovery'&&a.t>=.66?smooth((a.t-.66)/.34):0;
  const handX=released?mix(10,27,swing):mix(24,7,wind),handY=released?mix(-26,6,swing):mix(11,-28,wind);
  c.save();c.scale(flip,1);c.translate(-wind*1.5+swing,wind*1.5+swing*2);
  for(const side of [-1,1])foot(c,side*10,22,a.step*side*2,'#5f6054');
  line(c,[[-12,-12],[-23,-3],[-27,13+a.step*2]],'#626f58',9);line(c,[[-14,-12],[-23,-4],[-27,10+a.step*2]],'#a4a88a',2);
  oval(c,-27,14+a.step*2,5,5,'#8a9278');
  oval(c,0,-2,19,24,grad(c,-19,22,19,-29,['#5b6353','#888b6d','#b9b894']));oval(c,0,2,11,14,'#9b9b7d');
  for(const side of [-1,1])line(c,[[side*8,-4],[side*5,8]],'#babb9a',1.1);
  poly(c,[[-15,-18],[-10,-29],[4,-33],[15,-24],[13,-11],[0,-8],[-13,-12]],'#7d846b','#414f43',1.2);oval(c,1,-17,11,8,'#b5b391');eyes(c,0,-19,4);oval(c,0,-13,4,2.4,'#646b55');line(c,[[-5,-9],[4,-9]],'#475441',1.3);
  line(c,[[12,-12],[20-wind*3,-5-wind*15],[handX,handY]],'#707c62',10);line(c,[[13,-14],[21-wind*3,-7-wind*15],[handX,handY-2]],'#adb091',2);
  oval(c,handX,handY,5.2,4.5,'#9ba182');
  if(!released)rock(c,handX+1,handY-2,a.mode==='recovery'?.65+reload*.35:1);
  c.restore();
}
function windhunter(c,p,flip=1,pose={}){
  const a=state(p,pose),bank=a.mode==='active'||a.mode==='rush'?.14:a.mode==='windup'?-.09*a.prepare:0;
  const fold=a.prepare*.35+a.release*.38,brake=a.settle*.5,wingBeat=p*(1-fold);
  c.save();c.scale(flip,1);c.translate(0,a.hit*1.5);c.rotate(bank);
  for(const side of [-1,1]){
    const reach=35-fold*8+brake*2,tipY=-18-wingBeat*5+side*bank*20;
    poly(c,[[side*5,-11],[side*(21-fold*4),-27-wingBeat*3],[side*reach,tipY],[side*(reach-5),tipY+7],[side*22,-13-wingBeat*2],[side*29,-5-wingBeat],[side*18,-8],[side*14,2]],grad(c,-37,3,37,-33,['#506c7d','#83a5b4','#d0e1db']),'#3a566b',1.1);
    for(let i=0;i<3;i++)line(c,[[side*(14+i*3),-16-wingBeat],[side*(24+i*4-fold*5),tipY+5+i*3]],'#c8ded7',.7);
  }
  poly(c,[[-7,-7],[-4,7],[-12-brake*3,9],[-2,13],[4,9],[7,-9]],'#6b8b98','#38596c',1);oval(c,2,-8,8,14,'#91b2bc');
  poly(c,[[-3,-14],[3,-8],[7,-14],[5,-3],[0,3],[-4,-5]],'#c4dbd4');oval(c,4,-20,8,8,'#c1d5cf');poly(c,[[10,-22],[19,-18],[10,-15]],'#dcce94','#7d866c',.8);oval(c,7,-21,1.8,2,'#273e4d');line(c,[[1,-25],[9,-25]],'#486c83',1.2);c.restore();
}
function frostmage(c,p,flip=1,pose={}){
  const a=state(p,pose),lift=a.prepare*6+a.release*6+a.settle*6,push=a.release*2+a.settle*2;
  c.save();c.scale(flip,1);robe(c,a,['#4d698f','#799ebc','#c0d9dd'],true);
  oval(c,0,-15,9,10,'#bed6d2');poly(c,[[-15,-19],[-7,-28],[-2,-37],[7,-32],[10,-20],[16,-17],[0,-16]],'#739db9','#3f638b',1.2);poly(c,[[-7,-27],[-2,-36],[0,-24]],'#d1e5e5');eyes(c,0,-14,4);
  const handX=19+push,topY=-29-lift*.45;
  line(c,[[11,-1],[15,-4-lift*.5],[handX,-6-lift]],'#9abcc9',4);line(c,[[handX,13-lift],[handX,topY]],'#7395a9',3);line(c,[[handX-1,12-lift],[handX-1,topY]],'#d1e7e1',.8);jewel(c,handX,topY,6,'#d2f7f5');
  if(a.prepare)for(let i=0;i<3;i++){const angle=(i-1)*.65-Math.PI/2,x=handX+Math.cos(angle)*7,y=topY+Math.sin(angle)*5;jewel(c,x,y,1.5+a.prepare,'#e5fff8');}
  c.restore();
}
function flamelizard(c,p,flip=1,pose={}){
  const a=state(p,pose),heat=a.prepare+a.release+a.settle*.55,jaw=a.release*3.3+a.settle*1.8,breath=a.mode==='recovery'?Math.sin(a.t*Math.PI*4)*(1-a.t):0;
  c.save();c.scale(flip,1);
  for(const x of [-12,11])foot(c,x-3,14,-a.step*(x<0?-2:2),'#77523f');
  poly(c,[[-16,1],[-30,-2+a.step],[-38,4+a.step*1.3],[-30,9],[-14,12]],'#92674c','#5a4b3e',1);
  oval(c,-3,1+breath*.5,21,13+breath*.4,grad(c,-25,14,23,-15,['#8a5643','#bf8055','#e2b478']));
  for(const x of [-18,-9,0,9])poly(c,[[x-5,-8],[x,-19+(x%3)],[x+5,-8]],heat>.6?'#ecb465':'#d69a58','#936344',.7);
  for(let i=0;i<4;i++)line(c,[[-17+i*6,3],[-14+i*6,5],[-11+i*6,3]],'#e5b477',.7);
  oval(c,15,3,9,7+heat*.7,heat>.7?'#e2a464':'#c28b5c');
  if(heat){oval(c,17,3,5.3,3.4,'#edb76e');oval(c,18,2,3,1.6,'#ffe6a8');}
  c.save();c.translate(-a.prepare*1.5+a.release*1.8,-a.prepare*.7+breath*.7);
  oval(c,20,-3,13,9,'#c48a5c');
  poly(c,[[26,-7],[35,-3],[35,1],[23,3],[14,0]],'#d9a169','#805b42',1);
  if(jaw)poly(c,[[23,2],[35,1],[34,3+jaw],[24,4+jaw]],'#6c3c2e');
  poly(c,[[24,3+jaw],[35,2+jaw],[33,6+jaw],[24,8+jaw],[17,5]],'#cc945e','#805b42',.8);
  oval(c,21,-9,2.5,2.4,'#f4dc9d');oval(c,21.7,-9,1,1.9,'#493d33');
  for(const x of [27,32])poly(c,[[x,1],[x+1.5,1],[x+.5,3]],'#f2d7a0');c.restore();
  for(const x of [-12,11])foot(c,x,17,a.step*(x<0?-2:2),'#9a6747');c.restore();
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
  tidepriest:art(tidepriest),
  shieldguard:art(shieldguard,{overlay:shieldOverlay}),
  stoneape:art(stoneape),
  windhunter:art(windhunter,{frequency:13}),
  frostmage:art(frostmage),
  flamelizard:art(flamelizard),
  spiderling:art(spiderling,{frequency:14}),
  ...BOSS_SPECIALIST_ART
});
