import { groundOffset } from './terrain.js';
import { resetLocomotion } from './locomotion.js';

const STORY_CONTENT=new Set(['naturalTerrain','storyActors','storyEnemies','storyInteractions','storyEffects','characterAbilities']);
const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.heroId||!!entity.isCompanion)});

// A chapter borrows the map's natural geometry, not its exploration objects.
// The same policy owns generation, simulation and the presentation boundary.
export class SceneContent {
  constructor(game,{story=false}={}) {
    this.game=game;this.isolated=story;this.disposed=false;
    this.terrain=game.terrain;this.mapId=game.mapId;
    this._gates=story?new Map(game.terrain._riftGates||[]):null;
    if(story)for(const [id] of this._gates)game.terrain.setRiftGate(id,true);
  }
  allows(category){return !this.isolated||STORY_CONTENT.has(category);}
  _arrival(desired) {
    const g=this.game,p=g.player,r=p.r,mushroomCells=new Map();
    const mushroomsClear=point=>{
      if(!g.environment?.generation)return true;
      // The arrival may be outside the initial world cache. Query the same
      // stable cells before loading that view, so a mushroom cannot appear
      // under the player on the following frame.
      const margin=160+r;
      for(let x=Math.floor((point.x-margin)/520);x<=Math.floor((point.x+margin)/520);x++)for(let y=Math.floor((point.y-margin)/520);y<=Math.floor((point.y+margin)/520);y++) {
        const key=`${x},${y}`;
        if(!mushroomCells.has(key))mushroomCells.set(key,g.environment._mushroomsAt(x,y));
        if(mushroomCells.get(key).some(prop=>Math.hypot(prop.x-point.x,prop.y-point.y)<prop.blastRadius+r+16))return false;
      }
      return true;
    };
    const safe=point=>g.terrain.isFree(point.x,point.y,r+4)&&g.terrain.island?.isDry(point.x,point.y,r+4)!==false&&
      g.environment?.isHazardFree?.(point.x,point.y,r+12)!==false&&
      !g.environment?.props.some(prop=>prop.state!=='spent'&&Math.hypot(prop.x-point.x,prop.y-point.y)<(prop.blastRadius||82)+r+16)&&
      !g.enemies.some(enemy=>enemy.hp>0&&Math.hypot(enemy.x-point.x,foot(enemy).y-point.y)<Math.max(240,enemy.r+r+40))&&
      !g.regions.portals.some(portal=>Math.hypot(portal.x-point.x,portal.y-point.y)<(portal.touchRadius||42)+r+32)&&mushroomsClear(point);
    if(safe(desired))return desired;
    // Prefer the place where the chapter ended; a newly restored foundation
    // or resident group must not trap the player or land a surprise hit.
    for(let radius=32;radius<=640;radius+=32)for(let i=0;i<32;i++) {
      const angle=i*Math.PI/16,point={x:desired.x+Math.cos(angle)*radius,y:desired.y+Math.sin(angle)*radius};
      if(safe(point))return point;
    }
    const spawn=g.terrain.island?.layout?.spawn||{x:0,y:groundOffset(p,true)};
    if(safe(spawn))return {...spawn};
    for(const area of g.terrain.island?.layout?.areas||[])if(safe(area.center))return {...area.center};
    return null;
  }
  restoreWorld() {
    const g=this.game;
    if(!this.isolated||this.disposed||g.terrain!==this.terrain||g.mapId!==this.mapId)return false;
    const desired=foot(g.player);
    for(const [id,open] of this._gates||[])g.terrain.setRiftGate(id,open);
    g._createStoryExplorationContent();
    const arrival=this._arrival(desired);
    if(!arrival)throw new Error('Cannot return from the chapter without a safe exploration arrival');
    g.player.x=arrival.x;g.player.y=arrival.y-groundOffset(g.player,true);
    if(g.environment?.generation)g.environment._refresh(true);
    if(g.environment?.mechanisms.generation)g.environment.mechanisms._refresh(true);
    if(g.environment?.worldHazards.generation)g.environment.worldHazards._refresh(true);
    if(g.adventure?.generation)g.adventure._refreshSupplies(true);
    g.player.invuln=Math.max(g.player.invuln,2);g.player.hurtFlash=0;resetLocomotion(g.player);
    g.regionGrace=Math.max(g.regionGrace||0,4);g._interactHeld=false;
    g.touchInteractions.scene=null;g.touchInteractions.latched=null;
    g._friendlySnapshot=null;g._rebuildGrid();
    this.isolated=false;this._gates=null;
    return true;
  }
  dispose() {
    // Death, restart and changing scenes do not instantiate an exploration
    // world behind the departing chapter or write gates into another map.
    this.disposed=true;this._gates=null;
  }
}
