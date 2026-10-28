import { companionDefinition } from './companion-catalog.js';

// One actor source serves rendering and debug totals. Scene membership is
// independent of camera bounds and dungeon fog; apply those in the visitor.
// Inactive scene snapshots, projectiles, loot and scenery are not units.
export function visitSceneUnits(game,visit){
  if(!game)return 0;
  if(game.showcase){
    if(game.player)visit(game.player,true);
    for(const {entity,isPlayer} of game.showcase.actors)visit(entity,isPlayer);
    return game.showcase.actors.length+(game.player?1:0);
  }
  let count=0;
  const worldContent=game.sceneContent?.allows('worldContent')!==false;
  const unit=(entity,isPlayer=false)=>{count++;visit(entity,isPlayer);};
  for(const enemy of game.enemies||[])if(worldContent||enemy.storyId||enemy.storyEnemy)unit(enemy);
  if(game.player)unit(game.player,true);
  // Recovering companions still have a body in the scene.
  for(const member of game.companions?.members||[])if(worldContent||member.storyId||member.storyActor)unit(member,true);
  for(const actor of game.story?.actors||[]){
    if(actor.hidden||actor.hp<=0)continue;
    if(actor.kind==='angel'||actor.type==='angel')unit({...actor,y:actor.y-19.8,isTownNpc:true,townKind:'angel',heroId:'traveler',site:actor,name:actor.name||'天使',castFace:actor.castFace||0,facing:0},true);
    else unit(actor,true);
  }
  if(game.dungeon?.active?.kind==='shop'){
    const merchant=game.dungeon.active.merchant;
    unit({...merchant,y:merchant.y-19.8,isTownNpc:true,townKind:'merchant',heroId:'traveler',site:merchant,facing:0},true);
  }
  if(worldContent)for(const actor of game.quests?.getActors?.()||[])unit(actor,true);
  if(game.dungeon?.active||!worldContent)return count;
  for(const site of game.settlements?.sites||[]){
    if((site.type!=='merchant'&&site.type!=='angel')||site.state==='spent')continue;
    unit({x:site.x,y:site.y-19.8,isTownNpc:true,townKind:site.type,flying:site.flying,
      heroId:'traveler',site,name:site.type==='merchant'?'商人':'天使',id:site.id,
      castFace:site.castFace||0,facing:0},true);
  }
  const camps=game.companions?.camps||(game.companions?.camp?[game.companions.camp]:[]);
  for(const camp of camps){
    const definition=companionDefinition(camp.kind);
    unit({...camp,y:camp.y-(definition?.groundOffset??19.8),r:definition?.r||15,
      groundOffset:definition?.groundOffset??19.8,flying:!!definition?.flying,
      heroId:camp.kind,isCaptive:true},true);
  }
  for(const site of game.relicSites?.sites||[]){
    if((site.type!=='rescue'&&site.type!=='dogcamp')||site.state!=='ready')continue;
    const definition=companionDefinition(site.kind);
    unit({x:site.x,y:site.y-(definition?.groundOffset??19.8),r:definition?.r||15,
      heroId:site.kind,kind:site.kind,name:definition?.name||'伙伴',
      groundOffset:definition?.groundOffset??19.8,flying:!!definition?.flying,
      state:site.appearance==='golemaltar'?'dormant':site.type==='dogcamp'?'ready':'trapped',
      isCaptive:true},true);
  }
  return count;
}
