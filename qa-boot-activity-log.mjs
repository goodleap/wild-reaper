import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBootModules } from './dist/boot-modules.js';

// Execute the shipped boot flow with controlled transports. The assertions
// cover failures that ordinary successful resource loading cannot exercise.
const source=fs.readFileSync(new URL('./dist/bootstrap.js',import.meta.url),'utf8')
  .replace(/^import .* from '[^']+';\s*$/gm,'')
  .replace(/import\('([^']+)'\)/g,"importModule('$1')");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function boot({fallback=false,retry=false,failure,cachedSprites=false,moduleStorage=new Map()}={}){
  const records=[],events=new Map(),nodes=new Map(),order=[];let current=null,clock=0,flushes=0;
  const readyImages=new Set(),resolvedImages=[];
  let reloads=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:id==='game-version'?'v-test':'{}',disabled:true,setAttribute(){}});return nodes.get(id);};
  const document={getElementById:node,baseURI:'https://game.example/',hidden:false,
    addEventListener:(name,callback)=>events.set(name,callback)};
  const window={location:{search:'?debug=1',reload(){reloads++;}},navigator:{userAgent:'Boot QA'},innerWidth:390,innerHeight:844,devicePixelRatio:2,
    addEventListener:(name,callback)=>events.set(name,callback)};
  const find=id=>records.find(record=>record.id===id);
  const activityLog={setContext(context){this.context={...this.context,...context};},begin(kind,title){const id=records.length+1;records.push({id,kind,title,details:{},events:[],stages:[]});return id;},
    setCurrent:id=>current=id,stage:(id,name)=>find(id).stages.push(name),
    event:(id,level,message,data)=>find(id).events.push({level,message,data}),
    update(id,{details,...rest}){const record=find(id);Object.assign(record,rest);Object.assign(record.details,details);},
    captureError(error,{id=current,...options}={}){find(id).events.push({level:'error',error,options});},
    end(id,{details,...result}){Object.assign(find(id),result);Object.assign(find(id).details,details);},
    flush(){flushes++;}};
  const loading={start(){},finish(){},fail(){},};
  const progress={setStage(){},modulesReady(){},download(){},resolvedDownload:path=>resolvedImages.push(path),completeTask(name){
    if(name==='image')assert.equal(readyImages.size,2,'the image stage cannot finish while an actor atlas is still decoding');
  },finish(){},stop(){}};
  const importModule=async path=>{
    order.push(path);
    if(failure==='module')throw new TypeError('Importing a module script failed.');
    if(path==='./content-config.js')return {
      getConfigLoadStatus:()=>fallback?{source:'bundled',fallback:true,reason:'Configuration response 503'}:{source:'site',fallback:false},
      getConfigSnapshot:()=>({contentVersion:'content-test'}),
      async loadContentConfig({onDownloadProgress,onProgress}){
        if(!fallback)onDownloadProgress({loaded:12,total:12,done:true});
        onProgress({stage:'确认配置版本'});
      }};
    if(path==='./boot-art.js')return {BOOT_IMAGE_ASSETS:[['./image.png','角色图片',5],['./characters.png','人物图集',13]].map(([path,label,bytes],index)=>({path,label,assets:{async preload({onProgress}){
      if(cachedSprites&&index===1){readyImages.add(path);return;}
      if(retry&&index===0){onProgress({phase:'download',loaded:3,total:bytes});onProgress({phase:'retry',error:Object.assign(new Error('HTTP 503'),{code:'http'})});}
      onProgress({phase:'download',loaded:0,total:bytes});onProgress({phase:'download',loaded:bytes,total:bytes,done:true});
      onProgress({phase:'decode'});
      if(failure===(index===0?'decode':'character-decode'))throw new Error('decode rejected');
      readyImages.add(path);onProgress({phase:'ready'});
    }}}))};
    assert.equal(readyImages.size,2,'the app must not render before both decoded actor sources exist');
    if(failure==='app')throw new Error('application import rejected');
    return {};
  };
  const input={document,window,activityLog,createLoadingView:()=>loading,createBootProgress:()=>progress,isDebugEnabled:()=>true,
    createBootModules:options=>createBootModules({...options,storage:()=>({getItem:key=>moduleStorage.get(key),setItem:(key,value)=>moduleStorage.set(key,value),removeItem:key=>moduleStorage.delete(key)})}),
    createActivityLogView:()=>order.push('log-view'),waitForPaint:async()=>{},performance:{now:()=>++clock},importModule,console:{error(){}}};
  await new AsyncFunction(...Object.keys(input),source)(...Object.values(input));
  return {records,events,document,window,activityLog,order,nodes,resolvedImages,get current(){return current;},get flushes(){return flushes;},get reloads(){return reloads;}};
}

{
  const fixture=await boot({fallback:true,retry:true}),record=fixture.records[0];
  assert.equal(fixture.order[0],'log-view','diagnostics can be opened before content or app imports');
  assert.equal(record.kind,'boot');assert.equal(record.summary,'首页已就绪');
  assert.equal(fixture.current,null,'completed startup releases ownership of unrelated home-screen errors');
  assert.equal(record.details.configuration.reason,'Configuration response 503');
  assert.equal(record.events.filter(event=>event.level==='warning').length,2);
  const image=record.details.resources['./image.png'];
  assert.equal(image.loadedBytes,5);assert.equal(image.downloadedBytes,8,'bytes include the failed partial attempt');
  assert.equal(image.retries,1);assert(image.downloadMs>0&&image.decodeMs>0);
  const characters=record.details.resources['./characters.png'];
  assert.equal(characters.loadedBytes,13);assert.equal(characters.downloadedBytes,13);assert.equal(characters.retries,0);
  assert(characters.downloadMs>0&&characters.decodeMs>0,'the second atlas has its own timings and bytes');
  assert.deepEqual(fixture.resolvedImages,['./content-pack.json','./image.png','./characters.png']);
  const retryStage=record.stages.indexOf('重试下载角色图片 1/1');
  assert.equal(record.stages[retryStage+1],'下载角色图片','a retry returns to the download stage before decoding');
  assert.deepEqual(fixture.activityLog.context.viewport,{width:390,height:844});assert.equal(fixture.activityLog.context.dpr,2);
  assert.equal(fixture.activityLog.context.contentVersion,'content-test');assert.equal(record.context.contentVersion,'content-test');
  fixture.document.hidden=true;fixture.events.get('visibilitychange')();fixture.events.get('pagehide')();assert.equal(fixture.flushes,2);
  fixture.document.hidden=false;fixture.events.get('visibilitychange')();assert.equal(fixture.flushes,2,'visible frames do not flush persistence');
  const runtimeId=fixture.activityLog.begin('gameplay','active');fixture.activityLog.setCurrent(runtimeId);
  const failure=new Error('runtime exception');fixture.events.get('error')({error:failure,filename:'app.js',lineno:9,colno:4,target:fixture.window});
  fixture.events.get('unhandledrejection')({reason:new Error('promise failed')});
  assert.equal(fixture.records[1].events.length,2);assert.equal(fixture.records[1].events[0].options.context.line,9);
  assert.equal(fixture.records[1].events[0].error,failure,'global error capture retains the original stack');
  fixture.events.get('error')({filename:'https://user:secret@game.example/app.js?token=secret#private',
    target:{src:'https://user:secret@assets.example/image.png?credential=secret#private'}});
  const resource=fixture.records[1].events.at(-1);
  assert.equal(resource.options.context.filename,'/app.js');assert.equal(resource.options.context.resource,'/image.png');
  assert(!JSON.stringify(resource).includes('secret'),'resource failure metadata only includes URL paths');
}
for(const failure of ['decode','character-decode','app']){
  const fixture=await boot({failure}),record=fixture.records[0];
  assert.equal(fixture.records.length,1,'startup errors stay within the boot activity');
  assert.equal(fixture.current,null,'failed startup also releases the current activity');
  assert.equal(record.status,'error');assert.equal(record.events.filter(event=>event.level==='error').length,1);
  assert.equal(record.events.at(-1).options.phase,({decode:'解码角色图片','character-decode':'解码人物图集',app:'加载游戏模块'})[failure]);
  assert(record.details.resources['./content-pack.json'].downloadMs<record.details.resources['./image.png'].downloadMs,
    'later failures do not extend a completed configuration download');
  assert.equal(fixture.nodes.get('start-button')?.disabled??true,true,'failed boot does not enable gameplay');
}
{
  const fixture=await boot({cachedSprites:true}),record=fixture.records[0];
  assert.equal(record.summary,'首页已就绪');assert.equal(record.details.resources['./characters.png'].downloadedBytes,0);
  assert(fixture.resolvedImages.includes('./characters.png'),'an already decoded atlas resolves its weight without inventing downloaded bytes');
}
{
  const moduleStorage=new Map(),first=await boot({failure:'module',moduleStorage});
  assert.equal(first.reloads,1,'a native module transport failure gets one fresh document');
  assert.equal(first.records[0].details.modules.group,'config');
  assert.equal(first.records[0].details.moduleRecovery.action,'reload');
  assert.equal(first.flushes,1,'the failed attempt is persisted before reload');
  const failedRetry=await boot({failure:'module',moduleStorage});
  assert.equal(failedRetry.reloads,0,'persistent failures cannot create a reload loop');
  assert.equal(failedRetry.records[0].status,'error');
  const success=await boot({moduleStorage});
  assert.equal(success.records[0].summary,'首页已就绪');assert.equal(moduleStorage.size,0);
}
console.log('Boot activity log QA passed: early access, fallback/retry reasons, both actor atlases, cumulative bytes, download/decode timing, cached readiness, boot failures, runtime error ownership and lifecycle flush.');
