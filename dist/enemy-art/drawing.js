export const TAU=Math.PI*2;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const hash=(a,b=0)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
export const poly=(c,p,fill,stroke=null,w=1)=>{c.beginPath();p.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}};
export const line=(c,p,color,w=1)=>{c.strokeStyle=color;c.lineWidth=w;c.beginPath();p.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.stroke();};
export const oval=(c,x,y,rx,ry,color,angle=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fill();};
export const grad=(c,x1,y1,x2,y2,colors)=>{const g=c.createLinearGradient(x1,y1,x2,y2);colors.forEach((s,i)=>g.addColorStop(i/(colors.length-1),s));return g;};
export function leaf(c,x,y,l,w,a,color){c.save();c.translate(x,y);c.rotate(a);c.fillStyle=color;c.beginPath();c.moveTo(-l/2,0);c.quadraticCurveTo(0,-w,l/2,0);c.quadraticCurveTo(0,w,-l/2,0);c.fill();c.restore();}
export function star(c,x,y,r,color){poly(c,[[x,y-r],[x+r*.28,y-r*.28],[x+r,y],[x+r*.28,y+r*.28],[x,y+r],[x-r*.28,y+r*.28],[x-r,y],[x-r*.28,y-r*.28]],color);}
