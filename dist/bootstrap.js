import { createLoadingView, waitForPaint } from './loading-ui.js';
import { createBootProgress } from './boot-progress.js';
import { isDebugEnabled } from './debug-search.js';
import { activityLog } from './activity-log.js';
import { createActivityLogView } from './activity-log-view.js';
import { createBootModules } from './boot-modules.js';

const debug=isDebugEnabled(window.location.search);
activityLog.setContext({version:document.getElementById('game-version')?.textContent?.trim(),
  browser:window.navigator?.userAgent,viewport:{width:window.innerWidth,height:window.innerHeight},dpr:window.devicePixelRatio||1});
const bootId=activityLog.begin('boot','首页加载');
activityLog.setCurrent(bootId);
let bootPending=true,currentStage='加载配置模块';
const resourcePath=value=>{
  if(typeof value!=='string'||!value)return undefined;
  try{const url=new URL(value,document.baseURI);return ['http:','https:'].includes(url.protocol)?url.pathname:undefined;}
  catch{return undefined;}
};
window.addEventListener('error',event=>activityLog.captureError(event.error??new Error(event.message||'资源加载失败'),{
  phase:bootPending?currentStage:'runtime',context:{filename:resourcePath(event.filename),line:event.lineno,column:event.colno,
    resource:event.target!==window?resourcePath(event.target?.src):undefined}}),true);
window.addEventListener('unhandledrejection',event=>activityLog.captureError(event.reason,{
  phase:bootPending?currentStage:'runtime',context:{source:'unhandledrejection'}}));
window.addEventListener('pagehide',()=>activityLog.flush());
document.addEventListener('visibilitychange',()=>{if(document.hidden)activityLog.flush();});
try{createActivityLogView({document,log:activityLog,enabled:debug});}
catch(error){activityLog.captureError(error,{id:bootId,phase:'初始化日志界面'});}

const loading=createLoadingView(document,{debug});
const controls=['start-button','archive-button','help-button','sound-button'];
const arena=document.getElementById('arena');
loading.start('boot',{stage:'正在加载冒险内容',detail:'加载配置模块'});
arena.setAttribute('aria-busy','true');
const readData=id=>{try{return JSON.parse(document.getElementById(id)?.textContent||'{}');}catch{return {};}};
const manifest=readData('boot-resources'),imports=readData('release-imports').imports||{};
const modules=createBootModules({manifest,imports,baseURL:document.baseURI,
  version:document.getElementById('game-version')?.textContent?.trim()});
if(modules.previous)activityLog.update(bootId,{details:{moduleRecovery:{attempt:1,previousBootId:modules.previous.bootId}}});
const progress=createBootProgress({view:loading,manifest,imports,baseURL:document.baseURI});
const configPath='./content-pack.json';
const now=()=>performance.now();
const resources={};
const startDownload=path=>resources[path]={loadedBytes:0,downloadedBytes:0,totalBytes:null,retries:0,startedAt:now(),downloadMs:0,decodeMs:0};
const downloadProgress=(path,event)=>{
  const resource=resources[path];
  const loaded=Math.max(0,Number(event.loaded)||0);
  resource.downloadedBytes+=Math.max(0,loaded-resource.loadedBytes);resource.loadedBytes=loaded;
  resource.totalBytes=Number.isFinite(event.total)?event.total:null;
  resource.downloadMs=now()-resource.startedAt;
  if(event.done)resource.downloadComplete=true;
};
const resourceDetails=()=>Object.fromEntries(Object.entries(resources).map(([path,{startedAt,decodeStartedAt,downloadComplete,...data}])=>
  [path,{...data,...(decodeStartedAt!==undefined?{decodeMs:now()-decodeStartedAt}:{})}]));
const recordResources=()=>activityLog.update(bootId,{details:{resources:resourceDetails()}});
const setStage=(label,detail)=>{
  if(currentStage!==detail){currentStage=detail;activityLog.stage(bootId,detail);}
  progress.setStage(label,detail);
};
activityLog.stage(bootId,currentStage);
try{
  // Keep the initial HTML visible while the content loader and its fallback
  // bundle arrive. The app graph cannot initialize against half-loaded data.
  const {loadContentConfig,getConfigLoadStatus,getConfigSnapshot}=await modules.load('config',()=>import('./content-config.js'));
  progress.modulesReady('config');
  setStage('正在读取内容配置','下载游戏配置');
  await waitForPaint();
  startDownload(configPath);
  await loadContentConfig({expectedBytes:manifest.assets?.[configPath],
    clientVersion:document.getElementById('game-version')?.textContent?.trim().split(/\s/)[0],
    onDownloadProgress:event=>{downloadProgress(configPath,event);progress.download(configPath,event);},
    onProgress:({stage})=>setStage('正在读取内容配置',stage)});
  const configStatus=getConfigLoadStatus();
  const contentVersion=getConfigSnapshot().contentVersion;
  activityLog.setContext({contentVersion});
  if(!resources[configPath].downloadComplete)resources[configPath].downloadMs=now()-resources[configPath].startedAt;
  resources[configPath].downloadComplete=true;
  activityLog.update(bootId,{context:{contentVersion},details:{configuration:configStatus}});recordResources();
  if(configStatus.fallback)activityLog.event(bootId,'warning',
    configStatus.source==='server-cache'?'配置服务不可用，使用已验证缓存':'配置下载或校验失败，使用内置配置',
    {source:configStatus.source,reason:configStatus.reason});
  progress.resolvedDownload(configPath);progress.completeTask('config');
  setStage('正在准备画面与操作',configStatus.fallback?
    (configStatus.source==='server-cache'?'已启用缓存配置':'已启用内置配置'):'加载图片模块');
  await waitForPaint();
  setStage('正在准备画面与操作','加载图片模块');
  const {BOOT_IMAGE_ASSETS}=await modules.load('art',()=>import('./boot-art.js'));
  progress.modulesReady('art');
  for(const {path:imagePath,label,assets} of BOOT_IMAGE_ASSETS){
    setStage('正在准备画面与操作',`下载${label}`);
    const imageDownload=startDownload(imagePath);
    await assets.preload({expectedBytes:manifest.assets?.[imagePath],onProgress:event=>{
      if(event.phase==='download'){
        if(currentStage!==`下载${label}`)setStage('正在准备画面与操作',`下载${label}`);
        downloadProgress(imagePath,event);progress.download(imagePath,event);
      }else if(event.phase==='decode'){
        imageDownload.downloadMs=now()-imageDownload.startedAt;imageDownload.downloadComplete=true;imageDownload.decodeStartedAt=now();
        recordResources();setStage('正在准备画面与操作',`解码${label}`);
      }else if(event.phase==='retry'){
        imageDownload.retries++;imageDownload.loadedBytes=0;imageDownload.downloadComplete=false;imageDownload.downloadMs=now()-imageDownload.startedAt;
        activityLog.event(bootId,'warning',`${label}下载重试`,{resource:imagePath,attempt:imageDownload.retries,reason:event.error?.message,
          code:event.error?.code,detail:event.error?.detail});
        recordResources();setStage('正在准备画面与操作',`重试下载${label} 1/1`);
      }else if(event.phase==='ready'&&imageDownload.decodeStartedAt!==undefined){
        imageDownload.decodeMs=now()-imageDownload.decodeStartedAt;delete imageDownload.decodeStartedAt;
      }
    }});
    if(!imageDownload.downloadComplete)imageDownload.downloadMs=now()-imageDownload.startedAt;
    imageDownload.downloadComplete=true;
    recordResources();progress.resolvedDownload(imagePath);
  }
  progress.completeTask('image');
  setStage('正在准备画面与操作','加载游戏模块');
  await waitForPaint();
  await modules.load('app',()=>import('./app.js'));
  progress.modulesReady('app');progress.completeTask('app');
  setStage('正在准备画面与操作','绘制首页首帧');
  await waitForPaint();
  progress.completeTask('frame');
  for(const id of controls)document.getElementById(id).disabled=false;
  arena.setAttribute('aria-busy','false');
  progress.finish();
  loading.finish();
  modules.clear();
  activityLog.end(bootId,{summary:'首页已就绪',details:{resources:resourceDetails()}});
}catch(error){
  progress.stop();
  for(const resource of Object.values(resources))if(!resource.downloadComplete)resource.downloadMs=now()-resource.startedAt;
  activityLog.captureError(error,{id:bootId,phase:currentStage});
  const retry=modules.recover(error,bootId),moduleReport=modules.report();
  activityLog.end(bootId,{status:'error',summary:`首页加载失败：${currentStage}`,details:{resources:resourceDetails(),
    ...(moduleReport?{modules:moduleReport}:{}),...(retry?{moduleRecovery:{attempt:1,action:'reload'}}:{})}});
  console.error('Game startup failed',error);
  if(retry){
    loading.start('boot',{stage:'正在重新连接',detail:`重试${currentStage} 1/1`});
    // Preserve the failed attempt's diagnostic row before replacing the page.
    // A blocked diagnostics database must never block recovery itself.
    let flushTimer;
    try{await Promise.race([activityLog.flush(),new Promise(resolve=>{flushTimer=setTimeout(resolve,500);})]);}catch{}
    finally{clearTimeout(flushTimer);}
    window.location.reload();
  }else loading.fail('暂时无法完成加载，请重试。',{
    detail:`${currentStage}：${error?.detail||error?.message||'未知错误'}`,onRetry:()=>{modules.clear();window.location.reload();}});
}finally{activityLog.setCurrent(null);bootPending=false;}
