import { cityDetailArt } from '../city-detail-art.js';
import { CITY_SAMPLE_BOUNDS } from './city-sample-scene.js';

// Real diffuse PNG with stable world-space paving beneath floors and buildings.
// Alternate reflected tiles share their edge texels and keep the slabs at
// 20–28 game units, including across a walkable-mask boundary.
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

// Old background buildings are replaced by complete depth-sorted props in
// this sample. Test their whole projected rectangle, including neighboring
// grid cells, so a clipped fragment cannot leak back in at a tile edge.
export function citySampleReplacesBackgroundHouse(layout,x,y){
  if(layout.worldId!=='clockshadow-city')return false;
  const b=CITY_SAMPLE_BOUNDS;
  return x+252>=b.minX&&x-12<=b.maxX&&y+196>=b.minY&&y-86<=b.maxY;
}
