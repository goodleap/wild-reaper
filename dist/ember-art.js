// Reusable cartoon scenery. Anchors and dimensions are ground-space values;
// crowns, roofs and shadows never become an obstacle footprint.
export const EMBER_PALETTE=Object.freeze({
  ink:'#514d5d',rock:'#797485',rockLight:'#a19aa8',rockDark:'#5b576c',rockTop:'#96909f',
  earth:'#d9b08c',earthLight:'#e8c49d',path:'#efd1a6',grass:'#8e9a72',grassLight:'#b3ba8a',
  wood:'#a77d54',woodLight:'#d4ad73',woodDark:'#6c5848',roof:'#788275',roofLight:'#a8ae8a',
  wall:'#c9b391',ore:'#bb7960',oreLight:'#edb27c',lava:'#ed8653',lavaLight:'#ffd179'
});
const TAU=Math.PI*2;
const number=(n,fallback)=>Number.isFinite(n)?n:fallback;
const SIZES=Object.freeze({basalt:[58,42,50],shrub:[38,24,31],tree:[24,24,100],ore:[38,28,37],crate:[35,28,35],cart:[64,36,44],lamp:[14,14,66],shelter:[136,76,103],fence:[80,10,30],'bridge-rail':[90,10,25],sign:[22,18,45],barrel:[26,26,35],anvil:[38,26,28],banner:[20,16,85]});
function dimensions(prop){const defaults=SIZES[prop.emberKind]||SIZES.basalt;return {w:number(prop.width,defaults[0]),d:number(prop.depth,defaults[1]),h:number(prop.height,defaults[2])};}
function poly(c,points,fill,stroke=null,width=1.6){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function oval(c,x,y,rx,ry,fill,stroke=null,width=1.4){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function line(c,points,color,width=1.5){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function rounded(c,x,y,w,h,r,fill,stroke=null,width=1.5){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function capsule(c,w,d,y=0){const r=Math.min(w,d)/2,half=Math.max(0,w/2-r);c.beginPath();c.moveTo(-half,y-d/2);c.lineTo(half,y-d/2);c.ellipse(half,y,r,d/2,0,-Math.PI/2,Math.PI/2);c.lineTo(-half,y+d/2);c.ellipse(-half,y,r,d/2,0,Math.PI/2,Math.PI*1.5);c.closePath();}

export function emberVisual(prop){
  if(prop?.variant!=='ember-native')return null;
  const {w,d,h}=dimensions(prop),tree=prop.emberKind==='tree',roof=prop.emberKind==='shelter';
  const visualWidth=number(prop.visualWidth,tree?Math.max(78,w*3.4):roof?w+24:w+8),top=tree?h:roof?h+d/2:h+d/2;
  return {halfWidth:Math.max(visualWidth/2+4,prop.emberKind==='lamp'?29:prop.emberKind==='cart'?w*.65+3:0),top:top+5,bottom:d/2+5,
    canopyX:0,canopyY:tree?-h*.65:roof?-h*.7:0,canopyRx:visualWidth/2,canopyRy:tree?h*.36:roof?h*.4:0,
    shadowWidth:tree?visualWidth*.31:w*.47,shadowLength:tree?h*.34:Math.max(10,h*.34),shadowOffset:Math.max(6,h*.17)};
}

function basalt(c,p,w,d,h){
  const P=EMBER_PALETTE,n=(p.seed||0)%1;
  capsule(c,w,d);c.fillStyle=P.rockDark;c.fill();c.strokeStyle=P.ink;c.lineWidth=1.7;c.stroke();
  poly(c,[[-w*.47,0],[-w*.46,-h*.66],[-w*.28,-h-d*.12],[w*.19,-h-d*.08],[w*.46,-h*.63],[w*.48,0],[w*.25,d*.44],[-w*.24,d*.44]],P.rock,P.ink);
  poly(c,[[-w*.46,-h*.66],[-w*.28,-h-d*.12],[w*.19,-h-d*.08],[w*.46,-h*.63],[w*.14,-h*.55],[-w*.2,-h*.55]],P.rockLight);
  poly(c,[[w*.14,-h*.55],[w*.46,-h*.63],[w*.48,0],[w*.25,d*.44],[w*.11,-h*.08]],P.rockDark);
  line(c,[[-w*.2,-h*.5],[-w*.19,-h*.12],[-w*.24,d*.36]],'#aaa1ae',1.3);
  if(h>55)line(c,[[w*.17,-h*.45],[w*.21,-h*.13],[w*.25,d*.35]],'#494858',1.7);
  if(n>.5)line(c,[[-w*.34,-h*.13],[-w*.21,-h*.23],[-w*.05,-h*.19]],'#5c596e',1.2);
}
function shrub(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#6d795b';c.fill();
  const lobes=[[-.29,-.1,.28,.39],[.25,-.07,.29,.42],[-.04,-.43,.34,.49]];
  for(let i=0;i<lobes.length;i++){const [x,y,rx,ry]=lobes[i];oval(c,x*w,y*h,w*rx,h*ry,i===2?P.grassLight:P.grass,P.ink,1.2);}
  line(c,[[-w*.17,-h*.24],[-w*.11,-h*.39],[w*.02,-h*.43]],'#d4d2a5',1.5);
  if((p.seed||0)>.5){oval(c,w*.19,-h*.24,2.5,2.1,'#eac69b');oval(c,w*.12,-h*.39,2,1.8,'#eac69b');}
}
function tree(c,p,w,d,h,alpha){
  const P=EMBER_PALETTE,vw=number(p.visualWidth,Math.max(78,w*3.4));
  capsule(c,w,d);c.fillStyle='#766149';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.5;c.stroke();
  poly(c,[[-w*.34,d*.25],[-w*.23,-h*.67],[w*.22,-h*.66],[w*.35,d*.27],[w*.07,d*.46]],'#9c805b',P.woodDark,1.6);
  line(c,[[-w*.05,-h*.04],[-w*.01,-h*.5],[w*.19,-h*.65]],'#c8ae7b',2);
  c.save();c.globalAlpha*=alpha;
  oval(c,-vw*.25,-h*.57,vw*.28,h*.24,'#7d8a69',P.ink,1.9);
  oval(c,vw*.24,-h*.62,vw*.29,h*.27,'#8b9772',P.ink,1.9);
  oval(c,-vw*.02,-h*.76,vw*.37,h*.26,'#a0ad7f',P.ink,1.9);
  oval(c,-vw*.17,-h*.83,vw*.18,h*.14,'#b9c28f');
  line(c,[[vw*.16,-h*.78],[vw*.3,-h*.75],[vw*.35,-h*.66]],'#b8c18d',2.4);
  c.restore();
}
function ore(c,p,w,d,h){
  basalt(c,{...p,seed:0},w,d,h*.62);
  const P=EMBER_PALETTE;
  for(const [x,y,s]of[[-.19,-.26,.78],[.12,-.4,1],[.29,-.1,.64]]){
    poly(c,[[x*w-s*w*.12,y*h],[(x-.1*s)*w,y*h-s*h*.53],[x*w,y*h-s*h*.72],[(x+.14*s)*w,y*h-s*h*.49],[(x+.12*s)*w,y*h]],P.ore,P.ink,1.3);
    poly(c,[[x*w,y*h-s*h*.72],[x*w,y*h-s*h*.1],[(x+.12*s)*w,y*h],[(x+.14*s)*w,y*h-s*h*.49]],P.oreLight);
  }
}
function crate(c,p,w,d,h){
  const P=EMBER_PALETTE,top=-h+d*.2,front=d*.42;
  capsule(c,w,d);c.fillStyle=P.woodDark;c.fill();
  rounded(c,-w*.47,top,w*.94,front-top,3,P.wood,P.woodDark,1.8);
  poly(c,[[-w*.47,top],[-w*.28,top-d*.43],[w*.43,top-d*.43],[w*.47,top],[w*.25,top+d*.15]],P.woodLight,P.woodDark,1.6);
  for(const x of[-.27,0,.27])line(c,[[x*w,top+2],[x*w,front-2]],'#8a6549',1.3);
  line(c,[[-w*.39,top+5],[w*.4,front-5]],P.woodLight,4);
  line(c,[[w*.39,top+5],[-w*.4,front-5]],P.woodLight,4);
  for(const x of[-.39,.39])for(const y of[top+5,front-5])oval(c,x*w,y,1.2,1.2,P.woodDark);
}
function barrel(c,p,w,d,h){
  const P=EMBER_PALETTE;rounded(c,-w*.45,-h+d*.4,w*.9,h,Math.min(10,w*.3),P.wood,P.woodDark,1.5);
  for(const xx of[-.2,.1])line(c,[[xx*w,-h+d*.5],[(xx-.02)*w,d*.35]],'#c39966',1.5);
  for(const y of[-h*.67,-h*.13])rounded(c,-w*.46,y,w*.92,4,1,'#77716b');
  oval(c,0,-h+d*.4,w*.45,d*.3,P.woodLight,P.woodDark);
  line(c,[[-w*.31,-h+d*.4],[w*.31,-h+d*.4]],'#a47c51',1);
}
function cart(c,p,w,d,h){
  const P=EMBER_PALETTE;
  line(c,[[-w*.25,d*.3],[w*.65,d*.43]],P.woodDark,4);
  for(const x of[-.32,.32]){oval(c,x*w,d*.25,w*.12,w*.12,'#5d5a61',P.ink,1.5);oval(c,x*w,d*.25,w*.055,w*.055,'#b9b1a0');}
  poly(c,[[-w*.43,d*.15],[-w*.5,-h*.63],[w*.44,-h*.63],[w*.38,d*.17]],'#aa855e',P.woodDark,1.8);
  poly(c,[[-w*.5,-h*.63],[-w*.28,-h*.8],[w*.5,-h*.8],[w*.44,-h*.63]],'#6a655f',P.woodDark,1.6);
  for(const [x,y,s]of[[-.2,-.69,.14],[0,-.74,.17],[.23,-.66,.15]]){
    poly(c,[[x*w-s*w,y*h],[x*w-s*w*.5,y*h-s*h],[x*w+s*w*.5,y*h-s*h*.8],[x*w+s*w,y*h]],'#888394',P.ink,1.1);
    line(c,[[x*w-s*w*.3,y*h-s*h*.5],[x*w+s*w*.4,y*h-s*h*.6]],'#d69c79',2.5);
  }
  line(c,[[-w*.4,-h*.19],[w*.36,-h*.19]],P.woodLight,3);
  for(const x of[-.32,.27])line(c,[[x*w,-h*.57],[x*w,d*.08]],P.woodDark,2.5);
}
function lamp(c,p,w,d,h){
  const P=EMBER_PALETTE;
  oval(c,0,d*.14,w*.5,d*.47,'#827a72',P.ink,1.2);
  rounded(c,-3,-h+14,6,h-12,2,P.wood,P.woodDark,1.4);
  line(c,[[0,-h+15],[0,-h],[18,-h],[18,-h+10]],P.woodDark,3);
  rounded(c,11,-h+8,15,21,3,'#e6bd79',P.woodDark,1.6);
  rounded(c,14,-h+10,9,15,2,'#ffdfa0');
  line(c,[[13,-h+20],[24,-h+20]],'#b38756',1.4);
}
function shelter(c,p,w,d,h,alpha){
  const P=EMBER_PALETTE,back=-d*.46,front=d*.45,wallTop=-h*.53,roofTop=-h-d*.2;
  capsule(c,w,d);c.fillStyle='#827468';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.7;c.stroke();
  // The complete low wall sits on the capsule base. Only the eaves overhang.
  rounded(c,-w*.46,wallTop,w*.92,front-wallTop,Math.min(10,d*.15),P.wall,P.woodDark,1.7);
  poly(c,[[w*.22,wallTop],[w*.46,wallTop-12],[w*.46,front-4],[w*.22,front]],'#ae967c');
  for(const x of[-.4,.36])rounded(c,x*w-3,wallTop-8,6,front-wallTop+8,1,P.wood,P.woodDark,1.3);
  rounded(c,-w*.11,-h*.34,w*.22,h*.34+front,4,'#695e52',P.woodDark,1.7);
  line(c,[[-w*.06,-h*.3],[-w*.06,front-2]],'#9c805b',1.5);
  oval(c,w*.055,-h*.12,1.7,1.7,'#e3b873');
  for(const xx of[-.29,.27]){rounded(c,xx*w-9,-h*.33,18,17,3,'#737871',P.woodDark,1.7);line(c,[[xx*w,-h*.32],[xx*w,-h*.33+15]],'#d5c59a',1.7);line(c,[[xx*w-7,-h*.25],[xx*w+7,-h*.25]],'#d5c59a',1.7);}
  line(c,[[-w*.4,front-4],[w*.37,front-4]],'#a08059',3);
  c.save();c.globalAlpha*=alpha;
  const vw=number(p.visualWidth,w+24);
  poly(c,[[-vw*.5,-h*.48],[-vw*.4,roofTop],[-vw*.06,roofTop-9],[vw*.49,-h*.52],[vw*.25,-h*.36],[-vw*.1,-h*.43]],P.roof,P.woodDark,2.2);
  poly(c,[[-vw*.4,roofTop],[-vw*.06,roofTop-9],[vw*.49,-h*.52],[vw*.25,-h*.36]],P.roofLight,P.woodDark,1.4);
  line(c,[[-vw*.4+5,roofTop+5],[-vw*.08,roofTop-3],[vw*.43,-h*.5]],'#c4c7a2',2.5);
  for(const t of[.27,.51,.75]){const x=-vw*.35+vw*.7*t;line(c,[[x,-h*.85-8],[x+vw*.18,-h*.45]],'#687666',1.2);}
  line(c,[[-vw*.49,-h*.47],[-vw*.1,-h*.42],[vw*.25,-h*.35]],'#6f5c49',4);
  c.restore();
  if(p.sign!==false){rounded(c,w*.21,-h*.49,29,12,2,'#c7a373',P.woodDark,1.3);line(c,[[w*.21+5,-h*.49+5],[w*.21+23,-h*.49+5]],'#806144',1.7);}
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
function anvil(c,p,w,d,h){poly(c,[[-w*.4,d*.3],[-w*.29,-h*.33],[w*.27,-h*.33],[w*.39,d*.3]],'#89818b',EMBER_PALETTE.ink);poly(c,[[-w*.46,-h*.38],[-w*.47,-h*.87],[w*.36,-h*.87],[w*.55,-h*.72],[w*.23,-h*.53],[w*.23,-h*.38]],'#8b8993',EMBER_PALETTE.ink);line(c,[[-w*.39,-h*.84],[w*.31,-h*.84]],'#c3bdc2',2);}
function banner(c,p,w,d,h){const P=EMBER_PALETTE;rounded(c,-3,-h,6,h+d*.3,2,P.wood,P.woodDark);poly(c,[[3,-h+4],[w*1.1,-h+4],[w*.9,-h*.67],[3,-h*.6]],'#b77965',P.woodDark);poly(c,[[w*.28,-h*.9],[w*.55,-h*.83],[w*.28,-h*.73]],'#edc183');}

export function drawEmberProp(c,prop,{canopyAlpha=1,player=null,footY=null}={}){
  if(prop?.variant!=='ember-native'||prop.visual===false)return false;
  const {w,d,h}=dimensions(prop),kind=prop.emberKind||'basalt';
  let alpha=canopyAlpha;
  if(kind==='shelter'&&player&&number(footY,player.y)<prop.y+d/2&&Math.abs(player.x-prop.x)<w*.54&&player.y>prop.y-h-d/2)alpha=Math.min(alpha,.4);
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
    else basalt(c,prop,w,d,h);
  }finally{c.restore();}return true;
}

export function drawEmberLandmark(c,site){
  if(site?.artTheme!=='ember'||!['cave','shortcut','exit'].includes(site.kind))return false;
  if(site.kind!=='cave')return false;
  const P=EMBER_PALETTE;c.save();c.translate(site.x,site.y);c.lineCap='round';c.lineJoin='round';
  // The doorway is deliberately open at the actor's ground anchor.
  poly(c,[[-61,1],[-57,-40],[-35,-70],[4,-78],[40,-61],[59,-28],[59,1],[32,1],[30,-33],[17,-45],[-9,-47],[-28,-35],[-32,1]],P.rock,P.ink,2.3);
  poly(c,[[-57,-40],[-35,-70],[4,-78],[40,-61],[23,-53],[-15,-56],[-36,-31]],P.rockLight);
  poly(c,[[-33,1],[-30,-33],[-16,-46],[7,-48],[28,-34],[33,1]],'#3f3d4c',P.ink,1.6);
  poly(c,[[-22,0],[-21,-24],[-12,-33],[8,-36],[20,-24],[22,0]],'#2f303c');
  for(const x of[-37,37]){rounded(c,x-5,-49,10,50,2,P.wood,P.woodDark,1.5);line(c,[[x-2,-44],[x-2,-6]],P.woodLight,1.5);}
  rounded(c,-43,-49,86,10,2,P.wood,P.woodDark,1.8);line(c,[[-39,-46],[39,-46]],P.woodLight,2);
  poly(c,[[-28,2],[-22,-5],[23,-5],[30,2],[23,8],[-23,8]],'#c3a486');
  line(c,[[-16,5],[-12,-4]],'#7e776f',2);line(c,[[16,5],[12,-4]],'#7e776f',2);
  c.restore();return true;
}
