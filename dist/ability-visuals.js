import { FieldVectorArt } from './field-vector-art.js';
import { RoyalSwordArt } from './royal-sword-art.js';
import { SuperArt } from './super-art.js';
import { CombatArt } from './combat-art.js';
import { friendlyFoot } from './friendly-combat.js';

// Presentation owns only cached geometry. All phases and collision footprints
// come from AbilityRuntime; painting never changes the combat simulation.
export const TAU=Math.PI*2;
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export const FIRE=new Set(['fireball','flameStream','shortFlame','meteor']);
export const FROST=new Set(['frostbolt','frostRing','iceThaw']);
const ZONES=new Set(['lightning','storm','meteor','stoneLob']);
const noise=(seed,i)=>{let x=Math.imul((seed|0)^0x4f1bbcdc,i+31);x=Math.imul(x^(x>>>16),0x7feb352d);return((x^(x>>>15))>>>0)/4294967296;};
export const abilityColor=e=>e.visualVariant==='web'?'#dfd8bc':FROST.has(e.abilityId)?'#a8e4ff':FIRE.has(e.abilityId)?'#ffb063':['domain','vineTrap'].includes(e.abilityId)?'#acd88c':e.abilityId==='vortex'?'#c5b2ff':['tidalWave','waterBolt'].includes(e.abilityId)?'#8cddd9':e.abilityId==='beam'?'#dbc7ff':'#e5d7ae';
export function circle(ctx,x,y,r){ctx.beginPath();ctx.arc(x,y,Math.max(0,r),0,TAU);}
export function polygon(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));ctx.closePath();ctx.fill();}
export function segment(ctx,x,y,x2,y2){ctx.moveTo(x,y);ctx.lineTo(x2,y2);}
function ellipse(ctx,x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,Math.max(0,rx),Math.max(0,ry),0,0,TAU);ctx.fill();}
function crystal(ctx,x,y,size,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#5eabc7';polygon(ctx,[[-size*.36,0],[-size*.2,-size*.8],[size*.18,-size],[size*.38,-size*.28],[size*.3,0]]);ctx.fillStyle='#d5f6ff';polygon(ctx,[[-size*.2,-size*.8],[size*.18,-size],[size*.06,0],[-size*.36,0]]);ctx.restore();}
function flame(ctx,x,y,size,phase=0){const sway=Math.sin(phase)*size*.14;ctx.fillStyle='#e87947';ctx.beginPath();ctx.moveTo(x-size*.45,y);ctx.quadraticCurveTo(x-size*.72,y-size*.5,x-size*.16,y-size*.9);ctx.quadraticCurveTo(x-size*.1,y-size*.48,x+sway,y-size*1.5);ctx.quadraticCurveTo(x+size*.68,y-size*.65,x+size*.43,y);ctx.closePath();ctx.fill();ctx.fillStyle='#ffd18a';ctx.beginPath();ctx.moveTo(x-size*.21,y);ctx.quadraticCurveTo(x-size*.28,y-size*.48,x+sway*.3,y-size*.85);ctx.quadraticCurveTo(x+size*.35,y-size*.35,x+size*.21,y);ctx.closePath();ctx.fill();}
function rock(ctx,size,hot=false){ctx.fillStyle=hot?'#513b42':'#4c514b';polygon(ctx,[[-size*.8,-size*.25],[-size*.5,-size*.72],[size*.21,-size*.87],[size*.8,-size*.22],[size*.62,size*.55],[-size*.2,size*.8],[-size*.85,size*.28]]);ctx.fillStyle=hot?'#a65f4b':'#aaa98e';polygon(ctx,[[-size*.8,-size*.25],[-size*.5,-size*.72],[size*.21,-size*.87],[size*.05,-size*.1],[-size*.85,size*.28]]);ctx.fillStyle=hot?'#db925f':'#7e8876';polygon(ctx,[[size*.21,-size*.87],[size*.8,-size*.22],[size*.62,size*.55],[size*.05,-size*.1]]);ctx.strokeStyle=hot?'#ffcd86':'#d1c8a5';ctx.lineWidth=.9;ctx.beginPath();segment(ctx,-size*.5,-size*.72,size*.05,-size*.1);segment(ctx,size*.05,-size*.1,size*.62,size*.55);ctx.stroke();}
function muzzle(e){
  if(e.visualOrigin&&Number.isFinite(e.visualOrigin.x)&&Number.isFinite(e.visualOrigin.y))return e.visualOrigin;
  const caster=e.caster,kind=e.casterKind||caster?.bossKind||caster?.type,r=caster?.r||16;
  const x=e.sourceX??e.origin?.x??e.x,y=e.sourceY??e.origin?.y??e.y,angle=e.angle||0;
  // The body origin remains separate from the ground-projected hazard origin.
  const flip=Math.cos(angle)<0?-1:1,progress=clamp(e.age/Math.max(.001,e.windup));
  if(kind==='flamelizard')return{x:x+flip*33*r/21,y:y+2*r/21};
  if(kind==='furnace')return{x,y:y+(1+progress*2)*r/49};
  if(kind==='prismguard')return{x,y:y-5*r/19};
  if(kind==='tidepriest'||kind==='frostmage')return{x:x+flip*19*r/18,y:y-((kind==='frostmage'?29:28)+progress*3)*r/18};
  if(kind==='stoneape')return{x:x+flip*8*r/22,y:y-28*r/22};
  const reach=r*.45;
  return{x:x+Math.cos(angle)*reach,y:y-r*.32+Math.sin(angle)*reach*.32};
}

export class AbilityVisuals{
  constructor({makeCanvas,vectorOptions={}}={}){
    this.fields=new FieldVectorArt(vectorOptions);this.swords=new RoyalSwordArt(vectorOptions);
    this.supers=new SuperArt(makeCanvas,vectorOptions);this.combat=new CombatArt();
    this.geometry=new WeakMap();this.views=new WeakMap();this.builds=0;
  }
  get diagnostics(){return{geometryBuilds:this.builds,fieldEntries:this.fields.stats.entries,swordPathBuilds:this.swords.stats.pathBuilds,super:this.supers.cacheStats};}
  data(e){
    let data=this.geometry.get(e);if(data)return data;
    const seed=e.id??Math.round(e.x*17+e.y*31),particles=[];
    for(let i=0;i<16;i++)particles.push({a:i*2.399+noise(seed,i)*.45,r:.22+noise(seed,i+24)*.7,size:1.2+noise(seed,i+48)*2.4,phase:noise(seed,i+72)*TAU});
    data={seed,particles};this.geometry.set(e,data);this.builds++;return data;
  }
  view(e){let view=this.views.get(e);if(!view){view={};this.views.set(e,view);}return view;}
  drawGround(ctx,e,options={}){
    const p=e.parameters,active=Math.max(0,e.age-e.windup),fade=clamp(e.remaining/.24),r=p.radius,y=e.y+(e.groundOffset||0);
    ctx.save();ctx.translate(e.x,y);ctx.lineJoin='round';ctx.lineCap='round';
    if(e.shape==='field'){
      // Keep every decorative root, ribbon and strand inside the true footprint.
      circle(ctx,0,0,r);ctx.clip();
      if(e.visualVariant==='web')this.web(ctx,e,active,fade,options);
      else if(e.abilityId==='vortex')this.vortex(ctx,e,active,fade,options);
      else this.roots(ctx,e,active,fade,options);
    }else if(e.shape==='cone')this.cone(ctx,e,active,fade,options);
    else if(e.shape==='wave')this.wave(ctx,e,active,options);
    else if(e.shape==='ring'){
      const front=r*clamp(active/p.duration),n=options.dense?14:24;
      ctx.globalAlpha=fade*.12;circle(ctx,0,0,front);ctx.fillStyle=abilityColor(e);ctx.fill();
      ctx.globalAlpha=fade*.75;ctx.strokeStyle=abilityColor(e);ctx.lineWidth=3.4;circle(ctx,0,0,Math.max(0,front-2));ctx.stroke();
      if(e.abilityId==='frostRing')for(let i=0;i<n;i++){const a=i*TAU/n;ctx.save();ctx.rotate(a);crystal(ctx,Math.max(0,front-7),0,Math.min(9,front*.18),Math.PI/2);ctx.restore();}
      else if(!options.reduced){ctx.globalAlpha=fade*.2;ctx.lineWidth=7;circle(ctx,0,0,Math.max(0,front-7));ctx.stroke();}
    }else if(e.shape==='zone'){
      ctx.strokeStyle=abilityColor(e);ctx.globalAlpha=fade*.38;ctx.lineWidth=1.4;circle(ctx,0,0,r);ctx.stroke();
    }
    ctx.restore();
  }
  web(ctx,e,age,fade,options){
    const r=e.parameters.radius,n=options.dense?8:10,phase=options.reduced?0:age*2.2,growth=.78+.22*clamp(age/.25);
    ctx.globalAlpha=fade*.17;ctx.fillStyle='#c9c7ad';circle(ctx,0,0,r*.98);ctx.fill();
    ctx.scale(growth,growth);ctx.strokeStyle='#41483e';ctx.lineWidth=2.4;ctx.globalAlpha=fade*.6;
    const draw=()=>{ctx.beginPath();for(let i=0;i<n;i++){const a=i*TAU/n,rr=r*(.86+(i%3)*.05);segment(ctx,Math.cos(a)*r*.07,Math.sin(a)*r*.07,Math.cos(a)*rr,Math.sin(a)*rr);}for(let ring=1;ring<=4;ring++){const rr=r*(ring*.2);for(let i=0;i<n;i++){const a=i*TAU/n,b=(i+1)*TAU/n;ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);ctx.quadraticCurveTo(Math.cos((a+b)*.5)*rr*.83,Math.sin((a+b)*.5)*rr*.83,Math.cos(b)*rr,Math.sin(b)*rr);}}ctx.stroke();};
    draw();ctx.strokeStyle='#e0dfc8';ctx.lineWidth=options.dense?1:1.25;ctx.globalAlpha=fade*.8;draw();
    if(!options.dense)for(let i=0;i<7;i++){const a=i*2.4,rr=r*(.28+(i%3)*.2);ctx.globalAlpha=fade*(.4+.1*Math.sin(phase+i));ellipse(ctx,Math.cos(a)*rr,Math.sin(a)*rr,2,1.35,'#f1edcd');}
  }
  roots(ctx,e,age,fade,options){
    const r=e.parameters.radius,domain=e.abilityId==='domain',growth=options.reduced?1:.72+.28*clamp(age/.25);
    ctx.scale(r/128*growth*1.18,r/128*growth*1.18);ctx.globalAlpha=fade*(domain?.92:.78);
    this.fields.drawThorns(ctx,(e.id||0)%3);
    if(domain){ctx.globalAlpha=fade*.78;this.fields.drawThorns(ctx,(e.id||0)%3,{raised:true});}
    else if(!options.dense){ctx.strokeStyle='#b8db90';ctx.lineWidth=1.5;ctx.globalAlpha=fade*.75;for(let i=0;i<5;i++){const a=i*TAU/5;ctx.save();ctx.rotate(a);ctx.beginPath();ctx.moveTo(19,5);ctx.bezierCurveTo(35,-17,64,21,91,-6);ctx.stroke();ctx.restore();}}
  }
  vortex(ctx,e,age,fade,options){
    const r=e.parameters.radius,phase=options.reduced?0:age*.72;
    ctx.save();ctx.scale(r/128,r/128);ctx.rotate(phase);ctx.globalAlpha=fade*.78;this.fields.drawVortexRibbon(ctx,0);
    if(!options.dense){ctx.rotate(-phase*.26+1.1);ctx.scale(.82,.82);ctx.globalAlpha=fade*.55;this.fields.drawVortexRibbon(ctx,1);}ctx.restore();
    ctx.save();ctx.scale(r/128,r/128);ctx.rotate(-phase*.4);ctx.globalAlpha=fade*.7;this.fields.drawVortexCore(ctx);ctx.restore();
    const data=this.data(e);for(let i=0;i<(options.dense?3:6);i++){const d=data.particles[i],t=options.reduced?d.r:(d.r+age*.39)%1,a=d.a+phase,rr=r*(.9-t*.75);ctx.globalAlpha=fade*(.25+Math.sin(t*Math.PI)*.35);ellipse(ctx,Math.cos(a)*rr,Math.sin(a)*rr,d.size,d.size*.55,'#d1c7eb');}
  }
  cone(ctx,e,age,fade,options){
    const p=e.parameters,range=p.range,spread=p.spread;
    ctx.rotate(e.angle);ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,range,-spread,spread);ctx.closePath();ctx.clip();
    ctx.fillStyle='#dc6940';ctx.globalAlpha=fade*.12;ctx.fill();
    const start=.7+.3*clamp(age/.12),phase=options.reduced?0:age*8,count=options.dense?5:7;
    // Tapered, curling tongues leave gaps through which actors and terrain are
    // still readable. Their tips roll independently instead of forming a flat
    // solid fan at maximum range.
    for(let i=0;i<count;i++){
      const angle=(i/(count-1)-.5)*spread*1.7,length=range*(.82+.15*Math.sin(i*2.1+phase*.78))*start,width=range*(.055+.015*Math.sin(i+phase));
      const curl=Math.sin(i*1.7+phase)*width*.7;
      ctx.save();ctx.rotate(angle);
      for(let layer=0;layer<(options.dense?2:3);layer++){
        const l=length*(1-layer*.1),w=width*(1-layer*.28);
        ctx.globalAlpha=fade*(layer===0?.48:layer===1?.71:.78);ctx.fillStyle=['#d66a40','#f5a658','#ffe0a0'][layer];ctx.beginPath();ctx.moveTo(2,0);
        ctx.bezierCurveTo(l*.22,-w*.28,l*.43,-w*1.2,l*.66,-w*.72);
        ctx.bezierCurveTo(l*.8,-w*.2,l*.78,-w*.9,l,-w*.12+curl);
        ctx.bezierCurveTo(l*.84,w*.18+curl,l*.86,w*.8,l*.68,w*.64);
        ctx.bezierCurveTo(l*.43,w*1.08,l*.2,w*.32,2,0);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }
    if(!options.reduced){ctx.strokeStyle='#fff2c3';ctx.globalAlpha=fade*.65;ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<(options.dense?3:6);i++){const f=(i*.173+age*1.4)%1,x=range*(.15+f*.75),side=(i%3-1)*.42,yy=x*Math.tan(spread)*side;segment(ctx,x-9,yy,x+3,yy+Math.sin(age*7+i)*3);}ctx.stroke();}
  }
  wave(ctx,e,age,options){
    const r=e.parameters.radius,phase=options.reduced?0:age*5;
    ctx.rotate(e.angle);ctx.beginPath();ctx.rect(-24,-r,39,r*2);ctx.clip();
    // The water and foam stop at each strip's ends; the central safe lane is
    // never bridged by decorative waves or glow.
    ctx.fillStyle='#438f9e';ctx.globalAlpha=.47;ctx.beginPath();ctx.moveTo(-23,-r);ctx.lineTo(4,-r);ctx.quadraticCurveTo(15,0,4,r);ctx.lineTo(-23,r);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#8bdfd9';ctx.lineWidth=9;ctx.globalAlpha=.82;ctx.beginPath();ctx.moveTo(-3,-r);for(let i=1;i<=12;i++){const yy=-r+i*r/6;ctx.lineTo(2+Math.sin(i*1.2+phase)*2,yy);}ctx.stroke();
    ctx.strokeStyle='#e0f7e3';ctx.lineWidth=2.2;ctx.globalAlpha=.94;ctx.beginPath();ctx.moveTo(6,-r);for(let i=1;i<=12;i++){const yy=-r+i*r/6;ctx.lineTo(7+Math.sin(i*1.2+phase)*2,yy);}ctx.stroke();
    if(!options.dense){ctx.globalAlpha=.7;for(let i=0;i<9;i++){const yy=-r+(i+.5)*r*2/9;ellipse(ctx,-7-Math.sin(i+phase)*3,yy,2.8,1.2,'#d2eee2');}}
    if(e.hostile){ctx.strokeStyle='#f4a186';ctx.lineWidth=1.4;ctx.globalAlpha=.9;ctx.beginPath();segment(ctx,12,-r,12,r);segment(ctx,-12,-r,12,-r);segment(ctx,-12,r,12,r);ctx.stroke();}
  }
  drawWindupAir(ctx,e,options={}){
    const p=e.parameters,t=clamp(e.age/Math.max(.001,e.windup)),m=muzzle(e),color=abilityColor(e);
    if(e.abilityId==='meteor'){
      const v=this.view(e);Object.assign(v,{kind:'meteor',id:e.id,x:e.x,y:e.y+(e.groundOffset||0),r:p.radius,maxLife:e.windup,life:Math.max(.00001,e.windup-e.age)});this.supers.drawFieldAir(ctx,v,options);return;
    }
    if(e.abilityId==='stoneLob'){
      if(t<.5)return; // The actor keeps the physical rock until release.
      const flight=clamp((t-.5)/.5),start=m,endY=e.y+(e.groundOffset||0);
      const lift=options.reduced?Math.sin(flight*Math.PI)*16:Math.sin(flight*Math.PI)*Math.min(95,45+Math.hypot(e.x-start.x,endY-start.y)*.18);
      ctx.save();ctx.translate(mix(start.x,e.x,flight),mix(start.y,endY,flight)-lift);ctx.rotate(options.reduced?0:flight*2.8);rock(ctx,10+Math.min(7,p.radius*.08));ctx.restore();return;
    }
    if(['domain','vineTrap','vortex','frostRing','tidalWave'].includes(e.abilityId))return;
    ctx.save();ctx.translate(m.x,m.y);ctx.globalAlpha=.4+t*.5;ctx.strokeStyle=color;ctx.lineWidth=1.3;
    if(e.abilityId==='swords'){
      ctx.rotate(e.angle);ctx.translate(-4,0);this.swords.draw(ctx,37,15);ctx.globalAlpha=.4+t*.4;ctx.beginPath();segment(ctx,-34,-9,-4,-9);segment(ctx,-34,9,-4,9);ctx.stroke();
    }else if(FIRE.has(e.abilityId))flame(ctx,0,2,4+t*6,options.reduced?0:e.age*9);
    else if(FROST.has(e.abilityId))crystal(ctx,0,4,5+t*8,.2);
    else if(e.abilityId==='waterBolt'){ellipse(ctx,0,0,3+t*7,3+t*5,'#79cfd1');ellipse(ctx,-2,-2,2,1.3,'#e3fff3');}
    else{
      const r=12-6*t;circle(ctx,0,0,r);ctx.stroke();ctx.fillStyle='#f4ecff';polygon(ctx,[[0,-4-t*2],[2,0],[0,4+t*2],[-2,0]]);
      if(!options.dense){ctx.globalAlpha=.6;ctx.beginPath();for(let i=0;i<4;i++){const a=i*TAU/4+.7;segment(ctx,Math.cos(a)*(r+3),Math.sin(a)*(r+3),Math.cos(a)*(r+7),Math.sin(a)*(r+7));}ctx.stroke();}
    }
    ctx.restore();
  }
  drawActiveAir(ctx,e,options={}){
    if(e.shape==='projectile'){this.projectile(ctx,e,options);return;}
    if(e.shape==='cone'){
      const m=muzzle(e),p=e.parameters,fade=clamp(e.remaining/.2),ux=Math.cos(e.angle),uy=Math.sin(e.angle),end={x:e.x+ux*46,y:e.y+(e.groundOffset||0)+uy*46};
      // A short lifted throat connects the authored mouth/furnace to the
      // ground-projected cone. The distant flame footprint stays unchanged.
      ctx.save();ctx.globalAlpha=fade*.78;ctx.fillStyle='#f4ac63';ctx.beginPath();ctx.moveTo(m.x-uy*3,m.y+ux*3);ctx.quadraticCurveTo(m.x+ux*20,m.y+uy*20,end.x-uy*9,end.y+ux*9);ctx.lineTo(end.x+uy*9,end.y-ux*9);ctx.quadraticCurveTo(m.x+ux*20,m.y+uy*20,m.x+uy*3,m.y-ux*3);ctx.closePath();ctx.fill();ctx.globalAlpha=fade*.9;ellipse(ctx,m.x,m.y,3,3,'#ffe5ab');ctx.restore();return;
    }
    if(e.shape==='beam'){
      const p=e.parameters,fade=clamp(e.remaining/p.duration),y=e.y+(e.groundOffset||0),m=muzzle(e);
      ctx.save();ctx.translate(e.x,y);ctx.rotate(e.angle);ctx.beginPath();ctx.rect(0,-p.radius,p.range,p.radius*2);ctx.clip();
      ctx.globalAlpha=fade*.3;ctx.fillStyle=e.hostile?'#d695bb':'#bca4ee';ctx.fillRect(0,-p.radius,p.range,p.radius*2);
      ctx.globalAlpha=fade*.7;ctx.strokeStyle='#c3a5ee';ctx.lineWidth=p.radius*1.05;ctx.beginPath();segment(ctx,0,0,p.range,0);ctx.stroke();ctx.globalAlpha=fade;ctx.strokeStyle='#f7eaff';ctx.lineWidth=Math.max(2,p.radius*.23);ctx.stroke();ctx.restore();
      ctx.save();ctx.globalAlpha=fade;ctx.strokeStyle='#f5dfff';ctx.lineWidth=2;ctx.beginPath();segment(ctx,m.x,m.y,e.x+Math.cos(e.angle)*22,y+Math.sin(e.angle)*22);ctx.stroke();ctx.restore();return;
    }
    if(ZONES.has(e.abilityId)&&!options.hasBurstsRuntime){
      const view=this.view(e);Object.assign(view,{id:e.id,abilityId:e.abilityId,x:e.x,y:e.y,radius:e.parameters.radius,groundOffset:e.groundOffset||0,age:e.age-e.windup,life:e.parameters.duration,angle:e.angle,kind:'landing'});this.drawBurst(ctx,view,options);
    }
  }
  projectile(ctx,e,options){
    const r=e.parameters.radius,color=abilityColor(e),phase=options.reduced?0:e.age*13;
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle);ctx.lineJoin='round';
    if(!options.reduced){ctx.globalAlpha=.2;ctx.fillStyle=color;polygon(ctx,[[-r*4.2,0],[-r*.5,-r*.5],[r*.4,0],[-r*.5,r*.5]]);}
    ctx.globalAlpha=1;
    if(e.abilityId==='fireball'){
      ctx.fillStyle='#b9503a';ctx.beginPath();ctx.moveTo(-r*2.7,0);ctx.quadraticCurveTo(-r*.8,-r*1.5,r*.7,-r*.8);ctx.quadraticCurveTo(r*1.65,0,r*.7,r*.8);ctx.quadraticCurveTo(-r*.9,r*1.5,-r*2.7,0);ctx.fill();
      ctx.fillStyle='#f48a4b';ctx.beginPath();ctx.moveTo(-r*(2.5+Math.sin(phase)*.15),0);ctx.lineTo(-r*.9,-r*.55);ctx.lineTo(-r*1.3,-r*.9);ctx.quadraticCurveTo(r*.4,-r*1.25,r*.95,0);ctx.quadraticCurveTo(r*.5,r*.95,-r*.8,r*.48);ctx.closePath();ctx.fill();
      ellipse(ctx,r*.18,0,r*.7,r*.54,'#ffd17e');ellipse(ctx,r*.35,-r*.12,r*.36,r*.28,'#fff0bf');
    }else if(e.abilityId==='frostbolt'){
      ctx.fillStyle='#4e95b4';polygon(ctx,[[r*1.7,0],[-r*.65,-r*.78],[-r*1.2,0],[-r*.65,r*.78]]);ctx.fillStyle='#d9f7ff';polygon(ctx,[[r*1.7,0],[-r*.65,-r*.78],[-r*.3,0]]);ctx.fillStyle='#80c6df';polygon(ctx,[[r*1.7,0],[-r*.65,r*.78],[-r*.3,0]]);ctx.strokeStyle='#eafcff';ctx.lineWidth=.8;ctx.beginPath();segment(ctx,-r*.7,0,r*1.4,0);ctx.stroke();
      if(!options.dense){ctx.globalAlpha=.55;crystal(ctx,-r*1.9,-r*.3,r*.45,-Math.PI/2);}
    }else if(e.abilityId==='waterBolt'){
      ctx.fillStyle='#3f91a5';ctx.beginPath();ctx.moveTo(-r*2.1,0);ctx.quadraticCurveTo(-r*.5,-r*1.05,r*.6,-r*.76);ctx.quadraticCurveTo(r*1.4,0,r*.6,r*.76);ctx.quadraticCurveTo(-r*.5,r*1.05,-r*2.1,0);ctx.fill();ellipse(ctx,r*.05,-r*.12,r*.75,r*.65,'#78d2d4');ellipse(ctx,r*.25,-r*.35,r*.34,r*.18,'#d7f8ed');ctx.strokeStyle='#b8eee5';ctx.lineWidth=1;ctx.beginPath();ctx.arc(-r*.05,0,r*.58,.1,1.8);ctx.stroke();
    }else if(e.abilityId==='windSlash'){
      ctx.fillStyle='#729d9a';ctx.beginPath();ctx.moveTo(-r*.8,-r*1.3);ctx.quadraticCurveTo(r*1.3,0,-r*.8,r*1.3);ctx.quadraticCurveTo(r*.05,0,-r*.8,-r*1.3);ctx.fill();ctx.strokeStyle='#e1f4de';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-r*.8,-r*1.3);ctx.quadraticCurveTo(r*1.3,0,-r*.8,r*1.3);ctx.stroke();if(!options.dense){ctx.globalAlpha=.35;ctx.strokeStyle='#b5d9cd';ctx.lineWidth=1;ctx.beginPath();segment(ctx,-r*2.4,-r*.8,-r,-r*.55);segment(ctx,-r*2.6,r*.6,-r,r*.45);ctx.stroke();}
    }else if(['swords','swordEnergy','runeArrow'].includes(e.abilityId))this.swords.draw(ctx,e.abilityId==='swords'?54:40,e.abilityId==='swords'?23:17);
    else{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(-r*.5,0,r,-1.1,1.1);ctx.stroke();}
    if(e.hostile){ctx.globalAlpha=.9;ctx.strokeStyle='#f6a28b';ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(-r*.6,-r*1.12);ctx.lineTo(r*1.5,0);ctx.lineTo(-r*.6,r*1.12);ctx.stroke();}
    ctx.restore();
  }
  drawBurst(ctx,b,options={}){
    const t=clamp(b.age/Math.max(.001,b.life));if(t>=1)return;
    const landing=b.kind==='landing',fade=(1-t)**1.1,r=Math.max(3,b.radius||8),groundY=b.y+(b.groundOffset||0),data=this.data(b),visual=this.view(b);
    if(landing&&b.abilityId==='meteor'){
      Object.assign(visual,{type:'superBurst',skillId:'meteor',id:b.id,seed:b.id,x:b.x,y:groundY,r,life:b.life-b.age,maxLife:b.life});this.supers.drawEffect(ctx,visual,options);return;
    }
    if(landing&&['lightning','storm'].includes(b.abilityId)){
      Object.assign(visual,{type:'lightning',seed:b.id,x:b.x-14,y:groundY-240,x2:b.x,y2:groundY,life:b.life-b.age,maxLife:b.life});this.combat.drawEffect(ctx,visual,options);
      ctx.save();ctx.globalAlpha=fade*.7;ctx.strokeStyle='#bcdeff';ctx.lineWidth=1.5;circle(ctx,b.x,groundY,r*(.65+t*.32));ctx.stroke();ctx.restore();return;
    }
    ctx.save();ctx.translate(b.x,landing?groundY:b.y);ctx.globalAlpha=fade;
    const count=options.dense?4:8,spread=options.reduced?.55:.2+t*.8;
    if(b.abilityId==='iceShatter'||b.abilityId==='heatEruption'){
      const ice=b.abilityId==='iceShatter';
      // The outer edge is the real triggered mark, not an expanding damage
      // area. Raised fragments dissipate above the same footprint.
      ctx.strokeStyle=ice?'#b6ebf4':'#f1b37b';ctx.globalAlpha=fade*.8;ctx.lineWidth=2;circle(ctx,0,0,Math.max(1,r-1));ctx.stroke();
      if(ice){
        ctx.globalAlpha=fade*.13;ctx.fillStyle='#bfeff7';ctx.fill();
        for(let i=0;i<(options.dense?6:12);i++){const p=data.particles[i],rr=r*p.r*spread,yy=Math.sin(p.a)*rr-(options.reduced?0:Math.sin(t*Math.PI)*r*.35);ctx.globalAlpha=fade*.9;crystal(ctx,Math.cos(p.a)*rr,yy,(4+p.size*2)*(1-t*.35),p.a*.5+t*.7);}
      }else{
        ctx.globalAlpha=fade*.8;ctx.strokeStyle='#ffd08a';ctx.lineWidth=1.4;ctx.beginPath();for(let i=0;i<5;i++){const a=i*TAU/5,rr=r*.85;ctx.moveTo(Math.cos(a)*r*.15,Math.sin(a)*r*.15);ctx.lineTo(Math.cos(a+.15)*rr*.5,Math.sin(a+.15)*rr*.5);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.stroke();
        for(let i=0;i<(options.dense?4:7);i++){const p=data.particles[i],rr=r*.48*p.r;ctx.globalAlpha=fade*.9;flame(ctx,Math.cos(p.a)*rr,Math.sin(p.a)*rr,Math.min(35,r*.65)*(1-t*.72),p.phase+(options.reduced?0:t*4));}
        if(!options.reduced)for(let i=0;i<(options.dense?3:6);i++){const p=data.particles[i],rr=r*p.r*spread;ctx.globalAlpha=fade;ellipse(ctx,Math.cos(p.a)*rr,Math.sin(p.a)*rr-Math.sin(t*Math.PI)*r*.38,1.4,2.5,'#ffd797');}
      }
    }else if(b.abilityId==='spiderHatch'){
      const size=Math.min(22,r),count=options.dense?4:6;ctx.globalAlpha=fade*.85;ctx.strokeStyle='#e5dfc6';ctx.lineWidth=1.1;ctx.beginPath();
      for(let i=0;i<count;i++){const a=i*TAU/count,rr=size*(.3+spread*.6),x=Math.cos(a)*rr,y=Math.sin(a)*rr*.65;ctx.moveTo(x*.35,y*.35);ctx.quadraticCurveTo(x*.72-Math.sin(a)*3,y*.72+Math.cos(a)*3,x,y);}ctx.stroke();
      ctx.globalAlpha=fade*.65;for(let i=0;i<3;i++){const a=i*2.4;ellipse(ctx,Math.cos(a)*size*spread,Math.sin(a)*size*spread*.65,1.7,1,'#e5dfc6');}
    }else if(FIRE.has(b.abilityId)){
      const size=Math.min(26,r*1.5);ctx.globalAlpha=fade*.85;for(let i=0;i<(options.dense?3:5);i++){const p=data.particles[i];flame(ctx,Math.cos(p.a)*size*.42,Math.sin(p.a)*size*.28,size*(.4+.6*(1-t)),p.phase);}
      ctx.globalAlpha=fade*.85;ellipse(ctx,0,0,size*(1-t)*.55,size*(1-t)*.35,'#ffe7ae');
    }else if(FROST.has(b.abilityId)){
      const size=Math.min(25,r*2.3);for(let i=0;i<count;i++){const p=data.particles[i],rr=size*spread;crystal(ctx,Math.cos(p.a)*rr,Math.sin(p.a)*rr,p.size*1.8*(1-t*.5),p.a+t);}
    }else if(b.abilityId==='waterBolt'){
      ctx.strokeStyle='#a7e4df';ctx.lineWidth=2*(1-t)+.6;ctx.beginPath();ctx.ellipse(0,0,r*(.4+spread),r*(.2+spread*.5),0,0,TAU);ctx.stroke();for(let i=0;i<count;i++){const p=data.particles[i],rr=r*1.8*spread;ellipse(ctx,Math.cos(p.a)*rr,Math.sin(p.a)*rr-Math.sin(t*Math.PI)*7,1.7,2.6,'#b8eeea');}
    }else if(landing&&b.abilityId==='stoneLob'){
      ctx.strokeStyle='#d3c5a0';ctx.lineWidth=3*(1-t)+.6;ctx.globalAlpha=fade*.65;circle(ctx,0,0,r*(.25+spread*.7));ctx.stroke();ctx.globalAlpha=fade;
      for(let i=0;i<count;i++){const p=data.particles[i],rr=r*p.r*spread;ctx.save();ctx.translate(Math.cos(p.a)*rr,Math.sin(p.a)*rr-(options.reduced?0:Math.sin(t*Math.PI)*15));ctx.rotate(p.a+t);rock(ctx,p.size*(1.5-t*.4));ctx.restore();}
    }else if(b.visualVariant==='web'){
      ctx.strokeStyle='#ece9d1';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<4;i++){const a=i*TAU/4;segment(ctx,Math.cos(a)*2,Math.sin(a)*2,Math.cos(a)*10*spread,Math.sin(a)*10*spread);}ctx.stroke();
    }else{
      ctx.strokeStyle=abilityColor(b);ctx.lineWidth=1.6;ctx.rotate(b.angle||0);ctx.beginPath();segment(ctx,-10*spread,0,10*spread,0);segment(ctx,0,-7*spread,0,7*spread);ctx.stroke();
      if(!options.dense)for(let i=0;i<3;i++){const p=data.particles[i],rr=14*spread;ellipse(ctx,Math.cos(p.a)*rr,Math.sin(p.a)*rr,1.5,.8,abilityColor(b));}
    }
    ctx.restore();
  }
  drawStatuses(ctx,game,options={}){
    const now=game.abilities?.clock||0;
    for(const [entity,s] of game.abilities?.statuses||[]){
      if(entity.hp<=0||options.visible&&!options.visible(entity))continue;
      const r=Math.max(6,entity.r||14),footY=friendlyFoot(entity).y-entity.y,bottom=Math.max(r*.7,footY),bounds=options.viewBounds;if(bounds&&(entity.x+r+24<bounds.minX||entity.x-r-24>bounds.maxX||entity.y+r+30<bounds.minY||entity.y-r-30>bounds.maxY))continue;
      const frozen=s.frozenUntil>now,slowed=s.slowUntil>now,hitAge=Number.isFinite(s.shieldHitAt)?now-s.shieldHitAt:Infinity,shield=s.shieldUntil>now&&s.shield>0;
      ctx.save();ctx.translate(entity.x,entity.y);ctx.lineJoin='round';ctx.lineCap='round';
      if(slowed&&!frozen){ctx.globalAlpha=.68;for(let i=0;i<(options.dense?2:3);i++)crystal(ctx,(i-1)*r*.46,bottom,Math.min(10,r*.5),i*.22-.2);}
      if(frozen){
        ctx.fillStyle='#b5e7f4';ctx.strokeStyle='#b9eaff';ctx.lineWidth=1.4;ctx.globalAlpha=.13;polygon(ctx,[[-r*.82,bottom],[-r*1.02,-r*.16],[-r*.53,-r*.93],[r*.42,-r*.98],[r*.95,-r*.25],[r*.77,bottom]]);ctx.globalAlpha=.74;ctx.stroke();
        ctx.globalAlpha=.45;ctx.strokeStyle='#e1faff';ctx.beginPath();segment(ctx,-r*.53,-r*.93,-r*.17,bottom);segment(ctx,r*.42,-r*.98,r*.12,r*.15);ctx.stroke();ctx.globalAlpha=.75;crystal(ctx,-r*.6,bottom,Math.min(13,r*.55),-.2);crystal(ctx,r*.59,bottom,Math.min(11,r*.5),.2);
      }
      // Fire stays visible at the silhouette edge even while frost is active.
      if(s.burn){ctx.globalAlpha=.87;const phase=options.reduced?0:now*8+(entity.id||0);flame(ctx,-r*.65,r*.12,Math.min(9,r*.48),phase);flame(ctx,r*.62,-r*.18,Math.min(8,r*.43),phase+2);if(!options.dense&&!options.reduced){ctx.globalAlpha=.65;ellipse(ctx,-r*.7,-r*.5-(now*18%9),1,1.5,'#ffd398');}}
      if(shield||hitAge>=0&&hitAge<.22){
        const radius=r+7,broken=!shield,hit=hitAge>=0&&hitAge<.22?1-hitAge/.22:0;
        ctx.strokeStyle=broken?'#d8f5e7':'#a5dcd4';ctx.lineWidth=1.4;ctx.globalAlpha=broken?hit*.55:.48;circle(ctx,0,0,radius);ctx.stroke();
        if(hit>0){ctx.globalAlpha=hit*.92;ctx.strokeStyle='#e0fff0';ctx.lineWidth=2.8;ctx.beginPath();ctx.arc(0,0,radius,(s.shieldHitAngle||0)-.42,(s.shieldHitAngle||0)+.42);ctx.stroke();
          if(!options.dense){ctx.globalAlpha=hit*.6;for(let i=0;i<3;i++){const a=(s.shieldHitAngle||0)+(i-1)*.28,rr=radius+(1-hit)*8;crystal(ctx,Math.cos(a)*rr,Math.sin(a)*rr,3,a);}}
        }
      }
      ctx.restore();
    }
  }
}
