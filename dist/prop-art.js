// Small hand-painted world objects. All brushwork is drawn into a finite 2x
// sprite cache; the live path only composites sprites and a few tiny glints.
// Cast shadows, interaction labels and health bars remain owned by app.js.
const TAU=Math.PI*2, PIXEL_LIMIT=3*1024*1024/4, OPTIONS=Object.freeze({});
const poly=(c,p,color,edge=null,w=1)=>{c.beginPath();for(let i=0;i<p.length;i++)c[i?'lineTo':'moveTo'](p[i][0],p[i][1]);c.closePath();if(color){c.fillStyle=color;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=w;c.stroke();}};
const path=(c,p,color,w=1)=>{c.beginPath();for(let i=0;i<p.length;i++)c[i?'lineTo':'moveTo'](p[i][0],p[i][1]);c.strokeStyle=color;c.lineWidth=w;c.stroke();};
const oval=(c,x,y,rx,ry,color,a=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,a,0,TAU);c.fill();};
const hash=(a,b=0)=>{const x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x);};
function leaf(c,x,y,w,h,angle,color){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();c.moveTo(0,h*.5);c.bezierCurveTo(-w,h*.1,-w*.65,-h*.36,0,-h*.5);c.bezierCurveTo(w*.8,-h*.23,w*.7,h*.2,0,h*.5);c.fill();path(c,[[0,h*.4],[0,-h*.37]],'#d9df9a63',.55);c.restore();}
function spark(c,x,y,s,color){c.fillStyle=color;c.beginPath();c.moveTo(x,y-s);c.quadraticCurveTo(x+s*.14,y-s*.14,x+s*.68,y);c.quadraticCurveTo(x+s*.14,y+s*.14,x,y+s);c.quadraticCurveTo(x-s*.14,y+s*.14,x-s*.68,y);c.quadraticCurveTo(x-s*.14,y-s*.14,x,y-s);c.fill();}

function chest(c,royal,state){
  const open=state==='open',ready=state==='ready',locked=state==='locked';
  const wood=royal?'#65516b':'#86603b',light=royal?'#8c718e':'#a8804b',dark=royal?'#403b4c':'#564634',trim=royal?'#ceb583':'#b8a16a';
  // A visible right-hand face and recessed lid seam make the chest a volume.
  poly(c,[[-24,-23],[20,-23],[24,-19],[24,-1],[19,3],[-24,1]],wood,'#27382a',1.4);
  poly(c,[[20,-23],[27,-28],[28,-8],[24,-1],[20,2]],dark,'#344032',.8);
  poly(c,[[-24,-23],[20,-23],[20,1],[-24,1]],wood);
  for(let i=0;i<3;i++){const y=-20+i*7;c.fillStyle=i%2?light:wood;c.fillRect(-23,y,43,5.7);path(c,[[-22,y+6],[19,y+6]],dark,.7);}
  for(let i=0;i<26;i++){const x=-22+hash(i,7)*42,y=-21+hash(i,11)*20;path(c,[[x,y],[Math.min(19,x+2+hash(i,4)*6),y-.3]],i%3?'#2c382b36':'#f2d59839',.5);}
  if(open){
    // Upright empty lid and a clearly dark interior indicate a claimed reward.
    poly(c,[[-24,-25],[-22,-45],[-17,-49],[18,-49],[24,-43],[23,-25]],light,'#344032',1.3);
    poly(c,[[-19,-29],[-17,-44],[16,-44],[19,-29]],dark);
    poly(c,[[-16,-32],[-15,-41],[14,-41],[16,-32]],wood);
    path(c,[[-19,-46],[18,-46]],trim,2);
    poly(c,[[-23,-25],[20,-25],[25,-20],[19,-16],[-23,-16]],'#26342b');
    path(c,[[-23,-17],[18,-17],[25,-21]],trim,1.8);
  }else{
    const top=c.createLinearGradient(-15,-19,14,-38);top.addColorStop(0,dark);top.addColorStop(.52,wood);top.addColorStop(1,light);
    c.fillStyle=top;c.strokeStyle='#35412f';c.lineWidth=1.2;c.beginPath();c.moveTo(-24,-22);c.bezierCurveTo(-25,-32,-22,-38,-15,-39);c.lineTo(14,-39);c.bezierCurveTo(22,-38,24,-30,23,-22);c.closePath();c.fill();c.stroke();
    poly(c,[[23,-22],[28,-28],[27,-34],[23,-39],[16,-41],[14,-39],[20,-35]],royal?'#78637d':'#aa8552','#394330',.6);
    path(c,[[-22,-28],[21,-28]],dark,.7);path(c,[[-21,-34],[18,-34]],'#e2c39366',.65);
    path(c,[[-23,-22],[23,-22]],'#30392b',2);path(c,[[-23,-20],[22,-20]],trim,.9);
  }
  // Metal bands wrap over the barrel lid; small rivets catch upper-right light.
  for(const x of [-16,14]){
    c.fillStyle=trim;c.fillRect(x-1.8,-21,3.6,22);path(c,[[x-1,-20],[x-1,0]],'#514d39',.7);path(c,[[x+1,-20],[x+1,0]],'#e9d5a5b3',.6);
    if(open){poly(c,[[x-2,-46],[x+1,-46],[x+2,-28],[x-2,-28]],trim);}else{c.strokeStyle=trim;c.lineWidth=3.4;c.beginPath();c.moveTo(x,-23);c.quadraticCurveTo(x+1,-33,x-2,-38);c.stroke();path(c,[[x,-35],[x+1,-27]],'#eee0b6b5',.7);}
    oval(c,x,-17,.9,.9,'#484c36');oval(c,x+.25,-17.35,.4,.4,'#f3e5ba');oval(c,x,-3,.9,.9,'#484c36');
  }
  path(c,[[-23,1],[20,1],[27,-5]],trim,2);path(c,[[-22,-.7],[19,-.7]],'#e7d59d80',.7);
  if(!open){
    poly(c,[[-5,-25],[4,-25],[6,-21],[5,-12],[-5,-12],[-6,-21]],trim,'#56533d',.7);
    if(royal){poly(c,[[0,-25],[4,-21],[0,-16],[-4,-21]],ready?'#f2dafb':locked?'#8c8a8c':'#b998cb');poly(c,[[0,-25],[4,-21],[0,-22]],'#fff0dfa8');}
    else{oval(c,0,-19,1.5,1.9,ready?'#fff0a3':'#36412d');c.fillStyle='#37412c';c.fillRect(-.6,-18,1.2,3);}
  }
  if(royal){
    // Engraved crown and purple velvet distinguish final-Boss loot at a glance.
    poly(c,[[-7,-7],[-9,-13],[-4,-10],[0,-15],[4,-10],[8,-13],[6,-7]],trim,'#51493d',.6);
    path(c,[[-7,-6],[6,-6]],'#e1c897',1.2);oval(c,0,-10,1,1,'#c8a6de');
    for(const x of [-23,20])poly(c,[[x-1,-14],[x+3,-10],[x+2,-6],[x-2,-9]],'#d5be8a');
  }
  if(locked){
    // The guard lock is a physical chain, not another floating magic circle.
    path(c,[[-20,-29],[18,-6]],'#414438',3);path(c,[[20,-29],[-18,-6]],'#414438',3);
    for(let i=0;i<8;i++){const x=-17+i*4.8,y=-27+i*2.8;oval(c,x,y,2.2,1.3,'#b4ae84',.52);oval(c,x,y,1.2,.55,'#505040',.52);oval(c,-x,y,2.2,1.3,'#c3b792',-.52);oval(c,-x,y,1.2,.55,'#57513f',-.52);}
    poly(c,[[-5,-20],[5,-20],[5,-12],[-5,-12]],'#857657','#d0bd85',.8);oval(c,0,-17,1.3,1.3,'#333c31');
  }
}

function crate(c,hit){
  poly(c,[[-18,-24],[17,-24],[24,-31],[-11,-32]],'#ac8c5c','#34412f',1.1);
  poly(c,[[17,-24],[24,-31],[24,-7],[17,0]],'#6a5b40','#32412e',1.1);
  poly(c,[[-18,-24],[17,-24],[17,0],[-18,0]],hit?'#c5ad76':'#8b704a','#32412e',1.2);
  for(let i=0;i<4;i++){const x=-17+i*8.5;poly(c,[[x,-23],[x+7.5,-23],[x+7.5,-1],[x,-1]],i%2?'#a28654':'#977747');path(c,[[x+7.5,-22],[x+7.5,-1]],'#564d34',.8);for(let j=0;j<4;j++){const yy=-20+j*5;path(c,[[x+1,yy],[x+2+hash(i,j)*4,yy-.6]],'#e4bd773b',.65);}}
  for(let i=0;i<3;i++){const x=-8+i*10;path(c,[[x,-31],[x-6,-25]],'#665d3e',.8);}
  poly(c,[[-17,-23],[-12,-24],[17,-4],[17,0],[12,-1],[-17,-21]],'#bb975f','#5c5238',.65);
  poly(c,[[-17,-4],[13,-23],[17,-22],[17,-18],[-13,0],[-17,0]],'#b39661','#5c5238',.65);
  path(c,[[-16,-3],[15,-22]],'#e4c4879c',.7);path(c,[[-16,-23],[14,-3]],'#dfbe8090',.65);
  for(const x of [-14,14])for(const y of [-20,-3]){oval(c,x,y,1.1,1.1,'#535443');oval(c,x+.2,y-.3,.45,.45,'#d3c6a0');}
  path(c,[[19,-22],[23,-26]],'#b19a67',1);path(c,[[20,-7],[23,-10]],'#b19a67',1);
  // Faded provision mark is painted on wood, never confused with a pickup.
  c.globalAlpha=.48;path(c,[[-4,-15],[3,-15]],'#e0d6a4',1);path(c,[[0,-18],[0,-12]],'#e0d6a4',1);c.globalAlpha=1;
  if(hit){c.globalAlpha=.28;poly(c,[[-18,-24],[17,-24],[24,-31],[-11,-32]],'#fff0be');poly(c,[[-18,-24],[17,-24],[17,0],[-18,0]],'#fff0be');c.globalAlpha=1;}
}

function mushroom(c,armed){
  const stem=c.createLinearGradient(-5,-15,7,-5);stem.addColorStop(0,'#8a7956');stem.addColorStop(.7,'#dac39b');stem.addColorStop(1,'#b6a27a');
  c.fillStyle=stem;c.beginPath();c.moveTo(-5,-21);c.bezierCurveTo(-5,-12,-8,-7,-6,-1);c.quadraticCurveTo(1,3,7,-1);c.bezierCurveTo(4,-9,5,-14,6,-21);c.closePath();c.fill();
  path(c,[[2,-14],[1,-8],[3,-2]],'#fff0bd82',.7);path(c,[[-3,-11],[-4,-3]],'#6e6c4f80',.7);
  oval(c,0,-14,20,5.2,'#a77b51');
  for(let i=0;i<14;i++){const x=-18+i*2.8;path(c,[[x,-14],[x*.18,-10]],'#f4d6a66e',.6);}
  const cap=c.createLinearGradient(-9,-13,10,-33);cap.addColorStop(0,'#935934');cap.addColorStop(.42,armed?'#d78f48':'#ba783c');cap.addColorStop(1,armed?'#ffe0a0':'#e4b574');
  c.fillStyle=cap;c.strokeStyle='#624f35';c.lineWidth=1.1;c.beginPath();c.moveTo(-21,-14);c.bezierCurveTo(-20,-25,-10,-33,1,-32);c.bezierCurveTo(12,-32,20,-26,22,-15);c.quadraticCurveTo(20,-11,15,-12);c.quadraticCurveTo(6,-9,-2,-12);c.quadraticCurveTo(-12,-10,-21,-14);c.fill();c.stroke();
  path(c,[[-17,-23],[-11,-28],[-3,-30]],'#f1c48477',.7);path(c,[[7,-30],[14,-26],[18,-20]],'#fff0bf8f',1);
  for(let i=0;i<22;i++){const x=-17+hash(i,25)*35,y=-29+hash(i,19)*15;if((x*x)/400+((y+15)*(y+15))/289<.98){oval(c,x,y,.4+hash(i,3)*.7,.35,'#744b2c52');}}
  for(const spot of [[-9,-23,3.8,2.4],[8,-25,3.3,2],[15,-17,2.4,1.6],[-3,-15,2,1.3],[-15,-17,1.5,1]]){oval(c,spot[0]-.4,spot[1]+.6,spot[2],spot[3],'#7f643963');oval(c,spot[0],spot[1],spot[2],spot[3],'#e7d5ac');path(c,[[spot[0],spot[1]-spot[3]*.6],[spot[0]+spot[2]*.4,spot[1]-spot[3]*.5]],'#fff0d0',.5);}
  leaf(c,-8,0,2,7,-.7,'#697948');leaf(c,9,0,1.8,6,.8,'#859456');
  if(armed){path(c,[[2,-30],[-2,-23],[3,-21],[0,-14]],'#6f4e2d',3);path(c,[[2,-30],[-2,-23],[3,-21],[0,-14]],'#fff1c2',1.2);}
}

function portal(c,variant){
  const mint=variant===0,amber=variant===2;
  const pale=amber?'#ffe1a5':mint?'#b6f4da':'#e1c5f7',bright=amber?'#cba45f':mint?'#74b8a4':'#ad8fc0',dark=amber?'#34473a':mint?'#153b3c':'#2b3048';
  // Narrow, uneven masonry surrounds a translucent opening. The opening is
  // rendered inside the arch, leaving feet and neighbouring actors readable.
  const aperture=c.createRadialGradient(6,-49,1,0,-39,37);aperture.addColorStop(0,bright+'ae');aperture.addColorStop(.35,dark+'e8');aperture.addColorStop(.75,dark+'ef');aperture.addColorStop(1,bright+'35');
  c.fillStyle=aperture;c.beginPath();c.moveTo(-23,-6);c.lineTo(-23,-43);c.bezierCurveTo(-23,-64,-12,-74,0,-74);c.bezierCurveTo(13,-74,24,-63,24,-43);c.lineTo(24,-6);c.quadraticCurveTo(0,2,-23,-6);c.fill();
  for(let i=0;i<28;i++){const a=hash(i,13)*TAU,r=hash(i,19),x=Math.cos(a)*20*r,y=-39+Math.sin(a)*31*r;oval(c,x,y,.25+hash(i,37)*.6,.3,pale+'9e');}
  for(let i=0;i<5;i++){c.strokeStyle=i%2?bright+'38':pale+'36';c.lineWidth=1.2;c.beginPath();c.moveTo(-18,-11-i*11);c.bezierCurveTo(22,-27-i*7,-20,-49-i*3,15,-66+i*2);c.stroke();}
  for(let side=-1;side<=1;side+=2){
    for(let i=0;i<4;i++){const x=side*27,y=-8-i*12,dx=side*(i%2?1:0);poly(c,[[x-5+dx,y],[x-6+dx,y-11],[x+4+dx,y-12],[x+6+dx,y-1]],i%2?'#687868':'#788572','#31483c',1);path(c,[[x+5+dx,y-2],[x+3+dx,y-10],[x-4+dx,y-10]],'#bac1a16e',.75);path(c,[[x-4+dx,y-1],[x+4+dx,y-2]],'#344b3b',.8);if(i===1||i===3){path(c,[[x-2,y-4],[x+1,y-7],[x-1,y-9]],pale+'d0',.8);}}
  }
  for(let i=0;i<7;i++){const a=Math.PI+i*Math.PI/6,aa=a-.21,ab=a+.21,x=Math.cos(a)*28,y=-45+Math.sin(a)*29;poly(c,[[Math.cos(aa)*25,-45+Math.sin(aa)*28],[Math.cos(aa)*34,-45+Math.sin(aa)*36],[Math.cos(ab)*34,-45+Math.sin(ab)*36],[Math.cos(ab)*25,-45+Math.sin(ab)*28]],i>3?'#8c9981':'#647766','#324d3f',1);path(c,[[Math.cos(aa)*33,-45+Math.sin(aa)*35],[Math.cos(ab)*33,-45+Math.sin(ab)*35]],'#c8cbb087',.85);if(i%2===1)path(c,[[x-1,y-2],[x+1,y+2]],pale,.9);}
  poly(c,[[-34,-5],[-31,-12],[-20,-11],[-19,-2],[-31,1]],'#6b7c60','#354c37',1);poly(c,[[20,-5],[22,-12],[31,-11],[35,-2],[24,1]],'#849172','#354c37',1);
  path(c,[[-33,-4],[-23,-4]],'#b1b997',.85);path(c,[[23,-5],[32,-4]],'#d0d2ad',.85);
  path(c,[[-21,-12],[-21,-44]],bright+'b0',1);path(c,[[21,-44],[21,-12]],pale+'a0',1.2);
  leaf(c,-30,-2,2.2,7,-.6,'#7f9259');leaf(c,-23,-4,2,7,.6,'#657e48');leaf(c,28,-12,1.7,5,.5,'#718955');
  poly(c,[[0,-84],[4,-79],[0,-74],[-4,-79]],bright,'#d1e6c899',.6);poly(c,[[0,-84],[4,-79],[0,-80]],pale);
}

function pickup(c,type){
  if(type==='herb'){
    path(c,[[-2,8],[0,1],[1,-7]],'#738353',2);path(c,[[-1,5],[-5,1]],'#94aa68',1.2);
    leaf(c,-4,-1,4,11,-.68,'#9cbd77');leaf(c,4,-5,3.5,11,.63,'#c4d797');leaf(c,-2,-9,3,9,-.2,'#a8c882');leaf(c,5,2,3.2,9,.95,'#86ac67');
    path(c,[[-4,5],[2,7],[-3,8],[3,5]],'#d9c397',1.2);oval(c,2,-12,1.3,1.6,'#e9dfad');
  }else if(type==='magnet'){
    const metal=c.createLinearGradient(-8,0,8,-3);metal.addColorStop(0,'#645d88');metal.addColorStop(.35,'#a398c6');metal.addColorStop(.7,'#ded3ec');metal.addColorStop(1,'#988caf');
    c.strokeStyle='#3c3d51';c.lineWidth=6.7;c.beginPath();c.moveTo(-6,-7);c.lineTo(-6,1);c.bezierCurveTo(-6,10,6,10,6,1);c.lineTo(6,-7);c.stroke();c.strokeStyle=metal;c.lineWidth=4.7;c.stroke();
    c.fillStyle='#d8c691';c.fillRect(-8.5,-8,5,4);c.fillRect(3.5,-8,5,4);path(c,[[-8,-7],[ -4,-7]],'#f4e5b8',.7);path(c,[[4,-7],[8,-7]],'#fff0ce',.7);path(c,[[-6,-2],[-6,2],[-3,6]],'#e9e0ee80',.75);
    path(c,[[-10,-3],[-12,0]],'#c6b9e28a',.9);path(c,[[10,-3],[12,0]],'#c6b9e28a',.9);
  }else{
    // A tiny amber tonic still carries the familiar lightning buff symbol.
    poly(c,[[-4,-7],[4,-7],[4,-4],[7,-1],[7,7],[4,10],[-4,10],[-7,7],[-7,-1],[-4,-4]],'#b58548','#664d36',1);
    poly(c,[[-5,0],[5,0],[5,7],[2,8],[-4,7]],'#e6b765');path(c,[[-5,-2],[-5,5],[-3,8]],'#f5dfb77e',1);path(c,[[5,0],[5,5]],'#fff0c99c',.75);
    poly(c,[[-4,-10],[4,-10],[4,-6],[-4,-6]],'#918164','#514e3b',.75);path(c,[[-3,-9],[3,-9]],'#c4b58b',.8);
    poly(c,[[1,-3],[-3,3],[0,3],[-1,7],[4,1],[1,1]],'#fff0b9');
  }
}

function bullet(c,bloom){
  // Wine/pink enemy spores are visually separate from ice-blue friendly bolts.
  const core=c.createRadialGradient(1.7,-1.8,.2,0,0,6);core.addColorStop(0,'#ffe4dc');core.addColorStop(.4,bloom?'#e3a4d0':'#c88ebb');core.addColorStop(1,'#744e79');
  for(let i=0;i<5;i++){const a=i*TAU/5;leaf(c,Math.cos(a)*4.8,Math.sin(a)*4.8,1.8,bloom?5:3.6,a+Math.PI/2,bloom?'#ce8db76e':'#99729d6e');}
  c.fillStyle=core;c.beginPath();c.moveTo(5.9,0);c.quadraticCurveTo(3.9,4.8,0,5.8);c.quadraticCurveTo(-4.7,4,-5.7,0);c.quadraticCurveTo(-4.4,-4.7,0,-5.7);c.quadraticCurveTo(4.6,-4.1,5.9,0);c.fill();
  path(c,[[-3,-2],[-.2,-3.8],[2.2,-3]],'#ffe5e1d0',.75);oval(c,2,-1.9,1,1,'#fff3e2');oval(c,-1,2,1.1,.8,'#6b3e704c');
}

function blade(c,evolved){
  const edge=evolved?'#fff1c0':'#e9ecd1',body=evolved?'#bea86a':'#8b9f90';
  // Forged, curved steel with a dark fuller and a wrapped hilt, still exactly
  // the original short orbital silhouette (17 units above its pivot).
  const steel=c.createLinearGradient(-7,0,7,-3);steel.addColorStop(0,'#516c65');steel.addColorStop(.35,body);steel.addColorStop(.65,edge);steel.addColorStop(1,'#91a394');
  c.fillStyle=steel;c.strokeStyle='#344c40';c.lineWidth=.85;c.beginPath();c.moveTo(0,-17);c.bezierCurveTo(1,-12,10,-6,6,5);c.lineTo(2,10);c.lineTo(-2,7);c.bezierCurveTo(-6,-1,-8,-8,0,-17);c.closePath();c.fill();c.stroke();
  c.strokeStyle=edge;c.lineWidth=1;c.beginPath();c.moveTo(0,-16);c.bezierCurveTo(2,-11,8,-5,5,4);c.stroke();
  path(c,[[0,-12],[-1,-6],[1,4]],evolved?'#9a8043':'#53746c',.8);path(c,[[-1,-9],[1,-7],[0,-4]],'#e0e3b86e',.5);
  poly(c,[[-5,6],[-4,4],[1,7],[6,6],[6,8],[1,9]],evolved?'#cfb573':'#9aab84','#415644',.65);
  path(c,[[0,9],[-1,14]],'#715e43',3.2);for(let i=0;i<3;i++)path(c,[[-1.5,10+i*1.4],[1,10.6+i*1.4]],'#d3bd87',.7);oval(c,-1,14,1.9,1.3,evolved?'#e3c784':'#adb897');
}

export class PropArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;}
  get diagnostics(){return {entries:this.cache.size,size:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  get cacheStats(){return this.diagnostics;}
  _frame(key){
    let image=this.cache.get(key);if(image)return image;
    const isPortal=key.startsWith('portal'),isChest=key.startsWith('chest'),small=key.startsWith('pickup')||key.startsWith('bullet')||key.startsWith('blade');
    const w=isPortal?84:isChest?76:small?40:64,h=isPortal?96:isChest?64:small?44:48,ox=w*.5,oy=isPortal?88:isChest?54:small?22:40;
    const canvas=this.makeCanvas();canvas.width=w*2;canvas.height=h*2;const c=canvas.getContext('2d');c.setTransform(2,0,0,2,ox*2,oy*2);c.lineJoin='round';c.lineCap='round';
    if(isPortal)portal(c,key==='portal:ruins'?2:key==='portal:marsh'?1:0);
    else if(isChest){const royal=key.includes(':royal:'),state=key.endsWith(':open')?'open':key.endsWith(':ready')?'ready':key.endsWith(':locked')?'locked':'closed';chest(c,royal,state);}
    else if(key.startsWith('crate'))crate(c,key==='crate:hit');
    else if(key.startsWith('mushroom'))mushroom(c,key==='mushroom:armed');
    else if(key.startsWith('pickup'))pickup(c,key.slice(7));
    else if(key.startsWith('bullet'))bullet(c,key==='bullet:bloom');
    else if(key.startsWith('blade'))blade(c,key==='blade:evolved');
    const pixels=canvas.width*canvas.height;
    while(this.pixels+pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}
    image={canvas,w,h,ox,oy,pixels};this.cache.set(key,image);this.pixels+=pixels;this.builds++;return image;
  }
  drawProp(c,prop,options=OPTIONS){
    let key,scale=1;
    if(prop.type==='portal')key=prop.nextRegion?.id==='marsh'?'portal:marsh':prop.nextRegion?.id==='ruins'?'portal:ruins':'portal:forest';
    else if(prop.type==='mushroom')key=prop.state==='armed'?'mushroom:armed':'mushroom:idle';
    else if(prop.type==='supply')key=prop.hit>0?'crate:hit':'crate:idle';
    else if(prop.type==='treasure'){
      const open=prop.state==='opened'||prop.state==='claimed',ready=prop.state==='unlocked'||prop.isDungeonTreasure&&prop.state!=='locked'&&!open,locked=prop.state==='locked'||prop.state==='active';
      if(prop.royal){scale=1.3;key=open?'chest:royal:open':ready?'chest:royal:ready':locked?'chest:royal:locked':'chest:royal:closed';}
      else key=open?'chest:ordinary:open':ready?'chest:ordinary:ready':locked?'chest:ordinary:locked':'chest:ordinary:closed';
    }else return false;
    const image=this._frame(key);c.drawImage(image.canvas,prop.x-image.ox*scale,prop.y-image.oy*scale,image.w*scale,image.h*scale);
    if((prop.state==='unlocked'||prop.isDungeonTreasure&&prop.state!=='locked'&&prop.state!=='claimed')&&!options.dense){
      const t=options.reduced?0:options.time||0;c.save();c.globalAlpha*=options.reduced?.65:.55+Math.sin(t*2.5)*.25;spark(c,prop.x+16*scale,prop.y-32*scale,2.1,prop.royal?'#f3daf7':'#fff0ae');spark(c,prop.x-11*scale,prop.y-35*scale,1.2,'#fff0cd');c.restore();
    }
    if(prop.type==='portal'&&!options.dense){const t=options.reduced?0:options.time||0;c.save();c.globalAlpha*=.45;for(let i=0;i<3;i++){const a=i*TAU/3+t*.25;spark(c,prop.x+Math.cos(a)*13,prop.y-39+Math.sin(a)*25,1.7,'#e2e6d0');}c.restore();}
    return true;
  }
  drawPickup(c,item,options=OPTIONS){
    const key=item.type==='herb'?'pickup:herb':item.type==='magnet'?'pickup:magnet':item.type==='fury'?'pickup:fury':null;if(!key)return false;
    const image=this._frame(key),bob=options.reduced?0:Math.sin((options.time||0)*2.2+(item.x*.019+item.y*.023))*1.6;
    c.drawImage(image.canvas,item.x-image.ox,item.y-9+bob-image.oy,image.w,image.h);
    if(!options.dense){c.save();c.globalAlpha*=.55;spark(c,item.x+9,item.y-19+bob,1.5,item.type==='herb'?'#d5e9ac':item.type==='magnet'?'#e7d7f6':'#ffe6aa');c.restore();}return true;
  }
  drawEnemyBullet(c,b,options=OPTIONS){
    const image=this._frame(b.type==='bloom'?'bullet:bloom':'bullet:spore'),s=(b.r||6)/6,dx=b.vx||0,dy=b.vy||0,d=Math.hypot(dx,dy)||1;
    // Filled, tapered toxic afterimage; the solid head remains the hit radius.
    if(!options.reduced){const nx=dx/d,ny=dy/d,len=options.dense?9:16;c.fillStyle=b.type==='bloom'?'#b47c9e4d':'#8a658e42';c.beginPath();c.moveTo(b.x-ny*s*3,b.y+nx*s*3);c.quadraticCurveTo(b.x-nx*len-ny*s*2,b.y-ny*len+nx*s*2,b.x-nx*(len+7),b.y-ny*(len+7));c.quadraticCurveTo(b.x-nx*len+ny*s*2,b.y-ny*len-nx*s*2,b.x+ny*s*3,b.y-nx*s*3);c.closePath();c.fill();}
    c.drawImage(image.canvas,b.x-image.ox*s,b.y-image.oy*s,image.w*s,image.h*s);return true;
  }
  drawBlade(c,b,options=OPTIONS){
    const evolved=!!b.evolved,image=this._frame(evolved?'blade:evolved':'blade:normal'),s=evolved?1.12:1;c.save();c.translate(b.x,b.y);c.rotate((b.angle||0)+(options.reduced?0:options.time||0));c.scale(s,s);c.drawImage(image.canvas,-image.ox,-image.oy,image.w,image.h);c.restore();return true;
  }
}
