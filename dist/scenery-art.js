// Hand-painted Canvas scenery. The expensive brushwork is rasterized once;
// world rendering only projects and composites these bounded, reusable images.
// No cast shadows are baked here: the shared sunlight/shadow mask owns those.
const TAU=Math.PI*2,PIXEL_LIMIT=3*1024*1024;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const rng=seed=>{let n=(seed*2654435761)>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};};
const poly=(c,points,color,stroke=null,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(color){c.fillStyle=color;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const stroke=(c,points,color,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.stroke();};
const oval=(c,x,y,rx,ry,color,angle=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fill();};
function leaf(c,x,y,length,width,angle,color){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();c.moveTo(-length*.5,0);c.quadraticCurveTo(-length*.03,-width,length*.5,0);c.quadraticCurveTo(length*.03,width,-length*.5,0);c.fill();c.restore();}
function tuft(c,x,y,size,seed,alpha=1){const r=rng(seed+13);c.save();c.globalAlpha*=alpha;for(let i=0;i<5;i++){const dx=(i-2)*size*.5,tip=dx+(r()-.5)*size*2,h=size*(2+r()*2.8);c.fillStyle=['#66835b','#54744d','#789065','#3a5c3e','#82926a'][i];c.beginPath();c.moveTo(x+dx,y);c.quadraticCurveTo(x+dx-size*.9,y-h*.55,x+tip,y-h);c.quadraticCurveTo(x+dx+size*.25,y-h*.45,x+dx+size*.7,y);c.fill();}c.restore();}
function lobedPath(c,x,y,rx,ry,seed,count=28){const points=[];for(let i=0;i<count;i++){const a=i*TAU/count,f=.87+hash(i+seed,seed)*.16;points.push([x+Math.cos(a)*rx*f,y+Math.sin(a)*ry*f]);}c.beginPath();let prev=points.at(-1);c.moveTo((prev[0]+points[0][0])*.5,(prev[1]+points[0][1])*.5);for(let i=0;i<count;i++){const p=points[i],next=points[(i+1)%count];c.quadraticCurveTo(p[0],p[1],(p[0]+next[0])*.5,(p[1]+next[1])*.5);}c.closePath();}

export class SceneryArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;}
  get diagnostics(){return {entries:this.cache.size,size:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  get cacheStats(){return this.diagnostics;}
  _image(key,w,h,scale,paint){let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}const canvas=this.makeCanvas();canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);const c=canvas.getContext('2d');c.setTransform(scale,0,0,scale,0,0);c.lineCap='round';c.lineJoin='round';paint(c);image={canvas,w,h,pixels:canvas.width*canvas.height};while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;}
  _variant(seed,count=5){return Math.floor(hash((seed||0)*913,37)*count);}
  _groundTile(variant){return this._image(`ground:${variant}`,384,384,1,c=>{
    const r=rng(711+variant*67);
    // Fine, low-contrast flecks suggest soil without a repetitive tile border.
    for(let i=0;i<2000;i++){const x=r()*384,y=r()*384;c.fillStyle=i%3?'#a3ae7710':'#142c2319';c.fillRect(x,y,.5+r()*1.4,.4+r()*.7);}
    for(let i=0;i<62;i++){const x=8+r()*368,y=15+r()*357,s=.65+r()*.8;tuft(c,x,y,s,i+variant*100,.32+r()*.25);}
    for(let i=0;i<63;i++){const x=5+r()*374,y=5+r()*374,a=r()*TAU,l=2+r()*5;leaf(c,x,y,l,l*.22,a,['#9d96522a','#a69c6235','#536e4835','#b6ab7330'][i%4]);if(i%5===0)stroke(c,[[x-l*.4,y],[x+l*.3,y+1]],'#25382a50',.6);}
    for(let i=0;i<8;i++){const x=15+r()*350,y=15+r()*350;stroke(c,[[x-7,y-3],[x-1,y],[x+5,y+1]],'#1a30224a',1.5);stroke(c,[[x-6,y-3.5],[x+4,y]],'#9a99722c',.7);}
  });}
  _groundPatch(variant){return this._image(`patch:${variant}`,384,300,1,c=>{
    const r=rng(952+variant*113),moss=variant%2===0;
    // Soft, irregular brush layers, rather than opaque ellipses or flat cells.
    for(let layer=0;layer<11;layer++){const inset=layer*4;c.fillStyle=moss?'#6b7e3d04':'#7d6b4304';lobedPath(c,192,150,184-inset,136-inset,variant*41+9,38);c.fill();}
    for(let i=0;i<95;i++){const a=r()*TAU,rr=Math.sqrt(r()),x=192+Math.cos(a)*156*rr,y=150+Math.sin(a)*111*rr;if(moss){leaf(c,x,y,5+r()*13,2+r()*3,r()*TAU,i%3?'#6a843324':'#8e954226');}else{c.fillStyle=i%2?'#b09a6a15':'#2336241b';c.fillRect(x,y,1+r()*4,.6+r()*1.2);}}
    for(let i=0;i<12;i++){const a=r()*TAU,rr=.6+r()*.3;tuft(c,192+Math.cos(a)*166*rr,150+Math.sin(a)*120*rr,.9+r()*.7,700+i,.5);}
    if(variant===3){for(let i=0;i<8;i++){const x=160+r()*73,y=117+r()*56;poly(c,[[x-3,y],[x-2,y-2],[x+2,y-3],[x+4,y],[x+1,y+2]],'#70765a60');stroke(c,[[x-2,y-2],[x+2,y-3],[x+3,y-1]],'#b2ad7540',.65);}}
  });}
  drawGround(c,camX,camY,w,h){c.fillStyle='#2b4130';c.fillRect(0,0,w,h);const ox=w*.5-camX,oy=h*.5-camY,tile=384;
    const minX=Math.floor(-ox/tile),minY=Math.floor(-oy/tile),maxX=Math.ceil((w-ox)/tile),maxY=Math.ceil((h-oy)/tile);
    for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){const image=this._groundTile(Math.floor(hash(x+19,y-51)*4));c.drawImage(image.canvas,x*tile+ox,y*tile+oy);}
    const spacing=438;
    for(let y=Math.floor((-oy-300)/spacing);y<=Math.ceil((h-oy+300)/spacing);y++)for(let x=Math.floor((-ox-384)/spacing);x<=Math.ceil((w-ox+384)/spacing);x++){const px=x*spacing+hash(x+3,y+11)*240+ox,py=y*spacing+hash(y+7,x+19)*230+oy;if(px+192<0||px-192>w||py+150<0||py-150>h)continue;const image=this._groundPatch(Math.floor(hash(x+81,y+39)*4));c.drawImage(image.canvas,px-192,py-150);}
  }
  _trunk(v){return this._image(`trunk:${v}`,148,158,2,c=>{c.translate(74,130);const r=rng(v+418),root=[[-10,-15],[-22,-5],[-24,3],[-12,6],[-17,16],[-11,20],[-2,10],[5,12],[13,19],[19,15],[12,6],[24,0],[20,-5],[9,-16]];
    poly(c,root,'#5e6041','#293d2c',1.5);poly(c,[[-10,-12],[-6,-4],[-19,3],[-14,3]],'#a2935d77');poly(c,[[7,-10],[11,2],[19,0],[13,-4]],'#baa76a65');
    const bark=c.createLinearGradient(-12,0,12,0);bark.addColorStop(0,'#414b31');bark.addColorStop(.45,'#746846');bark.addColorStop(.8,'#a48c59');bark.addColorStop(1,'#796b43');c.fillStyle=bark;c.strokeStyle='#2d3d2c';c.lineWidth=1.2;c.beginPath();c.moveTo(-10,7);c.bezierCurveTo(-7,-11,-12,-39,-7,-66);c.lineTo(3,-76);c.lineTo(11,-71);c.bezierCurveTo(4,-38,7,-13,12,7);c.quadraticCurveTo(1,14,-10,7);c.fill();c.stroke();
    for(const [x,y,dx,dy,w] of [[-5,-39,-31,-65,7],[5,-47,29,-72,8],[-4,-52,-18,-83,5]]){stroke(c,[[x,y],[dx*.7,dy+9],[dx,dy]],'#50573a',w+2);stroke(c,[[x+2,y-1],[dx*.7+1,dy+7],[dx+1,dy]],'#9c8855',w*.52);}
    for(let i=0;i<13;i++){const x=-8+r()*17,y=-8-r()*49,l=5+r()*21;stroke(c,[[x,y],[x+(r()-.5)*2,y-l*.35],[x+(r()-.5)*2,y-l]],i%3?'#3b47368a':'#d0b67770',.55+r()*.85);}
    c.strokeStyle='#3b4333';c.lineWidth=1.5;c.beginPath();c.ellipse(-1,-26,2.3,5.6,.14,0,TAU);c.stroke();stroke(c,[[1,-30],[2,-26],[1,-22]],'#bc9f65',.8);
    for(let i=0;i<11;i++){const x=-12+r()*26,y=3+r()*12;leaf(c,x,y,3+r()*6,1+r()*2,r()*TAU,['#506b39','#779149','#94a553'][i%3]);}
    tuft(c,-19,12,1.15,931+v,.9);tuft(c,16,16,1.2,817+v,.85);
  });}
  _canopy(v){return this._image(`canopy:${v}`,148,158,2,c=>{c.translate(74,130);const r=rng(355+v*37),outline=[[-51,-43],[-59,-51],[-55,-62],[-64,-68],[-60,-82],[-52,-89],[-52,-99],[-40,-106],[-31,-105],[-26,-116],[-12,-118],[-4,-123],[11,-121],[23,-116],[33,-117],[42,-106],[52,-104],[54,-92],[63,-85],[59,-73],[65,-63],[57,-51],[47,-49],[40,-40],[25,-38],[15,-33],[1,-36],[-13,-34],[-24,-40],[-39,-37]];
    // An asymmetric, broken crown edge replaces overlapping circles. Variant
    // contours stay within the same gameplay silhouette and occlusion bounds.
    for(let i=0;i<outline.length;i++){outline[i][0]+=(hash(i+91,v+16)-.5)*3;outline[i][1]+=(hash(i+32,v+71)-.5)*2;}
    poly(c,outline,'#1d382b','#142c2355',1.7);const crown=c.createLinearGradient(-40,-35,45,-122);crown.addColorStop(0,'#254934');crown.addColorStop(.5,'#365b38');crown.addColorStop(1,'#668149');
    c.save();poly(c,outline,null);c.clip();c.fillStyle=crown;c.fillRect(-68,-128,136,100);
    const masses=[[-35,-69,23,21],[-12,-49,25,15],[20,-54,29,19],[-37,-93,20,19],[-8,-93,27,24],[23,-98,25,18],[40,-78,20,20],[2,-74,24,19]];
    for(let i=0;i<masses.length;i++){const [x,y,rx,ry]=masses[i];lobedPath(c,x,y+5,rx+2,ry+2,i+v*23,22);c.fillStyle='#15342860';c.fill();lobedPath(c,x+2,y-2,rx,ry,i+v*23,22);c.fillStyle=['#365d38','#3e633a','#456b3e','#507442','#5a7a43','#698449','#56763e','#52763f'][i];c.fill();}
    // Small leaf sprays and directional facets convey foliage at game scale.
    for(let i=0;i<270;i++){const x=-60+r()*120,y=-122+r()*87,highlight=(x+60)/120+(Math.abs(y)-35)/87,l=2.5+r()*5.5,shade=highlight>1.25;leaf(c,x,y,l,1.1+r()*1.6,-.8+r()*1.4,shade?['#afbb7373','#8da25b99','#bed08048'][i%3]:['#6a8b4760','#20493080','#9aaa5650'][i%3]);if(i%9===0)stroke(c,[[x-3,y+3],[x+4,y-2]],'#183c2850',.9);}
    for(let i=0;i<23;i++){const x=-47+r()*101,y=-110+r()*61;leaf(c,x,y,7+r()*6,1.7+r()*2,-.5,['#879e5490','#a2b26285','#6e8f4480'][i%3]);leaf(c,x-3,y+4,4+r()*4,1.5,.3,'#5d8049c0');}
    c.restore();
    for(let i=0;i<outline.length;i+=2){const [x,y]=outline[i];leaf(c,x,y,5,1.6,Math.atan2(y+77,x),'#426638');}
  });}
  drawTree(c,prop,canopyAlpha=1){const v=this._variant(prop.seed),s=prop.scale||1,trunk=this._trunk(v),crown=this._canopy(v);c.save();c.translate(prop.x,prop.y);c.scale(s,s);c.drawImage(trunk.canvas,-74,-130,148,158);c.globalAlpha*=Math.max(0,Math.min(1,canopyAlpha));c.drawImage(crown.canvas,-74,-130,148,158);c.restore();}
  _rock(v){return this._image(`rock:${v}`,96,116,2,c=>{c.translate(48,65);const r=rng(148+v*27),outline=[[-35,4],[-31,-25],[-23,-36],[-5,-53],[10,-50],[26,-39],[35,-13],[34,15],[24,28],[10,34],[-19,29],[-34,17]];
    poly(c,outline,'#586752','#2b4035',1.3);poly(c,[[-31,-25],[-23,-36],[-5,-53],[10,-50],[26,-39],[35,-13],[9,-20],[-9,-13]],'#96a083');poly(c,[[-31,-25],[-9,-13],[5,8],[10,34],[-19,29],[-34,17],[-35,4]],'#536750');poly(c,[[9,-20],[35,-13],[34,15],[24,28],[10,34],[5,8]],'#71816a');poly(c,[[-23,-36],[-5,-53],[10,-50],[26,-39],[2,-40],[-5,-24]],'#adb294');
    c.save();poly(c,outline,null);c.clip();for(let i=0;i<280;i++){const x=-36+r()*72,y=-54+r()*90;stroke(c,[[x,y],[x+.5+r()*2,y-.3+r()*.9]],i%3?'#293f3220':'#dfdeaa35',.4+r()*.75);}
    stroke(c,[[-4,-24],[-10,-14],[-4,-5],[-9,6],[-6,19]],'#334d3c88',1.2);stroke(c,[[-8,-14],[-19,-10],[-21,-3]],'#3a4c3d66',.85);stroke(c,[[24,-33],[17,-27],[20,-18],[14,-10]],'#d1cdb154',.7);stroke(c,[[9,1],[20,9],[24,19]],'#314b3a70',.9);
    for(let i=0;i<34;i++){const x=-28+r()*38,y=-32+r()*14,l=2+r()*5;leaf(c,x,y,l,1+r()*2.4,r()*TAU,['#607c43','#82974e','#a5ae66','#698541'][i%4]);}
    for(let i=0;i<13;i++){const x=10+r()*14,y=-42+r()*22;lobedPath(c,x,y,2+r()*3,1+r()*2,i+31,9);c.fillStyle='#d2caa640';c.fill();}
    c.restore();stroke(c,[[-22,-35],[-5,-52],[10,-49]],'#dad4ac85',1.05);stroke(c,[[11,-49],[25,-38],[33,-15]],'#c5c5a267',.8);tuft(c,-27,27,.9,v+813,.95);tuft(c,24,29,.75,v+711,.8);
  });}
  drawRock(c,prop){const image=this._rock(this._variant(prop.seed)),s=prop.r/36;c.drawImage(image.canvas,prop.x-48*s,prop.y-65*s,96*s,116*s);}
  _log(v){return this._image(`log:${v}`,194,60,2,c=>{c.translate(97,31);const r=rng(297+v*41);poly(c,[[-68,-14],[-54,-16],[45,-17],[65,-13],[73,-5],[72,7],[64,15],[-66,14],[-75,6],[-76,-7]],'#5f5538','#2b3b2c',1.3);poly(c,[[-68,-14],[-54,-16],[45,-17],[65,-13],[68,-6],[-67,-4]],'#978051');poly(c,[[-69,6],[67,7],[65,15],[-66,14],[-74,7]],'#464b33');
    for(let i=0;i<21;i++){const y=-13+r()*26,x=-60+r()*94;stroke(c,[[x,y],[x+10+r()*9,y+(r()-.5)*3],[x+25+r()*9,y+(r()-.5)*3]],i%3?'#383f2b90':'#c7a96b85',.55+r()*1.1);}
    poly(c,[[-34,-12],[-27,-26],[-23,-25],[-26,-11]],'#6d5c3c','#33452d',1);poly(c,[[-28,-25],[-26,-28],[-22,-27],[-23,-24]],'#c0a06b');
    for(const side of [-1,1]){const x=side*67;oval(c,x,0,10.5,14,side>0?'#c0a371':'#a0895c');c.strokeStyle='#6c6441';c.lineWidth=1.2;c.beginPath();c.ellipse(x,0,10.5,14,0,0,TAU);c.stroke();for(let j=1;j<=3;j++){c.strokeStyle=j%2?'#705f3f80':'#e1c28c90';c.lineWidth=.75;c.beginPath();c.ellipse(x+.7,-.4,2+j*2,2+j*3,0,.13,TAU-.1);c.stroke();}stroke(c,[[x,1],[x+4,6],[x+6,11]],'#6a583aa0',.9);stroke(c,[[x,1],[x-1,-5],[x+1,-11]],'#6a583a80',.75);}
    for(let i=0;i<45;i++){const x=-21+r()*61,y=-15+r()*9;leaf(c,x,y,3+r()*7,1+r()*2,-.3+r()*.6,['#4d713b','#769349','#9eaa61','#60813f'][i%4]);}
    for(const [x,y] of [[-39,-5],[-34,-8]]){stroke(c,[[x,y],[x,y-5]],'#ae9b71',1.7);c.fillStyle='#c7b082';c.beginPath();c.moveTo(x-4,y-5);c.quadraticCurveTo(x,y-11,x+4,y-5);c.quadraticCurveTo(x,y-3,x-4,y-5);c.fill();}
  });}
  drawLog(c,prop){const image=this._log(this._variant(prop.seed));c.save();c.translate(prop.x,prop.y);c.rotate(prop.angle||0);c.scale((prop.halfLength||60)/67,prop.r/15);c.drawImage(image.canvas,-97,-31,194,60);c.restore();}
  _hut(region,occupied,spent,depth,width){const key=`hut:${region}:${occupied}:${spent}:${width}:${depth}`;return this._image(key,88,91,2,c=>{c.translate(44,79);const w=width,d=depth,wallTop=-d-8,roofTop=wallTop-24,marsh=region==='marsh',ruins=region==='ruins',r=rng(851+(occupied?9:0));
    // Compact footprint and proportions intentionally match the small v21 hut.
    poly(c,[[-w/2,0],[-w/2,wallTop],[w/2,wallTop],[w/2,0]],ruins?'#777767':marsh?'#6e6f55':'#9a8055','#31432e',1.2);
    if(ruins){for(let row=0;row<4;row++){const y=wallTop+row*9;for(let j=0;j<5;j++){const x=-w/2+j*15-(row%2?7:0),ww=Math.min(14,w/2-x);if(ww>0){c.fillStyle=['#8a8774','#7e826e','#92917a'][(row+j)%3];c.fillRect(Math.max(-w/2,x),y+.8,Math.min(ww,w/2-Math.max(-w/2,x)),7);}}}}else{for(let i=0;i<6;i++){const y=wallTop+i*6;c.fillStyle=['#87734c','#ae9160','#9b8055','#a88a59','#8d764d','#9f8557'][i];c.fillRect(-w/2+1,y+1,w-2,5);stroke(c,[[-w/2+2,y+5],[w/2-2,y+5]],'#554d355f',.7);for(let k=0;k<4;k++){const x=-w/2+2+r()*(w-12);stroke(c,[[x,y+2],[Math.min(w/2-2,x+5+r()*8),y+2.5]],'#d1b2766a',.5);}}}
    // Timber framing and a recessed arched plank door establish real depth.
    for(const x of [-w/2+1,w/2-3]){c.fillStyle='#584d32';c.fillRect(x,wallTop,3,-wallTop);stroke(c,[[x+2,wallTop+2],[x+2,-1]],'#b294607a',.65);}
    c.fillStyle='#253829';c.beginPath();c.moveTo(-8,0);c.lineTo(-8,-21);c.quadraticCurveTo(0,-29,8,-21);c.lineTo(8,0);c.closePath();c.fill();c.strokeStyle='#5a5136';c.lineWidth=2;c.stroke();if(!spent){c.fillStyle='#796545';c.fillRect(-6,-20,11,20);for(const xx of [-3,1])stroke(c,[[xx,-20],[xx,-1]],'#453e2c',.7);stroke(c,[[-5,-19],[4,-19]],'#c2a26b88',.9);oval(c,3,-10,1,1.2,'#dbc688');}else{poly(c,[[-7,-22],[-2,-20],[-2,0],[-7,0]],'#806948');}
    for(const side of [-1,1]){const x=side*w*.33;c.fillStyle='#514c35';c.fillRect(x-5,-29,10,12);const light=c.createLinearGradient(x,-28,x,-18);light.addColorStop(0,spent?'#384837':occupied?'#ba8350':'#efd29a');light.addColorStop(1,spent?'#293b2b':occupied?'#855337':'#ba8f4c');c.fillStyle=light;c.fillRect(x-3.5,-27.5,7,9);stroke(c,[[x,-28],[x,-18]],'#6b5a39',.9);stroke(c,[[x-4,-23],[x+4,-23]],'#6b5a39',.8);stroke(c,[[x-6,-16],[x+6,-16]],'#baa174',1.5);}
    // The chimney is part of the silhouette; no looping smoke obscures combat.
    const chimneyX=w/2-13;c.fillStyle='#727565';c.fillRect(chimneyX,roofTop-7,7,20);for(let yy=roofTop-3;yy<roofTop+11;yy+=5)stroke(c,[[chimneyX,yy],[chimneyX+7,yy]],'#445747',.6);c.fillStyle='#a3a38a';c.fillRect(chimneyX-1.5,roofTop-8,10,3);c.fillStyle='#374236';c.fillRect(chimneyX+.5,roofTop-8,6,1.2);
    const roof=[[-w/2-6,wallTop+3],[-w/2+4,roofTop],[w/2-4,roofTop],[w/2+6,wallTop+3]];poly(c,roof,marsh?'#445f51':ruins?'#57675c':'#4a5b3c','#2b4231',1.5);c.save();poly(c,roof,null);c.clip();
    for(let row=0;row<5;row++){const yy=roofTop+row*5.5;for(let col=0;col<9;col++){const xx=-w/2-10+col*9+(row%2?4.5:0),tone=(row+col+(occupied?1:0))%5;poly(c,[[xx,yy],[xx+8.5,yy],[xx+9,yy+5.2],[xx+1,yy+6]],(marsh?['#627868','#58705e','#758773','#4f6858','#7b8d75']:ruins?['#6c7a6b','#7e8877','#576a61','#87917d','#657469']:['#6a7b50','#7e895b','#596f46','#8b9362','#6f8050'])[tone]);stroke(c,[[xx+1,yy+5.2],[xx+8,yy+4.9]],'#273f2d88',.75);stroke(c,[[xx+1,yy+.7],[xx+7,yy+.7]],'#ccd0a02a',.7);}}
    for(let i=0;i<12;i++){const x=-w*.3+r()*w*.5,y=roofTop+8+r()*14;leaf(c,x,y,2+r()*4,1+r(),r()*TAU,'#a1ac6140');}c.restore();stroke(c,[[-w/2+4,roofTop],[w/2-4,roofTop]],'#b4b48b',1.2);stroke(c,[[-w/2-6,wallTop+3],[w/2+6,wallTop+3]],'#233b2a',2.5);stroke(c,[[-w/2-5,wallTop+2],[w/2+5,wallTop+2]],'#82906499',.8);
    // Moss clings to a few shingles; ivy adds asymmetry without a larger hut.
    for(let i=0;i<8;i++){const y=-27+i*3.7,x=-w/2+4+Math.sin(i)*1.5;leaf(c,x,y,4,1.5,i%2?.5:-.5,['#627b43','#8c9a58','#536d3c'][i%3]);}
  });}
  drawHut(c,site,behind=false){const w=site.width||54,d=site.depth||28,region=site.region||'forest';c.save();c.translate(site.x,site.y);c.fillStyle='#43513b';c.fillRect(-w/2-2,-d,w+4,d+3);for(let i=0;i<2;i++){poly(c,[[-10,i*3],[10,i*3],[11,i*3+3],[-11,i*3+3]],i?'#85896c':'#6c785b');stroke(c,[[-10,i*3],[10,i*3]],'#bbc39b77',.75);}if(region==='marsh')for(const x of [-w/2+3,w/2-3])stroke(c,[[x,-4],[x,5]],'#8f8860',2.5);const image=this._hut(region,site.type==='occupied'&&site.state!=='cleared',site.state==='spent',d,w);if(behind)c.globalAlpha*=.36;c.drawImage(image.canvas,-44,-79,88,91);c.restore();}
}
