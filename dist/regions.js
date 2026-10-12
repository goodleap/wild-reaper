import { groundOffset } from './terrain.js';
import { waterIntersectsCircle } from './water-geometry.js';

export const REGIONS=Object.freeze([
  Object.freeze({id:'forest',name:'低语之森',shortName:'密林',colors:{ground:'#263e30',light:'#35503a',dark:'#182b22',accent:'#a9d991',mist:'#c1d6a9',grass:'#648052',stone:'#788170'},enemyWeights:{slime:1,beetle:1,bat:1,brute:1,boar:1,spore:1}}),
  Object.freeze({id:'marsh',name:'迷雾沼泽',shortName:'沼泽',colors:{ground:'#253c3d',light:'#36504c',dark:'#192d31',accent:'#a0d0c4',mist:'#bbd5d2',grass:'#64877b',stone:'#708c85'},enemyWeights:{slime:1.25,beetle:.8,bat:.7,brute:1.1,boar:.85,spore:1.7}}),
  Object.freeze({id:'ruins',name:'失落遗迹',shortName:'遗迹',colors:{ground:'#41413a',light:'#555345',dark:'#2b302e',accent:'#dbc891',mist:'#dbd2b4',grass:'#858467',stone:'#a09b82'},enemyWeights:{slime:.8,beetle:1.45,bat:.8,brute:1.45,boar:.9,spore:.8}})
]);
export const regionFor=(index)=>REGIONS[((index%REGIONS.length)+REGIONS.length)%REGIONS.length];

// Keep the old forest probabilities and population cap. Other regions change
// the mix of ordinary spawns, never the frequency or unlock time.
export function regionEnemyType(game,roll) {
  const t=game.time,late=Math.max(0,t-150)/60;
  const brute=t>60?Math.min(.15,.07+late*.006):0;
  const bat=t>23?Math.min(.8,.35+late*.033):0;
  const beetle=t>12?Math.max(.65,Math.min(.8,.35+late*.033)+.1):0;
  const boar=t>=30&&game.enemies.filter(e=>e.type==='boar'&&e.hp>0).length<5?.06:0;
  const spore=t>=45&&game.enemies.filter(e=>e.type==='spore'&&e.hp>0).length<4?.05:0;
  if(game.region.id==='forest') {
    let type=roll<brute?'brute':roll<bat?'bat':roll<beetle?'beetle':'slime';
    if(boar&&roll>.89&&roll<=.95)type='boar';
    else if(spore&&roll>.95)type='spore';
    return type;
  }
  const weights={brute,bat:Math.max(0,bat-brute),beetle:Math.max(0,beetle-bat),slime:Math.max(.01,1-beetle-boar-spore),boar,spore};
  let total=0;for(const type of Object.keys(weights)){weights[type]*=game.region.enemyWeights[type];total+=weights[type];}
  let cursor=roll*total;
  for(const [type,weight] of Object.entries(weights)){cursor-=weight;if(cursor<0)return type;}
  return 'slime';
}

export const PORTAL_RULES=Object.freeze({engageRadius:420,leashRadius:630,interactRadius:82});
const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Only the current region is simulated. Inactive worlds retain their finite
// authored objectives; disposable chase mobs and terrain caches are released.
export class Regions {
  constructor(game){this.game=game;this._lastBossId=null;this.portals=[];this.states=new Map();this.guarded=!!game._features.adventure;this.rewardPortal=null;}
  _safePoint(origin={x:0,y:0},forward=false) {
    const g=this.game,p=feet(g);
    // Reserve both the gate's approach and its guardian's footing. Expanding
    // each actual water contour leaves the existing swamp untouched.
    const dry=(x,y,r)=>!g.environment?.muds?.some(mud=>waterIntersectsCircle(mud,x,y,r));
    const safe=(x,y)=>g.terrain.isFree(x,y,forward?112:40)&&dry(x,y,forward?112:45)&&
      (!forward||dry(x,y+115,66))&&g.relicSites?.isSafePoint(x,y,forward?180:60)!==false&&
      g.settlements?.isSafePoint(x,y,forward?150:45)!==false&&g.environment?.isHazardFree?.(x,y,forward?90:45)!==false&&
      !g.environment?.props.some(o=>distance(o,{x,y})<(o.blastRadius||82)+80)&&
      !g.adventure?.props.some(o=>distance(o,{x,y})<100)&&
      (!g.adventure?.treasure||distance(g.adventure.treasure,{x,y})>220)&&
      (!g.companions?.camp||distance(g.companions.camp,{x,y})>350);
    const radii=forward?[1120,1270,1420,1570,1720,1870,2020,2170]:[90,150,220,300,400];
    for(const radius of radii)for(let i=0;i<48;i++) {
      const a=(g.regionIndex*.93)+i*Math.PI/24,x=Math.round(origin.x+Math.cos(a)*radius),y=Math.round(origin.y+Math.sin(a)*radius);
      if(safe(x,y)&&(!forward||g.terrain.isFree(x,y+115,66)))return {x,y};
    }
    // Procedural maps have many clear candidates. The fallback is only needed
    // by deliberately sealed test terrains, and must still be reachable.
    return {...p};
  }
  initialize(fromPortal=null,fromRegionIndex=null) {
    const g=this.game;this.portals=[];g.portal=null;
    if(fromPortal) {
      const back={id:`portal:${g.regionIndex}:back`,x:0,y:62,r:32,interactRadius:PORTAL_RULES.interactRadius,state:'active',direction:'back',nextRegionIndex:fromRegionIndex,nextRegion:regionFor(fromRegionIndex),targetPortalId:fromPortal.id,discovered:true,rewardClaimed:true};
      fromPortal.targetPortalId=back.id;this.portals.push(back);
    }
    if(!this.guarded)return;
    const portal={id:`portal:${g.regionIndex}:forward`,...this._safePoint({x:0,y:0},true),r:32,interactRadius:PORTAL_RULES.interactRadius,state:'locked',direction:'forward',nextRegionIndex:g.regionIndex+1,nextRegion:regionFor(g.regionIndex+1),discovered:false,rewardClaimed:false};
    this.portals.push(portal);g.portal=portal;
    const boss=g._spawnEnemy('boss',1);boss.bossIndex=g.regionIndex+1;
    // Boss scaling belongs to the region, never to the number of revisits.
    const n=g.regionIndex;boss.hp=boss.maxHp=(g.easy?1700:2300)*(1+n*.65+n*n*.12);boss.damage=22*(1+n*.3)*(g.easy?.72:1);boss.xp=Math.round(160*(1+n*.3));
    boss.portalId=portal.id;boss.portalHome={x:portal.x,y:portal.y+115};boss.x=boss.portalHome.x;boss.y=boss.portalHome.y-groundOffset(boss);boss.guardActive=false;boss._portalAnnounced=false;portal.bossId=boss.id;
    // _spawnEnemy initializes its pattern; select the region's stable pattern.
    g._initializeRegionalBoss?.(boss);g._moveEntity(boss,0,0);
  }
  update() {
    const g=this.game;if(g.dungeon?.active)return;
    const p=feet(g);
    for(const portal of this.portals) {
      if(portal.state!=='locked')continue;
      const boss=g.enemies.find(e=>e.id===portal.bossId&&e.hp>0);if(!boss)continue;
      const d=distance(p,portal),was=boss.guardActive;
      boss.guardActive=g.regionGrace<=0&&(d<=PORTAL_RULES.engageRadius||(was&&d<=PORTAL_RULES.leashRadius));
      if(boss.guardActive)portal.discovered=true;
      if(boss.guardActive&&!boss._portalAnnounced){boss._portalAnnounced=true;g.bossCount++;g.bossSpawned=true;g.bossDefeated=false;g._emit('boss');}
      if(!boss.guardActive) {
        g._clearRegionalBossAttacks?.(boss);
        boss.guardReturnTarget=boss.portalHome;
      } else boss.guardReturnTarget=null;
    }
  }
  updateEnemy(enemy,dt) {
    if(!enemy.portalId)return false;
    const g=this.game,portal=this.portals.find(p=>p.id===enemy.portalId);if(!portal)return true;
    if(!enemy.guardActive) {
      if(distance({x:enemy.x,y:enemy.y+groundOffset(enemy)},enemy.portalHome)>5)g._moveEnemy(enemy,dt,enemy.portalHome);
      return true;
    }
    // A collision/knockback cannot drag the guardian out of its home arena.
    if(distance({x:enemy.x,y:enemy.y+groundOffset(enemy)},portal)>PORTAL_RULES.leashRadius-70) {
      g._clearRegionalBossAttacks?.(enemy);g._moveEnemy(enemy,dt,enemy.portalHome);return true;
    }
    return false;
  }
  canDamage(enemy) {
    if(!enemy.portalId)return true;
    const portal=this.portals.find(p=>p.id===enemy.portalId);
    if(!portal||portal.state!=='locked'||distance(feet(this.game),portal)>PORTAL_RULES.leashRadius)return false;
    enemy.guardActive=true;
    if(!enemy._portalAnnounced){enemy._portalAnnounced=true;this.game.bossCount++;this.game._emit('boss');}
    return true;
  }
  openPortal(enemy) {
    if(enemy.type!=='boss'||enemy.dungeonBoss||enemy.dungeonId||enemy.hp>0||enemy.id===this._lastBossId)return null;
    const g=this.game;let portal=enemy.portalId?this.portals.find(p=>p.id===enemy.portalId):g.portal;
    if(portal?.state==='active'&&portal.rewardClaimed)return null;
    this._lastBossId=enemy.id;
    if(!portal) {
      portal={id:`portal:${g.regionIndex}:forward`,...this._safePoint({x:enemy.x,y:enemy.y+groundOffset(enemy)}),r:32,interactRadius:PORTAL_RULES.interactRadius,direction:'forward',nextRegion:regionFor(g.regionIndex+1),nextRegionIndex:g.regionIndex+1,rewardClaimed:false};
      this.portals.push(portal);g.portal=portal;
    }
    portal.state='active';portal.discovered=true;portal.bossId=enemy.id;
    this.rewardPortal=portal;
    g.superSkills.offer('region',g.region.id);g._regionRewardPending=true;
    g.settlements?.ensureAngels?.();
    g._emit('portalOpened',{nextRegionId:portal.nextRegion.id,name:portal.nextRegion.name});return portal;
  }
  flushReward() {
    const g=this.game;
    if(!g._regionRewardPending||g.status!=='playing'||g.superSkills.pending?.source!=='region')return false;
    g._regionRewardPending=false;g.status='super';g._emit('superChoice',{source:'region',regionId:g.region.id});return true;
  }
  completeReward(){if(this.rewardPortal)this.rewardPortal.rewardClaimed=true;this.rewardPortal=null;this.game._regionRewardPending=false;}
  isSafePoint(x,y,r=0){return this.game.dungeon?.active||this.portals.every(portal=>Math.hypot(x-portal.x,y-portal.y)>90+r);}
  _portal(portalOrId) {
    if(portalOrId&&typeof portalOrId==='object')return portalOrId;
    return this.portals.find(portal=>portal.id===portalOrId)||(!portalOrId?this.nearest():null);
  }
  nearest() {
    const p=feet(this.game);return [...this.portals].sort((a,b)=>distance(p,a)-distance(p,b))[0]||this.game.portal;
  }
  canEnter(portalOrId) {
    const g=this.game,portal=this._portal(portalOrId);
    return !!(portal&&portal.state==='active'&&g.status==='playing'&&!g.superSkills.pending&&!g.dungeon?.active&&
      !g.enemies.some(e=>e.type==='boss'&&e.hp>0&&e.guardActive!==false)&&distance(feet(g),portal)<=portal.interactRadius);
  }
  getInteraction() {
    const portal=this.nearest(),g=this.game;if(!portal||g.status!=='playing'||g.dungeon?.active||distance(feet(g),portal)>portal.interactRadius)return null;
    const locked=portal.state!=='active',enabled=this.canEnter(portal);
    return {id:portal.id,type:'portal',label:locked?'击败驻门首领':`${portal.direction==='back'?'返回':'前往'}${portal.nextRegion.name}`,description:locked?'首领守护着封印的传送门':'已激活 · 可以往返穿越',x:portal.x,y:portal.y,enabled};
  }
  saveWorld() {
    const g=this.game;
    const enemies=g.enemies.filter(e=>e.hp>0&&(e.portalId||e.guardianId||e.eventId||e.rescueId||e.settlementId||e.relicSiteId));
    g.terrain._cache?.clear();
    const state={savedAt:g.time,savedClock:g._clock,terrain:g.terrain,adventure:g.adventure,environment:g.environment,encounters:g.encounters,settlements:g.settlements,relicSites:g.relicSites,enemies,gems:g.gems,coins:g.coins,portals:this.portals,portal:g.portal,dungeonStates:g.dungeon.states,discoveredMap:g.discoveredMap,
      companionCamp:g.companions.camp,companionNextAt:g.companions.nextAt,companionGeneration:g.companions.generation,bossDefeated:g.bossDefeated,nextBossAt:g.nextBossAt};
    this.states.set(g.regionIndex,state);return state;
  }
  restoreWorld(index) {
    const state=this.states.get(index);if(!state)return false;
    const g=this.game,delta=g.time-state.savedAt,clockDelta=g._clock-state.savedClock;
    for(const key of ['terrain','adventure','environment','encounters','settlements','relicSites','enemies','gems','coins','portal','discoveredMap','bossDefeated','nextBossAt'])g[key]=state[key];
    this.portals=state.portals;g.dungeon.states=state.dungeonStates;
    g.companions.camp=state.companionCamp;g.companions.generation=state.companionGeneration;g.companions.nextAt=state.companionNextAt+delta;
    if(g.adventure)g.adventure._nextTreasureAt+=delta;if(g.encounters)g.encounters.nextAt+=delta;
    for(const e of g.enemies)for(const key of ['superRootUntil','shockUntil'])if(Number.isFinite(e[key]))e[key]+=clockDelta;
    this.states.delete(index);return true;
  }
}
