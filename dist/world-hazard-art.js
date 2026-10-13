import { traceWaterPath, waterBounds } from './water-geometry.js';
import { WORLD_HAZARD_RULES } from './world-hazards.js';

const TAU=Math.PI*2;
const polygon=(ctx,points,fill,stroke)=>{ctx.beginPath();for(let i=0;i<points.length;i++)ctx[i?'lineTo':'moveTo'](...points[i]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}};
const circle=(ctx,x,y,r,fill)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();};
function stone(ctx,x,y,r,color='#92a09c'){
  polygon(ctx,[[x-r,y],[x-r*.62,y-r*.72],[x+r*.25,y-r],[x+r,y-r*.2],[x+r*.7,y+r*.35],[x-r*.4,y+r*.45]],'#424f4e','#344341');
  polygon(ctx,[[x-r,y],[x-r*.62,y-r*.72],[x+r*.25,y-r],[x+r*.35,y-r*.22],[x-r*.15,y+r*.03]],color);
  polygon(ctx,[[x+r*.25,y-r],[x+r,y-r*.2],[x+r*.7,y+r*.35],[x+r*.35,y-r*.22]],'#65716d');
}

export class WorldHazardArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.builds=0;}
  get cacheStats(){return {entries:this.cache.size,builds:this.builds,maxEntries:16};}
  _base(prop,dpr){
    const key=`${prop.type}:${Math.floor((prop.seed||0)*4)}:${dpr}`;let image=this.cache.get(key);if(image)return image;
    const canvas=this.makeCanvas(),extent=84;canvas.width=canvas.height=extent*2*dpr;const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,extent*dpr,extent*dpr);c.lineWidth=1;c.lineJoin='round';
    if(prop.type==='rockfall'){
      c.globalAlpha=.25;c.fillStyle='#263c38';c.beginPath();c.ellipse(0,2,39,21,-.12,0,TAU);c.fill();c.globalAlpha=1;
      for(let i=0;i<7;i++){const a=i*2.399+(prop.seed||0)*2,r=15+(i%3)*11;stone(c,Math.cos(a)*r,Math.sin(a)*r*.66,3+i%4);}
      c.strokeStyle='#98a69d66';c.lineWidth=1.2;for(let i=0;i<4;i++){const a=i*1.9;c.beginPath();c.moveTo(Math.cos(a)*10,Math.sin(a)*9);c.lineTo(Math.cos(a)*25,Math.sin(a)*15);c.stroke();}
    }else{
      c.fillStyle='#29282e';c.beginPath();c.ellipse(0,2,29,18,0,0,TAU);c.fill();
      for(let i=0;i<8;i++){const a=i*TAU/8;stone(c,Math.cos(a)*23,Math.sin(a)*12,7+i%3,'#776764');}
      c.fillStyle='#34272b';c.beginPath();c.ellipse(0,-2,17,9,0,0,TAU);c.fill();
      c.strokeStyle='#bd654377';c.lineWidth=2;c.beginPath();c.ellipse(0,-1,15,7,0,.15,Math.PI-.15);c.stroke();
    }
    image={canvas,extent};if(this.cache.size>=16)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,image);this.builds++;return image;
  }
  _tide(ctx,prop,options){
    if(prop.state==='idle')return;
    const patch=prop.patch;if(!patch)return;const active=prop.state==='active',b=waterBounds(patch),progress=active?1:prop.warning||0,time=options.reduced?0:options.time||0;
    ctx.save();traceWaterPath(ctx,patch);ctx.clip();ctx.globalAlpha*=active?.16:.045+.07*progress;ctx.fillStyle='#b9f0ef';ctx.fill();ctx.globalAlpha=active?.65:.25+.3*progress;ctx.strokeStyle='#d9fbef';ctx.lineWidth=active?2:1.2;
    for(let i=0;i<3;i++){const f=((time*.12+i/3)%1+1)%1,y=b.minY+(b.maxY-b.minY)*f;ctx.beginPath();ctx.moveTo(b.minX,y);ctx.bezierCurveTo(b.minX+(b.maxX-b.minX)*.3,y-9,b.minX+(b.maxX-b.minX)*.7,y+9,b.maxX,y);ctx.stroke();}
    ctx.restore();ctx.save();traceWaterPath(ctx,patch);ctx.globalAlpha*=active?.55:.35+.35*progress;ctx.strokeStyle='#cff5ed';ctx.lineWidth=active?2:1.5;ctx.setLineDash(active?[]:[7,6]);ctx.stroke();ctx.restore();
  }
  draw(ctx,environment,options={}){
    const hazards=environment?.worldHazards;if(!hazards)return;
    const view=options.viewBounds,time=options.reduced?0:options.time||0,dpr=options.pixelRatio>1?2:1;
    for(const prop of hazards.props){
      const extent=prop.patch?Math.max(prop.patch.rx,prop.patch.ry)+20:84;
      if(view&&(prop.x+extent<view.minX||prop.x-extent>view.maxX||prop.y+extent<view.minY||prop.y-extent>view.maxY))continue;
      if(prop.type==='tide'){this._tide(ctx,prop,options);continue;}
      if(!['rockfall','vent'].includes(prop.type))continue;
      ctx.save();ctx.translate(prop.x,prop.y);ctx.lineCap='round';ctx.lineJoin='round';
      const image=this._base(prop,dpr);ctx.drawImage(image.canvas,-image.extent,-image.extent,image.extent*2,image.extent*2);
      const warning=prop.state==='warn',active=prop.state==='active',r=prop.r;
      if(warning||active){
        ctx.save();const color=prop.type==='rockfall'?'#ffe6b0':'#ffd79a';ctx.globalAlpha*=active?.1:.05+.04*(prop.warning||0);circle(ctx,0,0,r,color);ctx.restore();
        ctx.strokeStyle=colorFor(prop.type);ctx.lineWidth=2;ctx.setLineDash(warning?[7,5]:[]);ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();ctx.setLineDash([]);
        if(warning){ctx.strokeStyle='#fff5d8';ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,0,r-4,-Math.PI/2,-Math.PI/2+TAU*(prop.warning||0));ctx.stroke();}
      }
      if(prop.type==='rockfall'){
        if(warning&&prop.remaining<.3||active){
          const height=warning?Math.max(0,prop.remaining)/.3*75:0;
          for(let i=0;i<3;i++){const a=i*2.4+(prop.seed||0),x=Math.cos(a)*r*.32,y=Math.sin(a)*r*.27;ctx.save();ctx.globalAlpha*=.3;ctx.fillStyle='#273431';ctx.beginPath();ctx.ellipse(x,y+2,10,5,0,0,TAU);ctx.fill();ctx.restore();stone(ctx,x,y-height,10+i*2);}
          if(active){const life=1-Math.max(0,prop.remaining)/WORLD_HAZARD_RULES.rockfall.active;ctx.save();ctx.globalAlpha*=.7*(1-life);ctx.strokeStyle='#d5ddd0';ctx.lineWidth=2.6;ctx.beginPath();ctx.ellipse(0,2,10+life*r,5+life*r*.6,0,0,TAU);ctx.stroke();ctx.restore();}
        }
      }else{
        if(warning||active){ctx.save();ctx.globalAlpha*=active?.9:.25+.6*(prop.warning||0);ctx.fillStyle='#f9b466';ctx.beginPath();ctx.ellipse(0,-2,12,5,0,0,TAU);ctx.fill();ctx.restore();}
        if(active){
          for(let i=0;i<5;i++){const phase=options.reduced?.5:((time*2.2+i*.19)%1+1)%1,x=(i-2)*7,h=22+phase*37;ctx.save();ctx.globalAlpha*=.6*(1-phase*.7);ctx.strokeStyle=i%2?'#f6bb86':'#ead1b4';ctx.lineWidth=9-phase*4;ctx.beginPath();ctx.moveTo(x*.65,-2);ctx.quadraticCurveTo(x+Math.sin(i)*9,-h*.45,x*1.5,-h);ctx.stroke();ctx.restore();}
          for(let i=0;i<4;i++){const a=i*1.73+time*.2,phase=((time*1.5+i*.21)%1+1)%1;circle(ctx,Math.cos(a)*phase*r*.65,-8-Math.sin(phase*Math.PI)*32,1.4,'#ffe3a3');}
        }
      }
      ctx.restore();
    }
  }
}
const colorFor=type=>type==='rockfall'?'#e7ce9d':'#ffbf87';
