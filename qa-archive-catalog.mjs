import assert from 'node:assert/strict';
import { ARCHIVE_CATEGORIES, ARCHIVE_ENTRIES, ARCHIVE_IDS, enemyArchiveId, ownedArchiveEntries } from './dist/archive-catalog.js';
import { archivePanelHTML, archiveMilestones, drawArchiveArt } from './dist/archive-panel.js';
import { CombatBuild } from './dist/combat-build.js';
import { WEAPON_DEFS, SKILL_DEFS } from './dist/combat-catalog.js';
import { WEAPON_BRANCHES } from './dist/weapon-branches.js';

assert.equal(new Set(ARCHIVE_IDS).size,ARCHIVE_ENTRIES.length,'stable unique IDs');
for(const [prefix,defs] of [['weapon',WEAPON_DEFS],['skill',SKILL_DEFS]])for(const def of Object.values(defs)){
  const entry=ARCHIVE_ENTRIES.find(entry=>entry.id===`${prefix}:${def.id}`);
  assert.ok(entry,`${prefix} ${def.id} is in the archive`);
  assert.deepEqual(entry.branches.map(branch=>branch.id),(WEAPON_BRANCHES[def.id]||[]).map(branch=>branch.branch));
}
assert.equal(enemyArchiveId({type:'boss',bossKind:'bloom',dungeonBoss:true}),'boss:castle');
assert.equal(enemyArchiveId({type:'boss',bossKind:'bloom'}),'boss:bloom');
assert.equal(enemyArchiveId({type:'boss'}),'boss:ancient');
assert.equal(enemyArchiveId({type:'slime',trainingDummy:true}),null);
assert.equal(enemyArchiveId({type:'futureEnemy'}),null);

const build=new CombatBuild();
assert.deepEqual(ownedArchiveEntries(build).map(entry=>entry.id),['weapon:sword','skill:storm']);
build.levels.sword=3;build.levels.swordEnergy=2;
build.awardRuneArrow();
const owned=ownedArchiveEntries(build);
assert.ok(owned.some(entry=>entry.id==='weaponSkill:swordEnergy'&&entry.level===2));
assert.ok(owned.some(entry=>entry.id==='weaponSkill:arrowRune'&&entry.level===1));
assert.equal(owned.find(entry=>entry.id==='weapon:arrow').branch,'pierce');
assert.equal(owned.find(entry=>entry.id==='weapon:sword').level,build.getWeapon('sword').level);
assert.equal(owned.find(entry=>entry.id==='weapon:sword').modifiers.swordEnergy,2);
owned.find(entry=>entry.id==='weapon:sword').modifiers.swordEnergy=99;
assert.equal(build.getRank('swordEnergy'),2,'archive snapshot does not alias the live build');

// Hidden discoveries must not leak names, advice or drawings through markup.
for(const category of ARCHIVE_CATEGORIES){
  const html=archivePanelHTML({entries:{}},{category:category.id});
  assert.ok(html.includes('尚未发现'));
  assert.ok(!html.includes('data-archive-art='));
  for(const entry of ARCHIVE_ENTRIES)assert.ok(!html.includes(entry.name),`unseen ${entry.id} concealed`);
}
const data={entries:{'enemy:boar':{seen:true,defeats:0},'weapon:sword':{seen:true,acquisitions:2,maxLevel:7,branches:['heavy'],evolved:true}},totals:{runs:4,kills:1000,bossKills:1,time:1234,maxLevel:12},best:{normal:{time:600,kills:1000,bossKills:1,level:12,wave:9},casual:{time:80,kills:4,level:2,wave:1}}};
const seenEnemy=archivePanelHTML(data,{selectedId:'enemy:boar'});
assert.ok(seenEnemy.includes('冲锋野猪'));
assert.ok(seenEnemy.includes('首次击败后解锁'));
assert.ok(!seenEnemy.includes('看准蓄力方向'));
data.entries['enemy:boar'].defeats=1;
assert.ok(archivePanelHTML(data,{selectedId:'enemy:boar'}).includes('看准蓄力方向'));
const weapon=archivePanelHTML(data,{category:'weapons',selectedId:'weapon:sword'});
assert.ok(weapon.includes('横扫长剑')&&weapon.includes('重斩长剑'));
assert.equal((weapon.match(/已体验/g)||[]).length,1);
assert.ok(archivePanelHTML(data,{tab:'records',difficulty:'normal'}).includes('10 分 0 秒'));
assert.ok(archivePanelHTML(data,{tab:'records',difficulty:'casual'}).includes('1 分 20 秒'));
assert.ok(archivePanelHTML(data,{tab:'records',debug:true,storageOk:false}).includes('浏览器暂时无法保存'));
assert.ok(archivePanelHTML(data,{tab:'unexpected',category:'unexpected'}).includes('archive-codex-layout'));
const milestones=archiveMilestones(data);
assert.ok(milestones.find(item=>item.id==='veteran').complete);
assert.ok(milestones.find(item=>item.id==='survivor').complete);
assert.ok(!milestones.find(item=>item.id==='armed-explorer').complete);
assert.equal(archiveMilestones({}).filter(item=>item.complete).length,0);
assert.ok(archivePanelHTML(data,{tab:'milestones'}).includes('不提供战斗属性加成'));
drawArchiveArt({querySelectorAll:()=>[]});
console.log('Archive catalog and panel checks passed: catalog coverage, build ownership, spoiler gates, routes, records, milestones.');
