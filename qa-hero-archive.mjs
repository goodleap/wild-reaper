import assert from 'node:assert/strict';
import { AdventureArchive, ARCHIVE_STORAGE_KEY } from './dist/adventure-archive.js';
import { archivePanelHTML } from './dist/archive-panel.js';
import { getHero } from './dist/heroes.js';

const memory=(data={})=>{const values=new Map(Object.entries(data));return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const run=(heroId,extra={})=>({hero:heroId?{id:heroId}:undefined,difficulty:'normal',runTime:0,kills:0,bossKills:0,wave:1,player:{level:1},status:'playing',stage:{id:'forest-trial',completed:false,coreDefeated:false},...extra});
const win=(archive,game,time)=>{archive.begin(game);game.runTime=time;game.status='victory';game.stage.completed=true;game.stage.coreDefeated=true;return archive.finish(game,'victory');};
const record=archive=>archive.data.stages['forest-trial'].normal;
const panel=archive=>archivePanelHTML(archive.data,{tab:'records',difficulty:'normal'});

// Existing v2 records retain their counters; a missing identity is not a prince.
{
  const old={version:2,totals:{runs:8,time:900,kills:180},stages:{'forest-trial':{normal:{clears:3,bestTime:240}}}},storage=memory({[ARCHIVE_STORAGE_KEY]:JSON.stringify(old)}),archive=new AdventureArchive({storage});
  assert.equal(archive.data.version,3);
  assert.deepEqual(record(archive),{clears:3,bestTime:240});
  assert.doesNotMatch(panel(archive),/帅气王子|美丽公主|年迈的老登/);
  const summary=win(archive,run('elder'),300);
  assert.equal(summary.stageCompletion.heroId,'elder');assert.equal(summary.stageCompletion.isBest,false);
  assert.deepEqual(record(archive),{clears:4,bestTime:240,lastHeroId:'elder'});
  assert.match(panel(archive),/最近通关 · 年迈的老登/);
  assert.equal(storage.values.size,1,'metadata reuses the current archive key');
  const refreshed=new AdventureArchive({storage});
  assert.deepEqual(record(refreshed),record(archive));
  assert.equal(refreshed.data.totals.runs,9);assert.equal(refreshed.data.totals.kills,180);
}

// Best identity belongs to the fastest run, not the latest or a tied clear.
{
  const storage=memory(),archive=new AdventureArchive({storage});
  const first=win(archive,run('princess'),200);
  assert.equal(first.stageCompletion.heroId,'princess');
  const elder=run('elder');win(archive,elder,260);
  assert.deepEqual(record(archive),{clears:2,bestTime:200,bestHeroId:'princess',lastHeroId:'elder'});
  assert.match(panel(archive),new RegExp(getHero('princess').name));
  assert.match(panel(archive),/最近通关 · 年迈的老登/);
  const saved=storage.getItem(ARCHIVE_STORAGE_KEY);
  elder.hero.id='traveler';elder.runTime=1;
  assert.equal(archive.finish(elder,'victory').stageCompletion.heroId,'elder');
  archive.finish(elder,'quit');archive.checkpoint(elder,{force:true});
  assert.equal(storage.getItem(ARCHIVE_STORAGE_KEY),saved,'repeated finish cannot rewrite hero metadata');
  win(archive,run('traveler'),200);
  assert.equal(record(archive).bestHeroId,'princess','a tied run retains the existing fastest identity');
  win(archive,run('elder'),170);
  assert.deepEqual(record(archive),{clears:4,bestTime:170,bestHeroId:'elder',lastHeroId:'elder'});
  assert.doesNotMatch(panel(archive),/最近通关/,'the same identity is not repeated below its fastest record');
  const casual=run('traveler',{difficulty:'casual'});win(archive,casual,120);
  assert.deepEqual(archive.data.stages['forest-trial'].casual,{clears:1,bestTime:120,bestHeroId:'traveler',lastHeroId:'traveler'});
  assert.deepEqual(record(new AdventureArchive({storage})),record(archive));
}

// Invalid, absent or unearned IDs never resolve through getHero's fallback.
{
  const data={version:2,stages:{'forest-trial':{normal:{clears:5,bestTime:140,bestHeroId:'retired-hero',lastHeroId:'<script>'},casual:{clears:0,bestTime:99,bestHeroId:'princess',lastHeroId:'elder'}}}};
  const archive=new AdventureArchive({storage:memory({[ARCHIVE_STORAGE_KEY]:JSON.stringify(data)})});
  assert.deepEqual(record(archive),{clears:5,bestTime:140});
  assert.deepEqual(archive.data.stages['forest-trial'].casual,{clears:0,bestTime:0});
  assert.doesNotMatch(panel(archive),/帅气王子|美丽公主|年迈的老登|&lt;script&gt;/);
  win(archive,run('princess'),100);assert.equal(record(archive).bestHeroId,'princess');
  const unknown=win(archive,run('unknown'),90);
  assert.equal(unknown.stageCompletion.heroId,null);
  assert.deepEqual(record(archive),{clears:7,bestTime:90},'an unattributed faster clear cannot inherit another character');
  const missing=win(archive,run(),80);assert.equal(missing.stageCompletion.heroId,null);
  assert.doesNotMatch(panel(archive),/帅气王子|美丽公主|年迈的老登/);
}

// A failed or abandoned run changes neither completion counts nor identities.
{
  const archive=new AdventureArchive({storage:memory()});win(archive,run('traveler'),300);
  const before={...record(archive)};
  const game=run('elder');archive.begin(game);game.runTime=50;archive.finish(game,'death');
  assert.deepEqual(record(archive),before);
}
console.log('Hero archive checks passed: v2 compatibility, validated IDs, per-run identities, fastest/latest attribution, difficulty separation, persistence and idempotent finish.');
