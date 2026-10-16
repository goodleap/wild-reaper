import { SceneryArt } from './scenery-art.js';
// Reusable cartoon scenery. Anchors and dimensions are ground-space values;
// crowns, roofs and shadows never become an obstacle footprint.
export const EMBER_PALETTE=Object.freeze({
  ink:'#484b40',rock:'#7b7b70',rockLight:'#aaa793',rockDark:'#51584e',rockTop:'#a49d84',
  earth:'#d9b08c',earthLight:'#e8c49d',path:'#efd1a6',grass:'#8e9a72',grassLight:'#b3ba8a',
  wood:'#92744d',woodLight:'#c5a475',woodDark:'#514b35',roof:'#7e7952',roofLight:'#a8a071',
  wall:'#c9b391',ore:'#bb7960',oreLight:'#edb27c',lava:'#ed8653',lavaLight:'#ffd179'
});
const TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
let sharedScenery;
function scenery(){return sharedScenery??=(new SceneryArt());}
function themedImage(art,source,kind,key,tone='amber'){
  const tones=kind==='rock'?(tone==='terracotta'?[[59,51,41],[119,91,66],[163,127,90],[201,168,126],[232,209,167]]:[[41,47,41],[89,96,84],[133,138,120],[178,181,157],[216,215,184]]):
    tone==='oasis'||tone==='olive'?[[30,48,32],[73,103,52],[112,139,70],[165,184,107],[208,218,153]]:
    tone==='charred'?[[37,43,34],[77,85,57],[116,117,77],[158,152,105],[195,185,138]]:
    [[45,48,31],[100,91,47],[156,135,67],[202,177,104],[235,214,154]];
  return art._image(`ember:${kind}:${key}:${tone}`,source.w,source.h,2,c=>{
    c.drawImage(source.canvas,0,0,source.w,source.h);
    // A bounded, one-time palette map preserves the original painted shading
    // and alpha, without per-frame filters or a pale pink sepia cast.
    const pixels=c.getImageData?.(0,0,Math.ceil(source.w*2),Math.ceil(source.h*2));if(!pixels?.data)return;
    const data=pixels.data,levels=[0,70,115,170,220];
    for(let i=0;i<data.length;i+=4){if(!data[i+3])continue;const l=data[i]*.3+data[i+1]*.56+data[i+2]*.14;let band=0;while(band<3&&l>levels[band+1])band++;const t=Math.min(1,Math.max(0,(l-levels[band])/(levels[band+1]-levels[band])));for(let k=0;k<3;k++)data[i+k]=Math.round(tones[band][k]*(1-t)+tones[band+1][k]*t);}
    c.putImageData(pixels,0,0);
  });
}
// Reuse the accepted worlds' actual painted forms. Palette work is cached at
// source resolution; map tiles and depth-sorted props use identical foliage.
export function drawEmberCanopy(c,{x,y,width=140,height=90,seed=0,tone='amber',alpha=1},art=null){
  art??=scenery();const v=art._variant(seed),image=themedImage(art,art._canopy(v),'crown',v,tone);
  c.save();c.globalAlpha*=alpha;c.drawImage(image.canvas,x-width/2,y-height/2,width,height);c.restore();
}
export function drawEmberUnderbrush(c,{x,y,width=90,height=46,seed=0,tone='amber',alpha=1},art=null){
  art??=scenery();const v=art._variant(seed,4),image=themedImage(art,art._shrub(v),'shrub',v,tone);
  c.save();c.globalAlpha*=alpha;c.drawImage(image.canvas,x-width/2,y-height*.78,width,height);c.restore();
}
export function drawEmberRock(c,{x,y,width=72,depth=42,height=60,seed=0,tone='basalt'},art=null){
  art??=scenery();const v=[0,1,2,4][art._variant(seed,4)],image=themedImage(art,art._rock(v),'rock',v,tone),sourceTop=[49,24,61,53,44][v],sx=width/72,sy=(height+depth*.43)/(sourceTop+34),oy=depth*.43-34*sy;
  c.drawImage(image.canvas,x-48*sx,y-72*sy+oy,96*sx,120*sy);
}
const number=(n,fallback)=>Number.isFinite(n)?n:fallback;
const SIZES=Object.freeze({basalt:[58,42,50],shrub:[38,24,31],tree:[24,24,100],ore:[38,28,37],crate:[35,28,35],cart:[64,36,44],lamp:[14,14,66],shelter:[136,76,103],fence:[80,10,30],'bridge-rail':[90,10,25],sign:[22,18,45],barrel:[26,26,35],anvil:[38,26,28],banner:[20,16,85],
  'camp-tent':[140,80,82],crane:[48,40,150],forge:[112,72,100],totem:[34,30,70],'arch-pier':[40,36,150],'arch-lintel':[140,0,150],'dead-tree':[22,22,112],crystal:[60,44,90],bench:[74,24,28],well:[84,68,60]});
function dimensions(prop){const defaults=SIZES[prop.emberKind]||SIZES.basalt;return {w:number(prop.width,defaults[0]),d:number(prop.depth,defaults[1]),h:number(prop.height,defaults[2])};}
function poly(c,points,fill,stroke=null,width=1.6){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function oval(c,x,y,rx,ry,fill,stroke=null,width=1.4){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function line(c,points,color,width=1.5){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function rounded(c,x,y,w,h,r,fill,stroke=null,width=1.5){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function capsule(c,w,d,y=0){const r=Math.min(w,d)/2,half=Math.max(0,w/2-r);c.beginPath();c.moveTo(-half,y-d/2);c.lineTo(half,y-d/2);c.ellipse(half,y,r,d/2,0,-Math.PI/2,Math.PI/2);c.lineTo(-half,y+d/2);c.ellipse(-half,y,r,d/2,0,Math.PI/2,Math.PI*1.5);c.closePath();}
function texture(c,points,seed,count=45,light='#ddca9b45',dark='#383d302c'){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  c.save();poly(c,points);c.clip();
  for(let i=0;i<count;i++){const x=x0+hash(i+seed,13)*(x1-x0),y=y0+hash(i+seed,71)*(y1-y0);line(c,[[x,y],[x+1.5+hash(i+seed,39)*5,y-.5+hash(i+seed,81)]],i%3?dark:light,.5+hash(i+seed,17)*.6);}
  c.restore();
}
function timber(c,x,y,w,h,seed=0){
  const P=EMBER_PALETTE;rounded(c,x,y,w,h,1.3,P.wood,P.woodDark,1.2);line(c,[[x+w*.23,y+2],[x+w*.23,y+h-2]],P.woodLight,.9);
  for(let i=0;i<5;i++){const yy=y+3+hash(seed+i,51)*(h-8),xx=x+w*(.3+hash(seed+i,91)*.45);line(c,[[xx,yy],[xx+.5,Math.min(y+h-2,yy+4+hash(seed+i,11)*8)]],'#55472d88',.65);}
}
function masonry(c,points,seed=0,tones=['#8e8976','#a59a80','#b4a78b','#9e947d']){
  c.save();poly(c,points);c.clip();const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),rows=Math.ceil((y1-y0)/12);
  for(let row=0;row<rows;row++)for(let col=0;col<Math.ceil((x1-x0)/23)+1;col++){
    const x=x0+col*23-(row%2?11:0),y=y0+row*12,j=hash(seed+col,row),stone=[[x+1,y+1],[x+20+j*2,y+.5],[x+22,y+9],[x+3,y+11],[x,y+7]];
    poly(c,stone,tones[(row+col)%tones.length],'#4c4f3b66',.7);line(c,[[x+3,y+2],[x+19,y+1.7]],'#e6d6ac5c',.65);
  }
  c.restore();
}

export function emberVisual(prop){
  if(prop?.variant!=='ember-native')return null;
  const {w,d,h}=dimensions(prop),kind=prop.emberKind,tree=kind==='tree',roof=kind==='shelter'||kind==='camp-tent';
  const visualWidth=number(prop.visualWidth,tree?Math.max(78,w*3.4):roof?w+24:kind==='dead-tree'?72:kind==='crane'?160:w+8),top=tree?h:h+d/2;
  return {halfWidth:Math.max(visualWidth*(tree?.55:.5)+5,kind==='lamp'?29:kind==='cart'?w*.65+3:kind==='crane'?visualWidth*.62+6:kind==='banner'?w*1.1+4:kind==='sign'?w*.7+3:0),top:top+12,bottom:d/2+7,
    canopyX:0,canopyY:tree?-h*.62:roof?-h*.7:0,canopyRx:visualWidth/2,canopyRy:tree?h*.39:roof?h*.4:0,
    shadowWidth:kind==='arch-lintel'?0:tree?visualWidth*.31:w*.47,shadowLength:kind==='arch-lintel'?0:tree?h*.34:Math.max(10,h*.34),shadowOffset:kind==='arch-lintel'?0:Math.max(6,h*.17)};
}

function basalt(c,p,w,d,h){drawEmberRock(c,{x:0,y:0,width:w,depth:d,height:h,seed:p.seed||0,tone:p.tone});}
function shrub(c,p,w,d,h){drawEmberUnderbrush(c,{x:0,y:0,width:number(p.visualWidth,w*1.08),height:h+d*.28,seed:p.seed||0,tone:p.tone});}
function tree(c,p,w,d,h,alpha){
  const art=scenery(),v=art._variant(p.seed),trunk=art._trunk(v),tw=[1.08,.74,.92,.58,1.22][v],th=[.91,1.20,1.06,.81,1.07][v],sx=w/(44*tw),sy=h*.7/(90*th),vw=number(p.visualWidth,Math.max(78,w*3.4));
  const anchor=trunk.h-28,rootHeight=Math.min(28*sy,d*.5+5);
  c.drawImage(trunk.canvas,0,0,trunk.canvas.width,anchor*2,-trunk.w*sx/2,-anchor*sy,trunk.w*sx,anchor*sy);
  c.drawImage(trunk.canvas,0,anchor*2,trunk.canvas.width,56,-trunk.w*sx/2,0,trunk.w*sx,rootHeight);
  drawEmberCanopy(c,{x:0,y:-h*.62,width:vw,height:h*.78,seed:p.seed||0,tone:p.tone,alpha},art);
}
function ore(c,p,w,d,h){
  basalt(c,p,w,d,h);
  for(const [x,y,s]of[[-.17,-.66,1],[.12,-.48,.8],[.21,-.19,.6]]){
    const xx=x*w,yy=y*h,ww=w*.15*s,hh=h*.12*s;
    poly(c,[[xx-ww,yy],[xx-ww*.35,yy-hh],[xx+ww*.65,yy-hh*.7],[xx+ww,yy+hh*.6],[xx-ww*.2,yy+hh]],'#a87743','#565239',.7);
    poly(c,[[xx-ww,yy],[xx-ww*.35,yy-hh],[xx+ww*.65,yy-hh*.7],[xx+ww*.1,yy+hh*.15]],'#d0a263');
    line(c,[[xx-ww*.45,yy-hh*.5],[xx+ww*.5,yy-hh*.4]],'#eed19a',.85);
    line(c,[[xx+ww*.2,yy+hh],[xx+ww*.3,yy+hh*1.8],[xx-ww*.2,yy+hh*2.5]],'#b88951',1.4);
  }
}
function crate(c,p,w,d,h){
  const P=EMBER_PALETTE,top=-h+d*.2,front=d*.42;
  capsule(c,w,d);c.fillStyle=P.woodDark;c.fill();
  rounded(c,-w*.47,top,w*.94,front-top,3,P.wood,P.woodDark,1.8);
  poly(c,[[-w*.47,top],[-w*.28,top-d*.43],[w*.43,top-d*.43],[w*.47,top],[w*.25,top+d*.15]],P.woodLight,P.woodDark,1.6);
  for(const x of[-.27,0,.27])line(c,[[x*w,top+2],[x*w,front-2]],'#8a6549',1.3);
  texture(c,[[-w*.46,top],[w*.46,top],[w*.46,front],[-w*.46,front]],Math.floor((p.seed||0)*271),65,'#efd09b66','#483f2d45');
  line(c,[[-w*.39,top+5],[w*.4,front-5]],P.woodLight,4);
  line(c,[[w*.39,top+5],[-w*.4,front-5]],P.woodLight,4);
  for(const x of[-.39,.39])for(const y of[top+5,front-5])oval(c,x*w,y,1.2,1.2,P.woodDark);
}
function barrel(c,p,w,d,h){
  const P=EMBER_PALETTE;rounded(c,-w*.45,-h+d*.4,w*.9,h,Math.min(10,w*.3),P.wood,P.woodDark,1.5);
  const body=[[-w*.4,-h+d*.4],[w*.4,-h+d*.4],[w*.44,d*.3],[-w*.44,d*.3]];texture(c,body,Math.floor((p.seed||0)*137),36,'#e2c08b66','#443e2c3b');
  for(const xx of[-.2,.1])line(c,[[xx*w,-h+d*.5],[(xx-.02)*w,d*.35]],'#c39966',1.5);
  for(const y of[-h*.67,-h*.13])rounded(c,-w*.46,y,w*.92,4,1,'#77716b');
  oval(c,0,-h+d*.4,w*.45,d*.3,P.woodLight,P.woodDark);
  line(c,[[-w*.31,-h+d*.4],[w*.31,-h+d*.4]],'#a47c51',1);
}
function cart(c,p,w,d,h){
  const P=EMBER_PALETTE;
  line(c,[[-w*.25,d*.3],[w*.65,d*.43]],P.woodDark,4);
  for(const x of[-.32,.32]){oval(c,x*w,d*.25,w*.12,w*.12,'#5d5a61',P.ink,1.5);oval(c,x*w,d*.25,w*.055,w*.055,'#b9b1a0');}
  for(const x of[-.32,.32])for(const a of[0,Math.PI/2])line(c,[[x*w-Math.cos(a)*w*.075,d*.25-Math.sin(a)*w*.075],[x*w+Math.cos(a)*w*.075,d*.25+Math.sin(a)*w*.075]],'#aaa296',1.3);
  const front=[[-w*.43,d*.15],[-w*.5,-h*.63],[w*.44,-h*.63],[w*.38,d*.17]];
  poly(c,front,'#a1875b',P.woodDark,1.3);
  for(const t of[-.45,-.17,.08])line(c,[[-w*.45,t*h],[w*.39,t*h]],'#655638',.8);
  texture(c,front,Math.floor((p.seed||0)*137),65,'#e7c39166','#4d4a342e');
  poly(c,[[-w*.5,-h*.63],[-w*.28,-h*.8],[w*.5,-h*.8],[w*.44,-h*.63]],'#596249',P.woodDark,1.2);
  for(const [x,y,s]of[[-.2,-.69,.14],[0,-.74,.17],[.23,-.66,.15]]){
    const rock=[[x*w-s*w,y*h],[x*w-s*w*.5,y*h-s*h],[x*w+s*w*.5,y*h-s*h*.8],[x*w+s*w,y*h]];
    poly(c,rock,'#8e9179',P.ink,.7);texture(c,rock,x*90+13,14);
    line(c,[[x*w-s*w*.3,y*h-s*h*.5],[x*w+s*w*.4,y*h-s*h*.6]],'#d2ae71',1.6);
  }
  line(c,[[-w*.4,-h*.19],[w*.36,-h*.19]],P.woodLight,3);
  for(const x of[-.32,.27])line(c,[[x*w,-h*.57],[x*w,d*.08]],P.woodDark,2.5);
  for(const x of[-.32,.27])for(const y of[-h*.5,-h*.14])oval(c,x*w,y,1,1,'#b9ac7d');
}
function lamp(c,p,w,d,h){
  const P=EMBER_PALETTE;
  oval(c,0,d*.14,w*.5,d*.47,'#827a72',P.ink,1.2);
  rounded(c,-3,-h+14,6,h-12,2,P.wood,P.woodDark,1.4);
  line(c,[[0,-h+15],[0,-h],[18,-h],[18,-h+10]],P.woodDark,3);
  rounded(c,11,-h+8,15,21,3,'#e6bd79',P.woodDark,1.6);
  rounded(c,14,-h+10,9,15,2,'#ffdfa0');
  line(c,[[13,-h+20],[24,-h+20]],'#b38756',1.4);
  poly(c,[[9,-h+9],[13,-h+5],[23,-h+5],[28,-h+9]],'#827d55',P.woodDark,.8);
  line(c,[[14,-h+7],[23,-h+7]],'#d7be83',.9);
  line(c,[[18,-h+10],[18,-h+26]],'#997d48',.8);
  poly(c,[[11,-h+28],[26,-h+28],[23,-h+31],[14,-h+31]],'#847655',P.woodDark,.8);
  line(c,[[-1,-h+19],[-1,-h+36]],'#d4b27a',.8);
}
function shelter(c,p,w,d,h,alpha){
  const P=EMBER_PALETTE,front=d*.43,wallTop=-h*.43,roofTop=-h-d*.12,vw=number(p.visualWidth,w+24),seed=Math.floor((p.seed||0)*719);
  const walls=[[-w*.46,front-4],[-w*.46,wallTop],[w*.44,wallTop-4],[w*.46,front-4],[w*.33,front+1],[-w*.33,front+1]];
  poly(c,walls,'#9c8863',P.woodDark,1.3);
  c.save();poly(c,walls);c.clip();
  for(let row=0;row<8;row++){const y=wallTop+row*9;poly(c,[[-w*.48,y],[w*.48,y-2],[w*.48,y+6],[-w*.48,y+7]],['#a48a60','#b49a6d','#94805a','#a89066'][row%4]);line(c,[[-w*.45,y+7],[w*.45,y+6]],'#574e3560',.7);}
  c.restore();texture(c,walls,seed,72,'#e2c79657','#4f48352e');
  if(p.fortified)masonry(c,walls,seed+19);
  const footing=[[-w*.46,front-18],[w*.46,front-18],[w*.46,front-4],[w*.33,front+2],[-w*.33,front+2],[-w*.46,front-4]];
  poly(c,footing,'#786f58',P.woodDark,1);masonry(c,footing,seed);
  for(const x of[-.43,.41])timber(c,x*w-3,wallTop-2,6,front-wallTop-3,seed+x*100);
  // Recessed doorway and windows keep the body readable beneath the eaves.
  const doorW=Math.max(18,w*.18),doorTop=-h*.23;
  c.beginPath();c.moveTo(-doorW/2,front-2);c.lineTo(-doorW/2,doorTop+5);c.quadraticCurveTo(0,doorTop-6,doorW/2,doorTop+5);c.lineTo(doorW/2,front-2);c.closePath();c.fillStyle='#343e32';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=3;c.stroke();
  poly(c,[[-doorW*.4,front-3],[-doorW*.4,doorTop+7],[doorW*.25,doorTop+5],[doorW*.25,front-3]],'#796644');
  for(const xx of[-.2,.03])line(c,[[doorW*xx,doorTop+7],[doorW*xx,front-4]],'#4e4834',.8);
  line(c,[[-doorW*.33,doorTop+9],[doorW*.18,doorTop+7]],'#bda479',1);oval(c,doorW*.14,front*.25,1.2,1.4,'#d7bd7b');
  for(const xx of[-.29,.28]){const x=xx*w,y=wallTop+12;rounded(c,x-10,y,20,19,1.5,'#514e38',P.woodDark,1.2);rounded(c,x-7.5,y+2,15,14,1,'#bc9d62');poly(c,[[x-7,y+2],[x+7,y+2],[x+7,y+14],[x-7,y+7]],'#e1c789');line(c,[[x,y+2],[x,y+16]],'#706047',1.2);line(c,[[x-8,y+9],[x+8,y+9]],'#706047',1.2);timber(c,x-12,y+18,24,4,seed+xx*90);}
  c.save();c.globalAlpha*=alpha;
  const chimney=[[w*.24,roofTop+24],[w*.24,roofTop-5],[w*.37,roofTop-7],[w*.38,roofTop+27]];
  poly(c,chimney,'#817e6b',P.woodDark,1.1);masonry(c,chimney,seed+3);poly(c,[[w*.22,roofTop-6],[w*.37,roofTop-8],[w*.4,roofTop-4],[w*.24,roofTop-2]],'#b6aa8a',P.woodDark,1);line(c,[[w*.26,roofTop-5],[w*.36,roofTop-6]],'#43483a',2.5);
  const roof=[[-vw*.5,wallTop+3],[-vw*.36,roofTop],[vw*.34,roofTop+1],[vw*.5,wallTop+3],[vw*.2,wallTop+7],[-vw*.26,wallTop+6]];
  poly(c,roof,P.roof,P.woodDark,1.7);c.save();poly(c,roof);c.clip();
  const tileH=11,tileW=19;
  for(let row=0;row<Math.ceil((wallTop-roofTop+10)/tileH);row++)for(let col=0;col<Math.ceil(vw/tileW)+2;col++){
    const x=-vw*.6+col*tileW+(row%2?tileW*.5:0),y=roofTop+row*tileH,j=hash(seed+row,col),tone=['#8d885b','#a39965','#746f4c','#ada472','#918457'][(row+col)%5];
    const tile=[[x,y],[x+tileW-1,y+.5],[x+tileW+1,y+tileH-2],[x+tileW*.7,y+tileH+1],[x+1,y+tileH]];
    poly(c,tile,tone);line(c,[[x+1,y+tileH],[x+tileW*.7,y+tileH+1],[x+tileW+1,y+tileH-2]],'#454b3680',.9);line(c,[[x+3,y+2],[x+tileW-3,y+2.5]],'#ded4a640',.8);
    if(j>.6)line(c,[[x+tileW*.5,y+3],[x+tileW*.5+2,y+7]],'#514f3960',.65);
  }
  c.restore();texture(c,roof,seed+171,62,'#e2cea642','#41473325');
  line(c,[[-vw*.36,roofTop],[vw*.34,roofTop+1]],'#c3b78a',3);line(c,[[-vw*.36,roofTop+3],[vw*.34,roofTop+4]],'#716a48',1.2);
  line(c,[[-vw*.5,wallTop+3],[-vw*.26,wallTop+6],[vw*.2,wallTop+7],[vw*.5,wallTop+3]],'#3f4632',3.5);line(c,[[-vw*.48,wallTop+2],[-vw*.25,wallTop+4],[vw*.2,wallTop+5],[vw*.48,wallTop+2]],'#c2ad78',1);
  c.restore();
  if(p.sign!==false){const x=w*.27,y=wallTop+3;line(c,[[x-9,y],[x-9,y+10]],'#5c553c',1);line(c,[[x+9,y],[x+9,y+10]],'#5c553c',1);rounded(c,x-15,y+8,30,13,1.5,'#c4a776',P.woodDark,1.1);line(c,[[x-10,y+12],[x+10,y+12]],'#e7cd9a',.8);line(c,[[x-7,y+18],[x+5,y+11]],'#6d5d40',2);line(c,[[x-3,y+11],[x+8,y+17]],'#6d5d40',2);}
}
function fence(c,p,w,d,h){
  const P=EMBER_PALETTE;
  for(const y of[-h*.73,-h*.27]){rounded(c,-w*.5,y,w,5,1,P.wood,P.woodDark,1.2);line(c,[[-w*.5+2,y+1],[w*.5-2,y+1]],P.woodLight,1.2);}
  for(const x of[-w*.45,w*.45]){rounded(c,x-4,-h,8,h+d*.35,2,P.wood,P.woodDark,1.5);poly(c,[[x-5,-h],[x,-h-4],[x+5,-h]],P.woodLight);}
}
function rail(c,p,w,d,h){
  const P=EMBER_PALETTE;
  rounded(c,-w/2,-h,w,h+d/2,2,P.rock,P.ink,1.4);
  rounded(c,-w/2-2,-h-3,w+4,6,2,'#b4aaa8',P.ink,1.2);
  for(let x=-w/2+26;x<w/2;x+=35)line(c,[[x,-h+6],[x,d/2-2]],'#625f72',1.2);
}
function sign(c,p,w,d,h){
  const P=EMBER_PALETTE;rounded(c,-3,-h+10,6,h-10+d*.4,1,P.wood,P.woodDark,1.3);poly(c,[[-w*.6,-h], [w*.38,-h],[w*.7,-h+9],[w*.38,-h+18],[-w*.6,-h+18]],'#d5b37c',P.woodDark,1.4);line(c,[[-w*.3,-h+8],[w*.3,-h+8]],'#8e704f',1.6);
}
function anvil(c,p,w,d,h){poly(c,[[-w*.4,d*.3],[-w*.29,-h*.33],[w*.27,-h*.33],[w*.39,d*.3]],'#777f70',EMBER_PALETTE.ink);poly(c,[[-w*.46,-h*.38],[-w*.47,-h*.87],[w*.36,-h*.87],[w*.55,-h*.72],[w*.23,-h*.53],[w*.23,-h*.38]],'#8c9582',EMBER_PALETTE.ink);line(c,[[-w*.39,-h*.84],[w*.31,-h*.84]],'#c3c3a3',2);}
function banner(c,p,w,d,h){const P=EMBER_PALETTE;rounded(c,-3,-h,6,h+d*.3,2,P.wood,P.woodDark);poly(c,[[3,-h+4],[w*1.1,-h+4],[w*.9,-h*.67],[3,-h*.6]],'#b77965',P.woodDark);poly(c,[[w*.28,-h*.9],[w*.55,-h*.83],[w*.28,-h*.73]],'#edc183');}

function tent(c,p,w,d,h,alpha){
  const P=EMBER_PALETTE,front=d*.42,seed=Math.floor((p.seed||0)*1439),olive=p.tone==='oasis',ridge=[[-w*.17,-h],[w*.13,-h*.7]],left=[[-w*.17,-h],[-w*.47,-h*.2],[-w*.43,-d*.04],[-w*.22,front],[w*.13,-h*.7]];
  // A long ridge tent: a shaded side, cloth roof and a separate front opening.
  c.save();c.globalAlpha*=alpha;
  c.beginPath();c.moveTo(...ridge[0]);c.quadraticCurveTo(-w*.29,-h*.5,-w*.47,-h*.2);c.lineTo(-w*.43,-d*.04);c.quadraticCurveTo(-w*.35,front*.7,-w*.22,front);c.quadraticCurveTo(-w*.05,-h*.18,...ridge[1]);c.closePath();c.fillStyle=olive?'#88906a':'#a1855d';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.3;c.stroke();
  texture(c,left,seed,100,'#e6d3a546','#4b4c332e');
  for(const t of[.27,.55,.78]){const x=ridge[0][0]+(ridge[1][0]-ridge[0][0])*t,y=ridge[0][1]+(ridge[1][1]-ridge[0][1])*t;line(c,[[x,y+2],[x-w*.16,-h*.25+t*h*.12],[-w*.45+w*.23*t,-d*.03+front*t]],'#e3cca17d',1.1);}
  const end=[ridge[1],[-w*.22,front],[w*.46,front],[w*.43,-h*.14]];
  c.beginPath();c.moveTo(...ridge[1]);c.quadraticCurveTo(w*.02,-h*.15,-w*.22,front);c.quadraticCurveTo(w*.1,front+3,w*.46,front);c.quadraticCurveTo(w*.28,-h*.1,...ridge[1]);c.closePath();c.fillStyle=olive?'#a8ae83':'#c2ab7e';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.4;c.stroke();
  texture(c,end,seed+81,70,'#eee1b856','#5b53382b');
  c.beginPath();c.moveTo(w*.12,-h*.43);c.quadraticCurveTo(w*.04,-h*.1,-w*.03,front-2);c.lineTo(w*.3,front-2);c.quadraticCurveTo(w*.22,-h*.16,w*.12,-h*.43);c.closePath();c.fillStyle='#394233';c.fill();
  poly(c,[[w*.12,-h*.43],[w*.04,front-3],[-w*.03,front-2]],olive?'#c0c79b':'#e0c99c');poly(c,[[w*.12,-h*.43],[w*.3,front-2],[w*.26,front-2]],'#8a7956');
  line(c,[[w*.12,-h*.43],[w*.04,front-4]],'#f0ddb1',1.1);line(c,[[w*.12,-h*.43],[w*.26,front-4]],'#e0cca1',1);
  line(c,[...ridge],'#5b553b',3.5);line(c,[[ridge[0][0],ridge[0][1]-1],[ridge[1][0],ridge[1][1]-1]],'#d9bd88',1.5);
  line(c,[[-w*.22,front],[w*.46,front]],'#736747',3);line(c,[[-w*.2,front-2],[w*.45,front-2]],'#e0c695',1);
  const patch=[[-w*.25,-h*.48],[-w*.16,-h*.42],[-w*.22,-h*.23],[-w*.31,-h*.27]];poly(c,patch,olive?'#73815c':'#8c7958');texture(c,patch,seed+33,16,'#d4be8a66','#484b3222');line(c,patch,'#c4b28688',.7);
  for(const t of[.27,.67]){const x=-w*.45+t*w*.23,y=-d*.03+t*front;line(c,[[x,y-3],[x-w*.05,y+4]],'#c9b78c',1.1);timber(c,x-w*.07,y,3,6,seed+t*9);}
  c.restore();
}
function crane(c,p,w,d,h){
  const P=EMBER_PALETTE,vw=number(p.visualWidth,160),reach=vw*.53;
  capsule(c,w,d);c.fillStyle='#837a76';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.6;c.stroke();
  rounded(c,-w*.28,-h,w*.56,h+d*.25,3,P.wood,P.woodDark,1.8);
  rounded(c,-w*.37,-h*.36,w*.74,8,1,'#807d7a',P.ink,1.3);
  line(c,[[-w*.12,-h+6],[-w*.12,-h*.43]],P.woodLight,2);
  poly(c,[[-w*.25,-h+8],[reach,-h+8],[reach,-h+20],[-w*.25,-h+20]],P.woodLight,P.woodDark,1.8);
  line(c,[[w*.1,-h*.39],[reach-8,-h+20]],P.wood,7);
  line(c,[[w*.11,-h*.41],[reach-8,-h+20]],P.woodDark,1.4);
  oval(c,reach-8,-h+14,6,6,'#77716d',P.woodDark,1.4);
  line(c,[[reach-8,-h+18],[reach-8,-h*.53]],'#69645e',1.8);
  c.beginPath();c.arc(reach-11,-h*.51,5,-Math.PI*.5,Math.PI*.65);c.strokeStyle='#625e63';c.lineWidth=2.6;c.stroke();
  oval(c,0,-h*.2,w*.36,w*.2,'#9b8c77',P.woodDark,1.6);
  for(const y of[-h*.24,-h*.19,-h*.14])line(c,[[-w*.25,y],[w*.27,y]],'#d2b282',1.8);
}
function forge(c,p,w,d,h){
  const P=EMBER_PALETTE,front=d*.42,seed=Math.floor((p.seed||0)*591),body=[[-w*.47,front-6],[-w*.46,-h*.4],[-w*.37,-h*.64],[w*.29,-h*.69],[w*.44,-h*.48],[w*.46,front-6],[w*.29,front],[-w*.29,front]];
  poly(c,body,'#777c68',P.ink,1.4);masonry(c,body,seed,['#92947e','#a5a58a','#858b75','#b5ae90']);texture(c,body,seed+7,130,'#dfd4ad48','#35453638');
  const shoulder=[[-w*.46,-h*.4],[-w*.37,-h*.64],[w*.29,-h*.69],[w*.44,-h*.48],[w*.3,-h*.37],[-w*.3,-h*.32]];
  poly(c,shoulder,'#a5a487',P.ink,1);texture(c,shoulder,seed+131,60,'#f0deb558','#4c503333');
  const archTop=-h*.35,archW=w*.49,archBottom=front*.67;
  c.beginPath();c.moveTo(-archW/2,archBottom);c.lineTo(-archW/2,archTop+17);c.bezierCurveTo(-archW/2,archTop-5,archW/2,archTop-5,archW/2,archTop+17);c.lineTo(archW/2,archBottom);c.closePath();c.fillStyle='#303b31';c.fill();c.strokeStyle='#646b55';c.lineWidth=5;c.stroke();
  const heat=c.createRadialGradient(0,archBottom,1,0,archBottom,h*.45);heat.addColorStop(0,'#d8904e');heat.addColorStop(.5,'#9f663c');heat.addColorStop(1,'#303b31');c.save();c.clip();c.fillStyle=heat;c.fillRect(-archW,archTop,archW*2,h);
  for(let i=0;i<12;i++){const x=(hash(i+seed,2)-.5)*archW*.8,y=archBottom-2-hash(i+seed,4)*11;poly(c,[[x-4,y],[x-2,y-4],[x+3,y-3],[x+5,y+2],[x-2,y+3]],i%3?'#4d4f37':'#ca8347');}
  for(const [x,hh]of[[-.11,.20],[.04,.29],[.14,.15]]){c.beginPath();c.moveTo(x*w-5,archBottom-4);c.quadraticCurveTo(x*w-8,archBottom-h*hh*.6,x*w+1,archBottom-h*hh);c.quadraticCurveTo(x*w-1,archBottom-h*hh*.4,x*w+5,archBottom-4);c.closePath();c.fillStyle='#efbc6d';c.fill();}
  c.restore();
  for(let i=0;i<7;i++){const a=Math.PI+(i+.5)*Math.PI/7,rx=archW*.58,ry=h*.22,x=Math.cos(a)*rx,y=archTop+17+Math.sin(a)*ry;poly(c,[[x-5,y-3],[x+3,y-6],[x+6,y+4],[x-3,y+7]],['#c5b99a','#a79f82','#b7ae90'][i%3],'#606a52',.9);line(c,[[x-3,y-2],[x+2,y-4]],'#ede0ba65',.8);}
  const chimney=[[w*.17,-h*.45],[w*.17,-h],[w*.32,-h-2],[w*.35,-h*.46]];
  poly(c,chimney,'#777d68',P.ink,1.1);masonry(c,chimney,seed+7,['#919780','#a4a58a','#858c76','#b1af90']);texture(c,chimney,seed+6,40);
  poly(c,[[w*.14,-h],[w*.16,-h-5],[w*.34,-h-6],[w*.38,-h+1],[w*.34,-h+5],[w*.15,-h+4]],'#b4ae91',P.ink,1);line(c,[[w*.19,-h-2],[w*.32,-h-3]],'#3c4638',3);
  line(c,[[-archW*.59,archBottom+2],[archW*.59,archBottom+2]],'#534f37',4);line(c,[[-archW*.55,archBottom+1],[archW*.55,archBottom+1]],'#b4a17a',1);
  for(const x of[-.3,.29])poly(c,[[x*w-7,front-6],[x*w-6,front-13],[x*w+5,front-14],[x*w+8,front-5],[x*w+4,front+1],[x*w-6,front+1]],'#a6a286',P.ink,.7);
}
function totem(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#706b77';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.5;c.stroke();
  const body=[[-w*.4,d*.32],[-w*.3,-h*.85],[-w*.13,-h],[w*.24,-h*.95],[w*.37,d*.32]];poly(c,body,p.tone==='terracotta'?'#b28f6b':'#8f937a',P.ink,1.2);texture(c,body,Math.floor((p.seed||0)*181),90,'#e3cda37a','#3f483846');
  poly(c,[[-w*.3,-h*.85],[-w*.13,-h],[w*.24,-h*.95],[w*.26,-h*.78],[-w*.14,-h*.77]],'#bfb0ac');
  poly(c,[[0,-h*.69],[w*.18,-h*.52],[0,-h*.34],[-w*.16,-h*.52]],'#e0b98c',P.ink,1.1);
  line(c,[[-w*.18,-h*.2],[w*.19,-h*.2]],'#655e72',2);
  line(c,[[-w*.2,-h*.76],[-w*.19,-h*.58]],'#cbbdb2',1.6);
}
function archPier(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#8e7370';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.6;c.stroke();
  const body=[[-w*.45,d*.3],[-w*.4,-h*.83],[-w*.23,-h],[w*.24,-h*.97],[w*.4,-h*.78],[w*.45,d*.3]];poly(c,body,'#b39a75',P.ink,1.3);texture(c,body,Math.floor((p.seed||0)*317),120,'#e8d1a57a','#5b503c48');
  poly(c,[[-w*.4,-h*.83],[-w*.23,-h],[w*.24,-h*.97],[w*.4,-h*.78],[w*.2,-h*.74],[-w*.21,-h*.75]],'#d8b394');
  for(const t of[.27,.55,.79])line(c,[[-w*.36,-h*t],[w*.32,-h*t-4]],'#98776e',1.8);
  line(c,[[-w*.19,-h*.76],[-w*.16,-h*.48]],'#e0bfa2',2);
  poly(c,[[-w*.11,-h*.36],[w*.07,-h*.41],[w*.16,-h*.3]],'#8c6b68');
}
function archLintel(c,p,w,d,h){
  const body=[[-w*.5,-h*.83],[-w*.48,-h*.99],[-w*.18,-h-6],[w*.2,-h-8],[w*.47,-h*.98],[w*.5,-h*.82],[w*.25,-h*.79],[-w*.2,-h*.8]];poly(c,body,'#b49a75',EMBER_PALETTE.ink,1.4);texture(c,body,Math.floor((p.seed||0)*841),100,'#ecd3a777','#60553b48');
  poly(c,[[-w*.48,-h*.99],[-w*.18,-h-6],[w*.2,-h-8],[w*.47,-h*.98],[w*.41,-h*.93],[-w*.13,-h*.96]],'#d7b296');
  line(c,[[-w*.2,-h*.98],[-w*.18,-h*.82]],'#95766e',1.6);line(c,[[w*.14,-h*.99],[w*.12,-h*.81]],'#95766e',1.6);
  poly(c,[[0,-h*.97],[w*.065,-h*.9],[0,-h*.83],[-w*.065,-h*.9]],'#e4c8a4',EMBER_PALETTE.ink,1.1);
}
function deadTree(c,p,w,d,h){
  const P=EMBER_PALETTE,vw=number(p.visualWidth,72);capsule(c,w,d);c.fillStyle='#77665b';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.4;c.stroke();
  const body=[[-w*.35,d*.32],[-w*.2,-h*.36],[-vw*.38,-h*.59],[-vw*.42,-h*.79],[-vw*.3,-h*.77],[-vw*.24,-h*.61],[-w*.11,-h*.52],[-w*.16,-h*.91],[w*.04,-h],[w*.16,-h*.76],[vw*.26,-h*.85],[vw*.33,-h*.74],[vw*.16,-h*.59],[w*.2,-h*.48],[w*.34,d*.33]];poly(c,body,'#857d5b',P.woodDark,1.4);texture(c,body,Math.floor((p.seed||0)*641),70,'#c7b58c77','#343d2a88');
  line(c,[[-w*.02,d*.1],[-w*.01,-h*.36],[vw*.13,-h*.59]],'#b29b80',2);
  line(c,[[-w*.04,-h*.49],[-w*.07,-h*.84]],'#b5a08a',1.6);
  line(c,[[-w*.24,d*.28],[-w*.12,-h*.16]],'#6a5b55',1.5);
}
function crystal(c,p,w,d,h){
  const P=EMBER_PALETTE;basalt(c,{...p,seed:.71},w,d,h*.24);
  for(const [x,s,lean]of[[-.29,.57,-.08],[.02,1,.04],[.31,.7,.1]]){
    const xx=x*w,hh=h*s,ww=w*(s>.9?.3:.21),yy=d*.23;
    poly(c,[[xx-ww/2,yy],[xx-ww*.58,-hh*.64],[xx+lean*w,-hh],[xx+ww*.52,-hh*.68],[xx+ww*.47,yy]],'#8eb5ad',P.ink,1.4);
    poly(c,[[xx+lean*w,-hh],[xx+ww*.52,-hh*.68],[xx+ww*.47,yy],[xx+ww*.08,yy],[xx-ww*.03,-hh*.67]],'#c3ded0');
    poly(c,[[xx-ww*.58,-hh*.64],[xx+lean*w,-hh],[xx-ww*.03,-hh*.67],[xx+ww*.08,yy],[xx-ww/2,yy]],'#7a9d9b');
    line(c,[[xx+ww*.14,-hh*.69],[xx+ww*.28,-hh*.37]],'#edf0d6',1.6);
  }
}
function bench(c,p,w,d,h){
  const P=EMBER_PALETTE;
  for(const x of[-.36,.36]){rounded(c,x*w-4,-h*.65,8,h*.65+d*.32,2,P.woodDark);line(c,[[x*w+1,-h*.6],[x*w+1,d*.2]],P.woodLight,1.3);}
  poly(c,[[-w*.5,-h*.45],[-w*.43,-h],[w*.48,-h],[w*.5,-h*.43]],P.wood,P.woodDark,1.5);
  texture(c,[[-w*.5,-h*.45],[-w*.43,-h],[w*.48,-h],[w*.5,-h*.43]],Math.floor((p.seed||0)*577),45,'#e7c18b77','#51452b55');
  line(c,[[-w*.44,-h*.77],[w*.46,-h*.77]],P.woodLight,1.6);
  line(c,[[-w*.47,-h*.46],[w*.47,-h*.46]],'#d4b17f',2);
  for(const x of[-.37,.37]){oval(c,x*w,-h*.87,.9,.8,P.woodDark);oval(c,x*w,-h*.55,.9,.8,P.woodDark);}
}
function well(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#7a806a';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.5;c.stroke();
  rounded(c,-w*.44,-h*.66,w*.88,h*.66+d*.32,w*.19,'#a5a083',P.ink,1.8);
  oval(c,0,-h*.66,w*.47,d*.47,'#c3b798',P.ink,1.7);oval(c,0,-h*.66,w*.31,d*.28,'#626b59',P.ink,1.2);oval(c,0,-h*.66+3,w*.24,d*.19,'#8da39a');
  line(c,[[-w*.38,-h*.18],[w*.38,-h*.18]],'#827a80',1.5);for(const x of[-.23,.19])line(c,[[x*w,-h*.61],[x*w,-h*.2]],'#817a7e',1.5);
  for(const x of[-.31,.31]){rounded(c,x*w-3,-h,6,h*.45,1,P.wood,P.woodDark,1.3);}
  line(c,[[-w*.34,-h],[w*.34,-h]],P.woodDark,5);line(c,[[-w*.32,-h-1],[w*.32,-h-1]],P.woodLight,1.5);
  line(c,[[0,-h],[0,-h*.55]],'#7b6b58',1.5);rounded(c,-6,-h*.58,12,10,2,'#b6956c',P.woodDark,1.3);
}

export function drawEmberProp(c,prop,{canopyAlpha=1,player=null,footY=null}={}){
  if(prop?.variant!=='ember-native'||prop.visual===false)return false;
  const {w,d,h}=dimensions(prop),kind=prop.emberKind||'basalt';
  let alpha=canopyAlpha;
  if((kind==='shelter'||kind==='camp-tent')&&player&&number(footY,player.y)<prop.y+d/2&&Math.abs(player.x-prop.x)<w*.54&&player.y>prop.y-h-d/2)alpha=Math.min(alpha,.4);
  c.save();c.translate(prop.x,prop.y);c.lineCap='round';c.lineJoin='round';
  try{
    if(kind==='tree')tree(c,prop,w,d,h,alpha);
    else if(kind==='shrub')shrub(c,prop,w,d,h);
    else if(kind==='ore')ore(c,prop,w,d,h);
    else if(kind==='crate')crate(c,prop,w,d,h);
    else if(kind==='cart')cart(c,prop,w,d,h);
    else if(kind==='lamp')lamp(c,prop,w,d,h);
    else if(kind==='shelter')shelter(c,prop,w,d,h,alpha);
    else if(kind==='barrel')barrel(c,prop,w,d,h);
    else if(kind==='fence')fence(c,prop,w,d,h);
    else if(kind==='bridge-rail')rail(c,prop,w,d,h);
    else if(kind==='sign')sign(c,prop,w,d,h);
    else if(kind==='anvil')anvil(c,prop,w,d,h);
    else if(kind==='banner')banner(c,prop,w,d,h);
    else if(kind==='camp-tent')tent(c,prop,w,d,h,alpha);
    else if(kind==='crane')crane(c,prop,w,d,h);
    else if(kind==='forge')forge(c,prop,w,d,h);
    else if(kind==='totem')totem(c,prop,w,d,h);
    else if(kind==='arch-pier')archPier(c,prop,w,d,h);
    else if(kind==='arch-lintel')archLintel(c,prop,w,d,h);
    else if(kind==='dead-tree')deadTree(c,prop,w,d,h);
    else if(kind==='crystal')crystal(c,prop,w,d,h);
    else if(kind==='bench')bench(c,prop,w,d,h);
    else if(kind==='well')well(c,prop,w,d,h);
    else basalt(c,prop,w,d,h);
  }finally{c.restore();}return true;
}

export function drawEmberLandmark(c,site){
  if(site?.artTheme!=='ember'||site.kind!=='cave')return false;
  const P=EMBER_PALETTE;c.save();c.translate(site.x,site.y);c.lineCap='round';c.lineJoin='round';
  // Stone shoulders frame the open ground anchor; no backing slab closes it.
  c.beginPath();c.moveTo(-34,3);c.lineTo(-34,-25);c.bezierCurveTo(-35,-58,34,-58,34,-25);c.lineTo(34,3);c.closePath();c.fillStyle='#303c30';c.fill();
  const glow=c.createLinearGradient(0,-40,0,3);glow.addColorStop(0,'#26342b');glow.addColorStop(1,'#5c6347');c.fillStyle=glow;c.fill();
  drawEmberRock(c,{x:-43,y:-1,width:40,depth:30,height:66,seed:.31});
  drawEmberRock(c,{x:42,y:0,width:40,depth:30,height:59,seed:.74});
  drawEmberRock(c,{x:0,y:-51,width:101,depth:27,height:24,seed:.63});
  for(const x of[-31,31]){timber(c,x-4,-44,8,47,x+81);line(c,[[x-4,-8],[x+4,-8]],'#7d7b56',3);oval(c,x,-8,1,1,'#d0ba84');}
  const beam=[[-40,-47],[-35,-52],[37,-51],[41,-46],[39,-40],[-39,-40]];
  poly(c,beam,'#8e784d',P.woodDark,1.2);texture(c,beam,183,45,'#dfc38a79','#3d412e60');line(c,[[-35,-49],[35,-48]],'#cbb080',1.1);
  for(const x of[-30,30]){poly(c,[[x-6,-40],[x+6,-40],[x+3,-27],[x-2,-26]],'#7d6b45',P.woodDark,.8);oval(c,x,-36,1.2,1.2,'#cfc194');}
  for(const x of[-15,15])line(c,[[x*1.35,7],[x,-16]],'#6a6850',2.2);
  for(const y of[-8,-1,6])line(c,[[-17-y*.35,y],[17+y*.35,y]],'#9f875a',2.3);
  for(const [x,y]of[[-45,10],[43,8],[-52,4]])drawEmberRock(c,{x,y,width:12,depth:7,height:7,seed:(x+65)/119});
  c.restore();return true;
}
