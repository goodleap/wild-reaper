import { enemyDefinition } from './enemy-definitions.js';
import { getConfigSection } from './content-config.js';

const TAU=Math.PI*2;
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const specialists=getConfigSection('enemies').specialistRules;
const strides=Object.freeze({rootbinder:92,boglurker:74,prismguard:86,tidepriest:80,shieldguard:90,stoneape:48,windhunter:90,frostmage:80,flamelizard:86,spiderling:35,broodmother:150,deepcaller:168,frostcrown:48,furnace:180,royalguard:78,royallancer:86,royalarbalist:82,royalmage:80,searchcaptain:108,escortmarshal:112});
const kind=e=>e.type==='boss'?e.bossKind:e.type;
export const hasEnemyAnimation=e=>Object.hasOwn(strides,kind(e));
export const usesEnemyLocomotion=e=>hasEnemyAnimation(e)||enemyDefinition(e.type).locomotion===true;

// Locomotion receives only displacement resolved after knockback. Attack poses
// own airborne/pouncing motion, so sliding and jumping never advance footsteps.
export function updateEnemyLocomotion(e,oldX,oldY,dt,frozen=false){
  const rule=specialists[e.type],state=e.specialist,a=e.specialAttack;
  const airborne=a?.kind==='leap'&&a.phase==='rush'||rule?.mode==='pounce'&&state?.phase==='active';
  const planted=state&&['windup','recovery'].includes(state.phase)||a&&a.phase!=='rush'||e.specialRecovery>0;
  const traveled=Math.hypot(e.x-oldX,e.y-oldY);
  e.moving=dt>0&&traveled>.001&&!frozen&&!airborne&&!planted;
  e.walkSpeed=e.moving?traveled/dt:0;
  if(e.moving){
    e.walkPhase=((e.walkPhase||0)+traveled*TAU/(strides[kind(e)]||TAU/(17/220)))%TAU;
    e.visualFacing=Math.atan2(e.y-oldY,e.x-oldX);
  }
}

// This is a presentation adapter, never a second combat state machine.
export function enemyAnimationPose(e,{time=0,reduced=false}={}){
  const a=e.specialAttack,s=e.specialist,rule=specialists[e.type],cast=e._visualCast;
  let mode=e.moving?'move':'idle',action='',progress=0;
  if(a){
    action=a.kind;
    mode=a.phase==='windup'?'windup':a.phase==='rush'?(a.kind==='leap'?'air':'rush'):'active';
    progress=clamp(1-a.life/Math.max(.001,a.maxLife));
    if(a.phase==='strikes'){
      const circles=a.circles||[],last=circles[circles.length-1];
      progress=last?clamp(1-last.delay/Math.max(.001,last.maxDelay)):0;
    }
  }else if(cast&&['cast','fan'].includes(rule?.mode)&&cast.phase!=='recovery'){
    mode=cast.phase;action=cast.abilityId;progress=clamp(cast.progress);
  }else if(s&&s.phase!=='idle'){
    mode=s.phase;action=rule?.abilityId||rule?.mode||e.type;
    progress=clamp(1-s.timer/Math.max(.001,s.maxTime));
  }else if(cast){
    mode=cast.phase;action=cast.abilityId;progress=clamp(cast.progress);
  }else if(e.specialRecovery>0){
    mode='recovery';action=e.specialPose||'';
    progress=clamp(1-e.specialRecovery/Math.max(.001,e.specialRecoveryMax||e.specialRecovery));
  }
  if(e.guardActive===false){mode='idle';action='';progress=0;}
  if(['idle','move'].includes(mode)&&e._weaponPushTime>0&&!e.moving){mode='hit';progress=clamp(1-(e.hit||0)/.12);}
  let cycle=e.walkPhase||0;
  if(e.type==='windhunter')cycle=(time*11+(Number(e.id)||0))%TAU;
  // The deer's silhouette also defines its narrow hit/contact contours. Keep
  // its gameplay-relevant support pose aligned when decorative motion is low.
  if(reduced&&kind(e)!=='frostcrown')cycle=0;
  if(mode==='idle'&&e.type!=='windhunter')cycle=0;
  return {mode,action,progress,cycle,moving:!!e.moving,...(e.type==='stoneape'?{gaitFrames:16}:{})};
}

// Cache keys contain only finite, authored states; never raw time or angles.
export function sampleEnemyPose(pose){
  const travelingAction=pose.moving&&['rush','active'].includes(pose.mode);
  const locomotion=pose.mode==='move'||pose.mode==='idle'||travelingAction,count=locomotion?(pose.gaitFrames===16?16:8):5;
  const frame=locomotion?Math.floor(((pose.cycle%TAU+TAU)%TAU)/TAU*count)%count:Math.round(clamp(pose.progress)*(count-1));
  return {...pose,progress:travelingAction?.5:locomotion?0:frame/(count-1),cycle:locomotion?frame/count*TAU:0,
    key:`${pose.mode}:${pose.action}:${frame}:${pose.moving?1:0}`};
}
