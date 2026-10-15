import { enemyDefinition } from './enemy-definitions.js';
import { initBoss, clearBossAttacks } from './bosses.js';
import { groundOffset } from './terrain.js';
import { terrainNavigation } from './terrain-navigation.js';

const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!e.heroId)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// A chapter describes pressure, while this director owns admission, population
// budgets and retirement. Ordinary combat, artwork and navigation stay shared.
export class StoryPursuit {
  constructor(game,story,config=story.definition.pursuit) {
    this.game=game;this.story=story;this.config=config;this.stage=null;
    this.clock=0;this.sequence=0;this.nextAt=0;this.nextLeaderAt=0;
    this.lastPlayer=foot(game.player);this.heading={x:1,y:0};this.stopped=false;
  }
  isPursuer(enemy){return enemy.storyPursuer&&enemy.storyId===this.story.id;}
  living(){return this.game.enemies.filter(e=>e.hp>0&&this.isPursuer(e));}
  get settings(){return this.config.stages[this.stage]||null;}
  get targetPopulation(){
    const cfg=this.settings;if(!cfg)return 0;
    const ramp=cfg.ramp;if(!ramp)return cfg.target;
    const start=ramp.startedAt?this.story[ramp.startedAt]:this.stageStartedAt;
    const now=ramp.startedAt?this.story._clock:this.clock;
    const progress=Number.isFinite(start)?Math.max(0,Math.min(1,(now-start)/ramp.duration)):0;
    return Math.max(cfg.target,Math.floor(ramp.from+(ramp.to-ramp.from)*progress));
  }
  _windowClosed(){
    const window=this.settings?.endWindow;if(!window)return false;
    const startedAt=this.story[window.startedAt],duration=this.story.rules[window.durationRule];
    return Number.isFinite(startedAt)&&this.story._clock>=startedAt+duration-window.stopBeforeEndSeconds;
  }
  activeRadius(){return Math.max(this.config.activeRadius,Math.hypot(this.game.viewWidth,this.game.viewHeight)*.65);}
  active(){const p=foot(this.game.player),r=this.activeRadius();return this.living().filter(e=>distance(foot(e),p)<=r);}
  enter(stage) {
    if(this.stage===stage)return false;
    this.stage=stage;this.stageStartedAt=this.clock;this.nextAt=this.clock;this.nextLeaderAt=this.clock;this.stopped=false;
    if(stage!=='search')for(const enemy of this.living()){enemy.storySearching=false;enemy.guardActive=true;enemy._navTimer=0;}
    if(stage==='search')this.spawnSearch();
    if(!this.targetPopulation)this.stopped=true;
    return true;
  }
  spawnSearch(around=null) {
    const cfg=this.config.stages.search,route=this.story.paths.search;
    const index=Math.min(route.length-1,Math.max(2,Math.floor(route.length*.38)));
    const spawned=this._reinforce(cfg.batch,{search:true,around:around||route[index]});
    for(const enemy of spawned){
      enemy._storySearchRoute=around?[foot(this.game.player)]:[...route.slice(0,index+1).reverse(),this.story.anchors.wake];
      enemy._storyWaypoint=0;
    }
    return spawned;
  }
  _updateHeading(p){
    const dx=p.x-this.lastPlayer.x,dy=p.y-this.lastPlayer.y,d=Math.hypot(dx,dy);
    const target=this.story.objectivePoint;
    if(d>1)this.heading={x:dx/d,y:dy/d};
    else if(target&&distance(target,p)>80){const n=distance(target,p);this.heading={x:(target.x-p.x)/n,y:(target.y-p.y)/n};}
    this.lastPlayer=p;
  }
  _outside(point,radius,type){return !this.game._inView({x:point.x,y:point.y-groundOffset({type,r:radius}),r:radius},this.config.spawnMargin);}
  _reachable(point,target,radius){
    const nav=terrainNavigation(this.game.terrain),r=radius+3;
    if(nav.clearSegment(point,target,r,'ground'))return true;
    if(nav.rift){
      const route=nav.rift.route(point,target,r,'ground');if(!route?.length)return false;
      let from=point;
      for(const to of route){if(!nav.clearSegment(from,to,r,'ground'))return false;from=to;}
      return true;
    }
    const path=nav.findLocal(point,target,r,'ground',600,radius);
    return !!path?.length&&distance(path.at(-1),target)<r+4;
  }
  _point(profile,{search=false,around=null}={}) {
    const g=this.game,p=foot(g.player),r=enemyDefinition(profile.type).r,candidates=[];
    const angle=Math.atan2(this.heading.y,this.heading.x),side=this.sequence%2?1:-1;
    // Most arrivals trail the escape direction; every fourth squad member can
    // use a flank. Never teleport a pursuer into the visible combat space.
    const flank=this.sequence%4===3;
    const offsets=flank?[side*1.35,side*1.8,Math.PI]:[Math.PI,Math.PI+side*.4,Math.PI-side*.4,side*1.65];
    if(search&&around)for(const spread of [0,64,128,192])for(let i=0;i<8;i++)candidates.push({x:around.x+Math.cos(i*Math.PI/4)*spread,y:around.y+Math.sin(i*Math.PI/4)*spread});
    for(const extra of [0,100,220])for(const offset of offsets){
      const a=angle+offset,ux=Math.cos(a),uy=Math.sin(a),halfW=g.viewWidth*.5+this.config.spawnMargin+r+16,halfH=g.viewHeight*.5+this.config.spawnMargin+r+30;
      const edge=1/Math.max(Math.abs(ux)/halfW,Math.abs(uy)/halfH),d=edge+extra;
      candidates.push({x:p.x+ux*d,y:p.y+uy*d});
    }
    // Road nodes are reliable alternatives where a winding passage has no
    // room along a screen edge. Local clearance alone is never reachability.
    const roads=Object.values(this.story.paths).flat().filter(point=>distance(point,p)<=this.activeRadius()*1.8);
    roads.sort((a,b)=>{
      const score=point=>distance(point,p)+Math.max(0,(point.x-p.x)*this.heading.x+(point.y-p.y)*this.heading.y)*2;
      return score(a)-score(b);
    });
    candidates.push(...roads);
    for(const point of candidates){
      if(!this._outside(point,r,profile.type)||distance(point,p)>this.activeRadius()*1.8||!g.terrain.isFree(point.x,point.y,r+5,'ground')||g.terrain.island?.isDry(point.x,point.y,r+5)===false)continue;
      if(g.environment?.isHazardFree?.(point.x,point.y,r+5)===false)continue;
      if(this.living().some(e=>distance(foot(e),point)<e.r+r+12))continue;
      if(this._reachable(point,p,r))return point;
    }
    return null;
  }
  _spawn(profileId,options={}) {
    const profile=this.config.profiles[profileId],g=this.game,point=this._point(profile,options);
    if(!point)return null;
    const enemy=g._spawnEnemy(profile.type,1);if(!enemy)return null;
    if(profile.type==='boss')initBoss(enemy,profile.bossKind);
    Object.assign(enemy,{x:point.x,y:point.y-groundOffset(enemy),storyId:this.story.id,storyEnemy:true,storyPursuer:true,
      storyProfile:profileId,storyLeader:!!profile.leader,storyWave:this.stage,guardianId:`story:${this.story.id}`,
      storySearching:!!options.search,guardActive:!options.search,speed:profile.speed,damage:profile.damage,
      hp:profile.hp,maxHp:profile.hp,xp:profile.xp,_storyInitialHp:profile.hp,_navTimer:0,
      _storyAdmission:this.clock+this.config.admissionSeconds,_storyFarSince:null});
    if(profile.behavior==='chase')enemy.specialist=null;
    g._effect?.(enemy.x,point.y,'rescueWarning',this.config.admissionSeconds,enemy.r+8,'#c8a58b',undefined,{seed:enemy.id});
    return enemy;
  }
  _reinforce(count,options={}) {
    const cfg=options.search?this.config.stages.search:this.settings,spawned=[];
    if(!cfg)return spawned;
    for(let i=0;i<count&&this.living().length<this.config.totalLimit;i++){
      const id=cfg.roster[this.sequence++%cfg.roster.length],enemy=this._spawn(id,options);
      if(enemy)spawned.push(enemy);
      // A blocked side does not cancel the other members' legal approaches.
    }
    return spawned;
  }
  _retire(enemies){
    if(!enemies.length)return;
    const retired=new Set(enemies);
    for(const e of retired){e.hp=0;e.cast=null;e.charge=null;e.slam=null;clearBossAttacks(e);}
    this.game.enemies=this.game.enemies.filter(e=>!retired.has(e));
    this.game._rebuildGrid?.();
  }
  update(dt) {
    if(!Number.isFinite(dt)||dt<=0||!this.story.active||this.game.status!=='playing')return;
    this.clock+=dt;const p=foot(this.game.player);this._updateHeading(p);
    const far=Math.max(this.config.retireRadius,this.activeRadius()*1.45),retired=[];
    for(const e of this.living()){
      if(distance(foot(e),p)>far&&!this.game._inView(e,this.config.spawnMargin)){
        e._storyFarSince??=this.clock;
        if(this.clock-e._storyFarSince>=this.config.retireSeconds)retired.push(e);
      }else e._storyFarSince=null;
    }
    this._retire(retired);
    const cfg=this.settings;
    if(this._windowClosed())this.stopped=true;
    if(this.stopped||!this.targetPopulation)return;
    if(this.stage==='search'){
      // A temporarily sealed approach must not leave discovery without a cast.
      if(!this.living().length&&this.clock>=this.nextAt){this.spawnSearch();this.nextAt=this.clock+cfg.interval;}
      return;
    }
    if(this.clock>=this.nextAt){
      const active=this.active().filter(e=>!e.storyLeader).length;
      this._reinforce(Math.min(cfg.batch,Math.max(0,this.targetPopulation-active)));
      this.nextAt=this.clock+cfg.interval;
    }
    if(cfg.leader&&this.clock>=this.nextLeaderAt&&this.living().length<this.config.totalLimit){
      const leaders=this.living().filter(e=>e.storyLeader);
      if(leaders.length<Math.min(this.config.leaderLimit,cfg.leaderCount??1))this._spawn(cfg.leader);
      this.nextLeaderAt=this.clock+cfg.leaderInterval;
    }
  }
  beforeEnemy(enemy,dt) {
    if(!this.isPursuer(enemy))return false;
    if(this.clock<enemy._storyAdmission){enemy.guardActive=false;return true;}
    if(enemy.storySearching){
      enemy.guardActive=false;
      const route=enemy._storySearchRoute||[this.story.anchors.wake],index=Math.min(route.length-1,enemy._storyWaypoint||0);
      if(distance(foot(enemy),route[index])<35&&index<route.length-1)enemy._storyWaypoint=index+1;
      this.game._moveEnemy(enemy,dt,route[Math.min(route.length-1,enemy._storyWaypoint||0)]);return true;
    }
    enemy.guardActive=true;
    if(this.config.profiles[enemy.storyProfile]?.behavior==='chase'){
      enemy.specialist=null;this.game._moveEnemy(enemy,dt);return true;
    }
    return false;
  }
  finish({clear=false}={}){this.stopped=true;if(clear)this._retire(this.living());}
  clear(){this.finish({clear:true});}
}
