import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { movementProfile } from './dist/height-rules.js';
import { terrainNavigation, NAVIGATION_LIMITS } from './dist/terrain-navigation.js';
import { WORLD_IDS } from './dist/world-definitions.js';

const foot=e=>({x:e.x,y:e.y+groundOffset(e,true)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function world(region){
  const g=new Game({mode:'world',debug:true,debugWorld:region});
  g.enemies=[];g.gold=10000;g.player.xpNext=g.crystalsNext=Infinity;g.player.invuln=1e9;
  return g;
}
function placePlayer(g,p){g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);}
function rescue(g,kind){
  const site=g.relicSites.sites.find(s=>s.kind===kind);
  assert(site,`${g.region.id}: recruitment site exists`);
  placePlayer(g,site.door);assert(g.relicSites.interact(site.id));
  const camp=g.companions.campFor(site.id);assert(camp);
  for(const enemy of g.enemies.filter(e=>e.rescueId===camp.id)){enemy.rescueSpawnGrace=0;g._hurtEnemy(enemy,enemy.hp+100);}
  assert.equal(camp.state,'ready');assert(site.gateOpen);
  placePlayer(g,camp);assert(g.companions._join(camp));assert.equal(site.state,'cleared');
  g.enemies=[];return {site,member:g.companions.members.at(-1)};
}
function tick(g,input={}){
  const before=new Map(g.companions.members.map(m=>[m.id,foot(m)]));g.update(.025,input);
  assert.equal(g.status,'playing');
  for(const member of g.companions.members){
    const point=foot(member),profile=movementProfile(member);
    assert(g.terrain.isFree(point.x,point.y,member.r,profile),`${g.region.id}/${member.kind}: collision-free after following and separation`);
    // Separation adds at most 35 units/s per other member to normal walking.
    assert(distance(point,before.get(member.id))<=((member.speed||0)+35*(g.companions.members.length-1))*.025+.08,`${g.region.id}/${member.kind}: no recovery teleport or accelerated exit`);
  }
}
function walkPlayer(g,target){
  for(let i=0;i<600;i++){
    const p=foot(g.player),d=distance(p,target);if(d<1)return;
    const fraction=Math.min(1,d/(g.player.speed*.025));tick(g,{x:(target.x-p.x)/d*fraction,y:(target.y-p.y)/d*fraction});
  }
  assert.fail(`${g.region.id}: the player's manually walked test route is blocked`);
}
function exited(g,site,member){
  const p=foot(member),leader=foot(g.player);
  return !g.relicSites.insideRescue(site.id,p,member.r)&&!g.terrain.firstBlocker(p.x,p.y,leader.x,leader.y,member.r,movementProfile(member))&&distance(p,leader)<=member.followDistance+80;
}

// All authored roost positions have different grid offsets. Closed gates must
// remain closed; opening them must expose a traversable route without changing
// the global outdoor grid density, for flying and grounded companion bodies.
const completeWorldIds=['forest','marsh','ruins','beach','city','mountain','snow','volcano','verdant-rift','clockshadow-city'];
assert.deepEqual(WORLD_IDS,[...completeWorldIds,'ember-realm-large'],'the partial region sample does not replace any existing recruitment fixture');
for(const region of completeWorldIds){
  const g=world(region),site=g.relicSites.sites.find(s=>s.kind==='owl'),navigation=terrainNavigation(g.terrain),target={x:site.x,y:site.y-280};
  assert.equal(navigation.find(site,target,13,'air'),null,`${region}: a closed prison has no exit`);
  g.relicSites.openGate(site.id);
  for(const [radius,profile] of [[13,'air'],[18,'ground'],[24,'ground']]){
    const route=navigation.find(site,target,radius,profile);assert(route,`${region}/${radius}/${profile}: an opened doorway connects the cage interior`);
    assert(!g.relicSites.insideRescue(site.id,route.at(-1)),`${region}: the planned route actually leaves the prison`);
    let point={x:site.x,y:site.y};
    for(const target of route){const moved=g.terrain.moveCircle(point.x,point.y,target.x-point.x,target.y-point.y,radius,profile);assert(distance(moved,target)<.01,'each planned door segment is physically traversable');point=moved;}
    assert(navigation.lastExpanded<=NAVIGATION_LIMITS.expanded);
  }
}

const completed=[];
for(const [region,kind,multiple] of [['marsh','owl',true],['ruins','owl',false],['volcano','owl',false],['mountain','owl',false],['forest','warden',false]]){
  const g=world(region),{site,member}=rescue(g,kind);
  if(multiple){
    assert(g.companions.recruit('owl',{x:site.x-28,y:site.y,sourceId:'navigation-second-owl'}));
    assert(g.companions.recruit('warden',{x:site.x+20,y:site.y+28,sourceId:'navigation-ground-ally'}));
  }
  // The hero exits through the real opening and walks around to the opposite
  // side. The followers pursue a moving leader, not a fixed synthetic target.
  // The fixed forest's prison backs onto a continuous boundary. Its real
  // rear aisle is 120 units from the prison, not the former open-field 300.
  const rear=g.terrain.island?.layout?.kind==='rift-forest'?-120:-300;
  for(const [dx,dy] of [[0,140],[140,140],[140,rear],[0,rear]])walkPlayer(g,{x:site.x+dx,y:site.y+dy});
  let frames=0;while(!g.companions.members.every(m=>exited(g,site,m))&&frames++<800)tick(g);
  assert(g.companions.members.every(m=>exited(g,site,m)),`${region}/${kind}: every rescued ally exits and catches the leader`);
  assert(g.companions.members.includes(member));completed.push({region,kind,members:g.companions.members.length,waitSeconds:frames*.025});
}

// The explicitly partial ember scene has no recruitment prison. Exercise
// actual grounded/flying followers on its real bridge and mine roads rather
// than adding a fictitious owl site to satisfy a complete-world fixture.
const sample=new Game({mode:'world',worldId:'ember-realm-large'}),sampleLayout=sample.terrain.island.layout;
sample.enemies=[];sample.gold=10000;sample.player.xpNext=sample.crystalsNext=Infinity;sample.player.invuln=1e9;
assert.equal(sampleLayout.emberScene?.sample,true);assert.equal(sampleLayout.artTheme,'ember');
assert.equal(sample.relicSites.sites.length,0,'the sample does not promise unmade recruitment sites');
for(const [kind,dx,dy] of [['owl',-40,0],['warden',20,10]])assert(sample.companions.recruit(kind,{x:sampleLayout.spawn.x+dx,y:sampleLayout.spawn.y+dy,sourceId:`qa:sample-follow:${kind}`}));
const roads=sampleLayout.emberScene.roads;
const sampleTrail=[
  sampleLayout.spawn,
  ...roads.find(road=>road.id==='west-approach').points.slice(1),
  ...sampleLayout.passages.find(passage=>passage.kind==='bridge').waypoints,
  ...roads.find(road=>road.id==='mine-main').points.slice(1)
];
for(const trail of [sampleTrail,[...sampleTrail].reverse()]){
  for(const waypoint of trail)walkPlayer(sample,waypoint);
  let frames=0;
  const caughtUp=()=>sample.companions.members.every(member=>distance(foot(member),foot(sample.player))<=member.followDistance+80);
  while(!caughtUp()&&frames++<800)tick(sample);
  assert(caughtUp(),'both real sample followers complete the bridge/mine route in each direction');
}
assert.equal(sample.companions.members.length,2,'the same actual followers finish the sample route');
completed.push({region:sample.worldId,partial:true,members:sample.companions.members.length,waypoints:sampleTrail.length,directions:2});

// A short straight-line distance through the back wall must not suppress the
// move order. Previously an owl could stay in the cage indefinitely at 150u.
const near=world('marsh'),nearRescue=rescue(near,'owl');
for(const [dx,dy] of [[0,140],[140,140],[140,-150],[0,-150]])walkPlayer(near,{x:nearRescue.site.x+dx,y:nearRescue.site.y+dy});
for(let i=0;i<800&&!exited(near,nearRescue.site,nearRescue.member);i++)tick(near);
assert(exited(near,nearRescue.site,nearRescue.member),'nearby leader behind a wall still receives its companion');

// A legal body resting against a wall lacks the extra planning margin. It
// must walk away into the route, rather than repeatedly searching zero nodes.
const tight=world('mountain'),{site,member}=rescue(tight,'owl');
member.x=site.x+37;member.y=site.y-27.98-groundOffset(member,true);
placePlayer(tight,{x:site.x,y:site.y-300});
assert(tight.terrain.isFree(foot(member).x,foot(member).y,member.r,'air'));
assert(!tight.terrain.isFree(foot(member).x,foot(member).y,member.r+3,'air'),'fixture starts legally against the inner wall');
for(let i=0;i<800&&!exited(tight,site,member);i++)tick(tight);
assert(exited(tight,site,member),'a touching body can recover its route without teleporting');
console.log(JSON.stringify({companionNavigation:'passed',completed,coverage:'all ten complete-world gates, real rescues, sample bridge/mine followers in both directions, moving leader, duplicate flyers with grounded ally, nearby leader behind wall, touching-body attachment, bounded searches and collision replay'}));
