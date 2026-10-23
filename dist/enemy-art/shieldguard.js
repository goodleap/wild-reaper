import { clamp, line, oval, poly, star } from './drawing.js';

const P={edge:'#37483e',steel:'#a7b4a7',shade:'#7e9184',light:'#d4dac4',cloth:'#798b79',linen:'#ddd4b0',leather:'#665b44',skin:'#e2cba5',skinShade:'#c2ad88',eye:'#354637',red:'#9c6756'};
const paint=(c,fill,edge=P.edge,width=1.45)=>{c.fillStyle=fill;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function action(p,pose){
  const mode=pose.mode||'move',progress=smooth(pose.progress||0),moving=mode==='move'||mode==='rush'||!!pose.moving;
  return {step:moving?p:0,brace:mode==='windup'?progress:mode==='active'||mode==='rush'?1:mode==='recovery'?1-progress:0,hit:mode==='hit'?1-progress:0};
}
function boot(c,x,lift){
  line(c,[[x,12],[x,18-lift]],P.shade,5);
  c.beginPath();c.moveTo(x-3.5,17-lift);c.quadraticCurveTo(x-.5,15.5-lift,x+2.8,17-lift);c.quadraticCurveTo(x+5.6,18-lift,x+4.4,21-lift);c.quadraticCurveTo(x,22.3-lift,x-4,20.7-lift);c.quadraticCurveTo(x-5,19-lift,x-3.5,17-lift);c.closePath();paint(c,P.leather,P.edge,1.15);
  line(c,[[x-1.8,18],[x+1.5,18]].map(([a,b])=>[a,b-lift]),'#a79d76',.85);
}
function head(c){
  // The offset brow, unequal eyes and visible far cheek turn the face without
  // stretching it into a narrow profile. The helmet is one broad rounded mass.
  c.beginPath();c.moveTo(-14,-13);c.quadraticCurveTo(-16,-29,-2,-32);c.quadraticCurveTo(10,-35,15,-23);c.quadraticCurveTo(18,-13,12,-5);c.quadraticCurveTo(1,0,-10,-5);c.closePath();paint(c,P.steel);
  c.beginPath();c.moveTo(-12,-15);c.quadraticCurveTo(-14,-27,-4,-29);c.quadraticCurveTo(-8,-21,-7,-12);c.lineTo(-7,-5);c.lineTo(-12,-7);c.closePath();paint(c,P.shade,null);
  c.beginPath();c.moveTo(-5,-20);c.quadraticCurveTo(4,-24,13,-18);c.lineTo(13,-10);c.quadraticCurveTo(12,-4,6,-3.5);c.quadraticCurveTo(-2,-4,-5,-9);c.closePath();paint(c,P.skin,P.edge,1.15);
  c.beginPath();c.moveTo(-5,-17);c.lineTo(-1,-18);c.lineTo(-1,-9);c.quadraticCurveTo(0,-6,5,-4);c.quadraticCurveTo(-3,-4,-5,-10);c.closePath();paint(c,P.skinShade,null);
  // One brow band and two cheek guards replace the old stacked plate lines.
  c.beginPath();c.moveTo(-13,-20);c.quadraticCurveTo(-2,-26,14,-20);c.lineTo(15,-16.5);c.quadraticCurveTo(2,-20,-12,-16);c.closePath();paint(c,P.light,P.edge,1.2);
  c.beginPath();c.moveTo(-13,-17);c.lineTo(-5,-18);c.lineTo(-5,-9);c.quadraticCurveTo(-5,-6,-2,-4);c.lineTo(-9,-4);c.quadraticCurveTo(-14,-7,-13,-17);c.closePath();paint(c,P.shade,P.edge,1.25);
  c.beginPath();c.moveTo(13,-17);c.lineTo(16,-16);c.lineTo(15,-8);c.quadraticCurveTo(14,-4,11,-4);c.lineTo(10,-6);c.quadraticCurveTo(13,-10,13,-17);c.closePath();paint(c,P.steel,P.edge,1.1);
  line(c,[[-8,-27],[-3,-29],[4,-29]],P.light,1.2);
  oval(c,1.1,-12.8,1.25,1.9,P.eye);oval(c,8.2,-12.4,1.65,2.1,P.eye);
  line(c,[[.1,-16],[2.2,-15.6]],P.edge,.9);line(c,[[6.9,-15.3],[9.6,-15.8]],P.edge,.9);
  line(c,[[4,-7],[7,-7]],'#a3896b',.85);
}
export function paintShieldguard(c,p,flip=1,pose={}){
  const a=action(p,pose),bodyY=a.brace*.9-Math.abs(a.step)*.5;
  c.save();c.scale(flip,1);c.translate(-a.hit*1.1,0);
  boot(c,-7+a.step*1.3,Math.max(0,a.step)*1.7);boot(c,7-a.step*1.3,Math.max(0,-a.step)*1.7);
  c.translate(a.brace*.6,bodyY);
  // The sword and its glove use one grip point throughout the gait and brace.
  const handX=-19+a.brace*1.2,handY=7-a.brace*3+a.step*.7;
  line(c,[[-10,-2],[-15,1],[handX,handY]],P.edge,7);line(c,[[-10,-2],[-15,1],[handX,handY]],P.shade,4.5);
  c.save();c.translate(handX,handY);c.rotate(-.12+a.brace*.08);
  poly(c,[[-2,-3],[-2,-16],[0,-20],[2,-16],[2,-3]],P.light,P.edge,1.1);line(c,[[0,-16],[0,-4]],P.steel,.85);
  line(c,[[-4,-2],[4,-2]],P.leather,2.6);line(c,[[0,-1],[0,6]],P.leather,3.1);oval(c,0,6.5,2,1.6,P.light);c.restore();
  oval(c,handX,handY,3.2,3,P.edge);oval(c,handX,handY-.3,2.3,2.1,P.skin);
  c.beginPath();c.moveTo(-10,-5);c.quadraticCurveTo(0,-8,11,-4);c.quadraticCurveTo(14,2,14,12);c.quadraticCurveTo(2,18,-13,13);c.quadraticCurveTo(-15,5,-10,-5);c.closePath();paint(c,P.cloth);
  c.beginPath();c.moveTo(-8,-4);c.quadraticCurveTo(2,-7,11,-3);c.lineTo(10,6);c.quadraticCurveTo(0,10,-10,6);c.closePath();paint(c,P.steel,P.edge,1.2);
  c.beginPath();c.moveTo(-5,-3);c.quadraticCurveTo(2,-5,7,-3);c.lineTo(8,13);c.quadraticCurveTo(3,15,-4,13);c.closePath();paint(c,P.linen,null);
  line(c,[[-11,8],[1,10],[12,8]],P.leather,2.8);poly(c,[[1,8],[4,8],[4,11],[1,11]],'#cab582',P.leather,.7);
  c.beginPath();c.moveTo(-11,-5);c.quadraticCurveTo(-3,-8,5,-6);c.lineTo(12,-2);c.quadraticCurveTo(3,1,-6,-1);c.closePath();paint(c,P.red,P.edge,1);
  head(c);c.restore();
}
export function shieldOverlay(c,e,{reduced=false}={}){
  const s=e.specialist,phase=s?.phase||'idle',progress=clamp(1-(s?.timer||0)/(s?.maxTime||1),0,1),active=phase==='active';
  const ready=active?1:phase==='windup'?smooth(progress):phase==='recovery'?1-smooth(progress):0;
  const angle=Number.isFinite(s?.angle)&&phase!=='idle'?s.angle:Number.isFinite(e.visualFacing)?e.visualFacing:0;
  // Retain the existing directional plate projection and its gameplay angle.
  const ux=Math.cos(angle),uy=Math.sin(angle),acrossX=-(uy<0?-1:1)*(.48+Math.abs(uy)*.52),acrossY=ux*.22,x=ux*(15+ready*3),y=4+uy*8+(1-ready)*5;
  const point=(side,height)=>[x+acrossX*side,y+acrossY*side+height];
  c.save();
  // A small forearm connects the free hand to the live shield, even as its
  // plane turns independently of the cached three-quarter body.
  const shoulder={x:ux*10,y:-1+uy*3},dx=x-shoulder.x,dy=y-shoulder.y;
  oval(c,(x+shoulder.x)*.5,(y+shoulder.y)*.5,Math.hypot(dx,dy)*.5+2.4,3.4,P.edge,Math.atan2(dy,dx));
  oval(c,(x+shoulder.x)*.5,(y+shoulder.y)*.5-.4,Math.hypot(dx,dy)*.5+1.3,2.2,P.shade,Math.atan2(dy,dx));
  poly(c,[point(-12,-15),point(0,-18),point(12,-15),point(11,6),point(0,14),point(-11,6)],P.steel,active?'#e1c387':P.edge,active?1.8:1.5);
  poly(c,[point(-8,-11),point(0,-13),point(8,-11),point(7,3),point(0,9),point(-7,3)],'#748979',P.light,1.1);
  poly(c,[point(-2,-10),point(2,-10),point(2,5),point(0,8),point(-2,5)],P.linen);
  oval(c,x,y-2,2.5,2.5,'#b9a273');oval(c,x-.5,y-2.6,.9,.9,'#e2cf9a');
  if(active){c.strokeStyle=e.hit>0?'#fff6cd':'#dec78e';c.lineWidth=e.hit>0?2.8:1.5;c.globalAlpha=reduced?.65:.85;c.beginPath();c.ellipse(0,20,24,10,0,angle-.7,angle+.7);c.stroke();if(e.hit>0)star(c,x+ux*3,y-3,5,'#fff0c3');}
  c.restore();
}
