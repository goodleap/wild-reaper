// Visual feedback only: the simulation owns hit positions, ranges, and life.
// Geometry lives with its effect; frame budgets bound decorative work without
// removing the contact flash or the readable outline of a resolved attack.
const TAU=Math.PI*2;
const EMPTY=Object.freeze({});
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const ease=v=>1-(1-clamp(v))**3;
const THEMES=Object.freeze({
  arrow:{core:'#fffde7',edge:'#e3efac',glow:'#b6dd83',dust:'#a6b17b'},
  blade:{core:'#fffbed',edge:'#ffe8ac',glow:'#dabb77',dust:'#beb181'},
  electric:{core:'#f6fdff',edge:'#bfeaff',glow:'#72bdf1',dust:'#8fb4ca'},
  earth:{core:'#f1f6d9',edge:'#ceddae',glow:'#9fba89',dust:'#a7ac8c'},
  magic:{core:'#fff0ff',edge:'#e3c7fa',glow:'#b68bd7',dust:'#ab91bd'},
  fire:{core:'#fff7d5',edge:'#ffd18b',glow:'#ea9157',dust:'#b39275'},
  spores:{core:'#fff0ff',edge:'#edc4fb',glow:'#bd83d9',dust:'#b394c1'},
  victory:{core:'#fffce1',edge:'#f6e5a5',glow:'#d8c586',dust:'#b3b889'},
  bleed:{core:'#ffecd3',edge:'#ebbb90',glow:'#c18c68',dust:'#a99179'}
});
const ELECTRIC=new Set(['lightning','companionLightning','storm','conduction','angel']);
const EARTH=new Set(['pulse','echo','companionPulse','companionEcho']);
function themeFor(e){
  if(e.type==='defeat')return 'victory';
  if(e.type==='bloomBurst')return 'spores';
  if(e.type==='mushroomBlast'||e.skillId==='meteor')return 'fire';
  if(e.type==='bossSlam'||EARTH.has(e.source))return 'earth';
  if(ELECTRIC.has(e.source))return 'electric';
  if(e.source==='orbit'||e.source==='sword')return 'blade';
  if(e.source==='super'||e.source==='relic')return 'magic';
  if(e.source==='mushroom')return 'fire';
  if(e.source==='bleed')return 'bleed';
  return 'arrow';
}
function noise(seed,i){let x=Math.imul((seed|0)^0x6d2b79f5,i+19);x=Math.imul(x^(x>>>15),0x2c1b3c6d);x=Math.imul(x^(x>>>12),0x297a2d39);return((x^(x>>>15))>>>0)/4294967296;}
function seedFor(e){return Number.isFinite(e.seed)?e.seed|0:(Math.imul(Math.round(e.x*16),73856093)^Math.imul(Math.round(e.y*16),19349663)^Math.round((e.angle||0)*1000))|0;}
function valid(e){return Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.life)&&e.life>0&&Number.isFinite(e.maxLife)&&e.maxLife>0;}
function line(ctx,x1,y1,x2,y2){ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);}
function star(ctx,r,lean=1){
  ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(-r*.2,-r*.15);ctx.lineTo(0,-r*.64*lean);ctx.lineTo(r*.18,-r*.15);ctx.lineTo(r,0);ctx.lineTo(r*.18,r*.15);ctx.lineTo(0,r*.64*lean);ctx.lineTo(-r*.2,r*.15);ctx.closePath();ctx.fill();
}
function fleck(ctx,x,y,size,dx,dy){
  ctx.moveTo(x+dx*size,y+dy*size);ctx.lineTo(x-dy*size*.48,y+dx*size*.48);ctx.lineTo(x-dx*size*.75,y-dy*size*.75);ctx.lineTo(x+dy*size*.4,y-dx*size*.4);ctx.closePath();
}

export class CombatVfx {
  constructor(makeCanvas){
    this.makeCanvas=makeCanvas||(typeof document!=='undefined'?()=>document.createElement('canvas'):null);
    this.geometry=new WeakMap();this.sprites=new Map();this.geometryBuilds=0;this.spriteBuilds=0;
    this.options=EMPTY;this.budget=240;this.remaining=240;this.groundRemaining=67;this.particles=0;this.coreDraws=0;
  }
  get stats(){return {budget:this.budget,particles:this.particles,remaining:this.remaining,geometryBuilds:this.geometryBuilds,spriteCount:this.sprites.size,spriteBuilds:this.spriteBuilds,spritePixels:this.sprites.size*96*48,coreDraws:this.coreDraws};}
  beginFrame(options=EMPTY){
    this.options=options;
    const limit=options.reduced?0:options.dense?110:240;
    this.budget=Number.isFinite(options.particleBudget)?clamp(Math.floor(options.particleBudget),0,limit):limit;
    this.remaining=this.budget;this.groundRemaining=Math.floor(this.budget*.28);this.particles=0;this.coreDraws=0;
  }
  _take(count,ground=false){
    const n=Math.min(count,this.remaining,ground?this.groundRemaining:Infinity);
    this.remaining-=n;this.particles+=n;if(ground)this.groundRemaining-=n;return n;
  }
  _data(e){
    let data=this.geometry.get(e);if(data)return data;
    const seed=seedFor(e),values=new Float32Array(28*8),boundary=new Float32Array(16*2);
    for(let i=0;i<28;i++){
      const a=i*2.39996323+noise(seed,i)*.52,at=i*8;
      values[at]=Math.cos(a);values[at+1]=Math.sin(a);values[at+2]=.24+noise(seed,i+40)*.53;
      values[at+3]=.65+noise(seed,i+80)*.7;values[at+4]=noise(seed,i+120)*TAU;
      values[at+5]=.5+noise(seed,i+160)*.5;values[at+6]=noise(seed,i+200)*.045;values[at+7]=.6+noise(seed,i+240)*.4;
    }
    for(let i=0;i<16;i++){const a=i*TAU/16,r=.37+noise(seed,i+280)*.12;boundary[i*2]=Math.cos(a)*r;boundary[i*2+1]=Math.sin(a)*r*.73;}
    data={values,boundary,phase:noise(seed,320)*TAU};this.geometry.set(e,data);this.geometryBuilds++;return data;
  }
  _atlas(name){
    if(!this.makeCanvas)return null;
    if(this.sprites.has(name))return this.sprites.get(name);
    // Only the fixed theme table reaches this cache: at most nine 96 x 48 tiles.
    const colors=THEMES[name],canvas=this.makeCanvas();
    if(!canvas?.getContext)return null;
    canvas.width=96;canvas.height=48;const ctx=canvas.getContext('2d');if(!ctx)return null;
    const glow=ctx.createRadialGradient(24,24,0,24,24,23);
    glow.addColorStop(0,colors.core);glow.addColorStop(.17,colors.edge+'ca');glow.addColorStop(.48,colors.glow+'5c');glow.addColorStop(1,colors.glow+'00');
    ctx.fillStyle=glow;ctx.fillRect(0,0,48,48);
    ctx.save();ctx.beginPath();ctx.rect(48,0,48,48);ctx.clip();
    for(let i=0;i<7;i++){
      const a=i*2.399,x=72+Math.cos(a)*(i%3)*4.5,y=25+Math.sin(a)*5,r=11+(i%3)*2;
      const puff=ctx.createRadialGradient(x,y,0,x,y,r);puff.addColorStop(0,colors.dust+'b3');puff.addColorStop(.42,colors.dust+'68');puff.addColorStop(1,colors.dust+'00');ctx.fillStyle=puff;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    ctx.restore();this.sprites.set(name,canvas);this.spriteBuilds++;return canvas;
  }
  _glow(ctx,name,size,alpha){
    if(alpha<=0)return;
    ctx.globalAlpha=alpha;const atlas=this._atlas(name);
    if(atlas)ctx.drawImage(atlas,0,0,48,48,-size,-size,size*2,size*2);
    else{ctx.fillStyle=THEMES[name].glow;ctx.beginPath();ctx.ellipse(0,0,size*.62,size*.5,0,0,TAU);ctx.fill();}
  }
  drawHit(ctx,e,options=this.options){
    if(e.type!=='hit')return false;
    if(!valid(e))return true;
    const reduced=!!options.reduced,dense=!!options.dense,t=clamp(1-e.life/e.maxLife),elapsed=t*e.maxLife;
    const name=themeFor(e),colors=THEMES[name],strength=clamp(Number(e.strength)||0),size=clamp((Number(e.r)||10)*(.74+strength*.24),5,24);
    const fade=(1-t)**1.6,flash=clamp(1-elapsed/.095),travel=reduced?.35:ease(t/.85),angle=Number.isFinite(e.angle)?e.angle:0;
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(angle);ctx.shadowBlur=0;ctx.lineCap='round';ctx.lineJoin='round';
    this.coreDraws++;
    if(!reduced&&!dense&&this.remaining>0)this._glow(ctx,name,size*(1.4+flash*.45),flash*.34);
    ctx.globalAlpha=fade;ctx.fillStyle=colors.core;
    if(name==='blade'){
      // A curved cut stays aligned to the real attack and reads as a blade hit.
      const reach=size*(1.25+travel*.65);ctx.beginPath();ctx.moveTo(-reach,-size*.48);ctx.quadraticCurveTo(size*.24,-size*.95,reach,size*.48);ctx.quadraticCurveTo(size*.35,-size*.16,-reach,-size*.48);ctx.fill();
      ctx.globalAlpha=fade*.58;ctx.strokeStyle=colors.edge;ctx.lineWidth=.85;ctx.beginPath();ctx.moveTo(-reach*.75,size*.35);ctx.quadraticCurveTo(0,size*.63,reach*.7,-size*.28);ctx.stroke();
    }else{
      star(ctx,size*(.32+flash*.72),name==='earth'?.7:1);
      if(!reduced&&flash>.12){ctx.globalAlpha=flash*.42;ctx.strokeStyle=colors.edge;ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(0,0,size*(.55+travel*.7),-.7,.45);ctx.arc(0,0,size*(.55+travel*.7),2.4,3.65);ctx.stroke();}
    }
    const count=reduced?0:this._take(dense?4:8);
    if(count){
      const particles=this._data(e).values;ctx.lineWidth=name==='electric'?1.1:1.4;
      for(let i=0;i<count;i++){
        const at=i*8,dx=particles[at],dy=particles[at+1],speed=particles[at+2],scale=particles[at+3];
        const distance=size*(.28+travel*(.7+speed*1.65)),length=(3+size*.34)*scale*(1-t);
        const x=dx*distance,y=dy*distance-(name==='earth'?Math.sin(t*Math.PI)*size*.25:0);
        ctx.globalAlpha=fade*(i%3===0?1:.68);ctx.strokeStyle=i%3?colors.edge:colors.core;ctx.fillStyle=i%3?colors.edge:colors.core;ctx.beginPath();
        if(name==='earth'||name==='bleed'){fleck(ctx,x,y,(1.1+scale)*(.9-t*.3),dx,dy);ctx.fill();}
        else if(name==='electric'){ctx.moveTo(x,y);ctx.lineTo(x+dx*length*.5-dy*1.9,y+dy*length*.5+dx*1.9);ctx.lineTo(x+dx*length,y+dy*length);ctx.stroke();}
        else{line(ctx,x,y,x+dx*length,y+dy*length);ctx.stroke();}
      }
    }
    ctx.restore();return true;
  }
  drawBurst(ctx,e,options=this.options,layer='ground'){
    const defeat=e.type==='defeat'&&e.boss;
    if(!defeat&&e.type!=='mushroomBlast'&&e.type!=='bossSlam'&&e.type!=='bloomBurst'&&!(e.type==='superBurst'&&e.skillId==='meteor'))return false;
    if(!valid(e)||!Number.isFinite(e.r)||e.r<=0)return true;
    if(layer!=='ground'&&layer!=='air')return false;
    const t=clamp(1-e.life/e.maxLife),elapsed=t*e.maxLife,name=themeFor(e),data=this._data(e);
    ctx.save();ctx.translate(e.x,Number.isFinite(e.groundY)&&layer==='ground'?e.groundY:e.y);ctx.shadowBlur=0;ctx.lineJoin='round';ctx.lineCap='round';
    if(layer==='ground')this._ground(ctx,e,t,elapsed,name,data,options,defeat);
    else this._air(ctx,e,t,elapsed,name,data,options,defeat);
    ctx.restore();return true;
  }
  _pressure(ctx,radius,phase,segments,alpha,width,color){
    if(alpha<=0||radius<=0)return;
    ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();
    for(let i=0;i<segments;i++){
      const a=phase+i*TAU/segments+.025,span=TAU/segments*(i%3===0?.68:.82);
      ctx.moveTo(Math.cos(a)*radius,Math.sin(a)*radius);ctx.arc(0,0,radius,a,a+span);
    }
    ctx.stroke();
  }
  _ground(ctx,e,t,elapsed,name,data,options,defeat){
    const r=e.r,colors=THEMES[name],reduced=!!options.reduced,dense=!!options.dense,fade=(1-t)**.8;
    if(defeat){
      // The defeated boss leaves a compact dissolve, never an attack boundary.
      if(!dense&&!reduced){ctx.save();ctx.scale(1,.55);this._glow(ctx,name,r*.72,fade*.13);ctx.restore();}
    }else{
      if(e.skillId==='meteor'){
        ctx.globalAlpha=fade*.6;ctx.fillStyle='#403a36';ctx.beginPath();
        for(let i=0;i<16;i++)ctx[i?'lineTo':'moveTo'](data.boundary[i*2]*r,data.boundary[i*2+1]*r);
        ctx.closePath();ctx.fill();ctx.globalAlpha=fade*.58;ctx.strokeStyle='#b68159';ctx.lineWidth=Math.min(3,r*.04);ctx.stroke();
        ctx.globalAlpha=fade*.78;ctx.strokeStyle='#f4c58b';ctx.lineWidth=Math.min(.85,r*.016);ctx.stroke();
      }
      if(e.type==='bossSlam'||e.skillId==='meteor'){
        const spread=reduced?1:ease(elapsed/.12);ctx.globalAlpha=fade*.55;ctx.strokeStyle=e.type==='bossSlam'?'#63775b':'#9f714e';ctx.lineWidth=Math.min(1.4,r*.025);ctx.beginPath();
        for(let i=0;i<(dense?4:7);i++){
          const at=i*8,dx=data.values[at],dy=data.values[at+1],length=r*(.42+data.values[at+2]*.35)*spread;
          ctx.moveTo(dx*r*.14,dy*r*.14);ctx.lineTo(dx*length*.55-dy*r*.035,dy*length*.55+dx*r*.035);ctx.lineTo(dx*length,dy*length);
        }
        ctx.stroke();
      }
      const expansion=reduced?.9:.14+ease(elapsed/.19)*.82;
      const crestAlpha=fade*(reduced?.42:clamp(1-elapsed/.29)*.73);
      // Stroke width is included in the radius, so the visual never advertises
      // a larger footprint than the resolved damage zone.
      const width=Math.min(r*.07,reduced?1.1:1.5+1.4*(1-t));
      this._pressure(ctx,Math.max(.01,r*expansion-width*.5),data.phase,dense?5:9,crestAlpha,width,colors.edge);
      if(!reduced&&!dense)this._pressure(ctx,Math.max(.01,r*expansion*.77-width*.3),data.phase+.28,7,crestAlpha*.3,width*.45,colors.core);
    }
    if(reduced||elapsed<.045)return;
    const count=this._take(dense?3:defeat?4:7,true),dustFade=Math.sin(clamp((elapsed-.045)/Math.max(.06,e.maxLife-.045))*Math.PI)*fade;
    const atlas=count?this._atlas(name):null;
    for(let i=0;i<count;i++){
      const at=i*8,dx=data.values[at],dy=data.values[at+1],spread=ease(elapsed/.3),distance=r*(defeat?.23:.45+data.values[at+2]*.31)*spread;
      const size=Math.min(15,r*.13)*(1+t*.55)*data.values[at+3],x=dx*distance,y=dy*distance;
      ctx.globalAlpha=dustFade*(defeat?.1:.2);
      if(atlas)ctx.drawImage(atlas,48,0,48,48,x-size,y-size*.6,size*2,size*1.2);
      else{ctx.fillStyle=colors.dust;ctx.beginPath();ctx.ellipse(x,y,size*.75,size*.4,0,0,TAU);ctx.fill();}
    }
  }
  _eruption(ctx,e,elapsed,name,data,dense){
    const meteor=e.skillId==='meteor',mushroom=e.type==='mushroomBlast',bloom=e.type==='bloomBurst';
    if(!meteor&&!mushroom&&!bloom)return;
    const span=meteor?.32:mushroom?.26:.3,fade=clamp(1-elapsed/span);if(fade<=0)return;
    const colors=THEMES[name],size=Math.min(meteor?46:36,e.r*.43)*(.46+ease(elapsed/.14)*.54);
    // The blast's short-lived silhouette is essential feedback, so dense scenes
    // retain it even after their decorative spark allowance is exhausted.
    ctx.save();ctx.translate(0,-(meteor?size*.06:0));
    if(meteor){
      for(let layer=0;layer<(dense?2:3);layer++){
        const s=size*(layer===0?1:layer===1?.72:.39);
        ctx.globalAlpha=fade*(layer===0?.5:layer===1?.72:.9);ctx.fillStyle=layer===0?'#a85436':layer===1?'#eea05b':colors.core;
        ctx.beginPath();ctx.moveTo(-s*.8,s*.12);ctx.bezierCurveTo(-s,-s*.13,-s*.73,-s*.53,-s*.55,-s*.73);
        ctx.lineTo(-s*.45,-s*.3);ctx.bezierCurveTo(-s*.56,-s*.72,-s*.14,-s*.9,-s*.18,-s*1.28);
        ctx.bezierCurveTo(s*.17,-s*.9,s*.1,-s*.62,s*.2,-s*.4);ctx.lineTo(s*.45,-s*.94);
        ctx.bezierCurveTo(s*.83,-s*.67,s*.64,-s*.31,s*.63,-s*.16);ctx.lineTo(s*.89,-s*.42);
        ctx.bezierCurveTo(s*1.04,-s*.04,s*.69,s*.34,s*.24,s*.29);ctx.bezierCurveTo(-s*.05,s*.41,-s*.53,s*.36,-s*.8,s*.12);ctx.closePath();ctx.fill();
      }
    }else{
      const lobes=dense?4:6,spread=.38+ease(elapsed/.17)*.45;
      for(let i=0;i<lobes;i++){
        const a=data.phase+i*TAU/lobes,dx=Math.cos(a),dy=Math.sin(a),r=size*(.64+data.values[i*8+2]*.22),x=dx*size*spread,y=dy*size*spread*.7;
        ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.globalAlpha=fade*(bloom?.34:.42);ctx.fillStyle=bloom?'#92529e':'#aa6d42';
        ctx.beginPath();ctx.moveTo(-r*.58,0);
        if(bloom){ctx.bezierCurveTo(-r*.23,-r*.74,r*.58,-r*.92,r*.94,-r*.08);ctx.quadraticCurveTo(r*.65,r*.05,r*.84,r*.2);ctx.bezierCurveTo(r*.28,r*.77,-r*.45,r*.5,-r*.58,0);}
        else{ctx.bezierCurveTo(-r*.74,-r*.48,-r*.14,-r*.76,r*.15,-r*.54);ctx.bezierCurveTo(r*.71,-r*.76,r*.96,-r*.22,r*.67,r*.05);ctx.bezierCurveTo(r*.98,r*.43,r*.28,r*.69,r*.02,r*.4);ctx.bezierCurveTo(-r*.36,r*.67,-r*.83,r*.35,-r*.58,0);}
        ctx.closePath();ctx.fill();
        ctx.globalAlpha=fade*(bloom?.5:.6);ctx.fillStyle=colors.edge;ctx.beginPath();ctx.moveTo(-r*.47,0);ctx.bezierCurveTo(-r*.18,-r*.5,r*.47,-r*.46,r*.58,-r*.04);ctx.bezierCurveTo(r*.34,r*.35,-r*.25,r*.36,-r*.47,0);ctx.closePath();ctx.fill();ctx.restore();
      }
      ctx.globalAlpha=fade*.75;ctx.fillStyle=colors.core;ctx.beginPath();ctx.ellipse(0,0,size*.4,size*.29,0,0,TAU);ctx.fill();
    }
    ctx.restore();
  }
  _air(ctx,e,t,elapsed,name,data,options,defeat){
    const r=e.r,colors=THEMES[name],reduced=!!options.reduced,dense=!!options.dense,fade=(1-t)**1.1;
    const flash=clamp(1-elapsed/(defeat?.16:.12)),core=Math.min(defeat?22:27,r*.3)*(reduced?.4:.35+flash*.65);
    this.coreDraws++;
    if(flash>0||reduced){
      if(!reduced&&!dense&&this.remaining>0)this._glow(ctx,name,Math.min(r*.44,45),flash*.65);
      ctx.globalAlpha=reduced?fade*.48:flash*.88;ctx.fillStyle=colors.core;
      ctx.save();ctx.rotate(data.phase*.2);star(ctx,core,defeat?1.2:.9);ctx.restore();
      if(!reduced){ctx.globalAlpha=flash*.28;ctx.fillStyle=colors.edge;ctx.save();ctx.rotate(.8+data.phase*.2);star(ctx,core*1.5,.65);ctx.restore();}
    }
    if(!defeat&&!reduced)this._eruption(ctx,e,elapsed,name,data,dense);
    if(reduced)return;
    const count=dense?8:defeat?22:18,spread=ease(elapsed/(defeat?.52:.36));
    for(let i=0;i<count;i++){
      const at=i*8,delay=i<4?0:data.values[at+6];if(elapsed<delay)continue;if(!this._take(1))break;
      const dx=data.values[at],dy=data.values[at+1],distance=r*data.values[at+2]*spread;
      const lift=Math.sin(clamp((elapsed-delay)/Math.max(.01,e.maxLife-delay))*Math.PI)*Math.min(defeat?21:16,r*.15)*data.values[at+5];
      const rocky=e.type==='bossSlam'||e.skillId==='meteor',petals=e.type==='bloomBurst';
      const x=dx*distance,y=dy*distance-lift,size=Math.min(defeat?4.4:rocky?5.2:3.5,r*.055)*data.values[at+3]*(1-t*.48);
      const rotation=data.values[at+4]+t*(i%2?1:-1)*1.1,cx=Math.cos(rotation),cy=Math.sin(rotation);
      ctx.globalAlpha=fade*(i%3===0?.95:.68);ctx.fillStyle=i%3===0?colors.core:colors.edge;
      if(petals){
        // Petals have a tapered stem and a rounded, split tip; distinct from
        // mineral fragments even when the frame has no decorative budget left.
        ctx.beginPath();ctx.moveTo(x-cx*size,y-cy*size);
        ctx.bezierCurveTo(x-cy*size*.85,y+cx*size*.85,x+cx*size*1.2-cy*size*.65,y+cy*size*1.2+cx*size*.65,x+cx*size,y+cy*size);
        ctx.bezierCurveTo(x+cx*size*1.5+cy*size*.45,y+cy*size*1.5-cx*size*.45,x+cy*size*.65,y-cx*size*.65,x-cx*size,y-cy*size);ctx.fill();
      }else if(rocky){
        ctx.fillStyle=e.skillId==='meteor'?'#6b4c42':'#6d795c';ctx.beginPath();fleck(ctx,x,y,size,cx,cy);ctx.fill();
        ctx.fillStyle=i%3===0?colors.core:e.skillId==='meteor'?'#d3a376':'#bcc39a';
        ctx.beginPath();ctx.moveTo(x+cx*size,y+cy*size);ctx.lineTo(x-cy*size*.48,y+cx*size*.48);ctx.lineTo(x,y);ctx.closePath();ctx.fill();
      }else if(e.type==='mushroomBlast'&&i%3!==0){
        ctx.beginPath();ctx.ellipse(x,y,size*.66,size*.84,rotation,0,TAU);ctx.fill();
        ctx.globalAlpha=fade*.55;ctx.fillStyle=colors.core;ctx.beginPath();ctx.ellipse(x-size*.17,y-size*.23,size*.23,size*.27,0,0,TAU);ctx.fill();
      }else{ctx.beginPath();fleck(ctx,x,y,size,cx,cy);ctx.fill();}
      if(i%3===0&&elapsed<.32){
        ctx.globalAlpha=fade*.5;ctx.strokeStyle=colors.glow;ctx.lineWidth=Math.min(1.4,r*.022);ctx.beginPath();
        const length=Math.min(11,r*.09)*(1-t);line(ctx,x-dx*length,y-dy*length+lift*.12,x,y);ctx.stroke();
      }
    }
  }
}
