import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { foot, distance } from './dist/sidequests/base.js';
import { NavigationRoute } from './dist/navigation-route.js';
import { cleanSidequestState } from './dist/sidequests/state.js';

const step=.05;
function launch(worldId,storage){
  if(!storage){const values=new Map();storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};}
  const game=new Game({mode:'world',worldId,environment:false,encounters:false,elites:false,companions:false,settlements:false,questStorage:storage});game._qaStorage=storage;
  // Isolate authored sidequest traffic while retaining the real world terrain,
  // player input, combat, navigation, interaction and persistence mechanisms.
  game.enemies=[];game.territories.groups=[];game.territories.byId.clear();game._rebuildGrid();
  return game;
}
function stand(g,p){const from=foot(g.player);g.player.x+=p.x-from.x;g.player.y+=p.y-from.y;g.status='playing';}
function tick(g,n=1,input={}){for(let i=0;i<n;i++){g.update(step,input);assert.equal(g.status,'playing','ordinary test input remains in play');g.events=[];}}
function walk(g,p,{stop=12,max=6000,onFrame}={}){
  if(distance(foot(g.player),p)<=stop)return;
  const plan=new NavigationRoute(g.terrain),result=plan.update(foot(g.player),p,{radius:g.player.r,bodyRadius:g.player.r,time:g._clock});
  assert(result?.complete,`walkable route to ${JSON.stringify(p)} from ${JSON.stringify(foot(g.player))}`);
  let cursor=1;
  for(let n=0;n<max;n++){
    const from=foot(g.player);if(distance(from,p)<=stop)return;
    while(cursor<result.path.length-1&&distance(from,result.path[cursor])<12)cursor++;
    const goal=result.path[cursor],dx=goal.x-from.x,dy=goal.y-from.y,d=Math.hypot(dx,dy),scale=Math.min(1,d/(g.player.speed*step));
    tick(g,1,{x:dx/d*scale,y:dy/d*scale});onFrame?.();
  }
  assert.fail(`movement stalled to ${JSON.stringify(p)} at ${JSON.stringify(foot(g.player))}`);
}
function accept(g,id){
  const scene=g.quests.sidequests.scenes.get(id);assert(scene);stand(g,foot(scene.actors.get('giver')));tick(g);
  assert(scene.record.discovered);assert.equal(scene.accepted,false);assert(g.requestInteraction(`sidequest:${id}:discover`));assert(g.quests.accept(id));tick(g);return scene;
}
function use(g,s,key,choice){
  const action=s.actions().find(a=>a.action===key);assert(action,`${s.id} offers ${key}`);walk(g,action,{stop:24});assert(g.requestInteraction(action.id),`${s.id} interacts ${key}`);
  if(choice){assert.equal(g.status,'sidequest-choice');assert(g.quests.sidequests.choose(choice));}assert.equal(g.status,'playing');
}
function persisted(scene){scene.checkpoint();assert.deepEqual(cleanSidequestState(scene.state),scene.state,'all persistent keys and state survive sanitizing');}
function restored(game,id,check){
  game.quests.flush();const storage=game._qaStorage,worldId=game.worldId;game.dispose();
  const copy=launch(worldId,storage),scene=copy.quests.sidequests.scenes.get(id);assert(scene.completed,'completed quest survives a fresh game');check?.(scene,copy);copy.dispose();
}

// Both real mountain routes must be walked alongside the guide. The long
// westward loop has distinct waypoints; recommending a route moves a real shop.
{
  const g=launch('mountain'),s=accept(g,'mountain-routes');g.player.invuln=1e6;
  assert(s.routes.long.length>s.routes.short.length);
  for(const route of ['short','long']){
    use(g,s,'choose-route',route);
    for(const goal of s.routes[route]){
      // Follow the guide's actual collision-resolved position, keeping close
      // enough for the guide to advance without teleporting either participant.
      let n=0;
      while(!s.state.flags.returning&&s.routes[route][s.state.values.leg||0]===goal&&n++<20000){
        const at=foot(g.player),guide=foot(s.guide),d=distance(at,guide);
        if(d>45){const plan=new NavigationRoute(g.terrain).update(at,guide,{radius:g.player.r,bodyRadius:g.player.r,time:g._clock});assert(plan?.complete,`guide remains physically reachable: ${JSON.stringify({at,guide,route,leg:s.state.values.leg,free:g.terrain.isFree(guide.x,guide.y,g.player.r)})}`);const to=plan.path[1]||guide,len=distance(at,to);tick(g,1,{x:(to.x-at.x)/len,y:(to.y-at.y)/len});}
        else tick(g);
      }
      assert(n<20000,`guide finishes ${route} leg`);
    }
    assert(s.done(route));
    // Returning player pauses when the slower companion is too far behind.
    walk(g,s.start,{onFrame:()=>{let wait=0;while(distance(foot(g.player),foot(s.guide))>180&&wait++<100)tick(g);}});
    for(let n=0;n<150&&s.state.choices.route;n++)tick(g);
    assert(!s.state.choices.route);
  }
  use(g,s,'recommend','long');assert(s.completed);assert.equal(s.merchant.hidden,false);assert(distance(foot(s.merchant),s.routes.long[1])<1);
  const inventory=g.worldShops.inventory.heal;stand(g,foot(s.merchant));use(g,s,'merchant','heal');assert.equal(g.worldShops.inventory.heal,inventory+1);persisted(s);restored(g,s.id,copy=>{assert.equal(copy.merchant.hidden,false);assert(distance(foot(copy.merchant),copy.routes.long[1])<1);assert(copy.props.has('trade-camp'));});
  console.log('frontiers: two mountain routes and permanent merchant passed');
}

// Actual starter-weapon combat, nonlethal cancellation and reward-free replay.
{
  const g=launch('mountain'),s=accept(g,'summit-duel');
  const fight=kind=>{
    use(g,s,`start-${kind}`);assert(s.state.choices.active===kind);
    for(let n=0;n<2200&&s.state.choices.active;n++){
      const enemy=s.alive('practice')[0];assert(enemy);const p=foot(g.player),e=foot(enemy),angle=Math.atan2(p.y-e.y,p.x-e.x)+.32;
      const center=kind==='spear'?s.narrow:s.wide,target={x:e.x+Math.cos(angle)*65,y:e.y+Math.sin(angle)*65};
      target.x=Math.max(center.x-80,Math.min(center.x+80,target.x));target.y=Math.max(center.y-140,Math.min(center.y+140,target.y));
      const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);tick(g,1,{x:dx/Math.max(d,1),y:dy/Math.max(d,1),skill:true});
    }
    assert(s.done(kind),`${kind} is winnable with normal starter weapon and skill`);assert(!s.alive('practice').length);assert(g.player.hp>0);assert(!g.enemyBullets.length);
  };
  fight('spear');stand(g,foot(s.ranged));fight('ranged');assert(s.completed);const reward=[g.gold,g.crystals,g.player.xp,g.coins.length,g.gems.length];
  stand(g,foot(s.spear));fight('spear');assert.deepEqual([g.gold,g.crystals,g.player.xp,g.coins.length,g.gems.length],reward,'replay cannot farm money, XP or drops');
  persisted(s);restored(g,s.id,copy=>assert(copy.actions().every(a=>a.label==='再练一场')));console.log('frontiers: two nonlethal duels and replay passed');
}

for(const route of ['short','sheltered']){
  const g=launch('snow'),s=accept(g,'brazier-path');g.player.invuln=1e6;use(g,s,'route',route);
  if(route==='sheltered'){walk(g,{x:s.start.x+240,y:s.start.y-90});g.player.invuln=0;const hp=g.player.hp;tick(g,100);assert(g.player.hp<hp,'standing outside warm zones causes actual cold damage');g.player.invuln=1e6;}
  const before=foot(s.wounded[0]);tick(g,20);assert.deepEqual(foot(s.wounded[0]),before,'unlit next warm point keeps wounded NPC waiting');
  for(let i=0;i<s.routes[route].length;i++){
    use(g,s,`light-${i}`);let n=0;while(!s.completed&&s.wounded.some((_,j)=>(s.state.values[`walk-${j}`]||0)<=i)&&n++<250)tick(g);
    assert(n<250,`both wounded follow: ${JSON.stringify({route,i,player:foot(g.player),wounded:s.wounded.map(foot),values:s.state.values})}`);
  }
  assert(s.completed);assert(s.serviceActions().length);assert(s.props.get('warm-camp'));persisted(s);restored(g,s.id,copy=>{assert(copy.props.has('warm-camp'));assert(copy.serviceActions().length);});
}
console.log('frontiers: short and sheltered warm rescue routes passed');

{
  const g=launch('snow'),s=accept(g,'ice-signal');g.player.invuln=1e6;
  use(g,s,'rotate-2');assert(!s.done('relay'),'a correct final horn alone cannot replace the upstream chain');
  use(g,s,'rotate-0');assert(!s.state.flags['link-0'],'incorrect horn angle remains disconnected');use(g,s,'rotate-0');
  const a=s.horns[1],b=s.horns[2];g.terrain.setStructures([{id:'qa-horn-screen',type:'rock',heightBand:'high',x:(a.x+b.x)/2,y:(a.y+b.y)/2,r:22}], 'qa-horn-screen');
  for(let i=0;i<3;i++)use(g,s,'rotate-1');assert(!s.done('relay'),'physical obstruction prevents an aligned relay from connecting');
  g.terrain.setStructures([], 'qa-horn-screen');for(let i=0;i<4;i++)use(g,s,'rotate-1');assert(s.done('relay'));
  const p=s.gatePoint;assert(g.terrain.firstBlocker(p.x,p.y-30,p.x,p.y+30,8),'closed gate physically blocks the outpost');
  use(g,s,'open-outpost');assert(!g.terrain.firstBlocker(p.x,p.y-30,p.x,p.y+30,8),'opened gate clears the actual passage');
  for(let n=0;n<250&&!s.completed;n++)tick(g);
  assert(s.completed);assert(s.watchers.every(a=>foot(a).y>s.outpost.y+115));assert(s.serviceActions().length);persisted(s);restored(g,s.id,copy=>{assert(copy.serviceActions().length);assert(copy.props.get('outpost-door').open);assert(copy.props.has('outpost-sign'));});console.log('frontiers: directional horn relay and physical outpost rescue passed');
}

{
  const g=launch('ember-realm-large'),s=accept(g,'flawed-castings');g.player.invuln=1e6;
  for(const kind of ['bolt','charge','impact']){
    use(g,s,`test-${kind}`);const p=s.centers[kind],control=s.stations[kind].control;
    assert(g.terrain.firstBlocker(p.x-25,p.y,p.x+25,p.y,4),'uncut sample has actual cover');
    let previous=s.alive('test').map(e=>foot(e)),maxStep=0;
    for(let n=0;n<700&&!s.done(kind);n++){
      tick(g);const next=s.alive('test').map(e=>foot(e));if(previous.length&&next.length)maxStep=Math.max(maxStep,distance(previous[0],next[0]));previous=next;
    }
    assert(s.done(kind),`${kind} actual impacts complete`);assert.equal(s.state.values[`hits-${kind}`],2);assert.equal(s.state.values[`control-${kind}`],2,'solid control sample withstands the same two real impacts');
    assert(!g.terrain.firstBlocker(p.x-25,p.y,p.x+25,p.y,4),'broken sample removes cover');
    assert(g.terrain.firstBlocker(control.x-25,control.y,control.x+25,control.y,4),'control sample remains solid');
    assert(maxStep<60,'charge returns by walking rather than teleporting');
  }
  use(g,s,'settle','recall');assert(s.completed);assert(s.props.get('workshop-stall'));persisted(s);const centers=s.centers;restored(g,s.id,copy=>{assert.deepEqual(copy.centers,centers);assert(copy.props.has('workshop-stall'));for(const kind of ['bolt','charge','impact'])assert(copy.props.get(`cover-${kind}`).open);});console.log('frontiers: real projectile/charge/impact casting tests and settlement passed');
}

for(const market of ['private','public']){
  const g=launch('ember-realm-large'),s=accept(g,'potter-fire');use(g,s,'load');
  // Deliberately overfire once: failure costs no scarce resource and retries.
  const resources=[g.gold,g.crystals];use(g,s,'vent-0');use(g,s,'vent-0');use(g,s,'vent-1');tick(g,180);assert(s.state.flags.ruined);assert.deepEqual([g.gold,g.crystals],resources);
  use(g,s,'load');for(let n=0;n<250&&s.state.values.phase===0;n++)tick(g);assert.equal(s.state.values.phase,1);
  use(g,s,'vent-0');for(let n=0;n<400&&s.state.values.phase===1;n++)tick(g);assert.equal(s.state.values.phase,2);
  use(g,s,'unload');assert(s.done('fired'));use(g,s,'market',market);assert(s.completed);
  const item=market==='private'?'shield':'heal',old=g.worldShops.inventory[item];use(g,s,'pottery-supply',item);assert.equal(g.worldShops.inventory[item],old+1);persisted(s);restored(g,s.id,copy=>{assert(copy.props.has('potter-stall'));assert.equal(copy.state.choices.market,market);});
}
console.log('Frontier sidequests passed: six ordinary-play loops, choices, physical routes, combat, cover, rescue, free kiln retry, distinct shops and durable state.');
