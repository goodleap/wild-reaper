// A small in-world art sample. These rooted low plants do not add obstacles;
// the existing castle foundations and 200-unit entrance remain authoritative.
export const CITY_SAMPLE_BOUNDS=Object.freeze({minX:-4650,minY:-3080,maxX:-3750,maxY:-2140});
export const CITY_SAMPLE_FOLIAGE=Object.freeze([
  ['west',-4390,-2790],['east',-4010,-2790],
  ['west-front',-4415,-2618],['east-front',-3985,-2618]
].map(([key,x,y])=>Object.freeze({id:`city-sample:foliage:${key}`,region:'clockshadow-city',
  variant:'city-detail',cityKind:'foliage',type:'tree',x,y,r:8,scale:1,width:44,depth:16,height:32,
  collision:false,heightBand:'low',sortY:y+8,riftShrub:true,seed:.25})));

// Entire buildings belong to the shared depth queue, never the clipped floor.
// Both rectangular foundations are inside the existing blocked city mass;
// these carriers only index artwork and do not add another collision shape.
export const CITY_SAMPLE_HOUSES=Object.freeze([
  ['west',-4410,-2340],['east',-3990,-2340]
].map(([key,x,y])=>Object.freeze({id:`city-sample:house:${key}`,region:'clockshadow-city',
  variant:'city-detail',cityKind:'house',type:'log',x,y,r:50,halfLength:55,angle:0,
  scale:1,width:210,depth:100,height:160,collision:false,heightBand:'high',sortY:y+50,seed:.25})));
