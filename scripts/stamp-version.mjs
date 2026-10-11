import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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

// GitHub main is canonical. Sites has a separate Git history, so its publisher
// supplies the verified GitHub count including the pending release commit.
const version=`v0.0.${Number(count)}`;
const path=new URL('../dist/index.html',import.meta.url);
const html=readFileSync(path,'utf8');
const slot=/(<small\b[^>]*\bid="game-version"[^>]*>)v0\.0\.\d+(<\/small>)/g;
if([...html.matchAll(slot)].length!==1)throw new Error('Expected exactly one start-screen version label.');
const updated=html.replace(slot,`$1${version}$2`);
if(updated!==html)writeFileSync(path,updated);
console.log(version);
