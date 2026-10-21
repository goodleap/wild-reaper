import { Terrain } from './terrain.js';
import { RiftCollision } from './rift-collision.js';

// One authored footprint feeds ground painting, depth props and locomotion.
// Craters block walking while allowing flight and shots over their depressions.
export class MoonTerrain extends Terrain {
  constructor(definition){
    const landform=definition.landform;
    const obstacles=landform.solids.map(s=>({id:`moon:${s.id}`,type:'rock',variant:`moon-${s.kind}`,moonSolid:s,
      x:s.x,y:s.y,r:Math.max(s.width,s.depth)/2,heightBand:s.heightBand,collision:false,sortY:s.y+s.depth/2,
      visual:s.kind==='crater'?false:{halfWidth:s.width/2+12,top:s.depth/2+s.height+24,bottom:s.depth/2+12,shadowWidth:s.width*.42,shadowLength:s.height*.45,shadowOffset:s.depth*.2}}));
    super({region:definition.themeId,obstacles});this.definition=definition;this.bounds=definition.bounds;this.landform=landform;
    const outer={points:landform.outline,hole:false},holes=solids=>solids.map(s=>({points:s.points,hole:true}));
    this.rift=new RiftCollision({boundaries:[outer,...holes(landform.solids)],solidBoundaries:[outer,...holes(landform.solids.filter(s=>s.heightBand==='high'))]});
  }
  isDry(x,y,r=0){return this.rift.circleFree(x,y,r,'ground');}
}
