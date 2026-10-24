import { sceneEntityVisible, sceneGroundAnchor } from './scene-rendering.js';
import { obstacleHeight } from './height-rules.js';
import { sceneryVisual } from './terrain.js';

function captivePrison(game,speaker){
  if(!['captive','recruit'].includes(speaker.kind))return null;
  const id=speaker.source?.siteId??(speaker.kind==='recruit'?speaker.source?.id:null);
  const site=id!=null&&game.relicSites?.sites?.find(site=>site.id===id&&site.type==='rescue'&&site.appearance!=='golemaltar');
  return site||null;
}
function samePrisonWall(prop,site){return !!site&&prop.variant==='rescue-wall'&&prop.structureType==='rescue'&&(prop.structureId===site.id||prop.relicSiteId===site.id);}
function pointDistance(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l)):0;return Math.hypot(x-ax-t*dx,y-ay-t*dy);}
function crossesObstacle(prop,from,to){
  if(obstacleHeight(prop)!=='high')return false;
  const half=prop.type==='log'?prop.halfLength||0:0,dx=Math.cos(prop.angle||0)*half,dy=Math.sin(prop.angle||0)*half;
  const ax=prop.x-dx,ay=prop.y-dy,bx=prop.x+dx,by=prop.y+dy,ux=to.x-from.x,uy=to.y-from.y,vx=bx-ax,vy=by-ay,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-10){const t=((ax-from.x)*vy-(ay-from.y)*vx)/den,s=((ax-from.x)*uy-(ay-from.y)*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return true;}
  return Math.min(pointDistance(from.x,from.y,ax,ay,bx,by),pointDistance(to.x,to.y,ax,ay,bx,by),pointDistance(ax,ay,from.x,from.y,to.x,to.y),pointDistance(bx,by,from.x,from.y,to.x,to.y))<(prop.r||0);
}

function occluderVisual(prop){
  if(prop.visual)return prop.visual;
  if(prop.variant==='castle-wall'||prop.variant==='hut-wall'||prop.variant==='shop-wall'){
    const half=prop.halfLength||0,r=prop.r||14,projection=prop.variant==='hut-wall'?25:35;
    return {halfWidth:Math.abs(Math.cos(prop.angle||0))*half+r+5,top:Math.abs(Math.sin(prop.angle||0))*half+r+projection+5,bottom:Math.abs(Math.sin(prop.angle||0))*half+r};
  }
  if(prop.type==='tree'||prop.type==='rock'||prop.type==='log')return sceneryVisual(prop);
  return {};
}

// Text must not turn an unseen speaker into a through-wall position marker.
// This only decides whether to display dialogue; it never changes scene depth.
export function sceneDialogueVisible(game,speaker,{width,height,offsetX,offsetY,terrainProps=[],sceneProps=[]}={}){
  if(!game?.player||!speaker?.entity||game.sceneTransition?.active||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return false;
  offsetX??=width/2-game.player.x;offsetY??=height/2-game.player.y;
  const entity=speaker.entity;
  if(Number.isFinite(entity.hp)&&entity.hp<=0)return false;
  const x=entity.x+offsetX,y=entity.y+offsetY,head=speaker.headOffset??42;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<16||x>width-16||y-head<8||y>height-12)return false;
  const vision=game.dungeon?.active?game.dungeon.vision:null;
  if(!sceneEntityVisible(entity,vision))return false;
  const source=sceneGroundAnchor(game.player),target=sceneGroundAnchor(entity);
  const prison=captivePrison(game,speaker),blocker=game.terrain?.firstBlocker(source.x,source.y,target.x,target.y,0,'sight');
  if(blocker){
    if(!samePrisonWall(blocker,prison)||typeof game.terrain.query!=='function')return false;
    // An open-air prison's own low barred enclosure must not silence the
    // visible captive. Recheck the complete ray so another wall/tree behind
    // that first ignored bar still hides the speaker normally.
    const obstacles=game.terrain.query(Math.min(source.x,target.x),Math.min(source.y,target.y),Math.max(source.x,target.x),Math.max(source.y,target.y));
    if(obstacles.some(prop=>!samePrisonWall(prop,prison)&&crossesObstacle(prop,source,target)))return false;
  }
  for(const props of [terrainProps,sceneProps])for(const prop of props){
    if(samePrisonWall(prop,prison)||prison&&prop.type==='rescueRelicPart'&&prop.site?.id===prison.id)continue;
    if(prop.visual===false||prop.renderLayer==='ground'||prop.isHutFurniture&&prop.type==='rug'||prop===speaker.source||(prop.id!=null&&prop.id===speaker.source?.id)||obstacleHeight(prop)!=='high'||(prop.sortY??prop.y)<=target.y)continue;
    const visual=occluderVisual(prop),scale=prop.scale||1;
    const halfWidth=visual.halfWidth??(prop.width?prop.width*.5+16:Math.max(24,(prop.r||20)*1.5));
    const top=visual.top??(prop.isSettlement?prop.type==='castle'?175:(prop.depth||28)+95:prop.type==='tree'?115*scale:Math.max(35,(prop.r||20)*1.7));
    const bottom=visual.bottom??prop.r??16;
    // Terrain at equal foot depth is painted before actors. Only a strictly
    // foreground silhouette may conceal a speaker's upper body.
    const upper=entity.y-head*.65;
    if(Math.abs(entity.x-prop.x)<=halfWidth&&upper>=prop.y-top&&upper<=prop.y+bottom)return false;
  }
  return true;
}
