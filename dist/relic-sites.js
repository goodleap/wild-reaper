import { groundOffset } from './terrain.js';
import { canStartObjective } from './event-scheduling.js';

const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
export const RELIC_SITE_RULES=Object.freeze({huntGuards:24,rescueGuards:9,interactRadius:82});
export const RESCUE_BUILDING=Object.freeze({halfWidth:63,back:-46,front:61,doorHalfWidth:34,wallRadius:8});

// The site is the durable world object; the encounter/camp is only its battle.
// Region snapshots retain these instances, their defenders and progress.
export class RelicSites {
  constructor(game,{generation=true}={}) {
    this.game=game;this.generation=!!generation;this.sites=[];
    this._setStructures();
    if(this.generation)this._generate();
    this._setStructures();
  }
  _foot(){const p=this.game.player;return {x:p.x,y:p.y+groundOffset(p,true)};}
  _obstacles(site) {
    if(site.type!=='rescue')return [];
    const b=RESCUE_BUILDING,segments=[['back',-b.halfWidth,b.back,b.halfWidth,b.back],['left',-b.halfWidth,b.back,-b.halfWidth,b.front],['right',b.halfWidth,b.back,b.halfWidth,b.front],['frontLeft',-b.halfWidth,b.front,-b.doorHalfWidth,b.front],['frontRight',b.doorHalfWidth,b.front,b.halfWidth,b.front]];
    if(!site.gateOpen)segments.push(['gate',-b.doorHalfWidth,b.front,b.doorHalfWidth,b.front]);
    return segments.map(([part,ax,ay,bx,by])=>({id:`${site.id}:collision:${part}`,type:'log',x:site.x+(ax+bx)/2,y:site.y+(ay+by)/2,halfLength:Math.hypot(bx-ax,by-ay)/2,angle:Math.atan2(by-ay,bx-ax),r:b.wallRadius,structureId:site.id,structureType:'rescue',relicSiteId:site.id,variant:'rescue-wall',visual:false}));
  }
  _setStructures(){this.game.terrain.setStructures?.(this.sites.flatMap(site=>this._obstacles(site)),'relic');}
  openGate(siteId) {
    const site=this.sites.find(s=>s.id===siteId&&s.type==='rescue');if(!site)return false;
    site.gateOpen=true;this._setStructures();return true;
  }
  insideRescue(siteId,point,r=0) {
    const site=this.sites.find(s=>s.id===siteId&&s.type==='rescue');if(!site?.gateOpen)return false;
    const b=RESCUE_BUILDING;
    return Math.abs(point.x-site.x)<=b.halfWidth-b.wallRadius-r&&point.y>=site.y+b.back+b.wallRadius+r&&point.y<=site.y+b.front-b.wallRadius-r;
  }
  _valid(site) {
    const g=this.game,clearance=site.type==='hunt'?245:site.type==='rescue'?135:100;
    if(!g.terrain.isFree(site.x,site.y,clearance))return false;
    if(g.settlements?.isSafePoint(site.x,site.y,clearance)===false)return false;
    if(this.sites.some(other=>distance(site,other)<clearance+other.r+130))return false;
    const portals=g.regions?.portals||g.regionWorld?.portals||(g.portal?[g.portal]:[]);
    if(portals.some(portal=>distance(site,portal)<clearance+210))return false;
    if(g.adventure?.props.some(prop=>distance(site,prop)<clearance+(prop.r||18)))return false;
    if(g.adventure?.treasure&&distance(site,g.adventure.treasure)<clearance+110)return false;
    // Reserve the complete ground platform, including its stone rim, against
    // existing pools. A dry center alone can still leave actors submerged on
    // the platform edge. Existing water is never removed to fit a building.
    const footprint=site.r+30;
    if(g.environment?.muds?.some(mud=>mud.rx>0&&mud.ry>0&&((site.x-mud.x)/(mud.rx+footprint))**2+((site.y-mud.y)/(mud.ry+footprint))**2<=1))return false;
    if(g.environment?.isHazardFree?.(site.x,site.y,site.type==='hunt'?70:105)===false)return false;
    if(site.type==='rescue'&&g.environment?.props.some(o=>o.state!=='spent'&&distance(o,site)<(o.blastRadius||82)+113))return false;
    return g.terrain.isFree(site.door.x,site.door.y,30);
  }
  _generate() {
    const g=this.game,regionIndex=g.regionIndex||0,rotation=hash(regionIndex+71,23)*TAU;
    const types=['hunt','rescue'];if(g.region?.id==='ruins'&&g.environment?.mechanisms)types.push('rune');
    for(const [index,type] of types.entries()) {
      if(type==='hunt'&&g._features?.encounters===false)continue;
      if(type==='rescue'&&g._features?.companions===false)continue;
      for(let i=0;i<384;i++) {
        const angle=rotation+index*2.3+(i%32)*TAU/32,radius=530+Math.floor(i/32)*100;
        const x=Math.round(Math.cos(angle)*radius),y=Math.round(Math.sin(angle)*radius);
        const hunt=type==='hunt',rune=type==='rune';
        const site={id:`relic-site:${regionIndex}:${type}`,category:'relic',type,name:hunt?'林间狩猎':rune?'遗迹符文阵':'囚牢遗迹',x,y,r:hunt?210:rune?72:105,width:hunt?420:rune?96:128,depth:hunt?420:rune?82:66,sortY:y,door:{x,y:y+(hunt?190:rune?45:84)},interactRadius:RELIC_SITE_RULES.interactRadius,state:'ready',gateOpen:false,progress:0,goal:hunt?RELIC_SITE_RULES.huntGuards:rune?12:RELIC_SITE_RULES.rescueGuards,kind:regionIndex%2===0?'stormcaller':'warden',discovered:false,regionIndex,seed:hash(regionIndex+131,index+41)};
        if(this._valid(site)){
          if(rune)site.mechanism={id:`${site.id}:support`,siteId:site.id,type:'rune',x,y,r:48,state:'idle',charge:0,remaining:0,maxRemaining:12};
          this.sites.push(site);break;
        }
      }
    }
  }
  isSafePoint(x,y,r=0) {
    if(this.game.dungeon?.active)return true;
    return this.sites.every(site=>Math.hypot(x-site.x,y-site.y)>site.r+r+45);
  }
  getInteraction() {
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active)return null;
    const p=this._foot();let nearest=null,best=Infinity;
    for(const site of this.sites) {
      const d=distance(p,site.door);if(d>site.interactRadius||d>=best)continue;
      let enabled=site.state==='ready',label='',description='';
      if(site.state==='cleared'){label='遗迹已完成';description=site.type==='rune'?'符文能量已耗尽，石台保留':'建筑与通路保留，宝藏不再刷新';}
      else if(site.state==='failed'){label='遗迹挑战已结束';description='守卫已散去，遗迹留在原地';}
      else if(site.state==='active') {
        const camp=site.type==='rescue'&&g.companions?.camp;
        label=site.type==='hunt'?`狩猎守卫 ${site.progress}/${site.goal}`:site.type==='rune'?`符文支援 ${Math.ceil(site.mechanism.remaining)} 秒`:camp?.siteId===site.id&&camp.state==='ready'?'靠近伙伴完成解救':`囚牢守卫 ${site.progress}/${site.goal}`;
        description=site.type==='rune'?'符文正在自动轰击附近怪物':'离开后进度保留，返回可继续挑战';
      } else if(site.type==='hunt') {label='挑战狩猎遗迹';description='击败 24 名遗迹守卫 · 72 灵晶 / 18 金币';}
      else if(site.type==='rune') {label='激活遗迹符文阵';description='一次性 12 秒符文支援 · 自动攻击附近怪物';}
      else {label='挑战囚牢守卫';description='击败 9 名强化守卫，解救伙伴并提升援助之力';}
      if(enabled&&site.type!=='rune') {
        const busy=site.type==='hunt'?!!g.encounters?.active:!!g.companions?.camp||!!g.companions?.active;
        if(busy||!canStartObjective(g)){enabled=false;description=busy?'先完成当前挑战或等待同行伙伴离开':'附近战斗尚未结束，稍后再开启遗迹';}
      }
      nearest={id:site.id,siteId:site.id,type:'relic',relicType:site.type,category:'relic',label,description,x:site.door.x,y:site.door.y,enabled};best=d;
    }
    return nearest;
  }
  interact(id) {
    const current=this.getInteraction();if(!current||current.id!==id||!current.enabled)return false;
    const site=this.sites.find(s=>s.id===id),g=this.game;
    if(site.type==='rune') {
      if(!g.environment?.mechanisms.activateRune(site.mechanism))return false;
      site.state='active';site.discovered=true;return true;
    }
    const battle=site.type==='hunt'?g.encounters?.spawn('hunt',site.x,site.y,{siteId:site.id}):g.companions?.spawn(site.kind,site.x,site.y,{siteId:site.id});
    if(!battle)return false;
    site.state='active';site.discovered=true;site.battleId=battle.id;site.progress=0;
    g._emit('relicSiteStarted',{siteId:site.id,relicType:site.type,name:site.name});return true;
  }
  complete(siteId,success) {
    if(!siteId)return false;
    const site=this.sites.find(s=>s.id===siteId);if(!site||site.state!=='active')return false;
    site.state=success?'cleared':'failed';if(success)site.progress=site.goal;
    if(site.type==='rescue')this.openGate(site.id);
    return true;
  }
  update(dt=0) {
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active)return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    for(const site of this.sites)if(site.type==='rune'&&site.state==='active') {
      g.environment?.mechanisms._rune(site.mechanism,dt);
      site.progress=site.goal-site.mechanism.remaining;
      if(site.mechanism.state==='spent')this.complete(site.id,true);
      if(g.status!=='playing')break;
    }
  }
}
