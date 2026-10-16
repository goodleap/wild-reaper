import {clamp, line, oval, poly} from './drawing.js';

const INK='#293f3e';
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function state(p,pose){
  const mode=pose.mode||(p?'move':'idle'),progress=clamp(finite(pose.progress),0,1);
  return {mode,action:pose.action||'',progress,
    cycle:finite(pose.cycle,Math.asin(clamp(finite(p),-1,1))),
    moving:pose.moving??(mode==='move'||mode==='rush'),
    wind:mode==='windup'?smooth(progress):0,
    strike:mode==='active'?1:0,rest:mode==='recovery'?1-smooth(progress):0,
    hit:mode==='hit'?1-smooth(progress):0};
}
function fill(c,color,edge=INK,width=1.8){
  c.fillStyle=color;c.fill();
  if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}
}
function begin(c,flip){c.save();c.scale(flip===-1?-1:1,1);c.lineJoin='round';c.lineCap='round';}
function eye(c,x,y,rx,ry,color){
  oval(c,x,y,rx,ry,color);oval(c,x+.5,y-.6,.65,.75,'#fff3d5');
}

// Broad-shell lake beast. The shell bears the weight; only the two flexible
// forearms rise to cast, keeping it distinct from the eight-armed deepcaller.
export function drownedWatcher(c,p,flip=1,pose={}){
  const s=state(p,pose),cast=s.wind+s.strike*.8+s.rest*.35;
  const wave=s.action==='tidalWave',vortex=s.action==='vortex';
  const step=s.moving?Math.sin(s.cycle):0,bob=s.moving?-Math.abs(Math.sin(s.cycle*2))*.8:0;
  begin(c,flip);
  // A broad rear fin is seen past the shell, with one large membrane plane.
  c.beginPath();c.moveTo(-24,4);c.quadraticCurveTo(-43,-2,-57,-12);
  c.quadraticCurveTo(-55,3,-63,15);c.quadraticCurveTo(-49,15,-44,26);
  c.quadraticCurveTo(-30,25,-23,14);c.closePath();fill(c,'#5c837a');
  c.beginPath();c.moveTo(-29,10);c.quadraticCurveTo(-45,7,-54,-5);
  c.strokeStyle='#a3ba9c';c.lineWidth=2;c.stroke();
  c.beginPath();c.moveTo(-40,13);c.quadraticCurveTo(-47,15,-46,22);
  c.strokeStyle='#345d58';c.lineWidth=1.4;c.stroke();
  // Continuous muscular foot, rather than a fringe of identical tentacles.
  c.beginPath();c.moveTo(-34,12);c.quadraticCurveTo(-17,6,13,13);
  c.quadraticCurveTo(38,20,48+step*2,30);c.quadraticCurveTo(49,38,40,39);
  c.quadraticCurveTo(21,40,-3,38);c.quadraticCurveTo(-27,41,-43,34);
  c.quadraticCurveTo(-52,28,-43,21);c.closePath();fill(c,'#53766b');
  c.beginPath();c.moveTo(-36,29);c.quadraticCurveTo(-9,33,32,31);
  c.strokeStyle='#94aa87';c.lineWidth=3;c.stroke();
  c.save();c.translate(-step*.5,bob+s.hit);
  // Off-centre spiral, a thick raised rim and an exposed dark shell opening.
  c.beginPath();c.moveTo(-38,15);c.bezierCurveTo(-51,-3,-45,-34,-28,-49);
  c.bezierCurveTo(-15,-62,8,-58,20,-43);c.bezierCurveTo(30,-29,29,-9,20,9);
  c.quadraticCurveTo(11,25,-12,26);c.quadraticCurveTo(-29,27,-38,15);c.closePath();fill(c,'#8c997c');
  c.beginPath();c.moveTo(-38,11);c.bezierCurveTo(-47,-6,-41,-33,-26,-46);
  c.bezierCurveTo(-13,-57,7,-52,17,-39);c.quadraticCurveTo(25,-23,17,-10);
  c.bezierCurveTo(11,1,-7,5,-18,-3);c.bezierCurveTo(-28,-10,-26,-29,-15,-33);
  c.bezierCurveTo(-5,-36,4,-29,2,-20);c.quadraticCurveTo(1,-14,-6,-13);
  c.strokeStyle='#c0bd92';c.lineWidth=6;c.stroke();
  c.beginPath();c.moveTo(-37,13);c.bezierCurveTo(-43,-4,-39,-27,-29,-39);
  c.strokeStyle='#4c6d62';c.lineWidth=3;c.stroke();
  c.beginPath();c.moveTo(-27,20);c.quadraticCurveTo(-5,30,15,13);
  c.quadraticCurveTo(29,0,22,-15);c.quadraticCurveTo(8,-20,0,-7);
  c.quadraticCurveTo(-10,7,-27,20);c.closePath();fill(c,'#354f4b',null);
  // Low head emerging from the opening; both eyes occupy the turned plane.
  const headY=wave?s.wind*2-s.strike*2:0;
  c.save();c.translate(0,headY);
  c.beginPath();c.moveTo(1,5);c.quadraticCurveTo(8,-12,25,-12);
  c.quadraticCurveTo(39,-14,47,-5);c.quadraticCurveTo(55,2,52,12);
  c.quadraticCurveTo(49,23,31,25);c.quadraticCurveTo(12,25,4,17);
  c.quadraticCurveTo(-1,13,1,5);c.closePath();fill(c,'#7fa395');
  c.beginPath();c.moveTo(9,7);c.quadraticCurveTo(17,-2,31,3);
  c.quadraticCurveTo(42,5,50,1);c.quadraticCurveTo(53,13,42,18);
  c.quadraticCurveTo(24,24,10,16);c.closePath();fill(c,'#b5c3a1',null);
  c.beginPath();c.moveTo(18,-5);c.quadraticCurveTo(23,-10,28,-6);
  c.moveTo(34,-6);c.quadraticCurveTo(42,-11,47,-3);
  c.strokeStyle='#3f655b';c.lineWidth=3;c.stroke();
  eye(c,23,-3,2.1,2.9,'#ecce82');eye(c,39,-2,2.7,3.4,'#f2d890');
  line(c,[[31,14],[40,15],[47,11]],'#486e60',1.8);
  oval(c,48,6,1.6,1.2,'#486d60');
  c.restore();c.restore();
  // Far arm is narrow and darker; the near arm grows smoothly from its root.
  for(const near of [false,true]){
    const x=near?17:2,phase=s.cycle+(near?0:Math.PI);
    const stride=s.moving?Math.sin(phase)*4:0;
    const rise=cast*(near?23:16),tipX=(near?60:-35)+(wave?cast*2:0);
    const tipY=(near?32:29)-rise+(s.moving?Math.min(0,Math.cos(phase))*3:0);
    c.beginPath();c.moveTo(x,16);c.bezierCurveTo(x+18,23+stride,tipX+5,tipY-11,tipX,tipY-2);
    c.quadraticCurveTo(tipX-3,tipY+6,tipX-11,tipY+4);
    c.quadraticCurveTo(tipX-16,tipY+2,tipX-12,tipY-2);
    c.quadraticCurveTo(tipX-7,tipY+1,tipX-6,tipY-3);
    c.bezierCurveTo(tipX-2,tipY-8,x+15,31+stride,x-5,27);c.closePath();
    fill(c,near?'#7e9f87':'#5b8277',INK,1.6);
    c.beginPath();c.moveTo(x+1,20);c.quadraticCurveTo(tipX-5,tipY-9,tipX-5,tipY-2);
    c.strokeStyle=near?'#bdc9a3':'#a2b7a0';c.lineWidth=2;c.stroke();
    if(vortex&&cast>.1)oval(c,tipX-5,tipY-2,2,1.6,'#d9ded0');
  }
  c.restore();
}

// A vertical bell and a single curtain of lappets. No spherical octopus head,
// shell, or paired limbs are shared with the other aquatic appearances.
export function crownWatcher(c,p,flip=1,pose={}){
  const s=state(p,pose),cast=s.wind+s.strike+s.rest*.4;
  const tidal=s.action==='tidalWave',vortex=s.action==='vortex';
  const sway=s.moving?Math.sin(s.cycle)*1.5:0;
  begin(c,flip);
  // Hanging ribbons keep a planted lower envelope, with alternating returns.
  for(let i=0;i<5;i++){
    const x=-25+i*12,phase=s.cycle+i*1.45;
    const drag=s.moving?Math.sin(phase)*3:0,lift=s.moving?Math.max(0,Math.cos(phase))*3:0;
    const sweep=(tidal?cast*7:vortex?cast*5:cast*3)*(i-2)/2;
    const endX=x+drag+sweep,endY=40-lift-cast*(i%2?4:0);
    c.beginPath();c.moveTo(x-6,7);c.bezierCurveTo(x-11,23,endX+8,31,endX-2,endY-1);
    c.quadraticCurveTo(endX-6,endY+1,endX-10,endY-2);
    c.quadraticCurveTo(endX+1,endY-4,endX-3,29);
    c.bezierCurveTo(x-13,23,x-12,15,x-6,7);c.closePath();
    fill(c,i%2?'#66778f':'#7b8f9b',INK,1.4);
    c.beginPath();c.moveTo(x-7,15);c.quadraticCurveTo(x-8,26,endX-5,33);
    c.strokeStyle=i%2?'#a4b3b4':'#c1cebd';c.lineWidth=1.7;c.stroke();
  }
  c.save();c.translate(sway+(tidal?cast*1.8:0),s.hit+(tidal?s.wind-s.strike*2:0));
  // Five broad crown lobes follow different angles and avoid a mushroom cap.
  const spread=(vortex?cast*2:cast);
  c.save();c.translate(0,2);
  c.beginPath();c.moveTo(-27,-19);c.quadraticCurveTo(-43,-28,-46-spread,-46);
  c.quadraticCurveTo(-35,-43,-28,-35);c.quadraticCurveTo(-29,-47,-23,-57);
  c.quadraticCurveTo(-14,-48,-13,-38);c.quadraticCurveTo(-4,-48,1,-60);
  c.quadraticCurveTo(10,-49,10,-38);c.quadraticCurveTo(20,-48,26,-57);
  c.quadraticCurveTo(32,-46,27,-34);c.quadraticCurveTo(39,-42,45+spread,-46);
  c.quadraticCurveTo(43,-26,27,-19);c.closePath();fill(c,'#a0a9a1');
  poly(c,[[-40,-40],[-24,-28],[-17,-19],[-27,-27]],'#647b83');
  poly(c,[[1,-53],[-4,-33],[4,-23],[8,-35]],'#d6d2ac');
  poly(c,[[37,-39],[23,-29],[19,-18],[30,-27]],'#c5c7ad');
  c.restore();
  // Bell is tall, pear-shaped, with a broad scalloped opening near the foot.
  c.beginPath();c.moveTo(-16,-37);c.bezierCurveTo(-29,-31,-28,-14,-31,-4);
  c.quadraticCurveTo(-33,6,-40,14);c.quadraticCurveTo(-31,19,-23,13);
  c.quadraticCurveTo(-15,23,-6,16);c.quadraticCurveTo(5,25,15,16);
  c.quadraticCurveTo(27,21,36,13);c.quadraticCurveTo(29,5,27,-7);
  c.bezierCurveTo(25,-24,19,-38,8,-40);c.quadraticCurveTo(-6,-44,-16,-37);
  c.closePath();fill(c,'#67758d');
  c.beginPath();c.moveTo(1,-35);c.quadraticCurveTo(19,-28,20,-4);
  c.quadraticCurveTo(21,7,28,12);c.quadraticCurveTo(20,17,14,11);
  c.quadraticCurveTo(6,19,-1,13);c.quadraticCurveTo(6,-4,1,-35);
  c.closePath();fill(c,'#9faeaf',null);
  c.beginPath();c.moveTo(-17,-28);c.quadraticCurveTo(-21,-9,-27,8);
  c.strokeStyle='#89979f';c.lineWidth=2.7;c.stroke();
  c.beginPath();c.moveTo(-11,-31);c.quadraticCurveTo(-4,-37,6,-32);
  c.strokeStyle='#c7cbb3';c.lineWidth=2.7;c.stroke();
  // A narrow, three-quarter facial veil with unequal visible eye apertures.
  c.beginPath();c.moveTo(-5,-19);c.quadraticCurveTo(8,-27,18,-17);
  c.quadraticCurveTo(23,-10,18,-2);c.quadraticCurveTo(8,5,-3,-1);
  c.quadraticCurveTo(-9,-7,-5,-19);c.closePath();fill(c,'#344a59',null);
  eye(c,1,-11,2.2,3.2,'#e6cea1');eye(c,13,-10,2.8,3.8,'#f2dfb1');
  line(c,[[-2,-17],[3,-19],[6,-17]],'#b9c4b6',1.7);
  line(c,[[10,-17],[15,-19],[19,-15]],'#d6d6b7',2.2);
  c.beginPath();c.moveTo(8,-5);c.quadraticCurveTo(10,-1,14,-3);
  c.strokeStyle='#a8bcb5';c.lineWidth=1.5;c.stroke();
  // Deep underside makes the drooping rim read as a hollow bell, not a skirt.
  c.beginPath();c.moveTo(-30,15);c.quadraticCurveTo(-18,24,-6,18);
  c.quadraticCurveTo(8,26,20,18);c.quadraticCurveTo(28,22,33,15);
  c.strokeStyle='#334856';c.lineWidth=2.5;c.stroke();
  c.restore();c.restore();
}

function rootFoot(c,x,y,far=false){
  c.beginPath();c.moveTo(x-9,y-16);c.quadraticCurveTo(x+4,y-19,x+7,y-9);
  c.quadraticCurveTo(x+10,y-5,x+17,y-3);c.lineTo(x+20,y);
  c.quadraticCurveTo(x+9,y+2,x+3,y-1);c.quadraticCurveTo(x-4,y+2,x-16,y);
  c.lineTo(x-10,y-5);c.quadraticCurveTo(x-7,y-9,x-9,y-16);c.closePath();
  fill(c,far?'#58694e':'#7b8258');
  line(c,[[x,y-11],[x+1,y-5],[x+10,y-1]],far?'#8e9770':'#bec092',1.8);
  line(c,[[x-4,y-5],[x-8,y]],'#3b533e',1.2);
}

// Broad hollow trunk, asymmetric broken branches and a masonry waist. Its
// squat roots and open timber face replace the original antler-shaped tree.
export function innerTreeKing(c,p,flip=1,pose={}){
  const s=state(p,pose),step=s.moving?Math.sin(s.cycle):0;
  const slam=s.wind+s.strike+s.rest*.35,bob=s.moving?-Math.abs(Math.sin(s.cycle*2))*.7:0;
  begin(c,flip);
  rootFoot(c,-15-step*3,38-(s.moving?Math.max(0,-step)*3:0),true);
  rootFoot(c,14+step*3,40-(s.moving?Math.max(0,step)*3:0));
  c.save();c.translate(step*.45,bob+s.wind*1.4+s.strike*2+s.hit);
  // Broad rear club lifts before the torso and descends through the strike.
  c.save();c.translate(-20,-16);c.rotate(s.wind*.48-s.strike*.18-s.rest*.09);
  c.beginPath();c.moveTo(0,-4);c.quadraticCurveTo(-17,-14,-26,0);
  c.lineTo(-27,18);c.quadraticCurveTo(-30,23,-27,29);
  c.quadraticCurveTo(-22,34,-15,27);c.lineTo(-12,10);c.quadraticCurveTo(-5,6,0,8);
  c.closePath();fill(c,'#596f4e');
  line(c,[[-15,2],[-22,10],[-24,22]],'#9d9d6d',2);
  c.restore();
  // The crown is a broken hollow stump, with two unequal architectural limbs.
  c.beginPath();c.moveTo(-26,-28);c.lineTo(-37,-36);c.lineTo(-48,-38);
  c.lineTo(-55,-49);c.lineTo(-52,-54);c.lineTo(-44,-46);c.lineTo(-34,-45);
  c.lineTo(-31,-55);c.lineTo(-26,-59);c.lineTo(-24,-41);c.lineTo(-14,-34);
  c.closePath();fill(c,'#8e8b5d');
  c.beginPath();c.moveTo(12,-35);c.lineTo(19,-47);c.lineTo(19,-63);
  c.lineTo(25,-66);c.lineTo(28,-53);c.lineTo(37,-56);c.lineTo(43,-64);
  c.lineTo(47,-61);c.lineTo(41,-49);c.lineTo(29,-44);c.lineTo(25,-28);
  c.closePath();fill(c,'#a19b69');
  line(c,[[22,-55],[23,-45],[18,-36]],'#d1c795',2);
  // Uneven outer bark has only a few broad planes, readable at game scale.
  c.beginPath();c.moveTo(-29,26);c.lineTo(-31,2);c.lineTo(-28,-23);
  c.lineTo(-23,-41);c.lineTo(-13,-36);c.lineTo(-6,-44);c.lineTo(4,-37);
  c.lineTo(13,-42);c.lineTo(24,-34);c.lineTo(29,-12);c.lineTo(28,11);
  c.lineTo(32,26);c.quadraticCurveTo(2,37,-29,26);c.closePath();fill(c,'#7e8556');
  poly(c,[[-25,-27],[-17,-31],[-19,-11],[-15,8],[-20,27],[-28,24],[-27,3]],'#a0a16c');
  poly(c,[[17,-31],[23,-26],[26,-8],[23,12],[27,24],[17,28],[16,5],[19,-8]],'#5d724b');
  line(c,[[-13,-30],[-14,-13],[-10,-4]],'#515f3d',2);
  line(c,[[21,-29],[23,-12],[20,-1]],'#bcc18a',1.9);
  // An open, angled cavity is the face; the near cheek continues into bark.
  c.beginPath();c.moveTo(-13,-24);c.lineTo(-5,-29);c.lineTo(2,-25);
  c.lineTo(10,-29);c.lineTo(19,-22);c.lineTo(19,-7);c.lineTo(12,2);
  c.lineTo(3,-1);c.lineTo(-5,1);c.lineTo(-13,-6);c.closePath();fill(c,'#304735',null);
  poly(c,[[-9,-18],[-3,-20],[2,-16],[-1,-12],[-8,-13]],'#d5c483');
  poly(c,[[7,-18],[14,-21],[18,-17],[14,-12],[7,-13]],'#e9d897');
  line(c,[[-11,-24],[-5,-26],[1,-22]],'#b3b77b',2.5);
  line(c,[[7,-23],[14,-26],[20,-20]],'#cbd099',3);
  line(c,[[0,-3],[5,-6],[12,-3]],'#8a9a63',1.8);
  // The stone ring is three clearly visible large blocks, not armour plates.
  c.beginPath();c.moveTo(-31,9);c.quadraticCurveTo(0,16,29,8);
  c.lineTo(32,19);c.quadraticCurveTo(0,29,-33,20);c.closePath();fill(c,'#8b927e');
  poly(c,[[-31,11],[-11,15],[-12,24],[-31,20]],'#a5aa92');
  poly(c,[[-9,15],[12,14],[13,24],[-10,24]],'#b3b59a');
  poly(c,[[14,13],[28,10],[31,18],[15,23]],'#7c8b78');
  line(c,[[-10,15],[-11,23]],'#516756',1.5);line(c,[[13,14],[14,23]],'#516756',1.5);
  line(c,[[-25,12],[-17,14]],'#d5d5b6',1.3);line(c,[[-6,17],[7,17]],'#e0ddbd',1.3);
  // The near root fist opens its elbow while lifting, then plants heavily.
  c.save();c.translate(17,-15);c.rotate(-s.wind*.52+s.strike*.12+s.rest*.08);
  c.beginPath();c.moveTo(-1,-8);c.quadraticCurveTo(17,-9,23,7);
  c.lineTo(26,19);c.quadraticCurveTo(30,19,30,26);
  c.quadraticCurveTo(32,32,26,32);c.quadraticCurveTo(20,37,13,31);
  c.lineTo(11,16);c.quadraticCurveTo(5,7,-1,6);c.closePath();fill(c,'#8d935f');
  line(c,[[9,-1],[17,12],[21,27]],'#c0bd85',2.5);
  line(c,[[27,24],[25,30]],'#506542',1.5);line(c,[[20,25],[19,30]],'#506542',1.5);
  c.restore();
  // A few moss ledges keep the tree alive without hiding its structural edge.
  poly(c,[[-28,-25],[-23,-31],[-13,-30],[-15,-25],[-24,-22]],'#859d5b');
  poly(c,[[12,-34],[20,-37],[27,-32],[23,-28],[15,-30]],'#9ca969');
  c.restore();c.restore();
}

function windRoot(c,x,y,far=false){
  c.beginPath();c.moveTo(x-4,y-21);c.quadraticCurveTo(x+5,y-23,x+6,y-15);
  c.lineTo(x+5,y-6);c.lineTo(x+16,y-1);c.lineTo(x+18,y+1);
  c.lineTo(x+7,y);c.lineTo(x+2,y-2);c.lineTo(x-2,y+1);c.lineTo(x-13,y+1);
  c.lineTo(x-6,y-4);c.lineTo(x-5,y-12);c.closePath();fill(c,far?'#786f55':'#9e8c65',INK,1.6);
  line(c,[[x+1,y-17],[x,y-6],[x+9,y-1]],far?'#b6a480':'#d2c097',1.8);
}

// Wind-swept deadwood: a narrow curved trunk, long root claws and a backward
// branch fan. Its open silhouette contrasts with both broad-bodied trees.
export function windTreeKing(c,p,flip=1,pose={}){
  const s=state(p,pose),step=s.moving?Math.sin(s.cycle):0;
  const bend=s.wind*.055-s.strike*.035+s.rest*.015;
  begin(c,flip);
  windRoot(c,-13-step*5,38-(s.moving?Math.max(0,-step)*4:0),true);
  windRoot(c,13+step*5,40-(s.moving?Math.max(0,step)*4:0));
  c.save();c.translate(step*.6,s.hit+(s.moving?-Math.abs(Math.sin(s.cycle*2))*.7:0)+s.strike*1.5);c.rotate(bend);
  // The fan is a single sparse hierarchy of branches swept behind the face.
  c.save();c.translate(0,2);
  c.beginPath();c.moveTo(6,-31);c.lineTo(-4,-43);c.lineTo(-20,-48);
  c.lineTo(-38,-47);c.lineTo(-55,-56);c.lineTo(-56,-60);c.lineTo(-37,-53);
  c.lineTo(-21,-54);c.lineTo(-33,-62);c.lineTo(-32,-66);c.lineTo(-16,-57);
  c.lineTo(-8,-57);c.lineTo(-11,-65);c.lineTo(-7,-66);c.lineTo(0,-52);
  c.lineTo(7,-46);c.lineTo(14,-48);c.lineTo(21,-57);c.lineTo(24,-55);
  c.lineTo(20,-43);c.lineTo(9,-35);c.closePath();fill(c,'#9a8c67');
  line(c,[[-47,-55],[-30,-50],[-16,-51],[1,-42]],'#d0bf93',2);
  line(c,[[-23,-58],[-12,-53],[-3,-53]],'#c6b68b',1.5);
  c.restore();
  // Far branch-arm curves down and backwards, ending in a forked wood claw.
  c.save();c.translate(-7,-16);c.rotate(s.wind*.22-s.strike*.1);
  c.beginPath();c.moveTo(-3,-4);c.quadraticCurveTo(-22,-8,-26,10);
  c.lineTo(-33,24);c.lineTo(-43,26);c.lineTo(-44,23);c.lineTo(-35,19);
  c.lineTo(-31,4);c.quadraticCurveTo(-25,-13,-11,-13);c.closePath();fill(c,'#827c59');
  line(c,[[-17,-5],[-24,5],[-29,20]],'#bab18a',1.7);
  c.restore();
  // Curved trunk gives a standing direction even in a held idle frame.
  c.beginPath();c.moveTo(-16,25);c.quadraticCurveTo(-7,11,-11,-5);
  c.quadraticCurveTo(-18,-20,-8,-34);c.lineTo(1,-40);c.lineTo(9,-35);
  c.lineTo(17,-36);c.quadraticCurveTo(23,-25,19,-10);
  c.quadraticCurveTo(14,5,23,25);c.quadraticCurveTo(5,34,-16,25);c.closePath();fill(c,'#a4966d');
  c.beginPath();c.moveTo(-7,-30);c.quadraticCurveTo(-13,-19,-5,-6);
  c.quadraticCurveTo(1,9,-7,25);c.lineTo(-14,23);c.quadraticCurveTo(-8,8,-12,-5);
  c.quadraticCurveTo(-17,-22,-7,-30);c.closePath();fill(c,'#766f50',null);
  c.beginPath();c.moveTo(12,-31);c.quadraticCurveTo(16,-21,11,-8);
  c.quadraticCurveTo(7,4,16,24);c.strokeStyle='#d8c699';c.lineWidth=2.7;c.stroke();
  // Long narrow face is cut into the near trunk plane, with two visible eyes.
  c.beginPath();c.moveTo(-3,-25);c.quadraticCurveTo(8,-31,17,-23);
  c.lineTo(15,-10);c.lineTo(8,-4);c.lineTo(1,-8);c.lineTo(-3,-17);
  c.closePath();fill(c,'#394e37',null);
  poly(c,[[0,-20],[4,-21],[6,-17],[2,-15]],'#d9cd9a');
  poly(c,[[9,-20],[15,-22],[16,-17],[10,-14]],'#f0dfaf');
  line(c,[[-2,-25],[3,-26],[6,-22]],'#b5b087',2);
  line(c,[[9,-25],[15,-27],[19,-22]],'#e0cda0',2.5);
  poly(c,[[6,-12],[10,-14],[12,-8],[8,-7]],'#b2a779');
  line(c,[[4,-3],[8,-2],[13,-6]],'#4c5c3d',1.6);
  // Near elbow bends in the slam preparation instead of rotating a rigid rod.
  c.save();c.translate(14,-13);c.rotate(-s.wind*.4+s.strike*.15+s.rest*.08);
  const reach=s.wind*3;
  c.beginPath();c.moveTo(0,-7);c.quadraticCurveTo(17,-7,21,6);
  c.lineTo(26+reach,17);c.lineTo(34+reach,21);c.lineTo(36+reach,25);
  c.lineTo(25+reach,24);c.lineTo(21+reach,28);c.lineTo(15+reach,28);
  c.lineTo(18+reach,21);c.lineTo(13,12);c.quadraticCurveTo(10,4,-2,4);c.closePath();fill(c,'#b4a176');
  line(c,[[7,-1],[16,8],[23+reach,21]],'#e0c99a',2.1);
  c.restore();
  // Sparse leaves all follow the wind direction; no round leaf crown.
  poly(c,[[-48,-53],[-57,-52],[-50,-48],[-42,-49]],'#8c9a63');
  poly(c,[[-23,-61],[-32,-60],[-25,-56],[-18,-57]],'#a5ad76');
  poly(c,[[19,-51],[13,-49],[14,-44],[20,-47]],'#8e9c65');
  line(c,[[-5,15],[-2,22],[-4,28]],'#5e6846',1.8);
  c.restore();c.restore();
}
