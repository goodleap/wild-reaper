import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=fileURLToPath(new URL('./',import.meta.url));
const originalHTML=readFileSync(resolve(root,'dist/index.html'),'utf8');
const temporary=mkdtempSync(join(tmpdir(),'wild-reaper-release-'));
const page=resolve(temporary,'dist/index.html');
const readPage=()=>readFileSync(page,'utf8');
const assetHash=file=>createHash('sha256').update(readFileSync(resolve(temporary,'dist',file))).digest('hex').slice(0,12);
function stamp(count,expectedError){
  const result=spawnSync(process.execPath,['scripts/stamp-version.mjs','--commit-count',String(count)],{cwd:temporary,encoding:'utf8'});
  if(expectedError){
    assert.notEqual(result.status,0,'invalid releases must fail');
    assert.match(result.stderr,expectedError);
  }else{
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),`v0.0.${count}`);
  }
}
function release(html,count){
  const maps=[...html.matchAll(/<script type="importmap" id="release-imports">([\s\S]*?)<\/script>/g)];
  assert.equal(maps.length,1);
  const imports=JSON.parse(maps[0][1]).imports;
  const entry=html.match(/<script type="module" src="([^"]+)"><\/script>/);
  assert.ok(entry,'versioned module entry exists');
  assert.ok(maps[0].index<entry.index,'import map must precede module loading');
  const entryURL=entry[1].replaceAll('&amp;','&');
  assert.equal(entryURL,`./bootstrap.js?v=v0.0.${count}&h=${assetHash('bootstrap.js')}`);
  assert.equal(html.match(/id="game-version"[^>]*>([^<]+)</)?.[1],`v0.0.${count}`);
  const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match=>match[1].replaceAll('&amp;','&'));
  assert.ok(styles.length>=3);
  for(const url of [entryURL,...styles,...Object.values(imports)]){
    assert.ok(url.startsWith('./'),'URLs must work below a GitHub Pages repository path');
    const resolved=new URL(url,'https://example.test/wild-reaper/');
    assert.deepEqual(resolved.searchParams.getAll('v'),[`v0.0.${count}`]);
    assert.deepEqual(resolved.searchParams.getAll('h'),[assetHash(decodeURIComponent(resolved.pathname.slice('/wild-reaper/'.length)))]);
  }
  return {imports,entry:entryURL,styles};
}
function moduleFiles(directory,prefix=''){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?moduleFiles(join(directory,entry.name),prefix+entry.name+'/'):entry.name.endsWith('.js')?[prefix+entry.name]:[]);
}
// Exact-URL import-map resolution, including normalization against a versioned
// referring module. This is a cache-identity regression, not a browser UI test.
function resolveImport(imports,specifier,parent,documentURL){
  const requested=new URL(specifier,parent).href;
  const match=Object.entries(imports).find(([key])=>new URL(key,documentURL).href===requested);
  return match?new URL(match[1],documentURL).href:requested;
}

try{
  mkdirSync(resolve(temporary,'scripts'));
  cpSync(resolve(root,'scripts/stamp-version.mjs'),resolve(temporary,'scripts/stamp-version.mjs'));
  cpSync(resolve(root,'scripts/build-content-config.mjs'),resolve(temporary,'scripts/build-content-config.mjs'));
  writeFileSync(resolve(temporary,'package.json'),JSON.stringify({type:'module'}));
  cpSync(resolve(root,'dist'),resolve(temporary,'dist'),{recursive:true});
  mkdirSync(resolve(temporary,'dist/release-fixture'));
  writeFileSync(resolve(temporary,'dist/release-fixture/child.js'),"import { value } from '../shared edge.js';\nexport { value };\n");
  writeFileSync(resolve(temporary,'dist/shared edge.js'),'export const value=51;\n');
  writeFileSync(resolve(temporary,'dist/safe<edge.js'),'export const value=51;\n');
  writeFileSync(page,readPage().replace('</head>','<link rel="stylesheet" href="./style.css?theme=forest&amp;v=v0.0.3#hud">\n</head>'));

  stamp(51);
  const first=readPage();
  const version51=release(first,51);
  assert.equal(version51.styles.at(-1),`./style.css?theme=forest&v=v0.0.51&h=${assetHash('style.css')}#hud`,'other query values survive stamping');
  for(const file of moduleFiles(resolve(temporary,'dist'))){
    const key='./'+file.split('/').map(encodeURIComponent).join('/');
    assert.equal(version51.imports[key],`${key}?v=v0.0.51&h=${assetHash(file)}`,`${file} is bound to this release and its exact content`);
  }
  assert.ok(!first.match(/<script type="importmap"[^>]*>[^]*?safe<edge/),'asset names cannot introduce HTML in an inline map');

  for(const documentURL of ['https://game.example/','https://goodleap.github.io/wild-reaper/','https://goodleap.github.io/wild-reaper/index.html?debug']){
    const entry=new URL(version51.entry,documentURL).href;
    const engine=resolveImport(version51.imports,'./engine.js',entry,documentURL);
    const panel=resolveImport(version51.imports,'./character-panel.js',entry,documentURL);
    const stats=resolveImport(version51.imports,'./combat-stats.js',engine,documentURL);
    assert.equal(stats,resolveImport(version51.imports,'./combat-stats.js',panel,documentURL),'shared imports use one release identity');
    const catalog=resolveImport(version51.imports,'./combat-catalog.js',stats,documentURL);
    for(const url of [entry,engine,panel,stats,catalog])assert.equal(new URL(url).searchParams.get('v'),'v0.0.51');
    const oldCache=new Map();
    for(const file of ['app.js','engine.js','character-panel.js','combat-stats.js','combat-catalog.js']){
      oldCache.set(new URL('./'+file,documentURL).href,'stale unversioned response');
      oldCache.set(new URL('./'+file+'?v=v0.0.50',documentURL).href,'previous release response');
    }
    assert.ok(oldCache.has(new URL('./engine.js',entry).href),'versioning only the entry would still reuse the stale dependency');
    for(const url of [entry,engine,panel,stats,catalog])assert.equal(oldCache.has(url),false,'new HTML cannot reuse these previous release cache keys');
    const child=new URL('./release-fixture/child.js?v=v0.0.51',documentURL).href;
    const shared=resolveImport(version51.imports,'../shared edge.js',child,documentURL);
    assert.equal(shared,new URL(`./shared%20edge.js?v=v0.0.51&h=${assetHash('shared edge.js')}`,documentURL).href,'nested modules normalize to the document import map');
  }

  stamp(51);
  assert.equal(readPage(),first,'same release stamping is idempotent');
  for(const file of ['character-hud.css','combat-stats.js']){
    const asset=resolve(temporary,'dist',file);
    writeFileSync(asset,readFileSync(asset,'utf8')+'\n/* Same-version content correction. */\n');
  }
  stamp(51);
  const revised=release(readPage(),51);
  assert.equal(revised.entry,version51.entry,'unchanged entry keeps its content identity');
  assert.notEqual(revised.styles[2],version51.styles[2],'same-version CSS correction bypasses its previous cache key');
  assert.notEqual(revised.imports['./combat-stats.js'],version51.imports['./combat-stats.js'],'same-version transitive module correction bypasses its previous cache key');
  const revisedHTML=readPage();
  stamp(51);
  assert.equal(readPage(),revisedHTML,'corrected release is also idempotent');
  stamp(52);
  release(readPage(),52);
  assert.ok(!readPage().includes('?v=v0.0.51'),'advancing the release removes previous asset bindings');
  const valid=readPage();
  stamp(0,/positive safe integer/);
  assert.equal(readPage(),valid,'invalid counts cannot partially change the page');

  writeFileSync(resolve(temporary,'dist/release-fixture/missing.js'),"import './does-not-exist.js';\n");
  stamp(53,/Missing local release asset/);
  assert.equal(readPage(),valid,'missing transitive modules fail before writing');
  rmSync(resolve(temporary,'dist/release-fixture/missing.js'));
  writeFileSync(page,valid.replace('href="./style.css?','href="./missing.css?'));
  const missingCSS=readPage();
  stamp(53,/Missing local release asset/);
  assert.equal(readPage(),missingCSS,'missing CSS fails before writing');
  writeFileSync(page,valid.replace('src="./bootstrap.js?','src="./missing-entry.js?'));
  stamp(53,/Missing local release asset/);

  assert.equal(readFileSync(resolve(root,'dist/index.html'),'utf8'),originalHTML,'QA must not stamp the working checkout');
  console.log('Release assets QA passed: entry, CSS and transitive module cache identities, relative hosting, idempotency and missing-asset guards.');
}finally{
  rmSync(temporary,{recursive:true,force:true});
}
