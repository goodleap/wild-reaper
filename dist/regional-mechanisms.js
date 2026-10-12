import { groundOffset } from './terrain.js';

const CELL=520,WEAPON_SOURCES=new Set(['arrow','orbit','pulse','echo','lightning','storm']);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const REGIONAL_MECHANISM_RULES=Object.freeze({maxProps:8,safeRadius:280,vineRadius:54,vineWarning:1.1,vineActive:2.5,vineSlow:.6,gasRadius:70,gasWarning:1.4,gasActive:3.6,gasInterval:1,gasPlayerDamage:6,gasEnemyDamage:20,runeRadius:48,runeCharge:.6,runeDuration:12,runeInterval:1.4,runeTargets:3,runeRange:420});

// Ground hazards share this definition with marsh immersion. Poison clouds
// remain airborne hazards and intentionally do not use this exemption.
export function isGrounded(entity){return !!entity&&entity.flying!==true&&entity.type!=='bat'&&entity.type!=='angel'&&entity.kind!=='angel'&&entity.townKind!=='angel';}

// A bounded filter preserves one-use locations without growing with distance.
// False positives only omit an object; they can never grant another activation.
class UsedLocations {
  constructor(){this.bits=new Uint8Array(32768);}
  _keys(id){let a=2166136261,b=5381;for(let i=0;i<id.length;i++){a=Math.imul(a^id.charCodeAt(i),16777619);b=Math.imul(b,33)^id.charCodeAt(i);}return [a>>>0,b>>>0,(a+b)>>>0];}
  has(id){return this._keys(id).every(n=>{const bit=n%(this.bits.length*8);return this.bits[bit>>>3]&(1<<(bit&7));});}
  add(id){for(const n of this._keys(id)){const bit=n%(this.bits.length*8);this.bits[bit>>>3]|=1<<(bit&7);}}
}

const segmentDistance=(x,y,x1,y1,x2,y2)=>{
  const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/length)):0;
  return Math.hypot(x-x1-dx*t,y-y1-dy*t);
};

export class RegionalMechanisms {
  constructor(environment,{generation=true}={}){
    this.environment=environment;this.game=environment.game;this.region=environment.region;this.generation=generation;
    this.props=[];this._used=new UsedLocations();this._refreshClock=0;this._fixtureId=0;this._gasCooldown=0;this._gasEnemyClock=1;
    if(generation)this._refresh(true);
  }
  _foot(entity=this.game.player,isPlayer=entity===this.game.player){return {x:entity.x,y:entity.y+groundOffset(entity,isPlayer||entity.isCompanion||entity.isCaptive||entity.isTownNpc)};}
  _visible(prop,margin=0){const g=this.game;return Math.abs(prop.x-g.player.x)<=g.viewWidth*.5+margin&&Math.abs(prop.y-g.player.y)<=g.viewHeight*.5+margin;}
  _candidate(tx,ty){
    // Rune support now belongs to a permanent, deliberately activated relic.
    // The roaming cache only owns renewable woodland/marsh hazards.
    if(this.region==='ruins')return null;
    const env=this.environment,seed=env._hash(tx+1423,ty+1451);
    if(seed>.64)return null;
    const type=this.region==='marsh'?'gas':this.region==='ruins'?'rune':'vine',r=REGIONAL_MECHANISM_RULES[`${type}Radius`];
    // Choose a cell's single stable point before considering dynamic objectives.
    // A removed chest therefore cannot relocate a previously seen mechanism.
    for(let i=0;i<6;i++){
      const x=tx*CELL+95+env._hash(tx+1481+i*31,ty+1483)*330,y=ty*CELL+95+env._hash(tx+1487,ty+1489+i*23)*330;
      if(Math.hypot(x,y)<REGIONAL_MECHANISM_RULES.safeRadius+r||!this.game.terrain.isFree(x,y,r+18)||(this.game.terrain.island&&!this.game.terrain.island.naturalCircleFree(x,y,r+18)))continue;
      return {id:`${type}:${tx},${ty}`,type,x,y,r,seed,sortY:y,aimY:y,hp:type==='vine'?1:undefined,state:'idle',remaining:2+seed*2,maxRemaining:2+seed*2,warning:0,charge:0};
    }
    return null;
  }
  _objectiveClear(prop){
    const g=this.game,r=prop.r;
    if(g.relicSites?.isSafePoint(prop.x,prop.y,r)===false)return false;
    if(g.regions?.isSafePoint?.(prop.x,prop.y,r)===false)return false;
    if(g.settlements?.isSafePoint(prop.x,prop.y,r)===false)return false;
    if(g.adventure?.props.some(o=>distance(o,prop)<r+(o.r||18)+20))return false;
    if(g.adventure?.treasure&&distance(g.adventure.treasure,prop)<r+70)return false;
    if(g.companions?.camp&&distance(g.companions.camp,prop)<r+135)return false;
    if(g.portal&&distance(g.portal,prop)<r+65)return false;
    return true;
  }
  _mushroomClear(prop){
    const env=this.environment;
    if(env.props.some(o=>o.state!=='spent'&&distance(o,prop)<prop.r+(o.blastRadius||82)+16))return false;
    // Include mushrooms outside the small live cache so the mechanisms cannot
    // claim a spot first and later be joined by an unseen explosive mushroom.
    const tx=Math.floor(prop.x/CELL),ty=Math.floor(prop.y/CELL);
    for(let x=tx-1;x<=tx+1;x++)for(let y=ty-1;y<=ty+1;y++)
      if(env._mushroomsAt(x,y,{ignoreObjectives:true}).some(o=>distance(o,prop)<prop.r+(o.blastRadius||82)+16))return false;
    return true;
  }
  _refresh(initial=false){
    const g=this.game,p=this._foot(),halfW=Math.min(900,g.viewWidth*.5)+300,halfH=Math.min(650,g.viewHeight*.5)+300;
    this.props=this.props.filter(o=>o.state!=='cut'&&Math.abs(o.x-p.x)<halfW+180&&Math.abs(o.y-p.y)<halfH+180).slice(0,REGIONAL_MECHANISM_RULES.maxProps);
    const ids=new Set(this.props.map(o=>o.id)),candidates=[];
    for(let tx=Math.floor((p.x-halfW)/CELL);tx<=Math.floor((p.x+halfW)/CELL);tx++)for(let ty=Math.floor((p.y-halfH)/CELL);ty<=Math.floor((p.y+halfH)/CELL);ty++){
      const prop=this._candidate(tx,ty);
      if(!prop||ids.has(prop.id)||this._used.has(prop.id)||!this._objectiveClear(prop)||!this._mushroomClear(prop))continue;
      if(!initial&&this._visible(prop,prop.r+24))continue;
      candidates.push(prop);
    }
    candidates.sort((a,b)=>distance(a,p)-distance(b,p));
    this.props.push(...candidates.slice(0,Math.max(0,REGIONAL_MECHANISM_RULES.maxProps-this.props.length)));
  }
  isHazardFree(x,y,r=0){
    if(![x,y,r].every(Number.isFinite)||r<0)return false;
    const overlaps=o=>o.type!=='rune'&&o.state!=='cut'&&Math.hypot(o.x-x,o.y-y)<o.r+r+12;
    if(this.props.some(overlaps))return false;
    if(!this.generation||this.region==='ruins')return true;
    const margin=r+REGIONAL_MECHANISM_RULES.gasRadius+12;
    for(let tx=Math.floor((x-margin)/CELL);tx<=Math.floor((x+margin)/CELL);tx++)for(let ty=Math.floor((y-margin)/CELL);ty<=Math.floor((y+margin)/CELL);ty++){
      const prop=this._candidate(tx,ty);
      if(prop&&!this._used.has(prop.id)&&overlaps(prop))return false;
    }
    return true;
  }
  movementMultiplier(entity,isPlayer=entity===this.game.player){
    if(!isGrounded(entity))return 1;
    const point=this._foot(entity,isPlayer);
    return this.props.some(o=>o.type==='vine'&&o.state==='active'&&distance(o,point)<=o.r)?REGIONAL_MECHANISM_RULES.vineSlow:1;
  }
  nearestDestructible(range=280){
    const p=this.game.player;let best=range,result=null;
    for(const prop of this.props)if(prop.type==='vine'&&(prop.state==='windup'||prop.state==='active')&&this._visible(prop)){
      const d=Math.hypot(prop.x-p.x,prop.aimY-p.y);if(d<best){result=prop;best=d;}
    }
    return result;
  }
  _cut(prop){
    if(this.game.status!=='playing'||prop.type!=='vine'||prop.state==='cut')return false;
    prop.id??=`vine:fixture:${++this._fixtureId}`;prop.state='cut';prop.hp=0;this._used.add(prop.id);
    this.game._effect(prop.x,prop.y,'vineCut',.45,prop.r,'#afd887');return true;
  }
  hitAt(x,y,r=0,source='arrow'){
    if(!WEAPON_SOURCES.has(source)||![x,y,r].every(Number.isFinite)||r<0)return 0;
    let count=0;for(const prop of this.props)if(prop.type==='vine'&&Math.hypot(prop.x-x,(prop.aimY??prop.y)-y)<=r+prop.r&&this._cut(prop))count++;
    this.props=this.props.filter(o=>o.state!=='cut');return count;
  }
  hitSegment(x1,y1,x2,y2,r=0,source='arrow'){
    if(!WEAPON_SOURCES.has(source)||![x1,y1,x2,y2,r].every(Number.isFinite)||r<0)return 0;
    let count=0;for(const prop of this.props)if(prop.type==='vine'&&segmentDistance(prop.x,prop.aimY??prop.y,x1,y1,x2,y2)<=r+prop.r&&this._cut(prop))count++;
    this.props=this.props.filter(o=>o.state!=='cut');return count;
  }
  hitAllVisible(source='storm'){
    if(!WEAPON_SOURCES.has(source))return 0;
    let count=0;for(const prop of this.props)if(this._visible(prop,prop.r)&&this._cut(prop))count++;
    this.props=this.props.filter(o=>o.state!=='cut');return count;
  }
  _phase(prop,state,duration){prop.state=state;prop.remaining=duration;prop.maxRemaining=duration;prop.warning=0;}
  _cycle(prop,dt){
    const vine=prop.type==='vine',warning=vine?REGIONAL_MECHANISM_RULES.vineWarning:REGIONAL_MECHANISM_RULES.gasWarning,active=vine?REGIONAL_MECHANISM_RULES.vineActive:REGIONAL_MECHANISM_RULES.gasActive;
    if(!this._visible(prop)){
      // An offscreen hazard always re-enters through its complete warning.
      this._phase(prop,'idle',2+(prop.seed||0)*2);return;
    }
    if(prop.state==='idle'){
      if(vine&&distance(prop,this._foot())>prop.r+110)return;
      prop.remaining-=dt;if(prop.remaining<=1e-9)this._phase(prop,vine?'windup':'warn',warning);
    }else if(prop.state===(vine?'windup':'warn')){
      prop.remaining=Math.max(0,prop.remaining-dt);prop.warning=1-prop.remaining/warning;
      if(prop.remaining<=1e-9)this._phase(prop,'active',active);
    }else if(prop.state==='active'){
      prop.remaining-=dt;if(prop.remaining<=1e-9)this._phase(prop,'idle',4+(prop.seed||0)*2);
    }
  }
  _rune(prop,dt){
    if(prop.state==='spent')return;
    if(prop.state==='idle'||prop.state==='charging'){
      if(distance(prop,this._foot())>prop.r){prop.state='idle';prop.charge=0;return;}
      prop.state='charging';prop.charge=Math.min(1,(prop.charge||0)+dt/REGIONAL_MECHANISM_RULES.runeCharge);
      if(prop.charge<1-1e-9)return;
      this.activateRune(prop);return;
    }
    if(prop.state!=='active')return;
    prop.remaining-=dt;
    if(prop.remaining<=1e-9){this._phase(prop,'spent',0);return;}
    prop._shot=(prop._shot??.3)-dt;if(prop._shot>1e-9)return;
    prop._shot=REGIONAL_MECHANISM_RULES.runeInterval;
    if(!this._visible(prop,100))return;
    const g=this.game,targets=g.enemies.filter(e=>e.hp>0&&g._inView(e)&&distance(prop,e)<=REGIONAL_MECHANISM_RULES.runeRange).sort((a,b)=>distance(prop,a)-distance(prop,b)).slice(0,REGIONAL_MECHANISM_RULES.runeTargets);
    const damage=30*(1+Math.min(Math.max(g.time,0),600)/1200);
    for(const enemy of targets){
      if(g.status!=='playing')break;
      g._effect(prop.x,prop.y,'runeBolt',.32,enemy.r,'#85e2de',undefined,{x2:enemy.x,y2:enemy.y,seed:enemy.id});
      g._hurtEnemy(enemy,damage,0,prop,'rune');
    }
  }
  activateRune(prop){
    if(this.game.status!=='playing'||prop.type!=='rune'||!['idle','charging'].includes(prop.state))return false;
    prop.charge=1;prop.id??=`rune:fixture:${++this._fixtureId}`;this._used.add(prop.id);
    this._phase(prop,'active',REGIONAL_MECHANISM_RULES.runeDuration);prop._shot=.3;this.game._emit('runeActivated');return true;
  }
  _gasDamage(dt){
    const g=this.game,active=this.props.filter(o=>o.type==='gas'&&o.state==='active'&&this._visible(o));
    this._gasCooldown=Math.max(0,this._gasCooldown-dt);this._gasEnemyClock=Math.max(0,this._gasEnemyClock-dt);
    if(!active.length)return;
    // One shared clock caps overlapping clouds at one player hit per second.
    if(this._gasCooldown<=1e-9&&active.some(o=>distance(o,this._foot())<=o.r)){
      this._gasCooldown=REGIONAL_MECHANISM_RULES.gasInterval;g._hurtPlayer(REGIONAL_MECHANISM_RULES.gasPlayerDamage);
    }
    if(g.status!=='playing'||this._gasEnemyClock>1e-9)return;
    this._gasEnemyClock=REGIONAL_MECHANISM_RULES.gasInterval;
    for(const enemy of [...g.enemies])if(enemy.hp>0&&g._inView(enemy)&&active.some(o=>distance(o,this._foot(enemy,false))<=o.r))
      g._hurtEnemy(enemy,REGIONAL_MECHANISM_RULES.gasEnemyDamage,0,g.player,'gas');
  }
  update(dt){
    if(this.game.status!=='playing')return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    // Protect new objectives even if a fallback spawn could not avoid a hazard.
    if(this.generation)this.props=this.props.filter(prop=>{
      if(this._objectiveClear(prop))return true;
      this._used.add(prop.id);return false;
    });
    for(const prop of this.props){
      if(this.game.status!=='playing')break;
      if(prop.type==='rune')this._rune(prop,dt);else if(prop.type==='vine'||prop.type==='gas')this._cycle(prop,dt);
    }
    if(this.game.status!=='playing')return;
    this._gasDamage(dt);
    if(this.game.status!=='playing')return;
    if(this.generation){this._refreshClock-=dt;if(this._refreshClock<=0){this._refreshClock=.6;this._refresh();}}
  }
}
