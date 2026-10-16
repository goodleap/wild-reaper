import { cityDetailArt } from '../city-detail-art.js';
import { CITY_SAMPLE_BOUNDS } from './city-sample-scene.js';

// Real diffuse PNG on the same clipped floor as movement. Alternate reflected
// tiles share their edge texels; this avoids inventing a different floor image
// for screenshots and keeps the slabs at 20–28 game units.
export function drawCitySampleGround(c,layout,view){
  if(layout.worldId!=='clockshadow-city')return false;
  const b=CITY_SAMPLE_BOUNDS;if(view.maxX<b.minX||view.minX>b.maxX||view.maxY<b.minY||view.minY>b.maxY)return false;
  const image=cityDetailArt.getImage('ground');if(!image)return false;
  const tile=320,left=Math.max(view.minX,b.minX),right=Math.min(view.maxX,b.maxX),top=Math.max(view.minY,b.minY),bottom=Math.min(view.maxY,b.maxY);
  c.save();c.beginPath();c.rect(left,top,right-left,bottom-top);c.clip();
  for(let gy=Math.floor(top/tile);gy<=Math.floor(bottom/tile);gy++)for(let gx=Math.floor(left/tile);gx<=Math.floor(right/tile);gx++){
    const flipX=Math.abs(gx%2),flipY=Math.abs(gy%2);c.save();c.translate((gx+flipX)*tile,(gy+flipY)*tile);c.scale(flipX?-1:1,flipY?-1:1);c.drawImage(image,0,0,tile,tile);c.restore();
  }c.restore();return true;
}

// Background houses stand inside the already blocked city mass. The caller
// clips to that mass, so the artwork cannot paint a house across a real road.
export function drawCitySampleBlockedHouse(c,layout,x,y){
  if(layout.worldId!=='clockshadow-city')return false;
  const b=CITY_SAMPLE_BOUNDS;if(x<b.minX-120||x>b.maxX||y<b.minY-120||y>b.maxY)return false;
  const image=cityDetailArt.getImage('house');if(!image)return false;
  c.drawImage(image,x-12,y-86,264,264);return true;
}
