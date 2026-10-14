import {HERO_PALETTES,drawHeroPart,drawHeroFace} from './hero-art.js';

const TAU=Math.PI*2,p=HERO_PALETTES.princess;
const value=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach((a,i)=>c[i?'lineTo':'moveTo'](...a));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const paint=(c,fill,stroke=null,width=1)=>{if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,fill)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);paint(c,fill);};
const poly=(c,points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach((a,i)=>c[i?'lineTo':'moveTo'](...a));c.closePath();paint(c,fill,stroke,width);};
function material(c,flip,colors,x=16,top=-28,bottom=14){const g=c.createLinearGradient(-x*flip,bottom,x*flip,top);colors.forEach((color,i)=>g.addColorStop(i/(colors.length-1),color));return g;}

function hairOutline(c){
  // The original short, round hair mass, including its softly flared ends.
  c.beginPath();c.moveTo(0,-31.5);c.bezierCurveTo(-9,-31.5,-14,-25,-13,-17);c.bezierCurveTo(-12,-11,-13,-6,-15,-3);c.quadraticCurveTo(-9,0,-5,-5);c.lineTo(6,-5);c.quadraticCurveTo(11,-1,15,-4);c.bezierCurveTo(11,-7,13,-12,13,-18);c.bezierCurveTo(14,-25,8,-31.5,0,-31.5);c.closePath();
}
function flower(c){
  poly(c,[[-10,-24],[-11.2,-27.1],[-8.3,-25.8],[-6.5,-28],[-6.5,-24]],'#dfbd75','#8c6d46',.6);
  oval(c,-8.5,-23.9,2.2,1.7,'#804653');oval(c,-8,-24.3,1.2,.9,'#e5a5a9');
}
function head(c,view,flip){
  if(view==='front'){drawHeroPart(c,'princess','head',flip);return;}
  const hair=material(c,flip,['#583b36','#915948','#c58961'],15,-32,-2);
  hairOutline(c);paint(c,hair,'#513b35',1);
  if(view==='back'){
    // The back fills the face opening, retaining the original bob length.
    c.beginPath();c.moveTo(-6,-25);c.quadraticCurveTo(-1,-29,5,-26);c.strokeStyle='#d69c6f';c.lineWidth=1.15;c.stroke();
    c.beginPath();c.moveTo(-9,-19);c.quadraticCurveTo(-8,-11,-11,-5);c.strokeStyle='#583b3655';c.lineWidth=1;c.stroke();
    return;
  }
  // A soft three-quarter face, with no projecting nose or pointed chin.
  c.save();c.translate(3,0);c.scale(.85,1);
  c.beginPath();c.moveTo(0,-24);c.bezierCurveTo(-6,-24,-9.2,-20.5,-9,-15);c.bezierCurveTo(-8.7,-9.1,-5.2,-5.6,0,-5.6);c.bezierCurveTo(5.2,-5.6,8.7,-9.1,9,-15);c.bezierCurveTo(9.2,-20.5,6,-24,0,-24);c.closePath();
  paint(c,material(c,flip,p.skin,10,-24,-6),'#bb907955',.65);
  oval(c,-5.3,-9.7,1.8,.8,'#db898247');oval(c,5.3,-9.7,1.8,.8,'#db898247');c.restore();
  // The broad swept fringe turns with the face; the near lock remains short.
  c.beginPath();c.moveTo(-12.5,-7);c.bezierCurveTo(-12,-11,-14,-16,-12.5,-22);c.bezierCurveTo(-11,-28,-5,-32.2,1,-31.5);c.bezierCurveTo(9,-31,14,-24,12.4,-18);c.quadraticCurveTo(10.6,-10,12,-6);c.quadraticCurveTo(9.4,-6,9.5,-10);c.lineTo(10.1,-17);c.quadraticCurveTo(10.5,-22,7.2,-24);c.quadraticCurveTo(3,-18.4,-2.3,-17.5);c.lineTo(-.4,-20);c.quadraticCurveTo(-2,-18,-4.2,-17);c.lineTo(-4,-10);c.quadraticCurveTo(-5,-5,-12.5,-7);c.closePath();paint(c,hair,'#573d37',.8);
  c.beginPath();c.moveTo(-7,-24);c.quadraticCurveTo(-3,-29,3,-28);c.strokeStyle='#d69c6f';c.lineWidth=1.15;c.stroke();
  c.beginPath();c.moveTo(9,-24);c.quadraticCurveTo(12,-21,11,-16);c.strokeStyle='#e1ae7e';c.lineWidth=.9;c.stroke();
  // The ornament remains on her right: it is hidden on the far side when
  // facing right, and sits over the near temple when facing left.
  if(flip<0){c.save();c.translate(17,0);flower(c);c.restore();}
}

export function drawPrincessPart(c,view,part,flip){
  if(part==='head'){head(c,view,flip);return;}
  c.save();
  if(view==='side'){
    c.translate(part==='mantle'?-2.5:1.5,0);c.scale(part==='mantle'?.82:.88,1);
  }
  drawHeroPart(c,'princess',part==='mantle'?'back':'body',flip);c.restore();
}

export function drawPrincessFace(c,view,state){
  if(view==='back')return;
  c.save();if(view==='side'){c.translate(3,0);c.scale(.85,1);}
  drawHeroFace(c,'princess',state);c.restore();
}

export function drawPrincessArm(c,view,pose,side,hand,flip){
  const profile=view==='side',sx=profile?(side<0?-3:6):side*8,sy=-3;
  const ex=sx+(hand.x-sx)*3.5/6.5,ey=sy+(hand.y-sy)*4.3/10.5;
  line(c,[[sx,sy],[ex,ey],[hand.x,hand.y]],p.outline,5.6);
  line(c,[[sx,sy],[ex,ey],[hand.x,hand.y]],material(c,flip,p.arm,16,-6,11),4.4);
  line(c,[[sx+(hand.x-sx)*2/6.5,sy+1],[ex+side,ey+.7]],p.arm[2],.8);
  line(c,[[hand.x-side*1.7,hand.y-1.5],[hand.x+side*.8,hand.y-2.4]],'#dfbc95',1.1);
  oval(c,hand.x,hand.y,2.65,2.8,material(c,flip,p.skin,17,-3,11));
  line(c,[[hand.x-.9,hand.y-.6],[hand.x+1,hand.y-.9]],p.skin[2],.7);
}

export function drawPrincessFoot(c,view,pose,foot){
  const side=foot.side,profile=view==='side',x=side*(profile?3.8:6)+value(foot.x),dy=value(foot.y)-value(foot.lift),hip=side*(profile?3.4:5.5);
  line(c,[[hip,8+value(pose.bodyY)],[x,14+dy]],'#78525a',4.6);
  c.beginPath();c.moveTo(x-3.4,12+dy);c.quadraticCurveTo(x,10.6+dy,x+3.2,12+dy);c.lineTo(x+4.2,15.4+dy);c.quadraticCurveTo(x+1,18.3+dy,x-4,16.1+dy);c.closePath();paint(c,'#78525a','#49363d',.9);
  line(c,[[x-3.2,16+dy],[x+3.4,16+dy]],'#49363d',1);line(c,[[x-.5,12.1+dy],[x+2.3,12.8+dy],[x+2.9,14.4+dy]],'#b58c85',.95);
}
