import { AbilityVisuals, TAU, clamp, abilityColor, circle, polygon, segment } from './ability-visuals.js';
import { drawSpecialistBossGround } from './enemy-art/specialist-bosses.js';

const art=new AbilityVisuals();
const visible=(options,item,extra=0)=>{
  if(options.visible&&!options.visible(item))return false;
  const b=options.viewBounds;if(!b)return true;
  // Include long beams/cones and the complete airborne meteor trajectory.
  const r=Math.max(item.parameters?.range||0,item.parameters?.radius||item.radius||item.r||0,extra)+36;
  return item.x+r>=b.minX&&item.x-r<=b.maxX&&item.y+r>=b.minY&&item.y-r<=b.maxY;
};
export const abilityArtDiagnostics=()=>art.diagnostics;
function shape(ctx,e,r){
  const p=e.parameters,x=e.x,y=e.y+(e.groundOffset||0);
  ctx.beginPath();
  if(e.shape==='beam'||e.shape==='projectile'){
    const length=e.shape==='projectile'?Math.min(90,p.range):p.range,ux=Math.cos(e.angle),uy=Math.sin(e.angle),rx=-uy*r,ry=ux*r;
    ctx.moveTo(x+rx,y+ry);ctx.lineTo(x+ux*length+rx,y+uy*length+ry);ctx.lineTo(x+ux*length-rx,y+uy*length-ry);ctx.lineTo(x-rx,y-ry);ctx.closePath();
  }else if(e.shape==='cone'){
    ctx.moveTo(x,y);ctx.arc(x,y,p.range,e.angle-p.spread,e.angle+p.spread);ctx.closePath();
  }else if(e.shape==='wave'){
    const ux=Math.cos(e.angle),uy=Math.sin(e.angle);ctx.moveTo(x-uy*r,y+ux*r);ctx.lineTo(x+uy*r,y-ux*r);
  }else ctx.arc(x,y,r,0,TAU);
}
function direction(ctx,e,progress){
  if(!['projectile','beam','cone','wave'].includes(e.shape))return;
  const p=e.parameters,length=e.shape==='projectile'?Math.min(90,p.range):e.shape==='wave'?14:p.range*.9,ux=Math.cos(e.angle),uy=Math.sin(e.angle),x=e.x+ux*length,y=e.y+(e.groundOffset||0)+uy*length;
  ctx.strokeStyle=e.hostile?'#ffd0b5':abilityColor(e);ctx.lineWidth=1.7;ctx.globalAlpha=.65+progress*.3;ctx.beginPath();
  segment(ctx,x-ux*8-uy*4,y-uy*8+ux*4,x,y);segment(ctx,x,y,x-ux*8+uy*4,y-uy*8-ux*4);ctx.stroke();
}
function warning(ctx,e){
  const p=e.parameters,progress=clamp(e.age/Math.max(.001,e.windup));
  shape(ctx,e,p.radius);ctx.fillStyle=e.hostile?'#b55249':abilityColor(e);ctx.globalAlpha=(e.hostile?.07:.035)+progress*.075;if(e.shape!=='wave')ctx.fill();
  ctx.strokeStyle=e.hostile?'#f1a181':abilityColor(e);ctx.lineWidth=e.hostile?1.8:1.2;ctx.globalAlpha=e.hostile?.88:.55;ctx.stroke();
  if(['zone','field','ring'].includes(e.shape)){
    ctx.strokeStyle=e.hostile?'#ffd2ad':abilityColor(e);ctx.lineWidth=2.4;ctx.globalAlpha=.95;ctx.beginPath();ctx.arc(e.x,e.y+(e.groundOffset||0),p.radius,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();
    if(e.hostile){ctx.globalAlpha=.85;ctx.lineWidth=1.5;ctx.beginPath();for(let i=0;i<4;i++){const a=i*TAU/4,ux=Math.cos(a),uy=Math.sin(a),x=e.x+ux*p.radius,y=e.y+(e.groundOffset||0)+uy*p.radius;segment(ctx,x-ux*5-uy*3,y-uy*5+ux*3,x,y);segment(ctx,x,y,x-ux*5+uy*3,y-uy*5-ux*3);}ctx.stroke();}
  }
  direction(ctx,e,progress);
}
function activeBoundary(ctx,e){
  if(e.shape==='projectile'||e.shape==='ring'||e.shape==='zone')return;
  shape(ctx,e,e.parameters.radius);ctx.strokeStyle=e.hostile?'#eaa18a':abilityColor(e);ctx.globalAlpha=e.hostile?.78:.4;ctx.lineWidth=e.hostile?1.5:1;ctx.stroke();
}
function drawMarks(ctx,enemy,options){
  for(const mark of enemy.specialMarks||[]){
    if(!visible(options,mark))continue;
    const ice=mark.kind==='ice',ready=Number.isFinite(mark.delay),progress=ready?clamp(1-mark.delay/Math.max(.001,mark.maxDelay||1)):0,fade=clamp((mark.life??1)/.35),r=mark.r;
    ctx.save();ctx.translate(mark.x,mark.y);circle(ctx,0,0,r);ctx.clip();ctx.globalAlpha=fade*(ready?.26:.14);ctx.fillStyle=ice?'#9ed4e5':'#d3724c';ctx.fill();
    if(ice){
      ctx.globalAlpha=fade*(.55+progress*.35);ctx.strokeStyle='#c1ebf5';ctx.lineWidth=1.1;ctx.beginPath();
      for(let i=0;i<(options.dense?4:6);i++){const a=i*TAU/6,ux=Math.cos(a),uy=Math.sin(a);segment(ctx,ux*r*.13,uy*r*.13,ux*r*.9,uy*r*.9);segment(ctx,ux*r*.55,uy*r*.55,ux*r*.56-uy*r*.19,uy*r*.56+ux*r*.19);}ctx.stroke();
      ctx.fillStyle=ready?'#e2faff':'#9bcbd9';for(let i=0;i<4;i++){const a=i*2.4,x=Math.cos(a)*r*.52,y=Math.sin(a)*r*.45;polygon(ctx,[[x-3,y+3],[x-2,y-5],[x+1,y-9-progress*3],[x+4,y],[x+3,y+3]]);}
    }else{
      ctx.fillStyle='#302c2b';ctx.globalAlpha=fade*.72;polygon(ctx,[[-r*.64,-r*.3],[-r*.18,-r*.66],[r*.57,-r*.48],[r*.75,r*.18],[r*.23,r*.66],[-r*.53,r*.43]]);
      ctx.strokeStyle=ready?'#ffce88':'#ce8155';ctx.lineWidth=ready?2:1.4;ctx.globalAlpha=fade*(.65+progress*.35);ctx.beginPath();segment(ctx,-r*.55,-r*.27,-r*.1,r*.07);segment(ctx,-r*.1,r*.07,r*.57,-r*.36);segment(ctx,-r*.1,r*.07,r*.24,r*.54);ctx.stroke();
      if(!options.reduced&&!options.dense){ctx.globalAlpha=fade*.7;ctx.fillStyle='#f4be7e';for(let i=0;i<3;i++){const phase=((enemy.specialVisualTime||0)*.8+i*.31)%1;circle(ctx,(i-1)*r*.38,-phase*r*.8,1.2);ctx.fill();}}
    }
    ctx.restore();
    ctx.strokeStyle=ready?'#ffd0b0':ice?'#a9d5e3':'#cd8b65';ctx.globalAlpha=fade*(ready?.92:.5);ctx.lineWidth=ready?2:1.2;circle(ctx,mark.x,mark.y,r);ctx.stroke();
    if(ready){ctx.globalAlpha=.95;ctx.strokeStyle='#ffdeb8';ctx.lineWidth=2.7;ctx.beginPath();ctx.arc(mark.x,mark.y,r,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();}
  }
}
function drawSpecialGround(ctx,game,options){
  for(const enemy of game.enemies||[]){
    if(enemy.hp<=0||options.visible&&!options.visible(enemy))continue;
    drawMarks(ctx,enemy,options);
    const a=enemy.specialAttack;if(!a||!(a.phase==='windup'||a.phase==='strikes'||a.kind==='leap'&&a.phase==='rush'))continue;
    const progress=clamp(1-a.life/Math.max(.01,a.maxLife));ctx.strokeStyle='#f3ba8b';ctx.fillStyle='#f3a777';
    for(const c of a.circles||[]){
      if(c.done||!visible(options,c))continue;
      const local=a.phase==='strikes'?clamp(1-c.delay/Math.max(.001,c.maxDelay??a.maxLife)):progress;
      ctx.globalAlpha=.09+local*.12;circle(ctx,c.x,c.y,c.r);ctx.fill();ctx.globalAlpha=.9;ctx.lineWidth=2;ctx.stroke();
      ctx.globalAlpha=.8;ctx.lineWidth=2.7;ctx.beginPath();ctx.arc(c.x,c.y,c.r,-Math.PI/2,-Math.PI/2+TAU*local);ctx.stroke();
    }
    if(a.length>0){
      const ux=Math.cos(a.angle),uy=Math.sin(a.angle),r=a.r||enemy.r,x2=a.x+ux*a.length,y2=a.y+uy*a.length;
      ctx.beginPath();ctx.moveTo(a.x-uy*r,a.y+ux*r);ctx.lineTo(x2-uy*r,y2+ux*r);ctx.lineTo(x2+uy*r,y2-ux*r);ctx.lineTo(a.x+uy*r,a.y-ux*r);ctx.closePath();ctx.globalAlpha=.1+progress*.08;ctx.fill();ctx.globalAlpha=.9;ctx.lineWidth=2;ctx.stroke();
      ctx.lineWidth=2.2;ctx.beginPath();segment(ctx,x2-ux*16-uy*10,y2-uy*16+ux*10,x2,y2);segment(ctx,x2,y2,x2-ux*16+uy*10,y2-uy*16-ux*10);ctx.stroke();
    }
    if(a.destination){ctx.globalAlpha=.5;ctx.lineWidth=1.3;ctx.beginPath();segment(ctx,a.x,a.y,a.destination.x,a.destination.y);ctx.stroke();}
  }
}
export function drawAbilityGround(ctx,game,options={}){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
  drawSpecialistBossGround(ctx,game,options);
  // Paint active interiors first, then every warning/boundary. A large friendly
  // field cannot cover a hostile telegraph simply because it was cast later.
  for(const e of game.abilities?.effects||[]){
    if(e.age<e.windup||!visible(options,e))continue;
    art.drawGround(ctx,e,options);
  }
  drawSpecialGround(ctx,game,options);
  for(const e of game.abilities?.effects||[]){
    if(!visible(options,e))continue;
    if(e.age<e.windup)warning(ctx,e);else activeBoundary(ctx,e);
  }
  ctx.restore();
}
export function drawAbilityProjectiles(ctx,game,options={}){
  const visualOptions={...options,hasBurstsRuntime:Array.isArray(game.abilities?.visualBursts)};
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
  for(const e of game.abilities?.effects||[]){
    if(!visible(options,e,e.abilityId==='meteor'?260:0))continue;
    if(e.age<e.windup)art.drawWindupAir(ctx,e,visualOptions);else art.drawActiveAir(ctx,e,visualOptions);
  }
  for(const burst of game.abilities?.visualBursts||[])if(visible(options,burst,burst.abilityId==='storm'||burst.abilityId==='lightning'?250:0))art.drawBurst(ctx,burst,visualOptions);
  art.drawStatuses(ctx,game,options);
  ctx.restore();
}
