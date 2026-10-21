import { Adventure } from './adventure.js';
import { Environment } from './environment.js';
import { ShipTerrain } from './ship-terrain.js';
import { getConfigSection } from './content-config.js';
import { clearSceneActors, placeScenePlayer } from './scene-actors.js';

const supplyRules=getConfigSection('economy').pickups;
export function expeditionAdventure(game,definition,id){
  const adventure=new Adventure(game,{generation:false});
  adventure.props=(definition.supplies||[]).map((supply,index)=>({id:`expedition:${id}:supply:${index}`,type:'supply',...supply,r:18,aimY:supply.y-12,sortY:supply.y,hp:supplyRules.supplyHp,maxHp:supplyRules.supplyHp,hit:0,seed:(index+1)*.173}));
  return adventure;
}

export class ExpeditionScenes {
  constructor(run){this.run=run;this.currentId=run.definition.start.sceneId;this.states=new Map();}
  get definition(){return this.run.definition.scenes.find(scene=>scene.id===this.currentId);}
  capture(){
    const g=this.run.game;let state=this.states.get(this.currentId);
    if(!state){state={};this.states.set(this.currentId,state);}
    Object.assign(state,{terrain:g.terrain,enemies:g.enemies,gems:g.gems,coins:g.coins,adventure:g.adventure,environment:g.environment});return state;
  }
  enter(link){
    const run=this.run,g=run.game,definition=run.definition.scenes.find(scene=>scene.id===link.to);
    if(!definition)return false;
    const furyTime=g.adventure?.furyTime||0,magnetTime=g.adventure?.magnetTime||0;
    clearSceneActors(g);this.capture();
    let state=this.states.get(definition.id),fresh=!state;
    if(fresh){state={terrain:new ShipTerrain(definition,run.definition.themeId),enemies:[],gems:[],coins:[],adventure:null,environment:null};this.states.set(definition.id,state);}
    this.currentId=definition.id;
    Object.assign(g,{terrain:state.terrain,enemies:state.enemies,gems:state.gems,coins:state.coins,adventure:state.adventure,environment:state.environment,portal:null,mapId:`expedition:${run.id}:${definition.id}`,sceneKind:'expedition'});
    if(!g.adventure)g.adventure=expeditionAdventure(g,definition,`${run.id}:${definition.id}`);
    if(!g.environment)g.environment=new Environment(g,{generation:false});
    g.adventure.furyTime=furyTime;g.adventure.magnetTime=magnetTime;
    if(fresh)for(const group of run.groups.filter(group=>group.definition.sceneId===definition.id))run._spawnGroup(group);
    clearSceneActors(g);placeScenePlayer(g,link.arrival,{doorway:link.arrival,direction:link.direction});
    g.regionGrace=2;g._interactHeld=false;g._friendlySnapshot=null;g.touchInteractions.scene=null;g.touchInteractions.latched=null;
    g._refreshStats();g._refreshWeapons();g._rebuildGrid();this.capture();
    g._emit('expeditionSceneEntered',{expeditionId:run.id,sceneId:definition.id,name:definition.name,revisit:!fresh});return true;
  }
  dispose(){this.states.clear();}
}
