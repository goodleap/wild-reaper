// World-space samples belong to the simulated weapon, never to the camera or
// a render frame. A fixed ring bounds both memory and drawing work per weapon.
export const TRAIL_CAPACITY=12;
const finite=Number.isFinite;
export class WeaponTrail {
  constructor(kind='arrow') {
    this.kind=kind;this.points=new Float64Array(TRAIL_CAPACITY*3);
    this.head=0;this.count=0;this.length=0;this.clock=0;
    this.maxAge=kind==='orbit'?.22:.14;this.maxLength=kind==='orbit'?92:104;
  }
  index(i){return((this.head+i)%TRAIL_CAPACITY)*3;}
  clear(){this.head=0;this.count=0;this.length=0;}
  _shift(){
    if(this.count>1){const a=this.index(0),b=this.index(1);this.length=Math.max(0,this.length-Math.hypot(this.points[b]-this.points[a],this.points[b+1]-this.points[a+1]));}
    this.head=(this.head+1)%TRAIL_CAPACITY;this.count--;
    if(!this.count)this.length=0;
  }
  add(x,y,time) {
    if(!finite(x)||!finite(y)||!finite(time)){this.clear();return;}
    if(time<this.clock-1e-8)this.clear();
    this.clock=time;
    while(this.count&&time-this.points[this.index(0)+2]>this.maxAge)this._shift();
    if(this.count){const last=this.index(this.count-1),d=Math.hypot(x-this.points[last],y-this.points[last+1]);if(d<.001)return;if(d>this.maxLength){this.clear();}}
    if(this.count===TRAIL_CAPACITY)this._shift();
    if(this.count){const last=this.index(this.count-1);this.length+=Math.hypot(x-this.points[last],y-this.points[last+1]);}
    const i=this.index(this.count++);this.points[i]=x;this.points[i+1]=y;this.points[i+2]=time;
    while(this.count>2&&this.length>this.maxLength)this._shift();
  }
  endsAt(x,y,tolerance=.01){if(!this.count)return false;const i=this.index(this.count-1);return Math.hypot(x-this.points[i],y-this.points[i+1])<=tolerance;}
}

// One tapered ribbon per layer instead of one translucent shape per segment.
// Corners retain their recorded bend; there is no invented circular arc and no
// smoothing curve that could cut across a ricochet's actual path.
function ribbon(ctx,t,start,end,now,width) {
  const p=t.points,total=end-start;
  ctx.beginPath();
  for(let side=1;side>=-1;side-=2)for(let step=0;step<=total;step++){
    const n=side===1?start+step:end-step,i=t.index(n),a=t.index(Math.max(start,n-1)),b=t.index(Math.min(end,n+1));
    const dx=p[b]-p[a],dy=p[b+1]-p[a+1],d=Math.hypot(dx,dy)||1;
    const taper=Math.min(1,(n-start)/Math.max(1,total)*1.3)*Math.max(0,1-(now-p[i+2])/t.maxAge);
    const x=p[i]-dy/d*width*taper*side,y=p[i+1]+dx/d*width*taper*side;
    if(side===1&&step===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.fill();
}

export function drawWeaponTrail(ctx,weapon,{time,reduced=false,dense=false}={}) {
  const t=weapon.trail;if(!t||t.count<2)return false;
  const now=finite(time)?time:t.clock;let start=0;
  while(start<t.count&&now-t.points[t.index(start)+2]>t.maxAge)start++;
  if(t.count-start<2)return false;
  const end=t.count-1,orbit=t.kind==='orbit',color=orbit?(weapon.evolved?'#efd390':'#c5e4ce'):weapon.color||'#cfe9ab';
  ctx.save();ctx.shadowBlur=0;
  if(!reduced&&!dense){ctx.fillStyle=color;ctx.globalAlpha=.19;ribbon(ctx,t,start,end,now,orbit?5.6:3.7);}
  ctx.fillStyle=orbit?(weapon.evolved?'#fff2c2':'#e9f5da'):'#f0f5cf';ctx.globalAlpha=reduced?.44:.64;
  ribbon(ctx,t,start,end,now,orbit?1.65:1.05);
  ctx.restore();return true;
}
