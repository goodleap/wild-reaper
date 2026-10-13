import { treasureGuardianType } from './encounter-definitions.js';
import { groundOffset } from './terrain.js';
import { placementAllowed } from './placement-rules.js';
import { WORLD_IDS } from './world-definitions.js';

const TAU=Math.PI*2,CELL=520,MAX_SUPPLIES=18,MAX_PICKUPS=24;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const TYPES=['herb','magnet','fury'];

// A fixed-size consumed-location filter prevents short revisits from farming
// the same supply. False positives can only omit a crate; they never add loot.
class ConsumedSupplies {
  constructor(){this.bits=new Uint8Array(65536);}
  _keys(id){let a=2166136261,b=5381;for(let i=0;i<id.length;i++){a=Math.imul(a^id.charCodeAt(i),16777619);b=Math.imul(b,33)^id.charCodeAt(i);}return [a>>>0,b>>>0,(a+b)>>>0];}
  has(id){return this._keys(id).every(n=>{const bit=n%(this.bits.length*8);return this.bits[bit>>>3]&(1<<(bit&7));});}
  add(id){for(const n of this._keys(id)){const bit=n%(this.bits.length*8);this.bits[bit>>>3]|=1<<(bit&7);}}
}

export class Adventure {
  constructor(game,{generation=true}={}) {
    this.game=game;this.generation=generation;
    this.region=WORLD_IDS.includes(game.region?.id)?game.region.id:'forest';
    this.seed=Number.isFinite(game.regionIndex)?Math.trunc(game.regionIndex):0;
    this.props=[];this.pickups=[];this.treasure=null;
    this.furyTime=0;this.magnetTime=0;this.buffDuration=8;
    this._id=0;this._treasureCount=0;this._nextTreasureAt=(game.time||0)+50;
    this._supplyClock=0;this._consumed=new ConsumedSupplies();
    if(generation)this._refreshSupplies(true);
  }
  _hash(x,y=0){const index=WORLD_IDS.indexOf(this.region),offset=index===1?419:index===2?811:index>2?index*431:0;return hash(x+this.seed*131+offset,y+this.seed*197+offset);}
  damageMultiplier(){return this.furyTime>0?1.35:1;}
  fireRateMultiplier(){return this.furyTime>0?1.2:1;}
  magnetRange(base=this.game.stats.magnet){return this.magnetTime>0?Math.max(base,320):base;}
  _foot(){const p=this.game.player;return {x:p.x,y:p.y+groundOffset(p,true)};}
  _visible(x,y,margin=0){const g=this.game;return Math.abs(x-g.player.x)<g.viewWidth*.5+margin&&Math.abs(y-g.player.y)<g.viewHeight*.5+margin;}
  _free(x,y,r=36){return this.game.terrain.isFree(x,y,r)&&this.game.terrain.island?.isDry(x,y,r)!==false;}
  _environmentFree(x,y,r=0){
    if(this.game.terrain.island?.isReserved(x,y,r))return false;
    if(this.game.regions?.isSafePoint(x,y,r)===false)return false;
    if(this.game.relicSites?.isSafePoint(x,y,r)===false)return false;
    if(this.game.settlements?.isSafePoint(x,y,r)===false)return false;
    if(!placementAllowed(this.game,'loot',{x,y,r},{checkTerrain:false}))return false;
    const environment=this.game.environment;if(!environment)return true;
    if(environment.isHazardFree?.(x,y,r)===false)return false;
    if(environment.props.some(o=>o.state!=='spent'&&Math.hypot(o.x-x,o.y-y)<(o.blastRadius||82)+r+8))return false;
    return true;
  }
  _safePoint(x,y,r=28,{generated=false}={}){
    // Dropped rewards retain the movement-safe placement used during combat;
    // generated supplies and treasure also require a suitable static surface.
    const free=(px,py)=>generated?placementAllowed(this.game,'loot',{x:px,y:py,r}):this._free(px,py,r);
    if(free(x,y))return {x,y};
    for(let radius=24;radius<=144;radius+=24)for(let i=0;i<12;i++){
      const a=i*TAU/12,nx=x+Math.cos(a)*radius,ny=y+Math.sin(a)*radius;
      if(free(nx,ny))return {x:nx,y:ny};
    }
    return null;
  }
  _supplyAt(tx,ty){
    const seed=this._hash(tx+313,ty+167);
    const starter=tx===0&&ty===0&&this.region==='forest'&&this.seed===0;
    if(!starter&&seed>.42)return null;
    const id=`supply:${tx},${ty}`;
    if(this._consumed.has(id))return null;
    const x=starter?220:tx*CELL+145+this._hash(tx+131,ty+197)*225,y=starter?160:ty*CELL+145+this._hash(tx+199,ty+83)*225;
    const point=this._safePoint(x,y,38,{generated:true});
    if(!point||Math.hypot(point.x,point.y)<145||!this._environmentFree(point.x,point.y,18))return null;
    return {id,type:'supply',...point,r:18,aimY:point.y-12,sortY:point.y,hp:42,maxHp:42,hit:0,seed,drop:starter?'herb':TYPES[Math.floor(this._hash(tx+233,ty+271)*TYPES.length)]};
  }
  _refreshSupplies(initial=false){
    const g=this.game,p=this._foot(),halfW=Math.min(900,g.viewWidth*.5)+240,halfH=Math.min(650,g.viewHeight*.5)+240;
    // Keep visible damaged crates intact, and recreate only unbroken crates
    // when a distant region returns. Broken IDs stay consumed for this run.
    this.props=this.props.filter(o=>o.hp>0&&Math.abs(o.x-p.x)<halfW+360&&Math.abs(o.y-p.y)<halfH+360);
    const present=new Set(this.props.map(o=>o.id)),candidates=[];
    for(let tx=Math.floor((p.x-halfW)/CELL);tx<=Math.floor((p.x+halfW)/CELL);tx++)
      for(let ty=Math.floor((p.y-halfH)/CELL);ty<=Math.floor((p.y+halfH)/CELL);ty++){
        const o=this._supplyAt(tx,ty);
        if(!o||present.has(o.id)||(!initial&&this._visible(o.x,o.y,48)))continue;
        if(this.treasure&&distance(o,this.treasure)<110)continue;
        candidates.push(o);
      }
    candidates.sort((a,b)=>distance(a,p)-distance(b,p));
    this.props.push(...candidates.slice(0,Math.max(0,MAX_SUPPLIES-this.props.length)));
  }
  nearestSupply(range=280){
    const p=this.game.player;let nearest=null,best=range;
    for(const o of this.props)if(o.hp>0&&this._visible(o.x,o.aimY,0)){
      const d=Math.hypot(o.x-p.x,o.aimY-p.y);if(d<best){best=d;nearest=o;}
    }
    return nearest;
  }
  hitSupply(propOrId,damage){
    const id=typeof propOrId==='object'?propOrId?.id:propOrId,prop=this.props.find(o=>o.id===id);
    if(!prop||prop.hp<=0||!(damage>0))return false;
    prop.hp-=damage;prop.hit=.12;
    this.game._effect(prop.x,prop.aimY,'hit',.18,15,'#d9b17b');
    if(prop.hp<=0){
      this._consumed.add(prop.id);this.props=this.props.filter(o=>o.id!==prop.id);
      this.dropPickup(prop.drop||'herb',prop.x,prop.y);
      this.game._effect(prop.x,prop.y,'ring',.3,25,'#cdb487');this.game._emit('supplyBreak');
    }
    return true;
  }
  dropPickup(type,x,y,duration=this.buffDuration){
    if(!TYPES.includes(type))return null;
    const point=this._safePoint(x,y,18);if(!point)return null;
    const pickup={id:`pickup:${++this._id}`,type,...point,r:10,life:55,maxLife:55,duration:Math.max(1,Math.min(12,duration))};
    if(this.pickups.length>=MAX_PICKUPS)this.pickups.shift();
    this.pickups.push(pickup);return pickup;
  }
  _collect(pickup){
    const g=this.game,p=g.player;if(pickup.life<=0)return false;let healed=0;
    if(pickup.type==='herb'){
      const healing=g.relics?.modifyHerbHealing(25)??25;
      healed=Math.min(Math.max(0,Number.isFinite(healing)?healing:25),Math.max(0,p.maxHp-p.hp));p.hp+=healed;
      if(healed>0){g._effect(p.x,p.y-28,'heal',.8,0,'#b9e89c',`+${Math.ceil(healed)}`);g.relics?.onHerb(healed);}
      else g._effect(p.x,p.y,'ring',.3,24,'#b9e89c');
    }else if(pickup.type==='magnet'){
      this.magnetTime=Math.max(this.magnetTime,pickup.duration);
      for(const gem of g.gems)if(Math.hypot(gem.x-p.x,gem.y-p.y)<480)gem.attracted=true;
      g._effect(p.x,p.y,'ring',.5,95,'#a8dcec');
    }else{
      this.furyTime=Math.max(this.furyTime,pickup.duration);
      g._effect(p.x,p.y,'ring',.5,65,'#efb46b');
    }
    g._emit(pickup.type,pickup.type==='herb'?{healed}:{});pickup.life=0;return true;
  }
  spawnTreasure(x,y){
    if(this.treasure)return null;
    const g=this.game,p=this._foot();let point=null;
    if(Number.isFinite(x)&&Number.isFinite(y)){
      // An explicit request for hazardous/wet ground is rejected in place;
      // nearby retries only resolve the remaining footprint/solid clearance.
      if(!this._environmentFree(x,y,40))return null;
      point=this._safePoint(x,y,90,{generated:true});
    }
    else{
      const start=this._hash(this._treasureCount+1,Math.floor(g.time))*TAU;
      for(let i=0;i<24;i++){
        const a=start+i*TAU/24,r=g.terrain.island?Math.max(420,1/Math.max(Math.abs(Math.cos(a))/(g.viewWidth*.5+100),Math.abs(Math.sin(a))/(g.viewHeight*.5+100)))+(i%3)*50:420+(i%3)*50,candidate={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};
        if((!g.terrain.island||!this._visible(candidate.x,candidate.y,70))&&placementAllowed(g,'loot',{...candidate,r:90})&&this._environmentFree(candidate.x,candidate.y,40)&&!this.props.some(o=>distance(o,candidate)<100)){point=candidate;break;}
      }
    }
    if(!point||!this._environmentFree(point.x,point.y,40))return null;
    this._treasureCount++;
    this.treasure={id:`treasure:${++this._id}`,...point,r:27,sortY:point.y,state:'locked',guardianId:null,life:180,maxLife:180,openedLife:0};
    this._nextTreasureAt=g.time+90;g._emit('treasure');
    g._effect(point.x,point.y,'ring',1,65,'#f3d28c');return this.treasure;
  }
  _activateTreasure(){
    const g=this.game,t=this.treasure;if(!t||t.state!=='locked')return;
    if(g.enemies.length>=180)return;
    const p=this._foot(),dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy)||1;
    const point=this._safePoint(t.x+dx/d*75,t.y+dy/d*75,40);if(!point)return;
    const type=treasureGuardianType(this._treasureCount,g.enemies);
    const enemy=g._spawnEnemy(type,1);
    if(!enemy)return;
    enemy.elite=true;enemy.guardianId=t.id;enemy.guardActive=true;enemy.guardReturnTarget=null;
    enemy.r*=1.2;enemy.hp*=3;enemy.maxHp=enemy.hp;enemy.damage*=1.1;enemy.speed*=1.1;enemy.xp=30;
    enemy.x=point.x;enemy.y=point.y-groundOffset(enemy);g._moveEntity(enemy,0,0);
    t.guardianId=enemy.id;t.state='active';t.anchorX=enemy.x;t.anchorY=enemy.y+groundOffset(enemy);
    g._emit('treasureGuard');g._effect(enemy.x,enemy.y,'ring',.7,55,'#dfb572');
  }
  onEnemyKilled(enemy){
    const t=this.treasure;
    if(!t||t.state!=='active'||!(enemy.hp<=0)||enemy.id!==t.guardianId||enemy.guardianId!==t.id)return;
    t.state='unlocked';t.guardianId=null;t.life=80;t.maxLife=80;
    this.game._emit('treasureUnlocked');this.game._effect(t.x,t.y,'ring',.8,70,'#f3d28c');
  }
  _clearTreasure(){
    const t=this.treasure;if(!t)return;
    // Despawn is not a kill: it must not trigger XP, kill counts or an unlock.
    this.game.enemies=this.game.enemies.filter(e=>e.guardianId!==t.id);
    this.treasure=null;this._nextTreasureAt=Math.max(this._nextTreasureAt,this.game.time+30);
  }
  _openTreasure(){
    const t=this.treasure;if(!t||t.state!=='unlocked')return;
    t.state='opened';t.openedLife=2;t.life=2;
    this.game.grantResources({gold:18,crystals:35},'守卫宝箱');
    for(let i=0;i<TYPES.length;i++){
      const a=-Math.PI/2+i*TAU/TYPES.length;
      this.dropPickup(TYPES[i],t.x+Math.cos(a)*28,t.y+Math.sin(a)*28);
    }
    this._nextTreasureAt=Math.max(this._nextTreasureAt,this.game.time+65);
    this.game._emit('treasureOpened');this.game._effect(t.x,t.y,'ring',.7,75,'#f3d28c');
  }
  _updateTreasure(dt){
    const g=this.game,t=this.treasure;if(!t)return;
    t.life-=dt;const p=this._foot(),d=distance(t,p);
    if(t.life<=0||d>1250){this._clearTreasure();return;}
    if(t.state==='locked'&&d<230)this._activateTreasure();
    if(t.state==='active'){
      const guard=g.enemies.find(e=>e.id===t.guardianId&&e.guardianId===t.id&&e.hp>0);
      if(!guard){this._clearTreasure();return;}
      const gx=guard.x,gy=guard.y+groundOffset(guard),fromChest=Math.hypot(gx-t.x,gy-t.y);
      if(d>580||fromChest>450)guard._guardReturning=true;
      if(guard._guardReturning&&d<480&&Math.hypot(gx-t.anchorX,gy-t.anchorY)<90)guard._guardReturning=false;
      guard.guardActive=!guard._guardReturning;
      guard.guardReturnTarget=guard._guardReturning&&Math.hypot(gx-t.anchorX,gy-t.anchorY)>12?{x:t.anchorX,y:t.anchorY}:null;
    }else if(t.state==='unlocked'&&d<40)this._openTreasure();
  }
  update(dt){
    if(this.game.status!=='playing')return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    this.furyTime=Math.max(0,this.furyTime-dt);this.magnetTime=Math.max(0,this.magnetTime-dt);
    for(const prop of this.props)prop.hit=Math.max(0,prop.hit-dt);
    this._updateTreasure(dt);
    if(this.generation){
      this._supplyClock-=dt;if(this._supplyClock<=0){this._supplyClock=.5;this._refreshSupplies();}
      if(!this.treasure&&this.game.time>=this._nextTreasureAt&&!this.spawnTreasure())this._nextTreasureAt=this.game.time+5;
    }
    const p=this._foot();
    // Walking into a supply opens it too; ranged attacks remain a convenient
    // way to break one before reaching it. Both paths share once-only drops.
    for(const prop of [...this.props])if(prop.hp>0&&distance(prop,p)<=prop.r+this.game.player.r+2&&
      (!this.game.dungeon?.active||this.game.dungeon.vision?.isVisible(prop.x,prop.y)))this.hitSupply(prop,prop.hp);
    for(const pickup of this.pickups){
      pickup.life-=dt;
      if(pickup.life>0&&distance(pickup,p)<26)this._collect(pickup);
    }
    this.pickups=this.pickups.filter(o=>o.life>0&&distance(o,p)<1800);
  }
}
