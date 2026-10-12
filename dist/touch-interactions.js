import { groundOffset } from './terrain.js';

// The small contact zone is deliberately separate from the larger hint range.
// A latch belongs to a physical doorway, not a changing reward/exit label.
export class TouchInteractions {
  constructor(game){this.game=game;this.scene=this._scene();this.latched=null;}
  _scene(){const g=this.game;return g.dungeon?.active?`inside:${g.dungeon.active.id}`:`world:${g.regionIndex}`;}
  _foot(){const p=this.game.player;return {x:p.x,y:p.y+groundOffset(p,true)};}
  _distance(point){const p=this._foot();return Math.hypot(p.x-point.x,p.y-point.y);}
  _radius(choice){return choice.touchRadius??(['dungeonChest','castleTreasure','hutChest'].includes(choice.type)?38:choice.type==='merchant'?32:26);}
  _anchor(choice){return {x:choice.x,y:choice.y,r:this._radius(choice)+24};}
  update(){
    const g=this.game;if(g.status!=='playing')return false;
    const scene=this._scene(),choice=g.getInteraction();
    if(scene!==this.scene){
      this.scene=scene;this.latched=choice&&this._distance(choice)<=this._radius(choice)+24?this._anchor(choice):null;
      return false;
    }
    if(this.latched&&this._distance(this.latched)>this.latched.r)this.latched=null;
    if(!choice||choice.enabled===false||this._distance(choice)>this._radius(choice))return false;
    if(this.latched&&Math.hypot(choice.x-this.latched.x,choice.y-this.latched.y)<8)return false;
    const anchor=this._anchor(choice);
    if(!g.interact(choice.id))return false;
    this.latched=anchor;
    // Preserve surplus crystal choices even when collecting a chest ends this
    // update early, while scene/shop/reward changes remain atomic.
    g._trySkillUpgrade();return true;
  }
}
