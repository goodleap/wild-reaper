import { Terrain, groundOffset } from './terrain.js';
import { Adventure } from './adventure.js';
import { Encounters } from './encounters.js';
import { initBoss, updateBloomBoss, resolveBloomBoss, clearBossAttacks } from './bosses.js';
import { HEROES, getHero } from './heroes.js';
import { CombatStatus } from './combat-status.js';
import { Environment } from './environment.js';
import { REGIONS, Regions, regionFor, regionEnemyType } from './regions.js';
import { Elites } from './elites.js';
import { Relics, RELICS } from './relics.js';
import { Companions, COMPANIONS } from './companions.js';
import { WEAPON_BRANCHES, BRANCH_WEAPONS, branchDefinition, isBranchReady } from './weapon-branches.js';
import { resetLocomotion, updateLocomotion } from './locomotion.js';
import { SuperSkills, SUPER_SKILLS } from './super-skills.js';
import { Dungeon } from './dungeon.js';
import { Settlements } from './settlements.js';
import { WaveDirector } from './wave-director.js';
import { RelicSites } from './relic-sites.js';
export { HEROES, REGIONS, RELICS, COMPANIONS, WEAPON_BRANCHES, SUPER_SKILLS };

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const sq = (v) => v * v;
const dist2 = (a, b) => sq(a.x - b.x) + sq(a.y - b.y);
// Visual variation must never consume the combat/loot random stream.
const feedbackSeed = (x,y,time,id=0) => (Math.imul(Math.round(x*16),73856093)^Math.imul(Math.round(y*16),19349663)^Math.imul(Math.round(time*1000),83492791)^Math.imul(id|0,2654435761))>>>0;
const HIT_COLORS=Object.freeze({arrow:'#e8f3ad',orbit:'#f2d492',lightning:'#cce9ff',companionLightning:'#cce9ff',storm:'#d4e7ff',conduction:'#c4e8ff',pulse:'#b9dca0',echo:'#c6ead5',companionPulse:'#b9dca0',companionEcho:'#c6ead5',bleed:'#e8a486',mushroom:'#ffbd70',super:'#ead4aa',relic:'#ddc8f5'});
function circleImpact(x,y,dx,dy,cx,cy,r) {
  const ox=x-cx,oy=y-cy,c=ox*ox+oy*oy-r*r;if(c<=0)return 0;
  const a=dx*dx+dy*dy;if(a<1e-12)return Infinity;
  const b=2*(ox*dx+oy*dy),discriminant=b*b-4*a*c;if(discriminant<0)return Infinity;
  const t=(-b-Math.sqrt(discriminant))/(2*a);return t>=0&&t<=1?t:Infinity;
}
function obstacleImpact(o,x,y,dx,dy,r) {
  const angle=o.angle||0,half=o.type==='log'?o.halfLength:0,ux=Math.cos(angle),uy=Math.sin(angle);
  const ax=o.x-ux*half,ay=o.y-uy*half,bx=o.x+ux*half,by=o.y+uy*half,R=o.r+r;
  let first=Math.min(circleImpact(x,y,dx,dy,ax,ay,R),circleImpact(x,y,dx,dy,bx,by,R));
  if(half) {
    const along=(x-ax)*ux+(y-ay)*uy,normal=-(x-ax)*uy+(y-ay)*ux;
    const ds=dx*ux+dy*uy,dn=-dx*uy+dy*ux;
    if(along>=0&&along<=half*2&&Math.abs(normal)<=R)return 0;
    if(Math.abs(dn)>1e-12)for(const side of [-1,1]) {
      const t=(side*R-normal)/dn,s=along+ds*t;
      if(t>=0&&t<=1&&s>=0&&s<=half*2)first=Math.min(first,t);
    }
  }
  return first;
}
export const BALANCE=Object.freeze({firstXp:40,xpBase:110,xpLinear:65,xpCurve:8,firstBossAt:120,bossInterval:150,arrowDamage:32,arrowInterval:.38,arrowRange:420,magnet:105,spawnBase:1.05,spawnGrowth:.018,spawnMax:10.5,maxEnemyBullets:60,boarCap:5,sporeCap:4});
export function xpCost(level) {
  if(level<=1)return BALANCE.firstXp;
  const n=level-2;return Math.round(BALANCE.xpBase+BALANCE.xpLinear*n+BALANCE.xpCurve*Math.pow(n,1.3));
}
// Crystals retain the measured skill-choice pacing independently of kill XP.
export const crystalCost=(skillLevel)=>xpCost(skillLevel);
const UPGRADE_DEFS = [
  {id:'power',name:'锋芒',desc:'所有武器伤害提升 25%',kind:'被动强化',icon:'✦',color:'#e6be73'},
  {id:'rapid',name:'疾风连射',desc:'翠羽飞矢攻击速度提升 15%',kind:'武器强化',icon:'»',color:'#89d8ad'},
  {id:'multishot',name:'分裂箭',desc:'保留全伤主箭，每轮增加一支 60% 伤害的副箭',kind:'武器强化',icon:'⋔',color:'#a7dab7'},
  {id:'orbit',name:'环刃',desc:'环绕利刃附加流血，可由大地回响引爆',kind:'新武器',icon:'◈',color:'#f0d28a'},
  {id:'pulse',name:'大地回响',desc:'环形冲击波击退敌人；消耗流血时伤害增加 25%',kind:'新武器',icon:'◎',color:'#80d5bd'},
  {id:'lightning',name:'唤雷',desc:'连锁闪电附加 2.5 秒感电，飞矢或环刃命中可向附近敌人传导',kind:'新武器',icon:'ϟ',color:'#b6bafa'},
  {id:'speed',name:'轻盈步伐',desc:'移动速度提升 8%，更轻松穿过兽群',kind:'被动强化',icon:'↗',color:'#9acbcc'},
  {id:'magnet',name:'林间引力',desc:'灵晶和金币拾取范围增加 35%',kind:'被动强化',icon:'✧',color:'#a1cf98'},
  {id:'vitality',name:'古树之心',desc:'最大生命增加 25，并恢复 35 生命',kind:'生存强化',icon:'♥',color:'#e7a68b'},
  {id:'regen',name:'生生不息',desc:'每秒恢复 0.8 生命',kind:'生存强化',icon:'✚',color:'#a4dc9d'}
];
const LEVEL_CAPS = {power:6,rapid:5,multishot:3,orbit:5,pulse:5,lightning:5,speed:4,magnet:4,vitality:5,regen:3};
export const EVOLUTIONS=Object.freeze({
  orbit:{name:'裂风环刃',desc:'每 3 秒向外扩张再收拢，扩大环刃的切割范围'},
  pulse:{name:'双重回响',desc:'冲击波后在原位置追加一道范围更大的回波，造成 60% 伤害'},
  lightning:{name:'雷暴链',desc:'最多追击 5 个目标，新增的两次跳跃造成 40% 伤害'}
});
const ENDLESS_UPGRADES = [
  {id:'endlessPower',name:'百炼锋芒',desc:'本局所有武器基础伤害增加 8%',kind:'无尽强化',icon:'✦',color:'#e6be73'},
  {id:'endlessVitality',name:'深根之心',desc:'本局最大生命增加 12，并恢复 24 生命',kind:'无尽强化',icon:'♥',color:'#e7a68b'},
  {id:'endlessRegen',name:'林泉赐福',desc:'本局每秒生命恢复量增加 0.3',kind:'无尽强化',icon:'✚',color:'#a4dc9d'}
];

export class Game {
  constructor({difficulty='normal',hero='traveler',terrain=new Terrain(),adventure=true,encounters=adventure,environment=adventure,elites=adventure,companions=adventure,settlements=adventure,debug=false}={}) {
    this.terrain=terrain;
    this.debug=debug===true;
    this.regionIndex=0;this.region=regionFor(0);this.portal=null;this.regionGrace=0;this.regionTransition=null;
    this._features={adventure:!!adventure,encounters:!!encounters,environment:!!environment,elites:!!elites,settlements:!!settlements,companions:!!companions};this._interactHeld=false;
    this.difficulty = difficulty;
    this.easy = difficulty === 'casual' || difficulty === 'easy';
    this.hero=getHero(hero);
    this.status = 'playing'; this.time = 0; this.runTime=0; this.kills = 0; this.wave = 1;
    this.pressurePhase='steady';this.phaseEndsAt=20;
    this.viewWidth = 1100; this.viewHeight = 650;
    const maxHp=Math.round((this.easy?140:100)*this.hero.hpMultiplier);
    this.player = {x:0,y:0,r:15,hp:maxHp,maxHp,speed:this.hero.baseSpeed,heroId:this.hero.id,level:1,xp:0,xpNext:xpCost(1),invuln:0,skillCooldown:0,skillCooldownMax:this.debug?0:this.hero.skillCooldown,facing:0};
    resetLocomotion(this.player);
    this.skillLevel=1;this.crystals=0;this.crystalsNext=crystalCost(1);this.gold=0;this.coins=[];
    this.enemies = []; this.bullets = []; this.enemyBullets=[];this.gems = []; this.effects = []; this.orbitals = []; this.events = [];
    this.storm = null;
    this.bossSpawned = false; this.bossDefeated = false;
    this.nextBossAt = BALANCE.firstBossAt; this.bossCount = 0; this.bossKills = 0;
    this.levels = Object.fromEntries([...UPGRADE_DEFS,...ENDLESS_UPGRADES].map(u => [u.id, 0]));
    this.rescuePower=0;
    this.weapons = [{id:'arrow',name:'翠羽飞矢',level:1,icon:'➶'}];
    this.stats = {damage:1,fireRate:1,moveSpeed:1,magnet:BALANCE.magnet};
    this._id = 0; this._clock = 0; this._shot = .15; this._spawn = .4;
    this._pulse = 1; this._lightning = 1; this._choices = null;
    this.evolutions={orbit:false,pulse:false,lightning:false};this._pulseEchoes=[];
    this.branches={arrow:null,pulse:null,lightning:null};this._branchOfferCursor=0;this._branchOfferWeapon=null;
    this._refreshStats();this._refreshWeapons();
    this._grid = new Map(); this._cell = 86; this._pendingLevels = 0;
    this._moveEntity(this.player,0,0,true);
    for(let i=0;i<4;i++) this._spawnEnemy('slime', 330 + i * 24);
    this.adventure=adventure?new Adventure(this):null;
    this.encounters=encounters?new Encounters(this):null;
    this.combatStatus=new CombatStatus(this);
    // Reserve the nearby debug entrance before environmental hazards choose
    // their positions. The ordinary world keeps its original generation order.
    if(this.debug&&settlements)this.settlements=new Settlements(this);
    this.environment=environment?new Environment(this):null;
    this.relics=new Relics(this);this.regions=new Regions(this);this.elites=new Elites(this,{generation:elites});
    this.companions=new Companions(this,{generation:companions});
    this.superSkills=new SuperSkills(this);this.dungeon=new Dungeon(this);
    this.settlements??=new Settlements(this,{generation:settlements});
    this.waveDirector=new WaveDirector(this);
    this.discoveredMap=new Set();this.regions.initialize();
    this.relicSites=new RelicSites(this,{generation:!!(adventure&&(encounters||companions))});
    this.settlements.ensureAngels?.();
    // A debug run gets a one-time testing budget; choices still use the
    // ordinary crystal thresholds and begin on the first gameplay update.
    if(this.debug)this.grantResources({gold:500,crystals:150},'debugStart');
  }

  _emit(type,extra={}) { if (this.events.length < 100) this.events.push({type,...extra}); }
  _effect(x,y,type,life,r,color,text,extra={}) {
    // A screen clear can defeat hundreds of enemies at once. Keep the newest
    // ordinary bursts while allowing a boss's longer farewell to finish.
    if(type==='defeat'&&this.effects.filter(e=>e.type==='defeat').length>=24) {
      let oldest=this.effects.findIndex(e=>e.type==='defeat'&&!e.boss);
      if(oldest<0) {
        if(!extra.boss)return;
        oldest=this.effects.findIndex(e=>e.type==='defeat');
      }
      this.effects.splice(oldest,1);
    }
    while(this.effects.length>=200) {
      const oldest=this.effects.findIndex(e=>e.type!=='defeat'||!e.boss);
      this.effects.splice(Math.max(0,oldest),1);
    }
    this.effects.push({x,y,type,life,maxLife:life,r,color,text,seed:feedbackSeed(x,y,this._clock),...extra});
  }
  _damageMultiplier() { return (1 + this.levels.power * .25 + this.levels.endlessPower * .08 + this.rescuePower * .08 + (this.player.level-1)*.01)*(this.adventure?.damageMultiplier()||1)*(this.relics?.damageMultiplier()||1); }
  _inView(entity,margin=0) {
    const dx=Math.max(0,Math.abs(entity.x-this.player.x)-this.viewWidth*.5-margin);
    const dy=Math.max(0,Math.abs(entity.y-this.player.y)-this.viewHeight*.5-margin);
    return dx*dx+dy*dy<=sq(entity.r||0);
  }
  _castStorm() {
    const p=this.player, halfW=this.viewWidth*.5, halfH=this.viewHeight*.5;
    const targets=this.enemies.filter(e=>{
      if(e.hp<=0||(e.dungeonId&&!this.dungeon.canDamage(e,p))) return false;
      const dx=Math.max(0,Math.abs(e.x-p.x)-halfW), dy=Math.max(0,Math.abs(e.y-p.y)-halfH);
      return dx*dx+dy*dy<=e.r*e.r;
    });
    p.skillCooldown=this.debug?0:p.skillCooldownMax;
    // This separate snapshot keeps every strike visible after enemies die or
    // the generic particle cap trims hit effects during a crowded screen clear.
    this.storm={x:p.x,y:p.y,viewWidth:this.viewWidth,viewHeight:this.viewHeight,life:.65,maxLife:.65,targets:targets.map(e=>({x:e.x,y:e.y,r:e.r,seed:e.id}))};
    this._emit('skill');
    for(const e of targets) {
      this._hitEnemy(e,160*this._damageMultiplier(),0,p,'storm');
      this._effect(e.x,e.y,'thunder',.6,e.r,'#d4e7ff');
    }
    this.environment?.hitAllVisible('storm');
    this._effect(p.x,p.y,'ring',.45,95,'#d4e7ff');
  }
  _nearest(x,y,range=BALANCE.arrowRange,exclude,originEntity=null) {
    const origin=originEntity||{x,y,groundY:y+groundOffset(this.player,true)};
    let best=null, d=range*range;
    for(const e of this.enemies) if(e.hp>0 && this._inView(e) && !exclude?.has(e.id)&&(!e.dungeonId||this.dungeon.canDamage(e,origin))) {
      const n=sq(e.x-x)+sq(e.y-y); if(n<d) { d=n; best=e; }
    }
    return best;
  }
  _spawnEnemy(type, radius, angle) {
    const p=this.player, t=this.time, a=Number.isFinite(angle)?angle:rand(0,TAU);
    const halfW=Math.max(390,this.viewWidth*.5+65),halfH=Math.max(290,this.viewHeight*.5+65);
    const edge=1/Math.max(Math.abs(Math.cos(a))/halfW,Math.abs(Math.sin(a))/halfH);
    const distance=radius || edge;
    const defs={slime:[16,26,85,9,4],beetle:[18,43,100,12,6],bat:[11,24,145,7,4],brute:[26,115,60,17,13],boar:[22,80,75,14,7],spore:[20,65,55,12,7],boss:[49,this.easy?1700:2300,49,22,160]};
    const [r,hp,speed,damage,xp]=defs[type];
    const lateMinutes=Math.max(0,t-150)/60, bossIndex=Math.max(1,this.bossCount);
    // Density and movement stay bounded; health and contact damage keep rising.
    const endurance=Math.max(0,t-300)/60;
    const health=hp*(type==='boss'?1+(bossIndex-1)*.65+sq(bossIndex-1)*.12:1+Math.min(t,300)*.0018+endurance*.13+Math.pow(endurance,1.25)*.05);
    const danger=type==='boss'?1+(bossIndex-1)*.3:1+lateMinutes*.18;
    const enemy={id:++this._id,x:p.x+Math.cos(a)*distance,y:p.y+Math.sin(a)*distance,r,hp:health,maxHp:health,type,hit:0,speed:speed*Math.min(1.85,1+t*.0006)*(this.easy?.9:1),damage:damage*danger*(this.easy?.72:1),xp:Math.round(xp*(type==='boss'?1+(bossIndex-1)*.3:1+lateMinutes*.055)),bossIndex:type==='boss'?bossIndex:undefined,wave:this.wave,phase:rand(0,TAU),orbitHit:0,attackCooldown:0,slamCooldown:0,slamRecovery:0,slam:null,charge:null,chargeCooldown:1.5,cast:null,castCooldown:1};
    this._moveEntity(enemy,0,0);
    if(!radius)for(let i=0;i<6&&this._inView(enemy);i++) {
      enemy.x=p.x+Math.cos(a)*(distance+85*(i+1));enemy.y=p.y+Math.sin(a)*(distance+85*(i+1));
      this._moveEntity(enemy,0,0);
    }
    if(type==='boss')initBoss(enemy);
    this.enemies.push(enemy);return enemy;
  }
  _hitEnemy(enemy,amount,knockback=0,origin=this.player,source='arrow') {
    return this.combatStatus.hit(enemy,amount,knockback,origin,source);
  }
  _hurtEnemy(enemy,amount,knockback=0,origin=this.player,source='raw') {
    if(enemy.hp<=0||!Number.isFinite(amount)||amount<=0)return 0;
    if(enemy.dungeonId&&!this.dungeon.canDamage(enemy,origin))return 0;
    if(this.regions&&!this.regions.canDamage(enemy))return 0;
    amount=this.elites?.beforeDamage(enemy,amount)??amount;
    if(amount<=0)return 0;
    const actual=Math.min(enemy.hp,amount);
    const angle=Math.atan2(enemy.y-(Number.isFinite(origin?.y)?origin.y:enemy.y),enemy.x-(Number.isFinite(origin?.x)?origin.x:enemy.x));
    const strength=clamp(actual/Math.max(1,enemy.maxHp||actual)*3,0,1),color=HIT_COLORS[source]||'#e8f3ad';
    const seed=feedbackSeed(0,0,this._clock,enemy.id);
    enemy.hp -= amount; enemy.hit = .12;
    enemy.hitAngle=angle;enemy.hitSource=source;enemy.hitStrength=strength;
    if(knockback && enemy.type!=='boss') {
      const dx=enemy.x-origin.x,dy=enemy.y-origin.y,d=Math.hypot(dx,dy)||1;
      this._moveEntity(enemy,dx/d*knockback,dy/d*knockback);
      if(enemy.charge?.phase==='windup'){enemy.charge.startX=enemy.x;enemy.charge.startY=enemy.y+groundOffset(enemy);}
    }
    this._effect(enemy.x,enemy.y,'hit',.24,enemy.r*.7,color,undefined,{source,angle,strength,seed});
    if(Math.random()<.24 || enemy.type==='boss') this._effect(enemy.x+rand(-8,8),enemy.y-enemy.r,'damage',.65,0,'#f1e4aa',String(Math.round(amount)));
    if(enemy.hp<=0) {
      enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;
      this._effect(enemy.x,enemy.y,'defeat',enemy.type==='boss'?.95:.5,enemy.r,color,undefined,{enemyType:enemy.type,source,boss:enemy.type==='boss',angle,strength,seed});
      this.kills++; this._emit('kill');
      // Kill XP is automatic. Loot is a separate skill/currency resource and
      // never opens a modal in the middle of an attack's target loop.
      if(enemy.xp>0&&!enemy.summoned) {
        this.addExperience(enemy.xp);
        if(enemy.type!=='boss') {
          this.dropCrystals(enemy.x,enemy.y,enemy.xp);
          if(enemy.affix)this.dropGold(enemy.x+9,enemy.y,3);
          else if(Math.random()<.08)this.dropGold(enemy.x+9,enemy.y,1);
        }
      }
      this.waveDirector?.onEnemyKilled(enemy);
      this.dungeon.onEnemyKilled(enemy);
      this.settlements.onEnemyKilled(enemy);
      if(enemy.type==='boss') {
        enemy.slam=null;clearBossAttacks(enemy);
        this._effect(enemy.x,enemy.y,'ring',1.1,170,'#f2d482');
        if(!enemy.dungeonBoss&&!enemy.dungeonId) {
          this.bossDefeated=true;this.bossKills++;this._emit('bossKill');
          this.grantResources({gold:30,crystals:45},'regionalBoss');this.regions.openPortal(enemy);
        }
      }
      this.adventure?.onEnemyKilled(enemy);
      this.encounters?.onEnemyKilled(enemy);
      this.companions?.onEnemyKilled(enemy);
      this.relics?.onEnemyKilled(enemy,source);
      if(this.kills%24===0 && this.player.hp<this.player.maxHp) {
        this.player.hp=Math.min(this.player.maxHp,this.player.hp+7);
        this._effect(this.player.x,this.player.y-26,'heal',.8,0,'#b9e89c','+7'); this._emit('heal');
      }
    }
    return actual;
  }
  _rebuildGrid() {
    this._grid.clear();
    for(const e of this.enemies) if(e.hp>0) {
      const key=`${Math.floor(e.x/this._cell)},${Math.floor(e.y/this._cell)}`;
      if(!this._grid.has(key)) this._grid.set(key,[]);
      this._grid.get(key).push(e);
    }
  }
  _nearby(x,y,r=70) {
    const found=[];
    for(let i=Math.floor((x-r)/this._cell);i<=Math.floor((x+r)/this._cell);i++)
      for(let j=Math.floor((y-r)/this._cell);j<=Math.floor((y+r)/this._cell);j++) {
        const cell=this._grid.get(`${i},${j}`); if(cell) found.push(...cell);
      }
    return found;
  }
  _moveEntity(entity,dx,dy,isPlayer=false) {
    const offset=groundOffset(entity,isPlayer||entity.isCompanion),moved=this.terrain.moveCircle(entity.x,entity.y+offset,dx,dy,entity.r);
    entity.x=moved.x;entity.y=moved.y-offset;return moved;
  }
  _moveEnemy(e,dt,target=null) {
    const x=e.x,y=e.y+groundOffset(e,!!e.isCompanion),tx=target?.x??this.player.x,ty=target?.y??this.player.y+groundOffset(this.player,true);
    const dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy)||1;
    let nx=dx/d,ny=dy/d,detouring=false;
    e._navTimer=(e._navTimer||0)-dt;
    if(e._navTimer<=0) {
      e._navTimer=.16+(e.id%4)*.025;
      const obstacle=this.terrain.firstBlocker(x,y,tx,ty,e.r+3);
      if(obstacle?.id!==e._navObstacle?.id)e._navSide=0;
      e._navObstacle=obstacle;
    }
    const obstacle=e._navObstacle;
    if(obstacle) {
      const q=this.terrain.closestPoint(obstacle,x,y),ox=x-q.x,oy=y-q.y,od=Math.hypot(ox,oy)||1;
      const radius=obstacle.r+e.r+8;
      if(od<radius+80) {
        const outwardX=ox/od,outwardY=oy/od;
        if(!e._navSide) {
          const preference=-outwardY*nx+outwardX*ny;
          e._navSide=Math.abs(preference)>.08?Math.sign(preference):e.id%2?1:-1;
        }
        // Continuously advancing a tangent target carries enemies around both
        // circular trunks and a fallen trunk's end caps, instead of parking them.
        const lookahead=clamp(radius*.8,26,62);
        const wx=q.x+outwardX*radius-outwardY*e._navSide*lookahead;
        const wy=q.y+outwardY*radius+outwardX*e._navSide*lookahead;
        const wd=Math.hypot(wx-x,wy-y)||1;nx=(wx-x)/wd;ny=(wy-y)/wd;detouring=true;
      }
    }
    const wobble=!detouring&&e.type==='bat'?Math.sin(this._clock*5+e.phase)*.52:0;
    const speed=e.speed*(e.type==='boss'?1+Math.max(0,Math.sin(this._clock*.85))*1.15:1)*(this.environment?.movementMultiplier(e,!!e.isCompanion)||1)*(this.elites?.movementMultiplier(e)||1)*this._branchMovementMultiplier(e);
    this._moveEntity(e,(nx-ny*wobble)*speed*dt,(ny+nx*wobble)*speed*dt);
    e._navProgressTimer=(e._navProgressTimer||0)+dt;
    if(e._navProgressTimer>.9) {
      if(detouring&&Number.isFinite(e._navProgressX)&&Math.hypot(e.x-e._navProgressX,e.y-e._navProgressY)<2)e._navSide*=-1;
      e._navProgressX=e.x;e._navProgressY=e.y;e._navProgressTimer=0;
    }
  }
  _updatePressure(dt=0) { this.waveDirector.update(dt); }
  _hurtPlayer(amount) {
    const p=this.player;if(p.invuln>0||this.status!=='playing'||!Number.isFinite(amount)||amount<=0)return false;
    amount=this.relics?.modifyIncomingDamage(amount)??amount;
    p.hp=Math.max(0,p.hp-amount);p.invuln=.8;this._emit('hurt');
    this._effect(p.x,p.y,'ring',.3,42,'#e48d78');
    if(p.hp<=0)this.status='dead';return true;
  }
  _updateBoss(e,dt) {
    if(e.bossKind==='bloom')return updateBloomBoss(this,e,dt);
    e.slamCooldown=Math.max(0,(e.slamCooldown||0)-dt);
    e.slamRecovery=Math.max(0,(e.slamRecovery||0)-dt);
    if(e.slam){e.slam.life=Math.max(0,e.slam.life-dt);return true;}
    if(e.slamRecovery>0)return true;
    const x=e.x,y=e.y+groundOffset(e),p=this.player;
    if(e.slamCooldown<=0&&Math.hypot(x-p.x,y-p.y-groundOffset(p,true))<=165) {
      e.slam={x,y,r:115,life:1,maxLife:1};e.slamCooldown=7;this._emit('bossWindup');return true;
    }
    return false;
  }
  _resolveBossSlams() {
    for(const e of this.enemies)if(e.type==='boss'&&e.hp>0&&e.slam&&e.slam.life<=0) {
      const slam=e.slam;e.slam=null;e.slamRecovery=.3;
      this._effect(slam.x,slam.y,'bossSlam',.5,slam.r,'#edaa78');this._emit('bossSlam');
      const p=this.player;
      if(Math.hypot(p.x-slam.x,p.y+groundOffset(p,true)-slam.y)<slam.r+p.r)this._hurtPlayer(e.damage*1.3);
    }
  }
  _updateBoar(e,dt) {
    e.chargeCooldown=Math.max(0,(e.chargeCooldown||0)-dt);e._chargeSegment=null;
    const charge=e.charge;
    if(charge) {
      charge.life=Math.max(0,charge.life-dt);
      if(charge.phase==='windup') {
        if(charge.life<=0){charge.phase='rush';charge.life=charge.maxLife=.8;}
        return true;
      }
      if(charge.phase==='stunned') {if(charge.life<=0)e.charge=null;return true;}
      const x=e.x,y=e.y+groundOffset(e);
      const speed=320*(this.environment?.movementMultiplier(e)||1)*this._branchMovementMultiplier(e);
      const movement=this._moveEntity(e,charge.dx*speed*dt,charge.dy*speed*dt);
      e._chargeSegment={x,y,x2:e.x,y2:e.y+groundOffset(e)};
      if(movement.blocked) {
        charge.phase='stunned';charge.life=charge.maxLife=1.2;this._emit('boarStun');
        this._effect(e.x,e.y,'ring',.3,35,'#ead59c');
      } else if(charge.life<=0)e.charge=null;
      return true;
    }
    const p=this.player,x=e.x,y=e.y+groundOffset(e),dx=p.x-x,dy=p.y+groundOffset(p,true)-y,d=Math.hypot(dx,dy);
    if(e.chargeCooldown<=0&&d>=90&&d<=320&&this._inView(e)) {
      e.charge={phase:'windup',life:.8,maxLife:.8,dx:dx/d,dy:dy/d,startX:x,startY:y,length:256};
      e.chargeCooldown=4.5;this._emit('boarWindup');return true;
    }
    return false;
  }
  _updateSpore(e,dt) {
    e.castCooldown=Math.max(0,(e.castCooldown||0)-dt);
    if(e.cast){e.cast.life=Math.max(0,e.cast.life-dt);return true;}
    const p=this.player,dx=p.x-e.x,dy=p.y+groundOffset(p,true)-e.y-groundOffset(e),distance=Math.hypot(dx,dy);
    if(this._inView(e)&&distance<=360) {
      if(e.castCooldown<=0){e.cast={life:.65,maxLife:.65,angle:Math.atan2(dy,dx)};e.castCooldown=3.8;this._emit('sporeWindup');return true;}
      if(distance<=290)return true;
    }
    return false;
  }
  _resolveEnemyAttacks(dt) {
    const p=this.player,px=p.x,py=p.y+groundOffset(p,true);
    for(const e of this.enemies)if(e.hp>0&&e.guardActive!==false) {
      if(e._chargeSegment) {
        const s=e._chargeSegment;
        if(circleImpact(s.x,s.y,s.x2-s.x,s.y2-s.y,px,py,e.r+p.r)<Infinity)this._hurtPlayer(e.damage*1.3);
        e._chargeSegment=null;
      }
      if(e.type==='spore'&&e.cast&&e.cast.life<=0) {
        const cast=e.cast;e.cast=null;
        if(this._inView(e)&&Math.hypot(px-e.x,py-e.y-groundOffset(e))<=430&&this.enemyBullets.length<BALANCE.maxEnemyBullets) {
          this.enemyBullets.push({id:++this._id,type:'spore',x:e.x,y:e.y+groundOffset(e),r:6,vx:Math.cos(cast.angle)*140,vy:Math.sin(cast.angle)*140,life:4.5,maxLife:4.5,color:'#d4a4e5',damage:e.damage});
          this._emit('sporeShot');
        }
      }
    }
    for(const b of this.enemyBullets) {
      if(b.life<=0)continue;
      const dx=b.vx*dt,dy=b.vy*dt;
      let terrainHit=Infinity;
      for(const o of this.terrain.query(Math.min(b.x,b.x+dx)-b.r,Math.min(b.y,b.y+dy)-b.r,Math.max(b.x,b.x+dx)+b.r,Math.max(b.y,b.y+dy)+b.r))
        terrainHit=Math.min(terrainHit,obstacleImpact(o,b.x,b.y,dx,dy,b.r));
      const playerHit=circleImpact(b.x,b.y,dx,dy,px,py,p.r+b.r);
      if(playerHit<terrainHit){this._hurtPlayer(b.damage);b.life=0;}
      else if(terrainHit<Infinity)b.life=0;
      else{b.x+=dx;b.y+=dy;b.life-=dt;}
    }
    this.enemyBullets=this.enemyBullets.filter(b=>b.life>0);
  }

  _initializeRegionalBoss(boss){initBoss(boss);}
  _clearRegionalBossAttacks(boss){boss.slam=null;boss.charge=null;boss.cast=null;boss._chargeSegment=null;clearBossAttacks(boss);}
  canEnterPortal(id) { return !this.dungeon.active&&this.regions.canEnter(id); }
  getInteraction() {
    if(this.status!=='playing')return null;
    if(this.dungeon.active)return this.dungeon.getInteraction();
    const candidates=[];
    const settlement=this.settlements.getInteraction();if(settlement)candidates.push(settlement);
    const portal=this.regions.getInteraction();if(portal)candidates.push(portal);
    const relic=this.relicSites?.getInteraction();if(relic)candidates.push(relic);
    const p=this.player,footY=p.y+groundOffset(p,true);
    return candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.y-footY)-Math.hypot(b.x-p.x,b.y-footY))[0]||null;
  }
  interact(id) {
    const interaction=this.getInteraction();
    if(!interaction||interaction.enabled===false||(id!==undefined&&id!==interaction.id))return false;
    if(this.dungeon.active)return this.dungeon.interact(interaction.id);
    if(interaction.category==='relic'||interaction.type==='relic')return !!this.relicSites?.interact(interaction.id);
    return interaction.type==='portal'?this.enterPortal(interaction.id):this.settlements.interact(interaction.id);
  }
  enterPortal(id) {
    if(!this.canEnterPortal(id))return false;
    return this._switchRegion(this.regions._portal(id));
  }
  getSuperChoices() {return this.superSkills.getChoices();}
  chooseSuper(id) {
    if(this.status!=='super')return false;
    const pending=this.superSkills.pending;
    if(!pending)return false;
    if(pending.source==='region'&&(!this.regions.rewardPortal||pending.regionId!==this.region.id))return false;
    if(pending.source==='castle'&&(!this.dungeon.active?.bossDefeated||!this.dungeon.active.rewardPending||this.dungeon.active.rewardClaimed))return false;
    if(!this.superSkills.choose(id))return false;
    if(pending.source==='region')this.regions.completeReward();
    else this.dungeon.completeReward();
    if(this.status==='super')this.status='playing';
    this._trySkillUpgrade();return true;
  }
  getShopItems(){return this.settlements.getShopItems();}
  buyShopItem(id){
    if(this.status!=='shop'||!this.settlements.buy(id))return false;
    this._trySkillUpgrade();return true;
  }
  closeShop(){
    if(this.status!=='shop')return false;
    const result=this.settlements.closeShop();this._trySkillUpgrade();return result!==false;
  }
  getRelicChoices() { return this.relics.getChoices(); }
  chooseRelic(id) {
    if(this.status!=='relic'||!this.relics.choose(id))return false;
    this.status='playing';this._trySkillUpgrade();return true;
  }
  _switchRegion(portal=this.portal) {
    if(!portal||!Number.isInteger(portal.nextRegionIndex)||this.dungeon.active)return false;
    const from=this.region.id,fromIndex=this.regionIndex,p=this.player;
    const furyTime=this.adventure?.furyTime||0,magnetTime=this.adventure?.magnetTime||0;
    // Clear only transient attacks. Persistent sites and surviving objective
    // guards remain in a suspended per-region snapshot for return journeys.
    for(const enemy of this.enemies){this._clearRegionalBossAttacks(enemy);enemy._navTimer=0;enemy._navObstacle=null;}
    this.superSkills.clearScene();this.regions.saveWorld();
    this.regionIndex=portal.nextRegionIndex;this.region=regionFor(this.regionIndex);this.portal=null;this.regions.portals=[];
    this.status='playing';this.regionGrace=2;this.sceneKind='world';
    this.regionTransition={life:.7,maxLife:.7,name:this.region.name,from,to:this.region.id};
    this.bullets=[];this.enemyBullets=[];this.effects=[];this.orbitals=[];this.storm=null;this._pulseEchoes=[];this._grid.clear();this._choices=null;
    this.events=this.events.filter(e=>e.type==='relicChosen'||e.type==='relicSupply'||e.type==='superChosen');
    this._spawn=2;this._shot=BALANCE.arrowInterval/(1+this.levels.rapid*.15);this._pulse=2.6;this._lightning=2.8;
    p.x=0;p.y=0;p.invuln=Math.max(p.invuln,2);
    if(!this.regions.restoreWorld(this.regionIndex)) {
      this.terrain=new Terrain({region:this.region.id,seed:this.regionIndex});this.enemies=[];this.gems=[];this.coins=[];
      this.environment=null;this.adventure=null;this.encounters=null;this.settlements=null;this.relicSites=null;this.discoveredMap=new Set();
      this.companions.camp=null;this.companions.generation=this._features.companions;this.companions.nextAt=this.time+35;
      this.dungeon.resetRegion();
      this._moveEntity(p,0,0,true);
      if(this._features.adventure)this.adventure=new Adventure(this);
      if(this._features.encounters)this.encounters=new Encounters(this);
      if(this._features.environment)this.environment=new Environment(this);
      this.settlements=new Settlements(this,{generation:this._features.settlements});
      this.regions.initialize(portal,fromIndex);
      this.relicSites=new RelicSites(this,{generation:!!(this._features.adventure&&(this._features.encounters||this._features.companions))});
    }
    if(this.adventure){this.adventure.furyTime=furyTime;this.adventure.magnetTime=magnetTime;}
    const arrival=this.regions.portals.find(candidate=>candidate.id===portal.targetPortalId)||this.regions.portals.find(candidate=>candidate.nextRegionIndex===fromIndex);
    if(arrival) {
      // Land just in front of the paired gate, never at a different region's
      // coordinates. The interaction latch prevents an immediate bounce back.
      let point={x:arrival.x,y:arrival.y+90};
      for(const offset of [90,60,-60,-90,0])if(this.terrain.isFree(arrival.x,arrival.y+offset,p.r+4)){point={x:arrival.x,y:arrival.y+offset};break;}
      p.x=point.x;p.y=point.y-groundOffset(p,true);
    }
    this._moveEntity(p,0,0,true);resetLocomotion(p);
    const active=this.companions.active;if(active){active._echoes=[];active.x=p.x;active.y=p.y;this.companions._resetFollowing(active);this.companions._safeReturn(active);}
    this.waveDirector.reset();this.settlements.ensureAngels?.();this._refreshStats();this._refreshWeapons();
    this._emit('regionEnter',{regionId:this.region.id,name:this.region.name,regionIndex:this.regionIndex});return true;
  }

  update(dt,input={}) {
    this.regions.flushReward();
    if(this.status!=='playing') return;
    const interact=!!input.interact,pressed=interact&&!this._interactHeld;this._interactHeld=interact;
    if(pressed&&this.interact())return;
    dt=clamp(Number.isFinite(dt)?dt:0,0,.05);
    const p=this.player;
    const inDungeon=!!this.dungeon.active;
    if(!inDungeon)this.time+=dt;this.runTime+=dt;this._clock+=dt;
    this.regionGrace=Math.max(0,this.regionGrace-dt);
    if(this.regionTransition){this.regionTransition.life-=dt;if(this.regionTransition.life<=0)this.regionTransition=null;}
    this.relics.update(dt);
    if(!inDungeon){this.regions.update(dt);this._updatePressure(dt);}
    p.invuln=Math.max(0,p.invuln-dt); p.skillCooldown=this.debug?0:Math.max(0,p.skillCooldown-dt);
    this.environment?.update(dt);
    if(this.status==='dead')return;
    if(this.storm) { this.storm.life-=dt; if(this.storm.life<=0) this.storm=null; }
    let ix=Number.isFinite(input.x)?input.x:0,iy=Number.isFinite(input.y)?input.y:0;
    const length=Math.hypot(ix,iy); if(length>1) { ix/=length; iy/=length; }
    if(length>.01) p.facing=Math.atan2(iy,ix);
    const movement=this.environment?.movementMultiplier(p,true)||1;
    const oldX=p.x,oldY=p.y;
    this._moveEntity(p,ix*p.speed*movement*dt,iy*p.speed*movement*dt,true);
    updateLocomotion(p,oldX,oldY,dt);
    this.adventure?.update(dt);
    this.companions.update(dt);
    if(!inDungeon){this.encounters?.update(dt);this.settlements.update(dt);this.relicSites?.update(dt);}
    else this.dungeon.update(dt);
    if(this.levels.regen || this.levels.endlessRegen) p.hp=Math.min(p.maxHp,p.hp+(this.levels.regen*.8+this.levels.endlessRegen*.3)*dt);
    if(!inDungeon)this._spawn-=dt;
    if(!inDungeon&&this._spawn<=0&&this.regionGrace<=0&&this.pressurePhase==='steady') {
      // The authored cohort owns assault pressure. Exploration is lighter,
      // and a Boss gets space for its own readable attacks.
      const bossActive=this.enemies.some(e=>e.type==='boss'&&e.hp>0&&e.guardActive!==false);
      const rate=Math.min(4.5,BALANCE.spawnBase+this.time*.008)*(this.easy?.78:1)*(bossActive?.38:1);
      this._spawn=1/rate;
      if(this.enemies.length<180) {
        const enemy=this._spawnEnemy(regionEnemyType(this,Math.random()));
        this.elites.maybePromote(enemy);
      }
    }
    if(!inDungeon&&!this.regions.guarded&&!this.portal&&this.regionGrace<=0&&this.time>=this.nextBossAt && !this.enemies.some(e=>e.type==='boss'&&e.hp>0)) {
      this.bossSpawned=true; this.bossDefeated=false; this.bossCount++;
      this.nextBossAt=this.time+BALANCE.bossInterval;
      this._spawnEnemy('boss'); this._emit('boss');
    }
    for(const e of this.enemies) {
      if(e.hp<=0) continue;
      e.hit=Math.max(0,e.hit-dt); e.orbitHit=Math.max(0,e.orbitHit-dt); e.attackCooldown=Math.max(0,e.attackCooldown-dt);
      if(inDungeon&&this.dungeon.updateEnemy(e,dt))continue;
      if(!inDungeon&&this.regions.updateEnemy(e,dt))continue;
      if(this.companions.updateEnemy(e,dt))continue;
      if(this.elites.updateEnemy(e,dt))continue;
      if(this.encounters?.updateEnemy(e,dt))continue;
      if(e.guardActive===false) {
        e.charge=null;e.cast=null;e._chargeSegment=null;
        if(e.guardReturnTarget)this._moveEnemy(e,dt,e.guardReturnTarget);
        continue;
      }
      const handled=e.type==='boss'?this._updateBoss(e,dt):e.type==='boar'?this._updateBoar(e,dt):e.type==='spore'?this._updateSpore(e,dt):false;
      if(!handled)this._moveEnemy(e,dt);
    }
    this._rebuildGrid();
    // Soft separation keeps the horde readable while preserving dense swarms.
    for(const e of this.enemies) {
      if(e.hp<=0) continue;
      let count=0;
      for(const n of this._nearby(e.x,e.y,48)) {
        if(n.id<=e.id || count++>8) continue;
        const dx=e.x-n.x,dy=e.y-n.y,d=Math.hypot(dx,dy),overlap=(e.r+n.r)*.76-d;
        if(overlap>0 && d>.1) {
          const force=Math.min(overlap,30*dt)*.5;
          if(e.type!=='boss'&&!e.charge&&e.guardActive!==false)this._moveEntity(e,dx/d*force,dy/d*force);
          if(n.type!=='boss'&&!n.charge&&n.guardActive!==false)this._moveEntity(n,-dx/d*force,-dy/d*force);
        }
      }
    }
    if(input.skill && p.skillCooldown<=0) this._castStorm();
    for(const e of this._nearby(p.x,p.y,85)) {
      if(e.hp>0 && e.eventRole!=='treasure' && e.guardActive!==false && !e.charge && !e._chargeSegment && !e.slam && !(e.slamRecovery>0) && !e.bloomAttack && !(e.bloomRecovery>0) && p.invuln<=0 && dist2(p,e)<sq(p.r+e.r-3)) {
        this._hurtPlayer(e.damage);
        if(this.status==='dead')return;
      }
    }
    this._shot-=dt;
    if(this._shot<=0) {
      const enemy=this._nearest(p.x,p.y),supply=this.adventure?.nearestSupply(280),vine=this.environment?.nearestDestructible?.(280);
      const supplyDistance=supply?sq(supply.x-p.x)+sq((supply.aimY??supply.y)-p.y):Infinity;
      let target=supply&&(!enemy||(dist2(enemy,p)>180*180&&supplyDistance<dist2(enemy,p)))?supply:enemy;
      // Cut a nearby active vine before distant targets, while an enemy at
      // contact distance always takes priority over clearing the ground.
      if(vine&&(!enemy||dist2(enemy,p)>150*150))target=vine;
      if(target) {
        this._shot=BALANCE.arrowInterval/((1+this.levels.rapid*.15)*(this.adventure?.fireRateMultiplier()||1));
        const base=Math.atan2((target.aimY??target.y)-p.y,target.x-p.x), count=1+this.levels.multishot;
        this._volley=(this._volley||0)+1;
        for(let i=0;i<count;i++) {
          // Preserve the centered main arrow; only added side arrows are weaker.
          const angle=base+(i?Math.ceil(i/2)*.16*(i%2?1:-1)*(this._volley%2?1:-1):0);
          const branch=this.branches.arrow;
          this.bullets.push({x:p.x,y:p.y,r:4,angle,color:branch==='ricochet'?'#ead59b':branch==='pierce'?'#a5eed1':'#c3e9a4',vx:Math.cos(angle)*640,vy:Math.sin(angle)*640,life:.82,damage:BALANCE.arrowDamage*this._damageMultiplier()*(i?.6:1),branch,pierce:branch?3:1,bounces:0,hitIds:new Set()});
        }
        this._emit('shoot');
      } else this._shot=.06;
    }
    for(const b of this.bullets)this._updateArrow(b,dt);
    this.bullets=this.bullets.filter(b=>b.life>0&&this._inView(b,24));
    this._updateWeapons(dt);
    this.superSkills.update(dt);
    this.combatStatus.update(dt);
    this.companions.resolve();
    this.elites.resolve();
    // Every weapon can interrupt a windup with a killing blow on this frame.
    this._resolveBossSlams();
    for(const e of this.enemies)if(e.type==='boss'&&e.bossKind==='bloom')resolveBloomBoss(this,e);
    this._resolveEnemyAttacks(dt);
    if(this.status==='dead')return;
    this.enemies=this.enemies.filter(e=>e.hp>0 && (e.type==='boss'||e.dungeonId||e.elite||e.guardianId||e.eventId||e.rescueId||dist2(e,p)<sq(Math.max(this.viewWidth,this.viewHeight)*1.5+400)));
    this._collectDrops(this.gems,dt,'crystals');
    this._collectDrops(this.coins,dt,'gold');
    this.gems=this.gems.filter(g=>g.value>0);this.coins=this.coins.filter(c=>c.value>0);
    for(const e of this.effects) {e.life-=dt;if(e.type==='damage'||e.type==='heal')e.y-=dt*26;}
    this.effects=this.effects.filter(e=>e.life>0);
    this.regions.flushReward();this._trySkillUpgrade();
  }

  _updateArrow(b,dt) {
    if(b.life<=0)return;
    const elapsed=Math.min(dt,b.life);b.life-=dt;
    let remaining=elapsed;
    // A branch arrow can meet at most three different enemies. Sweep every
    // segment, including the remainder after a bounce, so frame rate and the
    // order of the enemy array cannot choose which target takes full damage.
    for(let segment=0;segment<3;segment++) {
      const x=b.x,y=b.y,dx=b.vx*remaining,dy=b.vy*remaining;
      let impact=null,first=Infinity,isSupply=false,wallHit=Infinity;
      // Project the flying arrow to the same ground plane as feet/walls.
      // Its body-space render position and enemy hit circles stay unchanged.
      const groundY=y+groundOffset(this.player,true);
      if(this.dungeon.active)for(const wall of this.terrain.query(Math.min(x,x+dx)-b.r,Math.min(groundY,groundY+dy)-b.r,Math.max(x,x+dx)+b.r,Math.max(groundY,groundY+dy)+b.r))wallHit=Math.min(wallHit,obstacleImpact(wall,x,groundY,dx,dy,b.r));
      first=wallHit;
      const nearby=this._nearby(x+dx*.5,y+dy*.5,Math.hypot(dx,dy)*.5+64);
      for(const e of nearby)if(e.hp>0&&!b.hitIds.has(e.id)) {
        const t=circleImpact(x,y,dx,dy,e.x,e.y,b.r+e.r+3);
        if(t<first||(t===first&&impact&&!isSupply&&e.id<impact.id)) {first=t;impact=e;isSupply=false;}
      }
      for(const prop of this.adventure?.props||[])if(prop.hp>0) {
        const t=circleImpact(x,y,dx,dy,prop.x,prop.aimY??prop.y,b.r+prop.r);
        if(t<first){first=t;impact=prop;isSupply=true;}
      }
      const fraction=Number.isFinite(first)?first:1;
      b.x=x+dx*fraction;b.y=y+dy*fraction;
      this.environment?.hitSegment(x,y,b.x,b.y,b.r,'arrow');
      if(!impact){if(Number.isFinite(wallHit))b.life=0;break;}
      if(isSupply) {this.adventure.hitSupply(impact,b.damage);b.life=0;break;}
      b.hitIds.add(impact.id);this._hitEnemy(impact,b.damage,4,{x,y,groundY},'arrow');this._emit('hit');
      if(--b.pierce<=0||b.hitIds.size>=3) {b.life=0;break;}
      remaining*=1-first;
      if(b.branch==='pierce'||b.branch==='ricochet')b.damage*=.65;
      if(b.branch==='ricochet') {
        const next=(b.bounces||0)<2?this._nearest(b.x,b.y,150,b.hitIds):null;
        if(!next){b.life=0;break;}
        b.bounces=(b.bounces||0)+1;
        b.angle=Math.atan2(next.y-b.y,next.x-b.x);b.vx=Math.cos(b.angle)*640;b.vy=Math.sin(b.angle)*640;
        b.life=Math.max(b.life,.25);
        this._effect(b.x,b.y,'arrowRicochet',.22,14,'#ead59b',undefined,{x2:next.x,y2:next.y,branch:'ricochet'});
      }
      if(remaining<=1e-9)break;
    }
  }

  _branchMovementMultiplier(enemy) {
    return (enemy.type!=='boss'&&!enemy.isCompanion&&(enemy.branchSlowUntil||0)>this._clock ? .65 : 1)*(this.superSkills?.movementMultiplier(enemy)??1);
  }

  _updateWeapons(dt) {
    this._syncEvolutions();
    const p=this.player, power=this._damageMultiplier(), level=this.levels.orbit;
    this.orbitals=[];
    if(level) {
      const count=2+Math.floor((level-1)/2),cycle=(this._clock-(this._orbitEvolutionStartedAt||0))%3;
      const surge=this.evolutions.orbit&&cycle<.9?Math.sin(Math.PI*cycle/.9):0;
      const radius=70+level*4+55*surge;
      for(let i=0;i<count;i++) {
        const a=this._clock*(2.15+level*.14)+i*TAU/count;
        const blade={x:p.x+Math.cos(a)*radius,y:p.y+Math.sin(a)*radius,r:12,angle:a,evolved:this.evolutions.orbit,surge};
        this.orbitals.push(blade);
        this.environment?.hitAt(blade.x,blade.y,blade.r,'orbit');
        for(const e of this._nearby(blade.x,blade.y,65)) if(e.hp>0&&e.orbitHit<=0&&dist2(e,blade)<sq(e.r+blade.r)) {
          this._hitEnemy(e,(24+level*6)*power,8,p,'orbit');e.orbitHit=.42;
        }
        for(const prop of this.adventure?.props||[])if(prop.hp>0&&(prop._orbitNext||0)<=this.time&&sq(prop.x-blade.x)+sq((prop.aimY??prop.y)-blade.y)<sq(prop.r+blade.r)) {
          this.adventure.hitSupply(prop,(24+level*6)*power);prop._orbitNext=this.time+.42;
        }
      }
    }
    // Echoes retain the original cast's position and damage. Their delay uses
    // game time, so upgrades and paused frames cannot detonate them early.
    for(const echo of this._pulseEchoes) {
      echo.life-=dt;
      if(echo.life<=0)this._castPulse(echo.x,echo.y,echo.r,echo.damage,12,true);
    }
    this._pulseEchoes=this._pulseEchoes.filter(e=>e.life>0);
    this._pulse-=dt;
    if(this.levels.pulse && this._pulse<=0) {
      const l=this.levels.pulse,control=this.evolutions.pulse&&this.branches.pulse==='control',radius=control?210:100+l*10;
      this._pulse=2.6;
      const damage=(40+l*10)*power;
      this._castPulse(p.x,p.y,radius,damage,control?45:20,false,control);
      if(this.evolutions.pulse&&this.branches.pulse==='echoes')this._pulseEchoes.push({x:p.x,y:p.y,r:radius*1.2,damage:damage*.6,life:.35,maxLife:.35});
    }
    this._lightning-=dt;
    if(this.levels.lightning && this._lightning<=0) {
      const l=this.levels.lightning;this._lightning=2.8;
      let origin=p;const excluded=new Set();
      if(this.evolutions.lightning&&this.branches.lightning==='focus') {
        let target=null;
        for(const e of this.enemies)if(e.hp>0&&this._inView(e)&&dist2(e,p)<=360*360&&(!e.dungeonId||this.dungeon.canDamage(e,p))) {
          if(!target||(e.type==='boss'&&target.type!=='boss')||((e.type==='boss')===(target.type==='boss')&&(e.hp>target.hp||(e.hp===target.hp&&dist2(e,p)<dist2(target,p)))))target=e;
        }
        if(target) {
          this._effect(p.x,p.y,'lightning',.32,0,'#dcecff',undefined,{x2:target.x,y2:target.y,evolved:true,branch:'focus',focus:true,chainIndex:0});
          this._hitEnemy(target,(38+l*10)*power*2.5,0,p,'lightning');
          this.environment?.hitAt(target.x,target.y,target.r,'lightning');
        }
      }else for(let i=0;i<(this.evolutions.lightning&&this.branches.lightning==='chain'?5:3);i++) {
        const e=this._nearest(origin.x,origin.y,i===0?360:190,excluded,origin);if(!e)break;
        excluded.add(e.id);this._effect(origin.x,origin.y,'lightning',.22,0,'#d5d0fb',undefined,{x2:e.x,y2:e.y,evolved:this.evolutions.lightning,branch:this.branches.lightning,chainIndex:i});
        this._hitEnemy(e,(38+l*10)*power*(i>=3?.4:1),0,origin,'lightning');
        this.environment?.hitAt(e.x,e.y,e.r,'lightning');origin=e;
      }
    }
  }

  _castPulse(x,y,radius,damage,knockback,echo=false,control=false) {
    const origin={x,y,groundY:y+groundOffset(this.player,true)};
    this._effect(x,y,'ring',control?.65:echo?.6:.48,radius,control?'#9fe5cf':echo?'#c6ead5':'#9de0b3',undefined,{quake:true,groundY:origin.groundY,evolved:this.evolutions.pulse,echo,control,branch:this.branches.pulse});
    const source=echo?'echo':'pulse';
    for(const e of this.enemies)if(e.hp>0&&dist2(origin,e)<sq(radius+e.r)) {
      const dealt=this._hitEnemy(e,damage,knockback,origin,source);
      if(control&&dealt>0&&e.hp>0&&e.type!=='boss')e.branchSlowUntil=this._clock+1.1;
    }
    this.environment?.hitAt(x,y,radius,source);
    for(const prop of this.adventure?.props||[])if(prop.hp>0&&sq(prop.x-x)+sq((prop.aimY??prop.y)-y)<sq(radius+prop.r))this.adventure.hitSupply(prop,damage);
  }
  _syncEvolutions(announce=false) {
    for(const id of Object.keys(EVOLUTIONS)) {
      const definition=branchDefinition(id,this.branches[id]);
      const evolved=this.levels[id]>=5&&(id==='orbit'||!!definition),previous=this.evolutions[id];
      this.evolutions[id]=evolved;
      if(evolved&&!previous) {
        if(id==='orbit')this._orbitEvolutionStartedAt=this._clock;
        if(announce)this._emit('evolution',{weaponId:id,branch:this.branches[id]||null,name:definition?.name||EVOLUTIONS[id].name});
      }
    }
  }
  _refreshStats() {
    this.stats.damage=this._damageMultiplier();this.stats.fireRate=1+this.levels.rapid*.15;
    this.stats.moveSpeed=this.hero.baseSpeed/220*(1+this.levels.speed*.08)*(this.relics?.movementMultiplier()||1);
    this.stats.magnet=BALANCE.magnet*(1+this.levels.magnet*.35);
    this.player.speed=220*this.stats.moveSpeed;
  }
  _refreshWeapons() {
    const arrow=branchDefinition('arrow',this.branches.arrow);
    this.weapons=[{id:'arrow',name:arrow?.name||'翠羽飞矢',baseName:'翠羽飞矢',level:1+this.levels.rapid+this.levels.multishot,icon:arrow?.icon||'➶',branch:this.branches.arrow,branchName:arrow?.name,evolved:!!arrow,evolutionName:arrow?.name}];
    for(const id of ['orbit','pulse','lightning'])if(this.levels[id]) {
      const u=UPGRADE_DEFS.find(u=>u.id===id),evolved=this.evolutions[id],branch=branchDefinition(id,this.branches[id]);
      this.weapons.push({id,name:evolved?(branch?.name||EVOLUTIONS[id].name):u.name,baseName:u.name,level:this.levels[id],icon:branch?.icon||u.icon,evolved,branch:this.branches[id]||null,branchName:branch?.name,evolutionName:branch?.name||(id==='orbit'?EVOLUTIONS[id].name:undefined)});
    }
  }

  addExperience(amount) {
    if(!Number.isFinite(amount)||amount<=0)return false;
    this.player.xp+=Math.floor(amount);this._levelUp();return true;
  }
  _levelUp() {
    const p=this.player;let gained=0;
    while(p.xp>=p.xpNext) {
      p.xp-=p.xpNext;p.level++;p.xpNext=xpCost(p.level);p.maxHp+=2;p.hp=Math.min(p.maxHp,p.hp+2);gained++;
    }
    if(!gained)return false;
    this._refreshStats();this._emit('level',{level:p.level,gained});
    this._effect(p.x,p.y,'ring',.6,75,'#eee0a3');return true;
  }
  addCrystals(amount) {
    if(!Number.isFinite(amount)||amount<=0)return false;
    this.crystals+=Math.floor(amount);return true;
  }
  addGold(amount) {
    if(!Number.isFinite(amount)||amount<=0)return false;
    this.gold+=Math.floor(amount);return true;
  }
  grantResources({gold=0,crystals=0}={},source='reward') {
    const addedGold=this.addGold(gold),addedCrystals=this.addCrystals(crystals);
    if(addedGold||addedCrystals)this._emit('resources',{source,gold:addedGold?Math.floor(gold):0,crystals:addedCrystals?Math.floor(crystals):0});
    return addedGold||addedCrystals;
  }
  _dropResource(list,x,y,value,r) {
    if(!Number.isFinite(value)||value<=0||!Number.isFinite(x)||!Number.isFinite(y))return null;
    const drop={x,y,r,value:Math.floor(value)};list.push(drop);
    // Bounded loot, conserved value. Merge oldest with its nearest neighbour
    // without moving it toward the player or creating extra reward value.
    const cap=list===this.coins?120:500;
    while(list.length>cap) {
      const first=list.shift();let nearest=null,best=Infinity;
      for(const other of list){const d=dist2(first,other);if(d<best){best=d;nearest=other;}}
      if(nearest){nearest.value+=first.value;nearest.r=Math.min(9,nearest.r+.2);}
    }
    return drop;
  }
  dropCrystals(x,y,value){return this._dropResource(this.gems,x,y,value,value>=60?9:value>=13?7:5);}
  dropGold(x,y,value){return this._dropResource(this.coins,x,y,value,6);}
  _collectDrops(drops,dt,kind) {
    const p=this.player;
    for(const drop of drops) {
      const dx=p.x-drop.x,dy=p.y-drop.y,d=Math.hypot(dx,dy);
      if(d<(this.adventure?.magnetRange(this.stats.magnet)??this.stats.magnet)||drop.attracted) {
        drop.attracted=true;const pull=Math.min(d,(340+Math.max(0,150-d)*5)*dt);
        if(d>0){drop.x+=dx/d*pull;drop.y+=dy/d*pull;}
      }
      if(d<22){if(kind==='gold')this.addGold(drop.value);else this.addCrystals(drop.value);drop.value=0;}
    }
  }
  _trySkillUpgrade() {
    if(this.status!=='playing'||this.crystals<this.crystalsNext)return false;
    this.status='upgrade';this._choices=null;this._emit('skillUpgrade',{skillLevel:this.skillLevel});return true;
  }
  getUpgradeChoices() {
    if(this._choices) return this._choices;
    const weaponIds=['orbit','pulse','lightning'],owned=weaponIds.filter(id=>this.levels[id]>0).length;
    const pool=UPGRADE_DEFS.filter(u=>this.levels[u.id]<LEVEL_CAPS[u.id]&&(!['pulse','lightning'].includes(u.id)||this.levels[u.id]<4));
    pool.push(...this.superSkills.getUpgradeChoices());
    // Keep all three choices available without ever adding more projectiles.
    if(pool.length<3) pool.push(...ENDLESS_UPGRADES);
    // Offer one complete, mutually exclusive pair. Deferring it advances the
    // cursor only after a valid choice; reopening the panel never rerolls it.
    this._branchOfferWeapon=null;
    for(let i=0;i<BRANCH_WEAPONS.length;i++) {
      const weaponId=BRANCH_WEAPONS[(this._branchOfferCursor+i)%BRANCH_WEAPONS.length];
      if(isBranchReady(this,weaponId)){this._branchOfferWeapon=weaponId;break;}
    }
    const ordinaryCount=this._branchOfferWeapon?1:3;
    // The first ordinary choice always changes the way the hero attacks,
    // without adding extra modal interruptions or lowering later costs.
    const opening=this.skillLevel===1&&owned===0&&!this._branchOfferWeapon;
    const chosen=opening?pool.filter(u=>weaponIds.includes(u.id)):[];
    if(!opening&&owned<3&&this.skillLevel<=3) {
      const newWeapons=pool.filter(u=>['orbit','pulse','lightning'].includes(u.id)&&!this.levels[u.id]);
      if(newWeapons.length) chosen.push(newWeapons[Math.floor(Math.random()*newWeapons.length)]);
    }
    while(chosen.length<ordinaryCount && chosen.length<pool.length) {
      const remaining=pool.filter(u=>!chosen.includes(u));
      chosen.push(remaining[Math.min(remaining.length-1,Math.floor(Math.random()*remaining.length))]);
    }
    this._choices=chosen.map(u=>{
      if(u.id.startsWith('super:'))return {...u};
      const level=this.levels[u.id]||0;
      let desc=u.desc, kind=u.kind;
      if(level && u.id==='orbit') {desc=(level+1)%2===1?'增加一枚环刃，提升伤害与环绕范围':'提升环刃伤害与环绕范围';kind='武器强化';}
      if(level && u.id==='pulse') {desc='冲击波范围和伤害提升，释放间隔保持 2.6 秒';kind='武器强化';}
      if(level && u.id==='lightning') {desc='提升每道闪电伤害；固定追击 3 个目标';kind='武器强化';}
      if(u.id==='orbit') {
        if(level===4){desc=`进化为「${EVOLUTIONS[u.id].name}」：${EVOLUTIONS[u.id].desc}`;kind='武器进化';}
        else desc+='；达到 5 级自动进化';
      }else if(u.id==='pulse'||u.id==='lightning')desc+='；升至 5 级时选择一条分支';
      return {...u,desc,kind,level:level+1,evolutionName:u.id==='orbit'?EVOLUTIONS.orbit.name:undefined,evolves:level===4&&u.id==='orbit'};
    });
    if(this._branchOfferWeapon) {
      const weaponId=this._branchOfferWeapon,level=weaponId==='arrow'?1+this.levels.rapid+this.levels.multishot:5;
      this._choices=[...WEAPON_BRANCHES[weaponId].map(def=>({...def,level})),...this._choices];
    }
    return this._choices;
  }
  chooseUpgrade(id) {
    if(this.status!=='upgrade'||this.crystals<this.crystalsNext)return false;
    const choice=this.getUpgradeChoices().find(c=>c.id===id);
    if(!choice)return false;
    const p=this.player;
    if(choice.branch) {
      const definition=branchDefinition(choice.weaponId,choice.branch);
      if(!definition||definition.id!==id||!isBranchReady(this,choice.weaponId))return false;
      this.branches[choice.weaponId]=choice.branch;
      if(choice.weaponId==='arrow')this._emit('evolution',{weaponId:'arrow',branch:choice.branch,name:definition.name});
      else this.levels[choice.weaponId]=5;
    }else if(id.startsWith('super:')) {
      if(!this.superSkills.upgrade(id))return false;
    }else {
      if(!(id in this.levels)||(LEVEL_CAPS[id]!==undefined&&this.levels[id]>=LEVEL_CAPS[id]))return false;
      this.levels[id]++;
      if(['orbit','pulse','lightning'].includes(id)&&this.levels[id]===1) {
        if(id==='pulse')this._pulse=.15;
        if(id==='lightning')this._lightning=.15;
        this._emit('weaponAcquired',{weaponId:id,name:choice.name});
      }
    }
    this.crystals-=this.crystalsNext;this.skillLevel++;this.crystalsNext=crystalCost(this.skillLevel);
    if(this._branchOfferWeapon)this._branchOfferCursor=(BRANCH_WEAPONS.indexOf(this._branchOfferWeapon)+1)%BRANCH_WEAPONS.length;
    this._branchOfferWeapon=null;
    this._syncEvolutions(true);
    if(id==='vitality') {p.maxHp+=25;p.hp=Math.min(p.maxHp,p.hp+35);this._emit('heal');}
    if(id==='endlessVitality') {p.maxHp+=12;p.hp=Math.min(p.maxHp,p.hp+24);this._emit('heal');}
    this._refreshStats();this._refreshWeapons();
    p.invuln=Math.max(p.invuln,1);this._choices=null;this.status='playing';
    this._trySkillUpgrade();
    return true;
  }
}
