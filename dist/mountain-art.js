// Mountain scenery projects height above its declared ground capsule. The same
// dimensions drive drawing, foreground fading, shadows and sprite bounds.
export const MOUNTAIN_PALETTE=Object.freeze({ink:'#5d655b',stone:'#aaa996',light:'#d3ceaf',face:'#a19f8b',shade:'#7e8879',strata:'#727c6d',moss:'#839877',mossLight:'#b0bc8b'});
const TAU=Math.PI*2,LIMIT=12*1024*1024,SCALE=1.5;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const variant=p=>Math.floor(Math.abs(p.seed||0)*4)%4;
function size(p){const d=p.depth||p.r*2||48,w=p.width||((p.halfLength||0)*2+d),h=p.height||({rock:50,ledge:48,scree:28,waymark:52}[p.mountainKind]||40);return{w,d,h,a:p.angle||0};}
function line(c,points,color,width=1){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function poly(c,points,color,stroke,width=1){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(color){c.fillStyle=color;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function rotate(x,y,a){return[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];}
function capsule(w,d,a=0){const r=d/2,half=Math.max(0,(w-d)/2),points=[];for(const[x,start]of[[half,-Math.PI/2],[-half,Math.PI/2]])for(let i=0;i<=5;i++){const t=start+i*Math.PI/5;points.push(rotate(x+Math.cos(t)*r,Math.sin(t)*r,a));}return points;}
function strata(c,foot,h,seed,ledge=false,mineral=false){
  const P=MOUNTAIN_PALETTE;foot=foot.map(([x,y],i)=>{const k=.94+hash(seed+i,19)*.06;return[x*k,y*k];});
  const left=foot.reduce((a,b)=>a[0]<b[0]?a:b),right=foot.reduce((a,b)=>a[0]>b[0]?a:b),back=Math.min(...foot.map(p=>p[1])),front=[];
  for(let i=0;i<foot.length;i++){const j=(i+1)%foot.length;if(foot[j][0]<foot[i][0]){front.push(foot[i],foot[j]);}}front.sort((a,b)=>b[0]-a[0]);
  const width=right[0]-left[0],cx=(left[0]+right[0])*.5,ls=[left[0]*.86,left[1]-h*.51],peak1=[cx-width*(.2+hash(seed,13)*.09),back*.58-h],peak2=[cx+width*(.13+hash(seed,29)*.12),back*.5-h*.91],rs=[right[0]*.86,right[1]-h*.5],mid1=[cx+width*.18,-h*.26],mid2=[cx-width*.16,-h*.11],outline=[left,ls,peak1,peak2,rs,right,...front];
  poly(c,outline,P.face,P.ink,1.25);
  poly(c,[ls,peak1,peak2,rs,mid1,mid2],P.stone);
  poly(c,[ls,peak1,[cx-width*.03,back*.2-h*.58],mid2],P.light);
  poly(c,[peak1,peak2,rs,[cx+width*.08,-h*.42],[cx-width*.03,back*.2-h*.58]],'#c3bea2');
  poly(c,[mid1,rs,right,...front.filter(p=>p[0]>=cx-width*.08),[cx+width*.02,h*.03]],P.shade);
  poly(c,[left,ls,mid2,[cx+width*.02,h*.03],...front.filter(p=>p[0]<cx-width*.08)],'#9c9e87');
  line(c,[ls,peak1,peak2],'#e0d5b3',1.15);
  c.save();poly(c,outline);c.clip();
  // Bedding appears as broken, uneven seams on a weathered broad face. It
  // never forms a complete regular ring around an extruded cylinder.
  if(h>28)for(let row=0;row<2;row++){
    const y=-h*(.07+row*.27),start=left[0]+width*(.07+hash(seed+row,3)*.09),end=right[0]-width*(.1+hash(seed+row,7)*.1),split=cx+width*(hash(seed+row,11)-.5)*.2;
    line(c,[[start,y+4],[split-6,y-1]],'#6976648c',ledge?1.5:1.1);line(c,[[split+3,y],[end,y-5]],'#6976647a',1.1);line(c,[[start+2,y+6],[split-9,y+1]],'#d6ceb05e',.9);
  }
  line(c,[[cx-width*.05,-h*.57],[cx-width*.1,-h*.27],[cx-width*.02,-h*.06],[cx-width*.08,h*.13]],'#61705e73',1.05);
  for(let i=0;i<15;i++){const x=left[0]+hash(seed+i,31)*width,y=back*.5-h*.82+hash(seed+i,41)*(h+Math.max(...foot.map(p=>p[1])));line(c,[[x,y],[x+2+hash(seed+i,49)*4,y-.4]],i%3?'#66745f30':'#f0e4bf68',.8);}
  if(mineral){line(c,[[cx-14,-h*.5],[cx-7,-h*.53],[cx-2,-h*.44],[cx+4,-h*.48]],'#ab9859',1.8);line(c,[[cx-12,-h*.51],[cx-6,-h*.53]],'#dac788',.8);}
  c.restore();
  for(const side of[-1,1]){const x=cx+side*width*.33,y=front.reduce((n,p)=>n+p[1],0)/Math.max(1,front.length)-h*.07;poly(c,[[x-6,y],[x-3,y-2],[x+3,y-2],[x+6,y+1],[x+1,y+3]],P.moss);line(c,[[x-3,y],[x+2,y-1]],P.mossLight,.9);}
  return outline;
}
function rock(c,p){const{w,d,h,a}=size(p);strata(c,capsule(w,d,a),h,variant(p)*31,false,p.mineral===true);}
function ledge(c,p){
  const{w,d,h,a}=size(p),s=variant(p);strata(c,capsule(w,d,a),h,s*31,true,p.mineral===true);
  // A shallow split follows the bedding instead of a row of identical peaks.
  const left=rotate(-w*.15,d*.1,a),right=rotate(w*.24,d*.03,a);line(c,[[left[0],left[1]-h*.87],[left[0]+7,left[1]-h*.74],[right[0],right[1]-h*.8]],'#6c7766',1.5);line(c,[[left[0]-1,left[1]-h*.89],[right[0],right[1]-h*.83]],'#ded7b5',1.1);
}
function scree(c,p){
  const{w,d,h,a}=size(p),s=variant(p),pieces=[];poly(c,capsule(w,d,a),'#9caa8b');
  for(let i=0;i<5;i++){const along=(i/4-.5)*Math.max(0,w-d*.67),across=(hash(s+i,5)-.5)*d*.3,[x,y]=rotate(along,across,a),width=d*(.38+hash(s+i,7)*.17),depth=width*.75;pieces.push({x,y,width,depth,height:h*(.38+hash(s+i,13)*.6),seed:s*11+i});}
  pieces.sort((a,b)=>a.y-b.y);for(const p of pieces){c.save();c.translate(p.x,p.y);strata(c,capsule(p.width,p.depth,a),p.height,p.seed);c.restore();}
}
function waymark(c,p){
  const{w,d,h}=size(p),s=variant(p);strata(c,capsule(w,d),h*.34,s*7);strata(c,capsule(w*.73,d*.72).map(([x,y])=>[x+1,y-h*.29]),h*.35,s*7+1);strata(c,capsule(w*.45,d*.5).map(([x,y])=>[x-1,y-h*.6]),h*.4,s*7+2);
  line(c,[[-w*.13,-h*.23],[w*.11,-h*.24],[w*.02,-h*.31]],'#e4dab6',2);
}
export function mountainVisual(p){
  if(p?.variant!=='mountain-native')return null;const{w,d,h,a}=size(p),x=Math.abs(Math.cos(a))*w/2+Math.abs(Math.sin(a))*d/2,y=Math.abs(Math.sin(a))*w/2+Math.abs(Math.cos(a))*d/2;return{halfWidth:x+7,top:y+h+8,bottom:y+6,shadowWidth:x*.84,shadowLength:h*.27+6,shadowOffset:h*.14+2};
}
export class MountainPropArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.bytes=0;this.builds=0;}
  get cacheStats(){return{entries:this.cache.size,bytes:this.bytes,pixels:this.bytes/4,limitBytes:LIMIT,builds:this.builds};}
  clear(){for(const{canvas}of this.cache.values())canvas.width=canvas.height=0;this.cache.clear();this.bytes=0;}
  drawProp(c,p,{player=null,footY=null,canopyAlpha=1}={}){
    const v=mountainVisual(p);if(!v)return false;const{w,d,h,a}=size(p),key=[p.mountainKind,w,d,h,a,variant(p),p.mineral===true].join(':');let image=this.cache.get(key);
    if(!image){const canvas=this.makeCanvas(),width=Math.ceil(v.halfWidth*2),height=Math.ceil(v.top+v.bottom);canvas.width=Math.ceil(width*SCALE);canvas.height=Math.ceil(height*SCALE);const ctx=canvas.getContext('2d');ctx.setTransform(SCALE,0,0,SCALE,width*SCALE/2,v.top*SCALE);ctx.lineJoin='round';ctx.lineCap='round';({rock,ledge,scree,waymark}[p.mountainKind]||rock)(ctx,p);image={canvas,width,height,top:v.top,bytes:canvas.width*canvas.height*4};while(this.bytes+image.bytes>LIMIT&&this.cache.size){const k=this.cache.keys().next().value;this.bytes-=this.cache.get(k).bytes;this.cache.delete(k);}this.cache.set(key,image);this.bytes+=image.bytes;this.builds++;}else{this.cache.delete(key);this.cache.set(key,image);}
    const behind=player&&Number.isFinite(footY)&&Math.abs(player.x-p.x)<v.halfWidth+10&&footY<p.y+v.bottom&&footY>p.y-v.top-20;c.save();c.globalAlpha*=behind?.43:canopyAlpha;c.drawImage(image.canvas,p.x-image.width/2,p.y-image.top,image.width,image.height);c.restore();return true;
  }
}
let shared;
export function drawMountainProp(c,p,options){if(p?.variant!=='mountain-native')return false;return(shared??=new MountainPropArt()).drawProp(c,p,options);}
export function clearMountainArtCache(){shared?.clear();}
export function drawMountainLandmark(c,site){
  if(site?.artTheme!=='mountain'||site.kind!=='cave')return false;c.save();c.translate(site.x,site.y);c.lineJoin='round';c.lineCap='round';
  poly(c,[[-32,8],[-34,-28],[-20,-51],[20,-51],[34,-28],[32,8]],'#33483e');
  for(const[x,y,w,d,h,s]of[[-45,3,34,30,50,1],[43,3,34,30,48,2],[-17,-47,48,26,25,3],[18,-49,48,25,22,4]]){c.save();c.translate(x,y);strata(c,capsule(w,d),h,s*31);c.restore();}
  for(let i=0;i<3;i++)line(c,[[-23-i*2,7+i*4],[23+i*2,7+i*4]],i===2?'#d2cbaa':'#8f9c7d',2);
  c.restore();return true;
}
