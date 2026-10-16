import { groundOffset } from './terrain.js';
import { terrainNavigation } from './terrain-navigation.js';
import { updateFollowMovement } from './follow-movement.js';
import { COMPANION_FOLLOW_RULES } from './companion-catalog.js';
import { getHero } from './heroes.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=actor=>({x:actor.x,y:actor.y+groundOffset(actor,!!actor.heroId)});
const TRAVEL=new Set(['search','escape','escort','burst','fading']);
const LABELS={search:'林间谷地',burst:'救援点',escape:'会合处',escort:'突围路口',fading:'救援点',sanctuary:'守护光环',judgment:'守护光环',pill:'公主',conversation:'公主'};

// One terrain-validated local route drives both the chapter's guide and its
// presentation. A distant destination may need several of these ordinary
// walking legs; the final destination is never substituted for a missing leg.
export class StoryNavigation {
  constructor(game,story){
    this.game=game;this.story=story;this._guideActor={id:'story:guide',r:game.player.r};
    this._side=-1;this._waiting=null;this._step=null;this._rejoining=false;
  }
  getGuide(){
    const g=this.game,s=this.story,destination=['sanctuary','judgment'].includes(s.step)&&s.angel?s.angel:s.objectivePoint;
    if(!destination||s.disposed||s.completed)return null;
    const from=foot(g.player),target={x:destination.x,y:destination.y},navigation=terrainNavigation(g.terrain);
    const radius=Math.max(g.player.r,s.princess?.r||0);this._guideActor.r=radius;
    const waypoint=navigation.waypoint(this._guideActor,from,target,radius+3,'ground',s._clock,g._clock);
    const path=[from];
    if(waypoint&&distance(from,waypoint)>.05){
      const cached=this._guideActor._terrainRoute?.path;
      const points=cached?.length&&distance(cached[0],waypoint)<.05?cached:[waypoint];
      for(const point of points){
        if(!navigation.clearSegment(path.at(-1),point,radius,'ground'))break;
        if(distance(path.at(-1),point)>.05)path.push({x:point.x,y:point.y});
      }
    }
    const waitingForAngel=s.step==='conversation'&&s._awaitingAngel();
    return {target,waypoint:path[1]||null,path,label:s.objective,shortLabel:waitingForAngel?'天使':LABELS[s.step]||'',
      kind:TRAVEL.has(s.step)&&(!['burst','fading'].includes(s.step)||s._helpReady!==false)?'travel':'hold',phase:s.step,areaRadius:['sanctuary','judgment'].includes(s.step)?s.rules.guardRadius:null,
      arrivalRadius:['sanctuary','judgment'].includes(s.step)?s.rules.guardRadius:s.rules.arrivalRadius};
  }
  _ahead(guide,actor){
    if(!guide?.waypoint||guide.kind!=='travel')return null;
    const navigation=terrainNavigation(this.game.terrain),path=guide.path;let remaining=90;
    for(let index=1;index<path.length;index++){
      const a=path[index-1],b=path[index],length=distance(a,b);if(length<.001)continue;
      if(length<remaining&&index<path.length-1){remaining-=length;continue;}
      const along=Math.min(remaining,length),dx=(b.x-a.x)/length,dy=(b.y-a.y)/length,center={x:a.x+dx*along,y:a.y+dy*along};
      // Keep the same side across turns. Narrow passages reduce the offset,
      // instead of flipping left/right or projecting a slot through a wall.
      for(const offset of [28,14,0]){
        const point={x:center.x-dy*offset*this._side,y:center.y+dx*offset*this._side};
        if(this.game.terrain.isFree(point.x,point.y,actor.r+3,'ground')&&navigation.clearSegment(center,point,actor.r+3,'ground'))return point;
      }
      return null;
    }
    return null;
  }
  _waitPoint(actor,leader){
    const s=this.story,g=this.game,anchor=s.angel||s.anchors?.refuge;
    if(!anchor||!['sanctuary','judgment'].includes(s.step)||distance(leader,anchor)>s.rules.guardRadius+80)return null;
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
    const praying=['burst','fading'].includes(s.step)&&s._helpReady===false&&gap<=(s.rules.prayerRadius||260)-20;
    const wait=praying?from:this._rejoining?null:this._waitPoint(actor,leader);
    const ahead=wait||this._rejoining?null:this._ahead(this.getGuide(),actor);
    // Conversation must settle inside its existing 145-unit interaction
    // reach, even if both actors stood on opposite sides of the refuge.
    const target=wait||ahead||leader,stop=wait||ahead?COMPANION_FOLLOW_RULES.taskStop:s.step==='conversation'?60:70;
    const direct=navigation.clearSegment(from,target,actor.r,'ground');
    updateFollowMovement(g,actor,{target,mode:wait?'story:wait':ahead?'story:lead':'story:follow',stop,baseSpeed:getHero('princess').baseSpeed,from,direct,
      hold:!!wait&&distance(wait,from)<.05,
      move:(moving,elapsed,goal)=>{
        const origin=foot(moving),next=navigation.waypoint(moving,origin,goal,moving.r+3,'ground',s._clock,g._clock);
        if(!next)return;
        const dx=next.x-origin.x,dy=next.y-origin.y,length=Math.hypot(dx,dy);if(length<.001)return;
        const travel=Math.min(length,moving.speed*elapsed);g._moveEntity(moving,dx/length*travel,dy/length*travel);
      }},dt);
    actor.groundY=actor.y+groundOffset(actor,true);if(actor.moving)actor.moveFacing=actor.facing;
  }
}
