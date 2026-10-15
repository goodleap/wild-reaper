// Shared by speaker visibility and screen-space placement. Readable duration
// still belongs to SceneDialogue and only advances after an actual draw.
export const DIALOGUE_DISPLAY_RULES=Object.freeze({clearSeconds:.45,minHiddenSeconds:.65,tightClearSeconds:1,reentryMargin:4,stableVisibleSeconds:1.25,interruptionDelay:.25,maxInterruptions:3});

export function hideDialogue(state,clock){
  if(state.hiddenSince==null&&state.visibleSince!=null){
    state.interruptions=clock-state.visibleSince<DIALOGUE_DISPLAY_RULES.stableVisibleSeconds?Math.min(DIALOGUE_DISPLAY_RULES.maxInterruptions,(state.interruptions||0)+1):0;
    state.visibleSince=null;
  }
  state.hiddenSince??=clock;
  state.clearSince=null;state.comfortableSince=null;
  return false;
}

export function resumeDialogue(state,clock,{comfortable=true}={}){
  if(state.hiddenSince==null){
    state.visibleSince??=clock;
    if(clock-state.visibleSince>=DIALOGUE_DISPLAY_RULES.stableVisibleSeconds)state.interruptions=0;
    return true;
  }
  state.clearSince??=clock;
  if(comfortable)state.comfortableSince??=clock;else state.comfortableSince=null;
  const rules=DIALOGUE_DISPLAY_RULES,delay=(state.interruptions||0)*rules.interruptionDelay;
  const stable=state.comfortableSince!=null&&clock-state.comfortableSince>=rules.clearSeconds+delay;
  // A stationary, narrow but non-overlapping slot remains usable. It simply
  // needs a longer clear interval than a slot with comfortable free margins.
  if(clock-state.hiddenSince<rules.minHiddenSeconds||!stable&&clock-state.clearSince<rules.tightClearSeconds+delay)return false;
  state.hiddenSince=null;state.clearSince=null;state.comfortableSince=null;state.visibleSince=clock;
  return true;
}
