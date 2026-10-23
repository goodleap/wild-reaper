// Furniture collision and visible-face admission share the painted floor
// footprint. Sprite height never enlarges movement or sight obstruction.
export function interiorPropFootprint(prop){
  const footprint=prop.footprint;
  if(!footprint)return {x:prop.x,y:prop.y,r:prop.r,halfLength:prop.halfLength||0,angle:prop.angle||0,type:prop.halfLength?'log':'rock'};
  const {width,depth,offsetY=0}=footprint,halfLength=Math.abs(width-depth)*.5;
  return {x:prop.x,y:prop.y+offsetY,r:Math.min(width,depth)*.5,halfLength,angle:depth>width?Math.PI*.5:0,type:halfLength?'log':'rock'};
}
