import { getConfigSection } from './content-config.js';
import { REGIONS, WORLD_IDS, regionFor } from './world-definitions.js';
import { groundOffset } from './terrain.js';
import { WorldSafety } from './world-safety.js';
import { portalEntranceContains, portalExitGeometry } from './portal-geometry.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const playerFoot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const pointId=worldId=>`waypoint:${worldId}`;
const WAYPOINT_RULES=Object.freeze({activationRadius:115,interactionRadius:135,touchRadius:42,doorOffset:30,travelRadius:145});

// Natural connections discover regions. Visiting a region's settlement waypoint
// activates fast travel; opening the atlas alone never grants a destination.
export class WorldTravel {
  constructor(game,{config=getConfigSection('worlds').travel,data=null,onChange=null}={}){
    this.game=game;this.config=config;this.onChange=onChange;this.pending=null;
    this.definitions=new Map((config?.regions||[]).map(region=>[region.worldId,region]));
    this.discovered=new Set();this.activated=new Set();this.restAnchor=null;this._edgeLatches=new Set();
    this.safety=new WorldSafety(game,{enabled:()=>this.enabled,zones:[...this.definitions.values()].map(({worldId,core})=>({worldId,id:core.id,x:core.x,y:core.y,radius:core.radius}))});
    if(data)this.restore(data);
  }
  get enabled(){
    const g=this.game;
    return !!this.config&&g.mode==='world'&&g._worldExploration!==false&&!g.stage&&!g.expedition&&this.definitions.has(g.worldId||g.region?.id);
  }
  get current(){return this.definitions.get(this.game.worldId||this.game.region?.id)||null;}
  get waypoint(){
    if(!this.enabled||!this.current?.core?.waypoint)return null;
    const region=this.current,core=region.core;
    return {...core.waypoint,id:pointId(region.worldId),worldId:region.worldId,type:'worldWaypoint',worldFacility:'waypoint',name:`${core.name}传送点`,
      coreId:core.id,coreName:core.name,artTheme:core.artTheme,activated:this.activated.has(region.worldId)};
  }
  _door(waypoint=this.waypoint){return waypoint?{x:waypoint.x,y:waypoint.y+WAYPOINT_RULES.doorOffset}:null;}
  _notify(reason){
    if(this.onChange)this.onChange(this.serialize(),reason);
    else this.game._scheduleWorldSave?.(reason);
  }
  initialize(){if(!this.enabled)return false;this.prepareRegion();this.onRegionEntered();return true;}
  prepareRegion(){
    const point=this.waypoint,structures=[];
    if(point){
      const width=point.width,depth=point.depth;
      structures.push({id:`${point.id}:foundation`,type:'log',structureId:point.id,structureType:'worldWaypoint',
        x:point.x,y:point.y-depth/2,r:depth/2,halfLength:Math.max(0,(width-depth)/2),angle:0,heightBand:'high',visual:false});
    }
    this.game.terrain?.setStructures?.(structures,'world-waypoints');return !!point;
  }
  onRegionEntered(){
    if(!this.enabled)return false;
    this.prepareRegion();
    const id=this.current.worldId,first=!this.discovered.has(id);
    this._edgeLatches.clear();
    const p=playerFoot(this.game),radius=this.game.player.r+24;
    for(const portal of this.game.regions?.portals||[])if(portalExitGeometry(portal)&&portalEntranceContains(portal,p,radius))this._edgeLatches.add(portal.id);
    this.discovered.add(id);
    if(first){this.game._emit?.('worldRegionDiscovered',{worldId:id,name:regionFor(WORLD_IDS.indexOf(id)).name});this._notify('world-discovered');}
    return first;
  }
  _nearWaypoint(radius=WAYPOINT_RULES.travelRadius){
    if(!this.enabled||this.game.dungeon?.active||this.game.sceneKind==='dungeon')return false;
    const p=playerFoot(this.game),door=this._door();
    return !!door&&distance(p,door)<=radius&&!this.game.terrain?.firstBlocker?.(p.x,p.y,door.x,door.y,0,'sight');
  }
  update(){
    if(!this.enabled||this.game.status!=='playing'||this.game.sceneTransition?.active)return false;
    if(!this.activated.has(this.current.worldId)&&this._nearWaypoint(WAYPOINT_RULES.activationRadius))this.activateWaypoint();
    return this._updateExits();
  }
  _updateExits(){
    const g=this.game;
    if(g.dungeon?.active||g.sceneKind==='dungeon'||g.sceneContent?.allows('worldContent')===false)return false;
    const p=playerFoot(g),portals=(g.regions?.portals||[]).filter(portal=>portalExitGeometry(portal));
    for(const id of this._edgeLatches){
      const portal=portals.find(candidate=>candidate.id===id);
      if(!portal||!portalEntranceContains(portal,p,g.player.r+24))this._edgeLatches.delete(id);
    }
    const portal=portals.find(candidate=>!this._edgeLatches.has(candidate.id)&&g.regions.canEnter(candidate));
    if(!portal)return false;
    const from=this.current.worldId;
    const started=g.sceneTransition?.run(`前往${portal.nextRegion.name}`,()=>
      this.enabled&&this.current.worldId===from&&g.regions.portals.includes(portal)&&g.enterPortal(portal.id))===true;
    if(started)this._edgeLatches.add(portal.id);
    return started;
  }
  activateWaypoint(id=this.waypoint?.id){
    const point=this.waypoint;
    if(!point||id!==point.id||!this._nearWaypoint(WAYPOINT_RULES.activationRadius))return false;
    if(this.activated.has(point.worldId))return true;
    this.discovered.add(point.worldId);this.activated.add(point.worldId);
    this.game._emit?.('worldWaypointActivated',{worldId:point.worldId,name:point.coreName});
    this._notify('waypoint-activated');return true;
  }
  getInteraction(){
    if(!this.enabled||this.game.status!=='playing'||!this._nearWaypoint(WAYPOINT_RULES.interactionRadius))return null;
    const point=this.waypoint,active=this.activated.has(point.worldId);
    return {id:point.id,type:'worldWaypoint',category:'worldTravel',label:active?'区域传送':'点亮传送点',
      description:active?'前往已经点亮的传送点':'靠近点亮 · 可以往返传送',...this._door(point),
      touchRadius:WAYPOINT_RULES.touchRadius,enabled:true};
  }
  interact(id){
    const choice=this.getInteraction();if(!choice||choice.id!==id)return false;
    if(!this.activateWaypoint(id))return false;
    this.game._emit?.('worldTravelOpen',{worldId:this.current.worldId});return true;
  }
  neighborIndices(worldId=this.game.worldId){
    if(!this.enabled)return [];
    return (this.config.connections||[]).flatMap(edge=>edge.from===worldId?[WORLD_IDS.indexOf(edge.to)]:edge.to===worldId?[WORLD_IDS.indexOf(edge.from)]:[]).filter(index=>index>=0);
  }
  portalTo(target,{back=false}={}){
    if(!this.enabled||!Number.isInteger(target)||!REGIONS[target])return null;
    const from=this.current.worldId,to=REGIONS[target].id;
    const connection=this.config.connections.find(edge=>edge.from===from&&edge.to===to||edge.from===to&&edge.to===from);
    const endpoint=connection?.endpoints?.[from];if(!endpoint)return null;
    const index=WORLD_IDS.indexOf(from),rules=getConfigSection('geography').portalRules;
    return {...endpoint,id:`portal:${index}:${target}`,natural:true,kind:'travel',worldConnection:true,
      name:endpoint.name||connection.name,r:32,touchRadius:42,interactRadius:rules.interactRadius,
      state:'active',direction:back?'back':'forward',connectionId:`${Math.min(index,target)}:${Math.max(index,target)}`,
      nextRegionIndex:target,nextRegion:REGIONS[target],targetPortalId:`portal:${target}:${index}`,
      discovered:back||this.discovered.has(to),rewardClaimed:true};
  }
  travelReason(worldId){
    const g=this.game;
    if(!this.enabled)return '当前玩法不能传送';
    if(!this.definitions.has(worldId))return '没有这处传送点';
    if(worldId===this.current.worldId)return '已在当前区域';
    if(!this.discovered.has(worldId))return '尚未到达该区域';
    if(!this.activated.has(worldId))return '尚未点亮传送点';
    if(g.status!=='playing'||g.dungeon?.active||g.sceneKind==='dungeon')return '请返回地表传送点';
    if(g.sceneTransition?.active&&!g.sceneTransition.committing)return '正在切换场景';
    if(g.superSkills?.pending||g.regions?.rewardPortal||g.regions?._rewardQueue?.length)return '请先领取当前奖励';
    if(!this.activated.has(this.current.worldId)||!this._nearWaypoint())return '请靠近已点亮的传送点';
    return '';
  }
  canTravel(worldId){return this.travelReason(worldId)==='';}
  getDestinations(){
    if(!this.enabled)return [];
    return [...this.definitions.values()].map(definition=>{
      const worldId=definition.worldId,regionIndex=WORLD_IDS.indexOf(worldId),reason=this.travelReason(worldId);
      return {worldId,regionIndex,name:REGIONS[regionIndex]?.name||definition.core.name,
        coreName:definition.core.name,coreKind:definition.core.kind,atlas:{...definition.atlas},
        discovered:this.discovered.has(worldId),activated:this.activated.has(worldId),current:worldId===this.current.worldId,
        canTravel:reason==='',reason};
    });
  }
  getAtlas(){
    return {regions:this.getDestinations(),connections:this.enabled?this.config.connections.map(edge=>({id:edge.id,from:edge.from,to:edge.to,name:edge.name,
      discovered:this.discovered.has(edge.from)||this.discovered.has(edge.to),connected:this.activated.has(edge.from)&&this.activated.has(edge.to)})):[],currentWorldId:this.game.worldId};
  }
  arrivalPoint(portal,r=this.game.player.r){
    if(!this.enabled||portal?.arrivalKind!=='waypoint')return null;
    const point=this.waypoint;if(!point||portal.targetWaypointId!==point.id)return null;
    const terrain=this.game.terrain;
    for(const offset of [86,110,140,175])for(const dx of [0,-55,55,-95,95]){
      const candidate={x:point.x+dx,y:point.y+offset};
      if(!this.safety.contains(candidate.x,candidate.y)||terrain.isFree(candidate.x,candidate.y,r+4)===false)continue;
      if(this.game.environment?.isHazardFree?.(candidate.x,candidate.y,r+4)===false)continue;
      return candidate;
    }
    return null;
  }
  spawnPoint(r=this.game.player.r){
    if(!this.enabled)return null;
    const spawn=this.current.core.spawn;
    if(spawn&&[spawn.x,spawn.y].every(Number.isFinite)&&this.safety.contains(spawn.x,spawn.y)&&
      this.game.terrain?.isFree(spawn.x,spawn.y,r+4)!==false&&this.game.environment?.isHazardFree?.(spawn.x,spawn.y,r+4)!==false)return {...spawn};
    return this.arrivalPoint({arrivalKind:'waypoint',targetWaypointId:this.waypoint.id},r);
  }
  requestTravel(worldId){
    if(this.pending||!this.canTravel(worldId))return false;
    const target=this.definitions.get(worldId),index=WORLD_IDS.indexOf(worldId);
    this.pending={worldId,fromWorldId:this.current.worldId,nextRegionIndex:index,arrivalKind:'waypoint',targetWaypointId:pointId(worldId)};
    const started=this.game.sceneTransition?.run(`前往${target.core.name}`,()=>this.commitPendingTravel())===true;
    if(!started)this.pending=null;
    return started;
  }
  commitPendingTravel(){
    const pending=this.pending;
    if(!pending||pending.fromWorldId!==this.game.worldId||!this.canTravel(pending.worldId)){this.pending=null;return false;}
    try{return this.game._switchRegion(pending)===true;}
    finally{this.pending=null;}
  }
  setRestAnchor(site){
    if(!this.enabled||!site||![site.x,site.y].every(Number.isFinite)||!this.safety.contains(site.x,site.y))return false;
    const anchor=this._resolveRestAnchor({worldId:this.current.worldId,facilityId:site.id});
    if(!anchor||distance(anchor,site)>1||this.game.terrain?.isFree(anchor.x,anchor.y,this.game.player.r+3)===false)return false;
    this.restAnchor={worldId:anchor.worldId,facilityId:anchor.facilityId};
    this._notify('rest-anchor');return true;
  }
  _resolveRestAnchor(anchor){
    const core=anchor&&this.definitions.get(anchor.worldId)?.core;
    const site=core?.facilities.find(site=>site.kind==='rest'&&`facility:${core.id}:${site.id}`===anchor.facilityId);
    if(!site||![site.x,site.y].every(Number.isFinite))return null;
    const point={x:site.x,y:site.y+30};
    return distance(point,core)<=core.radius?{worldId:anchor.worldId,...point,facilityId:anchor.facilityId}:null;
  }
  getRestAnchor(){return this._resolveRestAnchor(this.restAnchor);}
  serialize(){return {discovered:[...this.discovered],activated:[...this.activated],restAnchor:this.restAnchor?{...this.restAnchor}:null};}
  restore(data){
    if(!data||typeof data!=='object')return false;
    this.discovered=new Set((Array.isArray(data.discovered)?data.discovered:[]).filter(id=>this.definitions.has(id)));
    this.activated=new Set((Array.isArray(data.activated)?data.activated:[]).filter(id=>this.definitions.has(id)));
    for(const id of this.activated)this.discovered.add(id);
    const anchor=this._resolveRestAnchor(data.restAnchor);
    this.restAnchor=anchor?{worldId:anchor.worldId,facilityId:anchor.facilityId}:null;
    return true;
  }
}

export { WAYPOINT_RULES };
