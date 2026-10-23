import { getConfigSection } from './content-config.js';
import { mapIdentity, mapSeed } from './map-context.js';
import { settlementGuardType } from './encounter-definitions.js';
import { Terrain, groundOffset } from './terrain.js';
import { placementAllowed } from './placement-rules.js';
import { RELICS } from './relics.js';
import { OBJECTIVE_RULES, canStartObjective, majorFightActive } from './event-scheduling.js';
import { SETTLEMENT_RULES, ANGEL_RULES, SETTLEMENT_DEFINITIONS as SITE_DEFS, settlementType } from './site-definitions.js';
import { updateAngels } from './sites/angel-guardian.js';
import { enemyGroupProvoked } from './combat-tactics.js';
import { settlementInteraction, activateSettlement, getShopItems, buyShopItem } from './sites/settlement-content.js';
export { SETTLEMENT_RULES, ANGEL_RULES } from './site-definitions.js';
import { worldSettlementDefinition, WORLD_HUT_NAMES } from './world-sites.js';
import { worldFacilitySites } from './world-shops.js';
const economy=getConfigSection('economy'),guardRules=getConfigSection('sites').settlementGuards;

const TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export class Settlements {
  constructor(game,{generation=true}={}) {
    this.game=game;this.generation=!!generation&&!game.stage;this.sites=[];this.activeShop=null;
    this.resetRegion();
  }
  _foot(){const p=this.game.player;return {x:p.x,y:p.y+groundOffset(p,true)};}
  _hash(x,y=0){const seed=mapSeed(this.game);return hash(x+seed*137,y+seed*281);}
  _bodyCenter(site){return {x:site.x,y:site.y-(settlementType(site)?.bodyOffset===false?0:site.depth*.5)};}
  _obstacles(site) {
    if(settlementType(site)?.foundation===false)return [];
    // Overlapping horizontal capsules fill a rounded rectangular foundation.
    // The decorative roof never enlarges these foot-based collision bounds.
    const rows=Math.ceil(site.depth/32),r=Math.min(18,site.depth*.5,site.width*.5),halfLength=site.width*.5-r,result=[];
    for(let i=0;i<rows;i++)result.push({id:`${site.id}:wall:${i}`,type:'log',x:site.x,y:rows===1?site.y-site.depth*.5:site.y-r-i*(site.depth-r*2)/(rows-1),r,halfLength,angle:0,structureId:site.id,structureType:site.type,variant:'building-wall'});
    return result;
  }
  _setStructures(){this.game.terrain.setStructures?.(this.sites.flatMap(site=>this._obstacles(site)),'settlements');}
  _hazardFree(x,y,r=22,{checkPlacement=true}={}) {
    if(checkPlacement&&!placementAllowed(this.game,'structure',{x,y,r},{checkTerrain:false}))return false;
    const env=this.game.environment;if(!env)return true;
    if(env.isHazardFree?.(x,y,r)===false)return false;
    if(env.props?.some(o=>o.state!=='spent'&&Math.hypot(o.x-x,o.y-y)<(o.blastRadius||82)+r+12))return false;
    return true;
  }
  _validSite(site,{nearSpawn=false}={}) {
    const g=this.game,center=this._bodyCenter(site),clearance=site.width*.5+70;
    // Validate the entire foundation and usable front approach once. The
    // rounded collision grid below remains independent of the water query.
    if(!placementAllowed(g,'structure',{x:site.x,y:site.y+(58-site.depth)/2,width:site.width+94,height:site.depth+152},{checkTerrain:false}))return false;
    if(distance(center,this._foot())<clearance+(nearSpawn?40:190))return false;
    if(this.sites.some(s=>distance(center,this._bodyCenter(s))<clearance+s.width*.5+110))return false;
    if(g.adventure?.props.some(o=>distance(o,center)<clearance+35))return false;
    if(g.adventure?.treasure&&distance(g.adventure.treasure,center)<clearance+110)return false;
    if(g.companions?.camps?.some(camp=>distance(camp,center)<clearance+170))return false;
    if((g.regions?.portals||(g.portal?[g.portal]:[])).some(portal=>distance(portal,center)<clearance+90))return false;
    if(g.encounters?.activities?.some(active=>Number.isFinite(active.x)&&distance(active,center)<clearance+160))return false;
    // Check the actual broad footprint and its front approach instead of
    // demanding a huge empty circle, which is unsuitable for forest terrain.
    for(let x=site.x-site.width*.5-24;x<=site.x+site.width*.5+24;x+=24)
      for(let y=site.y-site.depth-24;y<=site.y+82;y+=24)
        if(!g.terrain.isFree(x,y,23)||!this._hazardFree(x,y,23,{checkPlacement:false}))return false;
    if(!g.terrain.isFree(site.door.x,site.door.y,30)||!this._hazardFree(site.door.x,site.door.y,40,{checkPlacement:false}))return false;
    if(nearSpawn) {
      // Debug placement reserves a direct, walkable approach without removing
      // terrain or moving the player. Check the new foundation as well as the
      // existing world, including the case where a door faces away from spawn.
      const from=this._foot(),to=site.door,r=g.player.r+6;
      if(g.terrain.firstBlocker(from.x,from.y,to.x,to.y,r)||new Terrain({obstacles:this._obstacles(site)}).firstBlocker(from.x,from.y,to.x,to.y,r))return false;
      if(!placementAllowed(g,'structure',{ax:from.x,ay:from.y,bx:to.x,by:to.y,r},{checkTerrain:false}))return false;
      const steps=Math.ceil(distance(from,to)/20);
      for(let i=0;i<=steps;i++)if(!this._hazardFree(from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps,r,{checkPlacement:false}))return false;
    }
    return true;
  }
  _createSite(def,index,{nearSpawn=false}={}) {
    const region=this.game.region?.id||'forest',seed=this._hash(index+83,17),rotation=mapSeed(this.game)===0?0:this._hash(71,23)*TAU;
    def=worldSettlementDefinition(region,def,this.game.terrain.island?.layout);
    const spawn=nearSpawn?this._foot():null,plan=!nearSpawn&&this.game.terrain.island?.plan?.[def.type];
    for(let i=0;i<(plan?33:nearSpawn?128:192);i++) {
      const ring=Math.floor(i/32),angle=(nearSpawn?-Math.PI/2:def.angle+rotation)+(i%32)*TAU/32,radius=nearSpawn?190+ring*40:def.radius+ring*100;
      const offset=i===0?0:Math.ceil(i/8)*20,localAngle=(i%8)*TAU/8;
      const x=plan?Math.round(plan.x+Math.cos(localAngle)*offset):Math.round((spawn?.x||0)+Math.cos(angle)*radius),y=plan?Math.round(plan.y+Math.sin(localAngle)*offset):Math.round((spawn?.y||0)+Math.sin(angle)*radius-(nearSpawn?30:0));
      const site={...def,id:`site:${mapIdentity(this.game)}:${def.type}`,x,y,sortY:y,door:{x,y:y+(settlementType(def)?.doorOffset??30)},interactRadius:SETTLEMENT_RULES.interactRadius,state:'ready',region,seed,guardIds:[],remainingGuards:0};
      if(!this._validSite(site,{nearSpawn}))continue;
      if(site.type==='supply')site.name=this.game.terrain.island?.layout?.artTheme==='ember'?def.name:WORLD_HUT_NAMES[region]||WORLD_HUT_NAMES[this.game.terrain.island?.layout?.artTheme]||WORLD_HUT_NAMES.forest;
      if(site.type==='merchant') {
        site.relicId=RELICS[Math.floor(this._hash(index+199,63)*RELICS.length)].id;
        site.stock={...economy.shop.stock};
      }
      return site;
    }
    return null;
  }
  resetRegion() {
    this.activeShop=null;this.sites=[];this.game.terrain.setStructures?.([],'settlements');
    if(!this.generation)return;
    this.sites.push(...worldFacilitySites(this.game));this._setStructures();
    // Only a debug run's initial region gives its existing castle first
    // placement; ordinary regions keep the usual site ordering.
    const castleIndex=SITE_DEFS.findIndex(def=>def.type==='castle');
    const nearbyCastle=this.game.debugOptions?.testFacilities&&['forest','rift-forest'].includes(this.game.region?.id)?this._createSite(SITE_DEFS[castleIndex],castleIndex,{nearSpawn:true}):null;
    if(nearbyCastle){this.sites.push(nearbyCastle);this._setStructures();}
    SITE_DEFS.forEach((def,index)=>{if(nearbyCastle&&def.type==='castle'||this.game.mode==='world'&&def.type==='merchant')return;const site=this._createSite(def,index);if(site){this.sites.push(site);this._setStructures();}});
    this.ensureAngels();
    // Starter monster angles are random and must not change site identities.
    // Resolve the rare overlap after placing the deterministic foundations.
    for(const enemy of this.game.enemies)if(enemy.hp>0)this.game._moveEntity?.(enemy,0,0);
  }
  _angelPoint(anchor) {
    const g=this.game;
    // A small, fixed ring beside the anchor keeps the safe haven recognizable
    // on return. It never follows the player or moves an existing building.
    for(const radius of [85,105,125,145])for(let i=0;i<16;i++) {
      const angle=i*TAU/16,x=anchor.x+Math.cos(angle)*radius,y=anchor.y+Math.sin(angle)*radius;
      if(!g.terrain.isFree(x,y,28)||!this._hazardFree(x,y,28))continue;
      if(g.terrain.firstBlocker(anchor.x,anchor.y,x,y,18))continue;
      if(this.sites.some(s=>s.type!=='angel'&&!(s.type==='merchant'&&s.state==='spent')&&distance({x,y},this._bodyCenter(s))<s.width*.5+48))continue;
      if(g.adventure?.props.some(o=>distance(o,{x,y})<65))continue;
      if(g.adventure?.treasure&&distance(g.adventure.treasure,{x,y})<90)continue;
      return {x,y};
    }
    return null;
  }
  ensureAngels() {
    // Restored world snapshots may still contain the old gate guardians.
    // Remove only portal-anchored angels; the original spawn haven persists.
    for(let i=this.sites.length-1;i>=0;i--){const site=this.sites[i];if(site.type==='angel'&&(site.anchorId?.startsWith('portal:')||site.id?.startsWith('angel:portal:')))this.sites.splice(i,1);}
    const g=this.game;if(!this.generation||g.stage||g.dungeon?.active)return;
    const spawn=['forest','rift-forest'].includes(g.region?.id)||!!g.terrain.island?.layout?.worldId;
    const riftSpawn=g.terrain.island?.layout?.kind==='rift-forest'?g.terrain.island.layout.landmarks?.spawn:null;
    const anchors=spawn?[{id:`spawn:${mapIdentity(g)}`,x:riftSpawn?.x??0,y:riftSpawn?.y??19.8}]:[];
    for(const anchor of anchors) {
      const id=`angel:${anchor.id}`;if(this.sites.some(s=>s.id===id))continue;
      const point=this._angelPoint(anchor);if(!point)continue;
      this.sites.push({id,type:'angel',name:'守望天使',...point,sortY:point.y,door:{...point},width:40,depth:20,r:15,interactRadius:0,state:'ready',flying:true,anchorId:anchor.id,guardRadius:ANGEL_RULES.guardRadius,auraRadius:ANGEL_RULES.guardRadius,attackRange:ANGEL_RULES.guardRadius,region:g.region?.id||'forest',seed:this._hash(point.x,point.y),_attack:0,healing:false});
    }
  }
  isSafePoint(x,y,r=0) {
    // Purely consult the existing region list: no generation or recursive
    // calls into hazard/objective placement are allowed from this predicate.
    if(this.game.dungeon?.active)return true;
    return this.sites.every(site=>{
      if(site.type==='merchant'&&site.state==='spent')return true;
      const center=this._bodyCenter(site);
      return Math.hypot(center.x-x,center.y-y)>site.width*.5+r+70;
    });
  }
  getInteraction() {
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active)return null;
    const p=this._foot();let nearest=null,best=Infinity;
    for(const site of this.sites) {
      if(site.type==='angel')continue;
      const d=distance(p,site.door);if(d>site.interactRadius||d>=best)continue;
      if(site.state==='spent'&&site.type==='merchant')continue;
      const {label,description,enabled}=settlementInteraction(site);
      const type=site.worldFacility?(site.worldFacility==='rest'?'worldRest':'worldShop'):site.type;
      nearest={id:site.id,siteId:site.id,type,label,description,x:site.door.x,y:site.door.y,enabled,...(site.worldFacility?{touchRadius:32}:{})};best=d;
    }
    return nearest;
  }
  interact(id) {
    const current=this.getInteraction();if(!current||current.id!==id||!current.enabled)return false;
    const site=this.sites.find(s=>s.id===id);
    return activateSettlement(this,site);
  }
  getShopItems() {return getShopItems(this);}
  buy(id) {return buyShopItem(this,id);}
  closeShop() {
    if(this.game.status!=='shop'||!this.activeShop)return false;
    this.activeShop=null;this.game.status='playing';this.game._emit('shopClose');return true;
  }
  _guardPoints(site) {
    const points=[];
    for(let i=0;i<24&&points.length<SETTLEMENT_RULES.guards;i++) {
      const a=.15+(i%12)*Math.PI/12,radius=90+Math.floor(i/12)*55,x=site.x+Math.cos(a)*radius,y=site.y+Math.sin(a)*radius+35;
      if(this.game.terrain.isFree(x,y,34)&&this._hazardFree(x,y,30)&&points.every(p=>Math.hypot(x-p.x,y-p.y)>58))points.push({x,y});
    }
    return points;
  }
  _startGuards(site) {
    const g=this.game;if(site.state!=='ready'||g.enemies.length+SETTLEMENT_RULES.guards>180||!canStartObjective(g,{skipSite:site}))return false;
    const points=this._guardPoints(site);if(points.length!==SETTLEMENT_RULES.guards)return false;
    site.state='active';site._remaining=new Set();site.guardIds=[];
    for(let i=0;i<points.length;i++) {
      const enemy=g._spawnEnemy(settlementGuardType(i),1);enemy.settlementId=site.id;enemy.guardianId=site.id;enemy.eventRole='settlementGuard';enemy.xp=i===0?guardRules.leaderXp:guardRules.guardXp;
      enemy.hp*=i===0?guardRules.leaderHp:guardRules.guardHp;enemy.maxHp=enemy.hp;enemy.guardActive=true;enemy.settlementHome={...points[i]};
      enemy.x=points[i].x;enemy.y=points[i].y-groundOffset(enemy);g._moveEntity(enemy,0,0);
      site.guardIds.push(enemy.id);site._remaining.add(enemy.id);
    }
    site.remainingGuards=site._remaining.size;g._emit('houseGuard',{name:site.name});return true;
  }
  onEnemyKilled(enemy) {
    if(enemy.hp>0||!enemy.settlementId)return false;
    const site=this.sites.find(s=>s.id===enemy.settlementId);
    if(!site||site.state!=='active'||!site._remaining?.delete(enemy.id))return false;
    site.remainingGuards=site._remaining.size;
    if(!site.remainingGuards){site.state='cleared';this.game._emit('houseCleared',{name:site.name});this.game._effect(site.door.x,site.door.y,'ring',.75,75,'#f2d28d');}
    return true;
  }
  _updateAngels(dt,p) {updateAngels(this,dt,p);}
  update(dt) {
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active)return;
    this.ensureAngels();
    const p=this._foot(),majorFight=majorFightActive(g);
    this._updateAngels(dt,p);
    for(const site of this.sites)if(site.state==='active')for(const enemy of g.enemies) {
      if(enemy.hp<=0||enemy.settlementId!==site.id)continue;
      const foot={x:enemy.x,y:enemy.y+groundOffset(enemy)},near=enemyGroupProvoked(g,enemy,site.door,OBJECTIVE_RULES.houseEngage)||!majorFight&&distance(p,site.door)<OBJECTIVE_RULES.houseEngage&&distance(foot,site.door)<OBJECTIVE_RULES.houseEngage;
      enemy.guardActive=near;enemy.guardReturnTarget=!near&&distance(foot,enemy.settlementHome)>12?enemy.settlementHome:null;
    }
  }
}
