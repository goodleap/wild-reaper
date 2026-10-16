import assert from 'node:assert/strict';
import { createNotificationQueue, combatNotifications } from './dist/notifications.js';

let time=0,id=0;const tasks=new Map(),seen=[];
const queue=createNotificationQueue({now:()=>time,onChange:item=>seen.push({time,text:item?.text??''}),
  setTimer:(fn,delay)=>{tasks.set(++id,{fn,at:time+delay});return id;},clearTimer:id=>tasks.delete(id)});
function advance(ms){const end=time+ms;for(let i=0;i<100;i++){
  const due=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!due||due[1].at>end){time=end;return;}
  time=due[1].at;tasks.delete(due[0]);due[1].fn();
}throw Error('Notification timers did not settle');}
assert.equal(queue.push('  '),false,'empty text never creates a background');
queue.push('伙伴加入',1);advance(100);
queue.push('离开紫色预警圈',3,{key:'danger',icon:'!'});
assert.equal(queue.current.text,'伙伴加入','an urgent event still gives the current message a readable lifetime');
advance(1699);assert.equal(queue.current.text,'伙伴加入');advance(1);
assert.equal(queue.current.text,'离开紫色预警圈');
assert.equal(queue.push('已拾取药草',1),false,'routine feedback cannot displace a warning');
queue.push('军团维持费不足',2,{key:'upkeep'});
advance(2600);assert.equal(queue.current.text,'军团维持费不足','actionable lower-priority feedback survives the danger message');
assert.equal(queue.push('军团维持费不足',2,{key:'upkeep'}),false,'duplicates do not restart visibility');
advance(2600);assert.equal(queue.current,null);
assert.equal(queue.push('离开紫色预警圈',3,{key:'danger'}),false,'repeated danger events are coalesced');
advance(12000);assert.equal(queue.push('离开紫色预警圈',3,{key:'danger'}),true);
queue.push('后续结果',2);queue.clear();advance(30000);
assert.equal(queue.current,null);assert.equal(tasks.size,0,'home/restart removes pending notices and timers');

const world={mode:'world',_worldExploration:true,player:{hp:100},realms:{enabled:true,label:'筑基'}};
const routine=['herb','fury','magnet','angelBlessing','territoryCleared','dungeonRoomCleared','regionEnter','houseGuard','houseOpened','treasureGuard','treasureUnlocked','treasureOpened','wave','siege','waveCleared','relief','weaponAcquired','branchChosen','encounterHunt','encounterExpired','rescueAppeared'];
assert.deepEqual(combatNotifications(routine.map(type=>({type})),{game:world}),[],'existing HUD/scene feedback replaces routine banners');
const relevant=combatNotifications([{type:'realmBreakthrough'},{type:'companionRecoveryBlocked',name:'猫头鹰',cost:20}],{game:world});
assert.equal(relevant.length,2);assert.match(relevant[0].text,/突破成功/);assert.match(relevant[1].text,/20 金币/);
const result=combatNotifications([{type:'bossKill'},{type:'stageCoreDefeated'},{type:'portalOpened'}],{game:world});
assert.equal(result.length,1,'one boss kill is not announced repeatedly through overlapping events');
assert.match(result[0].text,/通关门/);
assert.deepEqual(combatNotifications([{type:'boss'},{type:'realmBottleneck'}],{game:{...world,mode:'story'},boss:{id:1,name:'首领'},warning:'危险'}),[],'scripted story does not receive generic notices');
assert.deepEqual(combatNotifications([{type:'realmBottleneck'}],{game:{...world,mode:'dungeon',realms:{enabled:false}}}),[]);
assert.deepEqual(combatNotifications([{type:'bloomWindup'},{type:'bossWindup'}],{game:world,boss:{id:1},warning:'离开预警圈'}),[],'short attack cues cannot be delayed in the text queue');
assert.match(combatNotifications([{type:'rescueReady'}],{game:world,armyFull:true})[0].text,/军团已满/);
assert(seen.some(item=>item.text===''));
console.log('Notification priorities, readable lifetime, coalescing, reset and event filtering passed.');
