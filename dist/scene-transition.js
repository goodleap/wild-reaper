import { beginRelicActivation, advanceRelicActivation } from './relic-activation.js';
export const SCENE_TRANSITION_RULES=Object.freeze({outDuration:.15,inDuration:.25,castleRitualDuration:.2});
const SCENE_INTERACTIONS=new Set(['portal','castle','supply','occupied','worldShop','dungeonExit','riftCave','expeditionPassage']);
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};

// The world is frozen for both halves. The destination is committed exactly
// once, under a fully opaque frame, and input is released at both boundaries.
export class SceneTransition {
  constructor(game){this.game=game;this.active=false;this.phase='idle';this.opacity=0;this.inputRevision=0;this.committing=false;this.name='';this.elapsed=0;this.commitSucceeded=false;}
  _observe(phase,error){try{this.game.onSceneTransition?.(phase,this,error);}catch{/* Telemetry must not interrupt a scene handoff. */}}
  request(interaction){
    if(this.active||this.game.status!=='playing'||!interaction||interaction.enabled===false)return false;
    if(!SCENE_INTERACTIONS.has(interaction.type))return this.game.interact(interaction.id);
    this.active=true;this.phase='out';this.elapsed=0;this.opacity=0;this.name=interaction.label;this._scripted=false;this._id=interaction.id;
    this._activationSite=interaction.type==='castle'?this.game.settlements?.sites.find(site=>site.id===interaction.id&&site.type==='castle'):null;
    if(this._activationSite){
      const first=!this.game.dungeon?.states?.has(this._activationSite.id);
      this._ritualDuration=first?SCENE_TRANSITION_RULES.castleRitualDuration:0;
      beginRelicActivation(this._activationSite,this._ritualDuration+SCENE_TRANSITION_RULES.outDuration);
      if(first)this.phase='ritual';
    }
    this.commitSucceeded=false;this.inputRevision++;this._observe('start');return true;
  }
  // Scripted scene handoffs use the same opaque commit and input boundary
  // as doors and portals, without inventing a fake map interaction.
  run(label,commit){
    if(this.active||this.game.status!=='playing'||typeof commit!=='function')return false;
    this.active=true;this.phase='out';this.elapsed=0;this.opacity=0;this.name=label;this._scripted=true;
    this._commit=commit;this._activationSite=null;this.commitSucceeded=false;this.inputRevision++;this._observe('start');return true;
  }
  update(dt){
    if(!this.active||!['playing','victory'].includes(this.game.status)||!Number.isFinite(dt)||!(dt>0))return;
    this.elapsed+=Math.min(.05,dt);
    advanceRelicActivation(this._activationSite,dt);
    if(this.phase==='ritual'){
      if(this.elapsed+1e-9<this._ritualDuration)return;
      this.phase='out';this.elapsed=0;return;
    }
    if(this.phase==='out'){
      this.opacity=smooth(this.elapsed/SCENE_TRANSITION_RULES.outDuration);
      if(this.elapsed+1e-9<SCENE_TRANSITION_RULES.outDuration)return;
      // Discard the remainder so at least one rendered frame is fully dark.
      this.opacity=1;this.committing=true;
      this._observe('commit-start');
      try{this.commitSucceeded=!!(this._commit?this._commit():this.game.interact(this._id));}
      catch(error){this._observe('error',error);throw error;}
      finally{this.committing=false;this._commit=null;}
      this._observe('commit-end');
      if(!this._scripted)this.name=this.game.dungeon.active?.name||this.game.expedition?.sceneName||this.game.stage?.sceneName||this.game.region.name;
      this.game.regionTransition=null;this.phase='in';this.elapsed=0;return;
    }
    this.opacity=1-smooth(this.elapsed/SCENE_TRANSITION_RULES.inDuration);
    if(this.elapsed+1e-9<SCENE_TRANSITION_RULES.inDuration)return;
    this.active=false;this.phase='idle';this.elapsed=0;this.opacity=0;this._id=null;this._activationSite=null;this.inputRevision++;
    // Deferred crystal choices may resume only after the new scene is visible.
    this._observe('end');
    this.game._trySkillUpgrade();
  }
}
