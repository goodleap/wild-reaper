import {HeroAnimator} from './hero-animation.js';

// The new appearances own their material cache. Original heroes and NPCs never
// enter this renderer, and animation does not multiply the cached frame count.
const TAU=Math.PI*2,CACHE_LIMIT=2*1024*1024;
const HEROES=new Set(['traveler','princess','elder']);
export const DIRECTIONAL_HERO_IDS=new Set([...HEROES].map(kind=>`${kind}-v2`));
const BOX={head:[44,46,22,39],torso:[38,29,19,14]};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const value=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const PALETTES={
  traveler:{outline:'#293f32',cloth:['#3b5b43','#759064','#afbb8a'],cape:['#304b39','#54754b','#86a568'],trim:'#d4c18a',skin:['#b88d70','#e6bf95','#ffe0ad'],hair:['#302f29','#59503a','#8c7951'],boot:['#303c2e','#556047','#92936a'],eye:'#344432'},
  princess:{outline:'#573d48',cloth:['#703e59','#b76f89','#edb2bc'],cape:['#593a53','#885672','#b68195'],trim:'#e8c590',skin:['#cb9a85','#f1c8ac','#ffe8cb'],hair:['#533c37','#935b46','#d29666'],boot:['#4c343b','#805660','#ba9190'],eye:'#503a3c'},
  elder:{outline:'#35483f',cloth:['#425c51','#778c79','#b3bea3'],cape:['#344d44','#58766a','#88a38c'],trim:'#c2bb92',skin:['#a48870','#d0ad8a','#edcba3'],hair:['#7b8c80','#c0c8b5','#f2ecd2'],boot:['#343e32','#62664d','#9c9b7d'],eye:'#514b3d'}
};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const paint=(c,fill,stroke=null,width=1)=>{if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,fill,stroke=null,width=1)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);paint(c,fill,stroke,width);};
const poly=(c,points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.closePath();paint(c,fill,stroke,width);};
function material(c,colors,flip=1,top=-30,bottom=14,width=17){const g=c.createLinearGradient(-width*flip,bottom,width*flip,top);colors.forEach((color,i)=>g.addColorStop(i/(colors.length-1),color));return g;}
function jewel(c,x,y,r,fill='#d8b970'){poly(c,[[x,y-r],[x+r*.75,y],[x,y+r],[x-r*.75,y]],fill,'#866b47',.65);poly(c,[[x,y-r],[x+r*.75,y],[x,y]],'#fff0ba');}

function princeHead(c,view,flip){
  const p=PALETTES.traveler,hood=material(c,['#9e9d78','#d9d6ac','#f4ebc7'],flip);
  if(view==='side'){
    c.beginPath();c.moveTo(-11,-8);c.bezierCurveTo(-17,-17,-12,-29,-3,-32);c.quadraticCurveTo(8,-33,12,-24);c.lineTo(8,-8);c.quadraticCurveTo(-1,-3,-11,-8);c.closePath();paint(c,hood,p.outline,1.1);
    c.beginPath();c.moveTo(3,-24);c.quadraticCurveTo(11,-24,11,-18);c.lineTo(14,-14.5);c.quadraticCurveTo(13.8,-13,11,-13);c.lineTo(10,-8.5);c.quadraticCurveTo(5,-5,1,-9);c.lineTo(-1,-20);c.closePath();paint(c,material(c,p.skin,flip),'#765e4580',.7);
    poly(c,[[1,-25],[8,-25],[11,-21],[7,-20],[5,-17],[4,-21],[0,-18],[-2,-12],[-4,-18]],material(c,p.hair,flip));
    c.beginPath();c.moveTo(-10,-12);c.quadraticCurveTo(-13,-24,-2,-29);c.quadraticCurveTo(8,-28,11,-24);c.strokeStyle='#f7edca';c.lineWidth=1.1;c.stroke();
    c.beginPath();c.moveTo(-8,-8);c.quadraticCurveTo(-2,-3,7,-7);c.lineTo(6,-3);c.quadraticCurveTo(-3,-1,-10,-5);c.closePath();paint(c,'#6f8057',p.outline,.65);
    line(c,[[-10,-22],[-7,-26],[-5,-27]],'#a6a582',.9);return;
  }
  c.beginPath();c.moveTo(-13,-7);c.bezierCurveTo(-17,-18,-11,-29,0,-32);c.bezierCurveTo(11,-29,16,-19,13,-7);c.quadraticCurveTo(0,-1,-13,-7);c.closePath();paint(c,hood,p.outline,1.2);
  if(view==='back'){
    c.beginPath();c.moveTo(0,-31);c.quadraticCurveTo(-4,-20,-1,-8);c.strokeStyle='#a9ad86';c.lineWidth=1.1;c.stroke();
    c.beginPath();c.moveTo(2,-29);c.quadraticCurveTo(11,-22,11,-12);c.strokeStyle='#fff0c6';c.lineWidth=1.1;c.stroke();
    c.beginPath();c.moveTo(-11,-8);c.quadraticCurveTo(0,-3,11,-8);c.lineTo(10,-4);c.quadraticCurveTo(0,1,-10,-4);c.closePath();paint(c,'#76815b',p.outline,.7);return;
  }
  oval(c,0,-15.2,9.5,10.2,'#394939');
  c.beginPath();c.moveTo(-7.6,-19);c.quadraticCurveTo(0,-25,7.6,-19);c.lineTo(7,-12);c.quadraticCurveTo(5,-7,0,-6.9);c.quadraticCurveTo(-6,-7,-7,-12);c.closePath();paint(c,material(c,p.skin,flip),'#9c80555c',.6);
  poly(c,[[-8,-20],[-2,-25],[6,-22],[8,-19],[3,-20],[0,-17],[0,-20],[-5,-17],[-6,-13]],material(c,p.hair,flip));
  c.beginPath();c.moveTo(-11,-12);c.quadraticCurveTo(-11,-23,-2,-28);c.strokeStyle='#fff0c7';c.lineWidth=1.05;c.stroke();
  c.beginPath();c.moveTo(-9,-6);c.quadraticCurveTo(0,-2,9,-6);c.lineTo(7,-2);c.quadraticCurveTo(0,1,-7,-2);c.closePath();paint(c,'#7a8d60',p.outline,.65);
}

function princessHead(c,view,flip){
  const p=PALETTES.princess,hair=material(c,p.hair,flip),skin=material(c,p.skin,flip);
  if(view==='side'){
    c.beginPath();c.moveTo(-11,-4);c.bezierCurveTo(-14,-12,-14,-24,-5,-29);c.quadraticCurveTo(5,-34,11,-25);c.quadraticCurveTo(13,-17,7,-9);c.quadraticCurveTo(3,-3,-11,-4);c.closePath();paint(c,hair,'#553b34',1);
    c.beginPath();c.moveTo(3,-24);c.quadraticCurveTo(10,-24,10,-18);c.lineTo(13.2,-14.4);c.quadraticCurveTo(13.4,-13,10.8,-12.6);c.quadraticCurveTo(10,-6.2,4.8,-6.2);c.quadraticCurveTo(0,-7,-.7,-13);c.lineTo(-1,-20);c.closePath();paint(c,skin,'#ad816f70',.65);
    oval(c,1,-13,2.1,3,p.skin[1]);
    c.beginPath();c.moveTo(-10,-8);c.quadraticCurveTo(-12,-25,-3,-28);c.quadraticCurveTo(7,-31,10,-23);c.quadraticCurveTo(5,-22,1,-17);c.lineTo(1,-23);c.quadraticCurveTo(-6,-20,-4,-10);c.lineTo(-6,-3);c.closePath();paint(c,hair,'#684438',.75);
    c.beginPath();c.moveTo(-8,-17);c.quadraticCurveTo(-7,-25,-1,-26);c.strokeStyle='#dba57c';c.lineWidth=1.15;c.stroke();
    poly(c,[[-7,-26],[-8,-31],[-3,-28],[0,-34],[3,-29],[7,-31],[8,-26],[1,-24]],'#d9af69','#886744',.7);line(c,[[-5,-26],[1,-25],[6,-26]],'#ffdfa0',.85);jewel(c,1,-27,1.8,'#a65b65');
    oval(c,1,-10,1,1.4,'#e8c98c');return;
  }
  c.beginPath();c.moveTo(-12,-4);c.bezierCurveTo(-14,-11,-15,-24,-7,-29);c.quadraticCurveTo(0,-33,7,-29);c.bezierCurveTo(15,-24,14,-11,12,-4);c.quadraticCurveTo(0,0,-12,-4);c.closePath();paint(c,hair,'#553b34',1);
  if(view==='back'){
    c.beginPath();c.moveTo(-7,-25);c.quadraticCurveTo(-12,-15,-8,-5);c.strokeStyle='#b47856';c.lineWidth=1.5;c.stroke();
    c.beginPath();c.moveTo(2,-28);c.quadraticCurveTo(11,-19,7,-5);c.strokeStyle='#dfaa79';c.lineWidth=1.25;c.stroke();
    c.beginPath();c.moveTo(-1,-27);c.quadraticCurveTo(3,-17,0,-4);c.strokeStyle='#734a3e';c.lineWidth=1.2;c.stroke();
    poly(c,[[-10,-26],[-10,-30],[-5,-28],[0,-32],[5,-28],[10,-30],[10,-26],[0,-24]],'#b58c53','#7c6041',.7);line(c,[[-9,-25],[0,-23.5],[9,-25]],'#f2ce88',1);return;
  }
  c.beginPath();c.moveTo(0,-24);c.bezierCurveTo(-7,-24,-9,-19,-8.3,-14);c.quadraticCurveTo(-7.8,-6.5,0,-6);c.quadraticCurveTo(7.8,-6.5,8.3,-14);c.bezierCurveTo(9,-19,7,-24,0,-24);c.closePath();paint(c,skin,'#aa847263',.6);
  oval(c,-5.1,-9.6,1.7,.7,'#d88c843b');oval(c,5.1,-9.6,1.7,.7,'#d88c843b');
  c.beginPath();c.moveTo(-11,-7);c.quadraticCurveTo(-14,-24,-5,-29);c.quadraticCurveTo(7,-32,12,-23);c.lineTo(10,-7);c.quadraticCurveTo(7,-5,7.5,-11);c.lineTo(8,-19);c.quadraticCurveTo(5,-24,3,-23);c.quadraticCurveTo(0,-18,-6,-17);c.lineTo(-4,-20);c.lineTo(-8,-17);c.lineTo(-7.3,-10);c.quadraticCurveTo(-7,-5,-11,-7);c.closePath();paint(c,hair,'#684438',.75);
  c.beginPath();c.moveTo(-8,-23);c.quadraticCurveTo(-4,-29,3,-27);c.strokeStyle='#dfaa79';c.lineWidth=1.1;c.stroke();
  poly(c,[[-10,-26],[-11,-31],[-6,-28],[-4,-33],[0,-29],[4,-33],[6,-28],[11,-31],[10,-26],[0,-24]],'#dfb774','#8e6d45',.7);line(c,[[-9,-25],[0,-23.5],[9,-25]],'#ffdfa3',1);jewel(c,0,-27,2.05,'#a95e72');
  oval(c,-9,-10,1,1.3,'#ecd192');oval(c,9,-10,1,1.3,'#ecd192');
}

function elderHead(c,view,flip){
  const p=PALETTES.elder,hair=material(c,p.hair,flip),skin=material(c,p.skin,flip);
  if(view==='side'){
    c.beginPath();c.moveTo(-9,-7);c.quadraticCurveTo(-16,-19,-8,-26);c.quadraticCurveTo(3,-33,10,-22);c.lineTo(8,-8);c.closePath();paint(c,hair,'#637669',.85);
    c.beginPath();c.moveTo(1,-23);c.quadraticCurveTo(9,-24,10,-18);c.lineTo(14.7,-13.7);c.quadraticCurveTo(16,-11.5,11.6,-10.8);c.lineTo(10.2,-6);c.quadraticCurveTo(2,-3,-1,-10);c.lineTo(-2,-18);c.closePath();paint(c,skin,'#88765d75',.7);
    oval(c,-1,-13.4,2.6,3.2,p.skin[1],'#ae8e6a',.55);
    c.beginPath();c.moveTo(-9,-11);c.quadraticCurveTo(-15,-23,-6,-27);c.lineTo(-3,-29);c.lineTo(-1,-27);c.quadraticCurveTo(6,-28,9,-23);c.quadraticCurveTo(3,-24,0,-21);c.lineTo(-4,-17);c.lineTo(-4,-9);c.closePath();paint(c,hair,'#71806e',.8);
    c.beginPath();c.moveTo(0,-9);c.quadraticCurveTo(5,-7,10.5,-10);c.quadraticCurveTo(13,-6,8,-.8);c.lineTo(6,1.3);c.lineTo(5,-.3);c.quadraticCurveTo(-1,-2,-2,-7);c.closePath();paint(c,hair,'#87957e',.7);
    line(c,[[3,-7],[6,-4],[7,-1]],'#ede9d0',1);line(c,[[-9,-22],[-5,-25],[-1,-25]],'#f3edd1',1.1);return;
  }
  c.beginPath();c.moveTo(-11,-8);c.quadraticCurveTo(-16,-20,-8,-26);c.quadraticCurveTo(0,-31,8,-26);c.quadraticCurveTo(15,-20,11,-8);c.closePath();paint(c,hair,'#65766b',.9);
  if(view==='back'){
    oval(c,0,-21,7.6,6,skin);
    c.beginPath();c.moveTo(-10,-21);c.quadraticCurveTo(-14,-12,-7,-7);c.quadraticCurveTo(0,-4,8,-8);c.quadraticCurveTo(12,-14,10,-21);c.lineTo(7,-17);c.quadraticCurveTo(1,-12,-7,-17);c.closePath();paint(c,hair,'#788874',.75);
    line(c,[[-9,-15],[-7,-10],[-3,-8]],'#dce1c7',1.1);line(c,[[6,-9],[9,-13],[9,-17]],'#f2ecd0',1);line(c,[[-4,-26],[1,-27],[6,-25]],'#ece8cd',.9);return;
  }
  c.beginPath();c.moveTo(0,-24);c.quadraticCurveTo(-11,-24,-9.2,-13);c.quadraticCurveTo(-8,-6,0,-5);c.quadraticCurveTo(8,-6,9.2,-13);c.quadraticCurveTo(11,-24,0,-24);c.closePath();paint(c,skin,'#96806465',.6);
  oval(c,-10,-13,2.3,3.1,p.skin[1]);oval(c,10,-13,2.3,3.1,p.skin[2]);
  c.beginPath();c.moveTo(-10,-10);c.quadraticCurveTo(-15,-23,-6,-27);c.lineTo(-2,-29);c.lineTo(0,-27);c.quadraticCurveTo(10,-29,12,-20);c.lineTo(9,-10);c.lineTo(7,-15);c.lineTo(8,-21);c.quadraticCurveTo(1,-25,-7,-21);c.lineTo(-7,-15);c.closePath();paint(c,hair,'#74816e',.8);
  c.beginPath();c.moveTo(-8,-9.5);c.quadraticCurveTo(-4,-7,-1,-9);c.lineTo(0,-7.5);c.lineTo(1,-9);c.quadraticCurveTo(4,-7,8,-9.5);c.quadraticCurveTo(9,-4,4,-1);c.lineTo(0,1);c.lineTo(-4,-1);c.quadraticCurveTo(-9,-4,-8,-9.5);c.closePath();paint(c,hair,'#87917d',.7);
  line(c,[[-4,-6],[-2,-2],[0,-.5]],'#f2edd2',1);line(c,[[3,-6],[2,-2]],'#d8dfc7',.8);line(c,[[-7,-24],[-3,-26],[0,-25]],'#efecd0',1);line(c,[[5,-25],[8,-22]],'#f2edd2',.9);
}

function drawTorso(c,kind,view,flip){
  const p=PALETTES[kind],side=view==='side',back=view==='back',w=side?7:9;
  c.beginPath();c.moveTo(-w,-5);c.quadraticCurveTo(side?-5:0,kind==='elder'?-12:-10,w,-6);c.lineTo(w+1,4);c.quadraticCurveTo(0,7,-w-1,4);c.closePath();paint(c,material(c,p.cloth,flip),p.outline,1);
  poly(c,[[-w+1,-3],[-w+3,1],[-w+2,4],[-w-1,4]],'#122c2635');
  if(kind==='traveler'){
    const collar=material(c,['#5d7450','#8eaa70','#bcc98f'],flip);
    poly(c,[[-w-1,-6],[0,-3],[w+1,-6],[w,-1],[0,1],[-w,-1]],collar,p.outline,.75);
    if(!back){line(c,[[-w,3],[w,3]],'#554d36',2.2);jewel(c,side?3:0,3,1.7);if(!side)line(c,[[0,-2],[0,1]],'#dbc996',.8);}
    if(back){line(c,[[-6,-2],[5,4]],'#b3b07d',2);line(c,[[-6,-2],[5,4]],'#585b3f',.7);}
  }else if(kind==='princess'){
    poly(c,[[-w,-6],[-4,-5],[0,-2],[4,-5],[w,-6],[w-2,-1],[0,1],[-w+2,-1]],material(c,['#c4aa8e','#e9d1ae','#fff0ce'],flip),p.outline,.6);
    line(c,[[-w+2,3],[w-2,3]],'#714753',2);line(c,[[-w+2,2.4],[w-2,2.4]],p.trim,.9);
    if(back){line(c,[[-2,-1],[2,1],[-2,2],[2,3]],'#e8c18b',.8);}else jewel(c,side?3:0,2.8,1.6,'#bb7c80');
  }else{
    poly(c,[[-w,-6],[-2,-3],[w,-6],[w+2,-1],[2,2],[-w,0]],material(c,['#355b52','#759d8a','#acc3a5'],flip),p.outline,.75);
    if(!back){poly(c,[[side?3:4,0],[side?6:7,-1],[side?8:9,10],[side?4:5,10]],'#729783','#405d4c',.65);line(c,[[side?5:6,8],[side?7:8,7]],'#c8ccaa',.9);}
    line(c,[[-w,4],[w,4]],'#686044',2);if(!back)jewel(c,side?2:-1,4,1.4,'#c5af7f');
  }
}

function face(c,kind,view,state){
  if(view==='back')return;
  const p=PALETTES[kind],side=view==='side',elder=kind==='elder',y=elder?-15.1:kind==='traveler'?-13.9:-13.3;
  for(const x of side?[8]:[-3.5,3.5]){
    if(state==='blink')line(c,[[x-1.3,y],[x+1.3,y]],p.eye,1);
    else if(state==='hurt')line(c,[[x-1.2,y-1.2],[x+.7,y],[x-1.2,y+1.2]],p.eye,1.1);
    else if(state==='focus')line(c,[[x-1.3,y-.5],[x+1.3,y+.3]],p.eye,1.4);
    else oval(c,x,y,side?1:1.35,1.75,p.eye);
    if(elder){line(c,[[x-2,y-2.5],[x+.2,y-3.2],[x+2,y-2.6]],'#8b9785',2);line(c,[[x-1.8,y-3],[x+.3,y-3.6],[x+1.7,y-3]],'#f3edd4',1);}
    else if(state!=='blink'&&state!=='hurt')oval(c,x+.3,y-.5,.37,.4,'#fff2d1');
  }
  if(!elder){const x=side?9.5:0;line(c,[[x-1,-8.7],[x+.6,-8.4]],kind==='princess'?'#b2756c':'#ad8462',.65);}
  else if(!side){oval(c,0,-11.7,1.8,1.6,'#bb9676');line(c,[[-2,-20],[2,-20]],'#a18e705c',.7);}
}

// Anchors are in unflipped local space; torso translation is applied by draw.
// Any weapon can use them without introducing equipment into an appearance.
export function directionalHeroHands(kind,pose={}){
  const side=pose.view==='side',swing=value(pose.armSwing),strength=clamp(value(pose.actionStrength),0,1),action=pose.action||'idle';
  const hands=side?{left:{x:2-swing*.8,y:7},right:{x:8+swing,y:8}}:{left:{x:-13+swing*.2,y:7-swing*.65},right:{x:13+swing*.2,y:7+swing*.65}};
  if(action==='melee'){
    const progress=clamp(value(pose.actionProgress),0,1),sweep=Math.sin(progress*Math.PI);
    hands.right.x+=(side?9:7)*strength*sweep;hands.right.y-=7*strength+(1-sweep)*3*strength;
    hands.left.x-=2*strength;hands.left.y-=2*strength;
  }else if(action==='ranged'){
    const a=value(pose.aimAngle),flip=pose.flip===-1?-1:1,dx=Math.cos(a)*flip,dy=Math.sin(a)*.65;
    hands.right={x:(side?5:7)+dx*11*strength,y:6+(dy*12-9)*strength};
    hands.left={x:(side?-1:-8)+dx*8*strength,y:6+(dy*8-8)*strength};
  }else if(action==='cast'){
    hands.right={x:(side?15:17),y:6-16*strength};hands.left={x:side?4:-13,y:6-10*strength};
  }else if(action==='hurt'){
    hands.right.x-=4*strength;hands.right.y-=5*strength;hands.left.x+=4*strength;hands.left.y-=2*strength;
  }
  if(kind==='elder'){hands.left.y+=.8;hands.right.y+=.8;}
  if(action==='melee'&&Number.isFinite(pose.hand?.x)&&Number.isFinite(pose.hand?.y))hands.right={...pose.hand};
  return hands;
}

export class DirectionalHeroArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.animator=new HeroAnimator();this.cache=new Map();this.bytes=0;this.builds=0;}
  get cacheStats(){return {entries:this.cache.size,bytes:this.bytes,limitBytes:CACHE_LIMIT,builds:this.builds};}
  _sprite(kind,view,part,flip,ratio){
    const key=`${kind}:${view}:${part}:${flip}:${ratio}`;
    if(this.cache.has(key)){const hit=this.cache.get(key);this.cache.delete(key);this.cache.set(key,hit);return hit;}
    const [w,h,ox,oy]=BOX[part],canvas=this.makeCanvas();canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);
    const c=canvas.getContext('2d');c.scale(ratio,ratio);c.translate(ox,oy);c.lineJoin='round';c.lineCap='round';
    if(part==='torso')drawTorso(c,kind,view,flip);else ({traveler:princeHead,princess:princessHead,elder:elderHead})[kind](c,view,flip);
    const sprite={canvas,w,h,ox,oy,bytes:canvas.width*canvas.height*4};
    while(this.bytes+sprite.bytes>CACHE_LIMIT&&this.cache.size){const first=this.cache.keys().next().value;this.bytes-=this.cache.get(first).bytes;this.cache.delete(first);}
    this.cache.set(key,sprite);this.bytes+=sprite.bytes;this.builds++;return sprite;
  }
  _part(c,kind,view,part,flip,ratio){const s=this._sprite(kind,view,part,flip,ratio);c.drawImage(s.canvas,-s.ox,-s.oy,s.w,s.h);}
  draw(c,kind,options={}){
    if(typeof kind!=='string')return false;
    kind=kind.replace(/-v2$/,'');
    if(!HEROES.has(kind))return false;
    const {entity={},time=0,reduced=false,pixelRatio=2}=options;
    // Legacy humanoidPose must never override the new distance-based pose.
    const sampled=options.pose?.view?options.pose:this.animator.sample(entity,{time,reduced,frozen:options.frozen??entity.visualFrozen??false});
    const pose={view:'front',flip:1,bodyY:0,lean:0,shoulder:0,cloth:0,hair:0,armSwing:0,...sampled};
    const view=['front','back','side'].includes(pose.view)?pose.view:'front',flip=pose.flip===-1?-1:1,ratio=clamp(Math.ceil(value(pixelRatio,2)),1,2),p=PALETTES[kind];
    const fall=pose.action==='fall'?clamp(value(pose.actionProgress),0,1):0;
    c.save();c.lineCap='round';c.lineJoin='round';c.scale(flip,1);
    if(fall){c.translate(0,17);c.rotate(fall*.98);c.scale(1,1-fall*.12);c.translate(0,-17);}
    if(view!=='back')this._cape(c,kind,view,pose,flip);
    const feet=[{side:-1,...pose.leftFoot},{side:1,...pose.rightFoot}].sort((a,b)=>value(a.y)-value(b.y));
    for(const foot of feet)this._leg(c,kind,view,pose,foot,flip);
    c.save();c.translate(0,value(pose.bodyY));
    const hands=directionalHeroHands(kind,pose);
    this._arm(c,kind,view,pose,-1,hands.left,flip);
    this._skirt(c,kind,view,pose,flip);
    this._part(c,kind,view,'torso',flip,ratio);
    if(view==='back')this._arm(c,kind,view,pose,1,hands.right,flip);
    if(view==='back')this._cape(c,kind,view,{...pose,bodyY:0},flip);
    if(kind==='princess')this._hairTail(c,view,pose,flip);
    c.save();c.translate(kind==='elder'?(view==='side'?2.2:.5):0,kind==='elder'?1:0);
    c.rotate(view==='side'?value(pose.lean):value(pose.shoulder));
    this._part(c,kind,view,'head',flip,ratio);face(c,kind,view,pose.faceState||'normal');c.restore();
    if(view!=='back')this._arm(c,kind,view,pose,1,hands.right,flip);
    // One quiet shoulder highlight makes the turning volume readable at 1×.
    if(view==='side')line(c,[[-1,-6],[2,-5],[3,-3]],p.cloth[2],.8);
    c.restore();c.restore();return true;
  }
  _leg(c,kind,view,pose,foot,flip){
    const p=PALETTES[kind],side=foot.side,profile=view==='side',baseX=profile?side*2.4:side*5.3;
    const x=baseX+value(foot.x),lift=value(foot.lift),y=14.8+value(foot.y)-lift,hipX=profile?side*1.8:side*4.7;
    const kneeX=hipX+(x-hipX)*.55+(profile?1.4:0),kneeY=9.4+value(pose.bodyY)*.3-lift*.4;
    line(c,[[hipX,4.8+value(pose.bodyY)],[kneeX,kneeY],[x,y-1]],p.outline,4.7);
    line(c,[[hipX,4.8+value(pose.bodyY)],[kneeX,kneeY],[x,y-1]],kind==='princess'?'#cfb8a0':p.cloth[1],3.2);
    c.beginPath();c.moveTo(x-2.9,y-2.9);c.quadraticCurveTo(x,y-4,x+2.6,y-2.7);c.lineTo(x+(profile?5.2:3.7),y+.9);c.quadraticCurveTo(x+1,y+3.2,x-3.5,y+1.8);c.closePath();paint(c,material(c,p.boot,flip,7,18,13),p.boot[0],.85);
    line(c,[[x-2.8,y+1.6],[x+(profile?4.3:3),y+1.2]],p.boot[0],1.05);line(c,[[x-.8,y-2.4],[x+1.6,y-2],[x+2.8,y-.4]],p.boot[2],.8);
    if(kind==='princess')line(c,[[x-2,y-2],[x+1.5,y-2.3]],p.trim,.65);
  }
  _arm(c,kind,view,pose,side,hand,flip){
    const p=PALETTES[kind],profile=view==='side',sx=profile?(side<0?-3:2.7):side*8.1,sy=-3+(side<0?-value(pose.shoulder):value(pose.shoulder))*9;
    const ex=sx+(hand.x-sx)*.42+(profile?-1:side*1.2),ey=sy+(hand.y-sy)*.62+1.1;
    line(c,[[sx,sy],[ex,ey],[hand.x,hand.y]],p.outline,5.9);
    line(c,[[sx,sy],[ex,ey],[hand.x,hand.y]],material(c,p.cloth,flip,-7,10),4.4);
    line(c,[[sx+.5,sy-.5],[ex+.6,ey-.8]],p.cloth[2],.9);
    const dx=hand.x-ex,dy=hand.y-ey,len=Math.hypot(dx,dy)||1;
    line(c,[[hand.x-dy/len*2.1-dx/len*1.3,hand.y+dx/len*2.1-dy/len*1.3],[hand.x+dy/len*2.1-dx/len*1.3,hand.y-dx/len*2.1-dy/len*1.3]],p.trim,1.05);
    oval(c,hand.x,hand.y,2.5,2.7,material(c,p.skin,flip,-7,11),p.outline,.55);line(c,[[hand.x-.8,hand.y-.7],[hand.x+.7,hand.y-.9]],p.skin[2],.7);
  }
  _skirt(c,kind,view,pose,flip){
    const p=PALETTES[kind],side=view==='side',cloth=value(pose.cloth),stride=value(pose.stride),left=value(pose.leftFoot?.lift),right=value(pose.rightFoot?.lift);
    const width=side?(kind==='princess'?10:8.5):(kind==='princess'?12.3:10.5),hem=kind==='traveler'?8.5:kind==='elder'?10.2:9.3;
    c.beginPath();c.moveTo(-6,1);c.lineTo(6,1);c.quadraticCurveTo(width-2,5,width+cloth*.3,hem-right*.22);c.quadraticCurveTo(5,hem+2,1,hem-.5);c.lineTo(0,hem-2-stride*.5);c.lineTo(-1,hem-.3);c.quadraticCurveTo(-6,hem+1,-width+cloth*.3,hem-left*.22);c.quadraticCurveTo(-width+3,5,-6,1);c.closePath();paint(c,material(c,p.cloth,flip,0,12),p.outline,1);
    if(kind==='princess'){
      // Three broad panels flex separately and expose each stepping shin.
      poly(c,[[-4,2],[-6+cloth*.16,hem-left*.2],[-width+cloth*.3,hem-left*.22],[-8,5]],'#663f5862');
      poly(c,[[3,2],[7,5],[width+cloth*.3,hem-right*.22],[5+cloth*.2,hem+.6]],'#ffdfce48');
      c.beginPath();c.moveTo(-width+1+cloth*.3,hem-left*.22-.8);c.quadraticCurveTo(-5,hem+1,0,hem-2-stride*.5);c.quadraticCurveTo(6,hem+1,width-1+cloth*.3,hem-right*.22-.8);c.strokeStyle=p.trim;c.lineWidth=1;c.stroke();
      line(c,[[-3,4],[-4+cloth*.1,7]],'#e4acb641',.75);
    }else{
      poly(c,[[-5,2],[-7+cloth*.2,hem],[-width+cloth*.3,hem-left*.22],[-8,4]],'#1a342b40');
      line(c,[[3,3],[5+cloth*.15,hem-.5]],p.cloth[2],.85);
      if(kind==='elder')line(c,[[-width+1,hem-.4],[-5,hem+.5],[0,hem-1],[5,hem+.5],[width-1,hem-.4]],'#bbc0a2',.75);
    }
  }
  _cape(c,kind,view,pose,flip){
    const p=PALETTES[kind],cloth=value(pose.cloth),body=value(pose.bodyY),side=view==='side',back=view==='back';
    c.save();c.translate(0,body);
    if(side){
      const trail=kind==='traveler'?3+value(pose.stride)*.6:kind==='princess'?3:2;
      c.beginPath();c.moveTo(-5,-6);c.quadraticCurveTo(-12,0,-13-trail+cloth*.5,10-cloth*.2);c.quadraticCurveTo(-9-trail,14,-3,10);c.lineTo(2,-3);c.closePath();paint(c,material(c,p.cape,flip,-8,14),p.outline,.9);
      c.beginPath();c.moveTo(-7,-4);c.quadraticCurveTo(-10,3,-12-trail+cloth*.5,10-cloth*.2);c.strokeStyle=p.cape[2];c.lineWidth=1;c.stroke();
    }else{
      const width=kind==='traveler'?15:kind==='princess'?14:12.5,hem=kind==='traveler'?11:10;
      c.beginPath();c.moveTo(-8,-6);c.quadraticCurveTo(-12,1,-width+cloth*.5,hem);c.quadraticCurveTo(-7,hem+3,0,hem+1.3);c.quadraticCurveTo(7,hem+3,width+cloth*.5,hem-.5);c.quadraticCurveTo(12,0,8,-6);c.closePath();paint(c,material(c,p.cape,flip,-8,15),p.outline,1);
      if(back){
        c.beginPath();c.moveTo(-7,-4);c.quadraticCurveTo(-9,4,-10+cloth*.3,hem-.5);c.strokeStyle=p.cape[0];c.lineWidth=1.6;c.stroke();
        c.beginPath();c.moveTo(5,-3);c.quadraticCurveTo(7,4,9+cloth*.3,hem);c.strokeStyle=p.cape[2];c.lineWidth=1.15;c.stroke();
        line(c,[[-width+2+cloth*.5,hem-.3],[-7,hem+1],[0,hem],[7,hem+1],[width-2+cloth*.5,hem-.8]],kind==='traveler'?'#b5b97d':p.trim,.75);
        if(kind==='traveler'){poly(c,[[0,-2],[-3,2],[0,7],[3,2]],'#afba87','#53704b',.6);line(c,[[0,0],[0,5]],'#e0d7a1',.8);}
      }
    }
    c.restore();
  }
  _hairTail(c,view,pose,flip){
    const hair=value(pose.hair),p=PALETTES.princess;
    const sides=view==='side'?[-1]:[-1,1];
    for(const side of sides){const x=view==='side'?-9:side*9;
      c.beginPath();c.moveTo(x-3,-15);c.quadraticCurveTo(x-4+hair*.25,-5,x-3+hair*.5,2);c.quadraticCurveTo(x+1+hair*.5,5,x+4+hair*.4,-.5);c.quadraticCurveTo(x+1+hair*.2,-5,x+3,-15);c.closePath();paint(c,material(c,p.hair,flip),'#5c4037',.7);
      c.beginPath();c.moveTo(x,-11);c.quadraticCurveTo(x-1+hair*.25,-4,x+hair*.45,1);c.strokeStyle='#cf976d';c.lineWidth=.9;c.stroke();
    }
  }
}
