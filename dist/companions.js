import { getConfigSection } from './content-config.js';
import { rescueGuardType } from './encounter-definitions.js';
import { groundOffset } from './terrain.js';
import { placementAllowed } from './placement-rules.js';
import { resetLocomotion, updateLocomotion } from './locomotion.js';
import { defenseDamageMultiplier } from './combat-stats.js';
import { movementProfile } from './height-rules.js';
import { COMPANIONS, COMPANION_RULES, COMPANION_FOLLOW_RULES, companionDefinition as definition } from './companion-catalog.js';
export { COMPANIONS } from './companion-catalog.js';
import { OBJECTIVE_RULES, canStartObjective, majorFightActive, objectivePointSafe } from './event-scheduling.js';

const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const content=getConfigSection('companions'),skills=content.skills;
export const RESCUE_RULES=Object.freeze({...content.rescueRules,bonus:getConfigSection('combat').stats.rescueDamageBonus});

// Rescue is an optional world objective. Guards can only be credited by an
// actual lethal hit; expiration, range culling and scene replacement pay nothing.
export class Companions {
  constructor(game,{generation=true}={}) {
    this.game=game;this.generation=generation;this.camps=[];this.members=[];this._rescueSources=new Set();
    this.nextPayrollAt=(game.runTime??game.time)+COMPANION_RULES.payrollInterval;this.graceUntil=0;this.unpaidCost=0;
    this.rescuedCount=0;this.nextAt=game.time+RESCUE_RULES.firstAt;this._nextKind='stormcaller';
  }
  _foot(entity=this.game.player) {return {x:entity.x,y:entity.y+groundOffset(entity,entity===this.game.player||!!entity.isCompanion||!!entity.isCaptive)};}
  get camp(){return this.camps[0]||null;}
  set camp(value){this.camps=value?[value]:[];}
  campFor(siteId){return this.camps.find(camp=>camp.siteId===siteId)||null;}
  _canStart() {
    return canStartObjective(this.game);
  }
  _hazardFree(x,y,r=0) {
    const environment=this.game.environment;
    if(this.game.settlements?.isSafePoint(x,y,r)===false)return false;
    if(environment?.isHazardFree?.(x,y,r)===false)return false;
    return !environment?.props.some(o=>o.state!=='spent'&&Math.hypot(o.x-x,o.y-y)<(o.blastRadius||82)+r+8);
  }
  _point(x,y) {
    const g=this.game,p=this._foot();
    const safe=q=>g.terrain.isFree(q.x,q.y,125)&&!g.terrain.island?.isReserved(q.x,q.y,125)&&this._hazardFree(q.x,q.y,105)&&objectivePointSafe(g,q,125)&&
      !g.adventure?.props.some(o=>distance(o,q)<135)&&
      (!g.adventure?.treasure||distance(g.adventure.treasure,q)>240)&&
      (!g.portal||distance(g.portal,q)>180);
    if(Number.isFinite(x)&&Number.isFinite(y))return safe({x,y})?{x,y}:null;
    const start=Math.random()*TAU;
    for(let i=0;i<48;i++) {
      const angle=start+i*TAU/24,base=320+Math.floor(i/24)*100,radius=g.terrain.island?Math.max(base,1/Math.max(Math.abs(Math.cos(angle))/(g.viewWidth*.5+170),Math.abs(Math.sin(angle))/(g.viewHeight*.5+170))):base;
      const point={x:p.x+Math.cos(angle)*radius,y:p.y+Math.sin(angle)*radius};
      if(safe(point))return point;
    }
    return null;
  }
  _guardPoints(site,count) {
    const g=this.game,p=this._foot(),points=[],r=28;
    // The doorway and its approach stay empty. Every slot is checked before
    // creating any defenders; an obstructed ruin never uses an unsafe fallback.
    for(const depth of [52,130,208,286])for(const side of [-1,1])for(const lateral of [150,228,306]) {
      const point={x:site.x+side*lateral,y:site.door.y+depth};
      if(distance(point,p)<RESCUE_RULES.spawnDistance||!placementAllowed(g,'structure',{x:point.x,y:point.y,r:r+5})||!this._hazardFree(point.x,point.y,r))continue;
      if(g.enemies.some(e=>e.hp>0&&distance(point,{x:e.x,y:e.y+groundOffset(e)})<r+e.r+12))continue;
      if(points.some(other=>distance(point,other)<r*2+14))continue;
      points.push(point);if(points.length===count)return points;
    }
    return null;
  }
  spawn(kind=this._nextKind,x,y,{siteId=null}={}) {
    const g=this.game,def=definition(kind);
    const site=siteId&&g.relicSites?.sites.find(s=>s.id===siteId&&s.type==='rescue'&&s.state==='ready');
    const guards=site?.guardCount??(siteId?RESCUE_RULES.siteGuards:RESCUE_RULES.guards);
    if(siteId&&!site)return null;
    if(!def||g.status!=='playing'||g.dungeon?.active||this.members.some(member=>member.kind===kind)||this.camps.some(camp=>siteId?camp.siteId===siteId:!camp.siteId)||(!siteId&&!this._canStart())||g.enemies.length+guards>180)return null;
    // A physical prison surrounds its NPC, so only its usable interior needs
    // clearance here. Random camps retain their original open-circle check.
    const point=site?(g.terrain.isFree(site.x,site.y,26)&&this._hazardFree(site.x,site.y,24)?{x:site.x,y:site.y}:null):this._point(x,y);if(!point)return null;
    const guardPoints=site?this._guardPoints(site,guards):null;if(site&&!guardPoints)return null;
    const camp={id:`rescue:${++g._id}`,kind,name:def.name,...point,r:24,state:'trapped',siteId,category:siteId?'relic':'random',engageRadius:siteId?RESCUE_RULES.siteEngageRadius:OBJECTIVE_RULES.campEngage,guardIds:[],guardTotal:guards,remainingGuards:guards,life:RESCUE_RULES.campDuration,maxLife:RESCUE_RULES.campDuration,_remaining:new Set()};
    for(let i=0;i<guards;i++) {
      const angle=-Math.PI/2+i*TAU/guards,enemy=g._spawnEnemy(rescueGuardType(i,!!siteId),1);
      if(!enemy){g.enemies=g.enemies.filter(e=>e.rescueId!==camp.id);return null;}
      enemy.rescueId=camp.id;enemy.eventRole='rescueGuard';enemy.xp=RESCUE_RULES.guardXp;
      enemy.relicSiteId=siteId;enemy.hp*=siteId?RESCUE_RULES.siteGuardHp:RESCUE_RULES.campGuardHp;enemy.maxHp=enemy.hp;enemy.guardActive=false;
      enemy.rescueHome=guardPoints?{...guardPoints[i]}:{x:point.x+Math.cos(angle)*92,y:point.y+Math.sin(angle)*92};
      enemy.x=enemy.rescueHome.x;enemy.y=enemy.rescueHome.y-groundOffset(enemy);
      if(site){enemy.rescueSpawnGrace=RESCUE_RULES.spawnGrace;g._effect(enemy.x,enemy.rescueHome.y,'rescueWarning',RESCUE_RULES.spawnGrace,enemy.r+10,'#efd49a',undefined,{seed:enemy.id});}
      enemy._navTimer=0;g._moveEntity(enemy,0,0);
      camp.guardIds.push(enemy.id);camp._remaining.add(enemy.id);
    }
    this.camps.push(camp);this._nextKind=kind==='stormcaller'?'warden':'stormcaller';
    g._emit('rescueAppeared',{name:def.name,kind});
    g._effect(camp.x,camp.y,'ring',.8,70,def.color);
    return camp;
  }
  _clearCamp(expired=false,camp=this.camp) {
    const index=this.camps.indexOf(camp);if(index<0)return false;
    this.camps.splice(index,1);
    // Never simulate kills while discarding a camp's surviving guards.
    this.game.enemies=this.game.enemies.filter(e=>e.rescueId!==camp.id);
    this.game.relicSites?.complete(camp.siteId,false);
    this.nextAt=this.game.time+RESCUE_RULES.interval;
    if(expired)this.game._emit('rescueExpired',{name:camp.name});return true;
  }
  onEnemyKilled(enemy) {
    const camp=this.camps.find(item=>item.id===enemy.rescueId);
    if(!camp||camp.state!=='trapped'||this.game.status!=='playing'||enemy.hp>0||enemy.rescueId!==camp.id||!camp._remaining.delete(enemy.id))return;
    camp.remainingGuards=camp._remaining.size;
    const site=this.game.relicSites?.sites.find(s=>s.id===camp.siteId);if(site)site.progress=camp.guardTotal-camp.remainingGuards;
    if(!camp.remainingGuards) {
      camp.state='ready';
      if(camp.siteId)this.game.relicSites?.openGate(camp.siteId);
      this.game._emit('rescueReady',{name:camp.name,kind:camp.kind});
      this.game._effect(camp.x,camp.y,'ring',.65,75,definition(camp.kind).color);
    }
  }
  get active() {return this.members[0]||null;}
  set active(value) {this.members=value?[value]:[];this.game._friendlySnapshot=null;}
  get upkeep() {return this.members.reduce((sum,member)=>sum+(member.state==='recovering'?0:definition(member.kind)?.upkeep||0),0);}
  combatants() {return this.members.filter(member=>member.state==='active'&&member.hp>0);}
  recruit(kind,{x,y,sourceId=null,rescueBonus=false}={}) {
    const g=this.game,def=definition(kind);
    if(!def||g.status!=='playing'||this.members.length>=COMPANION_RULES.maxMembers||this.members.some(member=>member.kind===kind))return null;
    const point=Number.isFinite(x)&&Number.isFinite(y)?{x,y}:this._foot();
    const member={...def,id:++g._id,kind,heroId:kind,isCompanion:true,x:point.x,y:point.y-def.groundOffset,hp:def.maxHp,state:'active',flying:!!def.flying,invuln:0,remaining:Infinity,maxDuration:Infinity,facing:g.player.facing,moving:false,_attack:COMPANION_RULES.initialAttackDelay,_echoes:[],_stuckFor:0,_scan:0,sourceId};
    this._resetFollowing(member);this.members.push(member);g._friendlySnapshot=null;
    if(!Number.isFinite(x)||!Number.isFinite(y)||!g.terrain.isFree(point.x,point.y,member.r,movementProfile(member)))this._safeReturn(member);
    member.rescuedFace=.65;
    if(this.members.length===1){this.nextPayrollAt=(g.runTime??g.time)+COMPANION_RULES.payrollInterval;this.graceUntil=0;this.unpaidCost=0;}
    if(rescueBonus&&(!sourceId||!this._rescueSources.has(sourceId))){if(sourceId)this._rescueSources.add(sourceId);this.rescuedCount++;g.rescuePower++;g._refreshStats();}
    g._emit('companionJoined',{id:member.id,name:def.name,kind,upkeep:def.upkeep,bonusLevel:g.rescuePower,bonusPercent:rescueBonus?RESCUE_RULES.bonus*100:0});
    g._effect(member.x,member.y+member.groundOffset,'ring',.8,65,def.color);
    return member;
  }
  dismiss(id,reason='dismissed') {
    const index=this.members.findIndex(member=>member.id===id);if(index<0)return false;
    const [member]=this.members.splice(index,1);member._echoes=[];this.game._friendlySnapshot=null;
    this.game._emit('companionLeft',{id:member.id,name:member.name,kind:member.kind,reason});
    this.game._effect(member.x,member.y+member.groundOffset,'ring',.45,30,definition(member.kind).color);
    if(!this.members.length){this.graceUntil=0;this.unpaidCost=0;}
    return true;
  }
  protectionMultiplier(target) {
    const defender=this.members.find(member=>member.kind==='warden'&&member.state==='active'&&member.hp>0);
    if(!defender||!target||distance(this._foot(defender),this._foot(target))>COMPANION_RULES.guardRadius)return 1;
    return this.game.combat.clearPath(defender,target,{profile:'sight'})?COMPANION_RULES.guardMultiplier:1;
  }
  takeDamage(member,amount,source='enemy') {
    const g=this.game;
    if(g.status!=='playing'||!this.members.includes(member)||member.state!=='active'||member.invuln>0||!Number.isFinite(amount)||amount<=0)return false;
    member.hp=Math.max(0,member.hp-amount*defenseDamageMultiplier(member.defense||0)*this.protectionMultiplier(member));
    member.invuln=COMPANION_RULES.hitImmunity;member.hurtFace=.25;member.hurtFlash=.2;
    g._effect(member.x,member.y,'hit',.2,member.r*.7,'#eaa486',undefined,{source,angle:0,strength:.4,seed:member.id});
    if(member.hp<=0){g._friendlySnapshot=null;member.state='recovering';member.recovery=COMPANION_RULES.recoveryDuration;member._recoveryBlocked=false;member._echoes=[];member._attack=.8;member.workTarget=null;member._meleeTarget=null;member.scoutTarget=null;member.treasureTarget=null;g._emit('companionRecovering',{name:member.name,kind:member.kind,cost:definition(member.kind).recoveryCost});}
    return true;
  }
  _join(camp=this.camps.find(item=>item.state==='ready'&&distance(this._foot(),item)<=RESCUE_RULES.rescueRadius)) {
    const g=this.game;
    if(!camp||camp.state!=='ready'||g.status!=='playing'||distance(this._foot(),camp)>RESCUE_RULES.rescueRadius)return false;
    if(camp.siteId&&!g.relicSites?.insideRescue(camp.siteId,this._foot(),g.player.r))return false;
    if(!this.camps.includes(camp)||this.members.length>=COMPANION_RULES.maxMembers||this.members.some(member=>member.kind===camp.kind))return false;
    if(camp.siteId&&!g.relicSites?.complete(camp.siteId,true))return false;
    this.camps.splice(this.camps.indexOf(camp),1);
    return !!this.recruit(camp.kind,{x:camp.x,y:camp.y,sourceId:camp.siteId||camp.id,rescueBonus:true});
  }
  _resetFollowing(active) {
    active._navTimer=0;active._navObstacle=null;active._navSide=0;
    active._navProgressTimer=0;active._navProgressX=undefined;active._navProgressY=undefined;
    active._stuckFor=0;active._following=false;active._followSpeed=0;active._followMode=null;active._coastTarget=null;
    resetLocomotion(active);
  }
  _safeReturn(active) {
    const g=this.game,p=this._foot(),foot=this._foot(active),def=definition(active.kind),preferred=def.followDistance;
    // Arrival/recovery needs one safe point, not a permanent formation slot.
    const fromAngle=distance(foot,p)>1?Math.atan2(foot.y-p.y,foot.x-p.x):g.player.facing+Math.PI;
    for(const radius of [preferred,preferred+24,Math.max(84,preferred*.72),76,52])for(let i=0;i<16;i++) {
      const angle=fromAngle+i*TAU/16,x=p.x+Math.cos(angle)*radius,y=p.y+Math.sin(angle)*radius;
      if(!g.terrain.isFree(x,y,active.r+3,movementProfile(active))||!this._hazardFree(x,y,active.r))continue;
      if(g.terrain.firstBlocker(p.x,p.y,x,y,0,movementProfile(active)))continue;
      if(g.enemies.some(e=>e.hp>0&&Math.hypot(e.x-x,e.y+groundOffset(e)-y)<e.r+active.r+12))continue;
      if(this.members.some(other=>other!==active&&distance(this._foot(other),{x,y})<other.r+active.r+(radius>76?24:8)))continue;
      active.x=x;active.y=y-groundOffset(active,true);this._resetFollowing(active);
      return true;
    }
    return false;
  }
  _placeAtDoor(active,arrival,placed){
    const g=this.game,p=this._foot(),door=arrival.doorway,d=arrival.direction,length=Math.hypot(d?.x,d?.y);
    if(!door||!Number.isFinite(door.x)||!Number.isFinite(door.y)||!length)return false;
    const dx=d.x/length,dy=d.y/length,depth=(p.x-door.x)*dx+(p.y-door.y)*dy,profile=movementProfile(active);
    // One scene-arrival placement only. Once visible, everyone keeps these
    // positions until their existing following/task rules require movement.
    const back=Math.max(0,depth-72),front=Math.max(0,depth-30);
    const candidates=[[back,0],[back,-44],[back,44],[front,-22],[front,22],[front,-72],[front,72]];
    for(const along of [back,front,0])for(const side of [0,-44,44,-80,80,-120,120])candidates.push([along,side]);
    for(const [along,side] of candidates){
      const point={x:door.x+dx*along-dy*side,y:door.y+dy*along+dx*side};
      if(along>depth-18||distance(point,p)<g.player.r+active.r+6||distance(point,p)>active.followDistance+50)continue;
      if(!g.terrain.isFree(point.x,point.y,active.r+3,profile)||g.environment?.isHazardFree?.(point.x,point.y,active.r)===false)continue;
      if(g.environment?.props?.some(prop=>prop.state!=='spent'&&distance(prop,point)<(prop.blastRadius||82)+active.r+8))continue;
      if(!g.dungeon?.active&&g.settlements?.sites.some(site=>['angel','merchant'].includes(site.type)&&site.state!=='spent'&&distance(site,point)<active.r+(site.r||18)+8))continue;
      if(!placementAllowed(g,{surface:'coastal',water:profile==='air'?'allow':'avoid'},{...point,r:active.r+3},{checkTerrain:false}))continue;
      if(g.terrain.firstBlocker(p.x,p.y,point.x,point.y,active.r+2,profile))continue;
      if(g.enemies.some(enemy=>enemy.hp>0&&distance(this._foot(enemy),point)<enemy.r+active.r+12))continue;
      if(placed.some(other=>distance(this._foot(other),point)<other.r+active.r+8))continue;
      active.x=point.x;active.y=point.y-groundOffset(active,true);active.facing=Math.atan2(dy,dx);return true;
    }
    return false;
  }
  _follow(active,dt) {
    const g=this.game,p=this._foot(),def=definition(active.kind),rules=COMPANION_FOLLOW_RULES;
    let target=p,mode='leader';
    if(active.state==='active'&&active.workTarget&&distance(p,active.workTarget)<rules.workLeash){target=active.workTarget;mode='task';}
    else if(active.state==='active'&&active.kind==='dog'&&active.treasureTarget&&(g.runTime??g.time)<active._leadUntil){
      const dx=active.treasureTarget.x-p.x,dy=active.treasureTarget.y-p.y,length=Math.hypot(dx,dy)||1,lead=Math.min(rules.dogLeadDistance,length);
      const point={x:p.x+dx/length*lead,y:p.y+dy/length*lead};
      if(g.terrain.isFree(point.x,point.y,active.r+5,movementProfile(active))){target=point;mode='task';}
    }else if(active.state==='active'&&active._meleeTarget?.hp>0&&distance(p,this._foot(active._meleeTarget))<rules.meleeLeash){
      const ef=this._foot(active._meleeTarget),af=this._foot(active),dx=af.x-ef.x,dy=af.y-ef.y,length=Math.hypot(dx,dy)||1;
      target={x:ef.x+dx/length*rules.meleeStandOff,y:ef.y+dy/length*rules.meleeStandOff};mode='task';
    }
    // Jobs approach their own objective. Finishing a job never forces a return
    // to the hero while the member is already inside its normal leash.
    if(active._followMode!==mode){
      active._followMode=mode;active._following=false;active._followSpeed=0;
      active._navTimer=0;active._navObstacle=null;active._coastTarget=null;active._stuckFor=0;
    }
    const foot=this._foot(active),d=distance(foot,target),oldX=active.x,oldY=active.y;
    const stop=mode==='task'?rules.taskStop:def.followDistance;
    const start=mode==='task'?rules.taskStart:stop+rules.restartGap;
    // Leader movement inside this band does not issue a move order. A follower
    // that does fall behind walks toward the current position, not a trail or
    // an angular slot, then keeps whichever clear position it reaches.
    if(active._following&&d<=stop)active._following=false;
    else if(!active._following&&d>start){active._following=true;active._navTimer=0;}
    if(active._following&&dt>0) {
      const desiredSpeed=Math.min(Math.max(def.speed,g.player.speed*(active.kind==='golem'?rules.golemCatchup:rules.catchup)),Math.max(40,(d-stop)*7));
      const acceleration=rules.acceleration*dt,previousSpeed=active._followSpeed||0;
      active._followSpeed=Math.max(previousSpeed-acceleration,Math.min(previousSpeed+acceleration,desiredSpeed));
      active.speed=active._followSpeed;
      g._moveEnemy(active,dt,target);
      const moved=Math.hypot(active.x-oldX,active.y-oldY);
      if(moved>.001)active.facing=Math.atan2(active.y-oldY,active.x-oldX);
      active._stuckFor=moved<.3&&d>stop+20?active._stuckFor+dt:0;
    }else {active._stuckFor=0;active._followSpeed=0;}
    updateLocomotion(active,oldX,oldY,dt);
    // Only unseen stranded allies can recover; visible followers use the same
    // terrain steering as before, without snapping to a formation position.
    if((distance(this._foot(active),p)>rules.strandedDistance||active._stuckFor>rules.strandedTime)&&!g._inView(active,40)) {
      if(this._safeReturn(active))g._effect(active.x,active.y+groundOffset(active,true),'ring',.35,26,def.color);
    }
  }
  _leave() {return this.active?this.dismiss(this.active.id,'dismissed'):false;}
  updateEnemy(enemy,dt) {
    if(!enemy.rescueId)return false;
    const camp=this.camps.find(item=>item.id===enemy.rescueId),g=this.game;
    if(g.status!=='playing')return true;
    if(!camp||camp.id!==enemy.rescueId)return true;
    if(enemy.rescueSpawnGrace>0) {
      enemy.rescueSpawnGrace=Math.max(0,enemy.rescueSpawnGrace-dt);
      enemy.guardActive=false;enemy.guardReturnTarget=null;enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;
      return true;
    }
    const p=this._foot(),foot={x:enemy.x,y:enemy.y+groundOffset(enemy)};
    const active=distance(p,camp)<camp.engageRadius&&distance(foot,camp)<(camp.siteId?RESCUE_RULES.siteEngageRadius:RESCUE_RULES.campGuardRadius)&&(!!camp.siteId||!majorFightActive(g));
    enemy.guardActive=active;enemy.guardReturnTarget=null;
    if(!active) {
      enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;
      if(distance(foot,enemy.rescueHome)>4)g._moveEnemy(enemy,dt,enemy.rescueHome);
    }else g._moveEnemy(enemy,dt);
    return true;
  }
  update(dt) {
    const g=this.game;if(g.status!=='playing')return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    this._payroll();
    for(const active of this.members) {
      for(const key of ['castFace','rescuedFace','hurtFace','hurtFlash','invuln'])active[key]=Math.max(0,(active[key]||0)-dt);
      if(active.state==='recovering'){
        active.recovery=Math.max(0,active.recovery-dt);
        if(active.recovery<=0){
          const cost=definition(active.kind).recoveryCost;
          if(g.gold>=cost){g.gold-=cost;g._friendlySnapshot=null;active.hp=active.maxHp*COMPANION_RULES.recoveryHealth;active.state='active';active.invuln=COMPANION_RULES.recoveryImmunity;active._recoveryBlocked=false;g._emit('companionRecovered',{name:active.name,kind:active.kind,cost});}
          else if(!active._recoveryBlocked){active._recoveryBlocked=true;g._emit('companionRecoveryBlocked',{name:active.name,kind:active.kind,cost});}
        }
      }
      this._follow(active,dt);active._attack-=dt;active._scan-=dt;
      for(const echo of active._echoes)echo.life-=dt;
      if(active.state==='active'&&active._scan<=0){if(active.kind==='dog')this._sniff(active);if(active.kind==='owl')this._scout(active);active._scan=active.kind==='dog'?skills.dog.scanInterval:skills.owl.scanInterval;}
    }
    this._separate(dt);
    const present=this.camps.some(camp=>camp.siteId)?new Set(g.enemies.filter(e=>e.hp>0&&e.rescueId).map(e=>e.id)):null;
    for(const camp of [...this.camps]) {
      if(camp.siteId) {
        if([...camp._remaining].some(id=>!present.has(id)))this._clearCamp(true,camp);
      }else {
        camp.life=Math.max(0,camp.life-dt);
        if(camp.life<=0||distance(this._foot(),camp)>1200)this._clearCamp(true,camp);
      }
    }
    // Fixed rescue ruins own generation and activation. Explicit spawn() is
    // retained for isolated encounters and deterministic QA scenarios.
  }
  _payroll() {
    const g=this.game,now=g.runTime??g.time;if(!this.members.length)return;
    if(!this.upkeep){this.graceUntil=0;this.unpaidCost=0;this.nextPayrollAt=now+COMPANION_RULES.payrollInterval;return;}
    if(this.graceUntil>0){
      this.unpaidCost=this.upkeep;
      if(g.gold>=this.unpaidCost){g.gold-=this.unpaidCost;this.graceUntil=0;this.unpaidCost=0;this.nextPayrollAt=(g.runTime??g.time)+COMPANION_RULES.payrollInterval;g._emit('companionPaid',{cost:this.upkeep});}
      else if(now>=this.graceUntil){
        // Retain cheaper members when the available purse can maintain them.
        let available=Math.max(0,g.gold),paid=0;
        for(const member of this.members.filter(member=>member.state!=='recovering').sort((a,b)=>a.upkeep-b.upkeep||a.id-b.id)){
          if(available>=member.upkeep){available-=member.upkeep;paid+=member.upkeep;}
          else this.dismiss(member.id,'unpaid');
        }
        g.gold-=paid;this.graceUntil=0;this.unpaidCost=0;this.nextPayrollAt=(g.runTime??g.time)+COMPANION_RULES.payrollInterval;
      }
    }else if(now>=this.nextPayrollAt){
      const cost=this.upkeep;
      if(g.gold>=cost){g.gold-=cost;this.nextPayrollAt=(g.runTime??g.time)+COMPANION_RULES.payrollInterval;g._emit('companionPaid',{cost});}
      else{this.unpaidCost=cost;this.graceUntil=now+COMPANION_RULES.gracePeriod;g._emit('companionUpkeepWarning',{cost,grace:COMPANION_RULES.gracePeriod});}
    }
  }
  _separate(dt) {
    if(!(dt>0))return;
    for(let i=0;i<this.members.length;i++)for(let j=i+1;j<this.members.length;j++){
      const a=this.members[i],b=this.members[j];
      // Resolve actual contact locally; nearby allies do not spread into slots.
      // Each member retains its own ground/air collision profile.
      const af=this._foot(a),bf=this._foot(b),dx=bf.x-af.x,dy=bf.y-af.y,d=Math.hypot(dx,dy),minimum=a.r+b.r+COMPANION_FOLLOW_RULES.contactGap;
      if(d>=minimum)continue;
      const angle=d>.001?Math.atan2(dy,dx):(i+j)*2.4,push=Math.min((minimum-d)*.5,35*dt);
      this.game._moveEntity(a,-Math.cos(angle)*push,-Math.sin(angle)*push);this.game._moveEntity(b,Math.cos(angle)*push,Math.sin(angle)*push);
    }
  }
  _sniff(member) {
    const g=this.game,targets=[];
    if(g.dungeon?.active){
      const state=g.dungeon.active;
      for(const chest of state.chests||[])if(chest.state==='closed'&&g.dungeon.vision.isVisible(chest.x,chest.y))targets.push({...chest,name:'宝箱'});
      if(state.treasure&&!state.rewardClaimed&&g.dungeon.vision.isVisible(state.treasure.x,state.treasure.y))targets.push({...state.treasure,name:'王城宝藏'});
    }else{
      for(const site of g.relicSites?.sites||[])if(!['cleared','failed','claimed','spent'].includes(site.state))targets.push({...site,x:site.door?.x??site.x,y:site.door?.y??site.y});
      for(const site of g.settlements?.sites||[])if(['supply','occupied','castle'].includes(site.type)&&!['cleared','claimed','spent'].includes(site.state))targets.push({...site,x:site.door?.x??site.x,y:site.door?.y??site.y});
      if(g.adventure?.treasure&&g.adventure.treasure.state!=='opened')targets.push({...g.adventure.treasure,name:'守卫宝箱'});
    }
    const p=this._foot(),nearest=targets.filter(site=>distance(p,site)<skills.dog.range&&g.combat.clearPath(member,{...site,groundY:site.y},{profile:'sight'})).sort((a,b)=>distance(p,a)-distance(p,b))[0];
    const previous=member.treasureTarget?.id;
    member.treasureTarget=nearest?{id:nearest.id,x:nearest.x,y:nearest.y,name:nearest.name||'遗迹'}:null;
    member.cue=nearest?'发现宝藏':'';
    if(nearest&&previous!==nearest.id){member._leadUntil=(g.runTime??g.time)+skills.dog.leadDuration;g._emit('companionFound',{name:nearest.name||'遗迹',kind:'dog'});}
  }
  _scout(member) {
    const g=this.game;let nearest=null,priority=-Infinity,count=0;
    for(const enemy of g._nearby(member.x,member.y,skills.owl.range)){
      if(!g.combat.canTarget(enemy,member,{range:skills.owl.range,checkPath:true,profile:'sight',source:'companionLightning'})||enemy.trainingDummy)continue;
      if(g.dungeon?.active&&!g.dungeon.vision.isVisible(enemy.x,enemy.y+groundOffset(enemy)))continue;
      count++;const rank=(enemy.type==='boss'?1000:enemy.affix?500:0)-distance(enemy,member);
      if(rank>priority){priority=rank;nearest=enemy;}
    }
    member.scoutCount=count;member.scoutTarget=nearest?{id:nearest.id,x:nearest.x,y:nearest.y,name:nearest.type==='boss'?'首领':count>=skills.owl.groupThreshold?'敌群':'敌人',boss:nearest.type==='boss'}:null;
    member.cue=nearest?(nearest.type==='boss'?'首领警戒':count>=skills.owl.groupThreshold?'敌群接近':'') : '';
  }
  _castLightning(active) {
    const g=this.game,excluded=new Set();let origin=active,hits=0;
    const rule=skills.stormcaller,damage=rule.damage*(1+Math.floor(g.time/rule.growthPeriod)*rule.growth);
    for(let i=0;i<rule.hits;i++) {
      const enemy=g._nearest(origin.x,origin.y,i?rule.chainRange:rule.range,excluded,origin,{source:'companionLightning'});if(!enemy)break;
      if(!hits)active.castFacing=Math.atan2(enemy.y-active.y,enemy.x-active.x);
      excluded.add(enemy.id);hits++;
      g._effect(origin.x,origin.y,'lightning',.22,0,'#d5d0fb',undefined,{x2:enemy.x,y2:enemy.y,evolved:true,branch:'chain',chainIndex:i,ally:true});
      g._hitEnemy(enemy,damage,0,origin,'companionLightning');origin=enemy;
    }
    if(!hits)return false;
    active._attack=rule.cooldown;active.castFace=.25;return true;
  }
  _quake(x,y,r,damage,echo,seed) {
    const g=this.game,source=echo?'companionEcho':'companionPulse',origin={x,y:y-groundOffset(g.player,true),groundY:y};
    g._effect(x,y,'ring',echo?.6:.48,r,echo?'#c6ead5':'#9de0b3',undefined,{quake:true,groundY:y,evolved:true,echo,branch:'echoes',ally:true,seed});
    for(const enemy of g._nearby(x,y,r+50))if(g.combat.canTarget(enemy,origin,{requireView:true,checkPath:true,source,canHitFlying:false})&&Math.hypot(enemy.x-x,enemy.y+groundOffset(enemy)-y)<r+enemy.r)
      g._hitEnemy(enemy,damage,echo?skills.warden.echoKnockback:skills.warden.knockback,origin,source);
  }
  _castQuake(active) {
    const g=this.game,foot=this._foot(active),rule=skills.warden,enemies=g._nearby(foot.x,foot.y,rule.radius).filter(e=>g.combat.canTarget(e,active,{requireView:true,checkPath:true,source:'companionPulse',canHitFlying:false})&&distance(this._foot(e),foot)<rule.radius+e.r);
    if(!enemies.length)return false;
    const damage=rule.damage*(1+Math.floor(g.time/rule.growthPeriod)*rule.growth);
    this._quake(foot.x,foot.y,rule.radius,damage,false,active.id);
    active._attack=rule.cooldown;active.castFace=.3;return true;
  }
  _castGolem(active) {
    const g=this.game,foot=this._foot(active),rule=skills.golem;
    active._meleeTarget=g._nearest(active.x,active.y,rule.targetRange,new Set(),active,{source:'companionGolem',canHitFlying:false})||null;
    const targets=g._nearby(foot.x,foot.y,rule.queryRange).filter(e=>g.combat.canTarget(e,active,{checkPath:true,source:'companionGolem',canHitFlying:false})&&distance(this._foot(e),foot)<rule.radius+e.r);
    if(!targets.length)return false;
    targets.sort((a,b)=>(b.type==='boss')-(a.type==='boss')||distance(a,active)-distance(b,active));
    const target=targets[0],angle=Math.atan2(target.y-active.y,target.x-active.x);active.castFacing=angle;active.facing=angle;active.castFace=.48;
    g._effect(foot.x+Math.cos(angle)*44,foot.y+Math.sin(angle)*44,'ring',.42,85,'#d6c9a7',undefined,{quake:true,groundY:foot.y,evolved:false,ally:true,seed:active.id});
    for(const enemy of targets){
      const delta=Math.atan2(Math.sin(Math.atan2(enemy.y-active.y,enemy.x-active.x)-angle),Math.cos(Math.atan2(enemy.y-active.y,enemy.x-active.x)-angle));
      if(Math.abs(delta)>rule.halfAngle)continue;
      if(enemy.type!=='boss'){
        if(enemy.charge){enemy.charge=null;enemy._chargeSegment=null;enemy.chargeCooldown=Math.max(enemy.chargeCooldown||0,rule.interrupt);}
        if(enemy.cast){enemy.cast=null;enemy.castCooldown=Math.max(enemy.castCooldown||0,rule.interrupt);}
      }
      g._hitEnemy(enemy,rule.damage*(1+Math.floor(g.time/rule.growthPeriod)*rule.growth),rule.knockback,active,'companionGolem');
    }
    active._attack=rule.cooldown;return true;
  }
  resolve() {
    const g=this.game;if(g.status!=='playing')return;
    this._join();
    for(const active of this.combatants()){
      const ready=active._echoes.filter(e=>e.life<=0);active._echoes=active._echoes.filter(e=>e.life>0);
      for(const echo of ready)if(echo.regionIndex===g.regionIndex)this._quake(echo.x,echo.y,echo.r,echo.damage,true,active.id);
      if(active._attack<=0){
        const cast=active.kind==='stormcaller'?this._castLightning(active):active.kind==='warden'?this._castQuake(active):active.kind==='golem'?this._castGolem(active):false;
        if(!cast)active._attack=COMPANION_RULES.retryAttackDelay;
      }
    }
  }
  onSceneChange(arrival=null) {
    this.game._friendlySnapshot=null;const p=this._foot();
    for(const active of this.members){active._echoes=[];active.workTarget=null;active._meleeTarget=null;active.scoutTarget=null;active.treasureTarget=null;active.scoutCount=0;active.cue='';active._scan=0;active.x=p.x;active.y=p.y-active.groundOffset;this._resetFollowing(active);}
    const placed=[],members=arrival?[...this.members].sort((a,b)=>b.r-a.r):this.members;
    for(const active of members){if(!arrival||!this._placeAtDoor(active,arrival,placed))this._safeReturn(active);placed.push(active);}
  }
  onRegionChange() {
    this._clearCamp();this.nextAt=Math.max(this.nextAt,this.game.time+RESCUE_RULES.firstAt);this.onSceneChange();
  }
}
