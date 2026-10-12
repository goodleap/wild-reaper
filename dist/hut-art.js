const TAU=Math.PI*2;
const noise=(a,b=0)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function stroke(c,x,y,x2,y2,color,w=1){c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();}

// Small interiors reuse a single wood-floor texture and five furniture sprites.
// Their cached detail is static, so entering a house adds no per-frame particles.
export class HutArt {
  constructor(createCanvas){this.createCanvas=createCanvas;this.cache=new Map();}
  sprite(key,w,h,paint){if(this.cache.has(key))return this.cache.get(key);const canvas=this.createCanvas();canvas.width=w;canvas.height=h;paint(canvas.getContext('2d'));const image={canvas,w,h};this.cache.set(key,image);return image;}
  floor(){return this.sprite('floor',400,400,c=>{
    c.fillStyle='#493d29';c.fillRect(0,0,400,400);
    for(let row=0;row<16;row++){const y=row*25;for(let col=-1;col<5;col++){const x=col*106+(row%2)*53,n=noise(row,col);c.fillStyle=['#756043','#6b573b','#80694a','#705d3f'][Math.floor(n*4)];c.fillRect(x+1,y+1,104,23);stroke(c,x+2,y+2,x+104,y+2,'#a38a5a50');stroke(c,x+2,y+23,x+104,y+23,'#30291e90');for(let k=0;k<5;k++){const yy=y+5+noise(row+k,col)*14;stroke(c,x+4,yy,x+22+noise(col,k)*78,yy+(noise(k,row)-.5)*2,'#312c201d');}for(const xx of [x+6,x+99]){ellipse(c,xx,y+5,.9,.9,'#372e24');ellipse(c,xx,y+20,.9,.9,'#372e24');}}}
    const light=c.createRadialGradient(180,100,15,180,180,275);light.addColorStop(0,'#d8b97017');light.addColorStop(1,'#191d216d');c.fillStyle=light;c.fillRect(0,0,400,400);
  });}
  drawGround(c,dungeon,camX,camY,w,h){c.fillStyle='#101b18';c.fillRect(0,0,w,h);const b=dungeon.bounds,image=this.floor();c.drawImage(image.canvas,b.minX+w*.5-camX,b.minY+h*.5-camY,b.maxX-b.minX,b.maxY-b.minY);}
  furniture(type){return this.sprite(type,150,150,c=>{
    c.translate(75,88);c.lineJoin='round';
    if(type==='rug'){c.fillStyle='#6e4540';c.fillRect(-43,-25,86,54);c.strokeStyle='#b69b66';c.lineWidth=3;c.strokeRect(-39,-21,78,46);c.strokeStyle='#7e7560';c.lineWidth=1;c.strokeRect(-34,-16,68,36);for(let i=-35;i<=35;i+=10){stroke(c,i,-30,i,-25,'#a99469',2);stroke(c,i,29,i,34,'#a99469',2);}c.strokeStyle='#b09660';c.beginPath();c.moveTo(0,-11);c.lineTo(19,1);c.lineTo(0,13);c.lineTo(-19,1);c.closePath();c.stroke();return;}
    ellipse(c,4,8,type==='bed'?33:type==='shelf'?61:34,type==='bed'?32:15,'#131d1766');
    if(type==='bed'){
      c.fillStyle='#3c3226';c.fillRect(-31,-49,62,86);c.fillStyle='#7b6140';c.fillRect(-34,-59,68,16);c.fillRect(-34,20,68,17);for(const xx of [-33,28]){c.fillStyle='#9a7a4b';c.fillRect(xx,-59,5,103);}
      c.fillStyle='#b8b49a';c.fillRect(-27,-44,54,67);c.fillStyle='#667361';c.fillRect(-28,-17,56,42);c.fillStyle='#849076';c.fillRect(-28,-17,56,7);for(let i=0;i<4;i++)stroke(c,-23+i*14,-6,-23+i*14,20,'#4c5a4b70',1.5);c.fillStyle='#d1cbb1';c.fillRect(-22,-44,44,22);stroke(c,-20,-25,20,-25,'#938f78',1);stroke(c,-31,-57,31,-57,'#bd9662',2);
    }else if(type==='table'){
      for(const xx of [-28,23]){c.fillStyle='#453425';c.fillRect(xx,-4,6,27);}c.fillStyle='#59412b';c.fillRect(-35,-24,70,40);c.fillStyle='#967448';c.fillRect(-36,-31,72,39);c.strokeStyle='#b59660';c.strokeRect(-36,-31,72,39);for(let i=0;i<3;i++)stroke(c,-35,-21+i*11,35,-21+i*11,'#6f4e31');ellipse(c,15,-9,12,7,'#4c3e2b');ellipse(c,15,-11,10,6,'#b7aa7a');ellipse(c,15,-12,6,3.5,'#7d8261');c.fillStyle='#d4c294';c.fillRect(-20,-24,17,19);stroke(c,-18,-19,-6,-19,'#8c835f');stroke(c,-18,-15,-9,-15,'#8c835f');ellipse(c,-26,-3,5,3,'#bba36b');c.fillStyle='#d5c496';c.fillRect(-28,-14,4,11);ellipse(c,-26,-16,2,4,'#e3ba73');
    }else if(type==='shelf'){
      c.fillStyle='#3c3428';c.fillRect(-57,-40,114,55);c.fillStyle='#765639';for(const yy of [-43,-16,10])c.fillRect(-60,yy,120,6);for(const xx of [-60,54])c.fillRect(xx,-43,6,65);for(let i=0;i<8;i++){const x=-48+i*12;c.fillStyle=['#68735a','#a28951','#744e42'][i%3];c.fillRect(x,-37,8,21);stroke(c,x+2,-35,x+2,-19,'#d4bc8140');}for(const xx of [-36,1,33]){ellipse(c,xx,4,9,5,'#504932');c.fillStyle=xx<0?'#909369':'#a58254';c.beginPath();c.moveTo(xx-6,-8);c.lineTo(xx-8,4);c.quadraticCurveTo(xx,10,xx+8,4);c.lineTo(xx+6,-8);c.closePath();c.fill();ellipse(c,xx,-8,6,2.5,'#c4b27b');}stroke(c,-56,-41,57,-41,'#a88959');
    }else{
      for(const xx of [-11,7]){c.fillStyle='#4c3928';c.fillRect(xx,-1,4,19);}ellipse(c,0,-5,18,11,'#59442d');ellipse(c,0,-9,18,11,'#9b7b4e');stroke(c,-12,-10,11,-10,'#785835');stroke(c,-10,-5,13,-5,'#785835');
    }
  });}
  drawProp(c,prop){const image=this.furniture(prop.type);c.drawImage(image.canvas,prop.x-75,prop.y-88);}
  drawWall(c,prop,behind=false){const vertical=Math.abs(Math.sin(prop.angle||0))>.5,half=prop.halfLength||0,r=prop.r||14,x=prop.x,y=prop.y,w=vertical?r*2:half*2,h=vertical?half*2:r*2;c.save();if(behind)c.globalAlpha=.45;c.translate(x-w*.5,y-h*.5);c.fillStyle='#322a21';c.fillRect(-3,1,w+6,h+4);c.fillStyle='#684d33';c.fillRect(0,-25,w,h+25);c.strokeStyle='#372f25';c.lineWidth=2;c.strokeRect(0,-25,w,h+25);if(vertical){for(let yy=0;yy<h;yy+=32)stroke(c,1,yy,w-1,yy,'#a0804b',2);c.fillStyle='#9a7d50';c.fillRect(2,-25,w-4,6);}else{for(const yy of [-19,-7,5])stroke(c,0,yy,w,yy,'#a0804b',2);for(let xx=8;xx<w;xx+=80){c.fillStyle='#3d3225';c.fillRect(xx,-25,6,h+25);c.fillStyle='#b2935a';c.fillRect(xx,-25,5,5);}}c.fillStyle='#b79b62';c.fillRect(0,-25,w,4);c.restore();}
}
