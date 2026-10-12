import { groundOffset } from './terrain.js';

export const WORLD_MAP_RULES=Object.freeze({range:900,discoveryRadius:340});
const TAU=Math.PI*2;
const BUILDINGS=new Set(['supply','occupied','castle','angel']);
const RELICS=new Set(['hunt','rescue','rune']);
const COMPLETED=new Set(['cleared','completed','claimed','spent','failed']);
const FONT='"PingFang SC",system-ui,sans-serif';
const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});

// Discovery lives on each region-owned landmark. A map instance never keeps a
// second, global cache that could leak buildings from another region or run.
function landmarks(game) {
  const result=[],seen=new Set();
  const add=(site,type)=>{
    if(!site||!Number.isFinite(site.x)||!Number.isFinite(site.y)||seen.has(site.id??site))return;
    seen.add(site.id??site);result.push({site,type});
  };
  for(const site of game.settlements?.sites||[])if(BUILDINGS.has(site.type))add(site,site.type);
  for(const site of game.relicSites?.sites||[])if(RELICS.has(site.type))add(site,site.type);
  for(const portal of game.regions?.portals||[])add(portal,'portal');
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
  discover(game,{viewportWidth,viewportHeight}={}) {
    if(!game?.player||game.status!=='playing'||game.paused||game.dungeon?.active)return 0;
    const p=feet(game),halfW=positive(viewportWidth,positive(game.viewWidth,680))*.5;
    const halfH=positive(viewportHeight,positive(game.viewHeight,680))*.5;
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
    if(!game?.player||game.dungeon?.active)return [];
    range=positive(range,WORLD_MAP_RULES.range);const p=feet(game),result=[];
    for(const {site,type} of landmarks(game)) {
      if(!site.discovered)continue;
      const dx=site.x-p.x,dy=site.y-p.y,distance=Math.hypot(dx,dy);
      if(distance>range)continue;
      const active=type==='portal'&&site.state==='active';
      const completed=type!=='portal'&&(COMPLETED.has(site.state)||!!site.explored);
      result.push({id:site.id,type,x:site.x,y:site.y,dx,dy,distance,state:site.state,active,completed,name:site.name||''});
    }
    // Bright active gates remain readable when a sanctuary is nearby.
    return result.sort((a,b)=>Number(a.active)-Number(b.active));
  }

  draw(ctx,game,{x=0,y=0,width=172,height=190,range=WORLD_MAP_RULES.range}={}) {
    if(!game?.player||game.dungeon?.active)return null;
    width=positive(width,172);height=positive(height,190);range=positive(range,WORLD_MAP_RULES.range);
    const markers=this.getMarkers(game,{range}),p=feet(game),pad=9,top=29,bottom=25;
    const mapW=width-pad*2,mapH=height-top-bottom,cx=x+width*.5,cy=y+top+mapH*.5;
    const radius=Math.max(20,Math.min(mapW,mapH)*.5-7),scale=radius/range;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    rounded(ctx,x,y,width,height,10);ctx.fillStyle='#101f1cf0';ctx.fill();
    ctx.strokeStyle='#a6b99b50';ctx.lineWidth=1;ctx.stroke();
    segment(ctx,x+10,y+25,x+width-10,y+25);
    ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font=`600 10px ${FONT}`;
    ctx.fillStyle='#d2d9bb';ctx.fillText('附近地标',x+11,y+17);
    ctx.textAlign='right';ctx.font=`8px ${FONT}`;ctx.fillStyle='#91a98e';ctx.fillText('已发现',x+width-10,y+17);

    ctx.save();rounded(ctx,x+pad,y+top,mapW,mapH,5);ctx.clip();ctx.fillStyle='#182b25';ctx.fillRect(x+pad,y+top,mapW,mapH);
    // The grid scrolls in world coordinates; the player remains centered.
    const grid=300,step=grid*scale,ox=cx-((p.x%grid)+grid)%grid*scale,oy=cy-((p.y%grid)+grid)%grid*scale;
    ctx.strokeStyle='#8ea58816';ctx.lineWidth=.7;
    for(let gx=ox;gx>x+pad;gx-=step)segment(ctx,gx,y+top,gx,y+top+mapH);
    for(let gx=ox+step;gx<x+width-pad;gx+=step)segment(ctx,gx,y+top,gx,y+top+mapH);
    for(let gy=oy;gy>y+top;gy-=step)segment(ctx,x+pad,gy,x+width-pad,gy);
    for(let gy=oy+step;gy<y+top+mapH;gy+=step)segment(ctx,x+pad,gy,x+width-pad,gy);
    ctx.strokeStyle='#9ab29920';ctx.lineWidth=.75;ctx.beginPath();ctx.arc(cx,cy,radius,0,TAU);ctx.stroke();
    ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(cx,cy,radius*.5,0,TAU);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#bed0b1';ctx.font=`600 8px ${FONT}`;ctx.textAlign='center';ctx.fillText('N',cx,y+top+9);
    for(const marker of markers)this._drawMarker(ctx,marker,cx+marker.dx*scale,cy+marker.dy*scale);

    ctx.save();ctx.translate(cx,cy);ctx.rotate(Number.isFinite(game.player.facing)?game.player.facing:0);
    ctx.beginPath();ctx.moveTo(5.4,0);ctx.lineTo(-3.6,3.5);ctx.lineTo(-2.1,0);ctx.lineTo(-3.6,-3.5);ctx.closePath();
    ctx.fillStyle='#f4efd4';ctx.strokeStyle='#182a23';ctx.lineWidth=2.2;ctx.stroke();ctx.fill();ctx.restore();ctx.restore();

    const legendY=y+height-10;ctx.font=`8px ${FONT}`;ctx.textAlign='left';ctx.fillStyle='#aabb9f';
    this._drawMarker(ctx,{type:'portal',active:true},x+15,legendY-2);ctx.fillText('门',x+24,legendY+1);
    this._drawMarker(ctx,{type:'rune'},x+48,legendY-2);ctx.fillText('遗迹',x+57,legendY+1);
    if(width>=155){ctx.textAlign='right';ctx.fillStyle='#7e9884';ctx.fillText(`${Math.round(range)} 范围`,x+width-10,legendY+1);}
    ctx.restore();return {markers,center:{x:cx,y:cy},radius,scale};
  }

  _drawMarker(ctx,marker,x,y) {
    ctx.save();ctx.translate(x,y);ctx.lineWidth=1.25;
    const color=marker.completed?'#6d8271':marker.type==='portal'?(marker.active?'#a7e3cd':'#c08b78'):marker.type==='angel'?'#eee4b7':'#cbb888';
    ctx.strokeStyle=color;ctx.fillStyle='#172b25';
    if(marker.type==='portal') {
      if(marker.active){ctx.fillStyle='#9ae6c620';ctx.beginPath();ctx.arc(0,0,8,0,TAU);ctx.fill();}
      ctx.beginPath();ctx.moveTo(-3.8,4.5);ctx.lineTo(-3.8,-.8);ctx.bezierCurveTo(-3.8,-6,3.8,-6,3.8,-.8);ctx.lineTo(3.8,4.5);ctx.closePath();ctx.fill();ctx.stroke();
      if(marker.active){ctx.strokeStyle='#c7f8e2';segment(ctx,0,-1.5,0,2.5);segment(ctx,-1.3,1.2,0,2.5);segment(ctx,1.3,1.2,0,2.5);}
      else {segment(ctx,-2.1,1,2.1,1);segment(ctx,0,-1,0,3);}
    } else if(marker.type==='angel') {
      ctx.beginPath();ctx.moveTo(-1,0);ctx.quadraticCurveTo(-7,-5,-5,1);ctx.lineTo(-1,3);ctx.moveTo(1,0);ctx.quadraticCurveTo(7,-5,5,1);ctx.lineTo(1,3);ctx.stroke();
      ctx.beginPath();ctx.ellipse(0,-3.8,2,.9,0,0,TAU);ctx.stroke();
    } else if(marker.type==='supply'||marker.type==='occupied') {
      ctx.beginPath();ctx.moveTo(-4,0);ctx.lineTo(0,-3.7);ctx.lineTo(4,0);ctx.lineTo(3,0);ctx.lineTo(3,3.5);ctx.lineTo(-3,3.5);ctx.lineTo(-3,0);ctx.closePath();ctx.fill();ctx.stroke();
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
