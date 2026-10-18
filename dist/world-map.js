import { groundOffset } from './terrain.js';
import { traceIslandContour } from './island-art.js';
import { REGIONS } from './world-definitions.js';
import { COAST_RULES } from './placement-rules.js';
import { drawWorldLayoutMap } from './worlds/world-layout-art.js';

export const WORLD_MAP_RULES=Object.freeze({range:900,discoveryRadius:340,explorationCell:100});
const TAU=Math.PI*2;
const BUILDINGS=new Set(['supply','occupied','castle','angel']);
const RELICS=new Set(['hunt','rescue','rune','dogcamp','stonevault']);
const COMPLETED=new Set(['cleared','completed','claimed','spent','failed']);
const FONT='"PingFang SC",system-ui,sans-serif';
const MAP_COASTS=Object.freeze(Object.fromEntries(REGIONS.map(world=>[world.id,world.art.mapCoast])));
const MAP_PALETTES=Object.freeze(Object.fromEntries(REGIONS.map(region=>[region.id,Object.freeze({land:region.colors.light,sand:region.colors.accent,sea:'#345360',shallow:'#507776',...MAP_COASTS[region.id]})])));
const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
export function minimapBounds(width,height,insets={}){
  const compact=width<600||height<430,size=compact?104:128,margin=compact?10:16;
  return {x:width-size-margin-(insets.right||0),y:margin+(insets.top||0),width:size,height:size,margin};
}
export const LANDMARK_NAMES=Object.freeze({supply:'补给小屋',occupied:'废弃小屋',castle:'城堡',angel:'守护天使',hunt:'狩猎擂台',rescue:'囚牢',rune:'符文祭坛',dogcamp:'旅犬营地',stonevault:'封石宝库',portal:'传送门',exit:'荒野出口',cave:'洞穴入口',shortcut:'捷径旧门',chest:'宝箱',boss:'首领',territory:'怪物领域',expedition:'副本目标'});
export function landmarkLabel(marker){return marker.name||LANDMARK_NAMES[marker.type]||'遗迹';}
export function landmarkState(marker){if(marker.type==='quest')return marker.label||'任务目标';if(marker.type==='story')return marker.label||'当前剧情目标';if(marker.type==='exit'&&marker.natural)return `前往${marker.destination||'相邻区域'} · 可往返`;if(marker.type==='cave')return '进入地下通道';if(marker.type==='shortcut')return marker.gateOpen?'捷径已打通':marker.description||'从钟楼一侧开启';if(marker.type==='territory')return marker.completed?'已清理':'进入后会惊动怪群';if(marker.type==='expedition')return marker.completed?'已通关':marker.label||'副本目标';if(marker.kind==='victory')return '从正面进入，完成本局';if(marker.type==='stonevault')return marker.completed?'已领取':marker.gateOpen?'通路已开启 · 宝藏待领取':'封石阻挡 · 需要岩灵';if(marker.type==='dogcamp')return marker.completed?'已招募':'可招募寻宝小狗';if(marker.type==='rescue'&&marker.appearance==='golemaltar')return marker.completed?'岩灵已唤醒':'唤醒岩灵试炼';if(marker.type==='exit')return '走入出口返回荒野';if(marker.type==='boss')return marker.completed?'已击败':'已发现';if(marker.type==='chest')return marker.completed?'已领取':marker.state==='locked'?'守卫封印中':'待领取';return marker.type==='portal'?(marker.active?`已激活 · 可往返${marker.angelGuard?' · 天使守护':''}`:'封印中 · 首领驻守'):marker.completed?'已完成':marker.type==='angel'?'治疗与雷电守护':'可探索';}
const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});

// Discovery lives on each region-owned landmark. A map instance never keeps a
// second, global cache that could leak buildings from another region or run.
function landmarks(game) {
  const result=[],seen=new Set();
  if(game.sceneContent?.allows('worldContent')===false)return result;
  const add=(site,type)=>{
    if(!site||!Number.isFinite(site.x)||!Number.isFinite(site.y)||seen.has(site.id??site))return;
    seen.add(site.id??site);result.push({site,type});
  };
  for(const site of game.settlements?.sites||[])if(BUILDINGS.has(site.type))add(site,site.type);
  for(const site of game.relicSites?.sites||[])if(RELICS.has(site.type))add(site,site.type);
  for(const portal of game.regions?.portals||[])add(portal,portal.natural?'exit':'portal');
  for(const enemy of game.enemies||[])if(enemy.stageBoss&&enemy.hp>0)add(enemy,'boss');
  for(const group of game.territories?.groups||[])add(group,group.kind==='boss'?'boss':'territory');
  for(const marker of game.expedition?.markers||[])add(marker,marker.type||'exit');
  for(const marker of game.riftExploration?.sites||[])add(marker,marker.kind==='shortcut'?'shortcut':marker.kind==='cave'?'cave':marker.kind);
  return result;
}

function rounded(ctx,x,y,w,h,r) {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function segment(ctx,x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function diamond(ctx,x,y,r){ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();}

export class WorldMap {
  constructor(){this._explorationRuns=new WeakMap();}
  discover(game,{viewportWidth,viewportHeight}={}) {
    if(!game?.player||game.status!=='playing'||game.paused||game.dungeon?.active)return 0;
    const p=feet(game),halfW=positive(viewportWidth,positive(game.viewWidth,680))*.5;
    const halfH=positive(viewportHeight,positive(game.viewHeight,680))*.5;
    this._discoverGround(game,p,halfW,halfH);
    let count=0;
    for(const {site} of landmarks(game)) {
      if(site.discovered||Math.hypot(site.x-p.x,site.y-p.y)>WORLD_MAP_RULES.discoveryRadius)continue;
      // Test a landmark's ground anchor, not its oversized roof/collision box.
      // A narrow phone screen must not discover unseen sites beside the player.
      if(Math.abs(site.x-game.player.x)>halfW||Math.abs(site.y-game.player.y)>halfH)continue;
      site.discovered=true;count++;
    }
    return count;
  }

  getMarkers(game,{range=WORLD_MAP_RULES.range}={}) {
    if(!game?.player)return [];
    range=positive(range,WORLD_MAP_RULES.range);const p=feet(game),result=[];
    if(game.sceneContent?.allows('worldContent')===false){
      const guide=game.story?.getGuide?.(),target=guide?.target;
      if(target&&Number.isFinite(target.x)&&Number.isFinite(target.y)){
        const dx=target.x-p.x,dy=target.y-p.y,distance=Math.hypot(dx,dy);
        if(distance<=range)result.push({id:'story:objective',type:'story',x:target.x,y:target.y,dx,dy,distance,name:guide.shortLabel||guide.label||'剧情目标',label:guide.label||'',active:true,color:'#c4f2e5'});
      }
      return result;
    }
    // Accepted objectives can mark a destination beyond discovered terrain,
    // without revealing the terrain itself or unrelated landmarks.
    for(const marker of game.quests?.getMarkers()||[]){
      const dx=marker.x-p.x,dy=marker.y-p.y,distance=Math.hypot(dx,dy);
      if(distance<=range)result.push({...marker,type:'quest',active:true,color:'#e6d598',dx,dy,distance});
    }
    if(game.dungeon?.active){
      for(const marker of game.dungeon.getMap?.({revealMarkers:game.debug===true})?.landmarks||[]){const dx=marker.x-p.x,dy=marker.y-p.y,distance=Math.hypot(dx,dy);if(distance<=range)result.push({...marker,dx,dy,distance});}
      return result;
    }
    for(const {site,type} of landmarks(game)) {
      // Debug exposes existing map landmarks without discovering their ground
      // or unlocking archive entries. Generation and world visibility are unchanged.
      if(!site.discovered&&game.debug!==true)continue;
      const dx=site.x-p.x,dy=site.y-p.y,distance=Math.hypot(dx,dy);
      if(distance>range)continue;
      const active=type==='portal'?site.state==='active':type==='expedition'&&site.active===true;
      const completed=type!=='portal'&&(COMPLETED.has(site.state)||!!site.explored||(type==='territory'||site.kind==='boss')&&site.cleared||type==='expedition'&&site.completed===true);
      const name=site.kind==='victory'?'通关大门':type==='boss'&&site.stageBossRole?(site.stageBossRole==='core'?'关卡首领':'外岛首领 · 可选'):type==='portal'&&site.nextRegion?.name?`通往${site.nextRegion.name}`:site.name||'';
      result.push({id:site.id,type,anchorId:site.anchorId,x:site.x,y:site.y,dx,dy,distance,state:site.state,active,completed,gateOpen:!!(site.gateOpen||site.open),appearance:site.appearance,kind:site.kind,name,label:site.label,color:site.color,natural:site.natural===true,destination:site.nextRegion?.name||'',description:site.description||''});
    }
    // Bright active gates remain readable when a sanctuary is nearby.
    return result.sort((a,b)=>Number(a.active)-Number(b.active));
  }

  draw(ctx,game,{x=0,y=0,width=128,height=128,range=WORLD_MAP_RULES.range,expanded=false}={}) {
    if(!game?.player)return null;
    width=positive(width,128);height=positive(height,128);range=positive(range,WORLD_MAP_RULES.range);
    if(!game.dungeon?.active&&game.terrain?.island)return this._drawIslandMap(ctx,game,{x,y,width,height,range,expanded});
    if(game.expedition&&!game.dungeon?.active&&expanded)return this._drawExpeditionMap(ctx,game,{x,y,width,height});
    const markers=this.getMarkers(game,{range}),p=feet(game),pad=6;
    const mapW=width-pad*2,mapH=height-pad*2,cx=x+width*.5,cy=y+height*.5;
    const radius=Math.max(20,Math.min(mapW,mapH)*.5-(expanded?16:7)),scale=radius/range;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    rounded(ctx,x,y,width,height,9);ctx.fillStyle='#101f1ce8';ctx.fill();
    ctx.strokeStyle='#a6b99b50';ctx.lineWidth=1;ctx.stroke();
    ctx.save();rounded(ctx,x+pad,y+pad,mapW,mapH,5);ctx.clip();ctx.fillStyle='#182b25e8';ctx.fillRect(x+pad,y+pad,mapW,mapH);
    const grid=300,step=grid*scale,ox=cx-((p.x%grid)+grid)%grid*scale,oy=cy-((p.y%grid)+grid)%grid*scale;
    ctx.strokeStyle='#8ea58816';ctx.lineWidth=.7;
    for(let gx=ox;gx>x+pad;gx-=step)segment(ctx,gx,y+pad,gx,y+height-pad);
    for(let gx=ox+step;gx<x+width-pad;gx+=step)segment(ctx,gx,y+pad,gx,y+height-pad);
    for(let gy=oy;gy>y+pad;gy-=step)segment(ctx,x+pad,gy,x+width-pad,gy);
    for(let gy=oy+step;gy<y+height-pad;gy+=step)segment(ctx,x+pad,gy,x+width-pad,gy);
    if(game.expedition){const b=game.terrain.bounds;ctx.fillStyle='#657d7030';ctx.strokeStyle='#b2bc9d';ctx.lineWidth=1.2;ctx.fillRect(cx+(b.minX-p.x)*scale,cy+(b.minY-p.y)*scale,(b.maxX-b.minX)*scale,(b.maxY-b.minY)*scale);ctx.strokeRect(cx+(b.minX-p.x)*scale,cy+(b.minY-p.y)*scale,(b.maxX-b.minX)*scale,(b.maxY-b.minY)*scale);}
    if(game.dungeon?.active){
      const vision=game.dungeon.vision;
      // The indoor map uses the exact same scale and player anchor. Unknown
      // interiors have no room silhouettes; only explored floor and walls exist.
      ctx.fillStyle='#0c1715';ctx.fillRect(x+pad,y+pad,mapW,mapH);
      ctx.fillStyle='#2b4035';
      for(const rect of vision?.getExploredRects?.()||[])ctx.fillRect(cx+(rect.x-p.x)*scale,cy+(rect.y-p.y)*scale,rect.width*scale+.25,rect.height*scale+.25);
      ctx.lineCap='butt';ctx.strokeStyle='#b2bc9d';ctx.lineWidth=expanded?3.5:2.2;ctx.beginPath();
      for(const wall of vision?.knownWallSegments?.()||[]){ctx.moveTo(cx+(wall.ax-p.x)*scale,cy+(wall.ay-p.y)*scale);ctx.lineTo(cx+(wall.bx-p.x)*scale,cy+(wall.by-p.y)*scale);}ctx.stroke();ctx.lineCap='round';
    }
    ctx.strokeStyle='#9ab29920';ctx.lineWidth=.75;ctx.beginPath();ctx.arc(cx,cy,radius,0,TAU);ctx.stroke();
    ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(cx,cy,radius*.5,0,TAU);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#bed0b1';ctx.font=`600 ${expanded?15:8}px ${FONT}`;ctx.textAlign='center';ctx.fillText('N',cx,y+pad+(expanded?16:8));
    for(const [index,marker] of markers.entries()){
      const mx=cx+marker.dx*scale,my=cy+marker.dy*scale;
      if(expanded){ctx.save();ctx.translate(mx,my);ctx.scale(1.8,1.8);this._drawMarker(ctx,marker,0,0);ctx.restore();}else this._drawMarker(ctx,marker,mx,my);
      if(expanded){const right=mx<x+width-42,tx=mx+(right?12:-12),ty=Math.max(y+pad+17,my-9);ctx.font=`600 16px ${FONT}`;ctx.textAlign=right?'left':'right';ctx.lineWidth=4;ctx.strokeStyle='#12231f';ctx.strokeText(String(index+1),tx,ty);ctx.fillStyle='#e4e9cd';ctx.fillText(String(index+1),tx,ty);}
    }
    ctx.save();ctx.translate(cx,cy);if(expanded)ctx.scale(1.65,1.65);ctx.rotate(Number.isFinite(game.player.facing)?game.player.facing:0);
    ctx.beginPath();ctx.moveTo(5.4,0);ctx.lineTo(-3.6,3.5);ctx.lineTo(-2.1,0);ctx.lineTo(-3.6,-3.5);ctx.closePath();
    ctx.fillStyle='#f4efd4';ctx.strokeStyle='#182a23';ctx.lineWidth=2.2;ctx.stroke();ctx.fill();ctx.restore();ctx.restore();
    ctx.restore();return {markers,center:{x:cx,y:cy},radius,scale};
  }

  _discoverGround(game,p,halfW,halfH) {
    const island=game.terrain?.island;if(!island)return;
    const cell=WORLD_MAP_RULES.explorationCell,r=WORLD_MAP_RULES.discoveryRadius;
    island.explored??=new Set();
    const b=island.bounds;
    for(let gy=Math.floor((p.y-Math.min(halfH,r))/cell);gy<=Math.floor((p.y+Math.min(halfH,r))/cell);gy++)for(let gx=Math.floor((p.x-Math.min(halfW,r))/cell);gx<=Math.floor((p.x+Math.min(halfW,r))/cell);gx++){
      const xx=(gx+.5)*cell,yy=(gy+.5)*cell;
      if(xx<b.minX-cell||xx>b.maxX+cell||yy<b.minY-cell||yy>b.maxY+cell||Math.abs(xx-game.player.x)>halfW-cell*.5||Math.abs(yy-game.player.y)>halfH-cell*.5||Math.hypot(xx-p.x,yy-p.y)>r-cell*.4)continue;
      island.explored.add(`${gx},${gy}`);
    }
  }

  exploration(game) {
    const island=game?.terrain?.island;if(!island)return 0;
    const cell=WORLD_MAP_RULES.explorationCell,b=island.bounds;let known=0,total=0;
    for(let gy=Math.floor(b.minY/cell);gy<=Math.floor(b.maxY/cell);gy++)for(let gx=Math.floor(b.minX/cell);gx<=Math.floor(b.maxX/cell);gx++)if(island.contains((gx+.5)*cell,(gy+.5)*cell)){total++;if(island.explored?.has(`${gx},${gy}`))known++;}
    return total?Math.min(100,Math.round(known/total*100)):0;
  }

  _expandedMarkers(markers){
    const guarded=new Set();for(const marker of markers)if(marker.type==='angel'&&marker.anchorId&&markers.some(gate=>gate.type==='portal'&&gate.active&&gate.id===marker.anchorId))guarded.add(marker.anchorId);
    return markers.filter(marker=>!(marker.type==='angel'&&guarded.has(marker.anchorId))).map(marker=>marker.type==='portal'&&guarded.has(marker.id)?{...marker,angelGuard:true}:marker);
  }

  _mapRuns(island,{minGX=-Infinity,maxGX=Infinity,minGY=-Infinity,maxGY=Infinity,expanded=false}={}) {
    const explored=island.explored;if(!explored?.size)return [];
    if(expanded){const cached=this._explorationRuns.get(explored);if(cached?.size===explored.size)return cached.runs;
      const rows=new Map();for(const key of explored){const [gx,gy]=key.split(',').map(Number);if(!rows.has(gy))rows.set(gy,[]);rows.get(gy).push(gx);}
      const runs=[];for(const [gy,columns] of rows){columns.sort((a,b)=>a-b);let start=columns[0],last=start;for(let i=1;i<=columns.length;i++){const gx=columns[i];if(gx===last+1){last=gx;continue;}runs.push({gx:start,gy,length:last-start+1});start=last=gx;}}
      this._explorationRuns.set(explored,{size:explored.size,runs});return runs;
    }
    // Minimap work is bounded by its visible grid, even after the whole island
    // is explored. Adjacent cells become one non-overlapping clip rectangle.
    const runs=[];for(let gy=minGY;gy<=maxGY;gy++){let start=null;for(let gx=minGX;gx<=maxGX+1;gx++){const known=gx<=maxGX&&explored.has(`${gx},${gy}`);if(known&&start===null)start=gx;if(!known&&start!==null){runs.push({gx:start,gy,length:gx-start});start=null;}}}return runs;
  }

  _drawIslandMap(ctx,game,{x,y,width,height,range,expanded}) {
    const island=game.terrain.island,b=island.bounds,p=feet(game),pad=6,cell=WORLD_MAP_RULES.explorationCell;
    const cx=x+width*.5,cy=y+height*.5,mapW=width-pad*2,mapH=height-pad*2;
    const radius=Math.max(20,Math.min(mapW,mapH)*.5-(expanded?16:7));
    const center=expanded?{x:(b.minX+b.maxX)*.5,y:(b.minY+b.maxY)*.5}:p;
    const scale=expanded?Math.min((mapW-26)/(b.maxX-b.minX+240),(mapH-26)/(b.maxY-b.minY+240)):radius/range;
    const mx=worldX=>cx+(worldX-center.x)*scale,my=worldY=>cy+(worldY-center.y)*scale;
    const markerRange=expanded?Math.hypot(b.maxX-b.minX,b.maxY-b.minY)+500:range,discoveredMarkers=this.getMarkers(game,{range:markerRange}),markers=expanded?this._expandedMarkers(discoveredMarkers):discoveredMarkers;
    const palette=MAP_PALETTES[island.region]||MAP_PALETTES.forest;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';rounded(ctx,x,y,width,height,9);ctx.fillStyle='#101f1ce8';ctx.fill();ctx.strokeStyle='#a6b99b50';ctx.lineWidth=1;ctx.stroke();
    ctx.save();rounded(ctx,x+pad,y+pad,mapW,mapH,5);ctx.clip();ctx.fillStyle='#202c2e';ctx.fillRect(x+pad,y+pad,mapW,mapH);
    // Clip all geographical detail to cells physically visited in this world.
    // Even the island silhouette stays hidden behind unknown fog.
    ctx.save();ctx.beginPath();
    const extentX=mapW*.5/scale,extentY=mapH*.5/scale,runs=this._mapRuns(island,{expanded,minGX:Math.floor((center.x-extentX)/cell),maxGX:Math.floor((center.x+extentX)/cell),minGY:Math.floor((center.y-extentY)/cell),maxGY:Math.floor((center.y+extentY)/cell)});
    for(const run of runs){const xx=mx(run.gx*cell),yy=my(run.gy*cell),size=cell*scale;ctx.rect(xx,yy,run.length*size,size);}
    ctx.clip();ctx.fillStyle=palette.sea;ctx.fillRect(x+pad,y+pad,mapW,mapH);
    ctx.save();ctx.translate(cx-center.x*scale,cy-center.y*scale);ctx.scale(scale,scale);
    if(island.layout?.kind!=='rift-forest'){
      const shallow=island.shallowWidth??COAST_RULES.shallowWidth,beach=island.beachWidth??COAST_RULES.beachWidth;
      traceIslandContour(ctx,island.points);ctx.fillStyle=palette.shallow;ctx.fill();
      traceIslandContour(ctx,island.contour(shallow));ctx.fillStyle=palette.sand;ctx.fill();
      traceIslandContour(ctx,island.contour(shallow+beach));ctx.fillStyle=palette.land;ctx.fill();
    }
    drawWorldLayoutMap(ctx,island,{scale,labels:expanded,viewBounds:{minX:center.x-extentX,minY:center.y-extentY,maxX:center.x+extentX,maxY:center.y+extentY}});
    ctx.restore();ctx.restore();
    if(!expanded){ctx.strokeStyle='#abc3b222';ctx.lineWidth=.7;ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(cx,cy,radius*.5,0,TAU);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle='#bed0b1';ctx.font=`600 ${expanded?15:8}px ${FONT}`;ctx.textAlign='center';ctx.fillText('N',cx,y+pad+(expanded?16:8));
    for(const [index,marker] of markers.entries()){
      const xx=mx(marker.x),yy=my(marker.y);if(expanded){ctx.save();ctx.translate(xx,yy);ctx.scale(1.35,1.35);this._drawMarker(ctx,marker,0,0);ctx.restore();}else this._drawMarker(ctx,marker,xx,yy);
      if(expanded){const right=xx<x+width-38,tx=xx+(right?10:-10),ty=Math.max(y+pad+17,yy-7);ctx.font=`600 13px ${FONT}`;ctx.textAlign=right?'left':'right';ctx.lineWidth=3;ctx.strokeStyle='#142925';ctx.strokeText(String(index+1),tx,ty);ctx.fillStyle='#f1e9c6';ctx.fillText(String(index+1),tx,ty);}
    }
    const playerPoint={x:mx(p.x),y:my(p.y)};ctx.save();ctx.translate(playerPoint.x,playerPoint.y);if(expanded)ctx.scale(1.35,1.35);ctx.rotate(Number.isFinite(game.player.facing)?game.player.facing:0);ctx.beginPath();ctx.moveTo(5.4,0);ctx.lineTo(-3.6,3.5);ctx.lineTo(-2.1,0);ctx.lineTo(-3.6,-3.5);ctx.closePath();ctx.strokeStyle='#142720';ctx.lineWidth=2.2;ctx.stroke();ctx.fillStyle='#fff0c2';ctx.fill();ctx.restore();ctx.restore();ctx.restore();
    return {markers,center:{x:cx,y:cy},worldCenter:center,player:playerPoint,radius,scale,explored:expanded?this.exploration(game):undefined};
  }

  _drawExpeditionMap(ctx,game,{x,y,width,height}) {
    const b=game.terrain.bounds,p=feet(game),cx=x+width/2,cy=y+height/2;
    const center={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2},scale=Math.min((width-48)/(b.maxX-b.minX),(height-48)/(b.maxY-b.minY));
    const mx=value=>cx+(value-center.x)*scale,my=value=>cy+(value-center.y)*scale;
    const markers=this.getMarkers(game,{range:Math.hypot(b.maxX-b.minX,b.maxY-b.minY)+1});
    ctx.save();rounded(ctx,x,y,width,height,9);ctx.fillStyle='#101f1ce8';ctx.fill();ctx.strokeStyle='#a6b99b50';ctx.stroke();
    ctx.save();rounded(ctx,x+6,y+6,width-12,height-12,5);ctx.clip();ctx.fillStyle='#657d7030';ctx.strokeStyle='#b2bc9d';ctx.lineWidth=1.2;
    ctx.fillRect(mx(b.minX),my(b.minY),(b.maxX-b.minX)*scale,(b.maxY-b.minY)*scale);ctx.strokeRect(mx(b.minX),my(b.minY),(b.maxX-b.minX)*scale,(b.maxY-b.minY)*scale);
    ctx.fillStyle='#bed0b1';ctx.font=`600 15px ${FONT}`;ctx.textAlign='center';ctx.fillText('N',cx,y+20);
    for(const [index,marker]of markers.entries()){
      const xx=mx(marker.x),yy=my(marker.y);ctx.save();ctx.translate(xx,yy);ctx.scale(1.5,1.5);this._drawMarker(ctx,marker,0,0);ctx.restore();
      ctx.font=`600 14px ${FONT}`;ctx.textAlign=xx<x+width-40?'left':'right';ctx.fillStyle='#e4e9cd';ctx.fillText(String(index+1),xx+(xx<x+width-40?11:-11),yy-10);
    }
    const player={x:mx(p.x),y:my(p.y)};ctx.save();ctx.translate(player.x,player.y);ctx.rotate(game.player.facing||0);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,4);ctx.lineTo(-3,0);ctx.lineTo(-5,-4);ctx.closePath();ctx.strokeStyle='#142720';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff0c2';ctx.fill();ctx.restore();ctx.restore();ctx.restore();
    return {markers,center:{x:cx,y:cy},worldCenter:center,player,scale};
  }

  _drawMarker(ctx,marker,x,y) {
    ctx.save();ctx.translate(x,y);ctx.lineWidth=1.25;
    const color=marker.kind==='victory'?'#f4dc91':marker.completed?'#6d8271':marker.type==='territory'?'#d59c86':marker.color|| (marker.type==='portal'?(marker.active?'#a7e3cd':'#c08b78'):marker.type==='angel'?'#eee4b7':'#cbb888');
    ctx.strokeStyle=color;ctx.fillStyle='#172b25';
    if(marker.type==='territory') {
      ctx.beginPath();ctx.arc(0,0,5,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.fillRect(-1.2,-1.2,2.4,2.4);
    } else if(marker.type==='expedition') {
      segment(ctx,-3,5,-3,-5);ctx.beginPath();ctx.moveTo(-3,-5);ctx.lineTo(5,-3);ctx.lineTo(-3,0);ctx.closePath();ctx.fillStyle=color;ctx.fill();
    } else if(marker.type==='cave') {
      ctx.beginPath();ctx.moveTo(-5,4);ctx.lineTo(-4,-1);ctx.lineTo(-1,-5);ctx.lineTo(3,-4);ctx.lineTo(5,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,1,2.5,Math.PI,0);ctx.lineTo(2.5,4);ctx.lineTo(-2.5,4);ctx.closePath();ctx.fill();
    } else if(marker.type==='shortcut') {
      segment(ctx,-5,-4,-5,5);segment(ctx,5,-4,5,5);if(!marker.gateOpen){segment(ctx,-5,-2,5,-2);segment(ctx,-5,2,5,2);segment(ctx,0,-3,0,4);}
    } else if(marker.type==='exit') {
      ctx.beginPath();ctx.moveTo(-4,4);ctx.lineTo(-4,-4);ctx.lineTo(3,-4);ctx.lineTo(3,4);ctx.stroke();segment(ctx,-1,0,6,0);segment(ctx,3,-2,6,0);segment(ctx,3,2,6,0);
    } else if(marker.type==='chest') {
      ctx.fillRect(-4,-2,8,6);ctx.strokeRect(-4,-2,8,6);segment(ctx,-4,0,4,0);segment(ctx,0,-1,0,2);
    } else if(marker.type==='boss') {
      diamond(ctx,0,0,5);ctx.fill();ctx.stroke();segment(ctx,0,-2,0,1);ctx.fillStyle=color;ctx.fillRect(-.5,2,1,1);
    } else if(marker.type==='portal') {
      if(marker.active){ctx.fillStyle=marker.kind==='victory'?'#f4dc9130':'#9ae6c620';ctx.beginPath();ctx.arc(0,0,8,0,TAU);ctx.fill();}
      ctx.beginPath();ctx.moveTo(-3.8,4.5);ctx.lineTo(-3.8,-.8);ctx.bezierCurveTo(-3.8,-6,3.8,-6,3.8,-.8);ctx.lineTo(3.8,4.5);ctx.closePath();ctx.fill();ctx.stroke();
      if(marker.active){ctx.strokeStyle=marker.kind==='victory'?'#fff0bd':'#c7f8e2';segment(ctx,0,-1.5,0,2.5);segment(ctx,-1.3,1.2,0,2.5);segment(ctx,1.3,1.2,0,2.5);}
      else {segment(ctx,-2.1,1,2.1,1);segment(ctx,0,-1,0,3);}
    } else if(marker.type==='angel') {
      ctx.beginPath();ctx.moveTo(-1,0);ctx.quadraticCurveTo(-7,-5,-5,1);ctx.lineTo(-1,3);ctx.moveTo(1,0);ctx.quadraticCurveTo(7,-5,5,1);ctx.lineTo(1,3);ctx.stroke();
      ctx.beginPath();ctx.ellipse(0,-3.8,2,.9,0,0,TAU);ctx.stroke();
    } else if(marker.type==='supply'||marker.type==='occupied') {
      ctx.beginPath();ctx.moveTo(-4,0);ctx.lineTo(0,-3.7);ctx.lineTo(4,0);ctx.lineTo(3,0);ctx.lineTo(3,3.5);ctx.lineTo(-3,3.5);ctx.lineTo(-3,0);ctx.closePath();ctx.fill();ctx.stroke();
    } else if(marker.type==='dogcamp') {
      for(const [px,py,r] of [[-2.8,-2.3,1],[-.9,-3.5,1],[1.3,-3.1,1],[3,-1.7,1]]){ctx.beginPath();ctx.arc(px,py,r,0,TAU);ctx.fillStyle=color;ctx.fill();}
      ctx.beginPath();ctx.ellipse(0,1,2.6,2,0,0,TAU);ctx.fillStyle=color;ctx.fill();
    } else if(marker.type==='stonevault') {
      ctx.beginPath();ctx.moveTo(-5,4);ctx.lineTo(-5,-3);ctx.lineTo(0,-5);ctx.lineTo(5,-3);ctx.lineTo(5,4);ctx.closePath();ctx.fill();ctx.stroke();
      if(!marker.gateOpen){ctx.fillStyle='#b6a88e';ctx.beginPath();ctx.moveTo(-3,3);ctx.lineTo(-2,-1);ctx.lineTo(2,-2);ctx.lineTo(3,3);ctx.closePath();ctx.fill();}
      else {segment(ctx,-1.4,3,-1.4,0);segment(ctx,-1.4,0,1.4,0);segment(ctx,1.4,0,1.4,3);}
    } else if(marker.type==='castle') {
      ctx.beginPath();ctx.moveTo(-5,4);ctx.lineTo(-5,-4);ctx.lineTo(-2.5,-4);ctx.lineTo(-2.5,-1.5);ctx.lineTo(2.5,-1.5);ctx.lineTo(2.5,-4);ctx.lineTo(5,-4);ctx.lineTo(5,4);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-1.1,4);ctx.lineTo(-1.1,1);ctx.lineTo(1.1,1);ctx.lineTo(1.1,4);ctx.stroke();
    } else {
      diamond(ctx,0,0,4.5);ctx.fill();ctx.stroke();ctx.fillStyle=color;
      if(marker.type==='hunt'){ctx.beginPath();ctx.arc(0,0,1.5,0,TAU);ctx.stroke();}
      else if(marker.type==='rescue'){segment(ctx,-1.4,-1.6,-1.4,1.6);segment(ctx,1.4,-1.6,1.4,1.6);}
      else {diamond(ctx,0,0,1.3);ctx.fill();}
    }
    if(marker.completed){ctx.strokeStyle='#9ba98c';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(2.5,4);ctx.lineTo(4,5.5);ctx.lineTo(7,2);ctx.stroke();}
    ctx.restore();
  }
}
