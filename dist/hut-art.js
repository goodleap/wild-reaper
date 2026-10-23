const TAU=Math.PI*2;
const noise=(a,b=0)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function stroke(c,x,y,x2,y2,color,w=1){c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();}
function rounded(c,x,y,w,h,r,fill,outline=null){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();c.fillStyle=fill;c.fill();if(outline){c.strokeStyle=outline;c.lineWidth=1.5;c.stroke();}}

// Small interiors reuse a single wood-floor texture and five furniture sprites.
// Their cached detail is static, so entering a house adds no per-frame particles.
export class HutArt {
  constructor(createCanvas){this.createCanvas=createCanvas;this.cache=new Map();}
  sprite(key,w,h,paint){if(this.cache.has(key))return this.cache.get(key);const canvas=this.createCanvas();canvas.width=w;canvas.height=h;paint(canvas.getContext('2d'));const image={canvas,w,h};this.cache.set(key,image);return image;}
  floor(featureId){if(featureId==='cottage')return this.sprite('cottage-floor',400,400,c=>{
    c.fillStyle='#796549';c.fillRect(0,0,400,400);
    // Broad quiet planks leave the small room readable behind actors.
    for(let row=0;row<14;row++){const y=row*30;for(let col=-1;col<4;col++){
      const x=col*144+(row%2)*72,n=noise(row+17,col+8);c.fillStyle=['#a58a62','#ad9269','#9f865f','#aa8e65'][Math.floor(n*4)];c.fillRect(x+1,y+1,142,28);
      stroke(c,x+3,y+2,x+140,y+2,'#d5ba884f');stroke(c,x+3,y+28,x+140,y+28,'#74604477');
      const yy=y+10+n*9;stroke(c,x+14,yy,x+49+n*70,yy+.5,'#806b4729');
      for(const xx of [x+6,x+137])ellipse(c,xx,y+6,.7,.7,'#79634488');
    }}
    // A simple inset border and threshold distinguish the room from a texture tile.
    c.strokeStyle='#69583e';c.lineWidth=9;c.strokeRect(7,7,386,386);c.strokeStyle='#c1a577';c.lineWidth=2;c.strokeRect(12,12,376,376);
    c.fillStyle='#b79b70';c.fillRect(160,376,80,24);stroke(c,160,381,240,381,'#ddc598',2);stroke(c,160,395,240,395,'#806c4c',2);
    const light=c.createRadialGradient(126,100,35,160,160,340);light.addColorStop(0,'#f9dea51c');light.addColorStop(1,'#3c463c1a');c.fillStyle=light;c.fillRect(0,0,400,400);
  });if(featureId==='mine')return this.sprite('mine-floor',400,400,c=>{
    c.fillStyle='#4b514b';c.fillRect(0,0,400,400);
    for(let i=0;i<340;i++){const x=noise(i,1)*400,y=noise(i,2)*400,r=1+noise(i,3)*5;ellipse(c,x,y,r,r*.5,i%3?'#69726b55':'#252f2e77');}
    for(const x of [183,217]){stroke(c,x,80,x,399,'#242c2b',6);stroke(c,x-1,80,x-1,399,'#8b9990',2);}
    for(let y=90;y<400;y+=23){stroke(c,176,y,224,y,'#3d3228',5);stroke(c,177,y-1,223,y-1,'#7f6f52',1);}
  });return this.sprite('floor',400,400,c=>{
    c.fillStyle='#493d29';c.fillRect(0,0,400,400);
    for(let row=0;row<16;row++){const y=row*25;for(let col=-1;col<5;col++){const x=col*106+(row%2)*53,n=noise(row,col);c.fillStyle=['#756043','#6b573b','#80694a','#705d3f'][Math.floor(n*4)];c.fillRect(x+1,y+1,104,23);stroke(c,x+2,y+2,x+104,y+2,'#a38a5a50');stroke(c,x+2,y+23,x+104,y+23,'#30291e90');for(let k=0;k<5;k++){const yy=y+5+noise(row+k,col)*14;stroke(c,x+4,yy,x+22+noise(col,k)*78,yy+(noise(k,row)-.5)*2,'#312c201d');}for(const xx of [x+6,x+99]){ellipse(c,xx,y+5,.9,.9,'#372e24');ellipse(c,xx,y+20,.9,.9,'#372e24');}}}
    const light=c.createRadialGradient(180,100,15,180,180,275);light.addColorStop(0,'#d8b97017');light.addColorStop(1,'#191d216d');c.fillStyle=light;c.fillRect(0,0,400,400);
  });}
  drawGround(c,dungeon,camX,camY,w,h){c.fillStyle=dungeon.featureId==='mine'?'#171e20':dungeon.featureId?'#101b18':'#242e28';c.fillRect(0,0,w,h);const b=dungeon.bounds,image=this.floor(dungeon.featureId||'cottage');c.drawImage(image.canvas,b.minX+w*.5-camX,b.minY+h*.5-camY,b.maxX-b.minX,b.maxY-b.minY);}
  furniture(type){return this.sprite(type,150,150,c=>{
    c.translate(75,88);c.lineJoin='round';
    if(type==='cargo'){
      c.fillStyle='#453627';c.fillRect(-25,-24,50,39);c.fillStyle='#927249';c.fillRect(-25,-34,50,37);c.fillStyle='#b19561';c.fillRect(-25,-36,50,7);
      for(const x of [-24,17]){c.fillStyle='#5c533f';c.fillRect(x,-35,7,48);stroke(c,x+1,-34,x+1,10,'#b2a985',1);}
      for(const y of [-18,-3])stroke(c,-18,y,17,y,'#6b4e33',1);stroke(c,-16,-26,15,-1,'#b59b68',4);return;
    }
    if(type==='barrel'){
      ellipse(c,0,9,19,8,'#202a2455');c.fillStyle='#80603d';c.beginPath();c.moveTo(-16,-25);c.bezierCurveTo(-23,-8,-23,6,-16,13);c.quadraticCurveTo(0,22,16,13);c.bezierCurveTo(23,6,23,-8,16,-25);c.closePath();c.fill();
      ellipse(c,0,-25,16,7,'#a18a5c');for(const y of [-16,6]){c.strokeStyle='#b3aa87';c.lineWidth=4;c.beginPath();c.ellipse(0,y,19,5,0,0,Math.PI);c.stroke();}stroke(c,-7,-20,-7,13,'#ad8b55',2);return;
    }
    if(type==='minecart'){
      for(const x of [-22,22]){ellipse(c,x,13,8,8,'#212b2b');ellipse(c,x,13,3,3,'#899992');}
      c.fillStyle='#404b4a';c.beginPath();c.moveTo(-35,-24);c.lineTo(35,-24);c.lineTo(26,9);c.lineTo(-26,9);c.closePath();c.fill();c.strokeStyle='#87958c';c.lineWidth=3;c.stroke();
      ellipse(c,0,-25,34,10,'#232e2d');for(let i=0;i<7;i++)ellipse(c,-24+i*8,-28-(i%3)*4,8,7,['#6e8580','#94aca0','#b0aa85'][i%3]);stroke(c,-32,-21,32,-21,'#a3aea2',2);return;
    }
    if(type==='rug'){rounded(c,-43,-25,86,54,4,'#8c6454');c.strokeStyle='#d0b883';c.lineWidth=2;c.strokeRect(-38,-20,76,44);c.strokeStyle='#a58561';c.lineWidth=1;c.strokeRect(-32,-14,64,32);for(let i=-35;i<=35;i+=7){stroke(c,i,-29,i,-25,'#c9b081',1.5);stroke(c,i,29,i,33,'#c9b081',1.5);}for(const y of [-8,1,10])stroke(c,-25,y,25,y,'#ad896459');return;}
    ellipse(c,3,9,type==='bed'?34:type==='shelf'?60:34,type==='bed'?34:14,'#3440313b');
    if(type==='bed'){
      rounded(c,-31,-46,62,82,3,'#796044','#514b38');rounded(c,-34,-58,68,15,4,'#ab8a59','#65573f');
      for(const xx of [-33,28]){rounded(c,xx,-55,5,99,2,'#9c7e54');ellipse(c,xx+2.5,-54,3.5,2.5,'#c6aa76');}
      rounded(c,-27,-43,54,68,4,'#d0cab0','#8c886b');rounded(c,-28,-17,56,43,3,'#7d9173','#596b53');
      rounded(c,-28,-18,56,9,2,'#a3b08b');stroke(c,-24,-8,24,-8,'#bdc4a1',1);
      for(const xx of [-19,18])stroke(c,xx,-3,xx+2,19,'#657d5b70',1.5);
      rounded(c,-22,-42,44,21,5,'#eee1bd','#b4aa89');stroke(c,-15,-25,15,-25,'#d2c39c',1);
      rounded(c,-34,24,68,12,3,'#a38355','#65573f');stroke(c,-29,27,29,27,'#d0b37c',2);
    }else if(type==='table'){
      for(const xx of [-28,23]){rounded(c,xx,-4,6,27,2,'#725b3d','#514a35');stroke(c,xx+1,9,xx+1,21,'#b09865');}
      rounded(c,-35,-24,70,40,4,'#82623f','#544a34');rounded(c,-36,-31,72,39,5,'#b18b59','#65573c');
      stroke(c,-30,-28,29,-28,'#ddbc80',2);for(const y of [-19,-7])stroke(c,-33,y,33,y,'#937045',1);
      ellipse(c,16,-9,12,7,'#6c5d3d');ellipse(c,16,-12,11,6,'#d3c49b');ellipse(c,16,-13,7,3.5,'#8e9b75');
      rounded(c,-20,-24,19,20,2,'#ead6a6','#a4936c');stroke(c,-17,-19,-4,-19,'#9e9579');stroke(c,-17,-14,-7,-14,'#9e9579');
      ellipse(c,-25,0,5.5,3,'#c6ab73');rounded(c,-27,-13,4,13,1,'#e0cea2');ellipse(c,-25,-16,2,4,'#f2cb80');
    }else if(type==='shelf'){
      rounded(c,-57,-39,114,54,3,'#66573e','#504b36');
      for(const yy of [-43,-16,10]){rounded(c,-60,yy,120,6,2,'#aa8554','#6c583b');stroke(c,-56,yy+1,56,yy+1,'#ceb17b');}
      for(const xx of [-60,54])rounded(c,xx,-42,6,64,2,'#9a794f','#6c583b');
      for(let i=0;i<4;i++){const x=-47+i*10;c.fillStyle=['#7d8d6b','#b29c68','#a57961'][i%3];c.fillRect(x,-36,7,19);stroke(c,x+2,-33,x+2,-20,'#e2c89080');}
      for(const xx of [13,34]){ellipse(c,xx,-21,8,4,'#c1ae83');ellipse(c,xx,-24,8,4,'#ddcba3');}
      for(const xx of [-34,1,33]){ellipse(c,xx,5,9,4,'#504f3766');c.fillStyle=xx<0?'#a0aa7e':'#b39865';c.beginPath();c.moveTo(xx-6,-8);c.lineTo(xx-8,4);c.quadraticCurveTo(xx,10,xx+8,4);c.lineTo(xx+6,-8);c.closePath();c.fill();c.strokeStyle='#6d7052';c.lineWidth=1;c.stroke();ellipse(c,xx,-8,6,2.5,'#d0c199');stroke(c,xx-3,-3,xx-4,3,'#d4c490',1.5);}
    }else{
      for(const xx of [-11,7])rounded(c,xx,-1,4,19,1,'#826442','#5b5038');ellipse(c,0,-5,18,11,'#80603f');ellipse(c,0,-9,18,11,'#bb9965');stroke(c,-12,-10,11,-10,'#9a794c');stroke(c,-10,-5,13,-5,'#9a794c');
    }
  });}
  drawProp(c,prop){const image=this.furniture(prop.type);c.drawImage(image.canvas,prop.x-75,prop.y-88);}
  drawWall(c,prop,behind=false){const vertical=Math.abs(Math.sin(prop.angle||0))>.5,half=prop.halfLength||0,r=prop.r||14,x=prop.x,y=prop.y,w=vertical?r*2:half*2,h=vertical?half*2:r*2;c.save();if(behind)c.globalAlpha=.45;c.translate(x-w*.5,y-h*.5);c.fillStyle='#322a21';c.fillRect(-3,1,w+6,h+4);c.fillStyle='#684d33';c.fillRect(0,-25,w,h+25);c.strokeStyle='#372f25';c.lineWidth=2;c.strokeRect(0,-25,w,h+25);if(vertical){for(let yy=0;yy<h;yy+=32)stroke(c,1,yy,w-1,yy,'#a0804b',2);c.fillStyle='#9a7d50';c.fillRect(2,-25,w-4,6);}else{for(const yy of [-19,-7,5])stroke(c,0,yy,w,yy,'#a0804b',2);for(let xx=8;xx<w;xx+=80){c.fillStyle='#3d3225';c.fillRect(xx,-25,6,h+25);c.fillStyle='#b2935a';c.fillRect(xx,-25,5,5);}}c.fillStyle='#b79b62';c.fillRect(0,-25,w,4);c.restore();}
}
