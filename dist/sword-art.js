// Poses use attack simulation time, keeping impact, movement and pause aligned.
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};

export function swordSlashPose(e,game={},options={}){
  const actor=options.actor,owner=actor?.entity||(e.followOwner?(e.owner||game.player):null);
  const scale=clamp(finite(actor?.scale,1.1),.5,3),shape=actor?.shape;
  const age=clamp(finite(e.attackAge,e.maxLife-e.life),0,e.maxLife||.28);
  const windup=clamp(finite(e.windup,.065),0,(e.maxLife||.28)*.45);
  const hitTime=Math.max(windup+.012,finite(e.hitTime,windup+.05));
  const swingTime=(hitTime-windup)*2,swing=clamp((age-windup)/swingTime);
  const tail=clamp((age-windup-swingTime)/Math.max(.01,(e.maxLife||.28)-windup-swingTime));
  const arc=clamp(finite(e.arc,1.95),.25,Math.PI*1.5),lockedAngle=finite(e.angle,0),start=lockedAngle-arc*.5;
  const anticipation=windup>0?clamp(age/windup):1;
  const angle=age<windup?start-.065*Math.sin(anticipation*Math.PI):start+arc*smooth(swing);
  const opacity=age<windup?.2+anticipation*.75:(1-tail)**1.2;
  const sink=finite(actor?.immersion?.sink,0),bodyY=finite(options.bodyY,0);
  const x=finite(owner?.x,finite(e.x,0)),y=finite(owner?.y,finite(e.y,0))+sink+bodyY;
  // The body envelope supplies a loose near-body pivot, without a hand rig.
  // A little overlap is intentional; a northbound blade sorts behind the hood.
  const side=finite(shape?.halfWidth,29)*.47*scale;
  const vertical=(Math.sin(angle)<0?finite(shape?.top,35)*.57:finite(shape?.foot,18)*.65)*scale;
  const grip=1/Math.sqrt((Math.cos(angle)/side)**2+(Math.sin(angle)/vertical)**2);
  const meleeRange=clamp(finite(e.meleeRange,e.r||92),26,240),radius=clamp(finite(e.r,meleeRange),meleeRange,300);
  const heavy=e.branch==='heavy'||e.branch==='cleave',energyRank=clamp(Math.floor(finite(e.energyRank,0)),0,3);
  const length=clamp(meleeRange*.74,27,130),tip=grip+length;
  return {x,y,sortY:finite(actor?.footY,finite(e.groundY,y+18*scale))+Math.sin(angle)*8*scale,angle,lockedAngle,start,arc,age,windup,hitTime,swing,tail,opacity,grip,length,tip,meleeRange,radius,energyRank,heavy,sweep:e.branch==='sweep',scale};
}

function blade(ctx,length,width,alpha,heavy){
  ctx.globalAlpha=alpha;ctx.lineJoin='round';
  ctx.fillStyle='#29392f';ctx.beginPath();ctx.moveTo(1,-1.9);ctx.lineTo(10,-1.9);ctx.lineTo(11,1.9);ctx.lineTo(1,1.9);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#aaa78b';ctx.lineWidth=.75;ctx.beginPath();for(let x=3;x<9;x+=2.7){ctx.moveTo(x,-1.4);ctx.lineTo(x+.8,1.4);}ctx.stroke();
  ctx.fillStyle='#938557';ctx.strokeStyle='#d6cc9b';ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(9,-width-1.6);ctx.lineTo(12,-width-1);ctx.lineTo(13,width+1);ctx.lineTo(9,width+1.6);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#4b6260';ctx.strokeStyle='#233c35';ctx.lineWidth=1.15;
  ctx.beginPath();ctx.moveTo(12,-width);ctx.lineTo(length-9,-width*.66);ctx.lineTo(length,0);ctx.lineTo(length-9,width*.66);ctx.lineTo(12,width);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=heavy?'#cbd7d0':'#dae6df';ctx.beginPath();ctx.moveTo(13,-width+.4);ctx.lineTo(length-9,-width*.66+.25);ctx.lineTo(length-.5,0);ctx.lineTo(13,0);ctx.closePath();ctx.fill();
  ctx.fillStyle='#859e96';ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(length-.5,0);ctx.lineTo(length-9,width*.66-.3);ctx.lineTo(13,width-.4);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#f6f6df';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(13,-width+.15);ctx.lineTo(length-9,-width*.66);ctx.lineTo(length,0);ctx.stroke();
  ctx.fillStyle='#c8bd87';ctx.beginPath();ctx.moveTo(-1,0);ctx.lineTo(1.5,-2.4);ctx.lineTo(4,0);ctx.lineTo(1.5,2.4);ctx.closePath();ctx.fill();
}

function crescent(ctx,start,end,radius,width,alpha,color){
  if(end-start<.015||alpha<=0)return;
  const steps=12;ctx.beginPath();
  for(let i=0;i<=steps;i++){const a=start+(end-start)*i/steps;ctx[i?'lineTo':'moveTo'](Math.cos(a)*radius,Math.sin(a)*radius);}
  for(let i=steps;i>=0;i--){const f=i/steps,a=start+(end-start)*f,r=radius-width*Math.sin(Math.PI*f);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
  ctx.closePath();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fill();
}

export function drawSwordSlash(ctx,e,game={},options={}){
  if(e.type!=='swordSlash')return false;
  if(!(e.life>0&&e.maxLife>0))return true;
  const {reduced=false,dense=false}=options,p=options.pose||swordSlashPose(e,game,options);
  const {age,windup,angle,start,arc,opacity,grip,length,tip,heavy,energyRank,radius}=p;
  ctx.save();ctx.translate(p.x,p.y);ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
  if(age>=windup&&p.swing>0){
    const from=Math.max(start,angle-(reduced?.12:heavy?.27:.22));
    // Plain steel leaves only a very short, muted motion trace.
    crescent(ctx,from,angle,tip,heavy?4:2.8,opacity*(reduced?.1:.19),'#d8e4da');
    if(!dense&&!reduced){ctx.globalAlpha=opacity*.28;ctx.strokeStyle='#d4e0d4';ctx.lineWidth=.85;ctx.beginPath();ctx.arc(0,0,tip-1,from,angle);ctx.stroke();}
    if(energyRank>0){
      const span=Math.min(arc,heavy?.95:p.sweep?1.65:1.25),end=angle+.045;
      const begin=Math.max(start-.02,end-span),rise=clamp((age-windup)/.025),alpha=opacity*rise;
      const width=(heavy?14:9)+energyRank*2.5,edge=radius*.975;
      if(!reduced&&!dense)crescent(ctx,begin,end,edge,width*1.3,alpha*.13,heavy?'#eacc88':'#a6d9df');
      crescent(ctx,begin,end,edge,width,alpha*(reduced?.34:.55),heavy?'#f0d59b':'#bfeaf0');
      crescent(ctx,begin+.04,end-.012,edge-.65,Math.max(2,width*.3),alpha*.76,heavy?'#fff0c4':'#ecffff');
      if(!dense&&!reduced){ctx.globalAlpha=alpha*.65;ctx.strokeStyle=heavy?'#fff1d2':'#f1ffff';ctx.lineWidth=heavy?1.8:1.15;ctx.beginPath();ctx.arc(0,0,edge,begin+.05,end-.025);ctx.stroke();}
    }
  }
  ctx.save();ctx.rotate(angle);ctx.translate(grip,0);blade(ctx,length,heavy?3.6:2.45,opacity,heavy);ctx.restore();
  ctx.restore();return true;
}
