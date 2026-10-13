const TAU=Math.PI*2;
const oval=(c,x,y,rx,ry,fill)=>{c.fillStyle=fill;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const polygon=(c,points,fill,stroke)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.2;c.stroke();}};

// One stationary debug-only actor needs no animation cache. This paint remains
// in body coordinates; the common renderer supplies depth, recoil and shadow.
export function drawTrainingDummy(c,enemy) {
  c.save();c.lineCap='round';c.lineJoin='round';
  const hit=enemy.hit>0,wood=hit?'#c5a872':'#997447',light=hit?'#f1d79d':'#d6ad70',dark='#4b3d2d';
  polygon(c,[[-5,-29],[5,-29],[6,17],[-6,17]],wood,dark);
  polygon(c,[[-5,-29],[0,-31],[5,-29],[0,-27]],light,dark);
  polygon(c,[[-22,-16],[21,-16],[22,-8],[-22,-8]],wood,dark);
  line(c,[[-21,-14],[20,-14]],light,1.4);
  line(c,[[-2,-27],[-1,14]],'#e0b77b',1.1);
  line(c,[[3,1],[2,15]],'#604a31',1);
  polygon(c,[[-5,11],[-16,18],[-12,20],[0,16],[12,20],[16,18],[5,11]],wood,dark);
  oval(c,0,-10,13,15,'#4c4030');oval(c,-.6,-11,11.5,13.3,light);
  oval(c,-.8,-11,8.4,10.1,wood);oval(c,-1,-11,5.6,7.1,'#784c36');oval(c,-1.4,-11.8,2.7,3.9,'#c4c3a1');
  line(c,[[-9,-20],[-4,-23],[2,-23]],'#f2d69a',1.2);
  line(c,[[-4,5],[5,5]],'#696b60',3.5);line(c,[[-4,4],[5,4]],'#b7b49a',.8);
  for(const x of [-18,17]){oval(c,x,-12,1.1,1.1,'#c4c1a2');}
  c.font='600 9px ui-monospace, monospace';c.textAlign='center';c.lineWidth=2.5;
  c.strokeStyle='#243727';c.strokeText('木桩 · 防御 100',0,-38);c.fillStyle='#eee2bd';c.fillText('木桩 · 防御 100',0,-38);
  c.restore();
}
