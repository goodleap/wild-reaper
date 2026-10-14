import { TAU, clamp, hash, poly, line, oval, grad, leaf, star } from './drawing.js';

export function paint(c,p,flip){c.save();c.scale(flip,1);
    // Gradients reverse with the sprite so the world light remains upper-right.
    const fur=grad(c,-23*flip,15,23*flip,-23,['#575c43','#8f8460','#b4a276']);
    line(c,[[-23,-4],[-29,-8],[-31,-6],[-30,-3]],'#586244',2);for(const side of [-1,1]){const x=side<0?-13:12,step=p*side*1.8;poly(c,[[x-3,5],[x+4,5],[x+3+step,16],[x+5+step,18],[x-4+step,19],[x-4,15]],'#47503b','#303e30',.7);line(c,[[x+2,10],[x+1+step,16]],'#9c957164',1.1);}
    c.fillStyle=fur;c.strokeStyle='#384931';c.lineWidth=1.3;c.beginPath();c.moveTo(-26,-1);c.bezierCurveTo(-27,-13,-14,-20,3,-17);c.bezierCurveTo(17,-17,24,-6,22,4);c.quadraticCurveTo(15,13,-3,12);c.bezierCurveTo(-16,14,-26,10,-26,-1);c.fill();c.stroke();
    poly(c,[[-22,-10],[-18,-20],[-14,-17],[-11,-26],[-7,-20],[-3,-26],[1,-17],[6,-23],[10,-14],[14,-17],[16,-8]],grad(c,-14*flip,-6,12*flip,-26,['#444d37','#6a7150','#9e9b65']),'#364630',.8);
    for(let i=0;i<39;i++){const x=-22+hash(i,17)*43,y=-11+hash(i,25)*20;line(c,[[x,y],[x+1.4,y+2.3]],(x*flip>0&&i%3===0)?'#d7c59077':'#4f593a50',.65);}
    poly(c,[[13,-8],[12,-19],[17,-18],[22,-10]],'#736c50','#384a33',.9);poly(c,[[15,-16],[18,-14],[19,-10]],'#a79173');
    c.fillStyle=grad(c,7*flip,11,30*flip,-12,['#766e50','#a4936d','#c8b08a']);c.beginPath();c.moveTo(12,-11);c.quadraticCurveTo(24,-13,29,-3);c.lineTo(33,0);c.quadraticCurveTo(37,8,30,9);c.lineTo(21,10);c.quadraticCurveTo(10,10,10,0);c.closePath();c.fill();c.strokeStyle='#465039';c.lineWidth=1;c.stroke();
    oval(c,29,3,6.3,5.1,'#b29875');line(c,[[27,-.7],[31,-.3],[33,1]],'#dfc49b99',1);for(const [x,y] of [[29,2],[32,4]])oval(c,x,y,1,1.4,'#574d3a');
    c.fillStyle='#e3dec1';c.strokeStyle='#6b7150';c.lineWidth=.7;c.beginPath();c.moveTo(20,7);c.quadraticCurveTo(29,13,29,-3);c.quadraticCurveTo(26,4,21,3);c.closePath();c.fill();c.stroke();line(c,[[23,8],[27,6],[28,1]],'#fff4d9',.8);oval(c,18,-5,2,2,'#eee1b2');oval(c,18.3,-5,.8,1.2,'#383d2f');line(c,[[15,-8],[20,-7]],'#514f37',1.1);c.restore();
  }

export function isStill(entity){return !!entity.charge&&entity.charge.phase!=='rush';}
export function facing(entity,{playerX}){return (entity.charge?.dx??(playerX-entity.x))<0?-1:1;}
export function overlay(c,e,{flip,time,reduced}){
  if(e.charge?.phase==='windup'){c.save();c.scale(flip,1);oval(c,18,-5,3.6,3.2,'#e991433b');oval(c,18,-5,1.8,1.8,'#fff1b5');line(c,[[15,-8],[20,-7]],'#eeb565',1);c.restore();}
  if(e.charge?.phase==='stunned'){for(let i=0;i<3;i++){const a=i*TAU/3+(reduced?0:time*1.5);star(c,Math.cos(a)*17,-30+Math.sin(a)*4,2.7,'#f3d690');}}
}
export function telegraph(ctx,enemy,{capsulePath}){
  const charge=enemy.charge;if(charge?.phase!=='windup')return;
  const progress=clamp(1-charge.life/charge.maxLife,0,1),r=enemy.r,length=charge.length||256;
  ctx.save();ctx.translate(charge.startX,charge.startY);ctx.rotate(Math.atan2(charge.dy,charge.dx));ctx.translate(length/2,0);
  ctx.beginPath();capsulePath(ctx,length/2,r);ctx.fillStyle='#d98255';ctx.globalAlpha=.045+progress*.06;ctx.fill();ctx.strokeStyle='#dfb278';ctx.lineWidth=1.35+progress*.45;ctx.globalAlpha=.55+progress*.3;ctx.stroke();ctx.restore();
}
export default Object.freeze({paint,isStill,facing,overlay,telegraph});
