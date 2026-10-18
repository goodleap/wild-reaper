// Observe the existing transition lifecycle without changing travel or timing.
export function attachSceneActivity(game,{log,context=()=>({}),beforeStart=()=>{}}){
  let id=null;
  function cancel(reason='场景切换中断'){
    if(!id)return;
    log.end(id,{status:'cancelled',summary:reason});id=null;
  }
  game.onSceneTransition=(phase,transition,error)=>{
    if(phase==='start'){
      cancel();beforeStart();
      id=log.begin('transition','场景切换',{...context(),destination:transition.name});
      log.setCurrent(id);log.stage(id,'过渡开始');
    }else if(id){
      if(phase==='commit-start')log.stage(id,'切换场景内容');
      else if(phase==='commit-end')log.stage(id,'显示目标场景');
      else if(phase==='error'){
        log.captureError(error,{id,phase:'切换场景内容'});
        log.end(id,{status:'error',summary:'场景切换失败'});id=null;
      }else if(phase==='end'){
        const destination=context();
        log.end(id,{status:transition.commitSucceeded?'success':'warning',
          summary:transition.commitSucceeded?`已进入${destination.scene||transition.name}`:'目标未能进入，保留原场景',
          details:{destination,committed:transition.commitSucceeded}});
        log.setContext(destination);id=null;
      }
    }
  };
  return {get id(){return id;},cancel};
}
