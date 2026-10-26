import { SideQuestScene, foot, distance } from './base.js';
import { DEFINITIONS } from './nature-definitions.js';

const add=(p,x=0,y=0)=>({x:p.x+x,y:p.y+y});
const target=(p,objectiveId,label)=>({...p,objectiveId,label});
const within=(scene,p,r=85)=>distance(foot(scene.game.player),p)<=r;
const livingNear=(scene,p,r=135)=>scene.game.enemies.some(e=>e.hp>0&&e.guardActive!==false&&distance(foot(e),p)<r);

class BowRest extends SideQuestScene {
  setup(){
    // Keep the pen west of the existing 420-unit hunting relic disk. A
    // compact two-stage enclosure fits the clearing without covering it.
    this.c=this.point('pen','05',-280,20,35);this.out=this.safePoint(add(this.c,0,220),20,this.c);
    this.giver=this.actor('giver',this.point('giver','05',210,220),{kind:'warden',name:'收弓的猎人'});
    for(const [key,x,y] of [['leader',-55,-75],['doe',55,-75],['calf',0,-40]])this.actor(key,add(this.c,x,y),{kind:'deer',name:key==='calf'?'幼鹿':'林鹿',r:key==='calf'?10:13,speed:180});
    this.prop('bell','bell',add(this.c,65,185),{label:'饲铃'});this.prop('rack','feed-rack',add(this.c,-75,-95));
    this.prop('inside-crank','lever',add(this.c,0,95));this.prop('outside-crank','lever',add(this.c,0,185));this.syncGates();
  }
  syncGates(){
    const c=this.c,done=this.completed;
    for(const [key,a,b] of [['west',[-115,-130],[-115,130]],['east',[115,-130],[115,130]],['north',[-115,-130],[115,-130]],['south-west',[-115,130],[-45,130]],['south-east',[45,130],[115,130]],['middle-west',[-115,0],[-45,0]],['middle-east',[45,0],[115,0]]])this.gate(key,add(c,...a),add(c,...b),{open:done,r:7,label:'旧兽栏'});
    this.gate('inner',add(c,-45,0),add(c,45,0),{open:done||this.state.flags.inner===true,r:7,label:'内栏门'});
    this.gate('outer',add(c,-45,130),add(c,45,130),{open:done||this.state.flags.inner!==true,r:7,label:'外栏门'});
  }
  actions(){
    if(!this.accepted)return [];
    if(this.record.objectives.released&&!this.completed)return [this.action('farewell',foot(this.giver),'鹿群已经回到林地',()=>{this.mark('farewell');this.syncGates();this.say(this.giver,'从今天起，这里只添草料，不再挂弓。');return true;})];
    if(this.completed)return [];
    const inside=foot(this.game.player).y<this.c.y+130,crank=add(this.c,0,inside?95:185);
    return [this.action('crank',crank,this.state.flags.inner?'关闭内栏 · 打开外栏':'关闭外栏 · 打开内栏',()=>{this.state.flags.inner=!this.state.flags.inner;this.syncGates();this.changed();return true;},{description:'两道门交替打开。先让鹿进入中间空栏，再打开出口。'}),
      this.action('bell',this.props.get('bell'),'选择饲铃的节奏',choice=>{this.state.choices.lure=choice;this.changed();return true;},{choices:[{id:'herd',label:'呼唤头鹿',description:'头鹿跟着你，其他鹿跟着头鹿。'},{id:'calf',label:'先带幼鹿',description:'只引幼鹿，其余鹿留在栏内。'},{id:'stop',label:'停下铃声',description:'鹿群停在原处，方便调整栏门。'}]})];
  }
  update(dt){
    if(!this.accepted)return;
    const leader=this.actors.get('leader'),p=foot(this.game.player),mode=this.state.choices.lure;
    for(const [i,key] of ['leader','doe','calf'].entries()){
      const a=this.actors.get(key);
      if(this.state.flags[`free-${key}`]){this.move(a,add(this.out,(i-1)*50,0),dt,{speed:150,stop:15});continue;}
      if(mode==='herd')this.follow(a,key==='leader'?p:foot(leader),dt,{speed:180,stop:key==='leader'?38:28,start:65});
      else if(mode==='calf'&&key==='calf')this.follow(a,p,dt,{speed:180,stop:38,start:65});
      else a.moving=false;
      if(foot(a).y>this.c.y+165){this.state.flags[`free-${key}`]=true;this.changed();}
    }
    if(['leader','doe','calf'].every(k=>this.state.flags[`free-${k}`])&&!this.record.objectives.released)this.mark('released');
    this.props.get('bell').state=mode&&mode!=='stop'?'active':'ready';
  }
  targets(){return this.record.objectives.released?[target(foot(this.giver),'farewell','回到猎人身边')]:[target(this.props.get('bell'),'released','用饲铃引鹿，交替开启两道栏门')];}
}

class FishThief extends SideQuestScene {
  setup(){
    this.c=this.point('rack','07',0,0,30);this.rack=this.c;this.watch=this.safePoint(add(this.c,-140,105),18,this.c);this.nest=this.safePoint(add(this.c,205,-80),20,this.c);this.bay=this.safePoint(add(this.c,210,110),20,this.c);this.porch=this.safePoint(add(this.c,-90,155),20,this.c);
    this.giver=this.actor('giver',this.point('giver','07',-120,120),{kind:'elder',name:'晒鱼的婆婆'});
    this.otter=this.actor('otter',this.safePoint(add(this.c,-180,-80),15,this.c),{kind:'otter',name:'偷鱼的小客人',r:11,speed:110});
    this.prop('rack','fish-rack',this.rack);this.prop('watch','trail-marker',this.watch,{label:'芦苇后观察'});this.prop('nest','burrow',this.nest);this.prop('bowl','feeding-bowl',this.state.choices.home==='porch'?this.porch:this.bay,{hidden:!this.completed});this.sync();
  }
  sync(){this.otter.hidden=!this.accepted||!this.state.flags.watching;this.props.get('rack').state=this.record.objectives.witnessed?'taken':'ready';if(this.completed){this.otter.hidden=false;this.props.get('bowl').hidden=false;}}
  actions(){
    if(!this.accepted||this.completed)return [];
    if(!this.record.objectives.witnessed)return [this.action('watch',this.watch,this.state.flags.watching?'继续在芦苇后观察':'躲到芦苇后观察',()=>{this.state.flags.watching=true;this.state.values.wait=0;this.state.values.phase=0;this.placeActor(this.otter,this.safePoint(add(this.c,-180,-80),15,this.c));this.sync();this.changed();return true;},{description:'留在观察点附近，别提前靠近鱼架。'})];
    if(!this.record.objectives.found)return [];
    if(!this.state.choices.home)return [this.action('settle',this.nest,'替小客人找个去处',choice=>{this.state.choices.home=choice;this.changed();this.say(this.giver,choice==='porch'?'给它留个碗吧，别再误会邻家的孩子。':'把鱼留在安静湾边，它就不用来翻鱼架了。');return true;},{choices:[{id:'porch',label:'留下棚下投食角',description:'带它回鱼棚附近，居民会留一小碗鱼。'},{id:'bay',label:'安置在安静岛湾',description:'沿短路带它到安静的窝，鱼棚重新围好。'}]})];
    return [];
  }
  update(dt){
    if(!this.accepted)return;this.sync();
    const p=foot(this.game.player),phase=this.state.values.phase||0;
    if(this.completed)return;
    if(!this.record.objectives.witnessed&&this.state.flags.watching){
      if(phase===0){this.state.values.wait=(this.state.values.wait||0)+(distance(p,this.watch)<60?dt:0);if(this.state.values.wait>=2){this.state.values.phase=1;this.changed();}}
      else if(phase===1){
        if(distance(p,foot(this.otter))<72&&distance(p,this.watch)>65){this.state.flags.watching=false;this.say(this.giver,'脚步轻些。它听见了，等会儿再试。');this.changed();return;}
        if(this.move(this.otter,this.rack,dt,{speed:95,stop:12})){this.mark('witnessed');this.state.values.phase=2;this.otter.carryingFish=true;this.changed();}
      }
    }else if(this.record.objectives.witnessed&&!this.state.choices.home){
      if(phase<3&&this.move(this.otter,this.nest,dt,{speed:100,stop:14})){this.state.values.phase=3;this.changed();}
      const progress=Math.max(0,Math.min(1,distance(this.rack,foot(this.otter))/Math.max(1,distance(this.rack,this.nest))));
      for(let i=1;i<=5;i++)this.prop(`tracks-${i}`,'fish-trail',{x:this.rack.x+(this.nest.x-this.rack.x)*i/6,y:this.rack.y+(this.nest.y-this.rack.y)*i/6},{hidden:i/6>progress});
      if(this.state.values.phase===3&&distance(p,this.nest)<75&&!this.record.objectives.found)this.mark('found');
    }else if(this.state.choices.home){
      const goal=this.state.choices.home==='porch'?this.porch:this.bay;
      this.follow(this.otter,p,dt,{speed:175,stop:35,start:75,hold:distance(p,foot(this.otter))>430});
      if(distance(p,goal)<70&&distance(foot(this.otter),goal)<95){this.mark('settled');this.prop('bowl','feeding-bowl',goal,{hidden:false});this.say(this.giver,'这回知道鱼该留给谁了。');}
    }
    this.dirty();
  }
  targets(){
    if(!this.record.objectives.witnessed)return [target(this.watch,'witnessed','在芦苇后观察鱼架')];
    if(!this.record.objectives.found)return [target(foot(this.otter),'found','沿取鱼客人的湿脚印寻找')];
    if(!this.state.choices.home)return [target(this.nest,'settled','决定小客人的安置地点')];
    return [target(this.state.choices.home==='porch'?this.porch:this.bay,'settled','把小客人带到选定地点')];
  }
}

class DividedStone extends SideQuestScene {
  setup(){this.surfaceSetup();}
  surfaceSetup(){
    this.inside=false;this.cave=this.game.riftExploration?.sites.find(site=>site.caveId==='west-maze');
    if(!this.cave)throw new Error('Divided stone requires the authored rock-root cave');
    const p=this.safePoint(add(this.cave,80,105),20,this.cave);
    this.giver=this.actor('giver',p,{kind:'warden',name:this.completed?'归来的探险者':'洞口守望人'});
    this.prop('sign','trail-marker',add(p,35,35),{label:'岩根洞里的呼声',state:this.completed?'done':'ready'});
  }
  handlesDungeon(state){return state?.site?.caveId==='west-maze';}
  onDungeonEnter(state){
    if(!this.handlesDungeon(state))return;this.checkpoint();this.clearFixtures();this.inside=true;this.dungeonState=state;
    this.call=this.safePoint({x:0,y:-50},18);this.latch=this.safePoint({x:545,y:150},18);this.plate=this.safePoint({x:90,y:220},18);this.exit={x:state.entrance.x,y:state.entrance.y-45};this.cache=this.safePoint({x:800,y:170},20);
    this.explorer=this.actor('helper',this.completed?this.exit:this.safePoint({x:0,y:-290},18),{kind:'warden',name:this.completed?'归来的探险者':'被隔开的探险者',speed:280,hidden:this.completed&&this.state.flags.cache});
    this.prop('call','trail-marker',this.call,{label:'隔着石门呼唤'});this.prop('plate','lever',this.plate,{label:'守住机括'});this.prop('latch','lever',this.latch,{label:'内栓'});this.prop('cache','chest',this.cache,{state:this.state.flags.cache?'claimed':'ready'});
    if(this.record.objectives.contact)this.openOriginalGate();this.syncGate();
  }
  onDungeonExit(){this.checkpoint();this.clearFixtures();this.surfaceSetup();}
  syncGate(){if(!this.inside)return;this.gate('cooperation',{x:405,y:20},{x:405,y:200},{open:!!this.record.objectives.latch||this.state.flags.holding&&distance(foot(this.explorer),this.plate)<30,r:8,label:'合作石门'});}
  openOriginalGate(){
    const m=this.dungeonState.mechanisms.find(m=>m.closedLink?.includes(19));if(!m)return;
    m.opened=true;this.dungeonState.terrain.setStructures([],`interior:${m.id}`);this.game.dungeon.vision.invalidate?.();
  }
  actions(){
    if(!this.accepted)return [];
    if(!this.inside)return !this.completed?[this.action('enter',this.cave,'进入岩根洞寻找探险者',()=>this.game.riftExploration.interact(this.cave.id),{description:'使用现有洞穴入口，洞内进度会保留。',range:105})]:[];
    if(this.completed&&this.state.flags.cache)return [];
    const result=[];
    if(!this.record.objectives.contact)result.push(this.action('call',this.call,'呼唤石门另一侧的人',()=>{this.state.flags.called=true;this.say(this.explorer,'我去推这边的绞盘。等门升起，再来接我！');this.changed();return true;},{enabled:!this.state.flags.called}));
    else if(!this.record.objectives.latch)result.push(this.action('direct',foot(this.explorer),'与探险者安排开门',choice=>{this.state.flags.holding=choice==='hold';this.changed();return true;},{choices:[{id:'hold',label:'请你守住机括',description:'他会实际走到机括上，保持东侧石门开启。'},{id:'follow',label:'先跟我移动',description:'离开机括后石门会落下；内侧的门栓仍可使用。'}]}));
    if(this.record.objectives.contact&&!this.record.objectives.latch)result.push(this.action('latch',this.latch,'推开内栓，让石门保持开启',()=>{this.mark('latch');this.state.flags.holding=false;this.syncGate();this.say(this.explorer,'门栓卡住了。这次我们可以一起走！');return true;}));
    if(this.record.objectives.latch&&!this.state.flags.cache)result.push(this.action('cache',this.cache,'一起抬开侧室藏箱',()=>{this.state.flags.cache=true;this.mark('cache');this.props.get('cache').state='claimed';this.game.grantResources({gold:15,crystals:10},'quest:divided-stone:cache');this.changed();return true;},{enabled:distance(foot(this.explorer),this.cache)<120,description:'需要探险者也来到箱边。这件事可以不做。'}));
    return result;
  }
  update(dt){
    if(!this.accepted||!this.inside)return;
    if(this.completed){
      if(!this.explorer.hidden)this.follow(this.explorer,foot(this.game.player),dt,{stop:55,start:120,hold:distance(foot(this.explorer),foot(this.game.player))>500});
      if(this.state.flags.cache&&within(this,this.exit,115)&&distance(foot(this.explorer),this.exit)<140)this.explorer.hidden=true;
      return;
    }
    if(this.state.flags.called&&!this.record.objectives.contact){
      const mechanism=this.dungeonState.mechanisms.find(m=>m.closedLink?.includes(19)),at=mechanism?{x:mechanism.x,y:mechanism.y}:{x:70,y:-345};
      if(this.move(this.explorer,at,dt,{speed:260,stop:22})){this.openOriginalGate();this.mark('contact');this.say(this.explorer,'东侧还有一扇门。我能守住机括，你去推里面的栓。');}
    }else if(this.record.objectives.contact){
      if(this.state.flags.holding&&!this.record.objectives.latch)this.move(this.explorer,this.plate,dt,{speed:260,stop:18});
      else this.follow(this.explorer,foot(this.game.player),dt,{stop:55,start:120,hold:distance(foot(this.explorer),foot(this.game.player))>500});
      this.syncGate();
      if(this.record.objectives.latch&&within(this,this.exit,115)&&distance(foot(this.explorer),this.exit)<140){this.mark('home');this.explorer.hidden=!!this.state.flags.cache;this.say(this.game.player,'人已经到洞口了，这条路也留下了。');}
    }
  }
  targets(){
    if(!this.inside)return [target(this.cave,'contact','进入岩根洞')];
    if(!this.record.objectives.contact)return [target(this.call,'contact','隔着石门呼唤探险者')];
    if(!this.record.objectives.latch)return [target(this.state.flags.holding?this.latch:foot(this.explorer),'latch',this.state.flags.holding?'从东侧推开内栓':'请探险者走到机括上')];
    const helper=distance(foot(this.explorer),foot(this.game.player))>430;
    return [target(helper?foot(this.explorer):this.exit,'home',helper?'回到探险者身边':'与探险者一起回到洞口'),...this.state.flags.cache?[]:[target(this.cache,'cache','可选：一同开启侧室藏箱')]];
  }
}

class CourierRace extends SideQuestScene {
  setup(){
    this.start=this.point('start','14',90,100);this.checks=[this.point('check-one','13',0,0),this.point('check-two','16',0,0),this.point('finish','15',80,60)];
    this.runner=this.actor('giver',this.start,{kind:'warden',name:'林间送信人',speed:285});this.prop('start','finish-post',add(this.start,-40,0),{label:'林路起点'});
    this.checks.forEach((p,i)=>this.prop(`check-${['one','two','three'][i]}`,'checkpoint',p,{label:i===2?'高原终点':`赛程路标 ${i+1}`,state:'ready'}));
    if(this.state.flags.racing){this.state.flags.racing=false;this.state.values.player=0;this.state.values.runner=0;this.placeActor(this.runner,this.start);this.changed();}
  }
  begin(){
    this.state.flags.racing=true;this.state.flags['runner-finished']=false;this.state.flags['player-finished']=false;this.state.values.elapsed=0;this.state.values.player=0;this.state.values.runner=0;for(const [key,prop]of this.props)if(key.startsWith('check-'))prop.state='ready';this.placeActor(this.runner,this.start);this.say(this.runner,'湖西、古木、高原。认准路标，出发！');this.changed();return true;
  }
  actions(){
    if(!this.accepted)return [];
    if(!this.state.flags.racing)return [this.action('start',this.start,this.completed?'再跑一次林路':'准备好了，开始比赛',()=>this.begin(),{description:'可以先勘察路线。胜负都能完成委托，重赛不重复发放奖励。'})];
    if(this.state.flags['player-finished']&&this.state.flags['runner-finished'])return [this.action('result',foot(this.runner),'在终点交换成绩',()=>{
      const won=this.state.values['player-time']<=this.state.values['runner-time'];
      if(won&&!this.state.flags['first-win']){this.state.flags['first-win']=true;this.game.grantResources({gold:15},'quest:courier-race:first-win');}
      this.state.values.best=this.state.values.best?Math.min(this.state.values.best,this.state.values['player-time']):this.state.values['player-time'];
      this.state.flags.racing=false;this.mark('course');this.mark('result');this.say(this.runner,won?'这次是你先到。下趟送信，我得把近路记牢。':'你也走完了。先认路，再比快，咱们随时能重跑。');this.changed();return true;
    })];
    return [this.action('restart',this.start,'重新开始本次比赛',()=>this.begin(),{description:'返回起点可以重新开始，不影响已经拿到的奖励。'})];
  }
  onDeactivate(){if(this.state.flags.racing){this.state.flags.racing=false;this.changed();}}
  update(dt){
    if(!this.accepted||!this.state.flags.racing)return;
    this.state.values.elapsed=(this.state.values.elapsed||0)+dt;
    const ri=this.state.values.runner||0,pi=this.state.values.player||0;
    if(ri<this.checks.length&&this.move(this.runner,this.checks[ri],dt,{speed:285,stop:36})){this.state.values.runner=ri+1;if(ri===2){this.state.flags['runner-finished']=true;this.state.values['runner-time']=this.state.values.elapsed;}this.changed();}
    if(pi<this.checks.length&&within(this,this.checks[pi],85)){this.state.values.player=pi+1;this.props.get(`check-${['one','two','three'][pi]}`).state='done';if(pi===2){this.state.flags['player-finished']=true;this.state.values['player-time']=this.state.values.elapsed;}this.changed();}
    this.dirty();
  }
  targets(){if(!this.state.flags.racing)return [target(this.start,'course','主动开始，或先勘察三个路标')];const i=this.state.values.player||0;return [target(i<3?this.checks[i]:this.checks[2],i<3?'course':'result',i<3?`赛程 ${i+1}/3 · 按路标前进`:this.state.flags['runner-finished']?'在终点与送信人碰面':'等待送信人到达终点')];}
}

class LastRollcall extends SideQuestScene {
  setup(){
    this.c=this.point('main','10',-40,0,220);this.side=this.safePoint(add(this.c,330,150),25,this.c);this.spawn=this.safePoint(add(this.c,300,-240),30,this.c);
    this.giver=this.actor('giver',this.point('giver','10',-250,180),{kind:'elder',name:'溺钟守望人'});
    this.prop('main','bell',this.c,{label:'溺钟'});this.prop('side','bell',this.side,{label:'远处的小钟'});this.prop('stone','memorial',add(this.c,-130,100),{state:this.completed?'named':'blank'});
    for(const [i,x,y] of [[0,-80,-100],[1,90,-100],[2,0,115]])this.actor(`soul-${['one','two','three'][i]}`,this.safePoint(add(this.c,x,y),15,this.c),{kind:i===1?'warden':'elder',name:['背篓的亡魂','断桨的亡魂','铜扣的亡魂'][i],sideQuestGhost:true,hidden:!this.record.objectives.summoned||this.completed});
  }
  ring(side){this.state.choices.bell=side?'side':'main';this.state.values.lure=16;this.props.get(side?'side':'main').state='active';this.changed();return true;}
  actions(){
    if(!this.accepted||this.completed)return [];
    const result=[this.action('main',this.c,this.record.objectives.summoned?'再次敲响主钟':'敲响主钟，召来亡魂',()=>{
      this.spawnGroup('listeners',this.spawn,['boglurker','brute','boglurker'],{hp:110,damage:10,speed:180,xp:5,spread:70});this.mark('summoned');for(const [key,a] of this.actors)if(key.startsWith('soul-'))a.hidden=false;return this.ring(false);
    }),this.action('side',this.side,'敲响小钟，引开怪物',()=>{this.state.flags['side-used']=true;return this.ring(true);},{description:'怪物会沿实际道路走向钟声，靠得太近仍会惊动它们。'})];
    if(this.record.objectives.summoned)for(const [i,key] of ['one','two','three'].entries())if(!this.state.flags[`name-${key}`]){
      const actor=this.actors.get(`soul-${key}`),safe=!livingNear(this,foot(actor),130);
      result.push(this.action(`name-${key}`,foot(actor),safe?`辨认${actor.name}的记号`:'附近怪物正在逼近',()=>{this.state.flags[`name-${key}`]=true;this.say(actor,['把我的名字留在桥边，我叫阿蘅。','渡船没有回来，但请记得撑船的岑伯。','小铜扣是我缝的。我叫绣娘。'][i]);if(['one','two','three'].every(k=>this.state.flags[`name-${k}`]))this.mark('names');this.changed();return true;},{enabled:safe}));
    }
    if(this.record.objectives.names)result.push(this.action('memorial',foot(this.giver),'将三个名字交给守钟人',()=>{this.mark('memorial');this.props.get('stone').state='named';for(const [key,a]of this.actors)if(key.startsWith('soul-'))a.hidden=true;this.say(this.giver,'这一次，每个人都应到了。');return true;}));
    return result;
  }
  beforeEnemy(enemy,dt){
    if(enemy.eventId!==`quest:${this.id}:listeners`)return false;
    const destination=this.completed?this.spawn:this.state.choices.bell==='side'?this.side:this.c;
    if(this.completed||(this.state.values.lure||0)>0&&enemy.hp===enemy.maxHp&&distance(foot(enemy),foot(this.game.player))>80){
      enemy.guardActive=false;enemy.cast=null;enemy.specialist=null;this.game._moveEnemy(enemy,dt,destination);
      if(this.completed&&distance(foot(enemy),destination)<40&&distance(foot(enemy),foot(this.game.player))>260)this.game.enemies=this.game.enemies.filter(e=>e!==enemy);
      return true;
    }
    enemy.guardActive=true;return false;
  }
  update(dt){if(!this.accepted)return;if((this.state.values.lure||0)>0){this.state.values.lure=Math.max(0,this.state.values.lure-dt);this.dirty();}for(const key of ['main','side'])this.props.get(key).state=this.state.choices.bell===key&&this.state.values.lure>0?'active':'ready';}
  targets(){if(!this.record.objectives.summoned)return [target(this.c,'summoned','敲响遗台主钟')];if(!this.record.objectives.names)return ['one','two','three'].filter(key=>!this.state.flags[`name-${key}`]).map(key=>target(foot(this.actors.get(`soul-${key}`)),'names','守住遗台，或用远钟引开怪物'));return [target(foot(this.giver),'memorial','让守钟人补全残碑')];}
}

class MoonMoss extends SideQuestScene {
  setup(){
    this.c=this.point('path','16',-150,-35,30);this.giver=this.actor('giver',this.point('giver','16',-140,130),{kind:'elder',name:'采苔人'});
    this.flower=this.safePoint(add(this.c,110,-165),20,this.c);this.lair=this.safePoint(add(this.c,220,-20),25,this.c);
    this.prop('flower','moon-moss',this.flower,{state:this.record.objectives.moss?'harvested':'blooming'});this.prop('window','moon-moss',add(foot(this.giver),-45,-15),{state:'blooming',hidden:!this.completed});
    this.stones=[[-170,50],[-180,-65],[-95,-130],[30,-170],[120,-165]].map(([x,y],i)=>this.safePoint(add(this.c,x,y),16,this.c));
    this.stones.forEach((p,i)=>this.prop(`stone-${['one','two','three','four','five'][i]}`,'stepping-stone',p,{state:'dark'}));
    // This low root ridge is always visible and collidable; only the path
    // marks change with the lantern. Darkness never creates invisible walls.
    this.gate('root-ridge',add(this.c,-65,-5),add(this.c,110,-5),{r:10,kind:'root-barrier',label:'低矮盘根'});
  }
  actions(){
    if(!this.accepted||this.completed)return [];
    if(!this.record.objectives.lantern)return [this.action('borrow',foot(this.giver),'借用采苔人的提灯',()=>{this.mark('lantern');this.state.flags.lit=false;this.spawnGroup('sleepers',this.lair,['rootbinder','boglurker'],{hp:135,damage:11,speed:180,xp:6,spread:45,awake:false});this.say(this.giver,'亮灯看路，熄灯避兽。它们就在右手那条近路旁。');this.changed();return true;})];
    if(!this.record.objectives.moss&&within(this,this.flower,90))return [this.action('collect',this.flower,'连根取下一簇活月苔',()=>{this.mark('moss');this.props.get('flower').state='harvested';this.say(this.game.player,'根还完整，带回去就能养活。');return true;},{enabled:!livingNear(this,this.flower,120),description:'守苔兽逼近时无法安稳采集，可以引开或击退它们。'})];
    if(this.record.objectives.moss&&within(this,foot(this.giver),92))return [this.action('gift',foot(this.giver),'把活月苔交给采苔人',()=>{this.mark('gift');this.state.flags.lit=false;this.props.get('window').hidden=false;this.say(this.giver,'把椅子搬到窗边，她今天就能看见了。');this.changed();return true;})];
    return [this.action('lantern',foot(this.game.player),this.state.flags.lit?'熄灭提灯':'点亮提灯',()=>{this.state.flags.lit=!this.state.flags.lit;this.changed();return true;},{portable:true,priority:-10,description:'亮灯显出落脚石，也会唤醒附近守苔兽；熄灯后可以绕外侧小径。'})];
  }
  canTarget(enemy){return enemy.eventId!==`quest:${this.id}:sleepers`||enemy.guardActive===true;}
  beforeEnemy(enemy){
    if(enemy.eventId!==`quest:${this.id}:sleepers`)return false;
    const near=distance(foot(enemy),foot(this.game.player)),wake=this.state.flags.lit&&near<320||near<110||enemy.hp<enemy.maxHp;
    if(wake)enemy.guardActive=true;
    else if(near>450)enemy.guardActive=false;
    if(enemy.guardActive===false){enemy.moving=false;enemy.cast=null;enemy.specialist=null;return true;}return false;
  }
  update(){
    const lit=this.record.objectives.lantern&&!this.completed&&this.state.flags.lit;
    for(const [key,prop]of this.props)if(key.startsWith('stone-'))prop.state=lit?'lit':'dark';
    if(this.record.objectives.lantern&&!this.completed)this.prop('carried-lamp','lantern',add(foot(this.game.player),18,-6),{state:lit?'lit':'dark',dynamic:true,castsShadow:false});
    else if(this.props.has('carried-lamp'))this.props.get('carried-lamp').hidden=true;
  }
  targets(){if(!this.record.objectives.lantern)return [target(foot(this.giver),'lantern','借用提灯')];return this.record.objectives.moss?[target(foot(this.giver),'gift','把活月苔带回采苔人身边')]:[target(this.flower,'moss','穿过盘根小径，采集活月苔')];}
}

const classes={'bow-rest':BowRest,'fish-thief':FishThief,'divided-stone':DividedStone,'courier-race':CourierRace,'last-rollcall':LastRollcall,'moon-moss':MoonMoss};
export function createScene(host,definition){const Scene=classes[definition.id];return Scene?new Scene(host,definition):null;}
export { DEFINITIONS };
