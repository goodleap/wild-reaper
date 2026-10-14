import {HERO_PALETTES,drawHeroPart,drawHeroFace} from './hero-art.js';

const TAU=Math.PI*2,p=HERO_PALETTES.elder;
const value=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach((a,i)=>c[i?'lineTo':'moveTo'](...a));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const paint=(c,fill,stroke=null,width=1)=>{if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,fill)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);paint(c,fill);};
const poly=(c,points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach((a,i)=>c[i?'lineTo':'moveTo'](...a));c.closePath();paint(c,fill,stroke,width);};
function material(c,flip,colors,x=16,top=-28,bottom=14){const g=c.createLinearGradient(-x*flip,bottom,x*flip,top);colors.forEach((color,i)=>g.addColorStop(i/(colors.length-1),color));return g;}

function head(c,view,flip){
  if(view==='front'){drawHeroPart(c,'elder','head',flip);return;}
  c.save();c.translate(1.2,1.1);
  const gray=material(c,flip,['#89958e','#c4c8b6','#f0edd4'],15,-30,-4);
  if(view==='back'){
    oval(c,0,-7.7,4.3,3,material(c,flip,p.skin,12,-24,-6));
    // Same short swept crown, with a rounded nape instead of a face or beard.
    c.beginPath();c.moveTo(-11,-12);c.quadraticCurveTo(-14,-22,-8,-26);c.quadraticCurveTo(-6,-29,-2,-28);c.lineTo(0,-30);c.quadraticCurveTo(2,-28,4,-28);c.quadraticCurveTo(12,-26,12,-20);c.lineTo(11,-12);c.quadraticCurveTo(10,-9,6,-8);c.quadraticCurveTo(0,-6,-7,-8);c.quadraticCurveTo(-11,-9,-11,-12);c.closePath();paint(c,gray,'#727e71',.8);
    line(c,[[-6,-25],[-2,-27],[2,-26]],'#e8e8ce',1);line(c,[[5,-25],[8,-23],[9,-20]],'#f3efd7',.9);
    c.beginPath();c.moveTo(-9,-18);c.quadraticCurveTo(-9,-12,-5,-10);c.strokeStyle='#89958e88';c.lineWidth=.8;c.stroke();
    c.restore();return;
  }
  c.beginPath();c.moveTo(-11,-14);c.bezierCurveTo(-15,-18,-12,-25,-8,-27);c.quadraticCurveTo(-2,-31,6,-27);c.quadraticCurveTo(14,-25,12,-17);c.lineTo(10,-9);c.lineTo(-10,-9);c.closePath();paint(c,gray,'#67766b',.9);
  oval(c,-8.8,-13.5,2.5,3.5,material(c,flip,p.skin,12,-24,-6));
  c.save();c.translate(3,0);c.scale(.85,1);
  c.beginPath();c.moveTo(0,-23.8);c.bezierCurveTo(-6.5,-23.8,-10,-19.6,-9.3,-14);c.quadraticCurveTo(-8.7,-5.9,0,-5.4);c.quadraticCurveTo(8.7,-5.9,9.3,-14);c.bezierCurveTo(10,-19.6,6.5,-23.8,0,-23.8);c.closePath();
  paint(c,material(c,flip,p.skin,12,-24,-6),'#937e6670',.65);c.restore();
  // Turn the forehead opening and sideburns together, keeping the old wisps.
  c.beginPath();c.moveTo(-11,-12);c.quadraticCurveTo(-14,-22,-8,-26);c.quadraticCurveTo(-6,-29,-2,-28);c.lineTo(0,-30);c.quadraticCurveTo(2,-28,4,-28);c.quadraticCurveTo(12,-26,12,-20);c.lineTo(11,-13);c.lineTo(9.4,-17);c.lineTo(9.8,-21);c.quadraticCurveTo(5.5,-24,1.3,-23);c.quadraticCurveTo(-3.5,-23,-4.5,-18);c.lineTo(-4.5,-12);c.closePath();paint(c,gray,'#727e71',.8);
  line(c,[[-6,-25],[-2,-27],[2,-26]],'#e8e8ce',1);line(c,[[5,-25],[8,-23],[9,-20]],'#f3efd7',.9);
  c.save();c.translate(3,0);c.scale(.85,1);
  c.beginPath();c.moveTo(-8,-10);c.quadraticCurveTo(-5,-8,-1.5,-9);c.quadraticCurveTo(0,-7,1.5,-9);c.quadraticCurveTo(5,-8,8,-10);c.quadraticCurveTo(8,-6,5,-3.8);c.quadraticCurveTo(0,-1.7,-5,-3.8);c.quadraticCurveTo(-8,-6,-8,-10);c.closePath();paint(c,gray,'#8e9785',.65);
  line(c,[[-3,-7],[-1,-4.5]],'#f3edd2',.7);line(c,[[3,-7],[1,-4.5]],'#ece9ce',.7);
  line(c,[[-3.7,-19],[2.6,-19.1]],'#a28e7347',.6);
  c.restore();c.restore();
}

function backTorso(c,flip){
  c.beginPath();c.moveTo(-9,-4);c.quadraticCurveTo(-6,-9,2,-7);c.quadraticCurveTo(8,-6,9,-3);c.lineTo(11.5,10);c.quadraticCurveTo(1,14,-11.5,10);c.closePath();paint(c,material(c,flip,p.cloth,14,-8,13),p.outline,1.15);
  poly(c,[[-6,-3],[-4,1],[-7,11],[-10,10]],'#243c3444');poly(c,[[5,-3],[8,10],[3,12],[2,5]],'#d8ddba25');
  // Only the rear wrap is visible here; the front pocket, buckle and scarf
  // end stay on the front of the coat when the actor turns away.
  c.beginPath();c.moveTo(-9,-4);c.quadraticCurveTo(0,0,9,-4);c.lineTo(9,0);c.quadraticCurveTo(0,4,-9,0);c.closePath();paint(c,material(c,flip,['#486564','#739b93','#a6c5af'],13,-6,2),'#354d45',.8);
}

export function drawElderPart(c,view,part,flip){
  if(part==='head'){head(c,view,flip);return;}
  if(part==='torso'&&view==='back'){backTorso(c,flip);return;}
  c.save();
  if(view==='side'){c.translate(part==='mantle'?-2:1.5,0);c.scale(part==='mantle'?.86:.9,1);}
  drawHeroPart(c,'elder',part==='mantle'?'back':'body',flip);c.restore();
}

export function drawElderFace(c,view,state){
  if(view==='back')return;
  c.save();
  // Compensate the original face painter's own (1.2, 1.1) head offset.
  if(view==='side'){c.translate(1.2+3,0);c.scale(.85,1);c.translate(-1.2,0);}
  drawHeroFace(c,'elder',state);c.restore();
}

export function drawElderArm(c,view,pose,side,hand,flip){
  const profile=view==='side',sx=profile?(side<0?-3:6):side*8,sy=-3;
  const ex=sx+(hand.x-sx)*3.5/6.5,ey=sy+(hand.y-sy)*4.3/11.5;
  line(c,[[sx,sy],[ex,ey],[hand.x,hand.y]],p.outline,5.6);
  line(c,[[sx,sy],[ex,ey],[hand.x,hand.y]],material(c,flip,p.arm,16,-6,11),4.4);
  line(c,[[sx+(hand.x-sx)*2/6.5,sy+1],[ex+side,ey+.7]],p.arm[2],.8);
  line(c,[[hand.x-side*1.7,hand.y-1.5],[hand.x+side*.8,hand.y-2.4]],'#b7bd9f',1.1);
  oval(c,hand.x,hand.y,2.65,2.8,material(c,flip,p.skin,17,-3,11));
  line(c,[[hand.x-.9,hand.y-.6],[hand.x+1,hand.y-.9]],p.skin[2],.7);
}

export function drawElderFoot(c,view,pose,foot){
  const side=foot.side,profile=view==='side',x=side*(profile?4:6)+value(foot.x),dy=value(foot.y)-value(foot.lift),hip=side*(profile?3.6:5.5);
  line(c,[[hip,8+value(pose.bodyY)],[x,14+dy]],'#62624b',4.6);
  c.beginPath();c.moveTo(x-3.4,12+dy);c.quadraticCurveTo(x,10.6+dy,x+3.2,12+dy);c.lineTo(x+4.2,15.4+dy);c.quadraticCurveTo(x+1,18.3+dy,x-4,16.1+dy);c.closePath();paint(c,'#62624b','#3b3c31',.9);
  line(c,[[x-3.2,16+dy],[x+3.4,16+dy]],'#3b3c31',1);line(c,[[x-.5,12.1+dy],[x+2.3,12.8+dy],[x+2.9,14.4+dy]],'#99927a',.95);
}
