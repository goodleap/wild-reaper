import { groundOffset } from './terrain.js';
import { terrainNavigation } from './terrain-navigation.js';
import { updateFollowMovement } from './follow-movement.js';
import { COMPANION_FOLLOW_RULES } from './companion-catalog.js';
import { getHero } from './heroes.js';
import { NavigationRoute, pointOnRoute, projectOnRoute } from './navigation-route.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=actor=>({x:actor.x,y:actor.y+groundOffset(actor,!!actor.heroId)});
const TRAVEL=new Set(['search','escape','escort','burst','fading']);
const LABELS={search:'郊外旧路',burst:'救援点',escape:'会合处',escort:'突围路口',fading:'救援点',sanctuary:'守护光环',judgment:'守护光环',pill:'公主',conversation:'公主'};

// Display and guide actors consume one persistent, complete walking route.
export class StoryNavigation {
  constructor(game,story){
    this.game=game;this.story=story;this.route=new NavigationRoute(game.terrain);
    this._waiting=null;this._step=null;this._rejoining=false;
  }
  getGuide(){
    const g=this.game,s=this.story,destination=['sanctuary','judgment'].includes(s.step)&&s.angel?s.angel:s.objectivePoint;
    if(!destination||s.disposed||s.completed)return null;
    const from=foot(g.player),target={x:destination.x,y:destination.y},radius=Math.max(g.player.r,s.princess?.r||0);
    if(this.route.terrain!==g.terrain)this.route=new NavigationRoute(g.terrain);
    const route=this.route.update(from,target,{radius:radius+4,bodyRadius:radius,time:s._clock});
    return {...route,target,label:s.objective,shortLabel:LABELS[s.step]||'',
      kind:TRAVEL.has(s.step)&&!s._summoning?'travel':'hold',phase:s.step,areaRadius:['sanctuary','judgment'].includes(s.step)?s.rules.guardRadius:null,
      arrivalRadius:['sanctuary','judgment'].includes(s.step)?s.rules.guardRadius:s.rules.arrivalRadius};
  }
  _ahead(guide,actor){
    if(!guide?.complete||guide.kind!=='travel')return null;
    return pointOnRoute(guide.routePath,guide.lengths,guide.progress+100);
  }
  _waitPoint(actor,leader){
    const s=this.story,g=this.game,anchor=s.angel||s.anchors?.refuge;
    const summoning=['burst','fading'].includes(s.step)&&(s._summoning||s._helpReady);
    if(!anchor||!(['sanctuary','judgment'].includes(s.step)||summoning)||!summoning&&distance(leader,anchor)>s.rules.guardRadius+80)return null;
    const navigation=terrainNavigation(g.terrain),from=foot(actor),inside=distance(from,anchor)<s.rules.guardRadius-actor.r-15;
    if(inside&&navigation.clearSegment(from,anchor,actor.r,'ground'))return from;
    if(this._waiting&&g.terrain.isFree(this._waiting.x,this._waiting.y,actor.r+3))return this._waiting;
    for(const [dx,dy] of [[-65,40],[65,40],[-45,-45],[45,-45],[0,0]]){
      const point={x:anchor.x+dx,y:anchor.y+dy};
      if(g.terrain.isFree(point.x,point.y,actor.r+3)&&navigation.clearSegment(anchor,point,actor.r+3,'ground'))return this._waiting=point;
    }
    return null;
  }
  updatePrincess(dt){
    const g=this.game,s=this.story,actor=s.princess;if(!actor||!Number.isFinite(dt)||dt<=0||s.dialogueBlocking)return;
    if(['awakening','search','escape'].includes(s.step)){actor.moving=false;return;}
    if(this._step!==s.step){this._step=s.step;this._waiting=null;}
    const leader=foot(g.player),from=foot(actor),navigation=terrainNavigation(g.terrain),gap=distance(from,leader);
    if(gap>220)this._rejoining=true;
    else if(gap<150&&navigation.clearSegment(from,leader,actor.r,'ground'))this._rejoining=false;
    const guide=this.getGuide(),summoning=['burst','fading'].includes(s.step)&&(s._summoning||s._helpReady),wait=this._rejoining&&!summoning?null:this._waitPoint(actor,leader);
    const ahead=wait||this._rejoining?null:this._ahead(guide,actor);
    // Conversation must settle inside its existing 145-unit interaction
    // reach, even if both actors stood on opposite sides of the refuge.
    const target=wait||ahead||leader,stop=wait||ahead?COMPANION_FOLLOW_RULES.taskStop:s.step==='conversation'?60:70;
    const direct=navigation.clearSegment(from,target,actor.r,'ground');
    updateFollowMovement(g,actor,{target,mode:wait?'story:wait':ahead?'story:lead':'story:follow',stop,baseSpeed:getHero('princess').baseSpeed,from,direct,
      hold:!!wait&&distance(wait,from)<.05,
      move:(moving,elapsed,goal)=>{
        const origin=foot(moving);let next=null;
        if(ahead&&guide?.complete){
          const position=projectOnRoute(guide.routePath,guide.lengths,origin,{near:guide.progress,span:500}),end=guide.progress+100;
          if(position&&position.gap<80){
            const along=Math.min(end,position.along+24),candidate=pointOnRoute(guide.routePath,guide.lengths,along);
            if(candidate&&navigation.clearSegment(origin,candidate,moving.r+3,'ground'))next=candidate;
          }
        }
        next??=navigation.waypoint(moving,origin,goal,moving.r+3,'ground',s._clock,g._clock);
        if(!next)return;
        const dx=next.x-origin.x,dy=next.y-origin.y,length=Math.hypot(dx,dy);if(length<.001)return;
        const travel=Math.min(length,moving.speed*elapsed);g._moveEntity(moving,dx/length*travel,dy/length*travel);
      }},dt);
    actor.groundY=actor.y+groundOffset(actor,true);if(actor.moving)actor.moveFacing=actor.facing;
  }
}
