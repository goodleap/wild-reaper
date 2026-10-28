import { SideQuestScene, foot, distance } from './base.js';
import { getConfigSection } from '../content-config.js';
import { obstacleImpact } from '../combat-attacks.js';
import { BOAR_RULES } from '../enemies/boar.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const owns=(scene,e,key)=>!!e?.eventId&&(key?e.eventId===`quest:${scene.id}:${key}`:e.eventId.startsWith(`quest:${scene.id}:`));
const target=(p,objectiveId,label)=>({...p,objectiveId,label});
const options=entries=>entries.map(([id,label,description])=>({id,label,description}));

class FrontierScene extends SideQuestScene {
  near(p,r=100){return distance(foot(this.game.player),p)<=r;}
  local(key,origin,dx,dy,r=20){const cache=`local-${key}`;if(!this.points.has(cache))this.points.set(cache,this.safePoint({x:origin.x+dx,y:origin.y+dy},r,origin));return this.points.get(cache);}
  done(key){return !!this.record.objectives[key];}
  flag(key,value=true){if(this.state.flags[key]===value)return;this.state.flags[key]=value;this.changed();}
  itemPrice(id,multiplier=1){return Math.max(1,Math.ceil((getConfigSection('economy').shop.items.find(item=>item.id===id)?.price||10)*multiplier));}
  supplyAction(key,p,ids,multiplier=1){
    return this.action(key,p,'查看摊位补给',id=>this.buySupply(id,this.itemPrice(id,multiplier)),{
      description:'购买后放入角色补给栏；携带数量已满时不能购买。',choices:ids.map(id=>{
        const item=getConfigSection('economy').shop.items.find(item=>item.id===id),price=this.itemPrice(id,multiplier);
        return {id,label:`${item.name} · ${price} 金币`,disabled:!this.canBuySupply(id,price)};
      })});
  }
}

class MountainRoutes extends FrontierScene {
  setup(){
    this.start=this.point('start','06',80,80);this.end=this.point('end','08',60,80);
    this.routes={short:[this.point('short-a','07',0,120),this.end],long:[this.point('long-a','01',90,-70),this.point('long-b','02',70,0),this.point('long-c','03',80,70),this.end]};
    this.guide=this.actor('giver',this.start,{kind:'elder',name:'山路向导',speed:295});
    this.sign=this.prop('route-sign','route-sign',this.local('sign',this.start,55,25),{label:'试路集合处',state:'ready'});
    this.stop=this.point('merchant-stop','07',110,-110);
    this.merchant=this.actor('merchant',this.stop,{kind:'merchant',name:'候行商人',hidden:!this.completed});
    if(this.completed)this._settled();
  }
  _settled(){
    this.guide.moving=false;
    const route=this.state.choices.recommend||'long',p=route==='short'?this.stop:this.routes.long[1];
    this.sign.label=route==='short'?'商队近路 · 隘口有兽群':'旧驿稳路 · 适合慢行';
    this.merchant.hidden=false;
    if(!this.state.flags['merchant-placed']){this.placeActor(this.merchant,p);this.state.flags['merchant-placed']=true;this.changed();}
    this.prop('trade-camp','camp',p,{label:route==='short'?'采石场停靠点':'白松旧驿停靠点',state:'ready'});
  }
  _start(route){
    if(this.state.choices.route||this.completed)return false;
    this.state.choices.route=route;this.state.values.leg=0;this.state.flags.returning=false;
    if(route==='short'&&!this.done('short'))this.spawnGroup('short-pass',this.routes.short[0],['boar','beetle'],{spread:130,damage:7,xp:3});
    this.say(this.guide,route==='short'?'采石场这条近，我会在岔口等你。':'旧驿路绕得远，先看看路面值不值得。');this.changed();return true;
  }
  update(dt){
    if(!this.accepted||this.completed)return;
    const route=this.state.choices.route;if(!route)return;
    if(distance(foot(this.guide),foot(this.game.player))>230){this.guide.moving=false;return;}
    if(this.state.flags.returning){
      this.follow(this.guide,foot(this.game.player),dt,{speed:295,stop:65,start:115});
      if(this.near(this.start,120)&&distance(foot(this.guide),this.start)<150){delete this.state.choices.route;this.state.flags.returning=false;this.changed();}
      return;
    }
    const path=this.routes[route],leg=Math.min(path.length-1,this.state.values.leg||0),goal=path[leg];
    if(this.move(this.guide,goal,dt,{speed:295,stop:25,mode:`trial-${route}`} )&&this.near(goal,150)){
      this.state.values.leg=leg+1;this.changed();
      if(leg+1===path.length){this.mark(route);this.state.flags.returning=true;this.say(this.guide,'这段我记下了。一起回集合处，再定下一步。');this.changed();}
    }
  }
  actions(){
    if(!this.accepted)return [];
    if(this.completed)return [this.supplyAction('merchant',foot(this.merchant),['heal','magnet'],this.state.choices.recommend==='short'?.9:1)];
    if(this.state.choices.route)return [];
    if(this.done('short')&&this.done('long'))return [this.action('recommend',foot(this.guide),'给商队推荐路线',choice=>{
      this.state.choices.recommend=choice;this.changed();this.mark('recommended');this._settled();return true;
    },{choices:options([['short','近路设站','停靠采石场，补给略便宜，行路仍需注意兽群。'],['long','旧驿设站','沿西侧旧驿路停靠，留下清楚的稳路标记。']])})];
    return [this.action('choose-route',foot(this.guide),'出发试路',choice=>this._start(choice),{choices:[
      {id:'short',label:this.done('short')?'近路已走过':'走采石场近路',disabled:this.done('short')},
      {id:'long',label:this.done('long')?'旧驿路已走过':'走西侧旧驿路',disabled:this.done('long')}
    ]})];
  }
  targets(){
    if(this.completed)return [];
    const route=this.state.choices.route;
    if(!route)return [target(foot(this.guide),this.done('short')&&this.done('long')?'recommended':!this.done('short')?'short':'long','与向导商量下一段路线')];
    if(distance(foot(this.guide),foot(this.game.player))>230)return [target(foot(this.guide),route,'向导在后面等你')];
    return [target(this.state.flags.returning?this.start:this.routes[route][Math.min(this.routes[route].length-1,this.state.values.leg||0)],route,this.state.flags.returning?'与向导返回集合处':'沿实路陪向导前行')];
  }
}

class SummitDuel extends FrontierScene {
  setup(){
    this.narrow=this.point('narrow','14',40,80);this.wide=this.point('wide','15',0,100);
    this.spear=this.actor('giver',this.local('spear',this.narrow,0,110),{kind:'warden',name:'接引人·阿绫'});
    this.ranged=this.actor('ranged',this.local('ranged',this.wide,0,150),{kind:'warden',name:'接引人·云川'});
    for(const [name,p] of [['spear',this.narrow],['ranged',this.wide]])this.prop(`practice-${name}`,'banner',p,{label:name==='spear'?'鹰脊窄台 · 点到为止':'峰顶宽场 · 点到为止',radius:name==='spear'?175:245,state:'ready'});
    this._restorePending=true;
  }
  _start(kind){
    if(this._restorePending)this.update(0);
    if(this.state.choices.active)return false;
    this._clearAttempt();this.state.choices.active=kind;this.state.values['duel-damage']=0;this.state.values['duel-time']=0;
    const center=kind==='spear'?this.narrow:this.wide;
    const spawn=this.local(`duel-spawn-${kind}`,center,0,-95);
    const group=this.spawnGroup('practice',spawn,[kind==='spear'?'royallancer':'royalarbalist'],{spread:0,hp:kind==='spear'?300:250,damage:kind==='spear'?8:7,speed:200,xp:0});
    for(const e of group){e.summoned=true;e.name=kind==='spear'?'阿绫 · 切磋':'云川 · 切磋';e.guardActive=true;}
    (kind==='spear'?this.spear:this.ranged).hidden=true;
    if(kind==='spear')for(const dx of [-115,115])this.gate(dx<0?'rail-left':'rail-right',{x:center.x+dx,y:center.y-165},{x:center.x+dx,y:center.y+165},{r:7,kind:'gate',label:'窄台护栏'});
    this.changed();return true;
  }
  _clearAttempt(){
    const enemies=this.game.enemies.filter(e=>owns(this,e,'practice'));
    for(const e of enemies){this.game.abilities?.cancelCaster?.(e);e.hp=0;}
    const ids=new Set(enemies.map(e=>e.id));
    this.game.enemyBullets=this.game.enemyBullets.filter(b=>!ids.has(b.ownerId));
    if(enemies.length||this.state.flags['spawn-practice'])this.clearGroup('practice',{reset:true});
    this.removeGate('rail-left');this.removeGate('rail-right');
  }
  _finish(won,message){
    const kind=this.state.choices.active;if(!kind)return;
    this._clearAttempt();this.spear.hidden=this.ranged.hidden=false;
    this.game.player.hp=Math.min(this.game.player.maxHp,this.game.player.hp+(this.state.values['duel-damage']||0));
    this.game.player.invuln=Math.max(this.game.player.invuln||0,1.5);
    delete this.state.choices.active;this.state.values['duel-damage']=0;this.changed();
    if(won)this.mark(kind);
    this.say(kind==='spear'?this.spear:this.ranged,message|| (won?'身手不错。下次想练，随时再来。':'先收招。喘口气，想再试就叫我。'));
  }
  update(dt){
    if(this._restorePending){this._restorePending=false;if(this.state.choices.active)this._finish(false,'上次的切磋先收场了，可以重新开始。');else this._clearAttempt();}
    const kind=this.state.choices.active;if(!kind)return;
    const center=kind==='spear'?this.narrow:this.wide;
    if(distance(foot(this.game.player),center)>(kind==='spear'?280:390)){this._finish(false,'已退出切磋场，随时可以重新开始。');return;}
    this.state.values['duel-time']=(this.state.values['duel-time']||0)+dt;this.dirty();
    if(!this.alive('practice').length)this._finish(false);
  }
  beforeEnemyDamage(enemy,amount){
    if(!owns(this,enemy,'practice'))return amount;
    if(!this.state.choices.active)return 0;
    if(amount>=enemy.hp-1){this._finish(true);return 0;}return amount;
  }
  beforePlayerDamage(amount,origin){
    if(!this.state.choices.active)return amount;
    const enemy=owns(this,origin,'practice')?origin:this.game.enemies.find(e=>e.id===origin?.ownerId&&owns(this,e,'practice'));
    if(!enemy)return amount;
    if(amount>=this.game.player.hp-1){this._finish(false);return 0;}
    this.state.values['duel-damage']=(this.state.values['duel-damage']||0)+amount;this.dirty();return amount;
  }
  onDeactivate(){if(this.state.choices.active)this._finish(false);else this._clearAttempt();}
  actions(){
    if(!this.accepted)return [];
    if(this.state.choices.active)return [this.action('stop',foot(this.game.player),'结束切磋',()=>{this._finish(false);return true;},{portable:true,priority:-10,description:'点到为止，之后可以重新开始。'})];
    return [['spear',this.spear],['ranged',this.ranged]].map(([kind,actor])=>this.action(`start-${kind}`,foot(actor),this.done(kind)?'再练一场':'开始切磋',()=>this._start(kind),{description:kind==='spear'?'窄台上留心长枪蓄力，离开场地会中止。':'宽场上躲开弩箭，再找机会靠近。重复练习没有额外通关报酬。'}));
  }
  targets(){return this.completed?[]:[target(this.done('spear')?foot(this.ranged):foot(this.spear),this.done('spear')?'ranged':'spear',this.state.choices.active?'留意蓄力与出手空当':'找到接引人，主动开始切磋')];}
}

class BrazierPath extends FrontierScene {
  setup(){
    this.start=this.point('start','12',-120,100);this.end=this.point('end','12',510,60);
    this.routes={short:[this.local('s1',this.start,180,0),this.local('s2',this.start,380,0),this.end],
      sheltered:[this.local('l1',this.start,30,-190),this.local('l2',this.start,240,-230),this.local('l3',this.start,470,-150),this.end]};
    this.giver=this.actor('giver',this.start,{kind:'warden',name:'雪路照料人'});
    this.wounded=[this.actor('wounded-a',this.local('wa',this.start,-35,-30),{kind:'warden',name:'受伤的探路人',speed:180}),this.actor('wounded-b',this.local('wb',this.start,35,-30),{kind:'elder',name:'冻伤的测绘者',speed:165})];
    this.prop('cold-road','cold',this.local('cold',this.start,260,-20),{radius:370,label:'寒风路段 · 火盆附近较暖',state:'idle'});
    this.prop('start-fire','brazier',this.start,{state:'lit',radius:115,label:'集合火盆'});
    this._fixtures();
  }
  _fixtures(){
    const route=this.state.choices.route;if(!route)return;
    this.routes[route].forEach((p,i)=>this.prop(`fire-${i}`,'brazier',p,{state:this.state.flags[`lit-${i}`]?'lit':'unlit',radius:120,label:`暖点 ${i+1}`}));
    if(this.completed){this.prop('warm-camp','camp',this.end,{label:'雪路暖营',state:'ready'});this.setService('warm-rest',this.end,{name:'暖营照料',healing:.25,cooldown:20});}
  }
  _choose(route){
    if(this.state.choices.route)return false;this.state.choices.route=route;this._fixtures();
    if(route==='short')this.spawnGroup('snow-path',this.routes.short[1],['beetle','boar'],{spread:90,damage:6,xp:3});
    this.say(this.giver,route==='short'?'先点火，兽径上的看守也得留意。':'背风处绕一点，两位伤员走得稳。');this.changed();return true;
  }
  _warm(point){
    if(distance(point,this.start)<120)return true;
    const route=this.state.choices.route;return !!route&&this.routes[route].some((p,i)=>this.state.flags[`lit-${i}`]&&distance(point,p)<125);
  }
  update(dt){
    if(!this.accepted||!this.state.choices.route)return;
    const path=this.routes[this.state.choices.route];
    if(this.completed)return;
    const player=foot(this.game.player),coldCenter={x:this.start.x+260,y:this.start.y-20};
    if(distance(player,coldCenter)<400&&!this._warm(player)){
      this.state.values.cold=(this.state.values.cold||0)+dt;
      if(this.state.values.cold>=2){this.state.values.cold=0;this.game._hurtPlayer(3,{sideQuestCold:this.id,x:player.x,y:player.y});}
    }else this.state.values.cold=0;
    this.wounded.forEach((actor,index)=>{
      const key=`walk-${index}`,leg=Math.min(path.length,this.state.values[key]||0);
      if(leg>=path.length||!this.state.flags[`lit-${leg}`]||distance(foot(actor),player)>320){actor.moving=false;return;}
      const destination=this.local(`warm-${this.state.choices.route}-${leg}-${index}`,path[leg],0,index?18:-18,actor.r);
      if(this.move(actor,destination,dt,{speed:actor.speed,stop:12,mode:`warm-${leg}`})){this.state.values[key]=leg+1;this.changed();}
    });
    if(path.every((_,i)=>this.state.flags[`lit-${i}`]))this.mark('prepared');
    if(this.wounded.every(actor=>distance(foot(actor),this.end)<75)){for(const actor of this.wounded)actor.moving=false;this.mark('rescued');this._fixtures();}
    this.dirty();
  }
  actions(){
    if(!this.accepted||this.completed)return [];
    if(!this.state.choices.route)return [this.action('route',this.start,'选择接应路线',route=>this._choose(route),{choices:options([['short','沿兽径近路','三处暖点，途中有野兽。'],['sheltered','从背风处绕行','四处暖点，避开兽群。']])})];
    return this.routes[this.state.choices.route].flatMap((p,i)=>this.state.flags[`lit-${i}`]?[]:[this.action(`light-${i}`,p,'点亮火盆',()=>{this.flag(`lit-${i}`);this._fixtures();return true;},{description:'两位探路人只向已经点亮的下一个暖点前进，走远了会等待。'})]);
  }
  targets(){
    if(this.completed)return [];const route=this.state.choices.route;if(!route)return [target(this.start,'prepared','与照料人选择路线')];
    const path=this.routes[route],unlit=path.findIndex((_,i)=>!this.state.flags[`lit-${i}`]);
    if(unlit>=0)return [target(path[unlit],'prepared','点亮下一个暖点')];
    const waiting=this.wounded.find(actor=>distance(foot(actor),foot(this.game.player))>320);
    return [target(waiting?foot(waiting):this.end,'rescued',waiting?'伤员留在后面，回去接应':'与两位探路人一起抵达暖营')];
  }
}

class IceSignal extends FrontierScene {
  setup(){
    this.start=this.point('start','13',-180,60);this.giver=this.actor('giver',this.start,{kind:'elder',name:'守夜人'});
    this.horns=[this.local('horn0',this.start,70,-80),this.local('horn1',this.start,280,-90),this.local('horn2',this.start,350,120)];
    this.echo=this.local('echo',this.start,120,260);this.outpost=this.point('outpost','15',90,60);
    this.gatePoint={x:this.outpost.x,y:this.outpost.y+85};
    this.watchers=[this.actor('watcher-a',this.local('watch-a',this.outpost,-30,0),{kind:'warden',name:'旧哨值守者',hidden:!this.done('relay')}),this.actor('watcher-b',this.local('watch-b',this.outpost,30,-20),{kind:'warden',name:'失联探路人',hidden:!this.done('relay')})];
    this._fixtures();
  }
  _fixtures(){
    for(let i=0;i<3;i++){
      const next=this.horns[i+1]||this.echo,correct=Math.atan2(next.y-this.horns[i].y,next.x-this.horns[i].x),turn=this.state.values[`turn-${i}`]??[0,3,1][i],angle=correct+(turn-2)*Math.PI/2;
      this.prop(`horn-${i}`,'horn',this.horns[i],{angle,label:`中继号管 ${i+1}`,state:this.state.flags[`link-${i}`]?'lit':'idle'});
      this.prop(`signal-${i}`,'beam',this.horns[i],{angle,length:distance(this.horns[i],next),linked:!!this.state.flags[`link-${i}`],state:this.state.flags[`link-${i}`]?'lit':'idle',color:'#b7dedc'});
      this.prop(`vibration-${i}`,'marker',next,{state:this.state.flags[`link-${i}`]?'lit':'idle',radius:20,label:i===2?'哨所方位信号':'振动的号口'});
    }
    const p=this.outpost;
    this.gate('outpost-left',{x:p.x-100,y:p.y-85},{x:p.x-100,y:p.y+85},{kind:'gate',r:8,label:'哨所旧墙'});
    this.gate('outpost-back',{x:p.x-100,y:p.y-85},{x:p.x+100,y:p.y-85},{kind:'gate',r:8,label:'哨所旧墙'});
    this.gate('outpost-right',{x:p.x+100,y:p.y-85},{x:p.x+100,y:p.y+85},{kind:'gate',r:8,label:'哨所旧墙'});
    this.gate('outpost-door',{x:p.x-100,y:p.y+85},{x:p.x+100,y:p.y+85},{kind:'gate',open:!!this.state.flags.open,r:8,label:'旧哨所门闸'});
    if(this.completed){this.prop('outpost-camp','camp',this.outpost,{label:'重新值守的雪哨',state:'ready'});this.prop('outpost-sign','route-sign',{x:this.gatePoint.x+45,y:this.gatePoint.y+65},{label:'雪哨补给 · 南门畅通',state:'ready'});this.setService('watch-rest',this.gatePoint,{name:'雪哨休息',healing:.25,cooldown:20});}
  }
  _relay(){
    let upstream=true;
    for(let i=0;i<3;i++){
      const next=this.horns[i+1]||this.echo,good=upstream&&this.state.values[`turn-${i}`]===2&&!this.game.terrain.firstBlocker(this.horns[i].x,this.horns[i].y,next.x,next.y,0,'sight');
      this.state.flags[`link-${i}`]=good;upstream=good;
    }
    if(upstream){this.mark('relay');for(const actor of this.watchers)actor.hidden=false;this.say(this.giver,'三声长号，是守望遗址的旧哨！门闸在南面。');}
    this.changed();this._fixtures();
  }
  update(dt){
    if(!this.accepted)return;
    if(this.state.flags.open&&!this.completed){
      for(let i=0;i<this.watchers.length;i++)this.move(this.watchers[i],{x:this.outpost.x+(i?45:-45),y:this.outpost.y+145},dt,{speed:235,stop:18,mode:'leave-outpost'});
      if(this.watchers.every(actor=>foot(actor).y>this.outpost.y+115)){for(const actor of this.watchers)actor.moving=false;this.mark('rescued');this._fixtures();}
    }
  }
  actions(){
    if(!this.accepted||this.completed)return [];
    if(!this.done('relay'))return this.horns.map((p,i)=>this.action(`rotate-${i}`,p,`调整中继号管 ${i+1}`,()=>{this.state.values[`turn-${i}`]=((this.state.values[`turn-${i}`]??[0,3,1][i])+1)%4;this._relay();return true;},{description:'号口朝向下一处振动标记时可以接通；浅色线表示当前方向，无需开启声音。'}));
    return this.state.flags.open?[]:[this.action('open-outpost',{x:this.gatePoint.x,y:this.gatePoint.y+50},'拉开旧哨所门闸',()=>{this.flag('open');this._fixtures();return true;},{description:'让两位值守者实际走出哨所。'})];
  }
  targets(){
    if(this.completed)return [];if(!this.done('relay')){const i=[0,1,2].find(i=>!this.state.flags[`link-${i}`])??0;return [target(this.horns[i],'relay','沿振动标记接通号管')];}
    return [target({x:this.gatePoint.x,y:this.gatePoint.y+50},'rescued',this.state.flags.open?'等值守者走出门闸':'前往守望遗址，打开南面的旧门闸')];
  }
}

class FlawedCastings extends FrontierScene {
  setup(){
    this.origin=this.point('origin','14',-160,130);this.giver=this.actor('giver',this.origin,{kind:'warden',name:'铸工·石锤'});
    this.centers={};this.stations={};
    const area=this.terrain.island.layout.areas.find(a=>a.id==='14').center;
    // A station is placed as one connected footprint before its solid samples
    // are registered. This keeps the launch lane and interaction point usable.
    for(const [kind,dx,dy] of [['bolt',120,50],['charge',120,-290],['impact',-400,-270]]){
      let chosen;
      for(const radius of [0,100,200,300,420,560]){
        for(let i=0;i<(radius?24:1);i++){
          const p={x:area.x+dx+Math.cos(i*Math.PI/12)*radius,y:area.y+dy+Math.sin(i*Math.PI/12)*radius};
          if(Object.values(this.centers).some(other=>Math.abs(other.x-p.x)<450&&Math.abs(other.y-p.y)<230))continue;
          const free=[-215,-150,-75,0,90,160].every(x=>[-85,0,100].every(y=>this.terrain.isFree(p.x+x,p.y+y,25)&&this.game.environment?.isHazardFree?.(p.x+x,p.y+y,29)!==false));
          if(free){chosen=p;break;}
        }
        if(chosen)break;
      }
      if(!chosen)throw new Error(`No clear casting lane: ${kind}`);
      this.centers[kind]=chosen;
      this.stations[kind]={launch:{x:chosen.x-190,y:chosen.y},control:{x:chosen.x+90,y:chosen.y},action:{x:chosen.x+125,y:chosen.y+105}};
      this.prop(`trial-${kind}`,'signpost',this.stations[kind].action,{label:{bolt:'实弹试场',charge:'冲撞试场',impact:'敲击试场'}[kind],state:'ready'});
    }
    for(const kind of Object.keys(this.centers))this._cover(kind);
    this._fixtures();this._restorePending=true;
  }
  _fixtures(){
    if(this.completed)this.prop('workshop-stall','stall',this.origin,{label:this.state.choices.settlement==='recall'?'回收修整摊':'公开验收摊',state:'ready'});
  }
  _cover(kind){
    const p=this.centers[kind],hits=this.state.values[`hits-${kind}`]||0,broken=hits>=2,control=this.stations[kind].control;
    this.gate(`cover-${kind}`,{x:p.x,y:p.y-65},{x:p.x,y:p.y+65},{r:10,open:broken,kind:'casting',label:broken?'薄料样件 · 已裂穿':hits?'薄料样件 · 已开裂':'薄料样件'}).state=broken?'broken':hits?'cracked':'intact';
    this.gate(`control-${kind}`,{x:control.x,y:control.y-65},{x:control.x,y:control.y+65},{r:10,kind:'casting',label:(this.state.values[`control-${kind}`]||0)>0?'足料样件 · 受击仍完好':'足料样件'}).state='intact';
  }
  _target(kind){return (this.state.values[`hits-${kind}`]||0)<2?this.centers[kind]:this.stations[kind].control;}
  _hitCover(kind){
    if(this.state.choices.active!==kind)return;
    const weak=(this.state.values[`hits-${kind}`]||0)<2,key=weak?`hits-${kind}`:`control-${kind}`,p=this._target(kind);
    this.state.values[key]=(this.state.values[key]||0)+1;this._cover(kind);this.changed();
    this.game._effect?.(p.x,p.y,'hit',.3,30,weak?'#e7be83':'#b5c7bd');
    if(!weak&&this.state.values[key]>=2){this.mark(kind);this._endTest();this.say(this.giver,'同样两次冲击，薄料裂穿了，足料仍能挡住。这个裂口留作证据。');}
  }
  _start(kind){
    if(this._restorePending)this.update(0);
    if(this.state.choices.active||this.done(kind))return false;
    this.clearGroup('test',{reset:true});this.state.choices.active=kind;this.state.values[`hits-${kind}`]=0;this.state.values[`control-${kind}`]=0;this.state.values.windup=1.6;this.state.flags.returning=false;
    const type={bolt:'royalarbalist',charge:'boar',impact:'brute'}[kind];
    const group=this.spawnGroup('test',this.stations[kind].launch,[type],{spread:0,hp:500,damage:6,speed:180,xp:0});
    for(const e of group){e.summoned=true;e.name=kind==='charge'?'受训冲撞兽':'试场陪练';e.guardActive=true;e.specialist={phase:'idle',noContact:true};}
    this._cover(kind);this.changed();return true;
  }
  _endTest(){
    const enemies=this.game.enemies.filter(e=>owns(this,e,'test'));if(!enemies.length&&!this.state.choices.active&&!this.state.flags['spawn-test'])return;
    const ids=new Set(enemies.map(e=>e.id));for(const e of enemies){this.game.abilities?.cancelCaster?.(e);e.hp=0;}
    this.game.enemyBullets=this.game.enemyBullets.filter(b=>!ids.has(b.ownerId));this.clearGroup('test',{reset:true});delete this.state.choices.active;this.changed();
  }
  canTarget(enemy){return !owns(this,enemy,'test');}
  beforeEnemyDamage(enemy,amount){return owns(this,enemy,'test')?0:amount;}
  beforeEnemy(enemy,dt){
    if(!owns(this,enemy,'test'))return false;
    const kind=this.state.choices.active;if(!kind)return true;
    const cover=this._target(kind),p=foot(enemy);
    enemy.moving=false;enemy.specialist={phase:'idle',noContact:true};
    if(kind==='charge'&&this.state.flags.returning){
      enemy.charge=null;
      if(this.move(enemy,this.stations[kind].launch,dt,{speed:180,stop:4})){this.state.flags.returning=false;this.state.values.windup=1.6;this.changed();}
      return true;
    }
    this.state.values.windup=Math.max(0,(this.state.values.windup||0)-dt);this.dirty();
    if(kind==='charge'){
      if(this.state.values.windup>0){enemy.charge={phase:'windup',life:this.state.values.windup,maxLife:1.6,dx:1,dy:0,startX:p.x,startY:p.y,length:300,distance:0};return true;}
      const step=Math.min(BOAR_RULES.speed*dt,Math.max(0,cover.x-p.x-5));
      const impact=obstacleImpact({type:'log',x:cover.x,y:cover.y,r:10,halfLength:65,angle:Math.PI/2},p.x,p.y,step,0,enemy.r);
      if(Number.isFinite(impact)){
        this.game._moveEntity(enemy,step*impact,0);this._hitCover(kind);
        if(this.state.choices.active){this.state.flags.returning=true;enemy.charge=null;this.changed();}
      }else{
        const previous=foot(enemy);this.game._moveEntity(enemy,step,0);enemy.moving=true;enemy.charge={phase:'rush',life:.5,maxLife:.5,dx:1,dy:0};
        const player=foot(this.game.player);if(player.x>=previous.x-enemy.r&&player.x<=foot(enemy).x+enemy.r&&Math.abs(player.y-p.y)<enemy.r+this.game.player.r)this.game._hurtPlayer(6,enemy);
      }
      return true;
    }
    if(this.state.values.windup>0){enemy.specialist={phase:'windup',kind:kind==='bolt'?'royalBolt':'castingStrike',x:p.x,y:p.y,angle:0,reach:300,width:24,life:this.state.values.windup,maxLife:1.6,timer:this.state.values.windup,maxTime:1.6,noContact:true};return true;}
    this.state.values.windup=2.2;
    if(kind==='bolt')this.game.enemyBullets.push({id:++this.game._id,ownerId:enemy.id,type:'royalBolt',x:p.x,y:p.y,r:4,vx:340,vy:0,life:1.5,maxLife:1.5,damage:6});
    else{
      const segment={type:'log',x:cover.x,y:cover.y,r:10,halfLength:65,angle:Math.PI/2};
      if(Number.isFinite(obstacleImpact(segment,p.x,p.y,320,0,8)))this._hitCover(kind);
      const player=foot(this.game.player);if(Math.abs(player.y-p.y)<35&&player.x>p.x&&player.x<cover.x-15)this.game._hurtPlayer(6,enemy);
      this.game._effect?.(cover.x,cover.y,'ring',.25,65,'#ecc49b');
    }
    return true;
  }
  update(dt){
    if(this._restorePending){this._restorePending=false;this._endTest();}
    const kind=this.state.choices.active;if(!kind)return;
    if(!this.near(this.centers[kind],460)){this._endTest();return;}
    if(kind==='bolt'){
      const p=this._target(kind),ids=new Set(this.alive('test').map(e=>e.id));
      for(const bullet of this.game.enemyBullets){
        if(bullet.life<=0||!ids.has(bullet.ownerId))continue;
        const impact=obstacleImpact({type:'log',x:p.x,y:p.y,r:10,halfLength:65,angle:Math.PI/2},bullet.x,bullet.y,bullet.vx*dt,bullet.vy*dt,bullet.r);
        if(Number.isFinite(impact)){bullet.life=0;this._hitCover(kind);break;}
      }
    }
  }
  onDeactivate(){this._endTest();}
  actions(){
    if(!this.accepted)return [];
    if(this.completed)return [this.supplyAction('workshop',foot(this.giver),this.state.choices.settlement==='recall'?['shield','heal']:['shield','fury'],.85)];
    if(this.state.choices.active)return [this.action('stop-test',foot(this.game.player),'停止本轮检验',()=>{this._endTest();return true;},{portable:true,priority:-10})];
    if(['bolt','charge','impact'].every(key=>this.done(key)))return [this.action('settle',foot(this.giver),'处理有问题的铸件',choice=>{
      this.state.choices.settlement=choice;this.mark('settled');this.changed();this._fixtures();return true;
    },{choices:options([['expose','公开检验记录','摊位公开裂损样件，提供护盾与战斗补给。'],['recall','要求召回与赔付','工坊回收次品，提供护盾与恢复补给。']])})];
    return Object.keys(this.centers).flatMap(kind=>this.done(kind)?[]:[this.action(`test-${kind}`,this.stations[kind].action,'开始铸件检验',()=>this._start(kind),{description:'让薄料与足料样件承受同样两次冲击。待在试场内，避开蓄力朝向；裂穿的薄料会失去遮挡。'})]);
  }
  targets(){
    if(this.completed)return [];const kind=['bolt','charge','impact'].find(key=>!this.done(key));return [target(kind?this.stations[kind].action:foot(this.giver),kind||'settled',kind?'主动启动试场，避开蓄力并观察实际裂损':'把检验结果交给铸工')];
  }
}

class PotterFire extends FrontierScene {
  setup(){
    this.start=this.point('start','13',0,120);this.kiln=this.point('kiln','13',0,-10);
    this.giver=this.actor('giver',this.start,{kind:'merchant',name:'陶工·青禾',characterSpriteId:'potter'});
    this.vents=[this.local('vent-left',this.kiln,-115,35),this.local('vent-right',this.kiln,115,35)];
    this.bench=this.local('bench',this.kiln,90,115);
    this.state.values.heat??=20;this.state.values.left??=0;this.state.values.right??=0;this.state.values.phase??=0;
    this._fixtures();
  }
  _fixtures(){
    const heat=this.state.values.heat||20,phase=this.state.values.phase||0;
    this.prop('kiln','kiln',this.kiln,{heat:clamp(heat/100,0,1),state:this.state.flags.firing?'lit':'idle',label:`炉温 ${Math.round(heat)} · ${phase===0?'温火烘干 30–45':phase===1?'烧结 65–80':'适时出窑 50–80'}`});
    this.prop('pottery','pottery',this.bench,{state:this.done('fired')?'fired':this.state.flags.ruined?'ruined':phase>0?'glowing':'raw',heat:clamp(heat/100,0,1),label:this.done('fired')?'完成的陶器':'待烧陶坯'});
    this.vents.forEach((p,i)=>this.prop(`vent-${i}`,'vent',p,{state:(this.state.values[i?'right':'left']||0)>0?'open':'closed',heat:clamp(heat/100,0,1),label:`${i?'右':'左'}风门 · ${this.state.values[i?'right':'left']||0} 档`}));
    if(this.completed)this.prop('potter-stall','stall',this.start,{state:'ready',label:this.state.choices.market==='private'?'青禾独立陶摊':'共用烧法的陶集'});
  }
  _start(){
    if(this.state.flags.firing||this.done('fired'))return false;
    this.state.flags.firing=true;this.state.flags.ruined=false;this.state.values.phase=0;this.state.values.heat=20;this.state.values.stable=0;this.state.values.overheat=0;this.state.values.left=0;this.state.values.right=1;
    this.say(this.giver,'先把温度稳在温火区，坯色变了再添风。失败也别急，还有备用陶坯。',6);this.changed();this._fixtures();return true;
  }
  update(dt){
    if(!this.accepted||!this.state.flags.firing||this.done('fired'))return;
    if(this.state.flags.firing&&!this.done('fired')&&this.near(this.kiln,550)){
      const values=this.state.values,desired=20+(values.left||0)*28+(values.right||0)*18;
      values.heat=clamp(values.heat+(desired-values.heat)*Math.min(1,dt*.6),15,110);
      const phase=values.phase||0,low=phase===0?30:65,high=phase===0?45:80;
      if(phase<2){
        values.stable=values.heat>=low&&values.heat<=high?(values.stable||0)+dt:Math.max(0,(values.stable||0)-dt*.7);
        if(values.stable>=(phase===0?5:8)){values.phase=phase+1;values.stable=0;this.say(this.giver,phase===0?'陶坯干透了。加左风门，别把炉子烧白。':'烧结成了！现在可以出窑，过热会裂。',5);this.changed();}
      }
      values.overheat=values.heat>90?(values.overheat||0)+dt:0;
      if(values.overheat>=2.5){this.state.flags.firing=false;this.state.flags.ruined=true;this.say(this.giver,'这只裂了。留着看裂纹，换一只再来，不收材料。',5);this.changed();}
      this.dirty();
    }
    this._fixtures();
  }
  actions(){
    if(!this.accepted)return [];
    if(this.completed)return [this.supplyAction('pottery-supply',foot(this.giver),this.state.choices.market==='private'?['shield','fury']:['heal','magnet'],this.state.choices.market==='private'?.9:.75)];
    if(this.done('fired'))return [this.action('market',foot(this.giver),'商量烧法的去处',choice=>{this.state.choices.market=choice;this.mark('market');this.changed();this._fixtures();return true;},{choices:options([['private','支持独立陶摊','保留独家烧法，售卖护盾与战斗补给。'],['public','公开烧法办陶集','更多人能烧制，售卖更便宜的恢复与吸引补给。']])})];
    if(!this.state.flags.firing)return [this.action('load',this.bench,this.state.flags.ruined?'换一只陶坯重做':'放入陶坯，开始烧制',()=>this._start(),{description:'只在你留在炉边时推进，无稀有材料消耗；炉温与陶坯颜色会实时变化。'})];
    const result=this.vents.map((p,i)=>this.action(`vent-${i}`,p,`调整${i?'右':'左'}风门`,()=>{const key=i?'right':'left';this.state.values[key]=((this.state.values[key]||0)+1)%3;this.changed();this._fixtures();return true;},{description:'风门依次为 0、1、2 档。温火烘干 30–45，烧结 65–80。'}));
    if(this.state.values.phase>=2)result.push(this.action('unload',this.bench,'取出烧好的陶器',()=>{if(this.state.values.heat<50||this.state.values.heat>80)return false;this.state.flags.firing=false;this.mark('fired');this.changed();this._fixtures();return true;},{enabled:this.state.values.heat>=50&&this.state.values.heat<=80,description:'炉温 50–80 时可以安全出窑。过热先关小风门。'}));
    return result;
  }
  targets(){return this.completed?[]:[target(this.done('fired')?foot(this.giver):this.state.flags.firing?this.state.values.phase>=2?this.bench:this.vents[0]:this.bench,this.done('fired')?'market':'fired',this.done('fired')?'与青禾商量陶摊的去处':this.state.flags.firing?'观察炉温与坯色，调整风门':'前往陶坯台，主动开始烧制')];}
}

const scenes={'mountain-routes':MountainRoutes,'summit-duel':SummitDuel,'brazier-path':BrazierPath,'ice-signal':IceSignal,'flawed-castings':FlawedCastings,'potter-fire':PotterFire};
export function createScene(host,definition){const Scene=scenes[definition.id];return Scene?new Scene(host,definition):null;}
