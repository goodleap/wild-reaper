import { groundOffset } from './terrain.js';
import { RegionalMechanisms } from './regional-mechanisms.js';

const CELL=520,TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const WEAPON_SOURCES=new Set(['arrow','orbit','pulse','echo','lightning','storm']);
export const ENVIRONMENT_BALANCE=Object.freeze({maxProps:20,maxMuds:12,mushroomFuse:.9,blastRadius:82,mudMultiplier:.74,safeRadius:240,despawnDistance:1800});

// This fixed-size filter remembers armed locations for the whole run. A false
// positive can only omit a mushroom; leaving and revisiting never farms it.
class ConsumedMushrooms {
  constructor(){this.bits=new Uint8Array(65536);}
  _keys(id){let a=2166136261,b=5381;for(let i=0;i<id.length;i++){a=Math.imul(a^id.charCodeAt(i),16777619);b=Math.imul(b,33)^id.charCodeAt(i);}return [a>>>0,b>>>0,(a+b)>>>0];}
  has(id){return this._keys(id).every(n=>{const bit=n%(this.bits.length*8);return this.bits[bit>>>3]&(1<<(bit&7));});}
  add(id){for(const n of this._keys(id)){const bit=n%(this.bits.length*8);this.bits[bit>>>3]|=1<<(bit&7);}}
}

function segmentDistance(x,y,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/length)):0;
  return Math.hypot(x-x1-dx*t,y-y1-dy*t);
}

export class Environment {
  constructor(game,{generation=true}={}){
    this.game=game;this.generation=generation;this.props=[];this.muds=[];
    this.region=['forest','marsh','ruins'].includes(game.region?.id)?game.region.id:'forest';
    this.seed=Number.isFinite(game.regionIndex)?Math.trunc(game.regionIndex):0;
    this._refreshClock=0;this._fixtureId=0;this._consumed=new ConsumedMushrooms();
    if(generation)this._refresh(true);
    this.mechanisms=new RegionalMechanisms(this,{generation});
  }
  _hash(x,y=0){const offset=this.region==='marsh'?419:this.region==='ruins'?811:0;return hash(x+this.seed*131+offset,y+this.seed*197+offset);}
  _foot(entity=this.game.player,isPlayer=entity===this.game.player){return {x:entity.x,y:entity.y+groundOffset(entity,isPlayer)};}
  _visible(x,y,margin=0){const g=this.game;return Math.abs(x-g.player.x)<=g.viewWidth*.5+margin&&Math.abs(y-g.player.y)<=g.viewHeight*.5+margin;}
  _terrainClear(x,y,r){return Math.hypot(x,y)>=ENVIRONMENT_BALANCE.safeRadius+r&&this.game.terrain.isFree(x,y,r);}
  _objectiveClear(x,y,r){
    const adventure=this.game.adventure;
    if(adventure?.props.some(o=>distance(o,{x,y})<r+(o.r||18)+8))return false;
    if(adventure?.treasure&&distance(adventure.treasure,{x,y})<r+(adventure.treasure.r||27)+15)return false;
    return true;
  }
  _point(tx,ty,seed,r){
    // Every retry depends only on the owning cell. No random walk or growing
    // world cache is needed, and obstacle checks preserve open walking routes.
    for(let i=0;i<7;i++){
      const x=tx*CELL+80+this._hash(tx+seed+i*17,ty+419)*360;
      const y=ty*CELL+80+this._hash(tx+503,ty+seed+i*29)*360;
      if(this._terrainClear(x,y,r))return {x,y};
    }
    return null;
  }
  _mushroomsAt(tx,ty,{ignoreObjectives=false}={}){
    const seed=this._hash(tx+683,ty+727),chance=this.region==='marsh'?.61:this.region==='ruins'?.48:.57;if(seed>chance)return [];
    const point=this._point(tx,ty,751,35);if(!point)return [];
    const make=(point,index)=>{
      const id=`mushroom:${tx},${ty}:${index}`;
      // Objectives may suppress a location, but can never move its stable ID
      // to another point after a crate breaks or a treasure disappears.
      return this._consumed.has(id)||(!ignoreObjectives&&!this._objectiveClear(point.x,point.y,ENVIRONMENT_BALANCE.blastRadius))?null:{id,type:'mushroom',...point,r:17,aimY:point.y-13,sortY:point.y,seed:this._hash(tx+797+index,ty+809),state:'idle',fuse:0,maxFuse:ENVIRONMENT_BALANCE.mushroomFuse,blastRadius:ENVIRONMENT_BALANCE.blastRadius};
    };
    const result=[],first=make(point,0);if(first)result.push(first);
    // Occasional pairs show the delayed chain reaction without filling paths.
    if(seed<.14){
      const angle=this._hash(tx+853,ty+877)*TAU,next={x:point.x+Math.cos(angle)*88,y:point.y+Math.sin(angle)*88};
      if(this._terrainClear(next.x,next.y,35)){const second=make(next,1);if(second)result.push(second);}
    }
    return result;
  }
  _mudAt(tx,ty){
    const seed=this._hash(tx+911,ty+947),chance=this.region==='marsh'?.52:this.region==='ruins'?.16:.36;if(seed>chance)return null;
    const rx=68+this._hash(tx+971,ty+977)*18,ry=38+this._hash(tx+991,ty+997)*12;
    const point=this._point(tx,ty,1013,rx+8);
    return point&&this._objectiveClear(point.x,point.y,rx+8)?{id:`mud:${tx},${ty}`,type:'mud',...point,rx,ry,seed}:null;
  }
  _refresh(initial=false){
    const g=this.game,p=this._foot(),halfW=Math.min(900,g.viewWidth*.5)+260,halfH=Math.min(650,g.viewHeight*.5)+260;
    const nearby=o=>Math.abs(o.x-p.x)<halfW+200&&Math.abs(o.y-p.y)<halfH+200;
    this.props=this.props.filter(o=>o.state!=='spent'&&(o.state==='armed'||nearby(o))).slice(0,ENVIRONMENT_BALANCE.maxProps);
    this.muds=this.muds.filter(nearby).slice(0,ENVIRONMENT_BALANCE.maxMuds);
    const propIds=new Set(this.props.map(o=>o.id)),mudIds=new Set(this.muds.map(o=>o.id)),props=[],muds=[];
    for(let tx=Math.floor((p.x-halfW)/CELL);tx<=Math.floor((p.x+halfW)/CELL);tx++)
      for(let ty=Math.floor((p.y-halfH)/CELL);ty<=Math.floor((p.y+halfH)/CELL);ty++){
        for(const o of this._mushroomsAt(tx,ty))if(!propIds.has(o.id)&&(initial||!this._visible(o.x,o.y,48)))props.push(o);
        const mud=this._mudAt(tx,ty);
        if(mud&&!mudIds.has(mud.id)&&(initial||!this._visible(mud.x,mud.y,mud.rx)))muds.push(mud);
      }
    props.sort((a,b)=>distance(a,p)-distance(b,p));muds.sort((a,b)=>distance(a,p)-distance(b,p));
    this.props.push(...props.slice(0,Math.max(0,ENVIRONMENT_BALANCE.maxProps-this.props.length)));
    this.muds.push(...muds.slice(0,Math.max(0,ENVIRONMENT_BALANCE.maxMuds-this.muds.length)));
  }
  movementMultiplier(entity,isPlayer=false){
    const point=this._foot(entity,isPlayer);
    const mud=this.muds.some(m=>((point.x-m.x)/m.rx)**2+((point.y-m.y)/m.ry)**2<=1)?ENVIRONMENT_BALANCE.mudMultiplier:1;
    return Math.min(mud,this.mechanisms.movementMultiplier(entity,isPlayer));
  }
  isHazardFree(x,y,r=0){return this.mechanisms.isHazardFree(x,y,r);}
  nearestDestructible(range=280){return this.mechanisms.nearestDestructible(range);}
  _arm(prop,source){
    if(this.game.status!=='playing'||prop.state==='armed'||prop.state==='spent')return false;
    prop.id??=`mushroom:fixture:${++this._fixtureId}`;
    prop.state='armed';prop.maxFuse=ENVIRONMENT_BALANCE.mushroomFuse;prop.fuse=prop.maxFuse;
    prop.blastRadius=ENVIRONMENT_BALANCE.blastRadius;prop.source=source;
    this._consumed.add(prop.id);this.game._emit('mushroomArmed',{x:prop.x,y:prop.y});return true;
  }
  hitAt(x,y,r=0,source='arrow'){
    if(!WEAPON_SOURCES.has(source)||![x,y,r].every(Number.isFinite)||r<0)return 0;
    let count=0;for(const prop of this.props)if(Math.hypot(prop.x-x,(prop.aimY??prop.y-13)-y)<=r+(prop.r||17)&&this._arm(prop,source))count++;
    return count+this.mechanisms.hitAt(x,y,r,source);
  }
  hitSegment(x1,y1,x2,y2,r=0,source='arrow'){
    if(!WEAPON_SOURCES.has(source)||![x1,y1,x2,y2,r].every(Number.isFinite)||r<0)return 0;
    let count=0;for(const prop of this.props)if(segmentDistance(prop.x,prop.aimY??prop.y-13,x1,y1,x2,y2)<=r+(prop.r||17)&&this._arm(prop,source))count++;
    return count+this.mechanisms.hitSegment(x1,y1,x2,y2,r,source);
  }
  hitAllVisible(source='storm'){
    if(!WEAPON_SOURCES.has(source))return 0;
    let count=0;for(const prop of this.props)if(this._visible(prop.x,prop.aimY??prop.y-13,prop.r||17)&&this._arm(prop,source))count++;
    return count+this.mechanisms.hitAllVisible(source);
  }
  _explode(prop){
    const g=this.game,r=prop.blastRadius||ENVIRONMENT_BALANCE.blastRadius;
    prop.state='spent';g._effect(prop.x,prop.y,'mushroomBlast',.5,r,'#ffbd70',undefined,{source:prop.source});
    g._emit('mushroomBlast',{x:prop.x,y:prop.y});
    const damage=90*(1+Math.min(Math.max(g.time,0),600)/1200);
    // Raw damage avoids recursively creating bleeding, shock, or new attacks.
    // Snapshotting also survives treasure/event kill handlers replacing arrays.
    for(const enemy of [...g.enemies])if(enemy.hp>0&&distance(this._foot(enemy,false),prop)<=r+enemy.r)g._hurtEnemy(enemy,damage,0,g.player,'mushroom');
    if(distance(this._foot(),prop)<=r+g.player.r)g._hurtPlayer(12);
    if(g.status!=='playing')return;
    for(const next of this.props)if(next!==prop&&distance(next,prop)<=r+(next.r||17))this._arm(next,'chain');
  }
  update(dt){
    const g=this.game;if(g.status!=='playing')return;
    dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    const p=this._foot();
    // Consume distant armed props quietly (for example after a debug teleport).
    // They never award remote kills and cannot be rearmed on a later visit.
    this.props=this.props.filter(o=>o.state!=='spent'&&(o.state!=='armed'||distance(o,p)<=ENVIRONMENT_BALANCE.despawnDistance));
    const ready=[];
    for(const prop of this.props)if(prop.state==='armed'){prop.fuse-=dt;if(prop.fuse<=1e-9)ready.push(prop);}
    // A mushroom armed by this loop starts its full fuse on the next update.
    for(const prop of ready){if(g.status!=='playing')break;this._explode(prop);}
    this.props=this.props.filter(o=>o.state!=='spent');
    if(g.status!=='playing')return;
    if(this.generation){this._refreshClock-=dt;if(this._refreshClock<=0){this._refreshClock=.5;this._refresh();}}
    this.mechanisms.update(dt);
  }
}
