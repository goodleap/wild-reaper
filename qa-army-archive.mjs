import assert from 'node:assert/strict';
import { AdventureArchive, ARCHIVE_STORAGE_KEY } from './dist/adventure-archive.js';
import { ARCHIVE_ENTRIES, companionArchiveId } from './dist/archive-catalog.js';
import { COMPANION_DEFINITIONS } from './dist/companion-catalog.js';
import { archivePanelHTML, archiveMilestones, drawArchiveArt } from './dist/archive-panel.js';
import { HumanoidArt } from './dist/humanoid-art.js';
import { CompanionArt } from './dist/companion-art.js';

const memory=initial=>({data:new Map(Object.entries(initial||{})),writes:0,getItem(key){return this.data.get(key)??null;},setItem(key,value){this.writes++;this.data.set(key,value);}});
const game=()=>({difficulty:'normal',debug:true,runTime:0,kills:0,bossKills:0,player:{level:1},companions:{members:[],camp:null},relicSites:{sites:[]},_inView:entity=>entity.visible===true});
const storage=memory({[ARCHIVE_STORAGE_KEY]:JSON.stringify({version:1,totals:{runs:2,kills:19},entries:{'enemy:slime':{seen:true,defeats:19},'weapon:sword':{seen:true,acquisitions:2,maxLevel:3}}})});
const archive=new AdventureArchive({storage}),g=game();archive.begin(g);
const members=ARCHIVE_ENTRIES.filter(entry=>entry.category==='companions');
assert.equal(members.length,5);
assert.deepEqual(members.map(entry=>entry.kind),COMPANION_DEFINITIONS.map(def=>def.kind));
assert.equal(companionArchiveId('future-kind'),null);
assert.equal(archive.data.entries['enemy:slime'].defeats,19,'existing discoveries survive the expanded catalog');
assert.equal(archive.data.entries['weapon:sword'].maxLevel,3);
g.relicSites.sites=[{kind:'golem',discovered:false},{kind:'dog',discovered:true}];
g.companions.camp={kind:'owl',visible:false};archive.observe(g);
assert(archive.data.entries['companion:dog']?.seen);
assert.equal(archive.data.entries['companion:dog'].acquisitions,0,'discovery is not recruitment');
assert(!archive.data.entries['companion:golem']);assert(!archive.data.entries['companion:owl']);
g.companions.camp.visible=true;g.dungeon={active:{}};archive.observe(g);
assert(!archive.data.entries['companion:owl'],'an outdoor camp cannot be discovered from inside a castle');
g.dungeon.active=null;archive.observe(g);assert(archive.data.entries['companion:owl']?.seen);
const initialWrites=storage.writes;
assert(archive.recordRecruit(g,'dog'));assert(!archive.recordRecruit(g,{kind:'dog'}));
g.companions.members=[{kind:'dog'},{kind:'stormcaller',state:'recovering'}];
for(let i=0;i<30;i++)archive.observe(g);
assert.equal(archive.data.entries['companion:dog'].acquisitions,1);
assert.equal(archive.data.entries['companion:stormcaller'].acquisitions,1,'member snapshots recover a missed recruitment event');
assert.equal(storage.writes,initialWrites,'repeated observations do not write storage on every update');
assert(!archive.recordRecruit(g,'future-kind'));
archive.recordRecruit(g,'warden');
assert(archiveMilestones(archive.data).find(item=>item.id==='fellow-travelers').complete);
const discovered=archivePanelHTML(archive.data,{category:'companions',selectedId:'companion:owl'});
assert.match(discovered,/已发现/);assert.match(discovered,/同行对局/);assert.doesNotMatch(discovered,/最高等级/);
const hidden=archivePanelHTML({entries:{}},{category:'companions'});
assert.doesNotMatch(hidden,/data-archive-art=/);
for(const def of COMPANION_DEFINITIONS)assert(!hidden.includes(def.name),'unknown companions hide names and illustrations');
g.runTime=5;archive.checkpoint(g);assert.equal(storage.writes,initialWrites+1);
archive.finish(g);const ended=JSON.stringify(archive.data);assert(!archive.recordRecruit(g,'golem'));
archive.observe(g,{visibleCompanions:[{kind:'golem'}]});assert.equal(JSON.stringify(archive.data),ended);
const restored=new AdventureArchive({storage});assert.deepEqual(restored.data,archive.data,'new entries retain the existing save format');
const next=game();restored.begin(next);restored.recordRecruit(next,'dog');restored.finish(next);
assert.equal(restored.data.entries['companion:dog'].acquisitions,2,'recruitment counts once in each adventure, including debug');

// Portraits call the same art classes used in the live scene, not substitutes.
const painted=[],humanDraw=HumanoidArt.prototype.draw,otherDraw=CompanionArt.prototype.draw;
try{
  HumanoidArt.prototype.draw=function(_ctx,kind){painted.push(['human',kind]);return true;};
  CompanionArt.prototype.draw=function(_ctx,kind){painted.push(['other',kind]);return true;};
  const ctx={clearRect(){},save(){},restore(){},scale(){},translate(){}};
  const canvases=members.map(entry=>({width:256,height:224,dataset:{archiveArt:entry.id},getContext:()=>ctx}));
  drawArchiveArt({querySelectorAll:()=>canvases});
  assert.deepEqual(painted,[['human','stormcaller'],['human','warden'],['other','dog'],['other','owl'],['other','golem']]);
}finally{HumanoidArt.prototype.draw=humanDraw;CompanionArt.prototype.draw=otherDraw;}
console.log('Army archive checks passed: safe discovery, recruitment deduplication, save compatibility, bounded writes and real character portraits.');
