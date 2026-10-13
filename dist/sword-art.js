// All poses derive from effect life, so a paused frame is pixel-stable. The
// blade and its short ribbon are world-space geometry with no canvas caches.
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const ease=value=>1-(1-clamp(value))**3;
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;

function blade(ctx,length,width,alpha,heavy){
  ctx.globalAlpha=alpha;ctx.lineJoin='round';
  // The grip, brass guard, steel bevel and fine bright edge remain legible at
  // native phone scale. The blade is an object, not only an arc of magic.
  ctx.fillStyle='#28352f';ctx.beginPath();ctx.moveTo(3,-2.8);ctx.lineTo(17,-2.8);ctx.lineTo(18,2.8);ctx.lineTo(3,2.8);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#a7ac86';ctx.lineWidth=1;ctx.beginPath();
  for(let x=5;x<15;x+=3){ctx.moveTo(x,-2.2);ctx.lineTo(x+1.2,2.2);}ctx.stroke();
  ctx.fillStyle='#776942';ctx.beginPath();ctx.moveTo(14,-width-4);ctx.lineTo(19,-width-2);ctx.lineTo(21,-3);ctx.lineTo(21,3);ctx.lineTo(19,width+2);ctx.lineTo(14,width+4);ctx.lineTo(16,0);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#e6d69e';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(14.5,-width-3.6);ctx.lineTo(18.7,-width-1.8);ctx.lineTo(20,0);ctx.lineTo(18.7,width+1.8);ctx.stroke();
  ctx.fillStyle='#405b5b';ctx.strokeStyle='#243c3a';ctx.lineWidth=1.6;
  ctx.beginPath();ctx.moveTo(19,-width);ctx.lineTo(length-12,-width*.76);ctx.lineTo(length,0);ctx.lineTo(length-12,width*.76);ctx.lineTo(19,width);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=heavy?'#c3d4ce':'#d6e6de';ctx.beginPath();ctx.moveTo(20,-width+.7);ctx.lineTo(length-12,-width*.76+.4);ctx.lineTo(length-.8,0);ctx.lineTo(21,0);ctx.closePath();ctx.fill();
  ctx.fillStyle='#77968e';ctx.beginPath();ctx.moveTo(21,0);ctx.lineTo(length-.8,0);ctx.lineTo(length-12,width*.76-.5);ctx.lineTo(20,width-.7);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#f5fae8';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(20,-width+.3);ctx.lineTo(length-12,-width*.76);ctx.lineTo(length,0);ctx.stroke();
  ctx.strokeStyle='#bdcfc4';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(26,0);ctx.lineTo(length-7,0);ctx.stroke();
  ctx.fillStyle='#d7ce8c';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(3.5,-3.1);ctx.lineTo(6.4,0);ctx.lineTo(3.5,3.1);ctx.closePath();ctx.fill();
}

function ribbon(ctx,start,end,radius,width,alpha,color){
  if(end-start<.015||alpha<=0)return;
  const steps=12;ctx.beginPath();
  for(let i=0;i<=steps;i++){
    const f=i/steps,a=start+(end-start)*f,r=radius-width*(1-f)*.12;
    if(i===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  for(let i=steps;i>=0;i--){const f=i/steps,a=start+(end-start)*f,r=radius-width*Math.sin(f*Math.PI*.5);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
  ctx.closePath();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fill();
}

export function drawSwordSlash(ctx,e,game={},options={}){
  if(e.type!=='swordSlash')return false;
  if(!(e.life>0&&e.maxLife>0))return true;
  const {reduced=false,dense=false}=options;
  const age=clamp(e.maxLife-e.life,0,e.maxLife),windup=clamp(finite(e.windup,.085),0,e.maxLife*.45);
  const strikeTime=Math.max(.04,Math.min(.065,(e.maxLife-windup)*.32)),swing=clamp((age-windup)/strikeTime);
  const tail=clamp((age-windup-strikeTime)/Math.max(.01,e.maxLife-windup-strikeTime));
  const radius=clamp(finite(e.r,86),26,240),arc=clamp(finite(e.arc,1.7),.25,Math.PI*1.5),angle=finite(e.angle,0);
  const heavy=e.branch==='heavy'||e.branch==='cleave',sweep=e.branch==='sweep',a0=angle-arc*.5;
  const anticipation=windup>0?clamp(age/windup):1;
  const pose=age<windup?a0-.1*Math.sin(anticipation*Math.PI*.5):a0+arc*ease(swing);
  const opacity=age<windup?.45+anticipation*.4:(1-tail)**1.4;
  const metalLength=Math.max(26,radius*.9),bladeWidth=heavy?5.6:4.1;
  ctx.save();ctx.translate(e.x,e.y);ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
  if(age>=windup){
    // A moving, tapered sector leaves the character's body and the ground
    // visible. The leading metal edge is always ahead of its own wake.
    const span=reduced?Math.min(.38,arc*.35):Math.min(arc,heavy?.72:sweep?1.24:.98);
    const end=pose,start=Math.max(a0,end-span),fade=opacity*(.75+Math.sin(swing*Math.PI)*.25);
    // Damage resolves once at the end of the anticipation. This brief full
    // cutting edge marks that exact sector before the metal follows through.
    const contact=clamp(1-(age-windup)/.035);
    if(contact>0){ctx.globalAlpha=contact*(reduced?.35:.72);ctx.strokeStyle=heavy?'#fff0cb':'#f0fbd9';ctx.lineWidth=heavy?1.8:1.1;ctx.beginPath();ctx.arc(0,0,radius*.93,a0,a0+arc);ctx.stroke();}
    if(!reduced&&!dense)ribbon(ctx,start,end,radius*.94,heavy?23:18,fade*.11,heavy?'#e6d4a1':'#dceac3');
    ribbon(ctx,start,end,radius*.93,heavy?11:8,fade*(reduced?.2:.37),heavy?'#ece0b7':'#dceecf');
    const edgeStart=Math.max(start,end-.58);
    ctx.globalAlpha=fade*.85;ctx.strokeStyle=heavy?'#fff0cb':'#f5ffe2';ctx.lineWidth=heavy?2:1.35;
    ctx.beginPath();ctx.arc(0,0,radius*.935,edgeStart,end);ctx.stroke();
    if(!dense&&!reduced){
      ctx.globalAlpha=fade*.3;ctx.lineWidth=.85;ctx.strokeStyle='#aac8ad';ctx.beginPath();ctx.arc(0,0,radius*.73,Math.max(start,end-.42),end-.035);ctx.stroke();
      if(swing>.3){
        const a=end-.16,x=Math.cos(a)*radius*.98,y=Math.sin(a)*radius*.98;
        ctx.globalAlpha=fade*.7;ctx.strokeStyle='#f6f1c7';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a+.4)*4,y+Math.sin(a+.4)*4);ctx.stroke();
      }
    }
  }
  ctx.save();ctx.rotate(pose);ctx.translate(Math.min(10,radius*.1),0);
  blade(ctx,metalLength-Math.min(10,radius*.1),bladeWidth,opacity,heavy);ctx.restore();
  ctx.restore();return true;
}
