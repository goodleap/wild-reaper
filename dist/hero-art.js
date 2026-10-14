// Additional playable silhouettes use the shared humanoid part cache and gait.
// Keep equipment out of these paths: any hero may carry any starting weapon.
const TAU=Math.PI*2;
export const HERO_PALETTES={
  princess:{cloth:['#64374f','#b26e8b','#edb5bd'],arm:['#75455f','#bd819a','#efbdc7'],outline:'#503e49',skin:['#d4a28c','#f0c9af','#ffe4cc'],face:'#f0c9af',eye:'#573f3c'},
  elder:{cloth:['#414f4b','#728278','#a9b3a0'],arm:['#4a5751','#7b8a7b','#b0b9a4'],outline:'#303e38',skin:['#af947a','#d0b497','#ecceb0'],face:'#d0b497',eye:'#49443b'}
};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const paint=(c,fill,stroke=null,width=1)=>{if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,fill)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);paint(c,fill);};
const poly=(c,points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.closePath();paint(c,fill,stroke,width);};
function material(c,flip,colors,x=16,top=-28,bottom=14){const g=c.createLinearGradient(-x*flip,bottom,x*flip,top);colors.forEach((color,i)=>g.addColorStop(i/(colors.length-1),color));return g;}

function princessBack(c,flip){
  // A short split mantle leaves both boots visible during movement.
  c.beginPath();c.moveTo(-8,-7);c.quadraticCurveTo(-13,-3,-17,11);c.quadraticCurveTo(-11,15,-6,11);c.lineTo(0,6);c.lineTo(7,12);c.quadraticCurveTo(13,14,17,9);c.quadraticCurveTo(12,-4,8,-7);c.closePath();
  paint(c,material(c,flip,['#50354a','#7b4a65','#ad758c'],18,-8,15),'#423440',1.1);
  line(c,[[-15,10],[-10,11],[-7,9]],'#c5999f',.85);line(c,[[7,10],[12,11],[15,8]],'#d0a5a9',.85);
}
function princessBody(c,flip){
  const p=HERO_PALETTES.princess;
  c.beginPath();c.moveTo(-7.5,-7);c.quadraticCurveTo(0,-9,7.5,-7);c.lineTo(6,0);c.quadraticCurveTo(8,5,11.8,9);c.quadraticCurveTo(0,14,-11.8,9);c.quadraticCurveTo(-8,5,-6,0);c.closePath();
  paint(c,material(c,flip,p.cloth,13,-8,13),p.outline,1.1);
  poly(c,[[-4,1],[-6,10],[-10,9],[-7,4]],'#5f3b574b');
  poly(c,[[3,1],[6,10],[9,9],[6,4]],'#ffe0d244');
  c.beginPath();c.moveTo(-10,8.7);c.quadraticCurveTo(0,12.7,10,8.7);c.strokeStyle='#eac398';c.lineWidth=1.1;c.stroke();
  poly(c,[[-8,-7],[-3,-6],[0,-3],[3,-6],[8,-7],[6,-2],[0,0],[-6,-2]],material(c,flip,['#caaf9a','#ead5b5','#fff1d4'],10,-8,1),p.outline,.6);
  line(c,[[-6,1],[6,1]],'#744c53',2);line(c,[[-5.6,.5],[5.6,.5]],'#e0b985',.8);
  poly(c,[[0,-1],[1.7,1],[0,3],[-1.7,1]],'#ebcb8b','#987555',.55);
}
function princessHead(c,flip){
  const hair=material(c,flip,['#583b36','#915948','#c58961'],15,-32,-2);
  c.beginPath();c.moveTo(0,-31.5);c.bezierCurveTo(-9,-31.5,-14,-25,-13,-17);c.bezierCurveTo(-12,-11,-13,-6,-15,-3);c.quadraticCurveTo(-9,0,-5,-5);c.lineTo(6,-5);c.quadraticCurveTo(11,-1,15,-4);c.bezierCurveTo(11,-7,13,-12,13,-18);c.bezierCurveTo(14,-25,8,-31.5,0,-31.5);c.closePath();paint(c,hair,'#513b35',1);
  // A short softly rounded face, framed by hair instead of a pointed chin.
  c.beginPath();c.moveTo(0,-24);c.bezierCurveTo(-6,-24,-9.2,-20.5,-9,-15);c.bezierCurveTo(-8.7,-9.1,-5.2,-5.6,0,-5.6);c.bezierCurveTo(5.2,-5.6,8.7,-9.1,9,-15);c.bezierCurveTo(9.2,-20.5,6,-24,0,-24);c.closePath();
  paint(c,material(c,flip,HERO_PALETTES.princess.skin,10,-24,-6),'#bb907955',.65);
  oval(c,-5.3,-9.7,1.8,.8,'#db898247');oval(c,5.3,-9.7,1.8,.8,'#db898247');
  // Broad swept bangs and side locks survive downscaling without fine strands.
  c.beginPath();c.moveTo(-12.5,-7);c.bezierCurveTo(-12,-11,-14,-16,-12.5,-22);c.bezierCurveTo(-11,-28,-5,-32.2,1,-31.5);c.bezierCurveTo(9,-31,14,-24,12.4,-18);c.quadraticCurveTo(10.6,-10,12,-6);c.quadraticCurveTo(8,-6,7.6,-10);c.lineTo(8.3,-17);c.quadraticCurveTo(8.8,-22,5,-24);c.quadraticCurveTo(1,-18.4,-5.8,-17.5);c.lineTo(-4,-20);c.quadraticCurveTo(-6,-18,-8.3,-17);c.lineTo(-7.4,-10);c.quadraticCurveTo(-7.4,-6,-12.5,-7);c.closePath();paint(c,hair,'#573d37',.8);
  c.beginPath();c.moveTo(-7,-24);c.quadraticCurveTo(-3,-29,3,-28);c.strokeStyle='#d69c6f';c.lineWidth=1.15;c.stroke();
  c.beginPath();c.moveTo(8,-24);c.quadraticCurveTo(11,-21,10,-16);c.strokeStyle='#e1ae7e';c.lineWidth=.9;c.stroke();
  // Small gold leaf and rose jewel; no oversized crown or floating ornaments.
  poly(c,[[-10,-24],[-11.2,-27.1],[-8.3,-25.8],[-6.5,-28],[-6.5,-24]],'#dfbd75','#8c6d46',.6);
  oval(c,-8.5,-23.9,2.2,1.7,'#804653');oval(c,-8,-24.3,1.2,.9,'#e5a5a9');
}
function elderBack(c,flip){
  c.beginPath();c.moveTo(-9,-5);c.quadraticCurveTo(-15,0,-16,10);c.quadraticCurveTo(-9,14,-4,11);c.lineTo(8,12);c.lineTo(13,8);c.lineTo(8,-5);c.closePath();
  paint(c,material(c,flip,['#343f3b','#52645a','#85927b'],16,-7,14),'#303b34',1);
}
function elderBody(c,flip){
  const p=HERO_PALETTES.elder;
  // A rounded upper back and lower collar suggest age without changing feet.
  c.beginPath();c.moveTo(-9,-4);c.quadraticCurveTo(-6,-9,2,-7);c.quadraticCurveTo(8,-6,9,-3);c.lineTo(11.5,10);c.quadraticCurveTo(1,14,-11.5,10);c.closePath();
  paint(c,material(c,flip,p.cloth,14,-8,13),p.outline,1.15);
  poly(c,[[-6,-3],[-4,1],[-7,11],[-10,10]],'#243c3444');
  poly(c,[[5,-3],[8,10],[3,12],[2,5]],'#d8ddba25');
  poly(c,[[-8,-5],[-2,-3],[6,-6],[10,-2],[3,1],[-4,0],[-10,-2]],material(c,flip,['#486564','#739b93','#a6c5af'],13,-6,2),'#354d45',.8);
  poly(c,[[4,-1],[8,-2],[9,8],[5,9]],'#6b9488','#3e5a4c',.65);line(c,[[5,7],[8,6]],'#bdd0af',.8);
  line(c,[[-8,5],[4,5]],'#655943',2);poly(c,[[-2,4],[-.3,4],[-.3,6],[-2,6]],'#c1aa79','#655943',.5);
  poly(c,[[-8,6],[-4,6],[-4,10],[-8,9.5]],'#879583','#465d4d',.65);line(c,[[-7,7],[-5,9]],'#bac6a7',.65);
}
function elderHead(c,flip){
  // A slightly forward, lower head reads as elderly, not a different hit box.
  c.save();c.translate(1.2,1.1);
  const gray=material(c,flip,['#89958e','#c4c8b6','#f0edd4'],15,-30,-4);
  c.beginPath();c.moveTo(-11,-14);c.bezierCurveTo(-15,-18,-12,-25,-8,-27);c.quadraticCurveTo(-2,-31,6,-27);c.quadraticCurveTo(14,-25,12,-17);c.lineTo(10,-9);c.lineTo(-10,-9);c.closePath();paint(c,gray,'#67766b',.9);
  oval(c,-10,-13.5,2.6,3.5,'#bf9d80');oval(c,10,-13.5,2.6,3.5,'#e1bc99');
  c.beginPath();c.moveTo(0,-23.8);c.bezierCurveTo(-6.5,-23.8,-10,-19.6,-9.3,-14);c.quadraticCurveTo(-8.7,-5.9,0,-5.4);c.quadraticCurveTo(8.7,-5.9,9.3,-14);c.bezierCurveTo(10,-19.6,6.5,-23.8,0,-23.8);c.closePath();
  paint(c,material(c,flip,HERO_PALETTES.elder.skin,12,-24,-6),'#937e6670',.65);
  // Swept wisps expose the forehead; the beard is compact, leaving a neck gap.
  c.beginPath();c.moveTo(-11,-12);c.quadraticCurveTo(-14,-22,-8,-26);c.quadraticCurveTo(-6,-29,-2,-28);c.lineTo(0,-30);c.quadraticCurveTo(2,-28,4,-28);c.quadraticCurveTo(12,-26,12,-20);c.lineTo(10,-13);c.lineTo(7.5,-17);c.lineTo(8,-21);c.quadraticCurveTo(3,-24,-2,-23);c.quadraticCurveTo(-7,-23,-8,-18);c.lineTo(-8,-12);c.closePath();paint(c,gray,'#727e71',.8);
  line(c,[[-6,-25],[-2,-27],[2,-26]],'#e8e8ce',1);line(c,[[5,-25],[8,-23],[9,-20]],'#f3efd7',.9);
  c.beginPath();c.moveTo(-8,-10);c.quadraticCurveTo(-5,-8,-1.5,-9);c.quadraticCurveTo(0,-7,1.5,-9);c.quadraticCurveTo(5,-8,8,-10);c.quadraticCurveTo(8,-6,5,-3.8);c.quadraticCurveTo(0,-1.7,-5,-3.8);c.quadraticCurveTo(-8,-6,-8,-10);c.closePath();paint(c,gray,'#8e9785',.65);
  line(c,[[-3,-7],[-1,-4.5]],'#f3edd2',.7);line(c,[[3,-7],[1,-4.5]],'#ece9ce',.7);
  line(c,[[-3.7,-19],[2.6,-19.1]],'#a28e7347',.6);
  c.restore();
}
function arm(c,kind,flip,side){
  const p=HERO_PALETTES[kind],x=side*14.5,y=kind==='elder'?8.5:7.5;
  line(c,[[side*8,-3],[side*11.5,1.3],[x,y]],p.outline,5.6);
  line(c,[[side*8,-3],[side*11.5,1.3],[x,y]],material(c,flip,p.arm,16,-6,11),4.4);
  line(c,[[side*10,-2],[side*12.5,2]],p.arm[2],.8);
  line(c,[[x-side*1.7,y-1.5],[x+side*.8,y-2.4]],kind==='princess'?'#dfbc95':'#b7bd9f',1.1);
  oval(c,x,y,2.65,2.8,material(c,flip,p.skin,17,-3,11));
  line(c,[[x-.9,y-.6],[x+1,y-.9]],p.skin[2],.7);
}
export function drawHeroPart(c,kind,part,flip){
  if(!HERO_PALETTES[kind])return false;
  if(part==='back')(kind==='princess'?princessBack:elderBack)(c,flip);
  else if(part==='body')(kind==='princess'?princessBody:elderBody)(c,flip);
  else if(part==='head')(kind==='princess'?princessHead:elderHead)(c,flip);
  else if(part==='left'||part==='right')arm(c,kind,flip,part==='left'?-1:1);
  return true;
}
export function drawHeroFace(c,kind,state){
  if(!HERO_PALETTES[kind])return false;
  const elder=kind==='elder',p=HERO_PALETTES[kind];
  c.save();if(elder)c.translate(1.2,1.1);
  const y=elder?-13:-12.8;
  for(let i=0;i<2;i++){
    const x=i?3.6:-3.6;
    if(state==='hurt')line(c,[[x+(i?1.5:-1.5),y-1.6],[x+(i?-.9:.9),y],[x+(i?1.5:-1.5),y+1.4]],p.eye,1.2);
    else if(state==='blink')line(c,[[x-1.4,y+.2],[x+1.4,y+.2]],p.eye,1);
    else if(state==='focus')line(c,[[x-1.5,y+(i?-.6:.3)],[x+1.5,y+(i?.3:-.6)]],p.eye,1.5);
    else if(state==='glad'){c.beginPath();c.moveTo(x-1.5,y+.8);c.quadraticCurveTo(x,y-1.5,x+1.5,y+.8);c.strokeStyle=p.eye;c.lineWidth=1.1;c.stroke();}
    else oval(c,x,y,1.5,2,p.eye);
    if(elder){const browY=y-3.4;line(c,[[x-2,browY+(i?-.2:.3)],[x+.3,browY-.8],[x+2,browY+.1]],'#8c9484',2);line(c,[[x-1.8,browY-.3],[x+.4,browY-1],[x+1.7,browY-.3]],'#eeead0',1.1);}
  }
  if(!elder){c.beginPath();c.moveTo(-1.2,-8.1);c.quadraticCurveTo(0,state==='hurt'?-9:state==='focus'?-8.1:-7.2,1.2,-8.1);c.strokeStyle='#b0736d';c.lineWidth=.65;c.stroke();}
  else oval(c,0,-9.8,1.15,.8,'#bd987b');
  c.restore();return true;
}
