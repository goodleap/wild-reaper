// Small illustrated people retain their original silhouettes. Material detail is
// rasterized once per facing; only grounded feet, hands and two simple eyes move.
const TAU=Math.PI*2,CACHE_LIMIT=2*1024*1024;
const KINDS=new Set(['traveler','warden','stormcaller','merchant','angel']);
const BOX={back:[64,52,32,32],body:[36,29,18,11],head:[46,44,23,41],left:[48,29,24,11],right:[48,29,24,11],staff:[32,58,9,38]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const line=(c,p,color,w=1)=>{c.beginPath();for(let i=0;i<p.length;i++)c[i?'lineTo':'moveTo'](...p[i]);c.strokeStyle=color;c.lineWidth=w;c.stroke();};
const poly=(c,p,fill,stroke=null,w=1)=>{c.beginPath();for(let i=0;i<p.length;i++)c[i?'lineTo':'moveTo'](...p[i]);c.closePath();paint(c,fill,stroke,w);};
const oval=(c,x,y,rx,ry,fill,a=0)=>{c.beginPath();c.ellipse(x,y,rx,ry,a,0,TAU);paint(c,fill);};
function paint(c,fill,stroke=null,w=1){if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}}
// Coordinates compensate the cached silhouette flip. The light remains in the
// world's upper right even when a robe, pack or hood faces the other direction.
function material(c,flip,colors,x=17,top=-28,bottom=15){const g=c.createLinearGradient(-x*flip,bottom,x*flip,top);colors.forEach((v,i)=>g.addColorStop(i/(colors.length-1),v));return g;}
function gem(c,x,y,r,colors=['#77745a','#d9c17b','#fff1b9'],flip=1){poly(c,[[x,y-r],[x+r*.75,y],[x,y+r],[x-r*.75,y]],colors[1],colors[0],.7);poly(c,[[x,y-r],[x+r*.75*flip,y],[x,y]],colors[2]);poly(c,[[x,y],[x,y+r],[x-r*.75*flip,y]],colors[0]);}
function coatPath(c,w=12){c.beginPath();c.moveTo(-8,-7);c.quadraticCurveTo(0,-9,8,-7);c.lineTo(w,10);c.quadraticCurveTo(0,15,-w,10);c.closePath();}
function hoodPath(c){c.beginPath();c.moveTo(-14,-8);c.quadraticCurveTo(-17,-26,0,-32);c.quadraticCurveTo(17,-28,16,-8);c.quadraticCurveTo(10,1,-12,-2);c.closePath();}
const PALETTES={
  traveler:{cloth:['#567b49','#adc19a','#70964f'],arm:['#70964f','#70964f','#70964f'],outline:'#253c2a',skin:['#d8d1a7','#d8d1a7','#d8d1a7'],face:'#32452f',eye:'#ecf6c8'},
  warden:{cloth:['#5b6340','#8f8052','#c1ac76'],arm:['#495e3a','#718653','#a4ac70'],outline:'#374831',skin:['#908662','#bfb185','#e0d1a0'],face:'#344638',eye:'#f2ebbf'},
  stormcaller:{cloth:['#49435e','#796e9d','#aaa0c4'],arm:['#58516f','#8a80aa','#b1a6cc'],outline:'#373c4d',skin:['#9292ac','#c3bfda','#e1dceb'],face:'#353d54',eye:'#eaf0ff'},
  merchant:{cloth:['#665237','#997c4d','#ccb37b'],arm:['#756040','#ac8c57','#d5b977'],outline:'#444632',skin:['#a3946d','#d2c09a','#eee0b8'],face:'#414832',eye:'#f3eccb'},
  angel:{cloth:['#b1b7a0','#e4e5cf','#fff9e8'],arm:['#bbc4ad','#e4e8d1','#fff9e8'],outline:'#89957d',skin:['#d7b18e','#f1d4b2','#fff0d6'],face:'#efd0ab',eye:'#5c5548'}
};

export function humanoidFaceState(entity={},time=0,reduced=false){
  if(entity.hurtFace>0)return 'hurt';
  if(entity.castFace>0)return 'focus';
  if(entity.rescuedFace>0)return 'glad';
  if(reduced)return 'normal';
  // Simulation time only: paused frames remain identical, and drawing consumes
  // no gameplay randomness. Identity offsets keep a group from blinking together.
  const raw=typeof entity.id==='number'?entity.id:typeof entity.id==='string'?[...entity.id].reduce((n,x)=>n+x.charCodeAt(0),0):17;
  const period=4.4+(Math.abs(raw)%7)*.19,phase=(Math.max(0,time)+Math.abs(raw)*.731)%period;
  return phase<.105?'blink':'normal';
}

export class HumanoidArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.bytes=0;this.builds=0;this.ratio=0;}
  get cacheStats(){return{entries:this.cache.size,bytes:this.bytes,limitBytes:CACHE_LIMIT,builds:this.builds,pixelRatio:this.ratio};}
  _sprite(kind,part,flip,ratio){
    if(ratio!==this.ratio){this.cache.clear();this.bytes=0;this.ratio=ratio;}
    const key=`${kind}:${part}:${flip}`;let item=this.cache.get(key);if(item)return item;
    const [w,h,baseOx,oy]=BOX[part],ox=flip<0?w-baseOx:baseOx,canvas=this.makeCanvas();canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);const c=canvas.getContext('2d');
    c.scale(ratio,ratio);c.translate(ox,oy);c.scale(flip,1);c.lineJoin='round';c.lineCap='round';
    this[`_${part}`](c,kind,flip);
    item={canvas,w,h,ox,oy,bytes:canvas.width*canvas.height*4};
    while(this.bytes+item.bytes>CACHE_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.bytes-=this.cache.get(oldest).bytes;this.cache.delete(oldest);}
    this.cache.set(key,item);this.bytes+=item.bytes;this.builds++;return item;
  }
  _part(c,kind,part,flip,ratio,x=0,y=0){const s=this._sprite(kind,part,flip,ratio);c.drawImage(s.canvas,x-s.ox,y-s.oy,s.w,s.h);}
  draw(c,kind,{pose={},entity={},time=0,reduced=false,pixelRatio=2}={}){
    if(!KINDS.has(kind))return false;
    const facing=entity.castFace>0&&Number.isFinite(entity.castFacing)?entity.castFacing:entity.facing||0;
    const flip=Math.cos(facing)<-.1?-1:1,ratio=clamp(Math.ceil(Number.isFinite(pixelRatio)?pixelRatio:2),1,2);
    const p={step:0,leftLift:0,rightLift:0,bodyY:0,arm:0,cloth:0,...pose},palette=PALETTES[kind];
    if(kind==='traveler'){this._drawTraveler(c,p,entity,time,reduced,flip,ratio);return true;}
    const cast=entity.castFace>0?Math.sin(Math.PI*clamp(entity.castFace/.25,0,1)):0;
    c.save();c.lineCap='round';c.lineJoin='round';
    this._part(c,kind,'back',flip,ratio,0,p.bodyY);
    this._boots(c,p,flip,kind);
    c.translate(0,p.bodyY);
    this._part(c,kind,'left',flip,ratio,0,-p.arm*.65);
    this._part(c,kind,'body',flip,ratio);
    if(kind==='stormcaller'){
      // Grip is the pivot. The elbow bends around it, instead of attaching a
      // rigid vertical stick to a straight hanging arm.
      const handY=1+p.arm*.45-cast*1.2,handX=20+cast*1.2;
      c.save();c.translate(handX*flip,handY);c.rotate((reduced?0:cast*.08)*flip);this._part(c,kind,'staff',flip,ratio);c.restore();
      c.save();c.scale(flip,1);line(c,[[9,-3],[13,3],[handX,handY]],palette.outline,6);line(c,[[9,-3],[13,3],[handX,handY]],'#8e81ae',4.5);line(c,[[10,-4],[13,1],[handX-2,handY-1]],'#bcabd1',.8);oval(c,handX,handY,2.9,2.8,palette.skin[1]);line(c,[[handX-1,handY-1],[handX+1,handY-1]],palette.skin[2],.8);c.restore();
    }else this._part(c,kind,'right',flip,ratio,0,p.arm*.65);
    this._part(c,kind,'head',flip,ratio);
    c.save();c.scale(flip,1);this._face(c,kind,humanoidFaceState(entity,time,reduced));c.restore();
    c.restore();return true;
  }
  _drawTraveler(c,p,entity,time,reduced,flip,ratio){
    // The familiar original traveler, preserved from v0.0.30's player paths.
    // Static pieces keep their flat colors; only existing gait and eyes animate.
    c.save();c.lineCap='round';c.lineJoin='round';
    this._part(c,'traveler','back',flip,ratio,0,p.bodyY);
    this._boots(c,p,flip,'traveler');c.translate(0,p.bodyY);
    this._part(c,'traveler','body',flip,ratio);
    this._part(c,'traveler','head',flip,ratio);
    c.save();c.scale(flip,1);this._face(c,'traveler',humanoidFaceState(entity,time,reduced));c.restore();
    this._part(c,'traveler','left',flip,ratio);
    const settled=1-clamp(p.cloakLift??entity.cloakLift??(entity.moving?1:0),0,1);
    c.save();c.scale(flip,1);c.beginPath();c.moveTo(-8,1);c.quadraticCurveTo(-18+settled*2,4+settled*3,-24+settled*4,1+settled*8+p.cloth);c.lineTo(-21+settled*4,8+settled*5);c.quadraticCurveTo(-13,9+settled*3,-8,5);paint(c,'#70964f');c.restore();
    this._part(c,'traveler','right',flip,ratio,0,p.arm);
    c.restore();
  }
  _boots(c,p,flip,kind){
    if(kind==='traveler'){
      c.save();c.scale(flip,1);
      for(const side of [-1,1]){const lift=side<0?p.leftLift:p.rightLift,x=side*6-side*p.step*1.6;
        line(c,[[side*5.5,9+p.bodyY],[x,14-lift]],'#526044',4.6);
        oval(c,x,14.8-lift,4.2,3.2,'#383e2b');
        line(c,[[x-2,14.2-lift],[x+1.8,14.2-lift]],'#737857',.8);
      }
      c.restore();return;
    }
    const leather=kind==='stormcaller'?['#36364a','#5c576d','#8b8596']:kind==='angel'?['#667464','#98a189','#c9c8ab']:['#303a2b','#555d40','#87906a'];
    for(const side of [-1,1]){const lift=side<0?p.leftLift:p.rightLift,x=(side*6-side*p.step*1.6)*flip;
      line(c,[[side*5.5*flip,8+p.bodyY],[x,14-lift]],leather[1],4.6);
      c.beginPath();c.moveTo(x-3.4,12-lift);c.quadraticCurveTo(x,10.6-lift,x+3.2,12-lift);c.lineTo(x+4.2,15.4-lift);c.quadraticCurveTo(x+1,18.3-lift,x-4,16.1-lift);c.closePath();paint(c,leather[1],leather[0],.9);
      line(c,[[x-3.2,16-lift],[x+3.4,16-lift]],leather[0],1);line(c,[[x-.5,12.1-lift],[x+2.3,12.8-lift],[x+2.9,14.4-lift]],leather[2],.95);
    }
  }
  _back(c,kind,flip){
    if(kind==='traveler'){
      c.beginPath();c.moveTo(-10,-4);c.quadraticCurveTo(-17,6,-16,13);c.quadraticCurveTo(0,18,15,12);c.lineTo(9,-7);c.closePath();paint(c,'#567b49','#253c2a',1.6);
    }else if(kind==='angel'){
      // Broad curved feathers form a stepped fan, not two pointed leaf shapes.
      // The complete span still fits the existing 64 px cached back layer.
      for(const side of [-1,1]){
        const featherFill=material(c,flip,['#9fb1a8','#e0e6d6','#fffbed'],31,-29,11);
        const feathers=[
          [10,-3,10,-21,21,-27,30,-28,31,-22,20,-1,12,5],
          [11,-4,16,-15,22,-15,29,-18,31,-11,23,4,13,8],
          [10,-2,16,-8,20,-6,26,-7,27,1,20,10,12,10],
          [9,0,13,-3,17,1,20,2,22,8,15,12,9,9]
        ];
        for(const f of feathers){
          c.beginPath();c.moveTo(side*f[0],f[1]);c.bezierCurveTo(side*f[2],f[3],side*f[4],f[5],side*f[6],f[7]);c.bezierCurveTo(side*f[8],f[9],side*f[10],f[11],side*f[12],f[13]);c.quadraticCurveTo(side*8,7,side*f[0],f[1]);c.closePath();
          paint(c,featherFill,'#84998e',.85);
        }
        // A rounded shoulder and only two quiet shaft highlights keep the
        // feathers readable at normal scale without fine-line visual noise.
        c.beginPath();c.moveTo(side*9,3);c.quadraticCurveTo(side*7,-10,side*16,-19);c.quadraticCurveTo(side*20,-23,side*25,-24);c.quadraticCurveTo(side*17,-17,side*15,-7);c.quadraticCurveTo(side*14,0,side*9,3);c.closePath();
        paint(c,material(c,flip,['#b3c2b4','#e6e9da','#fffbee'],27,-27,8),'#a2b2a2',.65);
        c.beginPath();c.moveTo(side*14,-6);c.quadraticCurveTo(side*19,-15,side*27,-24);c.strokeStyle='#fffef2bb';c.lineWidth=.85;c.stroke();
        c.beginPath();c.moveTo(side*15,1);c.quadraticCurveTo(side*21,-4,side*25,-12);c.strokeStyle='#fffef2aa';c.lineWidth=.7;c.stroke();
      }
    }else if(kind==='merchant'){
      poly(c,[[-21,-10],[-9,-12],[-7,12],[-20,12],[-23,8]],material(c,flip,['#534d35','#85724b','#bba06b'],22,-12,12),'#414632',1.1);
      poly(c,[[-22,-10],[-10,-12],[-9,-5],[-21,-3]],'#9d895b','#58563b',.7);line(c,[[-20,-1],[-10,-3]],'#cbbb87',1.2);
      line(c,[[-18,-9],[-17,11]],'#594d34',2.5);line(c,[[-17.3,-9],[-16.3,10]],'#bca272',.6);gem(c,-17,1,2.1,undefined,flip);
      line(c,[[-19,-14],[-12,-14]],'#4b4f37',5.5);line(c,[[-19,-15],[-12,-15]],'#b9b589',3.5);oval(c,-19,-14,2,2.3,'#d1c99b');
    }else if(kind==='stormcaller'){
      poly(c,[[-9,-7],[-14,10],[-8,14],[7,13],[13,10],[9,-7]],material(c,flip,['#3d3a52','#625775','#8f7aab'],15,-6,14),'#343948',1);
    }
  }
  _body(c,kind,flip){
    if(kind==='traveler'){
      c.beginPath();c.moveTo(-7,-6);c.lineTo(8,-6);c.lineTo(10,10);c.quadraticCurveTo(0,14,-9,10);c.closePath();paint(c,'#adc19a');return;
    }
    const p=PALETTES[kind];
    if(kind==='angel'){
      // A gently gathered waist and a curved ivory skirt retain the same small
      // body envelope; the dress does not exaggerate the character's proportions.
      c.beginPath();c.moveTo(-8,-7);c.quadraticCurveTo(0,-9,8,-7);c.quadraticCurveTo(7,-2,6.5,1);c.quadraticCurveTo(8,6,12,10);c.quadraticCurveTo(0,16,-12,10);c.quadraticCurveTo(-8,6,-6.5,1);c.quadraticCurveTo(-7,-2,-8,-7);c.closePath();
    }else coatPath(c,12);
    paint(c,material(c,flip,p.cloth,14,-8,13),p.outline,1.15);
    // A few broad fold planes survive at game size; there is no noisy fabric grain.
    poly(c,[[-6,-4],[-3,3],[-6,11],[-9,10]],'#152d242b');poly(c,[[5,-5],[8,9],[4,12],[3,4]],kind==='angel'?'#ffffff55':'#efebca22');
    line(c,[[-6,2],[-7,9]],kind==='stormcaller'?'#c5b7d440':'#e6e7b83b',.75);
    if(kind==='stormcaller'){
      poly(c,[[-3,-7],[2,-7],[4,11],[-4,11]],material(c,flip,['#767492','#aaaace','#d7d4e6'],6,-7,12),'#55536d',.65);line(c,[[-10,10],[0,12],[10,10]],'#c7b8d4',1.3);line(c,[[-9,8],[-5,9]],'#b9a5ca',.65);line(c,[[5,9],[9,8]],'#b9a5ca',.65);gem(c,0,3,2.7,['#737392','#bdc9e6','#f0f1ff'],flip);
      poly(c,[[-10,-6],[0,-3],[10,-6],[7,-1],[0,0],[-7,-1]],'#514b69','#383d4c',.65);line(c,[[-8,-5],[0,-2],[8,-5]],'#b4a5c8',.7);
    }else if(kind==='warden'){
      poly(c,[[-8,-7],[0,-5],[8,-7],[10,7],[7,11],[-7,11],[-10,7]],material(c,flip,['#6a6240','#a28b55','#d0bd80'],12,-10,13),'#455038',1);
      for(const x of [-5,0,5]){poly(c,[[x-1.4,-4],[x+1.4,-4],[x+1.8,8],[x-1.8,8]],material(c,flip,['#837045','#baa06a','#e0cc96'],13,-9,12));line(c,[[x+1.2,-3],[x+1.4,5]],'#e9d6a46b',.65);}
      line(c,[[-8,7],[8,7]],'#4f5c3d',2.8);gem(c,0,7,2.4,undefined,flip);line(c,[[-9,-6],[0,-4],[9,-6]],'#bac38b',2.4);
    }else if(kind==='merchant'){
      poly(c,[[-8,-7],[-4,-7],[8,8],[5,10]],'#5a5238','#c0a26b',.5);line(c,[[-9,6],[9,6]],'#564d32',2.8);gem(c,1,6,2.6,undefined,flip);
      poly(c,[[5,5],[10,5],[11,11],[5,12]],'#b59a64','#5c5338',.8);line(c,[[6,7],[9,7]],'#e2c88e',.7);
      poly(c,[[-9,-7],[0,-3],[9,-7],[6,-1],[0,1],[-6,-1]],'#c2ac75','#6a623f',.65);
    }else{
      poly(c,[[-2,2],[2,2],[4,12],[-4,12]],'#fff9e3');
      c.beginPath();c.moveTo(-8,-6);c.quadraticCurveTo(0,-1,8,-6);c.strokeStyle='#e0cb91';c.lineWidth=1.2;c.stroke();
      line(c,[[-6.5,1],[6.5,1]],'#bbab76',2);line(c,[[-6.5,.6],[6.5,.6]],'#f5e6b7',.9);gem(c,0,1,1.8,['#ad985c','#e5cd87','#fff4c3'],flip);
      c.beginPath();c.moveTo(-10,10);c.quadraticCurveTo(0,14.5,10,10);c.strokeStyle='#e4d6aa';c.lineWidth=1.1;c.stroke();
    }
  }
  _head(c,kind,flip){
    const p=PALETTES[kind];
    if(kind==='traveler'){
      hoodPath(c);paint(c,'#e4dfb8','#253c2a',1.6);
      oval(c,2,-12,10,9,'#32452f');
      c.beginPath();c.moveTo(-13,-11);c.quadraticCurveTo(-7,-27,3,-28);c.strokeStyle='#b5ab82';c.lineWidth=1;c.stroke();
    }else{
      if(kind==='angel'){
        // Loose gold locks flare softly at the shoulders, framing a compact
        // face without two straight vertical borders beside the cheeks.
        c.beginPath();c.moveTo(0,-29);c.bezierCurveTo(-9,-29,-14,-23,-13,-15);c.bezierCurveTo(-12,-9,-11,-5,-14,-2);c.quadraticCurveTo(-9,1,-5,-4);c.lineTo(5,-4);c.quadraticCurveTo(9,1,14,-2);c.bezierCurveTo(11,-5,12,-9,13,-15);c.bezierCurveTo(14,-23,9,-29,0,-29);c.closePath();paint(c,material(c,flip,['#b1965e','#dac285','#f5e3aa'],15,-29,0),'#9e906b',.7);
        // A short oval with softly rounded cheeks and a shallow chin. The
        // lower face is deliberately compact enough to read at game scale.
        c.beginPath();c.moveTo(0,-21.4);c.bezierCurveTo(-7,-21.4,-10.3,-18.4,-9.8,-13.8);c.bezierCurveTo(-9.5,-9.2,-5.8,-5,0,-5);c.bezierCurveTo(5.8,-5,9.5,-9.2,9.8,-13.8);c.bezierCurveTo(10.3,-18.4,7,-21.4,0,-21.4);c.closePath();paint(c,material(c,flip,['#e3bb99','#f6d9ba','#fff0d8'],11,-22,-5),'#caa08033',.55);
        oval(c,-5.7,-9.1,2,.7,'#db90772d');oval(c,5.7,-9.1,2,.7,'#db90772d');
      }else oval(c,0,-13.2,10.6,11,material(c,flip,[p.face,p.face,kind==='stormcaller'?'#596179':'#64745a'],11,-22,-4));
      // Caps cast a painted shadow; the angel has an exposed forehead instead.
      if(kind!=='angel'){c.beginPath();c.moveTo(-10,-16);c.quadraticCurveTo(0,-24,10,-16);c.lineTo(9,-13);c.quadraticCurveTo(0,-17,-9,-13);c.closePath();paint(c,'#14252a40');}
      if(kind==='stormcaller'){
        // A bent cone with a genuine overhanging brim: +4 px versus the old
        // hat, while the face and body remain the traveler's size.
        c.beginPath();c.moveTo(-12,-21);c.quadraticCurveTo(-9,-29,-5,-33);c.quadraticCurveTo(0,-38,6,-37);c.quadraticCurveTo(2,-34,5,-31);c.quadraticCurveTo(9,-27,12,-21);c.closePath();paint(c,material(c,flip,['#49415e','#78639f','#b9a0cd'],15,-38,-19),p.outline,1.2);
        poly(c,[[-7,-29],[-3,-34],[1,-35],[-1,-30],[-4,-24]],'#dfbdd92b');line(c,[[3*flip,-35],[5*flip,-29],[9*flip,-23]],'#d8b8e25b',.9);
        c.beginPath();c.moveTo(-12,-22.6);c.quadraticCurveTo(0,-26,11,-22.6);c.lineTo(12,-19.6);c.quadraticCurveTo(0,-22.5,-13,-19.6);c.closePath();paint(c,'#afa2bf','#625975',.6);gem(c,4,-22.4,1.9,['#7d718d','#d3c4d3','#fbebdf'],flip);
        c.beginPath();c.moveTo(-18,-20);c.quadraticCurveTo(-7,-24,-1,-22);c.quadraticCurveTo(10,-24,18,-20);c.quadraticCurveTo(9,-15,0,-17);c.quadraticCurveTo(-10,-15,-18,-20);c.closePath();paint(c,material(c,flip,['#594770','#9076af','#c3aad7'],19,-23,-15),p.outline,1);
        c.beginPath();c.moveTo(-16,-19.3);c.quadraticCurveTo(0,-14,16,-19.3);c.strokeStyle='#ccb3dc';c.lineWidth=.8;c.stroke();
      }else if(kind==='warden'){
        c.beginPath();c.moveTo(-13,-15);c.lineTo(-11,-25);c.quadraticCurveTo(0,-31,11,-25);c.lineTo(13,-15);c.quadraticCurveTo(0,-21,-13,-15);c.closePath();paint(c,material(c,flip,['#706443','#a39462','#d4c78e'],15,-30,-14),p.outline,1.15);
        poly(c,[[-2,-28],[1,-28],[2,-18],[-1,-18]],'#d0c18b','#776e4a',.6);line(c,[[0,-27],[.5,-20]],'#fff0b9',.8);
        line(c,[[-10,-19],[-7,-22]],'#877b506b',.7);line(c,[[7*flip,-25],[10*flip,-21]],'#f3e4ac8c',1);line(c,[[-10,-16],[-7,-17]],'#e7d89888',.75);
      }else if(kind==='merchant'){
        c.beginPath();c.moveTo(-13,-19);c.quadraticCurveTo(-14,-30,-2,-31);c.quadraticCurveTo(11,-32,12,-21);c.closePath();paint(c,material(c,flip,['#73633f','#a58a56','#d4bb7d'],15,-32,-19),p.outline,1.1);
        c.beginPath();c.moveTo(-12,-23);c.quadraticCurveTo(0,-26,12,-23);c.lineTo(13,-20);c.quadraticCurveTo(0,-22,-13,-20);c.closePath();paint(c,'#5f5d3b');
        oval(c,0,-20,16,3.5,material(c,flip,['#867048','#b89d65','#ddc991'],17,-25,-18));line(c,[[-12,-18.5],[0,-17.5],[12,-19]],'#c9b67b',.8);
      }else{
        // A fuller swept fringe covers more forehead. Curved side locks frame
        // the upper cheeks, then turn outward to keep the short chin open.
        c.beginPath();c.moveTo(-13,-3);c.bezierCurveTo(-10,-6,-12.7,-11,-13,-17.5);c.bezierCurveTo(-13.5,-24.8,-7.2,-29.5,0,-29.5);c.bezierCurveTo(7.2,-29.5,13.5,-24.8,13,-17.5);c.bezierCurveTo(12.7,-11,10,-6,13,-3);c.quadraticCurveTo(8.7,-1.6,7.2,-5.2);c.bezierCurveTo(6.7,-8,8.1,-10.5,8.3,-14);c.quadraticCurveTo(8.8,-20.3,4.8,-22.5);c.quadraticCurveTo(2.1,-17.8,-3.9,-16);c.quadraticCurveTo(-3,-17.4,-2.7,-18.9);c.quadraticCurveTo(-5.5,-16.7,-8.3,-15.7);c.bezierCurveTo(-8.8,-12.2,-6.7,-9,-7.2,-5.2);c.quadraticCurveTo(-8.7,-1.6,-13,-3);c.closePath();
        paint(c,material(c,flip,['#b39b63','#e1ca8c','#fff0bb'],14,-30,-8),'#9c946e',.75);
        c.beginPath();c.moveTo(2,-26.8);c.quadraticCurveTo(-3,-26.8,-7.7,-22.8);c.strokeStyle='#fff3ca';c.lineWidth=1.1;c.stroke();
        c.beginPath();c.moveTo(5,-25.8);c.quadraticCurveTo(10,-23.4,10.7,-19.8);c.strokeStyle='#fff2c699';c.lineWidth=.8;c.stroke();
        c.beginPath();c.moveTo(-11,-17.5);c.bezierCurveTo(-12,-12,-8.7,-8.7,-9.8,-5.2);c.strokeStyle='#f5df9f';c.lineWidth=.85;c.stroke();
        c.beginPath();c.moveTo(11.4,-17);c.bezierCurveTo(11.7,-12,8.8,-8.5,9.9,-5.2);c.strokeStyle='#fff1bb99';c.lineWidth=.8;c.stroke();
        c.beginPath();c.ellipse(0,-36.8,9.5,2.2,0,0,TAU);c.strokeStyle='#b5a365';c.lineWidth=1.7;c.stroke();c.strokeStyle='#f6e4a4';c.lineWidth=.85;c.stroke();
        c.beginPath();c.ellipse(0,-36.8,9.5,2.2,0,Math.PI*1.15,Math.PI*1.85);c.strokeStyle='#fff8d5';c.lineWidth=.9;c.stroke();
      }
    }
  }
  _left(c,kind,flip){
    if(kind==='traveler'){
      poly(c,[[-12,-2],[11,-3],[9,3],[-11,4]],'#70964f');
      line(c,[[-6,8],[8,8]],'#788a5b',2);
      poly(c,[[1,5.8],[2.452,8],[1,10.2],[-.452,8]],'#e2c276');return;
    }
    this._arm(c,kind,flip,-1);
  }
  _right(c,kind,flip){if(kind==='traveler'){oval(c,17,3,3,3,'#d8d1a7');return;}this._arm(c,kind,flip,1);}
  _arm(c,kind,flip,side){
    const p=PALETTES[kind],handX=side*16,handY=8;
    line(c,[[side*9,-3],[side*13,1],[handX,handY]],p.outline,6);
    line(c,[[side*9,-3],[side*13,1],[handX,handY]],material(c,flip,p.arm,17,-7,11),4.6);
    line(c,[[side*11,-2],[side*14,2]],side*flip>0?p.arm[2]:p.arm[1],.85);
    oval(c,handX,handY,3.1,3,material(c,flip,p.skin,18,-4,12));line(c,[[handX-1,handY-.8],[handX+1,handY-1]],p.skin[2],.8);
    if(kind==='warden'){
      c.beginPath();c.moveTo(side*8,-6);c.quadraticCurveTo(side*14,-8,side*17,-2);c.lineTo(side*15,1);c.quadraticCurveTo(side*10,0,side*8,-3);c.closePath();paint(c,material(c,flip,['#79673e','#ac935e','#dbc68c'],17,-8,6),'#49503a',.8);
      line(c,[[side*10,-5],[side*14,-4],[side*16,-2]],'#ebd59c',.75);
      if(side<0){poly(c,[[-23,-1],[-14,-3],[-12,7],[-18,14],[-23,9]],material(c,flip,['#6b6140','#9e8751','#cdb981'],23,-5,15),'#44513a',1);poly(c,[[-21,1],[-16,0],[-15,6],[-18,10],[-21,7]],'#69794b');line(c,[[-18,1],[-18,9]],'#e2cd96',1.3);line(c,[[-21,4],[-15,4]],'#c0c58a',1.2);}
    }
  }
  _staff(c,kind,flip){
    line(c,[[-5.8,14.5],[10.8,-28]],'#3e4554',3.7);
    line(c,[[-5.8,14.5],[10.8,-28]],'#827c92',2.5);
    line(c,[[-4.9,13],[11.5,-27]],'#c2b4c6',.75);
    for(let i=0;i<3;i++)line(c,[[.1+i*.6,-2-i*1.7],[2.7+i*.6,-1-i*1.7]],'#e1cfb0',.8);
    poly(c,[[8,-26],[7,-30],[12,-34],[16,-29],[12,-25]],material(c,flip,['#727991','#b9d4e5','#eefaff'],16,-35,-24),'#58617b',.9);
    poly(c,[[12,-34],[12,-28],flip>0?[16,-29]:[7,-30]],'#f3fcff');poly(c,[flip>0?[7,-30]:[16,-29],[12,-28],[12,-25]],'#9ca4c9');line(c,[[8,-25],[12,-24],[15,-27]],'#c5b490',1.3);
  }
  _face(c,kind,state){
    const p=PALETTES[kind],angel=kind==='angel',xs=kind==='traveler'?[-2,6]:angel?[-3.8,3.8]:[-4,4],y=kind==='traveler'?-12:angel?-11.5:-12.6;
    for(let i=0;i<2;i++){
      const x=xs[i];
      if(state==='hurt')line(c,[[x+(i?1.5:-1.5),y-1.6],[x+(i?-.9:.9),y],[x+(i?1.5:-1.5),y+1.4]],p.eye,1.2);
      else if(state==='blink')line(c,[[x-1.4,y+.2],[x+1.4,y+.2]],p.eye,1);
      else if(state==='focus')line(c,[[x-1.5,y+(i?-.6:.3)],[x+1.5,y+(i?.3:-.6)]],p.eye,1.5);
      else if(state==='glad'){c.beginPath();c.moveTo(x-1.5,y+.8);c.quadraticCurveTo(x,y-1.5,x+1.5,y+.8);c.strokeStyle=p.eye;c.lineWidth=1.1;c.stroke();}
      else oval(c,x,y,kind==='traveler'||angel?1.5:1.4,kind==='traveler'||angel?2:1.95,p.eye);
    }
    if(angel){
      c.beginPath();c.moveTo(-1.4,-7.7);c.quadraticCurveTo(0,state==='hurt'?-8.6:state==='focus'?-7.7:-6.4,1.4,-7.7);c.strokeStyle='#b57e6c';c.lineWidth=.65;c.stroke();
    }
  }
}
