import { actorShape, ACTOR_VISUALS } from './actor-visuals.js';
import { COMPANION_VISUALS } from './companion-art.js';
import { visitSceneUnits } from './unit-counts.js';
import { sceneEntityVisible } from './scene-rendering.js';

const finite=Number.isFinite;
const alive=e=>e&&(!finite(e.hp)||e.hp>0);
const active=e=>e&&(!finite(e.life)||e.life>0);
const landingEffects=new Set(['bossSlam','bloomBurst','eliteSummon','mushroomBlast','rescueWarning']);

// Match the live world painters in app.js and ability-art.js. Only screen-space
// exclusions are produced: no combat queries, random calls or simulation writes.
// isVisible receives a world entity, as sceneEntityVisible does (not a speaker).
export function sceneDialogueAvoidance(game,{offsetX=0,offsetY=0,width,height,isVisible}={}){
  if(!game||!finite(width)||!finite(height)||width<=0||height<=0)return [];
  const result=[],vision=game.dungeon?.active?game.dungeon.vision:null;
  const visible=e=>e&&finite(e.x)&&finite(e.y)&&sceneEntityVisible(e,vision)&&(!isVisible||isVisible(e));
  const rect=(x,y,w,h)=>{
    if(![x,y,w,h].every(finite)||w<=0||h<=0)return;
    const left=Math.max(0,x+offsetX),top=Math.max(0,y+offsetY);
    const right=Math.min(width,x+w+offsetX),bottom=Math.min(height,y+h+offsetY);
    if(right>left&&bottom>top)result.push({x:left,y:top,width:right-left,height:bottom-top});
  };
  const circle=(x,y,r,ry=r)=>{
    if(![x,y,r,ry].every(finite)||r<=0||ry<=0)return;
    // Horizontal bands cover the actual circle without excluding the large
    // empty corners of its bounding square. Padding protects its warning edge.
    r+=3;ry+=3;
    const count=Math.min(12,Math.max(1,Math.ceil(ry/16))),step=ry*2/count;
    for(let i=0;i<count;i++){
      const low=-ry+i*step,high=low+step,nearest=low>0?low:high<0?high:0;
      const half=r*Math.sqrt(Math.max(0,1-nearest*nearest/(ry*ry)));
      rect(x-half,y+low,half*2,step);
    }
  };
  const line=(x,y,x2,y2,r=5)=>{
    if(![x,y,x2,y2,r].every(finite)||r<=0)return;
    const count=Math.min(32,Math.max(1,Math.ceil(Math.hypot(x2-x,y2-y)/32))),pad=r+3;
    for(let i=0;i<count;i++){
      const a=i/count,b=(i+1)/count,ax=x+(x2-x)*a,ay=y+(y2-y)*a,bx=x+(x2-x)*b,by=y+(y2-y)*b;
      rect(Math.min(ax,bx)-pad,Math.min(ay,by)-pad,Math.abs(bx-ax)+pad*2,Math.abs(by-ay)+pad*2);
    }
  };
  const direction=(x,y,angle,length,r)=>line(x,y,x+Math.cos(angle)*length,y+Math.sin(angle)*length,r);
  const label=(e,y,text)=>{
    const w=Math.max(30,Array.from(text||'').length*9+8);
    rect(e.x-w/2,y-11,w,16);
  };
  visitSceneUnits(game,(e)=>{
    if(e===game.player||!visible(e)||!alive(e)&&e.state!=='recovering')return;
    if(e.isTownNpc){
      label(e,e.y-53,e.name);rect(e.x-25,e.y-43,50,58);return;
    }
    if(e.storyActor){
      const shape=ACTOR_VISUALS.player,scale=(e.r||shape.radius)/shape.radius;
      label(e,e.y-shape.top*scale-9,e.name);
      rect(e.x-shape.halfWidth*scale-3,e.y-shape.top*scale-4,shape.halfWidth*scale*2+6,shape.top*scale+12);return;
    }
    if(e.isCompanion||e.isCaptive){
      const shape=COMPANION_VISUALS[e.kind||e.heroId]||ACTOR_VISUALS.player;
      const scale=COMPANION_VISUALS[e.kind||e.heroId]?(e.r||shape.radius)/shape.radius:1.1;
      const top=e.y-shape.top*scale;
      const suffix=e.isCaptive?(e.state==='ready'?' · 等待同行':e.kind==='golem'?' · 沉睡':' · 受困'):e.state==='recovering'?' · 恢复中':'';
      label(e,top-9,(e.name||'伙伴')+suffix);
      rect(e.x-shape.halfWidth*scale,top,shape.halfWidth*scale*2,shape.top*scale+8);
      if(!e.isCaptive&&e.hp<e.maxHp&&e.state!=='recovering')rect(e.x-16,top-7,32,7);
      return;
    }
    const shape=actorShape(e),scale=(e.r||shape.radius)/shape.radius,lift=Math.max(0,Math.min(60,e.specialLift||0));
    rect(e.x-shape.halfWidth*scale-3,e.y-shape.top*scale-lift-4,shape.halfWidth*scale*2+6,shape.top*scale+lift+12);
    if((e.hp<e.maxHp||e.elite)&&e.type!=='boss'){
      const w=e.r*(e.elite?2.1:1.7),y=e.y-e.r-(e.elite?14:10);
      rect(e.x-w/2-3,y-2,w+6,(e.elite?4:3)+4);
      if(e.elite)label(e,y-5,'精英守卫');
    }
    if(e.affix)label(e,e.y-shape.top*scale-10,`${e.affix.name||''}精英`);
    if(e.rescueId)label(e,e.y-shape.top*scale-16,'围困者');
  });
  for(const e of game.enemies||[]){
    if(!alive(e)||!visible(e))continue;
    // Spore casts glow at the casting hand rather than drawing a ground lane.
    if(active(e.cast))circle(e.x+Math.cos(e.cast.angle||0)*18,e.y+7+Math.sin(e.cast.angle||0)*10,10);
    if(active(e.slam))circle(e.slam.x,e.slam.y,e.slam.r);
    const charge=e.charge;
    if(charge?.phase==='windup'){
      const angle=Math.atan2(charge.dy,charge.dx);
      direction(charge.startX,charge.startY,angle,charge.length||256,e.r||16);
    }
    const bloom=e.bloomAttack;
    if(active(bloom)){
      if(bloom.kind==='fan')for(let i=0;i<5;i++)direction(bloom.x,bloom.y,bloom.angle-bloom.spread/2+i*bloom.spread/4,240,3);
      else for(const c of bloom.circles||[])if(visible(c))circle(c.x,c.y,c.r);
    }
    const attack=e.specialAttack;
    if(attack&&(attack.phase==='windup'||attack.phase==='strikes'||attack.kind==='leap'&&attack.phase==='rush')){
      for(const c of attack.circles||[])if(!c.done&&visible(c))circle(c.x,c.y,c.r);
      if(attack.length>0)direction(attack.x,attack.y,attack.angle,attack.length,attack.r||e.r);
    }
    for(const mark of e.specialMarks||[])if(active(mark)&&visible(mark))circle(mark.x,mark.y,mark.r);
    const affix=e.affix;
    if(affix?.phase==='windup'&&affix.life>0){const r=affix.id==='summoner'?40:e.r+11;circle(affix.castX,affix.castY,r,r*.64);}
  }
  for(const e of game.abilities?.effects||[]){
    if(!e.hostile||!visible(e)||e.remaining<=0)continue;
    const p=e.parameters||{},x=e.x,y=e.y+(e.groundOffset||0),angle=e.angle||0,r=p.radius||e.r||8,range=p.range||0;
    if(e.shape==='beam')direction(x,y,angle,range,r);
    else if(e.shape==='wave')line(x-Math.sin(angle)*r,y+Math.cos(angle)*r,x+Math.sin(angle)*r,y-Math.cos(angle)*r,9);
    else if(e.shape==='cone'){
      // Slice a cone radially so a long narrow flame does not reserve a whole
      // square around its caster. Include angular extrema within each slice.
      const spread=p.spread||0,samples=[angle-spread,angle+spread,angle];
      for(let a=Math.ceil((angle-spread)/(Math.PI/2))*Math.PI/2;a<angle+spread;a+=Math.PI/2)samples.push(a);
      for(let i=0;i<8;i++){
        const points=samples.flatMap(a=>[i/8,(i+1)/8].map(t=>({x:x+Math.cos(a)*range*t,y:y+Math.sin(a)*range*t})));
        const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys);
        rect(left-3,top-3,Math.max(...xs)-left+6,Math.max(...ys)-top+6);
      }
    }else if(e.shape==='projectile')circle(e.x,e.y,r+5);
    else circle(x,y,r);
  }
  for(const e of game.abilities?.visualBursts||[])if(e.hostile&&e.age<e.life&&visible(e))circle(e.x,e.y+(e.groundOffset||0),e.parameters?.radius||e.radius||e.r||12);
  for(const e of game.enemyBullets||[])if(active(e)&&visible(e))circle(e.x,e.y,e.r||6);
  for(const e of game.effects||[])if(active(e)&&landingEffects.has(e.type)&&visible(e))circle(e.x,e.y,e.r);
  for(const marker of game.realms?.getMarkers?.()||[])if(marker.kind==='tribulationWarning')circle(marker.x,marker.y,marker.r);
  for(const e of game.environment?.props||[])if(e.state==='armed'&&visible(e))circle(e.x,e.y,e.blastRadius||82);
  for(const list of [game.environment?.mechanisms?.props,game.environment?.worldHazards?.props])for(const e of list||[])
    if(['warn','windup','active'].includes(e.state)&&visible(e)&&!e.patch)circle(e.x,e.y,e.r);
  return result;
}
