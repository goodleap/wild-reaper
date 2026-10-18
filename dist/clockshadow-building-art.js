// Clockshadow's small, foot-anchored illustrations share one bounded stamp cache.
// All geometry below is visual: the authored ground footprints own collision.
const TAU=Math.PI*2,LIMIT_BYTES=12*1024*1024,MASK_SIDE=96;
const PALETTES=[
  {roof:'#718977',roofLight:'#91a28a',roofShade:'#506b5d',stone:'#c9c2a5',light:'#e4dbb7',shade:'#999d85'},
  {roof:'#ad7860',roofLight:'#c99875',roofShade:'#805847',stone:'#d1c4a4',light:'#e9d9b4',shade:'#a9a087'},
  {roof:'#7d9291',roofLight:'#a4b5a8',roofShade:'#566f70',stone:'#c5c3ac',light:'#e2ddbc',shade:'#949f8e'},
  {roof:'#a28a62',roofLight:'#c1a57a',roofShade:'#756b51',stone:'#d2c8a8',light:'#eee0ba',shade:'#a8a48b'}
];
const EDGE='#48564a',WOOD='#7d6d52',WOOD_LIGHT='#bca078',DARK='#35483e';
const finite=(n,f)=>Number.isFinite(n)?n:f;
const seedOf=value=>[...String(value??'')].reduce((a,s)=>(Math.imul(a,31)+s.charCodeAt(0))>>>0,7);
const noise=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
const line=(c,x1,y1,x2,y2,color,width=1)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
function poly(c,points,color,edge=EDGE,width=1.7){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(color){c.fillStyle=color;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function box(c,x,y,w,h,color,edge=null){c.fillStyle=color;c.fillRect(x,y,w,h);if(edge){c.strokeStyle=edge;c.lineWidth=1.7;c.strokeRect(x,y,w,h);}}
function ellipse(c,x,y,rx,ry,color,edge=null){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=1.5;c.stroke();}}
function arch(c,x,y,w,h,color,edge=EDGE){const r=Math.min(w/2,h*.55);c.beginPath();c.moveTo(x-w/2,y);c.lineTo(x-w/2,y-h+r);c.quadraticCurveTo(x-w/2,y-h,x,y-h);c.quadraticCurveTo(x+w/2,y-h,x+w/2,y-h+r);c.lineTo(x+w/2,y);c.closePath();c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=1.8;c.stroke();}}
function spec(prop){const kind=prop.cityKind==='church'?'cathedral':prop.cityKind||prop.cityArt?.sprite||'house';return{kind,w:Math.max(4,finite(prop.width,60)),d:Math.max(4,finite(prop.depth,40)),h:Math.max(0,finite(prop.height,65)),v:typeof prop.style==='number'?Math.abs(prop.style)%4:seedOf(prop.style??prop.cityArt?.style??prop.area)%4};}
const BUILDINGS=new Set(['house','keep','wing','barracks','warehouse','stable','workshop','school','cathedral']);
function roofProjection(q){
  const wall=q.h*.78,front=q.d/2-wall,back=-q.d/2-wall,rise=Math.min(q.w*.2,q.h*.34),ridge=front-rise,backRidge=back-rise,side=Math.min(28,q.w*.15,q.d*.42);
  return{wall,front,back,ridge,backRidge,side,rise,minY:backRidge,frontSpan:rise,rearSpan:0};
}
function buildingParts(q){
  const grand=['keep','wing','barracks','cathedral'].includes(q.kind),target=grand?128:96;
  if(q.d<=Math.max(112,q.h*1.1))return[{...q,offsetY:0,role:'building'}];
  const frontDepth=Math.min(q.d,target),rearDepth=q.d-frontDepth;
  // The front house keeps one properly sized roof. The remaining authored
  // foundation is enclosed by a low annex or closed courtyard, not more tiles.
  return[
    {...q,d:rearDepth,h:Math.min(38,q.h*.42),offsetY:-frontDepth/2,role:rearDepth>80?'courtyard':'annex'},
    {...q,d:frontDepth,offsetY:rearDepth/2,role:'building'}
  ];
}
function roofAttachment(q,t){const r=roofProjection(q);return r.backRidge+q.d*t+r.rise*.52;}
function buildingTop(q){
  if(q.role==='annex')return-q.d/2-q.h;
  if(q.role==='courtyard')return-q.d/2-Math.min(30,q.h);
  const r=roofProjection(q);let top=r.minY;
  if(q.kind==='workshop')top=Math.min(top,roofAttachment(q,.26)-40);
  else if(['house','warehouse'].includes(q.kind)&&q.v!==3)top=Math.min(top,roofAttachment(q,.26)-28);
  return top;
}
export function clockshadowBuildingProjection(prop){
  const q=spec(prop);if(!BUILDINGS.has(q.kind))return null;
  return{frontFoot:q.d/2,backFoot:-q.d/2,parts:buildingParts(q).map(part=>({role:part.role,width:part.w,depth:part.d,height:part.h,offsetY:part.offsetY,backFoot:part.offsetY-part.d/2,frontFoot:part.offsetY+part.d/2,minY:buildingTop(part),...(part.role==='building'?roofProjection(part):{})}))};
}
export function clockshadowBuildingVisual(prop){
  const q=spec(prop),halfWidth=q.w/2+5,top=BUILDINGS.has(q.kind)?-Math.min(...buildingParts(q).map(part=>part.offsetY+buildingTop(part)))+7:q.d/2+q.h+7,bottom=q.d/2+5,x=finite(prop.x,0),y=finite(prop.y,0);
  return{halfWidth,top,bottom,canopyX:0,canopyY:BUILDINGS.has(q.kind)?(bottom-top)/2:-q.h/2,canopyRx:halfWidth,canopyRy:(top+bottom)/2,shadowWidth:q.w*.43,shadowLength:q.h*.38+q.d*.12,shadowOffset:q.d*.2,
    maxBounds:{minX:x-halfWidth,minY:y-top,maxX:x+halfWidth,maxY:y+bottom},sortY:finite(prop.sortY,y+q.d/2)};
}
function stone(c,x,y,w,h,p,v=0){
  box(c,x,y,w,h,p.stone);box(c,x+w-Math.min(9,w*.12),y,Math.min(9,w*.12),h,p.shade);line(c,x,y,x+w,y,p.light,2);
  // Broad courses and a few chips read at gameplay scale without a brick grid.
  const step=22;for(let row=1;row*step<h-3;row++){const yy=y+row*step;line(c,x+2,yy,x+w-3,yy,'#77866c55',1);for(let col=0;col<w/48;col++){if((col+row+v)%3)continue;const xx=x+((col*48+row*19)%Math.max(1,w-6))+3;line(c,xx,yy-step+3,xx,yy-2,'#77866c65',1);}}
  for(let n=0;n<Math.min(16,w*h/1800);n++){const xx=x+4+noise(n+v,7)*(w-8),yy=y+3+noise(n+v,11)*(h-6);line(c,xx,yy,xx+3+noise(n,4)*5,yy-.6,p.light,.8);}
}
function moss(c,L,F,w,v){
  const count=Math.max(2,Math.min(10,w/35));for(let i=0;i<count;i++){const x=L+8+noise(i+v,3)*Math.max(1,w-16),y=F-2-noise(i,8)*3;poly(c,[[x-5,y],[x-3,y-3],[x+2,y-4],[x+6,y-1],[x+4,y+1]],i%2?'#809368':'#98a778',null);}
}
function door(c,x,F,w,h,p,{open=false}={}){
  arch(c,x,F,w+7,h+5,p.light);arch(c,x,F,w,h,open?DARK:WOOD);
  if(!open){for(const dx of[-.25,.03,.28])line(c,x+w*dx,F-h+6,x+w*dx,F-2,WOOD_LIGHT,1);line(c,x-w*.48,F-h*.3,x+w*.48,F-h*.3,EDGE,2);ellipse(c,x+w*.22,F-h*.5,1.7,1.7,'#d8b86e');}
  line(c,x-w*.62,F+1,x+w*.62,F+1,p.light,2.8);
}
function window(c,x,y,w,h,p,lit=false){arch(c,x,y,w+4,h+4,p.light);arch(c,x,y,w,h,lit?'#d6b674':'#5d7771');line(c,x,y-h+2,x,y-1,WOOD_LIGHT,1.3);line(c,x-w*.45,y-h*.43,x+w*.45,y-h*.43,WOOD_LIGHT,1.1);line(c,x-w*.65,y+2,x+w*.65,y+2,p.shade,2.2);}
function roof(c,q,p){
  const {w,d,v}=q,L=-w/2,R=w/2,r=roofProjection(q),s=r.side;
  const backPeak=[s/2,r.backRidge],frontPeak=[-s/2,r.ridge],backLeft=[L+s-2,r.back],frontLeft=[L-2,r.front],backRight=[R+2,r.back],frontRight=[R-s+2,r.front];
  const left=[backLeft,backPeak,frontPeak,frontLeft],right=[backPeak,backRight,frontRight,frontPeak];
  // Both slopes rise to one longitudinal ridge. Its front end stands above
  // an exposed triangular gable; the back end uses the same oblique depth as
  // the side wall, so the roof cannot read as an inset tray or a flat facade.
  poly(c,[[L,r.front],frontPeak,[R-s,r.front]],p.light);
  line(c,-s/2,r.ridge+5,-s/2,r.front-2,WOOD,1.8);
  for(const [shape,color,edgeSide]of[[left,p.roofLight,-1],[right,p.roof,1]]){
    poly(c,shape,color);c.save();poly(c,shape,null,null);c.clip();
    const rows=Math.max(2,Math.ceil(w/55)),span=(w-s)/2;
    for(let row=1;row<rows;row++){
      const t=row/rows,bx=s/2+edgeSide*span*t,fx=-s/2+edgeSide*span*t,by=r.backRidge+r.rise*t,fy=r.ridge+r.rise*t;
      line(c,bx,by,fx,fy,p.roofShade,1.2);line(c,bx+edgeSide*1.5,by-.8,fx+edgeSide*1.5,fy-.8,color===p.roof?p.roofLight:'#d2c7a55c',.7);
      const tiles=Math.max(2,Math.ceil(d/32));
      for(let n=0;n<tiles;n++){
        const u=(n+(row%2)*.5)/tiles;if(u>=1)continue;
        const x=bx+(fx-bx)*u,y=by+(fy-by)*u;
        line(c,x,y,x+edgeSide*span/rows,y+r.rise/rows,p.roofShade,.8);
      }
    }
    c.restore();
  }
  line(c,...backPeak,...frontPeak,EDGE,3.8);line(c,backPeak[0]-1,backPeak[1]-1,frontPeak[0]-1,frontPeak[1]-1,p.roofLight,2.5);
  line(c,...frontLeft,...frontPeak,p.roofShade,3.8);line(c,...frontPeak,...frontRight,p.roofShade,3.8);
  line(c,frontLeft[0]+2,frontLeft[1]-2,frontPeak[0],frontPeak[1]-2,p.roofLight,1.8);
  line(c,frontPeak[0]+1,frontPeak[1]-2,frontRight[0]-2,frontRight[1]-2,p.roofLight,1.8);
  line(c,...backLeft,...frontLeft,p.roofShade,2.8);line(c,...backRight,...frontRight,EDGE,2.8);
  if(v===2){const x=R-s*.7-8,y=r.front-d*.3;line(c,x-7,y-4,x-3,y+4,'#8d9d78',2);}
}
function house(c,q,p){
  const {w,d,h,v,kind}=q,L=-w/2,R=w/2,F=d/2,B=-d/2,r=roofProjection(q),wall=r.wall,top=F-wall,frontR=R-r.side;
  // The thin foundation retains the exact authored solid rectangle. Above
  // it, the visible side and front wall share the roof's oblique projection.
  box(c,L,B,w,d,p.shade);line(c,L,F,R,F,EDGE,2);
  poly(c,[[frontR,top],[R,B-wall],[R,B],[frontR,F]],p.shade);
  line(c,frontR,top,frontR,F,EDGE,1.5);
  for(let y=F-22;y>top+4;y-=22)line(c,frontR+2,y,R-2,y-d,p.stone,1);
  stone(c,L,top,w-r.side,wall,p,v);
  line(c,L+r.side,B-wall,L+r.side,B,p.light,1.4);line(c,L,top,L,F,EDGE,1.8);
  box(c,L,F-6,w,6,p.shade);line(c,L+2,F-6,R-2,F-6,p.light,1.5);
  const royal=['keep','wing','barracks'].includes(kind),church=kind==='cathedral',timber=!royal&&!church;
  if(timber){for(const x of[L+5,frontR-8]){box(c,x,top,4,wall-6,WOOD);line(c,x+1,top+2,x+1,F-7,WOOD_LIGHT,1);}if(v%2&&w>130)line(c,L+9,top+4,L+w*.25,F-8,WOOD,2.6);}
  const count=Math.max(2,Math.floor((w-r.side)/75)),dw=Math.min(34,w*.19),dh=Math.min(wall-6,church?52:38);
  if(!['stable','warehouse'].includes(kind))for(let i=0;i<count;i++){const x=L+(i+.5)*(w-r.side)/count;if(Math.abs(x)<dw*.85)continue;window(c,x,F-12,Math.min(19,(w-r.side)/count*.27),Math.min(wall*.55,church?37:26),p,(i+v)%3===0);}
  if(kind==='stable'){
    for(const x of[-w*.24,w*.24])door(c,x,F-3,Math.min(48,w*.3),Math.min(wall-8,55),p,{open:true});
    for(const x of[L+5,-3,R-8]){box(c,x,top,4,wall-5,WOOD);line(c,x+1,top,x+1,F-7,WOOD_LIGHT,1);}
    for(const x of[-w*.25,w*.25]){box(c,x-11,F-13,22,10,'#bca774',EDGE);line(c,x-8,F-10,x+8,F-10,'#e0c994',1);}
  }else if(kind==='warehouse'){
    const bw=Math.min(w*.47,110),bh=Math.min(wall-8,63);box(c,-bw/2-4,F-bh-3,bw+8,bh+2,p.light,EDGE);box(c,-bw/2,F-bh,bw,bh-3,WOOD,EDGE);
    for(let i=1;i<6;i++)line(c,-bw/2+bw*i/6,F-bh+2,-bw/2+bw*i/6,F-5,WOOD_LIGHT,1.3);
    for(const side of[-1,1]){const a=side<0?-bw/2:0,b=a+bw/2;line(c,a+3,F-bh+4,b-3,F-7,WOOD_LIGHT,2.5);line(c,a+3,F-7,b-3,F-bh+4,WOOD_LIGHT,2.5);}
    line(c,0,F-bh,0,F-4,EDGE,2);for(const x of[-4,4])ellipse(c,x,F-bh*.48,1.8,2.2,'#d5bd80');
    for(const x of[L+w*.12,R-w*.12])window(c,x,F-15,Math.min(17,w*.1),Math.min(24,wall*.4),p);
  }else if(kind==='workshop'){door(c,-w*.08,F-2,Math.min(w*.26,54),Math.min(wall-7,48),p,{open:true});arch(c,-w*.08,F-8,Math.min(23,w*.14),Math.min(23,wall*.33),'#826849',null);ellipse(c,-w*.08,F-14,7,4,'#d5a868');}
  else door(c,0,F-2,dw,dh,p);
  if(wall>105&&!['stable','workshop','warehouse','cathedral'].includes(kind)){
    for(const x of[-w*.25,w*.25])window(c,x,F-wall*.61,Math.min(19,w*.1),Math.min(28,wall*.23),p);
    if(timber)line(c,L+7,F-wall*.53,R-7,F-wall*.53,WOOD,2.5);
  }
  roof(c,q,p);
  if(timber&&w>120&&r.rise>20)window(c,-r.side/2,top-4,Math.min(15,w*.08),Math.min(15,r.rise*.52),p,v%2===0);

  if(v===0||v===3){const x=L+10;for(let k=0;k<4;k++){const y=F-8-k*7;line(c,x,y,x+2,y-10,'#6d815a',1.3);poly(c,[[x,y-2],[x-5,y-7],[x-4,y-11],[x+1,y-7]],'#87996a',null);poly(c,[[x+1,y-6],[x+7,y-9],[x+8,y-5],[x+3,y-3]],'#9ba97a',null);}}
  if(kind==='workshop'){
    const x=L+w*.16,y=roofAttachment(q,.26)-17;stone(c,x-10,y-20,20,42,p,v);box(c,x-13,y-23,26,6,p.light,EDGE);box(c,x-8,y-21,16,4,DARK);line(c,x-7,y-8,x+8,y-8,p.shade,1.2);
    const sx=w*.34,sy=F-wall*.4;line(c,sx,sy-12,sx,sy+5,WOOD,2);box(c,sx-10,sy-9,20,15,p.roofShade,EDGE);line(c,sx-4,sy+1,sx+4,sy-5,p.light,2.2);line(c,sx+1,sy-7,sx+6,sy-2,p.light,4);
  }else if(['house','warehouse'].includes(kind)&&v!==3){const x=L+w*.75,y=roofAttachment(q,.26)-11;stone(c,x-7,y-15,14,23,p,v);box(c,x-9,y-17,18,4,p.light,EDGE);box(c,x-5,y-15,10,3,p.shade);}
  if(kind==='warehouse'){const x=-w*.23,y=roofAttachment(q,.62)-7;poly(c,[[x-13,y+8],[x,y-6],[x+13,y+8]],p.roofShade);box(c,x-9,y+5,18,10,p.shade,EDGE);for(const dx of[-5,0,5])line(c,x+dx,y+6,x+dx,y+13,p.light,1);}

  if(royal){
    for(const x of[L+14,R-14]){const tw=Math.min(32,w*.18),th=h*.93;stone(c,x-tw/2,F-th,tw,th,p,v);battlement(c,x-tw/2,F-th-2,tw,p);window(c,x,F-12,8,Math.min(25,th*.4),p);}
    if(kind==='keep'){const gw=Math.min(w*.32,100),gh=Math.min(h*.96,145),gy=F-gh;stone(c,-gw/2,gy,gw,gh-2,p,v);poly(c,[[-gw/2-3,gy],[0,gy-22],[gw/2+3,gy]],p.roofShade);line(c,-gw/2-1,gy-1,0,gy-21,p.roofLight,2);door(c,0,F-2,Math.min(38,gw*.45),Math.min(68,gh*.72),p);}
    flag(c,-w*.22,top+6,Math.min(23,w*.08),Math.min(29,wall*.7),p);
  }
  if(church){
    const gw=Math.min(w*.42,106),gt=F-h*1.13;poly(c,[[-gw/2,F-4],[-gw/2,top-1],[0,gt],[gw/2,top-1],[gw/2,F-4]],p.stone);line(c,-gw/2,top,0,gt,p.light,2.5);line(c,0,gt,gw/2,top,p.light,2.5);
    const cy=top-3,rr=Math.min(14,gw*.16);ellipse(c,0,cy,rr+3,rr+3,p.shade);ellipse(c,0,cy,rr,rr,'#9bbaa6',EDGE);for(let k=0;k<6;k++){const a=k*TAU/6;line(c,0,cy,Math.cos(a)*rr,cy+Math.sin(a)*rr,p.light,1.1);}door(c,0,F-2,Math.min(36,gw*.4),Math.min(62,h*.42),p);line(c,0,gt+1,0,gt-7,WOOD,2);line(c,-4,gt-4,4,gt-4,WOOD,2);
  }
  moss(c,L,F,w,v);
}
function battlement(c,L,y,w,p){box(c,L,y,w,7,p.stone,EDGE);const n=Math.max(2,Math.round(w/28)),step=w/n;for(let i=0;i<n;i++){box(c,L+i*step,y-6,step*.59,8,p.stone,EDGE);line(c,L+i*step+1,y-6,L+i*step+step*.59-1,y-6,p.light,2);}}
function wall(c,q,p){const {w,d,h,v}=q,L=-w/2,F=d/2,B=-d/2;stone(c,L,B-h,w,d+h,p,v);poly(c,[[L,B-h],[L+w,B-h],[L+w,F-h],[L,F-h]],p.light);box(c,L,F-5,w,5,p.shade);line(c,L,F,L+w,F,EDGE,2);if(w>=d){if(h<30){box(c,L,B-h,w,Math.max(4,d),p.light,EDGE);line(c,L+2,B-h+2,L+w-2,B-h+2,'#e9e0bd',1.5);for(let x=L+55;x<L+w;x+=70)line(c,x,B-h,x,F-h,p.shade,1);}else{battlement(c,L,F-h,w,p);if(d>26)battlement(c,L,B-h,w,p);}}else{box(c,L,B-h,6,d,p.stone,EDGE);box(c,L+w-6,B-h,6,d,p.stone,EDGE);for(let y=B-h;y<F-h;y+=30){box(c,L,y,7,16,p.light,EDGE);box(c,L+w-7,y,7,16,p.light,EDGE);}}moss(c,L,F,w,v);}
function flag(c,x,y,w,h,p){line(c,x-w*.62,y,x+w*.62,y,WOOD,2);poly(c,[[x-w/2,y+2],[x+w/2,y+2],[x+w/2,y+h-5],[x,y+h],[x-w/2,y+h-5]],p.roofShade);line(c,x,y+7,x,y+h-6,'#d8bc7d',1.8);}
function tower(c,q,p){
  const {w,d,h,kind,v}=q,L=-w/2,F=d/2,B=-d/2,clock=kind==='belltower',wallTop=B-h*.72;
  stone(c,L,B-h*.72,w,d+h*.72,p,v);box(c,L,F-9,w,9,p.shade);line(c,L,F-9,L+w,F-9,p.light,2);line(c,L,F,L+w,F,EDGE,2);
  for(const x of[L+4,L+w-9])box(c,x,wallTop,5,F-wallTop-9,p.light);
  if(clock){
    const inset=Math.min(15,w*.1);poly(c,[[L-1,wallTop],[L+inset,B-h*.9],[0,B-h],[w/2-inset,B-h*.9],[w/2+1,wallTop]],p.roof);poly(c,[[0,B-h],[w/2-inset,B-h*.9],[w/2+1,wallTop],[w*.16,wallTop]],p.roofShade,null);line(c,L+2,wallTop,w/2-2,wallTop,p.roofLight,2);
    const bellY=wallTop+Math.min(48,(F-wallTop)*.23),bw=Math.min(w*.39,45),bh=Math.min(36,h*.19);arch(c,0,bellY,bw,bh,DARK,p.light);poly(c,[[-bw*.24,bellY-3],[-bw*.17,bellY-bh*.65],[bw*.17,bellY-bh*.65],[bw*.24,bellY-3]],'#c4a46b',EDGE,1);ellipse(c,0,bellY-3,bw*.28,2.6,'#e2c286');
    const rr=Math.min(w*.26,h*.15),cy=bellY+rr+12;ellipse(c,0,cy,rr+3,rr+3,p.shade);ellipse(c,0,cy,rr,rr,'#eddfaf',EDGE);for(let i=0;i<12;i++){const a=i*TAU/12;line(c,Math.sin(a)*rr*.75,cy-Math.cos(a)*rr*.75,Math.sin(a)*rr*.88,cy-Math.cos(a)*rr*.88,EDGE,i%3?1:1.7);}line(c,0,cy,rr*.48,cy-rr*.12,EDGE,2);line(c,0,cy,0,cy-rr*.59,EDGE,2);ellipse(c,0,cy,2,2,'#b48e55');
    door(c,0,F-2,Math.min(28,w*.32),Math.min(37,h*.2),p);if(F-(cy+rr)>55)flag(c,0,cy+rr+9,w*.25,24,p);
  }else{poly(c,[[L,B-h*.72],[w/2,B-h*.72],[w/2,F-h*.72],[L,F-h*.72]],p.shade);battlement(c,L,B-h*.72,w,p);battlement(c,L,F-h*.72,w,p);window(c,0,F-12,Math.min(15,w*.24),Math.min(34,h*.3),p);}
  moss(c,L,F,w,v);
}
function gate(c,q,p){
  const {w,d,h}=q,L=-w/2,R=w/2,F=d/2,B=-d/2,vertical=d>w,pier=Math.min(32,(vertical?d:w)*.11);
  // Grounded piers are separate authored solid structures. The vertical
  // opening has no overhead span; painting wall stubs here made fake posts
  // that actors could walk through. Horizontal gates retain only their beam.
  if(vertical)return;
  const spring=F-h*.48,top=B-h+8,innerTop=top+Math.min(24,h*.26);
  // A complete stone arch with true negative space, not an opaque facade
  // stretched across the route. The outer and inner curves share springing.
  c.beginPath();c.moveTo(L+pier*.48,spring);c.quadraticCurveTo(L+w*.2,top,0,top);c.quadraticCurveTo(R-w*.2,top,R-pier*.48,spring);c.lineTo(R-pier,spring);c.quadraticCurveTo(R-w*.23,innerTop,0,innerTop);c.quadraticCurveTo(L+w*.23,innerTop,L+pier,spring);c.closePath();c.fillStyle=p.stone;c.fill();c.strokeStyle=EDGE;c.lineWidth=2;c.stroke();
  c.beginPath();c.moveTo(L+pier*.58,spring-2);c.quadraticCurveTo(L+w*.2,top+3,0,top+3);c.quadraticCurveTo(R-w*.2,top+3,R-pier*.58,spring-2);c.strokeStyle=p.light;c.lineWidth=3;c.stroke();
  for(const side of[-1,1])for(let i=1;i<=4;i++){const t=i/5,x=side*(w/2-pier*.75)*t,y=top+(spring-top)*t*t,iy=innerTop+(spring-innerTop)*t*t;line(c,x,y+3,x-side*3,iy-2,p.shade,1.6);}
  poly(c,[[-7,top+1],[7,top+1],[5,innerTop+4],[-5,innerTop+4]],p.light,EDGE,1.2);
}

function lantern(c,x,y,h=28){line(c,x,y,x,y-h,WOOD,3);line(c,x,y-h,x+9,y-h+1,WOOD,3);box(c,x+4,y-h+3,11,14,'#d8ba7f',EDGE);box(c,x+7,y-h+5,5,10,'#f1df9c');poly(c,[[x+2,y-h+3],[x+9,y-h+3-5],[x+17,y-h+3]],WOOD,EDGE,1);}
function brokenWall(c,L,y,w,height,p,v){
  // Three unequal breaches join into one low masonry silhouette. Height is
  // independent of the former building's roof, so ruins never become palings.
  const profile=[[0,.66],[.12,.71],[.18,.48],[.25,.22],[.38,.19],[.43,.54],[.57,.59],[.64,.88],[.75,.8],[.81,.3],[.93,.23],[1,.48]];
  const top=profile.map(([t,r])=>[L+t*w,y-height*(v%2?1.05-r*.73:r)]),shape=[[L,y],...top,[L+w,y]];
  poly(c,shape,p.stone,EDGE,1.5);c.save();poly(c,shape,null,null);c.clip();
  stone(c,L,y-height,w,height,p,v);for(let k=1;k<Math.ceil(w/38);k++){const x=L+k*38+(k%2)*9;line(c,x,y-14,x,y-2,p.shade,1);}
  c.restore();for(let k=1;k<top.length;k++)line(c,top[k-1][0]+.5,top[k-1][1]+1,top[k][0]-.5,top[k][1]+1,p.light,2.2);
  line(c,L,y,L+w,y,EDGE,1.7);
}
function ruin(c,q,p){
  const {w,d,h,v}=q,L=-w/2,R=w/2,B=-d/2,F=d/2,wallH=Math.min(38,Math.max(20,h*.3)),edge=Math.min(10,w*.07,d*.16);
  // The pale rubble-filled foundation remains visible across the same blocked
  // footprint. Deep ruins have low perimeter walls, not a solid upright slab.
  box(c,L,B,w,d,'#b4b49a',EDGE);poly(c,[[L+edge,B+edge],[R-edge,B+edge],[R-edge,F-edge],[L+edge,F-edge]],'#c8c3a4',null);
  brokenWall(c,L,B+edge,w,wallH,p,v);
  if(d>38){
    for(const side of[-1,1]){const x=side<0?L:R-edge;poly(c,[[x,B+edge],[x+edge,B+edge],[x+edge,F],[x,F]],p.shade,EDGE,1);line(c,x+1,B+edge,x+1,F-1,p.light,2);for(let y=B+edge+26;y<F-3;y+=31)line(c,x+1,y,x+edge-1,y,p.stone,1.1);}
    brokenWall(c,L,F-1,w,Math.min(24,wallH*.66),p,v+1);
  }
  const count=Math.max(4,Math.min(13,Math.round(w*d/2000)));
  for(let n=0;n<count;n++){
    const rx=Math.min(12,Math.max(4,w*.035)),ry=Math.min(7,Math.max(3,d*.06)),x=L+edge+rx+noise(n+v*11,19)*Math.max(1,w-edge*2-rx*2),y=B+edge+ry+noise(n+v*13,23)*Math.max(1,d-edge*2-ry*2);
    poly(c,[[x-rx,y],[x-rx*.7,y-ry],[x+rx*.27,y-ry*1.3],[x+rx,y-ry*.3],[x+rx*.65,y+ry*.5],[x-rx*.4,y+ry*.65]],n%3?p.stone:p.light,p.shade,1);
    line(c,x-rx*.6,y-ry+.5,x+rx*.25,y-ry*1.3+.5,p.light,1.2);
  }
  moss(c,L,F,w,v);
}
function small(c,q,p){
  const {kind,w,d,h,v}=q,L=-w/2,F=d/2,B=-d/2;
  if(kind==='lamp'){ellipse(c,0,F-1,w*.38,d*.36,p.shade,EDGE);c.save();c.translate(-9,0);lantern(c,0,F-3,h-3);c.restore();return;}
  if(kind==='banner'){line(c,L+4,F,L+4,B-h+4,WOOD,3);flag(c,0,B-h+5,w*.8,h*.65,p);return;}
  if(kind==='ruin'){ruin(c,q,p);return;}
  if(kind==='sewer'){
    const R=w/2,rim=Math.max(7,w*.12),inner=w-rim*2,landing=B+d*.44;
    // A ground-level stair mouth descends toward a small dark vaulted landing.
    // Open treads face the same front interaction anchor; no slab seals it.
    poly(c,[[L+3,B+2],[R-3,B+2],[R,F-2],[L,F-2]],p.shade,EDGE,1.5);
    poly(c,[[L+rim,B+8],[R-rim,B+8],[R-rim+2,F-3],[L+rim-2,F-3]],DARK,null);
    stone(c,L+rim-3,B-4,inner+6,9,p,v);
    arch(c,0,landing,inner*.88,h*.6,DARK,p.shade);
    arch(c,0,landing-1,inner*.67,h*.49,'#263b35',null);
    const steps=5,span=F-landing-4;
    for(let i=0;i<steps;i++){
      const t=i/steps,y=landing+span*t,sw=inner*(.72+.28*t),step=span/steps;
      box(c,-sw/2,y,sw,step,i<2?p.shade:p.stone);
      line(c,-sw/2,y+step-1,sw/2,y+step-1,i<2?'#768674':p.light,1.8);
      line(c,-sw/2,y+.5,sw/2,y+.5,'#536454',1.1);
    }
    for(const side of[-1,1]){
      const x=side<0?L:R-rim;
      poly(c,[[x,B-5],[x+rim,B-5],[x+rim,F-4],[x,F-4]],p.stone,EDGE,1.5);
      poly(c,[[x,B-5],[x+rim,B-5],[x+rim-1,B+1],[x+1,B+1]],p.light,null);
      line(c,x+2,B-3,x+2,F-7,p.light,2);
      for(let y=B+13;y<F-6;y+=16)line(c,x+1,y,x+rim-1,y,p.shade,1.2);
    }
    line(c,L+rim-2,F-3,R-rim+2,F-3,p.light,3);
    moss(c,L,F,rim,v);moss(c,R-rim,F,rim,v+1);
    const lx=R-rim/2;box(c,lx-3,B-14,6,10,'#dcc589',EDGE);line(c,lx-5,B-15,lx+5,B-15,WOOD,2);
    return;
  }
  if(kind==='planter'||kind==='shrub'||kind==='rubble'){poly(c,[[L,F-5],[L+3,B],[w/2-3,B],[w/2,F-5],[w/2-3,F],[L+3,F]],p.shade);line(c,L+2,F-5,w/2-2,F-5,p.light,2);for(let n=0;n<5;n++){const x=L+(n+.5)*w/5,y=B-h*(.35+noise(n+v,7)*.4);poly(c,[[x-w*.17,F-6],[x-w*.19,y+5],[x-w*.08,y-3],[x+w*.09,y-1],[x+w*.2,y+8],[x+w*.17,F-6]],kind==='rubble'?p.stone:n%2?'#879b6d':'#6d875d',kind==='rubble'?EDGE:'#4e694b',1.3);}return;}
  if(kind==='fountain'){ellipse(c,0,1,w*.49,d*.49,p.shade,EDGE);ellipse(c,0,-2,w*.46,d*.41,p.light,EDGE);ellipse(c,0,-3,w*.37,d*.3,'#719b9a');stone(c,-w*.09,-h*.65,w*.18,h*.65,p);ellipse(c,0,-h*.66,w*.25,d*.2,p.light,EDGE);ellipse(c,0,-h*.68,w*.18,d*.13,'#8db6ae');line(c,0,-h*.9,0,-h*.7,'#cee2c8',2);return;}
  if(kind==='statue'){stone(c,L,F-h*.3,w,h*.3,p);poly(c,[[-w*.22,F-h*.3],[-w*.15,B-h*.7],[w*.15,B-h*.7],[w*.22,F-h*.3]],p.stone);ellipse(c,0,B-h*.8,w*.13,h*.13,p.light,EDGE);poly(c,[[-w*.3,B-h*.53],[-w*.21,B-h*.72],[w*.2,B-h*.72],[w*.32,B-h*.5]],p.light);return;}
  if(kind==='cart'){box(c,L+5,B-h*.48,w-10,d+h*.48,WOOD,EDGE);for(let i=1;i<4;i++)line(c,L+5,B-h*.48+(d+h*.48)*i/4,w/2-5,B-h*.48+(d+h*.48)*i/4,WOOD_LIGHT,1.5);for(const x of[L+5,w/2-5])ellipse(c,x,F-3,5,7,WOOD,EDGE);for(let i=0;i<3;i++)ellipse(c,L+w*(i+1)/4,B-h*.48+4,6,5,i%2?'#aab47b':'#d0b477');return;}
  if(kind==='market'){
    const awning=F-h*.7,back=B-h;
    for(const x of[L+5,w/2-5]){line(c,x,F,x,back+2,WOOD,4);line(c,x+1,F-2,x+1,back+4,WOOD_LIGHT,1.2);}
    line(c,L+5,back+4,w/2-5,back+4,WOOD,3);for(const x of[L+5,w/2-5])line(c,x,F-h*.5,x+(x<0?12:-12),awning+2,WOOD,2.5);
    box(c,L+5,F-h*.24,w-10,h*.24,WOOD,EDGE);line(c,L+5,F-h*.24,w/2-5,F-h*.24,WOOD_LIGHT,2.5);
    for(let x=L+15;x<w/2-7;x+=19)line(c,x,F-h*.24+2,x,F-2,WOOD_LIGHT,1.1);
    poly(c,[[L,back],[w/2,back],[w/2,awning],[L,awning]],p.light);
    const stripe=w/6;for(let n=0;n<6;n++){
      const x=L+n*stripe,color=n%2?p.light:p.roof;if(n%2===0)poly(c,[[x,back],[x+stripe,back],[x+stripe,awning],[x,awning]],color,null);
      poly(c,[[x,awning],[x+stripe,awning],[x+stripe-2,awning+7],[x+stripe*.5,awning+9],[x+2,awning+7]],color,EDGE,.8);
    }
    line(c,L+2,back+2,w/2-2,back+2,p.light,1.3);
    for(let n=0;n<3;n++){
      const x=L+(n+.5)*w/3,y=F-h*.25,cw=Math.min(23,w*.24);poly(c,[[x-cw/2,y-7],[x+cw/2,y-7],[x+cw*.4,y+4],[x-cw*.4,y+4]],'#b3976b',EDGE,1);
      for(const dx of[-cw*.24,0,cw*.23]){const yy=y-7+(dx===0?-3:0);if(n===1)poly(c,[[x+dx-3,yy+3],[x+dx-2,yy-3],[x+dx+2,yy-4],[x+dx+4,yy+2]],'#d5b679',EDGE,.6);else ellipse(c,x+dx,yy,3.7,3,n===0?'#9eaf71':'#b97b60',EDGE);}
      line(c,x-cw*.43,y+1,x+cw*.43,y+1,WOOD_LIGHT,1);
    }return;
  }
  house(c,q,p);
}
function lowAnnex(c,q,p){
  const {w,d,h,v}=q,L=-w/2,R=w/2,B=-d/2,F=d/2;
  stone(c,L,B-h,w,d+h,p,v);poly(c,[[L,B-h],[R,B-h],[R,F-h],[L,F-h]],p.shade);
  line(c,L+2,B-h+2,R-2,B-h+2,p.light,2);line(c,L+2,F-h-2,R-2,F-h-2,p.light,2);
  for(let x=L+45;x<R-10;x+=55)line(c,x,B-h+2,x,F-h-2,'#c1c4a4',1);
  box(c,L,F-4,w,4,p.shade);line(c,L,F,R,F,EDGE,1.5);
}
function closedCourtyard(c,q,p){
  const {w,d,h,v}=q,L=-w/2,R=w/2,B=-d/2,F=d/2,rim=Math.min(11,w*.07),backH=Math.min(30,h),sideH=Math.min(22,h);
  // This is a sealed part of the same solid property. Wall feet run along all
  // four original ground edges; no opening suggests an extra walkable passage.
  box(c,L,B,w,d,'#bbb59a');
  for(let y=B+27;y<F-12;y+=36)line(c,L+rim,y,R-rim,y,'#a3a88c',.8);
  const pots=Math.min(3,Math.floor(w/65));for(let n=0;n<pots;n++){
    const x=L+w*(n+1)/(pots+1),y=B+Math.min(45,d*.3);box(c,x-10,y-5,20,13,WOOD,EDGE);line(c,x-9,y-3,x+9,y-3,WOOD_LIGHT,1.5);
    poly(c,[[x-9,y-5],[x-12,y-13],[x-5,y-18],[x,y-12],[x+6,y-19],[x+12,y-12],[x+9,y-5]],n%2?'#8d9b6c':'#6f875d',EDGE,1);
  }
  stone(c,L,B-backH,w,backH+rim,p,v);line(c,L+1,B-backH,R-1,B-backH,p.light,3);
  for(const x of[L,R-rim]){stone(c,x,B-sideH,rim,d+sideH,p,v);box(c,x,B-sideH,rim,d,p.light,EDGE);line(c,x+2,B-sideH+1,x+2,F-sideH-1,'#ece0b9',1.5);}
  stone(c,L,F-sideH,w,sideH,p,v);line(c,L+2,F-sideH,R-2,F-sideH,p.light,3);moss(c,L,F,w,v);
}
function paint(c,q){const p=PALETTES[q.v];c.lineCap='round';c.lineJoin='round';if(q.kind==='wall')wall(c,q,p);else if(['tower','belltower'].includes(q.kind))tower(c,q,p);else if(['gate','arcade'].includes(q.kind))gate(c,q,p);else if(BUILDINGS.has(q.kind)){for(const part of buildingParts(q)){c.save();try{c.translate(0,part.offsetY);if(part.role==='courtyard')closedCourtyard(c,part,p);else if(part.role==='annex')lowAnnex(c,part,p);else house(c,part,p);}finally{c.restore();}}}else small(c,q,p);}
export class ClockshadowBuildingArt{
  constructor({makeCanvas=()=>document.createElement('canvas'),limitBytes=LIMIT_BYTES}={}){this.makeCanvas=makeCanvas;this.baseLimitBytes=limitBytes;this.limitBytes=limitBytes;this.cache=new Map();this.descriptions=new WeakMap();this.active=null;this.activeBytes=0;this.bytes=0;this.builds=0;this.draws=0;this.transientBuilds=0;}
  get cacheStats(){return{entries:this.cache.size,bytes:this.bytes,limitBytes:this.limitBytes,builds:this.builds,draws:this.draws,activeStamps:this.active?.size||0,activeBytes:this.activeBytes,transientBuilds:this.transientBuilds};}
  setViewport({width=1100,height=700,mobile=false}={}){
    // The normal desktop view needs the same 12 MiB as a phone. A wider world
    // view has more distinct buildings; the measured 1728 x 874 view needs
    // 15.71 MiB simultaneously. Give it bounded reuse room, never more than 24.
    const scale=mobile?1:Math.max(1,Math.min(2,finite(width*height,770000)/770000)),mib=1024*1024;
    this.limitBytes=scale===1?this.baseLimitBytes:Math.min(this.baseLimitBytes*2,Math.ceil(this.baseLimitBytes*scale/mib)*mib);
    this.active=null;this.activeBytes=0;this._trim(0,false);return this.limitBytes;
  }
  beginFrame(props=[]){
    if(this.active)this.active.clear();else this.active=new Set();this.activeBytes=0;
    // Terrain includes ground-only collision carriers and non-city scenery.
    // Only native illustrations share this cache. Interactive landmark draws
    // register their actual normalized spec in _stamp, not their site records.
    for(const prop of props)if(prop?.variant==='city-native'&&prop.region==='clockshadow-city'&&prop.visual!==false)this._activate(this._describe(prop));
  }
  clear(){for(const stamp of this.cache.values())stamp.canvas.width=stamp.canvas.height=0;this.cache.clear();this.descriptions=new WeakMap();this.active=null;this.activeBytes=0;this.bytes=0;this.limitBytes=this.baseLimitBytes;}
  _describe(prop){
    let info=this.descriptions.get(prop);if(info)return info;
    const q=spec(prop),key=[q.kind,q.w,q.d,q.h,q.v].join(':'),cached=this.cache.get(key);
    if(cached)info=cached.info;
    else{const visual=clockshadowBuildingVisual(prop),w=Math.ceil(visual.halfWidth*2),h=Math.ceil(visual.top+visual.bottom),ratio=w*h>180000?1:1.25,cw=Math.ceil(w*ratio),ch=Math.ceil(h*ratio),mr=Math.min(1,MASK_SIDE/Math.max(w,h)),mw=Math.ceil(w*mr),mh=Math.ceil(h*mr);info={q,key,w,h,ratio,cw,ch,mw,mh,ox:visual.halfWidth,oy:visual.top,bytes:cw*ch*4+mw*mh};}
    if(Object.isFrozen(prop))this.descriptions.set(prop,info);return info;
  }
  _activate(info){if(this.active&&!this.active.has(info.key)){this.active.add(info.key);this.activeBytes+=info.bytes;}}
  _trim(incoming=0,protect=true){
    for(const[key,stamp]of this.cache){if(this.bytes+incoming<=this.limitBytes)break;if(protect&&this.active?.has(key))continue;this.bytes-=stamp.bytes;stamp.canvas.width=stamp.canvas.height=0;this.cache.delete(key);}
  }
  _stamp(prop){
    const info=this._describe(prop),{q,key,w,h,ratio,cw,ch,mw,mh,ox,oy}=info;this._activate(info);const existing=this.cache.get(key);if(existing){this.cache.delete(key);this.cache.set(key,existing);return existing;}
    const canvas=this.makeCanvas();canvas.width=cw;canvas.height=ch;const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,ox*ratio,oy*ratio);paint(c,q);
    const maskCanvas=this.makeCanvas();maskCanvas.width=mw;maskCanvas.height=mh;const mc=maskCanvas.getContext('2d',{willReadFrequently:true});
    // Rasterize the same geometry directly on the tiny CPU-backed mask.
    // Copying the large display canvas here forces a synchronous GPU readback.
    mc.setTransform(mw/w,0,0,mh/h,ox*mw/w,oy*mh/h);paint(mc,q);
    const pixels=mc.getImageData(0,0,mw,mh).data,alpha=new Uint8Array(mw*mh);for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];maskCanvas.width=maskCanvas.height=0;
    const stamp={canvas,w,h,ox,oy,mask:{width:mw,height:mh,alpha},bytes:info.bytes,info,transient:true};
    if(stamp.bytes<=this.limitBytes){this._trim(stamp.bytes);if(this.bytes+stamp.bytes<=this.limitBytes){stamp.transient=false;this.cache.set(key,stamp);this.bytes+=stamp.bytes;}}
    // If an extreme view exceeds the cap, preserve its admitted visible set.
    // One temporary stamp is released after drawing instead of evicting every
    // other visible stamp and rebuilding them all on the next frame.
    if(stamp.transient)this.transientBuilds++;this.builds++;return stamp;
  }
  draw(c,prop,{canopyAlpha=1,player=null,footY}={}){
    const stamp=this._stamp(prop),x=prop.x-stamp.ox,y=prop.y-stamp.oy;let covered=!player;
    if(player){const foot=Number.isFinite(footY)?footY:player.y+19.8,mask=stamp.mask;for(const dx of[-10,0,10])for(const dy of[-44,-28,-12]){const sx=Math.floor((player.x+dx-x)/stamp.w*mask.width),sy=Math.floor((foot+dy-y)/stamp.h*mask.height);if(sx>=0&&sy>=0&&sx<mask.width&&sy<mask.height&&mask.alpha[sy*mask.width+sx]>32)covered=true;}}
    const alpha=covered?Math.max(0,Math.min(1,finite(canopyAlpha,1))):1;c.save();try{c.globalAlpha*=alpha;c.drawImage(stamp.canvas,x,y,stamp.w,stamp.h);}finally{c.restore();if(stamp.transient)stamp.canvas.width=stamp.canvas.height=0;}this.draws++;return alpha;
  }
}
export const clockshadowBuildingArt=new ClockshadowBuildingArt();
