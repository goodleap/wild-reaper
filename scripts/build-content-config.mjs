import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CONTENT_SCHEMA_VERSION,CONTENT_SECTION_IDS,validateContentPack } from '../dist/content-schema.js';

const check=process.argv.includes('--check');
if(process.argv.slice(2).some(arg=>arg!=='--check'))throw new Error('Usage: node scripts/build-content-config.mjs [--check]');
const sections=Object.fromEntries(CONTENT_SECTION_IDS.map(id=>[id,JSON.parse(readFileSync(new URL(`../dist/config/${id}.json`,import.meta.url),'utf8'))]));
const contentVersion=createHash('sha256').update(JSON.stringify({schemaVersion:CONTENT_SCHEMA_VERSION,sections})).digest('hex').slice(0,20);
const pack={schemaVersion:CONTENT_SCHEMA_VERSION,contentVersion,sections};
validateContentPack(pack);
const json=JSON.stringify(pack).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const outputs=[['content-pack.json',json+'\n'],['content-defaults.js',`// Generated from config/*.json by scripts/build-content-config.mjs.\nexport const bundledConfig=${json};\nexport const localConfigPath='./content-pack.json?v=${contentVersion}';\n`]];
for(const [name,text] of outputs){
  const path=new URL(`../dist/${name}`,import.meta.url);
  if(check){if(readFileSync(path,'utf8')!==text)throw new Error(`Stale generated configuration: ${name}`);}
  else writeFileSync(path,text);
}
console.log(`Content ${contentVersion}: ${CONTENT_SECTION_IDS.length} validated sections${check?' verified':''}.`);
