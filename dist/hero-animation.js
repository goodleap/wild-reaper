import { swordSlashPose } from './sword-art.js';

const TAU=Math.PI*2;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const DIRECTIONS={right:0,front:Math.PI/2,left:Math.PI,back:-Math.PI/2};
export const DIRECTIONAL_HERO_IDS=Object.freeze(['traveler-v2','princess-v2','elder-v2']);
export const isDirectionalHero=entity=>DIRECTIONAL_HERO_IDS.includes(entity?.appearanceId);

// Presentation events never alter attack timing, targeting, damage or input.
// A chosen weapon owns the upper body; secondary automatic casts wait until
// that action finishes, so a full build cannot spin the actor every frame.
export function recordHeroAction(game,{kind='cast',angle=0,duration=.42,priority=1,windup=0,sword=null}={}){
  const p=game.player;if(!isDirectionalHero(p)||p.hp<=0||game.abilities?.isFrozen(p))return false;
  const now=finite(game._clock),old=p._heroAction;
  if(old&&now<old.startedAt+old.duration){
    const nextPrimaryStrike=priority>=3&&priority===old.priority&&kind===old.kind;
    if(priority<old.priority||priority===old.priority&&!nextPrimaryStrike)return false;
  }
  p._heroAction={kind,angle:finite(angle,p.facing),duration:clamp(finite(duration,.42),.1,2.5),priority,windup:Math.max(0,finite(windup)),startedAt:now,sword};
  return true;
}

function direction(angle,previous){
  if(previous&&Math.abs(delta(angle,DIRECTIONS[previous]))<=Math.PI/4+.14)return previous;
  const x=Math.cos(angle),y=Math.sin(angle);
  return Math.abs(x)>Math.abs(y)?x<0?'left':'right':y<0?'back':'front';
}

function foot(phase,stride,lift,view,back){
  const cycle=((phase/TAU)%1+1)%1;
  // The stance occupies most of the cycle. Only the returning foot lifts.
  const planted=cycle<.58,t=planted?cycle/.58:(cycle-.58)/.42;
  const along=planted?1-t*2:-1+smooth(t)*2;
  return {x:view==='side'?along*stride:0,y:view==='side'?0:along*stride*.47*(back?-1:1),lift:planted?0:Math.sin(t*Math.PI)*lift,planted};
}

function previewAction(preview,time){
  const kind=preview.action;
  if(!['melee','ranged','cast','hurt','fall'].includes(kind))return null;
  const progress=clamp(finite(preview.progress)),duration=kind==='cast'?.75:kind==='fall'?.65:.5;
  return {kind,angle:DIRECTIONS[preview.direction]??0,duration,priority:3,startedAt:time-progress*duration,windup:kind==='melee'?.12:.15};
}

// State is held per rendered entity. Simulation time and actual-distance
// walkPhase are the only clocks: pause/repeated draws return the same pose.
export class HeroAnimator {
  constructor(){this.states=new WeakMap();}
  sample(entity={}, {time=0,reduced=false,frozen=false}={}){
    time=finite(time);const preview=entity.heroAnimationPreview;
    let state=this.states.get(entity);
    if(!state){state={time,view:null,blend:entity.moving?1:0,lastAction:null,pose:null};this.states.set(entity,state);}
    const dead=Number.isFinite(entity.hp)&&entity.hp<=0;
    if((frozen||entity.visualFrozen)&&!dead&&state.pose){state.time=time;return state.pose;}
    const dt=clamp(time-state.time,0,.1),moving=preview?preview.action==='walk':!!entity.moving&&finite(entity.walkSpeed)>.1;
    const phase=preview?finite(entity.walkPhase,finite(preview.progress)*TAU):finite(entity.walkPhase);
    state.blend=preview?(moving?1:0):state.blend+((moving?1:0)-state.blend)*(1-Math.exp(-dt*22));
    if(!moving&&state.blend<.008)state.blend=0;
    const actionEvent=preview?previewAction(preview,time):entity._heroAction;
    const actionAge=actionEvent?Math.max(0,time-actionEvent.startedAt):Infinity;
    const active=!!actionEvent&&actionAge<=actionEvent.duration;
    let angle=finite(entity.moveFacing,finite(entity.facing,Math.PI/2));
    if(preview)state.view=Object.hasOwn(DIRECTIONS,preview.direction)?preview.direction:'front';
    else if(!state.view)state.view=direction(!moving&&active&&actionEvent.priority>=2?actionEvent.angle:angle);
    else if(moving)state.view=direction(angle,state.view);
    else if(active&&actionEvent!==state.lastAction&&actionEvent.priority>=2)state.view=direction(actionEvent.angle,state.view);
    if(active)state.lastAction=actionEvent;
    const view=state.view==='left'||state.view==='right'?'side':state.view,flip=state.view==='left'?-1:1;
    const hero=entity.heroId||entity.appearanceId?.replace('-v2','')||'traveler';
    const elderly=hero==='elder',princess=hero==='princess',amount=(reduced?.65:1)*state.blend;
    const stride=(elderly?4.9:princess?5.8:6.6)*amount,lift=(elderly?2.8:princess?3.9:3.5)*amount;
    const leftFoot=foot(phase,stride,lift,view,view==='back'),rightFoot=foot(phase+Math.PI,stride,lift,view,view==='back');
    const swing=Math.sin(phase),breath=reduced?0:Math.sin(time*2.4)*.24*(1-state.blend);
    let action=moving?'walk':'idle',progress=0,strength=0,aimAngle=DIRECTIONS[state.view];
    if(active){action=actionEvent.kind;progress=clamp(actionAge/actionEvent.duration);strength=Math.sin(Math.PI*progress);aimAngle=actionEvent.angle;}
    if(entity.hurtFace>0&&!preview){action='hurt';progress=1-clamp(entity.hurtFace/.24);strength=Math.sin(Math.PI*progress);}
    if(dead){action='fall';progress=1;strength=1;}
    const blink=!reduced&&(time+finite(entity.id,17)*.173)%4.6<.11;
    const pose={view,flip,phase,moving,stride,leftFoot,rightFoot,
      bodyY:breath-Math.abs(swing)*(.9+(princess?.15:0))*amount,
      lean:(elderly?.035:0)+(view==='side'?.04:0)*amount,
      shoulder:Math.sin(phase)*.035*amount,cloth:Math.sin(phase-.55)*1.9*amount+breath,
      hair:Math.sin(phase-.85)*(princess?1.7:.65)*amount+breath*.7,
      armSwing:swing*(elderly?2.4:3.4)*amount,
      action,actionProgress:progress,actionStrength:strength,aimAngle,
      faceState:action==='hurt'||action==='fall'?'hurt':active?'focus':blink?'blink':'normal',frozen:!!(frozen||entity.visualFrozen)};
    if(action==='hurt'){pose.lean-=strength*.08;pose.bodyY+=strength*.6;}
    if(action==='melee'&&active){
      const visual={...actionEvent.sword,angle:actionEvent.angle,attackAge:actionAge,maxLife:actionEvent.duration,windup:actionEvent.windup};
      const blade=swordSlashPose(visual);
      // Same pivot and simulation age as the existing sword renderer. In the
      // painter's mirrored local space this hand meets the actual sword grip.
      pose.hand={x:Math.cos(blade.angle)*blade.grip/1.1*flip,y:Math.sin(blade.angle)*blade.grip/1.1};
      pose.weaponAngle=blade.angle;
    }
    if(action==='fall'){pose.fall=progress;pose.leftFoot.lift=0;pose.rightFoot.lift=0;}
    state.time=time;state.pose=pose;return pose;
  }
}
