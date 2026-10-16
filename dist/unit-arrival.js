import { groundOffset } from './terrain.js';
const TAU=Math.PI*2;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};

// Simulation time freezes the actor reveal together with dialogue and pause.
export function beginUnitArrival(game,actor,{duration=1.1,color='#f4edc0',radius=44}={}){
  const length=Number.isFinite(duration)&&duration>0?duration:1.1;
  actor.arrival={startedAt:game._clock||0,duration:length};
  const groundY=actor.groundY??actor.y+groundOffset(actor,!!(actor.heroId||actor.isCompanion));
  game._effect?.(actor.x,groundY,'unitArrival',length,radius,color,undefined,{unitId:actor.id});
  return actor.arrival;
}
export function unitArrivalProgress(actor,time=0){
  return actor?.arrival?clamp((time-actor.arrival.startedAt)/actor.arrival.duration):1;
}
export function unitArrivalAlpha(actor,time=0){return smooth((unitArrivalProgress(actor,time)-.28)/.44);}
export function unitArrivalComplete(actor,time=0){return unitArrivalProgress(actor,time)>=1;}

// A small ground pool gathers first, a narrow column reveals the actor, then
// the light contracts. No global flash, canvas allocation or random painting.
export function drawUnitArrival(ctx,e,{reduced=false}={},layer='air'){
  if(e.type!=='unitArrival')return false;
  if(!(e.life>0&&e.maxLife>0))return true;
  const phase=clamp(1-e.life/e.maxLife),gather=smooth(phase/.24),fade=1-smooth((phase-.68)/.32);
  const strength=gather*fade,radius=e.r||44,color=e.color||'#f4edc0';
  ctx.save();ctx.translate(e.x,e.y);
  if(layer==='ground'){
    const size=radius*(.72+.28*(1-gather));
    ctx.save();ctx.scale(1,.46);
    const glow=ctx.createRadialGradient(0,0,0,0,0,size*1.5);glow.addColorStop(0,color);glow.addColorStop(1,'transparent');
    ctx.globalAlpha=strength*(reduced?.18:.3);ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,size*1.5,0,TAU);ctx.fill();ctx.restore();
    ctx.globalAlpha=strength*.62;ctx.strokeStyle=color;ctx.lineWidth=1.4;
    ctx.beginPath();ctx.ellipse(0,0,size,size*.46,0,0,TAU);ctx.stroke();
    ctx.globalAlpha=strength*.22;ctx.beginPath();ctx.ellipse(0,0,size*.7,size*.32,0,0,TAU);ctx.stroke();
  }else{
    const reveal=smooth((phase-.14)/.18),height=150,width=radius*(.4+.2*(1-gather));
    const beam=ctx.createLinearGradient(0,-height,0,0);beam.addColorStop(0,'transparent');beam.addColorStop(.38,color);beam.addColorStop(1,color);
    ctx.fillStyle=beam;ctx.globalAlpha=strength*reveal*(reduced?.1:.21);
    ctx.beginPath();ctx.moveTo(-width,-height);ctx.lineTo(width,-height);ctx.lineTo(width*.63,0);ctx.quadraticCurveTo(0,9,-width*.63,0);ctx.closePath();ctx.fill();
    ctx.globalAlpha=strength*reveal*.16;ctx.fillRect(-width*.17,-height,width*.34,height);
    if(!reduced){
      ctx.fillStyle=color;ctx.globalAlpha=strength*.65;
      for(let i=0;i<8;i++){
        const angle=i*TAU/8,travel=(phase+i*.117)%1;
        const x=Math.cos(angle)*radius*(.72-travel*.4),y=-travel*94+Math.sin(angle)*radius*.2,size=1.2+Math.sin(Math.PI*travel);
        ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size*.55,y);ctx.lineTo(x,y+size);ctx.lineTo(x-size*.55,y);ctx.closePath();ctx.fill();
      }
    }
  }
  ctx.restore();return true;
}
