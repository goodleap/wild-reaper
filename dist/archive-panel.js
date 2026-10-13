import { ARCHIVE_CATEGORIES, ARCHIVE_ENTRIES, ARCHIVE_ENTRY_BY_ID } from './archive-catalog.js';
import { MonsterArt } from './monster-art.js';
import { CombatArt } from './combat-art.js';
import { drawSwordBlade } from './sword-art.js';
import { drawOrbitBlade } from './prop-art.js';
import { HumanoidArt } from './humanoid-art.js';
import { CompanionArt, COMPANION_VISUALS } from './companion-art.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString('zh-CN');
const duration=value=>{const seconds=Math.max(0,Math.floor(Number(value)||0)),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);return hours?`${hours} 小时 ${minutes} 分`:`${minutes} 分 ${seconds%60} 秒`;};
const seen=(data,entry)=>!!data?.entries?.[entry.id]?.seen;
const knownCount=(data,category)=>ARCHIVE_ENTRIES.filter(entry=>(!category||entry.category===category)&&seen(data,entry)).length;
const enemyEntry=entry=>entry.category==='enemies'||entry.category==='bosses';
const safeChoice=(value,choices,fallback)=>choices.includes(value)?value:fallback;
const bestTime=data=>Math.max(data?.best?.normal?.time||0,data?.best?.casual?.time||0);

export function archiveMilestones(data={}){
  const totals=data.totals||{},entries=data.entries||{};
  const branches=Object.values(entries).reduce((sum,entry)=>sum+(Array.isArray(entry.branches)?entry.branches.length:0),0);
  const skills=knownCount(data,'skills')+knownCount(data,'weaponSkills');
  const companions=ARCHIVE_ENTRIES.filter(entry=>entry.category==='companions'&&entries[entry.id]?.acquisitions>0).length;
  return [
    {id:'first-victory',name:'踏出第一步',description:'累计击败 1 个敌人',progress:totals.kills||0,target:1},
    {id:'field-notes',name:'林间观察者',description:'发现 6 种怪物',progress:knownCount(data,'enemies'),target:6},
    {id:'armed-explorer',name:'三般武艺',description:'获得全部 3 种武器',progress:knownCount(data,'weapons'),target:3},
    {id:'first-boss',name:'挑战领主',description:'击败 1 位首领',progress:totals.bossKills||0,target:1},
    {id:'survivor',name:'长路未尽',description:'单局存活 10 分钟',progress:Math.floor(bestTime(data)),target:600,unit:'time'},
    {id:'branch-explorer',name:'另辟蹊径',description:'体验 3 种武器或技能分支',progress:branches,target:3},
    {id:'skill-explorer',name:'力量的回响',description:'获得 6 种技能或武器技能',progress:skills,target:6},
    {id:'fellow-travelers',name:'并肩前行',description:'招募 3 种伙伴',progress:companions,target:3},
    {id:'veteran',name:'荒野历练',description:'累计击败 1,000 个敌人',progress:totals.kills||0,target:1000}
  ].map(item=>({...item,progress:Math.min(item.target,Math.max(0,item.progress)),complete:item.progress>=item.target}));
}

function vectorArt(entry){
  const id=entry.modifierId||entry.ownerId||'',sword='<path d="M24 43 46 10 52 6 51 14 29 47Z" fill="currentColor" opacity=".72"/><path d="m25 43 25-35M20 41l13 9M25 47l-8 11"/>',arrow='<path d="m12 52 39-39m-11 0h11v11M12 43v9h9M17 38v9h9"/>';
  const paths={
    barrier:'<path d="m32 7 21 8v17c0 12-12 22-21 26-9-4-21-14-21-26V15Z" fill="currentColor" opacity=".13"/><path d="m32 7 21 8v17c0 12-12 22-21 26-9-4-21-14-21-26V15Zm0 8v33m-13-28 13-5 13 5"/>',
    pulse:'<ellipse cx="32" cy="40" rx="26" ry="13" opacity=".38"/><ellipse cx="32" cy="37" rx="17" ry="9"/><path d="m22 28 10-16 10 16m-10-16v27M12 31l-4-5m48 0-4 5"/>',
    lightning:'<path d="m38 6-20 28h13l-5 24 22-32H34Z" fill="currentColor" opacity=".72"/><path d="m15 16-8 8 7 5m35 13 8-8-7-5" opacity=".6"/>',
    storm:'<path d="M10 24c-8-9 8-19 14-11 3-12 20-10 22 2 13-3 17 14 7 17H15"/><path d="m23 29-8 14h8l-5 15m22-28-8 14h9l-5 14M51 33l-5 11"/>',
    domain:'<ellipse cx="32" cy="46" rx="24" ry="10" opacity=".4"/><path d="M18 47c-13-15 17-15 1-35m26 37c12-15-12-19 1-39M31 45c10-14-10-14 1-23m-8-1-11-4m26 7 14-4m-9 17 11-2"/><path d="m20 16 6-8 1 11m18 6-9-8-1 9" fill="currentColor" opacity=".5"/>',
    meteor:'<path d="m50 5-15 22M59 17 43 37M38 8 23 30" opacity=".65"/><path d="m19 32 11-6 15 9-4 15-16 8-14-10Z" fill="currentColor" opacity=".35"/><path d="m19 32 11-6 15 9-4 15-16 8-14-10Zm3 7 9-6 7 9-10 8Z"/>',
    swords:`<g transform="translate(-7 7) scale(.78)">${sword}</g><g transform="translate(11 -4) scale(.78)">${sword}</g><g transform="translate(10 18) scale(.64)">${sword}</g>`,
    vortex:'<path d="M56 28C53 6 14 4 7 28c-8 27 39 38 47 13 6-21-28-28-32-12-4 14 17 22 22 10 4-8-10-17-11-9"/><path d="m54 18 3 11-11-1M7 42l-1-11 11 2" opacity=".5"/>',
    swordEnergy:'<path d="M7 48C26 49 42 31 49 10 52 36 29 57 7 48Z" fill="currentColor" opacity=".55"/><path d="M20 58c18-6 29-20 35-35M8 38c10-2 17-10 22-21"/>',
    arrowRune:`${arrow}<path d="m31 9 23 23-23 23L8 32Z" opacity=".45"/><path d="m37 18 9 9m-28 10 9 9"/>`
  };
  return `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[id]||sword}</svg>`;
}
function portrait(entry,known,large=false){
  if(!known)return `<span class="archive-art archive-unknown${large?' archive-art-large':''}" aria-hidden="true">?</span>`;
  return `<span class="archive-art${large?' archive-art-large':''}" style="--archive-accent:${entry.color}">${enemyEntry(entry)||entry.category==='weapons'||entry.category==='companions'?`<canvas width="256" height="224" data-archive-art="${entry.id}" aria-hidden="true"></canvas>`:vectorArt(entry)}</span>`;
}
function entryButton(entry,data,selected){
  const known=seen(data,entry),record=data.entries?.[entry.id]||{},status=!known?'未发现':enemyEntry(entry)?record.defeats?'已击败':'已发现':entry.category==='companions'?record.acquisitions?'已同行':'已发现':'已获得';
  return `<button type="button" class="archive-card${known?'':' is-unknown'}${selected?' is-selected':''}" data-archive-entry="${entry.id}" aria-pressed="${selected}" aria-label="${escape(known?entry.name:'未发现条目')}，${status}">${portrait(entry,known)}<strong>${known?escape(entry.name):'未发现'}</strong><small>${status}</small></button>`;
}
function detailHTML(entry,data){
  const known=seen(data,entry),record=data.entries?.[entry.id]||{};
  if(!known)return `<section class="archive-detail archive-detail-unknown" data-archive-detail tabindex="-1">${portrait(entry,false,true)}<h3>尚未发现</h3><p>${enemyEntry(entry)||entry.category==='companions'?'在冒险中遇见它，便能留下第一份记录。':'在冒险中获得这项能力，便能查看它的特色与成长路线。'}</p></section>`;
  if(entry.category==='companions')return `<section class="archive-detail" data-archive-detail tabindex="-1"><div class="archive-detail-heading">${portrait(entry,true,true)}<div><span class="archive-kicker">${escape(entry.role)}</span><h3>${escape(entry.name)}</h3><p class="archive-source">${escape(entry.source)}</p></div></div><p class="archive-description">${escape(entry.description)}</p><div class="archive-entry-stats"><span>同行对局 <strong>${number(record.acquisitions)}</strong></span></div><div class="archive-detail-section"><h4>同行提示</h4><p>${escape(entry.advice)}</p></div><p class="archive-small-note">招募后自动跟随与行动，定期消耗金币维持；在角色面板中查看队伍状态与费用。</p></section>`;
  const combat=enemyEntry(entry),defeated=record.defeats>0;
  return `<section class="archive-detail" data-archive-detail tabindex="-1"><div class="archive-detail-heading">${portrait(entry,true,true)}<div><span class="archive-kicker">${escape(entry.role)}${entry.tier==='super'?' · 超级':''}</span><h3>${escape(entry.name)}</h3><p class="archive-source">${escape(entry.source)}</p></div></div><p class="archive-description">${escape(entry.description)}</p><div class="archive-entry-stats">${combat?`<span>累计击败 <strong>${number(record.defeats)}</strong></span>`:`<span>获得对局 <strong>${number(record.acquisitions)}</strong></span><span>最高等级 <strong>Lv.${number(record.maxLevel)}</strong></span>`}</div>${entry.growth?`<div class="archive-detail-section"><h4>成长方式</h4><p>${escape(entry.growth)}</p></div>`:''}${entry.branches.length?`<div class="archive-detail-section"><h4>可选分支 <small>每局选择一条</small></h4><div class="archive-branches">${entry.branches.map(branch=>`<div class="archive-branch"><strong>${escape(branch.name)}${record.branches?.includes(branch.id)?'<span>已体验</span>':''}</strong><p>${escape(branch.description)}</p></div>`).join('')}</div></div>`:''}${entry.evolution&&entry.ownerId==='orbit'?`<div class="archive-detail-section"><h4>${escape(entry.evolution.name)}${record.evolved?'<small>已达成</small>':''}</h4><p>${escape(entry.evolution.desc)}</p></div>`:''}<div class="archive-detail-section"><h4>${combat?'战斗心得':'搭配提示'}</h4><p${combat&&!defeated?' class="archive-muted"':''}>${combat&&!defeated?'首次击败后解锁。':escape(entry.advice)}</p></div>${combat?'<p class="archive-small-note">同类怪物可能出现精英变体，留意护盾、迅捷或召唤标记。</p>':''}</section>`;
}
function codexHTML(data,category,selectedId){
  const list=ARCHIVE_ENTRIES.filter(entry=>entry.category===category),selected=list.find(entry=>entry.id===selectedId)||list.find(entry=>seen(data,entry))||list[0];
  return `<div class="archive-categories" aria-label="图鉴分类">${ARCHIVE_CATEGORIES.map(item=>{const count=knownCount(data,item.id),total=ARCHIVE_ENTRIES.filter(entry=>entry.category===item.id).length;return `<button type="button" data-archive-category="${item.id}" aria-pressed="${item.id===category}">${item.name}<small>${count}/${total}</small></button>`;}).join('')}</div><div class="archive-codex-layout"><div class="archive-index"><div class="archive-grid" aria-label="${ARCHIVE_CATEGORIES.find(item=>item.id===category).name}条目">${list.map(entry=>entryButton(entry,data,entry===selected)).join('')}</div></div>${detailHTML(selected,data)}</div>`;
}
function stat(label,value,unit=''){return `<div class="archive-stat"><span>${label}</span><strong>${value}${unit?`<small>${unit}</small>`:''}</strong></div>`;}
function recordsHTML(data,difficulty){
  const totals=data.totals||{},best=data.best?.[difficulty]||{},legacy=data.legacy;
  return `<div class="archive-records"><h3>一路走来</h3><div class="archive-stats-grid">${stat('冒险次数',number(totals.runs))}${stat('累计存活',duration(totals.time))}${stat('累计击败',number(totals.kills))}${stat('首领击败',number(totals.bossKills))}${stat('图鉴发现',`${knownCount(data)}<small> / ${ARCHIVE_ENTRIES.length}</small>`)}${stat('最高角色等级',number(totals.maxLevel))}</div><div class="archive-records-heading"><h3>单局最佳</h3><div class="archive-difficulties" aria-label="纪录难度"><button type="button" data-archive-difficulty="normal" aria-pressed="${difficulty==='normal'}">标准试炼</button><button type="button" data-archive-difficulty="casual" aria-pressed="${difficulty==='casual'}">轻松漫游</button></div></div><div class="archive-stats-grid archive-best-grid">${stat('最长存活',duration(best.time))}${stat('最多击败',number(best.kills))}${stat('最多首领',number(best.bossKills))}${stat('最高等级',number(best.level))}${stat('最高波次',number(best.wave))}</div><p class="archive-small-note">不同难度分别记录最佳成绩；各项纪录可能来自不同对局。</p>${legacy&&(legacy.time||legacy.kills||legacy.bossKills)?`<div class="archive-legacy"><h4>早期纪录</h4><p>最长存活 ${duration(legacy.time)} · 最多击败 ${number(legacy.kills)}${legacy.bossKills?` · 最多首领 ${number(legacy.bossKills)}`:''}</p><span>早期版本未区分难度与调试，单独保留，不计入新的累计统计。</span></div>`:''}</div>`;
}
function milestonesHTML(data){
  const items=archiveMilestones(data),completed=items.filter(item=>item.complete).length;
  return `<div class="archive-milestones-heading"><h3>冒险的足迹</h3><span>${completed} / ${items.length} 已达成</span></div><p class="archive-small-note">记录探索与挑战的成果，不提供战斗属性加成。</p><div class="archive-milestones">${items.map(item=>`<div class="archive-milestone${item.complete?' is-complete':''}"><span class="archive-milestone-mark" aria-hidden="true">${item.complete?'✓':'◇'}</span><div><h4>${item.name}</h4><p>${item.description}</p><div class="archive-progress" role="progressbar" aria-label="${item.name}" aria-valuenow="${item.progress}" aria-valuemin="0" aria-valuemax="${item.target}"><i style="width:${Math.min(100,100*item.progress/item.target)}%"></i></div></div><span class="archive-milestone-status">${item.complete?'已达成':item.unit==='time'?`${Math.floor(item.progress/60)} / ${item.target/60} 分`:`${number(item.progress)} / ${number(item.target)}`}</span></div>`).join('')}</div>`;
}
export function archivePanelHTML(data={},options={}){
  const tab=safeChoice(options.tab,['codex','records','milestones'],'codex'),category=safeChoice(options.category,ARCHIVE_CATEGORIES.map(item=>item.id),'enemies'),difficulty=safeChoice(options.difficulty,['normal','casual'],'normal');
  const progress=`${knownCount(data)} / ${ARCHIVE_ENTRIES.length}`;
  return `<div class="archive-overview"><span>每次冒险，都留下新的发现</span><strong>已发现 ${progress}</strong></div><nav class="archive-tabs" aria-label="档案栏目">${[['codex','图鉴'],['records','记录'],['milestones','里程碑']].map(([id,label])=>`<button type="button" data-archive-tab="${id}" aria-pressed="${id===tab}">${label}</button>`).join('')}</nav>${options.storageOk===false?'<p class="archive-notice archive-warning" role="status">浏览器暂时无法保存，当前记录仅在本次页面中保留。</p>':''}<div class="archive-body">${tab==='codex'?codexHTML(data,category,options.selectedId):tab==='records'?recordsHTML(data,difficulty):milestonesHTML(data)}</div><p class="archive-storage-note">记录保存在当前浏览器与本站点，尚不跨设备或站点同步。</p>`;
}

let monsterArt=null,combatArt=null,humanoidArt=null,companionArt=null;
function drawWeaponPortrait(ctx,entry){
  ctx.translate(64,56);ctx.lineJoin='round';ctx.lineCap='round';
  // Reuse the gameplay vectors, drawn directly at the portrait resolution.
  // Only framing changes: no enlarged sprite cache or separate icon geometry.
  if(entry.ownerId==='sword'){
    ctx.rotate(-Math.PI/4);ctx.scale(1.65,1.65);ctx.translate(-30,0);
    drawSwordBlade(ctx,60,2.45);
  }else if(entry.ownerId==='arrow'){
    combatArt ||= new CombatArt();
    ctx.rotate(-Math.PI/4);ctx.scale(2.65,2.65);
    combatArt.drawArrow(ctx,{x:2.5,y:0,angle:0},{reduced:true});
  }else if(entry.ownerId==='orbit'){
    ctx.rotate(Math.PI/4);ctx.scale(2.6,2.6);ctx.translate(0,2.5);
    drawOrbitBlade(ctx);
  }
}
function drawCompanionPortrait(ctx,entry){
  const human=entry.kind==='stormcaller'||entry.kind==='warden';
  const shape=COMPANION_VISUALS[entry.kind],top=human?42:shape?.top||33,foot=human?18:shape?.foot||16;
  const scale=Math.min(1.4,88/(top+foot));
  ctx.translate(64,56+(top-foot)*scale/2);ctx.scale(scale,scale);
  const options={entity:{id:entry.kind,kind:entry.kind,heroId:entry.kind,facing:0,isCompanion:true},time:1,reduced:true,pixelRatio:2};
  if(human){humanoidArt ||= new HumanoidArt();humanoidArt.draw(ctx,entry.kind,options);}
  else {companionArt ||= new CompanionArt();companionArt.draw(ctx,entry.kind,options);}
}
// Paint on panel changes only. The archive has no RAF or gameplay-frame work.
export function drawArchiveArt(container){
  const canvases=container?.querySelectorAll?.('canvas[data-archive-art]')||[];
  for(const canvas of canvases){
    const entry=ARCHIVE_ENTRY_BY_ID.get(canvas.dataset?.archiveArt),ctx=canvas.getContext?.('2d');
    if(!entry||!ctx)continue;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width/128,canvas.height/112);
    if(entry.category==='weapons'){drawWeaponPortrait(ctx,entry);ctx.restore();continue;}
    if(entry.category==='companions'){drawCompanionPortrait(ctx,entry);ctx.restore();continue;}
    monsterArt ||= new MonsterArt();ctx.translate(64,65);
    const scale=entry.type==='boss'?.78:1.38;ctx.scale(scale,scale);
    monsterArt.draw(ctx,{type:entry.type,bossKind:entry.bossKind,id:0,x:0,y:0,r:entry.type==='boss'?49:18,hp:1,hit:0,walkPhase:0,visualFacing:0},{time:0,reduced:true,playerX:1});ctx.restore();
  }
}
