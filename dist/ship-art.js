import { PropArt } from './prop-art.js';

const TAU=Math.PI*2,TILE=384,BLEED=3,GROUND_PIXELS=4*1024*1024,PROP_PIXELS=3*1024*1024;
const P=Object.freeze({sea:'#315966',seaDeep:'#254653',foam:'#b5d2c1',wood:'#a18356',light:'#d2b37c',edge:'#3b4438',dark:'#62513b',iron:'#4d625e',ironLight:'#a7b0a0',canvas:'#d9d1ac',canvasShade:'#aaa486'});
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const line=(c,x,y,xx,yy,color,width=1)=>{c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fillStyle=color;c.fill();};
function trace(c,points,dy=0){c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y+dy));c.closePath();}
function poly(c,points,fill,edge=null,width=1){trace(c,points.map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:p));c.fillStyle=fill;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
const box=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const outline=scene=>scene.outline||box(scene.bounds.minX,scene.bounds.minY,scene.bounds.maxX-scene.bounds.minX,scene.bounds.maxY-scene.bounds.minY);
const visible=(p,v,pad=0)=>p.x+(p.width||p.rx||0)/2+pad>=v.minX&&p.x-(p.width||p.rx||0)/2-pad<=v.maxX&&p.y+(p.depth||p.ry||0)/2+pad>=v.minY&&p.y-(p.depth||p.ry||0)/2-pad<=v.maxY;
function hull(c,scene){
  const ring=outline(scene),hold=scene.kind==='hold';
  trace(c,ring,hold?0:18);c.fillStyle=hold?'#2b3029':'#233d40';c.fill();c.strokeStyle=hold?'#514636':'#1f373a';c.lineWidth=hold?24:36;c.stroke();
  trace(c,ring,hold?0:10);c.fillStyle='#544834';c.fill();c.strokeStyle=hold?'#746043':'#7b6547';c.lineWidth=hold?18:27;c.stroke();
  trace(c,ring);c.fillStyle=hold?'#866e4d':'#ae8e5f';c.fill();
}
function floor(c,scene,view){
  const hold=scene.kind==='hold',ring=outline(scene);hull(c,scene);
  c.save();trace(c,ring);c.clip();
  for(let gy=Math.floor((view.minY-30)/30);gy<=Math.floor((view.maxY+30)/30);gy++){
    const y=gy*30,shift=gy%2*88;
    for(let gx=Math.floor((view.minX-shift-180)/176);gx<=Math.floor((view.maxX-shift+180)/176);gx++){
      const x=gx*176+shift,n=hash(gx,gy),palette=hold?['#8c714d','#907650','#997e57','#846d4b']:['#b09668','#b79b6c','#aa8b5f','#ad9163'];
      c.fillStyle=palette[Math.floor(n*4)];c.fillRect(x+.6,y+.7,174.8,28.8);
      line(c,x+1,y+1,x+174,y+1,hold?'#d6b47744':'#e8ce9655',1);line(c,x+1,y+29,x+174,y+29,'#584b384d',1);
      for(let j=0;j<3;j++){const yy=y+6+j*7,xx=x+12+hash(gx+j,gy)*25;line(c,xx,yy,xx+45+hash(gy+j,gx)*55,yy+(n-.5)*2,'#5d503424',.8);}
      for(const xx of [x+5,x+170])for(const yy of [y+6,y+24]){oval(c,xx,yy,1.05,.85,'#5b584575');oval(c,xx+.3,yy-.3,.42,.3,'#eee0b15c');}
      if(n>.84){const xx=x+48+n*60;oval(c,xx,y+15,7,2.7,'#67583739');line(c,xx-5,y+15,xx+7,y+15,'#cdb37d38',.8);}
    }
  }
  // Broad, subtle wear follows physical passages; it never looks like a HUD route.
  for(const path of scene.paths||[]){c.beginPath();path.points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.lineWidth=path.width*.7;c.strokeStyle=hold?'#d9c6910c':'#f0dc9f0c';c.stroke();}
  for(let y=Math.floor(view.minY/174)*174;y<view.maxY+174;y+=174)for(let x=Math.floor(view.minX/210)*210;x<view.maxX+210;x+=210){const n=hash(x,y);if(n<.45)continue;oval(c,x+35*n,y+18,22+n*18,6+n*5,'#4c51341b');line(c,x,y+18,x+13,y+14,'#eed69a35',1);}
  if(hold){
    const b=scene.bounds,g=c.createLinearGradient(b.minX,b.minY,b.maxX,b.maxY);g.addColorStop(0,'#21302c25');g.addColorStop(.5,'#e4bd6b08');g.addColorStop(1,'#17262a28');c.fillStyle=g;c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
    // Warm pools come from fixed wall lamps, cached into the floor once.
    for(const x of [b.minX+260,b.maxX-260])for(const y of [b.minY+100,b.maxY-100]){const g=c.createRadialGradient(x,y,5,x,y,185);g.addColorStop(0,'#f5d08b24');g.addColorStop(.45,'#e8b76712');g.addColorStop(1,'#e8b76700');c.fillStyle=g;c.fillRect(x-185,y-185,370,370);}
  }
  for(const d of scene.details||[])if(visible(d,view,80))floorDetail(c,d);
  c.restore();
  // The inner seam follows exactly the walking outline. No invisible inset rim.
  trace(c,ring);c.strokeStyle=hold?'#453d30':'#5a4e36';c.lineWidth=hold?9:6;c.stroke();
  trace(c,ring,-2);c.strokeStyle=hold?'#b09460':'#d5b985';c.lineWidth=2;c.stroke();
  if(!hold){
    trace(c,ring,-12);c.strokeStyle='#4a4d38';c.lineWidth=5;c.stroke();trace(c,ring,-14);c.strokeStyle='#c6ad79';c.lineWidth=2;c.stroke();
    let travelled=0,next=34;
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b.x-a.x,b.y-a.y);for(;next<travelled+length;next+=84){const t=(next-travelled)/length,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;line(c,x,y+2,x,y-19,'#5a543a',6);line(c,x-1,y+1,x-1,y-18,'#cdb47b',2);oval(c,x,y-19,4,2,'#d4bd88');}travelled+=length;}
  }
  const b=scene.bounds;
  if(hold){for(const x of [b.minX+260,b.maxX-260])for(const y of [b.minY+14,b.maxY-14])lantern(c,x,y,1);}
}
function floorDetail(c,d){
  const {x,y,rx=24,ry=18,kind}=d;
  if(kind==='rope'){
    oval(c,x+2,y+3,rx+3,ry+2,'#403d3035');
    for(let i=0;i<5;i++){const a=Math.max(4,rx-i*4),b=Math.max(2,ry-i*2.3);c.beginPath();c.ellipse(x,y,a,b,-.15,.1,TAU-.1);c.strokeStyle='#65563e';c.lineWidth=4;c.stroke();c.strokeStyle=i%2?'#c6ac78':'#d2ba88';c.lineWidth=2.5;c.stroke();}
    line(c,x+rx-5,y,x+rx+17,y+12,'#715c3f',4);line(c,x+rx-5,y-1,x+rx+17,y+11,'#d4bd8a',2);
  }else if(kind==='hatch'||kind==='grate'){
    poly(c,box(x-rx,y-ry,rx*2,ry*2),'#3d463a','#5d5038',4);poly(c,box(x-rx+5,y-ry+5,rx*2-10,ry*2-10),'#4a4e3a','#ba9c64',2);
    for(let yy=y-ry+12;yy<y+ry-6;yy+=12)line(c,x-rx+8,yy,x+rx-8,yy,'#9a8356',4);
    for(let xx=x-rx+12;xx<x+rx-6;xx+=15)line(c,xx,y-ry+7,xx,y+ry-7,'#b19a66',3);
    for(const xx of [x-rx+3,x+rx-3])for(const yy of [y-ry+3,y+ry-3])oval(c,xx,yy,2,1.8,'#d2bc8a');
  }else if(kind==='rug'){
    poly(c,box(x-rx,y-ry,rx*2,ry*2),'#697d7477','#bca97677',2);poly(c,box(x-rx+6,y-ry+6,rx*2-12,ry*2-12),'#71847a55','#cfba8280',1);
    for(let xx=x-rx+4;xx<x+rx;xx+=8){line(c,xx,y-ry-4,xx,y-ry,'#d4bd8f88',1.2);line(c,xx,y+ry,xx,y+ry+4,'#d4bd8f88',1.2);}
  }else if(kind==='lamp')lantern(c,x,y,1);
  else if(kind==='scuff'||kind==='wreckage'){for(let i=0;i<8;i++){const xx=x+(hash(i,x)-.5)*rx*2,yy=y+(hash(i,y)-.5)*ry*2;line(c,xx,yy,xx+8+hash(i,2)*14,yy-2,'#594d3540',1);}}
}
function lantern(c,x,y,s){c.save();c.translate(x,y);c.scale(s,s);oval(c,0,4,10,5,'#353b2d50');poly(c,[[-7,-22],[7,-22],[9,-3],[5,2],[-6,2],[-9,-3]],'#53625b','#35443c',1.2);poly(c,[[-5,-18],[5,-18],[6,-3],[-6,-3]],'#e1ba72');poly(c,[[-3,-17],[2,-17],[3,-4],[-4,-4]],'#f6e1a2');line(c,0,-21,0,-2,'#746b4b',1.2);poly(c,[[-9,-23],[0,-28],[9,-23]],'#839182','#394d43',1);line(c,-3,-29,3,-29,'#b7b58b',1);c.restore();}
function sea(c,view,time){
  c.fillStyle=P.sea;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  for(let y=Math.floor(view.minY/108)*108;y<view.maxY+108;y+=108)for(let x=Math.floor(view.minX/210)*210;x<view.maxX+210;x+=210){const n=hash(x,y),dy=Math.sin(time*.55+n*TAU)*2;line(c,x+13,y+dy,x+67+n*42,y-3+dy,'#a8c6bd1e',1.5);line(c,x+50,y+22+dy,x+90,y+20+dy,'#182f3e26',2);}
}
function extrusion(c,points,height,colors){
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    poly(c,[[a.x,a.y],[b.x,b.y],[b.x,b.y-height],[a.x,a.y-height]],(a.x+b.x)>0?colors.side:colors.front,colors.edge,1.3);
  }
  trace(c,points,-height);c.fillStyle=colors.top;c.fill();c.strokeStyle=colors.edge;c.lineWidth=1.7;c.stroke();
}
function barrel(c,x,y,r,h){
  c.save();c.translate(x,y);const rr=r*.94;
  c.beginPath();c.moveTo(-rr,-h);c.bezierCurveTo(-r-3,-h*.5,-r-3,-4,-rr,3);c.quadraticCurveTo(0,r*.5,rr,3);c.bezierCurveTo(r+3,-4,r+3,-h*.5,rr,-h);c.closePath();c.fillStyle='#8b704b';c.fill();c.strokeStyle='#424a38';c.lineWidth=1.5;c.stroke();
  for(let i=-2;i<=2;i++){const xx=i*r*.34;line(c,xx,-h+2,xx*1.06,5,'#675a3e',1.1);line(c,xx+1,-h+2,xx*1.06+1,3,'#b8996370',.7);}
  oval(c,0,-h,r,r*.45,'#c1a171');oval(c,0,-h+1,r-3,Math.max(2,r*.45-2),'#a88b5f');
  for(const q of [.27,.77]){c.beginPath();c.ellipse(0,-h*q,r+1,r*.28,0,0,Math.PI);c.strokeStyle='#3e514c';c.lineWidth=5;c.stroke();c.strokeStyle='#9ca998';c.lineWidth=2;c.stroke();}
  line(c,-r*.6,-h,r*.6,-h,'#6d624a',1);oval(c,r*.25,-h,2,1.1,'#625a41');c.restore();
}
function mast(c,s){
  const r=Math.min(s.width,s.depth)/2,h=s.height||180;
  oval(c,0,0,r,r*.9,'#534a36');oval(c,0,-4,r*.91,r*.7,'#ad9160');
  for(let i=0;i<7;i++){const a=i*TAU/7;poly(c,[[Math.cos(a)*r*.86,Math.sin(a)*r*.61-4],[Math.cos(a+.12)*r*.86,Math.sin(a+.12)*r*.61-4],[Math.cos(a+.12)*r*.38,Math.sin(a+.12)*r*.28-6],[Math.cos(a)*r*.38,Math.sin(a)*r*.28-6]],'#6e5b3f');}
  poly(c,[[-10,-3],[-7,-h+6],[7,-h+6],[11,-3]],'#81633f','#3f4636',1.8);line(c,-5,-8,-4,-h+7,'#c9aa73',2.4);line(c,5,-7,4,-h+12,'#584c34',1.1);
  const w=100,y=-h*.77;line(c,-w-8,y,w+8,y,'#454639',8);line(c,-w-7,y-2,w+7,y-2,'#ab8d5d',3);
  c.beginPath();c.moveTo(-w,y+3);c.bezierCurveTo(-w+15,y+34,-w+10,y+69,-w+26,y+90);c.bezierCurveTo(-35,y+108,40,y+108,w-24,y+90);c.bezierCurveTo(w-5,y+65,w-14,y+32,w,y+3);c.quadraticCurveTo(0,y+14,-w,y+3);c.fillStyle=P.canvas;c.fill();c.strokeStyle='#6d765d';c.lineWidth=1.5;c.stroke();
  c.save();c.clip();for(const x of [-65,-30,7,44,79]){c.beginPath();c.moveTo(x,y+7);c.bezierCurveTo(x-10,y+35,x+9,y+67,x+5,y+99);c.strokeStyle='#8e987359';c.lineWidth=1.2;c.stroke();}const g=c.createLinearGradient(0,y,0,y+100);g.addColorStop(0,'#fff5d733');g.addColorStop(.6,'#fff5d700');g.addColorStop(1,'#838b5d44');c.fillStyle=g;c.fillRect(-w,y,w*2,110);c.restore();
  for(const side of [-1,1]){line(c,side*(w-17),y+88,side*r*.8,-3,'#514b36',2.3);line(c,side*(w-17)+.7,y+88,side*r*.8+.7,-3,'#d1bd8c',1.1);}
  for(let i=0;i<5;i++)line(c,-10,-21+i*4,11,-21+i*4,'#cbb37c',1.7);
  poly(c,[[6,-h+8],[40,-h+15],[30,-h+26],[7,-h+23]],'#718f84','#425e54',1);
}
function capstan(c,s){
  const r=Math.min(s.width,s.depth)/2;oval(c,0,0,r,r*.8,'#675a3e');oval(c,0,-4,r*.9,r*.68,'#b09763');
  poly(c,[[-r*.44,-4],[-r*.36,-37],[r*.36,-37],[r*.44,-4]],'#795c39','#3f4939',1.6);oval(c,0,-37,r*.46,r*.28,'#c4a873');
  for(let i=0;i<8;i++){const a=i*TAU/8,xx=Math.cos(a)*r*1.12,yy=-34+Math.sin(a)*r*.48;line(c,0,-34,xx,yy,'#5b5239',5);line(c,0,-36,xx,yy-2,'#bea16b',2);}
  for(let j=0;j<4;j++){c.beginPath();c.ellipse(0,-11-j*4,r*.47,r*.22,0,0,Math.PI);c.strokeStyle='#c3ad79';c.lineWidth=2;c.stroke();}
}
function solidImage(c,s,props){
  const w=s.width,d=s.depth,h=s.kind==='cargo'?7:s.height||36,points=s.points.map(p=>({x:p.x-s.x,y:p.y-s.y}));
  if(s.kind==='mast'||s.kind==='capstan'){
    extrusion(c,points,4,{top:'#a88e5f',front:'#756143',side:'#67593c',edge:'#454d38'});
    if(s.kind==='mast')mast(c,s);else capstan(c,s);return;
  }
  if(s.kind==='barrels'){
    extrusion(c,points,6,{top:'#ac915e',front:'#7c6542',side:'#68583a',edge:'#47503b'});
    const count=Math.max(1,Math.round(w/52)),rows=Math.max(1,Math.round(d/50)),r=Math.min(d/(rows*2.3),w/(count*2.1));
    for(let j=0;j<rows;j++)for(let i=0;i<count;i++)barrel(c,-w/2+r+4+(w-2*r-8)*i/Math.max(1,count-1),-d/2+r+4+(d-2*r-8)*j/Math.max(1,rows-1),r,Math.max(20,h-6));return;
  }
  const colors=s.kind==='bulkhead'?{top:'#c3a570',front:'#7b6040',side:'#63533a',edge:'#3e4635'}:{top:'#bca16b',front:'#92754b',side:'#6b5b3e',edge:'#424a36'};
  extrusion(c,points,s.kind==='cabin'?h*.65:h,colors);
  c.save();trace(c,points);c.clip();
  for(let yy=-d/2;yy<d/2;yy+=15)line(c,-w/2,yy,w/2,yy,'#5a50374d',1);
  c.restore();
  c.save();trace(c,points,-h);c.clip();
  for(let xx=-w/2;xx<w/2;xx+=23){line(c,xx,-d/2-h,xx,d/2-h,'#675c3d70',1);line(c,xx+1,-d/2-h,xx+1,d/2-h,'#e4ca8d50',1);}
  c.restore();
  if(s.kind==='bulkhead'){
    const vertical=d>w;
    if(vertical){for(let yy=-d/2+30;yy<d/2;yy+=110){line(c,-w/2,yy,w/2,yy,'#4c4832',7);line(c,-w/2,yy-h,w/2,yy-h,'#ebd39b',3);}}
    else for(let xx=-w/2+25;xx<w/2;xx+=115){line(c,xx,d/2,xx,d/2-h,'#4d4933',8);line(c,xx-2,d/2-2,xx-2,d/2-h+2,'#bb9a61',2);}
    return;
  }
  if(s.kind==='cabin'){
    // Low canvas-covered deckhouse, with a single clearly convex roof ridge.
    const wallHeight=h*.65,ridgeY=-h-d*.15;
    poly(c,[[-w/2,-d/2-wallHeight],[w/2,-d/2-wallHeight],[w/2-9,ridgeY],[-w/2+9,ridgeY]],'#b6b293','#66765e',1.5);
    poly(c,[[-w/2+9,ridgeY],[w/2-9,ridgeY],[w/2,d/2-wallHeight],[-w/2,d/2-wallHeight]],'#ded4ad','#687359',1.5);
    for(let xx=-w/2+24;xx<w/2;xx+=48){line(c,xx,ridgeY+2,xx+4,d/2-wallHeight-4,'#9ca18180',1);}
    line(c,-w/2+10,ridgeY,w/2-10,ridgeY,'#f0e6c1',2.5);
    for(const xx of [-w*.28,w*.28]){oval(c,xx,d/2-h*.34,11,9,'#4b5f53');oval(c,xx,d/2-h*.34,7,5.5,'#8ca699');line(c,xx-7,d/2-h*.34,xx+7,d/2-h*.34,'#c9b584',1.5);}
    for(const xx of [-w/2+10,w/2-10])line(c,xx,d/2-3,xx,d/2-wallHeight,'#d3b67c',3);
  }else if(s.kind==='bunks'){
    poly(c,box(-w/2+7,-d/2-h+7,w-14,d-14),'#d8cba5','#796d4d',1);
    poly(c,box(-w/2+10,-d/2-h+30,w-20,d-39),'#73897a','#485f50',1);
    line(c,-w/2+12,-d/2-h+34,w/2-12,-d/2-h+34,'#b9c3a2',3);
    poly(c,box(-w/2+13,-d/2-h+10,w-26,15),'#e4dbbd','#b3aa85',1);
    for(const x of [-w/2+5,w/2-5])line(c,x,-d/2-h-7,x,d/2+2,'#a68b58',4);
  }else if(s.kind==='charttable'){
    poly(c,[[-w*.34,-d*.3-h],[w*.32,-d*.35-h],[w*.34,d*.27-h],[-w*.33,d*.32-h]],'#e5d4a6','#9b895e',1);
    for(let i=0;i<5;i++){const y=-d*.2-h+i*8;line(c,-w*.23,y,w*.18,y+(i%2?3:-3),'#7b9a8a66',1);}
    c.beginPath();c.arc(w*.12,-h,d*.19,0,TAU);c.strokeStyle='#9a7e5277';c.lineWidth=1;c.stroke();
    lantern(c,-w*.35,d*.22-h,.65);
  }else if(s.kind==='shelf'){
    for(let xx=-w/2+12;xx<w/2-12;xx+=22){c.fillStyle=['#718777','#ae9564','#977268'][Math.floor(hash(xx,3)*3)];c.fillRect(xx,d/2-h+5,14,Math.max(8,h-13));line(c,xx+2,d/2-h+8,xx+2,d/2-10,'#e4d3a14d',1);}
    line(c,-w/2+3,d/2-8,w/2-3,d/2-8,'#c3a370',5);
  }else{
    // Solid cargo pallets fill their authored base. Crates add layered volume
    // with the same mature provision art as the rest of the game.
    for(let xx=-w/2+24;xx<w/2;xx+=48){line(c,xx,d/2-h+1,xx,d/2-2,'#4d5c4a',4);line(c,xx+1,d/2-h+2,xx+1,d/2-3,'#aeb694',1.2);}
    // Low deck loads need closer packing: shrinking crates to their permitted
    // height must also shrink the row and column spacing, not expose a huge pallet.
    const low=(s.height||48)<=56,maxScale=((s.height||48)-8)/32;
    const count=low?Math.max(1,Math.ceil((w-12)/(42*maxScale*1.1))):Math.max(1,Math.round((w-10)/64));
    const scale=Math.min((w-12)/count/42,maxScale,1.8),step=(w-(low?12:14))/count;
    const startY=-d/2+(low?8:20)*scale,endY=d/2+(low?3:-13);
    const rows=low?Math.max(2,Math.ceil((endY-startY)/(29*scale))+1):Math.max(1,Math.round((d-10)/42));
    for(let j=0;j<rows;j++)for(let i=0;i<count;i++){
      const cellScale=scale*((low?.97:.88)+hash(i+17,j+3)*(low?.03:.12));
      const widthScale=low?step/42:cellScale;
      const x=low?-w/2+6+step*(i+.5)-3*widthScale:-w/2+step*(i+.5)+4,y=startY+(endY-startY)*j/Math.max(1,rows-1);
      c.save();c.translate(x,y-h);c.scale(widthScale,cellScale);props.drawProp(c,{type:'supply',x:0,y:0});c.restore();
      const upper=Math.min(cellScale*.68,((s.height||48)-h-32*cellScale)/32);
      if(!low&&upper>.5&&hash(i+6,j+13)>.58){c.save();c.translate(x+3,y-h-26*cellScale);c.scale(upper,upper);props.drawProp(c,{type:'supply',x:0,y:0});c.restore();}
    }
    // Crossed lashings tie the cargo into one low, coherent obstacle.
    for(const xx of [-w*.27,w*.27]){line(c,xx,-d/2-3,xx,d/2-4,'#554e36',3.5);line(c,xx+.7,-d/2-3,xx+.7,d/2-5,'#d3bb83',1.6);}
  }
}

export class ShipArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.ground=new Map();this.sprites=new Map();this.groundPixels=0;this.spritePixels=0;this.ids=new WeakMap();this.solidKeys=new WeakMap();this.nextId=0;this.builds=0;this.props=new PropArt(makeCanvas);}
  get cacheStats(){return {entries:this.ground.size+this.sprites.size+this.props.cacheStats.entries,bytes:(this.groundPixels+this.spritePixels)*4+this.props.cacheStats.bytes,limitBytes:(GROUND_PIXELS+PROP_PIXELS)*4+this.props.cacheStats.limitBytes,builds:this.builds+this.props.cacheStats.builds};}
  clear(){this.ground.clear();this.sprites.clear();this.groundPixels=this.spritePixels=0;this.props=new PropArt(this.makeCanvas);}
  _put(cache,key,image,field,limit){while(this[field]+image.pixels>limit&&cache.size){const oldest=cache.keys().next().value;this[field]-=cache.get(oldest).pixels;cache.delete(oldest);}cache.set(key,image);this[field]+=image.pixels;this.builds++;return image;}
  _tile(scene,tx,ty){let id=this.ids.get(scene);if(!id){id=++this.nextId;this.ids.set(scene,id);}const key=`${id}:${tx}:${ty}`;let image=this.ground.get(key);if(image){this.ground.delete(key);this.ground.set(key,image);return image;}
    const side=TILE+BLEED*2,canvas=this.makeCanvas();canvas.width=canvas.height=side;const c=canvas.getContext('2d'),view={minX:tx*TILE-BLEED,minY:ty*TILE-BLEED,maxX:(tx+1)*TILE+BLEED,maxY:(ty+1)*TILE+BLEED};c.setTransform(1,0,0,1,BLEED-tx*TILE,BLEED-ty*TILE);c.lineJoin='round';c.lineCap='round';floor(c,scene,view);return this._put(this.ground,key,{canvas,pixels:side*side},'groundPixels',GROUND_PIXELS);
  }
  drawGround(c,scene,view,time=0){
    if(scene.kind==='hold'){c.fillStyle='#273831';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);}else sea(c,view,time);
    const b=scene.bounds;
    for(let ty=Math.floor(Math.max(view.minY,b.minY-50)/TILE);ty<=Math.floor(Math.min(view.maxY,b.maxY+50)/TILE);ty++)for(let tx=Math.floor(Math.max(view.minX,b.minX-50)/TILE);tx<=Math.floor(Math.min(view.maxX,b.maxX+50)/TILE);tx++){
      const image=this._tile(scene,tx,ty);c.drawImage(image.canvas,BLEED,BLEED,TILE,TILE,tx*TILE,ty*TILE,TILE,TILE);
    }
  }
  _sprite(s){
    let key=this.solidKeys.get(s);if(!key){const shape=s.points.map(p=>`${Math.round((p.x-s.x)*10)},${Math.round((p.y-s.y)*10)}`).join(';');key=`${s.kind}:${s.width}:${s.depth}:${s.height}:${shape}`;this.solidKeys.set(s,key);}let image=this.sprites.get(key);if(image){this.sprites.delete(key);this.sprites.set(key,image);return image;}
    const extra=s.kind==='mast'?130:10,half=Math.max(s.width/2+15,extra),top=s.depth/2+(s.height||40)+20,bottom=s.depth/2+12,w=Math.ceil(half*2),h=Math.ceil(top+bottom),canvas=this.makeCanvas();canvas.width=w*2;canvas.height=h*2;const c=canvas.getContext('2d');c.setTransform(2,0,0,2,half*2,top*2);c.lineCap='round';c.lineJoin='round';solidImage(c,s,this.props);return this._put(this.sprites,key,{canvas,w,h,ox:half,oy:top,pixels:canvas.width*canvas.height},'spritePixels',PROP_PIXELS);
  }
  drawProp(c,prop,{player,footY}={}){
    const s=prop.shipSolid;if(!s)return false;const image=this._sprite(s);let alpha=1;
    if(player&&Number.isFinite(footY)&&footY<s.y+s.depth/2&&Math.abs(player.x-s.x)<image.ox+15&&footY>s.y-image.oy-20)alpha=s.kind==='mast'?.42:.58;
    c.save();c.globalAlpha*=alpha;c.drawImage(image.canvas,s.x-image.ox,s.y-image.oy,image.w,image.h);c.restore();return true;
  }
}

let shared;
const art=()=>shared??=new ShipArt();
export function shipArtCacheStats(){return shared?.cacheStats??{entries:0,bytes:0,limitBytes:(GROUND_PIXELS+PROP_PIXELS)*4+3*1024*1024,builds:0};}
export function clearShipArtCache(){shared?.clear();shared=null;}
export function drawShipGround(c,scene,view,time=0){art().drawGround(c,scene,view,time);}
export function drawShipProp(c,prop,options){return prop?.shipSolid?art().drawProp(c,prop,options):false;}

export function drawShipLinks(c,run){
  for(const link of run.sceneDefinition.links||[]){
    const locked=link.requiresSegment!=null&&!run.groups[link.requiresSegment]?.cleared;
    c.save();c.translate(link.x,link.y);const dx=link.direction?.x||0,dy=link.direction?.y||1,angle=Math.atan2(dy,dx)-Math.PI/2;c.rotate(angle);
    // A broad framed hatch and visible stair treads mark a real way between decks.
    poly(c,[[-43,-45],[43,-45],[43,42],[-43,42]],'#564c37','#c0a36f',3);
    poly(c,[[-34,-36],[34,-36],[34,33],[-34,33]],'#263d36','#736b48',2);
    for(let i=0;i<5;i++){const y=-24+i*13;poly(c,[[-31,y],[31,y],[31,y+7],[-31,y+7]],i%2?'#a88d5e':'#b99c69','#554e36',1);line(c,-30,y,30,y,'#dfc48e',1.4);}
    for(const x of [-39,39]){line(c,x,-43,x,42,'#756242',7);line(c,x-1,-43,x-1,42,'#d2b984',2);}
    if(locked){line(c,-37,-5,37,22,'#3e4f43',6);line(c,-37,-5,37,22,'#b3b58e',2);oval(c,0,9,8,7,'#c4ac6d');oval(c,0,8,2,2,'#4b5038');}
    else{poly(c,[[-9,3],[0,-7],[9,3],[4,3],[4,16],[-4,16],[-4,3]],'#e6dfb3');}
    c.restore();
    c.save();c.textAlign='center';c.font='600 12px "PingFang SC",system-ui,sans-serif';c.strokeStyle='#233d35';c.lineWidth=3;c.strokeText(link.label,link.x,link.y+63);c.fillStyle=locked?'#d4c6a0':'#e5e7bd';c.fillText(link.label,link.x,link.y+63);c.restore();
  }
}

export function drawShipSceneMap(c,scene,{labels=false,scale=1}={}){
  c.save();c.lineJoin='round';c.lineCap='round';const ring=outline(scene);trace(c,ring);c.fillStyle=scene.kind==='hold'?'#9c8862':'#bea36e';c.fill();c.strokeStyle='#6c694b';c.lineWidth=Math.max(4,1/scale);c.stroke();
  for(const s of scene.solids||[]){trace(c,s.points);c.fillStyle=s.kind==='mast'||s.kind==='capstan'?'#6b795b':s.kind==='bulkhead'?'#625c44':'#827354';c.fill();c.strokeStyle='#d4be83';c.lineWidth=1/scale*.55;c.stroke();}
  for(const link of scene.links||[]){c.fillStyle='#e9d9a0';c.fillRect(link.x-30,link.y-30,60,60);c.strokeStyle='#5a6552';c.lineWidth=1/scale;c.strokeRect(link.x-30,link.y-30,60,60);for(let i=0;i<4;i++)line(c,link.x-22,link.y-18+i*12,link.x+22,link.y-18+i*12,'#667452',1/scale);}
  if(labels){const b=scene.bounds;c.font=`600 ${Math.max(16,11/scale)}px "PingFang SC",system-ui,sans-serif`;c.textAlign='center';c.fillStyle='#ede4c2';c.strokeStyle='#344c3f';c.lineWidth=2/scale;c.strokeText(scene.name,(b.minX+b.maxX)/2,b.minY+55);c.fillText(scene.name,(b.minX+b.maxX)/2,b.minY+55);}
  c.restore();return true;
}
