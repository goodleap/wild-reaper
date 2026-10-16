// Shared snow-theme source artwork. All painters use a ground/foot anchor at
// (0, 0), draw no cast shadows, and never read gameplay randomness. Cache these
// finite variants in the caller; collision sizes remain Terrain's responsibility.
const TAU=Math.PI*2;
const form=v=>((Math.trunc(Number.isFinite(v)?v:0)%5)+5)%5;
const noise=(v,i)=>{const n=Math.sin((v+1)*97.31+i*53.17)*43758.5453;return n-Math.floor(n);};
const poly=(c,points,fill,edge=null,width=1)=>{c.beginPath();for(let i=0;i<points.length;i++)c[i?'lineTo':'moveTo'](...points[i]);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const line=(c,points,color,width=1)=>{c.beginPath();for(let i=0;i<points.length;i++)c[i?'lineTo':'moveTo'](...points[i]);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();};
const curve=(c,points,color,width=1)=>{c.beginPath();c.moveTo(...points[0]);c.bezierCurveTo(...points[1],...points[2],...points[3]);c.strokeStyle=color;c.lineWidth=width;c.stroke();};

// Bounds include stroke/needle details, in game units. They fit the existing
// snowpine (184x184 at 92,158) and ice-rock (108x150 at 54,111) sprite tiles.
export const SNOW_SCENERY_BOUNDS=Object.freeze({
  pine:Object.freeze({left:-46,right:46,top:-142,bottom:12}),
  rock:Object.freeze({left:-37,right:37,top:-76,bottom:33}),
  shrub:Object.freeze({left:-33,right:33,top:-35,bottom:12}),
  grass:Object.freeze({left:-20,right:20,top:-31,bottom:9}),
});
// Positive distances from the foot anchor, including a small stroke margin.
// Shared by visual culling / attack depth; they never change ground collision.
export const SNOW_ROCK_PROFILES=Object.freeze([71,76,36,59,56].map(top=>Object.freeze({top,bottom:33,halfWidth:37})));

// [branch centre x, lower edge y, half width, rise]. Each form changes both
// silhouette and the distribution of exposed needles and soft snow shelves.
const PINE_BOUGHS=[
  [[-2,-34,29,38],[5,-56,24,35],[-6,-76,22,29],[2,-91,17,33],[0,-115,9,25]],
  [[-3,-32,42,28],[3,-47,41,25],[-8,-65,33,33],[5,-78,30,25],[-5,-97,20,27],[3,-115,10,20]],
  [[-7,-31,35,32],[4,-52,31,31],[15,-70,27,29],[17,-91,20,28],[19,-115,8,24]],
  [[-5,-34,37,24],[6,-60,30,24],[-5,-86,24,25],[3,-109,13,29]],
  [[-2,-30,40,35],[4,-48,36,34],[-3,-68,29,33],[2,-88,23,31],[-1,-107,13,31]],
];

function bough(c,x,y,w,h,v,tier){
  const deep=['#254b49','#2c5550','#214746','#315955','#315b56'][v],mid=['#426c60','#4d7668','#416e65','#547a6b','#4c7568'][v];
  c.beginPath();c.moveTo(x+1,y-h);c.quadraticCurveTo(x-w*.13,y-h*.62,x-w*.40,y-h*.40);
  c.lineTo(x-w*.30,y-h*.29);c.lineTo(x-w*.74,y-h*.12);c.lineTo(x-w*.60,y-h*.03);c.lineTo(x-w,y+2);
  c.lineTo(x-w*.75,y+5);c.lineTo(x-w*.58,y+3);c.lineTo(x-w*.47,y+7);c.lineTo(x-w*.25,y+4);c.lineTo(x-w*.12,y+8);
  c.lineTo(x+w*.06,y+5);c.lineTo(x+w*.28,y+8);c.lineTo(x+w*.37,y+4);c.lineTo(x+w*.64,y+5);c.lineTo(x+w*.70,y+2);
  c.lineTo(x+w,y+3);c.lineTo(x+w*.71,y-h*.12);c.lineTo(x+w*.80,y-h*.14);c.lineTo(x+w*.42,y-h*.38);c.lineTo(x+w*.48,y-h*.43);
  c.quadraticCurveTo(x+w*.20,y-h*.58,x+1,y-h);c.closePath();c.fillStyle=deep;c.fill();
  poly(c,[[x+1,y-h+2],[x-w*.31,y-h*.35],[x-w*.18,y-h*.24],[x-w*.67,y+1],[x-w*.40,y-2],[x-w*.21,y+3],[x+2,y-2],[x+w*.37,y+1],[x+w*.2,y-h*.25]],mid);
  // Branch tips remain visible beneath the snow. Deliberately asymmetric to
  // avoid the repeated, regular tiers of a decorative Christmas-tree silhouette.
  for(let i=0;i<8;i++){
    const xx=x+(noise(v+11,tier*17+i)-.5)*w*1.5,yy=y-2+noise(v+23,tier*11+i)*6;
    line(c,[[xx-3,yy-2],[xx+1,yy],[xx+3,yy-1]],i%3?'#87a18b78':'#b4c3a581',.75);
  }
  const heavy=v===4,coverage=v===3?.68:heavy?1:.86,sw=w*coverage,capY=y-(heavy?5:8),bottom=heavy?9:5;
  c.beginPath();c.moveTo(x+1,y-h+1);c.quadraticCurveTo(x-sw*.08,y-h*.66,x-sw*.40,y-h*.43);
  c.quadraticCurveTo(x-sw*.32,y-h*.31,x-sw*.56,y-h*.26);
  c.quadraticCurveTo(x-sw*.70,capY-5,x-sw*.86,capY);
  c.quadraticCurveTo(x-sw*.78,capY+bottom,x-sw*.52,capY+3);
  c.quadraticCurveTo(x-sw*.37,capY+bottom+2,x-sw*.19,capY+3);
  c.quadraticCurveTo(x+sw*.02,capY+bottom,x+sw*.21,capY+1);
  c.quadraticCurveTo(x+sw*.41,capY+5,x+sw*.64,capY-1);
  c.quadraticCurveTo(x+sw*.50,y-h*.28,x+sw*.30,y-h*.44);
  c.quadraticCurveTo(x+sw*.17,y-h*.59,x+1,y-h+1);c.closePath();
  c.fillStyle=heavy?'#aecbd3':'#b9d3d8';c.fill();
  c.beginPath();c.moveTo(x+1,y-h+1);c.quadraticCurveTo(x-sw*.06,y-h*.68,x-sw*.38,y-h*.43);
  c.quadraticCurveTo(x-sw*.31,y-h*.31,x-sw*.54,y-h*.26);c.quadraticCurveTo(x-sw*.65,capY-5,x-sw*.82,capY);
  c.quadraticCurveTo(x-sw*.61,capY+3,x-sw*.48,capY);c.quadraticCurveTo(x-sw*.29,capY+5,x-sw*.16,capY);
  c.quadraticCurveTo(x+sw*.02,capY+3,x+sw*.17,capY-1);c.quadraticCurveTo(x+sw*.37,capY+2,x+sw*.49,capY-2);
  c.quadraticCurveTo(x+sw*.33,y-h*.33,x+sw*.19,y-h*.48);c.quadraticCurveTo(x+sw*.09,y-h*.66,x+1,y-h+1);c.closePath();c.fillStyle=tier>2?'#f3f6f1':'#e4eeec';c.fill();
  curve(c,[[x-sw*.69,capY],[x-sw*.55,capY-2],[x-sw*.43,capY+2],[x-sw*.30,capY]],'#fbfcf4bd',1.15);
  if(heavy&&tier<3)oval(c,x+sw*.48,capY+1,sw*.12,2.6,'#d6e7e6');
}

export function paintSnowPine(c,v,crown){
  v=form(v);c.save();c.lineCap='round';c.lineJoin='round';
  const lean=v===2?10:v===3?2:0;
  if(!crown){
    poly(c,[[-10,6],[-6,-20],[-5,-57],[lean-2,-108],[lean+3,-115],[lean+5,-63],[7,-20],[11,7],[4,9],[-4,8]],'#716d61','#414c4a',.8);
    poly(c,[[-5,4],[-2,-28],[lean,-97],[lean+2,-100],[2,-29],[3,7]],'#a4977b');
    line(c,[[4,3],[3,-40],[lean+2,-89]],'#4c5752',1.5);
    for(let i=0;i<9;i++){const y=-9-i*9;line(c,[[-4+(y<-50?lean*.4:0),y],[-1+(y<-50?lean*.5:0),y-4]],'#514f43aa',.8);}
    for(const [side,y,len]of[[-1,-43,24],[1,-53,29],[-1,-75,20],[1,-88,17]]){
      const x=lean*(-y/115);line(c,[[x,y+7],[x+side*len*.5,y+2],[x+side*len,y]],'#596357',3);line(c,[[x,y+6],[x+side*len,y-1]],'#9b9d81',.7);
    }
    poly(c,[[-9,3],[-18,8],[-14,10],[-3,7],[5,9],[17,9],[12,5],[5,3]],'#828273');
    curve(c,[[-17,8],[-9,2],[6,4],[14,7]],'#d6e5df',2.8);
  }else for(let i=0;i<PINE_BOUGHS[v].length;i++)bough(c,...PINE_BOUGHS[v][i],v,i);
  c.restore();
}

function crystal(c,points,v,shade=0){
  const [a,b,d,e,f]=points,tip=points[2],split=[(tip[0]+f[0])*.5+3,(tip[1]+f[1])*.5+4];
  poly(c,points,shade?'#87b7c6':'#a0cbd4','#537d91',.9);
  poly(c,[a,b,tip,split,f],'#c8e2e5');poly(c,[tip,d,e,f,split],shade?'#4e819e':'#6b9fb6');
  poly(c,[b,tip,split,[b[0]+3,b[1]+17]],'#edf6f06b');
  line(c,[b,tip,d],'#edf8f3',1.1);line(c,[tip,split,f],'#d4eff0a8',.9);
  const sx=split[0],sy=split[1];line(c,[[sx+1,sy-3],[sx-3,sy+7],[sx+1,sy+13]],'#dff5f28a',.75);
  if(v%2)line(c,[[sx-3,sy+7],[sx-9,sy+10]],'#dff5f280',.65);
}
function snowyBoulder(c,v,buried=false){
  const h=buried?28:48,points=[[-33,5],[-28,-h*.56],[-13,-h],[9,-h-3],[28,-h*.53],[34,8],[23,24],[-7,30]];
  poly(c,points,'#738895','#4d6576',1.1);
  poly(c,[[-28,-h*.56],[-13,-h],[9,-h-3],[28,-h*.53],[3,-h*.26],[-9,-h*.42]],'#a4b4b8');
  poly(c,[[3,-h*.26],[28,-h*.53],[34,8],[23,24],[5,25]],'#526e83');
  line(c,[[-19,-h*.36],[-10,-h*.14],[-13,10],[-7,18]],'#425c7099',1.2);
  line(c,[[14,-h*.30],[19,-h*.06],[15,5],[19,13]],'#c3d4d04f',.9);
  c.beginPath();c.moveTo(-30,-h*.42);c.quadraticCurveTo(-29,-h*.68,-13,-h+1);c.quadraticCurveTo(0,-h-6,12,-h+1);
  c.quadraticCurveTo(25,-h*.70,29,-h*.40);c.quadraticCurveTo(20,-h*.28,13,-h*.34);c.quadraticCurveTo(5,-h*.12,-1,-h*.30);c.quadraticCurveTo(-13,-h*.18,-20,-h*.31);c.quadraticCurveTo(-27,-h*.24,-30,-h*.42);c.closePath();c.fillStyle='#c1d8de';c.fill();
  c.beginPath();c.moveTo(-29,-h*.47);c.quadraticCurveTo(-26,-h*.72,-12,-h+2);c.quadraticCurveTo(0,-h-4,12,-h+2);c.quadraticCurveTo(23,-h*.73,27,-h*.46);
  c.quadraticCurveTo(19,-h*.36,13,-h*.42);c.quadraticCurveTo(4,-h*.22,-1,-h*.39);c.quadraticCurveTo(-13,-h*.27,-20,-h*.39);c.closePath();c.fillStyle='#e6efed';c.fill();
  if(buried){oval(c,-16,23,20,7,'#d7e4e5');oval(c,14,24,21,7,'#dfeae9');curve(c,[[-33,22],[-17,14],[-3,28],[12,23]],'#f2f5ed',1.5);}
  for(let i=0;i<13;i++){const x=-22+noise(v+18,i)*42,y=-h*.17+noise(v+20,i)*26;line(c,[[x,y],[x+2,y-1]],i%3?'#c1d4d330':'#324e6533',.65);}
}
export function paintSnowRock(c,v,kind='ice'){
  v=form(v);c.save();c.lineCap='round';c.lineJoin='round';
  if(kind!=='ice'||v===2||v===4)snowyBoulder(c,v,v===2);
  else if(v===0){
    crystal(c,[[-32,12],[-31,-20],[-20,-41],[-8,-25],[-5,13],[-18,24]],v,1);
    crystal(c,[[2,18],[5,-24],[21,-47],[32,-25],[31,17],[17,28]],v+1,1);
    crystal(c,[[-17,20],[-15,-43],[-1,-69],[15,-39],[12,22],[-3,31]],v);
    poly(c,[[-16,-43],[-1,-69],[14,-39],[6,-42],[-1,-62],[-9,-41]],'#edf7f2');
  }else if(v===1){
    crystal(c,[[-31,12],[-25,-31],[0,-74],[23,-51],[30,10],[5,29]],v);
    poly(c,[[-25,-31],[0,-74],[23,-51],[12,-49],[0,-66],[-16,-30]],'#e5f2ee');
    crystal(c,[[-8,23],[0,-8],[17,-22],[32,-5],[30,20],[12,31]],v+1,1);
  }else{
    crystal(c,[[-33,10],[-31,-10],[-13,-33],[0,-19],[2,17],[-17,28]],v+1,1);
    crystal(c,[[7,17],[9,-36],[20,-57],[32,-34],[33,11],[21,25]],v,1);
    crystal(c,[[-15,20],[-12,-29],[2,-51],[17,-32],[14,20],[-1,32]],v);
    poly(c,[[-30,-11],[-13,-32],[0,-19],[-7,-20],[-13,-26],[-25,-9]],'#e2efea');
  }
  if(v!==2){curve(c,[[-31,23],[-20,18],[-11,28],[1,25]],'#d5e5e5',3);curve(c,[[8,27],[17,23],[23,26],[31,20]],'#e7efeb',2.4);}
  c.restore();
}

export function paintSnowShrub(c,v){
  v=form(v);c.save();c.lineCap='round';c.lineJoin='round';
  const stems=[[-21,-16],[-17,-28],[-6,-29],[4,-25],[16,-28],[25,-15]];
  for(let i=0;i<stems.length;i++){
    const [sx,sy]=stems[i],x=sx+(noise(v,i)-.5)*4,y=sy+(noise(v+4,i)-.5)*3;
    curve(c,[[i%2?-4:4,7],[x*.22,y*.28],[x*.75,y*.63],[x,y]],'#6a7065',1.7);
    line(c,[[x*.58,y*.6],[x-6,y+4],[x-8,y+1]],'#818678',1);
    line(c,[[x*.78,y*.78],[x+4,y+1],[x+5,y-3]],'#778171',.9);
  }
  // A few low, irregular evergreen cushions, with exposed twig gaps between.
  for(const [i,[x,y,rx,ry]]of [[-19,-4,11,8],[1,-7,15,11],[21,-3,10,8]].entries()){
    oval(c,x,y,rx,ry,'#4a6b60');oval(c,x-2,y-2,rx*.86,ry*.7,'#729082');
    c.beginPath();c.moveTo(x-rx,y-2);c.quadraticCurveTo(x-rx*.65,y-ry-3,x-2,y-ry+1);c.quadraticCurveTo(x+rx*.62,y-ry-2,x+rx,y-3);c.quadraticCurveTo(x+rx*.48,y+2,x+rx*.18,y-1);c.quadraticCurveTo(x-rx*.25,y+3,x-rx*.54,y-1);c.closePath();c.fillStyle='#d8e8e6';c.fill();
    curve(c,[[x-rx*.8,y-4],[x-rx*.3,y-ry+1],[x+rx*.2,y-ry+2],[x+rx*.65,y-5]],'#f0f4ec',1.4);
    if(v===1||v===4)for(let j=0;j<2;j++)oval(c,x+2+j*3,y+2,1.1,1.3,'#a47e70');
  }
  curve(c,[[-27,8],[-15,3],[3,9],[16,7]],'#dbe7e4',3);c.restore();
}

export function paintSnowGrass(c,v){
  v=form(v);c.save();c.lineCap='round';
  for(let i=0;i<11;i++){
    const x=-14+i*2.8,endX=x+(noise(v,i)-.5)*10,y=-9-noise(v+10,i)*20;
    curve(c,[[x*.35,5],[x*.5,-1],[endX*.7,y+6],[endX,y]],i%3?'#9c9b82':'#6f837b',.75+i%2*.3);
    if(i%3===0){line(c,[[endX-2,y+2],[endX+1,y-1]],'#d4c7a2',1.5);line(c,[[endX-1,y+4],[endX+2,y+1]],'#bdb794',1);}
  }
  oval(c,-1,5,13,3.2,'#c7dadc');curve(c,[[-13,4],[-3,0],[2,6],[11,4]],'#eef3ed',2);c.restore();
}

// Log coordinates follow the capsule axis (+x). The caller rotates that axis.
// Bounds: +/- (halfLength + .85*radius), y [-1.6*radius, .95*radius].
export function paintSnowLog(c,v,halfLength=55,radius=16){
  v=form(v);const l=Math.max(8,Number.isFinite(halfLength)?halfLength:55),r=Math.max(3,Number.isFinite(radius)?radius:16);
  c.save();c.lineCap='round';c.lineJoin='round';
  poly(c,[[-l-r*.55,-r*.51],[-l+r*.2,-r*.89],[l-r*.12,-r*.78],[l+r*.65,-r*.22],[l+r*.62,r*.38],[l-r*.2,r*.68],[-l,r*.65],[-l-r*.63,r*.17]],'#716f60','#4c5d58',.9);
  poly(c,[[-l,-r*.55],[l,-r*.54],[l+r*.53,-r*.1],[l+r*.48,r*.24],[-l,r*.38]],'#8b8771');
  for(let i=0;i<6;i++){
    const y=-r*.48+i*r*.18;curve(c,[[-l+4,y],[-l*.4,y-r*.09],[l*.5,y+r*.09],[l-3,y-r*.05]],i%2?'#455a537d':'#c4b49775',.7);
  }
  oval(c,-l,0,r*.62,r*.69,'#b6aa86');oval(c,-l-1,0,r*.43,r*.48,'#d3c29a');
  for(let i=1;i<3;i++){c.beginPath();c.ellipse(-l-1,0,r*.15*i,r*.18*i,0,0,TAU);c.strokeStyle='#8a886b';c.lineWidth=.65;c.stroke();}
  line(c,[[-l-r*.32,-r*.32],[-l,-r*.06],[-l-r*.04,r*.44]],'#6d756373',.8);
  const drift=v%2?1.18:1;
  c.beginPath();c.moveTo(-l-r*.37,-r*.60);c.quadraticCurveTo(-l*.7,-r*1.34*drift,-l*.36,-r*.93);c.quadraticCurveTo(l*.07,-r*1.37,l*.43,-r*.96);c.quadraticCurveTo(l*.81,-r*1.14,l+r*.39,-r*.43);c.quadraticCurveTo(l*.81,-r*.07,l*.5,-r*.27);c.quadraticCurveTo(l*.19,r*.02,-l*.03,-r*.27);c.quadraticCurveTo(-l*.42,-r*.08,-l*.60,-r*.30);c.quadraticCurveTo(-l*.83,-r*.18,-l-r*.37,-r*.60);c.closePath();c.fillStyle='#b4d0d7';c.fill();
  c.beginPath();c.moveTo(-l-r*.30,-r*.66);c.quadraticCurveTo(-l*.67,-r*1.24*drift,-l*.36,-r*.92);c.quadraticCurveTo(l*.07,-r*1.28,l*.43,-r*.94);c.quadraticCurveTo(l*.81,-r*1.06,l+r*.27,-r*.47);c.quadraticCurveTo(l*.8,-r*.22,l*.5,-r*.40);c.quadraticCurveTo(l*.19,-r*.13,-l*.03,-r*.41);c.quadraticCurveTo(-l*.42,-r*.24,-l*.60,-r*.42);c.closePath();c.fillStyle='#e4efeb';c.fill();
  if(v===3){line(c,[[l*.2,-r*.6],[l*.26,-r*1.30],[l*.38,-r*1.4]],'#7b8071',1.1);line(c,[[l*.26,-r*1.25],[l*.15,-r*1.36]],'#9c9c83',1.1);}
  c.restore();
}
