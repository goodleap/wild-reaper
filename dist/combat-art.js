import { getStormGeometry, stormAge } from './storm-geometry.js';
// Canvas-native combat artwork. Geometry is generated once per live effect,
// then aged exclusively by simulation life: pauses never keep particles moving.
const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>1-(1-clamp(v))**3;
function noise(seed,index){let x=(Math.imul((seed|0)^0x9e3779b9,index+27)^Math.imul(index+11,0x85ebca6b))|0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return((x^(x>>>16))>>>0)/4294967296;}
function effectSeed(e){return Number(e.seed)||((e.x*19.1+e.y*41.7+(e.x2||0)*7.9+(e.y2||0)*11.3)*97)|0;}
function path(ctx,points){ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);}
function segment(ctx,x1,y1,x2,y2){ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);}
function polygon(ctx,points){ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();}
function bolt(start,end,seed,count=13,roughness=.09){
  const points=[start],dx=end.x-start.x,dy=end.y-start.y,d=Math.hypot(dx,dy)||1;
  for(let i=1;i<count;i++){const f=i/count,taper=Math.sin(Math.PI*f)**.65,offset=(noise(seed,i)-.5)*Math.min(35,d*roughness)*2*taper;points.push({x:start.x+dx*f-dy/d*offset,y:start.y+dy*f+dx/d*offset});}
  points.push(end);return points;
}
function leaf(ctx,size){ctx.beginPath();ctx.moveTo(-size,0);ctx.quadraticCurveTo(-size*.15,-size*.8,size,0);ctx.quadraticCurveTo(size*.1,size*.65,-size,0);ctx.closePath();ctx.fill();}
function shard(ctx,size){ctx.beginPath();ctx.moveTo(-size*.65,-size*.35);ctx.lineTo(size*.45,-size*.6);ctx.lineTo(size*.8,size*.25);ctx.lineTo(-size*.2,size*.55);ctx.closePath();ctx.fill();}
const ELECTRIC=new Set(['lightning','companionLightning','conduction','storm']);
const EARTH=new Set(['pulse','echo','companionPulse','companionEcho']);
const PALETTES={
  arrow:['#d5e6af','#f6f4d4','#849f70'],orbit:['#d9e3b3','#fff6d3','#9dab73'],
  electric:['#86caff','#f4fcff','#6b92cc'],earth:['#c1c9a0','#e6e8c5','#7d927b'],
  magic:['#ccb5e6','#f1e3fd','#a28cb8']
};
function palette(source){return ELECTRIC.has(source)?PALETTES.electric:EARTH.has(source)?PALETTES.earth:source==='orbit'?PALETTES.orbit:source==='super'?PALETTES.magic:PALETTES.arrow;}

export class CombatArt {
  constructor(){this.lightning=new WeakMap();this.quakes=new WeakMap();this.impacts=new WeakMap();this.defeats=new WeakMap();this.storms=new WeakMap();}

  drawArrow(ctx,b,{time=0,reduced=false}={}){
    const angle=Number.isFinite(b.angle)?b.angle:Math.atan2(b.vy||0,b.vx||1),piercing=b.branch==='pierce',ricochet=b.branch==='ricochet';
    const color=piercing?'#a9eed8':ricochet?'#f0d89b':'#cfe9ab';
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(angle);ctx.lineJoin='round';
    if(!reduced){
      // A tapered ribbon, rather than a line, keeps velocity readable at 640px/s.
      ctx.globalAlpha=.12;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-45,0);ctx.lineTo(-7,-4.6);ctx.lineTo(6,0);ctx.lineTo(-7,4.6);ctx.closePath();ctx.fill();
      ctx.globalAlpha=.34;ctx.beginPath();ctx.moveTo(-36,0);ctx.lineTo(-5,-1.8);ctx.lineTo(7,0);ctx.lineTo(-5,1.8);ctx.closePath();ctx.fill();
      ctx.globalAlpha=.55;ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();segment(ctx,-31,0,-12,0);ctx.stroke();
    }
    ctx.globalAlpha=1;ctx.strokeStyle='#34483a';ctx.lineWidth=2.8;ctx.beginPath();segment(ctx,-12,0,7,0);ctx.stroke();
    ctx.strokeStyle='#e5d8ac';ctx.lineWidth=1.2;ctx.stroke();
    // Two feather vanes, a dark metal bevel and a bright cutting edge.
    ctx.fillStyle=ricochet?'#c8b580':'#abc2a1';ctx.beginPath();polygon(ctx,[[-8,0],[-15,-4],[-19,-4],[-13,0],[-19,4],[-15,4]]);ctx.fill();
    ctx.strokeStyle='#e2e8ca';ctx.lineWidth=.75;ctx.beginPath();segment(ctx,-17,-3,-12,-1);segment(ctx,-17,3,-12,1);ctx.stroke();
    ctx.fillStyle='#476e64';ctx.beginPath();polygon(ctx,[[5,-4],[14,0],[5,4],[7,0]]);ctx.fill();
    ctx.fillStyle=ricochet?'#fff0b8':piercing?'#d6ffec':'#f1f6cf';ctx.beginPath();polygon(ctx,[[5,-4],[14,0],[7,0]]);ctx.fill();
    ctx.strokeStyle=color;ctx.lineWidth=.8;ctx.beginPath();segment(ctx,5,-4,14,0);ctx.stroke();
    if(piercing){ctx.globalAlpha=.65;ctx.strokeStyle='#c3ffee';ctx.lineWidth=.8;ctx.beginPath();segment(ctx,-7,-3,1,-3);segment(ctx,-7,3,1,3);ctx.stroke();}
    ctx.restore();
  }

  drawEffect(ctx,e,{reduced=false,dense=false}={}){
    const handled=e.type==='lightning'||e.type==='conduction'||e.type==='hit'||e.type==='defeat'||e.type==='arrowRicochet'||(e.type==='ring'&&e.quake);
    if(!handled)return false;
    if(!(e.life>0)||!(e.maxLife>0))return true;
    const progress=clamp(1-e.life/e.maxLife);
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0;
    if(e.type==='lightning'||e.type==='conduction')this._lightning(ctx,e,progress,reduced,dense);
    else if(e.type==='ring')this._quake(ctx,e,progress,reduced,dense);
    else if(e.type==='hit')this._hit(ctx,e,progress,reduced,dense);
    else if(e.type==='defeat')this._defeat(ctx,e,progress,reduced,dense);
    else this._ricochet(ctx,e,progress,reduced);
    ctx.restore();return true;
  }

  _lightningGeometry(e){
    if(this.lightning.has(e))return this.lightning.get(e);
    const seed=effectSeed(e),end={x:e.x2??e.x,y:e.y2??e.y},start={x:e.x,y:e.y},d=Math.hypot(end.x-start.x,end.y-start.y),main=bolt(start,end,seed,Math.min(19,Math.max(7,Math.ceil(d/16))),.085),branches=[],sparks=[];
    for(let i=0;i<3;i++){
      const index=Math.min(main.length-2,2+Math.floor((main.length-4)*(i+.35)/3)),origin=main[index],a=Math.atan2(end.y-start.y,end.x-start.x)+(noise(seed,i+41)>.5?1:-1)*(.65+noise(seed,i+42)*.6),length=Math.min(35,d*.17)*(noise(seed,i+43)*.5+.7);
      branches.push(bolt(origin,{x:origin.x+Math.cos(a)*length,y:origin.y+Math.sin(a)*length},seed+i+70,5,.19));
    }
    for(let i=0;i<6;i++){const a=i*TAU/6+noise(seed,i+100)*.5,r=8+noise(seed,i+110)*10;sparks.push(bolt({x:end.x+Math.cos(a)*2,y:end.y+Math.sin(a)*2},{x:end.x+Math.cos(a)*r,y:end.y+Math.sin(a)*r},seed+i+130,3,.26));}
    const geometry={main,branches,sparks,end};this.lightning.set(e,geometry);return geometry;
  }

  _lightning(ctx,e,t,reduced,dense){
    const g=this._lightningGeometry(e),focus=e.focus||e.branch==='focus',conduction=e.type==='conduction',age=t*e.maxLife;
    const brightness=reduced?(1-t)*.67:Math.min(1,Math.exp(-age*8.5)+.24*(1-t)),scale=conduction?.65:focus?1.35:1;
    const glow=focus?'#ae95f2':'#7abfff',edge=focus?'#d7c7ff':'#b6e3ff';
    ctx.beginPath();path(ctx,g.main);
    if(!reduced&&!dense){ctx.globalAlpha=brightness*.08;ctx.strokeStyle=glow;ctx.lineWidth=12*scale;ctx.stroke();}
    ctx.globalAlpha=brightness*.23;ctx.strokeStyle=glow;ctx.lineWidth=7*scale;ctx.stroke();
    ctx.globalAlpha=brightness*.88;ctx.strokeStyle=edge;ctx.lineWidth=3.1*scale;ctx.stroke();
    ctx.globalAlpha=brightness;ctx.strokeStyle='#f6fcff';ctx.lineWidth=1.15*scale;ctx.stroke();
    ctx.beginPath();for(let i=0;i<(dense?1:g.branches.length);i++)path(ctx,g.branches[i]);
    ctx.globalAlpha=brightness*.43;ctx.strokeStyle=glow;ctx.lineWidth=2.2;ctx.stroke();ctx.globalAlpha=brightness*.8;ctx.strokeStyle=edge;ctx.lineWidth=.7;ctx.stroke();
    ctx.beginPath();for(let i=0;i<(dense?3:g.sparks.length);i++)path(ctx,g.sparks[i]);
    ctx.globalAlpha=brightness*(reduced?.5:.9);ctx.strokeStyle=edge;ctx.lineWidth=1.25;ctx.stroke();
    // A compact cruciform contact bloom gives the arc a distinct destination.
    if(!conduction){ctx.translate(g.end.x,g.end.y);ctx.globalAlpha=brightness*.8;ctx.fillStyle='#effaff';ctx.beginPath();polygon(ctx,[[0,-6],[-1.7,-1.2],[-5,0],[-1.7,1.2],[0,6],[1.7,1.2],[5,0],[1.7,-1.2]]);ctx.fill();}
  }

  _quakeGeometry(e){
    if(this.quakes.has(e))return this.quakes.get(e);
    const seed=effectSeed(e),r=e.r||100,cracks=[],debris=[],dust=[],edge=[];
    for(let i=0;i<8;i++){
      const a=(i+noise(seed,i)*.58)*TAU/8,dx=Math.cos(a),dy=Math.sin(a),points=[];
      for(let j=0;j<6;j++){const f=.06+j*.176,jitter=j?(noise(seed,i*13+j)-.5)*r*.19:0;points.push({x:dx*r*f-dy*jitter,y:dy*r*f+dx*jitter,f});}
      const forkAt=2+Math.floor(noise(seed,i+140)*2),origin=points[forkAt],side=noise(seed,i+150)>.5?1:-1;
      const fork=[origin,{x:origin.x+dx*r*.1-dy*side*r*.08,y:origin.y+dy*r*.1+dx*side*r*.08,f:origin.f+.12},{x:origin.x+dx*r*.18-dy*side*r*.16,y:origin.y+dy*r*.18+dx*side*r*.16,f:origin.f+.24}];
      const segments=[];for(const line of [points,fork])for(let j=1;j<line.length;j++){
        const a=line[j-1],b=line[j],length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length,width=(1-a.f)*3.5+.35,nextWidth=(1-b.f)*3.5+.25;
        segments.push({a,b,nx,ny,width,nextWidth,edge:j%3!==1});
      }
      cracks.push({points,fork,segments});
      const distance=r*(.35+noise(seed,i+160)*.49);debris.push({x:dx*distance,y:dy*distance,dx,dy,size:2.8+noise(seed,i+170)*4.2,rotation:noise(seed,i+180)*TAU,delay:.04+noise(seed,i+190)*.23});
    }
    for(let i=0;i<18;i++){const a=i*TAU/18+noise(seed,i+230)*.13;dust.push({dx:Math.cos(a),dy:Math.sin(a),distance:r*(.5+noise(seed,i+250)*.39),size:3+noise(seed,i+270)*7,tilt:noise(seed,i+290)*Math.PI});}
    for(let i=0;i<=48;i++){const a=i*TAU/48,rr=r*(.975+(i%2?.018:-.012));edge.push({x:Math.cos(a)*rr,y:Math.sin(a)*rr});}
    const geometry={cracks,debris,dust,edge};this.quakes.set(e,geometry);return geometry;
  }

  _traceCrack(ctx,points,reveal){
    if(reveal<=points[0].f)return;
    ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];if(b.f<=reveal)ctx.lineTo(b.x,b.y);
      else{const f=clamp((reveal-a.f)/(b.f-a.f));ctx.lineTo(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f);break;}
    }
  }

  _faults(ctx,cracks,reveal,bevel=false){
    for(const crack of cracks)for(const s of crack.segments){
      if(s.a.f>=reveal||(bevel&&!s.edge))continue;
      const f=clamp((reveal-s.a.f)/(s.b.f-s.a.f)),x=s.a.x+(s.b.x-s.a.x)*f,y=s.a.y+(s.b.y-s.a.y)*f,w=s.width+(s.nextWidth-s.width)*f;
      ctx.moveTo(s.a.x+s.nx*s.width,s.a.y+s.ny*s.width);ctx.lineTo(x+s.nx*w,y+s.ny*w);
      if(!bevel){ctx.lineTo(x-s.nx*w,y-s.ny*w);ctx.lineTo(s.a.x-s.nx*s.width,s.a.y-s.ny*s.width);ctx.closePath();}
    }
  }

  _quake(ctx,e,t,reduced,dense){
    const g=this._quakeGeometry(e),control=e.control||e.branch==='control',fade=(1-t)**.68,reveal=reduced?1:ease(t/.53),dustProgress=reduced?.65:ease(t/.77);
    ctx.translate(e.x,e.groundY??e.y);
    // Tapered dark fissures and broken stone bevels carry the ordinary quake;
    // a narrow magical core belongs only to the crowd-control branch.
    // All endpoints remain inside the actual damage radius.
    ctx.beginPath();this._faults(ctx,g.cracks,reveal);ctx.globalAlpha=fade*.92;ctx.fillStyle='#152920';ctx.fill();
    ctx.beginPath();this._faults(ctx,g.cracks,reveal,true);ctx.globalAlpha=fade*.65;ctx.strokeStyle=control?'#95bba5':'#a7ac89';ctx.lineWidth=1.1;ctx.stroke();
    if(control){ctx.beginPath();for(let i=0;i<g.cracks.length;i++){this._traceCrack(ctx,g.cracks[i].points,reveal);if(!dense||i%2===0)this._traceCrack(ctx,g.cracks[i].fork,reveal);}ctx.globalAlpha=fade*(reduced?.26:.42);ctx.strokeStyle='#b9ead5';ctx.lineWidth=.8;ctx.stroke();}
    // Sparse, broken pressure crests replace the old uninterrupted circle.
    if(!reduced){
      const expansion=clamp(.22+ease(t/.5)*.78);ctx.save();ctx.scale(expansion,expansion);ctx.beginPath();
      for(let i=0;i<g.edge.length-1;i++){if(i%8===0)ctx.moveTo(g.edge[i].x,g.edge[i].y);else if(i%8<=4)ctx.lineTo(g.edge[i].x,g.edge[i].y);}
      ctx.strokeStyle=control?'#beeedd':'#bebd98';ctx.globalAlpha=fade*.29;ctx.lineWidth=2.3;ctx.stroke();ctx.restore();
    }
    // A restrained boundary is retained only for the crowd-control branch.
    if(control){ctx.beginPath();path(ctx,g.edge);ctx.globalAlpha=fade*.26;ctx.strokeStyle='#ade7d0';ctx.lineWidth=1;ctx.stroke();}
    const dustLimit=dense?8:g.dust.length;
    for(let i=0;i<dustLimit;i++){
      const d=g.dust[i],distance=d.distance*dustProgress,x=d.dx*distance,y=d.dy*distance,size=d.size*(.55+dustProgress*.55);
      ctx.save();ctx.translate(x,y);ctx.rotate(d.tilt);ctx.globalAlpha=fade*(reduced?.08:.13);ctx.fillStyle=control?'#a6bba8':'#bbb39a';
      ctx.beginPath();ctx.moveTo(-size,0);ctx.bezierCurveTo(-size*1.4,-size*.6,-size*.3,-size*.8,0,-size*.45);ctx.bezierCurveTo(size*.3,-size*1.2,size*1.1,-size*.7,size*1.15,0);ctx.bezierCurveTo(size*1.5,size*.25,size*.2,size*.8,-size*.2,size*.4);ctx.bezierCurveTo(-size*1.2,size*.65,-size*1.45,size*.1,-size,0);ctx.fill();ctx.restore();
    }
    for(let i=0;i<(dense?5:g.debris.length);i++){
      const d=g.debris[i],p=reduced?.58:clamp((t-d.delay)/(1-d.delay));if(!reduced&&t<d.delay)continue;
      const lift=reduced?0:Math.sin(p*Math.PI)*(5+d.size*1.1),spread=reduced?1:.75+.25*ease(p),x=d.x*spread,y=d.y*spread;
      ctx.save();ctx.translate(x,y-lift);ctx.rotate(d.rotation+(reduced?0:p*.8));ctx.globalAlpha=fade*.82;ctx.fillStyle='#566b51';shard(ctx,d.size);
      ctx.fillStyle=control?'#a6c5ac':'#adb68c';ctx.beginPath();polygon(ctx,[[-d.size*.65,-d.size*.35],[d.size*.45,-d.size*.6],[0,0]]);ctx.fill();ctx.restore();
    }
  }

  _impactGeometry(e){
    if(this.impacts.has(e))return this.impacts.get(e);
    const seed=effectSeed(e),angle=e.angle||0,fragments=[];
    for(let i=0;i<8;i++){const a=angle+(noise(seed,i)-.5)*TAU;fragments.push({dx:Math.cos(a),dy:Math.sin(a),length:5+noise(seed,i+20)*9,speed:7+noise(seed,i+30)*12,size:.7+noise(seed,i+40)*1.4});}
    this.impacts.set(e,fragments);return fragments;
  }

  _hit(ctx,e,t,reduced,dense){
    const source=e.source||'arrow',colors=palette(source),electric=ELECTRIC.has(source),earth=EARTH.has(source),orbit=source==='orbit',fragments=this._impactGeometry(e),fade=(1-t)**1.3;
    const size=clamp((e.r||10)*.8,6,17),travel=reduced?.45:ease(t),strength=.7+clamp(e.strength||.4)*.3;
    ctx.translate(e.x,e.y);
    if(earth){
      ctx.globalAlpha=fade*.18;ctx.fillStyle=colors[0];ctx.beginPath();ctx.ellipse(0,3,size*(.7+travel*.5),size*.45,0,0,TAU);ctx.fill();
    }else if(orbit){
      ctx.save();ctx.rotate((e.angle||0)-.5);ctx.globalAlpha=fade*.9;ctx.fillStyle=colors[1];ctx.beginPath();ctx.moveTo(-size,-size*.4);ctx.quadraticCurveTo(size*.4,-size*.8,size*1.2,size*.6);ctx.quadraticCurveTo(size*.4,-size*.05,-size,-size*.4);ctx.fill();ctx.restore();
    }else{
      ctx.save();ctx.rotate((e.angle||0)+Math.PI/4);ctx.globalAlpha=fade*.8;ctx.fillStyle=colors[1];ctx.beginPath();polygon(ctx,[[0,-size*.65],[-1.6,-1.4],[-size*.45,0],[-1.6,1.4],[0,size*.65],[1.6,1.4],[size*.45,0],[1.6,-1.4]]);ctx.fill();ctx.restore();
    }
    const limit=dense?4:reduced?4:7;ctx.lineCap='round';
    for(let i=0;i<limit;i++){
      const f=fragments[i],inner=3+travel*f.speed,outer=inner+f.length*(reduced?.7:1-t)*strength;
      ctx.globalAlpha=fade*(i%2?.7:1);ctx.strokeStyle=colors[i%2];ctx.fillStyle=colors[i%3];ctx.lineWidth=electric?1.05:1.35;
      if(earth){ctx.save();ctx.translate(f.dx*inner,f.dy*inner-(reduced?0:Math.sin(t*Math.PI)*5));ctx.rotate(i+(reduced?0:t));shard(ctx,f.size*1.7);ctx.restore();}
      else if(electric){ctx.beginPath();ctx.moveTo(f.dx*inner,f.dy*inner);ctx.lineTo(f.dx*(inner+outer)*.5-f.dy*2,f.dy*(inner+outer)*.5+f.dx*2);ctx.lineTo(f.dx*outer,f.dy*outer);ctx.stroke();}
      else{ctx.beginPath();segment(ctx,f.dx*inner,f.dy*inner,f.dx*outer,f.dy*outer);ctx.stroke();}
    }
  }

  _defeatGeometry(e){
    if(this.defeats.has(e))return this.defeats.get(e);
    const seed=effectSeed(e),count=e.boss?20:9,fragments=[];
    for(let i=0;i<count;i++){const angle=i*TAU/count+noise(seed,i)*.4;fragments.push({dx:Math.cos(angle),dy:Math.sin(angle),distance:9+noise(seed,i+30)*(e.boss?55:25),size:(e.boss?2.8:1.9)+noise(seed,i+40)*(e.boss?4:2.3),angle:noise(seed,i+50)*TAU,spin:(noise(seed,i+60)-.5)*2.5,up:6+noise(seed,i+70)*15});}
    this.defeats.set(e,fragments);return fragments;
  }

  _defeat(ctx,e,t,reduced,dense){
    const fragments=this._defeatGeometry(e),fade=(1-t)**1.15,spread=reduced?.6:ease(t),boss=e.boss,leafy=['slime','bat','spore','boss'].includes(e.enemyType),colors=palette(e.source);
    const base=leafy?(e.enemyType==='spore'?'#b5a2bc':e.enemyType==='bat'?'#a1a8bc':'#a4c291'):'#b1ac87';
    ctx.translate(e.x,e.y);
    // Low-opacity torn silhouettes form a compact dissolve, never a blood cloud.
    if(!dense){ctx.globalAlpha=fade*.16;ctx.fillStyle=base;ctx.beginPath();const r=(e.r||16)*(.5+spread*.5);ctx.moveTo(-r*.7,0);ctx.bezierCurveTo(-r,-r*.8,-r*.4,-r*1.1,0,-r*.7);ctx.bezierCurveTo(r*.7,-r,r*.9,-r*.2,r*.6,0);ctx.quadraticCurveTo(0,r*.4,-r*.7,0);ctx.fill();}
    const limit=dense?Math.min(boss?10:5,fragments.length):reduced?Math.min(boss?12:6,fragments.length):fragments.length;
    for(let i=0;i<limit;i++){
      const f=fragments[i],lift=reduced?f.up*.35:Math.sin(t*Math.PI)*f.up,y=f.dy*f.distance*spread-lift;
      ctx.save();ctx.translate(f.dx*f.distance*spread,y);ctx.rotate(f.angle+(reduced?0:t*f.spin));ctx.globalAlpha=fade*(i%3===0?.9:.66);ctx.fillStyle=i%3===0?colors[0]:base;
      const size=f.size*(reduced?1:1-t*.4);if(leafy)leaf(ctx,size);else shard(ctx,size);
      if(!dense&&size>2){ctx.strokeStyle=colors[1];ctx.globalAlpha=fade*.45;ctx.lineWidth=.65;ctx.beginPath();segment(ctx,-size*.5,0,size*.45,0);ctx.stroke();}
      ctx.restore();
    }
  }

  _ricochet(ctx,e,t,reduced){
    const angle=Math.atan2((e.y2??e.y)-e.y,(e.x2??e.x+1)-e.x),fade=(1-t)**1.4,length=reduced?13:9+ease(t)*16;
    ctx.translate(e.x,e.y);ctx.rotate(angle);ctx.globalAlpha=fade*.22;ctx.strokeStyle='#edcf79';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-12,-8);ctx.lineTo(0,0);ctx.lineTo(length,0);ctx.stroke();
    ctx.globalAlpha=fade;ctx.strokeStyle='#fff0bd';ctx.lineWidth=1.35;ctx.stroke();
    ctx.fillStyle='#fff3cb';ctx.beginPath();polygon(ctx,[[0,-4],[-3,0],[0,4],[3,0]]);ctx.fill();
    ctx.globalAlpha=fade*.65;ctx.lineWidth=1;ctx.beginPath();segment(ctx,-3,5,-6,10);segment(ctx,2,-5,4,-11);ctx.stroke();
  }

  _stormGeometry(storm){
    if(this.storms.has(storm))return this.storms.get(storm);
    const bolts=getStormGeometry(storm).mainBolts,patches=[];
    for(const bolt of bolts){
      const target=bolt.target,seed=effectSeed(target),r=clamp((target.r||15)*.65+7,13,35),cracks=[],sparks=[];
      for(let j=0;j<5;j++){const a=j*TAU/5+noise(seed,j)*.4,length=r*(.62+noise(seed,j+10)*.36),dx=Math.cos(a),dy=Math.sin(a)*.52;cracks.push([{x:dx*2,y:dy*2},{x:dx*length*.4-dy*3,y:dy*length*.4+dx*2},{x:dx*length*.7+dy*3,y:dy*length*.7-dx*2},{x:dx*length,y:dy*length}]);sparks.push({dx:Math.cos(a),dy:Math.sin(a),distance:7+noise(seed,j+20)*14,up:10+noise(seed,j+30)*20});}
      patches.push({x:target.x,y:target.y+4,r,cracks,sparks,delay:bolt.delay});
    }
    this.storms.set(storm,patches);return patches;
  }

  drawStormGround(ctx,storm,{reduced=false,dense=false}={}){
    if(!storm||!(storm.life>0)||!(storm.maxLife>0))return;
    const age=stormAge(storm),patches=this._stormGeometry(storm);
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
    for(let i=0;i<(dense?Math.min(7,patches.length):patches.length);i++){
      const p=patches[i];if(age<p.delay)continue;const t=clamp((age-p.delay)/Math.max(.01,storm.maxLife-p.delay)),fade=(1-t)**1.1;ctx.save();ctx.translate(p.x,p.y);
      ctx.beginPath();for(const crack of p.cracks)path(ctx,crack);ctx.globalAlpha=fade*.65;ctx.strokeStyle='#274140';ctx.lineWidth=4;ctx.stroke();
      ctx.globalAlpha=fade*(reduced?.24:.45);ctx.strokeStyle='#b5ddea';ctx.lineWidth=1;ctx.stroke();
      if(!reduced&&!dense){ctx.globalAlpha=fade*.1;ctx.fillStyle='#94c8eb';ctx.beginPath();ctx.ellipse(0,0,p.r*.75,p.r*.3,0,0,TAU);ctx.fill();}
      ctx.restore();
    }
    ctx.restore();
  }

  drawStormAir(ctx,storm,{reduced=false,dense=false}={}){
    if(!storm||!(storm.life>0)||!(storm.maxLife>0))return;
    const age=stormAge(storm),patches=this._stormGeometry(storm);
    if(reduced)return; // The existing discharge already provides a calm fallback.
    ctx.save();ctx.lineCap='round';ctx.shadowBlur=0;ctx.lineWidth=1.05;
    for(let i=0;i<(dense?Math.min(5,patches.length):patches.length);i++){
      const p=patches[i];if(age<p.delay)continue;const t=clamp((age-p.delay)/Math.max(.01,storm.maxLife-p.delay)),fade=(1-t)**1.6;ctx.beginPath();
      for(let j=0;j<(dense?2:4);j++){const s=p.sparks[j],x=p.x+s.dx*s.distance*ease(t),y=p.y+s.dy*s.distance*.4*ease(t)-Math.sin(t*Math.PI*.8)*s.up;segment(ctx,x,y,x-s.dx*1.6,y+3.5*(1-t));}
      ctx.globalAlpha=fade*.8;ctx.strokeStyle=i%2?'#b9e5ff':'#effaff';ctx.stroke();
    }
    ctx.restore();
  }
}
