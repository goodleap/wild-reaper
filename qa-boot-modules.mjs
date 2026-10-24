import assert from 'node:assert/strict';
import { createBootModules } from './dist/boot-modules.js';

const data=new Map(),storage=()=>({getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)});
const baseURL='https://game.example/wild-reaper/';
const manifest={groups:{config:[['./content-config.js',100],['./content-defaults.js',3000000],['./schema.js',100]]}};
const imports={'./content-config.js':'./content-config.js?h=abc','./content-defaults.js':'./content-defaults.js?h=def'};
const performance={getEntriesByType:()=>[
  {name:new URL(imports['./content-config.js'],baseURL).href,responseStatus:200,decodedBodySize:100,duration:50},
  {name:new URL(imports['./content-defaults.js'],baseURL).href,responseStatus:404,decodedBodySize:0,duration:20000},
  {name:'https://private.example/?secret=hidden',responseStatus:500,duration:30000}
]};
const create=options=>createBootModules({manifest,imports,baseURL,version:'v0.0.159',performance,storage,now:()=>1000,...options});
const error=new TypeError('Importing a module script failed.');
const loader=create();await assert.rejects(loader.load('config',async()=>{throw error;}));
const report=loader.report();
assert.equal(report.total,3);assert.equal(report.observed,2);
assert.equal(report.failed[0].path,'./content-defaults.js');assert.equal(report.failed[0].status,404);
assert.notEqual(report.failed[0],report.slowest[0],'shared diagnostic categories do not look cyclic to the bounded logger');
assert.equal(report.unconfirmed[0].path,'./schema.js');
assert(!JSON.stringify(report).includes('secret'),'only release module paths are logged');
assert.equal(loader.recover(error,'first'),true);assert.equal(loader.recover(error,'second'),false);
const retry=create();assert.equal(retry.previous.bootId,'first');
assert.equal(create({now:()=>1000+24*60*60*1000}).previous.bootId,'first','a long failed download cannot reset the once-only recovery guard');
await assert.rejects(retry.load('config',async()=>{throw error;}));assert.equal(retry.recover(error,'third'),false);
assert.equal(await retry.load('config',async()=>42),42);assert.equal(retry.report(),null);retry.clear();assert.equal(data.size,0);
for(const failure of [new SyntaxError('bad script'),new TypeError('undefined is not an object'),new Error('failed')]){
  const test=create();await assert.rejects(test.load('config',async()=>{throw failure;}));assert.equal(test.recover(failure,'bad'),false);
}
const denied=create({storage:()=>{throw new Error('storage denied');}});
await assert.rejects(denied.load('config',async()=>{throw error;}));assert.equal(denied.recover(error,'denied'),false);
// WebKit can omit timing/status. Such modules remain unconfirmed, never falsely labelled HTTP errors.
const opaque=create({performance:{getEntriesByType:()=>[]}});
await assert.rejects(opaque.load('config',async()=>{throw error;}));
assert.equal(opaque.report().failed.length,0);assert.equal(opaque.report().unconfirmedCount,3);
console.log('Boot modules QA passed: bounded document recovery, precise HTTP failures, unknown timing, storage denial and runtime-error separation.');
