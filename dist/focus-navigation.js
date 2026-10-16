// Pointer actions return to a surface; explicit keyboard navigation keeps its
// control. Store the opening intent so Escape cannot turn a pointer-opened
// dialog into a keyboard return to the old HUD button.
export function isEditableTarget(target){
  return !!(target?.isContentEditable||target?.closest?.('input,select,textarea,[contenteditable="true"]'));
}

export function createFocusNavigation(document,{pointerSurface}={}){
  let keyboard=false,inputRevision=0;
  const noteKeyboard=event=>{if(!['Shift','Control','Alt','Meta'].includes(event.key)){keyboard=true;inputRevision++;}};
  const fromKeyboard=event=>event?.pointerType||event?.detail>0?false:event?.detail===0?true:keyboard;
  const action=element=>element?.closest?.('button,summary,[role="button"],input[type="button"],input[type="submit"],input[type="reset"]');
  document.addEventListener('pointerdown',()=>{keyboard=false;inputRevision++;},{capture:true});
  document.addEventListener('keydown',noteKeyboard,{capture:true});
  document.addEventListener('click',event=>{
    keyboard=fromKeyboard(event);const revision=++inputRevision;
    if(keyboard||!action(event.target))return;
    // A new task is required: browsers can run a capture listener's microtasks
    // before later target/delegated listeners. Those may replace the control,
    // focus another action, or open/close a nested dialog. A later pointer or
    // keyboard action owns its focus and cancels this cleanup.
    setTimeout(()=>{if(inputRevision===revision)settlePointerAction(event);},0);
  },{capture:true});
  function capture(event){
    return {target:document.activeElement,keyboard:fromKeyboard(event)};
  }
  function visible(element){
    if(!element||element.isConnected===false||element.closest?.('.hidden,[hidden],[inert],[aria-hidden="true"]'))return false;
    if(element.getClientRects&&element.getClientRects().length===0)return false;
    for(let parent=element;parent;parent=parent.parentElement){
      if(parent.tagName==='DETAILS'&&!parent.open&&!parent.hasAttribute('open')&&!parent.querySelector('summary')?.contains(element))return false;
    }
    const style=document.defaultView?.getComputedStyle(element);
    return style?.visibility!=='hidden'&&style?.visibility!=='collapse';
  }
  function usable(element){return visible(element)&&!element.disabled&&!element.closest?.('fieldset[disabled]');}
  function surface(element){
    if(!visible(element))return false;
    element.tabIndex=-1;element.focus({preventScroll:true});return true;
  }
  function settlePointerAction(event){
    if(fromKeyboard(event)||!action(event.target))return false;
    const active=document.activeElement;
    // Controls that receive text, native choices and intentional focus on
    // readable content keep their behavior; only operation controls are freed.
    if(active&&active!==document.body&&!action(active))return false;
    return surface(pointerSurface?.(event)||active?.closest?.('[role="dialog"],[data-focus-surface]'));
  }
  function enter(scope,preferred,origin=capture()){
    if(origin.keyboard&&usable(preferred)){preferred.focus({preventScroll:true});return;}
    surface(scope.querySelector?.('[role="dialog"]')||scope);
  }
  function restore(origin,scope,fallback){
    if(origin?.keyboard&&scope.contains(origin.target)&&usable(origin.target)){origin.target.focus({preventScroll:true});return;}
    if(fallback?.tagName==='CANVAS'){surface(fallback);return;}
    enter(scope,fallback,origin||capture());
  }
  function focusable(scope){
    const items=[...scope.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex],[contenteditable="true"]')].filter(element=>{
      const tabIndex=element.tabIndex??Number(element.getAttribute('tabindex')??0);
      return tabIndex>=0&&usable(element)&&String(element.type||element.getAttribute('type')).toLowerCase()!=='hidden';
    });
    return items.filter(element=>{
      if(String(element.type||element.getAttribute('type')).toLowerCase()!=='radio')return true;
      const name=element.name||element.getAttribute('name');if(!name)return true;
      const group=items.filter(other=>String(other.type||other.getAttribute('type')).toLowerCase()==='radio'&&(other.name||other.getAttribute('name'))===name&&other.form===element.form);
      return element===(group.find(other=>other.checked)||group[0]);
    });
  }
  function trap(scope,event){
    const items=focusable(scope),active=document.activeElement;
    if(!items.length){event.preventDefault();surface(scope.querySelector?.('[role="dialog"]')||scope);return;}
    const first=items[0],last=items.at(-1);
    if(!items.includes(active)||event.shiftKey&&active===first||!event.shiftKey&&active===last){
      event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});
    }
  }
  return {capture,noteKeyboard,visible,surface,enter,restore,focusable,trap,settlePointerAction};
}
