// Permanent world services share their actual foundation with collision.
// Buildings and low ground patches are baked once into a bounded sprite cache.
const TAU=Math.PI*2,LIMIT_BYTES=12*1024*1024;
const SPECS={weapons:{width:126,depth:68,wall:38,rise:10},skills:{width:132,depth:76,wall:40,rise:13},supplies:{width:118,depth:64,wall:34,rise:10},rest:{width:142,depth:82,wall:42,rise:15},waypoint:{width:56,depth:36,wall:52,rise:0}};
const COLORS={
  forest:{stone:'#b9b79a',light:'#ddd5ad',shade:'#89957a',roof:'#748b69',roofLight:'#9ba67b',roofDark:'#536c54',ground:'#b7af87',edge:'#7f946657'},
  marsh:{stone:'#a8b5a1',light:'#d0d7b6',shade:'#7b9787',roof:'#6c8c7d',roofLight:'#9cb3a0',roofDark:'#4e7166',ground:'#a3b49a',edge:'#60887357'},
  ruins:{stone:'#bdb99e',light:'#e0d7b2',shade:'#929c83',roof:'#7a8b75',roofLight:'#aab596',roofDark:'#576e5c',ground:'#c5bfa0',edge:'#81946957'},
  beach:{stone:'#c3b99a',light:'#e9d9af',shade:'#a29e80',roof:'#8caa9b',roofLight:'#bed0b2',roofDark:'#668779',ground:'#d1c09a',edge:'#a6b39657'},
  mountain:{stone:'#b0b7a3',light:'#d7dac0',shade:'#899a8c',roof:'#798c85',roofLight:'#a7b9aa',roofDark:'#526d67',ground:'#b3b4a0',edge:'#84958657'},
  snow:{stone:'#baccca',light:'#e7eee0',shade:'#90aeac',roof:'#8ca9ab',roofLight:'#c9ded1',roofDark:'#647f85',ground:'#d2dfce',edge:'#a9c3bf57'},
  city:{stone:'#c6bda0',light:'#e8d8b0',shade:'#a29d82',roof:'#a27f65',roofLight:'#c9a17b',roofDark:'#7d6251',ground:'#c2b597',edge:'#9ca48257'},
  ember:{stone:'#b6ac92',light:'#d7c6a3',shade:'#908e79',roof:'#96836b',roofLight:'#beab87',roofDark:'#6d6b59',ground:'#b5a589',edge:'#8c937957'}
};
const INK='#46584a',WOOD='#89714f',WOOD_LIGHT='#c5a77b',WOOD_DARK='#62593f';
const finite=(n,f)=>Number.isFinite(n)?n:f;
const noise=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const poly=(c,points,fill,edge=null,width=1.5)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,color,edge=null)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=1.2;c.stroke();}};
const box=(c,x,y,w,h,fill,edge=null)=>{c.fillStyle=fill;c.fillRect(x,y,w,h);if(edge){c.strokeStyle=edge;c.lineWidth=1.3;c.strokeRect(x,y,w,h);}};
function arch(c,x,y,w,h,fill,edge=INK){const r=Math.min(w*.5,h*.5);c.beginPath();c.moveTo(x-w/2,y);c.lineTo(x-w/2,y-h+r);c.quadraticCurveTo(x-w/2,y-h,x,y-h);c.quadraticCurveTo(x+w/2,y-h,x+w/2,y-h+r);c.lineTo(x+w/2,y);c.closePath();c.fillStyle=fill;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=1.5;c.stroke();}}
function spec(site){const kind=site?.worldFacility,base=SPECS[kind];if(!base)return null;return{kind,w:Math.max(20,finite(site.width,base.width)),d:Math.max(16,finite(site.depth,base.depth)),wall:base.wall,rise:base.rise,theme:site.artTheme||'forest'};}
function frontDepth(q){return Math.min(q.d,q.kind==='rest'?48:q.kind==='skills'?46:q.kind==='weapons'?40:38);}
function topOf(q){return q.kind==='waypoint'?q.d*.5+64:Math.max(q.d+20,frontDepth(q)+q.wall+q.rise+5);}
export function worldHubVisual(site){
  const q=spec(site);if(!q)return null;const halfWidth=q.w/2+10,top=topOf(q),bottom=33,x=finite(site.x,0),y=finite(site.y,0);
  return{halfWidth,top,bottom,sortY:y,shadowWidth:q.w*.5,shadowLength:q.kind==='waypoint'?38:q.wall*.75,shadowOffset:q.d*.3,
    maxBounds:{minX:x-halfWidth,minY:y-top,maxX:x+halfWidth,maxY:y+bottom}};
}
function foundation(c,q,p){const r=Math.min(12,q.d/2),L=-q.w/2;c.beginPath();c.roundRect(L,-q.d,q.w,q.d,r);c.fillStyle=p.shade;c.fill();c.strokeStyle=INK;c.lineWidth=1.5;c.stroke();line(c,[[L+r,-3],[q.w/2-r,-3]],p.light,2);}
function rearStore(c,q,p,front){
  if(q.d<=front)return;const L=-q.w/2,R=q.w/2,back=-q.d,near=-front,h=16;
  // Deep foundations are occupied by a low closed stockroom. Extending a
  // steep roof over all of that depth made small houses look thin and tall.
  box(c,L+1,back-h,q.w-2,near-back+h,p.shade,INK);poly(c,[[L+1,back-h],[R-1,back-h],[R-1,near-h],[L+1,near-h]],p.stone,INK,1.2);
  line(c,[[L+3,back-h+2],[R-3,back-h+2]],p.light,1.5);line(c,[[L+2,near-h],[R-2,near-h]],p.light,1.1);
  for(let x=L+24;x<R-9;x+=30)line(c,[[x,back-h+2],[x,near-h-2]],p.shade,.9);
}
function book(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);poly(c,[[-13,-7],[-4,-9],[0,-6],[4,-9],[13,-7],[12,8],[4,6],[0,9],[-4,6],[-12,8]],'#e5d9ac',WOOD_DARK,1);line(c,[[0,-6],[0,8]],'#ab9974',1);for(const yy of [-3,1,4]){line(c,[[-9,yy],[-3,yy-1]],'#8d9475',.8);line(c,[[3,yy-1],[9,yy]],'#8d9475',.8);}c.restore();}
function blade(c,x,y,angle=0,s=1){c.save();c.translate(x,y);c.rotate(angle);c.scale(s,s);poly(c,[[-2,-3],[-3,-20],[0,-27],[3,-20],[2,-3]],'#c0d2c4',INK,1);line(c,[[0,-24],[0,-4]],'#eff1d6',1);line(c,[[-6,-2],[6,-2]],WOOD_LIGHT,3);line(c,[[0,0],[0,8]],WOOD_DARK,4);oval(c,0,8,2.7,2.5,WOOD_LIGHT);c.restore();}
function flask(c,x,y,color,s=1){c.save();c.translate(x,y);c.scale(s,s);poly(c,[[-3,-14],[3,-14],[3,-9],[7,-4],[7,4],[3,8],[-3,8],[-7,4],[-7,-4],[-3,-9]],'#b8c7ad',INK,1);poly(c,[[-5,-2],[5,-2],[5,4],[2,6],[-2,6],[-5,4]],color);box(c,-4,-16,8,4,WOOD,INK);line(c,[[-3,-6],[-3,1]],'#f3e9c8',1);c.restore();}
function banner(c,x,y,type,p){
  box(c,x-17,y-11,34,26,WOOD_DARK,INK);box(c,x-15,y-9,30,22,p.roofDark,WOOD_LIGHT);
  if(type==='skills')book(c,x,y+1,.75);
  else if(type==='rest'){box(c,x-10,y-3,20,8,'#b1bd94',INK);box(c,x-10,y-6,7,6,'#e1d6ac');line(c,[[x-11,y-8],[x-11,y+9]],WOOD_LIGHT,2);line(c,[[x+11,y-2],[x+11,y+9]],WOOD_LIGHT,2);}
  else if(type==='weapons'){blade(c,x-3,y+4,-.45,.65);blade(c,x+3,y+4,.45,.65);}
  else flask(c,x,y+2,'#b1a66c',.72);
}
function window(c,x,y,w,h,p){arch(c,x,y,w+5,h+4,p.light,null);arch(c,x,y,w,h,'#5f8172');line(c,[[x,y-h+2],[x,y-1]],WOOD_LIGHT,1.2);line(c,[[x-w*.45,y-h*.42],[x+w*.45,y-h*.42]],WOOD_LIGHT,1.1);line(c,[[x-w*.65,y+2],[x+w*.65,y+2]],p.shade,2.4);}
function houseRoof(c,q,p){
  const L=-q.w/2,R=q.w/2,s=Math.min(17,q.w*.13),front=-q.wall,back=-q.d-q.wall;
  const peakFront=[-s/2,front-q.rise],peakBack=[s/2,back-q.rise],frontLeft=[L-3,front+1],backLeft=[L+s-2,back],frontRight=[R-s+3,front+1],backRight=[R+3,back];
  poly(c,[[L,front],peakFront,[R-s,front]],p.light,INK,1.2);line(c,[[peakFront[0],peakFront[1]+4],[peakFront[0],front-1]],WOOD,1.4);
  const surfaces=[[backLeft,peakBack,peakFront,frontLeft],[peakBack,backRight,frontRight,peakFront]];
  for(let side=0;side<2;side++){
    const shape=surfaces[side],color=side?p.roof:p.roofLight;poly(c,shape,color,INK,1.5);c.save();poly(c,shape,null);c.clip();
    const direction=side?1:-1,span=(q.w-s)/2;
    for(let row=1;row<4;row++){const t=row/4,bx=s/2+direction*span*t,fx=-s/2+direction*span*t,by=back-q.rise+q.rise*t,fy=front-q.rise+q.rise*t;line(c,[[bx,by],[fx,fy]],p.roofDark,1);line(c,[[bx+direction,by-1],[fx+direction,fy-1]],p.roofLight+'a0',.7);for(let n=0;n<3;n++){const u=(n+(row%2)*.5)/3,x=bx+(fx-bx)*u,y=by+(fy-by)*u;line(c,[[x,y],[x+direction*span/4,y+q.rise/4]],p.roofDark,.8);}}
    if(q.theme==='snow'){poly(c,[shape[0],shape[1],[shape[2][0],shape[2][1]+3],[shape[3][0],shape[3][1]+2]],'#e4edda88');}
    c.restore();
  }
  line(c,[peakBack,peakFront],INK,3.5);line(c,[[peakBack[0]-1,peakBack[1]-1],[peakFront[0]-1,peakFront[1]-1]],p.roofLight,2.1);
  line(c,[frontLeft,peakFront,frontRight],p.roofDark,3);line(c,[[frontLeft[0]+1,frontLeft[1]-1],[peakFront[0],peakFront[1]-1],[frontRight[0]-1,frontRight[1]-1]],p.roofLight,1.4);
}
function house(c,q,p){
  const L=-q.w/2,R=q.w/2,s=Math.min(17,q.w*.13),frontR=R-s,h=q.wall,front=frontDepth(q);
  foundation(c,q,p);rearStore(c,q,p,front);poly(c,[[frontR,-h],[R,-front-h],[R,-front],[frontR,0]],p.shade,INK,1.4);box(c,L,-h,q.w-s,h,p.stone,INK);
  for(const y of [-14,-28]){line(c,[[L+2,y],[frontR-2,y]],p.shade+'77',.8);line(c,[[frontR+2,y],[R-2,y-front+4]],p.stone,1);}
  for(const x of [L+5,frontR-7]){box(c,x,-h,4,h-4,WOOD);line(c,[[x+1,-h+2],[x+1,-5]],WOOD_LIGHT,1);}
  box(c,L,-5,q.w,5,p.shade);line(c,[[L+2,-5],[R-3,-5]],p.light,1.4);
  arch(c,0,-2,29,35,p.light,null);arch(c,0,-2,23,31,q.kind==='skills'?'#526c66':WOOD_DARK);for(const x of [-6,1,7])line(c,[[x,-25],[x,-4]],q.kind==='skills'?'#819f8f':WOOD_LIGHT,1);oval(c,7,-15,1.6,1.6,'#dbbf82');line(c,[[-17,-1],[17,-1]],p.light,2.8);
  window(c,L+25,-12,19,22,p);
  if(q.kind==='skills'){
    // The books occupy a shallow cabinet inside the exact house foundation.
    box(c,frontR-29,-31,21,25,WOOD_DARK,INK);for(const [i,color]of ['#9aa77b','#b9926e','#9bb4a5'].entries()){box(c,frontR-26+i*6,-26,4,17,color);line(c,[[frontR-25+i*6,-24],[frontR-25+i*6,-11]],p.light,.6);}line(c,[[frontR-29,-6],[frontR-8,-6]],WOOD_LIGHT,2);
  }else{
    // The bench belongs to the raised facade, so it does not suggest a new
    // solid footprint on the walkable apron in front of the house.
    box(c,frontR-30,-12,26,5,WOOD,INK);for(const x of [frontR-27,frontR-10])box(c,x,-7,3,6,WOOD_DARK);line(c,[[frontR-29,-13],[frontR-5,-13]],WOOD_LIGHT,1.4);
  }
  houseRoof(c,{...q,d:front},p);
  c.save();c.translate(frontR+3,-h+17);c.scale(.78,.78);banner(c,0,0,q.kind,p);c.restore();
  if(q.kind==='rest'){
    const x=L+q.w*.23,y=-front*.7-h-q.rise*.35;box(c,x-5,y-16,11,22,p.shade,INK);box(c,x-7,y-18,15,5,p.light,INK);box(c,x-3,y-16,6,2,WOOD_DARK);
  }
}
function canopy(c,q,p){
  const L=-q.w/2,R=q.w/2,h=q.wall,s=Math.min(15,q.w*.12),frontR=R-s,front=-h,back=-q.d-h;
  const backPeak=[s/2,back-q.rise],frontPeak=[-s/2,front-q.rise],left=[[L+s-2,back],backPeak,frontPeak,[L-3,front+2]],right=[backPeak,[R+3,back],[frontR+3,front+2],frontPeak];
  for(const [i,shape]of [left,right].entries()){
    poly(c,shape,i?p.roof:p.roofLight,INK,1.5);c.save();poly(c,shape,null);c.clip();
    for(let stripe=0;stripe<4;stripe++){
      const t=(stripe+.35)/4,span=(q.w-s)/2,side=i?1:-1,bx=s/2+side*span*t,fx=-s/2+side*span*t,by=back-q.rise+q.rise*t,fy=front-q.rise+q.rise*t;
      line(c,[[bx,by],[fx,fy]],q.kind==='supplies'?p.light+'77':p.roofDark+'55',q.kind==='supplies'?10:1.3);
    }c.restore();
  }
  line(c,[backPeak,frontPeak],p.light,2);line(c,[[L-3,front+2],frontPeak,[frontR+3,front+2]],p.roofDark,2.5);
  // A short cloth skirt follows the sloping front gable instead of making
  // the whole roof read as a tall flat rectangle.
  for(let i=0;i<8;i++){const x=L+(q.w-s)*i/8,nx=L+(q.w-s)*(i+1)/8,mid=(x+nx)/2,t=Math.abs((mid+s/2)/((q.w-s)/2)),y=front-q.rise*(1-t)+2;poly(c,[[x,y],[nx,y+1],[nx-1,y+6],[mid,y+8],[x+1,y+6]],i%2?p.roof:p.roofLight,p.roofDark,1);}
}
function stall(c,q,p){
  const L=-q.w/2,R=q.w/2,s=Math.min(15,q.w*.12),frontR=R-s,h=q.wall,front=frontDepth(q);
  foundation(c,q,p);rearStore(c,q,p,front);
  // A closed cabinet and stock occupy the footprint under the canopy.
  // It is not an empty open tent with an invisible rectangular blocker.
  poly(c,[[L+4,-front+3],[R-4,-front+3],[frontR-2,-4],[L+4,-4]],WOOD_DARK,INK,1.3);
  box(c,L+4,-25,q.w-s-8,23,WOOD,INK);for(let x=L+14;x<frontR-5;x+=18)line(c,[[x,-23],[x,-4]],WOOD_LIGHT+'88',1);
  poly(c,[[L+2,-27],[frontR-1,-27],[frontR+4,-20],[L-1,-20]],WOOD_LIGHT,INK,1.3);line(c,[[L+1,-20],[frontR+2,-20]],'#e1c591',1.4);
  for(const x of [L+2,frontR-3]){box(c,x,-h,5,h-1,WOOD_DARK);line(c,[[x+1,-h],[x+1,-2]],WOOD_LIGHT,1.4);}
  for(const x of [L+s+2,R-7]){box(c,x,-front-h+3,4,h,WOOD_DARK);line(c,[[x+1,-front-h+3],[x+1,-front+2]],WOOD_LIGHT,1.1);}
  if(q.kind==='weapons'){
    blade(c,L+28,-23,-.5,.75);blade(c,L+48,-23,.35,.68);
    const x=frontR-23;poly(c,[[x-11,-28],[x,-32],[x+11,-28],[x+9,-13],[x,-7],[x-9,-13]],'#829a80',INK,1.2);poly(c,[[x,-28],[x+7,-25],[x+6,-15],[x,-11]],'#aebd94');line(c,[[x,-29],[x,-11]],'#d2d4ab',1.3);
    line(c,[[L+10,-9],[L+29,-9]],WOOD_DARK,2);oval(c,L+20,-9,2,2,'#c1ac77');
  }else{
    oval(c,L+27,-24,13,6,WOOD_DARK,INK);for(const [dx,dy,color]of [[-7,-3,'#adba72'],[1,-6,'#c5bc79'],[8,-2,'#a7b06b']])oval(c,L+27+dx,-25+dy,5,4,color,INK);
    flask(c,L+55,-28,'#a4b786',.6);flask(c,frontR-18,-27,'#baa175',.65);box(c,L+18,-17,25,10,'#9b8056');line(c,[[L+20,-15],[L+40,-15]],WOOD_LIGHT,1);
  }
  canopy(c,{...q,d:front},p);
  const signX=frontR+4,signY=-h+17;banner(c,signX,signY,q.kind,p);
}
function waypoint(c,q,p){
  const w=q.w,d=q.d,cy=-d*.5;foundation(c,q,p);poly(c,[[-w*.38,-d*.7],[0,-d+2],[w*.38,-d*.7],[w*.4,-d*.28],[0,-3],[-w*.4,-d*.28]],p.stone,INK,1.2);
  oval(c,0,cy+4,w*.29,d*.28,p.shade);oval(c,0,cy+2,w*.25,d*.24,p.light);
  poly(c,[[-13,cy+2],[-14,cy-44],[-7,cy-57],[5,cy-61],[14,cy-49],[13,cy+2],[0,cy+10]],p.stone,INK,1.5);
  poly(c,[[5,cy-61],[14,cy-49],[13,cy+2],[0,cy+10],[1,cy-48]],p.shade);poly(c,[[-14,cy-44],[-7,cy-57],[5,cy-61],[1,cy-48]],p.light);line(c,[[-12,cy-42],[-11,cy]],p.light,1.5);
  const glow='#b9dbbd',dark='#587d70';c.strokeStyle=dark;c.lineWidth=4;c.beginPath();c.ellipse(-1,cy-27,7,10,0,-Math.PI*.2,Math.PI*1.7);c.stroke();c.strokeStyle=glow;c.lineWidth=2;c.stroke();line(c,[[-1,cy-43],[-1,cy-29],[-6,cy-22]],dark,4);line(c,[[-1,cy-43],[-1,cy-29],[-6,cy-22]],glow,2);line(c,[[2,cy-14],[7,cy-8]],glow,1.6);
  for(const x of [-w*.28,w*.28])line(c,[[x,cy+3],[x*.8,cy+8]],'#c8e0bd',1.5);
}
function paintBuilding(c,q){
  let p=COLORS[q.theme]||COLORS.forest;
  if(q.kind==='rest'&&!['snow','ember','city'].includes(q.theme))p={...p,roof:'#a38367',roofLight:'#c2a17c',roofDark:'#7e6956'};
  else if(q.kind==='skills'&&!['snow','city'].includes(q.theme))p={...p,roof:'#789391',roofLight:'#a4b8a5',roofDark:'#557773'};
  c.lineCap='round';c.lineJoin='round';if(q.kind==='waypoint')waypoint(c,q,p);else if(q.kind==='skills'||q.kind==='rest')house(c,q,p);else stall(c,q,p);
}
function groundShape(c){c.beginPath();c.moveTo(-166,-35);c.bezierCurveTo(-168,-78,-119,-92,-60,-100);c.bezierCurveTo(-12,-116,39,-96,91,-95);c.bezierCurveTo(140,-92,166,-56,164,-6);c.bezierCurveTo(183,35,132,66,85,84);c.bezierCurveTo(31,97,13,113,-43,98);c.bezierCurveTo(-95,105,-131,78,-159,42);c.bezierCurveTo(-176,18,-160,-10,-166,-35);c.closePath();}
function leaf(c,x,y,s,color,a=0){c.save();c.translate(x,y);c.rotate(a);c.beginPath();c.moveTo(-s,0);c.quadraticCurveTo(0,-s*.7,s,0);c.quadraticCurveTo(0,s*.7,-s,0);c.fillStyle=color;c.fill();c.restore();}
function smallShell(c,x,y,s,p){poly(c,[[x-s,y],[x-s*.6,y-s*.6],[x,y-s*.8],[x+s*.7,y-s*.5],[x+s,y],[x,y+s*.4]],p.light,p.shade,.6);for(const dx of [-.5,0,.5])line(c,[[x,y+s*.2],[x+dx*s,y-s*.45]],p.shade,.5);}
function groundMarks(c,theme,w,h,seed=0){const p=COLORS[theme]||COLORS.forest;
  for(let i=0;i<Math.round(w*h/1400);i++){const x=5+noise(i+seed,71)*(w-10),y=5+noise(i+seed,93)*(h-10),n=noise(i+seed,119);
    if(theme==='snow'){poly(c,[[x-4,y],[x,y-3],[x+7,y-1],[x+2,y+3]],'#deeadc88');line(c,[[x-4,y],[x+4,y-2]],'#f0f3df99',.7);}
    else if(theme==='beach'){smallShell(c,x,y,1.5+n*2,p);}
    else if(['mountain','ruins','city','ember'].includes(theme)){poly(c,[[x-3,y],[x-1,y-2],[x+4,y-1],[x+2,y+2]],i%3?p.shade+'77':p.light+'a0');}
    else{leaf(c,x,y,2+n*3,p.edge,-.7+n*1.4);if(theme==='marsh'&&i%3===0)line(c,[[x-4,y+3],[x+5,y+2]],p.light+'66',.8);}
  }
}
function hull(points){const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lower=[],upper=[];for(const point of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),point)<=0)lower.pop();lower.push(point);}for(let i=sorted.length-1;i>=0;i--){const point=sorted[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),point)<=0)upper.pop();upper.push(point);}return lower.slice(0,-1).concat(upper.slice(0,-1));}

// These are the same streets used to place doors and keep the settlement free.
// Fill their union before texturing it, so overlapping aprons never leave seams.
function settlementPath(c,ground){
  c.beginPath();
  for(const plaza of ground.plazas){c.moveTo(plaza.x-plaza.width/2+12,plaza.y-plaza.depth/2);c.roundRect(plaza.x-plaza.width/2,plaza.y-plaza.depth/2,plaza.width,plaza.depth,12);}
  for(const street of ground.streets){
    const r=street.width/2;
    for(let i=1;i<street.points.length;i++){
      const a=street.points[i-1],b=street.points[i],angle=Math.atan2(b.y-a.y,b.x-a.x),dx=Math.sin(angle)*r,dy=-Math.cos(angle)*r;
      c.moveTo(a.x+dx,a.y+dy);c.lineTo(b.x+dx,b.y+dy);c.arc(b.x,b.y,r,angle-Math.PI/2,angle+Math.PI/2);c.lineTo(a.x-dx,a.y-dy);c.arc(a.x,a.y,r,angle+Math.PI/2,angle+Math.PI*1.5);c.closePath();
    }
  }
}
function settlementGround(core){
  const source=core.ground;if(!source)return null;
  const plazas=(source.plazas||[]).filter(p=>[p.x,p.y,p.width,p.depth].every(Number.isFinite)&&p.width>0&&p.depth>0).map(p=>({...p,x:p.x-core.x,y:p.y-core.y}));
  const streets=(source.streets||[]).filter(s=>Number.isFinite(s.width)&&s.width>0&&s.points?.length>1).map(s=>({width:s.width,points:s.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>({x:p.x-core.x,y:p.y-core.y}))})).filter(s=>s.points.length>1);
  if(!plazas.length&&!streets.length)return null;
  const bounds=[];for(const p of plazas)bounds.push([p.x-p.width/2,p.y-p.depth/2],[p.x+p.width/2,p.y+p.depth/2]);for(const s of streets)for(const p of s.points)bounds.push([p.x-s.width/2,p.y-s.width/2],[p.x+s.width/2,p.y+s.width/2]);
  const minX=Math.floor(Math.min(...bounds.map(p=>p[0]))-8),minY=Math.floor(Math.min(...bounds.map(p=>p[1]))-8),maxX=Math.ceil(Math.max(...bounds.map(p=>p[0]))+8),maxY=Math.ceil(Math.max(...bounds.map(p=>p[1]))+8);
  return{plazas,streets,minX,minY,w:maxX-minX,h:maxY-minY,key:JSON.stringify([plazas,streets])};
}
function paintSettlementGround(c,ground,p,theme){
  settlementPath(c,ground);c.strokeStyle=p.shade+'b8';c.lineWidth=8;c.stroke();c.fillStyle=p.ground;c.fill();c.save();c.clip();
  const tw=42,th=28;
  for(let row=Math.floor(ground.minY/th);row<=Math.ceil((ground.minY+ground.h)/th);row++)for(let col=Math.floor(ground.minX/tw)-1;col<=Math.ceil((ground.minX+ground.w)/tw);col++){
    const x=col*tw+(row%2)*tw/2,y=row*th,n=noise(col+57,row+19);
    poly(c,[[x+1.5,y+1.5],[x+40,y+1],[x+40.5,y+25.5],[x+2,y+26]],n>.78?p.light+'a6':n>.32?p.stone:p.stone+'c4');
    line(c,[[x+3,y+3],[x+38,y+2]],p.light+'c0',1);line(c,[[x+40,y+3],[x+40,y+25],[x+3,y+26]],p.shade+'70',.8);
    if(n>.9)line(c,[[x+27,y+2],[x+25,y+7],[x+29,y+11]],p.shade+'80',.8);
  }
  // Larger inset stones anchor the square without adding a raised obstacle.
  for(const plaza of ground.plazas){if(plaza.width<160||plaza.depth<140)continue;const rx=Math.min(46,plaza.width*.18),ry=Math.min(34,plaza.depth*.18),x=plaza.x,y=plaza.y;poly(c,[[x-rx,y],[x,y-ry],[x+rx,y],[x,y+ry]],p.shade+'7a',p.light+'99',1.4);poly(c,[[x-rx+8,y],[x,y-ry+6],[x+rx-8,y],[x,y+ry-6]],p.stone,p.ground,1);line(c,[[x-rx+8,y],[x+rx-8,y]],p.light,1);line(c,[[x,y-ry+6],[x,y+ry-6]],p.light,1);}
  if(theme==='snow'){c.globalAlpha=.18;c.translate(ground.minX,ground.minY);groundMarks(c,theme,ground.w,ground.h,43);}c.restore();
}

export class WorldHubArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.bytes=0;this.builds=0;this.groundRecords=new WeakMap();}
  get cacheStats(){return{entries:this.cache.size,bytes:this.bytes,limitBytes:LIMIT_BYTES,builds:this.builds};}
  _stamp(key,w,h,ox,oy,paint,ratio=1.5){
    let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const canvas=this.makeCanvas();canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,ox*ratio,oy*ratio);c.lineCap='round';c.lineJoin='round';paint(c);
    image={canvas,w,h,ox,oy,bytes:canvas.width*canvas.height*4};while(this.cache.size&&this.bytes+image.bytes>LIMIT_BYTES){const oldest=this.cache.keys().next().value,entry=this.cache.get(oldest);this.bytes-=entry.bytes;entry.canvas.width=entry.canvas.height=0;this.cache.delete(oldest);}this.cache.set(key,image);this.bytes+=image.bytes;this.builds++;return image;
  }
  _building(q){const ox=q.w/2+10,oy=topOf(q),w=ox*2,h=oy+13;return this._stamp(`building:${q.kind}:${q.theme}:${q.w}:${q.d}`,w,h,ox,oy,c=>paintBuilding(c,q));}
  drawSettlement(c,site,{player,footY=player?.y+19.8,labels=true}={}){
    const q=spec(site);if(!q)return false;const image=this._building(q),behind=player&&footY<site.y+3&&footY>site.y-image.oy&&Math.abs(player.x-site.x)<q.w/2+12;
    c.save();c.globalAlpha*=behind?.48:1;c.drawImage(image.canvas,site.x-image.ox,site.y-image.oy,image.w,image.h);c.restore();
    if(labels){c.save();c.textAlign='center';c.font='600 10px system-ui,sans-serif';c.strokeStyle='#2d4537';c.lineWidth=3;c.fillStyle='#e5dcb7';const text=site.name||({weapons:'武器铺',skills:'术法屋',supplies:'补给铺',rest:'休憩小屋',waypoint:'传送石'}[q.kind]);c.strokeText(text,site.x,site.y+24);c.fillText(text,site.x,site.y+24);c.restore();}return true;
  }
  drawShadowPath(c,site,sun){
    const q=spec(site);if(!q)return false;const h=q.kind==='waypoint'?55:q.wall+q.rise*.5,sx=sun.x*h,sy=sun.y*h,L=site.x-q.w/2,R=site.x+q.w/2,B=site.y-q.d,F=site.y;
    const points=[[L,B],[R,B],[R,F],[L,F]],outline=hull([...points,...points.map(([x,y])=>[x+sx,y+sy])]);outline.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();return true;
  }
  drawGround(c,core){
    if(!core||!Number.isFinite(core.x)||!Number.isFinite(core.y))return false;
    if(core?.ground){
      let record=this.groundRecords.get(core);if(!record||record.source!==core.ground){record={source:core.ground,ground:settlementGround(core)};this.groundRecords.set(core,record);}
      if(record.ground){const ground=record.ground,theme=core.artTheme||'forest',p=COLORS[theme]||COLORS.forest,ratio=Math.min(1,Math.sqrt(1_500_000/(ground.w*ground.h))),image=this._stamp(`streets:${theme}:${ground.key}`,ground.w,ground.h,-ground.minX,-ground.minY,g=>paintSettlementGround(g,ground,p,theme),ratio);c.drawImage(image.canvas,core.x+ground.minX,core.y+ground.minY,image.w,image.h);return true;}
    }
    if(!core||!Number.isFinite(core.x)||!Number.isFinite(core.y))return false;const theme=core.artTheme||'forest',kind=core.kind||'camp',p=COLORS[theme]||COLORS.forest,paved=['town','city','village','settlement'].includes(kind),key=`ground:${theme}:${paved?'paved':'earth'}`;
    const image=this._stamp(key,384,300,192,150,g=>{
      groundShape(g);g.fillStyle=p.ground+'38';g.fill();g.save();groundShape(g);g.clip();
      if(paved){
        for(let row=0,y=-94;y<100;y+=31,row++)for(let x=-156;x<163;x+=42){const xx=x+(row%2)*21,n=noise(x,row+7);if((Math.abs(xx)>130||Math.abs(y)>72)&&n>.57)continue;poly(g,[[xx+2,y+3],[xx+38,y+2],[xx+39,y+28],[xx+3,y+29]],n>.5?p.stone+'68':p.shade+'42');line(g,[[xx+4,y+4],[xx+37,y+3]],p.light+'8c',.8);}
      }else{
        for(let i=0;i<7;i++){const x=-110+noise(i,31)*220,y=-60+noise(i,43)*120;oval(g,x,y,29+noise(i,9)*31,12+noise(i,19)*19,p.ground+'13');}
        for(let i=0;i<10;i++){const x=-90+noise(i,51)*180,y=-50+noise(i,67)*100;poly(g,[[x-7,y],[x-4,y-4],[x+8,y-3],[x+10,y+2],[x,y+5]],p.stone+'77');line(g,[[x-4,y-4],[x+8,y-3]],p.light+'88',.8);}
      }
      g.translate(-164,-102);groundMarks(g,theme,328,204,21);g.restore();
      const gradient=g.createRadialGradient(0,0,62,0,0,173);gradient.addColorStop(0,'#fff');gradient.addColorStop(.66,'#ffffffee');gradient.addColorStop(1,'#ffffff00');g.globalCompositeOperation='destination-in';g.fillStyle=gradient;g.fillRect(-192,-150,384,300);
    },1);
    const scale=Math.max(.65,Math.min(1.4,finite(core.radius,380)*.95/384));c.drawImage(image.canvas,core.x-image.ox*scale,core.y-image.oy*scale,image.w*scale,image.h*scale);return true;
  }
  drawTransition(c,endpoint){
    const transition=endpoint?.transition,direction=endpoint?.arrivalDirection;if(!transition||!direction)return false;const length=Math.max(40,Math.min(480,finite(transition.length,320))),width=Math.max(30,Math.min(300,finite(transition.width,180))),theme=transition.theme||'forest',p=COLORS[theme]||COLORS.forest;
    const image=this._stamp(`transition:${theme}:${width}:${length}`,width,length,0,0,g=>{
      g.fillStyle=p.ground;g.fillRect(0,0,width,length);groundMarks(g,theme,width,length,63);
      for(let i=0;i<7;i++){const x=width*.2+noise(i,71)*width*.6,y=noise(i,89)*length;line(g,[[x-7,y],[x+12,y-2]],p.light+'44',1);}
      const along=g.createLinearGradient(0,0,0,length);along.addColorStop(0,'#ffffff00');along.addColorStop(.08,'#ffffff66');along.addColorStop(.28,'#ffffff55');along.addColorStop(1,'#ffffff00');g.globalCompositeOperation='destination-in';g.fillStyle=along;g.fillRect(0,0,width,length);
      const across=g.createLinearGradient(0,0,width,0);across.addColorStop(0,'#ffffff00');across.addColorStop(.24,'#ffffffff');across.addColorStop(.76,'#ffffffff');across.addColorStop(1,'#ffffff00');g.fillStyle=across;g.fillRect(0,0,width,length);
    },1);
    c.save();c.translate(endpoint.x,endpoint.y);c.rotate(Math.atan2(direction.y,direction.x)-Math.PI/2);c.drawImage(image.canvas,-width/2,0,width,length);c.restore();return true;
  }
}
