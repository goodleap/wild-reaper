const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
// Unit geometry is shared by every projectile; only the rigid transform changes.
const shapes={
  body:[['moveTo',-.36,-.92],['bezierCurveTo',.26,-.72,.62,-.3,.62,0],['bezierCurveTo',.62,.3,.26,.72,-.36,.92],['bezierCurveTo',-.13,.5,.16,.28,.16,0],['bezierCurveTo',.16,-.28,-.13,-.5,-.36,-.92]],
  core:[['moveTo',-.36,-.92],['bezierCurveTo',.26,-.72,.62,-.3,.62,0],['bezierCurveTo',.62,.3,.26,.72,-.36,.92],['bezierCurveTo',.04,.52,.43,.25,.43,0],['bezierCurveTo',.43,-.25,.04,-.52,-.36,-.92]],
  edge:[['moveTo',-.36,-.92],['bezierCurveTo',.26,-.72,.62,-.3,.62,0],['bezierCurveTo',.62,.3,.26,.72,-.36,.92],['bezierCurveTo',.2,.64,.56,.27,.56,0],['bezierCurveTo',.56,-.27,.2,-.64,-.36,-.92]],
  tail:[['moveTo',-.36,-.86],['bezierCurveTo',-.11,-.46,.12,-.24,.12,0],['bezierCurveTo',.12,.24,-.11,.46,-.36,.86],['bezierCurveTo',-.53,.43,-.77,.24,-1.12,0],['bezierCurveTo',-.77,-.24,-.53,-.43,-.36,-.86]],
};
const cached=typeof Path2D==='function'?Object.fromEntries(Object.entries(shapes).map(([name,commands])=>{
  const path=new Path2D();for(const [method,...args] of commands)path[method](...args);path.closePath();return[name,path];
})):null;
function fillShape(ctx,name,color,alpha){
  ctx.fillStyle=color;ctx.globalAlpha=alpha;
  if(cached){ctx.fill(cached[name]);return;}
  ctx.beginPath();for(const command of shapes[name])ctx[command[0]](...command.slice(1));ctx.closePath();ctx.fill();
}

export function drawSwordEnergy(ctx,wave,options={}){
  if(wave.type&&wave.type!=='swordEnergy')return false;
  if(wave.done||wave.delay>0||!(wave.life>0&&wave.maxLife>0))return true;
  const {reduced=false,dense=false}=options,r=clamp(finite(wave.r,20),4,96);
  const age=Math.max(0,finite(wave.age,wave.maxLife-wave.life));
  const alpha=clamp(age/.018)*clamp(wave.life/.07),heavy=wave.branch==='heavy'||wave.branch==='cleave';
  if(alpha<=0)return true;
  ctx.save();ctx.translate(finite(wave.x,0),finite(wave.y,0));ctx.rotate(finite(wave.angle,0));ctx.scale(r,r);ctx.shadowBlur=0;
  if(!reduced&&!dense)fillShape(ctx,'tail',heavy?'#c69457':'#8eb9b6',alpha*.16);
  fillShape(ctx,'body',heavy?'#d9b275':'#85c9ce',alpha*(reduced?.62:.78));
  fillShape(ctx,'core',heavy?'#f6dba4':'#cbefed',alpha*.86);
  fillShape(ctx,'edge',heavy?'#fff2d0':'#effff8',alpha*.95);
  ctx.restore();return true;
}
