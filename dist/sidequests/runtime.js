import { createScene as createNatureScene } from './nature.js';
import { createScene as createSettlementsScene } from './settlements.js';
import { createScene as createFrontiersScene } from './frontiers.js';
import { DEFINITIONS as natureDefinitions } from './nature-definitions.js';
import { DEFINITIONS as settlementDefinitions } from './settlements-definitions.js';
import { DEFINITIONS as frontierDefinitions } from './frontiers-definitions.js';
import { createQuestInterior } from './settlements-interiors.js';
import { foot, distance } from './base.js';

const EMPTY_SCENES=Object.freeze([]);
const factories=new Map([
  ...natureDefinitions.map(definition=>[definition.id,createNatureScene]),
  ...settlementDefinitions.map(definition=>[definition.id,createSettlementsScene]),
  ...frontierDefinitions.map(definition=>[definition.id,createFrontiersScene])
]);

export class SideQuestRuntime {
  constructor(quests){
    this.quests=quests;this.game=quests.game;this.scenes=new Map();this._choice=null;this._clock=null;this._checkpointAt=0;this.worldId=null;this._activeCache=null;this._activeDungeon=undefined;
  }
  ready(definition){
    return !!definition.sidequest&&definition.worldId===this.game.worldId&&
      !!this.game.terrain.island?.layout?.areas?.some(area=>area.id===definition.discovery?.area);
  }
  enterWorld(){
    this.closeChoice();this.checkpoint();
    for(const scene of this.scenes.values())scene.dispose('world-change');
    this.scenes.clear();this._activeCache=null;this.worldId=this.game.worldId;this._clock=null;this._checkpointAt=0;
    if(!this.quests.enabled||this.game.dungeon?.active)return;
    for(const definition of this.quests.definitions){
      if(!this.ready(definition))continue;
      const factory=factories.get(definition.id);if(!factory)throw new Error(`Unknown sidequest scene: ${definition.id}`);
      const scene=factory(this,definition);if(!scene)throw new Error(`Missing sidequest scene: ${definition.id}`);
      this.scenes.set(definition.id,scene);scene.setup();
      const discovery=definition.discovery,giver=scene.actors.get('giver');
      scene.discoveryPoint=giver?foot(giver):scene.point('discovery',discovery.area,discovery.dx||0,discovery.dy||0);
      if(!giver)scene.actor('giver',scene.discoveryPoint,{kind:discovery.kind||'merchant',name:discovery.name||definition.name});
    }
  }
  _activeScenes(){
    if(!this.quests.enabled||this.game.worldId!==this.worldId)return EMPTY_SCENES;
    const dungeon=this.game.dungeon?.active||null;
    if(!this._activeCache||this._activeDungeon!==dungeon){
      this._activeDungeon=dungeon;this._activeCache=[];
      for(const scene of this.scenes.values())if(!scene._disposed&&(!dungeon||scene.handlesDungeon(dungeon)))this._activeCache.push(scene);
    }
    return this._activeCache;
  }
  _inSurfaceScene(){return !this.game.dungeon?.active;}
  update(dt){
    const clock=this.game._clock||0,elapsed=dt??(this._clock===null?0:Math.min(.05,Math.max(0,clock-this._clock)));this._clock=clock;
    if(this.game.status!=='playing'||this.game.sceneTransition?.active)return;
    const player=foot(this.game.player);
    for(const scene of this._activeScenes()){
      const giver=scene.actors.get('giver'),where=giver&&!giver.hidden?foot(giver):scene.discoveryPoint;
      if(!scene.record.discovered&&this._inSurfaceScene()&&where&&distance(player,where)<220&&this._lineOfSight(player,where))this.quests._discover(scene.id);
      scene.tickDialogue(elapsed);
      if(scene.accepted||scene.completed)scene.update(elapsed);
    }
    if(clock>=this._checkpointAt){this._checkpointAt=clock+3;this.checkpoint();}
  }
  _lineOfSight(a,b){return !this.game.terrain.firstBlocker(a.x,a.y,b.x,b.y,0,'sight');}
  _within(action){const player=foot(this.game.player);return distance(player,action)<=(action.range||92)&&this._lineOfSight(player,action);}
  _discoveryAction(scene){
    if(scene.accepted||!this._inSurfaceScene())return null;
    const actor=scene.actors.get('giver');if(actor?.hidden)return null;
    const point=actor?foot(actor):scene.discoveryPoint;
    return scene.action('discover',point,`交谈 · ${scene.definition.discovery.name||scene.definition.name}`,()=>{
      this.quests._discover(scene.id);this.game._emit('questBoardOpen',{id:scene.id,name:scene.definition.name});return true;
    },{description:scene.definition.description});
  }
  _actions(scene){
    const discovery=this._discoveryAction(scene);
    return discovery?[discovery]:scene.accepted||scene.completed?[...scene.actions(),...scene.serviceActions()]:[];
  }
  getInteraction(){
    if(this.game.status!=='playing'||this.game.sceneTransition?.active)return null;
    const player=foot(this.game.player);
    return this._activeScenes().flatMap(scene=>this._actions(scene)).filter(action=>action&&this._within(action))
      .sort((a,b)=>Number(!!a.portable)-Number(!!b.portable)||(b.priority||0)-(a.priority||0)||distance(player,a)-distance(player,b))[0]||null;
  }
  _findAction(id){
    for(const scene of this._activeScenes()){const action=this._actions(scene).find(action=>action.id===id);if(action)return {scene,action};}
    return null;
  }
  interact(id){
    if(this.game.status!=='playing'||this.game.sceneTransition?.active)return false;
    const found=this._findAction(id);if(!found||found.action.enabled===false||!this._within(found.action))return false;
    const {scene,action}=found;
    if(Array.isArray(action.choices)&&action.choices.length){
      if(action.choices.length>4)throw new Error(`Too many sidequest options: ${action.id}`);
      this._choice={sceneId:scene.id,actionId:action.id,worldId:this.game.worldId,dungeonId:this.game.dungeon?.active?.id||null,
        view:{id:action.id,title:action.title||scene.definition.name,text:action.description||'',speaker:action.speaker||scene.definition.discovery.name||'',
          choices:action.choices.map(({id,label,description='',disabled=false})=>({id,label,description,disabled}))}};
      this.game.status='sidequest-choice';this.game._emit?.('sideQuestChoiceOpen',{questId:scene.id});return true;
    }
    const changed=action.onUse?.();if(changed===false)return false;
    scene.checkpoint();this.quests._changed();return true;
  }
  getChoice(){return this.game.status==='sidequest-choice'?this._choice?.view||null:null;}
  choose(id){
    const pending=this._choice;if(!pending||this.game.status!=='sidequest-choice')return false;
    if(this.game.sceneTransition?.active||this.game.worldId!==pending.worldId||(this.game.dungeon?.active?.id||null)!==pending.dungeonId){this.closeChoice();return false;}
    const found=this._findAction(pending.actionId),choice=found?.action.choices?.find(choice=>choice.id===id);
    if(!found||!choice||choice.disabled||found.action.enabled===false||!this._within(found.action))return false;
    this._choice=null;this.game.status='playing';
    const changed=found.action.onUse?.(id);if(changed===false)return false;
    found.scene.checkpoint();this.quests._changed();return true;
  }
  closeChoice(){const open=!!this._choice;this._choice=null;if(this.game.status==='sidequest-choice')this.game.status='playing';return open;}
  getActors(){return this._activeScenes().flatMap(scene=>scene.getActors());}
  getProps(){return this._activeScenes().flatMap(scene=>scene.getProps());}
  getDialogue(){return this._activeScenes().flatMap(scene=>scene.getDialogue()).filter(line=>line.actor&&!line.actor.hidden);}
  targets(definition){
    const scene=this.scenes.get(definition.id);if(!scene||!scene.accepted||scene.completed)return [];
    const dungeon=this.game.dungeon?.active;if(dungeon&&!scene.handlesDungeon(dungeon))return [];
    return scene.targets();
  }
  get blocksPlayerAttacks(){for(const scene of this._activeScenes())if(scene.accepted&&scene.blocksPlayerAttacks)return true;return false;}
  canTarget(enemy,origin,source){for(const scene of this._activeScenes())if(scene.accepted&&scene.canTarget(enemy,origin,source)===false)return false;return true;}
  beforeEnemy(enemy,dt){for(const scene of this._activeScenes())if(scene.accepted&&scene.beforeEnemy(enemy,dt))return true;return false;}
  beforeEnemyDamage(enemy,amount,origin,source){
    let result=amount;for(const scene of this._activeScenes())if(scene.accepted)result=scene.beforeEnemyDamage(enemy,result,origin,source);
    return Number.isFinite(result)?Math.max(0,result):amount;
  }
  beforePlayerDamage(amount,origin){
    let result=amount;for(const scene of this._activeScenes())if(scene.accepted)result=scene.beforePlayerDamage(result,origin);
    return Number.isFinite(result)?Math.max(0,result):amount;
  }
  getSites(){return [...this.scenes.values()].flatMap(scene=>scene.getSites());}
  createInterior(site){
    const scene=site?.sideQuestId&&this.scenes.get(site.sideQuestId);
    return scene&&(scene.accepted||scene.completed)&&scene.getSites().some(candidate=>candidate.id===site.id&&candidate.sideQuestId===site.sideQuestId)?createQuestInterior(this.game,site):null;
  }
  beforeDungeonEnter(site){
    this.deactivate('dungeon-enter');
    for(const scene of this.scenes.values())scene.onBeforeDungeonEnter?.(site);
  }
  beforeDungeonExit(state){
    this.deactivate('dungeon-exit');
    for(const scene of this.scenes.values())if(scene.handlesDungeon(state))scene.onBeforeDungeonExit?.(state);
  }
  onDungeonEnter(state,site){
    this._clock=null;this._activeCache=null;
    for(const scene of this.scenes.values())if(scene.handlesDungeon(state))scene.onDungeonEnter?.(state,site);
  }
  onDungeonExit(state,exit){
    this._clock=null;this._activeCache=null;
    for(const scene of this.scenes.values())if(scene.handlesDungeon(state))scene.onDungeonExit?.(state,exit);
  }
  checkpoint(){for(const scene of this.scenes.values())scene.checkpoint();}
  deactivate(reason='exit'){
    this.closeChoice();this.checkpoint();
    for(const scene of this._activeScenes())scene.onDeactivate?.(reason);
    this.checkpoint();this._clock=null;
  }
  dispose(reason='exit'){this.deactivate(reason);for(const scene of this.scenes.values())scene.dispose(reason);this.scenes.clear();this._activeCache=null;}
}
