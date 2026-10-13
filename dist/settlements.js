import { Terrain, groundOffset } from './terrain.js';
import { placementAllowed } from './placement-rules.js';
import { portalDoor } from './portal-geometry.js';
import { RELICS } from './relics.js';
import { OBJECTIVE_RULES, canStartObjective, majorFightActive } from './event-scheduling.js';
import { friendlyTargets, friendlyFoot, isFriendlyActive } from './friendly-combat.js';
import { worldSettlementDefinition, WORLD_HUT_NAMES } from './world-sites.js';

const TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const WARD=18;
export const SETTLEMENT_RULES=Object.freeze({maxSites:7,interactRadius:82,ward:WARD,guards:4});
const ANGEL_GUARD_RADIUS=150;
export const ANGEL_RULES=Object.freeze({guardRadius:ANGEL_GUARD_RADIUS,auraRadius:ANGEL_GUARD_RADIUS,attackRange:ANGEL_GUARD_RADIUS,healingPerSecond:.03,strikeRadius:60,attackInterval:.1,damage:115});
const SITE_DEFS=Object.freeze([
  {type:'merchant',name:'荒野游商',width:42,depth:24,radius:410,angle:.12},
  {type:'supply',name:'林间小屋',width:54,depth:28,radius:610,angle:2.2},
  {type:'occupied',name:'被占据的小屋',width:58,depth:30,radius:970,angle:3.1},
  {type:'castle',name:'古堡入口',width:240,depth:90,radius:1180,angle:5.65}
]);

export class Settlements {
  constructor(game,{generation=true}={}) {
    this.game=game;this.generation=!!generation;this.sites=[];this.activeShop=null;
    this.resetRegion();
  }
  _foot(){const p=this.game.player;return {x:p.x,y:p.y+groundOffset(p,true)};}
  _hash(x,y=0){return hash(x+(this.game.regionIndex||0)*137,y+(this.game.regionIndex||0)*281);}
  _bodyCenter(site){return {x:site.x,y:site.y-(site.type==='merchant'?0:site.depth*.5)};}
  _obstacles(site) {
    if(site.type==='angel'||site.type==='merchant')return [];
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
    const region=this.game.region?.id||'forest',seed=this._hash(index+83,17),rotation=(this.game.regionIndex||0)===0?0:this._hash(71,23)*TAU;
    def=worldSettlementDefinition(region,def);
    const spawn=nearSpawn?this._foot():null,plan=!nearSpawn&&this.game.terrain.island?.plan?.[def.type];
    for(let i=0;i<(plan?33:nearSpawn?128:192);i++) {
      const ring=Math.floor(i/32),angle=(nearSpawn?-Math.PI/2:def.angle+rotation)+(i%32)*TAU/32,radius=nearSpawn?190+ring*40:def.radius+ring*100;
      const offset=i===0?0:Math.ceil(i/8)*20,localAngle=(i%8)*TAU/8;
      const x=plan?Math.round(plan.x+Math.cos(localAngle)*offset):Math.round((spawn?.x||0)+Math.cos(angle)*radius),y=plan?Math.round(plan.y+Math.sin(localAngle)*offset):Math.round((spawn?.y||0)+Math.sin(angle)*radius-(nearSpawn?30:0));
      const site={...def,id:`site:${this.game.regionIndex||0}:${def.type}`,x,y,sortY:y,door:{x,y:y+(def.type==='merchant'?0:30)},interactRadius:SETTLEMENT_RULES.interactRadius,state:'ready',region,seed,guardIds:[],remainingGuards:0};
      if(!this._validSite(site,{nearSpawn}))continue;
      if(site.type==='supply')site.name=WORLD_HUT_NAMES[region]||WORLD_HUT_NAMES.forest;
      if(site.type==='merchant') {
        site.relicId=RELICS[Math.floor(this._hash(index+199,63)*RELICS.length)].id;
        site.stock={heal:1,magnet:1,fury:1,shield:1,relic:1};
      }
      return site;
    }
    return null;
  }
  resetRegion() {
    this.activeShop=null;this.sites=[];this.game.terrain.setStructures?.([],'settlements');
    if(!this.generation)return;
    // Only a debug run's initial region gives its existing castle first
    // placement; ordinary regions keep the usual site ordering.
    const castleIndex=SITE_DEFS.findIndex(def=>def.type==='castle');
    const nearbyCastle=this.game.debug&&this.game.regionIndex===0?this._createSite(SITE_DEFS[castleIndex],castleIndex,{nearSpawn:true}):null;
    if(nearbyCastle){this.sites.push(nearbyCastle);this._setStructures();}
    SITE_DEFS.forEach((def,index)=>{if(nearbyCastle&&def.type==='castle')return;const site=this._createSite(def,index);if(site){this.sites.push(site);this._setStructures();}});
    this.ensureAngels();
    // Starter monster angles are random and must not change site identities.
    // Resolve the rare overlap after placing the deterministic foundations.
    for(const enemy of this.game.enemies)if(enemy.hp>0)this.game._moveEntity?.(enemy,0,0);
  }
  _angelPoint(anchor) {
    const g=this.game,approach=Number.isInteger(anchor.nextRegionIndex)||anchor.id?.startsWith('portal:')?portalDoor(anchor):anchor;
    // A small, fixed ring beside the anchor keeps the safe haven recognizable
    // on return. It never follows the player or moves an existing building.
    for(const radius of [85,105,125,145])for(let i=0;i<16;i++) {
      const angle=i*TAU/16,x=anchor.x+Math.cos(angle)*radius,y=anchor.y+Math.sin(angle)*radius;
      if(!g.terrain.isFree(x,y,28)||!this._hazardFree(x,y,28))continue;
      if(g.terrain.firstBlocker(approach.x,approach.y,x,y,18))continue;
      if(this.sites.some(s=>s.type!=='angel'&&!(s.type==='merchant'&&s.state==='spent')&&distance({x,y},this._bodyCenter(s))<s.width*.5+48))continue;
      if(g.adventure?.props.some(o=>distance(o,{x,y})<65))continue;
      if(g.adventure?.treasure&&distance(g.adventure.treasure,{x,y})<90)continue;
      return {x,y};
    }
    return null;
  }
  ensureAngels() {
    const g=this.game;if(!this.generation||g.dungeon?.active)return;
    const anchors=(g.regionIndex||0)===0?[{id:'spawn:0',x:0,y:19.8}]:[];
    for(const portal of g.regions?.portals||[])if(portal.state==='active'&&Number.isFinite(portal.x)&&Number.isFinite(portal.y))anchors.push(portal);
    if(g.portal?.state==='active'&&!anchors.some(a=>a.id===g.portal.id))anchors.push(g.portal);
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
      let label='',description='',enabled=true;
      if(site.type==='merchant'){label='与商人交易';description='购买一件补给或遗物后，游商将离开';}
      else if(site.type==='supply'||site.type==='occupied'||site.type==='castle') {
        const visited=site.explored||site.state==='spent';
        if(site.type==='castle'){label=site.featureId?`${visited?'重返':'进入'}${site.name}`:visited?'重返已探索古堡':'进入古堡迷宫';description=visited?'宝藏已领取，不会重复刷新':'有限迷宫 · 击败最终首领获取超级技能';}
        else if(site.type==='supply'){label=`${visited?'重返':'进入'}${site.name}`;description=visited?'补给已领取，可随时进出':'进入屋内搜寻补给箱';}
        else {label=site.featureId?`${visited?'重返':'进入'}${site.name}`:visited?'重返清理过的小屋':'进入被占据的小屋';description=visited?'宝藏已领取，可随时进出':site.state==='cleared'?'守卫已清除，屋内宝箱等待领取':'清理屋内守卫，搜寻宝箱';}
      }
      nearest={id:site.id,siteId:site.id,type:site.type,label,description,x:site.door.x,y:site.door.y,enabled};best=d;
    }
    return nearest;
  }
  interact(id) {
    const current=this.getInteraction();if(!current||current.id!==id||!current.enabled)return false;
    const site=this.sites.find(s=>s.id===id),g=this.game;
    if(site.type==='castle'||site.type==='supply'||site.type==='occupied')return !!g.dungeon?.enter(site);
    if(site.type==='merchant'){this.activeShop=site;g.status='shop';g._emit('shopOpen',{name:site.name});return true;}
    return false;
  }
  getShopItems() {
    const g=this.game,site=this.activeShop;if(!site||g.status!=='shop')return [];
    const relic=RELICS.find(r=>r.id===site.relicId),ward=g.relics?.wardAmount??g.relics?.wardValue??0;
    const items=[
      {id:'heal',name:'旅人药剂',desc:'立即恢复 35 点生命',icon:'✚',color:'#b9dda5',price:12,usable:g.player.hp<g.player.maxHp,reason:'生命已满'},
      {id:'magnet',name:'磁引符',desc:'拾取范围扩大，持续 8 秒',icon:'◉',color:'#a8dcec',price:8,usable:!!g.adventure&&g.adventure.magnetTime<8,reason:'效果已生效'},
      {id:'fury',name:'狂暴药剂',desc:'伤害与射速提升，持续 8 秒',icon:'✦',color:'#efb46b',price:8,usable:!!g.adventure&&g.adventure.furyTime<8,reason:'效果已生效'},
      {id:'shield',name:'守护符',desc:'抵消下一次受击的至多 18 点伤害',icon:'⬡',color:'#d2dbae',price:16,usable:!!g.relics&&ward<WARD,reason:'护盾已充盈'}
    ];
    if(relic)items.push({id:'relic',name:relic.name,desc:relic.desc,icon:relic.icon,color:relic.color,price:60,usable:!!g.relics&&!g.relics.has(relic.id),reason:'已拥有该遗物',relicId:relic.id,rarity:'遗物'});
    return items.map(item=>{const stock=site.stock[item.id]||0,reason=!stock?'已售罄':!item.usable?item.reason:g.gold<item.price?'金币不足':'';return {...item,stock,available:!reason,reason};});
  }
  buy(id) {
    const g=this.game,site=this.activeShop,item=this.getShopItems().find(i=>i.id===id);
    if(!site||!item?.available||!Number.isFinite(g.gold)||g.gold<item.price)return false;
    if(id==='heal'){
      const healed=Math.min(35,g.player.maxHp-g.player.hp);if(!(healed>0))return false;
      g.player.hp+=healed;g._effect(g.player.x,g.player.y-28,'heal',.8,0,'#b9dda5',`+${Math.ceil(healed)}`);
    } else if(id==='magnet'){g.adventure.magnetTime=8;for(const gem of g.gems)if(Math.hypot(gem.x-g.player.x,gem.y-g.player.y)<480)gem.attracted=true;}
    else if(id==='fury')g.adventure.furyTime=8;
    else if(id==='shield'){if(!g.relics.grantWard(WARD))return false;}
    else if(id==='relic'){if(!g.relics.acquire(item.relicId))return false;}
    else return false;
    // Stock and payment commit together, after all rejection checks.
    site.stock[id]--;g.gold-=item.price;site.state='spent';
    g._emit('shopBought',{itemId:id,name:item.name,price:item.price});
    this.closeShop();g._emit('merchantDeparted',{itemId:id,name:item.name});return true;
  }
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
      const enemy=g._spawnEnemy(i===0?'brute':'beetle',1);enemy.settlementId=site.id;enemy.guardianId=site.id;enemy.eventRole='settlementGuard';enemy.xp=i===0?8:4;
      enemy.hp*=i===0?1.6:1.25;enemy.maxHp=enemy.hp;enemy.guardActive=true;enemy.settlementHome={...points[i]};
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
  _updateAngels(dt,p) {
    const g=this.game,healing=new Set(),targets=friendlyTargets(g);
    for(const site of this.sites)if(site.type==='angel') {
      site.castFace=Math.max(0,(site.castFace||0)-dt);
      site.healing=false;
      for(const ally of targets){
        if(!isFriendlyActive(g,ally)||ally.hp>=ally.maxHp)continue;
        const point=friendlyFoot(ally);
        if(distance(point,site)<=ANGEL_RULES.guardRadius&&!g.terrain.firstBlocker(site.x,site.y,point.x,point.y,0,'projectile')){
          healing.add(ally);site.healing=true;
        }
      }
      site._attack=Math.max(0,(site._attack||0)-dt);
      if(site._attack>1e-8||!g._inView(site,ANGEL_RULES.guardRadius))continue;
      const canHit=enemy=>enemy.hp>0&&!enemy.trainingDummy&&!enemy.dungeonId&&!(enemy.rescueSpawnGrace>0)&&enemy.guardActive!==false&&g._inView(enemy)&&
        Math.hypot(enemy.x-site.x,enemy.y+groundOffset(enemy)-site.y)<=ANGEL_RULES.guardRadius;
      let target=null,nearest=Infinity;
      for(const enemy of g.enemies)if(canHit(enemy)){const d=Math.hypot(enemy.x-site.x,enemy.y+groundOffset(enemy)-site.y);if(d<nearest){target=enemy;nearest=d;}}
      if(!target)continue;
      site._attack=ANGEL_RULES.attackInterval;
      site.castFace=.25;
      const impact={x:target.x,y:target.y+groundOffset(target)},origin={x:site.x,y:site.y-19.8,groundY:site.y};
      const damage=ANGEL_RULES.damage*(1+Math.min(3,g.regions?.unlockedConnections?.size||0)*.15+Math.max(0,(g.region?.danger||1)-1));
      for(const enemy of g.enemies)if(canHit(enemy)&&Math.hypot(enemy.x-impact.x,enemy.y+groundOffset(enemy)-impact.y)<=ANGEL_RULES.strikeRadius)
        g._hurtEnemy(enemy,damage,0,origin,'angel');
      // A long sky strike with a short lifetime: ten casts/second show at most
      // two live main bolts per guardian, without a global flash or shake.
      g._effect(impact.x,impact.y,'angelStrike',.18,ANGEL_RULES.strikeRadius,'#f4edc0',undefined,{sourceX:site.x,sourceY:site.y,angelId:site.id});
    }
    // Overlapping havens never multiply healing; the aura stops at its real
    // world-space boundary and heals no one through a building foundation.
    if(dt>0)for(const ally of healing)if(isFriendlyActive(g,ally))
      ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*ANGEL_RULES.healingPerSecond*dt);
  }
  update(dt) {
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active)return;
    this.ensureAngels();
    const p=this._foot(),majorFight=majorFightActive(g);
    this._updateAngels(dt,p);
    for(const site of this.sites)if(site.state==='active')for(const enemy of g.enemies) {
      if(enemy.hp<=0||enemy.settlementId!==site.id)continue;
      const foot={x:enemy.x,y:enemy.y+groundOffset(enemy)},near=!majorFight&&distance(p,site.door)<OBJECTIVE_RULES.houseEngage&&distance(foot,site.door)<OBJECTIVE_RULES.houseEngage;
      enemy.guardActive=near;enemy.guardReturnTarget=!near&&distance(foot,enemy.settlementHome)>12?enemy.settlementHome:null;
    }
  }
}
