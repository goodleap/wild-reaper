import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { movementProfile } from './dist/height-rules.js';
import { getConfigSection } from './dist/content-config.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=(g,entity=g.player)=>({x:entity.x,y:entity.y+groundOffset(entity,true)});
let frames=0,walked=0,claims=0;
function walk(g,target,{followers=false}={}){
  const navigation=terrainNavigation(g.terrain),speed=g.player.speed,dt=1/60;
  for(let leg=0;distance(foot(g),target)>.025&&leg<300;leg++){
    const path=navigation.find(foot(g),target,g.player.r,'ground');
    assert(path?.length,`bounded ordinary navigation to ${target.id??`${target.x},${target.y}`}`);
    for(const waypoint of path){
      for(let step=0;distance(foot(g),waypoint)>.025&&step<5000;step++){
        const before=foot(g),d=distance(before,waypoint),travel=Math.min(speed*dt,d);
        g._moveEntity(g.player,(waypoint.x-before.x)/d*travel,(waypoint.y-before.y)/d*travel,true);
        const after=foot(g),moved=distance(before,after);
        assert(moved>.0001,'full-body walking makes progress without recovery placement');
        assert(moved<=travel+.01,'ordinary movement stays within the unchanged speed budget');
        assert(g.terrain.isFree(after.x,after.y,g.player.r),'the entire player body remains on ground');
        g.adventure.update(0);frames++;walked+=moved;
        if(followers){
          const old=new Map(g.companions.members.map(member=>[member,foot(g,member)]));
          g._clock+=dt;g.companions.update(dt);
          for(const member of g.companions.members){
            const p=foot(g,member);
            assert(g.terrain.isFree(p.x,p.y,member.r,movementProfile(member)),'walking and flying allies retain their own terrain layer');
            if(g._inView(member,40))assert(distance(old.get(member),p)<=member.speed*dt+3,'visible following does not teleport');
          }
        }
      }
      assert(distance(foot(g),waypoint)<.03,'every local walking leg completes');
    }
  }
  assert(distance(foot(g),target)<.03,'the real interaction standing point is reached');
}

const game=new Game({mode:'world',worldId:'verdant-rift'});
game.viewWidth=540;game.viewHeight=985;
assert.equal(game.debug,false);assert.equal(game.debugOptions.fastMovement,false);
assert.equal(game.territories.groups.length,26);
// Traversal is isolated from combat outcomes. No colliders, reservations,
// hazards, unit sizes or movement rules are removed or changed by this test.
game.enemies=[];
game.adventure.generation=false;
assert(game.companions.recruit('stormcaller'));assert(game.companions.recruit('owl'));
const followGoal=game.terrain.island.layout.areas.find(area=>area.id==='02').center;
let recoveries=0;
const recover=game.companions._safeReturn.bind(game.companions);
game.companions._safeReturn=member=>{recoveries++;return recover(member);};
walk(game,followGoal,{followers:true});
for(let frame=0;frame<180;frame++){game._clock+=1/60;game.companions.update(1/60);}
for(const member of game.companions.members)assert(distance(foot(game,member),foot(game))<220,'visible allies finish the initial real forest route with the leader');
assert.equal(recoveries,0,'the initial ground/flying follow route needs no unseen recovery');
game.companions.members=[];

const domainPoints=game.territories.groups.map(group=>({id:group.id,x:group.x,y:group.y}));
for(const point of domainPoints)walk(game,point);
const doors=[...game.settlements.sites,...game.relicSites.sites].filter(site=>site.door).map(site=>({id:site.id,...site.door}));
for(const door of doors)walk(game,door);
for(const chest of game.riftExploration.sites.filter(site=>site.kind==='chest')){
  walk(game,chest);const gold=game.gold;
  assert.equal(game.riftExploration.interact(chest.id),true);
  assert.equal(chest.state,'claimed');assert(game.gold>gold);claims++;
  assert.equal(game.riftExploration.interact(chest.id),false,'fixed rewards remain once-only');
  for(const pickup of [...game.adventure.pickups]){walk(game,pickup);assert.equal(pickup.life,0);claims++;}
}
for(const cave of game.riftExploration.sites.filter(site=>site.kind==='cave'))walk(game,cave);

// Visit both sides by ordinary walking: the locked bridge requires the long
// existing loop; opening it then permits the direct full-body crossing.
const gate=game.riftExploration.sites.find(site=>site.kind==='shortcut');
const west={id:'gate-west',x:gate.x-76,y:gate.y},east={id:'gate-east',x:gate.x+76,y:gate.y};
walk(game,west);assert.equal(game.riftExploration.getInteraction()?.enabled,false);
assert.equal(game.riftExploration.interact(gate.id),false);
assert(game.terrain.firstBlocker(west.x,west.y,east.x,east.y,game.player.r));
const beforeDetour=walked;walk(game,east);
assert(walked-beforeDetour>5000,'the closed bridge is reached from the long real loop');
assert.equal(game.riftExploration.interact(gate.id),true);
assert.equal(game.terrain.riftGateOpen(gate.gateId),true);
const beforeShortcut=walked;walk(game,west);
assert(walked-beforeShortcut<200,'the opened bridge provides the actual short return');

let supplyCandidates=0;
const layout=game.terrain.island.layout;
for(let tx=Math.floor(layout.bounds.minX/520);tx<=Math.floor(layout.bounds.maxX/520);tx++)for(let ty=Math.floor(layout.bounds.minY/520);ty<=Math.floor(layout.bounds.maxY/520);ty++){
  const item=game.adventure._supplyAt(tx,ty);if(!item)continue;supplyCandidates++;
  assert(game.terrain.isFree(item.x,item.y,game.player.r));assert(game.adventure._reachable(item.x,item.y));
}
assert(supplyCandidates>=20,'large-world supply generation retains distributed real collectible locations');

const timed=new Game({mode:'world',worldId:'verdant-rift',encounters:false});
timed.viewWidth=540;timed.viewHeight=985;timed.enemies=[];
const firstAt=getConfigSection('economy').treasure.firstAt+.1;
while(timed.time<firstAt-.00001&&timed.status==='playing')timed.update(Math.min(.05,firstAt-timed.time));
assert(timed.time>=firstAt-.00001,'normal scheduling reaches the first treasure without a time jump');
const treasure=timed.adventure.treasure;
assert(treasure,'the new map retains scheduled treasure generation');
const supplies=[...timed.adventure.props];assert(supplies.length,'the ordinary starting view retains supplies');
timed.adventure.generation=false;
walk(timed,treasure);assert.equal(treasure.state,'active');
const guardian=timed.enemies.find(enemy=>enemy.id===treasure.guardianId);assert(guardian);
const guardFoot=()=>({x:guardian.x,y:guardian.y+groundOffset(guardian)}),initial=guardFoot();
assert(timed.terrain.isFree(initial.x,initial.y,guardian.r),'the actual scaled guardian has full-body clearance');
for(let frame=0;frame<8;frame++)timed._moveEnemy(guardian,.025,foot(timed));
assert(distance(initial,guardFoot())>1,'the existing guardian can leave its spawn by real movement');
timed._hurtEnemy(guardian,guardian.hp+1);assert.equal(treasure.state,'unlocked');
timed.adventure.update(0);assert.equal(treasure.state,'opened');claims++;
for(const pickup of [...timed.adventure.pickups]){walk(timed,pickup);assert.equal(pickup.life,0);claims++;}
const supply=supplies.find(item=>timed.adventure.props.includes(item));assert(supply);
walk(timed,supply);assert(!timed.adventure.props.includes(supply));claims++;
timed.adventure._refreshSupplies(true);
assert(!timed.adventure.props.some(item=>item.id===supply.id),'consumed supplies do not return when cells reload');
for(const pickup of [...timed.adventure.pickups]){walk(timed,pickup);assert.equal(pickup.life,0);claims++;}
assert(timed.adventure._reachablePoints.size<=256);assert(timed.adventure._reachableLegs.size<=512);
console.log(JSON.stringify({verdantPlacement:'passed',normalView:[540,985],domainsVisited:domainPoints.length,doorsVisited:doors.length,allCaveMouths:3,staticChests:4,supplyCandidates,actualClaims:claims,movementFrames:frames,walkedUnits:Math.round(walked),visibleFollowRecoveries:recoveries}));
