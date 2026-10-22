// Raised ruin scenery uses the same ground capsule as movement. Height is
// projected up the screen, independently of the orientation of that capsule.
export const RUINS_PALETTE=Object.freeze({ink:'#555d50',stone:'#b3b29b',light:'#ddd7ba',face:'#aaa991',shade:'#818a77',deep:'#626f60',moss:'#7d955e',mossLight:'#a4b779'});
const TAU=Math.PI*2,LIMIT=12*1024*1024,seedOf=p=>Math.floor(Math.abs(p.seed||0)*4)%4;
const hash=(x,y=0)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
function poly(c,points,color,stroke,width=1.2){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(color){c.fillStyle=color;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function oval(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fillStyle=color;c.fill();}
function size(p){const d=p.depth||p.r*2||36,w=p.width||((p.halfLength||0)*2+d),h=p.height||({wall:55,column:88,plinth:28,rubble:34}[p.ruinsKind]||45);return {w,d,h,a:p.angle||0};}
function capsule(p,inset=0){const {w,d,a}=size(p),r=Math.max(1,d/2-inset),half=Math.max(0,(w-d)/2),out=[];for(const [cx,start]of[[half,-Math.PI/2],[-half,Math.PI/2]])for(let i=0;i<=4;i++){const angle=start+i*Math.PI/4,x=cx+Math.cos(angle)*r,y=Math.sin(angle)*r;out.push([x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)]);}return out;}
function stone(c,foot,h,seed){
  const P=RUINS_PALETTE,top=foot.map(([x,y],i)=>[x,y-h*(.93+hash(seed+i,27)*.1)]);
  for(let i=0;i<foot.length;i++){const j=(i+1)%foot.length,a=foot[i],b=foot[j];if(b[0]-a[0]>0)continue;poly(c,[a,b,top[j],top[i]],i%3===0?P.shade:P.face,P.ink,.9);}
  poly(c,top,P.stone,P.ink,1.15);line(c,top.slice(0,Math.ceil(top.length/2)),P.light,1.3);
  const minX=Math.min(...top.map(p=>p[0])),maxX=Math.max(...top.map(p=>p[0])),minY=Math.min(...top.map(p=>p[1])),maxY=Math.max(...top.map(p=>p[1]));
  c.save();poly(c,top);c.clip();for(let i=0;i<12;i++){const x=minX+hash(seed+i,7)*(maxX-minX),y=minY+hash(seed+i,13)*(maxY-minY);line(c,[[x,y],[x+3+hash(seed+i,9)*7,y-1]],i%4? '#737d683d':'#f0e8cc78',.8);}c.restore();
  return top;
}
function masonry(c,p){
  const {w,d,h,a}=size(p),s=seedOf(p),P=RUINS_PALETTE,axis=[Math.cos(a),Math.sin(a)],normal=[-axis[1],axis[0]],half=Math.max(0,(w-d)/2);
  const foot=capsule(p),top=stone(c,foot,h,s*41);
  // Staggered courses run across the vertical faces, not over the top plane.
  c.save();poly(c,[...foot,...top.slice().reverse()]);c.clip();
  const rows=Math.max(2,Math.round(h/15));for(let row=1;row<rows;row++){
    const yy=-h*row/rows,extent=Math.abs(Math.cos(a))*w/2+Math.abs(Math.sin(a))*d/2;
    line(c,[[-extent,yy],[extent,yy]],'#64705b88',1.1);line(c,[[-extent,yy+1.5],[extent,yy+1.5]],'#e3dec03d',.7);
    for(let x=-extent+(row%2)*18;x<extent;x+=35)line(c,[[x,yy],[x+1,yy+h/rows]],'#64705b66',.8);
  }c.restore();
  for(let i=0;i<3;i++){const t=(i-1)*half*.55,x=axis[0]*t+normal[0]*d*.22,y=axis[1]*t+normal[1]*d*.22-h*(.94+hash(s+i,8)*.04);oval(c,x,y,7+hash(s+i,2)*5,3,P.moss);line(c,[[x-3,y],[x+5,y-1]],P.mossLight,1);}
  // Broken top corner: a recessed notch with a small lit fracture lip.
  const x=top[2][0],y=top[2][1];poly(c,[[x-9,y],[x-2,y+7],[x+5,y+2]],P.shade);line(c,[[x-9,y-1],[x-2,y+5]],P.light,1);
}
function column(c,p){
  const {w,d,h}=size(p),P=RUINS_PALETTE,s=seedOf(p),foot=capsule(p),baseHeight=Math.min(9,h*.17);
  stone(c,foot,baseHeight,s*13);
  const shaft=capsule({...p,width:w*.76,depth:d*.76},0).map(([x,y])=>[x,y-baseHeight*.7]);
  const top=stone(c,shaft,h-baseHeight,s*37+3),minX=Math.min(...shaft.map(p=>p[0])),maxX=Math.max(...shaft.map(p=>p[0]));
  for(let i=1;i<4;i++){const x=minX+(maxX-minX)*i/4;line(c,[[x,-h+12],[x,-baseHeight-3]],i===1?'#ded8b879':'#69765f66',1.2);}
  line(c,[[maxX*.15,-h*.64],[maxX*.15+5,-h*.59],[maxX*.07,-h*.43]],P.deep,1.3);
  if(s%2===0){const t=top[Math.floor(top.length/2)];poly(c,[[t[0]-8,t[1]-1],[t[0]+3,t[1]+6],[t[0]+9,t[1]-2]],P.shade);}
  oval(c,-w*.13,d*.13-baseHeight,w*.26,3.5,P.moss);line(c,[[-w*.27,-baseHeight],[0,-baseHeight-1]],P.mossLight,1);
}
function plinth(c,p){
  const {w,d,h}=size(p),P=RUINS_PALETTE;stone(c,capsule(p),h*.34,seedOf(p)*7);stone(c,capsule({...p,width:w*.82,depth:d*.78}).map(([x,y])=>[x,y-h*.27]),h*.7,seedOf(p)*31);
  const y=-h*.93;line(c,[[-w*.22,y],[w*.16,y+1]],P.shade,2);line(c,[[-w*.14,y-2],[w*.2,y-1]],P.light,1);
  oval(c,w*.27,-h*.35,d*.15,3,P.moss);
}
function rubble(c,p){
  const {w,d,h,a}=size(p),s=seedOf(p),count=w>d*1.8?5:3,foot=capsule(p);poly(c,foot,'#9aa387');
  const blocks=[];for(let i=0;i<count;i++){
    const along=(i/(count-1)-.5)*Math.max(0,w-d*.65),across=(hash(i,s+23)-.5)*d*.34,r=d*(.31+hash(i,s+7)*.1),cx=along*Math.cos(a)-across*Math.sin(a),cy=along*Math.sin(a)+across*Math.cos(a);
    blocks.push({x:cx,y:cy,r,h:h*(.46+hash(i,s+17)*.5),seed:s*13+i});
  }
  blocks.sort((a,b)=>a.y-b.y);for(const b of blocks){
    const {x,y,r,h,seed}=b,j=hash(seed,11),pts=[[x-r,y-r*.08],[x-r*.78,y-h*.65],[x-r*.25,y-h],[x+r*.5,y-h*(.7+j*.18)],[x+r,y-h*.3],[x+r*.84,y+r*.38],[x+r*.15,y+r*.54],[x-r*.76,y+r*.34]];
    poly(c,pts,'#a8af94',RUINS_PALETTE.ink,1);poly(c,[pts[1],pts[2],pts[3],[x+r*.18,y-h*.27],pts[0]],'#c6c7ab');poly(c,[pts[3],pts[4],pts[5],pts[6],[x+r*.18,y-h*.27]],'#89977d');poly(c,[pts[0],[x+r*.18,y-h*.27],pts[6],pts[7]],'#a3ad90');line(c,pts.slice(1,4),'#e0dabe',1);line(c,[[x-r*.25,y-h*.64],[x-r*.1,y-h*.33],[x-r*.25,y-h*.1]],'#73876a88',.8);
  }
  for(let i=0;i<4;i++){const t=(i-1.5)/4,x=Math.cos(a)*t*w,y=Math.sin(a)*t*w+d*.29;poly(c,[[x-3,y],[x+2,y-2],[x+5,y+2],[x-1,y+3]],i%2?'#b6bd9c':'#7e9668');}
}
export function ruinsVisual(prop){
  if(prop?.variant!=='ruins-native')return null;const {w,d,h,a}=size(prop),x=Math.abs(Math.cos(a))*w/2+Math.abs(Math.sin(a))*d/2,y=Math.abs(Math.sin(a))*w/2+Math.abs(Math.cos(a))*d/2;
  return {halfWidth:x+7,top:y+h+8,bottom:y+5,shadowWidth:x*.86,shadowLength:h*.3+8,shadowOffset:h*.15+3};
}
export class RuinsPropArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.bytes=0;this.builds=0;}
  get cacheStats(){return {entries:this.cache.size,bytes:this.bytes,pixels:this.bytes/4,limitBytes:LIMIT,builds:this.builds};}
  clear(){for(const {canvas}of this.cache.values())canvas.width=canvas.height=0;this.cache.clear();this.bytes=0;}
  drawProp(c,p,{player=null,footY=null,canopyAlpha=1}={}){
    const v=ruinsVisual(p);if(!v)return false;const {w,d,h,a}=size(p),key=[p.ruinsKind,w,d,h,a,seedOf(p)].join(':');let image=this.cache.get(key);
    if(!image){const canvas=this.makeCanvas(),width=Math.ceil(v.halfWidth*2),height=Math.ceil(v.top+v.bottom);canvas.width=width*2;canvas.height=height*2;const paint=canvas.getContext('2d');paint.setTransform(2,0,0,2,width,v.top*2);paint.lineJoin='round';paint.lineCap='round';({wall:masonry,column,plinth,rubble}[p.ruinsKind]||rubble)(paint,p);image={canvas,width,height,bytes:canvas.width*canvas.height*4,top:v.top};while(this.bytes+image.bytes>LIMIT&&this.cache.size){const id=this.cache.keys().next().value;this.bytes-=this.cache.get(id).bytes;this.cache.delete(id);}this.cache.set(key,image);this.bytes+=image.bytes;this.builds++;}else{this.cache.delete(key);this.cache.set(key,image);}
    c.save();const behind=player&&Number.isFinite(footY)&&Math.abs(player.x-p.x)<v.halfWidth+12&&footY<p.y+v.bottom&&footY>p.y-v.top-24;c.globalAlpha*=behind?.42:canopyAlpha;c.drawImage(image.canvas,p.x-image.width/2,p.y-image.top,image.width,image.height);c.restore();return true;
  }
}
let shared;
export const drawRuinsProp=(c,p,options)=>{if(p?.variant!=='ruins-native')return false;return(shared??=new RuinsPropArt()).drawProp(c,p,options);};
export function clearRuinsArtCache(){shared?.clear();}

export function drawRuinsLandmark(c,site){
  if(site?.artTheme!=='ruins'||site.kind!=='cave')return false;const P=RUINS_PALETTE;c.save();c.translate(site.x,site.y);c.lineJoin='round';c.lineCap='round';
  // The stair threshold stays on the existing interaction point. Broken
  // piers frame it without adding an invisible doorway-sized collider.
  oval(c,0,7,60,18,'#4d5d4140');
  poly(c,[[-31,9],[-31,-37],[-20,-52],[20,-52],[31,-37],[31,9]],'#283c35',P.ink,2);
  for(let row=0;row<5;row++){const y=-10+row*6,w=38+row*5;poly(c,[[-w/2,y],[w/2,y],[w/2+2,y+6],[-w/2-2,y+6]],['#777f68','#899178','#a0a58b','#b6b89a','#c6c5a7'][row]);line(c,[[-w/2,y],[w/2,y]],'#d5d3b5',1);line(c,[[-w/2,y+5],[w/2,y+5]],'#64735d',1);}
  for(const sign of[-1,1]){
    const x=sign*43;stone(c,[[x-11,-9],[x+11,-9],[x+13,13],[x-13,13]],50,sign+8);
    for(let row=0;row<3;row++)line(c,[[x-10,-7-row*13],[x+10,-7-row*13]],'#65735b88',1);
    stone(c,[[x-15,-8],[x+14,-8],[x+14,7],[x-15,7]].map(([xx,yy])=>[xx,yy-47]),8,sign+19);
  }
  const crown=[[-58,-48],[-47,-66],[-23,-68],[-17,-77],[18,-76],[24,-68],[48,-65],[58,-49]];
  poly(c,crown,P.stone,P.ink,1.6);line(c,crown.slice(0,6),P.light,1.4);
  for(const x of[-35,-12,14,36])line(c,[[x,-64],[x+3,-51]],'#7e89716b',1);
  line(c,[[-6,-67],[1,-72],[7,-66],[0,-59],[-6,-67]],'#6c8770',1.6);
  oval(c,-46,-49,12,4,P.moss);oval(c,40,10,12,4,P.moss);line(c,[[-52,-50],[-40,-51]],P.mossLight,1.5);
  c.restore();return true;
}
