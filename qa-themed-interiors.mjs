import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { getConfigSection } from './dist/content-config.js';
import { groundOffset } from './dist/terrain.js';
import { NavigationRoute } from './dist/navigation-route.js';

// These existing scene identities must survive the replacement of their maps.
const existingCaves={
  'rift-forest':['underground-passage'],
  'verdant-rift':['west-maze','echo-maze'],
  marsh:['rootwater-tunnel','moss-vault'],
  ruins:['buried-aqueduct','starwell-vault'],
  beach:['limestone-tideway','shell-vault'],
  'clockshadow-city':['city-sewer','city-cellar'],
  mountain:['folded-ridge-tunnel','echo-vein-vault'],
  snow:['frost-vein-tunnel','blue-ice-vault'],
  'ember-realm-large':['ember-bridge-mine','ember-north-mine','ember-south-cavern']
};
const interiors=getConfigSection('geography').interiors,mapping=interiors.caveLayouts;
assert.ok(mapping,'the authored cave catalogue is published');
assert.deepEqual(Object.keys(mapping).sort(),Object.keys(existingCaves).sort(),'all existing cave worlds retain a configured mapping');
for(const [worldId,caveIds]of Object.entries(existingCaves))assert.deepEqual(Object.keys(mapping[worldId]).sort(),[...caveIds].sort(),`${worldId}: cave identities remain unchanged`);

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.heroId)});
const place=(game,point)=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);game.dungeon.update(0);};
const results=[],failures=[];
let steps=0,targets=0;

function inspect(worldId,caveId,layoutKey){
  const label=`${worldId}/${caveId} (${layoutKey})`;
  const check=(condition,message)=>assert.ok(condition,`${label}: ${message}`);
  const game=new Game({mode:'world',worldId,adventure:false,environment:false,encounters:false,companions:false});
  game._shot=game._pulse=game._lightning=Infinity;game.player.xpNext=game.crystalsNext=Infinity;
  game.viewWidth=800;game.viewHeight=650;
  try{
    const mouths=game.riftExploration.sites.filter(site=>site.kind==='cave'&&site.caveId===caveId),worldTerrain=game.terrain;
    check(mouths.length===1||mouths.length===2,'the original surface entrance or paired entrances exist');
    const surfaceCaves=[...new Set(game.riftExploration.sites.filter(site=>site.kind==='cave').map(site=>site.caveId))].sort();
    assert.deepEqual(surfaceCaves,[...existingCaves[worldId]].sort(),`${label}: runtime surface caves match the existing catalogue`);
    function enter(mouth){
      place(game,mouth);check(game.riftExploration.interact(mouth.id),'the real surface interaction enters the cave');
      game.touchInteractions.update();return game.dungeon.active;
    }
    const state=enter(mouths[0]);
    assert.equal(state.id,`rift:${worldId==='rift-forest'?'':worldId+':'}${caveId}`,`${label}: the retained scene ID is unchanged`);
    check(state.authoredLayout===interiors.authoredLayouts[layoutKey],'the mapping selects the intended authored layout');
    assert.equal(state.kind,'cave');assert.equal(state.riftExits.length,mouths.length);
    assert.equal(state.chests.length,3,`${label}: three guarded treasure locations exist`);
    check(game.terrain===state.terrain&&game.enemies===state.enemies,'collision and live actors use the active scene');
    const boss=game.enemies.find(enemy=>enemy.id===state.bossId);
    check(boss?.dungeonBoss,'the authored Boss is populated');

    function route(start,target,reason){
      const navigation=new NavigationRoute(game.terrain,{routeBackbone:(from,to)=>game.quests._dungeonRoute(state,from,to)});
      const result=navigation.update(start,target,{radius:game.player.r+3,bodyRadius:game.player.r,profile:'ground'}),path=result?.path;
      check(result?.complete&&path?.length,`${reason}: the actual guide finds a complete route from ${Math.round(start.x)},${Math.round(start.y)} to ${Math.round(target.x)},${Math.round(target.y)}`);
      check(distance(path.at(-1),target)<.05,`${reason}: the route reaches its real target`);
      let from=start,length=0;
      for(const point of path){
        check(game.terrain.isFree(point.x,point.y,game.player.r),`${reason}: every waypoint admits the player's body`);
        check(!game.terrain.firstBlocker(from.x,from.y,point.x,point.y,game.player.r),`${reason}: each walking segment has body clearance`);
        length+=distance(from,point);from=point;
      }
      return {path,length};
    }
    function walk(target,reason){
      for(const point of route(foot(game.player),target,reason).path){
        for(let i=0;distance(foot(game.player),point)>.02&&i<1000;i++){
          const before=foot(game.player),remaining=distance(before,point),travel=Math.min(24,remaining);
          game._moveEntity(game.player,(point.x-before.x)/remaining*travel,(point.y-before.y)/remaining*travel,true);
          const after=foot(game.player);
          check(distance(before,after)>.001,`${reason}: actual movement advances`);
          check(game.terrain.isFree(after.x,after.y,game.player.r),`${reason}: actual movement remains outside obstacles`);steps++;
        }
        check(distance(foot(game.player),point)<.03,`${reason}: actual movement completes each turn`);
      }
      game.dungeon.update(0);targets++;
    }
    function anchors(){
      for(const cell of state.cells){
        check(game.terrain.isFree(cell.x,cell.y,game.player.r+3),`guide anchor ${cell.id} has clearance`);
        for(const next of game.dungeon._neighbors(cell,state))if(next.id>cell.id)
          check(game.terrain.isFree((cell.x+next.x)/2,(cell.y+next.y)/2,game.player.r+3),`guide connection ${cell.id}-${next.id} has clearance`);
      }
    }
    anchors();
    for(const wall of state.walls)check(!game.terrain.isFree(wall.x,wall.y,0),`boundary wall ${wall.id} has real collision`);
    for(const prop of state.props.filter(prop=>prop.collision!==false))check(!game.terrain.isFree(prop.x,prop.y+(prop.footprint?.offsetY||0),0),`solid furnishing ${prop.id} has real collision`);
    for(const enemy of game.enemies){const point=foot(enemy);check(game.terrain.isFree(point.x,point.y,enemy.r),`spawned ${enemy.type} has body clearance`);}
    const landing=foot(game.player),distant=[...state.chests,...state.mechanisms].sort((a,b)=>distance(landing,b)-distance(landing,a))[0];
    walk(distant,'actual landing to the most distant objective');
    const goals=[...state.chests,...state.mechanisms,foot(boss),state.treasure,...state.riftExits];
    for(const [index,target]of goals.entries())walk(target,`closed-gate objective ${index}`);
    check(state.mechanisms.length>0&&state.mechanisms.every(item=>!item.opened),'all objectives and exits can be reached before opening shortcuts');

    const shortcuts=[];
    for(const mechanism of state.mechanisms){
      const gate=state.gates.find(item=>item.id===mechanism.gateId);check(gate,'the control owns a physical gate');
      const nx=-Math.sin(gate.angle),ny=Math.cos(gate.angle),offset=gate.r+game.player.r+48;
      const a={x:gate.x-nx*offset,y:gate.y-ny*offset},b={x:gate.x+nx*offset,y:gate.y+ny*offset};
      check(game.terrain.isFree(a.x,a.y,game.player.r)&&game.terrain.isFree(b.x,b.y,game.player.r),'both sides of the gate are standable');
      check(!game.terrain.isFree(gate.x,gate.y,game.player.r),'a closed gate blocks its centre');
      check(game.terrain.firstBlocker(a.x,a.y,b.x,b.y,game.player.r)?.id===gate.id,'a direct crossing hits the closed gate');
      walk(a,'closed-gate approach');const closed=route(a,b,'closed-gate detour').length;
      for(let i=0;i<12;i++)game._moveEntity(game.player,nx*20,ny*20,true);
      const stopped=foot(game.player);check((stopped.x-gate.x)*nx+(stopped.y-gate.y)*ny<0,'walking into a closed gate cannot pass through it');
      walk(mechanism,'detour to the gate control');
      assert.equal(game.getInteraction()?.id,mechanism.id,`${label}: the actual control is interactable`);
      const revision=game.terrain.structureRevision;
      check(game.touchInteractions.update(),'ordinary touch activates the control');
      check(mechanism.opened&&game.terrain.structureRevision>revision,'opening invalidates the collision and navigation revision');
      check(!game.terrain.firstBlocker(a.x,a.y,b.x,b.y,game.player.r),'the open gate admits a direct full-body crossing');
      anchors();const opened=route(a,b,'opened shortcut').length;
      check(opened+80<closed,'the shortcut materially reduces the walking route');
      walk(a,'open-gate approach');walk(b,'open-gate crossing');
      check(!game.interact(mechanism.id),'the control cannot activate twice');
      shortcuts.push({closed:Math.round(closed),opened:Math.round(opened)});
    }

    const chest=state.chests[0],survivor=game.enemies.find(enemy=>!enemy.dungeonBoss&&enemy.dungeonRoom!==chest.cellId);
    check(survivor,'a separate room retains an undefeated guard');
    place(game,foot(survivor));check(game._hurtEnemy(survivor,1)>0,'a real hit damages a retained guard');const hp=survivor.hp;
    place(game,chest);
    if(game.enemies.some(enemy=>enemy.hp>0&&enemy.dungeonRoom===chest.cellId))check(game.getInteraction()?.enabled===false,'living guards protect their chest');
    for(const enemy of [...game.enemies])if(enemy.hp>0&&enemy.dungeonRoom===chest.cellId){place(game,foot(enemy));check(game._hurtEnemy(enemy,enemy.hp*100+1)>0,'room guards take actual damage');}
    place(game,chest);check(game.interact(chest.id)&&chest.state==='claimed','clearing the room permits one chest claim');
    const balance={gold:game.gold,crystals:game.crystals};

    for(const mouth of [...mouths].reverse()){
      const exit=state.riftExits.find(item=>item.key===mouth.key);check(exit,'each surface mouth has its matching underground exit');
      walk(exit,'surface return');check(game.dungeon.exit(exit.id),'the actual underground exit returns to the world');
      check(game.terrain===worldTerrain&&distance(foot(game.player),mouth)<200,'the exit returns to its own unchanged surface entrance');
      check(enter(mouth)===state,'every original mouth revisits the same retained scene');
      check(game.enemies.includes(survivor)&&survivor.hp===hp,'revisiting does not respawn or heal surviving enemies');
      check(state.mechanisms.every(item=>item.opened),'revisiting never recloses opened shortcuts');
      for(const gate of state.gates)check(game.terrain.isFree(gate.x,gate.y,game.player.r),'revisited shortcuts remain physically open');
      place(game,chest);check(chest.state==='claimed'&&!game.interact(chest.id),'revisiting cannot claim the same chest twice');
      assert.deepEqual({gold:game.gold,crystals:game.crystals},balance,`${label}: revisiting grants no duplicate currency`);
    }
    results.push({worldId,caveId,exits:mouths.length,shortcuts});
  }finally{game.dispose();}
}

for(const [worldId,caves]of Object.entries(mapping))for(const [caveId,layoutKey]of Object.entries(caves)){
  try{inspect(worldId,caveId,layoutKey);}catch(error){failures.push(error);console.error(error.message);}
}
if(failures.length)throw new AggregateError(failures,`${failures.length} authored cave checks failed`);
console.log(JSON.stringify({themedInteriors:'passed',caves:results.length,surfaceExits:results.reduce((n,result)=>n+result.exits,0),targets,steps,results}));
