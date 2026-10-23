// Snow scenery shares its physical footprint and vertical height with Terrain.
const LIMIT=12*1024*1024,SCALE=1.5;
const P=Object.freeze({edge:'#63868c',rock:'#829da2',shade:'#607f88',face:'#9fb8bc',ice:'#a3c9cd',snow:'#edf2e9',snowLight:'#faf8ed',snowShade:'#c6dcda'});
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const variant=p=>Math.floor(Math.abs(p.seed||0)*4)%4;
function size(p){const d=p.depth||p.r*2||48,w=p.width||((p.halfLength||0)*2+d),h=p.height||({rock:42,ledge:46,drift:24,waymark:48}[p.snowKind]||40);return {w,d,h,a:p.angle||0};}
function line(c,points,color,width=1){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function poly(c,points,color,edge,width=1){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(color){c.fillStyle=color;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function smooth(c,points,color,edge,width=1){const last=points.at(-1),first=points[0];c.beginPath();c.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];c.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}c.closePath();if(color){c.fillStyle=color;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function capsule(w,d,a=0){const r=d/2,half=Math.max(0,(w-d)/2),points=[];for(const[x,start]of[[half,-Math.PI/2],[-half,Math.PI/2]])for(let i=0;i<=6;i++){const t=start+i*Math.PI/6,xx=x+Math.cos(t)*r,yy=Math.sin(t)*r;points.push([xx*Math.cos(a)-yy*Math.sin(a),xx*Math.sin(a)+yy*Math.cos(a)]);}return points;}
function mass(c,foot,h,seed,{ice=false,deep=false}={}){
  const left=foot.reduce((a,b)=>a[0]<b[0]?a:b),right=foot.reduce((a,b)=>a[0]>b[0]?a:b),width=right[0]-left[0],back=Math.min(...foot.map(p=>p[1])),cx=(left[0]+right[0])/2,front=[];
  for(let i=0;i<foot.length;i++){const j=(i+1)%foot.length;if(foot[j][0]<foot[i][0])front.push(foot[i],foot[j]);}front.sort((a,b)=>b[0]-a[0]);
  const topY=back*.48-h,ls=[left[0]*.94,left[1]-h*(.41+hash(seed,5)*.1)],rs=[right[0]*.94,right[1]-h*(.35+hash(seed,7)*.1)],top=[ls,[cx-width*(.28+hash(seed,11)*.05),topY+3+hash(seed,17)*5],[cx-width*.12,topY-1],[cx+width*.12,topY+hash(seed,23)*5],[cx+width*.3,topY+3+hash(seed,29)*6],rs],outline=[left,...top,right,...front];
  smooth(c,outline,ice?P.ice:P.rock,P.edge,1.15);
  c.save();smooth(c,outline);c.clip();
  poly(c,[[cx+width*.15,topY+8],rs,right,...front.filter(p=>p[0]>cx-width*.05),[cx-width*.03,-h*.02]],ice?'#83afb8':P.shade);
  poly(c,[left,ls,[cx-width*.18,topY+h*.48],[cx-width*.04,-h*.03],...front.filter(p=>p[0]<cx)],ice?'#b6d7d6':P.face);
  if(!deep){line(c,[[cx-width*.23,-h*.08],[cx-width*.02,-h*.15],[cx+width*.12,-h*.07]],'#476d7b79',1);line(c,[[cx+width*.16,-h*.5],[cx+width*.11,-h*.29],[cx+width*.2,-h*.12]],'#567f8b80',1.1);}
  if(ice){line(c,[[cx-width*.05,topY+13],[cx-width*.1,-h*.28],[cx-width*.04,-h*.02]],'#e7f4e99c',1.5);line(c,[[cx-width*.1,-h*.28],[cx-width*.19,-h*.19]],'#eff8ed84',.8);}
  for(let i=0;i<8;i++){const x=left[0]+hash(seed+i,13)*width,y=topY+hash(seed+i,19)*(h+Math.max(...foot.map(p=>p[1])));line(c,[[x,y],[x+2+hash(seed+i,21)*3,y-.4]],i%3?'#426d7c28':'#eff7ed67',.7);}
  // The soft cap is thick and asymmetric, with a drooping front lip. It is
  // part of the raised silhouette rather than a flat white circle on the floor.
  const lip=deep?-Math.max(...foot.map(p=>p[1]))*.67:h*.34,cap=[...top,[right[0]*.84,right[1]-h*(deep?.02:.13)],[cx+width*.3,-lip+2],[cx+width*.15,-lip-2],[cx+width*.06,-lip+5],[cx-width*.09,-lip+3],[cx-width*.18,-lip+7],[cx-width*.34,-lip+1],[left[0]*.82,left[1]-h*(deep?.02:.12)]];
  smooth(c,cap,P.snowShade);smooth(c,cap.map(([x,y],i)=>[x,y-(i<6?1.5:4)]),P.snow);
  c.beginPath();c.moveTo(ls[0]+width*.12,ls[1]-3);c.bezierCurveTo(cx-width*.18,topY+3,cx+width*.05,topY+5,cx+width*.21,topY+8);c.strokeStyle=P.snowLight;c.lineWidth=2;c.stroke();
  for(let i=0;i<5;i++){const x=cx+(hash(seed+i,43)-.5)*width*.62,y=topY+8+hash(seed+i,47)*Math.max(4,h*.3);line(c,[[x,y],[x+2+hash(seed+i,53)*3,y-.3]],i%3?'#f8faf0a0':'#b1cecf42',.7);}
  c.restore();return outline;
}
function rock(c,p){const {w,d,h,a}=size(p);mass(c,capsule(w,d,a),h,variant(p)*31);}
function ledge(c,p){const {w,d,h,a}=size(p);mass(c,capsule(w,d,a),h,variant(p)*31,{ice:true});}
function drift(c,p){
  const {w,d,h,a}=size(p),foot=capsule(w,d,a);mass(c,foot,h,variant(p)*31,{ice:true,deep:true});
  const width=Math.max(...foot.map(p=>p[0]))-Math.min(...foot.map(p=>p[0]));c.beginPath();c.moveTo(-width*.22,-h*.48);c.bezierCurveTo(-width*.05,-h*.67,width*.08,-h*.47,width*.24,-h*.4);c.strokeStyle='#ffffff8c';c.lineWidth=1.2;c.stroke();
}
function waymark(c,p){const {w,d,h}=size(p),s=variant(p);mass(c,capsule(w,d),h*.31,s*13);mass(c,capsule(w*.72,d*.71).map(([x,y])=>[x-1,y-h*.3]),h*.34,s*13+1);mass(c,capsule(w*.43,d*.46).map(([x,y])=>[x+1,y-h*.59]),h*.41,s*13+2);line(c,[[-w*.16,-h*.1],[-w*.14,-h*.25],[w*.13,-h*.27]],'#e1b779',1.8);}
export function snowVisual(p){if(p?.variant!=='snow-native')return null;const {w,d,h,a}=size(p),x=Math.abs(Math.cos(a))*w/2+Math.abs(Math.sin(a))*d/2,y=Math.abs(Math.sin(a))*w/2+Math.abs(Math.cos(a))*d/2;return {halfWidth:x+7,top:y+h+8,bottom:y+6,shadowWidth:x*.84,shadowLength:h*.27+6,shadowOffset:h*.14+2};}
export class SnowPropArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.bytes=0;this.builds=0;}
  get cacheStats(){return {entries:this.cache.size,bytes:this.bytes,pixels:this.bytes/4,limitBytes:LIMIT,builds:this.builds};}
  clear(){for(const {canvas}of this.cache.values())canvas.width=canvas.height=0;this.cache.clear();this.bytes=0;}
  drawProp(c,p,{player=null,footY=null,canopyAlpha=1}={}){
    const v=snowVisual(p);if(!v)return false;const {w,d,h,a}=size(p),key=[p.snowKind,w,d,h,a,variant(p)].join(':');let image=this.cache.get(key);
    if(!image){const canvas=this.makeCanvas(),width=Math.ceil(v.halfWidth*2),height=Math.ceil(v.top+v.bottom);canvas.width=Math.ceil(width*SCALE);canvas.height=Math.ceil(height*SCALE);const ctx=canvas.getContext('2d');ctx.setTransform(SCALE,0,0,SCALE,width*SCALE/2,v.top*SCALE);ctx.lineJoin='round';ctx.lineCap='round';({rock,ledge,drift,waymark}[p.snowKind]||rock)(ctx,p);image={canvas,width,height,top:v.top,bytes:canvas.width*canvas.height*4};while(this.bytes+image.bytes>LIMIT&&this.cache.size){const key=this.cache.keys().next().value;this.bytes-=this.cache.get(key).bytes;this.cache.delete(key);}this.cache.set(key,image);this.bytes+=image.bytes;this.builds++;}else{this.cache.delete(key);this.cache.set(key,image);}
    const behind=player&&Number.isFinite(footY)&&Math.abs(player.x-p.x)<v.halfWidth+10&&footY<p.y+v.bottom&&footY>p.y-v.top-20;c.save();c.globalAlpha*=behind?.43:canopyAlpha;c.drawImage(image.canvas,p.x-image.width/2,p.y-image.top,image.width,image.height);c.restore();return true;
  }
}
let shared;
export function drawSnowProp(c,p,options){if(p?.variant!=='snow-native')return false;return (shared??=new SnowPropArt()).drawProp(c,p,options);}
export function clearSnowArtCache(){shared?.clear();}
export function drawSnowLandmark(c,site){
  if(site?.artTheme!=='snow'||site.kind!=='cave')return false;c.save();c.translate(site.x,site.y);c.lineJoin='round';c.lineCap='round';
  mass(c,capsule(140,62),78,37,{ice:true});
  c.beginPath();c.moveTo(-26,9);c.lineTo(-26,-22);c.bezierCurveTo(-24,-51,24,-51,26,-22);c.lineTo(26,9);c.closePath();c.fillStyle='#274b59';c.fill();c.strokeStyle='#6d9da5';c.lineWidth=3;c.stroke();
  c.beginPath();c.moveTo(-30,-23);c.bezierCurveTo(-27,-55,25,-54,31,-22);c.strokeStyle='#f0f4e9';c.lineWidth=5;c.stroke();
  line(c,[[-23,10],[-9,8],[13,10],[25,8]],'#bdd9d9',2);line(c,[[-18,14],[-1,12],[20,14]],'#eaf3e9',1.6);c.restore();return true;
}
