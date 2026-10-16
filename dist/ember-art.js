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
const SIZES=Object.freeze({basalt:[58,42,50],shrub:[38,24,31],tree:[24,24,100],ore:[38,28,37],crate:[35,28,35],cart:[64,36,44],lamp:[14,14,66],shelter:[136,76,103],fence:[80,10,30],'bridge-rail':[90,10,25],sign:[22,18,45],barrel:[26,26,35],anvil:[38,26,28],banner:[20,16,85],
  'camp-tent':[140,80,82],crane:[48,40,150],forge:[112,72,100],totem:[34,30,70],'arch-pier':[40,36,150],'arch-lintel':[140,0,150],'dead-tree':[22,22,112],crystal:[60,44,90],bench:[74,24,28],well:[84,68,60]});
function dimensions(prop){const defaults=SIZES[prop.emberKind]||SIZES.basalt;return {w:number(prop.width,defaults[0]),d:number(prop.depth,defaults[1]),h:number(prop.height,defaults[2])};}
function poly(c,points,fill,stroke=null,width=1.6){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function oval(c,x,y,rx,ry,fill,stroke=null,width=1.4){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function line(c,points,color,width=1.5){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function rounded(c,x,y,w,h,r,fill,stroke=null,width=1.5){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function capsule(c,w,d,y=0){const r=Math.min(w,d)/2,half=Math.max(0,w/2-r);c.beginPath();c.moveTo(-half,y-d/2);c.lineTo(half,y-d/2);c.ellipse(half,y,r,d/2,0,-Math.PI/2,Math.PI/2);c.lineTo(-half,y+d/2);c.ellipse(-half,y,r,d/2,0,Math.PI/2,Math.PI*1.5);c.closePath();}

export function emberVisual(prop){
  if(prop?.variant!=='ember-native')return null;
  const {w,d,h}=dimensions(prop),kind=prop.emberKind,tree=kind==='tree',roof=kind==='shelter'||kind==='camp-tent';
  const visualWidth=number(prop.visualWidth,tree?Math.max(78,w*3.4):roof?w+24:kind==='dead-tree'?72:kind==='crane'?160:w+8),top=tree?h:h+d/2;
  return {halfWidth:Math.max(visualWidth*(tree?.55:.5)+5,kind==='lamp'?29:kind==='cart'?w*.65+3:kind==='crane'?visualWidth*.62+6:kind==='banner'?w*1.1+4:kind==='sign'?w*.7+3:0),top:top+12,bottom:d/2+7,
    canopyX:0,canopyY:tree?-h*.65:roof?-h*.7:0,canopyRx:visualWidth/2,canopyRy:tree?h*.36:roof?h*.4:0,
    shadowWidth:kind==='arch-lintel'?0:tree?visualWidth*.31:w*.47,shadowLength:kind==='arch-lintel'?0:tree?h*.34:Math.max(10,h*.34),shadowOffset:kind==='arch-lintel'?0:Math.max(6,h*.17)};
}

function basalt(c,p,w,d,h){
  const P=EMBER_PALETTE,n=(p.seed||0)%1,terracotta=p.tone==='terracotta',body=terracotta?'#b98772':P.rock,light=terracotta?'#d1a187':P.rockLight,dark=terracotta?'#916d68':P.rockDark;
  capsule(c,w,d);c.fillStyle=P.rockDark;c.fill();c.strokeStyle=P.ink;c.lineWidth=1.7;c.stroke();
  poly(c,[[-w*.47,0],[-w*.46,-h*.66],[-w*.28,-h-d*.12],[w*.19,-h-d*.08],[w*.46,-h*.63],[w*.48,0],[w*.25,d*.44],[-w*.24,d*.44]],body,P.ink);
  poly(c,[[-w*.46,-h*.66],[-w*.28,-h-d*.12],[w*.19,-h-d*.08],[w*.46,-h*.63],[w*.14,-h*.55],[-w*.2,-h*.55]],light);
  poly(c,[[w*.14,-h*.55],[w*.46,-h*.63],[w*.48,0],[w*.25,d*.44],[w*.11,-h*.08]],dark);
  line(c,[[-w*.2,-h*.5],[-w*.19,-h*.12],[-w*.24,d*.36]],'#aaa1ae',1.3);
  if(h>55)line(c,[[w*.17,-h*.45],[w*.21,-h*.13],[w*.25,d*.35]],'#494858',1.7);
  if(n>.5)line(c,[[-w*.34,-h*.13],[-w*.21,-h*.23],[-w*.05,-h*.19]],'#5c596e',1.2);
  line(c,[[-w*.39,-h*.67],[-w*.22,-h*.83],[w*.09,-h*.8]],terracotta?'#edc4a4':'#c5bcc7',1.5);
  if(w>44)line(c,[[-w*.37,-h*.32],[-w*.15,-h*.27],[-w*.03,-h*.34]],dark,1.4);
}
function shrub(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#6d795b';c.fill();
  const lobes=[[-.29,-.1,.28,.39],[.25,-.07,.29,.42],[-.04,-.43,.34,.49]];
  for(let i=0;i<lobes.length;i++){const [x,y,rx,ry]=lobes[i];oval(c,x*w,y*h,w*rx,h*ry,i===2?P.grassLight:P.grass,P.ink,1.2);}
  line(c,[[-w*.17,-h*.24],[-w*.11,-h*.39],[w*.02,-h*.43]],'#d4d2a5',1.5);
  line(c,[[w*.15,-h*.27],[w*.28,-h*.2],[w*.32,-h*.1]],'#bec596',1.5);
  if((p.seed||0)>.5){oval(c,w*.19,-h*.24,2.5,2.1,'#eac69b');oval(c,w*.12,-h*.39,2,1.8,'#eac69b');}
}
function tree(c,p,w,d,h,alpha){
  const P=EMBER_PALETTE,vw=number(p.visualWidth,Math.max(78,w*3.4));
  capsule(c,w,d);c.fillStyle='#766149';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.5;c.stroke();
  poly(c,[[-w*.34,d*.25],[-w*.23,-h*.67],[w*.22,-h*.66],[w*.35,d*.27],[w*.07,d*.46]],'#9c805b',P.woodDark,1.6);
  line(c,[[-w*.05,-h*.04],[-w*.01,-h*.5],[w*.19,-h*.65]],'#c8ae7b',2);
  line(c,[[w*.16,d*.12],[w*.11,-h*.18],[w*.19,-h*.3]],'#715d4e',1.4);
  c.save();c.globalAlpha*=alpha;
  oval(c,-vw*.25,-h*.57,vw*.28,h*.24,'#7d8a69',P.ink,1.9);
  oval(c,vw*.24,-h*.62,vw*.29,h*.27,'#8b9772',P.ink,1.9);
  oval(c,-vw*.02,-h*.76,vw*.37,h*.26,'#a0ad7f',P.ink,1.9);
  oval(c,-vw*.17,-h*.83,vw*.18,h*.14,'#b9c28f');
  line(c,[[vw*.16,-h*.78],[vw*.3,-h*.75],[vw*.35,-h*.66]],'#b8c18d',2.4);
  line(c,[[-vw*.38,-h*.59],[-vw*.31,-h*.48],[-vw*.18,-h*.46]],'#bac493',2);
  line(c,[[-vw*.08,-h*.82],[vw*.01,-h*.89],[vw*.14,-h*.87]],'#c8cd9d',2);
  if((p.seed||0)>.63){for(const [x,y]of[[-.18,-.7],[.15,-.61],[.02,-.83]]){oval(c,x*vw,y*h,2.4,2.1,'#d6b082');}}
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
  for(const x of[-.32,.32])for(const a of[0,Math.PI/2])line(c,[[x*w-Math.cos(a)*w*.075,d*.25-Math.sin(a)*w*.075],[x*w+Math.cos(a)*w*.075,d*.25+Math.sin(a)*w*.075]],'#aaa296',1.3);
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
  for(const x of[-.33,.32]){line(c,[[x*w,wallTop+6],[x*w-7,wallTop+12]],'#e0c9a5',1.4);}
  for(const [x,y]of[[-.35,front-1],[-.07,front-1],[.2,front-1]])rounded(c,x*w,y,w*.2,5,1,'#8f8375');
  c.save();c.globalAlpha*=alpha;
  const vw=number(p.visualWidth,w+24);
  poly(c,[[-vw*.5,-h*.48],[-vw*.4,roofTop],[-vw*.06,roofTop-9],[vw*.49,-h*.52],[vw*.25,-h*.36],[-vw*.1,-h*.43]],P.roof,P.woodDark,2.2);
  poly(c,[[-vw*.4,roofTop],[-vw*.06,roofTop-9],[vw*.49,-h*.52],[vw*.25,-h*.36]],P.roofLight,P.woodDark,1.4);
  line(c,[[-vw*.4+5,roofTop+5],[-vw*.08,roofTop-3],[vw*.43,-h*.5]],'#c4c7a2',2.5);
  for(const t of[.27,.51,.75]){const x=-vw*.35+vw*.7*t;line(c,[[x,-h*.85-8],[x+vw*.18,-h*.45]],'#687666',1.2);}
  // Broad sheet groups and two repair patches read as a work shelter at normal
  // scale; the roof remains a handful of clear planes rather than a texture.
  line(c,[[-vw*.34,-h*.72],[-vw*.05,-h*.67],[vw*.23,-h*.45]],'#97a083',1.8);
  line(c,[[-vw*.26,-h*.88],[-vw*.06,-h*.86],[vw*.12,-h*.68]],'#bbc09c',1.6);
  poly(c,[[-vw*.31,-h*.64],[-vw*.24,-h*.77],[-vw*.14,-h*.69],[-vw*.2,-h*.55]],'#87937d');
  line(c,[[-vw*.29,-h*.64],[-vw*.23,-h*.73]],'#c4c6a0',1.5);
  line(c,[[-vw*.49,-h*.47],[-vw*.1,-h*.42],[vw*.25,-h*.35]],'#6f5c49',4);
  c.restore();
  if(p.sign!==false){rounded(c,w*.21,-h*.49,29,12,2,'#c7a373',P.woodDark,1.3);line(c,[[w*.21+5,-h*.49+5],[w*.21+23,-h*.49+5]],'#806144',1.7);line(c,[[w*.21+8,-h*.49+3],[w*.21+17,-h*.49+9]],'#9c7451',1.3);}
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

function tent(c,p,w,d,h,alpha){
  const P=EMBER_PALETTE,vw=number(p.visualWidth,w+22),front=d*.43;
  capsule(c,w,d);c.fillStyle='#9b8068';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.7;c.stroke();
  poly(c,[[-w*.44,front],[-w*.4,-h*.39],[-w*.03,-h*.82],[w*.44,front]],'#b8a17c',P.woodDark,1.8);
  poly(c,[[-w*.17,front],[-w*.04,-h*.49],[w*.14,front]],'#6c6456',P.woodDark,1.5);
  poly(c,[[-w*.17,front],[-w*.04,-h*.49],[-w*.09,front]],'#d4bc91');
  line(c,[[w*.09,front-2],[w*.02,-h*.24]],'#e3cc9d',1.7);
  c.save();c.globalAlpha*=alpha;
  poly(c,[[-vw*.49,-h*.34],[-vw*.18,-h],[vw*.2,-h*.9],[vw*.49,-h*.29],[vw*.33,-h*.22],[-vw*.05,-h*.73],[-vw*.34,-h*.27]],p.tone==='oasis'?'#8d9e83':'#b48b6b',P.woodDark,1.9);
  poly(c,[[-vw*.18,-h],[-vw*.05,-h*.73],[vw*.33,-h*.22],[vw*.49,-h*.29],[vw*.2,-h*.9]],p.tone==='oasis'?'#b1be99':'#d4ad82');
  line(c,[[-vw*.15,-h+4],[vw*.18,-h*.86],[vw*.43,-h*.32]],'#e2c69a',2);
  line(c,[[-vw*.3,-h*.38],[-vw*.18,-h*.7]],'#886f5c',1.4);
  line(c,[[vw*.03,-h*.8],[vw*.26,-h*.29]],'#967c63',1.5);
  for(const x of[-.38,.38])rounded(c,x*w-3,-h*.36,6,h*.36+front,1,P.wood,P.woodDark,1.2);
  c.restore();
  line(c,[[-w*.41,front-3],[w*.4,front-3]],'#c5a476',2.8);
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
  const P=EMBER_PALETTE,front=d*.44;
  capsule(c,w,d);c.fillStyle='#6a636c';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.8;c.stroke();
  poly(c,[[-w*.46,front],[-w*.46,-h*.49],[-w*.35,-h*.69],[w*.32,-h*.69],[w*.46,-h*.46],[w*.46,front]],'#89818b',P.ink,2);
  poly(c,[[-w*.46,-h*.49],[-w*.35,-h*.69],[w*.32,-h*.69],[w*.46,-h*.46],[w*.3,-h*.36],[-w*.3,-h*.36]],'#b4a7a6',P.ink,1.5);
  rounded(c,-w*.25,-h*.36,w*.5,h*.36+front*.65,Math.min(13,w*.11),'#514b55',P.ink,1.8);
  rounded(c,-w*.18,-h*.25,w*.36,h*.25+front*.5,Math.min(10,w*.08),'#c77b5e');
  poly(c,[[-w*.15,front*.4],[-w*.13,-h*.11],[-w*.04,-h*.23],[w*.02,-h*.13],[w*.09,-h*.2],[w*.16,front*.4]],'#f4c386');
  line(c,[[-w*.17,front*.5],[w*.17,front*.5]],'#64545a',4);
  rounded(c,w*.16,-h,w*.2,h*.43,3,'#9c8f94',P.ink,1.7);
  rounded(c,w*.13,-h-3,w*.26,9,2,'#b7aba9',P.ink,1.4);
  line(c,[[w*.18,-h*.8],[w*.34,-h*.8]],'#746b7a',1.6);
  for(const side of[-1,1])for(const t of[.1,.45])line(c,[[side*w*.42,-h*t],[side*w*.29,-h*t]],'#685f70',1.5);
  for(const x of[-.37,.32])rounded(c,x*w-5,front*.16,10,front*.65,2,'#b5a69d',P.ink,1.1);
  line(c,[[-w*.35,-h*.61],[-w*.11,-h*.61]],'#d1bba7',1.7);
}
function totem(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#706b77';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.5;c.stroke();
  poly(c,[[-w*.4,d*.32],[-w*.3,-h*.85],[-w*.13,-h],[w*.24,-h*.95],[w*.37,d*.32]],p.tone==='terracotta'?'#b18b79':'#8e8796',P.ink,1.7);
  poly(c,[[-w*.3,-h*.85],[-w*.13,-h],[w*.24,-h*.95],[w*.26,-h*.78],[-w*.14,-h*.77]],'#bfb0ac');
  poly(c,[[0,-h*.69],[w*.18,-h*.52],[0,-h*.34],[-w*.16,-h*.52]],'#e0b98c',P.ink,1.1);
  line(c,[[-w*.18,-h*.2],[w*.19,-h*.2]],'#655e72',2);
  line(c,[[-w*.2,-h*.76],[-w*.19,-h*.58]],'#cbbdb2',1.6);
}
function archPier(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#8e7370';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.6;c.stroke();
  poly(c,[[-w*.45,d*.3],[-w*.4,-h*.83],[-w*.23,-h],[w*.24,-h*.97],[w*.4,-h*.78],[w*.45,d*.3]],'#bb947f',P.ink,1.8);
  poly(c,[[-w*.4,-h*.83],[-w*.23,-h],[w*.24,-h*.97],[w*.4,-h*.78],[w*.2,-h*.74],[-w*.21,-h*.75]],'#d8b394');
  for(const t of[.27,.55,.79])line(c,[[-w*.36,-h*t],[w*.32,-h*t-4]],'#98776e',1.8);
  line(c,[[-w*.19,-h*.76],[-w*.16,-h*.48]],'#e0bfa2',2);
  poly(c,[[-w*.11,-h*.36],[w*.07,-h*.41],[w*.16,-h*.3]],'#8c6b68');
}
function archLintel(c,p,w,d,h){
  poly(c,[[-w*.5,-h*.83],[-w*.48,-h*.99],[-w*.18,-h-6],[w*.2,-h-8],[w*.47,-h*.98],[w*.5,-h*.82],[w*.25,-h*.79],[-w*.2,-h*.8]],'#b78e7b',EMBER_PALETTE.ink,2);
  poly(c,[[-w*.48,-h*.99],[-w*.18,-h-6],[w*.2,-h-8],[w*.47,-h*.98],[w*.41,-h*.93],[-w*.13,-h*.96]],'#d7b296');
  line(c,[[-w*.2,-h*.98],[-w*.18,-h*.82]],'#95766e',1.6);line(c,[[w*.14,-h*.99],[w*.12,-h*.81]],'#95766e',1.6);
  poly(c,[[0,-h*.97],[w*.065,-h*.9],[0,-h*.83],[-w*.065,-h*.9]],'#e4c8a4',EMBER_PALETTE.ink,1.1);
}
function deadTree(c,p,w,d,h){
  const P=EMBER_PALETTE,vw=number(p.visualWidth,72);capsule(c,w,d);c.fillStyle='#77665b';c.fill();c.strokeStyle=P.woodDark;c.lineWidth=1.4;c.stroke();
  poly(c,[[-w*.35,d*.32],[-w*.2,-h*.36],[-vw*.38,-h*.59],[-vw*.42,-h*.79],[-vw*.3,-h*.77],[-vw*.24,-h*.61],[-w*.11,-h*.52],[-w*.16,-h*.91],[w*.04,-h],[w*.16,-h*.76],[vw*.26,-h*.85],[vw*.33,-h*.74],[vw*.16,-h*.59],[w*.2,-h*.48],[w*.34,d*.33]],'#938070',P.woodDark,1.8);
  line(c,[[-w*.02,d*.1],[-w*.01,-h*.36],[vw*.13,-h*.59]],'#b29b80',2);
  line(c,[[-w*.04,-h*.49],[-w*.07,-h*.84]],'#b5a08a',1.6);
  line(c,[[-w*.24,d*.28],[-w*.12,-h*.16]],'#6a5b55',1.5);
}
function crystal(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#807d8e';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.5;c.stroke();
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
  line(c,[[-w*.44,-h*.77],[w*.46,-h*.77]],P.woodLight,1.6);
  line(c,[[-w*.47,-h*.46],[w*.47,-h*.46]],'#d4b17f',2);
}
function well(c,p,w,d,h){
  const P=EMBER_PALETTE;capsule(c,w,d);c.fillStyle='#857c81';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.5;c.stroke();
  rounded(c,-w*.44,-h*.66,w*.88,h*.66+d*.32,w*.19,'#a69c99',P.ink,1.8);
  oval(c,0,-h*.66,w*.47,d*.47,'#c4b4a6',P.ink,1.7);oval(c,0,-h*.66,w*.31,d*.28,'#686b70',P.ink,1.2);oval(c,0,-h*.66+3,w*.24,d*.19,'#8da39a');
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
