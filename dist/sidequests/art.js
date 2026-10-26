import { PropArt } from '../prop-art.js';
const treasureArt=new PropArt();
// Small, grounded quest fixtures. All drawing stays in world units; no bitmap
// allocations, screen filters or per-frame geometry caches are needed.
const TAU=Math.PI*2;
const FURNITURE=new Set(['stage','seat','crate','bookcase','cargo']);
const FLOOR=new Set(['beam','water','trial-circle','footprints','fish-trail','stepping-stone','trail-marker','checkpoint','dock','stage','marker','cold']);
const DYNAMIC=new Set(['boat','beam','water','pottery','fire','vent','lantern','brazier','kiln','moon-moss','horn','book-box']);
const ink='#384738',wood='#957450',light='#d4bd83',stone='#8b977e',metal='#748c83';
function polygon(c,points,fill,stroke=ink){c.beginPath();for(let i=0;i<points.length;i++)c[i?'lineTo':'moveTo'](...points[i]);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
function line(c,x,y,a,b,color=ink,w=2){const previous=c.lineWidth;c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(a,b);c.stroke();c.lineWidth=previous;}
function oval(c,x,y,rx,ry,fill,stroke){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
function box(c,x,y,w,h,fill=wood){c.fillStyle=fill;c.fillRect(x,y-h,w,h);c.strokeStyle=ink;c.strokeRect(x,y-h,w,h);polygon(c,[[x,y-h],[x+6,y-h-5],[x+w+6,y-h-5],[x+w,y-h]],light);polygon(c,[[x+w,y],[x+w+6,y-5],[x+w+6,y-h-5],[x+w,y-h]],'#725b43');}
function planks(c,w=68,h=30){polygon(c,[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]],'#9a805a');for(let x=-w/2+12;x<w/2;x+=12)line(c,x,-h/2,x,h/2,'#67573d',1);line(c,-w/2+3,h/2-3,w/2-3,h/2-3,light,2);}
function flame(c,x,y,size=15){polygon(c,[[x-size*.7,y],[x-size*.5,y-size*.65],[x-size*.2,y-size*.5],[x,y-size*1.4],[x+size*.5,y-size*.5],[x+size*.6,y]],'#df9e55','#8b6039');polygon(c,[[x-size*.3,y],[x,y-size*.8],[x+size*.3,y]],'#f4d894',null);}
function fish(c,x,y){oval(c,x,y,9,4,'#93b3a4',ink);polygon(c,[[x-8,y],[x-15,y-5],[x-15,y+5]],'#7e9d92');oval(c,x+5,y-1,1,1,ink);}
function book(c,x,y,color='#9c6660'){box(c,x,y,9,18,color);line(c,x+2,y-12,x+7,y-12,light,1);}
function marker(c,p){line(c,0,0,0,-42,wood,5);polygon(c,[[0,-42],[26,-38],[21,-25],[0,-28]],p.state==='done'||p.state==='lit'?'#c3d592':'#b19464');line(c,-8,2,8,2,ink,3);}
function lamp(c,p){const on=!['dark','unlit','off'].includes(p.state)&&p.lit!==false;line(c,0,0,0,-28,wood,4);polygon(c,[[-10,-29],[-7,-44],[7,-44],[10,-29]],on?'#ecd18a':'#6d7465');polygon(c,[[-12,-44],[0,-51],[12,-44]],metal);line(c,-7,-28,7,-28,ink,3);if(on){c.globalAlpha*=.13;oval(c,0,0,Math.min(150,p.radius||p.warmRadius||66),Math.min(150,p.radius||p.warmRadius||66),'#f6dc88');}}
function gate(c,p){const a=p.a||{x:p.x-(p.width||64)/2,y:p.y},b=p.b||{x:p.x+(p.width||64)/2,y:p.y},dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,r=p.radius||p.r||8;
 const ax=a.x-p.x,ay=a.y-p.y,bx=b.x-p.x,by=b.y-p.y,open=p.open||p.state==='open'||p.state==='broken';
 if(p.questArt==='root-barrier'){if(!open){line(c,ax,ay,bx,by,'#4c5f3c',r*2);line(c,ax,ay-2,bx,by-2,'#8d9560',r);for(let t=.1;t<1;t+=Math.min(.25,24/len)){const x=ax+dx*t,y=ay+dy*t;line(c,x-6,y-9,x+8,y+5,'#6e7950',3);}}return;}
 // Rails are projected above the exact collision segment, never rotated in
 // screen space (which would turn vertical gates into flat ground drawings).
 for(const [x,y]of [[ax,ay],[bx,by]]){oval(c,x,y,r,r*.62,'#6e7357');box(c,x-r*.65,y,r*1.3,26,wood);}
 if(open){line(c,ax,ay-12,ax+dx*.13,ay-12+dy*.13,wood,5);return;}
 for(const z of [7,21]){line(c,ax,ay-z,bx,by-z,ink,r+2);line(c,ax,ay-z,bx,by-z,p.questArt==='casting'||p.questArt==='cast-metal'?metal:wood,Math.max(3,r-1));}
 for(let t=.14;t<1;t+=Math.min(.3,22/len))line(c,ax+dx*t,ay+dy*t-25,ax+dx*t,ay+dy*t-3,light,2);
 if(p.state==='cracked')line(c,0,-22,-7,-10,'#293a35',3);
}
function furnitureGate(c,p){
 const dx=p.b.x-p.a.x,dy=p.b.y-p.a.y,len=Math.hypot(dx,dy),r=p.radius||p.r||12,angle=Math.atan2(dy,dx),k=p.questArt;
 c.save();c.rotate(angle);c.beginPath();c.roundRect(-len/2-r,-r,len+2*r,r*2,r);c.fillStyle=k==='crate'?'#977a52':'#a48c60';c.fill();c.strokeStyle=ink;c.stroke();c.save();c.clip();
 for(let x=-len/2-r+10;x<len/2+r;x+=12)line(c,x,-r,x,r,'#766344',1);
 for(const y of [-r+4,r-4])line(c,-len/2,y,len/2,y,light,2);
 if(k==='crate'||k==='cargo'){for(let x=-len/2;x<len/2;x+=32){line(c,x,-r+3,Math.min(len/2,x+28),r-3,light,3);line(c,x,r-3,Math.min(len/2,x+28),-r+3,light,3);}}
 c.restore();c.restore();
 if(k==='bookcase'){const width=len+2*r;box(c,-width/2+3,4,width-6,58);for(let row=0;row<2;row++){for(let x=-width/2+8;x<width/2-10;x+=11)book(c,x,-6-row*25,(Math.round(x)%2?'#9c6660':'#668777'));line(c,-width/2+4,-4-row*25,width/2-3,-4-row*25,light,3);}}
 if(k==='cargo'){const width=len+2*r;box(c,-width/2+3,4,width-6,28);line(c,-width/2+7,-20,width/2-6,0,light,3);line(c,-width/2+7,0,width/2-6,-20,light,3);}
 if(k==='stage'){
  const ax=p.a.x-p.x,ay=p.a.y-p.y,bx=p.b.x-p.x,by=p.b.y-p.y;
  line(c,ax,ay-r,ax,ay-r-38,wood,4);line(c,bx,by-r,bx,by-r-38,wood,4);line(c,ax,ay-r-38,bx,by-r-38,light,1.5);
  for(let t=.12;t<1;t+=.18){const x=ax+dx*t,y=ay+dy*t-r-38;polygon(c,[[x-5,y],[x+6,y],[x,y+11]],'#a7785e');}
 }
}
export function sideQuestSceneProps(props=[]){return props.filter(p=>!p.hidden).flatMap(p=>{
 if(p.kind!=='questSceneProp')return [p];
 // Long diagonal rails participate in ordinary depth sorting section by
 // section. The unmodified manager prop still owns the single collision gate.
 if(p.a&&p.b&&!FURNITURE.has(p.questArt)&&!p.open&&!['open','broken'].includes(p.state)){
  const dx=p.b.x-p.a.x,dy=p.b.y-p.a.y,count=Math.max(1,Math.ceil(Math.hypot(dx,dy)/48));
  return Array.from({length:count},(_,i)=>{const a={x:p.a.x+dx*i/count,y:p.a.y+dy*i/count},b={x:p.a.x+dx*(i+1)/count,y:p.a.y+dy*(i+1)/count};return {...p,id:`${p.id}:art-${i}`,a,b,x:(a.x+b.x)/2,y:(a.y+b.y)/2,sortY:(a.y+b.y)/2,width:Math.hypot(dx,dy)/count};});
 }
 return [{...p,sortY:p.sortY??p.y,...(p.floor||FLOOR.has(p.questArt)?{renderLayer:'ground'}:{})}];
});}
export function sideQuestPropInView(p,x,y,w,h){const reach=Math.max(70,p.width/2||0,p.radius||0,p.length||0,p.range||0);return Math.abs(p.x-x)<w/2+reach&&Math.abs(p.y-y)<h/2+Math.max(112,reach);}
export function sideQuestCastsStaticShadow(p){return p.kind!=='questSceneProp'||!(p.dynamic||p.castsShadow===false||p.floor||FLOOR.has(p.questArt)||DYNAMIC.has(p.questArt));}
export function drawSideQuestShadowPath(c,p,sun={x:-.4,y:.8}){
 if(p.kind!=='questSceneProp')return false;if(!sideQuestCastsStaticShadow(p))return true;
 if(p.a&&p.b){const r=p.radius||8;for(const end of p.open?[p.a,p.b]:[p.a,p.b,{x:p.x,y:p.y}]){c.moveTo(end.x+r,end.y);c.ellipse(end.x+sun.x*10,end.y+sun.y*10,r+2,14,0,0,TAU);}return true;}
 const w=Math.min(55,(p.width||32)/2),len=24;c.moveTo(p.x-w,p.y);c.lineTo(p.x+w,p.y);c.lineTo(p.x+w+sun.x*len,p.y+sun.y*len);c.lineTo(p.x-w+sun.x*len,p.y+sun.y*len);c.closePath();return true;
}
export function drawSideQuestProp(c,p,{time=0}={}){
 if(p.kind!=='questSceneProp')return false;if(p.hidden)return true;c.save();c.translate(p.x,p.y);c.lineJoin='round';c.lineCap='round';c.lineWidth=1.7;
 const k=p.questArt,on=!['dark','unlit','off','spent','idle','closed'].includes(p.state),w=p.width||72,h=p.height||38;
 if(p.a&&p.b&&FURNITURE.has(k)){furnitureGate(c,p);}
 else if(p.a&&p.b){gate(c,p);}
 else if(k==='chest'){treasureArt.drawProp(c,{type:'treasure',x:0,y:0,state:p.state==='claimed'?'claimed':'unlocked'},{reduced:true});}
 else if(k==='marker'){const r=p.radius||20;c.globalAlpha=p.state==='lit'?.7:.35;c.strokeStyle='#b9dbcc';c.lineWidth=2;for(const rr of [r*.55,r]){c.beginPath();c.arc(0,0,rr,-2.5,2.5);c.stroke();}}
 else if(k==='cold'){const r=Math.min(370,p.radius||100);c.globalAlpha=.22;for(let i=0;i<7;i++){const y=(i-3)*r/4,x=(i%2?-.3:.15)*r;c.strokeStyle='#d9e9dc';c.lineWidth=2;c.beginPath();c.moveTo(x-35,y);c.quadraticCurveTo(x,y-10,x+35,y);c.stroke();}}
 else if(['gate','fence','casting','cast-metal'].includes(k)){gate(c,p);}
 else if(k==='beam'){
   const pts=p.points||null,length=Math.min(700,p.length||p.range||240),angle=p.angle||0,half=p.beamWidth||p.width||25;c.globalAlpha=.15;c.fillStyle=p.color||'#e9dca0';
   if(pts?.length>1){c.beginPath();pts.forEach((pt,i)=>c[i?'lineTo':'moveTo'](pt.x-p.x,pt.y-p.y));c.lineWidth=half;c.strokeStyle=p.color||'#e9dca0';c.stroke();}
   else{c.rotate(angle);polygon(c,[[0,-4],[length,-half/2],[length,half/2],[0,4]],p.color||'#e9dca0',null);line(c,0,0,length,0,'#fff1b5',2);c.globalAlpha=p.linked?.65:.35;oval(c,length,0,7,7,p.linked?'#d9efc1':null,p.color||'#e9dca0');}
 }else if(k==='water'){
   c.globalAlpha=p.opacity??.4;const pts=p.points||p.polygon;if(pts?.length)polygon(c,pts.map(pt=>[pt.x-p.x,pt.y-p.y]),'#5598a2','#86c3bc');else polygon(c,[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]],'#5598a2','#86c3bc');for(let x=-w/2+16;x<w/2;x+=44)line(c,x,-3,x+18,-3,'#b0d9c9',1);
 }else if(['footprints','fish-trail'].includes(k)){
   const pts=p.points||[{x:p.x-13,y:p.y+5},{x:p.x,y:p.y-5},{x:p.x+14,y:p.y+3}];c.globalAlpha=.6;for(const pt of pts){oval(c,pt.x-p.x,pt.y-p.y,3,5,'#6a7054');}
 }else if(k==='trial-circle'){
   const r=p.radius||p.r||70;c.globalAlpha=.6;c.strokeStyle='#52664d';c.lineWidth=4;c.beginPath();c.ellipse(0,0,r,r,0,0,TAU);c.stroke();c.strokeStyle=on?'#d4d7a5':'#9baa87';c.lineWidth=2;c.stroke();for(let i=0;i<8;i++){const a=i*TAU/8;polygon(c,[[Math.cos(a)*(r-6),Math.sin(a)*(r-6)],[Math.cos(a+.04)*(r+3),Math.sin(a+.04)*(r+3)],[Math.cos(a-.04)*(r+3),Math.sin(a-.04)*(r+3)]],light,null);}
 }else if(['trail-marker','checkpoint','finish-post','banner','camp'].includes(k)){marker(c,p);if(k==='camp'){box(c,-26,5,20,18);planks(c,43,12);}}
 else if(['route-sign','signpost'].includes(k)){line(c,0,2,0,-50,wood,6);for(const [y,dir]of [[-44,1],[-25,-1]])polygon(c,[[-21,y-6],[19,y-6],[26,y],[19,y+6],[-21,y+6]].map(([x,z])=>[x*dir,z]),light);}
 else if(['dock','stage'].includes(k)){c.rotate(p.angle||0);planks(c,w,h);if(k==='stage'){line(c,-w/2,-h/2,-w/2,-h/2-40,wood,5);line(c,w/2,-h/2,w/2,-h/2-40,wood,5);line(c,-w/2,-h/2-40,w/2,-h/2-40,light,2);for(let x=-w/2+5;x<w/2;x+=20)polygon(c,[[x,-h/2-39],[x+12,-h/2-39],[x+6,-h/2-27]],'#a46d5b');}}
 else if(k==='boat'){c.rotate(p.angle||0);oval(c,0,7,45,18,'#284d4638');polygon(c,[[-44,0],[-27,-18],[29,-18],[48,0],[27,18],[-27,18]],'#a17a50');polygon(c,[[-34,0],[-23,-11],[25,-11],[36,0],[24,11],[-24,11]],'#524f3b');for(const x of [-19,12])line(c,x,-12,x,12,light,7);line(c,-28,23,25,-22,wood,4);}
 else if(['crate','cargo','stolen-bag','book-box'].includes(k)){if(k==='stolen-bag'){polygon(c,[[-14,0],[-18,-17],[-8,-29],[9,-29],[18,-15],[13,1]],'#a78e61');line(c,-8,-25,9,-25,light,3);}else{box(c,-18,4,32,28);line(c,-15,-21,10,1,light,3);line(c,-15,1,10,-21,light,3);if(k==='book-box')book(c,-5,-24);}}
 else if(['books','book','bookcase','bookstall','shelf','stall'].includes(k)){if(k==='book'||k==='books'){book(c,-9,0);book(c,3,-4,'#617c70');}else{box(c,-34,3,63,36);for(let row=0;row<2;row++){for(let x=-28;x<25;x+=12)book(c,x,-4-row*22,['#a56c5e','#6e8a78','#b49d67'][Math.floor((x+28)/12)%3]);line(c,-32,-3-row*22,29,-3-row*22,light,3);}if(k==='stall'||k==='bookstall')polygon(c,[[-43,-58],[0,-73],[42,-58],[34,-47],[-35,-47]],'#9a6656');}}
 else if(['bell','memorial','oath-stone'].includes(k)){if(k==='bell'){line(c,-16,1,-16,-47,wood,5);line(c,16,1,16,-47,wood,5);line(c,-20,-47,20,-47,light,5);c.save();c.translate(0,-43);c.rotate(p.state==='active'?Math.sin(time*7)*.18:0);polygon(c,[[-4,2],[-10,10],[-10,23],[-15,26],[15,26],[10,23],[10,10],[4,2]],'#c3a965');oval(c,0,27,15,3,'#81704a',ink);oval(c,0,30,3,3,light);c.restore();}else{polygon(c,[[-22,4],[-22,-34],[-11,-45],[14,-43],[23,-29],[20,4]],stone);polygon(c,[[-22,-34],[-11,-45],[14,-43],[10,-33]],'#b4bca3',null);for(let y=-27;y<-5;y+=7)line(c,-10,y,11,y,p.state==='named'?light:'#596e63',2);if(k==='memorial'){oval(c,-25,5,7,3,'#a5b878');oval(c,25,3,5,3,'#dac79a');}}}
 else if(['feed-rack','fish-rack'].includes(k)){for(const x of [-25,25]){line(c,x,1,x,-41,wood,5);line(c,x,1,x+7,5,wood,3);}line(c,-30,-40,30,-40,light,4);if(k==='feed-rack'){box(c,-23,0,44,15);for(let x=-20;x<=18;x+=6){line(c,x,-14,x-5,-29,'#afbc75',3);line(c,x,-14,x+4,-25,'#d4c891',2);}}else if(p.state!=='taken'&&p.state!=='empty')for(const x of [-15,5,20]){line(c,x,-39,x,-17,'#c4b892',1);c.save();c.translate(x,-20);c.rotate(Math.PI/2);fish(c,0,0);c.restore();}line(c,-25,-9,25,-9,wood,3);}
 else if(k==='feeding-bowl'){oval(c,0,1,18,9,'#725d41',ink);oval(c,0,-3,18,7,'#b49c68',ink);if(p.state!=='empty')fish(c,3,-4);}
 else if(k==='burrow'){oval(c,0,0,27,16,'#8f9470',ink);oval(c,0,0,18,11,'#394f3c');for(const x of [-22,20])line(c,x,0,x-4,-16,'#768b52',3);}
 else if(k==='lever'||k==='valve'){box(c,-13,4,26,13,stone);const angle=p.angle??(p.state==='active'?-.6:.6);if(k==='lever'){line(c,0,-7,Math.sin(angle)*19,-7-Math.cos(angle)*27,metal,5);oval(c,Math.sin(angle)*19,-7-Math.cos(angle)*27,6,5,light,ink);}else{c.save();c.translate(0,-20);c.rotate(angle);oval(c,0,0,15,12,null,metal);for(let i=0;i<4;i++){const a=i*TAU/4;line(c,0,0,Math.cos(a)*15,Math.sin(a)*12,metal,3);}c.restore();}}
 else if(k==='hatch'){planks(c,w,h);line(c,-w/2+5,-h/2+5,w/2-5,-h/2+5,metal,4);if(p.state==='open')polygon(c,[[-w/2+6,-h/2+8],[w/2-6,-h/2+8],[w/2-6,h/2-4],[-w/2+6,h/2-4]],'#2f433c');else oval(c,0,3,8,4,null,metal);}
 else if(k==='seat'){box(c,-20,0,40,10);for(const x of [-17,17])line(c,x,0,x,10,wood,4);}
 else if(['lantern','beacon'].includes(k)){if(k==='beacon'){box(c,-15,0,30,32,stone);c.translate(0,-29);}lamp(c,p);}
 else if(['brazier','fire','kiln','vent'].includes(k)){if(k==='kiln'){box(c,9,-38,12,26,'#a99173');c.beginPath();c.moveTo(-28,3);c.lineTo(-29,-23);c.quadraticCurveTo(-27,-49,0,-50);c.quadraticCurveTo(27,-49,29,-23);c.lineTo(27,3);c.closePath();c.fillStyle='#a78965';c.fill();c.strokeStyle=ink;c.stroke();c.save();c.clip();for(const y of [-35,-23,-11]){line(c,-29,y,29,y,'#776a50',1);for(const x of y===-23?[-20,2,22]:[-10,13])line(c,x,y,x,y+12,'#776a50',1);}c.restore();oval(c,0,-10,18,20,'#c1ab7d',ink);oval(c,0,-8,13,16,'#414b3c',ink);line(c,-29,3,28,3,light,3);}else if(k==='vent'){oval(c,0,0,25,14,stone,ink);for(let x=-15;x<=15;x+=7)line(c,x,-7,x,6,ink,3);}else{for(const x of [-15,15])line(c,x,-5,x*1.3,6,metal,3);polygon(c,[[-22,-15],[-14,-3],[14,-3],[22,-15]],metal);}if(on){flame(c,0,k==='kiln'?-3:-12,16);if(k==='brazier'){c.globalAlpha=.12;oval(c,0,0,Math.min(160,p.radius||p.warmRadius||92),Math.min(160,p.radius||p.warmRadius||92),'#f0c785');}}if(Number.isFinite(p.heat)){line(c,-20,10,20,10,ink,4);line(c,-20,10,-20+40*Math.max(0,Math.min(1,p.heat)),10,'#e0ab62',3);}}
 else if(k==='pottery'){const color=p.state==='ruined'?'#706e62':p.state==='glowing'?'#d2945e':p.state==='fired'?'#ad775e':'#9d9479';polygon(c,[[-11,0],[-17,-12],[-13,-24],[-7,-28],[-8,-34],[8,-34],[7,-28],[13,-24],[17,-12],[11,0]],color);oval(c,0,-34,8,3,'#504d3c',ink);line(c,-12,-16,13,-16,light,2);if(p.state==='ruined')line(c,0,-29,-7,-6,ink,2);}
 else if(k==='horn'){box(c,-13,3,26,15,stone);c.translate(0,-12);c.rotate(p.angle||0);polygon(c,[[-8,-5],[12,-7],[31,-18],[31,18],[12,7],[-8,5]],'#baa26a');oval(c,31,0,5,18,'#675e46',ink);for(const x of [42,52]){c.strokeStyle='#d5d5a4';c.globalAlpha=.5;c.beginPath();c.arc(x,0,12,-.6,.6);c.stroke();}}
 else if(k==='moon-moss'){for(let i=0;i<5;i++){const x=(i-2)*9,y=(i%2)*4;oval(c,x,y,10,5,'#709d7b');if(p.state!=='harvested'){line(c,x,y,x-2,y-12,'#8eae88',2);oval(c,x-2,y-14,4,3,p.state==='blooming'?'#e4e3b5':'#91b9a2');}}}
 else if(k==='stepping-stone'){c.globalAlpha=on?.85:.22;polygon(c,[[-18,-8],[-5,-14],[17,-8],[20,5],[6,13],[-17,9]],on?'#b7c6a0':'#778c7c');line(c,-10,-4,9,-6,'#d6d6ab',2);}
 else {box(c,-14,3,28,23,stone);line(c,-6,-9,6,-9,light,2);}
 if(k==='kiln'&&p.label){c.font='600 9px system-ui,sans-serif';c.textAlign='center';c.fillStyle='#eee4bd';c.strokeStyle=ink;c.lineWidth=3;c.strokeText(p.label,0,24);c.fillText(p.label,0,24);}
 c.restore();return true;
}
export function drawSideQuestAnimal(c,e,{time=0}={}){
 const deer=e.sideQuestAnimal==='deer',facing=e.facing||0,dir=Math.cos(facing)>=0?1:-1,moving=e.moving||e.moveMode==='move'||e.pose?.moving;c.save();c.scale(dir,1);c.lineWidth=1.7;c.lineJoin='round';
 const gait=moving?Math.sin(time*9)*3:0;
 if(deer){for(const [x,phase]of [[-14,1],[-6,-1],[8,-1],[15,1]])line(c,x,-13,x+gait*phase,0,'#6d6249',4);oval(c,0,-22,23,13,'#ac946c',ink);oval(c,-4,-25,13,7,'#c7b186');polygon(c,[[10,-25],[15,-46],[25,-45],[28,-27]],'#b49b70');oval(c,25,-42,13,8,'#bca377',ink);polygon(c,[[16,-47],[10,-57],[24,-52]],'#bca377');polygon(c,[[28,-48],[34,-55],[35,-44]],'#bca377');oval(c,31,-44,2,2,ink);oval(c,36,-40,3,2,ink);for(const [x,y]of [[-12,-27],[0,-23],[8,-29]])oval(c,x,y,2,2,'#e0cf9f');}
 else{polygon(c,[[-20,-7],[-37,-4],[-44,-7],[-30,-13],[-17,-16]],'#816f53');oval(c,-2,-12,24,12,'#89765a',ink);oval(c,19,-18,14,12,'#a5916b',ink);oval(c,17,-9,9,5,'#cfbc90');oval(c,13,-29,4,4,'#89765a',ink);oval(c,28,-28,4,4,'#89765a',ink);oval(c,24,-21,2,2,ink);oval(c,32,-16,3,2,ink);for(const x of [-12,14])oval(c,x+gait,-1,7,3,'#6d624d',ink);line(c,27,-13,38,-10,light,1);}
 c.restore();return true;
}
