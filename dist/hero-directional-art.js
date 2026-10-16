import {HeroAnimator} from './hero-animation.js';
import {drawPrincessPart,drawPrincessFace,drawPrincessArm,drawPrincessFoot} from './princess-directional-art.js';
import {drawElderPart,drawElderFace,drawElderArm,drawElderFoot} from './elder-directional-art.js';

// The new appearances own their material cache. Original heroes and NPCs never
// enter this renderer, and animation does not multiply the cached frame count.
const TAU=Math.PI*2,CACHE_LIMIT=2*1024*1024;
const HEROES=new Set(['traveler','princess','elder']);
export const DIRECTIONAL_HERO_IDS=new Set([...HEROES].map(kind=>`${kind}-v2`));
const BOX={head:[44,46,22,39],torso:[38,29,19,14],mantle:[44,34,22,14]};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const value=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
// Hand names describe canvas sides. Facing the camera, the actor's own right
// arm is on canvas left; other views retain their existing action ownership.
const frontAttack=pose=>pose.view==='front'&&['melee','ranged','cast'].includes(pose.action);
// Prince paths preserve his original flat palette. The princess and elder
// reuse their original materials through their dedicated directional drawers.
const PALETTES={
  traveler:{outline:'#253c2a',cloth:'#adc19a',sleeve:'#70964f',cape:'#567b49',hood:'#e4dfb8',skin:'#d8d1a7',face:'#32452f',eye:'#ecf6c8',boot:'#383e2b'}
};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const paint=(c,fill,stroke=null,width=1)=>{if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,fill,stroke=null,width=1)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);paint(c,fill,stroke,width);};
const poly=(c,points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.closePath();paint(c,fill,stroke,width);};

function princeHead(c,view){
  const p=PALETTES.traveler;
  // Side facings retain the original outline. Front/back share a centered
  // hood of the same size, with the tip and hem aligned to the body axis.
  c.beginPath();
  if(view==='side'){
    c.moveTo(-14,-8);c.quadraticCurveTo(-17,-26,0,-32);c.quadraticCurveTo(17,-28,16,-8);c.quadraticCurveTo(10,1,-12,-2);
  }else{
    c.moveTo(-15,-8);c.quadraticCurveTo(-17,-27,0,-32);c.quadraticCurveTo(17,-27,15,-8);c.quadraticCurveTo(12,-2,0,-2);c.quadraticCurveTo(-12,-2,-15,-8);
  }
  c.closePath();paint(c,p.hood,p.outline,1.6);
  if(view==='back')return;
  oval(c,view==='side'?2:0,-12,10,9,p.face);
  c.beginPath();c.moveTo(-13,-11);c.quadraticCurveTo(view==='side'?-7:-8,view==='side'?-27:-26,view==='side'?3:0,-28);c.strokeStyle='#b5ab82';c.lineWidth=1;c.stroke();
}

function drawTorso(c,kind,view){
  if(kind==='traveler'){
    // The original one-piece tunic: short and broad, without a skirt seam.
    const side=view==='side';
    c.beginPath();c.moveTo(side?-7:-7.5,-6);c.lineTo(side?8:7.5,-6);c.lineTo(side?10:9.5,10);c.quadraticCurveTo(0,14,side?-9:-9.5,10);c.closePath();paint(c,PALETTES.traveler.cloth);return;
  }

}

function face(c,kind,view,state){
  if(view==='back')return;
  const p=PALETTES[kind],side=view==='side',elder=kind==='elder',prince=kind==='traveler',y=elder?-15:prince?-12:-13.8;
  // Both eyes remain visible in the three-quarter view; no facial contour
  // details are needed to communicate a turn at a forty-pixel render size.
  const xs=prince?(side?[-2,6]:[-4,4]):side?[1,7]:[-3.7,3.7];
  for(let i=0;i<xs.length;i++){
    const x=xs[i],width=prince?1.5:side&&i===0?1:1.45;
    if(state==='blink')line(c,[[x-width,y],[x+width,y]],p.eye,1.1);
    else if(state==='hurt')line(c,[[x-width,y-1.2],[x+.7,y],[x-width,y+1.2]],p.eye,1.1);
    else if(state==='focus')line(c,[[x-width,y-.4],[x+width,y+.3]],p.eye,1.45);
    else oval(c,x,y,width,prince?2:1.9,p.eye);
    if(elder)line(c,[[x-1.5,y-3],[x+1.4,y-3]],p.hair,1.7);
  }
}

// Anchors are in unflipped local space; torso translation is applied by draw.
// Any weapon can use them without introducing equipment into an appearance.
export function directionalHeroHands(kind,pose={}){
  const side=pose.view==='side',swing=value(pose.armSwing),strength=clamp(value(pose.actionStrength),0,1),action=pose.action||'idle';
  const front=frontAttack(pose),main=front?'left':'right',off=front?'right':'left',sign=front?-1:1;
  const hands=kind==='traveler'?{left:{x:-17,y:3-swing*.65},right:{x:17,y:3+swing*.65}}:kind==='princess'?{left:{x:side?-1.5-swing*.5:-14.5,y:7.5-swing*.65},right:{x:side?12+swing*.5:14.5,y:7.5+swing*.65}}:kind==='elder'?{left:{x:side?-1.5-swing*.5:-14.5,y:7.7-swing*.65},right:{x:side?12+swing*.5:14.5,y:7.7+swing*.65}}:side?{left:{x:2-swing*.8,y:7},right:{x:8+swing,y:8}}:{left:{x:-13+swing*.2,y:7-swing*.65},right:{x:13+swing*.2,y:7+swing*.65}};
  if(action==='melee'){
    const progress=clamp(value(pose.actionProgress),0,1),sweep=Math.sin(progress*Math.PI);
    hands[main].x+=sign*(side?9:7)*strength*sweep;hands[main].y-=7*strength+(1-sweep)*3*strength;
    hands[off].x-=sign*2*strength;hands[off].y-=2*strength;
  }else if(action==='ranged'){
    const a=value(pose.aimAngle),flip=pose.flip===-1?-1:1,dx=Math.cos(a)*flip,dy=Math.sin(a)*.65;
    hands[main]={x:sign*(side?5:7)+dx*11*strength,y:6+(dy*12-9)*strength};
    hands[off]={x:sign*(side?-1:-8)+dx*8*strength,y:6+(dy*8-8)*strength};
  }else if(action==='cast'){
    hands[main]={x:sign*(side?15:17),y:6-16*strength};hands[off]={x:sign*(side?4:-13),y:6-10*strength};
  }else if(action==='hurt'){
    hands.right.x-=4*strength;hands.right.y-=5*strength;hands.left.x+=4*strength;hands.left.y-=2*strength;
  }
  if(kind==='elder'){hands.left.y+=.8;hands.right.y+=.8;}
  if(action==='melee'&&Number.isFinite(pose.hand?.x)&&Number.isFinite(pose.hand?.y))hands[main]={...pose.hand};
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
    if(kind==='princess')drawPrincessPart(c,view,part,flip);
    else if(kind==='elder')drawElderPart(c,view,part,flip);
    else if(part==='torso')drawTorso(c,kind,view,flip);else princeHead(c,view);
    const sprite={canvas,w,h,ox,oy,bytes:canvas.width*canvas.height*4};
    while(this.bytes+sprite.bytes>CACHE_LIMIT&&this.cache.size){const first=this.cache.keys().next().value;this.bytes-=this.cache.get(first).bytes;this.cache.delete(first);}
    this.cache.set(key,sprite);this.bytes+=sprite.bytes;this.builds++;return sprite;
  }
  _part(c,kind,view,part,flip,ratio){const s=this._sprite(kind,view,part,flip,ratio);c.drawImage(s.canvas,-s.ox,-s.oy,s.w,s.h);}
  draw(c,kind,options={}){
    if(typeof kind!=='string')return false;
    kind=kind.replace(/-v2$/,'');
    if(!HEROES.has(kind))return false;
    const {entity={},time=0,reduced=false,pixelRatio=2,maxPixelRatio=2}=options;
    // Legacy humanoidPose must never override the new distance-based pose.
    const sampled=options.pose?.view?options.pose:this.animator.sample(entity,{time,reduced,frozen:options.frozen??entity.visualFrozen??false});
    const pose={view:'front',flip:1,bodyY:0,lean:0,shoulder:0,cloth:0,hair:0,armSwing:0,...sampled};
    const view=['front','back','side'].includes(pose.view)?pose.view:'front',flip=pose.flip===-1?-1:1,ratio=clamp(Math.ceil(value(pixelRatio,2)),1,clamp(maxPixelRatio,2,8));
    const fall=pose.action==='fall'?clamp(value(pose.actionProgress),0,1):0;
    c.save();c.lineCap='round';c.lineJoin='round';c.scale(flip,1);
    if(fall){c.translate(0,17);c.rotate(fall*.98);c.scale(1,1-fall*.12);c.translate(0,-17);}
    if(kind==='traveler'){this._prince(c,view,pose,flip,ratio);c.restore();return true;}
    if(kind==='princess'){this._princess(c,view,pose,flip,ratio);c.restore();return true;}
    if(kind==='elder'){this._elder(c,view,pose,flip,ratio);c.restore();return true;}
  }

  _elder(c,view,pose,flip,ratio){
    const body=value(pose.bodyY),hands=directionalHeroHands('elder',pose);
    const front=frontAttack(pose),rear=front?1:-1;
    c.save();c.translate(0,body);this._part(c,'elder',view,'mantle',flip,ratio);c.restore();
    const feet=[{side:-1,...pose.leftFoot},{side:1,...pose.rightFoot}].sort((a,b)=>value(a.y)-value(b.y));
    for(const foot of feet)drawElderFoot(c,view,pose,foot);
    c.save();c.translate(0,body);
    drawElderArm(c,view,pose,rear,hands[front?'right':'left'],flip);
    this._part(c,'elder',view,'torso',flip,ratio);
    drawElderArm(c,view,pose,-rear,hands[front?'left':'right'],flip);
    c.save();c.rotate(view==='side'?value(pose.lean)-.035:value(pose.shoulder));
    this._part(c,'elder',view,'head',flip,ratio);drawElderFace(c,view,pose.faceState||'normal');c.restore();
    c.restore();
  }
  _princess(c,view,pose,flip,ratio){
    const body=value(pose.bodyY),hands=directionalHeroHands('princess',pose);
    const front=frontAttack(pose),rear=front?1:-1;
    if(view!=='back'){
      c.save();c.translate(0,body);this._part(c,'princess',view,'mantle',flip,ratio);c.restore();
    }
    const feet=[{side:-1,...pose.leftFoot},{side:1,...pose.rightFoot}].sort((a,b)=>value(a.y)-value(b.y));
    for(const foot of feet)drawPrincessFoot(c,view,pose,foot);
    c.save();c.translate(0,body);
    drawPrincessArm(c,view,pose,rear,hands[front?'right':'left'],flip);
    this._part(c,'princess',view,'torso',flip,ratio);
    drawPrincessArm(c,view,pose,-rear,hands[front?'left':'right'],flip);
    if(view==='back')this._part(c,'princess',view,'mantle',flip,ratio);
    c.save();c.rotate(view==='side'?value(pose.lean):value(pose.shoulder));
    this._part(c,'princess',view,'head',flip,ratio);drawPrincessFace(c,view,pose.faceState||'normal');c.restore();
    c.restore();
  }
  _prince(c,view,pose,flip,ratio){
    const p=PALETTES.traveler,body=value(pose.bodyY),cloth=value(pose.cloth),side=view==='side';
    const cape=()=>{
      c.beginPath();c.moveTo(-10,-4);c.quadraticCurveTo(-17,6,-16+cloth*.25,13);c.quadraticCurveTo(0,18,15+cloth*.25,12);c.lineTo(9,-7);c.closePath();paint(c,p.cape,p.outline,1.6);
    };
    // The side idle pose retains the old prince's parts and overlap order.
    c.save();c.translate(0,body);if(view!=='back')cape();c.restore();
    const feet=[{side:-1,...pose.leftFoot},{side:1,...pose.rightFoot}].sort((a,b)=>value(a.y)-value(b.y));
    for(const foot of feet){
      const sign=foot.side,x=sign*6+value(foot.x),y=14.8+value(foot.y)-value(foot.lift);
      line(c,[[sign*5.5,9+body],[x,y-.8]],'#526044',4.6);
      oval(c,x,y,4.2,3.2,p.boot);
      line(c,[[x-2,y-.6],[x+1.8,y-.6]],'#737857',.8);
    }
    c.save();c.translate(0,body);
    const hands=directionalHeroHands('traveler',pose),active=value(pose.actionStrength)>.01||pose.action==='melee';
    const front=frontAttack(pose),rear=front?1:-1;
    if(view==='back'||view==='front'||active)this._princeHand(c,pose,rear,hands[front?'right':'left'],active);
    this._part(c,'traveler',view,'torso',flip,ratio);
    if(view==='back'){
      this._princeHand(c,pose,1,hands.right,active);cape();
    }
    c.save();c.rotate(side?value(pose.lean):value(pose.shoulder));
    this._part(c,'traveler',view,'head',flip,ratio);face(c,'traveler',view,pose.faceState||'normal');c.restore();
    if(view!=='back'){
      poly(c,side?[[-12,-2],[11,-3],[9,3],[-11,4]]:[[-12,-2],[12,-2],[10,3],[-10,3]],p.sleeve);
      const center=side?1:0;
      line(c,[[center-7,8],[center+7,8]],'#788a5b',2);
      poly(c,[[center,5.8],[center+1.452,8],[center,10.2],[center-1.452,8]],'#e2c276');
      if(side){
        const settled=1-clamp(value(pose.stride)/6.6,0,1);
        c.beginPath();c.moveTo(-8,1);c.quadraticCurveTo(-18+settled*2,4+settled*3,-24+settled*4,1+settled*8+cloth);c.lineTo(-21+settled*4,8+settled*5);c.quadraticCurveTo(-13,9+settled*3,-8,5);paint(c,p.sleeve);
      }
      this._princeHand(c,pose,-rear,hands[front?'left':'right'],active);
    }
    c.restore();
  }
  _princeHand(c,pose,side,hand,active){
    const p=PALETTES.traveler;
    // Resting upper arms stay under the shoulder cape. Only an action reveals
    // a sleeve, and its hand still follows the existing weapon grip anchor.
    if(active){
      const sx=side*9,sy=-1,elbowX=sx+(hand.x-sx)*.55,elbowY=1+(hand.y-sy)*.4;
      line(c,[[sx,sy],[elbowX,elbowY],[hand.x,hand.y]],p.outline,5.8);
      line(c,[[sx,sy],[elbowX,elbowY],[hand.x,hand.y]],p.sleeve,4.3);
    }
    oval(c,hand.x,hand.y,3,3,p.skin);
  }
}
