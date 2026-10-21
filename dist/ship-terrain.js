import { Terrain } from './terrain.js';
import { RiftCollision } from './rift-collision.js';

// One footprint owns the deck outline, physical furniture and its rendering.
// Depth props are decorative copies; they never add circular collision on top.
export class ShipTerrain extends Terrain {
  constructor(scene,region='beach'){
    const obstacles=scene.solids.map(s=>({id:`ship:${scene.id}:${s.id}`,type:'rock',variant:`ship-${s.kind}`,shipSolid:s,
      x:s.x,y:s.y,r:Math.max(s.width,s.depth)/2,heightBand:s.heightBand,collision:false,sortY:s.y+s.depth/2,
      visual:{halfWidth:s.kind==='mast'?Math.max(130,s.width/2+8):s.width/2+8,top:s.depth/2+s.height+20,bottom:s.depth/2+8,shadowWidth:s.width*.42,shadowLength:s.height*.45,shadowOffset:s.depth*.25}}));
    super({region,obstacles});this.scene=scene;this.bounds=scene.bounds;
    const outer={points:scene.outline,hole:false},holes=solids=>solids.map(s=>({points:s.points,hole:true}));
    this.rift=new RiftCollision({boundaries:[outer,...holes(scene.solids)],solidBoundaries:[outer,...holes(scene.solids.filter(s=>s.heightBand==='high'))]});
  }
  isDry(x,y,r=0){return this.rift.circleFree(x,y,r,'ground');}
}
