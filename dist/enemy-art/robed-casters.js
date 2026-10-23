import { clamp, line, oval, poly } from './drawing.js';

const FROST={edge:'#3b5358',cloth:'#8faeba',shade:'#688997',light:'#c7d6cf',trim:'#e3dfc3',boot:'#475752',skin:'#dfcfae',skinShade:'#bdad8b',hair:'#d6d9c6'};
const TIDE={edge:'#354e48',cloth:'#8fac9b',shade:'#638c7e',light:'#d6dcc1',trim:'#ded2a5',boot:'#42564a',skin:'#dbc7a1',skinShade:'#b7a17d',hair:'#59786a'};
const fill=(c,color,edge=null,width=1.45)=>{c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function action(p,pose){
  const mode=pose.mode||'move',progress=smooth(pose.progress||0),moving=mode==='move'||mode==='air'||!!pose.moving;
  const cast=mode==='windup'?progress:mode==='active'||mode==='rush'?1:mode==='recovery'?1-progress:0;
  return {step:moving?clamp(p,-1,1):0,cast,hit:mode==='hit'?1-progress:0,windup:mode==='windup'?progress:0};
}

function boots(c,a,palette){
  for(const side of [-1,1]){
    const gait=a.step*side,x=side*6.1+gait*1.8,y=18.2-Math.max(0,gait)*2.3;
    line(c,[[side*5.4,10.5],[x,y-1]],palette.boot,4.5);
    c.beginPath();c.moveTo(x-3.6,y-2.7);c.quadraticCurveTo(x+.3,y-4,x+3.4,y-2.3);c.quadraticCurveTo(x+5.1,y-.5,x+4,y+1.5);c.quadraticCurveTo(x,y+2.1,x-3.8,y+1.1);c.closePath();fill(c,palette.boot,palette.edge,1);
    line(c,[[x-.8,y-1.5],[x+2.6,y-1.2]],palette.shade,.8);
  }
}

function robe(c,a,palette,frost){
  const hem=a.step*.85;
  // One broad curved body and a single quiet side plane keep the short
  // silhouette readable at the same size as the prince.
  c.beginPath();c.moveTo(-8,-5.5);c.quadraticCurveTo(0,-8,8.5,-5);c.quadraticCurveTo(10.5,4,13+hem,12);c.quadraticCurveTo(3+hem,17,-12.5+hem,13);c.quadraticCurveTo(-10,3,-8,-5.5);c.closePath();fill(c,palette.cloth,palette.edge);
  c.beginPath();c.moveTo(-8,-4);c.quadraticCurveTo(-4,3,-4+hem,13.8);c.quadraticCurveTo(-9,14,-11+hem,12);c.quadraticCurveTo(-10,5,-8,-4);c.closePath();fill(c,palette.shade);
  if(frost){
    c.beginPath();c.moveTo(-1,-2);c.quadraticCurveTo(2,4,1+hem,13.8);c.quadraticCurveTo(6,14,9+hem,12.6);c.quadraticCurveTo(6.2,5,6,-2);c.closePath();fill(c,palette.light);
    line(c,[[-8,8.9],[-1,10],[9.5,8.6]],palette.trim,1.5);
  }else{
    c.beginPath();c.moveTo(-10,8.6);c.quadraticCurveTo(0,13,11.4,8.8);c.lineTo(12.2+hem,11.9);c.quadraticCurveTo(1,16,-11.7+hem,12.5);c.closePath();fill(c,palette.trim);
    line(c,[[1,-2],[1.5,8.5]],palette.shade,1);
  }
}

function cloak(c,a,palette,frost){
  const shift=a.step*.7;
  c.beginPath();c.moveTo(-7,-7);c.quadraticCurveTo(-14,-5,-16+shift,4);c.quadraticCurveTo(-11,8,-6,7);c.lineTo(2,-3);c.closePath();fill(c,palette.shade,palette.edge,1.2);
  if(frost){
    c.beginPath();c.moveTo(-10,-6);c.quadraticCurveTo(-1,-10,10,-5.5);c.lineTo(13,1.8);c.quadraticCurveTo(7,4,2,1);c.quadraticCurveTo(-6,4,-13,0);c.closePath();fill(c,palette.light,palette.edge,1.1);
    line(c,[[-8,-3],[-1,-1],[7,-2.5]],palette.trim,1.5);
  }else{
    c.beginPath();c.moveTo(-10,-5.5);c.quadraticCurveTo(-1,-10,10,-5.5);c.lineTo(12.5,0);c.quadraticCurveTo(6,2,1,1);c.lineTo(-5,9);c.lineTo(-9,7);c.lineTo(-5,-.3);c.quadraticCurveTo(-9,1,-13,-1);c.closePath();fill(c,palette.light,palette.edge,1.1);
    line(c,[[-5,7],[-2,2]],palette.trim,1.2);
  }
  oval(c,2,-1.5,2,2,palette.trim);
}

function head(c,a,palette,frost){
  // The cheek and hair line, unequal eye widths and offset eye pair all
  // describe the same three-quarter view, instead of a mirrored front face.
  c.beginPath();c.moveTo(-9,-25);c.quadraticCurveTo(-15,-19,-11,-9);c.quadraticCurveTo(-6,-3,4,-4.5);c.quadraticCurveTo(13,-5,14,-15);c.quadraticCurveTo(15,-25,4,-27);c.quadraticCurveTo(-3,-29,-9,-25);c.closePath();fill(c,palette.skin,palette.edge,1.4);
  c.beginPath();c.moveTo(-10,-22);c.quadraticCurveTo(-13,-14,-9,-9);c.quadraticCurveTo(-5,-5,-1,-5.6);c.quadraticCurveTo(-7,-10,-5,-21);c.closePath();fill(c,palette.skinShade);
  oval(c,-9.3,-13,3.1,4,palette.skin);
  c.beginPath();c.moveTo(-11,-14);c.quadraticCurveTo(-13,-23,-7,-27);c.quadraticCurveTo(2,-31,11,-24);c.lineTo(11,-19);c.quadraticCurveTo(4,-19,1,-23);c.quadraticCurveTo(-4,-18,-8,-19);c.lineTo(-8,-12);c.closePath();fill(c,palette.hair);
  if(frost){
    // A low, folded cap fits the original frame; its soft tip leans away
    // from the staff and does not grow into a tall triangular cone.
    c.beginPath();c.moveTo(-14,-20);c.quadraticCurveTo(-14,-29,-7,-33);c.quadraticCurveTo(-2,-37,7,-35);c.quadraticCurveTo(11,-34,11,-30);c.quadraticCurveTo(5,-32,4,-29);c.quadraticCurveTo(11,-27,13,-20);c.closePath();fill(c,palette.cloth,palette.edge,1.5);
    c.beginPath();c.moveTo(-12,-21);c.quadraticCurveTo(-12,-29,-6,-32);c.quadraticCurveTo(-6,-26,-3,-22);c.closePath();fill(c,palette.shade);
    c.beginPath();c.moveTo(-15,-21);c.quadraticCurveTo(-4,-24,10,-21);c.quadraticCurveTo(17,-20,16,-17);c.quadraticCurveTo(2,-15,-14,-18);c.quadraticCurveTo(-17,-19,-15,-21);c.closePath();fill(c,palette.light,palette.edge,1.2);
    line(c,[[-10,-20],[-2,-20.8],[9,-19]],palette.trim,1);
  }else{
    // Rounded shell lobes provide a different silhouette from the folded
    // frost cap while keeping the same broad head-to-body relationship.
    c.beginPath();c.moveTo(-14,-19);c.quadraticCurveTo(-17,-27,-10,-30);c.quadraticCurveTo(-8,-34,-3,-31);c.quadraticCurveTo(2,-37,7,-31);c.quadraticCurveTo(14,-32,15,-25);c.quadraticCurveTo(18,-22,14,-18);c.quadraticCurveTo(0,-16,-14,-19);c.closePath();fill(c,palette.cloth,palette.edge,1.5);
    c.beginPath();c.moveTo(-12,-20);c.quadraticCurveTo(-14,-26,-10,-28);c.quadraticCurveTo(-8,-24,-5,-21);c.closePath();fill(c,palette.shade);
    c.beginPath();c.moveTo(-2,-21);c.quadraticCurveTo(-2,-27,2,-31);c.quadraticCurveTo(7,-27,8,-21);c.closePath();fill(c,palette.light);
    line(c,[[-12,-19],[0,-18],[14,-19]],palette.trim,2);
    oval(c,4,-20,2,2.5,palette.trim);
  }
  const eyeY=-12.6;
  for(const [x,width] of [[1,1.15],[8,1.55]]){
    if(a.hit)line(c,[[x-width,eyeY-1],[x+.8,eyeY],[x-width,eyeY+1]],palette.edge,1.1);
    else oval(c,x,eyeY,width,1.9,palette.edge);
  }
  if(a.cast>.2){line(c,[[-.5,-16],[2,-15.4]],palette.edge,.85);line(c,[[6.5,-15.2],[9.5,-16]],palette.edge,.85);}
  line(c,[[5,-8],[7,-8.2]],palette.skinShade,.9);
}

function staff(c,a,palette,frost){
  const handX=20.3+a.cast,handY=2-a.cast*4.3;
  line(c,[[9,-2],[14,3-a.cast*2],[handX,handY]],palette.edge,5.4);
  line(c,[[9,-2],[14,3-a.cast*2],[handX,handY]],palette.cloth,3.4);
  // Grip, shaft and ornament share one transform throughout the action.
  c.save();c.translate(handX,handY);
  line(c,[[0,10],[0,-24]],palette.edge,3.4);line(c,[[.1,9],[.1,-24]],'#9f926c',1.8);
  if(frost){
    poly(c,[[-4,-25],[-1,-31],[3,-28],[4,-22],[0,-19]],'#cbded7',palette.edge,1.15);
    poly(c,[[-1,-29],[1,-26],[-.2,-21],[-2.5,-24]],'#f0edcf');
    line(c,[[-2,-19.8],[2,-20.7]],palette.trim,1.3);
  }else{
    c.beginPath();c.moveTo(-4.3,-25);c.quadraticCurveTo(-5,-30,-2.5,-29);c.quadraticCurveTo(-2.5,-23,.2,-23);c.quadraticCurveTo(3.7,-23,3.3,-29);c.quadraticCurveTo(6.2,-28,4.8,-24);c.quadraticCurveTo(4,-20,0,-19);c.quadraticCurveTo(-4,-20,-4.3,-25);c.closePath();fill(c,palette.light,palette.edge,1.2);
    oval(c,.3,-23.5,1.7,2.1,'#8ec0b6');
  }
  oval(c,-.1,-.1,3.4,3.1,palette.edge);oval(c,.1,-.3,2.6,2.3,palette.skin);
  if(a.windup>.15){
    const r=1+a.windup*1.1;oval(c,frost?1:.4,frost?-25:-23,r,r,frost?'#f0f4df':'#d2e8ca');
  }
  c.restore();
}

function paintCaster(c,p,flip,pose,palette,frost){
  const a=action(p,pose),bodyY=a.cast*.35-Math.abs(a.step)*.55-a.hit*.65;
  c.save();c.scale(flip,1);c.lineJoin='round';c.lineCap='round';
  boots(c,a,palette);
  c.translate(a.cast*.4-a.hit*.8,bodyY);
  line(c,[[-9,-2],[-14,3],[-15.3,6-a.step]],palette.edge,5.3);
  line(c,[[-9,-2],[-14,3],[-15.3,6-a.step]],palette.cloth,3.4);
  oval(c,-15.3,7-a.step,2.6,2.6,palette.skin);
  robe(c,a,palette,frost);cloak(c,a,palette,frost);head(c,a,palette,frost);staff(c,a,palette,frost);
  c.restore();
}

export function paintFrostmage(c,p,flip=1,pose={}){paintCaster(c,p,flip,pose,FROST,true);}
export function paintTidepriest(c,p,flip=1,pose={}){paintCaster(c,p,flip,pose,TIDE,false);}
