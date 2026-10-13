// Player-sized defensive artwork: one quiet ready marker, crisp translucent
// shell facets while active, and a bounded set of short-lived fragments.
const TAU=Math.PI*2;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const ease=value=>1-(1-clamp(value))**3;
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const FRAGMENTS=Object.freeze(Array.from({length:8},(_,i)=>{
  const a=i*TAU/8+.19;
  return Object.freeze({x:Math.cos(a),y:Math.sin(a),spin:(i%2?1:-1)*(.5+i*.11),size:3+(i%3)*.7});
}));

function outline(ctx,scale=1){
  ctx.moveTo(0,-43*scale);
  ctx.bezierCurveTo(21*scale,-42*scale,33*scale,-21*scale,32*scale,-3*scale);
  ctx.bezierCurveTo(32*scale,15*scale,17*scale,27*scale,0,29*scale);
  ctx.bezierCurveTo(-17*scale,27*scale,-32*scale,15*scale,-32*scale,-3*scale);
  ctx.bezierCurveTo(-33*scale,-21*scale,-21*scale,-42*scale,0,-43*scale);ctx.closePath();
}
function leaf(ctx,x,y,size){
  ctx.moveTo(x,y-size);ctx.quadraticCurveTo(x+size*.85,y-size*.15,x,y+size);ctx.quadraticCurveTo(x-size*.85,y-size*.15,x,y-size);ctx.closePath();
}
function facet(ctx,side,y,alpha){
  const x=side*(y<0?27:23);ctx.globalAlpha=alpha;ctx.fillStyle='#b8eadc';ctx.strokeStyle='#d6f4df';ctx.lineWidth=.8;
  ctx.beginPath();ctx.moveTo(x,y-9);ctx.lineTo(x+side*4,y-3);ctx.lineTo(x+side*2,y+6);ctx.lineTo(x-side*5,y+9);ctx.lineTo(x-side*9,y+1);ctx.lineTo(x-side*5,y-7);ctx.closePath();ctx.fill();ctx.globalAlpha=alpha*2;ctx.stroke();
}

export function drawGuardianBarrier(ctx,game,player=game?.player,options={}){
  const state=game?.barrier;if(!state||!player||(!state.ready&&!state.active))return false;
  const {reduced=false,dense=false}=options;
  ctx.save();ctx.translate(player.x,player.y);ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0;
  if(state.active){
    const ratio=clamp(finite(state.remaining,0)/Math.max(1,finite(state.capacity,1)));
    const life=finite(state.life,2),fade=clamp(life/.22),strength=.58+ratio*.42;
    // Transparent center protects the face silhouette. Reflected light and
    // cell outlines are concentrated on the shell's outer sides.
    ctx.beginPath();outline(ctx);ctx.fillStyle='#b8eadc';ctx.globalAlpha=fade*.035;ctx.fill();
    ctx.strokeStyle='#669e92';ctx.globalAlpha=fade*.4*strength;ctx.lineWidth=2.7;ctx.stroke();
    ctx.strokeStyle='#d7f5de';ctx.globalAlpha=fade*.83*strength;ctx.lineWidth=1.05;ctx.stroke();
    ctx.globalAlpha=fade*.9*strength;ctx.strokeStyle='#f0ffe6';ctx.lineWidth=1.55;
    ctx.beginPath();ctx.moveTo(2,-42);ctx.bezierCurveTo(16,-40,25,-30,29,-18);ctx.moveTo(-30,-7);ctx.bezierCurveTo(-30,4,-23,17,-12,22);ctx.stroke();
    facet(ctx,1,-12,fade*.11*strength);facet(ctx,-1,4,fade*.09*strength);
    if(!dense){facet(ctx,-1,-21,fade*.065*strength);facet(ctx,1,11,fade*.075*strength);}
    ctx.globalAlpha=fade*.75;ctx.fillStyle='#e8f8c5';ctx.beginPath();leaf(ctx,0,26,3.5);ctx.fill();
    // Remaining capacity changes the tiny basal sigils, never a floating bar.
    ctx.strokeStyle='#c0e5cc';ctx.lineWidth=1;ctx.globalAlpha=fade*.7;
    ctx.beginPath();for(let i=0;i<3;i++)if(ratio>(i+.15)/3){const x=(i-1)*7;ctx.moveTo(x-2,23-Math.abs(x)*.12);ctx.lineTo(x,25-Math.abs(x)*.12);ctx.lineTo(x+2,23-Math.abs(x)*.12);}ctx.stroke();
  }else{
    const bob=reduced?0:Math.sin(finite(game._clock,0)*2.3)*.65;
    ctx.translate(26,-24+bob);ctx.globalAlpha=.9;ctx.fillStyle='#293f38';ctx.strokeStyle='#a8cfa9';ctx.lineWidth=1;
    ctx.beginPath();leaf(ctx,0,0,6.5);ctx.fill();ctx.stroke();
    ctx.fillStyle='#d8eeb9';ctx.beginPath();leaf(ctx,0,-.4,3.4);ctx.fill();
    ctx.strokeStyle='#e7f7cf';ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(0,2.5);ctx.stroke();
  }
  ctx.restore();return true;
}

export function drawBarrierEffect(ctx,e,game={},options={}){
  if(e.type!=='barrierTrigger'&&e.type!=='barrierBreak')return false;
  if(!(e.life>0&&e.maxLife>0))return true;
  const {reduced=false,dense=false}=options,t=clamp(1-e.life/e.maxLife),fade=(1-t)**1.6,breaking=e.type==='barrierBreak';
  ctx.save();ctx.translate(e.x,e.y);ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
  if(!breaking){
    ctx.beginPath();outline(ctx,reduced?1:.87+ease(t)*.13);ctx.strokeStyle='#e9ffe0';ctx.lineWidth=1.3;ctx.globalAlpha=fade*.8;ctx.stroke();
    ctx.globalAlpha=fade*.055;ctx.fillStyle='#cceccb';ctx.fill();
    if(!reduced){ctx.globalAlpha=fade*.58;ctx.strokeStyle='#ecf5c7';ctx.lineWidth=1;ctx.beginPath();for(let side=-1;side<=1;side+=2){ctx.moveTo(side*(26+t*7),-21);ctx.lineTo(side*(29+t*7),-24);ctx.moveTo(side*(23+t*7),14);ctx.lineTo(side*(26+t*7),17);}ctx.stroke();}
  }else{
    const travel=reduced?.35:ease(t),count=dense||reduced?4:8;
    for(let i=0;i<count;i++){
      const f=FRAGMENTS[i*(count===4?2:1)],x=f.x*(28+travel*13),y=-7+f.y*(33+travel*10)+(reduced?0:t*t*9);
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(f.y,f.x)+(reduced?0:t*f.spin));
      ctx.globalAlpha=fade*.55;ctx.fillStyle='#bfe4cf';ctx.strokeStyle='#edf9dc';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(-f.size,0);ctx.lineTo(-f.size*.1,-f.size*1.1);ctx.lineTo(f.size*.8,-f.size*.2);ctx.lineTo(f.size*.4,f.size*.85);ctx.closePath();ctx.fill();ctx.globalAlpha=fade*.8;ctx.stroke();ctx.restore();
    }
  }
  ctx.restore();return true;
}
