const STATES=Object.freeze({
  guest:'游客进度仅保存在当前浏览器。',
  ready:'世界进度已同步',
  syncing:'正在同步世界进度…',
  pending:'进度已保存在此设备，等待同步。',
  conflict:'进度已在其他页面更新。读取云端进度后继续。',
  'auth-required':'登录已过期。重新登录后继续同步。',
  loading:'正在读取账号进度…',
  error:'暂时无法同步，请稍后重试。'
});

// This view never owns credentials or save data. The caller owns modal focus,
// the current game, account switching and the network synchronization service.
export function createAccountPanel(root,callbacks={}){
  const find=id=>root.querySelector(`#account-${id}`);
  const nodes=Object.fromEntries(['title','description','tabs','tab-login','tab-register','profile','username-display','status','form','username','password','guest-option','use-guest','submit','actions','retry','reload','logout','close','error','guest-note','debug-note'].map(id=>[id,find(id)]));
  let state={mode:'guest',user:null,status:'guest',hasGuestSave:false},mode='login',working=false;
  const show=(node,visible)=>{node.hidden=!visible;node.classList.toggle('hidden',!visible);};
  function clearSecrets(){nodes.password.value='';}
  function showError(message=''){
    nodes.error.textContent=String(message||'').slice(0,350);show(nodes.error,!!message);
  }
  function render(next=state){
    state=next;
    const account=!!state.user,expired=account&&state.status==='auth-required';
    const guestConflict=!account&&state.status==='conflict',checking=!account&&state.status==='loading',unavailable=state.originAvailable===false;
    const cloudRecovery=account&&['conflict','error'].includes(state.status);
    const form=(!account||expired)&&!guestConflict&&!checking;
    if(account)mode='login';
    const registering=mode==='register'&&!account,busy=working||state.status==='loading';
    if(account&&!expired||checking||unavailable)clearSecrets();
    nodes.title.textContent=expired?'重新登录':account?'账号与进度':guestConflict?'游客进度':checking?'确认账号':registering?'创建账号':'账号登录';
    nodes.description.textContent=account?'世界探索随账号保存。':guestConflict?'游客进度保存在当前浏览器。':'登录后，在其他设备继续世界探索。';
    show(nodes.tabs,!account&&!guestConflict&&!checking);show(nodes.profile,account||guestConflict||checking||unavailable);show(nodes.form,form);show(nodes.actions,account||guestConflict);
    nodes['tab-login'].setAttribute('aria-pressed',String(!registering));
    nodes['tab-register'].setAttribute('aria-pressed',String(registering));
    nodes['username-display'].textContent=state.user?.username||'';
    nodes.profile.setAttribute('aria-label',account?'当前账号':'游客进度');
    nodes.status.textContent=guestConflict?'进度已在其他页面更新。读取本机进度后继续。':checking?'正在确认账号状态…':unavailable?'当前地址未配置账号服务，可继续游客游玩。':state.message||STATES[state.status]||STATES.error;
    if(cloudRecovery)nodes.status.textContent+='\n读取后将替换本机未同步进度。';
    nodes.status.dataset.state=state.status||'guest';
    nodes.username.readOnly=expired;
    if(expired)nodes.username.value=state.user.username;
    nodes.password.setAttribute('autocomplete',registering?'new-password':'current-password');
    nodes.submit.textContent=working?'请稍候…':registering?'创建账号':expired?'重新登录':'登录';
    show(nodes['guest-option'],registering&&!!state.hasGuestSave);
    show(nodes.retry,account&&['pending','error'].includes(state.status));
    show(nodes.reload,guestConflict||cloudRecovery);nodes.reload.textContent=account?'读取云端进度':'读取本机进度';
    show(nodes.logout,account);
    show(nodes['guest-note'],!account&&!guestConflict&&!checking);show(nodes['debug-note'],!!state.debug);
    root.setAttribute('aria-busy',String(busy));
    for(const key of ['tab-login','tab-register','username','password','use-guest','submit','retry','reload','logout','close'])nodes[key].disabled=busy;
    if(unavailable||guestConflict)for(const key of ['tab-login','tab-register','username','password','use-guest','submit'])nodes[key].disabled=true;
    return state;
  }
  function setBusy(value){working=!!value;render();}
  function setMode(value){
    if(working||state.user||state.status==='loading'||state.status==='conflict'||state.originAvailable===false)return;
    mode=value==='register'?'register':'login';clearSecrets();showError();render();
  }
  async function act(callback,input){
    if(working||state.status==='loading'||typeof callback!=='function')return;
    showError();setBusy(true);
    try{await callback(input);}
    catch(error){showError(error?.message||'操作未完成，请稍后重试。');}
    finally{clearSecrets();setBusy(false);}
  }
  nodes['tab-login'].addEventListener('click',()=>setMode('login'));
  nodes['tab-register'].addEventListener('click',()=>setMode('register'));
  nodes.form.addEventListener('submit',event=>{
    event.preventDefault();
    if(working||state.status==='loading'||state.status==='conflict'||state.originAvailable===false)return;
    const username=nodes.username.value.trim(),password=nodes.password.value;
    if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)){showError('账号名需为 3–24 位字母、数字或下划线。');return;}
    if(password.length<8||password.length>128){showError('密码需为 8–128 个字符。');return;}
    const registering=mode==='register'&&!state.user;
    clearSecrets();
    void act(registering?callbacks.onRegister:callbacks.onLogin,{
      username,password,...(registering?{useGuestProgress:!!state.hasGuestSave&&nodes['use-guest'].checked}:{})
    });
  });
  nodes.retry.addEventListener('click',()=>{void act(callbacks.onRetry);});
  nodes.reload.addEventListener('click',()=>{void act(callbacks.onReload);});
  nodes.logout.addEventListener('click',()=>{if(state.user)void act(callbacks.onLogout);});
  nodes.close.addEventListener('click',()=>{if(!working&&state.status!=='loading'){clearSecrets();showError();callbacks.onClose?.();}});
  render();
  return {render,setMode,setBusy,showError,clearSecrets,preferredFocus:()=>nodes.username.disabled||nodes.form.hidden?nodes.close:nodes.username,get busy(){return working||state.status==='loading';}};
}
