import { groundOffset } from './terrain.js';

const EMPTY_ZONES=Object.freeze([]);
const foot=entity=>({x:entity.x,y:Number.isFinite(entity.groundY)?entity.groundY:entity.y+groundOffset(entity,!!(entity.heroId||entity.isCompanion))});
const segmentDistanceSq=(ax,ay,bx,by,x,y)=>{
  const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length)):0;
  return (ax+dx*t-x)**2+(ay+dy*t-y)**2;
};

// Safety is a world rule, not healing or a shared collision wall: allies may
// cross freely, while hostile bodies, hazard generation and incoming attacks
// respect the same ground-space boundary.
export class WorldSafety {
  constructor(game,{enabled=()=>false,zones=[]}={}){
    this.game=game;this._enabled=enabled;this.byWorld=new Map();
    for(const zone of zones){
      if(!zone||typeof zone.worldId!=='string'||![zone.x,zone.y,zone.radius].every(Number.isFinite)||zone.radius<=0)continue;
      if(!this.byWorld.has(zone.worldId))this.byWorld.set(zone.worldId,[]);
      this.byWorld.get(zone.worldId).push(Object.freeze({...zone}));
    }
  }
  get active(){return this._enabled()&&!this.game.dungeon?.active&&this.game.sceneKind!=='dungeon';}
  get zones(){return this.active?(this.byWorld.get(this.game.worldId||this.game.region?.id)||EMPTY_ZONES):EMPTY_ZONES;}
  contains(x,y,padding=0){
    if(![x,y,padding].every(Number.isFinite))return false;
    for(const zone of this.zones)if((x-zone.x)**2+(y-zone.y)**2<=(zone.radius+Math.max(0,padding))**2)return true;
    return false;
  }
  protects(entity){if(!entity)return false;const p=foot(entity);return this.contains(p.x,p.y);}
  allowsSpawn(x,y,r=0){return !this.contains(x,y,Math.max(0,r)+6);}
  blocksSegment(ax,ay,bx,by,padding=0){
    if(![ax,ay,bx,by,padding].every(Number.isFinite))return false;
    for(const zone of this.zones)if(segmentDistanceSq(ax,ay,bx,by,zone.x,zone.y)<=(zone.radius+Math.max(0,padding))**2)return true;
    return false;
  }
  limitMovement(entity,dx,dy){
    if(!this.active||entity.isCompanion||entity.heroId||![dx,dy].every(Number.isFinite))return {dx,dy};
    const p=foot(entity),lengthSq=dx*dx+dy*dy;
    if(lengthSq<=1e-12)return {dx,dy};
    let allowed=1;
    for(const zone of this.zones){
      const radius=zone.radius+(entity.r||0)+6,ox=p.x-zone.x,oy=p.y-zone.y,c=ox*ox+oy*oy-radius*radius;
      // Recovery from a forced displacement is handled after terrain collision.
      if(c<0)continue;
      const b=2*(ox*dx+oy*dy),discriminant=b*b-4*lengthSq*c;
      if(discriminant<0)continue;
      const entry=(-b-Math.sqrt(discriminant))/(2*lengthSq);
      if(entry>=0&&entry<=allowed)allowed=Math.max(0,entry-.002);
    }
    return {dx:dx*allowed,dy:dy*allowed};
  }
  resolveEnemyPosition(entity){
    if(!this.active||entity.isCompanion||entity.heroId)return false;
    const p=foot(entity),radius=entity.r||0;
    for(const zone of this.zones){
      const limit=zone.radius+radius+8,dx=p.x-zone.x,dy=p.y-zone.y;
      if(dx*dx+dy*dy>=limit*limit)continue;
      const home=entity.territoryHome||entity.portalHome||entity.rescueHome;
      const angle=Math.hypot(dx,dy)>1?Math.atan2(dy,dx):home?Math.atan2(home.y-zone.y,home.x-zone.x):0;
      for(const turn of [0,.15,-.15,.35,-.35,.65,-.65,1,-1,Math.PI]){
        const x=zone.x+Math.cos(angle+turn)*limit,y=zone.y+Math.sin(angle+turn)*limit;
        if(!this.allowsSpawn(x,y,radius)||this.game.terrain?.isFree(x,y,radius+2)===false)continue;
        entity.x=x;entity.y=y-groundOffset(entity);entity._navTimer=0;return true;
      }
      // A valid authored home is preferable to leaving a displaced attacker in
      // town. This relocation grants no kill, loot or cleared-territory state.
      if(home&&this.allowsSpawn(home.x,home.y,radius)&&this.game.terrain?.isFree(home.x,home.y,radius+2)!==false){
        entity.x=home.x;entity.y=home.y-groundOffset(entity);entity._navTimer=0;return true;
      }
    }
    return false;
  }
  updateEnemy(enemy,dt){
    if(!this.active||enemy.isCompanion||enemy.hp<=0)return false;
    const target=enemy._friendlyTarget||this.game.player;
    if(!this.protects(target))return false;
    this.game._clearRegionalBossAttacks?.(enemy);
    enemy.charge=null;enemy.cast=null;enemy.slam=null;enemy.specialist=null;enemy._chargeSegment=null;
    enemy._groupProvokedUntil=0;enemy._territoryProvokedUntil=0;
    if(enemy.affix){enemy.affix.phase='idle';enemy.affix.life=0;}
    const home=enemy.territoryHome||enemy.portalHome||enemy.rescueHome;
    if(home){
      enemy.guardActive=false;enemy.guardReturnTarget=home;
      if(enemy.territoryId)enemy.territoryState='returning';
      const p=foot(enemy);
      if(Math.hypot(p.x-home.x,p.y-home.y)>7)this.game._moveEnemy?.(enemy,dt,home);
    }
    return true;
  }
}
