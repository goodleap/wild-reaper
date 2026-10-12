// Illustrated enemy sprites. Brushwork, material shading and pose frames are
// rasterized only once. World placement, bob, hit recoil and cast shadows belong
// to the renderer; this module stays in each monster's established local bounds.
const TAU=Math.PI*2,PIXEL_LIMIT=6*1024*1024/4;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const hash=(a,b=0)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
const poly=(c,p,fill,stroke=null,w=1)=>{c.beginPath();p.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}};
const line=(c,p,color,w=1)=>{c.strokeStyle=color;c.lineWidth=w;c.beginPath();p.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.stroke();};
const oval=(c,x,y,rx,ry,color,angle=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fill();};
const grad=(c,x1,y1,x2,y2,colors)=>{const g=c.createLinearGradient(x1,y1,x2,y2);colors.forEach((s,i)=>g.addColorStop(i/(colors.length-1),s));return g;};
function leaf(c,x,y,l,w,a,color){c.save();c.translate(x,y);c.rotate(a);c.fillStyle=color;c.beginPath();c.moveTo(-l/2,0);c.quadraticCurveTo(0,-w,l/2,0);c.quadraticCurveTo(0,w,-l/2,0);c.fill();c.restore();}
function star(c,x,y,r,color){poly(c,[[x,y-r],[x+r*.28,y-r*.28],[x+r,y],[x+r*.28,y+r*.28],[x,y+r],[x-r*.28,y+r*.28],[x-r,y],[x-r*.28,y-r*.28]],color);}
const FRAMES={slime:1,bat:5,beetle:3,brute:3,boar:5,spore:3,ancient:3,bloom:3};
const BOX={slime:[48,40,24,23],bat:[66,52,33,30],beetle:[64,54,32,30],brute:[72,62,36,35],boar:[80,58,40,33],spore:[60,60,30,38],ancient:[128,120,64,73],bloom:[128,120,64,73]};

export class MonsterArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.beetleFacing=new WeakMap();this.pixels=0;this.builds=0;}
  get diagnostics(){return {entries:this.cache.size,size:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  get cacheStats(){return this.diagnostics;}
  _sprite(kind,pose,hit,flip){const key=`${kind}:${pose}:${hit?1:0}:${flip}`;let image=this.cache.get(key);if(image)return image;const [w,h,ox,oy]=BOX[kind],canvas=this.makeCanvas();canvas.width=w*2;canvas.height=h*2;const c=canvas.getContext('2d');c.scale(2,2);c.translate(ox,oy);c.lineJoin='round';c.lineCap='round';const phase=FRAMES[kind]===1?0:pose/(FRAMES[kind]-1)*2-1;
    if(kind==='slime')this._slime(c);else if(kind==='bat')this._bat(c,phase);else if(kind==='beetle')this._beetle(c,phase,flip);else if(kind==='brute')this._brute(c,phase);else if(kind==='boar')this._boar(c,phase,flip);else if(kind==='spore')this._spore(c,phase);else if(kind==='bloom')this._bloom(c,phase);else this._ancient(c,phase);
    if(hit){c.globalCompositeOperation='source-atop';c.globalAlpha=.43;c.fillStyle='#fff5d5';c.fillRect(-ox,-oy,w,h);c.globalCompositeOperation='source-over';c.globalAlpha=1;}
    image={canvas,w,h,ox,oy,pixels:canvas.width*canvas.height};while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  _beetleSide(e){const dx=Math.cos(Number.isFinite(e.visualFacing)?e.visualFacing:0);if(Math.abs(dx)>.12)this.beetleFacing.set(e,dx<0?-1:1);return this.beetleFacing.get(e)||1;}
  draw(c,e,{time=0,reduced=false,dense=false,playerX=e.x+1}={}){const kind=e.type==='boss'?(e.bossKind==='bloom'?'bloom':'ancient'):e.type;if(!BOX[kind])return false;const n=FRAMES[kind],still=reduced||(kind==='boar'&&e.charge&&e.charge.phase!=='rush'),wave=still?0:kind==='beetle'?Math.sin(Number.isFinite(e.walkPhase)?e.walkPhase:0):Math.sin(time*(kind==='bat'?18:(kind==='ancient'||kind==='bloom')?4:10)+(e.id||0));const pose=n===1?0:clamp(Math.round((wave+1)*(n-1)*.5),0,n-1),flip=kind==='beetle'?this._beetleSide(e):kind==='boar'&&(e.charge?.dx??(playerX-e.x))<0?-1:1,image=this._sprite(kind,pose,e.hit>0,flip);c.drawImage(image.canvas,-image.ox,-image.oy,image.w,image.h);
    if(kind==='boar'&&e.charge?.phase==='windup'){c.save();c.scale(flip,1);oval(c,18,-5,3.6,3.2,'#e991433b');oval(c,18,-5,1.8,1.8,'#fff1b5');line(c,[[15,-8],[20,-7]],'#eeb565',1);c.restore();}
    if(kind==='boar'&&e.charge?.phase==='stunned'){for(let i=0;i<3;i++){const a=i*TAU/3+(reduced?0:time*1.5);star(c,Math.cos(a)*17,-30+Math.sin(a)*4,2.7,'#f3d690');}}
    if(kind==='spore'&&e.cast){const progress=clamp(1-e.cast.life/e.cast.maxLife,0,1),x=Math.cos(e.cast.angle)*18,y=7+Math.sin(e.cast.angle)*10;oval(c,x,y,4.5+progress*3,4.5+progress*3,'#dab5e733');oval(c,x,y,2.3+progress*2,2.3+progress*2,'#e8ccf1');star(c,x-.4,y-.6,2+progress*1.5,'#fff0fa');if(!dense)for(let i=0;i<3;i++){const a=i*TAU/3+(reduced?0:time*2);oval(c,x+Math.cos(a)*7,y+Math.sin(a)*5,1,1,'#e5baed');}}
    if(kind==='bloom'&&e.bloomAttack){for(let i=-2;i<=2;i++){const x=i*15,y=-59+Math.abs(i)*4;oval(c,x,y,4.4,5.7,'#f5d8f270');star(c,x+.5,y-1,2.1,'#fff0f8');}}
    return true;
  }
  _slime(c){
    // A wet, folded silhouette and embedded leaves distinguish sap from a disk.
    const body=()=>{c.beginPath();c.moveTo(-18,8);c.bezierCurveTo(-20,2,-16,-3,-15,-6);c.bezierCurveTo(-11,-18,-1,-20,6,-16);c.bezierCurveTo(14,-16,17,-6,17,0);c.bezierCurveTo(18,4,21,8,17,10);c.quadraticCurveTo(12,14,6,12);c.quadraticCurveTo(-1,16,-7,12);c.quadraticCurveTo(-15,14,-18,8);c.closePath();};
    body();c.fillStyle=grad(c,-12,13,12,-18,['#4b7043','#84a55b','#c3d88b']);c.fill();c.strokeStyle='#304e35';c.lineWidth=1.4;c.stroke();c.save();body();c.clip();
    c.fillStyle='#d0e2944a';c.beginPath();c.moveTo(-9,-7);c.bezierCurveTo(-6,-18,10,-20,14,-7);c.bezierCurveTo(10,-11,-2,-8,-9,-7);c.fill();
    c.fillStyle='#2b553c4d';c.beginPath();c.moveTo(-18,4);c.quadraticCurveTo(-10,7,-10,0);c.quadraticCurveTo(-7,10,2,9);c.quadraticCurveTo(10,6,18,6);c.lineTo(20,16);c.lineTo(-20,16);c.fill();
    for(let i=0;i<21;i++){const x=-14+hash(i,31)*28,y=-13+hash(i,39)*23;oval(c,x,y,.4+hash(i,18)*1.2,.6+hash(i,28)*1.4,i%2?'#d9e9a23d':'#325d3833');}
    leaf(c,9,5,6,1.7,-.9,'#4a784854');leaf(c,-12,1,4,1.5,.6,'#59834066');c.restore();
    oval(c,6,-12,4.1,1.9,'#eff9c786',-.35);oval(c,11,-8,1.4,2,'#f4f9c299',-.4);line(c,[[9,11],[14,10],[16,8]],'#c2dd9080',.9);
    for(const x of [-5,5]){oval(c,x,0,2.1,3.1,'#233f30');oval(c,x+.4,-1.1,.65,.9,'#e5efb3');}c.strokeStyle='#34533b';c.lineWidth=1.1;c.beginPath();c.moveTo(-2,6);c.quadraticCurveTo(0,7,2,5.8);c.stroke();
  }
  _bat(c,p){const wing=p*6;
    for(const side of [-1,1]){c.save();c.scale(side,1);const points=[[5,-4],[15,-12+wing*.4],[28,-17+wing],[25,-2+wing*.3],[21,5],[16,1],[12,7],[7,7]];poly(c,points,grad(c,5*side,10,28*side,-20,['#4d5264','#858293','#b7aabd']),'#394652',1.2);poly(c,[[7,-2],[15,-10+wing*.4],[24,-13+wing],[19,-4],[16,1],[12,7]],'#bba9bd35');line(c,[[7,-2],[15,-10+wing*.4],[28,-17+wing]],side>0?'#d2becb':'#9c8d9e',1.2);line(c,[[14,-8+wing*.4],[16,1]],'#4b506285',.8);line(c,[[21,-12+wing*.7],[21,4]],'#4a50628a',.8);line(c,[[10,-4],[12,6]],'#4b50627a',.7);poly(c,[[27,-17+wing],[29,-19+wing],[28,-13+wing]],'#e0c9ba');c.restore();}
    poly(c,[[-5,-7],[-7,-17],[-3,-20],[0,-10],[4,-19],[7,-16],[6,-6]],'#555a6b','#344351',1);poly(c,[[-5,-16],[-3,-17],[-1,-10]],'#b393a9');poly(c,[[4,-16],[5,-14],[4,-10]],'#d1b2c1');
    oval(c,0,0,8,11,grad(c,-7,8,7,-12,['#3a4653','#667382','#9da7ae']));poly(c,[[-5,0],[-4,6],[-1,4],[1,7],[5,4],[4,-1]],'#c1c1b43b');
    for(let i=0;i<11;i++){const x=-5+hash(i,75)*10,y=-8+hash(i,47)*16;line(c,[[x,y],[x+.5,y+2]],i%2?'#cad0c936':'#253b4666',.6);}
    for(const x of [-3,3]){oval(c,x,-2,1.65,2.1,'#f1d49b');oval(c,x+.4,-2,.7,1.3,'#393d3c');}poly(c,[[-2,5],[-.6,7],[0,4]],'#e6dfc2');poly(c,[[1,4],[2,6.5],[3,4]],'#e6dfc2');line(c,[[-4,10],[-5,12]],'#b1a79a',1);line(c,[[4,10],[5,12]],'#b1a79a',1);
  }
  _beetle(c,p,flip=1){
    // The same ground-level side view as the boar: a domed shell above the
    // visible abdomen, with near feet below it and the far legs mostly hidden.
    // Vertical travel retains this profile instead of rotating the body flat.
    c.save();c.scale(flip,1);
    const light=colors=>grad(c,-24*flip,16,24*flip,-24,colors);
    const leg=(i,far=false)=>{
      const stride=p*(i===1?-1:1)*(far?-1:1),hipX=-13+i*11+(far?2:0),hipY=far?3:5.5;
      const kneeX=hipX+(i-1)*4+stride*1.4,kneeY=far?8.4:11.4;
      const footX=hipX+(i-1)*7+stride*3,footY=(far?14.4:17.1)-Math.max(0,stride)*(far?1.2:2.4);
      line(c,[[hipX,hipY],[kneeX,kneeY],[footX,footY],[footX+2.2,footY+.1]],far?'#354533':'#30422f',far?2.5:3.1);
      line(c,[[hipX+.1,hipY],[kneeX+.25,kneeY-.35],[footX+.35,footY-.45]],far?'#66774a':light(['#69774b','#a99b61','#cec185']),far?.85:1.25);
      oval(c,kneeX,kneeY,far?1.2:1.6,far?1.15:1.5,far?'#596c43':'#9b9960');
      if(!far)line(c,[[footX,footY+.1],[footX+2.2,footY+.1]],'#a6a16b',.8);
    };
    for(let i=0;i<3;i++)leg(i,true);
    // Side abdomen remains visible beneath the wing-case rim. Broad plates
    // read at the normal 60px width; tiny noise is restricted to cached paint.
    oval(c,-7,3.8,17.4,7.4,'#30472f');oval(c,-7,3.2,16.5,6.7,light(['#3b5638','#73804b','#a8a465']));
    for(let i=0;i<5;i++){const x=-20+i*6.1;line(c,[[x,.7],[x-1,4.5],[x+.4,7.8]],'#334d337e',1.1);line(c,[[x+1,2],[x+.35,5.8]],'#c3b87958',.65);}
    const shell=()=>{c.beginPath();c.moveTo(-25,1.6);c.bezierCurveTo(-27,-6.5,-21,-15.5,-10,-17);c.bezierCurveTo(1,-19,10,-11.4,11,-3.3);c.quadraticCurveTo(5,3.2,-9,3.4);c.quadraticCurveTo(-19,3.5,-25,1.6);c.closePath();};
    shell();c.fillStyle=light(['#74613b','#ab8d4f','#d6bc78']);c.fill();c.strokeStyle='#394b33';c.lineWidth=1.4;c.stroke();
    c.save();shell();c.clip();
    // A single near wing case, not a top-view pair split down the centre.
    c.fillStyle='#534e2c44';c.beginPath();c.moveTo(-26,-2);c.quadraticCurveTo(-7,3,12,-7);c.lineTo(13,7);c.lineTo(-27,8);c.closePath();c.fill();
    for(let i=0;i<4;i++){const x=-20+i*7;c.strokeStyle=i%2?'#f0d89438':'#64593342';c.lineWidth=.9;c.beginPath();c.moveTo(x,-12+Math.abs(i-1)*1.8);c.quadraticCurveTo(x+5,-6,x+3,.9);c.stroke();}
    for(let i=0;i<27;i++){const x=-23+hash(i,12)*30,y=-15+hash(i,29)*16;line(c,[[x,y],[x+.8,y+.4]],i%3?'#514b2e32':'#f3e4b34b',.6);}
    const hx=-7+flip*7;
    oval(c,hx,-12.1,6.3,2.1,'#fff0b85c',-.2*flip);oval(c,hx+flip*2,-12.7,2.3,.7,'#fff2cd75',-.2*flip);
    c.restore();line(c,[[-24,1.1],[-14,3],[-2,2.5],[8,-1]],'#d3b979',1.15);
    // Overlapping thorax and forward head break the turtle-like shell outline.
    oval(c,8,-2.7,6.9,7.5,'#344931');oval(c,8.4,-3.2,6.15,6.75,light(['#4b613d','#829451','#b6ba75']));
    line(c,[[5,-8],[5.2,-3],[7,1.8]],'#d0c98775',.8);
    // The far feeler is subdued; the front feeler and eye are crisp profile
    // features. Both stay ahead of the head rather than fanning symmetrically.
    line(c,[[17,-3],[23,-10],[28,-11.5]],'#61764b',1.2);oval(c,28,-11.5,.8,.8,'#92a66d');
    c.fillStyle=light(['#435b38','#819153','#b5b66f']);c.strokeStyle='#334a31';c.lineWidth=1.1;c.beginPath();c.moveTo(11,-5);c.quadraticCurveTo(19,-8,22,-1);c.lineTo(23.5,3);c.quadraticCurveTo(22,7,16,6.1);c.quadraticCurveTo(10,4,11,-5);c.fill();c.stroke();
    poly(c,[[21.5,2.6],[27.8,3.5],[29,1],[28,6.3],[22,6]],light(['#7a744c','#b8a974','#e4cc94']),'#3a4d34',.75);
    poly(c,[[21,5],[26.5,6.4],[28.3,5.1],[26.5,8.2],[21,7]],'#a19963','#3a4d34',.65);
    line(c,[[19,-2],[24.5,-6],[29.4,-5.2]],'#3e5637',1.8);line(c,[[19.2,-2.3],[24.6,-6.3],[29.4,-5.5]],'#b5b87b',.75);oval(c,29.4,-5.3,.85,.85,'#b4c082');
    oval(c,17,-1.5,2.5,2.55,'#334831');oval(c,17.2,-1.7,1.8,1.9,'#ddce90');oval(c,17.6,-1.6,.85,1.3,'#344331');oval(c,17.2+flip*.45,-2.3,.45,.55,'#fff2be');
    for(let i=0;i<3;i++)leg(i,false);
    c.restore();
  }
  _brute(c,p){
    for(const side of [-1,1]){const stride=p*side*1.5;poly(c,[[side*4,13],[side*13,11],[side*18,19+stride],[side*11,23],[side*2,22]],grad(c,-17,23,17,11,['#494d34','#767a48','#aaa773']),'#354630',1.1);line(c,[[side*7,20+stride],[side*12,20+stride]],'#c0b48766',.9);}
    c.fillStyle=grad(c,-19,16,17,-7,['#8b8e63','#c3bf90','#e5d8aa']);c.strokeStyle='#586349';c.lineWidth=1.2;c.beginPath();c.moveTo(-15,-8);c.quadraticCurveTo(0,-11,15,-8);c.bezierCurveTo(12,0,15,9,18,15);c.quadraticCurveTo(1,21,-18,15);c.quadraticCurveTo(-13,5,-15,-8);c.fill();c.stroke();
    for(let i=0;i<10;i++){const x=-13+i*2.7;line(c,[[x,-2],[x*.83,5],[x*1.15,15]],i%3?'#666f4937':'#f6e4b63f',.75);}
    const cap=()=>{c.beginPath();c.moveTo(-30,-7);c.bezierCurveTo(-31,-17,-17,-30,0,-29);c.bezierCurveTo(17,-31,30,-19,30,-8);c.quadraticCurveTo(19,2,0,1);c.quadraticCurveTo(-20,1,-30,-7);c.closePath();};
    cap();c.fillStyle=grad(c,-25,-1,22,-29,['#7c5442','#ad7952','#d6a46e']);c.fill();c.strokeStyle='#5d513a';c.lineWidth=1.3;c.stroke();
    c.save();cap();c.clip();for(let i=0;i<48;i++){const x=-27+hash(i,90)*54,y=-27+hash(i,55)*29;oval(c,x,y,.7+hash(i,34)*1.5,.4+hash(i,41)*.8,i%3?'#533c3424':'#f2d39a3b');}for(const [x,y,rx,ry] of [[-16,-14,6,3],[-3,-23,5,3],[16,-16,7,4],[-22,-6,3,1.8],[4,-8,4,2]]){oval(c,x-.7,y+.8,rx+1,ry+1,'#765c4638');oval(c,x,y,rx,ry,'#ecd2a0b8');line(c,[[x-rx*.4,y-ry*.35],[x+rx*.4,y-ry*.35]],'#fff0c675',.7);}c.restore();
    c.fillStyle='#514c364d';c.beginPath();c.moveTo(-29,-6);c.quadraticCurveTo(0,5,29,-6);c.quadraticCurveTo(10,5,-13,1);c.fill();line(c,[[-20,-1],[-10,1],[1,2],[15,0],[25,-3]],'#e0bc8880',1);for(const x of [-6,6]){oval(c,x,6,2.1,3,'#394735');oval(c,x+.6,5.1,.6,.8,'#e4ddb0');}c.strokeStyle='#69714c';c.lineWidth=1.1;c.beginPath();c.moveTo(-3,12);c.quadraticCurveTo(0,13,3,11.5);c.stroke();
  }
  _boar(c,p,flip){c.save();c.scale(flip,1);
    // Gradients reverse with the sprite so the world light remains upper-right.
    const fur=grad(c,-23*flip,15,23*flip,-23,['#575c43','#8f8460','#b4a276']);
    line(c,[[-23,-4],[-29,-8],[-31,-6],[-30,-3]],'#586244',2);for(const side of [-1,1]){const x=side<0?-13:12,step=p*side*1.8;poly(c,[[x-3,5],[x+4,5],[x+3+step,16],[x+5+step,18],[x-4+step,19],[x-4,15]],'#47503b','#303e30',.7);line(c,[[x+2,10],[x+1+step,16]],'#9c957164',1.1);}
    c.fillStyle=fur;c.strokeStyle='#384931';c.lineWidth=1.3;c.beginPath();c.moveTo(-26,-1);c.bezierCurveTo(-27,-13,-14,-20,3,-17);c.bezierCurveTo(17,-17,24,-6,22,4);c.quadraticCurveTo(15,13,-3,12);c.bezierCurveTo(-16,14,-26,10,-26,-1);c.fill();c.stroke();
    poly(c,[[-22,-10],[-18,-20],[-14,-17],[-11,-26],[-7,-20],[-3,-26],[1,-17],[6,-23],[10,-14],[14,-17],[16,-8]],grad(c,-14*flip,-6,12*flip,-26,['#444d37','#6a7150','#9e9b65']),'#364630',.8);
    for(let i=0;i<39;i++){const x=-22+hash(i,17)*43,y=-11+hash(i,25)*20;line(c,[[x,y],[x+1.4,y+2.3]],(x*flip>0&&i%3===0)?'#d7c59077':'#4f593a50',.65);}
    poly(c,[[13,-8],[12,-19],[17,-18],[22,-10]],'#736c50','#384a33',.9);poly(c,[[15,-16],[18,-14],[19,-10]],'#a79173');
    c.fillStyle=grad(c,7*flip,11,30*flip,-12,['#766e50','#a4936d','#c8b08a']);c.beginPath();c.moveTo(12,-11);c.quadraticCurveTo(24,-13,29,-3);c.lineTo(33,0);c.quadraticCurveTo(37,8,30,9);c.lineTo(21,10);c.quadraticCurveTo(10,10,10,0);c.closePath();c.fill();c.strokeStyle='#465039';c.lineWidth=1;c.stroke();
    oval(c,29,3,6.3,5.1,'#b29875');line(c,[[27,-.7],[31,-.3],[33,1]],'#dfc49b99',1);for(const [x,y] of [[29,2],[32,4]])oval(c,x,y,1,1.4,'#574d3a');
    c.fillStyle='#e3dec1';c.strokeStyle='#6b7150';c.lineWidth=.7;c.beginPath();c.moveTo(20,7);c.quadraticCurveTo(29,13,29,-3);c.quadraticCurveTo(26,4,21,3);c.closePath();c.fill();c.stroke();line(c,[[23,8],[27,6],[28,1]],'#fff4d9',.8);oval(c,18,-5,2,2,'#eee1b2');oval(c,18.3,-5,.8,1.2,'#383d2f');line(c,[[15,-8],[20,-7]],'#514f37',1.1);c.restore();
  }
  _spore(c,p){
    for(const x of [-9,0,9]){const step=p*(x===0?-1:1);poly(c,[[x-2,5],[x+3,5],[x*1.35+2+step,15],[x*1.35+step,18],[x*1.35-3+step,17],[x-3,10]],'#58715a','#354f41',.8);line(c,[[x,9],[x*1.35+step,15]],'#9ba888',.8);}
    oval(c,0,2,14,15,grad(c,-14,16,12,-11,['#55745e','#889c7c','#bac6a0']));for(let i=0;i<7;i++){const x=-10+i*3.2;line(c,[[x,-1],[x*.86,7],[x*1.12,13]],i%2?'#48695165':'#d2d8b14d',.8);}
    const cap=()=>{c.beginPath();c.moveTo(-24,-7);c.bezierCurveTo(-25,-18,-14,-31,1,-31);c.bezierCurveTo(17,-32,27,-19,24,-8);c.quadraticCurveTo(0,2,-24,-7);c.closePath();};
    cap();c.fillStyle=grad(c,-19,-3,19,-31,['#635773','#9778a1','#c2a3c1']);c.fill();c.strokeStyle='#454959';c.lineWidth=1.4;c.stroke();c.save();cap();c.clip();for(let i=0;i<37;i++){const x=-22+hash(i,111)*45,y=-29+hash(i,115)*23;oval(c,x,y,.5+hash(i,58)*1.1,.4+hash(i,61)*.8,i%3?'#372e4a26':'#f9d3ee44');}for(const [x,y,s]of[[-11,-17,4.8],[9,-23,4],[17,-11,2.7],[-2,-8,2.2]]){oval(c,x-.4,y+.7,s+1,s*.75+1,'#5742654b');oval(c,x,y,s,s*.72,'#d9b1d3');oval(c,x+1,y-.7,s*.55,s*.29,'#f2d2e475');}c.restore();
    c.fillStyle='#4b485c';c.beginPath();c.moveTo(-22,-7);c.quadraticCurveTo(0,1,23,-8);c.quadraticCurveTo(6,4,-11,0);c.closePath();c.fill();for(let i=-3;i<=3;i++)line(c,[[i*5.8,-5+Math.abs(i)*-.3],[i*4.6,-1]],'#c2a2c16a',.8);line(c,[[-19,-5],[-7,-2],[6,-2],[20,-6]],'#d3aec58c',1);
    for(const x of [-5,5]){oval(c,x,5,1.8,2.4,'#273e33');oval(c,x+.5,4.2,.55,.7,'#d3dbb0');}oval(c,0,10,2.6,1.5,'#456149');
  }
  _ancient(c,p){
    // Root feet and jointed bark limbs retain the original 60 x 68 envelope.
    for(const side of [-1,1]){c.save();c.scale(side,1);const a=p*1.2;poly(c,[[11,23],[24,20],[30,34],[31,39],[17,42],[4,39],[8,34]],grad(c,-30*side,42,25*side,22,['#48503a','#736746','#a29561']),'#34452e',1.2);for(let i=0;i<3;i++)line(c,[[12+i*4,30],[11+i*6,39]],'#404d3485',1);poly(c,[[25,-9],[37,-5],[48,17+a],[50,23+a],[55,30+a],[51,37],[43,34],[38,24],[29,19]],grad(c,-45*side,32,49*side,-10,['#4a4f36','#7e7048','#ac9560']),'#33462f',1.5);line(c,[[34,-3],[39,12],[46,23+a],[46,32]],'#c4aa736e',1.4);line(c,[[31,4],[35,16],[41,23]],'#374630ad',1.2);poly(c,[[44,25],[50,27],[53,35],[50,37],[47,32]],'#5c6541');line(c,[[50,28],[51,32]],'#b6a371',1);c.restore();}
    for(const side of [-1,1]){c.save();c.scale(side,1);const antler=[[16,-22],[21,-36],[26,-47],[23,-60],[25,-63],[29,-50],[37,-53],[42,-59],[45,-58],[40,-50],[30,-44],[25,-32],[22,-19]];poly(c,antler,grad(c,18*side,-21,39*side,-62,['#665c3d','#938354','#c3af78']),'#3b4d33',1.1);poly(c,[[23,-40],[17,-49],[16,-56],[19,-54],[21,-47],[26,-44]],'#9a8657','#415035',.8);line(c,[[23,-29],[28,-46],[26,-56]],'#dcc38a74',1.1);leaf(c,37,-52,7,2,-.9,'#83945a');leaf(c,22,-46,6,2,.7,'#6c8950');c.restore();}
    const body=()=>{c.beginPath();c.moveTo(-31,-24);c.lineTo(-20,-32);c.quadraticCurveTo(0,-38,22,-31);c.lineTo(30,-25);c.lineTo(34,-4);c.lineTo(32,8);c.lineTo(36,25);c.quadraticCurveTo(15,39,0,38);c.quadraticCurveTo(-23,36,-35,24);c.lineTo(-30,8);c.lineTo(-34,-5);c.closePath();};
    body();c.fillStyle=grad(c,-31,28,31,-34,['#41553a','#758451','#b1ad6c']);c.fill();c.strokeStyle='#2e482f';c.lineWidth=2.1;c.stroke();c.save();body();c.clip();
    for(let i=0;i<12;i++){const x=-30+i*5.4;poly(c,[[x,-34],[x+5,-30],[x+3,-16],[x+6,-5],[x+2,11],[x+6,33],[x+1,36],[x-2,14],[x+1,-2],[x-3,-16]],i%3?'#39503845':'#c5b47b3d');line(c,[[x,-29],[x+1,-17],[x-1,-4],[x+2,13],[x+1,28]],i%2?'#314b3488':'#c6b37a70',1.1);}
    for(let i=0;i<110;i++){const x=-30+hash(i,194)*60,y=-32+hash(i,222)*65;line(c,[[x,y],[x+hash(i,13)*1.7,y+1+hash(i,193)*2]],i%3?'#233d292b':'#d5c8923e',.7);}
    for(const [x,y]of[[-25,12],[22,19],[-18,-17]]){c.strokeStyle='#314b3470';c.lineWidth=1.4;c.beginPath();c.ellipse(x,y,2,5,.15,0,TAU);c.stroke();line(c,[[x+1,y-3],[x+2,y],[x+1,y+3]],'#bca97366',.75);}c.restore();
    // A jagged moss mantle, not circles stacked around the head.
    for(let i=0;i<26;i++){const x=-30+hash(i,84)*58,y=-31+hash(i,11)*14;leaf(c,x,y,6+hash(i,42)*10,2+hash(i,21)*3,-1+hash(i,44)*2,['#4f7541','#799450','#9dac66','#bbc082','#6b8a4b'][i%5]);}for(const x of [-27,25])line(c,[[x,-17],[x-2,-10],[x,-5]],'#517547',2.6);
    poly(c,[[-23,-11],[-14,-10],[-6,-6],[-9,2],[-22,-1]],'#263b2b');poly(c,[[23,-11],[14,-10],[6,-6],[9,2],[22,-1]],'#263b2b');line(c,[[-20,-4],[-11,-2]],'#eed692',2.5);line(c,[[11,-2],[20,-4]],'#f9dfa0',2.5);line(c,[[-20,-4],[-11,-2]],'#fff0c6',.7);line(c,[[11,-2],[20,-4]],'#fff1c5',.7);poly(c,[[-7,7],[0,4],[7,7],[5,13],[0,11],[-5,13]],'#3b5033');line(c,[[-13,16],[-7,14],[0,17],[8,14],[14,16]],'#364c32',1.5);
    poly(c,[[0,10],[10,20],[1,32],[-10,21]],'#475237','#293f2b',1);poly(c,[[0,13],[7.5,20],[0,29],[-7.5,21]],grad(c,-8,29,7,13,['#aa874c','#e2bc6c','#fff0b6']));poly(c,[[0,13],[1,21],[7.5,20]],'#fff5c6');poly(c,[[1,21],[0,29],[-7.5,21]],'#bd9654');
  }
  _bloom(c,p){
    for(const side of [-1,1]){c.save();c.scale(side,1);poly(c,[[11,23],[25,24],[31,34],[31,39],[19,41],[6,38]],grad(c,-30*side,40,29*side,24,['#405c4c','#6b8264','#a9ae83']),'#344e42',1.2);line(c,[[14,31],[13,38]],'#bcc2985c',1);line(c,[[23,32],[25,38]],'#bcc2985c',1);poly(c,[[24,-6],[33,-2],[43,13+p],[51,24+p],[50,33],[44,36],[38,28],[37,20],[27,13]],grad(c,-40*side,34,48*side,-5,['#496655','#7c9076','#b2bc96']),'#3b5145',1.3);line(c,[[31,3],[41,21+p],[46,29]],'#c5caa075',1.2);line(c,[[30,9],[37,21],[40,28]],'#3c5e4c7a',1);c.restore();}
    const body=()=>{c.beginPath();c.moveTo(-24,-15);c.quadraticCurveTo(0,-23,24,-15);c.bezierCurveTo(21,1,23,18,28,31);c.quadraticCurveTo(0,42,-29,31);c.bezierCurveTo(-23,15,-21,0,-24,-15);c.closePath();};
    body();c.fillStyle=grad(c,-26,30,24,-15,['#708970','#a8b58f','#d4d6ad']);c.fill();c.strokeStyle='#3b5847';c.lineWidth=1.7;c.stroke();c.save();body();c.clip();for(let i=0;i<11;i++){const x=-23+i*4.6;line(c,[[x,-15],[x*.83,0],[x*.91,12],[x*1.12,31]],i%3?'#53755b66':'#e1dfb96b',1.1);for(let j=0;j<3;j++)line(c,[[x,j*9],[x+1.5,j*9+4]],'#536f5040',.65);}c.restore();
    // Layered gills and an asymmetrical umbrella make the crowned boss read
    // immediately apart from the small mushroom enemies and the tree lord.
    const cap=()=>{c.beginPath();c.moveTo(-53,-18);c.bezierCurveTo(-55,-32,-38,-50,-17,-52);c.quadraticCurveTo(-2,-60,18,-50);c.bezierCurveTo(40,-48,52,-34,53,-19);c.quadraticCurveTo(44,-8,28,-7);c.quadraticCurveTo(12,-2,-5,-5);c.quadraticCurveTo(-30,-5,-53,-18);c.closePath();};
    cap();c.fillStyle=grad(c,-43,-6,42,-54,['#65536c','#95769a','#c9a5bb']);c.fill();c.strokeStyle='#444656';c.lineWidth=2;c.stroke();c.save();cap();c.clip();
    for(let i=0;i<130;i++){const x=-51+hash(i,367)*103,y=-55+hash(i,79)*47;oval(c,x,y,.45+hash(i,832)*1.2,.3+hash(i,921)*.6,i%3?'#3f35501f':'#f5d5e241');}
    for(const [x,y,rx,ry]of[[-34,-28,8,4],[-17,-43,7,4],[9,-39,10,5.5],[33,-29,6.5,4],[-7,-19,5,2.5],[22,-15,3.6,1.7]]){oval(c,x-.6,y+1.2,rx+1.3,ry+1.1,'#65466757');oval(c,x,y,rx,ry,'#dcb6ccc2');oval(c,x+1,y-.8,rx*.65,ry*.45,'#f3d2dd73');for(let i=0;i<3;i++)oval(c,x-rx*.4+i*rx*.45,y+ry*.2,.6,.45,'#ad819f77');}
    c.restore();c.fillStyle='#5c4961';c.beginPath();c.moveTo(-49,-17);c.quadraticCurveTo(0,-1,49,-18);c.quadraticCurveTo(34,-3,0,-3);c.quadraticCurveTo(-33,-6,-49,-17);c.fill();for(let i=-7;i<=7;i++){const x=i*6.2,y=-6-Math.abs(i)*1.25;line(c,[[x*.94,-14+Math.abs(i)*-.2],[x,y]],'#c6a4b986',.95);}line(c,[[-45,-14],[-24,-8],[1,-5],[28,-8],[46,-15]],'#e2c0cf8c',1.2);
    for(let i=-2;i<=2;i++){const x=i*15,y=-52+Math.abs(i)*4;line(c,[[x,y+4],[x-1,y-6]],'#536452',4);line(c,[[x+.5,y+4],[x+.4,y-6]],'#baa5b4',1.5);poly(c,[[x-5,y-7],[x-3,y-14],[x+1,y-16],[x+5,y-10],[x+4,y-5],[x,y-3]],grad(c,x-4,y-3,x+4,y-16,['#9271a0','#caabd1','#f1dae8']),'#665672',1);poly(c,[[x+1,y-15],[x+1,y-5],[x+4,y-9]],'#f7e3f078');}
    for(const x of [-9,9]){oval(c,x,10,3,4,'#304b3c');oval(c,x+.7,8.8,.9,1.3,'#dde4b6');}line(c,[[-13,6],[-5,8]],'#f0cf9b',2);line(c,[[5,8],[13,6]],'#ffe1af',2);poly(c,[[-9,22],[0,16],[9,23],[0,33]],'#66745c');poly(c,[[-6,24],[0,19],[6,24],[0,30]],grad(c,-5,29,5,20,['#9b6bab','#d6abe1','#f6d9ef']));line(c,[[-6,24],[0,24],[0,30]],'#9564a1',.8);line(c,[[0,19],[0,24],[6,24]],'#f7ddf0',.8);
  }
}
