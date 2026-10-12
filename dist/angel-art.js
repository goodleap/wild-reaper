import { ANGEL_RULES } from './settlements.js';

// The haven is a ground-anchored feather wreath; lightning stays local to its
// target. Cached ground art and per-effect weak geometry avoid frame churn.
const TAU=Math.PI*2;
const clamp=(v)=>Math.max(0,Math.min(1,v));
const noise=(seed,i)=>{const n=Math.sin(seed*12.9898+i*78.233)*43758.5453;return n-Math.floor(n);};
function trace(ctx,points){ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);}
function diamond(ctx,x,y,r){ctx.moveTo(x,y-r);ctx.lineTo(x+r*.5,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r*.5,y);ctx.closePath();}
function bolt(start,end,seed,count=12){const result=[start],dx=end.x-start.x,dy=end.y-start.y,d=Math.hypot(dx,dy)||1;for(let i=1;i<count;i++){const f=i/count,side=(noise(seed,i)-.5)*22*Math.sin(f*Math.PI);result.push({x:start.x+dx*f-dy/d*side,y:start.y+dy*f+dx/d*side});}result.push(end);return result;}

export class AngelArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.aura=null;this.strikes=new WeakMap();}
  get cacheStats(){return {entries:this.aura?1:0,pixels:this.aura?256*256:0,bytes:this.aura?256*256*4:0};}
  _aura(){
    if(this.aura)return this.aura;
    const canvas=this.makeCanvas();canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.translate(128,128);
    const glow=ctx.createRadialGradient(0,0,8,0,0,115);glow.addColorStop(0,'#d4e9b422');glow.addColorStop(.72,'#c2dfab0c');glow.addColorStop(1,'#d8e9b100');ctx.fillStyle=glow;ctx.fillRect(-120,-120,240,240);
    ctx.strokeStyle='#d4dfad';ctx.lineWidth=.8;ctx.globalAlpha=.22;ctx.beginPath();
    for(let i=0;i<16;i++){const a=i*TAU/16+.03;ctx.moveTo(Math.cos(a)*115,Math.sin(a)*115);ctx.arc(0,0,115,a,i*TAU/16+.19);}
    ctx.stroke();
    // Four feather sprays describe the circular reach without a flat UI disk.
    for(let q=0;q<4;q++){
      ctx.save();ctx.rotate(q*Math.PI/2+.32);ctx.strokeStyle='#dde6b7';ctx.fillStyle='#d3dfa4';ctx.globalAlpha=.27;ctx.lineWidth=.85;
      ctx.beginPath();ctx.moveTo(-21,-107);ctx.quadraticCurveTo(-1,-116,21,-107);ctx.stroke();
      for(let i=0;i<5;i++){
        const x=-17+i*8.5,y=-110+(x*x)/145,side=i<2?-1:1;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+side*7,y-8,x+side*10,y-5);ctx.quadraticCurveTo(x+side*6,y+1,x,y);ctx.fill();
      }
      ctx.globalAlpha=.5;ctx.beginPath();diamond(ctx,0,-115,4);ctx.fill();ctx.restore();
    }
    ctx.globalAlpha=.34;ctx.strokeStyle='#e2dba8';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,23,10,0,0,TAU);ctx.stroke();
    ctx.globalAlpha=.3;ctx.fillStyle='#e6e7bd';ctx.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2;diamond(ctx,Math.cos(a)*28,Math.sin(a)*12,2.5);}ctx.fill();
    this.aura=canvas;return canvas;
  }
  drawAura(ctx,site,{time=0,reduced=false}={}){
    if(site.type!=='angel')return false;
    const r=ANGEL_RULES.guardRadius,scale=r/115,t=reduced?0:time;
    ctx.save();ctx.translate(site.x,site.y);ctx.scale(scale,scale);ctx.globalAlpha=site.healing?1:.75;ctx.drawImage(this._aura(),-128,-128);
    ctx.fillStyle='#e5ecc3';ctx.beginPath();
    for(let i=0;i<(reduced?4:8);i++){
      const angle=i*TAU/8+.4,radius=42+noise(9,i)*54,lift=reduced?3:(t*9+i*4)%14;
      diamond(ctx,Math.cos(angle)*radius,Math.sin(angle)*radius-lift,site.healing?1.7:1.1);
    }
    ctx.globalAlpha=site.healing?.42:.17;ctx.fill();
    const pulseDuration=.18,cast=clamp(((site._attack||0)-(ANGEL_RULES.attackInterval-pulseDuration))/pulseDuration);
    if(cast>0){ctx.globalAlpha=cast*.5;ctx.strokeStyle='#fff3c3';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,-7,16+(1-cast)*8,6+(1-cast)*3,0,0,TAU);ctx.stroke();}
    ctx.restore();return true;
  }
  _strike(e){
    if(this.strikes.has(e))return this.strikes.get(e);
    const seed=Number(e.seed)||Math.round(e.x*13+e.y*7),end={x:e.x,y:e.y-6},start={x:e.x+(noise(seed,0)-.5)*35,y:e.y-175};
    const main=bolt(start,end,seed),branches=[],arcs=[];
    for(let i=0;i<3;i++){const origin=main[3+i*2],side=i%2?1:-1;branches.push(bolt(origin,{x:origin.x+side*(20+noise(seed,i+18)*17),y:origin.y+17+noise(seed,i+24)*18},seed+i+41,5));}
    for(let i=0;i<6;i++){const a=i*TAU/6+noise(seed,i+60)*.2,r=(e.r||60)*(.55+noise(seed,i+70)*.35);arcs.push(bolt({x:e.x+Math.cos(a)*5,y:e.y+Math.sin(a)*5},{x:e.x+Math.cos(a)*r,y:e.y+Math.sin(a)*r},seed+i+81,5));}
    const result={main,branches,arcs};this.strikes.set(e,result);return result;
  }
  drawStrike(ctx,e,{reduced=false,dense=false}={}){
    if(e.type!=='angelStrike')return false;
    if(!(e.life>0&&e.maxLife>0))return true;
    const t=clamp(1-e.life/e.maxLife),brightness=(1-t)**1.2*(reduced?.72:1),shape=this._strike(e);
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0;ctx.beginPath();trace(ctx,shape.main);
    if(!dense&&!reduced){ctx.globalAlpha=brightness*.13;ctx.strokeStyle='#e7d58f';ctx.lineWidth=15;ctx.stroke();}
    ctx.globalAlpha=brightness*.4;ctx.strokeStyle='#ebdba2';ctx.lineWidth=7;ctx.stroke();
    ctx.globalAlpha=brightness;ctx.strokeStyle='#e6f3ed';ctx.lineWidth=3.5;ctx.stroke();ctx.strokeStyle='#fffdf0';ctx.lineWidth=1.35;ctx.stroke();
    ctx.beginPath();for(const branch of shape.branches)trace(ctx,branch);ctx.globalAlpha=brightness*.64;ctx.strokeStyle='#e7e3bf';ctx.lineWidth=1.2;ctx.stroke();
    ctx.beginPath();for(let i=0;i<(dense?3:shape.arcs.length);i++)trace(ctx,shape.arcs[i]);ctx.globalAlpha=brightness*.55;ctx.strokeStyle='#e7ebc4';ctx.lineWidth=1.45;ctx.stroke();
    const age=1-(1-clamp(t/.65))**3,impact=(e.r||60)*(.18+age*.72);
    ctx.globalAlpha=brightness*.3;ctx.strokeStyle='#ecedbe';ctx.lineWidth=1.1;ctx.beginPath();for(let i=0;i<5;i++){const a=i*TAU/5+.08;ctx.moveTo(e.x+Math.cos(a)*impact,e.y+Math.sin(a)*impact);ctx.arc(e.x,e.y,impact,a,i*TAU/5+.57);}ctx.stroke();
    ctx.globalAlpha=brightness;ctx.fillStyle='#fffcec';ctx.beginPath();diamond(ctx,e.x,e.y-5,11*(1-t)+2);ctx.fill();
    ctx.restore();return true;
  }
}
