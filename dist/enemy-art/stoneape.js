import {clamp, grad, line, oval, poly} from './drawing.js';

const INK='#344637', FUR='#7f8c66', SHADOW='#5b7150', LIGHT='#aeb58b', CREAM='#d4d2a7';
const valid=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
function fill(c,color,edge=INK,width=1.5){c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function rock(c,x,y,scale=1){
  c.save();c.translate(x,y);c.scale(scale,scale);
  // Preserve the held-rock material signature used by the release/reload QA.
  poly(c,[[-9,-7],[1,-10],[9,-3],[6,7],[-5,8],[-11,2]],grad(c,-10,8,8,-10,['#68756b','#9ba59a','#d2d0b9']),INK,1.2);
  poly(c,[[-8,-6],[0,-8],[4,-2],[-3,1]],'#c6ccb4');line(c,[[-3,1],[5,5],[7,-2]],'#6d7b60',1.1);c.restore();
}
function foot(c,x,y,far=false){
  // Heel at left, broad toe at right: both feet face the pursuit direction.
  c.beginPath();c.moveTo(x-3.5,y-6.5);c.quadraticCurveTo(x-.5,y-8,x+2,y-5);
  c.quadraticCurveTo(x+3,y-2.8,x+6,y-2.2);c.quadraticCurveTo(x+9,y-1.6,x+8,y+.2);
  c.quadraticCurveTo(x+6,y+1.2,x+3,y+.7);c.quadraticCurveTo(x-1,y+1.3,x-4,y+.5);
  c.quadraticCurveTo(x-6,y-1,x-3.5,y-6.5);c.closePath();fill(c,far?'#85986c':'#a4ad83');
  c.beginPath();c.moveTo(x+4.2,y-1.1);c.quadraticCurveTo(x+5.3,y-.4,x+5.1,y+.5);c.strokeStyle='#60754e';c.lineWidth=1;c.stroke();
  c.beginPath();c.moveTo(x-.5,y-4.5);c.quadraticCurveTo(x+1.1,y-4.8,x+2.5,y-3.6);c.strokeStyle=far?'#abb68c':CREAM;c.lineWidth=1.2;c.stroke();
}
function stride(cycle,offset,moving,hipX,ground){
  if(!moving)return {x:hipX+(offset?0:2),y:ground,lift:0,dx:0};
  const u=((cycle/(Math.PI*2)+offset)%1+1)%1,planted=u<.6;
  const recovery=planted?0:(u-.6)/.4;
  // Contact lasts 60% of the 48-unit cycle: the foot moves back 28.8 units
  // while the root advances by that distance, keeping the support on ground.
  const dx=planted?mix(14.4,-14.4,u/.6):mix(-14.4,14.4,smooth(recovery));
  const lift=planted?0:Math.sin(recovery*Math.PI)*4.2;
  return {x:hipX+dx,y:ground-lift,lift,dx};
}
function leg(c,hip,knee,ankle,far=false){
  const curve=()=>{c.beginPath();c.moveTo(hip.x,hip.y);c.quadraticCurveTo(knee.x,knee.y,ankle.x,ankle.y);};
  curve();c.strokeStyle=INK;c.lineWidth=far?9:10.5;c.stroke();
  curve();c.strokeStyle=far?SHADOW:FUR;c.lineWidth=far?6:7.5;c.stroke();
}
function arm(c,shoulder,elbow,wrist,far=false){
  const curve=(dx=0,dy=0)=>{c.beginPath();c.moveTo(shoulder.x+dx,shoulder.y+dy);
    c.bezierCurveTo(mix(shoulder.x,elbow.x,.9)+dx,mix(shoulder.y,elbow.y,.9)+dy,
      mix(elbow.x,wrist.x,.2)+dx,mix(elbow.y,wrist.y,.2)+dy,wrist.x+dx,wrist.y+dy);};
  curve();c.strokeStyle=INK;c.lineWidth=12.8;c.stroke();curve();c.strokeStyle=far?SHADOW:FUR;c.lineWidth=9.8;c.stroke();
  curve(.7,-1.5);c.strokeStyle=far?'#81936b':LIGHT;c.lineWidth=2;c.stroke();
}
function knuckles(c,x,y,holding=false){
  c.save();c.translate(x,y);
  // Rounded finger pads and a curling thumb keep a heavy, organic ape hand.
  c.beginPath();c.moveTo(-4,-4);c.quadraticCurveTo(0,-5,3,-4);c.quadraticCurveTo(5,-3,5,-1);
  c.quadraticCurveTo(7,-3.5,8,-1);c.quadraticCurveTo(8,1,5.5,2.3);
  c.quadraticCurveTo(5.5,5.5,3.4,5.6);c.quadraticCurveTo(2,7,.3,6);
  c.quadraticCurveTo(-1,7.2,-2.6,6.2);c.quadraticCurveTo(-5.4,7,-6.1,3.8);
  c.quadraticCurveTo(-7,.5,-5.5,-1.3);c.quadraticCurveTo(-5,-3.2,-4,-4);c.closePath();fill(c,holding?'#b5ba8e':'#a1ad7f');
  for(const dx of [-3,0,3]){c.beginPath();c.moveTo(dx,2.6);c.quadraticCurveTo(dx+.6,3.8,dx+.1,5);c.strokeStyle='#5e754f';c.lineWidth=1;c.stroke();}
  c.beginPath();c.moveTo(-2,-2);c.quadraticCurveTo(0,-2.7,2,-2);c.strokeStyle=CREAM;c.lineWidth=1.2;c.stroke();c.restore();
}
function cradle(c,x,y){
  // The broad palm cups the bottom of the stone; the thumb wraps its side.
  c.beginPath();c.moveTo(x-5,y-3);c.bezierCurveTo(x-6,y+1,x-3,y+5,x+1,y+5);
  c.quadraticCurveTo(x+5,y+5,x+6,y+1);c.quadraticCurveTo(x+6,y-1,x+7,y-3);
  c.quadraticCurveTo(x+8,y-6,x+6,y-7);c.quadraticCurveTo(x+3,y-7,x+3,y-3);
  c.quadraticCurveTo(x+3,y,x+.5,y+.2);c.quadraticCurveTo(x-1,y+.3,x-2,y-1);c.quadraticCurveTo(x-3,y-3,x-5,y-3);c.closePath();fill(c,'#afb78a');
  c.beginPath();c.moveTo(x-3,y+2);c.quadraticCurveTo(x+1,y+4,x+4,y+1);c.strokeStyle='#e0ddb0';c.lineWidth=1.2;c.stroke();
  for(const dx of [-1,2]){c.beginPath();c.moveTo(x+dx,y);c.quadraticCurveTo(x+dx+.5,y+1,x+dx,y+2);c.strokeStyle='#6b7a55';c.lineWidth=.9;c.stroke();}
}

export function paint(c,p,flip=1,pose={}){
  const mode=pose.mode||'move',t=clamp(valid(pose.progress),0,1),moving=mode==='move'||mode==='air'||!!pose.moving;
  const cycle=valid(pose.cycle,Math.asin(clamp(valid(p),-1,1))),hit=mode==='hit'?1-smooth(t):0;
  const wind=mode==='windup'?smooth(Math.min(1,t/.5)):0;
  // The projectile leaves halfway through windup. It returns late in recovery.
  const released=mode==='windup'&&t>=.5||mode==='active'||mode==='rush'||mode==='recovery'&&t<.66;
  const swing=mode==='windup'&&t>=.5?smooth((t-.5)/.5):mode==='active'||mode==='rush'?1:mode==='recovery'?1-smooth(t):0;
  const reload=mode==='recovery'&&t>=.66?smooth((t-.66)/.34):0;
  const hand={x:released?mix(8,25.5,swing):mix(23,8,wind),y:released?mix(-19,9,swing):mix(10,-20,wind)};
  if(mode==='recovery'&&!released)hand.y+=Math.sin(reload*Math.PI)*1.3;
  const walking=moving&&['move','air','idle','active','rush'].includes(mode);
  const nearFoot=stride(cycle,0,walking,4,22.25),farFoot=stride(cycle,.5,walking,-3,20.75);
  const gaitSwing=walking?Math.sin(cycle):0;
  if(walking&&!released){hand.x-=nearFoot.dx*.12;hand.y-=nearFoot.lift*.12;}
  const bodyX=-wind*1.1+swing*.65-hit*.5+gaitSwing*.7;
  const bodyY=wind*.8+swing*.7-hit*.7-(walking?Math.abs(Math.sin(cycle))*1.1:0);
  c.save();c.lineCap='round';c.lineJoin='round';c.scale(flip===-1?-1:1,1);
  // Contact holds a constant ground height, while the returning foot lifts.
  // Actual resolved-distance cycle supplies both hips; no drawing-time clock.
  leg(c,{x:-3+bodyX,y:9+bodyY},{x:-1+farFoot.dx*.35,y:15-farFoot.lift*.25},{x:farFoot.x-1,y:farFoot.y-3},true);
  foot(c,farFoot.x,farFoot.y,true);
  leg(c,{x:4+bodyX,y:10+bodyY},{x:8+nearFoot.dx*.4,y:16-nearFoot.lift*.35},{x:nearFoot.x-1,y:nearFoot.y-3});
  foot(c,nearFoot.x,nearFoot.y);
  c.save();c.translate(bodyX,bodyY);
  // The far shoulder disappears behind a hunched back; its long arm counters
  // the near leg instead of presenting a second frontal shoulder.
  const farHand={x:-21-nearFoot.dx*.38,y:13+gaitSwing*.7};
  arm(c,{x:-6,y:-14},{x:-17-nearFoot.dx*.18,y:-1},farHand,true);knuckles(c,farHand.x,farHand.y);
  c.beginPath();c.moveTo(-18,-14);c.bezierCurveTo(-16,-22,-9,-25,-2,-24);
  c.bezierCurveTo(6,-24,13,-20,15,-13);c.bezierCurveTo(17,-7,13,-2,13,4);
  c.quadraticCurveTo(13,12,7,14);c.quadraticCurveTo(-1,18,-9,13);
  c.bezierCurveTo(-14,10,-16,4,-17,-2);c.quadraticCurveTo(-20,-9,-18,-14);c.closePath();fill(c,FUR);
  // Chest plane turns around the forward/right edge instead of facing camera.
  c.beginPath();c.moveTo(4,-10);c.quadraticCurveTo(11,-13,14,-7);c.quadraticCurveTo(16,1,11,9);
  c.quadraticCurveTo(6,14,1,10);c.quadraticCurveTo(0,2,4,-10);c.closePath();fill(c,'#abb38a',null);
  c.beginPath();c.moveTo(5,-8);c.quadraticCurveTo(10,-11,13,-7);c.quadraticCurveTo(14,-2,10,0);
  c.quadraticCurveTo(6,1,4,-2);c.quadraticCurveTo(3,-5,5,-8);c.closePath();fill(c,'#c3c69a',null);
  c.beginPath();c.moveTo(-10,-19);c.quadraticCurveTo(-2,-24,5,-20);c.strokeStyle=LIGHT;c.lineWidth=1.8;c.stroke();
  c.beginPath();c.moveTo(-6,12);c.quadraticCurveTo(1,16,7,12);c.strokeStyle='#60764f';c.lineWidth=1.3;c.stroke();
  // Offset crown, a single near ear and projecting muzzle make a clear right
  // three-quarter profile. Mirroring the complete sprite faces it left.
  c.beginPath();c.moveTo(-3,-16);c.bezierCurveTo(-8,-20,-7,-27,-2,-30);
  c.bezierCurveTo(4,-32.2,14,-32,18,-27);c.quadraticCurveTo(21,-23,18,-19);
  c.quadraticCurveTo(22,-17,21,-13);c.quadraticCurveTo(17,-8,8,-10);
  c.quadraticCurveTo(1,-9,-3,-16);c.closePath();fill(c,'#83916b');
  c.beginPath();c.moveTo(-3,-23);c.quadraticCurveTo(-8,-25,-8,-20);
  c.quadraticCurveTo(-7,-15,-2,-16);c.closePath();fill(c,'#91a078',INK,1.2);
  c.beginPath();c.moveTo(-4,-21.5);c.quadraticCurveTo(-6,-22,-5.8,-18.5);c.strokeStyle='#536d49';c.lineWidth=1.1;c.stroke();
  c.beginPath();c.moveTo(3,-23);c.bezierCurveTo(5,-27,8,-26,10,-23.8);
  c.bezierCurveTo(14,-26.5,18,-25,19,-21);c.quadraticCurveTo(20,-17,16,-15);
  c.quadraticCurveTo(8,-14,4,-17);c.quadraticCurveTo(1,-20,3,-23);c.closePath();fill(c,'#42563e',null);
  // Both eyes remain legible like the heroes' three-quarter heads. A mild
  // size difference supplies direction without collapsing into a side face.
  oval(c,5.8,-22,1.3,1.8,'#e0e4b2');oval(c,13.5,-21.2,1.65,2,'#eeebbc');
  c.beginPath();c.moveTo(4.5,-24);c.quadraticCurveTo(7,-25.8,9,-24);c.strokeStyle='#a7b486';c.lineWidth=1.9;c.stroke();
  c.beginPath();c.moveTo(11,-23.7);c.quadraticCurveTo(15,-26,18,-22.7);c.strokeStyle='#b5bf91';c.lineWidth=2.4;c.stroke();
  c.beginPath();c.moveTo(7,-17.5);c.quadraticCurveTo(15,-21,21,-17);
  c.quadraticCurveTo(24,-13,21,-10);c.quadraticCurveTo(15,-7,8,-10);
  c.quadraticCurveTo(5,-13,7,-17.5);c.closePath();fill(c,'#b7bb90',INK,1.25);
  c.beginPath();c.moveTo(14,-16.8);c.quadraticCurveTo(19,-18,21,-14);
  c.quadraticCurveTo(21,-12,17,-12.2);c.quadraticCurveTo(13,-12.7,14,-16.8);c.closePath();fill(c,'#61704f',null);
  c.beginPath();c.moveTo(12,-10.5);c.quadraticCurveTo(18,-8.4,22,-11);c.strokeStyle='#45583d';c.lineWidth=1.25;c.stroke();
  c.beginPath();c.moveTo(21,-16);c.quadraticCurveTo(23,-14.8,22.5,-13);c.strokeStyle=CREAM;c.lineWidth=1.1;c.stroke();
  // The near arm bends around the same wrist used by the held stone.
  arm(c,{x:7,y:-12},{x:17-wind*3,y:-3-wind*12},hand);
  if(!released){rock(c,hand.x,hand.y-3,mode==='recovery'?.65+reload*.25:.9);cradle(c,hand.x,hand.y);}
  else knuckles(c,hand.x,hand.y);
  c.restore();c.restore();
}
