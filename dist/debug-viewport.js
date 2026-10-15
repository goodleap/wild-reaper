const MIN_WIDTH=240,MAX_WIDTH=1600;
const PRESETS=[['default',{mode:'default'}],['native',{mode:'native'}],...['480','540','600'].map(width=>[width,{mode:'custom',width:Number(width)}])];
const validWidth=value=>Number.isInteger(value)&&value>=MIN_WIDTH&&value<=MAX_WIDTH;

// The camera owns viewport state. These paused controls keep only an unfinished
// input edit; no browser storage or game-world values are changed here.
export function createDebugViewportControls({document,enabled=false,getState,onChange}){
  const root=document.getElementById('debug-viewport');
  if(!enabled||!root){root?.classList.add('hidden');return {refresh(){}};}
  const input=document.getElementById('debug-viewport-width'),form=document.getElementById('debug-viewport-form');
  const current=document.getElementById('debug-viewport-current'),error=document.getElementById('debug-viewport-error');
  const buttons=PRESETS.map(([id,change])=>({button:document.getElementById(`debug-viewport-${id}`),change}));
  root.classList.remove('hidden');
  for(const control of [...buttons.map(item=>item.button),input,document.getElementById('debug-viewport-apply')])control.disabled=false;
  function clearError(){input.removeAttribute('aria-invalid');error.textContent='';error.classList.add('hidden');}
  function refresh(forceInput=false){
    const state=getState(),width=Math.round(state.width),height=Math.round(state.height);
    const label=`当前世界视野：${width} × ${height}`;
    if(current.textContent!==label)current.textContent=label;
    for(const {button,change} of buttons)button.setAttribute('aria-pressed',String(state.mode===change.mode&&(change.mode!=='custom'||state.customWidth===change.width)));
    // Resizing or refreshing the paused HUD must not discard a half-typed edit.
    if(forceInput||document.activeElement!==input){
      const suggested=state.mode==='custom'&&validWidth(state.customWidth)?state.customWidth:Number.isFinite(width)?Math.max(MIN_WIDTH,Math.min(MAX_WIDTH,width)):540;
      input.value=String(suggested);
    }
  }
  function apply(change){clearError();onChange({...change});refresh(true);}
  for(const {button,change} of buttons)button.addEventListener('click',()=>apply(change));
  input.addEventListener('input',clearError);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const value=input.value.trim(),width=Number(value);
    if(!/^\d+$/.test(value)||!validWidth(width)){
      input.setAttribute('aria-invalid','true');error.textContent='请输入 240–1600 之间的整数。';error.classList.remove('hidden');input.focus();return;
    }
    apply({mode:'custom',width});
  });
  refresh();
  return {refresh:()=>refresh()};
}
