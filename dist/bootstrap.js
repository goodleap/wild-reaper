import { createLoadingView, waitForPaint } from './loading-ui.js';
import { createBootProgress } from './boot-progress.js';
import { isDebugEnabled } from './debug-search.js';

const loading=createLoadingView(document,{debug:isDebugEnabled(window.location.search)});
const controls=['start-button','archive-button','help-button','sound-button'];
const arena=document.getElementById('arena');
loading.start('boot',{stage:'正在加载冒险内容',detail:'加载配置模块'});
arena.setAttribute('aria-busy','true');
const readData=id=>{try{return JSON.parse(document.getElementById(id)?.textContent||'{}');}catch{return {};}};
const manifest=readData('boot-resources'),imports=readData('release-imports').imports||{};
const progress=createBootProgress({view:loading,manifest,imports,baseURL:document.baseURI});
const configPath='./content-pack.json';
try{
  // Keep the initial HTML visible while the content loader and its fallback
  // bundle arrive. The app graph cannot initialize against half-loaded data.
  const {loadContentConfig,getConfigLoadStatus}=await import('./content-config.js');
  progress.modulesReady('config');
  progress.setStage('正在读取内容配置','下载游戏配置');
  await waitForPaint();
  await loadContentConfig({expectedBytes:manifest.assets?.[configPath],
    onDownloadProgress:event=>progress.download(configPath,event),
    onProgress:({stage})=>progress.setStage('正在读取内容配置',stage)});
  progress.resolvedDownload(configPath);progress.completeTask('config');
  progress.setStage('正在准备画面与操作',getConfigLoadStatus().fallback?'已启用内置配置':'加载图片模块');
  await waitForPaint();
  const {frostcrownAssets,FROSTCROWN_ASSET}=await import('./enemy-art/frostcrown-assets.js');
  progress.modulesReady('art');
  const imagePath='./'+FROSTCROWN_ASSET.path.replace(/^\.\.\//,'');
  progress.setStage('正在准备画面与操作','下载角色图片');
  await frostcrownAssets.preload({expectedBytes:manifest.assets?.[imagePath],onProgress:event=>{
    if(event.phase==='download')progress.download(imagePath,event);
    else if(event.phase==='decode')progress.setStage('正在准备画面与操作','解码角色图片');
  }});
  progress.resolvedDownload(imagePath);progress.completeTask('image');
  progress.setStage('正在准备画面与操作','加载游戏模块');
  await waitForPaint();
  await import('./app.js');
  progress.modulesReady('app');progress.completeTask('app');
  progress.setStage('正在准备画面与操作','绘制首页首帧');
  await waitForPaint();
  progress.completeTask('frame');
  for(const id of controls)document.getElementById(id).disabled=false;
  arena.setAttribute('aria-busy','false');
  progress.finish();
  loading.finish();
}catch(error){
  progress.stop();
  console.error('Game startup failed',error);
  loading.fail('暂时无法完成加载，请重试。',{onRetry:()=>window.location.reload()});
}
