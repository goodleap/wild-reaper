// Shared city painters. Coordinates and anchors match the original WorldArt
// stamps; Terrain remains the authority for occupied ground and movement.
const TAU=Math.PI*2;
const seedRandom=seed=>{let n=(seed*2654435761)>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};};
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const poly=(c,points,fill,edge=null,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const stroke=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const ellipse=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const tint=(a,b,t)=>{const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16);return`#${[16,8,0].map(s=>Math.round(((A>>s)&255)*(1-t)+((B>>s)&255)*t).toString(16).padStart(2,'0')).join('')}`;};

// A repeated ashlar grid keeps the exact same joint positions on every tile.
// Zone/variant wear fades before the border, so independently cached tiles can
// meet without a rectangular colour seam or a rerolled half-brick.
export function paintCityGround(c,{variant=0,zone=0,size=256,road=false}={}){
  c.save();
  c.beginPath();c.rect(0,0,size,size);c.clip();
  const scale=size/256;c.scale(scale,scale);
  const r=seedRandom(4201+variant*193+zone*83+(road?97:0)),neutral=road?'#68736d':'#7c8273',mortar=road?'#67766d':'#7a8272';
  c.fillStyle=mortar;c.fillRect(0,0,256,256);
  const shades=road?['#788177','#7d8479','#758076','#81877a']:['#939685','#989987','#8e9481','#9d9c88'];
  const zoneTint=zone===1?'#687a66':zone===2?'#a2997e':neutral;
  for(let row=-1;row<17;row++)for(let col=-1;col<9;col++){
    const x=col*32+(row%2?16:0),y=row*16,h=hash((col+16)%8,(row+32)%16),near=Math.min(x+16,256-x-16,y+8,256-y-8),blend=clamp((near-16)/36,0,1);
    const base=shades[(Math.abs(col+row*3)+32)%4],fill=tint(base,zoneTint,(.12+(variant%3)*.025)*blend);
    poly(c,[[x+1.2,y+1.2],[x+29.8,y+1],[x+31,y+3],[x+30.5,y+13.6],[x+2,y+14.8],[x+1,y+12]],fill);
    stroke(c,[[x+3,y+2],[x+28,y+1.9]],'#dce0c230',.75);
    stroke(c,[[x+2,y+14.3],[x+29,y+13.7]],'#354d3b19',.7);
    if(h>.66&&near>18){const xx=x+7+h*11;stroke(c,[[xx,y+2],[xx-2,y+6],[xx+3,y+10]],'#455a463b',.65);}
    if(h<.24){c.fillStyle='#d6d6b42a';c.fillRect(x+5,y+4,3.5,1.1);}
  }
  // Quiet, broad stains avoid turning a 540-unit view into high-contrast noise.
  for(let i=0;i<13;i++){
    const x=36+r()*184,y=32+r()*192,rad=8+r()*20,g=c.createRadialGradient(x,y,0,x,y,rad);
    g.addColorStop(0,zone===1?'#294f3222':'#c4b98d13');g.addColorStop(1,'#556b4500');
    c.fillStyle=g;c.fillRect(x-rad,y-rad,rad*2,rad*2);
  }
  for(let i=0;i<18;i++){const x=24+r()*208,y=24+r()*208;c.fillStyle=i%3?'#d6d5b92c':'#344b3624';c.fillRect(x,y,1+r()*2,.5+r()*.7);}
  c.restore();
}

function window(c,x,y,{lit=false,wide=false}={}){
  const w=wide?12:9,h=20;
  c.fillStyle='#394e49';c.beginPath();c.moveTo(x-w,y+h);c.lineTo(x-w,y+4);c.quadraticCurveTo(x,y-7,x+w,y+4);c.lineTo(x+w,y+h);c.closePath();c.fill();
  c.strokeStyle='#b4b49b';c.lineWidth=2;c.stroke();
  const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,lit?'#e4c888':'#77908b');g.addColorStop(1,lit?'#aa7846':'#455f5c');
  poly(c,[[x-w+3,y+5],[x,y],[x+w-3,y+5],[x+w-3,y+h-3],[x-w+3,y+h-3]],g);
  stroke(c,[[x,y+1],[x,y+h-1]],'#4d5b4d',1.3);stroke(c,[[x-w+2,y+11],[x+w-2,y+11]],'#4d5b4d',1);
  poly(c,[[x-w-3,y+h],[x+w+3,y+h],[x+w+4,y+h+3],[x-w-4,y+h+3]],'#b8b69b','#626f5c',.6);
}
function lamp(c,x,y){
  stroke(c,[[x-3,y-8],[x-3,y-17],[x+5,y-17],[x+6,y-12]],'#514f3d',1.6);
  poly(c,[[x+1,y-12],[x+10,y-12],[x+9,y+2],[x+2,y+2]],'#b78b50','#4f5744',1);
  poly(c,[[x+3,y-10],[x+8,y-10],[x+7.5,y],[x+3.5,y]],'#e5c588');
  stroke(c,[[x+5.5,y-11],[x+5.5,y+1]],'#81734b',.7);
  poly(c,[[x,y-13],[x+5.5,y-17],[x+11,y-13]],'#718075','#424f46',.7);
}
function slate(c,outline,v,front=true){
  const colors=['#476575','#435f73','#526e7b','#526c74','#465f6c'];
  poly(c,outline,colors[v],'#2e4650',1.7);
  c.save();poly(c,outline,null);c.clip();
  const grad=c.createLinearGradient(-80,-112,80,-48);grad.addColorStop(0,'#adc0b04a');grad.addColorStop(.5,'#b1c3b415');grad.addColorStop(1,'#263f4b45');c.fillStyle=grad;c.fillRect(-104,-120,208,87);
  for(let row=0;row<8;row++){
    const y=-115+row*8;stroke(c,[[-103,y],[101,y-4]],'#b6c2af40',.8);
    for(let x=-102+(row%2)*7;x<105;x+=14)stroke(c,[[x,y+.4],[x+1.4,y+6.5]],'#29475169',.65);
  }
  if(v===4){poly(c,[[30,-73],[37,-78],[46,-72],[42,-65],[34,-65]],'#3d514e');stroke(c,[[32,-72],[38,-76],[44,-71]],'#9fae8e',.7);}
  for(let i=0;i<10;i++){const x=-72+i*16,y=-63+(i%3)*2;stroke(c,[[x,y],[x+5,y-1]],i%2?'#8495746b':'#b0b9914b',1.6);}
  c.restore();
  if(front)stroke(c,[outline[outline.length-1],outline[0]],'#2f494d',2);
}

// WorldArt calls this in its 218 × 190 stamp. The complete lower volume remains
// within the original 180 × 60 capsule; only ordinary eaves extend past it.
export function paintCityHouse(c,v=0){
  v=((Math.floor(v)%5)+5)%5;c.save();c.translate(109,145);
  const r=seedRandom(220+v*61),wall=['#aeb29a','#bab69b','#aeb09b','#beb89b','#aeb29a'][v];
  poly(c,[[-88,-28],[74,-28],[88,-17],[88,20],[74,30],[-74,30],[-88,20]],'#657461','#3d5448',1.1);
  const face=c.createLinearGradient(-79,-62,77,29);face.addColorStop(0,wall);face.addColorStop(.72,tint(wall,'#d5cfac',.13));face.addColorStop(1,'#8e9d86');
  poly(c,[[-77,-62],[70,-62],[76,24],[-76,24]],face,'#465e4d',1.5);
  poly(c,[[70,-62],[86,-71],[87,17],[76,24]],'#738470','#435b4c',.9);
  c.save();poly(c,[[-77,-62],[70,-62],[76,24],[-76,24]],null);c.clip();
  for(let row=0;row<7;row++){
    const y=-60+row*13;stroke(c,[[-78,y],[78,y]],'#5c735437',.65);
    for(let col=0;col<8;col++){const x=-86+col*25+(row%2?12:0);stroke(c,[[x,y],[x,y+12]],'#5f735337',.7);if((col+row+v)%5===0){c.fillStyle='#e8e3bc2b';c.fillRect(x+3,y+2,15,3);}}
  }
  for(let i=0;i<70;i++){const x=-75+r()*148,y=-60+r()*83;c.fillStyle=i%3?'#e2dfb81d':'#4a684728';c.fillRect(x,y,1+r()*2,.5+r());}
  // Damp masonry lives at the base; it does not blanket the readable facade.
  for(let i=0;i<17;i++){const x=-71+r()*137,y=13+r()*10;ellipse(c,x,y,2+r()*4,1+r()*2,['#637f4a7a','#80945268','#99a45a63'][i%3]);}
  c.restore();
  poly(c,[[-79,-8],[76,-8],[77,-3],[-79,-3]],'#849579','#61775c',.7);
  for(const x of[-75,70]){poly(c,[[x-3,-61],[x+3,-61],[x+4,24],[x-3,24]],'#b7bba0','#6b7e64',.55);for(let y=-51;y<24;y+=13)stroke(c,[[x-3,y],[x+3,y]],'#71856679',.65);}
  if(v===0){
    slate(c,[[-94,-57],[-66,-106],[55,-115],[95,-70],[83,-59],[-71,-53]],v);
    poly(c,[[55,-115],[95,-70],[83,-59],[47,-103]],'#344e61','#294450',.8);
    stroke(c,[[-66,-106],[55,-115]],'#b2bca0',2.2);
  }else if(v===1){
    slate(c,[[-95,-61],[-78,-104],[74,-106],[96,-64],[89,-55],[-87,-54]],v);
    stroke(c,[[-78,-104],[74,-106]],'#b7c0a3',2.5);
    // Two low dormers break up the long merchant-house roof.
    for(const x of[-42,34]){poly(c,[[x-13,-68],[x-13,-84],[x,-97],[x+13,-84],[x+13,-69]],'#a3af96','#465f53',1);window(c,x,-86,{wide:false});poly(c,[[x-17,-84],[x,-101],[x+17,-85],[x+12,-82],[x,-94],[x-12,-81]],'#4a6370','#304a55',1);}
  }else if(v===2){
    slate(c,[[-94,-58],[-68,-104],[58,-108],[95,-64],[84,-56],[-76,-52]],v);
    // A closed cross-gable, rather than a fictitious walkable L-shaped gap.
    poly(c,[[-22,-57],[-22,-82],[3,-108],[31,-82],[31,-55]],'#a8b29a','#526c59',1.2);
    window(c,4,-83,{lit:true});
    slate(c,[[-28,-81],[2,-114],[37,-82],[29,-78],[2,-103],[-20,-76]],v,false);
    stroke(c,[[-69,-104],[-11,-106]],'#bbc4a9',1.6);
  }else if(v===3){
    // A squat civic / artisan house with a distinct slate mansard outline.
    slate(c,[[-96,-58],[-80,-93],[-60,-109],[64,-109],[87,-91],[97,-61],[83,-55],[-78,-53]],v);
    poly(c,[[-80,-93],[-60,-109],[64,-109],[87,-91],[68,-88],[-62,-89]],'#7e8f89','#506c69',.8);
    stroke(c,[[-60,-108],[64,-108]],'#bec5a6',2);
    window(c,4,-85,{wide:true,lit:false});
  }else{
    slate(c,[[-95,-57],[-74,-103],[-18,-110],[21,-102],[66,-108],[96,-66],[84,-57],[-76,-52]],v);
    stroke(c,[[-74,-103],[-18,-110],[21,-102],[66,-108]],'#a7b69b',2);
    poly(c,[[-67,-58],[-65,-46],[-57,-47],[-56,-60]],'#65815c','#4c6b51',.6);
    stroke(c,[[42,-58],[43,-51],[51,-55]],'#9aaa6a',1.5);
  }
  // The copper chimney remains inside the shared top bound (-115).
  if(v===1||v===4){poly(c,[[49,-86],[49,-110],[61,-110],[61,-87]],'#919c86','#536b59',1);poly(c,[[47,-113],[63,-113],[63,-107],[47,-107]],'#c0bea0','#617765',.7);stroke(c,[[50,-101],[60,-101]],'#62775d',.8);}
  for(const x of v===3?[-43,43]:[-45,43])window(c,x,-42,{lit:(v+x+50)%3===0});
  poly(c,[[-13,24],[-13,-23],[-6,-31],[7,-31],[14,-23],[14,24]],'#c0bea0','#64775f',1.2);
  c.fillStyle='#42574b';c.beginPath();c.moveTo(-10,24);c.lineTo(-10,-21);c.quadraticCurveTo(0,-33,11,-21);c.lineTo(11,24);c.closePath();c.fill();
  poly(c,[[-8,-19],[0,-25],[9,-19],[9,23],[-8,23]],v===3?'#617368':'#746e51','#3f5545',.7);
  for(const x of[-5,0,5])stroke(c,[[x,-18],[x,22]],'#b7a47557',.65);
  stroke(c,[[-8,8],[9,8]],'#445c47',1.2);ellipse(c,5.5,3,1.3,1.5,'#d2b473');
  poly(c,[[-16,24],[16,24],[20,29],[-20,29]],'#aeb397','#5b735b',.75);stroke(c,[[-15,25],[15,25]],'#e0dbb77f',.9);
  lamp(c,21,-5);
  // Narrow drainpipe, scuffed stone and a few roots provide age without clutter.
  stroke(c,[[-70,-50],[-69,20],[-64,24]],'#526a57',1.5);stroke(c,[[-69,-49],[-68,19]],'#a7b18b80',.5);
  stroke(c,[[60,18],[62,10],[66,6]],'#647b5980',.8);
  c.restore();
}

function wallFace(c,a,b,lowA,lowB,variant,index){
  const width=Math.hypot(b[0]-a[0],b[1]-a[1]),height=Math.hypot(lowA[0]-a[0],lowA[1]-a[1]);
  if(width<.01||height<.01)return;
  const points=[a,b,lowB,lowA],colors=['#85947c','#8c9b80','#7f9079','#93a087','#83967c'];
  poly(c,points,colors[(variant+index)%5],'#4e6956',.9);
  c.save();poly(c,points,null);c.clip();
  const g=c.createLinearGradient(a[0],a[1],lowA[0],lowA[1]);g.addColorStop(0,'#d5d6ad35');g.addColorStop(.5,'#9aab8612');g.addColorStop(1,'#244e3843');c.fillStyle=g;
  c.fillRect(Math.min(a[0],b[0])-2,Math.min(a[1],b[1])-2,Math.abs(b[0]-a[0])+4,Math.max(lowA[1],lowB[1])-Math.min(a[1],b[1])+4);
  for(let y=11,row=0;y<height;y+=11,row++){
    const t=y/height,A=lerp(a,lowA,t),B=lerp(b,lowB,t);stroke(c,[A,B],'#48694c70',.7);
    for(let along=(row%2?14:0);along<width;along+=28){
      const u=along/width,top=lerp(a,b,u),bottom=lerp(lowA,lowB,u),P=lerp(top,bottom,Math.max(0,(y-10)/height)),Q=lerp(top,bottom,t);
      stroke(c,[P,Q],'#506e507a',.65);
    }
  }
  for(let i=0;i<Math.ceil(width/9);i++){
    const u=hash(i+variant*7,index*31),v=hash(i+index*13,variant+77),A=lerp(a,b,u),B=lerp(lowA,lowB,u),p=lerp(A,B,v);
    stroke(c,[p,[p[0]+2+hash(i,9)*3,p[1]-.5]],i%3?'#d3d6af35':'#375b3f30',.55);
    if(v>.78&&i%2===0)ellipse(c,p[0],p[1],2+hash(i,5)*3,1.5,'#567d4766');
  }
  if(variant===4&&width>36){const p=lerp(a,b,.67),q=lerp(lowA,lowB,.67);stroke(c,[lerp(p,q,.14),[p[0]-3,p[1]+height*.38],lerp(p,q,.59),[p[0]-4,p[1]+height*.79]],'#48674d',1);}
  c.restore();
}

// upper and outline are the exact extrusion supplied by WorldArt. No shadow,
// new collision hull or hidden world-space randomness is introduced here.
export function paintCityWall(c,{outline,upper,height=46,variant=0}={}){
  if(!Array.isArray(outline)||outline.length<3||!Array.isArray(upper)||upper.length!==outline.length)return false;
  variant=((Math.floor(variant)%5)+5)%5;c.save();
  poly(c,outline,'#60785c','#3f5d49',1);
  const area=outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length];return sum+p[0]*q[1]-q[0]*p[1];},0),front=[];
  for(let i=0;i<outline.length;i++){
    const j=(i+1)%outline.length,dx=outline[j][0]-outline[i][0];
    if(dx*(area<0?1:-1)>.0001)front.push(i);
  }
  front.sort((i,j)=>(outline[i][1]+outline[(i+1)%outline.length][1])-(outline[j][1]+outline[(j+1)%outline.length][1]));
  for(const i of front){const j=(i+1)%outline.length;wallFace(c,upper[i],upper[j],outline[i],outline[j],variant,i);}
  poly(c,upper,'#8d9f86','#3e5e4b',1);
  c.save();poly(c,upper,null);c.clip();
  const center=upper.reduce((sum,p)=>[sum[0]+p[0]/upper.length,sum[1]+p[1]/upper.length],[0,0]),inner=upper.map(p=>lerp(p,center,.20));
  poly(c,inner,'#788e73','#5d775d',.7);
  // Cap stones and alternating merlons stay inside the supplied silhouette.
  for(let i=0;i<upper.length;i++){
    const a=upper[i],b=upper[(i+1)%upper.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(length/23));
    for(let k=0;k<n;k++){
      const p=lerp(a,b,k/n+.025/n),q=lerp(a,b,(k+1)/n-.025/n),u=lerp(p,center,.17),v=lerp(q,center,.17);
      const notch=n>2&&(k+variant)%2===1;
      poly(c,[p,q,v,u],notch?'#7a9076':'#b9bda0',notch?'#668262':'#5d7959',.7);
      stroke(c,[p,q],notch?'#a7b08d60':'#e0dfb896',notch?.6:1);
      if((k+variant)%4===0)stroke(c,[u,lerp(u,v,.6)],'#607e536e',1.6);
    }
  }
  // Small chips change the cap texture, never the occupied ground outline.
  if(variant===2||variant===4){const p=lerp(upper[0],upper[1],.54),q=lerp(p,center,.13);stroke(c,[p,[q[0]+3,q[1]+1],q],'#547751',1.3);}
  c.restore();
  // The crenels rise from the lowered walkway, not beyond the given upper
  // contour. Their small front lips remain within the existing extrusion.
  for(const i of front){
    const a=upper[i],b=upper[(i+1)%upper.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/23);
    if(n<3)continue;
    for(let k=0;k<n;k++)if((k+variant)%2===0){
      const p=lerp(a,b,(k+.06)/n),q=lerp(a,b,(k+.94)/n),u=[p[0],p[1]+Math.min(5,height*.12)],v=[q[0],q[1]+Math.min(5,height*.12)];
      poly(c,[p,q,v,u],'#94a183','#577451',.65);stroke(c,[p,q],'#e0dfb899',.85);
    }
  }
  c.restore();return true;
}
