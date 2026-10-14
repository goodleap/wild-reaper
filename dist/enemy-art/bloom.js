import { TAU, clamp, hash, poly, line, oval, grad, leaf, star } from './drawing.js';

export function paint(c,p){
    for(const side of [-1,1]){c.save();c.scale(side,1);poly(c,[[11,23],[25,24],[31,34],[31,39],[19,41],[6,38]],grad(c,-30*side,40,29*side,24,['#405c4c','#6b8264','#a9ae83']),'#344e42',1.2);line(c,[[14,31],[13,38]],'#bcc2985c',1);line(c,[[23,32],[25,38]],'#bcc2985c',1);poly(c,[[24,-6],[33,-2],[43,13+p],[51,24+p],[50,33],[44,36],[38,28],[37,20],[27,13]],grad(c,-40*side,34,48*side,-5,['#496655','#7c9076','#b2bc96']),'#3b5145',1.3);line(c,[[31,3],[41,21+p],[46,29]],'#c5caa075',1.2);line(c,[[30,9],[37,21],[40,28]],'#3c5e4c7a',1);c.restore();}
    const body=()=>{c.beginPath();c.moveTo(-24,-15);c.quadraticCurveTo(0,-23,24,-15);c.bezierCurveTo(21,1,23,18,28,31);c.quadraticCurveTo(0,42,-29,31);c.bezierCurveTo(-23,15,-21,0,-24,-15);c.closePath();};
    body();c.fillStyle=grad(c,-26,30,24,-15,['#708970','#a8b58f','#d4d6ad']);c.fill();c.strokeStyle='#3b5847';c.lineWidth=1.7;c.stroke();c.save();body();c.clip();for(let i=0;i<11;i++){const x=-23+i*4.6;line(c,[[x,-15],[x*.83,0],[x*.91,12],[x*1.12,31]],i%3?'#53755b66':'#e1dfb96b',1.1);for(let j=0;j<3;j++)line(c,[[x,j*9],[x+1.5,j*9+4]],'#536f5040',.65);}c.restore();
    // Layered gills and an asymmetrical umbrella make the crowned boss read
    // immediately apart from the small mushroom enemies and the tree lord.
    const cap=()=>{c.beginPath();c.moveTo(-53,-18);c.bezierCurveTo(-55,-32,-38,-50,-17,-52);c.quadraticCurveTo(-2,-60,18,-50);c.bezierCurveTo(40,-48,52,-34,53,-19);c.quadraticCurveTo(44,-8,28,-7);c.quadraticCurveTo(12,-2,-5,-5);c.quadraticCurveTo(-30,-5,-53,-18);c.closePath();};
    cap();c.fillStyle=grad(c,-43,-6,42,-54,['#65536c','#95769a','#c9a5bb']);c.fill();c.strokeStyle='#444656';c.lineWidth=2;c.stroke();c.save();cap();c.clip();
    for(let i=0;i<130;i++){const x=-51+hash(i,367)*103,y=-55+hash(i,79)*47;oval(c,x,y,.45+hash(i,832)*1.2,.3+hash(i,921)*.6,i%3?'#3f35501f':'#f5d5e241');}
    for(const [x,y,rx,ry]of[[-34,-28,8,4],[-17,-43,7,4],[9,-39,10,5.5],[33,-29,6.5,4],[-7,-19,5,2.5],[22,-15,3.6,1.7]]){oval(c,x-.6,y+1.2,rx+1.3,ry+1.1,'#65466757');oval(c,x,y,rx,ry,'#dcb6ccc2');oval(c,x+1,y-.8,rx*.65,ry*.45,'#f3d2dd73');for(let i=0;i<3;i++)oval(c,x-rx*.4+i*rx*.45,y+ry*.2,.6,.45,'#ad819f77');}
    c.restore();c.fillStyle='#5c4961';c.beginPath();c.moveTo(-49,-17);c.quadraticCurveTo(0,-1,49,-18);c.quadraticCurveTo(34,-3,0,-3);c.quadraticCurveTo(-33,-6,-49,-17);c.fill();for(let i=-7;i<=7;i++){const x=i*6.2,y=-6-Math.abs(i)*1.25;line(c,[[x*.94,-14+Math.abs(i)*-.2],[x,y]],'#c6a4b986',.95);}line(c,[[-45,-14],[-24,-8],[1,-5],[28,-8],[46,-15]],'#e2c0cf8c',1.2);
    for(let i=-2;i<=2;i++){const x=i*15,y=-52+Math.abs(i)*4;line(c,[[x,y+4],[x-1,y-6]],'#536452',4);line(c,[[x+.5,y+4],[x+.4,y-6]],'#baa5b4',1.5);poly(c,[[x-5,y-7],[x-3,y-14],[x+1,y-16],[x+5,y-10],[x+4,y-5],[x,y-3]],grad(c,x-4,y-3,x+4,y-16,['#9271a0','#caabd1','#f1dae8']),'#665672',1);poly(c,[[x+1,y-15],[x+1,y-5],[x+4,y-9]],'#f7e3f078');}
    for(const x of [-9,9]){oval(c,x,10,3,4,'#304b3c');oval(c,x+.7,8.8,.9,1.3,'#dde4b6');}line(c,[[-13,6],[-5,8]],'#f0cf9b',2);line(c,[[5,8],[13,6]],'#ffe1af',2);poly(c,[[-9,22],[0,16],[9,23],[0,33]],'#66745c');poly(c,[[-6,24],[0,19],[6,24],[0,30]],grad(c,-5,29,5,20,['#9b6bab','#d6abe1','#f6d9ef']));line(c,[[-6,24],[0,24],[0,30]],'#9564a1',.8);line(c,[[0,19],[0,24],[6,24]],'#f7ddf0',.8);
  }

export function overlay(c,e){
  if(e.bloomAttack){for(let i=-2;i<=2;i++){const x=i*15,y=-59+Math.abs(i)*4;oval(c,x,y,4.4,5.7,'#f5d8f270');star(c,x+.5,y-1,2.1,'#fff0f8');}}
}
export function ground(ctx,enemy,{line,diamond}){
    const attack=enemy.bloomAttack;if(!attack||attack.life<=0)return;
    const progress=clamp(1-attack.life/attack.maxLife,0,1);
    if(attack.kind==='fan'){
      // These quiet lines describe the locked spread, not a filled damage
      // area. The crown charge and visible projectiles carry the attack itself.
      for(let i=0;i<5;i++){const angle=attack.angle-attack.spread/2+i*attack.spread/4,dx=Math.cos(angle),dy=Math.sin(angle),length=240;
        ctx.globalAlpha=.3+progress*.25;line(attack.x+dx*25,attack.y+dy*25,attack.x+dx*length,attack.y+dy*length,'#e0b9e9',1.3);
      }
    }else for(const circle of attack.circles||[]){
      const {x,y,r}=circle;ctx.globalAlpha=.05+progress*.06;ctx.fillStyle='#c38adb';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.globalAlpha=.58+progress*.3;ctx.strokeStyle='#dfb5e8';ctx.lineWidth=1.5+progress*.5;ctx.stroke();
    }
}
export default Object.freeze({paint,overlay,frequency:4,ground,groundOrder:0,phaseLabel:e=>e.bloomAttack?.life>0?(e.bloomAttack.kind==='fan'?'孢冠扇射':'孢爆蓄力'):null,notice:(events,boss)=>events.some(e=>e.type==='bloomWindup')?(boss?.bloomAttack?.kind==='fan'?'孢冠扇射 · 绕至侧面，借树石掩护':'孢爆将至 · 离开紫色预警圈'):null,sounds:Object.freeze({bloomWindup:[270,.28,'sine',.025,390],bloomShot:[400,.13,'triangle',.025,220],bloomBurst:[170,.3,'triangle',.035,70]})});
