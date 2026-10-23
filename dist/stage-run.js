import { getStageDefinition } from './stage-definitions.js';
import { groundOffset } from './terrain.js';
import { enemyDefinition } from './enemy-definitions.js';
import { NavigationRoute } from './navigation-route.js';
import { portalDoor } from './portal-geometry.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});

// A challenge borrows immutable world terrain. Its enemies, objective, gate
// state and completion belong to this run, never to a world exploration run.
export class StageRun {
  constructor(game,id){
    const definition=getStageDefinition(id);if(!definition)throw new RangeError(`Unknown stage: ${id}`);
    this.game=game;this.definition=definition;this.id=definition.id;this.name=definition.name;
    this.currentMapId=definition.mapId;this.sceneName=definition.sceneName;this.seed=definition.seed;
    this.completed=false;this.bossDefeated=false;this.rewardClaimed=false;this.boss=null;this._route=null;
  }
  get bossEngaged(){return !this.bossDefeated&&!!this.boss&&this.boss.hp>0&&this.boss.guardActive===true;}
  get objectiveLabel(){return this.completed?`${this.name}已通关`:this.bossDefeated?'进入通关门，完成试炼':this.bossEngaged?'击败关卡首领':'沿引导带探索成长 · 挑战关卡首领';}
  prepareTerrain(){
    // World shortcuts cannot require absent world events or quest actors.
    // Open only this Terrain instance; the shared authored geometry stays frozen.
    for(const [id] of this.game.terrain._riftGates||[])this.game.terrain.setRiftGate(id,true);
  }
  initialize(){
    if(!this.bossDefeated&&!this.boss)this.spawnBoss();
    if(this.bossDefeated)this.openExit();
  }
  spawnBoss(){
    const g=this.game,definition=this.definition.boss,home=this.definition.arena;
    const boss=g._spawnEnemy('boss',1);
    boss.bossIndex=definition.index;boss.stageBoss=this.currentMapId;
    boss.hp=boss.maxHp=g.easy?definition.easyHp:definition.hp;
    boss.damage=definition.damage*(g.easy?.72:1);boss.speed=enemyDefinition('boss').baseSpeed*definition.speed*(g.easy?.9:1);boss.xp=definition.xp;
    boss.stageHome={x:home.x,y:home.y};boss.x=home.x;boss.y=home.y-groundOffset(boss);boss.guardActive=false;boss._stageAnnounced=false;
    g._initializeRegionalBoss(boss,definition.kind);g._moveEntity(boss,0,0);this.boss=boss;return boss;
  }
  update(){
    const g=this.game,boss=this.boss;if(!boss||boss.hp<=0||this.bossDefeated)return;
    const d=distance(foot(g),boss.stageHome);
    boss.guardActive=g.regionGrace<=0&&(d<=490||(boss.guardActive&&d<=630));
    if(boss.guardActive)this.awaken(boss);
    else {g._clearRegionalBossAttacks(boss);boss.guardReturnTarget=boss.stageHome;}
  }
  awaken(boss){
    if(boss!==this.boss||this.bossDefeated)return;
    boss.guardActive=true;boss.guardReturnTarget=null;
    if(!boss._stageAnnounced){boss._stageAnnounced=true;this.game.bossCount++;this.game.bossSpawned=true;this.game.bossDefeated=false;this.game._emit('boss');}
  }
  canTarget(boss){return !boss.stageBoss||(boss===this.boss&&!this.bossDefeated&&distance(foot(this.game),boss.stageHome)<=630);}
  updateEnemy(boss,dt){
    if(!boss.stageBoss)return false;
    const g=this.game;
    if(!boss.guardActive||distance({x:boss.x,y:boss.y+groundOffset(boss)},boss.stageHome)>360){
      g._clearRegionalBossAttacks(boss);
      if(distance({x:boss.x,y:boss.y+groundOffset(boss)},boss.stageHome)>5)g._moveEnemy(boss,dt,boss.stageHome);
      return true;
    }
    return false;
  }
  onBossKilled(boss){
    if(this.bossDefeated||boss!==this.boss||boss.hp>0||boss.stageBoss!==this.currentMapId)return null;
    this.bossDefeated=true;
    const g=this.game,reward={id:`stage-reward:${this.currentMapId}`,stageReward:this.currentMapId,rewardClaimed:false};
    g.regions._rewardQueue.push(reward);g.regions._offerReward();
    g.grantResources(this.definition.reward,'stageBoss');
    this.openExit();g._emit('stageBossDefeated',{stageId:this.id});return reward;
  }
  claimReward(mapId){if(mapId===this.currentMapId&&this.bossDefeated)this.rewardClaimed=true;}
  openExit(){
    const g=this.game;if(!this.bossDefeated)return null;
    const existing=g.regions.portals.find(portal=>portal.kind==='victory');if(existing)return existing;
    const point=this.definition.exit;
    const portal={id:`stage-exit:${this.id}`,x:point.x,y:point.y,r:32,interactRadius:82,state:'active',kind:'victory',nextRegion:{...g.region,name:'通关出口'},discovered:true,rewardClaimed:true};
    g.regions.portals.push(portal);g.portal=portal;g.regions._setStructures();g._effect(portal.x,portal.y,'ring',1.1,110,'#f4d688');return portal;
  }
  getGuide(){
    const g=this.game;if(this.completed||g.dungeon?.active||g.mapId!==this.currentMapId)return null;
    const exit=g.regions.portals.find(portal=>portal.kind==='victory');
    const target=this.bossDefeated?(exit?portalDoor(exit):null):this.definition.arena;if(!target)return null;
    this._route??=new NavigationRoute(g.terrain);
    const route=this._route.update(foot(g),target,{radius:g.player.r+3,bodyRadius:g.player.r,profile:'ground',time:g._clock});
    return route?{...route,label:this.bossDefeated?'前往通关出口':'前往关卡首领',shortLabel:this.name,target}:null;
  }
  complete(){
    const g=this.game;
    if(this.completed||!this.bossDefeated||g.status!=='playing'||g.superSkills.pending||g.regions.rewardPortal||g.regions._rewardQueue.length)return false;
    const exit=g.regions.portals.find(portal=>portal.kind==='victory');
    if(!exit||!g.regions.canEnter(exit))return false;
    this.completed=true;g.status='victory';g._emit('victory',{stageId:this.id,stageName:this.name});return true;
  }
}
