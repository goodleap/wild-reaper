const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const sq = (v) => v * v;
const dist2 = (a, b) => sq(a.x - b.x) + sq(a.y - b.y);
const UPGRADE_DEFS = [
  {id:'power',name:'锋芒',desc:'所有武器伤害提升 25%',kind:'被动强化',icon:'✦',color:'#e6be73'},
  {id:'rapid',name:'疾风连射',desc:'翠羽飞矢攻击速度提升 22%',kind:'武器强化',icon:'»',color:'#89d8ad'},
  {id:'multishot',name:'分裂箭',desc:'每轮增加一支飞矢',kind:'武器强化',icon:'⋔',color:'#a7dab7'},
  {id:'orbit',name:'环刃',desc:'召唤环绕身边的利刃，持续切割敌人',kind:'新武器',icon:'◈',color:'#f0d28a'},
  {id:'pulse',name:'大地回响',desc:'释放环形冲击波，击退并伤害周围敌人',kind:'新武器',icon:'◎',color:'#80d5bd'},
  {id:'lightning',name:'唤雷',desc:'闪电自动追击敌人，并在敌人之间跳跃',kind:'新武器',icon:'ϟ',color:'#b6bafa'},
  {id:'speed',name:'轻盈步伐',desc:'移动速度提升 12%，更轻松穿过兽群',kind:'被动强化',icon:'↗',color:'#9acbcc'},
  {id:'magnet',name:'林间引力',desc:'经验拾取范围增加 55%',kind:'被动强化',icon:'✧',color:'#a1cf98'},
  {id:'vitality',name:'古树之心',desc:'最大生命增加 25，并恢复 35 生命',kind:'生存强化',icon:'♥',color:'#e7a68b'},
  {id:'regen',name:'生生不息',desc:'每秒恢复 0.8 生命',kind:'生存强化',icon:'✚',color:'#a4dc9d'}
];
const LEVEL_CAPS = {power:6,rapid:5,multishot:4,orbit:5,pulse:5,lightning:5,speed:4,magnet:4,vitality:5,regen:3};
const ENDLESS_UPGRADES = [
  {id:'endlessPower',name:'百炼锋芒',desc:'本局所有武器基础伤害增加 8%',kind:'无尽强化',icon:'✦',color:'#e6be73'},
  {id:'endlessVitality',name:'深根之心',desc:'本局最大生命增加 12，并恢复 24 生命',kind:'无尽强化',icon:'♥',color:'#e7a68b'},
  {id:'endlessRegen',name:'林泉赐福',desc:'本局每秒生命恢复量增加 0.3',kind:'无尽强化',icon:'✚',color:'#a4dc9d'}
];

export class Game {
  constructor({difficulty='normal'}={}) {
    this.difficulty = difficulty;
    this.easy = difficulty === 'casual' || difficulty === 'easy';
    this.status = 'playing'; this.time = 0; this.kills = 0; this.wave = 1;
    this.viewWidth = 1100; this.viewHeight = 650;
    this.player = {x:0,y:0,r:15,hp:this.easy?140:100,maxHp:this.easy?140:100,speed:220,level:1,xp:0,xpNext:14,invuln:0,skillCooldown:0,skillCooldownMax:15,facing:0};
    this.enemies = []; this.bullets = []; this.gems = []; this.effects = []; this.orbitals = []; this.events = [];
    this.storm = null;
    this.bossSpawned = false; this.bossDefeated = false;
    this.nextBossAt = 150; this.bossCount = 0; this.bossKills = 0;
    this.levels = Object.fromEntries([...UPGRADE_DEFS,...ENDLESS_UPGRADES].map(u => [u.id, 0]));
    this.weapons = [{id:'arrow',name:'翠羽飞矢',level:1,icon:'➶'}];
    this.stats = {damage:1,fireRate:1,moveSpeed:1,magnet:72};
    this._id = 0; this._clock = 0; this._shot = .15; this._spawn = .4;
    this._pulse = 1; this._lightning = 1; this._choices = null;
    this._grid = new Map(); this._cell = 86; this._pendingLevels = 0;
    for(let i=0;i<4;i++) this._spawnEnemy('slime', 330 + i * 24);
  }

  _emit(type) { if (this.events.length < 100) this.events.push({type}); }
  _effect(x,y,type,life,r,color,text,extra={}) {
    if(this.effects.length > 200) this.effects.shift();
    this.effects.push({x,y,type,life,maxLife:life,r,color,text,...extra});
  }
  _damageMultiplier() { return 1 + this.levels.power * .25 + this.levels.endlessPower * .08; }
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
  _nearest(x,y,range=1000,exclude) {
    let best=null, d=range*range;
    for(const e of this.enemies) if(e.hp>0 && !exclude?.has(e.id)) {
      const n=sq(e.x-x)+sq(e.y-y); if(n<d) { d=n; best=e; }
    }
    return best;
  }
  _spawnEnemy(type, radius) {
    const p=this.player, t=this.time, a=rand(0,TAU);
    const halfW=Math.max(390,this.viewWidth*.5+65),halfH=Math.max(290,this.viewHeight*.5+65);
    const edge=1/Math.max(Math.abs(Math.cos(a))/halfW,Math.abs(Math.sin(a))/halfH);
    const distance=radius || edge;
    const defs={slime:[16,23,58,9,4],beetle:[18,46,72,12,6],bat:[11,19,113,7,4],brute:[26,118,44,17,13],boss:[49,this.easy?1700:2300,49,22,160]};
    const [r,hp,speed,damage,xp]=defs[type];
    const lateMinutes=Math.max(0,t-150)/60, bossIndex=Math.max(1,this.bossCount);
    // Density and movement stay bounded; health and contact damage keep rising.
    const health=hp*(type==='boss'?1+(bossIndex-1)*.65+sq(bossIndex-1)*.12:1+t*.003+Math.pow(lateMinutes,1.45)*.32);
    const danger=type==='boss'?1+(bossIndex-1)*.3:1+lateMinutes*.18;
    this.enemies.push({id:++this._id,x:p.x+Math.cos(a)*distance,y:p.y+Math.sin(a)*distance,r,hp:health,maxHp:health,type,hit:0,speed:speed*Math.min(1.85,1+t*.0006)*(this.easy?.9:1),damage:damage*danger*(this.easy?.72:1),xp:Math.round(xp*(type==='boss'?1+(bossIndex-1)*.3:1+lateMinutes*.055)),bossIndex:type==='boss'?bossIndex:undefined,wave:this.wave,phase:rand(0,TAU),orbitHit:0,attackCooldown:0});
  }
  _hurtEnemy(enemy,amount,knockback=0) {
    if(enemy.hp<=0) return;
    enemy.hp -= amount; enemy.hit = .12;
    if(knockback && enemy.type!=='boss') {
      const dx=enemy.x-this.player.x,dy=enemy.y-this.player.y,d=Math.hypot(dx,dy)||1;
      enemy.x += dx/d*knockback; enemy.y += dy/d*knockback;
    }
    this._effect(enemy.x,enemy.y,'hit',.16,enemy.r*.7,'#e8f3ad');
    if(Math.random()<.24 || enemy.type==='boss') this._effect(enemy.x+rand(-8,8),enemy.y-enemy.r,'damage',.65,0,'#f1e4aa',String(Math.round(amount)));
    if(enemy.hp<=0) {
      this.kills++; this._emit('kill');
      this.gems.push({x:enemy.x,y:enemy.y,r:enemy.type==='boss'?11:enemy.type==='brute'?7:5,value:enemy.xp});
      if(enemy.type==='boss') { this.bossDefeated=true; this.bossKills++; this._emit('bossKill'); this._effect(enemy.x,enemy.y,'ring',1.1,170,'#f2d482'); }
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

  update(dt,input={}) {
    if(this.status!=='playing') return;
    dt=clamp(Number.isFinite(dt)?dt:0,0,.05);
    const p=this.player;
    this.time+=dt; this._clock+=dt;
    const wave=1+Math.floor(this.time/60);
    if(wave!==this.wave) { this.wave=wave; this._emit('wave'); }
    p.invuln=Math.max(0,p.invuln-dt); p.skillCooldown=Math.max(0,p.skillCooldown-dt);
    if(this.storm) { this.storm.life-=dt; if(this.storm.life<=0) this.storm=null; }
    let ix=Number.isFinite(input.x)?input.x:0,iy=Number.isFinite(input.y)?input.y:0;
    const length=Math.hypot(ix,iy); if(length>1) { ix/=length; iy/=length; }
    if(length>.01) p.facing=Math.atan2(iy,ix);
    p.x+=ix*p.speed*dt; p.y+=iy*p.speed*dt;
    if(this.levels.regen || this.levels.endlessRegen) p.hp=Math.min(p.maxHp,p.hp+(this.levels.regen*.8+this.levels.endlessRegen*.3)*dt);
    this._spawn-=dt;
    if(this._spawn<=0) {
      const rate=Math.min(10.5,1.05+this.time*.031)*(this.easy?.78:1);
      this._spawn=1/rate;
      if(this.enemies.length<180) {
        const roll=Math.random(), t=this.time;
        const late=Math.max(0,t-150)/60, bruteChance=Math.min(.25,.13+late*.008), batEdge=Math.min(.8,.35+late*.033);
        const type=t>60&&roll<bruteChance?'brute':t>23&&roll<batEdge?'bat':t>12&&roll<Math.max(.65,batEdge+.1)?'beetle':'slime';
        this._spawnEnemy(type);
      }
    }
    if(this.time>=this.nextBossAt && !this.enemies.some(e=>e.type==='boss'&&e.hp>0)) {
      this.bossSpawned=true; this.bossDefeated=false; this.bossCount++;
      this.nextBossAt=this.time+150;
      this._spawnEnemy('boss',Math.max(380,Math.min(this.viewWidth,this.viewHeight)*.5+80)); this._emit('boss');
    }
    for(const e of this.enemies) {
      if(e.hp<=0) continue;
      e.hit=Math.max(0,e.hit-dt); e.orbitHit=Math.max(0,e.orbitHit-dt); e.attackCooldown=Math.max(0,e.attackCooldown-dt);
      const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;
      const wobble=e.type==='bat'?Math.sin(this._clock*5+e.phase)*.52:0;
      let speed=e.speed;
      if(e.type==='boss') speed*=1+Math.max(0,Math.sin(this._clock*.85))*1.15;
      e.x+=(dx/d-dy/d*wobble)*speed*dt; e.y+=(dy/d+dx/d*wobble)*speed*dt;
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
          if(e.type!=='boss') { e.x+=dx/d*force;e.y+=dy/d*force; }
          if(n.type!=='boss') { n.x-=dx/d*force;n.y-=dy/d*force; }
        }
      }
    }
    if(input.skill && p.skillCooldown<=0) this._castStorm();
    for(const e of this._nearby(p.x,p.y,85)) {
      if(e.hp>0 && p.invuln<=0 && dist2(p,e)<sq(p.r+e.r-3)) {
        p.hp=Math.max(0,p.hp-e.damage);p.invuln=.72;this._emit('hurt');
        this._effect(p.x,p.y,'ring',.3,42,'#e48d78');
        if(p.hp<=0) {this.status='dead';return;}
      }
    }
    this._shot-=dt;
    if(this._shot<=0) {
      const target=this._nearest(p.x,p.y);
      if(target) {
        this._shot=.38/(1+this.levels.rapid*.22);
        const base=Math.atan2(target.y-p.y,target.x-p.x), count=1+this.levels.multishot;
        for(let i=0;i<count;i++) {
          // Wide fans at higher levels clear converging waves.
          const angle=base+(i-(count-1)/2)*.145;
          this.bullets.push({x:p.x,y:p.y,r:4,angle,color:'#c3e9a4',vx:Math.cos(angle)*640,vy:Math.sin(angle)*640,life:1.65,damage:25*this._damageMultiplier(),pierce:this.levels.multishot>=3?2:1,hitIds:new Set()});
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
    }
    this.bullets=this.bullets.filter(b=>b.life>0);
    this._updateWeapons(dt);
    this.enemies=this.enemies.filter(e=>e.hp>0 && (e.type==='boss'||dist2(e,p)<sq(Math.max(this.viewWidth,this.viewHeight)*1.5+400)));
    for(const gem of this.gems) {
      const dx=p.x-gem.x,dy=p.y-gem.y,d=Math.hypot(dx,dy);
      if(d<this.stats.magnet || gem.attracted) {
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
      const count=level+1, radius=69+level*5;
      for(let i=0;i<count;i++) {
        const a=this._clock*(2.15+level*.14)+i*TAU/count;
        const blade={x:p.x+Math.cos(a)*radius,y:p.y+Math.sin(a)*radius,r:12,angle:a};
        this.orbitals.push(blade);
        for(const e of this._nearby(blade.x,blade.y,65)) if(e.hp>0&&e.orbitHit<=0&&dist2(e,blade)<sq(e.r+blade.r)) {
          this._hurtEnemy(e,(18+level*6)*power,8);e.orbitHit=.34;
        }
      }
    }
    this._pulse-=dt;
    if(this.levels.pulse && this._pulse<=0) {
      const l=this.levels.pulse, radius=105+l*15;
      this._pulse=2.1-l*.14;
      this._effect(p.x,p.y,'ring',.48,radius,'#9de0b3');
      for(const e of this.enemies) if(e.hp>0&&dist2(p,e)<sq(radius+e.r)) this._hurtEnemy(e,(24+l*12)*power,28);
    }
    this._lightning-=dt;
    if(this.levels.lightning && this._lightning<=0) {
      const l=this.levels.lightning;this._lightning=2.2-l*.15;
      let origin={x:p.x,y:p.y};const excluded=new Set();
      for(let i=0;i<l+2;i++) {
        const e=this._nearest(origin.x,origin.y,i===0?620:230,excluded);if(!e)break;
        excluded.add(e.id);this._effect(origin.x,origin.y,'lightning',.22,0,'#d5d0fb',undefined,{x2:e.x,y2:e.y});
        this._hurtEnemy(e,(34+l*12)*power);origin=e;
      }
    }
  }

  _levelUp() {
    const p=this.player;
    p.xp-=p.xpNext;p.level++;p.xpNext=Math.round(14+Math.pow(p.level,1.25)*5);
    this.status='upgrade';this._choices=null;this._emit('level');
    this._effect(p.x,p.y,'ring',.8,100,'#eee0a3');
  }
  getUpgradeChoices() {
    if(this._choices) return this._choices;
    const pool=UPGRADE_DEFS.filter(u=>this.levels[u.id]<LEVEL_CAPS[u.id]);
    // Keep all three choices available without ever adding more projectiles.
    if(pool.length<3) pool.push(...ENDLESS_UPGRADES);
    // Guarantee an attractive new weapon in early choices.
    const chosen=[];
    if(this.player.level<=4) {
      const newWeapons=pool.filter(u=>['orbit','pulse','lightning'].includes(u.id)&&!this.levels[u.id]);
      if(newWeapons.length) chosen.push(newWeapons[Math.floor(Math.random()*newWeapons.length)]);
    }
    while(chosen.length<3 && chosen.length<pool.length) {
      const u=pool[Math.floor(Math.random()*pool.length)];if(!chosen.includes(u))chosen.push(u);
    }
    this._choices=chosen.map(u=>{
      const level=this.levels[u.id]||0;
      let desc=u.desc, kind=u.kind;
      if(level && u.id==='orbit') {desc='增加一枚环刃，提升伤害与环绕范围';kind='武器强化';}
      if(level && u.id==='pulse') {desc='冲击波范围和伤害提升，冷却缩短';kind='武器强化';}
      if(level && u.id==='lightning') {desc='增加一次闪电跳跃，伤害提升，冷却缩短';kind='武器强化';}
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
    this.stats.damage=this._damageMultiplier();this.stats.fireRate=1+this.levels.rapid*.22;
    this.stats.moveSpeed=1+this.levels.speed*.12;this.stats.magnet=72*(1+this.levels.magnet*.55);
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
