import { AbilityVisuals, TAU, clamp, abilityColor, circle, polygon, segment } from './ability-visuals.js';
import { drawSpecialistBossGround } from './enemy-art/specialist-bosses.js';
import { visitAttackDepthBands } from './attack-depth.js';
import { beamCapsule, capsulePath } from './attack-capsule.js';

const art=new AbilityVisuals();
const depthItems=new WeakMap();
const groundedWindups=new Set(['domain','vineTrap','vortex','frostRing','tidalWave']);
const visible=(options,item,extra=0)=>{
  if(options.visible&&!options.visible(item))return false;
  const b=options.viewBounds;if(!b)return true;
  // Include long beams/cones and the complete airborne meteor trajectory.
  const r=Math.max(item.parameters?.range||0,item.parameters?.radius||item.radius||item.r||0,extra)+36;
  return item.x+r>=b.minX&&item.x-r<=b.maxX&&item.y+r>=b.minY&&item.y-r<=b.maxY;
};
export const abilityArtDiagnostics=()=>art.diagnostics;
const directionalDepth=e=>(e.sourceY??e.origin?.y??e.y)+(e.sourceGroundOffset??e.groundOffset??0)+Math.sin(e.angle||0)*.25;
const movingDepth=e=>Number.isFinite(e.groundY)?e.groundY:e.y+(e.groundOffset||0);
function depthPart(e){
  if(e.age<e.windup){
    if(e.abilityId==='stoneLob')return e.age/e.windup>=.5?'stone-lob':null;
    return e.abilityId==='meteor'||groundedWindups.has(e.abilityId)?null:'windup';
  }
  return ['projectile','cone','beam'].includes(e.shape)?e.shape:null;
}
function emitDepthItem(e,items,index,part,sortY,visit){
  let item=items[index];if(!item){item={effect:e,index};items[index]=item;}
  item.part=part;item.sortY=sortY;visit(item);
}
// Reuse descriptors while each effect is alive. The runtime remains untouched;
// sorting changes only which existing pixels an actor can cover.
export function visitAbilityDepthItems(game,options={},visit){
  for(const e of game.abilities?.effects||[]){
    if(!visible(options,e))continue;
    const part=depthPart(e);if(!part)continue;
    let items=depthItems.get(e);if(!items){items=[];depthItems.set(e,items);}
    if(part==='beam'){
      const {range,radius}=e.parameters,ux=Math.cos(e.angle),uy=Math.sin(e.angle),groundY=movingDepth(e),endY=groundY+uy*range;
      const horizontal=Math.abs(uy)<1e-8,side=horizontal?0:Math.abs(ux)*radius;
      const minY=Math.min(groundY,endY)-side,maxY=Math.max(groundY,endY)+side;
      const minX=Math.min(e.x,e.x+ux*range)-Math.abs(uy)*radius,maxX=Math.max(e.x,e.x+ux*range)+Math.abs(uy)*radius;
      if(!items.drawBeam)items.drawBeam=ctx=>art.drawBeamBody(ctx,e);
      let index=0;
      // The complete old painter is clipped at horizontal, pixel-aligned
      // boundaries. Actor feet supply exact cuts when the scene has them.
      visitAttackDepthBands(e,{minY,maxY,step:32,draw:items.drawBeam,viewBounds:options.viewBounds,depthTransform:options.depthTransform,depthCuts:options.depthCutsFor?.(minX,maxX,{x:e.x,y:groundY,x2:e.x+ux*range,y2:endY,radius:radius+2})},band=>{
        let item=items[index];if(!item){item={effect:e,index};items[index]=item;}
        item.part='beam-body';item.sortY=band.sortY;item.draw=band.draw;visit(item);index++;
      });
      emitDepthItem(e,items,index,'beam-mouth',directionalDepth(e),visit);
    }else{
      const sourceDepth=directionalDepth(e),flight=part==='stone-lob'?clamp((e.age/e.windup-.5)*2):0;
      const sortY=part==='projectile'?movingDepth(e)+Math.sin(e.angle||0)*.01:part==='stone-lob'?sourceDepth+(movingDepth(e)-sourceDepth)*flight:sourceDepth;
      emitDepthItem(e,items,0,part,sortY,visit);
    }
  }
}
export function drawAbilityDepthItem(ctx,item,options={}){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;
  if(item.part==='windup'||item.part==='stone-lob')art.drawWindupAir(ctx,item.effect,options);
  else if(item.part==='beam-body')item.draw(ctx);
  else if(item.part==='beam-mouth')art.drawBeamMouth(ctx,item.effect,options);
  else art.drawActiveAir(ctx,item.effect,options);
  ctx.restore();
}
function shape(ctx,e,r){
  const p=e.parameters,x=e.x,y=e.y+(e.groundOffset||0);
  ctx.beginPath();
  if(e.shape==='beam'||e.shape==='projectile'){
    const length=e.shape==='projectile'?Math.min(90,p.range):p.range;
    capsulePath(ctx,beamCapsule(x,y,e.angle,length,r));
  }else if(e.shape==='cone'){
    ctx.moveTo(x,y);ctx.arc(x,y,p.range,e.angle-p.spread,e.angle+p.spread);ctx.closePath();
  }else if(e.shape==='wave'){
    const ux=Math.cos(e.angle),uy=Math.sin(e.angle);ctx.moveTo(x-uy*r,y+ux*r);ctx.lineTo(x+uy*r,y-ux*r);
  }else ctx.arc(x,y,r,0,TAU);
}
function warning(ctx,e){
  // Traveling shots announce themselves at the casting hand and in flight.
  // Their old short ground rectangles implied a damage area they never had.
  if(e.shape==='projectile')return;
  const p=e.parameters,progress=clamp(e.age/Math.max(.001,e.windup));
  shape(ctx,e,p.radius);ctx.fillStyle=e.hostile?'#b55249':abilityColor(e);ctx.globalAlpha=(e.hostile?.045:.025)+progress*.055;if(e.shape!=='wave')ctx.fill();
  // One complete boundary is visible from the first windup frame. Imminence
  // strengthens this same edge instead of adding a clock, ticks or arrows.
  ctx.strokeStyle=e.hostile?'#f1a181':abilityColor(e);ctx.lineWidth=(e.hostile?1.35:1)+progress*.45;ctx.globalAlpha=(e.hostile?.55:.35)+progress*.3;ctx.stroke();
}
function activeBoundary(ctx,e){
  // Waves already carry a hostile front and end caps in their water artwork.
  if(['projectile','ring','zone','wave'].includes(e.shape))return;
  shape(ctx,e,e.parameters.radius);ctx.strokeStyle=e.hostile?'#eaa18a':abilityColor(e);ctx.globalAlpha=e.hostile?(e.shape==='field'?.4:.55):.25;ctx.lineWidth=e.hostile?1.25:1;ctx.stroke();
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
    ctx.strokeStyle=ready?'#ffd0b0':ice?'#a9d5e3':'#cd8b65';ctx.globalAlpha=fade*(ready?.55+progress*.3:.32);ctx.lineWidth=ready?1.4+progress*.4:1;circle(ctx,mark.x,mark.y,r);ctx.stroke();
  }
}
function drawSpecialGround(ctx,game,options){
  for(const enemy of game.enemies||[]){
    // Locked hazards own their visibility: the caster can move behind a wall
    // while its previously warned destination remains in the visible room.
    if(enemy.hp<=0)continue;
    drawMarks(ctx,enemy,options);
    const a=enemy.specialAttack;if(!a||!(a.phase==='windup'||a.phase==='strikes'||a.kind==='leap'&&a.phase==='rush'))continue;
    const progress=clamp(1-a.life/Math.max(.01,a.maxLife));ctx.strokeStyle='#f3ba8b';ctx.fillStyle='#f3a777';
    for(const c of a.circles||[]){
      if(c.done||!visible(options,c))continue;
      const local=a.phase==='strikes'?clamp(1-c.delay/Math.max(.001,c.maxDelay??a.maxLife)):progress;
      ctx.globalAlpha=.045+local*.065;circle(ctx,c.x,c.y,c.r);ctx.fill();ctx.globalAlpha=.58+local*.3;ctx.lineWidth=1.4+local*.5;ctx.stroke();
    }
    if(a.length>0){
      const ux=Math.cos(a.angle),uy=Math.sin(a.angle),r=a.r||enemy.r,x2=a.x+ux*a.length,y2=a.y+uy*a.length;
      const samples=Math.max(1,Math.min(64,Math.ceil(a.length/Math.max(16,r))));
      let pathVisible=false;
      for(let i=0;i<=samples&&!pathVisible;i++)pathVisible=visible(options,{x:a.x+(x2-a.x)*i/samples,y:a.y+(y2-a.y)*i/samples,r});
      if(!pathVisible)continue;
      ctx.beginPath();capsulePath(ctx,{x:a.x,y:a.y,x2,y2,r});ctx.globalAlpha=.045+progress*.065;ctx.fill();ctx.globalAlpha=.58+progress*.3;ctx.lineWidth=1.4+progress*.5;ctx.stroke();
    }
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
    if(options.depthSorted&&depthPart(e))continue;
    if(e.age<e.windup)art.drawWindupAir(ctx,e,visualOptions);else art.drawActiveAir(ctx,e,visualOptions);
  }
  for(const burst of game.abilities?.visualBursts||[])if(visible(options,burst,burst.abilityId==='storm'||burst.abilityId==='lightning'?250:0))art.drawBurst(ctx,burst,visualOptions);
  art.drawStatuses(ctx,game,options);
  ctx.restore();
}
