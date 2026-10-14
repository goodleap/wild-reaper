import {HeroAnimator} from './hero-animation.js';

// The new appearances own their material cache. Original heroes and NPCs never
// enter this renderer, and animation does not multiply the cached frame count.
const TAU=Math.PI*2,CACHE_LIMIT=2*1024*1024;
const HEROES=new Set(['traveler','princess','elder']);
export const DIRECTIONAL_HERO_IDS=new Set([...HEROES].map(kind=>`${kind}-v2`));
const BOX={head:[44,46,22,39],torso:[38,29,19,14]};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const value=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
// Flat, shared-size shapes follow the original traveler's quiet silhouette.
// Identity comes from the hood, crown or beard, not small surface decorations.
const PALETTES={
  traveler:{outline:'#253c2a',cloth:'#adc19a',sleeve:'#70964f',cape:'#567b49',hood:'#e4dfb8',skin:'#d8d1a7',face:'#32452f',eye:'#ecf6c8',boot:'#383e2b'},
  princess:{outline:'#533d40',cloth:'#ce91a1',sleeve:'#ce91a1',hair:'#9d664e',skin:'#efd2b0',eye:'#533d40',boot:'#67484e',crown:'#dec179'},
  elder:{outline:'#35483c',cloth:'#8ba28b',sleeve:'#8ba28b',hair:'#e2e1c6',skin:'#d8bd98',eye:'#35483c',boot:'#424a36'}
};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const paint=(c,fill,stroke=null,width=1)=>{if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,fill,stroke=null,width=1)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);paint(c,fill,stroke,width);};
const poly=(c,points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.closePath();paint(c,fill,stroke,width);};

function princeHead(c,view){
  const p=PALETTES.traveler,side=view==='side';
  c.beginPath();c.moveTo(-13,-6);c.bezierCurveTo(-18,-17,-11,-29,side?-2:0,-32);c.bezierCurveTo(10,-29,16,-19,13,-6);c.quadraticCurveTo(0,-1,-13,-6);c.closePath();paint(c,p.hood,p.outline,1.5);
  if(view==='back')return;
  // The side view turns the whole oval, without a protruding nose or chin.
  oval(c,side?4:0,-13.2,side?8.5:10,9,p.face);
}

function crown(c,side,back){
  const p=PALETTES.princess,offset=side?1.2:0,w=side?8.2:9.3;
  poly(c,[[offset-w,-26],[offset-w-1,-32],[offset-4,-29],[offset,-34],[offset+4,-29],[offset+w+1,-32],[offset+w,-26]],back?'#c4a763':p.crown,p.outline,1.2);
}

function princessHead(c,view){
  const p=PALETTES.princess,side=view==='side';
  c.beginPath();c.moveTo(-12,-5);c.bezierCurveTo(-15,-15,-14,-26,-5,-29);c.quadraticCurveTo(4,-32,11,-25);c.quadraticCurveTo(15,-17,12,-5);c.closePath();paint(c,p.hair,p.outline,1.4);
  if(view==='back'){crown(c,false,true);return;}
  oval(c,side?3:0,-14.2,side?8.6:9.5,9.4,p.skin);
  // One swept lock and two broad side masses replace individual strands.
  c.beginPath();c.moveTo(-12,-7);c.quadraticCurveTo(-15,-25,-5,-28);c.quadraticCurveTo(5,-31,12,-24);c.lineTo(12,-7);c.lineTo(side?10:8,-8);c.lineTo(side?11:9,-20);c.quadraticCurveTo(7,-24,side?5:3,-24);c.quadraticCurveTo(1,-18,side?-4:-7,-17);c.lineTo(side?-4:-8,-8);c.closePath();paint(c,p.hair,p.outline,1.2);
  crown(c,side,false);
}

function elderHead(c,view){
  const p=PALETTES.elder,side=view==='side';
  c.beginPath();c.moveTo(-12,-8);c.quadraticCurveTo(-15,-19,-9,-25);c.quadraticCurveTo(0,-31,9,-25);c.quadraticCurveTo(15,-19,12,-8);c.closePath();paint(c,p.hair,p.outline,1.4);
  if(view==='back')return;
  oval(c,side?3:0,-14.7,side?8.9:10,9.8,p.skin);
  c.beginPath();c.moveTo(-12,-9);c.quadraticCurveTo(-15,-24,-5,-27);c.quadraticCurveTo(5,-30,12,-23);c.quadraticCurveTo(14,-17,11,-10);c.quadraticCurveTo(8,-9,9,-15);c.lineTo(9,-19);c.quadraticCurveTo(3,-26,side?-4:-8,-20);c.quadraticCurveTo(side?-3:-7,-14,side?-4:-8,-10);c.quadraticCurveTo(-10,-8,-12,-9);c.closePath();paint(c,p.hair,p.outline,1.2);
  // A single soft beard shape identifies the elder at the actual game size.
  const x=side?3:0;
  c.beginPath();c.moveTo(x-8,-10);c.quadraticCurveTo(x,-6,x+8,-10);c.quadraticCurveTo(x+9,-3,x,0);c.quadraticCurveTo(x-9,-3,x-8,-10);c.closePath();paint(c,p.hair,p.outline,1.1);
}

function drawTorso(c,kind,view){
  const p=PALETTES[kind],side=view==='side',w=side?7.5:9;
  c.beginPath();c.moveTo(-w-1,4.5);c.lineTo(-w,-5);c.quadraticCurveTo(0,-9,w,-5);c.lineTo(w+1,4.5);paint(c,p.cloth,p.outline,1.3);
  if(kind==='traveler'){
    poly(c,[[-w-1,-5],[0,-2],[w+1,-5],[w,0],[-w,0]],p.sleeve);
    if(view!=='back')line(c,[[-w+1,3.2],[w-1,3.2]],'#788a5b',1.7);
  }
}

function face(c,kind,view,state){
  if(view==='back')return;
  const p=PALETTES[kind],side=view==='side',elder=kind==='elder',y=elder?-15:kind==='traveler'?-13:-13.8;
  // Both eyes remain visible in the three-quarter view; no facial contour
  // details are needed to communicate a turn at a forty-pixel render size.
  const xs=side?[1,7]:[-3.7,3.7];
  for(let i=0;i<xs.length;i++){
    const x=xs[i],width=side&&i===0?1:1.45;
    if(state==='blink')line(c,[[x-width,y],[x+width,y]],p.eye,1.1);
    else if(state==='hurt')line(c,[[x-width,y-1.2],[x+.7,y],[x-width,y+1.2]],p.eye,1.1);
    else if(state==='focus')line(c,[[x-width,y-.4],[x+width,y+.3]],p.eye,1.45);
    else oval(c,x,y,width,1.9,p.eye);
    if(elder)line(c,[[x-1.5,y-3],[x+1.4,y-3]],p.hair,1.7);
  }
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
    const view=['front','back','side'].includes(pose.view)?pose.view:'front',flip=pose.flip===-1?-1:1,ratio=clamp(Math.ceil(value(pixelRatio,2)),1,2);
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
    c.save();c.translate(kind==='elder'&&view==='side'?.5:0,0);
    c.rotate(view==='side'?value(pose.lean):value(pose.shoulder));
    this._part(c,kind,view,'head',flip,ratio);face(c,kind,view,pose.faceState||'normal');c.restore();
    if(view!=='back')this._arm(c,kind,view,pose,1,hands.right,flip);
    c.restore();c.restore();return true;
  }
  _leg(c,kind,view,pose,foot){
    const p=PALETTES[kind],side=foot.side,profile=view==='side',baseX=profile?side*2.8:side*5.3;
    const x=baseX+value(foot.x),lift=value(foot.lift),y=14.8+value(foot.y)-lift,hipX=profile?side*2:side*4.7;
    const kneeX=hipX+(x-hipX)*.55+(profile?1.1:0),kneeY=9.4+value(pose.bodyY)*.3-lift*.4;
    line(c,[[hipX,4.8+value(pose.bodyY)],[kneeX,kneeY],[x,y-1]],p.outline,4.6);
    line(c,[[hipX,4.8+value(pose.bodyY)],[kneeX,kneeY],[x,y-1]],kind==='princess'?'#d6bd9f':p.cloth,2.9);
    oval(c,x+(profile?.7:0),y+.4,4.1,2.8,p.boot);
  }
  _arm(c,kind,view,pose,side,hand){
    const p=PALETTES[kind],profile=view==='side',sx=profile?(side<0?-4:3.5):side*8.1,sy=-3+(side<0?-value(pose.shoulder):value(pose.shoulder))*9;
    const ex=sx+(hand.x-sx)*.42+(profile?-1:side*1.2),ey=sy+(hand.y-sy)*.62+1.1;
    line(c,[[sx,sy],[ex,ey],[hand.x,hand.y]],p.outline,6);
    line(c,[[sx,sy],[ex,ey],[hand.x,hand.y]],p.sleeve,4.3);
    oval(c,hand.x,hand.y,2.8,2.8,p.skin,p.outline,.8);
  }
  _skirt(c,kind,view,pose){
    const p=PALETTES[kind],side=view==='side',cloth=value(pose.cloth),left=value(pose.leftFoot?.lift),right=value(pose.rightFoot?.lift);
    const width=side?(kind==='princess'?10:8.5):(kind==='princess'?12:10),hem=kind==='elder'?10.2:kind==='princess'?9.2:8.5;
    // A broad, continuous hem follows the alternating steps without adding
    // panel seams, trim lines or decorative folds to the small silhouette.
    c.beginPath();c.moveTo(-7,1);c.lineTo(7,1);c.quadraticCurveTo(width-2,5,width+cloth*.25,hem-right*.18);c.quadraticCurveTo(0,hem+3,-width+cloth*.25,hem-left*.18);c.quadraticCurveTo(-width+2,5,-7,1);c.closePath();paint(c,p.cloth,p.outline,1.3);
  }
  _cape(c,kind,view,pose){
    if(kind!=='traveler')return;
    const p=PALETTES[kind],cloth=value(pose.cloth),body=value(pose.bodyY),side=view==='side';
    c.save();c.translate(0,body);
    if(side){
      const trail=3+value(pose.stride)*.5;
      c.beginPath();c.moveTo(-5,-5);c.quadraticCurveTo(-12,0,-13-trail+cloth*.5,10-cloth*.2);c.quadraticCurveTo(-9-trail,14,-3,10);c.lineTo(2,-3);c.closePath();paint(c,p.cape,p.outline,1.4);
    }else{
      c.beginPath();c.moveTo(-8,-5);c.quadraticCurveTo(-12,1,-15+cloth*.5,11);c.quadraticCurveTo(0,17,15+cloth*.5,11);c.quadraticCurveTo(12,0,8,-5);c.closePath();paint(c,p.cape,p.outline,1.4);
    }
    c.restore();
  }
  _hairTail(c,view,pose){
    const hair=value(pose.hair),p=PALETTES.princess;
    if(view==='back'){
      c.beginPath();c.moveTo(-11,-18);c.lineTo(11,-18);c.quadraticCurveTo(10,-7,12+hair*.35,0);c.quadraticCurveTo(0+hair*.25,5,-12+hair*.35,0);c.quadraticCurveTo(-10,-7,-11,-18);c.closePath();paint(c,p.hair,p.outline,1.3);return;
    }
    // The far-side lock is the only extra hair layer in a turning view.
    const sides=view==='side'?[-1]:[-1,1];
    for(const side of sides){const x=view==='side'?-9:side*9;
      c.beginPath();c.moveTo(x-2.8,-16);c.quadraticCurveTo(x-3,-7,x-3+hair*.3,-1);c.quadraticCurveTo(x+hair*.3,1,x+3+hair*.3,-1);c.quadraticCurveTo(x+1,-7,x+2.8,-16);c.closePath();paint(c,p.hair,p.outline,1.2);
    }
  }
}
