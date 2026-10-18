import { formatActivityLog } from './activity-log.js';

const KINDS=[['boot','首页加载'],['start','开始冒险'],['transition','场景切换'],['play','持续游玩'],['diagnostic','手动诊断'],['storage','存档读写'],['runtime','运行异常']];
const STATUSES={running:'进行中',success:'成功',warning:'提醒',error:'异常',failure:'异常',cancelled:'已取消'};
const DAY=24*60*60*1000,PAGE_SIZE=40;
const TIME_FORMAT=new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const kindName=kind=>KINDS.find(([value])=>value===kind)?.[1]||'其他行为';
const stamp=value=>typeof value==='number'?value:Date.parse(value);
const text=value=>value==null?'':typeof value==='string'?value:JSON.stringify(value);
function elapsed(value){
  if(!Number.isFinite(value)||value<0)return '';
  if(value<1000)return `${Math.round(value)} 毫秒`;
  if(value<60000)return `${(value/1000).toFixed(1)} 秒`;
  return `${Math.floor(value/60000)} 分 ${Math.floor(value%60000/1000)} 秒`;
}

// This view is initialized before the game. Its native modal and capture-phase
// keyboard boundary remain available when loading the main app has failed.
export function createActivityLogView({document,log,enabled=false}){
  const entry=document.getElementById('activity-log-button');
  entry?.classList.toggle('hidden',!enabled);
  if(entry)entry.hidden=!enabled;
  if(!enabled)return {open(){},close(){},get isOpen(){return false;}};
  const win=document.defaultView;
  const make=(tag,className,content)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(content!==undefined)node.textContent=content;
    return node;
  };
  const button=(className,label)=>{const node=make('button',className,label);node.type='button';return node;};
  const dialog=make('dialog','activity-log-dialog');
  dialog.id='activity-log-dialog';dialog.tabIndex=-1;dialog.setAttribute('aria-labelledby','activity-log-title');
  dialog.setAttribute('aria-describedby','activity-log-description');
  const header=make('header','activity-log-header');
  const heading=make('div','activity-log-heading');
  const title=make('h2','','行为日志');title.id='activity-log-title';
  const description=make('p','','最近24小时 · 按行为记录，可逐项复制');description.id='activity-log-description';
  heading.append(title,description);
  const closeButton=button('activity-log-close','×');closeButton.setAttribute('aria-label','关闭行为日志');
  header.append(heading,closeButton);
  const toolbar=make('div','activity-log-toolbar'),label=make('label','','行为');
  const filter=make('select','activity-log-filter');filter.id='activity-log-filter';label.htmlFor=filter.id;
  for(const [value,name] of [['','全部行为'],...KINDS]){const option=make('option','',name);option.value=value;filter.append(option);}
  const count=make('span','activity-log-count','');count.setAttribute('role','status');
  toolbar.append(label,filter,count);
  const scroller=make('div','activity-log-scroll');
  const empty=make('p','activity-log-empty','正在读取日志…');
  const list=make('ol','activity-log-list');list.setAttribute('aria-label','最近24小时行为记录');
  const more=button('activity-log-more','显示更多');more.hidden=true;
  scroller.append(empty,list,more);
  const fallback=make('section','activity-log-fallback');fallback.hidden=true;
  const fallbackHeading=make('div','activity-log-fallback-heading');
  const fallbackLabel=make('label','','浏览器未允许复制，请选中文本后复制。');fallbackLabel.htmlFor='activity-log-copy-text';
  const fallbackClose=button('activity-log-fallback-close','收起');fallbackHeading.append(fallbackLabel,fallbackClose);
  const fallbackText=make('textarea','activity-log-copy-text');fallbackText.id='activity-log-copy-text';fallbackText.readOnly=true;fallbackText.spellcheck=false;
  fallback.append(fallbackHeading,fallbackText);
  const footer=make('footer','activity-log-footer');
  const storageNote=make('span','activity-log-storage-note','日志保存在当前浏览器，超过24小时自动清理。');
  const announcement=make('span','activity-log-announcement');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');
  footer.append(storageNote,announcement);
  dialog.append(header,toolbar,scroller,fallback,footer);document.body.append(dialog);
  let opened=false,origin=null,keyboard=false,inputRevision=0,copyRevision=0,limit=PAGE_SIZE,records=[],refreshTimer=null,readRevision=0;
  const rows=new Map();
  const surface=target=>{if(!target)return;target.tabIndex=-1;target.focus({preventScroll:true});};
  const visible=node=>node&&!node.disabled&&!node.closest('[hidden],.hidden,[inert]')&&node.getClientRects().length>0;
  const focusable=()=>[...dialog.querySelectorAll('button,select,textarea,summary,[tabindex]')].filter(node=>{
    if(node.tabIndex<0||!visible(node))return false;
    for(let parent=node.parentElement;parent&&parent!==dialog;parent=parent.parentElement){
      if(parent.tagName==='DETAILS'&&!parent.open&&parent.querySelector('summary')!==node)return false;
    }
    return true;
  });
  function keyboardBoundary(event){
    if(!opened){if(event.target===entry)keyboard=true;return;}
    keyboard=true;inputRevision++;
    // Stop before the game's document Tab trap and window game shortcuts.
    // Native text selection, select keys, summary activation and copy survive.
    event.stopImmediatePropagation();
    if(event.key==='Escape'){event.preventDefault();if(!event.repeat)close();return;}
    if(event.key!=='Tab')return;
    const controls=focusable(),active=document.activeElement,first=controls[0],last=controls.at(-1);
    if(!first){event.preventDefault();surface(dialog);return;}
    if(!controls.includes(active)||event.shiftKey&&active===first||!event.shiftKey&&active===last){
      event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});
    }
  }
  document.addEventListener('keydown',keyboardBoundary,{capture:true});
  document.addEventListener('pointerdown',event=>{
    if(!opened&&event.target!==entry)return;
    keyboard=false;inputRevision++;
  },{capture:true});
  dialog.addEventListener('click',event=>{
    if(event.detail===0||!event.target.closest('button,summary'))return;
    const revision=++inputRevision;
    // Use a task: the delegated action may intentionally select fallback text.
    setTimeout(()=>{
      if(!opened||revision!==inputRevision)return;
      const active=document.activeElement;
      if(active===dialog||active?.closest('button,summary'))surface(dialog);
    },0);
  },{capture:true});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(opened&&!dialog.open)finishClose();});
  closeButton.addEventListener('click',close);
  fallbackClose.addEventListener('click',event=>{
    fallback.hidden=true;
    if(event.detail===0)closeButton.focus({preventScroll:true});else surface(dialog);
  });
  function finishClose(){
    opened=false;readRevision++;inputRevision++;copyRevision++;
    if(refreshTimer!==null){clearTimeout(refreshTimer);refreshTimer=null;}
    entry?.setAttribute('aria-expanded','false');fallback.hidden=true;
    if(origin?.keyboard&&visible(origin.target))origin.target.focus({preventScroll:true});
    else surface(document.getElementById('intro')||document.body);
    origin=null;
  }
  function close(){if(!opened)return;dialog.close();if(opened)finishClose();}
  function open(event){
    if(opened)return;
    origin={target:entry||document.activeElement,keyboard:event?event.detail===0:keyboard};
    opened=true;entry?.setAttribute('aria-expanded','true');announcement.textContent='';
    dialog.showModal();
    if(origin.keyboard)closeButton.focus({preventScroll:true});else surface(dialog);
    refresh();
    // Reading the in-memory record list must not wait for a slow storage write.
    Promise.resolve().then(()=>log.flush?.()).catch(()=>{});
  }
  entry?.addEventListener('click',open);
  function announce(message){announcement.textContent=message;}
  async function copy(record,groupIndex){
    const revision=++copyRevision;let output;
    try{output=formatActivityLog(record,groupIndex===undefined?{}:{groupIndex});}
    catch{announce('这条日志暂时无法整理，请重试。');return;}
    try{
      if(!win?.navigator?.clipboard?.writeText)throw new Error('clipboard unavailable');
      await win.navigator.clipboard.writeText(output);
      if(opened&&revision===copyRevision)announce(groupIndex===undefined?'已复制这条日志':'已复制这一组报告');
    }catch{
      if(!opened||revision!==copyRevision)return;
      fallback.hidden=false;fallbackText.value=output;fallbackText.focus({preventScroll:true});fallbackText.select();
      announce('复制未完成，已选中完整文本。');
    }
  }
  const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  function createRow(record){
    const node=make('li','activity-log-item');node.dataset.logId=record.id;
    const top=make('div','activity-log-item-top'),time=make('time','activity-log-time'),kind=make('strong','activity-log-kind'),status=make('span','activity-log-status');
    const copyButton=button('activity-log-copy','复制');top.append(time,kind,status,copyButton);
    const summary=make('p','activity-log-summary');
    const details=make('details','activity-log-details'),detailsToggle=make('summary','','完整信息');
    const content=make('div','activity-log-detail-content'),full=make('pre','activity-log-data');
    details.append(detailsToggle,content);content.append(full);node.append(top,summary,details);
    const row={node,time,kind,status,copyButton,summary,details,content,full,groups:[],record};
    copyButton.addEventListener('click',()=>copy(row.record));
    details.addEventListener('toggle',()=>{if(details.open)updateDetails(row);});
    return row;
  }
  function updateDetails(row){
    const record=row.record;
    try{setText(row.full,formatActivityLog(record));}catch{setText(row.full,'完整信息暂时不可用。');}
    const reports=Array.isArray(record.details?.reports)?record.details.reports:[];
    while(row.groups.length>reports.length)row.groups.pop().node.remove();
    reports.forEach((report,index)=>{
      let group=row.groups[index];
      if(!group){
        const node=make('section','activity-log-report'),heading=make('div','activity-log-report-heading');
        const title=make('h3'),copyButton=button('activity-log-copy','复制此组'),data=make('pre','activity-log-data');
        heading.append(title,copyButton);node.append(heading,data);row.content.append(node);
        copyButton.addEventListener('click',()=>copy(row.record,index));
        group={node,title,data};row.groups.push(group);
      }
      setText(group.title,text(report?.title||report?.name||report?.label||report?.modeLabel||report?.mode||report?.group||`报告 ${index+1}`));
      try{setText(group.data,formatActivityLog(record,{groupIndex:index}));}catch{setText(group.data,'这组报告暂时不可用。');}
    });
  }
  function updateRow(row,record){
    row.record=record;
    const signature=JSON.stringify(record);
    if(row.signature===signature)return;
    row.signature=signature;
    const when=new Date(stamp(record.startedAt));
    setText(row.time,Number.isFinite(when.getTime())?TIME_FORMAT.format(when):'时间未知');
    if(Number.isFinite(when.getTime())){row.time.dateTime=when.toISOString();row.time.title=when.toLocaleString('zh-CN');}
    setText(row.kind,kindName(record.kind));
    const snapshot=record.status==='running'&&(record.details?.snapshot||log.sessionId&&record.sessionId!==log.sessionId);
    const error=['error','failure'].includes(record.status),slow=!error&&record.kind==='play'&&Number(record.details?.performance?.warnings)>0;
    const warning=record.status==='success'&&record.events?.some(event=>event.level==='warning');
    setText(row.status,error?'异常':slow?'偏慢':snapshot?'未记录结束':warning?'提醒':STATUSES[record.status]||'已记录');
    row.status.dataset.status=slow||warning?'warning':snapshot?'snapshot':record.status;
    row.status.title=snapshot?'此记录来自较早页面，未记录结束。':'';
    row.copyButton.setAttribute('aria-label',`复制${kindName(record.kind)}日志`);
    const duration=elapsed(record.durationMs),summary=text(record.summary||record.title||kindName(record.kind));
    setText(row.summary,`${summary}${duration?` · ${duration}`:''}`);
    if(row.details.open)updateDetails(row);
  }
  function render({resetScroll=false}={}){
    const filtered=records.filter(record=>!filter.value||record.kind===filter.value),shown=filtered.slice(0,limit);
    const scrollerTop=scroller.getBoundingClientRect().top;
    const anchor=resetScroll?null:[...list.children].find(node=>node.getBoundingClientRect().bottom>scrollerTop);
    const anchorTop=anchor?.getBoundingClientRect().top,scrollTop=scroller.scrollTop;
    const shownIds=new Set(shown.map(record=>record.id));
    for(const [id,row] of rows)if(!shownIds.has(id)){row.node.remove();rows.delete(id);}
    let cursor=list.firstElementChild;
    for(const record of shown){
      let row=rows.get(record.id);
      if(!row){row=createRow(record);rows.set(record.id,row);}
      updateRow(row,record);
      if(row.node!==cursor)list.insertBefore(row.node,cursor);
      cursor=row.node.nextElementSibling;
    }
    empty.hidden=filtered.length>0;
    setText(empty,filter.value?`最近24小时没有“${kindName(filter.value)}”记录`:'最近24小时暂无记录');
    setText(count,filtered.length?`${Math.min(limit,filtered.length)} / ${filtered.length} 条`:'0 条');
    more.hidden=filtered.length<=limit;setText(more,`再显示 ${Math.min(PAGE_SIZE,Math.max(0,filtered.length-limit))} 条`);
    const memoryOnly=log.storageOk===false||log.storageMode==='memory';
    setText(storageNote,memoryOnly?'浏览器存储不可用，日志仅在当前页面保留。':'日志保存在当前浏览器，超过24小时自动清理。');
    storageNote.classList.toggle('is-memory',memoryOnly);
    if(resetScroll)scroller.scrollTop=0;
    else if(anchor?.isConnected)scroller.scrollTop=scrollTop+anchor.getBoundingClientRect().top-anchorTop;
    else scroller.scrollTop=scrollTop;
  }
  async function refresh(){
    if(!opened)return;
    const revision=++readRevision;
    try{
      const value=await log.list();
      if(!opened||revision!==readRevision)return;
      const cutoff=Date.now()-DAY;
      records=(Array.isArray(value)?value:[]).filter(record=>stamp(record.startedAt)>cutoff)
        .sort((a,b)=>stamp(b.startedAt)-stamp(a.startedAt));
      render();
    }catch{
      if(!opened||revision!==readRevision)return;
      if(!records.length){empty.hidden=false;empty.textContent='暂时无法读取日志，请关闭后重试。';}
      else announce('暂时无法刷新日志，仍显示上次记录。');
    }
  }
  filter.addEventListener('change',()=>{limit=PAGE_SIZE;render({resetScroll:true});});
  more.addEventListener('click',event=>{
    const previous=limit;limit+=PAGE_SIZE;render();
    if(event.detail===0){const firstNew=list.children[previous]?.querySelector('button');firstNew?.focus({preventScroll:true});}
  });
  log.subscribe?.(()=>{
    if(!opened||refreshTimer!==null)return;
    refreshTimer=setTimeout(()=>{refreshTimer=null;refresh();},150);
  });
  return {open,close,get isOpen(){return opened;}};
}
