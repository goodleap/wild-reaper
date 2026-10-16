// One presentation contract for keyboard and touch combat actions. Callers
// retain their own gameplay validation and decide when an action is available.
export function createCombatActionControl({button,label,touchButton,touchLabel,symbol,fill,detail,key,coarse=false}){
  function update({visible=false,enabled=true,text='',mobileText=text,icon='',description='',ariaLabel=text,progress=1,cooldown=false,id=''}){
    button.classList.toggle('hidden',!visible);
    touchButton.classList.toggle('hidden',!visible||!coarse);
    button.disabled=touchButton.disabled=!enabled;
    label.textContent=text;touchLabel.textContent=mobileText;symbol.textContent=icon;
    if(detail)detail.textContent=description;
    if(fill)fill.style.width=`${100*Math.max(0,Math.min(1,progress))}%`;
    touchButton.classList.toggle('cooldown',cooldown||!enabled);
    const hint=[text,description,key].filter(Boolean).join(' · ');
    button.title=hint;touchButton.title=[text,description].filter(Boolean).join(' · ');
    button.setAttribute('aria-label',[ariaLabel,description,key].filter(Boolean).join('，'));
    touchButton.setAttribute('aria-label',[ariaLabel,description].filter(Boolean).join('，'));
    for(const control of [button,touchButton])control.setAttribute('data-action-id',id);
  }
  return {update};
}
