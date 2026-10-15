import { getExpeditionDefinition } from './expedition-definitions.js';
import { Terrain, groundOffset } from './terrain.js';
import { enemyDefinition } from './enemy-definitions.js';
import { REGIONS, regionFor } from './world-definitions.js';
import { Environment } from './environment.js';
import { Adventure } from './adventure.js';
import { Settlements } from './settlements.js';
import { RelicSites } from './relic-sites.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Bounds participate in the same foot-based movement as ordinary terrain.
// Explicit props and gates keep the authored route free of random obstacles.
export class ExpeditionTerrain extends Terrain {
  constructor(definition){super({region:definition.themeId,obstacles:definition.obstacles.map(prop=>({...prop,type:'rock',rockForm:0,visual:{halfWidth:prop.variant==='expedition-mast'?65:prop.r+8,top:prop.variant==='expedition-mast'?115:prop.r*2+12,bottom:prop.r+8}}))});this.bounds=definition.bounds;}
  _inside(x,y,r=0){const b=this.bounds;return x-r>=b.minX&&x+r<=b.maxX&&y-r>=b.minY&&y+r<=b.maxY;}
  _bound(x,y,r=0){const b=this.bounds,nx=clamp(x,b.minX+r,b.maxX-r),ny=clamp(y,b.minY+r,b.maxY-r);return {x:nx,y:ny,blocked:nx!==x||ny!==y};}
  isFree(x,y,r=0,profile='ground'){return this._inside(x,y,r)&&super.isFree(x,y,r,profile);}
  isDry(x,y,r=0){return this._inside(x,y,r);}
  resolveCircle(x,y,r,profile='ground'){const bounded=this._bound(x,y,r),result=super.resolveCircle(bounded.x,bounded.y,r,profile),end=this._bound(result.x,result.y,r);return {...end,blocked:bounded.blocked||result.blocked||end.blocked};}
  moveCircle(x,y,dx,dy,r,profile='ground'){const result=super.moveCircle(x,y,dx,dy,r,profile),end=this._bound(result.x,result.y,r);return {...end,blocked:result.blocked||end.blocked};}
}

export class ExpeditionRun {
  constructor(game,id){
    const definition=getExpeditionDefinition(id);if(!definition)throw new RangeError(`Unknown expedition: ${id}`);
    this.game=game;this.definition=definition;this.id=id;this.name=definition.name;
    this.elapsed=0;this.currentSegment=0;this.completed=false;this.exitOpen=false;this.rewardClaimed=false;this.initialized=false;
    this.groups=definition.segments.map((segment,index)=>({definition:segment,index,members:[],active:false,cleared:false}));
  }
  get allowAmbient(){return this.id==='survival'&&!this.exitOpen&&!this.completed;}
  get objectiveLabel(){
    if(this.completed)return `${this.name} · 已通关`;
    if(this.exitOpen)return this.id==='moon'?'前往北方信标 · 进入光圈完成副本':this.id==='ship'?'前往船首 · 进入光圈完成副本':'撤离点已开放 · 前往东侧光圈';
    if(this.id==='survival')return `守住营地 · 剩余 ${Math.max(0,Math.ceil(this.definition.duration-this.elapsed))} 秒`;
    const group=this.groups[this.currentSegment],remaining=group.members.filter(enemy=>enemy.hp>0).length;
    return `${this.currentSegment+1}/${this.groups.length} · ${group.definition.name} · 剩余 ${remaining} 敌人`;
  }
  get markers(){
    const active=this.groups[this.currentSegment];
    return [...(active&&!active.cleared?[{id:`expedition:group:${active.index}`,...active.definition.center,name:active.definition.name,label:active.active?'清理当前敌群':'接近后交战',color:this.definition.color,type:'expedition',state:active.active?'active':'ready',active:active.active,discovered:true}]:[]),{id:'expedition:exit',...this.definition.exit,name:this.id==='moon'?'月面信标':'撤离点',label:this.completed?'副本已完成':this.exitOpen?'前往出口':'完成目标后开放',color:this.exitOpen?'#c9e2a1':'#8d9292',type:'expedition',state:this.completed?'completed':this.exitOpen?'active':'locked',active:this.exitOpen&&!this.completed,completed:this.completed,discovered:true}];
  }
  initialize(){
    if(this.initialized)return;this.initialized=true;
    const g=this.game,d=this.definition;
    g.regionIndex=REGIONS.findIndex(region=>region.id===d.themeId);g.region=regionFor(g.regionIndex);g.mapId=`expedition:${this.id}`;
    g.terrain=new ExpeditionTerrain(d);g._islandWorlds=false;g.enemies=[];g.gems=[];g.coins=[];g.bullets=[];g.enemyBullets=[];g.effects=[];
    g.player.x=d.start.x;g.player.y=d.start.y-groundOffset(g.player,true);g._moveEntity(g.player,0,0,true);
    g.portal=null;g.regions.portals=[];g.regions.guarded=true;g.regions.states.clear();g.regions._rewardQueue=[];g.regions.rewardPortal=null;g._regionRewardPending=false;
    g.encounters=null;g.environment=new Environment(g,{generation:false});g.adventure=new Adventure(g,{generation:false});
    g.settlements=new Settlements(g,{generation:false});g.relicSites=new RelicSites(g,{generation:false});
    g.companions.generation=false;g.companions.camps=[];g.elites.generation=false;g.nextBossAt=Infinity;g.regionGrace=0;
    g.waveDirector.reset();g._spawn=.5;
    for(const group of this.groups)this._spawnGroup(group);
    this._setGates();g._rebuildGrid();
  }
  _spawnGroup(group){
    const g=this.game,d=group.definition,types=Object.entries(d.enemies).flatMap(([type,count])=>Array(count).fill(type));
    for(const [index,type]of types.entries()){
      const enemy=g._spawnEnemy(type,1),base=enemyDefinition(type),angle=index*2.399963229728653,radius=65+Math.floor(index/6)*42;
      enemy.hp=enemy.maxHp=base.baseHp*d.healthMultiplier;enemy.damage=base.damage;enemy.speed=base.baseSpeed;enemy.xp=base.xp;
      enemy.x=d.center.x+Math.cos(angle)*radius;enemy.y=d.center.y+Math.sin(angle)*radius-groundOffset(enemy);
      enemy.expeditionId=this.id;enemy.expeditionSegment=group.index;enemy.guardActive=false;
      enemy.expeditionHome={x:enemy.x,y:enemy.y+groundOffset(enemy)};g._moveEntity(enemy,0,0);
      group.members.push(enemy);
    }
  }
  _setGates(){
    const b=this.definition.bounds,axis=this.definition.axis;
    this.game.terrain.setStructures(this.groups.filter(group=>!group.cleared).map(group=>({id:`expedition-gate:${group.index}`,type:'log',variant:'expedition-gate',visual:false,r:14,angle:axis==='x'?Math.PI/2:0,halfLength:axis==='x'?(b.maxY-b.minY)/2:(b.maxX-b.minX)/2,x:axis==='x'?group.definition.gate:(b.minX+b.maxX)/2,y:axis==='y'?group.definition.gate:(b.minY+b.maxY)/2})),'expedition-gates');
  }
  canTarget(enemy){return !enemy.expeditionId||(enemy.expeditionId===this.id&&enemy.expeditionSegment===this.currentSegment&&!this.completed);}
  awaken(enemy){
    if(!this.canTarget(enemy))return false;
    const group=this.groups[enemy.expeditionSegment];if(group&&!group.cleared){group.active=true;for(const member of group.members)member.guardActive=true;}return true;
  }
  update(dt=0){
    const g=this.game;if(!this.initialized||this.completed||g.status!=='playing'||g.player.hp<=0||g.sceneTransition?.active||g.dungeon?.active)return;
    this.elapsed+=Number.isFinite(dt)?clamp(dt,0,.1):0;
    if(this.id==='survival'){
      if(this.elapsed>=this.definition.duration)this._openExit();
    }else{
      const group=this.groups[this.currentSegment];
      if(group&&!group.cleared){
        if(distance(foot(g),group.definition.center)<=group.definition.triggerRadius||group.members.some(enemy=>enemy.hp<enemy.maxHp))group.active=true;
        for(const enemy of group.members)if(enemy.hp>0){enemy.guardActive=group.active;enemy.guardReturnTarget=null;}
        if(group.members.length&&group.members.every(enemy=>enemy.hp<=0)){
          group.cleared=true;this.currentSegment++;this._setGates();
          g._effect(group.definition.center.x,group.definition.center.y,'ring',.8,95,this.definition.color);
          g._emit('expeditionSegmentCleared',{expeditionId:this.id,segment:group.index});
          if(this.currentSegment>=this.groups.length)this._openExit();
        }
      }
    }
    if(this.exitOpen&&distance(foot(g),this.definition.exit)<=this.definition.exit.r)this.complete();
  }
  _openExit(){
    if(this.exitOpen)return;this.exitOpen=true;
    const g=this.game,exit=this.definition.exit;g._effect(exit.x,exit.y,'ring',1.1,90,this.definition.color);g._emit('expeditionExitOpened',{expeditionId:this.id});
  }
  complete(){
    const g=this.game;
    if(this.completed||!this.exitOpen||g.status!=='playing'||g.player.hp<=0||g.sceneTransition?.active||g.dungeon?.active||g.superSkills.pending||g.regions.rewardPortal||g.regions._rewardQueue.length||distance(foot(g),this.definition.exit)>this.definition.exit.r)return false;
    this.completed=true;
    if(!this.rewardClaimed){this.rewardClaimed=true;g.grantResources(this.definition.reward,'expeditionComplete');}
    g.status='victory';g._emit('victory',{expeditionId:this.id,stageName:this.name});return true;
  }
}
