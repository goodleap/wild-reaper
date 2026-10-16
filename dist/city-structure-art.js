// Shared, foot-anchored city modules. The baked ground polygons own collision;
// these stamps never turn a rectangular building into a capsule obstacle.
const TAU=Math.PI*2,MAX_PIXELS=6*1024*1024;
const KINDS=new Set(['house','keep','wing','barracks','warehouse','stable','workshop','cathedral','church','school','belltower','wall','tower','gatepost','arcade','gate','statue','fountain','market','cart','lamp','banner','planter','ruin','sewer']);
const SMALL=new Set(['statue','fountain','market','cart','lamp','banner','planter','sewer']);
const P=Object.freeze({stone:'#aaa991',light:'#d5d0af',shade:'#72796f',dark:'#3c4a47',mortar:'#70796a',roof:'#526e7b',roofLight:'#78929b',roofDark:'#334c5a',wood:'#786b50',woodLight:'#ae9870',metal:'#a88e52',gold:'#dec387',moss:'#73845a',flag:'#3c6071',water:'#729c9c'});
const finite=(n,f)=>Number.isFinite(n)?n:f;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const line=(c,a,b,color,width=1)=>{c.beginPath();c.moveTo(...a);c.lineTo(...b);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const poly=(c,pts,fill,edge=null,width=1)=>{c.beginPath();pts.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const ellipse=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fillStyle=color;c.fill();};
function rect(c,x,y,w,h,fill){c.fillStyle=fill;c.fillRect(x,y,w,h);}
function archPath(c,x,y,w,h){const r=Math.min(w/2,h);c.beginPath();c.moveTo(x-w/2,y);c.lineTo(x-w/2,y-h+r);c.arc(x,y-h+r,r,Math.PI,0);c.lineTo(x+w/2,y);c.closePath();}
function arch(c,x,y,w,h,fill,edge,width=1){archPath(c,x,y,w,h);if(fill){c.fillStyle=fill;c.fill();}if(edge){c.lineWidth=width;c.strokeStyle=edge;c.stroke();}}
function normalize(prop){
  const raw=prop.cityKind||'house',kind=raw==='church'?'cathedral':raw==='gatepost'?'tower':raw;
  const style=/^keep-[ns][we]$/.test(prop.style)?1:typeof prop.style==='number'?Math.abs(Math.floor(prop.style))%6:String(prop.style||'').split('').reduce((a,b)=>a+b.charCodeAt(0),0)%6;
  return{kind,w:Math.max(4,finite(prop.width,SMALL.has(kind)?40:240)),d:Math.max(4,finite(prop.depth,SMALL.has(kind)?28:160)),h:Math.max(0,finite(prop.height,SMALL.has(kind)?38:90)),v:style,style:String(prop.style||'')};
}

// Terrain consumes the relative extents too, so culling, roof fading, shadow
// coverage and the actual cached image all describe the same projection.
export function cityStructureVisual(prop){
  const {w,d,h}=normalize(prop),x=finite(prop.x,0),y=finite(prop.y,0),halfWidth=w/2+5,top=d/2+h+6,bottom=d/2+5;
  return{halfWidth,top,bottom,canopyX:0,canopyY:-h*.5,canopyRx:w/2+3,canopyRy:(d+h)*.5,shadowWidth:w*.43,shadowLength:h*.42+d*.15,shadowOffset:d*.25,
    maxBounds:{minX:x-halfWidth,minY:y-top,maxX:x+halfWidth,maxY:y+bottom},canopy:{x,y:y-h*.5,rx:w/2+3,ry:(d+h)*.5},shadow:{x,y:y+d*.25,rx:w*.43,ry:h*.42+d*.15},sortY:y+d/2};
}

function stoneFace(c,x,y,w,h,v=0,{shade=false,large=false}={}){
  if(w<=0||h<=0)return;
  const base=shade?'#7d8576':['#acac95','#b8b59b','#aaa995','#a5ad99','#b4b199','#a9aa91'][v%6];
  rect(c,x,y,w,h,base);
  c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
  const row=large?15:12,col=large?32:26;
  for(let gy=-1;gy<=h/row;gy++)for(let gx=-1;gx<=w/col;gx++){
    const xx=x+gx*col+(gy%2)*col*.5,yy=y+gy*row,n=hash(gx+v*5,gy+17);
    rect(c,xx+1.1,yy+1.2,col-2.1,row-2.2,(shade?['#89907e','#788374','#858b79','#949880']:['#b4b29a','#c1bda2','#aaa990','#a7ad95'])[Math.floor(n*4)]);
    line(c,[xx+2,yy+1.3],[xx+col-2,yy+1.3],shade?'#bec6a132':'#e8e1bb80',.7);
    if(n>.76)line(c,[xx+col*.67,yy+1],[xx+col*.58,yy+5],shade?'#485d4b6a':'#72796762',.7);
  }
  for(let i=0;i<Math.ceil(w*h/190);i++){
    const xx=x+hash(i+v,83)*w,yy=y+hash(i+v,101)*h;
    rect(c,xx,yy,.6+hash(i,8)*1.7,.5+hash(i,5),i%3?'#f1e6ba1c':'#364c3b28');
  }
  c.restore();
  line(c,[x,y],[x+w,y],P.light,1);line(c,[x+w,y],[x+w,y+h],P.dark,1.2);
}
function masonry(c,x,y,w,h,v){stoneFace(c,x,y,w,h,v);line(c,[x,y+h],[x+w,y+h],P.dark,1.4);}
function moss(c,x,y,w,v){
  for(let i=0;i<Math.max(3,w/15);i++){
    const xx=x+hash(i+v,77)*w,yy=y-hash(i+v,39)*5;
    ellipse(c,xx,yy,1.4+hash(i,2)*2.7,.8+hash(i,9)*1.4,i%2?'#91a16b9c':'#5c765bba');
    if(i%4===0)line(c,[xx,yy],[xx-2,yy-6-hash(i,5)*8],'#536e4b',1.2);
  }
}
function ivy(c,x,y,h,v){
  for(let branch=0;branch<3;branch++){
    const xx=x+(branch-1)*4,hh=h*(.45+hash(branch+v,27)*.5);line(c,[xx,y],[xx+2,y-hh],'#4f6d4f',.9);
    for(let k=0;k<hh;k+=5){const side=Math.floor(k/5)%2?1:-1;ellipse(c,xx+side*3,y-k,2.6+hash(k,v)*1.4,1.8,side<0?'#7c9261':'#627e56');}
  }
}
function window(c,x,y,w,h,v=0,{lit=false,gothic=false}={}){
  const rim=2;arch(c,x,y,w+rim*2,h+rim*1.7,P.shade,P.dark,1);arch(c,x,y-1,w,h,lit?'#bead79':'#30464b',P.light,.8);
  c.save();archPath(c,x,y-1,w,h);c.clip();
  rect(c,x-w*.42,y-h+2,w*.28,h-3,lit?'#f1d99b':'#7d9690');
  line(c,[x,y-h],[x,y-1],P.metal,gothic?1.7:1.1);line(c,[x-w/2,y-h*.42],[x+w/2,y-h*.42],P.woodLight,1);
  if(gothic){line(c,[x-w*.35,y-h*.65],[x,y-h*.83],P.metal,.9);line(c,[x+w*.35,y-h*.65],[x,y-h*.83],P.metal,.9);}
  c.restore();rect(c,x-w*.6,y+1,w*1.2,2.6,P.light);line(c,[x-w*.6,y+4],[x+w*.6,y+4],P.shade,1);
}
function door(c,x,y,w,h,v=0,{grand=false,open=false}={}){
  arch(c,x,y,w+8,h+5,P.light,P.shade,1.2);arch(c,x,y,w,h,open?'#273c3b':'#625e4d',P.dark,1.2);
  if(!open){c.save();archPath(c,x,y,w,h);c.clip();for(let xx=x-w/2+3;xx<x+w/2;xx+=6)line(c,[xx,y-h],[xx,y],xx<x?'#9b8f6c':'#81795b',.8);line(c,[x,y-h],[x,y],P.dark,1.3);
    for(const yy of[y-h*.25,y-h*.7]){rect(c,x-w/2,yy,w,grand?2.8:2,P.dark);for(const xx of[x-w*.35,x+w*.35])ellipse(c,xx,yy+1,.7,.7,P.gold);}
    for(const xx of[x-w*.1,x+w*.1]){c.beginPath();c.ellipse(xx,y-h*.41,grand?2.4:1.5,grand?3:1.8,0,0,TAU);c.strokeStyle=P.gold;c.lineWidth=.9;c.stroke();}c.restore();
  }
  line(c,[x-w*.6,y+1],[x+w*.6,y+1],P.light,2.5);
  if(grand){const top=y-h+3;line(c,[x,top+7],[x,top+24],P.metal,2);line(c,[x-6,top+14],[x+6,top+14],P.metal,2);}
}
function lantern(c,x,y,s=1){
  line(c,[x,y-7*s],[x,y-18*s],P.dark,2*s);line(c,[x-4*s,y-18*s],[x+5*s,y-18*s],P.metal,1.5*s);
  poly(c,[[x-4*s,y-12*s],[x-3*s,y-3*s],[x+3*s,y-3*s],[x+4*s,y-12*s]],'#d9b366',P.dark,s);
  rect(c,x-2*s,y-11*s,4*s,7*s,'#f3d799');line(c,[x,y-11*s],[x,y-3*s],P.metal,.8*s);ellipse(c,x,y-14*s,2*s,1.2*s,P.metal);
}
function flag(c,x,y,w,h,v=0){
  line(c,[x-w*.65,y],[x+w*.65,y],P.metal,1.6);for(const a of[-1,1])ellipse(c,x+a*w*.65,y,1.8,1.8,P.gold);
  poly(c,[[x-w/2,y+2],[x+w/2,y+2],[x+w/2,y+h-5],[x,y+h],[x-w/2,y+h-5]],v%3===1?'#526e69':P.flag,P.gold,.8);
  line(c,[x,y+7],[x,y+h-8],P.gold,1);line(c,[x-w*.22,y+h*.37],[x+w*.22,y+h*.37],P.gold,1);poly(c,[[x,y+h*.2],[x+3,y+h*.37],[x,y+h*.55],[x-3,y+h*.37]],null,P.gold,.8);
}
function roof(c,w,d,h,v,{flat=false,cathedral=false}={}){
  const L=-w/2,R=w/2,B=-d/2,F=d/2,wallH=h*(flat?.78:cathedral?.58:.52),e=2.5;
  if(flat){const t=B-h;poly(c,[[L,t],[R,t],[R,F-h],[L,F-h]],'#929b88',P.dark,1.4);line(c,[L+3,t+4],[R-3,t+4],P.light,1.5);for(let yy=t+14;yy<F-h;yy+=21)line(c,[L+4,yy],[R-4,yy],'#68776860',.8);return;}
  const back=B-wallH,front=F-wallH,ridge=B-h,edgeY=front,cap=6;
  const rear=[[L-e,back],[L+cap,ridge],[R-cap,ridge],[R+e,back]],frontFace=[[L+cap,ridge],[R-cap,ridge],[R+e,edgeY],[L-e,edgeY]];
  poly(c,rear,P.roofDark,P.dark,1.3);poly(c,frontFace,['#526d7b','#5a7581','#4a6878','#5b7580','#526f7c','#607c85'][v],P.dark,1.4);
  c.save();poly(c,frontFace,null);c.clip();
  const rows=Math.max(3,Math.ceil((edgeY-ridge)/10)),step=(edgeY-ridge)/rows;
  for(let row=0;row<rows;row++){
    const yy=ridge+row*step,lo=L-e+(1-row/rows)*cap,hi=R+e-(1-row/rows)*cap;
    for(let xx=lo-20+(row%2)*11;xx<hi+20;xx+=22){
      const n=hash(Math.floor(xx/22)+v*3,row);
      poly(c,[[xx+1,yy+.6],[xx+21,yy+.6],[xx+22,yy+step-.6],[xx,yy+step-.6]],n>.75?'#688590':n<.2?'#425f70':'#567583');
      line(c,[xx+2,yy+1.3],[xx+20,yy+1.3],'#a6bac181',.7);line(c,[xx+1,yy+step-1],[xx+21,yy+step-1],'#294754b8',.8);
      if(n>.92)line(c,[xx+10,yy+2],[xx+13,yy+step-2],'#233f4d',.7);
    }
  }c.restore();
  rect(c,L+cap-1,ridge-1,w-cap*2+2,3.5,P.roofLight);line(c,[L-e,edgeY+.5],[R+e,edgeY+.5],P.dark,2.3);line(c,[L,edgeY-1],[R,edgeY-1],'#92a8ac',1);
  for(let xx=L+cap;xx<R-cap;xx+=19)line(c,[xx,ridge],[xx+1,ridge+2.5],P.roofDark,.7);
}
function building(c,q){
  const {kind,w,d,h,v}=q,L=-w/2,R=w/2,B=-d/2,F=d/2,castle=['keep','wing','barracks'].includes(kind),church=kind==='cathedral',wallH=h*(church?.58:.52),frontTop=F-wallH;
  stoneFace(c,L,B-wallH,w,d+wallH,v,{large:castle});
  // Side accents stay inside the baked footprint horizontally; the only
  // extension into the screen is the upward projection of these same walls.
  rect(c,R-7,B-wallH,7,d+wallH,P.shade);line(c,[L,F],[R,F],P.dark,2);rect(c,L,F-5,w,5,'#848d7b');line(c,[L,F-5],[R,F-5],P.light,1.2);
  const timber=['house','workshop','warehouse','stable','school'].includes(kind);
  if(timber){for(let x=L+5;x<R;x+=Math.max(46,w/4)){rect(c,x,frontTop,3,wallH-2,P.wood);line(c,[x+.5,frontTop],[x+.5,F-5],P.woodLight,.7);}rect(c,L,frontTop+wallH*.54,w,3,P.wood);}
  else {for(const x of[L+4,R-13]){stoneFace(c,x,frontTop-3,9,wallH,v+1);line(c,[x,frontTop],[x,F-3],P.light,1);}}
  const doorW=Math.min(castle?48:church?42:28,w*.2),doorH=Math.min(wallH-5,castle?56:church?62:37),cols=Math.max(2,Math.floor(w/61));
  for(let i=0;i<cols;i++){
    const x=L+(i+.5)*w/cols;if(Math.abs(x)<doorW*.8)continue;
    window(c,x,F-wallH*.35,Math.min(16,w/cols*.29),Math.min(wallH*.43,church?38:28),v,{gothic:church,lit:(i+v)%4===0});
  }
  if(kind!=='stable')door(c,0,F-2,doorW,doorH,v,{grand:castle||church});
  else{for(const x of[-w*.26,w*.26])door(c,x,F-2,Math.min(43,w*.24),doorH,v,{open:true});}
  roof(c,w,d,h,v,{cathedral:church});
  if(castle||church){
    const by=frontTop+3;for(const x of[-w*.32,w*.32]){flag(c,x,by,Math.min(19,w*.08),Math.max(20,wallH*.52),v);lantern(c,x*.68,F-wallH*.15,.75);}
    if(kind==='keep'){
      // Corner turrets and the raised entrance break the long main roof into
      // a fortress silhouette while remaining inside its true occupied block.
      const tw=Math.min(39,w*.12),th=h*.8;
      for(const x of[L+3,R-tw-3]){masonry(c,x,F-th,tw,th-3,v);rect(c,x+tw-6,F-th,6,th-3,P.shade);battlements(c,x,x+tw,F-th-2,v,5);window(c,x+tw*.5,F-h*.18,7,h*.28,v);}
      const gw=Math.min(92,w*.22),gh=h*.71;
      masonry(c,-gw/2,F-gh,gw,gh-3,v);poly(c,[[-gw/2-3,F-gh],[0,F-gh-23],[gw/2+3,F-gh]],P.stone,P.dark,1.2);line(c,[-gw/2,F-gh],[0,F-gh-21],P.light,1.2);
      door(c,0,F-2,Math.min(48,gw*.55),gh*.77,v,{grand:true});
      for(const x of[-gw*.65,gw*.65]){flag(c,x,F-h*.63,Math.min(17,w*.04),h*.4,v);lantern(c,x,F-9,.8);}
      for(const x of[-w*.31,w*.31]){const yy=B-h*.45;poly(c,[[x-13,yy],[x,yy-19],[x+13,yy]],P.roofDark,P.dark,1);masonry(c,x-10,yy,20,15,v);window(c,x,yy+11,7,10,v);}
      for(const x of[L+10,R-18]){masonry(c,x,B-h+3,8,15,v);rect(c,x-1,B-h+1,10,4,P.light);}
    }
  }
  if(church){
    const yy=B-h-1;line(c,[0,yy],[0,yy-3],P.metal,1.8); // cross remains inside visual padding
    for(const x of[L+8,R-16]){rect(c,x,frontTop-6,8,wallH+3,P.stone);rect(c,x-2,frontTop-9,12,4,P.light);}
    const gw=Math.min(w*.42,90),gy=F-h*.84;
    poly(c,[[-gw/2,F-4],[-gw/2,frontTop],[0,gy],[gw/2,frontTop],[gw/2,F-4]],P.stone,P.dark,1.2);
    line(c,[-gw/2,frontTop],[0,gy],P.light,1.5);line(c,[0,gy],[gw/2,frontTop],P.light,1.1);
    const rr=Math.min(11,gw*.16);ellipse(c,0,frontTop-2,rr+2,rr+2,P.shade);ellipse(c,0,frontTop-2,rr,rr,'#6b9394');
    for(let i=0;i<8;i++){const a=i*TAU/8;line(c,[0,frontTop-2],[Math.cos(a)*rr,frontTop-2+Math.sin(a)*rr],P.gold,.7);}door(c,0,F-2,Math.min(33,gw*.45),h*.42,v,{grand:true});
  }
  if(kind==='workshop'){
    const x=w*.3,yy=B-h*.76;stoneFace(c,x,yy-12,12,22,v);rect(c,x-2,yy-15,16,4,P.light);ellipse(c,x+6,yy-13,4,1.3,P.dark);lantern(c,-doorW,F-8,.7);
  }
  if(kind==='warehouse'){for(const x of[-w*.35,w*.35]){rect(c,x-7,F-15,15,12,P.wood);line(c,[x-5,F-13],[x+6,F-5],P.woodLight,1);}}
  moss(c,L+5,F-1,w-10,v);
  if(v%2===0)ivy(c,L+13,F-5,wallH*.7,v);
}
function battlements(c,L,R,y,v,depth=7){
  rect(c,L,y,R-L,depth,P.stone);line(c,[L,y],[R,y],P.light,1);
  const count=Math.max(2,Math.round((R-L)/24)),unit=(R-L)/count;
  for(let i=0;i<count;i++){const x=L+i*unit;masonry(c,x,y-7,unit*.57,8,v);rect(c,x,y-8,unit*.57,2,P.light);}
}
function wall(c,q){
  const {w,d,h,v}=q,L=-w/2,R=w/2,B=-d/2,F=d/2;
  masonry(c,L,B-h,w,d+h,v);rect(c,L,F-5,w,5,P.shade);line(c,[L,F-5],[R,F-5],P.light,1);
  poly(c,[[L+2,B-h],[R-2,B-h],[R-2,F-h],[L+2,F-h]],'#9ca58e',P.dark,1);
  battlements(c,L,R,B-h+2,v,Math.min(d,9));battlements(c,L,R,F-h,v,5);
  for(let x=L+18;x<R-8;x+=73)window(c,x,F-h*.27,4,12,v);
  moss(c,L+2,F-2,w-4,v);
}
function tower(c,q){
  const {w,d,h,v}=q,L=-w/2,R=w/2,B=-d/2,F=d/2,clock=q.kind==='belltower';
  if(clock){
    const sw=Math.min(w*.64,95),SL=-sw/2,SR=sw/2,top=B-h;
    stoneFace(c,L,F-13,w,13,v);line(c,[L,F-14],[R,F-14],P.light,2);
    masonry(c,SL,top+h*.24,sw,F-top-h*.24-3,v);rect(c,SR-8,top+h*.24,8,F-top-h*.24-3,P.shade);
    for(const x of[SL+2,SR-7]){rect(c,x,top+h*.22,5,F-top-h*.22-4,P.light);}
    poly(c,[[SL-5,top+h*.27],[0,top],[SR+5,top+h*.27]],P.roof,P.dark,1.4);line(c,[SL-4,top+h*.27],[SR+4,top+h*.27],P.roofLight,1.5);
    const bellY=top+h*.63;arch(c,0,bellY,sw*.42,h*.27,P.dark,P.light,2);
    poly(c,[[-sw*.1,bellY-3],[-sw*.07,bellY-h*.18],[sw*.07,bellY-h*.18],[sw*.1,bellY-3]],P.metal,P.dark,.8);ellipse(c,0,bellY-3,sw*.13,2,P.gold);line(c,[0,bellY-h*.2],[0,bellY-h*.25],P.wood,1.4);
    const cy=top+h*.9,rr=Math.min(sw*.24,h*.16);ellipse(c,0,cy,rr+2,rr+2,P.dark);ellipse(c,0,cy,rr,rr,'#d1c49c');
    for(let i=0;i<12;i++){const a=i*TAU/12;line(c,[Math.sin(a)*rr*.75,cy-Math.cos(a)*rr*.75],[Math.sin(a)*rr*.89,cy-Math.cos(a)*rr*.89],P.dark,.9);}
    line(c,[0,cy],[rr*.5,cy-rr*.17],P.dark,1.6);line(c,[0,cy],[0,cy-rr*.64],P.dark,1.2);door(c,0,F-2,Math.min(25,sw*.35),Math.min(37,h*.34),v);moss(c,L+3,F-1,w-6,v);return;
  }
  masonry(c,L,B-h*.64,w,d+h*.64,v);rect(c,R-7,B-h*.64,7,d+h*.64,P.shade);
  for(const x of[L+3,R-9]){rect(c,x,B-h*.7,6,d+h*.7,P.stone);line(c,[x,B-h*.7],[x,F-3],P.light,1);}
  for(const x of[-w*.25,w*.25])window(c,x,F-h*.13,Math.min(11,w*.16),h*.22,v,{gothic:true});
  if(clock){
    roof(c,w,d,h,v);const cy=F-h*.43,rr=Math.min(w*.26,h*.17);
    ellipse(c,0,cy,rr+2,rr+2,P.dark);ellipse(c,0,cy,rr,rr,'#d3c79e');ellipse(c,0,cy,rr-2,rr-2,'#b5b69d');
    for(let i=0;i<12;i++){const a=i*TAU/12;line(c,[Math.sin(a)*rr*.77,cy-Math.cos(a)*rr*.77],[Math.sin(a)*rr*.9,cy-Math.cos(a)*rr*.9],P.dark,1);}
    line(c,[0,cy],[rr*.48,cy-rr*.13],P.dark,1.6);line(c,[0,cy],[0,cy-rr*.65],P.dark,1.2);ellipse(c,0,cy,1.5,1.5,P.metal);
  }else{
    poly(c,[[L,B-h],[R,B-h],[R,F-h],[L,F-h]],'#98a28c',P.dark,1);
    battlements(c,L,R,B-h+1,v,5);battlements(c,L,R,F-h,v,5);
    for(const x of[L,R-6]){rect(c,x,B-h+1,6,d-2,P.stone);line(c,[x,B-h+2],[x,F-h],P.light,1);}
  }
  moss(c,L+4,F-1,w-8,v);
}
function openArcade(c,q){
  const {w,d,h,v}=q,L=-w/2,R=w/2,B=-d/2,F=d/2,pier=Math.min(22,w*.14),rise=Math.min(h*.72,w*.32),spring=F-h+rise;
  if(w<d){
    // Side-facing gate: its ground supports are at the north and south ends.
    // Height remains northward instead of rotating the whole projected sprite.
    const dp=Math.min(24,d*.14);
    for(const y of[B,F-dp]){masonry(c,L,y-h,w,dp+h,v);battlements(c,L,R,y-h,v,5);for(const x of[L+6,R-6])line(c,[x,y-h+5],[x,y+dp-4],P.light,.7);}
    // Broken overhead stone lips make the side opening readable from above
    // without painting a false solid rectangle over its ground-level gap.
    for(const x of[L,R-7]){rect(c,x,B-h+4,7,dp+10,P.stone);rect(c,x,F-dp-h-10,7,dp+8,P.stone);}
    for(const y of[B+dp,F-dp]){line(c,[L+3,y],[R-3,y],P.light,1.5);}
    lantern(c,L+10,F-6,.8);return;
  }
  // Real negative space below the arch: no ground-colored rectangle or closed
  // door hides the route between the separate collision piers.
  for(const x of[L,R-pier]){masonry(c,x,B-h*.35,pier,d+h*.35,v);rect(c,x-1,F-h*.36,pier+2,4,P.light);}
  c.beginPath();c.moveTo(L,F-h);c.lineTo(R,F-h);c.lineTo(R,F);c.lineTo(R-pier,F);c.lineTo(R-pier,spring);
  c.bezierCurveTo(R-pier,F-h+3,L+pier,F-h+3,L+pier,spring);c.lineTo(L+pier,F);c.lineTo(L,F);c.closePath();c.fillStyle=P.stone;c.fill();c.strokeStyle=P.dark;c.lineWidth=1.1;c.stroke();
  // Shallow rows and radiating voussoirs give the lintel its own readable mass.
  line(c,[L,F-h+3],[R,F-h+3],P.light,1.4);
  const radius=(w-pier*2)/2,cy=spring;
  for(let i=0;i<=10;i++){const a=Math.PI+i*Math.PI/10;line(c,[Math.cos(a)*(radius+2),cy+Math.sin(a)*rise],[Math.cos(a)*(radius+9),cy+Math.sin(a)*(rise+7)],'#667468',1);}
  if(q.kind==='gate'){battlements(c,L,R,F-h,v,6);for(const x of[L+pier/2,R-pier/2]){flag(c,x,F-h*.67,Math.min(14,pier*.65),h*.3,v);lantern(c,x,F-8,.8);}}
  else{roof(c,w,Math.min(d,24),Math.min(h,35),v);}
}
function planter(c,q){
  const {w,d,h,v}=q;ellipse(c,0,0,w*.49,d*.49,'#526b4e50');rect(c,-w/2,-d/2,w,d,P.shade);rect(c,-w/2,-d/2-h*.2,w,d,P.stone);rect(c,-w/2+3,-d/2-h*.2+3,w-6,d-6,'#58674c');
  for(let i=0;i<Math.max(6,w/5);i++){const x=(hash(i+v,17)-.5)*(w-8),y=(hash(i,27)-.5)*(d-8)-h*.3;ellipse(c,x,y,4+hash(i,8)*3,2.8+hash(i,9)*2,['#698458','#8d9c69','#536f4f'][i%3]);if(i%5===0)ellipse(c,x+1,y-1,1.4,1.2,'#d9d2a0');}
  line(c,[-w/2,-d/2-h*.2],[w/2,-d/2-h*.2],P.light,1.3);
}
function statue(c,q){
  const {w,d,h,v}=q,rx=w*.46,ry=d*.46;
  ellipse(c,0,0,rx,ry,P.shade);ellipse(c,0,-3,rx,ry,P.light);ellipse(c,0,-5,rx*.83,ry*.78,P.stone);
  const body=Math.min(w*.34,h*.23),yy=-h*.28;
  poly(c,[[-body,-5],[-body*.8,yy],[-body*.3,-h*.7],[body*.5,-h*.7],[body*.8,yy],[body,-5]],'#98a18d',P.dark,1.1);
  poly(c,[[-body,-5],[-body*.8,yy],[-body*.3,-h*.7],[0,-h*.68],[-body*.13,yy],[0,-5]],'#c7c7aa');
  ellipse(c,body*.12,-h*.82,body*.45,h*.105,'#b9bca3');poly(c,[[-body*.3,-h*.85],[0,-h*.97],[body*.6,-h*.88],[body*.4,-h*.76]],'#c7c9ae',P.shade,.8);
  line(c,[body*.65,-h*.58],[body*1.1,-h*.12],P.shade,4);line(c,[body*.7,-h*.63],[body*1.2,-h*.28],P.light,3);line(c,[-body*.6,-h*.48],[-body*.2,-h*.16],P.shade,2);
  moss(c,-rx*.7,-2,rx*1.4,v);
}
function fountain(c,q){
  const {w,d,h,v}=q,rx=w*.49,ry=d*.49;
  ellipse(c,0,0,rx,ry,P.shade);ellipse(c,0,-3,rx,ry,P.light);ellipse(c,0,-5,rx-3,Math.max(2,ry-3),P.stone);ellipse(c,0,-6,rx-7,Math.max(2,ry-7),'#426f77');ellipse(c,0,-7,rx-9,Math.max(2,ry-9),P.water);
  for(let i=0;i<5;i++){const x=(i-2)*rx*.27;line(c,[x,-6],[x+7,-7],'#c4d6c374',.8);}
  rect(c,-w*.055,-h*.63,w*.11,h*.62,P.stone);ellipse(c,0,-h*.65,w*.22,d*.17,P.shade);ellipse(c,0,-h*.69,w*.22,d*.17,P.light);ellipse(c,0,-h*.72,w*.16,d*.12,'#659297');
  for(const a of[-1,1]){c.beginPath();c.moveTo(0,-h*.72);c.quadraticCurveTo(a*w*.3,-h*.83,a*w*.27,-8);c.strokeStyle='#b9d9d4a6';c.lineWidth=1.4;c.stroke();ellipse(c,a*w*.27,-8,3,1.4,'#c7e0ce');}ellipse(c,0,-h*.91,3.5,3.5,P.light);moss(c,-rx*.7,-1,rx*1.4,v);
}
function cart(c,q){
  const {w,d,h,v}=q,L=-w*.38,R=w*.38,B=-d*.32,F=d*.32;
  for(const x of[-w*.43,w*.43]){ellipse(c,x,F-2,w*.07,h*.23,P.dark);ellipse(c,x,F-3,w*.04,h*.17,P.woodLight);line(c,[x,F-h*.16],[x,F+h*.1],P.dark,1);}
  rect(c,L,B-h*.35,R-L,F-B,P.wood);rect(c,L,F-h*.35,R-L,h*.29,P.woodLight);for(let y=F-h*.3;y<F;y+=5)line(c,[L,y],[R,y],P.wood,1);
  for(let i=0;i<5;i++){const x=L+(i+.5)*(R-L)/5;rect(c,x-4,B-h*.48,8,h*.3,['#b2a37c','#8a9a70','#a59169'][i%3]);line(c,[x-4,B-h*.48],[x+4,B-h*.48],P.light,.7);}
  for(const x of[L,R])line(c,[x,F-1],[x*1.1,d*.46],P.wood,2);
}
function market(c,q){
  const {w,d,h,v}=q,L=-w/2,R=w/2,B=-d/2,F=d/2;
  for(const x of[L+3,R-3]){line(c,[x,B],[x,B-h],P.wood,3);line(c,[x,F],[x,F-h*.77],P.wood,3);}
  rect(c,L+4,F-h*.23,w-8,h*.22,P.wood);line(c,[L+4,F-h*.23],[R-4,F-h*.23],P.woodLight,2);
  const pts=[[L,B-h],[R,B-h],[R,F-h*.77],[L,F-h*.77]];poly(c,pts,'#b4b394',P.dark,1);
  c.save();poly(c,pts,null);c.clip();for(let x=L;x<R;x+=22)rect(c,x,B-h,11,d+h*.3,v%2?'#4b6e70':'#7c8c73');c.restore();
  for(let x=L;x<R;x+=11)poly(c,[[x,F-h*.77],[x+11,F-h*.77],[x+9,F-h*.77+5],[x+2,F-h*.77+5]],Math.round((x-L)/11)%2?'#b4b394':v%2?'#4b6e70':'#7c8c73',P.wood,.5);
  for(let i=0;i<7;i++){const x=L+9+i*(w-18)/7;ellipse(c,x,F-h*.25,3.5,2.5,['#c5aa64','#8b9c69','#b48967'][i%3]);}
}
function sewer(c,q,{open=true}={}){
  const {w,d,h,v}=q,L=-w/2,F=d/2;
  // A narrow stone-backed entrance; the opening is confined to this one prop.
  masonry(c,L,-d/2-h*.4,w,d+h*.4,v);arch(c,0,F-1,w*.68,h*.78,P.dark,P.light,3);
  if(!open)for(let x=-w*.25;x<=w*.25;x+=6)line(c,[x,F-h*.6],[x,F-2],'#7e897a',1.7);
  rect(c,-w*.43,F-2,w*.86,3,P.shade);line(c,[-w*.43,F-2],[w*.43,F-2],P.light,1);moss(c,L+1,F-3,w-2,v);
}
function ruin(c,q){
  const {w,d,h,v}=q,L=-w/2,R=w/2,F=d/2,B=-d/2;
  for(let i=0;i<4;i++){const x=L+i*w/4,hh=h*(.25+hash(i+v,4)*.55);masonry(c,x,B-hh,w*.25-2,d+hh,v+i);poly(c,[[x,B-hh],[x+7,B-hh-3],[x+w*.12,B-hh+4],[x+w*.25-2,B-hh]],P.stone,P.shade,.7);}
  for(let i=0;i<6;i++){const x=L+hash(i+v,11)*w,y=B+hash(i,19)*d;poly(c,[[x-3,y],[x-2,y-3],[x+4,y-3],[x+5,y+1]],P.stone,P.shade,.7);}moss(c,L+2,F-2,w-4,v);
}
function paint(c,q){
  c.lineCap='round';c.lineJoin='round';
  if(q.kind==='keep'&&/^keep-[ns][we]$/.test(q.style)){
    // Four real 350x200 collision modules carry one continuous 700x400 roof.
    // Only the southern pair owns the front facade; internal module boundaries
    // introduce neither another doorway nor another strip of battlements.
    const west=q.style.endsWith('w'),north=q.style[5]==='n',dx=west?q.w/2:-q.w/2,dy=north?q.d/2:-q.d/2,cut=-q.h*.76+dy;
    c.save();c.beginPath();c.rect(-q.w/2-(west?5:.4),north?-q.d/2-q.h-6:cut-.4,q.w+(west?5.4:5.4),north?cut+q.d/2+q.h+6.4:q.d/2+6-cut);c.clip();c.translate(dx,dy);building(c,{...q,w:q.w*2,d:q.d*2,style:'keep-combined'});c.restore();
  }
  else if(q.kind==='wall')wall(c,q);
  else if(q.kind==='tower'||q.kind==='belltower')tower(c,q);
  else if(q.kind==='gate'||q.kind==='arcade')openArcade(c,q);
  else if(q.kind==='statue')statue(c,q);
  else if(q.kind==='fountain')fountain(c,q);
  else if(q.kind==='market')market(c,q);
  else if(q.kind==='cart')cart(c,q);
  else if(q.kind==='planter')planter(c,q);
  else if(q.kind==='ruin')ruin(c,q);
  else if(q.kind==='sewer')sewer(c,q);
  else if(q.kind==='lamp'){ellipse(c,0,0,q.w*.3,q.d*.35,P.shade);line(c,[0,0],[0,-q.h+17],P.dark,3);line(c,[-1,-2],[-1,-q.h+17],P.metal,1);lantern(c,0,-q.h+18,Math.min(1.5,q.w/10));}
  else if(q.kind==='banner'){ellipse(c,0,0,q.w*.21,q.d*.3,P.shade);line(c,[-q.w*.4,0],[-q.w*.4,-q.h+3],P.wood,2);flag(c,0,-q.h+5,q.w*.7,q.h*.65,q.v);}
  else building(c,q);
}

export class CityStructureArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;}
  get cacheStats(){return{entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:MAX_PIXELS*4,builds:this.builds};}
  clear(){this.cache.clear();this.pixels=0;}
  _stamp(q){
    const key=`${q.kind}:${q.w}:${q.d}:${q.h}:${q.v}:${q.style.startsWith('keep-')?q.style:''}`;let stamp=this.cache.get(key);
    if(stamp){this.cache.delete(key);this.cache.set(key,stamp);return stamp;}
    const ox=q.w/2+5,oy=q.d/2+q.h+6,w=Math.ceil(ox*2),h=Math.ceil(oy+q.d/2+5),dpr=w*h>150000?1:1.25,canvas=this.makeCanvas();
    canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,ox*dpr,oy*dpr);paint(c,q);
    stamp={canvas,w,h,ox,oy,pixels:canvas.width*canvas.height};
    while(this.pixels+stamp.pixels>MAX_PIXELS&&this.cache.size){const first=this.cache.keys().next().value;this.pixels-=this.cache.get(first).pixels;this.cache.delete(first);}
    // Oversized custom props remain drawable but cannot displace the bounded
    // shared atlas. Authored city modules are all <=350 units wide.
    if(stamp.pixels<=MAX_PIXELS){this.cache.set(key,stamp);this.pixels+=stamp.pixels;}this.builds++;return stamp;
  }
  drawProp(c,prop,{canopyAlpha=1}={}){
    if(prop?.variant!=='city-structure'||!KINDS.has(prop.cityKind))return false;
    const q=normalize(prop),stamp=this._stamp(q);c.save();c.globalAlpha*=Math.max(0,Math.min(1,finite(canopyAlpha,1)));c.drawImage(stamp.canvas,prop.x-stamp.ox,prop.y-stamp.oy,stamp.w,stamp.h);c.restore();return true;
  }
}

const point=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
export function drawCityBridge(c,p,{overview=false}={}){
  const route=p.deck||p.waypoints||[];if(route.length<2)return false;c.save();
  if(p.points?.length){poly(c,p.points.map(a=>{const v=point(a);return[v.x,v.y];}),null);c.clip();}
  for(let i=1;i<route.length;i++){
    const a=point(route[i-1]),b=point(route[i]),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),width=p.width||130;if(len<1)continue;
    c.save();c.translate(a.x,a.y);c.rotate(Math.atan2(dy,dx));rect(c,0,-width/2,len,width,'#979c88');
    const cell=overview?42:23;
    for(let x=0;x<len;x+=cell)for(let y=-width/2;y<width/2;y+=cell){const n=hash(x+i,y);rect(c,x+1,y+1,Math.min(cell-2,len-x-1),Math.min(cell-2,width/2-y-1),n>.5?'#aeb19a':'#a4aa94');line(c,[x+2,y+2],[Math.min(x+cell-2,len),y+2],P.light,overview?2:1);}
    // The rails occupy the outer 9 units of the baked deck. Its interior
    // remains visually open and uses the same traversal width as collision.
    for(const side of[-1,1]){const y=side*(width/2-5);rect(c,0,y-4,len,8,P.shade);line(c,[0,y-4],[len,y-4],P.light,overview?4:2);for(let x=8;x<len;x+=65){rect(c,x-5,y-7,10,14,P.stone);line(c,[x-5,y-7],[x+5,y-7],P.light,1.5);}}
    c.restore();
  }c.restore();return true;
}

export function drawCityLandmark(c,site){
  if(!site||!Number.isFinite(site.x)||!Number.isFinite(site.y))return false;
  const kind=site.kind||site.type,feature=site.featureId||'',q={kind:'sewer',w:68,d:34,h:48,v:1,style:''};
  c.save();c.translate(site.x,site.y);
  if(kind==='cave'||kind==='dungeon'||feature==='sewer')sewer(c,q,{open:true});
  else if(kind==='shortcut'||kind==='exit'||kind==='gate'){
    const opened=site.open||site.gateOpen||site.opened||['open','cleared','spent','claimed'].includes(site.state)||kind==='exit';
    const span=Math.max(16,finite(site.width,finite(site.halfLength,50)*2)),angle=finite(site.angle,0),dx=Math.cos(angle)*span/2,dy=Math.sin(angle)*span/2,height=58;
    // The two foot anchors are the real capsule endpoints. Only their ground
    // axis rotates: posts and metal bars always project northward on screen.
    // This works for horizontal, vertical and diagonal shortcut gates alike.
    const ends=[{x:-dx,y:-dy},{x:dx,y:dy}].sort((a,b)=>a.y-b.y);
    for(const end of ends){masonry(c,end.x-6,end.y-height,12,height+5,1);rect(c,end.x-8,end.y-height-3,16,4,P.light);lantern(c,end.x,end.y-10,.7);}
    c.beginPath();c.moveTo(-dx,-dy-height+5);c.bezierCurveTo(-dx*.45,-dy*.45-height-8,dx*.45,dy*.45-height-8,dx,dy-height+5);c.strokeStyle=P.dark;c.lineWidth=7;c.stroke();c.strokeStyle=P.stone;c.lineWidth=4.5;c.stroke();
    if(!opened){
      const count=Math.max(2,Math.ceil(span/9));
      for(let i=0;i<=count;i++){const t=-1+2*i/count,x=dx*t,y=dy*t;line(c,[x,y-height+10],[x,y+3],'#4d625d',2);poly(c,[[x-2,y-height+12],[x,y-height+6],[x+2,y-height+12]],P.metal);}
      line(c,[-dx,-dy-9],[dx,dy-9],P.metal,2);line(c,[-dx,-dy-28],[dx,dy-28],P.metal,1.5);ellipse(c,0,-10,4,5,P.gold);
    }
  }else{c.restore();return false;}
  c.restore();return true;
}
