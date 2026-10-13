import { TAU, clamp, hash, poly, line, oval, grad, leaf, star } from './drawing.js';

export function paint(c,p){
    for(const x of [-9,0,9]){const step=p*(x===0?-1:1);poly(c,[[x-2,5],[x+3,5],[x*1.35+2+step,15],[x*1.35+step,18],[x*1.35-3+step,17],[x-3,10]],'#58715a','#354f41',.8);line(c,[[x,9],[x*1.35+step,15]],'#9ba888',.8);}
    oval(c,0,2,14,15,grad(c,-14,16,12,-11,['#55745e','#889c7c','#bac6a0']));for(let i=0;i<7;i++){const x=-10+i*3.2;line(c,[[x,-1],[x*.86,7],[x*1.12,13]],i%2?'#48695165':'#d2d8b14d',.8);}
    const cap=()=>{c.beginPath();c.moveTo(-24,-7);c.bezierCurveTo(-25,-18,-14,-31,1,-31);c.bezierCurveTo(17,-32,27,-19,24,-8);c.quadraticCurveTo(0,2,-24,-7);c.closePath();};
    cap();c.fillStyle=grad(c,-19,-3,19,-31,['#635773','#9778a1','#c2a3c1']);c.fill();c.strokeStyle='#454959';c.lineWidth=1.4;c.stroke();c.save();cap();c.clip();for(let i=0;i<37;i++){const x=-22+hash(i,111)*45,y=-29+hash(i,115)*23;oval(c,x,y,.5+hash(i,58)*1.1,.4+hash(i,61)*.8,i%3?'#372e4a26':'#f9d3ee44');}for(const [x,y,s]of[[-11,-17,4.8],[9,-23,4],[17,-11,2.7],[-2,-8,2.2]]){oval(c,x-.4,y+.7,s+1,s*.75+1,'#5742654b');oval(c,x,y,s,s*.72,'#d9b1d3');oval(c,x+1,y-.7,s*.55,s*.29,'#f2d2e475');}c.restore();
    c.fillStyle='#4b485c';c.beginPath();c.moveTo(-22,-7);c.quadraticCurveTo(0,1,23,-8);c.quadraticCurveTo(6,4,-11,0);c.closePath();c.fill();for(let i=-3;i<=3;i++)line(c,[[i*5.8,-5+Math.abs(i)*-.3],[i*4.6,-1]],'#c2a2c16a',.8);line(c,[[-19,-5],[-7,-2],[6,-2],[20,-6]],'#d3aec58c',1);
    for(const x of [-5,5]){oval(c,x,5,1.8,2.4,'#273e33');oval(c,x+.5,4.2,.55,.7,'#d3dbb0');}oval(c,0,10,2.6,1.5,'#456149');
  }

export function overlay(c,e,{time,reduced,dense}){
  if(e.cast){const progress=clamp(1-e.cast.life/e.cast.maxLife,0,1),x=Math.cos(e.cast.angle)*18,y=7+Math.sin(e.cast.angle)*10;oval(c,x,y,4.5+progress*3,4.5+progress*3,'#dab5e733');oval(c,x,y,2.3+progress*2,2.3+progress*2,'#e8ccf1');star(c,x-.4,y-.6,2+progress*1.5,'#fff0fa');if(!dense)for(let i=0;i<3;i++){const a=i*TAU/3+(reduced?0:time*2);oval(c,x+Math.cos(a)*7,y+Math.sin(a)*5,1,1,'#e5baed');}}
}
export default Object.freeze({paint,overlay});
