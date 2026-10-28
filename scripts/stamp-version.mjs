import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTER_SPRITE_ATLASES } from '../dist/character-sprite-manifest.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
let count;
if(args.length===2&&args[0]==='--commit-count')count=args[1];
else if(args.length===0){
  if(git('rev-parse','--is-shallow-repository')!=='false')throw new Error('Full Git history is required to count versions. Fetch with depth 0.');
  count=git('rev-list','--count','HEAD');
}else throw new Error('Usage: node scripts/stamp-version.mjs [--commit-count <GitHub main commit count>]');
if(!/^[1-9]\d*$/.test(count)||!Number.isSafeInteger(Number(count)))throw new Error('Commit count must be a positive safe integer.');

// JSON is the authored source; rebuild both transport and fallback atomically
// before hashing modules for this release. No runtime file is hand-maintained.
execFileSync(process.execPath,[fileURLToPath(new URL('./build-content-config.mjs',import.meta.url))],{cwd:root,stdio:'pipe'});

// GitHub main is canonical. Releases count their full code-repository history;
// an explicit count also supports release previews and isolated asset tests.
const version=`v0.0.${Number(count)}`;
const path=new URL('../dist/index.html',import.meta.url);
const html=readFileSync(path,'utf8');
const slot=/(<small\b[^>]*\bid="game-version"[^>]*>)v0\.0\.\d+(<\/small>)/g;
if([...html.matchAll(slot)].length!==1)throw new Error('Expected exactly one start-screen version label.');
const dist=resolve(root,'dist');
const documentURL=new URL('https://release.invalid/wild-reaper/');
const attribute=(tag,name)=>tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`,'i'))?.[2];
const unescapeHTML=value=>value.replace(/&(amp|quot|apos|lt|gt);/g,(_,name)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[name]));
const escapeHTML=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const external=value=>/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
function localURL(value,base=documentURL){
  if(value.startsWith('/'))throw new Error(`Local release assets must use relative paths: ${value}`);
  const url=new URL(value,base);
  if(!url.href.startsWith(documentURL.href))throw new Error(`Release asset is outside dist: ${value}`);
  const file=resolve(dist,decodeURIComponent(url.pathname.slice(documentURL.pathname.length)));
  if(!file.startsWith(dist+sep)||!statSync(file,{throwIfNoEntry:false})?.isFile())throw new Error(`Missing local release asset: ${value}`);
  return url;
}
const relativeURL=url=>'./'+url.href.slice(documentURL.href.length);
const assetHashes=new Map();
const assetBuffers=new Map();
function assetBuffer(url){
  if(!assetBuffers.has(url.pathname)){
    const file=resolve(dist,decodeURIComponent(url.pathname.slice(documentURL.pathname.length)));
    assetBuffers.set(url.pathname,readFileSync(file));
  }
  return assetBuffers.get(url.pathname);
}
function versionedURL(url){
  if(!assetHashes.has(url.pathname)){
    assetHashes.set(url.pathname,createHash('sha256').update(assetBuffer(url)).digest('hex').slice(0,12));
  }
  const updated=new URL(url);
  // A release number must not invalidate unchanged modules (notably the large
  // bundled configuration). The document's import map selects every module by
  // content, including transitive dependencies whose importing parent is reused.
  updated.searchParams.delete('v');
  updated.searchParams.set('h',assetHashes.get(url.pathname));
  return relativeURL(updated);
}
function moduleFiles(directory,prefix=''){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const relative=prefix+entry.name;
    if(entry.isDirectory())return moduleFiles(resolve(directory,entry.name),relative+'/');
    return entry.isFile()&&/\.m?js$/i.test(entry.name)?[relative]:[];
  }).sort();
}

// One import map keeps the entry and every transitive module in the same release.
// A query on app.js alone does not propagate to its relative imports.
const moduleSources=moduleFiles(dist).map(file=>{
  const url=localURL('./'+file.split('/').map(encodeURIComponent).join('/'));
  return [file,assetBuffer(url).toString('utf8')];
});
// Node's parser distinguishes static imports/re-exports from dynamic imports,
// comments and strings. These modules are only parsed, never linked or executed.
const staticSpecifiers=new Map(JSON.parse(execFileSync(process.execPath,[
  '--experimental-vm-modules','--no-warnings','--input-type=module','-e',
  `import { readFileSync } from 'node:fs';
   import { SourceTextModule } from 'node:vm';
   const sources=JSON.parse(readFileSync(0,'utf8'));
   process.stdout.write(JSON.stringify(sources.map(([file,source])=>[file,new SourceTextModule(source,{identifier:file}).dependencySpecifiers])));`
],{cwd:root,input:JSON.stringify(moduleSources),encoding:'utf8'})));
const imports={};
const staticGraph=new Map();
for(const [file,source] of moduleSources){
  const url=localURL('./'+file.split('/').map(encodeURIComponent).join('/'));
  imports[relativeURL(url)]=versionedURL(url);
  const dependencies=[];
  staticGraph.set(url.pathname,dependencies);
  const dynamicImports=/\bimport\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g;
  const specifiers=[...staticSpecifiers.get(file).map(specifier=>[specifier,true]),...Array.from(source.matchAll(dynamicImports),match=>[match[2],false])];
  for(const [specifier,isStatic] of specifiers){
    if(external(specifier))continue;
    if(!specifier.startsWith('.'))throw new Error(`Expected a relative local module import in ${file}: ${specifier}`);
    const dependency=localURL(specifier,url);
    imports[relativeURL(dependency)]=versionedURL(dependency);
    if(isStatic)dependencies.push(dependency);
  }
}

// Boot observes these existing requests. Only the static closure of each stage
// contributes bytes; unrelated modules and later dynamic imports stay outside it.
function bootGroup(entry){
  const resources=new Map();
  function visit(url){
    const key=relativeURL(url);
    if(resources.has(key))return;
    const dependencies=staticGraph.get(url.pathname);
    if(!dependencies)throw new Error(`Missing local release module: ${key}`);
    resources.set(key,assetBuffer(url).length);
    for(const dependency of dependencies)visit(dependency);
  }
  visit(localURL(entry));
  return [...resources].sort(([a],[b])=>a.localeCompare(b,'en'));
}
const bootResources={
  groups:{config:bootGroup('./content-config.js'),art:bootGroup('./boot-art.js'),app:bootGroup('./app.js')},
  assets:Object.fromEntries(['./content-pack.json','./assets/units/frostcrown-0d4e3d938dc5e6e0.png',...Object.values(CHARACTER_SPRITE_ATLASES).map(atlas=>atlas.path)].map(file=>[file,assetBuffer(localURL(file)).length]))
};

let updated=html.replace(slot,`$1${version}$2`);
const releaseMaps=[...updated.matchAll(/[ \t]*<script\b(?=[^>]*\bid=(["'])release-imports\1)[^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi)];
if(releaseMaps.length>1)throw new Error('Expected at most one release import map.');
if(releaseMaps.length)updated=updated.replace(releaseMaps[0][0],'');
const bootMetadata=[...updated.matchAll(/[ \t]*<script\b(?=[^>]*\bid=(["'])boot-resources\1)[^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi)];
if(bootMetadata.length>1)throw new Error('Expected at most one boot resource manifest.');
if(bootMetadata.length)updated=updated.replace(bootMetadata[0][0],'');
let moduleCount=0;
updated=updated.replace(/<(script|link)\b[^>]*>/gi,tag=>{
  const script=/^<script\b/i.test(tag);
  const type=attribute(tag,'type');
  if(script&&type==='importmap')throw new Error('The release import map must be the only import map.');
  const assetAttribute=script?'src':'href';
  const raw=attribute(tag,assetAttribute);
  if(!raw||(script?type!=='module':!attribute(tag,'rel')?.split(/\s+/).includes('stylesheet')))return tag;
  const value=unescapeHTML(raw);
  if(external(value))return tag;
  if(script)moduleCount++;
  const next=escapeHTML(versionedURL(localURL(value)));
  return tag.replace(new RegExp(`(\\b${assetAttribute}\\s*=\\s*)(["'])(.*?)\\2`,'i'),(_,prefix,quote)=>`${prefix}${quote}${next}${quote}`);
});
if(!moduleCount)throw new Error('Expected at least one local module entry script.');
const orderedImports=Object.fromEntries(Object.entries(imports).sort(([a],[b])=>a.localeCompare(b,'en')));
const inlineJSON=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const importMap=`<script type="importmap" id="release-imports">${inlineJSON({imports:orderedImports})}</script>`;
const resourceManifest=`<script type="application/json" id="boot-resources">${inlineJSON(bootResources)}</script>`;
const firstModule=/<script\b[^>]*>/gi;
let entry;
while((entry=firstModule.exec(updated))){
  if(attribute(entry[0],'type')!=='module')continue;
  const lineStart=updated.lastIndexOf('\n',entry.index)+1;
  const indentation=updated.slice(lineStart,entry.index);
  const insertion=/^[ \t]*$/.test(indentation)?lineStart:entry.index;
  const prefix=insertion===lineStart?indentation:'';
  updated=updated.slice(0,insertion)+prefix+importMap+'\n'+prefix+resourceManifest+'\n'+updated.slice(insertion);
  break;
}
if(updated!==html)writeFileSync(path,updated);
console.log(version);
