// A single readable HUD message, with a short, expiring queue for important results.
export function createNotificationQueue({onChange,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let current=null,timer=null,pending=[];
  const recent=new Map(),minimum=1800;
  const publish=notice=>{current=notice?{...notice,started:now()}:null;if(current)recent.set(current.key,current.started);onChange?.(current);};
  function update(){
    timer=null;const time=now();
    pending=pending.filter(item=>time-item.queued<(item.priority>=2?10000:4500));
    pending.sort((a,b)=>b.priority-a.priority||a.queued-b.queued);
    if(current&&(time-current.started>=current.duration||pending[0]?.priority>current.priority&&time-current.started>=minimum))publish(null);
    if(!current&&pending.length)publish(pending.shift());
    schedule();
  }
  function schedule(){
    if(timer!==null)clearTimer(timer);timer=null;
    if(!current)return;
    const interrupt=pending.some(item=>item.priority>current.priority);
    const deadline=current.started+(interrupt?minimum:current.duration);
    timer=setTimer(update,Math.max(0,deadline-now()));
  }
  return {
    push(message,priority=1,{key=message,icon=priority>=3?'!':'◇'}={}){
      const text=String(message??'').trim();if(!text)return false;
      const time=now();
      for(const [id,at] of recent)if(time-at>15000)recent.delete(id);
      if(current?.key===key||pending.some(item=>item.key===key)||time-(recent.get(key)??-Infinity)<12000)return false;
      if(current&&priority<current.priority&&priority<2)return false;
      const notice={text,priority,key,icon,queued:time,duration:Math.max(2600,Math.min(5000,text.length*110))};
      if(!current)publish(notice);
      else{pending.push(notice);pending.sort((a,b)=>b.priority-a.priority||a.queued-b.queued);pending=pending.slice(0,3);}
      schedule();return true;
    },
    clear(){if(timer!==null)clearTimer(timer);timer=null;pending=[];recent.clear();publish(null);},
    get current(){return current;}
  };
}

// Routine pickups, area clearing and event progress already have scene/HUD feedback.
export function combatNotifications(events,{game,boss,armyFull=false}={}){
  if(!game||game.mode==='story')return [];
  const result=[],has=type=>events.some(event=>event.type===type);
  const add=(text,priority=2,key=text,icon='◇')=>result.push({text,priority,key,icon});
  if(game.realms?.enabled&&has('realmBreakthrough'))add(`突破成功 · ${game.realms.label}`,3,'realm-breakthrough','✦');
  if(game.realms?.enabled&&has('tribulationFailed')&&game.player.hp>0)add('渡劫未成 · 境界与经验保留',3,'tribulation-failed');
  if(game.realms?.enabled&&has('realmBottleneck'))add('已达瓶颈 · 可准备渡劫',2,'realm-ready','✦');
  if(has('expeditionExitOpened'))add('出口已开放 · 前往出口',3,'exit-open','↗');
  if(has('stageCoreDefeated'))add('核心首领已击败 · 进入通关门',3,'core-defeated','✦');
  else if(has('dungeonBossKill'))add('最终首领已击败 · 领取技能宝藏',3,'dungeon-boss-defeated','✦');
  else if(has('stageOptionalDefeated'))add('外岛首领已击败 · 奖励可领取',2,'optional-defeated','✦');
  else if(has('bossKill'))add(game._worldExploration?'领主已击败 · 领取技能奖励':'首领已击败',3,'boss-defeated','✦');
  else if(boss&&has('boss'))add(`${boss.name||'荒野领主'}现身`,3,`boss-arrival:${boss.id}`,'!');
  // Subsecond attack warnings belong to live ground/cast indicators, not a
  // reading queue that could display an instruction after the attack lands.
  if(has('worldsConnected'))add('三条世界通路已打通',2,'worlds-connected','↗');
  else if(has('portalOpened')&&!has('bossKill'))add('新通路已开放',2,'portal-open','↗');
  if(has('stonevaultOpened'))add('岩灵破开封石 · 秘藏入口已打开',2,'stonevault-open','↗');
  for(const event of events){
    if(event.type==='evolution')add(`${event.name} · ${event.weaponId==='orbit'?'武器进化':'分支解锁'}`,2,`evolution:${event.weaponId}`,'✦');
    else if(event.type==='companionJoined')add(`${event.name}加入军团`,1,`joined:${event.id??event.name}`,'+');
    else if(event.type==='companionUpkeepWarning')add('军团维持费不足 · 请补充金币',2,'upkeep-warning','!');
    else if(event.type==='companionRecoveryBlocked')add(`${event.name}等待救治 · 需 ${event.cost} 金币`,2,`recovery:${event.id??event.name}`,'!');
    else if(event.type==='companionLeft')add(`${event.name}离队${event.reason==='unpaid'?' · 金币不足':''}`,event.reason==='unpaid'?2:1,`left:${event.id??event.name}`,'!');
    else if(event.type==='rescueReady'&&armyFull)add('军团已满 · 暂时无法招募',2,'army-full','!');
  }
  return result.sort((a,b)=>b.priority-a.priority);
}
