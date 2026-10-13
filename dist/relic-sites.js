import { groundOffset } from './terrain.js';
import { placementAllowed } from './placement-rules.js';
import { advanceRelicActivation } from './relic-activation.js';
import { relicInteraction, activateRelicSite, updateRelicContent } from './sites/relic-content.js';
import { RELIC_SITE_RULES, ARMY_SITE_RULES, RESCUE_BUILDING, relicSiteProfile, relicSiteEntries, relicSiteEnabled, createRelicMechanism } from './site-definitions.js';

const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
export { RELIC_SITE_RULES, ARMY_SITE_RULES, RESCUE_BUILDING } from './site-definitions.js';

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
    if(!relicSiteProfile(site).gated)return [];
    const b=RESCUE_BUILDING,segments=[['back',-b.halfWidth,b.back,b.halfWidth,b.back],['left',-b.halfWidth,b.back,-b.halfWidth,b.front],['right',b.halfWidth,b.back,b.halfWidth,b.front],['frontLeft',-b.halfWidth,b.front,-b.doorHalfWidth,b.front],['frontRight',b.doorHalfWidth,b.front,b.halfWidth,b.front]];
    if(!site.gateOpen&&site.type!=='stonevault')segments.push(['gate',-b.doorHalfWidth,b.front,b.doorHalfWidth,b.front]);
    const walls=segments.map(([part,ax,ay,bx,by])=>({id:`${site.id}:collision:${part}`,type:'log',x:site.x+(ax+bx)/2,y:site.y+(ay+by)/2,halfLength:Math.hypot(bx-ax,by-ay)/2,angle:Math.atan2(by-ay,bx-ax),r:b.wallRadius,structureId:site.id,structureType:'rescue',relicSiteId:site.id,variant:'rescue-wall',visual:false}));
    if(site.type==='stonevault'&&!site.gateOpen)walls.push({id:`${site.id}:collision:stonegate`,type:'rock',x:site.x,y:site.y+b.front,r:37,structureId:site.id,structureType:'stonevault',relicSiteId:site.id,variant:'companion-stonegate',visual:false});
    return walls;
  }
  _setStructures(){this.game.terrain.setStructures?.(this.sites.flatMap(site=>this._obstacles(site)),'relic');}
  openGate(siteId) {
    const site=this.sites.find(s=>s.id===siteId&&(s.type==='rescue'||s.type==='stonevault'));if(!site)return false;
    site.gateOpen=true;this._setStructures();return true;
  }
  insideRescue(siteId,point,r=0) {
    const site=this.sites.find(s=>s.id===siteId&&(s.type==='rescue'||s.type==='stonevault'));if(!site?.gateOpen)return false;
    if(site.appearance==='golemaltar')return distance(point,site)<=60-r*.25;
    const b=RESCUE_BUILDING;
    return Math.abs(point.x-site.x)<=b.halfWidth-b.wallRadius-r&&point.y>=site.y+b.back+b.wallRadius+r&&point.y<=site.y+b.front-b.wallRadius-r;
  }
  _valid(site) {
    const g=this.game,profile=relicSiteProfile(site),clearance=profile.clearance;
    // A dry center is insufficient: include the stone rim and the front door.
    if(!placementAllowed(g,'structure',{x:site.x,y:site.y,r:Math.max(clearance,site.r+30)}))return false;
    if(!placementAllowed(g,'structure',{x:site.door.x,y:site.door.y,r:30}))return false;
    if(g.settlements?.isSafePoint(site.x,site.y,clearance)===false)return false;
    if(this.sites.some(other=>distance(site,other)<clearance+other.r+130))return false;
    const portals=g.regions?.portals||g.regionWorld?.portals||(g.portal?[g.portal]:[]);
    if(portals.some(portal=>distance(site,portal)<clearance+210))return false;
    if(g.adventure?.props.some(prop=>distance(site,prop)<clearance+(prop.r||18)))return false;
    if(g.adventure?.treasure&&distance(site,g.adventure.treasure)<clearance+110)return false;
    if(g.environment?.isHazardFree?.(site.x,site.y,profile.hazardRadius)===false)return false;
    if(site.type==='rescue'&&g.environment?.props.some(o=>o.state!=='spent'&&distance(o,site)<(o.blastRadius||82)+113))return false;
    return true;
  }
  _generate() {
    const g=this.game,regionIndex=g.regionIndex||0,rotation=hash(regionIndex+71,23)*TAU;
    const entries=relicSiteEntries(g);
    for(const [index,entry] of entries.entries()) {
      const {key}=entry;
      if(!relicSiteEnabled(g,entry))continue;
      const plan=g.terrain.island?.plan?.[key];
      for(let i=0;i<(plan?65:512);i++) {
        const angle=rotation+index*2.3+(i%32)*TAU/32,radius=530+Math.floor(i/32)*120;
        const offset=i===0?0:Math.ceil(i/8)*20,localAngle=(i%8)*TAU/8;
        const x=plan?Math.round(plan.x+Math.cos(localAngle)*offset):Math.round(Math.cos(angle)*radius),y=plan?Math.round(plan.y+Math.sin(localAngle)*offset):Math.round(Math.sin(angle)*radius);
        const profile=relicSiteProfile(entry);
        const site={id:`relic-site:${regionIndex}:${key}`,category:'relic',...entry,x,y,r:profile.r,width:profile.width,depth:profile.depth,sortY:y,
          door:{x,y:y+profile.doorOffset},interactRadius:RELIC_SITE_RULES.interactRadius,state:'ready',gateOpen:profile.gateOpen===true,progress:0,
          goal:profile.goal??entry.guardCount??0,discovered:false,regionIndex,seed:hash(regionIndex+131,index+41)};
        if(this._valid(site)){
          const mechanism=createRelicMechanism(site,entry);if(mechanism)site.mechanism=mechanism;
          this.sites.push(site);break;
        }
      }
    }
  }
  isSafePoint(x,y,r=0) {
    if(this.game.dungeon?.active)return true;
    return this.sites.every(site=>Math.hypot(x-site.x,y-site.y)>site.r+r+45);
  }
  _member(kind){return this.game.companions?.members?.find(member=>member.kind===kind)||null;}
  _golemFor(site) {
    const g=this.game,member=g.companions?.combatants?.().find(ally=>ally.kind==='golem');
    if(!member)return null;
    const foot={x:member.x,y:member.y+groundOffset(member,true)},point={x:site.x,y:site.y+140};
    if(distance(foot,point)>ARMY_SITE_RULES.smashReach)return null;
    if(g.terrain.firstBlocker?.(foot.x,foot.y,point.x,point.y,member.r||20))return null;
    return member;
  }
  getInteraction() {
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active)return null;
    const p=this._foot();let nearest=null,best=Infinity;
    for(const site of this.sites) {
      // Open altars activate where their central pedestal is drawn; closed
      // structures continue to use their front door. Ignore legacy altar doors
      // retained in an already generated region snapshot.
      const profile=relicSiteProfile(site),anchor=profile.anchor==='center'||site.type==='stonevault'&&site.gateOpen?site:site.door,d=distance(p,anchor);if(d>site.interactRadius||d>=best)continue;
      const {enabled,label,description}=relicInteraction(this,site);
      nearest={id:site.id,siteId:site.id,type:'relic',relicType:site.type,category:'relic',label,description,x:anchor.x,y:anchor.y,enabled,...(profile.touchRadius?{touchRadius:profile.touchRadius}:{})};best=d;
    }
    return nearest;
  }
  interact(id) {
    const current=this.getInteraction();if(!current||current.id!==id||!current.enabled)return false;
    const site=this.sites.find(s=>s.id===id);
    const touchRadius=relicSiteProfile(site).touchRadius;if(touchRadius&&distance(this._foot(),site)>touchRadius)return false;
    return activateRelicSite(this,site);
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
    for(const site of this.sites)if(site.type!=='hunt')advanceRelicActivation(site,dt);
    updateRelicContent(this,dt);
  }
}
