import { getConfigSection } from './content-config.js';
import { mapSeed } from './map-context.js';
import { ENEMY_BODY_HEIGHTS, enemyVisual } from './enemy-visuals.js';
import { groundOffset } from './terrain.js';
import { groundFootprint, surfaceAllows, placementAllowed } from './placement-rules.js';
import { RegionalMechanisms, isGrounded } from './regional-mechanisms.js';
import { WorldHazards } from './world-hazards.js';
import { worldForId } from './world-definitions.js';
import { biomeZone } from './biome-layout.js';
import { friendlyTargets, friendlyFoot, isFriendlyActive, damageFriendly } from './friendly-combat.js';
import { containsWater, waterBounds, waterDepth, waterIntersectsCircle, waterIntersectsCapsule, getWaterContours, WATER_SHAPES } from './water-geometry.js';
export { isGrounded } from './regional-mechanisms.js';

const CELL=520,TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const WEAPON_SOURCES=new Set(['sword','arrow','runeArrow','orbit','pulse','echo','lightning','storm']);
const RULES=getConfigSection('geography').environmentRules;
export const ENVIRONMENT_BALANCE=RULES.balance;
const BODY_HEIGHTS=Object.freeze({...ENEMY_BODY_HEIGHTS,dog:[30,12],golem:[62,21]});
const humanoid=entity=>!!(entity.isCompanion||entity.isCaptive||entity.isTownNpc);
const intersects=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxY>=b.minY&&a.minY<=b.maxY;
const boundsDistance=(b,p)=>Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minY-p.y,0,p.y-b.maxY));
export const WATER_SIZES=RULES.waterSizes;
const WATER_ANGLES=RULES.waterAngles;
const WATER_PLACEMENTS=RULES.waterPlacements;
export const WATER_BANK_CLEARANCE=RULES.waterBankClearance;
// Measured ground geometry, excluding raised branches and treetops. Slender
// trees have narrow collision trunks but longer visible roots at their feet.
export const waterObstacleFootprint=(o,padding=WATER_BANK_CLEARANCE)=>groundFootprint(o,padding);

// This fixed-size filter remembers armed locations for the whole run. A false
// positive can only omit a mushroom; leaving and revisiting never farms it.
class ConsumedMushrooms {
  constructor(){this.bits=new Uint8Array(65536);}
  _keys(id){let a=2166136261,b=5381;for(let i=0;i<id.length;i++){a=Math.imul(a^id.charCodeAt(i),16777619);b=Math.imul(b,33)^id.charCodeAt(i);}return [a>>>0,b>>>0,(a+b)>>>0];}
  has(id){return this._keys(id).every(n=>{const bit=n%(this.bits.length*8);return this.bits[bit>>>3]&(1<<(bit&7));});}
  add(id){for(const n of this._keys(id)){const bit=n%(this.bits.length*8);this.bits[bit>>>3]|=1<<(bit&7);}}
}

function segmentDistance(x,y,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/length)):0;
  return Math.hypot(x-x1-dx*t,y-y1-dy*t);
}

export class Environment {
  constructor(game,{generation=true}={}){
    this.game=game;this.generation=generation;this.props=[];this.muds=[];
    this.world=worldForId(game.region?.id);this.region=this.world.id;this.rules=this.world.environment;
    this.seed=mapSeed(game);
    this._shore={type:'shore',island:game.terrain?.island,x:0,y:0,rx:1,ry:1};
    this._refreshClock=0;this._fixtureId=0;this._consumed=new ConsumedMushrooms();this._waterCandidates=new Map();this._waterLayout=new Map();
    if(generation)this._refresh(true);
    this.mechanisms=new RegionalMechanisms(this,{generation});
    this.worldHazards=new WorldHazards(this,{generation});
  }
  _hash(x,y=0){const offset=this.rules.hashOffset;return hash(x+this.seed*131+offset,y+this.seed*197+offset);}
  _foot(entity=this.game.player,isPlayer=entity===this.game.player){return {x:entity.x,y:entity.y+groundOffset(entity,isPlayer||humanoid(entity))};}
  _visible(x,y,margin=0){const g=this.game;return Math.abs(x-g.player.x)<=g.viewWidth*.5+margin&&Math.abs(y-g.player.y)<=g.viewHeight*.5+margin;}
  _terrainClear(x,y,r){const terrain=this.game.terrain;return Math.hypot(x,y)>=ENVIRONMENT_BALANCE.safeRadius+r&&(!terrain.island||terrain.island.naturalCircleFree(x,y,r))&&terrain.isFree(x,y,r);}
  _objectiveClear(x,y,r){
    const adventure=this.game.adventure;
    if(this.game.settlements?.isSafePoint(x,y,r)===false)return false;
    if(this.game.relicSites?.isSafePoint(x,y,r)===false)return false;
    if(this.game.regions?.isSafePoint?.(x,y,r)===false)return false;
    if(adventure?.props.some(o=>distance(o,{x,y})<r+(o.r||18)+8))return false;
    if(adventure?.treasure&&distance(adventure.treasure,{x,y})<r+(adventure.treasure.r||27)+15)return false;
    return true;
  }
  _point(tx,ty,seed,r,kind='vegetation',footprintRadius=25){
    // Every retry depends only on the owning cell. No random walk or growing
    // world cache is needed, and obstacle checks preserve open walking routes.
    for(let i=0;i<7;i++){
      const x=tx*CELL+80+this._hash(tx+seed+i*17,ty+419)*360;
      const y=ty*CELL+80+this._hash(tx+503,ty+seed+i*29)*360;
      if(this._terrainClear(x,y,r)&&placementAllowed(this.game,kind,{x,y,r:footprintRadius},{environment:this,checkTerrain:false}))return {x,y};
    }
    return null;
  }
  _mushroomsAt(tx,ty,{ignoreObjectives=false}={}){
    const chance=this.rules.mushroomChance;if(!chance)return [];
    const seed=this._hash(tx+683,ty+727);if(seed>chance)return [];
    const point=this._point(tx,ty,751,this.game.terrain.island?ENVIRONMENT_BALANCE.blastRadius:35);if(!point)return [];
    const make=(point,index)=>{
      const id=`mushroom:${tx},${ty}:${index}`;
      // Objectives may suppress a location, but can never move its stable ID
      // to another point after a crate breaks or a treasure disappears.
      return this._consumed.has(id)||(!ignoreObjectives&&!this._objectiveClear(point.x,point.y,ENVIRONMENT_BALANCE.blastRadius))?null:{id,type:'mushroom',...point,r:17,aimY:point.y-13,sortY:point.y,seed:this._hash(tx+797+index,ty+809),state:'idle',fuse:0,maxFuse:ENVIRONMENT_BALANCE.mushroomFuse,blastRadius:ENVIRONMENT_BALANCE.blastRadius};
    };
    const result=[],first=make(point,0);if(first)result.push(first);
    // Occasional pairs show the delayed chain reaction without filling paths.
    if(seed<RULES.mushroom.pairThreshold){
      const angle=this._hash(tx+853,ty+877)*TAU,next={x:point.x+Math.cos(angle)*RULES.mushroom.pairDistance,y:point.y+Math.sin(angle)*RULES.mushroom.pairDistance};
      if(this._terrainClear(next.x,next.y,this.game.terrain.island?ENVIRONMENT_BALANCE.blastRadius:35)&&placementAllowed(this.game,'vegetation',{...next,r:25},{environment:this,checkTerrain:false})){const second=make(next,1);if(second)result.push(second);}
    }
    return result;
  }
  _mudCandidate(tx,ty){
    const key=`${tx},${ty}`;if(this._waterCandidates.has(key))return this._waterCandidates.get(key);
    const remember=mud=>{this._waterCandidates.set(key,mud);while(this._waterCandidates.size>192)this._waterCandidates.delete(this._waterCandidates.keys().next().value);return mud;};
    const water=this.rules.water,chance=water.chance;
    const seed=this._hash(tx+911,ty+947);if(seed>chance||chance===0)return remember(null);
    const sizeRoll=this._hash(tx+971,ty+977),scale=WATER_SIZES[sizeRoll<RULES.waterSizeThresholds[0]?0:sizeRoll<RULES.waterSizeThresholds[1]?1:sizeRoll<RULES.waterSizeThresholds[2]?2:sizeRoll<RULES.waterSizeThresholds[3]?3:4];
    const family=Math.floor(this._hash(tx+991,ty+997)*water.families),shape=WATER_SHAPES[family];
    const x=tx*CELL+260+(this._hash(tx+1013,ty+419)-.5)*120,y=ty*CELL+260+(this._hash(tx+503,ty+1013)-.5)*120;
    const rx=80*scale,ry=(shape==='elongated'?34:shape==='rounded'?50:47)*scale,angleIndex=Math.floor(this._hash(tx+1091,ty+1097)*3),angle=WATER_ANGLES[angleIndex];
    const kind=water.zoneKinds?water.zoneKinds[biomeZone(this.region,x,y,this.seed).id]||water.kind:water.kind;
    const mud={id:`mud:${tx},${ty}`,type:'mud',kind,x,y,rx,ry,seed,shape,angle,island:water.innerIslands&&scale>=2.5&&family>=3,scale};
    const terrain=this.game.terrain,structures=new Set(terrain._structures||[]);
    const clear=()=>{
      if(Math.hypot(mud.x,mud.y)<=ENVIRONMENT_BALANCE.safeRadius+Math.max(rx,ry)+8)return false;
      // Query physical bounds with a skirt covering the measured roots/stone
      // edges beyond collision. A log uses its entire rotated round-ended
      // body, not a circle at the center or a handful of shoreline samples.
      const island=terrain.island;
      if(island){
        const ring=getWaterContours(mud).outer;
        // Test every complete shoreline edge plus its visible bank. A lake
        // center on land does not prove a long inlet or rounded end is dry.
        if(!surfaceAllows(island,'water',{points:ring,padding:WATER_BANK_CLEARANCE}))return false;
        if(waterIntersectsCircle(mud,0,0,268)||Object.values(island.plan).some(p=>waterIntersectsCircle(mud,p.x,p.y,p.r+8)))return false;
        if(island.routes.some(p=>waterIntersectsCapsule(mud,p.ax,p.ay,p.bx,p.by,p.r+8)))return false;
      }
      const b=waterBounds(mud,40),obstacles=terrain.query(b.minX,b.minY,b.maxX,b.maxY);
      for(const o of obstacles){
        if(structures.has(o)||o.structureId)continue;
        const f=waterObstacleFootprint(o);
        if(o.type==='log'?waterIntersectsCapsule(mud,f.ax,f.ay,f.bx,f.by,f.r):waterIntersectsCircle(mud,o.x,o.y,f.r))return false;
      }
      return true;
    };
    if(clear())return remember(mud);
    // Retry only permanent terrain in this same owner cell. Finite alternate
    // positions/orientations retain full-size lakes. Later props must fit this
    // fixed layout; adding or consuming them never changes a natural lake.
    const start=Math.floor(this._hash(tx+1171,ty+1193)*WATER_PLACEMENTS.length);
    const jitterX=(this._hash(tx+1229,ty+1259)-.5)*28,jitterY=(this._hash(tx+1283,ty+1301)-.5)*28;
    for(let i=0;i<WATER_PLACEMENTS.length;i++){
      const point=WATER_PLACEMENTS[(start+i)%WATER_PLACEMENTS.length];mud.x=tx*CELL+point[0]*CELL+jitterX;mud.y=ty*CELL+point[1]*CELL+jitterY;
      for(let turn=0;turn<3;turn++){mud.angle=WATER_ANGLES[(angleIndex+turn)%3];if(clear())return remember(mud);}
    }
    return remember(null);
  }
  _mudAt(tx,ty){
    const key=`${tx},${ty}`;if(this._waterLayout.has(key))return this._waterLayout.get(key);
    const remember=value=>{this._waterLayout.set(key,value);while(this._waterLayout.size>192)this._waterLayout.delete(this._waterLayout.keys().next().value);return value;};
    const mud=this._mudCandidate(tx,ty);if(!mud)return remember(null);
    const b=waterBounds(mud,40);
    // Neighbour arbitration is based only on permanent seed data, not on
    // load order. Larger waters win and leave an 80-unit dry walking gap.
    // Retried lake centers may sit near opposite owner-cell edges, so a large
    // shoreline plus its dry gap can also meet a water two cells away.
    for(let xx=tx-2;xx<=tx+2;xx++)for(let yy=ty-2;yy<=ty+2;yy++){
      if(xx===tx&&yy===ty)continue;
      const other=this._mudCandidate(xx,yy);if(!other)continue;
      const wins=other.scale>mud.scale||(other.scale===mud.scale&&(other.seed>mud.seed||(other.seed===mud.seed&&other.id>mud.id)));
      if(wins&&intersects(b,waterBounds(other,40)))return remember(null);
    }
    return remember(mud);
  }
  // Placement queries the stable neighbouring layout, not the visible cache.
  // Natural water has no dependency on plants, crates or dynamic objectives,
  // so loading order and consuming a reward cannot uncover a new lake.
  watersInBounds(bounds){
    if(!bounds||!['minX','minY','maxX','maxY'].every(k=>Number.isFinite(bounds[k]))||bounds.minX>bounds.maxX||bounds.minY>bounds.maxY)return [];
    const waters=[],ids=new Set(),add=m=>{if(m&&intersects(waterBounds(m),bounds)&&!ids.has(m.id||m)){ids.add(m.id||m);waters.push(m);}};
    if(this.generation){
      for(let tx=Math.floor((bounds.minX-330)/CELL);tx<=Math.floor((bounds.maxX+330)/CELL);tx++)for(let ty=Math.floor((bounds.minY-330)/CELL);ty<=Math.floor((bounds.maxY+330)/CELL);ty++)add(this._mudAt(tx,ty));
    }
    for(const mud of this.muds)add(mud);
    return waters;
  }
  _refresh(initial=false){
    const g=this.game,p=this._foot(),halfW=Math.min(900,g.viewWidth*.5)+260,halfH=Math.min(650,g.viewHeight*.5)+260;
    const nearby=o=>Math.abs(o.x-p.x)<halfW+200&&Math.abs(o.y-p.y)<halfH+200;
    this.props=this.props.filter(o=>o.state!=='spent'&&(o.state==='armed'||nearby(o))).slice(0,ENVIRONMENT_BALANCE.maxProps);
    const propIds=new Set(this.props.map(o=>o.id)),props=[];
    for(let tx=Math.floor((p.x-halfW)/CELL);tx<=Math.floor((p.x+halfW)/CELL);tx++)
      for(let ty=Math.floor((p.y-halfH)/CELL);ty<=Math.floor((p.y+halfH)/CELL);ty++){
        for(const o of this._mushroomsAt(tx,ty))if(!propIds.has(o.id)&&(initial||!this._visible(o.x,o.y,48)))props.push(o);
      }
    props.sort((a,b)=>distance(a,p)-distance(b,p));
    this.props.push(...props.slice(0,Math.max(0,ENVIRONMENT_BALANCE.maxProps-this.props.length)));
    this._refreshWater(initial,p);
  }
  _refreshWater(initial,p){
    const g=this.game,last=this._waterView;
    // A resized viewport or scene teleport reveals ground immediately, not
    // through the normal walking prefetch band. Fill it as one initial view.
    initial=initial||!last||last.width!==g.viewWidth||last.height!==g.viewHeight||Math.hypot(last.x-g.player.x,last.y-g.player.y)>320;
    this._waterView={x:g.player.x,y:g.player.y,width:g.viewWidth,height:g.viewHeight};
    const view={minX:g.player.x-g.viewWidth*.5,minY:g.player.y-g.viewHeight*.5,maxX:g.player.x+g.viewWidth*.5,maxY:g.player.y+g.viewHeight*.5};
    const load={minX:view.minX-340,minY:view.minY-340,maxX:view.maxX+340,maxY:view.maxY+340};
    const retained=this.muds.filter(m=>intersects(waterBounds(m,35),load)),ids=new Set(retained.map(m=>m.id)),candidates=[];
    // A large water can cross into view while its owning cell is still well
    // outside it. Query by maximum extent and retain by its whole footprint.
    for(let tx=Math.floor((load.minX-330)/CELL);tx<=Math.floor((load.maxX+330)/CELL);tx++)for(let ty=Math.floor((load.minY-330)/CELL);ty<=Math.floor((load.maxY+330)/CELL);ty++){
      const id=`mud:${tx},${ty}`;if(ids.has(id))continue;
      const mud=this._mudAt(tx,ty);if(!mud)continue;const b=waterBounds(mud,35);
      if(intersects(b,load)&&(initial||!intersects(b,view)))candidates.push(mud);
    }
    // Never evict a visible shoreline to make room for an offscreen center.
    // The cap remains fixed; the generous prefetch band covers normal motion.
    const visible=retained.filter(m=>intersects(waterBounds(m,35),view));
    const rest=[...retained.filter(m=>!intersects(waterBounds(m,35),view)),...candidates];
    rest.sort((a,b)=>boundsDistance(waterBounds(a),p)-boundsDistance(waterBounds(b),p));
    this.muds=[...visible,...rest.slice(0,Math.max(0,ENVIRONMENT_BALANCE.maxMuds-visible.length))];
  }
  getImmersion(entity,isPlayer=entity===this.game.player){
    if(!isGrounded(entity))return null;
    const point=this._foot(entity,isPlayer),island=this.game.terrain.island;let depth=island?.depthAt(point.x,point.y)||0,mud=depth>0?this._shore:null;
    // Choose the deepest overlapping pool instead of adding their depths.
    // Only the sprite sinks: movement, collision and ordering keep their feet.
    for(const patch of this.muds){
      if(patch.kind==='ice'||patch.kind==='lava')continue;
      const depthScale=patch.kind==='snow'?RULES.snowImmersion:this.rules.waterImmersion[this.rules.hazard?.type==='tide'&&this.worldHazards?.tideAt(patch)==='active'?'active':'idle'];
      const d=waterDepth(patch,point.x,point.y)*depthScale;if(d>depth){depth=d;mud=patch;}
    }
    if(!mud)return null;
    const bodyKey=entity.isCompanion||entity.isCaptive?entity.kind||entity.heroId:entity.type;
    const human=isPlayer||(humanoid(entity)&&!BODY_HEIGHTS[bodyKey]),body=enemyVisual(entity)?.immersionBody||BODY_HEIGHTS[bodyKey]||[34,16];
    const radius=Number.isFinite(entity.r)&&entity.r>0?entity.r:15;
    const maxSink=human?RULES.humanoidMaxSink:Math.min(RULES.otherMaxSink,body[0]*radius/body[1]*RULES.otherHeightSinkFactor);
    return {x:point.x,footY:point.y,waterY:point.y,depth,sink:maxSink*depth,maxSink,width:human?14:Math.max(5,Math.min(35,radius*.83)),mud};
  }
  movementMultiplier(entity,isPlayer=entity===this.game.player){
    if(!isGrounded(entity))return 1;
    const point=this._foot(entity,isPlayer);
    let mud=1;
    for(const patch of this.muds){
      if(!containsWater(patch,point.x,point.y))continue;
      const slow=patch.kind==='ice'||patch.kind==='lava'?1:patch.kind==='snow'?RULES.snowMovement:this.rules.waterMovement[this.rules.hazard?.type==='tide'&&this.worldHazards?.tideAt(patch)==='active'?'active':'idle'];
      mud=Math.min(mud,slow);
    }
    const shoreDepth=this.game.terrain.island?.depthAt(point.x,point.y)||0,shore=1-shoreDepth*RULES.shoreSlowPerDepth;
    return Math.min(mud,shore,this.mechanisms.movementMultiplier(entity,isPlayer));
  }
  isHazardFree(x,y,r=0){return this.mechanisms.isHazardFree(x,y,r)&&this.worldHazards.isHazardFree(x,y,r);}
  nearestDestructible(range=280){return this.mechanisms.nearestDestructible(range);}
  _arm(prop,source){
    if(this.game.status!=='playing'||prop.state==='armed'||prop.state==='spent')return false;
    prop.id??=`mushroom:fixture:${++this._fixtureId}`;
    prop.state='armed';prop.maxFuse=ENVIRONMENT_BALANCE.mushroomFuse;prop.fuse=prop.maxFuse;
    prop.blastRadius=ENVIRONMENT_BALANCE.blastRadius;prop.source=source;
    this._consumed.add(prop.id);this.game._emit('mushroomArmed',{x:prop.x,y:prop.y});return true;
  }
  hitAt(x,y,r=0,source='arrow',canHit=null){
    if(!WEAPON_SOURCES.has(source)||![x,y,r].every(Number.isFinite)||r<0)return 0;
    let count=0;for(const prop of this.props)if(Math.hypot(prop.x-x,(prop.aimY??prop.y-13)-y)<=r+(prop.r||17)&&(!canHit||canHit(prop))&&this._arm(prop,source))count++;
    return count+this.mechanisms.hitAt(x,y,r,source,canHit);
  }
  hitSegment(x1,y1,x2,y2,r=0,source='arrow'){
    if(!WEAPON_SOURCES.has(source)||![x1,y1,x2,y2,r].every(Number.isFinite)||r<0)return 0;
    let count=0;for(const prop of this.props)if(segmentDistance(prop.x,prop.aimY??prop.y-13,x1,y1,x2,y2)<=r+(prop.r||17)&&this._arm(prop,source))count++;
    return count+this.mechanisms.hitSegment(x1,y1,x2,y2,r,source);
  }
  hitAllVisible(source='storm'){
    if(!WEAPON_SOURCES.has(source))return 0;
    let count=0;for(const prop of this.props)if(this._visible(prop.x,prop.aimY??prop.y-13,prop.r||17)&&this._arm(prop,source))count++;
    return count+this.mechanisms.hitAllVisible(source);
  }
  _explode(prop){
    const g=this.game,r=prop.blastRadius||ENVIRONMENT_BALANCE.blastRadius;
    prop.state='spent';g._effect(prop.x,prop.y,'mushroomBlast',.5,r,'#ffbd70',undefined,{source:prop.source});
    g._emit('mushroomBlast',{x:prop.x,y:prop.y});
    const damage=RULES.mushroom.enemyDamage*(1+Math.min(Math.max(g.time,0),RULES.mushroom.growthTimeCap)/RULES.mushroom.growthTimePeriod);
    // Raw damage avoids recursively creating bleeding, shock, or new attacks.
    // Snapshotting also survives treasure/event kill handlers replacing arrays.
    const reaches=(entity,point)=>distance(point,prop)<=r+entity.r&&!g.terrain.firstBlocker(prop.x,prop.y,point.x,point.y,0,'projectile');
    for(const enemy of [...g.enemies])if(enemy.hp>0&&reaches(enemy,this._foot(enemy,false)))g._hurtEnemy(enemy,damage,0,g.player,'mushroom');
    // The airborne blast reaches low-flying bodies, while solid walls stop it.
    for(const ally of friendlyTargets(g)){
      if(g.status!=='playing')break;
      if(isFriendlyActive(g,ally)&&reaches(ally,friendlyFoot(ally)))damageFriendly(g,ally,RULES.mushroom.friendlyDamage,'mushroom');
    }
    if(g.status!=='playing')return;
    for(const next of this.props)if(next!==prop&&distance(next,prop)<=r+(next.r||17))this._arm(next,'chain');
  }
  update(dt){
    const g=this.game;if(g.status!=='playing')return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    const p=this._foot();
    // Consume distant armed props quietly (for example after a debug teleport).
    // They never award remote kills and cannot be rearmed on a later visit.
    this.props=this.props.filter(o=>o.state!=='spent'&&(o.state!=='armed'||distance(o,p)<=ENVIRONMENT_BALANCE.despawnDistance));
    const ready=[];
    for(const prop of this.props)if(prop.state==='armed'){prop.fuse-=dt;if(prop.fuse<=1e-9)ready.push(prop);}
    // A mushroom armed by this loop starts its full fuse on the next update.
    for(const prop of ready){if(g.status!=='playing')break;this._explode(prop);}
    this.props=this.props.filter(o=>o.state!=='spent');
    if(g.status!=='playing')return;
    if(this.generation){this._refreshClock-=dt;if(this._refreshClock<=0){this._refreshClock=.5;this._refresh();}}
    this.mechanisms.update(dt);
    if(g.status==='playing')this.worldHazards.update(dt);
  }
}
