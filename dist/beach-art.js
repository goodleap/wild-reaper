// Coastal props retain the movement system's ground capsule; visual height
// rises vertically on screen regardless of the footing's orientation.
export const BEACH_PALETTE=Object.freeze({ink:'#536b61',rock:'#a9b4a0',rockLight:'#d7d6bc',rockDark:'#788d80',wet:'#547f78',wood:'#b3a078',woodLight:'#ddd0a4',woodDark:'#776e52',rope:'#d4c99a'});
const TAU=Math.PI*2,LIMIT=12*1024*1024,SPRITE_SCALE=1.5;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const variant=p=>Math.floor(Math.abs(p.seed||0)*4)%4;
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
function poly(c,points,color,stroke,width=1.2){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(color){c.fillStyle=color;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function oval(c,x,y,rx,ry,color,stroke){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
function sizes(p){const d=p.depth||p.r*2||36,w=p.width||((p.halfLength||0)*2+d),h=p.height||({rock:43,reef:34,driftwood:17,post:52,crate:37}[p.beachKind]||35);return{w,d,h:h*(['rock','reef'].includes(p.beachKind)?.67:1),a:p.angle||0};}
function rotate(x,y,a){return[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];}
function footing(p){const{w,d,a}=sizes(p),r=d/2,half=Math.max(0,(w-d)/2),points=[];for(const[cx,start]of[[half,-Math.PI/2],[-half,Math.PI/2]])for(let j=0;j<=5;j++){const t=start+j*Math.PI/5;points.push(rotate(cx+Math.cos(t)*r,Math.sin(t)*r,a));}return points;}
function smoothShape(c,points){c.beginPath();const last=points.at(-1),first=points[0];c.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);for(let i=0;i<points.length;i++){const p=points[i],next=points[(i+1)%points.length];c.quadraticCurveTo(p[0],p[1],(p[0]+next[0])/2,(p[1]+next[1])/2);}c.closePath();}
function boulder(c,x,y,w,d,height,seed){
  const P=BEACH_PALETTE,h=height,j=hash(seed,23),points=[[x-w*.5,y-d*.09],[x-w*.46,y-h*.64],[x-w*(.21+j*.08),y-h*.97],[x+w*.19,y-h*(.82+j*.14)],[x+w*.44,y-h*.49],[x+w*.5,y+d*.16],[x+w*.24,y+d*.45],[x-w*.18,y+d*.48],[x-w*.46,y+d*.26]];
  smoothShape(c,points);c.fillStyle=P.rock;c.fill();c.strokeStyle=P.ink;c.lineWidth=1.3;c.stroke();
  c.save();smoothShape(c,points);c.clip();
  const top=[points[0],points[1],points[2],points[3],[x+w*.31,y-h*.38],[x+w*.04,y-h*.13],[x-w*.18,y-h*.04]];smoothShape(c,top);c.fillStyle=P.rockLight;c.fill();
  const side=[[x+w*.19,y-h*.8],points[4],points[5],points[6],points[7],[x+w*.06,y+d*.22],[x+w*.1,y-h*.18]];smoothShape(c,side);c.fillStyle=P.rockDark;c.fill();
  for(let i=0;i<26;i++){const xx=x+(hash(seed+i,7)-.5)*w*.86,yy=y-h*.84+hash(seed+i,19)*(h+d*.6),wide=1.5+hash(seed+i,27)*4.5;line(c,[[xx,yy],[xx+wide,yy-.5]],i%4?'#526f5e29':'#eee5c184',i%3?.8:1.4);}
  c.beginPath();c.moveTo(x-w*.42,y-h*.42);c.quadraticCurveTo(x-w*.17,y-h*.71,x+w*.15,y-h*.65);c.strokeStyle='#f0e6c88c';c.lineWidth=1.5;c.stroke();
  line(c,[[x-w*.08,y-h*.57],[x-w*.01,y-h*.34],[x-w*.08,y-h*.2]],'#68827464',.8);
  c.beginPath();c.moveTo(x-w*.48,y+d*.2);c.quadraticCurveTo(x,y+d*.45,x+w*.46,y+d*.18);c.strokeStyle='#537f7359';c.lineWidth=3;c.stroke();
  for(let i=0;i<3;i++){const xx=x-w*.23+i*w*.18,yy=y+d*.25+hash(seed+i,31)*d*.12;oval(c,xx,yy,1.8+hash(seed+i,43),1.3,'#e4d9b4');}c.restore();
}
function rock(c,p){const{w,d,h,a}=sizes(p),xExtent=Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*d,yExtent=Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*d;boulder(c,0,0,xExtent,yExtent,h,variant(p)*31);}
function reef(c,p){
  const{w,d,h,a}=sizes(p),seed=variant(p),count=w>d*1.6?4:3,items=[];
  poly(c,footing(p),'#7c9784');
  for(let i=0;i<count;i++){const t=(i/(count-1)-.5)*Math.max(0,w-d*.63),across=(hash(seed+i,13)-.5)*d*.3,[x,y]=rotate(t,across,a),r=d*(.58+hash(seed+i,7)*.2);items.push({x,y,w:r,d:r*.76,h:h*(.53+hash(seed+i,23)*.45),seed:seed*31+i});}
  items.sort((a,b)=>a.y-b.y);for(const q of items)boulder(c,q.x,q.y,q.w,q.d,q.h,q.seed);
  for(let i=0;i<4;i++){const[x,y]=rotate((i/3-.5)*w*.67,d*.24,a);line(c,[[x,y],[x-3,y-5],[x-6,y-7]],'#638d65',1.8);line(c,[[x+2,y],[x+4,y-6]],'#95af7a',1.4);}
}
function driftwood(c,p){
  const{w,d,h,a}=sizes(p),P=BEACH_PALETTE,seed=variant(p),foot=footing(p),top=foot.map(([x,y],i)=>[x,y-h*(.66+hash(seed+i,17)*.34)]);
  for(let i=0;i<foot.length;i++){const j=(i+1)%foot.length;if(foot[j][0]>foot[i][0])continue;poly(c,[foot[i],foot[j],top[j],top[i]],i%3?'#a09575':'#7c7b60',P.woodDark,.8);}smoothShape(c,top);c.fillStyle='#c7bfa0';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.2;c.stroke();
  const coord=(u,v,z=0)=>{const[x,y]=rotate(u,v,a);return[x,y-z];};
  // Sun-bleached wood with a broad surviving strip of bark, snapped ends and
  // one branch scar. All details remain inside the declared grounded capsule.
  const strip=[coord(-w*.34,-d*.26,h*.78),coord(-w*.12,-d*.15,h*.88),coord(w*.18,-d*.25,h*.83),coord(w*.34,-d*.05,h*.83),coord(w*.08,-d*.1,h*.86),coord(-w*.2,-d*.04,h*.89)];smoothShape(c,strip);c.fillStyle='#8e8d704f';c.fill();
  for(let i=0;i<3;i++){const v=(i-1)*d*.18,begin=-w*.35+hash(i+seed,5)*w*.07,end=w*.34-hash(i+seed,8)*w*.1;const start=coord(begin,v,h*.85),mid=coord((begin+end)/2,v+2,h*.91),finish=coord(end,v-1,h*.83);c.beginPath();c.moveTo(...start);c.quadraticCurveTo(...mid,...finish);c.strokeStyle=i%2?'#7e806265':'#eee6c47d';c.lineWidth=.9;c.stroke();}
  const knot=coord(-w*.11,d*.05,h*.87);oval(c,knot[0],knot[1],5.5,3.1,'#a59a77','#77795e');oval(c,knot[0]-.5,knot[1],2.1,1.3,'#77795e');
  for(const sign of[-1,1]){poly(c,[coord(sign*w*.46,-d*.12,h*.72),coord(sign*w*.31,-d*.04,h*.88),coord(sign*w*.45,d*.03,h*.72)],'#7a785d');line(c,[coord(sign*w*.46,d*.12,h*.7),coord(sign*w*.36,d*.2,h*.9)],'#f0e5bf',1.3);}
}
function post(c,p){
  const{w,d,h}=sizes(p),P=BEACH_PALETTE;poly(c,[[-w*.4,d*.35],[-w*.42,-h+d*.15],[w*.38,-h],[w*.43,d*.33]],P.wood,P.woodDark,1.3);poly(c,[[-w*.4,-h+d*.15],[w*.38,-h],[w*.43,-h+d*.25],[-w*.32,-h+d*.43]],P.woodLight,P.woodDark,.8);
  for(const xx of[-.18,.14])line(c,[[xx*w,-h+10],[xx*w+1,d*.3]],'#796e4d88',.9);
  for(let i=0;i<3;i++)line(c,[[-w*.46,-h*.42+i*4],[w*.46,-h*.45+i*4]],i===1?P.rope:'#a89e76',3.2);
  line(c,[[w*.36,-h*.4],[w*.54,-h*.15],[w*.32,d*.3]],'#a99f77',2);
}
function crate(c,p){
  // An abandoned open cargo tub, visibly distinct from sealed reward crates.
  const{w,d,h,a}=sizes(p),P=BEACH_PALETTE,foot=footing(p),top=foot.map(([x,y])=>[x,y-h]);
  for(let i=0;i<foot.length;i++){const j=(i+1)%foot.length;if(foot[j][0]>foot[i][0])continue;poly(c,[foot[i],foot[j],top[j],top[i]],i%3?P.wood:'#8b805f',P.woodDark,.8);}
  poly(c,top,P.woodLight,P.woodDark,1);poly(c,foot.map(([x,y])=>[x*.81,y*.75-h+3]),'#625f48');
  const extent=Math.abs(Math.cos(a))*w/2+Math.abs(Math.sin(a))*d/2;
  for(const t of [.35,.7])line(c,[[-extent*.87,-h*t+d*.2],[extent*.87,-h*t+d*.2]],'#786f54',.9);
  for(const x of [-extent*.77,extent*.74])line(c,[[x,-h*.78],[x,d*.2]],P.woodDark,3);
  line(c,[[-extent*.89,-h*.16],[extent*.9,-h*.16]],P.rope,2.2);
  poly(c,[[extent*.1,-h+d*.25],[extent*.22,-h+d*.25],[extent*.18,-h+d*.42],[extent*.12,-h+d*.32]],'#625f48');
  line(c,[[extent*.89,-h*.16],[extent*.95,1],[extent*.75,d*.25]],'#b9ae81',1.7);
}
export function beachVisual(p){
  if(p?.variant!=='beach-native')return null;const{w,d,h,a}=sizes(p),x=Math.abs(Math.cos(a))*w/2+Math.abs(Math.sin(a))*d/2,y=Math.abs(Math.sin(a))*w/2+Math.abs(Math.cos(a))*d/2;return{halfWidth:x+7,top:y+h+8,bottom:y+6,shadowWidth:x*.83,shadowLength:h*.26+6,shadowOffset:h*.14+2};
}
export class BeachPropArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.bytes=0;this.builds=0;}
  get cacheStats(){return{entries:this.cache.size,bytes:this.bytes,pixels:this.bytes/4,limitBytes:LIMIT,builds:this.builds};}
  clear(){for(const{canvas}of this.cache.values())canvas.width=canvas.height=0;this.cache.clear();this.bytes=0;}
  drawProp(c,p,{player=null,footY=null,canopyAlpha=1}={}){
    const v=beachVisual(p);if(!v)return false;const{w,d,h,a}=sizes(p),key=[p.beachKind,w,d,h,a,variant(p)].join(':');let image=this.cache.get(key);
    if(!image){const canvas=this.makeCanvas(),width=Math.ceil(v.halfWidth*2),height=Math.ceil(v.top+v.bottom);canvas.width=Math.ceil(width*SPRITE_SCALE);canvas.height=Math.ceil(height*SPRITE_SCALE);const ctx=canvas.getContext('2d');ctx.setTransform(SPRITE_SCALE,0,0,SPRITE_SCALE,width*SPRITE_SCALE/2,v.top*SPRITE_SCALE);ctx.lineJoin='round';ctx.lineCap='round';({rock,reef,driftwood,post,crate}[p.beachKind]||rock)(ctx,p);image={canvas,width,height,top:v.top,bytes:canvas.width*canvas.height*4};while(this.bytes+image.bytes>LIMIT&&this.cache.size){const k=this.cache.keys().next().value;this.bytes-=this.cache.get(k).bytes;this.cache.delete(k);}this.cache.set(key,image);this.bytes+=image.bytes;this.builds++;}else{this.cache.delete(key);this.cache.set(key,image);}
    const behind=player&&Number.isFinite(footY)&&Math.abs(player.x-p.x)<v.halfWidth+10&&footY<p.y+v.bottom&&footY>p.y-v.top-20;c.save();c.globalAlpha*=behind?.43:canopyAlpha;c.drawImage(image.canvas,p.x-image.width/2,p.y-image.top,image.width,image.height);c.restore();return true;
  }
}
let shared;
export function drawBeachProp(c,p,options){if(p?.variant!=='beach-native')return false;return(shared??=new BeachPropArt()).drawProp(c,p,options);}
export function clearBeachArtCache(){shared?.clear();}
export function drawBeachLandmark(c,site){
  if(site?.artTheme!=='beach'||site.kind!=='cave')return false;c.save();c.translate(site.x,site.y);c.lineJoin='round';c.lineCap='round';
  oval(c,0,6,58,17,'#547c6b45');poly(c,[[-31,8],[-33,-30],[-21,-50],[19,-53],[34,-29],[31,8]],'#254f4a');
  for(const[x,y,w,d,h,s]of[[-42,-2,30,28,50,1],[-25,-34,40,24,29,2],[12,-42,40,24,23,3],[41,-2,32,29,48,4]])boulder(c,x,y,w,d,h,s*31);
  for(let i=0;i<3;i++)line(c,[[-20-i*3,8+i*4],[20+i*3,8+i*4]],i===2?'#dfd3ac':'#9bb5a0',2.1);
  for(const sign of[-1,1]){const x=sign*48;line(c,[[x,10],[x+sign*2,-1],[x+sign*7,-7]],'#5f906c',1.6);line(c,[[x+5,10],[x+6,0]],'#9bb67a',1.3);}
  c.restore();return true;
}
