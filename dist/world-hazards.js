import { getConfigSection } from './content-config.js';
import { worldForId } from './world-definitions.js';
import { groundOffset } from './terrain.js';
import { placementAllowed } from './placement-rules.js';
import { isGrounded } from './height-rules.js';
import { friendlyTargets, friendlyFoot, isFriendlyActive, damageFriendly } from './friendly-combat.js';
import { containsWater, waterIntersectsCircle, waterBounds } from './water-geometry.js';

const CELL=520;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const WORLD_HAZARD_RULES=getConfigSection('geography').hazardRules;

// Only nearby patches keep live timers. World snapshots own this object, so
// leaving a world freezes its timers without retaining scene-global targets.
export class WorldHazards {
  constructor(environment,{generation=true}={}){
    this.environment=environment;this.game=environment.game;this.region=environment.region;this.rules=worldForId(this.region).environment;this.generation=generation;
    this.props=[];this._clock=0;this._refreshClock=.5;this._cooldowns=new WeakMap();
    if(generation)this._refresh(true);
  }
  _visible(prop,margin=0){const g=this.game,r=prop.patch?Math.max(prop.patch.rx,prop.patch.ry):prop.r||0;return Math.abs(prop.x-g.player.x)<=g.viewWidth*.5+r+margin&&Math.abs(prop.y-g.player.y)<=g.viewHeight*.5+r+margin;}
  _candidate(tx,ty){
    const hazard=this.rules.hazard;if(hazard?.source!=='terrain')return null;const type=hazard.type;
    const env=this.environment,seed=env._hash(tx+2053,ty+2081),safe=env._safeAnchor||{x:0,y:0};if(seed>hazard.chance)return null;
    const r=WORLD_HAZARD_RULES[type].radius;
    for(let i=0;i<5;i++){
      const x=tx*CELL+90+env._hash(tx+2089+i*29,ty+2111)*340,y=ty*CELL+90+env._hash(tx+2129,ty+2131+i*31)*340;
      if(Math.hypot(x-safe.x,y-safe.y)<WORLD_HAZARD_RULES.safeRadius+r||!this.game.terrain.isFree(x,y,r+20))continue;
      if(!placementAllowed(this.game,'hazard',{x,y,r:r+14},{environment:env,checkTerrain:false,checkReserved:true}))continue;
      return {id:`${type}:${tx},${ty}`,type,x,y,r,seed,state:'idle',remaining:2+seed*3,maxRemaining:2+seed*3,warning:0};
    }
    return null;
  }
  _clear(prop){
    const g=this.game,r=prop.patch?Math.max(prop.patch.rx,prop.patch.ry):prop.r;
    return this.environment._objectiveClear(prop.x,prop.y,r+20)&&!g.companions?.camps?.some(c=>distance(c,prop)<r+135)&&(!g.portal||distance(g.portal,prop)>r+85);
  }
  _refresh(initial=false){
    const g=this.game,p=g.player,halfW=Math.min(900,g.viewWidth*.5)+280,halfH=Math.min(650,g.viewHeight*.5)+280;
    const pools=this.environment.muds;
    this.props=this.props.filter(o=>Math.abs(o.x-p.x)<halfW+180&&Math.abs(o.y-p.y)<halfH+180&&this._clear(o)&&(o.type!=='tide'||pools.includes(o.patch))).slice(0,WORLD_HAZARD_RULES.maxProps);
    const ids=new Set(this.props.map(o=>o.id)),candidates=[];
    if(this.rules.hazard?.source==='water'){
      for(const patch of pools){
        if(patch.kind&&patch.kind!=='water')continue;
        const o={id:`tide:${patch.id}`,type:'tide',x:patch.x,y:patch.y,r:Math.max(patch.rx,patch.ry),patch,seed:patch.seed||0,state:'idle',remaining:3+(patch.seed||0)*4,maxRemaining:7,warning:0};
        if(!ids.has(o.id)&&this._clear(o))candidates.push(o);
      }
    }else if(this.rules.hazard?.source==='terrain'){
      for(let tx=Math.floor((p.x-halfW)/CELL);tx<=Math.floor((p.x+halfW)/CELL);tx++)for(let ty=Math.floor((p.y-halfH)/CELL);ty<=Math.floor((p.y+halfH)/CELL);ty++){
        const o=this._candidate(tx,ty);if(o&&!ids.has(o.id)&&this._clear(o)&&(initial||!this._visible(o,24)))candidates.push(o);
      }
    }
    candidates.sort((a,b)=>distance(a,p)-distance(b,p));this.props.push(...candidates.slice(0,Math.max(0,WORLD_HAZARD_RULES.maxProps-this.props.length)));
  }
  tideAt(patch){
    if(this._tideProps!==this.props){this._tideProps=this.props;this._tides=new Map(this.props.filter(o=>o.type==='tide').map(o=>[o.patch,o]));}
    return this._tides.get(patch)?.state||'idle';
  }
  _phase(prop,state,duration){prop.state=state;prop.remaining=duration;prop.maxRemaining=duration;prop.warning=0;}
  _cycle(prop,dt){
    const rules=WORLD_HAZARD_RULES[prop.type];if(!rules)return;
    if(!this._visible(prop)){this._phase(prop,'idle',rules.rest);return;}
    prop.remaining=(prop.remaining??rules.rest)-dt;
    if(prop.state==='warn')prop.warning=Math.min(1,1-Math.max(0,prop.remaining)/rules.warning);
    if(prop.remaining>1e-9)return;
    if(prop.state==='idle')this._phase(prop,'warn',rules.warning);
    else if(prop.state==='warn')this._phase(prop,'active',rules.active);
    else this._phase(prop,'idle',rules.rest);
  }
  isHazardFree(x,y,r=0){
    if(![x,y,r].every(Number.isFinite)||r<0)return false;
    if(this.props.some(o=>o.type==='tide'?waterIntersectsCircle(o.patch,x,y,r+12):distance(o,{x,y})<o.r+r+16))return false;
    if(this.rules.damagingSurface){
      const box={minX:x-r-12,minY:y-r-12,maxX:x+r+12,maxY:y+r+12};
      if(this.environment.watersInBounds(box).some(o=>o.kind===this.rules.damagingSurface&&waterIntersectsCircle(o,x,y,r+12)))return false;
    }
    if(!this.generation||this.rules.hazard?.source!=='terrain')return true;
    const margin=r+80;
    for(let tx=Math.floor((x-margin)/CELL);tx<=Math.floor((x+margin)/CELL);tx++)for(let ty=Math.floor((y-margin)/CELL);ty<=Math.floor((y+margin)/CELL);ty++){
      const o=this._candidate(tx,ty);if(o&&distance(o,{x,y})<o.r+r+16)return false;
    }
    return true;
  }
  _damage(){
    const g=this.game,hazards=this.props.filter(o=>o.state==='active'&&o.type!=='tide'&&this._visible(o));
    if(this.rules.damagingSurface)for(const patch of this.environment.muds)if(patch.kind===this.rules.damagingSurface&&this._visible({x:patch.x,y:patch.y,patch})&&this._clear({x:patch.x,y:patch.y,patch}))hazards.push({type:'lava',x:patch.x,y:patch.y,patch});
    if(!hazards.length)return;
    const contact=(entity,point)=>{
      if((this._cooldowns.get(entity)||0)>this._clock)return null;
      for(const hazard of hazards){
        if(hazard.type==='lava'){
          if(!isGrounded(entity))continue;
          const b=waterBounds(hazard.patch);if(point.x<b.minX||point.x>b.maxX||point.y<b.minY||point.y>b.maxY||!containsWater(hazard.patch,point.x,point.y))continue;
        }else if(distance(hazard,point)>hazard.r)continue;
        if(g.terrain.firstBlocker(hazard.x,hazard.y,point.x,point.y,0,'sight'))continue;
        this._cooldowns.set(entity,this._clock+WORLD_HAZARD_RULES.hitInterval);return hazard;
      }
      return null;
    };
    for(const ally of friendlyTargets(g)){
      if(g.status!=='playing')return;if(!isFriendlyActive(g,ally))continue;
      const hazard=contact(ally,friendlyFoot(ally));if(hazard)damageFriendly(g,ally,WORLD_HAZARD_RULES[hazard.type].playerDamage,hazard.type);
    }
    if(g.status!=='playing')return;
    for(const enemy of [...g.enemies]){
      if(g.status!=='playing')return;if(enemy.hp<=0||g._inView?.(enemy)===false)continue;
      const point={x:enemy.x,y:enemy.y+groundOffset(enemy)},hazard=contact(enemy,point);
      if(hazard)g._hurtEnemy(enemy,WORLD_HAZARD_RULES[hazard.type].enemyDamage,0,g.player,hazard.type);
    }
  }
  update(dt){
    const g=this.game;if(g.status!=='playing'||g.environment&&g.environment!==this.environment)return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));this._clock+=dt;
    if(this.generation){this._refreshClock-=dt;if(this._refreshClock<=0){this._refreshClock=.5;this._refresh();}}
    for(const prop of this.props)this._cycle(prop,dt);
    this._damage();
  }
}
