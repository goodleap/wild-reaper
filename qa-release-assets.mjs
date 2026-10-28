import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CHARACTER_SPRITE_ATLASES } from './dist/character-sprite-manifest.js';

const root=fileURLToPath(new URL('./',import.meta.url));
const originalHTML=readFileSync(resolve(root,'dist/index.html'),'utf8');
const temporary=mkdtempSync(join(tmpdir(),'wild-reaper-release-'));
const page=resolve(temporary,'dist/index.html');
const readPage=()=>readFileSync(page,'utf8');
const assetHash=file=>createHash('sha256').update(readFileSync(resolve(temporary,'dist',file))).digest('hex').slice(0,12);
const expectedAssets=['./content-pack.json','./assets/units/frostcrown-0d4e3d938dc5e6e0.png',...Object.values(CHARACTER_SPRITE_ATLASES).map(atlas=>atlas.path)];
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
  const manifests=[...html.matchAll(/<script type="application\/json" id="boot-resources">([\s\S]*?)<\/script>/g)];
  assert.equal(manifests.length,1,'one inline boot resource manifest is generated');
  const boot=JSON.parse(manifests[0][1]);
  assert.deepEqual(Object.keys(boot.groups),['config','art','app']);
  const entry=html.match(/<script type="module" src="([^"]+)"><\/script>/);
  assert.ok(entry,'versioned module entry exists');
  assert.ok(maps[0].index<entry.index,'import map must precede module loading');
  assert.ok(maps[0].index<manifests[0].index&&manifests[0].index<entry.index,'boot metadata accompanies the import map before module loading');
  const entryURL=entry[1].replaceAll('&amp;','&');
  assert.equal(entryURL,`./bootstrap.js?h=${assetHash('bootstrap.js')}`);
  assert.equal(html.match(/id="game-version"[^>]*>([^<]+)</)?.[1],`v0.0.${count}`);
  const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match=>match[1].replaceAll('&amp;','&'));
  assert.ok(styles.length>=3);
  for(const url of [entryURL,...styles,...Object.values(imports)]){
    assert.ok(url.startsWith('./'),'URLs must work below a GitHub Pages repository path');
    const resolved=new URL(url,'https://example.test/wild-reaper/');
    assert.deepEqual(resolved.searchParams.getAll('v'),[],'release numbers do not invalidate unchanged resource caches');
    assert.deepEqual(resolved.searchParams.getAll('h'),[assetHash(decodeURIComponent(resolved.pathname.slice('/wild-reaper/'.length)))]);
  }
  for(const [group,resources] of Object.entries(boot.groups)){
    assert.ok(resources.length>0,`${group} includes its entry module`);
    assert.equal(new Set(resources.map(([file])=>file)).size,resources.length,`${group} counts shared and cyclic dependencies once`);
    for(const [file,bytes] of resources){
      assert.ok(Object.hasOwn(imports,file),'boot module paths share the import map keys');
      const url=new URL(file,'https://example.test/wild-reaper/');
      assert.equal(bytes,readFileSync(resolve(temporary,'dist',decodeURIComponent(url.pathname.slice('/wild-reaper/'.length)))).length,`${file} reports exact on-disk bytes`);
    }
  }
  assert.deepEqual(Object.keys(boot.assets),[...new Set(expectedAssets)]);
  for(const file of ['./boot-art.js','./enemy-art/frostcrown-assets.js','./character-sprites.js','./character-sprite-manifest.js']){
    assert(boot.groups.art.some(([path])=>path===file),`${file} belongs to the art boot closure`);
  }
  for(const [file,bytes] of Object.entries(boot.assets))assert.equal(bytes,readFileSync(resolve(temporary,'dist',file)).length,`${file} reports exact asset bytes`);
  return {imports,entry:entryURL,styles,boot};
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
  stamp(51);
  const baseline=release(readPage(),51);
  mkdirSync(resolve(temporary,'dist/release-fixture'));
  writeFileSync(resolve(temporary,'dist/release-fixture/child.js'),"import { value } from '../shared edge.js';\nexport { value };\n");
  writeFileSync(resolve(temporary,'dist/shared edge.js'),'export const value=51;\n');
  writeFileSync(resolve(temporary,'dist/safe<edge.js'),'export const value=51;\n');
  const fixtures={
    'boot-entry.js':`import './cycle.js'; export { value } from '../shared edge.js';
export * from './reexport.js';
export * as named from './namespace.js';
const later=()=>import('./dynamic-only.js');
const example=\`\nimport './comment-only.js';\n\`;
/*
import './comment-only.js';
*/
`,
    'cycle.js':"import './boot-entry.js';\nexport const marker='循环😀';\n",
    'reexport.js':"export { value } from '../safe<edge.js';\n",
    'namespace.js':"export const title='霜冠雪原😀';\n",
    'dynamic-only.js':"import './dynamic-child.js';\nexport const later=1;\n",
    'dynamic-child.js':'export const later=2;\n',
    'comment-only.js':'export const ignored=1;\n',
    'unused.js':'export const unused=1;\n',
    'app-only.js':"import './app-child.js';\n",
    'app-child.js':"export const label='应用依赖';\n"
  };
  for(const [file,source] of Object.entries(fixtures))writeFileSync(resolve(temporary,'dist/release-fixture',file),source);
  for(const [file,specifier] of [['content-config.js','./release-fixture/boot-entry.js'],['enemy-art/frostcrown-assets.js','../release-fixture/boot-entry.js'],['app.js','./release-fixture/app-only.js']]){
    const path=resolve(temporary,'dist',file);
    writeFileSync(path,readFileSync(path,'utf8')+`\nimport '${specifier}';\n`);
  }
  writeFileSync(page,readPage().replace('</head>','<link rel="stylesheet" href="./style.css?theme=forest&amp;v=v0.0.3#hud">\n</head>'));

  stamp(51);
  const first=readPage();
  const version51=release(first,51);
  assert.equal(version51.styles.at(-1),`./style.css?theme=forest&h=${assetHash('style.css')}#hud`,'other query values and fragments survive while the old release query is removed');
  for(const file of moduleFiles(resolve(temporary,'dist'))){
    const key='./'+file.split('/').map(encodeURIComponent).join('/');
    assert.equal(version51.imports[key],`${key}?h=${assetHash(file)}`,`${file} is bound to its exact content`);
  }
  assert.ok(!first.match(/<script type="importmap"[^>]*>[^]*?safe<edge/),'asset names cannot introduce HTML in an inline map');
  assert.ok(!first.match(/<script type="application\/json" id="boot-resources">[^]*?safe<edge/),'boot metadata also escapes HTML-sensitive paths');
  const common=['./release-fixture/boot-entry.js','./release-fixture/cycle.js','./release-fixture/reexport.js','./release-fixture/namespace.js','./shared%20edge.js','./safe%3Cedge.js'];
  for(const group of ['config','art','app']){
    const expected=new Set([...baseline.boot.groups[group].map(([file])=>file),...common,...(group==='app'?['./release-fixture/app-only.js','./release-fixture/app-child.js']:[])]);
    assert.deepEqual(new Set(version51.boot.groups[group].map(([file])=>file)),expected,`${group} is exactly its static closure, excluding dynamic imports, comment/string examples and unused modules`);
  }
  assert.ok(readFileSync(resolve(temporary,'dist/release-fixture/namespace.js')).length>fixtures['namespace.js'].length,'the byte fixture differs from JavaScript string length');
  for(const file of ['dynamic-only.js','dynamic-child.js','comment-only.js','unused.js'])assert.ok(version51.imports['./release-fixture/'+file],'excluded boot resources retain normal release import mapping');

  for(const documentURL of ['https://game.example/','https://goodleap.github.io/wild-reaper/','https://goodleap.github.io/wild-reaper/index.html?debug']){
    const entry=new URL(version51.entry,documentURL).href;
    const engine=resolveImport(version51.imports,'./engine.js',entry,documentURL);
    const panel=resolveImport(version51.imports,'./character-panel.js',entry,documentURL);
    const stats=resolveImport(version51.imports,'./combat-stats.js',engine,documentURL);
    assert.equal(stats,resolveImport(version51.imports,'./combat-stats.js',panel,documentURL),'shared imports use one release identity');
    const catalog=resolveImport(version51.imports,'./combat-catalog.js',stats,documentURL);
    for(const url of [entry,engine,panel,stats,catalog]){
      assert.equal(new URL(url).searchParams.get('v'),null);
      assert.match(new URL(url).searchParams.get('h'),/^[a-f0-9]{12}$/);
    }
    const oldCache=new Map();
    for(const file of ['app.js','engine.js','character-panel.js','combat-stats.js','combat-catalog.js']){
      oldCache.set(new URL('./'+file,documentURL).href,'stale unversioned response');
      oldCache.set(new URL('./'+file+'?v=v0.0.50',documentURL).href,'previous release response');
    }
    assert.ok(oldCache.has(new URL('./engine.js',entry).href),'versioning only the entry would still reuse the stale dependency');
    for(const url of [entry,engine,panel,stats,catalog])assert.equal(oldCache.has(url),false,'new HTML cannot reuse these previous release cache keys');
    const child=new URL(version51.imports['./release-fixture/child.js'],documentURL).href;
    const shared=resolveImport(version51.imports,'../shared edge.js',child,documentURL);
    assert.equal(shared,new URL(`./shared%20edge.js?h=${assetHash('shared edge.js')}`,documentURL).href,'nested modules normalize to the document import map');
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
  assert.equal(revised.imports['./engine.js'],version51.imports['./engine.js'],'a changed child does not invalidate its unchanged parent');
  for(const documentURL of ['https://game.example/','https://goodleap.github.io/wild-reaper/']){
    const parent=new URL(revised.imports['./engine.js'],documentURL).href;
    assert.equal(resolveImport(revised.imports,'./combat-stats.js',parent,documentURL),
      new URL(revised.imports['./combat-stats.js'],documentURL).href,'a cached parent resolves its changed dependency through the current import map');
  }
  assert.ok(new Map(revised.boot.groups.app).get('./combat-stats.js')>new Map(version51.boot.groups.app).get('./combat-stats.js'),'same-version changes refresh boot byte sizes');
  const revisedHTML=readPage();
  stamp(51);
  assert.equal(readPage(),revisedHTML,'corrected release is also idempotent');
  stamp(52);
  const version52=release(readPage(),52);
  assert.equal(version52.entry,revised.entry,'an unchanged entry is cached across releases');
  assert.deepEqual(version52.styles,revised.styles,'unchanged CSS is cached across releases');
  assert.deepEqual(version52.imports,revised.imports,'all unchanged static and dynamic modules are cached across releases');
  assert.deepEqual(version52.boot,revised.boot,'advancing the display version does not change resource sizes');
  let valid=readPage();
  stamp(0,/positive safe integer/);
  assert.equal(readPage(),valid,'invalid counts cannot partially change the page');

  // Adding a motion sheet changes only the asset manifest; the release tool
  // must discover it without another hard-coded filename in the build script.
  const addedAtlas='./assets/units/release-fixture.png';
  writeFileSync(resolve(temporary,'dist',addedAtlas),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
  writeFileSync(resolve(temporary,'dist/character-sprite-manifest.js'),
    `export const CHARACTER_SPRITE_ATLASES=Object.freeze(${JSON.stringify({...CHARACTER_SPRITE_ATLASES,releaseFixture:{path:addedAtlas,width:1,height:1}})});\nexport const CHARACTER_SPRITES={};\n`);
  expectedAssets.push(addedAtlas);stamp(52);release(readPage(),52);valid=readPage();

  writeFileSync(resolve(temporary,'dist/release-fixture/missing.js'),"import './does-not-exist.js';\n");
  stamp(53,/Missing local release asset/);
  assert.equal(readPage(),valid,'missing transitive modules fail before writing');
  rmSync(resolve(temporary,'dist/release-fixture/missing.js'));
  for(const path of expectedAssets.filter(path=>path.endsWith('.png'))){
    const image=resolve(temporary,'dist',path),imageBytes=readFileSync(image);
    rmSync(image);stamp(53,/Missing local release asset/);
    assert.equal(readPage(),valid,'missing boot assets fail before writing');writeFileSync(image,imageBytes);
  }
  writeFileSync(page,valid.replace('</head>','<script type="application/json" id="boot-resources">{}</script>\n</head>'));
  const duplicateMetadata=readPage();
  stamp(53,/at most one boot resource manifest/);
  assert.equal(readPage(),duplicateMetadata,'ambiguous boot metadata fails before writing');
  writeFileSync(page,valid.replace('href="./style.css?','href="./missing.css?'));
  const missingCSS=readPage();
  stamp(53,/Missing local release asset/);
  assert.equal(readPage(),missingCSS,'missing CSS fails before writing');
  writeFileSync(page,valid.replace('src="./bootstrap.js?','src="./missing-entry.js?'));
  stamp(53,/Missing local release asset/);

  assert.equal(readFileSync(resolve(root,'dist/index.html'),'utf8'),originalHTML,'QA must not stamp the working checkout');
  console.log('Release assets QA passed: entry, CSS and transitive module cache identities, static boot closures and byte sizes, relative hosting, idempotency and missing-asset guards.');
}finally{
  rmSync(temporary,{recursive:true,force:true});
}
