import assert from 'node:assert/strict';
import { readResponseBytes } from './dist/loading-resource.js';
import { FrostcrownAssets } from './dist/enemy-art/frostcrown-assets.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const bytes=new TextEncoder().encode('霜冠abc');
const streamed=(chunks,headers={})=>new Response(new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}}),{headers});

{
  let stream;const events=[],response=new Response(new ReadableStream({start(controller){stream=controller;}}),{headers:{'content-length':bytes.length}});
  const first=deferred(),last=deferred();
  const reading=readResponseBytes(response,{onProgress:event=>{events.push(event);if(event.loaded===3)first.resolve();if(event.loaded===bytes.length)last.resolve();}});
  stream.enqueue(bytes.slice(0,3));await first.promise;
  assert.deepEqual(events.at(-1),{loaded:3,total:bytes.length,done:false});
  stream.enqueue(bytes.slice(3));await last.promise;
  assert.equal(events.at(-1).done,false,'receiving the expected bytes is not EOF');
  stream.close();assert.deepEqual(await reading,bytes);
  assert.deepEqual(events.at(-1),{loaded:bytes.length,total:bytes.length,done:true});
}
for(const mode of ['gzip','cors','unknown','build-size']){
  const events=[],headers=mode==='unknown'?{}:{'content-length':'2',...(mode==='cors'?{}:{'content-encoding':'gzip'})};
  const response=streamed([bytes.slice(0,4),bytes.slice(4)],headers);
  if(mode==='cors')Object.defineProperty(response,'type',{value:'cors'});
  assert.deepEqual(await readResponseBytes(response,{expectedBytes:mode==='build-size'?bytes.length:undefined,onProgress:event=>events.push(event)}),bytes);
  assert(events.filter(event=>!event.done).every(event=>event.total===(mode==='build-size'?bytes.length:null)),`${mode}: only a trustworthy decoded-byte total is shown`);
  assert.deepEqual(events.at(-1),{loaded:bytes.length,total:bytes.length,done:true});
}
for(const mode of ['gzip','cors']){
  const response=streamed([bytes],{'content-length':String(bytes.length+20),...(mode==='gzip'?{'content-encoding':'gzip'}:{})});
  if(mode==='cors')Object.defineProperty(response,'type',{value:'cors'});
  assert.deepEqual(await readResponseBytes(response,{maxBytes:bytes.length}),bytes,`${mode}: a larger wire size does not reject a valid decoded body`);
}
{
  const events=[];
  await readResponseBytes(streamed([bytes],{'content-length':'2'}),{onProgress:event=>events.push(event)});
  assert.equal(events.find(event=>event.loaded===bytes.length&&!event.done).total,null,'underreported total is discarded');
  assert.deepEqual(await readResponseBytes({text:async()=>'霜冠abc'},{maxBytes:bytes.length}),bytes);
  await assert.rejects(readResponseBytes({text:async()=>'霜冠abc'},{maxBytes:bytes.length-1}),/supported size/,'UTF-8 bytes enforce the cap');
  let cancelled=false;
  const response=new Response(new ReadableStream({start(controller){controller.enqueue(bytes);},cancel(){cancelled=true;}}));
  await assert.rejects(readResponseBytes(response,{maxBytes:bytes.length-1}),/supported size/);
  assert(cancelled,'an oversized stream is cancelled immediately');
}
for(const mode of ['stream','arrayBuffer','text']){
  const controller=new AbortController(),late=deferred(),events=[];let cancelled=false;
  const response=mode==='stream'?{body:{getReader:()=>({read:()=>late.promise,cancel:()=>{cancelled=true;return new Promise(()=>{});},releaseLock(){}})}}:
    mode==='arrayBuffer'?{arrayBuffer:()=>late.promise}:{text:()=>late.promise};
  const reading=readResponseBytes(response,{signal:controller.signal,onProgress:event=>events.push(event)});
  controller.abort(new Error('cancel fixture'));
  await assert.rejects(reading,/cancel fixture/);
  const count=events.length;
  late.resolve(mode==='stream'?{value:bytes,done:false}:mode==='arrayBuffer'?bytes.buffer:'霜冠abc');
  await Promise.resolve();await Promise.resolve();
  assert.equal(events.length,count,`${mode}: an aborted body cannot emit late progress`);
  if(mode==='stream')assert(cancelled,'abort does not wait for an uncooperative cancel promise');
}

// Exercise the production PNG fetch -> Blob -> Image path with a controlled
// browser image decoder, including disposal and timeout retry ownership.
const previousImage=globalThis.Image,previousCreate=URL.createObjectURL,previousRevoke=URL.revokeObjectURL;
const created=[],revoked=[],images=[];
let decode=()=>Promise.resolve(),imageError=false;
URL.createObjectURL=blob=>{assert(blob instanceof Blob);assert.equal(blob.type,'image/png');created.push(blob);return `blob:fixture-${created.length}`;};
URL.revokeObjectURL=url=>revoked.push(url);
globalThis.Image=class{
  constructor(){this.naturalWidth=1254;this.naturalHeight=1254;this.decodeCalls=0;images.push(this);}
  set src(url){this.url=url;assert.match(url,/^blob:fixture-/);queueMicrotask(()=>imageError?this.onerror?.():this.onload?.());}
  decode(){this.decodeCalls++;return decode();}
  removeAttribute(){}
};
try{
  {
    const assets=new FrostcrownAssets(),events=[],decoding=deferred(),started=deferred();let fetches=0;
    decode=()=>{started.resolve();return decoding.promise;};
    const loading=assets.preload({expectedBytes:bytes.length,fetchImpl:async(url,options)=>{
      fetches++;assert(url.endsWith('.png'));assert.equal(options.credentials,'same-origin');assert(options.signal);
      return streamed([bytes.slice(0,3),bytes.slice(3)],{'content-length':'2','content-encoding':'gzip'});
    },onProgress:event=>events.push(event)});
    assert.equal(assets.preload(),loading,'concurrent callers share the same fetch and decode');
    await started.promise;assert.equal(assets.ready,false);assert.equal(fetches,1);
    assert(events.some(event=>event.phase==='download'&&event.loaded===3&&event.total===bytes.length));
    assert.deepEqual(events.at(-1),{phase:'decode',loaded:bytes.length,total:bytes.length,done:false});
    decoding.resolve();await loading;
    assert.equal(images.at(-1).decodeCalls,1);assert.equal(assets.decodes,1);
    assert.deepEqual(events.at(-1),{phase:'ready',loaded:bytes.length,total:bytes.length,done:true});
    assert(revoked.includes(images.at(-1).url));
    await assets.preload({fetchImpl:()=>assert.fail('decoded cache must avoid a second download')});
  }
  {
    const assets=new FrostcrownAssets(),late=deferred(),started=deferred(),events=[];let signal;
    decode=()=>{started.resolve();return late.promise;};
    const loading=assets.preload({timeoutMs:10,fetchImpl:async(_url,options)=>{signal=options.signal;return streamed([bytes]);},onProgress:event=>events.push(event)});
    await started.promise;const old=images.at(-1);
    await assert.rejects(loading,/timed out/);assert(signal.aborted);assert.equal(assets.ready,false);assert(revoked.includes(old.url));
    const count=events.length;decode=()=>Promise.resolve();
    await assets.preload({fetchImpl:async()=>streamed([bytes])});const current=assets.image;
    late.resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(assets.image,current);assert.notEqual(current,old);assert.equal(assets.decodes,1);
    assert.equal(events.length,count,'a timed-out decoder never publishes a late ready event');
  }
  {
    const assets=new FrostcrownAssets();imageError=true;
    await assert.rejects(assets.preload({fetchImpl:async()=>streamed([bytes])}),/could not be loaded/);
    assert(revoked.includes(images.at(-1).url));assert.equal(assets.ready,false);
    imageError=false;await assets.preload({fetchImpl:async()=>streamed([bytes])});assert(assets.ready);
  }
  {
    const assets=new FrostcrownAssets(),late=deferred(),events=[];let fetches=0,signal;
    const failed=assets.preload({timeoutMs:5,fetchImpl:(_url,options)=>{fetches++;signal=options.signal;return late.promise;},onProgress:event=>events.push(event)});
    await assert.rejects(failed,/timed out/);assert(signal.aborted);
    const count=events.length;late.resolve(streamed([bytes]));await Promise.resolve();await Promise.resolve();
    assert.equal(events.length,count);assert.equal(assets.ready,false);
    await assets.preload({fetchImpl:async()=>{fetches++;return streamed([bytes]);}});assert.equal(fetches,2);
  }
  {
    const assets=new FrostcrownAssets(),late=deferred();
    await assert.rejects(assets.preload({load:()=>late.promise,timeoutMs:5}),/timed out/);
    const current={width:1254,height:1254};await assets.preload({load:async()=>current});
    late.resolve({width:1254,height:1254});await Promise.resolve();await Promise.resolve();
    assert.equal(assets.image,current);assert.equal(assets.decodes,1,'the legacy injected loader also observes timeout ownership');
  }
  assert.equal(revoked.length,created.length,'every production-path object URL is released');
}finally{
  globalThis.Image=previousImage;URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;
}
console.log('Loading bytes: streamed UTF-8 counts, trustworthy gzip/CORS totals, EOF completion, bounded reads, abort/late suppression; PNG single fetch/decode, Blob disposal, timeout retry and legacy loader compatibility passed.');
