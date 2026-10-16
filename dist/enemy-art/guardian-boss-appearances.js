import {clamp, line, oval, poly} from './drawing.js';

// These are appearance-only actors. Their common canvas is the existing
// ancient/bloom canvas: ground 41, half-width 60, crown no higher than -68.
const INK='#293a3c';
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
function state(p,pose){
  const mode=pose.mode||(p?'move':'idle'),progress=clamp(finite(pose.progress),0,1);
  return {mode,action:pose.action||'',progress,moving:pose.moving??(mode==='move'||mode==='rush'),
    cycle:finite(pose.cycle,Math.asin(clamp(finite(p),-1,1))),
    ready:mode==='windup'?smooth(progress):0,
    strike:mode==='active'||mode==='rush'?1:mode==='recovery'?1-smooth(progress):0,
    hit:mode==='hit'?1-smooth(progress):0};
}
function fill(c,color,edge=INK,width=1.7){c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function curved(c,start,segments,color,edge=INK,width=1.7){
  c.beginPath();c.moveTo(...start);
  for(const s of segments){if(s.length===2)c.lineTo(...s);else if(s.length===4)c.quadraticCurveTo(...s);else c.bezierCurveTo(...s);}
  c.closePath();fill(c,color,edge,width);
}
function roundLimb(c,points,width,color,light){
  line(c,points,INK,width+3);line(c,points,color,width);
  if(light)line(c,points.map(([x,y])=>[x-1,y-1]),light,1.6);
}
function contact(cycle,offset,moving,excursion=7){
  if(!moving)return {dx:0,lift:0};
  const t=((cycle/(Math.PI*2)+offset)%1+1)%1,planted=t<.62;
  return {dx:planted?mix(excursion,-excursion,t/.62):mix(-excursion,excursion,smooth((t-.62)/.38)),
    lift:planted?0:Math.sin((t-.62)/.38*Math.PI)*5};
}
function metalFoot(c,x,y,w,color){
  curved(c,[x-w,y-9],[[x+3,y-10],[x+w,y-4],[x+w+1,y-1],[x+w-1,y+1],[x-w,y+1],[x-w-2,y-2],[x-w,y-9]],color);
  line(c,[[x-w+1,y-2],[x+w-1,y-2]],'#d3d1af',1.3);
}
function eye(c,x,y,rx,color='#eed29b'){oval(c,x,y,rx,rx*1.05,color);oval(c,x+.3,y-.5,.5,.7,'#fff4cb');}

export function castleGuardian(c,p,flip=1,pose={}){
  const s=state(p,pose),far=contact(s.cycle,.5,s.moving,6),near=contact(s.cycle,0,s.moving,6);
  const crouch=s.ready*3+s.strike*1.2,weight=s.moving?-Math.abs(Math.sin(s.cycle))*1.1:0;
  c.save();c.scale(flip===-1?-1:1,1);c.lineCap='round';c.lineJoin='round';
  // Separate stone greaves support a low, broad keep-like torso.
  roundLimb(c,[[-12,13],[-16+far.dx*.45,25],[-15+far.dx,31-far.lift]],13,'#727d75','#9caa97');
  metalFoot(c,-14+far.dx,39-far.lift,10,'#879487');
  roundLimb(c,[[12,13],[17+near.dx*.4,25],[16+near.dx,31-near.lift]],15,'#909d8b','#b9bfa5');
  metalFoot(c,17+near.dx,40-near.lift,11,'#a5af98');
  c.save();c.translate(-s.ready+s.strike,crouch+weight);
  curved(c,[-23,-34],[[-39,-25,-39,6],[-38,25],[-26,20],[-18,29],[-1,21],[15,27],[32,18],[31,-22],[16,-38],[-23,-34]],'#6e616b');
  curved(c,[-22,-31],[[-31,-15,-28,13],[-15,18],[-12,-30]],'#96808b',null);
  // The sword is attached to the far/own-right hand, behind the breastplate.
  const sx=-36+s.ready*5-s.strike*3,sy=7-s.ready*23+s.strike*9;
  roundLimb(c,[[-22,-24],[-32,-7-s.ready*5],[sx,sy]],13,'#7d897e','#b0b79e');
  c.save();c.translate(sx,sy);c.rotate(-.12+s.ready*.65-s.strike*.28);
  poly(c,[[-3,1],[-5,-37],[-1,-45],[3,-37],[3,1]],'#d1cbb0',INK,1.6);
  poly(c,[[-1,-41],[-1,-3],[2,-2],[2,-35]],'#f0e5c3');
  line(c,[[-10,-2],[10,-2]],INK,5);line(c,[[-9,-3],[9,-3]],'#b3a574',2.4);
  line(c,[[0,1],[0,10]],'#4c5150',5);oval(c,0,10,3.1,2.5,'#ac9568');
  oval(c,0,5,6,5,'#899587');line(c,[[-4,5],[3,5]],'#c1c6aa',1);c.restore();
  curved(c,[-26,-27],[[-14,-36,10,-34],[25,-25],[26,-3],[18,16],[-13,19],[-27,5],[-26,-27]],'#a8b29d');
  poly(c,[[-25,-17],[-6,-23],[14,-19],[21,-4],[12,5],[-14,7],[-25,-3]],'#c7cab0',INK,1.3);
  poly(c,[[13,-19],[25,-25],[26,-3],[18,16],[11,9],[15,-2]],'#75867a');
  line(c,[[-18,11],[5,15],[16,9]],'#596e63',1.5);
  // Broad rounded pauldrons and a fractured stone crest, not a metal robot.
  curved(c,[-31,-27],[[-29,-41,-17,-39],[-6,-34],[-10,-21],[-23,-17],[-34,-20],[-31,-27]],'#b4bba1');
  poly(c,[[-27,-34],[-20,-36],[-15,-30],[-19,-25]],'#d1ceb0');
  curved(c,[11,-32],[[25,-37,32,-27],[35,-15],[22,-13],[10,-22],[11,-32]],'#91a08b');
  // Offset visor shows the far slit and the larger near slit in 3/4.
  curved(c,[-9,-36],[[-16,-47,-9,-56],[-1,-63,13,-58],[24,-52,22,-41],[17,-31],[4,-29],[-9,-36]],'#a7b59f');
  poly(c,[[6,-59],[15,-56],[19,-44],[14,-32],[8,-31],[10,-44]],'#d0cfaf');
  poly(c,[[-9,-46],[1,-48],[7,-43],[18,-44],[18,-37],[9,-35],[4,-38],[-7,-39]],'#354b48');
  line(c,[[-4,-42],[1,-42]],'#e6ce94',2);line(c,[[9,-40],[15,-41]],'#f4dfa8',2.5);
  line(c,[[5,-45],[7,-33]],'#657e70',1.5);
  poly(c,[[-1,-58],[2,-66],[7,-65],[8,-59]],'#788c7d',INK,1.3);
  line(c,[[-5,-54],[-10,-51],[-8,-47]],'#d1d2b1',1.4);
  // The shield is a single unmistakable silhouette attached to the near arm.
  roundLimb(c,[[24,-21],[33,-5],[33,5]],12,'#81927f','#b2bba0');
  c.save();c.translate(s.ready*3-s.strike*3,-s.ready*3);
  curved(c,[27,-16],[[36,-21,50,-17],[55,-8,53,11],[48,25,36,30],[24,19,22,7],[22,-7,27,-16]],'#8d9e8b');
  curved(c,[30,-11],[[39,-15,47,-12],[50,0,46,12],[42,20,36,23],[28,15,27,5],[27,-5,30,-11]],'#c2c7a9',INK,1.2);
  poly(c,[[35,-8],[41,-7],[42,8],[37,16],[32,8]],'#7a8c79');
  line(c,[[37,-6],[37,10]],'#ded7b2',1.8);line(c,[[31,2],[43,2]],'#ded7b2',1.8);
  line(c,[[48,-7],[44,-1],[47,4],[44,10]],'#536d60',1.2);c.restore();
  c.restore();c.restore();
}

export function towerGuardian(c,p,flip=1,pose={}){
  const s=state(p,pose),far=contact(s.cycle,.5,s.moving,4),near=contact(s.cycle,0,s.moving,4);
  const sway=s.moving?Math.sin(s.cycle)*1.3:0,lift=s.ready*3-s.strike*2;
  c.save();c.scale(flip===-1?-1:1,1);c.lineJoin='round';c.lineCap='round';
  // Small grounded clappers carry the weight; the bell does not hover.
  for(const [x,q,color]of[[-13,far,'#827c55'],[16,near,'#b19e65']]){
    poly(c,[[x-4,20],[x+4,20],[x+q.dx+4,35-q.lift],[x+q.dx-4,35-q.lift]],color,INK,1.7);
    metalFoot(c,x+q.dx,40-q.lift,6,color);
  }
  c.save();c.translate(sway,-lift);
  // An open arch and crown ring define a bell spirit rather than a head.
  c.beginPath();c.moveTo(-18,-37);c.bezierCurveTo(-20,-67,15,-69,22,-40);
  c.strokeStyle=INK;c.lineWidth=8;c.stroke();c.strokeStyle='#9e8c5e';c.lineWidth=4.7;c.stroke();
  c.beginPath();c.moveTo(-15,-45);c.bezierCurveTo(-12,-59,11,-61,17,-46);
  c.strokeStyle='#cfbd83';c.lineWidth=1.5;c.stroke();
  oval(c,3,-61,5,3,'#beb07b');
  const arms=[[-1,-34], [1,-30]];
  for(const [side,shoulderY] of arms){
    const elbowX=side*(40+s.ready*2),elbowY=-8-s.ready*12+s.strike*9;
    const handX=side*(46-s.strike*6),handY=20-s.ready*22+s.strike*5;
    // Angular cast-bronze bars and a weight-shaped fist, not tube fingers.
    poly(c,[[side*27,shoulderY],[side*35,shoulderY+3],[elbowX+side*3,elbowY],[elbowX-side*5,elbowY+4]],'#827b54',INK,1.7);
    oval(c,elbowX,elbowY,5.5,5.5,'#c7b576');oval(c,elbowX,elbowY,2.1,2.1,'#585e48');
    poly(c,[[elbowX-side*3,elbowY],[elbowX+side*3,elbowY],[handX+side*3,handY],[handX-side*3,handY]],'#9d8e5c',INK,1.6);
    poly(c,[[handX-7,handY-3],[handX+6,handY-4],[handX+8,handY+7],[handX+3,handY+11],[handX-8,handY+9]],'#b9a36b',INK,1.8);
    line(c,[[handX-4,handY],[handX+3,handY-1],[handX+4,handY+5]],'#ead59b',1.7);
  }
  // Wide top and narrowing waist make an inverted bell, with an actual
  // opening around its suspended pendulum rather than a painted furnace.
  curved(c,[-34,-35],[[-19,-47,14,-43],[35,-34],[31,-10],[25,10],[27,20],[12,29],[-13,28],[-28,19],[-25,8],[-32,-13],[-34,-35]],'#a59461');
  curved(c,[-25,-32],[[-10,-39,14,-35],[23,-29],[16,-8],[17,8],[10,15],[-12,14],[-21,6],[-20,-12],[-25,-32]],'#bfb17b',null);
  curved(c,[16,-36],[[29,-34,35,-34],[31,-10],[25,10],[27,20],[17,24],[14,8],[17,-11],[16,-36]],'#797b51',null);
  oval(c,0,-34,34,8,'#c3b27a');
  c.beginPath();c.ellipse(0,-34,34,8,0,0,Math.PI*2);c.strokeStyle=INK;c.lineWidth=1.7;c.stroke();
  line(c,[[-25,-34],[-11,-37],[11,-36],[24,-31]],'#e1d09b',1.7);
  curved(c,[-24,15],[[-10,4,12,6],[26,16],[19,29,-17,29],[-24,15]],'#3c5350');
  const pendulumX=4+Math.sin(s.cycle)*((s.moving?5:1)+s.ready*3);
  line(c,[[2,-4],[pendulumX,15]],'#dbbd76',3.2);
  oval(c,pendulumX,17,7,9,'#e0c78d');oval(c,pendulumX-1.6,14.2,2.7,4,'#fff0b8');
  curved(c,[-27,18],[[-13,25,4,25],[25,17],[27,22],[12,31,-11,30],[-28,23],[-27,18]],'#b49c61');
  line(c,[[-22,20],[-5,26],[11,26],[22,20]],'#e8d69c',1.6);
  // Two asymmetric sound slits supply a glance without a pasted face.
  curved(c,[-16,-19],[[-8,-23,-4,-19],[-6,-13],[-14,-13],[-16,-19]],'#42574c',null);
  curved(c,[3,-20],[[15,-25,19,-20],[17,-13],[6,-12],[3,-20]],'#42574c',null);
  line(c,[[-13,-17],[-8,-17]],'#f0cc83',1.9);line(c,[[8,-17],[15,-18]],'#ffe3a0',2.3);
  line(c,[[-23,-27],[-20,-6],[-16,2]],'#7c8054',1.4);
  poly(c,[[2,-30],[6,-26],[3,-21],[-1,-25]],'#e8d4a0');
  c.restore();c.restore();
}

function bullLeg(c,x,phase,s,far,front){
  const q=contact(phase,0,s.moving,front?6:7),bodyY=s.ready*2;
  const knee=x+q.dx*.3+(front?3-s.ready*5+s.strike*4:-2),ankle=x+q.dx;
  roundLimb(c,[[x,9+bodyY],[knee,24-q.lift*.2],[ankle,31-q.lift]],front?15:11,far?'#494b49':'#60605a',far?'#6b6b5d':'#89806b');
  poly(c,[[ankle-7,34-q.lift],[ankle+7,33-q.lift],[ankle+10,39-q.lift],[ankle+8,41-q.lift],[ankle-8,41-q.lift]],far?'#3c4442':'#4d514a',INK,1.8);
  line(c,[[ankle+1,36-q.lift],[ankle+2,40-q.lift]],'#a69370',1.2);
}
function horn(c,start,side,large=true){
  const [x,y]=start,h=large?24:19;
  curved(c,[x-4,y+2],[[x-11*side,y-4,x-9*side,y-h],[x-3*side,y-h+5,x-4*side,y-9],[x+5,y-1],[x-4,y+2]],'#c2b48e',INK,1.5);
  line(c,[[x-3*side,y-4],[x-6*side,y-h+8]],'#e3d2a6',1.4);
}
export function forgeGuardian(c,p,flip=1,pose={}){
  const s=state(p,pose),bodyY=s.ready*3+s.strike-(s.moving?Math.abs(Math.sin(s.cycle))*1.2:0);
  c.save();c.scale(flip===-1?-1:1,1);c.lineJoin='round';c.lineCap='round';
  // A short tail and four actual hooves preserve a beast's weight profile.
  c.beginPath();c.moveTo(-29,-4);c.bezierCurveTo(-45,-11,-47,7,-47,14);
  c.strokeStyle=INK;c.lineWidth=6;c.stroke();c.strokeStyle='#696654';c.lineWidth=3;c.stroke();
  curved(c,[-47,9],[[-54,12,-52,22],[-45,21],[-42,14],[-47,9]],'#404942');
  bullLeg(c,-23,s.cycle+Math.PI,s,true,false);bullLeg(c,20,s.cycle,s,true,true);
  c.save();c.translate(-s.ready*2+s.strike*3,bodyY);
  curved(c,[-36,-14],[[-32,-32,-13,-33],[10,-38,27,-23],[39,-8,31,12],[17,24,-10,21],[-34,21,-38,5],[-36,-14]],'#55584f');
  curved(c,[-33,-16],[[-27,-29,-12,-28],[5,-30,12,-22],[3,-13,-7,-11],[-24,-8,-33,-16]],'#777465',null);
  curved(c,[-33,1],[[-19,12,2,6],[17,7,24,16],[10,24,-16,20],[-34,16,-33,1]],'#424b44',null);
  // Broken volcanic plates follow the spine, never a square furnace torso.
  poly(c,[[-29,-20],[-30,-33],[-17,-41],[-8,-28],[-15,-19]],'#484e46',INK,1.6);
  poly(c,[[-11,-26],[-8,-44],[5,-45],[15,-27],[3,-20]],'#656255',INK,1.7);
  poly(c,[[11,-23],[15,-38],[27,-31],[30,-12],[22,-8]],'#454e47',INK,1.7);
  line(c,[[-24,-26],[-20,-33],[-17,-29]],'#b59e6c',1.5);
  line(c,[[-10,-17],[-3,-23],[1,-15],[9,-10]],'#bd6d3f',2.5);
  line(c,[[-10,-17],[-3,-23],[1,-15]],'#e3a35e',1.1);
  line(c,[[-26,5],[-18,1],[-14,7]],'#cb7d43',1.5);
  // The neck rises into an asymmetric three-quarter ox head and broad nose.
  // The planted front legs bend while the head lifts, then drive it down.
  c.save();c.translate(15,-10);c.rotate(-s.ready*.19+s.strike*.23);c.translate(-15,10);
  curved(c,[6,-20],[[14,-34,28,-33],[42,-26,43,-7],[39,5,24,7],[10,3,6,-20]],'#676356');
  horn(c,[20,-32],-1,false);
  curved(c,[10,-23],[[3,-30,4,-19],[10,-13],[17,-18],[10,-23]],'#837660');
  curved(c,[27,-21],[[31,-35,40,-33],[45,-25,40,-15],[27,-21]],'#82735b');
  horn(c,[34,-29],1,true);
  curved(c,[15,-25],[[23,-30,31,-22],[38,-24,42,-15],[39,-5,26,-5],[16,-10,15,-25]],'#3e4a43',null);
  eye(c,20,-20,2.2,'#e2af65');eye(c,33,-17.5,2.8,'#efbd6f');
  line(c,[[16,-24],[23,-24]],'#ad9b70',2.1);line(c,[[29,-22],[38,-20]],'#c6ac77',2.5);
  curved(c,[24,-8],[[34,-15,45,-9],[52,-5,49,3],[43,10,29,7],[21,4,24,-8]],'#8a7f65');
  curved(c,[36,-4],[[42,-7,47,-2],[47,2,42,3],[36,2,36,-4]],'#424a41',null);
  oval(c,31,-.5,2,2.2,'#414a42');
  line(c,[[29,4],[38,6],[46,4]],'#4b5145',1.3);
  curved(c,[10,-13],[[13,3,22,7],[26,14],[16,17],[7,5],[10,-13]],'#777461');
  line(c,[[15,-8],[18,3],[23,7]],'#a49068',1.6);
  c.restore();
  c.restore();
  bullLeg(c,-18,s.cycle,s,false,false);bullLeg(c,23,s.cycle+Math.PI,s,false,true);
  // Front limbs are deliberately heavier than the hind pair.
  oval(c,24,11+bodyY,10,11,'#696759');
  line(c,[[21,5+bodyY],[27,7+bodyY],[28,14+bodyY]],'#b18c5b',1.5);
  c.restore();
}

function salamanderLeg(c,x,phase,s,far,front){
  const q=contact(phase,0,s.moving,6),side=front?1:-1,ankleX=x+side*8+q.dx;
  roundLimb(c,[[x,8],[x+side*11,20-q.lift*.4],[ankleX,32-q.lift]],far?9:11,far?'#486465':'#5c8080',far?'#6d8780':'#91aaa0');
  c.save();c.translate(0,2);
  curved(c,[ankleX-6,29-q.lift],[[ankleX+2,27-q.lift,ankleX+7,31-q.lift],[ankleX+11,35-q.lift],[ankleX+7,37-q.lift],[ankleX+2,35-q.lift],[ankleX+1,39-q.lift],[ankleX-3,39-q.lift],[ankleX-4,35-q.lift],[ankleX-8,36-q.lift],[ankleX-9,33-q.lift],[ankleX-6,29-q.lift]],far?'#6a8580':'#8ba59a');
  line(c,[[ankleX+1,32-q.lift],[ankleX+2,35-q.lift]],'#496b68',1);
  c.restore();
}
export function riverGuardian(c,p,flip=1,pose={}){
  const s=state(p,pose),bodyY=s.ready*2-s.strike*2-(s.moving?Math.abs(Math.sin(s.cycle))*1.1:0);
  c.save();c.scale(flip===-1?-1:1,1);c.lineCap='round';c.lineJoin='round';
  // Long continuous tail tapers through a flattened swimming fin.
  curved(c,[-20,-8],[[-40,-17,-53,-4],[-59,4,-56,14],[-52,5,-45,5],[-35,6,-29,17],[-14,15],[-20,-8]],'#587575');
  curved(c,[-26,-8],[[-43,-14,-51,-3],[-41,-3,-32,5],[-26,-8]],'#95aaa1',null);
  salamanderLeg(c,-18,s.cycle+Math.PI,s,true,false);salamanderLeg(c,19,s.cycle,s,true,true);
  c.save();c.translate(s.ready*-2+s.strike*2,bodyY);
  curved(c,[-35,-8],[[-30,-29,-12,-30],[9,-32,24,-13],[33,5,21,18],[1,29,-21,20],[-38,13,-35,-8]],'#557b7a');
  curved(c,[-25,0],[[-15,-10,3,-8],[21,-2,23,11],[11,21,-9,18],[-24,15,-25,0]],'#a6b6a0',null);
  curved(c,[-26,-21],[[-17,-33,0,-28],[10,-23,11,-13],[-7,-17,-26,-21]],'#829e96',null);
  // A folded, uninterrupted dorsal fin gives height and a cave-dragon line.
  curved(c,[-24,-23],[[-19,-41,-10,-48],[-8,-36],[-1,-56],[7,-49],[9,-33],[17,-46],[22,-33],[22,-19],[-24,-23]],'#88a5a0',INK,1.6);
  curved(c,[-17,-26],[[-11,-37,-10,-40],[-8,-28],[1,-44,3,-46],[5,-30],[12,-34],[16,-25],[-17,-26]],'#bdd0b6',null);
  line(c,[[-9,-36],[-5,-23]],'#547c77',1.4);line(c,[[3,-43],[6,-24]],'#547c77',1.4);
  // Broad lateral head, small crown, two eyes and barbels: neither a toad
  // nor the ordinary flame lizard's narrow snout.
  c.save();c.translate(12,-11);c.rotate(-s.ready*.14+s.strike*.19);c.translate(-12,11);
  curved(c,[-1,-19],[[-5,-36,10,-40],[28,-45,39,-32],[50,-19,44,-5],[36,7,15,3],[1,0,-1,-19]],'#71928b');
  curved(c,[-2,-24],[[-12,-30,-10,-18],[-4,-9],[5,-16],[-2,-24]],'#8ca69a');
  curved(c,[25,-30],[[32,-38,40,-30],[44,-21],[39,-15],[28,-20],[25,-30]],'#8fa89a',null);
  curved(c,[5,-23],[[13,-32,23,-23],[31,-26,37,-19],[38,-10,28,-7],[12,-7,5,-14],[5,-23]],'#3d6562',null);
  eye(c,13,-23,2.1,'#dac98c');eye(c,28,-21,2.8,'#ead99a');
  line(c,[[8,-28],[16,-29],[20,-26]],'#a6bca6',2.2);line(c,[[24,-27],[31,-29],[36,-23]],'#c1d0b0',2.7);
  curved(c,[17,-9],[[31,-17,44,-8],[51,-4,47,4],[40,11,25,7],[14,3,17,-9]],'#a7bba6');
  oval(c,38,-4,1.9,1.5,'#3f6660');oval(c,44,-1,1.4,1.3,'#3f6660');
  line(c,[[23,3],[33,6],[45,3]],'#4b7067',1.4);
  // Long soft barbels attach to the mouth corners with a tapered return.
  c.beginPath();c.moveTo(23,3);c.bezierCurveTo(19,11,10,14,7,10);c.strokeStyle=INK;c.lineWidth=3.5;c.stroke();
  c.strokeStyle='#bbc5a8';c.lineWidth=1.7;c.stroke();
  c.beginPath();c.moveTo(44,3);c.bezierCurveTo(52,9,52,19,46,19);c.strokeStyle=INK;c.lineWidth=3.5;c.stroke();
  c.strokeStyle='#b7c8ab';c.lineWidth=1.7;c.stroke();
  c.restore();
  for(const [x,y,r] of [[-25,-4,2],[-15,-12,2.2],[-8,-5,1.8],[2,9,2.1]])oval(c,x,y,r,r*.7,'#b2bfa2');
  c.restore();
  salamanderLeg(c,-20,s.cycle,s,false,false);salamanderLeg(c,19,s.cycle+Math.PI,s,false,true);
  c.restore();
}

export function pursuitCaptain(c,p,flip=1,pose={}){
  const s=state(p,pose),far=contact(s.cycle,.5,s.moving,7),near=contact(s.cycle,0,s.moving,7);
  const bodyY=s.ready*2+s.strike*1.2-(s.moving?Math.abs(Math.sin(s.cycle))*1.3:0);
  c.save();c.scale(flip===-1?-1:1,1);c.lineJoin='round';c.lineCap='round';
  // A narrow, tall marching stance distinguishes the commander from the
  // broad castle knight even with their colors removed.
  roundLimb(c,[[-7,11],[-11+far.dx*.5,27],[-10+far.dx,32-far.lift]],10,'#4a5a60','#7d8c8b');
  metalFoot(c,-9+far.dx,39-far.lift,7,'#56676a');
  roundLimb(c,[[11,11],[13+near.dx*.5,27],[15+near.dx,32-near.lift]],12,'#69797b','#a2aaa0');
  metalFoot(c,16+near.dx,40-near.lift,8,'#7b8884');
  c.save();c.translate(-s.ready+s.strike*2,bodyY);
  curved(c,[-19,-35],[[-31,-18,-30,8],[-32,22],[-22,16],[-17,25],[-5,15],[10,21],[22,12],[19,-32],[-19,-35]],'#70545a');
  curved(c,[-24,-28],[[-25,-4,-28,12],[-18,9],[-10,16],[-8,-24],[-24,-28]],'#a16b6b',null);
  line(c,[[-24,-15],[-23,1],[-26,10]],'#c99283',1.5);
  // Long banner-like shoulder plates rise away from the silhouette.
  poly(c,[[-21,-30],[-29,-46],[-17,-50],[-8,-34]],'#748384',INK,1.8);
  poly(c,[[-23,-43],[-18,-46],[-13,-35]],'#bbc0aa');
  poly(c,[[10,-34],[20,-48],[30,-41],[27,-25],[16,-22]],'#8f9a90',INK,1.8);
  poly(c,[[19,-43],[25,-40],[23,-30],[18,-29]],'#c5c8ad');
  // The far forearm rests across a short baton, with no shield template.
  roundLimb(c,[[20,-21],[27,-6],[17,2]],10,'#5a6c70','#a0aaa0');
  oval(c,17,2,6,5,'#7c8b83');line(c,[[13,2],[19,3]],'#bec3ac',1.3);
  curved(c,[-16,-29],[[-6,-35,10,-29],[19,-15],[15,9],[3,17],[-12,10],[-18,-7],[-16,-29]],'#596d72');
  poly(c,[[-15,-22],[-4,-29],[12,-23],[15,-11],[5,-5],[-10,-10]],'#9ea99c',INK,1.4);
  poly(c,[[9,-23],[17,-15],[15,9],[5,14],[2,-4]],'#394f59');
  poly(c,[[-11,-6],[3,-3],[13,-7],[13,-1],[1,4],[-12,-1]],'#a6946c',INK,1.1);
  oval(c,2,-1,3,3,'#d6bd82');
  poly(c,[[-12,1],[1,6],[12,2],[16,15],[5,23],[-12,17],[-17,10]],'#737f79',INK,1.5);
  line(c,[[-6,6],[-5,17]],'#b7bba4',1.2);line(c,[[5,8],[7,18]],'#b7bba4',1.2);
  // Fur collar is one rough continuous shape, not a ring of little circles.
  curved(c,[-22,-30],[[-21,-40,-13,-40],[-12,-44],[-6,-40],[1,-43],[5,-39],[15,-41],[22,-33],[17,-28],[9,-31],[2,-27],[-6,-31],[-15,-27],[-22,-30]],'#b8baa2');
  line(c,[[-15,-34],[-10,-32],[-6,-35]],'#7b8b7c',1.5);line(c,[[5,-34],[10,-32],[15,-34]],'#7b8b7c',1.3);
  // Iron mask: two distinct eye apertures and the turned nose ridge.
  curved(c,[-8,-40],[[-13,-51,-5,-60],[3,-67,15,-60],[24,-53,20,-42],[13,-32],[1,-33],[-8,-40]],'#778c89');
  curved(c,[-6,-49],[[-2,-61,10,-60],[17,-54],[11,-46],[-6,-49]],'#afb6a2',null);
  poly(c,[[7,-59],[17,-55],[18,-44],[12,-34],[5,-35],[9,-46]],'#c1c1a7');
  curved(c,[-7,-47],[[-1,-51,5,-46],[11,-48,17,-44],[15,-39],[7,-39],[3,-42],[-4,-41],[-7,-47]],'#293f48',null);
  line(c,[[-3,-45],[1,-45]],'#dba977',2);line(c,[[8,-43],[14,-43]],'#efca8d',2.4);
  line(c,[[5,-48],[7,-38],[12,-37]],'#596f6a',1.4);
  line(c,[[0,-37],[3,-35]],'#d4d0b1',1.2);
  // Own-right gauntlet grips the long single-edged blade on screen left.
  const hand={x:-25+s.ready*9-s.strike*3,y:3-s.ready*15+s.strike*9};
  roundLimb(c,[[-15,-22],[-25,-12-s.ready*3],[hand.x,hand.y]],12,'#72817b','#adb5a0');
  c.save();c.translate(hand.x,hand.y);c.rotate(-.3+s.ready*.78-s.strike*.2);
  curved(c,[-2,-3],[[-10,-26,-5,-49],[1,-54],[0,-38,6,-16],[5,-4],[-2,-3]],'#c7c8ae',INK,1.7);
  curved(c,[-4,-9],[[-6,-28,-2,-43],[-1,-38,3,-16],[2,-8],[-4,-9]],'#e7ddbc',null);
  line(c,[[-9,-3],[10,-3]],INK,5);line(c,[[-8,-4],[9,-4]],'#b5a575',2.2);
  line(c,[[1,-1],[1,12]],'#4b5350',4.4);oval(c,1,12,3,2.4,'#b3a174');
  oval(c,0,4,6,5,'#819084');line(c,[[-4,4],[3,4]],'#ced0b2',1.3);c.restore();
  c.restore();c.restore();
}
