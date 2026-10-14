import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// GitHub main is canonical. Sites has a separate Git history, so its publisher
// supplies the verified GitHub count including the pending release commit.
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
function versionedURL(url){
  if(!assetHashes.has(url.pathname)){
    const file=resolve(dist,decodeURIComponent(url.pathname.slice(documentURL.pathname.length)));
    assetHashes.set(url.pathname,createHash('sha256').update(readFileSync(file)).digest('hex').slice(0,12));
  }
  const updated=new URL(url);
  updated.searchParams.set('v',version);
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
const imports={};
for(const file of moduleFiles(dist)){
  const url=localURL('./'+file.split('/').map(encodeURIComponent).join('/'));
  imports[relativeURL(url)]=versionedURL(url);
  const source=readFileSync(resolve(dist,file),'utf8');
  const staticImports=/(?:^|\n)[\t ]*(?:import\s*(?:(?:[^'";]*?)\bfrom\s*)?|export\s+[^'";]*?\bfrom\s*)(['"])([^'"\r\n]+)\1/g;
  const dynamicImports=/\bimport\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g;
  for(const match of [...source.matchAll(staticImports),...source.matchAll(dynamicImports)]){
    const specifier=match[2];
    if(external(specifier))continue;
    if(!specifier.startsWith('.'))throw new Error(`Expected a relative local module import in ${file}: ${specifier}`);
    const dependency=localURL(specifier,url);
    imports[relativeURL(dependency)]=versionedURL(dependency);
  }
}

let updated=html.replace(slot,`$1${version}$2`);
const releaseMaps=[...updated.matchAll(/[ \t]*<script\b(?=[^>]*\bid=(["'])release-imports\1)[^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi)];
if(releaseMaps.length>1)throw new Error('Expected at most one release import map.');
if(releaseMaps.length)updated=updated.replace(releaseMaps[0][0],'');
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
const json=JSON.stringify({imports:orderedImports}).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const importMap=`<script type="importmap" id="release-imports">${json}</script>`;
const firstModule=/<script\b[^>]*>/gi;
let entry;
while((entry=firstModule.exec(updated))){
  if(attribute(entry[0],'type')!=='module')continue;
  const lineStart=updated.lastIndexOf('\n',entry.index)+1;
  const indentation=updated.slice(lineStart,entry.index);
  const insertion=/^[ \t]*$/.test(indentation)?lineStart:entry.index;
  const prefix=insertion===lineStart?indentation:'';
  updated=updated.slice(0,insertion)+prefix+importMap+'\n'+updated.slice(insertion);
  break;
}
if(updated!==html)writeFileSync(path,updated);
console.log(version);
