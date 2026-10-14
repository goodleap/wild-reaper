const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const frost=new Set(['frostbolt','frostRing']);
const fire=new Set(['fireball','flameStream','shortFlame','meteor']);
const colorFor=id=>frost.has(id)?'#a8e4ff':fire.has(id)?'#ffb063':id==='domain'||id==='vineTrap'?'#acd88c':id==='vortex'?'#c5b2ff':id==='tidalWave'||id==='waterBolt'?'#8cddd9':'#e5d7ae';
const visible=(options,item)=>!options.visible||options.visible(item);
function circle(ctx,x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,TAU);}
function line(ctx,points){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.stroke();}
function shape(ctx,e,r){
  const p=e.parameters,x=e.x,y=e.y+e.groundOffset;
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
function drawSpecialGround(ctx,game,options){
  for(const enemy of game.enemies||[]){
    if(enemy.hp<=0||!visible(options,enemy))continue;
    for(const mark of enemy.specialMarks||[]){
      const color=mark.kind==='ice'?'#a8e4ff':'#ff9e63',ready=mark.delay!==null&&mark.delay!==undefined;
      ctx.globalAlpha=ready?.2:.11;ctx.fillStyle=color;circle(ctx,mark.x,mark.y,mark.r);ctx.fill();
      ctx.globalAlpha=ready?.85:.45;ctx.strokeStyle=color;ctx.lineWidth=ready?2.5:1.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(mark.x-mark.r*.35,mark.y);ctx.lineTo(mark.x+mark.r*.35,mark.y);ctx.moveTo(mark.x,mark.y-mark.r*.35);ctx.lineTo(mark.x,mark.y+mark.r*.35);ctx.stroke();
    }
    const a=enemy.specialAttack;if(!a||!(a.phase==='windup'||a.phase==='strikes'||a.kind==='leap'&&a.phase==='rush'))continue;
    const progress=clamp(1-a.life/Math.max(.01,a.maxLife),0,1);ctx.strokeStyle='#f3ba8b';ctx.fillStyle='#f3a777';
    for(const c of a.circles||[]){if(c.done)continue;ctx.globalAlpha=.12+progress*.13;circle(ctx,c.x,c.y,c.r);ctx.fill();ctx.globalAlpha=.8;ctx.lineWidth=2;ctx.stroke();circle(ctx,c.x,c.y,c.r*progress);ctx.globalAlpha=.35;ctx.stroke();}
    if(a.length>0){
      const ux=Math.cos(a.angle),uy=Math.sin(a.angle),r=a.r||enemy.r,x2=a.x+ux*a.length,y2=a.y+uy*a.length;
      ctx.beginPath();ctx.moveTo(a.x-uy*r,a.y+ux*r);ctx.lineTo(x2-uy*r,y2+ux*r);ctx.lineTo(x2+uy*r,y2-ux*r);ctx.lineTo(a.x+uy*r,a.y-ux*r);ctx.closePath();ctx.globalAlpha=.14+progress*.1;ctx.fill();ctx.globalAlpha=.85;ctx.lineWidth=2;ctx.stroke();
      ctx.lineWidth=3;line(ctx,[[x2-ux*16-uy*10,y2-uy*16+ux*10],[x2,y2],[x2-ux*16+uy*10,y2-uy*16-ux*10]]);
    }
    if(a.destination){ctx.globalAlpha=.75;ctx.lineWidth=3;line(ctx,[[a.x,a.y],[a.destination.x,a.destination.y]]);}
  }
}
export function drawAbilityGround(ctx,game,options={}){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  drawSpecialGround(ctx,game,options);
  for(const e of game.abilities?.effects||[]){
    if(!visible(options,e))continue;
    const p=e.parameters,warning=e.age<e.windup,active=e.age-e.windup,color=colorFor(e.abilityId);
    if(!warning&&e.shape==='projectile')continue;
    const radius=e.shape==='ring'&&!warning?p.radius*clamp(active/p.duration,0,1):p.radius;
    ctx.strokeStyle=warning&&e.hostile?'#f5a180':color;ctx.fillStyle=ctx.strokeStyle;
    shape(ctx,e,radius);ctx.globalAlpha=warning?.1+.1*clamp(e.age/e.windup,0,1):.1;ctx.fill();ctx.globalAlpha=warning?.8:.85;ctx.lineWidth=e.shape==='wave'?8:warning?2:3;ctx.stroke();
    if(warning&&['zone','field','ring'].includes(e.shape)){
      circle(ctx,e.x,e.y+e.groundOffset,p.radius*clamp(e.age/e.windup,0,1));ctx.globalAlpha=.4;ctx.lineWidth=1.5;ctx.stroke();
    }
    if(!warning&&e.shape==='field'){
      ctx.globalAlpha=.5;ctx.lineWidth=1.5;
      for(let i=0;i<5;i++){const a=i*TAU/5+active*(e.abilityId==='vortex'?1:-.3),x=e.x+Math.cos(a)*radius*.68,y=e.y+e.groundOffset+Math.sin(a)*radius*.68;
        if(e.abilityId==='vortex'){ctx.beginPath();ctx.arc(e.x,e.y+e.groundOffset,radius*(.25+i*.12),a,a+1.3);ctx.stroke();}
        else line(ctx,[[x-6,y+6],[x,y-7],[x+5,y+2]]);
      }
    }
    if(!warning&&e.shape==='cone'){
      ctx.globalAlpha=.65;ctx.lineWidth=4;
      for(let i=-1;i<=1;i++){const a=e.angle+i*p.spread*.65,near=20+(active*140%35),far=p.range*.88;line(ctx,[[e.x+Math.cos(a)*near,e.y+e.groundOffset+Math.sin(a)*near],[e.x+Math.cos(a)*far,e.y+e.groundOffset+Math.sin(a)*far]]);}
    }
  }
  ctx.restore();
}
export function drawAbilityProjectiles(ctx,game,options={}){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(const e of game.abilities?.effects||[]){
    if(e.age<e.windup||!visible(options,e))continue;
    if(e.shape==='zone'&&['lightning','storm','meteor','stoneLob'].includes(e.abilityId)){
      const elapsed=e.age-e.windup,fade=clamp(e.remaining/e.parameters.duration,0,1),y=e.y+e.groundOffset;
      ctx.globalAlpha=fade;
      if(e.abilityId==='lightning'||e.abilityId==='storm'){
        const top=Math.min(y-220,options.screenTopWorldY??y-220),span=y-top;ctx.strokeStyle='#bce5ff';ctx.lineWidth=5;
        const points=[[e.x-14,top],[e.x+10,top+span*.32],[e.x-9,top+span*.55],[e.x+6,top+span*.74],[e.x,y]];line(ctx,points);ctx.strokeStyle='#effaff';ctx.lineWidth=2;line(ctx,points);
      }else{
        const r=e.parameters.radius;ctx.strokeStyle=e.abilityId==='meteor'?'#ffc18a':'#d8c3a6';ctx.lineWidth=4;circle(ctx,e.x,y,r*(.35+elapsed/e.parameters.duration*.65));ctx.stroke();
        for(let i=0;i<5;i++){const a=i*TAU/5+e.id;ctx.fillStyle=ctx.strokeStyle;circle(ctx,e.x+Math.cos(a)*r*.42,y+Math.sin(a)*r*.3,3);ctx.fill();}
      }
      continue;
    }
    if(e.shape!=='projectile')continue;
    const r=e.parameters.radius,color=colorFor(e.abilityId);ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle);ctx.globalAlpha=1;
    ctx.strokeStyle=color;ctx.lineWidth=r*.8;ctx.globalAlpha=.4;line(ctx,[[-r*3.2,0],[-r*.7,0]]);ctx.globalAlpha=1;
    if(frost.has(e.abilityId)){
      ctx.fillStyle='#daefff';ctx.strokeStyle='#77c5e8';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(r*1.7,0);ctx.lineTo(-r*.5,-r*.7);ctx.lineTo(-r,0);ctx.lineTo(-r*.5,r*.7);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#fff5e0';line(ctx,[[-r*.5,0],[r,0]]);
    }else if(fire.has(e.abilityId)){
      ctx.fillStyle='#f9804d';ctx.beginPath();ctx.moveTo(-r*2.2,0);ctx.quadraticCurveTo(-r,-r*1.2,r*.6,-r*.7);ctx.quadraticCurveTo(r*1.7,0,r*.6,r*.7);ctx.quadraticCurveTo(-r,r*1.2,-r*2.2,0);ctx.fill();ctx.fillStyle='#fff0b8';circle(ctx,r*.25,0,r*.55);ctx.fill();
    }else if(e.abilityId==='swords'||e.abilityId==='swordEnergy'||e.abilityId==='runeArrow'){
      ctx.fillStyle='#e9e6cc';ctx.strokeStyle='#a8b4ab';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(r*2.6,0);ctx.lineTo(r*1.8,-r*.35);ctx.lineTo(-r,-r*.35);ctx.lineTo(-r,r*.35);ctx.lineTo(r*1.8,r*.35);ctx.closePath();ctx.fill();ctx.stroke();
    }else{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(-r*.5,0,r,-1.1,1.1);ctx.stroke();}
    ctx.restore();
  }
  for(const [entity,s] of game.abilities?.statuses||[]){
    if(entity.hp<=0||!visible(options,entity))continue;const now=game.abilities.clock;
    if(s.shieldUntil>now&&s.shield>0){ctx.strokeStyle='#bce7df';ctx.lineWidth=2;ctx.globalAlpha=.75;circle(ctx,entity.x,entity.y,(entity.r||14)+8);ctx.stroke();}
    if(s.frozenUntil>now){ctx.strokeStyle='#b9eaff';ctx.lineWidth=2;ctx.globalAlpha=.8;const r=(entity.r||14)+3;ctx.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6,x=entity.x+Math.cos(a)*r,y=entity.y+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();}
    else if(s.burn){ctx.fillStyle='#ffb66e';ctx.globalAlpha=.8;circle(ctx,entity.x-5,entity.y-(entity.r||14),2.5);ctx.fill();circle(ctx,entity.x+5,entity.y-(entity.r||14)-3,2);ctx.fill();}
  }
  ctx.restore();
}
