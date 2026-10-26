import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WorldSave,WORLD_SAVE_KEY } from './dist/world-save.js';
import { groundOffset } from './dist/terrain.js';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
const foot=game=>({x:game.player.x,y:game.player.y+groundOffset(game.player,true)});
const place=(game,point)=>{game.status='playing';game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);};
function start(storage,worldId){
  const save=new WorldSave({storage}),game=new Game({mode:'world',worldId,...(save.hasSave?save.startOptions():{}),questStorage:save.questStorage});
  assert(save.attach(game));return {save,game};
}
function resume(storage,game){game.dispose();return start(storage);}
function siteFor(game,id){const site=game.quests.sidequests.getSites().find(site=>site.sideQuestId===id);assert(site,`${id}: registered exterior`);return site;}
function enter(game,id){
  const site=siteFor(game,id);place(game,site.door);assert(game.dungeon.enter(site),`${id}: enter through its real doorway`);
  assert.equal(game.dungeon.active.site.id,site.id);return game.dungeon.active;
}
function leave(game){place(game,game.dungeon.active.entrance);assert(game.dungeon.exit());assert.equal(game.dungeon.active,null);}
function use(game,id,key){
  const scene=game.quests.sidequests.scenes.get(id),action=scene.actions().find(action=>action.action===key);
  assert(action,`${id}: ${key} is available`);place(game,action);assert(game.quests.sidequests.interact(action.id),`${id}: ${key} accepts the nearby player`);
}
const geometry=state=>({bounds:{...state.bounds},entrance:{...state.entrance},landing:{...state.landing},walls:state.walls.map(wall=>[wall.id,wall.x,wall.y,wall.halfLength,wall.r,wall.angle])});

for(const [worldId,id] of [['ruins','overdue-book'],['beach','wreck-knocking']]){
  const storage=memory();let {save,game}=start(storage,worldId);
  game.quests._discover(id);assert(game.quests.accept(id));
  let state=enter(game,id),scene=game.quests.sidequests.scenes.get(id);
  assert(state.populated);assert.equal(state.kind,'hut');assert.deepEqual(state.chests,[]);assert.equal(state.treasure,null);
  assert(scene.record.objectives.entered,`${id}: entering records the real objective`);
  assert(game.quests.sidequests.getProps().every(prop=>prop.sideQuestId===id),'unrelated surface quest fixtures stay outside');
  if(id==='overdue-book'){
    use(game,id,'open-side');use(game,id,'carry');assert(game.quests.sidequests.blocksPlayerAttacks);
  }else{
    use(game,id,'drain-1');use(game,id,'drain-2');use(game,id,'rescue');
    scene.placeActor(scene.actors.get('survivor'),{x:400,y:80});
  }
  const expectedGeometry=geometry(state),firstTerrain=state.terrain;
  state.visited.add(1);game.dungeon.vision.update();const explored=game.dungeon.vision._record(state).count;assert(explored>0);
  const guard=game.enemies.find(enemy=>enemy.eventId?.startsWith(`quest:${id}:`));
  const wounded=guard?{id:guard.id,eventId:guard.eventId,hp:Math.max(1,guard.hp-3)}:null;if(guard)guard.hp=wounded.hp;
  const wallet=game.gold;
  leave(game);assert.equal(game.quests.sidequests.blocksPlayerAttacks,false,'leaving a carrying scene cannot disable outside combat');
  assert(save.capture(game,{reason:'sidequest-leave'}));
  const serialized=JSON.parse(storage.getItem(WORLD_SAVE_KEY)),stored=serialized.regions[worldId].dungeons[state.id];
  for(const field of ['terrain','walls','bounds','cells','props'])assert(!Object.hasOwn(stored,field),`${field} is rebuilt from the current interior`);
  assert(serialized.quests.records[id].objectives.entered);
  ({save,game}=resume(storage,game));assert.equal(game.dungeon.active,null);assert.equal(game.gold,wallet);
  state=enter(game,id);scene=game.quests.sidequests.scenes.get(id);
  assert.notEqual(state.terrain,firstTerrain);assert.deepEqual(geometry(state),expectedGeometry);
  assert(state.visited.has(1));assert(game.dungeon.vision._record(state).count>=explored);
  assert(scene.record.objectives.entered);assert.equal(game.gold,wallet,'returning to a quest interior grants no generic hut reward');
  if(id==='overdue-book'){
    assert(scene.state.flags['side-door'],'opened side passage survives reload');assert(scene.props.get('side-door').open);
    assert.equal(scene.state.flags.carrying,false,'an interrupted carry is available to restart');use(game,id,'carry');
  }else{
    assert.equal(scene.state.values['water-stage'],2,'drained compartments survive reload');assert(scene.props.get('water-two').open);
    assert.deepEqual({x:scene.actors.get('survivor').x,y:scene.actors.get('survivor').groundY},{x:400,y:80},'the survivor restores inside coordinates instead of surface giver coordinates');
    use(game,id,'rescue');
  }
  if(wounded){const restored=game.enemies.find(enemy=>enemy.id===wounded.id);assert(restored);assert.equal(restored.hp,wounded.hp);assert.equal(restored.eventId,wounded.eventId);}
  assert.equal(save.restoreDungeon(game,state),false,'reenter restore is idempotent');
  // Reloading while inside follows the existing safe surface-resume rule,
  // but uses this quest's current doorway rather than a generic town spawn.
  assert(save.capture(game,{reason:'sidequest-inside'}));assert.equal(save.data.location.facilityId,state.id);
  ({save,game}=resume(storage,game));const exterior=siteFor(game,id);
  assert.equal(game.dungeon.active,null);assert(Math.hypot(foot(game).x-exterior.door.x,foot(game).y-exterior.door.y)<=180);
  assert(game.terrain.isFree(foot(game).x,foot(game).y,game.player.r));
  assert.equal(game.quests.sidequests.blocksPlayerAttacks,false);
  state=enter(game,id);scene=game.quests.sidequests.scenes.get(id);assert.deepEqual(geometry(state),expectedGeometry);assert(scene.record.objectives.entered);
  if(id==='overdue-book')assert.equal(game.quests.sidequests.blocksPlayerAttacks,false,'reload clears the interrupted carry on reentry');
  leave(game);game.dispose();
}

// Race route traversal is covered by nature QA. Here the actual checkpoints
// supply a finished result so its one-time payment crosses a save boundary.
{
  const storage=memory(),id='courier-race';let {save,game}=start(storage,'verdant-rift');
  game.quests._discover(id);assert(game.quests.accept(id));use(game,id,'start');
  let scene=game.quests.sidequests.scenes.get(id);scene.update(.25);assert(scene.state.flags.racing);
  assert(save.capture(game,{reason:'race-interrupted'}));({save,game}=resume(storage,game));
  scene=game.quests.sidequests.scenes.get(id);assert.equal(scene.state.flags.racing,false);assert.equal(game.quests.sidequests.blocksPlayerAttacks,false);
  const finish=()=>{
    use(game,id,'start');scene=game.quests.sidequests.scenes.get(id);
    for(const checkpoint of scene.checks){place(game,checkpoint);scene.placeActor(scene.runner,checkpoint);scene.update(.25);}
    assert(scene.state.flags['player-finished']&&scene.state.flags['runner-finished']);use(game,id,'result');
  };
  finish();assert(scene.completed);assert(scene.state.flags['first-win']);const paid=game.gold;
  assert(save.capture(game,{reason:'race-result'}));({save,game}=resume(storage,game));
  scene=game.quests.sidequests.scenes.get(id);assert(scene.completed&&scene.state.flags['first-win']);finish();assert.equal(game.gold,paid,'a repeated race win cannot pay its first-win or quest reward again');
  game.dispose();
}

// A saved practice opponent is never a permanent hostile NPC. Cancellation
// restores only practice damage and happens before outgoing scene snapshots.
{
  const storage=memory(),id='summit-duel';let {save,game}=start(storage,'mountain');
  game.quests._discover(id);assert(game.quests.accept(id));
  const begin=()=>{
    const scene=game.quests.sidequests.scenes.get(id);game.quests.sidequests.update(0);use(game,id,'start-spear');
    const opponent=scene.alive('practice')[0];assert(opponent);const hp=game.player.hp;game.player.invuln=0;
    assert(game._hurtPlayer(8,opponent));assert(game.player.hp<hp);assert(scene.state.values['duel-damage']>0);return {scene,hp};
  };
  let {scene,hp}=begin();const wallet=game.gold;
  assert(save.capture(game,{reason:'duel-interrupted'}));assert(save.data.regions.mountain.enemies.some(enemy=>enemy.eventId===`quest:${id}:practice`));
  ({save,game}=resume(storage,game));scene=game.quests.sidequests.scenes.get(id);game.quests.sidequests.update(0);
  assert(!scene.state.choices.active);assert.equal(scene.alive('practice').length,0);assert.equal(game.player.hp,hp);assert.equal(game.gold,wallet);assert(!scene.completed);
  assert(scene.getActors().some(actor=>actor.sideQuestKey==='giver'&&!actor.hidden),'interrupted duel restores its neutral speaker');
  ({scene}=begin());const portal=game.regions.portals.find(portal=>Number.isInteger(portal.nextRegionIndex));assert(portal);assert(game._switchRegion(portal));
  assert(save.capture(game,{reason:'duel-region-exit'}));assert(!save.data.regions.mountain.enemies.some(enemy=>enemy.eventId===`quest:${id}:practice`));assert(!save.data.quests.records[id].sidequest.choices.active);
  const back=game.regions.portals.find(portal=>portal.nextRegion?.id==='mountain');assert(back);assert(game._switchRegion(back));
  ({scene}=begin());game.player.invuln=0;assert(game._hurtPlayer(game.player.hp+1000,null));assert.equal(game.status,'dead');game.update(0);
  assert(save.capture(game,{reason:'death',respawn:true}));assert(!save.data.regions.mountain.enemies.some(enemy=>enemy.eventId===`quest:${id}:practice`));
  ({save,game}=resume(storage,game));game.quests.sidequests.update(0);scene=game.quests.sidequests.scenes.get(id);
  assert.equal(game.player.hp,game.player.maxHp);assert(!scene.state.choices.active);assert.equal(scene.alive('practice').length,0);assert.equal(game.gold,wallet);
  game.dispose();
}
console.log('Sidequest persistence passed: both interiors, scene isolation, current geometry, guards/fog, carry/rescue interruptions, race rewards, and duel reload/region/death cleanup.');
