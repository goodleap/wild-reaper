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
function hoodPath(c){c.beginPath();c.moveTo(-14,-8);c.bezierCurveTo(-17,-22,-10,-30,0,-32);c.bezierCurveTo(12,-33,17,-22,16,-9);c.quadraticCurveTo(12,-1,-11,-2);c.closePath();}
const PALETTES={
  traveler:{cloth:['#617547','#9baf79','#c8d3a4'],arm:['#55703f','#85a45e','#b4c682'],outline:'#334832',skin:['#9f9671','#d4c8a0','#ece2bd'],face:'#2f4030',eye:'#eef6cb'},
  warden:{cloth:['#5b6340','#8f8052','#c1ac76'],arm:['#495e3a','#718653','#a4ac70'],outline:'#374831',skin:['#908662','#bfb185','#e0d1a0'],face:'#344638',eye:'#f2ebbf'},
  stormcaller:{cloth:['#49435e','#796e9d','#aaa0c4'],arm:['#58516f','#8a80aa','#b1a6cc'],outline:'#373c4d',skin:['#9292ac','#c3bfda','#e1dceb'],face:'#353d54',eye:'#eaf0ff'},
  merchant:{cloth:['#665237','#997c4d','#ccb37b'],arm:['#756040','#ac8c57','#d5b977'],outline:'#444632',skin:['#a3946d','#d2c09a','#eee0b8'],face:'#414832',eye:'#f3eccb'},
  angel:{cloth:['#9aa68c','#d4dbc0','#f4f0d8'],arm:['#a6b69b','#d3dfbe','#f5f0d8'],outline:'#667c6a',skin:['#a7ae91','#d4d6b8','#f1ebd0'],face:'#53665d',eye:'#fff4d7'}
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
    const cast=entity.castFace>0?Math.sin(Math.PI*clamp(entity.castFace/.25,0,1)):0;
    c.save();c.lineCap='round';c.lineJoin='round';
    this._part(c,kind,'back',flip,ratio,0,p.bodyY);
    this._boots(c,p,flip,kind);
    c.translate(0,p.bodyY);
    this._part(c,kind,'left',flip,ratio,0,-p.arm*.65);
    this._part(c,kind,'body',flip,ratio);
    if(kind==='traveler'){
      c.save();c.scale(flip,1);c.beginPath();c.moveTo(-8,0);c.quadraticCurveTo(-17,2,-23,1+p.cloth);c.lineTo(-21,6.5);c.quadraticCurveTo(-13,8,-8,4);c.closePath();paint(c,'#76934e','#3f5a35',.7);line(c,[[-11,2],[-17,4],[-21,3+p.cloth*.5]],'#b2bc77',.8);c.restore();
    }
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
  _boots(c,p,flip,kind){
    const leather=kind==='stormcaller'?['#36364a','#5c576d','#8b8596']:kind==='angel'?['#667464','#98a189','#c9c8ab']:['#303a2b','#555d40','#87906a'];
    for(const side of [-1,1]){const lift=side<0?p.leftLift:p.rightLift,x=(side*6-side*p.step*1.6)*flip;
      line(c,[[side*5.5*flip,8+p.bodyY],[x,14-lift]],leather[1],4.6);
      c.beginPath();c.moveTo(x-3.4,12-lift);c.quadraticCurveTo(x,10.6-lift,x+3.2,12-lift);c.lineTo(x+4.2,15.4-lift);c.quadraticCurveTo(x+1,18.3-lift,x-4,16.1-lift);c.closePath();paint(c,leather[1],leather[0],.9);
      line(c,[[x-3.2,16-lift],[x+3.4,16-lift]],leather[0],1);line(c,[[x-.5,12.1-lift],[x+2.3,12.8-lift],[x+2.9,14.4-lift]],leather[2],.95);
    }
  }
  _back(c,kind,flip){
    if(kind==='traveler'){
      c.beginPath();c.moveTo(-10,-5);c.quadraticCurveTo(-17,3,-16,12.5);c.quadraticCurveTo(-3,19,15,12);c.lineTo(9,-7);c.closePath();paint(c,material(c,flip,['#304c35','#547447','#87a362'],17,-7,15),'#2c432f',1.1);
      line(c,[[-11,0],[-13,8],[-10,13]],'#263f3066',1.2);line(c,[[6,-2],[11,10],[5,14]],'#b1bd766b',.9);
    }else if(kind==='angel'){
      for(const side of [-1,1]){
        const points=[[side*8,-6],[side*13,-17],[side*26,-26],[side*27,-19],[side*24,-7],[side*19,3],[side*9,5]];
        poly(c,points,material(c,flip,['#839f97','#c2d1c4','#edf0d8'],27,-27,5),'#6c8980',1);
        for(let i=0;i<4;i++){
          const x=side*(11+i*3.1),top=-10-i*3.4;
          c.beginPath();c.moveTo(x,top);c.quadraticCurveTo(side*(19+i*1.8),top-9,side*(26-i*.7),-23+i*4.1);c.quadraticCurveTo(side*(22-i*.9),-3+i*1.2,side*(12+i*1.8),2+i*.5);c.quadraticCurveTo(x-2*side,top+6,x,top);c.closePath();
          paint(c,material(c,flip,['#94ada3','#d2ddcd','#f7f5e4'],27,-28,7),'#91a89c',.55);
          line(c,[[side*(13+i*2.6),-1+i*.5],[side*(19+i*1.5),-12+i*.1]],'#ffffff66',.65);
        }
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
    const p=PALETTES[kind];coatPath(c,kind==='traveler'?10:12);paint(c,material(c,flip,p.cloth,14,-8,13),p.outline,1.15);
    // A few broad fold planes survive at game size; there is no noisy fabric grain.
    poly(c,[[-6,-4],[-3,3],[-6,11],[-9,10]],'#152d242b');poly(c,[[5,-5],[8,9],[4,12],[3,4]],kind==='angel'?'#ffffff55':'#efebca22');
    line(c,[[-6,2],[-7,9]],kind==='stormcaller'?'#c5b7d440':'#e6e7b83b',.75);
    if(kind==='traveler'){
      poly(c,[[-12,-4],[9,-5],[12,-1],[9,4],[-10,4]],material(c,flip,['#3e6037','#6f954d','#b2bd73'],13,-6,5),'#3a5434',.8);
      poly(c,[[-7,-2],[7,-3],[3,1],[-9,1]],'#b6c68744');line(c,[[-8,8],[8,8]],'#536343',2.7);line(c,[[-7,7.6],[8,7.6]],'#aab283',.6);gem(c,1,8,2.3,undefined,flip);
    }else if(kind==='stormcaller'){
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
      poly(c,[[-3,-7],[2,-7],[4,12],[-3,12]],material(c,flip,['#a1a47b','#d0cba0','#f4e9bf'],6,-6,13));line(c,[[1,-3],[1,10]],'#fff2c3',.9);
      poly(c,[[-9,-7],[0,-3],[9,-7],[7,-1],[0,1],[-7,-1]],'#b9c5a7','#869d83',.65);line(c,[[-7,-6],[0,-2],[7,-6]],'#fff0c4',1.15);gem(c,0,-3,2.5,['#b4a364','#e8d698','#fff5cf'],flip);line(c,[[-10,10],[0,13],[10,10]],'#e8dab1',1.1);
    }
  }
  _head(c,kind,flip){
    const p=PALETTES[kind];
    if(kind==='traveler'){
      hoodPath(c);paint(c,material(c,flip,['#a99f76','#d5d0a6','#f6edc8'],16,-33,-1),p.outline,1.25);
      c.save();hoodPath(c);c.clip();c.beginPath();c.moveTo(-14,-5);c.quadraticCurveTo(-13,-27,0,-30);c.quadraticCurveTo(-9,-16,-6,-3);c.closePath();paint(c,'#8b85644d');
      line(c,[[7*flip,-29],[12*flip,-23],[13.5*flip,-14]],'#fff6d59c',1.4);c.restore();
      oval(c,1,-12.5,11,9.3,'#7c8260');oval(c,1.5,-12.2,9.8,8.2,material(c,flip,['#24392d','#354a35','#516444'],10,-19,-3));
      c.beginPath();c.moveTo(-9,-15);c.quadraticCurveTo(1,-24,12,-15);c.quadraticCurveTo(1,-19,-9,-15);paint(c,'#22372eaa');
      line(c,[[-10,-11],[-8,-5],[0,-3],[9,-5]],'#efe3b77d',.8);
    }else{
      oval(c,0,-13.2,10.6,11,material(c,flip,[p.face,p.face,kind==='angel'?'#809381':kind==='stormcaller'?'#596179':'#64745a'],11,-22,-4));
      // The cap casts a small soft-edged painted plane rather than a blur filter.
      c.beginPath();c.moveTo(-10,-16);c.quadraticCurveTo(0,-24,10,-16);c.lineTo(9,-13);c.quadraticCurveTo(0,-17,-9,-13);c.closePath();paint(c,'#14252a40');
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
        c.beginPath();c.moveTo(-12,-16);c.quadraticCurveTo(-15,-30,-1,-31);c.quadraticCurveTo(13,-31,13,-17);c.lineTo(9,-20);c.quadraticCurveTo(5,-22,3,-26);c.quadraticCurveTo(-2,-20,-12,-16);c.closePath();paint(c,material(c,flip,['#b8ac7b','#e2d5a1','#fff2c9'],15,-32,-15),'#8b9778',1);
        line(c,[[2,-28],[-3,-24],[-8,-22]],'#fff4cf8c',.9);line(c,[[7,-28],[10,-22]],'#fff5d2bb',1);
        c.beginPath();c.ellipse(0,-37,10,2.8,0,0,TAU);c.strokeStyle='#8e966b';c.lineWidth=2.5;c.stroke();c.strokeStyle='#efdda1';c.lineWidth=1.5;c.stroke();line(c,[[0,-39.8],[5,-39.4],[8,-38.6]],'#fff5d0',.9);
      }
    }
  }
  _left(c,kind,flip){this._arm(c,kind,flip,-1);}
  _right(c,kind,flip){this._arm(c,kind,flip,1);}
  _arm(c,kind,flip,side){
    const p=PALETTES[kind],handX=side*16,handY=kind==='traveler'?4.5:8;
    if(kind==='traveler'&&side<0)return;
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
    const p=PALETTES[kind],xs=kind==='traveler'?[-2.5,5.5]:[-4,4],y=kind==='traveler'?-12:-12.6;
    for(let i=0;i<2;i++){
      const x=xs[i];
      if(state==='hurt')line(c,[[x+(i?1.5:-1.5),y-1.6],[x+(i?-.9:.9),y],[x+(i?1.5:-1.5),y+1.4]],p.eye,1.2);
      else if(state==='blink')line(c,[[x-1.4,y+.2],[x+1.4,y+.2]],p.eye,1);
      else if(state==='focus')line(c,[[x-1.5,y+(i?-.6:.3)],[x+1.5,y+(i?.3:-.6)]],p.eye,1.5);
      else if(state==='glad'){c.beginPath();c.moveTo(x-1.5,y+.8);c.quadraticCurveTo(x,y-1.5,x+1.5,y+.8);c.strokeStyle=p.eye;c.lineWidth=1.1;c.stroke();}
      else oval(c,x,y,1.4,1.95,p.eye);
    }
  }
}
