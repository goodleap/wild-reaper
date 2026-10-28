import { actorShape, ACTOR_VISUALS } from './actor-visuals.js';
import { bossDefinition } from './boss-definitions.js';
import { ENEMY_DEFS } from './enemy-definitions.js';
import { COMPANION_VISUALS } from './companion-art.js';

export const ACTOR_LABEL_STYLE=Object.freeze({font:'600 9px system-ui,sans-serif',color:'#e5d3a0',outline:'#26382b',lineWidth:2.4,gap:8});

export function importantActorName(entity,player){
  if(!entity||entity===player||entity.hidden||entity.hp<=0&&entity.state!=='recovering')return '';
  if(entity.type==='boss')return entity.name||bossDefinition(entity.bossKind||'ancient').name;
  if(entity.isCompanion||entity.isCaptive){
    const suffix=entity.isCaptive?(entity.state==='ready'?' · 等待同行':entity.kind==='golem'?' · 沉睡':' · 受困'):entity.state==='recovering'?' · 恢复中':'';
    return (entity.name||'伙伴')+suffix;
  }
  if(entity.enemyArtId)return entity.name||ENEMY_DEFS[entity.enemyArtId]?.codex?.name||'';
  if(entity.isTownNpc||entity.storyActor||entity.sideQuestActor)return entity.name||(entity.townKind==='angel'?'天使':entity.townKind==='merchant'?'商人':'');
  return '';
}

// The renderer supplies its actual actor in-game. This pure fallback serves
// exclusion geometry when no renderer is present (including headless checks).
export function labelActorVisual(entity,isPlayer=false){
  const companion=COMPANION_VISUALS[entity.kind||entity.heroId];
  const shape=(entity.isCompanion||entity.isCaptive)&&companion||((isPlayer||entity.isTownNpc||entity.storyActor)?ACTOR_VISUALS.player:actorShape(entity));
  const scale=(entity.isCompanion||entity.isCaptive)&&companion?(entity.r||shape.radius)/shape.radius:isPlayer||entity.isTownNpc||entity.storyActor?1.1:(entity.r||shape.radius)/shape.radius;
  return {entity,x:entity.x,y:entity.y,shape,scale,footY:entity.y+shape.foot*scale,isPlayer};
}

export function actorVisibleBounds(actor,sprite=null){
  if(sprite)return {left:sprite.left,top:sprite.top,right:sprite.right,bottom:sprite.bottom};
  const e=actor.entity,scale=actor.scale||1,shape=e.enemyArtId?actorShape({type:e.enemyArtId}):actor.shape||actorShape(e);
  const y=e.enemyArtId?actor.footY-shape.foot*scale:actor.y;
  // The angel's halo extends above the shared humanoid body envelope.
  const top=e.townKind==='angel'||e.kind==='angel'?Math.max(shape.top,40):e.heroId==='stormcaller'?Math.max(shape.top,40):shape.top;
  const lift=actor.isPlayer?0:Math.max(0,Math.min(60,e.specialLift||0));
  return {left:actor.x-shape.halfWidth*scale,top:y-top*scale-lift,right:actor.x+shape.halfWidth*scale,bottom:actor.footY-lift};
}

export function actorNameplate(actor,{player,sprite=null,measure}={}){
  const text=importantActorName(actor?.entity,player);if(!text)return null;
  const visual=actorVisibleBounds(actor,sprite),x=actor.x,y=visual.top-ACTOR_LABEL_STYLE.gap;
  const measured=measure?.(text),width=(Number.isFinite(measured)?measured:Array.from(text).length*9)+6;
  return {text,x,y,bounds:{x:x-width/2,y:y-11,width,height:15},visual};
}

export function drawActorNameplate(ctx,plate){
  if(!plate)return;
  ctx.save();ctx.font=ACTOR_LABEL_STYLE.font;ctx.textAlign='center';ctx.textBaseline='alphabetic';
  ctx.fillStyle=ACTOR_LABEL_STYLE.color;ctx.strokeStyle=ACTOR_LABEL_STYLE.outline;
  ctx.lineWidth=ACTOR_LABEL_STYLE.lineWidth;ctx.lineJoin='round';ctx.shadowBlur=0;
  ctx.strokeText(plate.text,plate.x,plate.y);ctx.fillText(plate.text,plate.x,plate.y);ctx.restore();
}
