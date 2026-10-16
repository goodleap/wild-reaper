import { CITY_SAMPLE_BOUNDS } from './city-sample-scene.js';
import { drawCityNativeGround } from './city-native-ground.js';

// Real diffuse PNG with stable world-space paving beneath floors and buildings.
// Alternate reflected tiles share their edge texels and keep the slabs at
// 20–28 game units, including across a walkable-mask boundary.
export function drawCitySampleGround(c,layout,view){
  if(layout.worldId!=='clockshadow-city')return false;
  const b=CITY_SAMPLE_BOUNDS;if(view.maxX<b.minX||view.minX>b.maxX||view.maxY<b.minY||view.minY>b.maxY)return false;
  return drawCityNativeGround(c,layout,{minX:Math.max(view.minX,b.minX),maxX:Math.min(view.maxX,b.maxX),minY:Math.max(view.minY,b.minY),maxY:Math.min(view.maxY,b.maxY)});
}
