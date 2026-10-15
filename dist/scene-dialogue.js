import { getConfigSection } from './content-config.js';
import { companionDefinition } from './companion-catalog.js';
import { groundOffset } from './terrain.js';
import { mapIdentity } from './map-context.js';
import { PlayerDialogue } from './player-dialogue.js';
import { hideDialogue, resumeDialogue } from './dialogue-display-state.js';

// Presentation state is kept outside the simulation. In particular, choosing a
// line never consumes combat randomness or writes flags onto world objects.
const content=getConfigSection('sites').dialogue,lines=content.lines;
export const DIALOGUE_RULES=content.rules;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const live=entity=>entity.hp==null||entity.hp>0;
const heroName=game=>game.hero?.dialogueName||({traveler:'王子',princess:'公主',elder:'老登'}[game.hero?.heroId||String(game.hero?.id||game.hero?.appearanceId||'traveler').replace(/-v\d+$/,'')]||'王子');
const offset=entity=>groundOffset(entity,!!(entity.heroId||entity.isCompanion||entity.isCaptive||entity.isTownNpc));
const point=entity=>({x:entity.x,y:entity.y+offset(entity)});
const identity=(kind,source)=>kind==='player'?'player:hero':`${kind}:${source.id}`;
const sceneIdentity=game=>`${mapIdentity(game)}:${game.dungeon?.active?.id||game.sceneKind||'world'}`;
const enemyGroup=enemy=>enemy.territoryId||enemy.rescueId||enemy.settlementId||enemy.guardianId||(enemy.expeditionId!=null&&enemy.expeditionSegment!=null?`expedition:${enemy.expeditionId}:${enemy.expeditionSegment}`:null);

function observationRange(s){
  const source=s.source;
  if(s.kind==='player'||s.kind==='story')return Infinity;
  if(s.kind==='enemy')return source.guardActive===false?0:source.type==='boss'?Infinity:DIALOGUE_RULES.combatRange;
  if(s.kind==='site')return source.type==='merchant'?DIALOGUE_RULES.merchantFar:Math.max(DIALOGUE_RULES.angelNear,source.healing?source.guardRadius||0:0);
  if(s.kind==='companion')return source.rescuedFace>0?Infinity:DIALOGUE_RULES.supportRange;
  return Math.max(DIALOGUE_RULES.captiveNear,DIALOGUE_RULES.rescueReadyRange);
}

function speaker(kind,source,entity=source){
  return {id:identity(kind,source),kind,source,entity,x:entity.x,y:entity.y,headOffset:entity.type==='boss'?Math.max(70,(entity.r||49)*1.7):entity.kind==='dog'?29:entity.kind==='owl'?33:58};
}
function captiveEntity(source){
  const definition=companionDefinition(source.kind),ground=definition?.groundOffset??19.8;
  return {...source,y:source.y-ground,r:definition?.r||15,groundOffset:ground,heroId:source.kind,isCaptive:true,flying:!!definition?.flying};
}

export function dialogueSpeakers(game){
  const result=[];
  const worldContent=game.sceneContent?.allows('worldContent')!==false;
  if(game.player&&Number.isFinite(game.player.x)&&Number.isFinite(game.player.y))result.push(speaker('player',game.player));
  const actors=game.story?.actors;
  for(const actor of Array.isArray(actors)?actors:Object.values(actors||{}))if(actor&&live(actor)&&!actor.hidden&&actor.active!==false&&Number.isFinite(actor.x)&&Number.isFinite(actor.y)){
    const entity=actor.kind==='angel'||actor.type==='angel'?{...actor,y:actor.y-19.8,isTownNpc:true,heroId:'traveler'}:actor;
    result.push(speaker('story',actor,entity));
  }
  for(const enemy of game.enemies||[])if(live(enemy)&&!enemy.trainingDummy&&(worldContent||enemy.storyId||enemy.storyEnemy))result.push(speaker('enemy',enemy));
  for(const member of game.companions?.members||[])if(member.state==='active'&&live(member)&&(worldContent||member.storyId||member.storyActor))result.push(speaker('companion',member));
  if(game.dungeon?.active||!worldContent)return result;
  for(const site of game.settlements?.sites||[])if(['merchant','angel'].includes(site.type)&&site.state!=='spent')
    result.push(speaker('site',site,{x:site.x,y:site.y-19.8,r:15,isTownNpc:true,townKind:site.type,heroId:'traveler',flying:!!site.flying,id:site.id}));
  const camps=game.companions?.camps||[],occupied=new Set(camps.map(camp=>camp.siteId).filter(Boolean));
  for(const camp of camps)result.push(speaker('captive',camp,captiveEntity(camp)));
  for(const site of game.relicSites?.sites||[])if(['rescue','dogcamp'].includes(site.type)&&site.state==='ready'&&!occupied.has(site.id)&&site.appearance!=='golemaltar')
    result.push(speaker('recruit',site,captiveEntity(site)));
  return result;
}

export class SceneDialogue {
  constructor(){this.reset();}
  reset(){this._game=null;this._scene=null;this._terrain=null;this._clock=0;this._memory=new Map();this._groups=new Map();this._active=[];this._queue=[];this._speakers=new Map();this._visible=new Set();this._presented=new Set();this._playing=false;this._combat=false;this._serial=0;this._external=[];this._externalIds=new Set();this._playerDialogue=new PlayerDialogue();}
  _record(id){if(!this._memory.has(id))this._memory.set(id,{once:new Set(),near:new Map(),rotations:new Map(),nextSupport:0});return this._memory.get(id);}
  // The plot owns stable IDs. Acknowledgements mean actually drawn/fully read,
  // never merely queued. Critical lines survive occlusion and queue timeouts.
  enqueue(entry){
    if(!entry||entry.id==null||typeof entry.text!=='string'||!entry.text.trim()||entry.text.length>34||/[\r\n<>]/.test(entry.text))return false;
    const id=String(entry.id);if(this._externalIds.has(id))return false;
    this._externalIds.add(id);this._external.push({...entry,id});return true;
  }
  _externalSpeaker(value){
    if(!value||value==='player'||value==='hero'||value==='prince')return this._speakers.get('player:hero');
    return this._speakers.get(String(value))||[...this._speakers.values()].find(s=>s.source.id===value||s.kind==='story'&&(s.source.heroId===value||s.source.kind===value));
  }
  _readExternal(){
    const story=this._game.story;
    const order=new Map((story?.dialogue||[]).map((entry,index)=>[String(entry.id),index]));
    // The plot's array is its authoritative outstanding queue. An explicit
    // removal cancels that ID; a reorder can bring a new instruction forward.
    // This is different from timeout: retained background lines never expire.
    const retain=item=>{
      if(item.owner!==story||!story)return true;
      if(order.has(item.externalId??item.id)){item.storyOrder=order.get(item.externalId??item.id);return true;}
      if(item.hasPresented&&item.shownFor<DIALOGUE_RULES.minDuration&&this._visible.has(item.speaker?.id)&&this._clock-(item.lastPresentedAt??-Infinity)<=.2){item.storyOrder=-1;return true;}
      item.onCancelled?.(item.externalId??item.id);return false;
    };
    this._active=this._active.filter(retain);this._queue=this._queue.filter(retain);this._external=this._external.filter(retain);
    for(const [index,entry]of (story?.dialogue||[]).entries())this.enqueue({...entry,owner:story,storyOrder:index});
    this._external.sort((a,b)=>a.owner===story&&b.owner===story?a.storyOrder-b.storyOrder:0);
    for(const entry of [...this._external]){
      const s=this._externalSpeaker(entry.speaker);if(!s)break;
      const duration=Math.max(DIALOGUE_RULES.minDuration,Math.min(8,Number(entry.duration)||DIALOGUE_RULES.duration));
      this._queue.push({id:++this._serial,externalId:entry.id,owner:entry.owner,storyOrder:entry.storyOrder,onCancelled:entry.onCancelled,speaker:s,text:entry.text.replaceAll('{hero}',heroName(this._game)),priority:120,key:`story:${entry.id}`,channel:'story',persistent:true,queuedAt:this._clock,clock:this._clock,remaining:duration,shownFor:0,hasPresented:false,
        onPresented:()=>{entry.onPresented?.(entry.id);story?.onDialoguePresented?.(entry.id);},onFinished:()=>{entry.onFinished?.(entry.id);story?.onDialogueFinished?.(entry.id);}});
      this._external.splice(this._external.indexOf(entry),1);
    }
  }
  _sayPlayer(entry){
    const s=this._speakers.get('player:hero');if(!s||!this._visible.has(s.id))return false;
    const pending=[...this._active,...this._queue].filter(item=>item.speaker.id===s.id);
    if(pending.some(item=>item.text===entry.text||item.key===entry.key)||entry.channel==='player'&&pending.some(item=>item.channel==='hint'))return false;
    // Combat reactions are current observations, not an eventual backlog.
    if(entry.channel==='player'&&pending.length)return false;
    if(entry.channel==='hint')this._queue=this._queue.filter(item=>item.speaker.id!==s.id||item.channel==='story'||item.hasPresented&&item.shownFor<DIALOGUE_RULES.minDuration);
    this._queue.push({id:++this._serial,speaker:s,...entry,queuedAt:this._clock,clock:this._clock,remaining:DIALOGUE_RULES.duration,shownFor:0,hasPresented:false});return true;
  }
  _say(s,key,priority,record,onPresented=null){
    if(!this._visible.has(s.id))return false;
    const variants=lines[key];if(!variants)return false;
    // Higher-priority changes replace an unread queued greeting. A partly read
    // line keeps its remaining minimum before the next state can speak.
    // Stable rotations deliberately avoid Math.random().
    if(this._active.some(item=>item.speaker.id===s.id&&item.key===key))return false;
    const pending=this._queue.filter(item=>item.speaker.id===s.id);
    if(pending.some(item=>item.key===key))return false;
    const existing=pending.find(item=>!item.hasPresented||item.shownFor>=DIALOGUE_RULES.minDuration);
    if(existing&&existing.priority>=priority)return false;
    if(existing)this._queue.splice(this._queue.indexOf(existing),1);
    else if(pending.length>=2)return false;
    const turn=record.rotations.get(key)||0;
    this._queue.push({id:++this._serial,speaker:s,text:variants[turn%variants.length].replaceAll('{hero}',heroName(this._game)),priority,key,queuedAt:this._clock,clock:this._clock,remaining:DIALOGUE_RULES.duration,shownFor:0,hasPresented:false,onPresented:()=>{record.rotations.set(key,turn+1);onPresented?.();}});
    return true;
  }
  _once(s,event,key,priority,record){
    if(record.once.has(event))return;
    this._say(s,key,priority,record,()=>record.once.add(event));
  }
  _near(s,event,key,d,inner,outer,priority,record){
    let state=record.near.get(event);
    if(!state){state={armed:true,nextAt:0};record.near.set(event,state);}
    if(d>=outer)state.armed=true;
    if(d<=inner&&state.armed&&this._clock>=state.nextAt)this._say(s,key,priority,record,()=>{state.armed=false;state.nextAt=this._clock+DIALOGUE_RULES.greetingCooldown;});
  }
  observe(game,dt,{isVisible=()=>false}={}){
    const scene=sceneIdentity(game);
    if(this._game!==game||this._scene!==scene||this._terrain!==game.terrain){const initial=this._game==null?this._external:[];this.reset();for(const entry of initial)this.enqueue(entry);this._game=game;this._scene=scene;this._terrain=game.terrain;}
    this._playing=game.status==='playing';if(!this._playing){this._presented.clear();return;}
    const elapsed=Math.max(0,Number.isFinite(dt)?dt:0);this._clock+=elapsed;
    const speakers=dialogueSpeakers(game),hero=point(game.player),visible=new Set(),pending=new Set([...this._active,...this._queue].map(item=>item.speaker.id));
    this._speakers=new Map(speakers.map(s=>[s.id,s]));
    for(const s of speakers){
      s.distance=distance(point(s.entity),hero);
      // Finite world populations include distant idle territories. Keep their
      // hysteresis/state bookkeeping but avoid terrain rays and silhouette
      // scans until a cue can actually be heard. Existing lines retain normal
      // visibility checks as their speaker walks away from its trigger range.
      if((s.distance<=observationRange(s)||pending.has(s.id))&&isVisible(s))visible.add(s.id);
    }
    this._visible=visible;
    this._combat=speakers.some(s=>s.kind==='enemy'&&s.source.guardActive!==false&&visible.has(s.id)&&s.distance<DIALOGUE_RULES.combatRange);
    // Visibility controls drawing, not a line's lifetime. Only time actually
    // presented by the overlay counts toward its readable duration.
    const present=item=>{
      const current=this._speakers.get(item.speaker.id);
      return item.channel==='story'||current&&(current.kind!=='enemy'||current.source.guardActive!==false);
    };
    for(const item of [...this._active,...this._queue])if(this._presented.has(item.id)){const shown=Math.min(item.remaining,elapsed);item.remaining-=shown;item.shownFor+=shown;item.lastPresentedAt=this._clock;}
    this._presented.clear();
    for(const item of [...this._active,...this._queue])if(item.remaining<=0){item.onFinished?.();item.onFinished=null;}
    this._active=this._active.filter(item=>item.remaining>0&&present(item));
    this._queue=this._queue.filter(item=>item.remaining>0&&present(item)&&(item.persistent||item.hasPresented&&item.shownFor<DIALOGUE_RULES.minDuration||this._clock-(item.lastPresentedAt??item.queuedAt)<DIALOGUE_RULES.queueDuration));
    // A hidden speaker gives its slot back immediately, retaining the same
    // line for a later visible frame. No text is rendered through an occluder.
    for(const item of [...this._active])if(!visible.has(item.speaker.id)){this._active.splice(this._active.indexOf(item),1);this._queue.push(item);}
    for(const item of [...this._active,...this._queue]){
      item.speaker=this._speakers.get(item.speaker.id)||item.speaker;item.clock=this._clock;
      const display=item.visibilityGate??={};
      if(!visible.has(item.speaker.id)){item.wasHidden=true;hideDialogue(display,this._clock);}
      else if(item.wasHidden)item.wasHidden=!resumeDialogue(display,this._clock);
      else resumeDialogue(display,this._clock);
    }
    this._readExternal();
    const exclusive=!!game.story?.dialogueExclusive||this._external.length>0||[...this._active,...this._queue].some(item=>item.channel==='story');
    this._playerDialogue.observe(game,elapsed,{exclusive,say:entry=>this._sayPlayer(entry)});
    const groupCandidates=new Map();
    for(const s of speakers){
      const e=s.source,record=this._record(s.id),d=s.distance,seen=visible.has(s.id);
      if(s.kind==='player'||s.kind==='story'||exclusive)continue;
      if(s.kind==='site'){
        if(e.type==='angel'){
          this._near(s,'near','angel',d,Math.min(DIALOGUE_RULES.angelNear,e.guardRadius||DIALOGUE_RULES.angelNear),DIALOGUE_RULES.angelExit,35,record);
          if(e.healing&&!record.healing)this._once(s,'healing','angelHeal',45,record);
          record.healing=!!e.healing;
        }else{
          // Arriving directly at the stall uses its close greeting only.
          if(d>=DIALOGUE_RULES.merchantNear)this._near(s,'far','merchantFar',d,DIALOGUE_RULES.merchantFar,DIALOGUE_RULES.merchantFarExit,20,record);
          else record.near.set('far',{armed:false,nextAt:this._clock+DIALOGUE_RULES.greetingCooldown});
          this._near(s,'near','merchantNear',d,DIALOGUE_RULES.merchantNear,DIALOGUE_RULES.merchantNearExit,25,record);
        }
      }else if(s.kind==='captive'||s.kind==='recruit'){
        const animal=['dog','owl','golem'].includes(e.kind),ready=s.kind==='captive'&&e.state==='ready';
        const key=animal?`${e.kind}Help`:ready?'rescueReady':s.kind==='recruit'&&e.type==='dogcamp'?'recruit':'captive';
        if(ready)this._near(s,'ready',key,d,DIALOGUE_RULES.rescueReadyRange,DIALOGUE_RULES.captiveExit,60,record);
        else this._near(s,'help',key,d,DIALOGUE_RULES.captiveNear,DIALOGUE_RULES.captiveExit,40,record);
      }else if(s.kind==='companion'){
        const animal=['dog','owl','golem'].includes(e.kind);
        if(e.rescuedFace>0)this._once(s,'join',animal?`${e.kind}Join`:'join',65,record);
        const cast=e.castFace>0,scout=e.kind==='owl'&&(e.scoutCount||0)>0,treasure=e.kind==='dog'&&!!e.treasureTarget;
        if((cast&&!record.cast||scout&&!record.scout||treasure&&!record.treasure)&&this._clock>=record.nextSupport&&d<DIALOGUE_RULES.supportRange){
          this._say(s,`${e.kind}Support`,50,record,()=>{record.nextSupport=this._clock+DIALOGUE_RULES.supportCooldown;});
        }
        record.cast=cast;record.scout=scout;record.treasure=treasure;
      }else if(e.type==='boss'){
        if(e.guardActive!==false&&seen){
          this._once(s,'alert',e.bossKind||'ancient',90,record);
          if(e.hp<e.maxHp*.5)this._once(s,'hurt',`${e.bossKind||'ancient'}Hurt`,95,record);
        }
      }else{
        const group=enemyGroup(e);
        const alert=e.guardActive!==false&&(!e.territoryState||['alert','chasing'].includes(e.territoryState));
        // Ambient monsters have no incidental chorus; one visible member of a
        // real finite group voices its warning when that group becomes active.
        if(group&&alert&&seen){
          const prior=groupCandidates.get(group);
          if(!prior||String(e.id).localeCompare(String(prior.source.id),undefined,{numeric:true})<0)groupCandidates.set(group,s);
        }
      }
    }
    for(const [id,s]of groupCandidates){
      const record=this._record(s.id),state=this._groups.get(id)||{nextAt:0,active:false};
      if(!state.active&&this._clock>=state.nextAt)this._say(s,lines[s.source.type]?s.source.type:'enemyAlert',70,record,()=>{state.nextAt=this._clock+DIALOGUE_RULES.groupCooldown;state.active=true;});
      this._groups.set(id,state);
    }
    // A camera pan alone cannot re-arm a group: it must actually cease chasing.
    const activeGroups=new Set(speakers.filter(s=>s.kind==='enemy'&&s.source.guardActive!==false&&(!s.source.territoryState||['alert','chasing'].includes(s.source.territoryState))).map(s=>enemyGroup(s.source)));
    for(const [id,state]of this._groups)if(!activeGroups.has(id))state.active=false;
    const limit=exclusive?1:this._combat?DIALOGUE_RULES.combatVisible:DIALOGUE_RULES.maxVisible;
    const protectedLine=item=>item.hasPresented&&item.shownFor<DIALOGUE_RULES.minDuration;
    if(exclusive){this._active=this._active.filter(item=>item.channel==='story'||protectedLine(item));this._queue=this._queue.filter(item=>item.channel==='story'||protectedLine(item));}
    this._active.sort((a,b)=>Number(protectedLine(b))-Number(protectedLine(a))||b.priority-a.priority||a.id-b.id);
    while(this._active.length>limit)this._queue.push(this._active.pop());
    const pendingPriority=new Map();for(const item of this._queue)pendingPriority.set(item.speaker.id,Math.max(item.priority,pendingPriority.get(item.speaker.id)||0));
    const queuePriority=item=>protectedLine(item)?pendingPriority.get(item.speaker.id):item.priority;
    const storyOrder=(a,b)=>(a.storyOrder??Infinity)-(b.storyOrder??Infinity)||a.id-b.id;
    this._queue.sort((a,b)=>queuePriority(b)-queuePriority(a)||Number(protectedLine(b))-Number(protectedLine(a))||(a.channel==='story'&&b.channel==='story'?storyOrder(a,b):a.id-b.id));
    const firstStory=[...this._active,...this._queue].filter(item=>item.channel==='story').sort((a,b)=>Number(protectedLine(b))-Number(protectedLine(a))||storyOrder(a,b))[0];
    for(const item of [...this._active])if(item.channel==='story'&&item!==firstStory&&!protectedLine(item)){this._active.splice(this._active.indexOf(item),1);this._queue.push(item);}
    for(const item of [...this._queue]){
      if(item.channel==='story'&&item!==firstStory)continue;
      if(!visible.has(item.speaker.id))continue;
      const same=this._active.find(active=>active.speaker.id===item.speaker.id);
      if(same)continue;
      const weakest=this._active[this._active.length-1];
      if(this._active.length>=limit){if(protectedLine(weakest)||item.priority<=(weakest?.priority||0))continue;this._active.pop();this._queue.push(weakest);}
      this._active.push(item);this._active.sort((a,b)=>b.priority-a.priority||a.id-b.id);
      this._queue.splice(this._queue.indexOf(item),1);
    }
    // Removed enemies do not leave an ever-growing per-unit history.
    for(const id of this._memory.keys())if(!this._speakers.has(id))this._memory.delete(id);
  }
  items({isVisible=()=>false}={}){
    if(!this._playing||this._game?.status!=='playing'||this._scene!==sceneIdentity(this._game)||this._terrain!==this._game.terrain)return [];
    return this._active.filter(item=>{
      if(!live(item.speaker.source)||!live(item.speaker.entity)||!this._visible.has(item.speaker.id)||!isVisible(item.speaker)){item.wasHidden=true;hideDialogue(item.visibilityGate??={},this._clock);return false;}
      return !item.wasHidden;
    });
  }
  present(placed=[]){
    this._presented.clear();
    if(!this._playing||this._game?.status!=='playing')return;
    for(const entry of placed){const item=entry?.item??entry;if(!this._active.includes(item))continue;this._presented.add(item.id);if(!item.hasPresented){item.hasPresented=true;item.lastPresentedAt=this._clock;item.onPresented?.();item.onPresented=null;}}
  }
}
