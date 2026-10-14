import { getStageDefinition } from './stage-definitions.js';
import { groundOffset } from './terrain.js';
import { enemyDefinition } from './enemy-definitions.js';
import { regionFor } from './world-definitions.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});

// Theme definitions are reusable; this run owns the identity and objectives
// of each island instance. Suspended island contents remain owned by Regions.
export class StageRun {
  constructor(game,id){
    const definition=getStageDefinition(id);if(!definition)throw new RangeError(`Unknown stage: ${id}`);
    this.game=game;this.definition=definition;this.id=definition.id;this.name=definition.name;
    this.currentMapId=definition.startMapId;this.completed=false;
    this.objectives=new Map(definition.islands.map(map=>[map.id,{defeated:false,rewardClaimed:false}]));
  }
  get currentIsland(){return this.island(this.currentMapId);}
  island(id){return this.definition.islands.find(map=>map.id===id)||null;}
  get coreDefeated(){return this.objectives.get(this.definition.coreMapId).defeated;}
  get isBossIsland(){return this.currentIsland.role==='boss';}
  get objectiveLabel(){return this.completed?`${this.name}已通关`:this.coreDefeated?'进入通关门，完成试炼':this.isBossIsland?'击败核心首领 · 可返回外岛准备':'探索成长 · 前往核心岛挑战首领';}
  portalId(from,to){return `portal:${from}:${to}`;}
  initialize(){
    const g=this.game,map=this.currentIsland,plan=g.terrain.island?.plan||{};
    for(const connection of map.connections){
      const target=this.island(connection.targetMapId),point=plan[`portal:${target.id}`];
      if(!point)throw new Error(`Missing stage portal layout: ${map.id} → ${target.id}`);
      g.regions.portals.push({id:this.portalId(map.id,target.id),x:point.x,y:point.y,r:32,interactRadius:82,state:'active',kind:'travel',connectionId:connection.id,nextMapId:target.id,nextRegionIndex:target.themeIndex,nextRegion:{...regionFor(target.themeIndex),name:target.name},targetPortalId:this.portalId(target.id,map.id),discovered:false,rewardClaimed:true});
    }
    if(!this.objectives.get(map.id).defeated)this.spawnBoss();
    if(this.isBossIsland&&this.coreDefeated)this.openExit();
    g.portal=g.regions.portals[0]||null;g.regions._setStructures();
  }
  spawnBoss(){
    const g=this.game,map=this.currentIsland,definition=map.boss,home=g.terrain.island?.plan?.stageBoss;
    if(!definition||!home)return null;
    const boss=g._spawnEnemy('boss',1);
    boss.bossIndex=definition.index;boss.stageBoss=map.id;boss.stageBossRole=definition.role;
    boss.hp=boss.maxHp=g.easy?definition.easyHp:definition.hp;
    boss.damage=definition.damage*(g.easy?.72:1);boss.speed=enemyDefinition('boss').baseSpeed*definition.speed*(g.easy?.9:1);boss.xp=definition.xp;
    boss.stageHome={x:home.x,y:home.y};boss.x=home.x;boss.y=home.y-groundOffset(boss);boss.guardActive=false;boss._stageAnnounced=false;
    g._initializeRegionalBoss(boss);g._moveEntity(boss,0,0);return boss;
  }
  update(){
    const g=this.game,p=foot(g);
    for(const boss of g.enemies){
      if(!boss.stageBoss||boss.hp<=0)continue;
      const d=distance(p,boss.stageHome),engage=boss.stageBossRole==='core'?490:420;
      boss.guardActive=g.regionGrace<=0&&(d<=engage||(boss.guardActive&&d<=630));
      if(boss.guardActive)this.awaken(boss);
      else {g._clearRegionalBossAttacks(boss);boss.guardReturnTarget=boss.stageHome;}
    }
  }
  awaken(boss){
    boss.guardActive=true;boss.guardReturnTarget=null;
    if(!boss._stageAnnounced){boss._stageAnnounced=true;this.game.bossCount++;this.game.bossSpawned=true;this.game.bossDefeated=false;this.game._emit('boss');}
  }
  canTarget(boss){return !boss.stageBoss||(boss.stageBoss===this.currentMapId&&distance(foot(this.game),boss.stageHome)<=630);}
  updateEnemy(boss,dt){
    if(!boss.stageBoss)return false;
    const g=this.game;
    const roam=boss.stageBossRole==='core'?360:550;
    if(!boss.guardActive||distance({x:boss.x,y:boss.y+groundOffset(boss)},boss.stageHome)>roam){
      g._clearRegionalBossAttacks(boss);
      if(distance({x:boss.x,y:boss.y+groundOffset(boss)},boss.stageHome)>5)g._moveEnemy(boss,dt,boss.stageHome);
      return true;
    }
    return false;
  }
  onBossKilled(boss){
    const state=this.objectives.get(boss.stageBoss);
    if(!state||state.defeated||boss.hp>0||boss.stageBoss!==this.currentMapId)return null;
    state.defeated=true;
    const reward={id:`stage-reward:${boss.stageBoss}`,stageReward:boss.stageBoss,rewardClaimed:false};
    this.game.regions._rewardQueue.push(reward);this.game.regions._offerReward();
    if(boss.stageBossRole==='core'){
      this.game.grantResources({gold:30,crystals:45},'stageCoreBoss');
      this.openExit();this.game._emit('stageCoreDefeated',{stageId:this.id});
    }else this.game._emit('stageOptionalDefeated',{stageId:this.id});
    return reward;
  }
  claimReward(mapId){const state=this.objectives.get(mapId);if(state)state.rewardClaimed=true;}
  openExit(){
    const g=this.game;if(!this.isBossIsland||!this.coreDefeated)return null;
    const existing=g.regions.portals.find(portal=>portal.kind==='victory');if(existing)return existing;
    const point=g.terrain.island?.plan?.stageExit;if(!point)throw new Error('Missing stage exit layout');
    const portal={id:`stage-exit:${this.id}`,x:point.x,y:point.y,r:32,interactRadius:82,state:'active',kind:'victory',nextRegion:{...g.region,name:'通关出口'},discovered:true,rewardClaimed:true};
    g.regions.portals.push(portal);g.regions._setStructures();g._effect(portal.x,portal.y,'ring',1.1,110,'#f4d688');return portal;
  }
  complete(){
    const g=this.game;
    if(this.completed||!this.isBossIsland||!this.coreDefeated||g.status!=='playing'||g.superSkills.pending||g.regions.rewardPortal||g.regions._rewardQueue.length)return false;
    const exit=g.regions.portals.find(portal=>portal.kind==='victory');
    if(!exit||!g.regions.canEnter(exit))return false;
    this.completed=true;g.status='victory';g._emit('victory',{stageId:this.id,stageName:this.name});return true;
  }
}
