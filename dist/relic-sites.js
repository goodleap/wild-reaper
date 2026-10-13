import { groundOffset } from './terrain.js';
import { placementAllowed } from './placement-rules.js';
import { beginRelicActivation, advanceRelicActivation } from './relic-activation.js';

const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
export const RELIC_SITE_RULES=Object.freeze({huntGuards:24,rescueGuards:9,interactRadius:82,huntTouchRadius:26});
export const ARMY_SITE_RULES=Object.freeze({dogCost:8,vaultGold:45,vaultCrystals:90,smashDuration:.9,smashReach:110,altarTouchRadius:30});
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
    if((site.type!=='rescue'&&site.type!=='stonevault')||site.appearance==='golemaltar')return [];
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
    const g=this.game,clearance=site.type==='hunt'?245:site.type==='rescue'||site.type==='stonevault'?135:100;
    // A dry center is insufficient: include the stone rim and the front door.
    if(!placementAllowed(g,'structure',{x:site.x,y:site.y,r:Math.max(clearance,site.r+30)}))return false;
    if(!placementAllowed(g,'structure',{x:site.door.x,y:site.door.y,r:30}))return false;
    if(g.settlements?.isSafePoint(site.x,site.y,clearance)===false)return false;
    if(this.sites.some(other=>distance(site,other)<clearance+other.r+130))return false;
    const portals=g.regions?.portals||g.regionWorld?.portals||(g.portal?[g.portal]:[]);
    if(portals.some(portal=>distance(site,portal)<clearance+210))return false;
    if(g.adventure?.props.some(prop=>distance(site,prop)<clearance+(prop.r||18)))return false;
    if(g.adventure?.treasure&&distance(site,g.adventure.treasure)<clearance+110)return false;
    if(g.environment?.isHazardFree?.(site.x,site.y,site.type==='hunt'?70:105)===false)return false;
    if(site.type==='rescue'&&g.environment?.props.some(o=>o.state!=='spent'&&distance(o,site)<(o.blastRadius||82)+113))return false;
    return true;
  }
  _generate() {
    const g=this.game,regionIndex=g.regionIndex||0,rotation=hash(regionIndex+71,23)*TAU;
    const entries=[{key:'hunt',type:'hunt',name:'林间狩猎'},{key:'rescue',type:'rescue',kind:'stormcaller',name:'唤雷者囚牢',guardCount:9},
      {key:'rescue-warden',type:'rescue',kind:'warden',name:'守林人囚牢',guardCount:9},
      {key:'dogcamp',type:'dogcamp',kind:'dog',name:'旅犬营地'},
      {key:'owlroost',type:'rescue',kind:'owl',appearance:'owlroost',name:'林间鸟笼',guardCount:3},
      {key:'golemaltar',type:'rescue',kind:'golem',appearance:'golemaltar',name:'沉睡石像',guardCount:8},
      {key:'stonevault',type:'stonevault',name:'封石宝库'}];
    if(g.environment?.mechanisms){
      if(g.region?.id==='ruins')entries.push({key:'rune',type:'rune',name:'遗迹符文阵'});
      if(g.region?.id==='snow')entries.push({key:'rune',type:'rune',featureId:'icealtar',appearance:'icealtar',name:'冰封祭坛'});
    }
    for(const [index,entry] of entries.entries()) {
      const {key,type}=entry;
      if(type==='hunt'&&g._features?.encounters===false)continue;
      if(!['hunt','rune'].includes(type)&&g._features?.companions===false)continue;
      const plan=g.terrain.island?.plan?.[key];
      for(let i=0;i<(plan?65:512);i++) {
        const angle=rotation+index*2.3+(i%32)*TAU/32,radius=530+Math.floor(i/32)*120;
        const offset=i===0?0:Math.ceil(i/8)*20,localAngle=(i%8)*TAU/8;
        const x=plan?Math.round(plan.x+Math.cos(localAngle)*offset):Math.round(Math.cos(angle)*radius),y=plan?Math.round(plan.y+Math.sin(localAngle)*offset):Math.round(Math.sin(angle)*radius);
        const hunt=type==='hunt',rune=type==='rune',dog=type==='dogcamp',vault=type==='stonevault';
        const site={id:`relic-site:${regionIndex}:${key}`,category:'relic',...entry,x,y,r:hunt?210:rune?72:dog?62:105,width:hunt?420:rune?96:dog?90:128,depth:hunt?420:rune?82:dog?65:66,sortY:y,
          door:{x,y:y+(hunt?190:rune?45:dog?36:vault?138:entry.appearance==='golemaltar'?0:100)},interactRadius:RELIC_SITE_RULES.interactRadius,state:'ready',gateOpen:entry.appearance==='golemaltar',progress:0,
          goal:hunt?RELIC_SITE_RULES.huntGuards:rune?12:entry.guardCount||0,discovered:false,regionIndex,seed:hash(regionIndex+131,index+41)};
        if(this._valid(site)){
          if(rune)site.mechanism={id:`${site.id}:support`,siteId:site.id,type:'rune',element:entry.featureId==='icealtar'?'frost':undefined,x,y,r:48,state:'idle',charge:0,remaining:0,maxRemaining:12};
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
      const anchor=site.type==='hunt'||site.appearance==='golemaltar'||site.type==='stonevault'&&site.gateOpen?site:site.door,d=distance(p,anchor);if(d>site.interactRadius||d>=best)continue;
      let enabled=site.state==='ready',label='',description='';
      if(site.state==='cleared'){label='遗迹已完成';description=site.type==='rune'?'符文能量已耗尽，石台保留':'建筑与通路保留，奖励不再刷新';}
      else if(site.state==='failed'){label='遗迹挑战已结束';description='守卫已散去，遗迹留在原地';}
      else if(site.type==='dogcamp'){
        label=this._member('dog')?'小狗已在队伍中':`招募寻宝小狗 · ${ARMY_SITE_RULES.dogCost} 金币`;
        enabled=enabled&&!this._member('dog')&&g.gold>=ARMY_SITE_RULES.dogCost;
        description='提供路粮，小狗会带路寻找附近宝藏';
      } else if(site.type==='stonevault'){
        if(site.gateOpen){enabled=site.state==='opened';label='走入宝库领取珍藏';description=`${ARMY_SITE_RULES.vaultGold} 金币 / ${ARMY_SITE_RULES.vaultCrystals} 灵晶`;}
        else if(site.state==='opening'){enabled=false;label='岩灵正在击碎封石';description='守在门前，通路将永久开启';}
        else {enabled=!!this._golemFor(site);label=enabled?'岩灵击碎封石':this._member('golem')?'带岩灵靠近宝库正门':'封石宝库 · 需要岩灵';description='寻找沉睡石像，唤醒伙伴后返回';}
      } else if(site.state==='active') {
        const camp=site.type==='rescue'&&g.companions?.campFor(site.id);
        label=site.type==='hunt'?`狩猎守卫 ${site.progress}/${site.goal}`:site.type==='rune'?`符文支援 ${Math.ceil(site.mechanism.remaining)} 秒`:camp?.siteId===site.id&&camp.state==='ready'?'靠近伙伴完成解救':`${site.appearance==='golemaltar'?'唤醒试炼':'囚牢守卫'} ${site.progress}/${site.goal}`;
        description=site.type==='rune'?'符文正在自动轰击附近怪物':'离开后进度保留，返回可继续挑战';
      } else if(site.type==='hunt') {label='走进中央纹章开启狩猎';description='击败 24 名遗迹守卫 · 72 灵晶 / 18 金币';}
      else if(site.type==='rune') {label=`激活${site.name}`;description=site.featureId==='icealtar'?'一次性寒霜支援 · 自动攻击并减速附近怪物':'一次性 12 秒符文支援 · 自动攻击附近怪物';}
      else {label=site.kind==='golem'?'触碰古坛唤醒岩灵':site.kind==='owl'?'驱散守卫解救猫头鹰':'挑战囚牢守卫';description=`击败 ${site.goal} 名守卫，招募伙伴`;
        if(this._member(site.kind)){enabled=false;label=site.kind==='golem'?'岩灵已在队伍中':'该伙伴已在队伍中';description='每种伙伴最多一名，无需重复解救或唤醒';}}
      nearest={id:site.id,siteId:site.id,type:'relic',relicType:site.type,category:'relic',label,description,x:anchor.x,y:anchor.y,enabled,...(site.type==='hunt'?{touchRadius:RELIC_SITE_RULES.huntTouchRadius}:site.appearance==='golemaltar'?{touchRadius:ARMY_SITE_RULES.altarTouchRadius}:{})};best=d;
    }
    return nearest;
  }
  interact(id) {
    const current=this.getInteraction();if(!current||current.id!==id||!current.enabled)return false;
    const site=this.sites.find(s=>s.id===id),g=this.game;
    if(site.type==='hunt'&&distance(this._foot(),site)>RELIC_SITE_RULES.huntTouchRadius)return false;
    if(site.appearance==='golemaltar'&&distance(this._foot(),site)>ARMY_SITE_RULES.altarTouchRadius)return false;
    if(site.type==='dogcamp') {
      if(g.gold<ARMY_SITE_RULES.dogCost||this._member('dog'))return false;
      const member=g.companions?.recruit('dog',{x:site.x,y:site.y,sourceId:site.id});if(!member)return false;
      g.gold-=ARMY_SITE_RULES.dogCost;site.state='cleared';site.discovered=true;beginRelicActivation(site);return true;
    }
    if(site.type==='stonevault') {
      if(site.gateOpen){
        if(site.state!=='opened'||!this.insideRescue(site.id,this._foot(),g.player.r))return false;
        site.state='cleared';g.grantResources({gold:ARMY_SITE_RULES.vaultGold,crystals:ARMY_SITE_RULES.vaultCrystals},'stonevault');
        g._emit('stonevaultClaimed',{siteId:site.id});g._effect(site.x,site.y,'ring',.7,90,'#ead18e');return true;
      }
      const member=this._golemFor(site);if(!member)return false;
      site.state='opening';site.openProgress=0;site.discovered=true;site.workerId=member.id;
      member.workTarget={x:site.x,y:site.y+140,sourceId:site.id};member.castFace=.9;beginRelicActivation(site);
      g._emit('stonevaultOpening',{siteId:site.id});return true;
    }
    if(site.type==='rune') {
      if(!g.environment?.mechanisms.activateRune(site.mechanism))return false;
      site.state='active';site.discovered=true;beginRelicActivation(site);return true;
    }
    const battle=site.type==='hunt'?g.encounters?.spawn('hunt',site.x,site.y,{siteId:site.id}):g.companions?.spawn(site.kind,site.x,site.y,{siteId:site.id});
    if(!battle)return false;
    site.state='active';site.discovered=true;site.battleId=battle.id;site.progress=0;
    if(site.type==='rescue')beginRelicActivation(site);
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
    for(const site of this.sites)if(site.type!=='hunt')advanceRelicActivation(site,dt);
    for(const site of this.sites)if(site.type==='stonevault'&&site.state==='opening') {
      const member=this._golemFor(site);
      if(!member||member.id!==site.workerId||distance(this._foot(),site.door)>220){
        const previous=g.companions?.members?.find(ally=>ally.id===site.workerId);if(previous?.workTarget?.sourceId===site.id)delete previous.workTarget;
        site.state='ready';site.openProgress=0;continue;
      }
      site.openProgress=Math.min(ARMY_SITE_RULES.smashDuration,(site.openProgress||0)+dt);member.castFace=.2;
      if(site.openProgress>=ARMY_SITE_RULES.smashDuration){
        delete member.workTarget;site.state='opened';this.openGate(site.id);beginRelicActivation(site);
        g._effect(site.x,site.y+61,'ring',.55,74,'#d1c093',undefined,{quake:true,groundY:site.y+61,ally:true});g._emit('stonevaultOpened',{siteId:site.id});
      }
    }
    for(const site of this.sites)if(site.type==='rune'&&site.state==='active') {
      g.environment?.mechanisms._rune(site.mechanism,dt);
      site.progress=site.goal-site.mechanism.remaining;
      if(site.mechanism.state==='spent')this.complete(site.id,true);
      if(g.status!=='playing')break;
    }
  }
}
