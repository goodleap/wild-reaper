import {clamp, line, oval, poly} from './drawing.js';

// A single curved back/chest/neck silhouette carries a three-quarter deer head.
// The shared MonsterArt cache owns these finite distance/action-based poses.
const TAU=Math.PI*2, INK='#36545b', COAT='#99b9c2', SHADE='#7097a6', PALE='#e0e6d2', ICE='#bcdde0';
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function fill(c,color,edge=INK,width=1.55){c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function curveStroke(c,points,color,width){
  c.beginPath();c.moveTo(...points[0]);
  for(let i=1;i<points.length;i+=3)c.bezierCurveTo(...points[i],...points[i+1],...points[i+2]);
  c.strokeStyle=color;c.lineWidth=width;c.stroke();
}

function branch(c,points,width,bright=false){
  curveStroke(c,points,INK,width+1.65);
  curveStroke(c,points,bright?'#d8eee4':'#a8cdd5',width);
  if(width>2.8)curveStroke(c,points.map(([x,y])=>[x-.45,y-.65]),'#edf3df',Math.max(.8,width*.24));
}
function antler(c,near,bright){
  // Tapered, curved tines grow from the main beam instead of forming spikes
  // on a polygonal helmet. All tips remain within the existing cast/charge box.
  if(near){
    branch(c,[[48,-41],[50,-49],[53,-55],[58,-58],[62,-61],[68,-63],[72,-61]],4.1,bright);
    branch(c,[[52,-51],[48,-52],[42,-54],[40,-60]],2.35,bright);
    branch(c,[[46,-53],[45,-55],[43,-57],[43,-60]],1.45,bright);
    branch(c,[[57,-57.4],[57,-60],[56.5,-63],[58,-65.5]],2.25,bright);
    branch(c,[[63,-61],[63,-63],[65,-64.5],[67,-65.5]],1.6,bright);
    branch(c,[[67,-61.8],[69,-60],[72,-59],[75,-60]],1.65,bright);
  }else{
    branch(c,[[39,-41],[37,-47],[34,-53],[29,-57],[25,-60],[20,-63],[14,-62]],3.5,bright);
    branch(c,[[33,-52],[33,-56],[31,-59],[33,-64]],2.1,bright);
    branch(c,[[26,-59],[25,-61],[23,-63],[23,-65.5]],1.65,bright);
    branch(c,[[22,-61.5],[19,-61],[16,-63],[14,-65]],1.5,bright);
    branch(c,[[35,-48.5],[31,-49],[27,-48],[25,-51]],1.7,bright);
  }
}

function head(c,angle,bright,hit){
  c.save();c.translate(21,-5);c.rotate(angle);c.translate(-21,5);
  antler(c,false,bright);
  // Far ear is narrower and partly hidden behind the crown.
  c.beginPath();c.moveTo(44,-40);c.quadraticCurveTo(43,-48,49,-50);
  c.quadraticCurveTo(53,-45,48,-39);c.closePath();fill(c,'#a8c6ca',INK,1.15);
  c.beginPath();c.moveTo(38,-38);c.bezierCurveTo(37,-45,47,-48,54,-43);
  c.bezierCurveTo(59,-40,61,-33,67,-29);c.quadraticCurveTo(73,-27,72,-23);
  c.quadraticCurveTo(70,-19,65,-20);c.quadraticCurveTo(53,-20,47,-26);
  c.quadraticCurveTo(39,-25,38,-38);c.closePath();fill(c,'#b9d0ce');
  // The nearer ear is a soft lance shape rooted in the side of the skull.
  c.beginPath();c.moveTo(40,-38);c.quadraticCurveTo(31,-42,28,-47);
  c.quadraticCurveTo(36,-49,43,-42);c.quadraticCurveTo(45,-39,40,-38);c.closePath();fill(c,'#bed6d4',INK,1.3);
  c.beginPath();c.moveTo(32,-45);c.quadraticCurveTo(37,-45,40,-41);c.strokeStyle='#779ba6';c.lineWidth=2;c.stroke();
  // An offset mask and a long rounded muzzle keep the face readable at scale.
  c.beginPath();c.moveTo(43,-37);c.quadraticCurveTo(47,-42,52,-38);
  c.quadraticCurveTo(58,-40,61,-33);c.quadraticCurveTo(58,-28,51,-29);
  c.quadraticCurveTo(44,-29,43,-37);c.closePath();fill(c,'#527b89',null);
  if(hit){
    line(c,[[47,-36.5],[49,-35],[47,-34]],'#f0f1d2',1.2);
    line(c,[[55,-34.5],[58,-33],[55,-31.5]],'#f0f1d2',1.35);
  }else{
    oval(c,48,-35.8,1.15,1.75,'#eef1d0');
    oval(c,56.7,-33.8,1.95,2.25,'#f1f2d6');
    oval(c,57.25,-33.7,.65,1.6,'#2d4f57');
  }
  c.beginPath();c.moveTo(45,-39);c.quadraticCurveTo(48,-41,51,-38.8);c.strokeStyle='#d8e3ce';c.lineWidth=1.3;c.stroke();
  c.beginPath();c.moveTo(53,-37.8);c.quadraticCurveTo(57,-39.5,60,-35.7);c.strokeStyle=PALE;c.lineWidth=1.6;c.stroke();
  c.beginPath();c.moveTo(54,-30);c.quadraticCurveTo(59,-32,65,-28);
  c.quadraticCurveTo(73,-26,71,-22.5);c.quadraticCurveTo(68,-18.5,60,-22);
  c.quadraticCurveTo(55,-24,54,-30);c.closePath();fill(c,'#dce3ce',INK,1.2);
  c.beginPath();c.moveTo(68,-27);c.quadraticCurveTo(73,-27,72,-24);
  c.quadraticCurveTo(70,-22,67,-24);c.closePath();fill(c,'#527985',null);
  c.beginPath();c.moveTo(61,-22.2);c.quadraticCurveTo(65,-20.5,69,-22.2);c.strokeStyle='#63838b';c.lineWidth=1;c.stroke();
  // Only the brow carries a small ice accent; no armor plates or body texture.
  poly(c,[[44,-42],[47,-45],[49,-41],[46,-38]],bright?'#edf5dc':'#d2e7db',INK,.8);
  antler(c,true,bright);
  c.restore();
}

function hoofPose(cycle,offset,moving,x,ground,running,brace){
  if(!moving)return {x:x+brace,y:ground,lift:0,dx:0};
  const u=((cycle/TAU+offset)%1+1)%1,planted=u<.6,v=planted?0:(u-.6)/.4;
  const reach=running?13:8.5,dx=planted?mix(reach,-reach,u/.6):mix(-reach,reach,smooth(v));
  const lift=planted?0:Math.sin(v*Math.PI)*(running?9:5.5);
  return {x:x+dx+brace,y:ground-lift,lift,dx};
}
function hoof(c,x,y,far){
  c.beginPath();c.moveTo(x-3,y-4);c.quadraticCurveTo(x,y-5,x+3,y-3);
  c.quadraticCurveTo(x+6,y-1,x+5,y+.4);c.quadraticCurveTo(x+1,y+1.2,x-4,y+.5);
  c.quadraticCurveTo(x-5,y-1,x-3,y-4);c.closePath();fill(c,far?'#476d7d':'#557d8b',INK,1.25);
  line(c,[[x+1,y-1.4],[x+1.5,y+.5]],far?'#8caab0':'#c4d7ce',.85);
}
function leg(c,root,foot,fore,far){
  const knee={x:root.x+(fore?-1:7)+foot.dx*.3,y:(fore?21:17)-foot.lift*.27};
  const hock={x:root.x+(fore?-2:-3)+foot.dx*.65,y:28-foot.lift*.55};
  const ankle={x:foot.x-1,y:foot.y-3};
  c.beginPath();c.moveTo(root.x-4,root.y-2);
  c.bezierCurveTo(root.x-5,root.y+5,knee.x-3,knee.y-3,knee.x-2.5,knee.y+1);
  c.quadraticCurveTo(hock.x-2.5,hock.y-2,hock.x-2,hock.y+1);
  c.lineTo(ankle.x-1.7,ankle.y);c.quadraticCurveTo(ankle.x,ankle.y+1,ankle.x+2,ankle.y);
  c.lineTo(hock.x+2,hock.y);c.quadraticCurveTo(knee.x+3,knee.y+2,knee.x+3,knee.y-2);
  c.bezierCurveTo(knee.x+2,root.y+4,root.x+5,root.y,root.x+4,root.y-2);c.closePath();
  fill(c,far?'#779daa':'#acc9cd',INK,1.35);
  if(!far){c.beginPath();c.moveTo(knee.x+1,knee.y+1);c.quadraticCurveTo(hock.x+1,hock.y,ankle.x+.7,ankle.y-1);c.strokeStyle='#d8e3d2';c.lineWidth=1;c.stroke();}
  hoof(c,foot.x,foot.y,far);
}

export function paint(c,p,flip=1,pose={}){
  const mode=pose.mode||(p?'move':'idle'),action=pose.action||'',t=clamp(finite(pose.progress),0,1);
  const cycle=finite(pose.cycle,Math.asin(clamp(finite(p),-1,1))),moving=pose.moving??(mode==='move'||mode==='rush');
  const ready=mode==='windup'?smooth(t):0,release=mode==='active'?1:0,rest=mode==='recovery'?1-smooth(t):0;
  const hit=mode==='hit'?1-smooth(t):0,charge=action==='frostCharge',running=charge&&mode==='rush';
  const ice=['frostbolt','frostRing','shatter'].includes(action),bright=ice&&(ready+release+rest*.5)>.35;
  const chargeLow=charge?ready*.43+(running?.53:0)+rest*.23:0;
  const spellLift=action==='frostbolt'?ready*.045+release*.075:action==='frostRing'?ready*.06+release*.065:action==='shatter'?ready*.025:0;
  const angle=chargeLow-spellLift+hit*.05;
  const bodyY=(charge?ready*2.5+(running?1.4:0)+rest*.8:0)+(action==='shatter'?ready*1.6-release*.6:0)
    -(moving?Math.abs(Math.sin(cycle*2))*.9:0)-hit*.7;
  const bodyX=(running?1.5:0)-hit*1.2;
  const rot=(x,y)=>{const dx=x-21,dy=y+5;return [21+dx*Math.cos(angle)-dy*Math.sin(angle),-5+dx*Math.sin(angle)+dy*Math.cos(angle)];};
  const feet=[
    {x:-22,phase:0,fore:false,far:true,ground:35.9},
    {x:25,phase:.5,fore:true,far:true,ground:35.9},
    {x:-32,phase:.5,fore:false,far:false,ground:38.1},
    {x:12,phase:0,fore:true,far:false,ground:38.1}
  ].map(f=>({...f,foot:hoofPose(cycle,f.phase,moving,f.x,f.ground,running,charge?(f.fore?ready*3+rest*4:-ready*3):0)}));
  c.save();c.lineCap='round';c.lineJoin='round';c.scale(flip===-1?-1:1,1);
  for(const f of feet.filter(f=>f.far))leg(c,{x:f.x+bodyX,y:(f.fore?6:7)+bodyY},f.foot,f.fore,true);
  c.save();c.translate(bodyX,bodyY);
  // A short white tail grows from the rump and remains distinct from its leg.
  c.beginPath();c.moveTo(-46,-6);c.quadraticCurveTo(-54,-11,-58,-6);
  c.quadraticCurveTo(-56,0,-47,1);c.closePath();fill(c,'#d1dfd1',INK,1.3);
  // Neck control points rotate with the skull, while the shoulder and back
  // stay joined into the same outline throughout charge and cast poses.
  c.beginPath();c.moveTo(-50,-2);c.bezierCurveTo(-51,-17,-35,-25,-15,-22);
  c.bezierCurveTo(-1,-24,12,-21,22,-19);
  c.bezierCurveTo(...rot(27,-22),...rot(27,-34),...rot(36,-41));
  c.quadraticCurveTo(...rot(43,-46),...rot(48,-37));
  c.bezierCurveTo(...rot(49,-26),...rot(41,-10),...rot(34,5));
  c.quadraticCurveTo(31,14,24,15);c.quadraticCurveTo(10,20,-3,14);
  c.bezierCurveTo(-16,19,-35,15,-43,9);c.quadraticCurveTo(-52,5,-50,-2);c.closePath();fill(c,COAT);
  // One broad flank shadow describes the ribs; there are no repeated spots.
  c.beginPath();c.moveTo(-46,0);c.quadraticCurveTo(-36,-12,-22,-10);
  c.quadraticCurveTo(-8,-11,8,-4);c.quadraticCurveTo(7,7,-4,10);
  c.quadraticCurveTo(-29,15,-43,6);c.closePath();fill(c,'#85a9b5',null);
  // Continuous ivory throat and chest follow the neck, with a curved furry hem.
  c.beginPath();c.moveTo(...rot(39,-34));c.quadraticCurveTo(...rot(47,-28),...rot(42,-16));
  c.bezierCurveTo(...rot(37,-5),...rot(34,4),29,12);
  c.quadraticCurveTo(25,17,18,15);c.quadraticCurveTo(11,12,9,7);
  c.quadraticCurveTo(19,3,23,-6);c.bezierCurveTo(...rot(26,-15),...rot(30,-30),...rot(39,-34));
  c.closePath();fill(c,PALE,null);
  // Soft shoulder muscle meets the foreleg instead of covering it with a plate.
  c.beginPath();c.moveTo(9,-10);c.quadraticCurveTo(22,-9,21,3);c.quadraticCurveTo(22,10,16,13);
  c.quadraticCurveTo(9,15,5,9);c.quadraticCurveTo(1,0,9,-10);c.closePath();fill(c,'#abc8ca',null);
  c.beginPath();c.moveTo(-34,-16);c.quadraticCurveTo(-14,-23,5,-16);c.strokeStyle='#d6e1d2';c.lineWidth=1.7;c.stroke();
  c.beginPath();c.moveTo(10,-7);c.quadraticCurveTo(18,-5,17,4);c.strokeStyle='#d0ded1';c.lineWidth=1.2;c.stroke();
  head(c,angle,bright,hit>.2);
  c.restore();
  // Near legs overlap the belly only at their muscular root, then taper to
  // clean ankles and small split hooves. A diagonal pair exchanges support.
  for(const f of feet.filter(f=>!f.far))leg(c,{x:f.x+bodyX,y:(f.fore?7:8)+bodyY},f.foot,f.fore,false);
  if(action==='shatter'&&(ready||release)){
    const x=feet[3].foot.x,y=feet[3].foot.y-7-ready*2;
    poly(c,[[x,y-3],[x+2,y],[x,y+3],[x-2,y]],'#e4eddb',INK,.8);
  }
  c.restore();
}
