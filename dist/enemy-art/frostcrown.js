import { frostcrownAssets } from './frostcrown-assets.js';
import { paintFrostcrownRig } from './frostcrown-rig.js';

export function paint(c,p=0,flip=1,pose={}){
  const image=frostcrownAssets.image;
  if(!image)throw new Error('Frostcrown artwork must be preloaded before painting.');
  const mode=pose.mode||(p?'move':'idle');
  const cycle=Number.isFinite(pose.cycle)?pose.cycle:Math.asin(Math.max(-1,Math.min(1,p||0)));
  c.save();
  try{
    if(flip<0)c.scale(-1,1);
    paintFrostcrownRig(c,image,{...pose,mode,cycle,moving:pose.moving??(mode==='move'||mode==='rush')});
  }finally{c.restore();}
}
