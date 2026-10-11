import { Terrain, groundOffset } from './terrain.js';
import { Adventure } from './adventure.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const sq = (v) => v * v;
const dist2 = (a, b) => sq(a.x - b.x) + sq(a.y - b.y);
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
const UPGRADE_DEFS = [
  {id:'power',name:'锋芒',desc:'所有武器伤害提升 25%',kind:'被动强化',icon:'✦',color:'#e6be73'},
  {id:'rapid',name:'疾风连射',desc:'翠羽飞矢攻击速度提升 15%',kind:'武器强化',icon:'»',color:'#89d8ad'},
  {id:'multishot',name:'分裂箭',desc:'保留全伤主箭，每轮增加一支 60% 伤害的副箭',kind:'武器强化',icon:'⋔',color:'#a7dab7'},
  {id:'orbit',name:'环刃',desc:'召唤环绕身边的利刃，持续切割敌人',kind:'新武器',icon:'◈',color:'#f0d28a'},
  {id:'pulse',name:'大地回响',desc:'释放环形冲击波，击退并伤害周围敌人',kind:'新武器',icon:'◎',color:'#80d5bd'},
  {id:'lightning',name:'唤雷',desc:'闪电自动追击敌人，并在敌人之间跳跃',kind:'新武器',icon:'ϟ',color:'#b6bafa'},
  {id:'speed',name:'轻盈步伐',desc:'移动速度提升 8%，更轻松穿过兽群',kind:'被动强化',icon:'↗',color:'#9acbcc'},
  {id:'magnet',name:'林间引力',desc:'经验拾取范围增加 35%',kind:'被动强化',icon:'✧',color:'#a1cf98'},
  {id:'vitality',name:'古树之心',desc:'最大生命增加 25，并恢复 35 生命',kind:'生存强化',icon:'♥',color:'#e7a68b'},
  {id:'regen',name:'生生不息',desc:'每秒恢复 0.8 生命',kind:'生存强化',icon:'✚',color:'#a4dc9d'}
];
const LEVEL_CAPS = {power:6,rapid:5,multishot:3,orbit:5,pulse:5,lightning:5,speed:4,magnet:4,vitality:5,regen:3};
const ENDLESS_UPGRADES = [
  {id:'endlessPower',name:'百炼锋芒',desc:'本局所有武器基础伤害增加 8%',kind:'无尽强化',icon:'✦',color:'#e6be73'},
  {id:'endlessVitality',name:'深根之心',desc:'本局最大生命增加 12，并恢复 24 生命',kind:'无尽强化',icon:'♥',color:'#e7a68b'},
  {id:'endlessRegen',name:'林泉赐福',desc:'本局每秒生命恢复量增加 0.3',kind:'无尽强化',icon:'✚',color:'#a4dc9d'}
];

export class Game {
  constructor({difficulty='normal',terrain=new Terrain(),adventure=true}={}) {
    this.terrain=terrain;
    this.difficulty = difficulty;
    this.easy = difficulty === 'casual' || difficulty === 'easy';
    this.status = 'playing'; this.time = 0; this.kills = 0; this.wave = 1;
    this.pressurePhase='steady';this.phaseEndsAt=24;
    this.viewWidth = 1100; this.viewHeight = 650;
    this.player = {x:0,y:0,r:15,hp:this.easy?140:100,maxHp:this.easy?140:100,speed:220,level:1,xp:0,xpNext:xpCost(1),invuln:0,skillCooldown:0,skillCooldownMax:15,facing:0};
    this.enemies = []; this.bullets = []; this.enemyBullets=[];this.gems = []; this.effects = []; this.orbitals = []; this.events = [];
    this.storm = null;
    this.bossSpawned = false; this.bossDefeated = false;
    this.nextBossAt = BALANCE.firstBossAt; this.bossCount = 0; this.bossKills = 0;
    this.levels = Object.fromEntries([...UPGRADE_DEFS,...ENDLESS_UPGRADES].map(u => [u.id, 0]));
    this.weapons = [{id:'arrow',name:'翠羽飞矢',level:1,icon:'➶'}];
    this.stats = {damage:1,fireRate:1,moveSpeed:1,magnet:BALANCE.magnet};
    this._id = 0; this._clock = 0; this._shot = .15; this._spawn = .4;
    this._pulse = 1; this._lightning = 1; this._choices = null;
    this._grid = new Map(); this._cell = 86; this._pendingLevels = 0;
    this._moveEntity(this.player,0,0,true);
    for(let i=0;i<4;i++) this._spawnEnemy('slime', 330 + i * 24);
    this.adventure=adventure?new Adventure(this):null;
  }

  _emit(type) { if (this.events.length < 100) this.events.push({type}); }
  _effect(x,y,type,life,r,color,text,extra={}) {
    if(this.effects.length > 200) this.effects.shift();
    this.effects.push({x,y,type,life,maxLife:life,r,color,text,...extra});
  }
  _damageMultiplier() { return (1 + this.levels.power * .25 + this.levels.endlessPower * .08)*(this.adventure?.damageMultiplier()||1); }
  _inView(entity,margin=0) {
    const dx=Math.max(0,Math.abs(entity.x-this.player.x)-this.viewWidth*.5-margin);
    const dy=Math.max(0,Math.abs(entity.y-this.player.y)-this.viewHeight*.5-margin);
    return dx*dx+dy*dy<=sq(entity.r||0);
  }
  _castStorm() {
    const p=this.player, halfW=this.viewWidth*.5, halfH=this.viewHeight*.5;
    const targets=this.enemies.filter(e=>{
      if(e.hp<=0) return false;
      const dx=Math.max(0,Math.abs(e.x-p.x)-halfW), dy=Math.max(0,Math.abs(e.y-p.y)-halfH);
      return dx*dx+dy*dy<=e.r*e.r;
    });
    p.skillCooldown=p.skillCooldownMax;
    // This separate snapshot keeps every strike visible after enemies die or
    // the generic particle cap trims hit effects during a crowded screen clear.
    this.storm={x:p.x,y:p.y,viewWidth:this.viewWidth,viewHeight:this.viewHeight,life:.65,maxLife:.65,targets:targets.map(e=>({x:e.x,y:e.y,r:e.r,seed:e.id}))};
    this._emit('skill');
    for(const e of targets) {
      this._hurtEnemy(e,160*this._damageMultiplier());
      this._effect(e.x,e.y,'thunder',.6,e.r,'#d4e7ff');
    }
    this._effect(p.x,p.y,'ring',.45,95,'#d4e7ff');
  }
  _nearest(x,y,range=BALANCE.arrowRange,exclude) {
    let best=null, d=range*range;
    for(const e of this.enemies) if(e.hp>0 && this._inView(e) && !exclude?.has(e.id)) {
      const n=sq(e.x-x)+sq(e.y-y); if(n<d) { d=n; best=e; }
    }
    return best;
  }
  _spawnEnemy(type, radius) {
    const p=this.player, t=this.time, a=rand(0,TAU);
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
    this.enemies.push(enemy);return enemy;
  }
  _hurtEnemy(enemy,amount,knockback=0) {
    if(enemy.hp<=0) return;
    enemy.hp -= amount; enemy.hit = .12;
    if(knockback && enemy.type!=='boss') {
      const dx=enemy.x-this.player.x,dy=enemy.y-this.player.y,d=Math.hypot(dx,dy)||1;
      this._moveEntity(enemy,dx/d*knockback,dy/d*knockback);
      if(enemy.charge?.phase==='windup'){enemy.charge.startX=enemy.x;enemy.charge.startY=enemy.y+groundOffset(enemy);}
    }
    this._effect(enemy.x,enemy.y,'hit',.16,enemy.r*.7,'#e8f3ad');
    if(Math.random()<.24 || enemy.type==='boss') this._effect(enemy.x+rand(-8,8),enemy.y-enemy.r,'damage',.65,0,'#f1e4aa',String(Math.round(amount)));
    if(enemy.hp<=0) {
      enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;
      this.kills++; this._emit('kill');
      this.gems.push({x:enemy.x,y:enemy.y,r:enemy.type==='boss'?11:enemy.type==='brute'?7:5,value:enemy.xp});
      if(enemy.type==='boss') { enemy.slam=null;this.bossDefeated=true; this.bossKills++; this._emit('bossKill'); this._effect(enemy.x,enemy.y,'ring',1.1,170,'#f2d482'); }
      this.adventure?.onEnemyKilled(enemy);
      if(this.kills%24===0 && this.player.hp<this.player.maxHp) {
        this.player.hp=Math.min(this.player.maxHp,this.player.hp+7);
        this._effect(this.player.x,this.player.y-26,'heal',.8,0,'#b9e89c','+7'); this._emit('heal');
      }
    }
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
    const offset=groundOffset(entity,isPlayer),moved=this.terrain.moveCircle(entity.x,entity.y+offset,dx,dy,entity.r);
    entity.x=moved.x;entity.y=moved.y-offset;return moved;
  }
  _moveEnemy(e,dt,target=null) {
    const x=e.x,y=e.y+groundOffset(e),tx=target?.x??this.player.x,ty=target?.y??this.player.y+groundOffset(this.player,true);
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
    const speed=e.speed*(e.type==='boss'?1+Math.max(0,Math.sin(this._clock*.85))*1.15:1);
    this._moveEntity(e,(nx-ny*wobble)*speed*dt,(ny+nx*wobble)*speed*dt);
    e._navProgressTimer=(e._navProgressTimer||0)+dt;
    if(e._navProgressTimer>.9) {
      if(detouring&&Number.isFinite(e._navProgressX)&&Math.hypot(e.x-e._navProgressX,e.y-e._navProgressY)<2)e._navSide*=-1;
      e._navProgressX=e.x;e._navProgressY=e.y;e._navProgressTimer=0;
    }
  }
  _updatePressure() {
    let phase='steady',end=24;
    if(this.time>=24) {
      const elapsed=this.time-24,cycle=Math.floor(elapsed/36),local=elapsed%36,start=24+cycle*36;
      phase=local<8?'siege':local<15?'relief':'steady';
      end=start+(phase==='siege'?8:phase==='relief'?15:36);
    }
    if(phase!==this.pressurePhase) {
      this.pressurePhase=phase;
      if(phase==='siege'||phase==='relief')this._emit(phase);
      // A previous phase's long spawn timer must not delay the next siege.
      this._spawn=Math.min(this._spawn,.2);
    }
    this.phaseEndsAt=end;
  }
  _hurtPlayer(amount) {
    const p=this.player;if(p.invuln>0||this.status!=='playing')return false;
    p.hp=Math.max(0,p.hp-amount);p.invuln=.8;this._emit('hurt');
    this._effect(p.x,p.y,'ring',.3,42,'#e48d78');
    if(p.hp<=0)this.status='dead';return true;
  }
  _updateBoss(e,dt) {
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
      const movement=this._moveEntity(e,charge.dx*320*dt,charge.dy*320*dt);
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

  update(dt,input={}) {
    if(this.status!=='playing') return;
    dt=clamp(Number.isFinite(dt)?dt:0,0,.05);
    const p=this.player;
    this.time+=dt; this._clock+=dt;
    this._updatePressure();
    const wave=1+Math.floor(this.time/60);
    if(wave!==this.wave) { this.wave=wave; this._emit('wave'); }
    p.invuln=Math.max(0,p.invuln-dt); p.skillCooldown=Math.max(0,p.skillCooldown-dt);
    if(this.storm) { this.storm.life-=dt; if(this.storm.life<=0) this.storm=null; }
    let ix=Number.isFinite(input.x)?input.x:0,iy=Number.isFinite(input.y)?input.y:0;
    const length=Math.hypot(ix,iy); if(length>1) { ix/=length; iy/=length; }
    if(length>.01) p.facing=Math.atan2(iy,ix);
    this._moveEntity(p,ix*p.speed*dt,iy*p.speed*dt,true);
    this.adventure?.update(dt);
    if(this.levels.regen || this.levels.endlessRegen) p.hp=Math.min(p.maxHp,p.hp+(this.levels.regen*.8+this.levels.endlessRegen*.3)*dt);
    this._spawn-=dt;
    if(this._spawn<=0) {
      const pressure=this.pressurePhase==='siege'?1.85:this.pressurePhase==='relief'?.38:1;
      const rate=Math.min(BALANCE.spawnMax,(BALANCE.spawnBase+this.time*BALANCE.spawnGrowth)*pressure)*(this.easy?.78:1);
      this._spawn=1/rate;
      if(this.enemies.length<180) {
        const roll=Math.random(), t=this.time;
        const late=Math.max(0,t-150)/60, bruteChance=Math.min(.15,.07+late*.006), batEdge=Math.min(.8,.35+late*.033);
        let type=t>60&&roll<bruteChance?'brute':t>23&&roll<batEdge?'bat':t>12&&roll<Math.max(.65,batEdge+.1)?'beetle':'slime';
        if(t>=30&&roll>.89&&roll<=.95&&this.enemies.filter(e=>e.type==='boar'&&e.hp>0).length<BALANCE.boarCap)type='boar';
        else if(t>=45&&roll>.95&&this.enemies.filter(e=>e.type==='spore'&&e.hp>0).length<BALANCE.sporeCap)type='spore';
        this._spawnEnemy(type);
      }
    }
    if(this.time>=this.nextBossAt && !this.enemies.some(e=>e.type==='boss'&&e.hp>0)) {
      this.bossSpawned=true; this.bossDefeated=false; this.bossCount++;
      this.nextBossAt=this.time+BALANCE.bossInterval;
      this._spawnEnemy('boss'); this._emit('boss');
    }
    for(const e of this.enemies) {
      if(e.hp<=0) continue;
      e.hit=Math.max(0,e.hit-dt); e.orbitHit=Math.max(0,e.orbitHit-dt); e.attackCooldown=Math.max(0,e.attackCooldown-dt);
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
      if(e.hp>0 && e.guardActive!==false && !e.charge && !e._chargeSegment && !e.slam && !(e.slamRecovery>0) && p.invuln<=0 && dist2(p,e)<sq(p.r+e.r-3)) {
        this._hurtPlayer(e.damage);
        if(this.status==='dead')return;
      }
    }
    this._shot-=dt;
    if(this._shot<=0) {
      const enemy=this._nearest(p.x,p.y),supply=this.adventure?.nearestSupply(280);
      const supplyDistance=supply?sq(supply.x-p.x)+sq((supply.aimY??supply.y)-p.y):Infinity;
      const target=supply&&(!enemy||(dist2(enemy,p)>180*180&&supplyDistance<dist2(enemy,p)))?supply:enemy;
      if(target) {
        this._shot=BALANCE.arrowInterval/((1+this.levels.rapid*.15)*(this.adventure?.fireRateMultiplier()||1));
        const base=Math.atan2((target.aimY??target.y)-p.y,target.x-p.x), count=1+this.levels.multishot;
        this._volley=(this._volley||0)+1;
        for(let i=0;i<count;i++) {
          // Preserve the centered main arrow; only added side arrows are weaker.
          const angle=base+(i?Math.ceil(i/2)*.16*(i%2?1:-1)*(this._volley%2?1:-1):0);
          this.bullets.push({x:p.x,y:p.y,r:4,angle,color:'#c3e9a4',vx:Math.cos(angle)*640,vy:Math.sin(angle)*640,life:.82,damage:BALANCE.arrowDamage*this._damageMultiplier()*(i?.6:1),pierce:1,hitIds:new Set()});
        }
        this._emit('shoot');
      } else this._shot=.06;
    }
    for(const b of this.bullets) {
      b.life-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
      for(const e of this._nearby(b.x,b.y,64)) {
        if(e.hp<=0 || b.hitIds.has(e.id)) continue;
        if(dist2(b,e)<sq(b.r+e.r+3)) {
          b.hitIds.add(e.id);this._hurtEnemy(e,b.damage,4);this._emit('hit');
          if(--b.pierce<=0) {b.life=-1;break;}
        }
      }
      if(b.life>0)for(const prop of this.adventure?.props||[]) {
        if(prop.hp>0&&sq(b.x-prop.x)+sq(b.y-(prop.aimY??prop.y))<sq(b.r+prop.r)) {
          this.adventure.hitSupply(prop,b.damage);b.life=-1;break;
        }
      }
    }
    this.bullets=this.bullets.filter(b=>b.life>0&&this._inView(b,24));
    this._updateWeapons(dt);
    // Every weapon can interrupt a windup with a killing blow on this frame.
    this._resolveBossSlams();
    this._resolveEnemyAttacks(dt);
    if(this.status==='dead')return;
    this.enemies=this.enemies.filter(e=>e.hp>0 && (e.type==='boss'||e.elite||e.guardianId||dist2(e,p)<sq(Math.max(this.viewWidth,this.viewHeight)*1.5+400)));
    for(const gem of this.gems) {
      const dx=p.x-gem.x,dy=p.y-gem.y,d=Math.hypot(dx,dy);
      if(d<(this.adventure?.magnetRange(this.stats.magnet)??this.stats.magnet) || gem.attracted) {
        gem.attracted=true;
        const pull=Math.min(d,(340+Math.max(0,150-d)*5)*dt);
        if(d>0) {gem.x+=dx/d*pull;gem.y+=dy/d*pull;}
      }
      if(d<22) {p.xp+=gem.value;gem.value=0;}
    }
    this.gems=this.gems.filter(g=>g.value>0);
    // Merge the oldest drops if a stationary run accumulates a large field.
    while(this.gems.length>500) {
      const g=this.gems.shift();let nearest=null,bd=Infinity;
      for(const n of this.gems) {const d=dist2(g,n);if(d<bd){bd=d;nearest=n;}}
      if(nearest) {nearest.value+=g.value;nearest.r=Math.min(9,nearest.r+.2);}
    }
    for(const e of this.effects) {e.life-=dt;if(e.type==='damage'||e.type==='heal')e.y-=dt*26;}
    this.effects=this.effects.filter(e=>e.life>0);
    if(p.xp>=p.xpNext) this._levelUp();
  }

  _updateWeapons(dt) {
    const p=this.player, power=this._damageMultiplier(), level=this.levels.orbit;
    this.orbitals=[];
    if(level) {
      const count=2+Math.floor((level-1)/2), radius=70+level*4;
      for(let i=0;i<count;i++) {
        const a=this._clock*(2.15+level*.14)+i*TAU/count;
        const blade={x:p.x+Math.cos(a)*radius,y:p.y+Math.sin(a)*radius,r:12,angle:a};
        this.orbitals.push(blade);
        for(const e of this._nearby(blade.x,blade.y,65)) if(e.hp>0&&e.orbitHit<=0&&dist2(e,blade)<sq(e.r+blade.r)) {
          this._hurtEnemy(e,(24+level*6)*power,8);e.orbitHit=.42;
        }
        for(const prop of this.adventure?.props||[])if(prop.hp>0&&(prop._orbitNext||0)<=this.time&&sq(prop.x-blade.x)+sq((prop.aimY??prop.y)-blade.y)<sq(prop.r+blade.r)) {
          this.adventure.hitSupply(prop,(24+level*6)*power);prop._orbitNext=this.time+.42;
        }
      }
    }
    this._pulse-=dt;
    if(this.levels.pulse && this._pulse<=0) {
      const l=this.levels.pulse, radius=100+l*10;
      this._pulse=2.6;
      this._effect(p.x,p.y,'ring',.48,radius,'#9de0b3');
      for(const e of this.enemies) if(e.hp>0&&dist2(p,e)<sq(radius+e.r)) this._hurtEnemy(e,(40+l*10)*power,20);
      for(const prop of this.adventure?.props||[])if(prop.hp>0&&sq(prop.x-p.x)+sq((prop.aimY??prop.y)-p.y)<sq(radius+prop.r))this.adventure.hitSupply(prop,(40+l*10)*power);
    }
    this._lightning-=dt;
    if(this.levels.lightning && this._lightning<=0) {
      const l=this.levels.lightning;this._lightning=2.8;
      let origin={x:p.x,y:p.y};const excluded=new Set();
      for(let i=0;i<3;i++) {
        const e=this._nearest(origin.x,origin.y,i===0?360:190,excluded);if(!e)break;
        excluded.add(e.id);this._effect(origin.x,origin.y,'lightning',.22,0,'#d5d0fb',undefined,{x2:e.x,y2:e.y});
        this._hurtEnemy(e,(38+l*10)*power);origin=e;
      }
    }
  }

  _levelUp() {
    const p=this.player;
    p.xp-=p.xpNext;p.level++;p.xpNext=xpCost(p.level);
    this.status='upgrade';this._choices=null;this._emit('level');
    this._effect(p.x,p.y,'ring',.8,100,'#eee0a3');
  }
  getUpgradeChoices() {
    if(this._choices) return this._choices;
    const weaponIds=['orbit','pulse','lightning'],owned=weaponIds.filter(id=>this.levels[id]>0).length;
    const slots=this.player.level>=8?3:this.player.level>=5?2:1;
    const pool=UPGRADE_DEFS.filter(u=>this.levels[u.id]<LEVEL_CAPS[u.id]&&(!weaponIds.includes(u.id)||this.levels[u.id]>0||owned<slots));
    // Keep all three choices available without ever adding more projectiles.
    if(pool.length<3) pool.push(...ENDLESS_UPGRADES);
    // Guarantee an attractive new weapon in early choices.
    const chosen=[];
    if(owned<slots&&(this.player.level===2||this.player.level===5||this.player.level===8)) {
      const newWeapons=pool.filter(u=>['orbit','pulse','lightning'].includes(u.id)&&!this.levels[u.id]);
      if(newWeapons.length) chosen.push(newWeapons[Math.floor(Math.random()*newWeapons.length)]);
    }
    while(chosen.length<3 && chosen.length<pool.length) {
      const u=pool[Math.floor(Math.random()*pool.length)];if(!chosen.includes(u))chosen.push(u);
    }
    this._choices=chosen.map(u=>{
      const level=this.levels[u.id]||0;
      let desc=u.desc, kind=u.kind;
      if(level && u.id==='orbit') {desc=(level+1)%2===1?'增加一枚环刃，提升伤害与环绕范围':'提升环刃伤害与环绕范围';kind='武器强化';}
      if(level && u.id==='pulse') {desc='冲击波范围和伤害提升，释放间隔保持 2.6 秒';kind='武器强化';}
      if(level && u.id==='lightning') {desc='提升每道闪电伤害；固定追击 3 个目标';kind='武器强化';}
      return {...u,desc,kind,level:level+1};
    });
    return this._choices;
  }
  chooseUpgrade(id) {
    if(this.status!=='upgrade' || !this.getUpgradeChoices().some(c=>c.id===id)) return false;
    const p=this.player;
    this.levels[id]++;
    if(id==='vitality') {p.maxHp+=25;p.hp=Math.min(p.maxHp,p.hp+35);this._emit('heal');}
    if(id==='endlessVitality') {p.maxHp+=12;p.hp=Math.min(p.maxHp,p.hp+24);this._emit('heal');}
    this.stats.damage=this._damageMultiplier();this.stats.fireRate=1+this.levels.rapid*.15;
    this.stats.moveSpeed=1+this.levels.speed*.08;this.stats.magnet=BALANCE.magnet*(1+this.levels.magnet*.35);
    p.speed=220*this.stats.moveSpeed;
    this.weapons=[{id:'arrow',name:'翠羽飞矢',level:1+this.levels.rapid+this.levels.multishot,icon:'➶'}];
    for(const id of ['orbit','pulse','lightning']) if(this.levels[id]) {
      const u=UPGRADE_DEFS.find(u=>u.id===id);this.weapons.push({id,name:u.name,level:this.levels[id],icon:u.icon});
    }
    p.invuln=Math.max(p.invuln,1);this._choices=null;this.status='playing';
    if(p.xp>=p.xpNext) this._levelUp();
    return true;
  }
}
