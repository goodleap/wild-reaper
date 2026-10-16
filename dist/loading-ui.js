// Startup and scene loading share a small DOM-only view. Counts represent
// completed tasks, not elapsed time or simulated download percentages.
export function createLoadingView(document,{debug=false,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const nodes={boot:document.getElementById('boot-loading'),scene:document.getElementById('scene-loading')};
  let mode=null,visible=false,showTimer=null,hideTimer=null,revision=0;
  const element=suffix=>document.getElementById(`${mode}-loading${suffix}`);
  function cancelTimers(){if(showTimer!==null)clearTimer(showTimer);if(hideTimer!==null)clearTimer(hideTimer);showTimer=hideTimer=null;}
  function reveal(){if(!mode)return;nodes[mode].classList.remove('hidden','is-complete');visible=true;}
  function hide(){cancelTimers();revision++;for(const node of Object.values(nodes)){node.classList.add('hidden');node.classList.remove('is-complete','has-error');}mode=null;visible=false;}
  function update({completed=0,total=1,stage='正在准备',detail=''}={}){
    if(!mode)return;
    const ratio=Math.max(0,Math.min(1,Number.isFinite(completed)&&Number.isFinite(total)&&total>0?completed/total:0));
    const label=debug===true&&typeof detail==='string'&&detail?`${stage}（${detail}）`:stage;
    const percent=ratio<1?Math.min(99,Math.round(ratio*100)):100;
    element('-label').textContent=label;element('-fill').style.transform=`scaleX(${ratio})`;
    if(mode==='boot'){const number=element('-percent');if(number)number.textContent=`${percent}%`;}
    element('-track').setAttribute('aria-valuenow',percent);
    element('-track').setAttribute('aria-valuetext',label);
  }
  function start(nextMode='boot',{delay=nextMode==='boot'?250:0,stage='正在准备',detail=''}={}){
    hide();mode=nextMode;nodes[mode].setAttribute('aria-busy','true');
    element('-actions').classList.add('hidden');update({completed:0,total:1,stage,detail});
    if(delay>0){const token=revision;showTimer=setTimer(()=>{showTimer=null;if(token===revision)reveal();},delay);}else reveal();
  }
  function finish({fade=true}={}){
    if(!mode)return;cancelTimers();nodes[mode].setAttribute('aria-busy','false');
    update({completed:1,total:1,stage:'准备完成'});
    // A fast startup never reveals the bar just to display completion.
    if(!visible||!fade){hide();return;}
    nodes[mode].classList.add('is-complete');
    const token=revision;hideTimer=setTimer(()=>{if(token===revision)hide();},180);
  }
  function fail(message,{onRetry,onBack,detail=''}={}){
    if(!mode)start('boot',{delay:0});cancelTimers();reveal();nodes[mode].classList.add('has-error');nodes[mode].setAttribute('aria-busy','false');
    const label=debug===true&&typeof detail==='string'&&detail?`${message}（${detail}）`:message;
    element('-label').textContent=label;element('-track').setAttribute('aria-valuetext',label);element('-actions').classList.remove('hidden');
    const retry=element('-retry'),back=element('-back');retry.onclick=onRetry||null;retry.classList.toggle('hidden',!onRetry);back.onclick=onBack||null;back.classList.toggle('hidden',!onBack);
    (onRetry?retry:back).focus({preventScroll:true});
  }
  return {start,update,finish,fail,hide};
}

// Resolve in a task after the next animation callback so the browser gets a
// chance to paint the loading view before synchronous map/cache work starts.
export function waitForPaint({requestFrame=requestAnimationFrame,setTimer=setTimeout}={}){
  return new Promise(resolve=>requestFrame(()=>setTimer(resolve,0)));
}
