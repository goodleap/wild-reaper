import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {COMPANION_DEFINITIONS,COMPANION_FOLLOW_RULES as RULES} from './dist/companion-catalog.js';

const arena=()=>{
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g.gold=1000;
  g._spawn=g._shot=g.nextBossAt=g.player.xpNext=g.crystalsNext=Infinity;
  g._updatePressure=()=>{};g.build.setEquipped('sword',false);
  return g;
};
const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,true)});
const place=(entity,x,y)=>{entity.x=x;entity.y=y-groundOffset(entity,true);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const tick=(g,seconds)=>{for(let left=seconds;left>1e-8;left-=.025){const dt=Math.min(.025,left);g.time+=dt;g.runTime+=dt;g.companions.update(dt);}};
const unchanged=(member,point,message)=>assert(distance(foot(member),point)<1e-8,message);

// Run each body's normal movement through the real companion and terrain
// systems. No fixed trailing angle or exact preferred stopping point is used.
for(const def of COMPANION_DEFINITIONS){
  const g=arena();place(g.player,0,0);
  const member=g.companions.recruit(def.kind,{x:-(def.followDistance+30),y:0});
  const original=foot(member),phase=member.walkPhase;
  for(let n=0;n<48;n++){
    const angle=n*Math.PI/3;
    place(g.player,Math.cos(angle)*20,Math.sin(angle)*20);g.player.facing=angle;
    tick(g,.05);
    unchanged(member,original,`${def.kind} stays put during small leader adjustments`);
  }
  assert.equal(member.walkPhase,phase,`${def.kind} does not animate walking while holding position`);

  place(g.player,original.x+def.followDistance+RULES.restartGap+60,original.y);
  tick(g,.1);
  assert(member.x>original.x+1,`${def.kind} follows when its leader leaves the allowed range`);
  tick(g,3);
  const resting=foot(member),gap=distance(resting,foot(g.player));
  assert(gap<=def.followDistance+1,`${def.kind} returns to its comfortable distance`);
  assert(gap>=def.followDistance-15,`${def.kind} stops before crowding the leader`);
  assert.equal(member.moving,false);
  tick(g,.5);unchanged(member,resting,`${def.kind} keeps its reached location instead of circling into a slot`);

  // A stopped member tolerates the whole dead band; a moving member keeps
  // approaching through it, so threshold crossings do not cause shuffling.
  place(g.player,resting.x+def.followDistance+RULES.restartGap-1,resting.y);
  tick(g,.2);unchanged(member,resting,`${def.kind} does not restart inside the outer threshold`);
  place(g.player,resting.x+def.followDistance+RULES.restartGap+1,resting.y);
  tick(g,.05);assert(member.x>resting.x,`${def.kind} restarts beyond the outer threshold`);
  const beforeBand=foot(member);
  place(g.player,beforeBand.x+def.followDistance+RULES.restartGap/2,beforeBand.y);
  tick(g,.05);assert(member.x>beforeBand.x,`${def.kind} continues an active approach through the dead band`);
  const beforeStop=foot(member);
  place(g.player,beforeStop.x+def.followDistance-1,beforeStop.y);
  tick(g,.05);unchanged(member,beforeStop,`${def.kind} stops as soon as it reaches the inner distance`);
}

// A leader's reversal changes the current destination immediately. The party
// never has to retrace the leader's earlier outward journey first.
const reverse=arena();place(reverse.player,320,0);
const follower=reverse.companions.recruit('stormcaller',{x:0,y:0});
tick(reverse,.2);assert(follower.x>0);
const turning=foot(follower);place(reverse.player,turning.x-320,turning.y);
tick(reverse,.1);assert(follower.x<turning.x,'a turning leader is followed at the current position');

// Existing members retain their actual resting positions across roster edits.
const roster=arena();place(roster.player,0,0);
const mage=roster.companions.recruit('stormcaller',{x:-120,y:0});
const warden=roster.companions.recruit('warden',{x:-75,y:0});
const held=[foot(mage),foot(warden)];
assert(distance(...held)<54,'fixture deliberately uses a natural spacing narrower than the old formation');
tick(roster,.25);
unchanged(mage,held[0],'noncontact allies are not pushed into a formation');
unchanged(warden,held[1],'noncontact allies preserve nearby resting positions');
const newcomer=roster.companions.recruit('owl',{x:50,y:100});
tick(roster,.25);
unchanged(mage,held[0],'joining members do not reposition the existing party');
unchanged(warden,held[1],'joining members do not alter an idle defender position');
assert(roster.companions.dismiss(newcomer.id));tick(roster,.25);
unchanged(mage,held[0],'departing members do not cause a new formation');
unchanged(warden,held[1],'departing members leave existing locations unchanged');

// Explicit work still has its own close approach. When it ends, followers
// already inside the leader's outer range simply remain where the work ended.
const work=arena();place(work.player,0,0);
const golem=work.companions.recruit('golem',{x:0,y:0});
golem.workTarget={x:170,y:0};tick(work,2);
assert(distance(foot(golem),golem.workTarget)<RULES.taskStop+1,'rock work approaches the actual work site');
const worked=foot(golem);golem.workTarget=null;tick(work,.3);
unchanged(golem,worked,'finishing nearby work does not pull an ally back into a preferred slot');

const guide=arena();place(guide.player,0,0);
const dog=guide.companions.recruit('dog',{x:0,y:0});
dog._scan=Infinity;dog.treasureTarget={id:'test-treasure',x:300,y:0};dog._leadUntil=10;
tick(guide,2);assert(dog.x>160,'the treasure guide can still lead beyond normal stopping distance');
const guided=foot(dog);dog._leadUntil=guide.runTime;tick(guide,.3);
unchanged(dog,guided,'a guide inside the allowed range stops where its guidance ends');

console.log('Companion following: all-role idle range, approach hysteresis, current-position reversal, roster stability, contact-only spacing and independent work/guide movement passed.');
