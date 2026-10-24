const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const panelStates=new WeakMap(),trackerStates=new WeakMap();
const statusLabel={available:'待接取',active:'进行中',completed:'已完成'};

function objectiveHTML(objective){
  const total=Math.max(1,Number(objective.total)||1),current=Math.min(total,Math.max(0,Number(objective.current)||0)),done=!!objective.done;
  return `<li class="quest-step${done?' is-complete':''}"><span class="quest-step-mark" aria-hidden="true">${done?'✓':'○'}</span><span>${escape(objective.label)}</span><span class="quest-step-count">${done?'<span class="sr-only">已完成</span>':total>1?`${current} / ${total}`:'<span class="sr-only">未完成</span>'}</span></li>`;
}

function cardHTML(entry){
  const status=statusLabel[entry.status]?entry.status:'active',completed=status==='completed',available=status==='available';
  const action=available&&entry.canAccept!==false?`<button class="quest-action" type="button" data-quest-action="accept" data-quest-id="${escape(entry.id)}">接受委托</button><button class="quest-action" type="button" data-quest-action="decline" data-quest-id="${escape(entry.id)}">暂不接取</button>`:status==='active'&&!entry.tracked?`<button class="quest-action" type="button" data-quest-action="track" data-quest-id="${escape(entry.id)}">追踪任务</button>`:'';
  const heading=`<span class="quest-entry-name">${escape(entry.name)}</span><span class="quest-entry-status">${entry.tracked&&!completed?'正在追踪':statusLabel[status]}</span>`;
  const body=`${entry.description?`<p class="quest-description">${escape(entry.description)}</p>`:''}<ol class="quest-steps">${(entry.objectives||[]).map(objectiveHTML).join('')}</ol>${entry.rewardText?`<p class="quest-reward"><span>${completed?'已获得':'完成后'}</span>${escape(entry.rewardText)}</p>`:''}${action?`<div class="quest-entry-actions">${action}</div>`:''}`;
  return completed?`<details class="quest-entry is-complete" data-quest-entry="${escape(entry.id)}"><summary class="quest-entry-heading">${heading}</summary><div class="quest-entry-body">${body}</div></details>`:`<article class="quest-entry${entry.tracked?' is-tracked':''}" data-quest-entry="${escape(entry.id)}" tabindex="-1"><h4 class="quest-entry-heading">${heading}</h4>${body}</article>`;
}

export function questPanelHTML(entries=[],{storageMode}={}){
  const ordered=entries.filter(entry=>statusLabel[entry.status]).map((entry,index)=>({entry,index})).sort((a,b)=>{
    const rank=entry=>entry.status==='active'?(entry.tracked?0:1):entry.status==='available'?2:3;
    return rank(a.entry)-rank(b.entry)||a.index-b.index;
  }).map(({entry})=>entry);
  const note=storageMode==='persistent'?'任务随当前旅程一起保存。':storageMode==='session-debug'?'调试冒险的任务记录不写入正式进度。':storageMode==='session'?'任务记录仅在本次冒险内有效。':'';
  return (ordered.length?ordered.map(cardHTML).join(''):'<p class="quest-empty">尚未发现委托。留意营地的告示与沿途线索。</p>')+(note?`<p class="quest-save-note">${note}</p>`:'');
}

// The map owns pause/focus state. This view only delegates actions and preserves
// keyboard reading position if an accepted card replaces its action button.
export function renderQuestPanel(container,entries=[],options={}){
  if(!container)return;
  let state=panelStates.get(container);
  if(!state){
    state={html:null,options};panelStates.set(container,state);
    container.addEventListener('click',event=>{
      const button=event.target?.closest?.('[data-quest-action]');
      if(!button||!container.contains(button))return;
      const id=button.getAttribute('data-quest-id'),action=button.getAttribute('data-quest-action');
      if(action==='accept')state.options.onAccept?.(id,event);
      else if(action==='track')state.options.onTrack?.(id,event);
      else if(action==='decline')state.options.onDecline?.(id,event);
      if(event.detail===0&&button.isConnected===false){
        const card=[...container.querySelectorAll('[data-quest-entry]')].find(node=>node.getAttribute('data-quest-entry')===id);
        card?.focus?.({preventScroll:true});
      }
    });
  }
  state.options=options;
  const html=questPanelHTML(entries,options);
  if(state.html!==html){container.innerHTML=html;state.html=html;}
}

export function updateQuestTracker(button,data,{onOpen}={}){
  if(!button)return;
  let state=trackerStates.get(button);
  if(!state){
    state={signature:null,onOpen};trackerStates.set(button,state);
    button.addEventListener('click',event=>state.onOpen?.(event));
  }
  state.onOpen=onOpen;
  const visible=!!data?.name;
  button.classList.toggle('hidden',!visible);button.hidden=!visible;
  if(!visible){state.signature=null;return;}
  const text=data.text||(data.status==='available'?'查看委托':'查看任务详情'),signature=`${data.name}\n${text}\n${data.detail||''}`;
  if(state.signature===signature)return;
  state.signature=signature;
  button.innerHTML=`<span class="quest-tracker-heading"><span class="quest-tracker-mark" aria-hidden="true">◇</span><strong>${escape(data.name)}</strong><span class="quest-tracker-open" aria-hidden="true">›</span></span><span class="quest-tracker-goal">${escape(text)}</span>`;
  button.setAttribute('aria-label',`${data.name}：${text}。打开地图查看任务，时间暂停`);
  button.title=[data.name,text,data.detail,'打开地图查看任务'].filter(Boolean).join(' · ');
}
