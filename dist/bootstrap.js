import { createLoadingView, waitForPaint } from './loading-ui.js';

const loading=createLoadingView(document);
const controls=['start-button','archive-button','help-button','sound-button'];
const arena=document.getElementById('arena');
loading.start('boot',{stage:'正在加载冒险内容'});
arena.setAttribute('aria-busy','true');
try{
  // Keep the initial HTML visible while the content loader and its fallback
  // bundle arrive. The app graph cannot initialize against half-loaded data.
  const {loadContentConfig}=await import('./content-config.js');
  loading.update({completed:1,total:3,stage:'正在读取内容配置'});
  await loadContentConfig({onProgress:({completed,total,stage})=>loading.update({completed:1+(total>0?completed/total:0),total:3,stage})});
  loading.update({completed:2,total:3,stage:'正在准备画面与操作'});
  await import('./app.js');
  loading.update({completed:3,total:3,stage:'准备完成'});
  await waitForPaint();
  for(const id of controls)document.getElementById(id).disabled=false;
  arena.setAttribute('aria-busy','false');
  loading.finish();
}catch(error){
  console.error('Game startup failed',error);
  loading.fail('暂时无法完成加载，请重试。',{onRetry:()=>window.location.reload()});
}
