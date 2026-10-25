import { groundOffset } from './terrain.js';
import { updateFollowMovement } from './follow-movement.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=actor=>({x:actor.x,y:actor.y+groundOffset(actor,!!actor.heroId||!!actor.isCompanion)});
const RECIPES=Object.freeze({
  'ranger-home':{primary:['09',80,0],guards:['royalguard','royalarbalist']},
  'marsh-medicine':{primary:['02',80,-80],secondary:['03',220,-160],guards:['royalguard','royallancer']},
  'coastal-cargo':{primary:['11',180,100],secondary:['12',-100,70],guards:['royalguard','royalarbalist']},
  'city-signal':{primary:['06',40,90],secondary:['06',460,180],guards:['royalguard','royallancer','royalarbalist']}
});
const ACTIVE_RADIUS=290,LEASH=620,REPAIR_SECONDS=8;

// These commissions use ordinary combat, traversable world ground and the
// shared companion movement. Only bounded objective state belongs to quests;
// enemies remain in the region snapshot owned by WorldSave.
export class QuestCommissions {
  constructor(quests){this.quests=quests;this.game=quests.game;this.locations=new Map();this.actor=null;this.worldId=null;this.lastClock=null;this.scanAt=0;this.reinforceAt=0;}
  record(id){return this.quests._record(id);}
  state(id){const record=this.record(id);return record.commission??={groups:{}};}
  _area(spec){return this.game.terrain.island?.layout?.areas.find(area=>area.id===spec[0]);}
  ready(definition){const recipe=RECIPES[definition.id];return !recipe||!!(this._area(recipe.primary)&&(!recipe.secondary||this._area(recipe.secondary))&&this.game.worldTravel?.current?.core&&this.points(definition.id));}
  _point(anchor,dx=0,dy=0,r=22){
    const g=this.game,desired={x:anchor.x+dx,y:anchor.y+dy};
    for(const radius of [0,40,80,130,190,270])for(let i=0;i<(radius?16:1);i++){
      const a=i*Math.PI/8,p={x:desired.x+Math.cos(a)*radius,y:desired.y+Math.sin(a)*radius};
      if(!g.terrain.isFree(p.x,p.y,r+4)||g.environment?.isHazardFree?.(p.x,p.y,r+8)===false)continue;
      if(g.settlements?.sites.some(site=>distance(p,site)<72)||g.riftExploration?.sites.some(site=>distance(p,site)<65))continue;
      // An offset point must remain on the same open patch as its authored
      // anchor. Do not put a reward across a wall or on an unreachable island.
      if(g.terrain.firstBlocker(anchor.x,anchor.y,p.x,p.y,r,'ground'))continue;
      return p;
    }
    return null;
  }
  points(id){
    if(this.locations.has(id))return this.locations.get(id);
    const recipe=RECIPES[id];if(!recipe)return null;
    const at=spec=>{const area=this._area(spec);return area?this._point(area.center,spec[1],spec[2]):null;};
    const core=this.game.worldTravel?.current?.core;
    const delivery=core&&this._point(core.spawn||core,70,90);
    const locations={primary:at(recipe.primary),secondary:recipe.secondary?at(recipe.secondary):null,delivery};
    if(!locations.primary||recipe.secondary&&!locations.secondary||!delivery)return null;
    this.locations.set(id,locations);return locations;
  }
  checkpoint(){
    if(this.actor&&this.worldId==='rift-forest'){
      const state=this.state('ranger-home');
      if(state.actor?.x!==this.actor.x||state.actor?.y!==this.actor.y){state.actor={x:this.actor.x,y:this.actor.y};this.quests.store.dirty=true;}
    }
  }
  enterWorld(){this.checkpoint();this.worldId=this.game.worldId;this.locations.clear();this.actor=null;this.lastClock=null;this.scanAt=0;this.reinforceAt=0;}
  _guards(id,group){const key=`quest:${id}:`;return this.game.enemies.filter(enemy=>enemy.hp>0&&enemy.eventId?.startsWith(key)&&(!group||enemy.eventId===key+group));}
  _spawn(id,group,center,types){
    const state=this.state(id);if(state.groups[group])return true;
    const placements=types.map((type,index)=>this._point(center,Math.cos(index*Math.PI*2/types.length)*105,Math.sin(index*Math.PI*2/types.length)*105,24));
    if(placements.some(p=>!p))return false;
    for(let i=0;i<types.length;i++){
      const enemy=this.game._spawnEnemy(types[i],1),p=placements[i];if(!enemy)return false;
      enemy.x=p.x;enemy.y=p.y-groundOffset(enemy);enemy.eventId=`quest:${id}:${group}`;enemy.eventRole='questGuard';enemy.guardActive=false;enemy.huntHome={...p};
    }
    state.groups[group]=true;this.quests._changed();return true;
  }
  _ensure(id){
    const p=this.points(id);if(!p)return;
    const record=this.record(id);if(!record.accepted||record.completed)return;
    const recipe=RECIPES[id],firstDone=record.objectives.freed||record.objectives.medicine||record.objectives['cargo-a']||record.objectives.orders;
    if(!firstDone)this._spawn(id,'primary',p.primary,recipe.guards);
    if(id==='coastal-cargo'&&!record.objectives['cargo-b'])this._spawn(id,'secondary',p.secondary,['royallancer','royalarbalist']);
    if(id==='marsh-medicine'&&!record.objectives.restored)this._spawn(id,'secondary',p.secondary,['royalguard','royalmage']);
  }
  _clear(id,group){return !!this.state(id).groups[group]&&!this._guards(id,group).length;}
  _actor(){
    if(this.actor)return this.actor;
    const p=this.points('ranger-home');if(!p)return null;
    const record=this.record('ranger-home'),saved=this.state('ranger-home').actor;
    const initial=record.objectives.home?p.delivery:p.primary,offset=groundOffset({isCompanion:true,r:13},true);
    const location=saved&&this.game.terrain.isFree(saved.x,saved.y+offset,13)?saved:{x:initial.x,y:initial.y-offset};
    return this.actor={...location,id:++this.game._id,type:'player',kind:'warden',heroId:'warden',appearanceId:'warden',name:'巡林人',isCompanion:true,r:13,hp:1,maxHp:1,speed:280,facing:Math.PI/2,walkPhase:0};
  }
  _safeAt(point,radius=200){return !this.game.enemies.some(enemy=>enemy.hp>0&&distance(foot(enemy),point)<radius);}
  update(){
    const g=this.game,clock=g._clock||0,dt=this.lastClock===null?0:Math.min(.05,Math.max(0,clock-this.lastClock));this.lastClock=clock;
    if(!this.quests.enabled||g.dungeon?.active||g.status!=='playing')return;
    const definitions=this.quests.definitions.filter(definition=>definition.commission),p=foot(g.player);
    const escort=definitions.find(definition=>definition.id==='ranger-home'),escortRecord=escort&&this.record(escort.id);
    if(escortRecord?.accepted){
      const actor=this._actor();if(actor&&escortRecord.objectives.freed&&!escortRecord.objectives.home){
        updateFollowMovement(g,actor,{target:p,mode:'quest-escort',stop:65,start:110,baseSpeed:280,catchup:1.1,hold:distance(foot(actor),p)>450},dt);
        const destination=this.points(escort.id).delivery;
        if(distance(p,destination)<110&&distance(foot(actor),destination)<140)this.quests._objective('home',escort.id);
      }
    }
    const repair=definitions.find(definition=>definition.id==='marsh-medicine'),repairRecord=repair&&this.record(repair.id);
    if(repairRecord?.accepted&&!repairRecord.completed){
      const state=this.state(repair.id),site=this.points(repair.id)?.secondary;
      if(site&&state.repairStarted&&distance(p,site)<150&&this._safeAt(site)){
        state.repairProgress=Math.min(REPAIR_SECONDS,(state.repairProgress||0)+dt);this.quests.store.dirty=true;
        if(state.repairProgress>=REPAIR_SECONDS)this.quests._objective('restored',repair.id);
      }
    }
    if(clock<this.scanAt)return;this.scanAt=clock+.2;
    for(const definition of definitions){
      const id=definition.id,record=this.record(id);if(!record.accepted)continue;
      this._ensure(id);
      const guards=this._guards(id),alert=guards.some(enemy=>distance(foot(enemy),p)<ACTIVE_RADIUS||enemy.hp<enemy.maxHp&&distance(foot(enemy),p)<LEASH);
      for(const enemy of guards){
        const home=enemy.huntHome||foot(enemy),within=distance(p,home)<LEASH;
        enemy.guardActive=alert&&within;enemy.guardReturnTarget=enemy.guardActive||distance(foot(enemy),home)<8?null:home;
      }
      if(id==='city-signal'&&!record.completed&&!record.objectives.signal&&!record.objectives.orders){
        const site=this.points(id)?.primary;if(site&&distance(p,site)<400){
          if(!this.reinforceAt)this.reinforceAt=clock+12;
          if(clock>=this.reinforceAt){
            const group=[1,2,3].map(n=>`reinforcement-${n}`).find(key=>!this.state(id).groups[key]);
            if(group)this._spawn(id,group,this.points(id).secondary,['royalguard','royallancer']);
            this.reinforceAt=clock+12;
          }
        }
      }
    }
  }
  _actions(id){
    const record=this.record(id),locations=this.points(id);if(!record.accepted||!locations)return [];
    const facts=record.objectives,state=this.state(id);
    const action=(name,where,label,description,enabled=true)=>({id:`quest:${id}:${name}`,questId:id,action:name,category:'quest',type:'questCommission',...where,label,description,enabled,touchRadius:26});
    if(id==='ranger-home'){
      if(!facts.freed)return [action('freed',foot(this._actor()),this._clear(id,'primary')?'与巡林人交谈 · 一起回镇':'解除巡林人的看守','击败看守后，巡林人会跟随你。距离过远会停下等待。',this._clear(id,'primary'))];
      return [];
    }
    if(id==='marsh-medicine'){
      if(record.completed){
        const cooldown=Math.max(0,20-((this.game.runTime||0)-(state.lastRestAt??-20))),injured=this.game.player.hp<this.game.player.maxHp;
        return [action('heal',locations.secondary,cooldown>0?`药师正在配药 · ${Math.ceil(cooldown)} 秒`:injured?'请药师治疗':'药棚已开放',injured?'恢复四分之一生命，20 秒后可再次治疗':'可以在此接受野外治疗',injured&&cooldown<=0&&this._safeAt(locations.secondary))];
      }
      if(!facts.medicine)return [action('medicine',locations.primary,this._clear(id,'primary')?'取回药箱':'药箱仍有看守','先击败药箱旁的征发队。',this._clear(id,'primary'))];
      const safe=this._clear(id,'secondary')&&this._safeAt(locations.secondary);
      return [action('repair',locations.secondary,state.repairStarted?`整理药棚 · ${Math.floor((state.repairProgress||0)/REPAIR_SECONDS*100)}%`:safe?'帮助药师整理药棚':'先清除药棚附近的敌军','留在药棚附近整理 8 秒。离开或有敌军接近时暂停。',safe&&!state.repairStarted)];
    }
    if(id==='coastal-cargo'){
      const result=[];
      for(const [objective,group] of [['cargo-a','primary'],['cargo-b','secondary']])if(!facts[objective])result.push(action(objective,locations[group],this._clear(id,group)?'取回被扣的货箱':'击败货箱看守','两批货物可自由选择先后。',this._clear(id,group)));
      if(facts['cargo-a']&&facts['cargo-b']&&!facts.delivered)result.push(action('delivered',locations.delivery,'向补给商交付货物','交付后，海岸补给铺长期提供九折补给。'));
      return result;
    }
    if(id==='city-signal'&&!record.completed){
      const result=[];
      if(!facts.signal&&!facts.orders)result.push(action('signal',locations.secondary,'关闭征发信号','停止后续援兵。也可以直接攻入兵营。',this._safeAt(locations.secondary,80)));
      if(!facts.orders)result.push(action('orders',locations.primary,this._clear(id,'primary')?'取回征发账册':'击败兵营看守','保留账册，将征发命令交回市集。',this._clear(id,'primary')));
      if(facts.orders&&!facts.reported)result.push(action('reported',locations.delivery,'向市集掌柜交付账册','停止征发，古城补给铺恢复九折补给。'));
      return result;
    }
    return [];
  }
  getInteraction(){
    const g=this.game,p=foot(g.player);
    return this.quests.definitions.filter(def=>def.commission).flatMap(def=>this._actions(def.id)).filter(action=>distance(p,action)<92&&!g.terrain.firstBlocker(p.x,p.y,action.x,action.y,0,'sight')).sort((a,b)=>distance(p,a)-distance(p,b))[0]||null;
  }
  interact(id){
    const action=this.getInteraction();if(!action||action.id!==id||!action.enabled)return false;
    const state=this.state(action.questId);
    if(action.action==='repair'){state.repairStarted=true;this.quests._changed();}
    else if(action.action==='heal'){
      const p=this.game.player,healed=Math.min(p.maxHp-p.hp,p.maxHp*.25);p.hp+=healed;state.lastRestAt=this.game.runTime||0;this.quests._changed();
      this.game._effect(p.x,p.y-28,'heal',.8,0,'#b9dda5',`+${Math.ceil(healed)}`);
    }else {this.quests._objective(action.action,action.questId);this.game._effect(action.x,action.y,'ring',.45,38,'#dfce92');}
    return true;
  }
  targets(definition){
    const id=definition.id,record=this.record(id);if(!record.accepted||record.completed)return [];
    const facts=record.objectives;
    if(this.game.dungeon?.active){const target=this.quests._exitTarget(definition.name);return target?[{...target,objectiveId:'return'}]:[];}
    const p=this.points(id);if(!p)return [];
    const target=(where,objectiveId,label)=>({...where,objectiveId,label});
    if(id==='ranger-home'){
      if(!facts.freed)return [target(p.primary,'freed','解除看守，与巡林人交谈')];
      const actor=this._actor(),waiting=distance(foot(actor),foot(this.game.player))>450;
      return [target(waiting?foot(actor):p.delivery,'home',waiting?'返回巡林人身边，他正在等你':'陪同巡林人返回东岸城镇')];
    }
    if(id==='marsh-medicine')return [facts.medicine?target(p.secondary,'restored',this.state(id).repairStarted?'守住药棚，完成整理':'前往旧驿土丘，恢复药棚'):target(p.primary,'medicine','击败征发队，取回药箱')];
    if(id==='coastal-cargo'){
      const targets=[];if(!facts['cargo-a'])targets.push(target(p.primary,'cargo-a','夺回白帆残港的货箱'));if(!facts['cargo-b'])targets.push(target(p.secondary,'cargo-b','夺回叠浪望台的货箱'));
      return targets.length?targets:[target(p.delivery,'delivered','将两箱货物带回渔村补给商')];
    }
    if(id==='city-signal'){
      if(facts.orders)return [target(p.delivery,'reported','将征发账册交回长街市集')];
      return [...!facts.signal?[target(p.secondary,'signal','可选：关闭信号，阻止援兵')]:[],target(p.primary,'orders','击败兵营看守，取回账册')];
    }
    return [];
  }
  getActors(){
    const actors=[];
    for(const definition of this.quests.definitions){
      if(!definition.commission)continue;const id=definition.id,record=this.record(id),p=this.points(id);if(!record.accepted||!p)continue;
      if(id==='ranger-home'){
        const actor=this._actor(),facts=record.objectives;if(!actor)continue;
        actor.isCaptive=!facts.freed;actor.state=facts.freed?'active':this._clear(id,'primary')?'ready':'trapped';
        actor.name=facts.home?'巡林人':facts.freed?'巡林人 · 同行':'巡林人';actors.push(actor);
      }else{
        const location=id==='marsh-medicine'?p.secondary:p.delivery;
        const name=id==='marsh-medicine'?(record.completed?'药师 · 治疗':'药师 · 待修复'):id==='coastal-cargo'?'补给商':'市集掌柜';
        actors.push({id:`quest:${id}:npc`,x:location.x,y:location.y-groundOffset(null,true),isTownNpc:true,townKind:'merchant',heroId:'traveler',appearanceId:'merchant',name,facing:Math.PI/2});
      }
    }
    return actors;
  }
  getProps(){
    const result=[];
    const cargo=(id,p,claimed)=>({id,kind:'questCargo',...p,sortY:p.y,state:claimed?'claimed':'ready'});
    for(const definition of this.quests.definitions){
      if(!definition.commission)continue;const id=definition.id,record=this.record(id),p=this.points(id);if(!record.accepted||!p)continue;
      const facts=record.objectives;
      if(id==='marsh-medicine'){
        result.push(cargo(`quest:${id}:medicine`,p.primary,facts.medicine));
        result.push(cargo(`quest:${id}:shelf`,{x:p.secondary.x+40,y:p.secondary.y+6},facts.restored));
      }
      if(id==='coastal-cargo')result.push(cargo(`quest:${id}:a`,p.primary,facts['cargo-a']),cargo(`quest:${id}:b`,p.secondary,facts['cargo-b']));
      if(id==='city-signal')result.push(cargo(`quest:${id}:orders`,p.primary,facts.orders),{id:`quest:${id}:signal`,kind:'questWinch',...p.secondary,sortY:p.secondary.y,open:!!facts.signal||record.completed});
    }
    return result;
  }
}
