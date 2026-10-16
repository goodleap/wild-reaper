import {clamp, line, oval} from './drawing.js';

// A low marsh amphibian: a broad head, short back and folded hindquarters.
// Feet, cached framing and attack poses keep their existing world anchors.
const INK='#314c3c', BODY='#718a69', FAR='#516e55', LIGHT='#a6b18a', BELLY='#b9bf95';
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
function fill(c,color,edge=INK,width=1.35){
  c.fillStyle=color;c.fill();
  if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}
}
function paw(c,x,y,far=false){
  c.beginPath();c.moveTo(x-3.7,y-3.2);
  c.quadraticCurveTo(x-1,y-4.2,x+1.7,y-2.5);
  c.quadraticCurveTo(x+5.3,y-3,x+5.5,y-.9);
  c.quadraticCurveTo(x+5.4,y+.4,x+2.8,y+.1);
  c.quadraticCurveTo(x+2.1,y+2.2,x-.3,y+.8);
  c.quadraticCurveTo(x-3,y+2.2,x-3.9,y+.5);
  c.quadraticCurveTo(x-6.3,y+1.1,x-5.8,y-.8);
  c.quadraticCurveTo(x-5.2,y-2,x-3.7,y-3.2);c.closePath();
  fill(c,far?'#687e5b':'#9ba97b',INK,1);
  if(!far){
    line(c,[[x-1.6,y-1.1],[x-.4,y+.6]],'#61774e',.8);
    line(c,[[x+1.4,y-1.3],[x+2.1,y+.2]],'#61774e',.8);
  }
}
function limb(c,points,far=false){
  line(c,points,INK,5.8);line(c,points,far?FAR:BODY,3.5);
}

export function paint(c,p,flip=1,pose={}){
  const mode=pose.mode||'move',t=clamp(finite(pose.progress),0,1);
  const moving=mode==='move'||mode==='air'||!!pose.moving;
  const step=moving?clamp(finite(p),-1,1):0,cycle=finite(pose.cycle,Math.asin(step));
  const ready=mode==='windup'?smooth(t):0;
  const release=mode==='active'||mode==='rush'?1:0;
  const settle=mode==='recovery'?1-smooth(t):0,hit=mode==='hit'?1-smooth(t):0;
  const crouch=ready*1.8+settle*.9,reach=release*1.8;
  const farH={x:-23-step*1.2,y:9-Math.max(0,Math.cos(cycle))*Number(moving)*1.3};
  const farF={x:27+step*.8+reach*.25,y:9-Math.max(0,-Math.cos(cycle))*Number(moving)*1.3};
  const nearH={x:-16+step*1.5,y:15.2-Math.max(0,-Math.cos(cycle))*Number(moving)*1.6};
  const nearF={x:24-step*1.2+reach,y:15.2-Math.max(0,Math.cos(cycle))*Number(moving)*1.6};
  c.save();c.scale(flip===-1?-1:1,1);c.lineCap='round';c.lineJoin='round';
  // The far feet are shorter and higher; all four contacts remain distinct.
  limb(c,[[-16,1],[-26,5+crouch*.5],[farH.x,farH.y-1.5]],true);paw(c,farH.x,farH.y,true);
  limb(c,[[15,1],[24,5+crouch*.5],[farF.x,farF.y-1.5]],true);paw(c,farF.x,farF.y,true);
  c.save();c.translate(release*.5-ready*.5-hit*.7,crouch*.6-hit*.4);
  // The shoulders flow straight into the wide head. No separate muzzle mask.
  c.beginPath();c.moveTo(-25,5);
  c.bezierCurveTo(-29,-3,-23,-12,-12,-13.5);
  c.quadraticCurveTo(-1,-16,7,-15.5);
  c.quadraticCurveTo(14,-18.5,22,-16);
  c.quadraticCurveTo(29,-12,31,-5.5);
  c.quadraticCurveTo(33.5,-1,30.5,4.6);
  c.quadraticCurveTo(25,10,13,10.3);
  c.quadraticCurveTo(1,14,-13,11.5);
  c.quadraticCurveTo(-21,11,-25,5);c.closePath();fill(c,BODY);
  // A quiet moss saddle and the lower throat are the two main value planes.
  c.beginPath();c.moveTo(-22,-4);
  c.quadraticCurveTo(-17,-12,-7,-11.2);
  c.quadraticCurveTo(1,-13,6,-10);
  c.quadraticCurveTo(-2,-4,-12,-4);
  c.quadraticCurveTo(-19,-2.5,-22,-4);c.closePath();fill(c,LIGHT,null);
  c.beginPath();c.moveTo(8,5.3);
  c.quadraticCurveTo(19,8.2,30,2.6);
  c.quadraticCurveTo(29,8.3,18,9.5);
  c.quadraticCurveTo(10,11.4,5,9.5);c.closePath();fill(c,BELLY,null);
  // The far eye sits behind the crown, with a smaller visible opening.
  c.beginPath();c.moveTo(20,-13);
  c.quadraticCurveTo(20.2,-20,24.4,-19);
  c.quadraticCurveTo(28,-18.6,27.5,-12.6);c.closePath();fill(c,'#819774',INK,1.1);
  oval(c,24.7,-16,1.8,2,'#d7d19a');oval(c,25.1,-16,.95,.65,INK);
  // A low brow and lateral gold eye keep the face animal-like at native size.
  c.beginPath();c.moveTo(9,-12.4);
  c.quadraticCurveTo(8.9,-21,15.2,-20.8);
  c.quadraticCurveTo(20.8,-20.5,21,-12.3);
  c.quadraticCurveTo(15,-10.5,9,-12.4);c.closePath();fill(c,'#8fa27b',INK,1.2);
  oval(c,15.9,-16.1,3,2.8,'#ddd69f');oval(c,16.5,-16.1,1.8,.9,INK);
  line(c,[[11.6,-19],[15.6,-19.7],[19.1,-18.5]],'#b7c098',1.1);
  // A broad, shallow mouth belongs to the head contour rather than a snout.
  c.beginPath();c.moveTo(9.2,1.2);c.quadraticCurveTo(20,5,30.7,.2);
  c.strokeStyle=INK;c.lineWidth=1.3;c.stroke();
  oval(c,28.2,-3.8,.75,.65,INK);
  line(c,[[24,5.7],[28,4.1]],'#d6d7aa',1);
  c.restore();
  // The folded thigh is a large organic mass; the shin folds back underneath.
  c.save();c.translate(-ready*.3,crouch*.25-hit*.25);
  c.beginPath();c.moveTo(-20,-1.6);
  c.bezierCurveTo(-29,-2.1,-29,9,-22,11.2);
  c.quadraticCurveTo(-15,15,-8,9.8);
  c.quadraticCurveTo(-7,2.4,-13,-.6);
  c.quadraticCurveTo(-16,-2,-20,-1.6);c.closePath();fill(c,'#859970',INK,1.25);
  c.beginPath();c.moveTo(-22,2.5);c.quadraticCurveTo(-27,8,-20,9.4);
  c.quadraticCurveTo(-16,10.3,-12.8,8.3);c.strokeStyle='#b4c093';c.lineWidth=1.2;c.stroke();
  c.restore();
  limb(c,[[-21,9+crouch*.2],[-24,12],[nearH.x,nearH.y-1.8]]);paw(c,nearH.x,nearH.y);
  limb(c,[[15.5,5.5+crouch*.4],[19.5+reach*.2,10.5],[nearF.x,nearF.y-1.8]]);paw(c,nearF.x,nearF.y);
  c.restore();
}
