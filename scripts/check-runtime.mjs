import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
function modules(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);
    return entry.isDirectory()?modules(path):/\.(?:m?js)$/.test(entry.name)?[path]:[];
  });
}
const files=[...modules(join(root,'dist')),...modules(join(root,'scripts'))].sort();
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.error||result.status!==0){
    console.error(`Syntax check failed: ${relative(root,file)}`);
    console.error(result.error||result.stderr);
    process.exit(1);
  }
}
console.log(`Syntax checks passed for ${files.length} runtime and script modules.`);
const config=spawnSync(process.execPath,[join(root,'scripts/build-content-config.mjs'),'--check'],{encoding:'utf8'});
if(config.status!==0){console.error(config.error||config.stderr);process.exit(1);}
console.log(config.stdout.trim());
