import { ANGEL_RULES } from './settlements.js';
import { lightningPath, stormBrightness, stormImpactBrightness } from './storm-geometry.js';

// Static vector artwork is rasterized once at the display density. Dynamic
// details and the small foot ring stay in world units; no enlarged 256px sprite.
const TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,v));
const noise=(seed,i)=>{const n=Math.sin(seed*12.9898+i*78.233)*43758.5453;return n-Math.floor(n);};
const AURA_PADDING=8;
export const ANGEL_FOOT_RING=Object.freeze({rx:22,ry:9});
function trace(ctx,points){ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);}
function diamond(ctx,x,y,r){ctx.moveTo(x,y-r);ctx.lineTo(x+r*.5,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r*.5,y);ctx.closePath();}

export class AngelArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.aura=null;this.strikes=new WeakMap();this.builds=0;this.geometryBuilds=0;}
  get cacheStats(){const pixels=this.aura?this.aura.canvas.width*this.aura.canvas.height:0;return {entries:this.aura?1:0,pixels,bytes:pixels*4,builds:this.builds,geometryBuilds:this.geometryBuilds,pixelRatio:this.aura?.pixelRatio||0};}
  _aura(pixelRatio=1){
    // One bounded cache shared by all guardians; a DPR change replaces it.
    const density=Math.max(1,Math.min(2,Math.ceil((Number(pixelRatio)||1)*2)/2));
    if(this.aura?.pixelRatio===density)return this.aura;
    const radius=ANGEL_RULES.guardRadius,size=(radius+AURA_PADDING)*2;
    const canvas=this.makeCanvas();canvas.width=canvas.height=Math.ceil(size*density);
    const ctx=canvas.getContext('2d');ctx.scale(density,density);ctx.translate(size/2,size/2);
    const glow=ctx.createRadialGradient(0,0,12,0,0,radius);glow.addColorStop(0,'#e6e6bc19');glow.addColorStop(.7,'#d7dfb40b');glow.addColorStop(1,'#f2e4b100');
    ctx.fillStyle=glow;ctx.fillRect(-radius,-radius,radius*2,radius*2);
    // Crisp world-space boundary, with restrained decoration just inside it.
    ctx.strokeStyle='#dddcb0';ctx.lineWidth=1.1;ctx.globalAlpha=.56;ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.stroke();
    ctx.globalAlpha=.22;ctx.lineWidth=.8;ctx.beginPath();
    for(let i=0;i<16;i++){const a=i*TAU/16+.05;ctx.moveTo(Math.cos(a)*(radius-5),Math.sin(a)*(radius-5));ctx.arc(0,0,radius-5,a,i*TAU/16+.25);}ctx.stroke();
    for(let q=0;q<4;q++){
      ctx.save();ctx.rotate(q*Math.PI/2+.32);ctx.strokeStyle='#f0e6bb';ctx.fillStyle='#e4dfb0';ctx.globalAlpha=.48;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(-22,-radius+9);ctx.quadraticCurveTo(0,-radius+1,22,-radius+9);ctx.stroke();
      for(let i=0;i<5;i++){
        const x=-17+i*8.5,y=-radius+5+(x*x)/145,side=i<2?-1:1;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+side*6,y-5,x+side*9,y-3);ctx.quadraticCurveTo(x+side*5,y+2,x,y);ctx.fill();
      }
      ctx.globalAlpha=.8;ctx.beginPath();diamond(ctx,0,-radius+6,3);ctx.fill();ctx.restore();
    }
    this.aura={canvas,pixelRatio:density,size};this.builds++;return this.aura;
  }
  drawAura(ctx,site,{time=0,reduced=false,pixelRatio=1}={}){
    if(site.type!=='angel')return false;
    const radius=ANGEL_RULES.guardRadius,t=reduced?0:time,art=this._aura(pixelRatio);
    ctx.save();ctx.translate(site.x,site.y);ctx.globalAlpha=site.healing?1:.86;ctx.drawImage(art.canvas,-art.size/2,-art.size/2,art.size,art.size);
    // Foot-sized ellipse, independent of the guard radius and cache resolution.
    ctx.globalAlpha=site.healing?.92:.72;ctx.strokeStyle='#f3e7b9';ctx.lineWidth=1.25;ctx.beginPath();ctx.ellipse(0,0,ANGEL_FOOT_RING.rx,ANGEL_FOOT_RING.ry,0,0,TAU);ctx.stroke();
    ctx.globalAlpha=.4;ctx.strokeStyle='#cbd9bc';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(0,0,18,6.5,0,0,TAU);ctx.stroke();
    ctx.globalAlpha=.78;ctx.fillStyle='#fff0bf';ctx.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2;diamond(ctx,Math.cos(a)*26,Math.sin(a)*12,2);}ctx.fill();
    ctx.fillStyle='#f0edc7';ctx.beginPath();
    for(let i=0;i<(reduced?4:8);i++){
      const angle=i*TAU/8+.4,r=(.28+noise(9,i)*.4)*radius,lift=reduced?3:(t*9+i*4)%14;
      diamond(ctx,Math.cos(angle)*r,Math.sin(angle)*r-lift,site.healing?1.5:1.1);
    }
    ctx.globalAlpha=site.healing?.42:.22;ctx.fill();
    // A restrained local glint rather than a repeated expanding guard circle.
    const pulseDuration=.1,cast=clamp(((site._attack||0)-(ANGEL_RULES.attackInterval-pulseDuration))/pulseDuration);
    if(cast>0&&!reduced){ctx.globalAlpha=cast*.28;ctx.strokeStyle='#fff3cf';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,-3,18,7,0,0,TAU);ctx.stroke();}
    ctx.restore();return true;
  }
  _strike(e){
    if(this.strikes.has(e))return this.strikes.get(e);
    const seed=Number(e.seed)||Math.round(e.x*13+e.y*7),end={x:e.x,y:e.y-3};
    // Same fractal forks as the hero's storm, compressed into a local discharge
    // above the hit instead of a long beam arriving from the top of the screen.
    const start={x:e.x+(noise(seed,0)-.5)*34,y:e.y-66-noise(seed,1)*18};
    const main=lightningPath(start,end,seed,5,.16),branches=[],arcs=[];
    for(let i=0;i<2;i++){
      const origin=main[9+i*9],side=i%2?1:-1;
      branches.push(lightningPath(origin,{x:origin.x+side*(15+noise(seed,i+18)*13),y:origin.y+12+noise(seed,i+24)*11},seed+i*23+3,3,.24));
    }
    for(let i=0;i<4;i++){
      const a=i*TAU/4+noise(seed,i+60)*.3,r=(e.r||60)*(.35+noise(seed,i+70)*.25);
      arcs.push(lightningPath({x:e.x+Math.cos(a)*3,y:e.y+Math.sin(a)*1.5},{x:e.x+Math.cos(a)*r,y:e.y+Math.sin(a)*r*.48},seed+i+81,3,.2));
    }
    const result={main,branches,arcs};this.strikes.set(e,result);this.geometryBuilds++;return result;
  }
  drawStrike(ctx,e,{reduced=false,dense=false}={}){
    if(e.type!=='angelStrike')return false;
    if(!(e.life>0&&e.maxLife>0))return true;
    const shape=this._strike(e),brightness=stormBrightness(e,reduced),impactAlpha=stormImpactBrightness(e,reduced);
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0;ctx.beginPath();trace(ctx,shape.main);
    // Hero storm stroke profile, recolored in pale gold-white. No blur filters,
    // fullscreen overlays, per-frame randomness or per-target gradients.
    if(!dense&&!reduced){ctx.globalAlpha=brightness*.075;ctx.strokeStyle='#d9bb6c';ctx.lineWidth=12;ctx.stroke();}
    for(const [width,color,alpha] of [[7,'#ebd69b',.2],[3.7,'#f7e9bd',.8],[1.65,'#fffef5',1]]){ctx.lineWidth=width;ctx.strokeStyle=color;ctx.globalAlpha=brightness*alpha;ctx.stroke();}
    ctx.beginPath();for(const branch of shape.branches)trace(ctx,branch);
    ctx.strokeStyle='#e7d7a1';ctx.lineWidth=2.7;ctx.globalAlpha=brightness*.28;ctx.stroke();
    ctx.strokeStyle='#fff3cf';ctx.lineWidth=.95;ctx.globalAlpha=brightness*.85;ctx.stroke();
    ctx.beginPath();for(let i=0;i<(dense||reduced?2:shape.arcs.length);i++)trace(ctx,shape.arcs[i]);
    ctx.strokeStyle='#e9cd85';ctx.lineWidth=3.6;ctx.globalAlpha=impactAlpha*.24;ctx.stroke();
    ctx.strokeStyle='#fff3d0';ctx.lineWidth=1.25;ctx.globalAlpha=impactAlpha;ctx.stroke();
    ctx.globalAlpha=impactAlpha;ctx.fillStyle='#fffef5';ctx.beginPath();ctx.ellipse(e.x,e.y,2.6,1.8,0,0,TAU);ctx.fill();
    ctx.restore();return true;
  }
}
