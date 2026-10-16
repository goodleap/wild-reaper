// A small in-world art sample. These rooted low plants do not add obstacles;
// the existing castle foundations and 200-unit entrance remain authoritative.
export const CITY_SAMPLE_BOUNDS=Object.freeze({minX:-4650,minY:-3080,maxX:-3750,maxY:-2140});
export const CITY_SAMPLE_FOLIAGE=Object.freeze([
  ['west',-4390,-2790],['east',-4010,-2790],
  ['west-front',-4415,-2618],['east-front',-3985,-2618]
].map(([key,x,y])=>Object.freeze({id:`city-sample:foliage:${key}`,region:'clockshadow-city',
  variant:'city-detail',cityKind:'foliage',type:'tree',x,y,r:8,scale:1,width:44,depth:16,height:32,
  collision:false,heightBand:'low',sortY:y+8,riftShrub:true,seed:.25})));
