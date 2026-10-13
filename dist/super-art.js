import { drawSwordFlight } from './sword-flight-art.js';
import { swordFormationAnchor } from './sword-flight.js';

// Super-skill artwork is presentation only. Simulation life supplies every phase;
// hit positions, footprints, and timings remain owned by SuperSkills.
const TAU=Math.PI*2;
const LIMIT=1024*1024;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const age=e=>clamp(1-e.life/e.maxLife);
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
function noise(seed,i){let n=Math.imul((seed|0)^0x4f1bbcdc,i+31);n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return((n^(n>>>16))>>>0)/4294967296;}
function polygon(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));ctx.closePath();ctx.fill();}
function line(ctx,x1,y1,x2,y2){ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);}
function ellipse(ctx,x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
function leaf(ctx,x,y,a,size,color){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(size*.2,-size*.72,size*1.5,0);ctx.quadraticCurveTo(size*.5,size*.55,0,0);ctx.fill();ctx.strokeStyle='#d4e8a980';ctx.lineWidth=.6;ctx.beginPath();line(ctx,1,0,size*1.1,-.1);ctx.stroke();ctx.restore();}
function shard(ctx,x,y,a,size,color){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=color;polygon(ctx,[[-size*.55,-size*.5],[size*.55,-size*.35],[size*.4,size*.5],[-size*.7,size*.2]]);ctx.fillStyle='#fff2d840';polygon(ctx,[[-size*.55,-size*.5],[size*.55,-size*.35],[-size*.2,0]]);ctx.restore();}
function glyph(ctx,x,y,a,size,index,color){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.strokeStyle=color;ctx.lineWidth=1.05;ctx.beginPath();if(index%3===0){line(ctx,-size,-size,size,size);line(ctx,size,-size,-size,size);line(ctx,0,-size*1.5,0,size*1.5);}else if(index%3===1){ctx.moveTo(0,-size*1.4);ctx.lineTo(size,0);ctx.lineTo(0,size*1.4);ctx.lineTo(-size,0);ctx.closePath();line(ctx,-size*1.5,0,size*1.5,0);}else{line(ctx,-size,-size,-size,size);line(ctx,size,-size,size,size);line(ctx,-size,-size,size,0);line(ctx,-size,size,size,0);}ctx.stroke();ctx.restore();}

export class SuperArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;this.geometry=new WeakMap();this.geometryBuilds=0;}
  get cacheStats(){return{entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:LIMIT*4,builds:this.builds,geometryBuilds:this.geometryBuilds};}
  get diagnostics(){return this.cacheStats;}
  _sprite(key,w,h,paint){
    if(this.cache.has(key)){const value=this.cache.get(key);this.cache.delete(key);this.cache.set(key,value);return value;}
    while(this.pixels+w*h>LIMIT&&this.cache.size){const first=this.cache.keys().next().value,item=this.cache.get(first);this.pixels-=item.width*item.height;this.cache.delete(first);}
    const canvas=this.makeCanvas();canvas.width=w;canvas.height=h;paint(canvas.getContext('2d'));this.cache.set(key,canvas);this.pixels+=w*h;this.builds++;return canvas;
  }
  _glow(color){return this._sprite(`glow:${color}`,128,128,ctx=>{const g=ctx.createRadialGradient(64,64,0,64,64,63);g.addColorStop(0,color);g.addColorStop(.3,`${color}8c`);g.addColorStop(1,`${color}00`);ctx.fillStyle=g;ctx.fillRect(0,0,128,128);});}
  _mist(variant){return this._sprite(`mist:${variant}`,160,112,ctx=>{
    for(let i=0;i<18;i++){const a=noise(variant+47,i)*TAU,r=noise(variant+23,i+40)*35,x=80+Math.cos(a)*r,y=58+Math.sin(a)*r*.63,s=19+noise(variant,i+90)*23;const g=ctx.createRadialGradient(x,y,0,x,y,s);g.addColorStop(0,variant?'#d7bee28a':'#ab88c178');g.addColorStop(.45,variant?'#bfa0d347':'#9875b249');g.addColorStop(1,'#bda0d000');ctx.fillStyle=g;ctx.fillRect(x-s,y-s,s*2,s*2);}
    ctx.globalCompositeOperation='source-atop';ctx.strokeStyle='#f0d8f038';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(27,61);ctx.bezierCurveTo(49,44,65,62,92,39);ctx.bezierCurveTo(109,29,125,41,134,51);ctx.moveTo(49,84);ctx.bezierCurveTo(69,58,98,77,116,58);ctx.stroke();ctx.fillStyle='#f1dfff18';for(let i=0;i<40;i++){const x=24+noise(variant,i+101)*112,y=18+noise(variant,i+170)*77;ellipse(ctx,x,y,1.2+noise(variant,i+240)*2.4,.6+noise(variant,i+320),ctx.fillStyle);}
  });}
  _dust(){return this._sprite('meteor-dust',160,112,ctx=>{
    for(let i=0;i<12;i++){const a=i*2.4,r=noise(78,i)*32,x=80+Math.cos(a)*r,y=58+Math.sin(a)*r*.65,s=17+noise(44,i)*20;const g=ctx.createRadialGradient(x,y,0,x,y,s);g.addColorStop(0,'#dab99258');g.addColorStop(.5,'#ac8b7144');g.addColorStop(1,'#ac8b7100');ctx.fillStyle=g;ctx.fillRect(x-s,y-s,s*2,s*2);}
  });}
  _thorns(variant,raised=false){return this._sprite(`thorns:${variant}:${raised?1:0}`,256,256,ctx=>{
    ctx.translate(128,128);ctx.lineCap='round';ctx.lineJoin='round';
    // Disconnected root clusters leave open ground between them. Their woody
    // bodies and foliage are cached separately so emergence never redraws paths.
    const clusters=[[-59,25,-.48],[39,47,-2.38],[-12,-54,.92],[62,-20,2.72],[-58,-36,.24]];
    for(let j=0;j<clusters.length;j++){
      const [bx,by,a]=clusters[j],x=bx+(noise(variant,j)-.5)*11,y=by+(noise(variant,j+12)-.5)*10;
      ctx.save();ctx.translate(x,y);
      if(!raised){
        ellipse(ctx,1,3,13+j%3,5,'#172b2363');
        ctx.strokeStyle='#253326c7';ctx.lineWidth=2.6;ctx.beginPath();
        ctx.moveTo(-16,5);ctx.lineTo(-8,1);ctx.lineTo(-3,3);ctx.lineTo(5,-2);ctx.lineTo(17,-4);ctx.moveTo(-4,3);ctx.lineTo(-2,11);ctx.lineTo(5,14);ctx.stroke();
        ctx.strokeStyle='#a3a07466';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-14,6);ctx.lineTo(-7,3);ctx.lineTo(-3,5);ctx.moveTo(7,0);ctx.lineTo(15,-2);ctx.stroke();
        ctx.rotate(a);
        for(let k=0;k<3;k++){
          const side=k===1?-1:1,end=30+noise(variant+j,k+20)*22,ey=(k-1)*16;
          ctx.beginPath();ctx.moveTo(-4,3);ctx.bezierCurveTo(7,side*(14+k*3),end*.48,ey-side*15,end,ey);
          ctx.strokeStyle='#293c2e';ctx.lineWidth=7-k*1.3;ctx.stroke();ctx.strokeStyle=k%2?'#687d45':'#79864b';ctx.lineWidth=4.5-k*.9;ctx.stroke();ctx.strokeStyle='#b9bd7a';ctx.lineWidth=1;ctx.stroke();
          ctx.beginPath();ctx.moveTo(end*.58,ey*.55);ctx.quadraticCurveTo(end*.72,ey+side*9,end*.91,ey+side*15);ctx.strokeStyle='#526d42';ctx.lineWidth=1.6;ctx.stroke();
          if(k!==1){leaf(ctx,end*.58,ey*.6,k?-.5:.8,6,k?'#829b53':'#5f8748');leaf(ctx,end*.8,ey,k?-1.8:1.8,4.6,'#9bb46b');}
        }
      }else{
        const side=j%2?1:-1,h=20+noise(variant,j+41)*13;
        ctx.fillStyle='#253b2c';ctx.beginPath();ctx.moveTo(-8,5);ctx.bezierCurveTo(-3,-4,-8,-h*.54,side*8,-h);ctx.bezierCurveTo(side*1,-h*.47,9,-5,7,5);ctx.closePath();ctx.fill();
        ctx.fillStyle='#71844b';ctx.beginPath();ctx.moveTo(-3,3);ctx.bezierCurveTo(-1,-8,-5,-h*.5,side*8,-h);ctx.bezierCurveTo(side*1,-h*.49,3,-7,3,3);ctx.closePath();ctx.fill();
        ctx.strokeStyle='#b8bf79';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-2,-2);ctx.quadraticCurveTo(-3,-h*.47,side*6,-h*.86);ctx.stroke();
        ctx.fillStyle='#d6d49b';polygon(ctx,[[side*2,-h*.51],[side*8,-h],[side*5,-h*.52]]);
        leaf(ctx,-1,-h*.35,side>0?2.95:.15,8.5,'#648947');leaf(ctx,side*2,-h*.58,side>0?-.32:Math.PI+.32,7,'#9bb968');
        // One small hooked side thorn, instead of a field of identical spikes.
        ctx.fillStyle='#91a35d';polygon(ctx,[[side*3,-7],[side*12,-14],[side*7,-5]]);
      }
      ctx.restore();
    }
  });}
  _vortexRibbon(layer){return this._sprite(`vortex-ribbon:${layer}`,256,256,ctx=>{
    ctx.translate(128,128);ctx.lineJoin='round';ctx.lineCap='round';
    for(let arm=0;arm<2;arm++){
      const a0=arm*Math.PI+layer*.58,points=[],inner=[];
      for(let j=0;j<=32;j++){
        const u=j/32,a=a0+u*4.35,shape=Math.sin(Math.PI*u),rr=116-u*91+Math.sin(u*9+arm)*shape*3,w=shape**.8*(.43+layer*.045)+.025,innerR=rr+shape*(9+layer*2);
        points.push([Math.cos(a)*rr,Math.sin(a)*rr]);inner.push([Math.cos(a+w)*innerR,Math.sin(a+w)*innerR]);
      }
      const band=ctx.createLinearGradient(-90,-105,85,97);band.addColorStop(0,layer?'#a9c7e5e6':'#d1c2f4f2');band.addColorStop(.42,layer?'#7f93c8db':'#a294d4eb');band.addColorStop(.73,layer?'#4a609ca6':'#63539cb5');band.addColorStop(1,'#bfc0e8df');
      const outline=[...points,...inner.reverse()];ctx.save();ctx.translate(1.5,3);ctx.fillStyle='#2a26416b';polygon(ctx,outline);ctx.restore();ctx.fillStyle=band;polygon(ctx,outline);
      ctx.strokeStyle=layer?'#bed6ecad':'#eee4ffc9';ctx.lineWidth=layer?.9:1.5;ctx.beginPath();points.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));ctx.stroke();
      ctx.strokeStyle='#3429527a';ctx.lineWidth=2.4;ctx.beginPath();inner.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));ctx.stroke();
      ctx.strokeStyle='#f0e7ff8c';ctx.lineWidth=.8;ctx.beginPath();for(let j=8;j<20;j++){const [x,y]=points[j];ctx[j===8?'moveTo':'lineTo'](x*.975,y*.975);}ctx.stroke();
    }
  });}
  _vortexCore(){return this._sprite('vortex-core',128,128,ctx=>{
    ctx.translate(64,64);const core=ctx.createRadialGradient(-3,-4,2,0,0,49);core.addColorStop(0,'#2d294dd9');core.addColorStop(.32,'#363054c2');core.addColorStop(.65,'#71639c68');core.addColorStop(1,'#9482ca00');ctx.fillStyle=core;ctx.fillRect(-64,-64,128,128);
    ctx.strokeStyle='#afa2ddb3';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(-22,5);ctx.bezierCurveTo(-30,-20,17,-28,24,-6);ctx.stroke();ctx.strokeStyle='#dfd9f7c7';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(-18,-7);ctx.bezierCurveTo(-8,-19,10,-19,18,-10);ctx.stroke();
    ctx.fillStyle='#e0d8f3';polygon(ctx,[[-7,0],[-1,-2],[1,-9],[3,-1],[8,1],[2,3],[0,8],[-2,2]]);
  });}
  _runicArrow(){return this._sprite('runic-heavy-arrow',144,56,ctx=>{
    ctx.translate(111,28);ctx.lineJoin='round';
    ctx.fillStyle='#2b6769';polygon(ctx,[[-84,-3],[-30,-4],[-25,-15],[15,0],[-25,15],[-30,4],[-84,3]]);
    ctx.fillStyle='#80d9c7';polygon(ctx,[[-28,-12],[15,0],[-23,-1],[-34,-5]]);ctx.fillStyle='#d7fff0';polygon(ctx,[[-28,-12],[15,0],[-22,-4]]);ctx.fillStyle='#579f9b';polygon(ctx,[[-23,1],[15,0],[-28,12],[-34,5]]);ctx.fillStyle='#b4ead5';polygon(ctx,[[-23,1],[15,0],[-28,12],[-22,5]]);
    ctx.strokeStyle='#d5f7d9';ctx.lineWidth=2;ctx.beginPath();line(ctx,-82,0,-17,0);ctx.stroke();ctx.strokeStyle='#55a7a1';ctx.lineWidth=1;ctx.beginPath();line(ctx,-75,2,-32,2);ctx.stroke();
    ctx.fillStyle='#b0e2c9';polygon(ctx,[[-78,-1],[-99,-12],[-90,-1],[-101,-5],[-92,0],[-99,11],[-78,1]]);ctx.fillStyle='#477d75';polygon(ctx,[[-78,1],[-92,0],[-99,11],[-87,5]]);
    glyph(ctx,-42,0,0,3.2,1,'#e2fff2');glyph(ctx,-58,0,0,2.5,2,'#a9eddb');
  });}
  _rock(){return this._sprite('meteor-rock',88,100,ctx=>{
    ctx.translate(44,51);ctx.fillStyle='#483743';polygon(ctx,[[-21,-15],[-7,-29],[12,-28],[28,-8],[24,15],[4,30],[-18,20],[-29,1]]);
    ctx.fillStyle='#8f554c';polygon(ctx,[[-21,-15],[-7,-29],[12,-28],[1,-6],[-29,1]]);ctx.fillStyle='#b46b4c';polygon(ctx,[[12,-28],[28,-8],[24,15],[1,-6]]);ctx.fillStyle='#594149';polygon(ctx,[[-29,1],[1,-6],[4,30],[-18,20]]);
    ctx.strokeStyle='#f3a36a';ctx.lineJoin='round';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(-7,-29);ctx.lineTo(-4,-12);ctx.lineTo(6,-3);ctx.lineTo(1,11);ctx.lineTo(4,30);ctx.moveTo(6,-3);ctx.lineTo(20,-7);ctx.lineTo(28,-8);ctx.moveTo(1,11);ctx.lineTo(-13,10);ctx.lineTo(-18,20);ctx.stroke();ctx.strokeStyle='#ffe2a4';ctx.lineWidth=.8;ctx.stroke();
    ctx.fillStyle='#e9a77a';polygon(ctx,[[-21,-15],[-7,-29],[-10,-19],[-17,-12]]);ellipse(ctx,15,6,4,2.7,'#382e3c');ellipse(ctx,-12,-7,3,2,'#593849');
  });}
  _sword(){return this._sprite('royal-sword',112,48,ctx=>{
    ctx.translate(41,24);ctx.lineJoin='round';ctx.fillStyle='#798a9460';polygon(ctx,[[-10,-5],[32,-7],[64,0],[32,7],[-10,5]]);ctx.fillStyle='#c4c5aa';polygon(ctx,[[-7,-4],[30,-4.5],[57,0],[30,4.5],[-7,4]]);ctx.fillStyle='#fff4cc';polygon(ctx,[[-7,-4],[30,-4.5],[57,0],[-7,0]]);ctx.fillStyle='#d9e9d9';polygon(ctx,[[-7,0],[57,0],[30,4.5],[-7,4]]);ctx.strokeStyle='#fff9e3';ctx.lineWidth=.8;ctx.beginPath();line(ctx,-3,0,50,0);ctx.stroke();
    ctx.fillStyle='#9e8754';polygon(ctx,[[-13,-3],[-20,-11],[-12,-9],[-7,-5],[-7,5],[-12,9],[-20,11],[-13,3]]);ctx.fillStyle='#f0d78f';polygon(ctx,[[-16,-8],[-12,-9],[-7,-5],[-7,5],[-12,9],[-16,8],[-10,3],[-10,-3]]);ctx.fillStyle='#6c706b';polygon(ctx,[[-28,-2],[-13,-2],[-13,2],[-28,2]]);ctx.strokeStyle='#d6bc75';ctx.lineWidth=1;ctx.beginPath();for(let x=-27;x<-14;x+=3)line(ctx,x,-2,x+1.5,2);ctx.stroke();ctx.fillStyle='#e8d09a';polygon(ctx,[[-35,0],[-30,-5],[-26,0],[-30,5]]);ellipse(ctx,-10,0,2.8,3.2,'#e1ffff');
    ctx.strokeStyle='#e3db9a';ctx.lineWidth=.7;ctx.beginPath();line(ctx,1,-2,5,0);line(ctx,5,0,1,2);line(ctx,8,-2,12,0);line(ctx,12,0,8,2);ctx.stroke();
  });}
  _data(e){
    if(this.geometry.has(e))return this.geometry.get(e);
    const seed=Number(e.seed)||Number(e.id)||Math.round(e.x*17+e.y*31),particles=[];
    for(let i=0;i<20;i++)particles.push({a:i*2.399+noise(seed,i)*.6,r:.18+noise(seed,i+30)*.72,size:2+noise(seed,i+60)*4,lift:11+noise(seed,i+90)*23,phase:noise(seed,i+120)*TAU});
    const data={seed,particles};this.geometry.set(e,data);this.geometryBuilds++;return data;
  }

  drawField(ctx,field,{reduced=false,dense=false}={}){
    if(!field||field.life<=0||!Number.isFinite(field.r)||field.r<=0)return false;
    const {kind,x,y,r}=field,t=age(field),elapsed=field.maxLife-field.life,data=this._data(field),fade=kind==='meteor'?1:clamp(field.life/.4);
    ctx.save();ctx.translate(x,y);ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=fade;ctx.shadowBlur=0;
    if(kind==='thorns'){
      const variant=Math.abs(data.seed)%3,emerge=reduced?1:smooth(elapsed/.24),tick=Math.max(.2,field.interval||.75),strike=reduced?0:Math.max(0,1-(elapsed%tick)/.15),size=r*1.16;
      ctx.globalAlpha=fade*.1;ctx.drawImage(this._glow('#a9d888'),-r,-r,r*2,r*2);
      ctx.globalAlpha=fade*(.65+.35*emerge);ctx.drawImage(this._thorns(variant),-size,-size,size*2,size*2);
      const growth=.88+emerge*.12+strike*.016;
      ctx.globalAlpha=fade;ctx.drawImage(this._thorns(variant,true),-size*growth,-size*growth,size*2*growth,size*2*growth);
    }else if(kind==='miasma'){
      // A hard game radius remains readable while the interior consists of soft,
      // mottled clouds. The foliage and enemies above it are never obscured.
      ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();ctx.globalAlpha=fade*.25;ctx.drawImage(this._glow('#ad83cd'),-r,-r,r*2,r*2);
      for(let i=0;i<(dense?5:8);i++){const p=data.particles[i],a=p.a+(reduced?0:elapsed*.09),rr=p.r*r*.64,xx=Math.cos(a)*rr,yy=Math.sin(a)*rr*.82,size=r*(.75+p.r*.25);ctx.globalAlpha=fade*(.45+Math.sin(p.phase+(reduced?0:elapsed*.45))*.08);ctx.drawImage(this._mist(i%2),xx-size*.65,yy-size*.42,size*1.3,size*.85);}
      ctx.restore();ctx.globalAlpha=fade*.7;ctx.strokeStyle='#d0addd';ctx.lineWidth=1.2;ctx.beginPath();for(let i=0;i<12;i++){const a=i*TAU/12;ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.arc(0,0,r,a,a+.08);}ctx.stroke();
      if(!dense){ctx.globalAlpha=fade*.5;for(let i=0;i<8;i++){const p=data.particles[i],xx=Math.cos(p.a)*r*p.r,yy=Math.sin(p.a)*r*p.r-(reduced?0:Math.sin(elapsed*.6+p.phase)*3);ellipse(ctx,xx,yy,1.4,1.1,'#eed3ef');}}
    }else if(kind==='meteor')this._meteorWarning(ctx,field,t,reduced,dense);
    else if(kind==='vortex')this._vortex(ctx,field,elapsed,data,reduced,dense,fade);
    else{ctx.restore();return false;}
    ctx.restore();return true;
  }
  _meteorWarning(ctx,f,t,reduced,dense){
    const r=f.r;ctx.globalAlpha=.12;ctx.drawImage(this._glow('#f1bc79'),-r,-r,r*2,r*2);ctx.globalAlpha=.72;ctx.strokeStyle='#e7bc76';ctx.lineWidth=1.15;
    ctx.beginPath();for(let i=0;i<16;i++){const a=i*TAU/16+.025;ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.arc(0,0,r,a,a+.16);}ctx.stroke();
    // Countdown uses the real impact boundary. Gold and an inward star separate
    // this friendly meteor warning from the red/purple enemy danger marks.
    ctx.strokeStyle='#ffdda0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r,-Math.PI/2,-Math.PI/2+TAU*t);ctx.stroke();
    ctx.globalAlpha=.35+t*.5;for(let i=0;i<4;i++){const a=i*Math.PI/2,rr=r*.71;glyph(ctx,Math.cos(a)*rr,Math.sin(a)*rr,a,4,i,'#edd4a3');}
    ctx.globalAlpha=.65;ctx.strokeStyle='#f7d693';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<8;i++){const a=i*TAU/8,rr=i%2?7:20;ctx[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.stroke();
    if(!reduced&&!dense){ctx.globalAlpha=.4;for(let i=0;i<6;i++){const a=i*TAU/6+.4,rr=r*(.25+.4*(1-t));shard(ctx,Math.cos(a)*rr,Math.sin(a)*rr,a,2,'#f4c780');}}
  }
  _vortex(ctx,f,elapsed,data,reduced,dense,fade){
    const r=f.r,phase=reduced?0:elapsed*.72;
    ctx.globalAlpha=fade*.1;ctx.drawImage(this._glow('#a896eb'),-r,-r,r*2,r*2);
    // Spiral geometry and its bevels are fixed cached images. A field only
    // rotates two layers and a handful of inward-moving fragments each frame.
    ctx.save();ctx.rotate(phase);ctx.globalAlpha=fade*.82;ctx.drawImage(this._vortexRibbon(0),-r,-r,r*2,r*2);ctx.rotate(-phase*.26+1.1);ctx.globalAlpha=fade*(dense?.5:.6);ctx.drawImage(this._vortexRibbon(1),-r*.82,-r*.82,r*1.64,r*1.64);ctx.restore();
    ctx.save();ctx.rotate(-phase*.4);ctx.globalAlpha=fade*.8;ctx.drawImage(this._vortexCore(),-r*.38,-r*.38,r*.76,r*.76);ctx.restore();
    for(let i=0;i<(dense?3:6);i++){
      const p=data.particles[i],travel=reduced?p.r:(p.r+elapsed*.39)%1,a=p.a+(reduced?0:elapsed*(.7+p.r*.3)),rr=r*(.91-travel*.75),x=Math.cos(a)*rr,y=Math.sin(a)*rr;
      ctx.globalAlpha=fade*(.25+Math.sin(travel*Math.PI)*.4);shard(ctx,x,y,a,p.size*.65,i%3?'#ac9bd0':'#e6dff7');
      if(!reduced&&!dense){ctx.strokeStyle='#c2b7e466';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(Math.cos(a-.04)*(rr+3),Math.sin(a-.04)*(rr+3),Math.cos(a-.1)*(rr+7),Math.sin(a-.1)*(rr+7));ctx.stroke();}
    }
  }

  // This pass goes after depth-sorted actors: only the falling meteor occupies
  // the air. Impact debris is emitted later by the actual superBurst effect.
  drawFieldAir(ctx,field,{reduced=false,dense=false}={}){
    if(field?.kind!=='meteor'||!(field.life>0))return false;
    const t=age(field),fall=smooth(clamp((t-.12)/.88)),height=reduced?28:225*(1-fall)+8,x=field.x-(reduced?0:height*.43),y=field.y-height,scale=reduced?.58:.5+.42*fall,alpha=reduced?.74:clamp(t*7);
    ctx.save();ctx.globalAlpha=alpha;ctx.lineJoin='round';ctx.translate(x,y);ctx.rotate(-.405);
    if(!reduced){
      ctx.globalAlpha=alpha*.32;ctx.fillStyle='#d98455';polygon(ctx,[[-15,10],[-26,-43],[-13,-32],[-18,-83],[0,-59],[14,-96],[13,-41],[27,-58],[17,7]]);
      ctx.globalAlpha=alpha*.6;ctx.fillStyle='#f0b878';polygon(ctx,[[-9,9],[-13,-38],[-6,-27],[3,-61],[9,-29],[15,-46],[10,12]]);
      ctx.globalAlpha=alpha*.65;ctx.fillStyle='#ffe5b4';polygon(ctx,[[-4,10],[-5,-26],[2,-43],[6,-19],[7,11]]);
      if(!dense){ctx.globalAlpha=alpha*.5;for(let i=0;i<5;i++){const yy=-35-i*15,xx=(i%2?1:-1)*(13+i*.8);ellipse(ctx,xx,yy,1.2,3.4,'#fbd19a');}}
    }
    ctx.globalAlpha=alpha*.3;ctx.drawImage(this._glow('#f1bc79'),-43,-43,86,86);ctx.globalAlpha=alpha;ctx.drawImage(this._rock(),-44*scale,-51*scale,88*scale,100*scale);ctx.restore();return true;
  }

  drawEffect(ctx,e,{reduced=false,dense=false}={}){
    if(!['superRay','superSword','superBurst','superRunicCharge'].includes(e.type))return false;
    if(!(e.life>0)||!(e.maxLife>0))return true;
    const t=age(e),data=this._data(e);ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0;
    if(e.type==='superRunicCharge')this._runicCharge(ctx,e,t,reduced);
    else if(e.type==='superRay')this._runes(ctx,e,t,reduced,dense);
    else if(e.type==='superSword')this._swordHit(ctx,e,t,reduced,dense);
    else if(e.skillId==='meteor')this._meteorImpact(ctx,e,t,data,reduced,dense);
    else if(e.skillId==='miasma'||e.skillId==='domain'&&e.domainBranch==='erosion')this._miasmaBurst(ctx,e,t,data,reduced,dense);
    else if(e.skillId==='swords')this._swordSummon(ctx,e,t,reduced);
    else this._thornBurst(ctx,e,t,data,reduced,dense);
    ctx.restore();return true;
  }
  _runicCharge(ctx,e,t,reduced){
    ctx.translate(e.x,e.y);ctx.rotate(e.angle||0);
    const size=reduced?14:24-11*smooth(t),alpha=.4+.6*t;
    ctx.globalAlpha=alpha*.38;ctx.drawImage(this._glow('#a5fff0'),-24,-24,48,48);
    ctx.globalAlpha=alpha;glyph(ctx,0,0,Math.PI/4,size*.5,1,'#e3fff1');
    ctx.strokeStyle='#8de5df';ctx.lineWidth=1.5;ctx.beginPath();
    line(ctx,-size,-size*.7,-size*.4,0);line(ctx,-size,size*.7,-size*.4,0);
    line(ctx,size*.4,0,size,-size*.7);line(ctx,size*.4,0,size,size*.7);ctx.stroke();
  }
  _runes(ctx,e,t,reduced,dense){
    const dx=e.x2-e.x,dy=e.y2-e.y,length=Math.hypot(dx,dy),a=Math.atan2(dy,dx),fade=(1-t)**1.4,width=e.r||9,flash=reduced?.2:Math.max(0,1-t/.28);
    ctx.translate(e.x,e.y);ctx.rotate(a);
    // Damage resolves instantly. The complete arrow-shaped afterimage and the
    // contact spark are present on frame one, then decay without a traveling tip.
    ctx.globalAlpha=fade*.36;ctx.fillStyle='#82d9c2';polygon(ctx,[[0,-1],[length*.3,-width*.27],[length-10,-width*.5],[length,0],[length-10,width*.5],[length*.3,width*.27],[0,1]]);
    ctx.globalAlpha=fade*.68;ctx.strokeStyle='#b8f2d9';ctx.lineWidth=1.5;ctx.beginPath();line(ctx,0,0,Math.max(0,length-17),0);ctx.stroke();
    const arrowScale=Math.min(1,length/115);ctx.globalAlpha=fade;ctx.drawImage(this._runicArrow(),length-126*arrowScale,-28*arrowScale,144*arrowScale,56*arrowScale);
    ctx.globalAlpha=flash*.6;ctx.strokeStyle='#effff1';ctx.lineWidth=2.8;ctx.beginPath();line(ctx,Math.min(12,length*.2),0,Math.max(0,length-8),0);ctx.stroke();
    const n=Math.min(dense?2:4,Math.max(1,Math.floor(length/85)));
    for(let i=0;i<n;i++){const xx=(i+.35)/n*Math.max(0,length-55);ctx.globalAlpha=fade*.5;glyph(ctx,xx,(i%2?1:-1)*(width*.65+3),0,2.8,i,'#bfeacf');}
    ctx.globalAlpha=fade*.3;ctx.drawImage(this._glow('#a5fff0'),-18,-18,36,36);ctx.globalAlpha=fade*.8;glyph(ctx,0,0,Math.PI/4,5,1,'#d7fff2');
    ctx.globalAlpha=fade*.8;ctx.fillStyle='#ebfff1';polygon(ctx,[[length-7,0],[length-2,-2],[length,-9],[length+2,-2],[length+7,0],[length+2,2],[length,9],[length-2,2]]);
  }
  drawSwordFlight(ctx,flight,options={}){return drawSwordFlight(ctx,flight,this._sword(),options);}
  _swordHit(ctx,e,t,reduced,dense){
    if(e.impactOnly){
      const fade=(1-t)**.9,spread=reduced?10:7+t*14;ctx.translate(e.x2??e.x,e.y2??e.y);ctx.rotate(e.angle||0);
      ctx.globalAlpha=fade*.22;ctx.drawImage(this._glow('#ffdda1'),-23,-23,46,46);ctx.globalAlpha=fade*.9;ctx.fillStyle='#fff1cc';polygon(ctx,[[-spread,0],[-3,-2],[1,-spread*.65],[3,-2],[spread,0],[3,2],[-1,spread*.65],[-3,2]]);
      if(!reduced&&!dense){ctx.globalAlpha=fade*.7;ctx.strokeStyle='#e6cb8f';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<3;i++){const a=i*TAU/3+.3,rr=6+t*15;line(ctx,Math.cos(a)*rr,Math.sin(a)*rr,Math.cos(a)*(rr+4),Math.sin(a)*(rr+4));}ctx.stroke();}
      return;
    }

    const dx=e.x2-e.x,dy=e.y2-e.y,a=Math.atan2(dy,dx),length=Math.hypot(dx,dy),fade=(1-t)**.7;
    ctx.translate(e.x,e.y);ctx.rotate(a);ctx.globalAlpha=fade*(reduced?.16:.28);ctx.fillStyle='#f2dda2';polygon(ctx,[[0,0],[length*.35,-3],[length,-8],[length+5,0],[length,8],[length*.35,3]]);
    ctx.globalAlpha=fade*.85;ctx.strokeStyle='#ffedc2';ctx.lineWidth=2;ctx.beginPath();line(ctx,0,0,length,0);ctx.stroke();
    ctx.translate(length,0);ctx.globalAlpha=fade;ctx.drawImage(this._sword(),-101,-27.6,128.8,55.2);ctx.globalAlpha=fade*.3;ctx.drawImage(this._glow('#ffdda1'),-36,-36,72,72);
    ctx.globalAlpha=fade*.86;ctx.fillStyle='#fff5d8';const spread=reduced?14:12+t*22;polygon(ctx,[[-spread,-spread*.8],[-2,-3],[spread*.72,-spread], [3,0],[spread,spread*.8],[1,3],[-spread*.7,spread],[-3,0]]);
    if(!reduced&&!dense){ctx.globalAlpha=fade*.65;ctx.strokeStyle='#ecd69f';ctx.lineWidth=1.1;ctx.beginPath();for(let i=0;i<5;i++){const angle=i*TAU/5+.3,rr=8+t*23;line(ctx,Math.cos(angle)*rr,Math.sin(angle)*rr,Math.cos(angle)*(rr+5),Math.sin(angle)*(rr+5));}ctx.stroke();}
  }
  _meteorImpact(ctx,e,t,data,reduced,dense){
    const r=e.r||86,fade=(1-t)**.75,spread=reduced?.66:smooth(t/.7),flash=reduced?.18:Math.max(0,1-t*4);
    ctx.translate(e.x,e.y);
    // A scorched, faceted crater replaces the old post-impact falling stone.
    ctx.globalAlpha=fade*.7;ctx.fillStyle='#3b3435';ctx.beginPath();for(let i=0;i<14;i++){const a=i*TAU/14,rr=r*(.4+noise(data.seed,i)*.13);ctx[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr*.65);}ctx.closePath();ctx.fill();
    ctx.globalAlpha=fade*.72;ctx.strokeStyle='#b27652';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='#f1b77a';ctx.lineWidth=.85;ctx.stroke();
    ctx.globalAlpha=fade*.85;ctx.strokeStyle='#6a4a3c';ctx.lineWidth=2.5;ctx.beginPath();for(let i=0;i<(dense?4:7);i++){const p=data.particles[i],a=p.a,rr=r*(.5+p.r*.28);ctx.moveTo(Math.cos(a)*r*.27,Math.sin(a)*r*.2);ctx.lineTo(Math.cos(a+.1)*rr*.67,Math.sin(a+.1)*rr*.5);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr*.72);}ctx.stroke();ctx.strokeStyle='#f5bc7e';ctx.lineWidth=.8;ctx.stroke();
    ctx.globalAlpha=flash*.55;ctx.drawImage(this._glow('#ffe2ad'),-r,-r,r*2,r*2);
    // A short, faceted flame crown carries the initial impact. It stays inside
    // the blast footprint, then leaves the crater and outward debris visible.
    ctx.globalAlpha=flash*(reduced?.25:.8);ctx.fillStyle='#f6bc78';
    for(let i=0;i<(dense?4:6);i++){const p=data.particles[i],xx=Math.cos(p.a)*r*.25,yy=Math.sin(p.a)*r*.16,h=(reduced?14:30+p.size*3)*(1-t);polygon(ctx,[[xx-7,yy+4],[xx-5,yy-h*.34],[xx-8,yy-h*.55],[xx-1,yy-h*.4],[xx+3,yy-h],[xx+8,yy-h*.28],[xx+7,yy+4]]);}
    ctx.globalAlpha=fade*.5;ctx.fillStyle='#e5b986';ctx.beginPath();for(let i=0;i<24;i++){const a=i*TAU/24,rr=r*(.24+spread*.7)*(i%2?.93:1);ctx[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr);}for(let i=23;i>=0;i--){const a=i*TAU/24,rr=r*(.20+spread*.7)*(i%2?.93:1);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();
    ctx.globalAlpha=fade*(reduced?.23:.58);ctx.fillStyle='#f1aa6f';for(let i=0;i<(dense?6:9);i++){const p=data.particles[i],xx=Math.cos(p.a)*r*.34,yy=Math.sin(p.a)*r*.25,h=reduced?9:13*(1-t);polygon(ctx,[[xx-3,yy+3],[xx-1,yy-h*.4],[xx+1,yy-h],[xx+3,yy-h*.25],[xx+4,yy+3]]);}
    for(let i=0;i<(dense?9:18);i++){const p=data.particles[i],rr=r*(.16+spread*p.r*.9),lift=reduced?0:Math.sin(t*Math.PI)*p.lift;ctx.globalAlpha=fade*(i%3?.85:.55);shard(ctx,Math.cos(p.a)*rr,Math.sin(p.a)*rr-lift,p.a+(reduced?0:t*2),p.size*(reduced?1:1-t*.35),i%3?'#957660':'#efc18b');}
    if(!reduced&&!dense){ctx.globalAlpha=fade*.27;for(let i=0;i<5;i++){const p=data.particles[i],xx=Math.cos(p.a)*r*spread*.55,yy=Math.sin(p.a)*r*spread*.45-10*t;ctx.drawImage(this._dust(),xx-r*.4,yy-r*.26,r*.8,r*.52);}}
    ctx.globalAlpha=flash*.75;ctx.fillStyle='#fff1c4';polygon(ctx,[[-22,0],[-4,-5],[0,-26],[4,-5],[22,0],[5,4],[0,15],[-4,4]]);
  }
  _miasmaBurst(ctx,e,t,data,reduced,dense){
    const r=e.r||95,fade=(1-t)**.8,spread=reduced?.62:.3+smooth(t)*.65;
    ctx.translate(e.x,e.y);
    // The opening burst is localized. A broken crest and billowing lobes
    // distinguish it from lightning and from the later, quiet poison field.
    ctx.globalAlpha=fade*(reduced?.1:.2);ctx.drawImage(this._glow('#d2a7e6'),-r,-r,r*2,r*2);
    for(let i=0;i<(dense?4:6);i++){
      const p=data.particles[i],a=i*TAU/6+p.a*.08,rr=r*spread*.65,xx=Math.cos(a)*rr,yy=Math.sin(a)*rr*.8,size=r*(.5+t*.2);
      ctx.globalAlpha=fade*.6;ctx.drawImage(this._mist(i%2),xx-size*.6,yy-size*.38-(reduced?0:12*t),size*1.2,size*.76);
      ctx.globalAlpha=fade*.8;ctx.strokeStyle=i%2?'#c4e5a1':'#f1d3ff';ctx.lineWidth=2*(1-t)+.7;ctx.beginPath();ctx.arc(0,0,r*spread,a-.17,a+.17);ctx.stroke();
    }
    if(!dense)for(let i=0;i<9;i++){const p=data.particles[i],rr=r*spread*p.r;ctx.globalAlpha=fade*.82;shard(ctx,Math.cos(p.a)*rr,Math.sin(p.a)*rr-(reduced?0:Math.sin(t*Math.PI)*p.lift*.45),p.a,p.size*.75,i%2?'#d9efaf':'#e3b7f0');}
  }
  _swordSummon(ctx,e,t,reduced){
    const elapsed=t*e.maxLife,count=Math.min(6,e.count||4),released=e.released??(elapsed<.16?0:Math.floor((elapsed-.16)/(e.interval||.22))+1),fade=clamp(e.life/.22);
    ctx.translate(e.x,e.y);ctx.globalAlpha=fade*.13;ctx.drawImage(this._glow('#ffdda1'),-46,-49,92,92);
    for(let i=released;i<count;i++){
      const anchor=swordFormationAnchor({x:e.x,y:e.y},i,count);
      ctx.save();ctx.translate(anchor.x-e.x,anchor.y-e.y);ctx.rotate(anchor.angle);ctx.globalAlpha=fade*(reduced?.46:.58);ctx.drawImage(this._sword(),-41.125,-10,47,20);ctx.restore();
    }
    // A low crown-shaped seal stays at the casting location while the swords
    // launch from the player's current position. It never fills the screen.
    ctx.translate((e.castX??e.x)-e.x,(e.castY??e.y)-e.y);
    ctx.globalAlpha=fade*.65;ctx.strokeStyle='#f1d894';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-17,15);ctx.lineTo(-19,7);ctx.lineTo(-8,11);ctx.lineTo(0,3);ctx.lineTo(8,11);ctx.lineTo(19,7);ctx.lineTo(17,15);ctx.closePath();ctx.stroke();
  }
  _thornBurst(ctx,e,t,data,reduced,dense){
    const r=e.r||90,fade=(1-t)**1.2,spread=reduced?.65:.44+smooth(t)*.3;
    ctx.translate(e.x,e.y);ctx.globalAlpha=fade*.12;ctx.drawImage(this._glow('#c4e89c'),-r,-r,r*2,r*2);
    // Soil chips mark emergence; a few leaves follow, without a second radial
    // diagram competing with the irregular living roots on the ground.
    for(let i=0;i<(dense?5:9);i++){
      const p=data.particles[i],rr=r*spread*p.r,xx=Math.cos(p.a)*rr,baseY=Math.sin(p.a)*rr,lift=reduced?0:Math.sin(t*Math.PI)*p.lift*.65;
      ctx.globalAlpha=fade*.78;shard(ctx,xx,baseY-lift,p.a+(reduced?0:t),p.size*.8,i%3?'#7c7952':'#adb67b');
      if(i%2===0){ctx.globalAlpha=fade*.7;leaf(ctx,xx+4,baseY-lift-4,p.a+(reduced?0:t*1.1),p.size*.9,'#a6c67c');}
    }
  }
}
