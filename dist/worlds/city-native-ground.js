import { cityDetailArt } from '../city-detail-art.js';

// The approved diffuse stays unmodified. Reflected neighbors meet at the same
// edge texels, and every floor consumer uses these world coordinates: streets,
// the castle sample, foundations and bridge decks all retain the same scale.
export const CITY_NATIVE_GROUND_TILE=320;
export function drawCityNativeGround(c,layout,view,{image=cityDetailArt.getImage('ground')}={}){
  if(layout.worldId!=='clockshadow-city')return false;
  if(!image)throw new Error('Native city stone ground must be preloaded before floor tiles are built.');
  const tile=CITY_NATIVE_GROUND_TILE;
  c.save();
  c.beginPath();c.rect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);c.clip();
  for(let gy=Math.floor(view.minY/tile);gy<=Math.floor(view.maxY/tile);gy++)for(let gx=Math.floor(view.minX/tile);gx<=Math.floor(view.maxX/tile);gx++){
    const flipX=Math.abs(gx%2),flipY=Math.abs(gy%2);
    c.save();c.translate((gx+flipX)*tile,(gy+flipY)*tile);c.scale(flipX?-1:1,flipY?-1:1);
    c.drawImage(image,0,0,tile,tile);c.restore();
  }
  c.restore();return true;
}

// Only the authored span receives a deck. The approach-road polygon is much
// longer and must never turn the canal or its bank into another bridge.
export function drawCityNativeBridgeDeck(c,layout,passage,view){
  const deck=passage.deck||[];if(deck.length<2)return false;
  let drawn=false;
  for(let i=1;i<deck.length;i++){
    const a=deck[i-1],b=deck[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
    const nx=-dy/length*passage.width/2,ny=dx/length*passage.width/2;
    const points=[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
    const bounds={minX:Math.min(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxX:Math.max(...points.map(p=>p.x)),maxY:Math.max(...points.map(p=>p.y))};
    if(view&&(bounds.maxX<view.minX||bounds.minX>view.maxX||bounds.maxY<view.minY||bounds.minY>view.maxY))continue;
    const visible=view?{minX:Math.max(bounds.minX,view.minX),minY:Math.max(bounds.minY,view.minY),maxX:Math.min(bounds.maxX,view.maxX),maxY:Math.min(bounds.maxY,view.maxY)}:bounds;
    c.save();c.beginPath();points.forEach((p,index)=>c[index?'lineTo':'moveTo'](p.x,p.y));c.closePath();c.clip();
    c.fillStyle='#969c86';c.fillRect(visible.minX,visible.minY,visible.maxX-visible.minX,visible.maxY-visible.minY);
    drawCityNativeGround(c,layout,visible);
    c.restore();drawn=true;
  }
  return drawn;
}
