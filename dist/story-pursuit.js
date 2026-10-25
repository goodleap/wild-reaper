import { enemyDefinition } from './enemy-definitions.js';
import { bossDefinition } from './boss-definitions.js';
import { initBoss, clearBossAttacks } from './bosses.js';
import { groundOffset } from './terrain.js';
import { terrainNavigation } from './terrain-navigation.js';
import { pointOnRoute } from './navigation-route.js';

const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!e.heroId)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// A chapter describes pressure, while this director owns admission, population
// budgets and retirement. Ordinary combat, artwork and navigation stay shared.
export class StoryPursuit {
  constructor(game,story,config=story.definition.pursuit) {
    this.game=game;this.story=story;this.config=config;this.stage=null;
    this.clock=0;this.sequence=0;this.nextAt=0;this.nextLeaderAt=0;
    this.lastPlayer=foot(game.player);this.routeProgress=0;this.stopped=false;
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
  spawnSearch() {return this._reinforce(this.config.stages.search.batch,{search:true});}
  _ensureRoute(){
    if(this.route)return;
    const points=[this.story.anchors.wake,...this.story.paths.search,...this.story.paths.escape];
    this.route=[];let length=0;
    for(const point of points){
      const previous=this.route.at(-1),segment=previous?distance(previous,point):0;
      if(previous&&segment<1)continue;
      length+=segment;this.route.push({...point,along:length});
    }
    const start=this.route[0],next=this.route.find(point=>distance(point,start)>220)||this.route.at(-1),lengthToNext=distance(start,next)||1;
    this.entryDirection={x:(next.x-start.x)/lengthToNext,y:(next.y-start.y)/lengthToNext};
    // Initial searchers approach through an actual rear road, even before the
    // hero moves. Extending the outgoing heading backwards would cut straight
    // through the forest and leave a stationary hero without any searchers.
    this.rearRoute=[];
    if(this.story.paths.entry?.length){
      const entry=[...this.story.paths.entry];
      if(distance(entry[0],start)<distance(entry.at(-1),start))entry.reverse();
      let previous=start,along=0;
      for(let i=entry.length-1;i>=0;i--){const segment=distance(previous,entry[i]);if(segment<1)continue;along-=segment;this.rearRoute.unshift({...entry[i],along});previous=entry[i];}
    }
    this.searchEnd=this._project(this.story.paths.search.at(-1))?.along??0;
  }
  _project(point,{near=null,span=Infinity}={}){
    this._ensureRoute();let best=null;
    const start=this.route[0],back={x:start.x-this.entryDirection.x*900,y:start.y-this.entryDirection.y*900,along:-900};
    const points=[...(this.rearRoute.length?this.rearRoute:[back]),...this.route];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
      const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len2)),along=a.along+(b.along-a.along)*t;
      if(near!==null&&Math.abs(along-near)>span)continue;
      const projected={x:a.x+dx*t,y:a.y+dy*t},gap=distance(projected,point);
      if(!best||gap<best.gap-.5||Math.abs(gap-best.gap)<=.5&&near!==null&&Math.abs(along-near)<Math.abs(best.along-near))best={...projected,along,gap};
    }
    return best;
  }
  _routeAt(along){
    this._ensureRoute();const start=this.route[0];
    if(along<=0&&!this.rearRoute.length)return {x:start.x+this.entryDirection.x*along,y:start.y+this.entryDirection.y*along,dx:this.entryDirection.x,dy:this.entryDirection.y};
    const points=along<0?[...this.rearRoute,start]:this.route;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];if(along>b.along)continue;
      const length=b.along-a.along,t=(along-a.along)/length;
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,dx:(b.x-a.x)/length,dy:(b.y-a.y)/length};
    }
    const a=this.route.at(-2),b=this.route.at(-1),length=distance(a,b);
    return {...b,dx:(b.x-a.x)/length,dy:(b.y-a.y)/length};
  }
  _updateProgress(p){
    // Projection follows the authored corridor, including its bends. Limit
    // each update by actual travel so nearby/self-crossing later roads cannot
    // suddenly become the rear entrance. Reversing never flips the army.
    const travel=distance(p,this.lastPlayer),projection=this._project(p,{near:this.routeProgress,span:travel*1.8+100});
    if(projection)this.routeProgress=projection.along;
    this.lastPlayer={...p};
  }
  _outside(point,radius,type,bossKind){return !this.game._inView({x:point.x,y:point.y-groundOffset({type,bossKind,r:radius}),r:radius},this.config.spawnMargin);}
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
  _approachPoint(p,r){
    const g=this.game,nav=terrainNavigation(g.terrain),clear=r+3;
    if(g.terrain.isFree(p.x,p.y,clear,'ground'))return {...p};
    // A player can stand against a tree where a larger pursuer cannot place
    // its centre. Admit that pursuer to a nearby legal, visible approach, not
    // to the impossible exact foot coordinate or through the intervening wall.
    const route=this._routeAt(this.routeProgress),candidates=[route];
    for(const radius of [32,64,96,128])for(let i=0;i<8;i++)candidates.push({x:p.x+Math.cos(i*Math.PI/4)*radius,y:p.y+Math.sin(i*Math.PI/4)*radius});
    for(const point of candidates)if(distance(point,p)<=160&&g.terrain.isFree(point.x,point.y,clear,'ground')&&nav.clearSegment(point,p,0,'ground'))return {x:point.x,y:point.y};
    return null;
  }
  get admissionMode(){return this.story.angel?'surround':['burst','fading'].includes(this.stage)?'flanks':'rear';}
  _forward(p){
    if(this._forwardState?.clock===this.clock&&distance(this._forwardState.player,p)<1)return this._forwardState;
    const guide=this.story.getGuide?.(),directions=[];
    if(guide?.complete&&guide.routePath?.length>1){
      // Several substantial lookaheads cover the guide's next bend as well
      // as its current heading. Each protects a whole forward quadrant, not
      // just the thin path or the top edge of the screen.
      for(const ahead of [160,360,640]){
        const point=pointOnRoute(guide.routePath,guide.lengths,guide.progress+ahead),length=point?distance(point,p):0;
        if(length>60)directions.push({x:(point.x-p.x)/length,y:(point.y-p.y)/length});
      }
    }
    if(!directions.length){const route=this._routeAt(this.routeProgress+160);directions.push({x:route.dx,y:route.dy});}
    return this._forwardState={clock:this.clock,player:{...p},directions,angle:Math.atan2(directions[0].y,directions[0].x)};
  }
  _outsideForward(point,p,r=0){
    const dx=point.x-p.x,dy=point.y-p.y,length=Math.hypot(dx,dy);
    if(length<=r)return false;
    // Reserve the complete 90-degree front sector, widened by body radius.
    return this._forward(p).directions.every(direction=>dx*direction.x+dy*direction.y+r<length*Math.SQRT1_2);
  }
  _entryState(profile,p,r){
    this._entries??=new Map();const g=this.game,mode=this.admissionMode,key=`${profile.type}:${r}:${mode}`,cached=this._entries.get(key),forward=mode==='rear'?null:this._forward(p);
    if(cached&&cached.terrain===g.terrain&&cached.revision===(g.terrain.structureRevision||0)&&cached.blocker===g.terrain.firstBlocker&&cached.width===g.viewWidth&&cached.height===g.viewHeight&&distance(cached.player,p)<48&&Math.abs(cached.progress-this.routeProgress)<64&&(!forward||Math.cos(cached.angle-forward.angle)>.985))return cached;
    const maximum=this.activeRadius()*1.8,points=[];
    if(mode==='rear'){
      for(let along=this.routeProgress-160;along>=Math.max(this.rearRoute[0]?.along??-900,this.routeProgress-maximum);along-=48){
        const center=this._routeAt(along);
        for(const lateral of [0,32,-32,64,-64,96,-96])points.push({x:center.x-center.dy*lateral,y:center.y+center.dx*lateral,along,checked:false,reachable:false});
      }
    }else{
      const sectors=mode==='surround'?[Math.PI,Math.PI/2,-Math.PI/2,0]:[Math.PI,Math.PI/2,-Math.PI/2];
      for(let radius=192;radius<=maximum;radius+=48)for(const spread of [0,-.18,.18,-.36,.36,-.54,.54])for(let sector=0;sector<sectors.length;sector++){
        const angle=forward.angle+sectors[sector]+spread,point={x:p.x+Math.cos(angle)*radius,y:p.y+Math.sin(angle)*radius};
        if(mode==='flanks'&&!this._outsideForward(point,p,r+5))continue;
        points.push({...point,sector,checked:false,reachable:false});
      }
    }
    const state={terrain:g.terrain,revision:g.terrain.structureRevision||0,blocker:g.terrain.firstBlocker,width:g.viewWidth,height:g.viewHeight,player:{...p},progress:this.routeProgress,mode,angle:forward?.angle,target:this._approachPoint(p,r),points,cursor:0};
    this._entries.set(key,state);return state;
  }
  _point(profile) {
    const g=this.game,p=foot(g.player),r=profile.type==='boss'?(bossDefinition(profile.bossKind).r??enemyDefinition('boss').r):enemyDefinition(profile.type).r;
    this._updateProgress(p);
    if(this._admissionBudget?.clock!==this.clock)this._admissionBudget={clock:this.clock,paths:6,candidates:96};
    const budget=this._admissionBudget,state=this._entryState(profile,p,r),maximum=this.activeRadius()*1.8;
    if(!state.target)return null;
    // Early pursuit follows only the traversed road. Medicine opens the rear
    // and two flanks; the visible angel opens all four sides. Every formation
    // still shares the same offscreen, dry-ground and reachable admission.
    // Cache rejection as well as success, and continue the scan next admission
    // tick. A sealed approach never repeats thousands of full route searches
    // for every member of the same squad in a single frame.
    const living=this.living();
    const available=point=>this._outside(point,r,profile.type,profile.bossKind)&&distance(point,p)<=maximum&&(state.mode!=='rear'||point.along<=this.routeProgress-120)&&(state.mode!=='flanks'||this._outsideForward(point,p,r+5))&&g.environment?.isHazardFree?.(point.x,point.y,r+5)!==false&&!living.some(e=>distance(foot(e),point)<e.r+r+12);
    const admitted=point=>{this._nextSector=(point.sector??-1)+1;return {x:point.x,y:point.y,along:point.along??this._project(point)?.along,sector:point.sector,mode:state.mode};};
    // Rotate successful arrivals among the available sides, including cached
    // entrances, so one convenient rear entrance cannot starve both flanks.
    const sectors=state.mode==='rear'?1:state.mode==='flanks'?3:4,preferred=(this._nextSector||0)%sectors;
    // Reuse the closest proven entrance as soon as its previous troop walks
    // clear. Continuing farther down the scan would strand later waves well
    // behind the scene even though the actual entrance is already available.
    for(let sectorIndex=0;sectorIndex<sectors;sectorIndex++){
      const sector=(preferred+sectorIndex)%sectors,points=state.mode==='rear'?state.points:state.points.filter(point=>point.sector===sector);
      for(const point of points)if(point.reachable&&available(point))return admitted(point);
      for(let visited=0;visited<points.length;visited++){
        const point=points[state.mode==='rear'?state.cursor:visited];
        if(state.mode==='rear')state.cursor=(state.cursor+1)%points.length;
        if(point.checked&&!point.reachable)continue;
        if(!available(point))continue;
        if(!point.checked){
          if(!budget.paths||!budget.candidates)break;
          budget.candidates--;
          if(!g.terrain.isFree(point.x,point.y,r+5,'ground')||g.terrain.island?.isDry(point.x,point.y,r+5)===false){point.checked=true;continue;}
          if(state.mode==='rear'){
            const projected=this._project(point);
            if(!projected||projected.along>this.routeProgress-120||Math.abs(projected.along-point.along)>120){point.checked=true;continue;}
          }
          budget.paths--;point.checked=true;point.reachable=this._reachable(point,state.target,r);
        }
        if(!point.reachable)continue;
        return admitted(point);
      }
    }
    this._nextSector=preferred+1;
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
      movementSurge:false,
      hp:profile.hp,maxHp:profile.hp,xp:profile.xp,_storyInitialHp:profile.hp,_navTimer:0,
      _storyAdmission:this.clock+this.config.admissionSeconds,_storyFarSince:null,_storyEntryProgress:point.along,_storyEntrySector:point.sector,_storyEntryMode:point.mode});
    if(options.search)enemy._storySearchProgress=(point.along??0)+160;
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
      // A blocked slot does not cancel the other members' legal rear entries.
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
    this.clock+=dt;const p=foot(this.game.player);this._updateProgress(p);
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
    // A bounded squad scan must leave leaders an admission opportunity too.
    if(cfg.leader&&this.clock>=this.nextLeaderAt&&this.living().length<this.config.totalLimit){
      const leaders=this.living().filter(e=>e.storyLeader);
      if(leaders.length<Math.min(this.config.leaderLimit,cfg.leaderCount??1))this._spawn(cfg.leader);
      this.nextLeaderAt=this.clock+cfg.leaderInterval;
    }
    if(this.clock>=this.nextAt){
      const active=this.active().filter(e=>!e.storyLeader).length;
      this._reinforce(Math.min(cfg.batch,Math.max(0,this.targetPopulation-active)));
      this.nextAt=this.clock+cfg.interval;
    }
  }
  beforeEnemy(enemy,dt) {
    if(!this.isPursuer(enemy))return false;
    if(this.clock<enemy._storyAdmission){enemy.guardActive=false;return true;}
    if(enemy.storySearching){
      enemy.guardActive=false;
      // Patrol the road and the abandoned wake point, not the unseen player's
      // exact coordinates. Sight or being attacked changes the whole group to
      // pursuit through the chapter's normal discovery event.
      this._ensureRoute();const end=this.searchEnd;
      const progress=Math.min(end,enemy._storySearchProgress??0),target=this._routeAt(progress);
      if(distance(foot(enemy),target)<22)enemy._storySearchProgress=Math.min(end,progress+160);
      this.game._moveEnemy(enemy,dt,target);return true;
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
