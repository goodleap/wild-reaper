export class LoadingResourceError extends Error{
  constructor(code,message,{detail=message,retryable=false,cause}={}){
    super(message,{cause});this.name='LoadingResourceError';this.code=code;this.detail=detail;this.retryable=retryable;
  }
}

const sizeError=()=>new LoadingResourceError('size','Resource exceeds supported size.',{detail:'资源超出支持的大小'});

// Fetch exposes decoded response bytes. A compressed Content-Length describes
// the wire representation, so only the build's original size can total it.
export async function readResponseBytes(response,{expectedBytes,onProgress=()=>{},signal,maxBytes=8*1024*1024}={}){
  const validSize=value=>Number.isSafeInteger(value)&&value>0;
  const length=Number(response.headers?.get?.('content-length'));
  const encoding=response.headers?.get?.('content-encoding')?.trim().toLowerCase();
  // CORS can expose Content-Length while hiding Content-Encoding entirely.
  const identity=encoding==='identity'||(!encoding&&response.type!=='cors');
  let total=validSize(expectedBytes)?expectedBytes:identity&&validSize(length)?length:null;
  let loaded=0,reader,finished=false,abortListener;
  const abortError=()=>signal?.reason??new Error('Resource request aborted.');
  const checkAbort=()=>{if(signal?.aborted)throw abortError();};
  const aborted=signal?new Promise((_,reject)=>{
    abortListener=()=>reject(abortError());signal.addEventListener('abort',abortListener,{once:true});
  }):null;
  const wait=promise=>aborted?Promise.race([promise,aborted]):promise;
  const report=done=>{checkAbort();onProgress({loaded,total,done});};
  const append=chunk=>{
    checkAbort();loaded+=chunk.byteLength;
    if(loaded>maxBytes)throw sizeError();
    if(total!==null&&loaded>total)total=null;
    if(chunk.byteLength)report(false);
    return chunk;
  };
  try{
    checkAbort();
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new LoadingResourceError('size-limit','Invalid resource size limit.');
    if(total!==null&&total>maxBytes)throw sizeError();
    report(false);
    let bytes;
    if(typeof response.body?.getReader==='function'){
      reader=response.body.getReader();const chunks=[];
      while(true){
        const result=await wait(reader.read());checkAbort();
        if(result.done)break;
        const chunk=result.value;
        if(!(chunk instanceof Uint8Array))throw new LoadingResourceError('stream-format','Resource stream did not return bytes.');
        if(chunk.byteLength)chunks.push(append(chunk));
      }
      bytes=new Uint8Array(loaded);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    }else if(typeof response.arrayBuffer==='function'){
      bytes=append(new Uint8Array(await wait(response.arrayBuffer())));
    }else{
      // Older transports and injected configuration fixtures may expose text
      // only. They cannot report intermediate byte counts, but UTF-8 is exact.
      bytes=append(new TextEncoder().encode(await wait(response.text())));
    }
    checkAbort();total=loaded;report(true);finished=true;return bytes;
  }finally{
    signal?.removeEventListener('abort',abortListener);
    if(!finished){
      try{Promise.resolve(reader?reader.cancel():response.body?.cancel?.()).catch(()=>{});}catch{}
    }
    try{reader?.releaseLock();}catch{}
  }
}

// The stall clock starts before headers arrive and advances only for new body
// bytes. The total download budget spans both attempts; decoding is separate.
export async function fetchResourceBytes(url,{fetchImpl=globalThis.fetch,expectedBytes,maxBytes,
  onProgress=()=>{},onRetry=()=>{},idleTimeoutMs=20000,totalTimeoutMs=120000,
  setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}={}){
  if(typeof fetchImpl!=='function')throw new LoadingResourceError('transport','Resource transport unavailable.',{detail:'下载接口不可用'});
  const started=now(),budget=Math.max(1,totalTimeoutMs);
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController();let idleTimer,totalTimer,loaded=0,aborted;
    const abort=error=>{if(!controller.signal.aborted)controller.abort(error);};
    const stall=()=>new LoadingResourceError('download-stalled','Resource download stalled and timed out.',{detail:'下载长时间未收到新数据',retryable:true});
    const exceeded=()=>new LoadingResourceError('download-timeout','Resource download total timed out.',{detail:'下载超过总时限'});
    const refresh=()=>{clearTimer(idleTimer);idleTimer=setTimer(()=>abort(stall()),Math.max(1,idleTimeoutMs));};
    const timeout=new Promise((_,reject)=>{
      aborted=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',aborted,{once:true});
    });
    const remaining=budget-(now()-started);
    if(remaining<=0)throw exceeded();
    totalTimer=setTimer(()=>abort(exceeded()),remaining);refresh();
    try{
      const request=(async()=>{
        const response=await fetchImpl(url,{signal:controller.signal,credentials:'same-origin',cache:'default'});
        if(controller.signal.aborted){
          try{Promise.resolve(response.body?.cancel?.()).catch(()=>{});}catch{}
          throw controller.signal.reason;
        }
        if(!response.ok){
          try{Promise.resolve(response.body?.cancel?.()).catch(()=>{});}catch{}
          const status=response.status;
          throw new LoadingResourceError('http',`Resource response ${status}.`,{
            detail:`资源下载失败，HTTP ${status}`,retryable:[408,425,429,500,502,503,504].includes(status)});
        }
        return readResponseBytes(response,{expectedBytes,maxBytes,signal:controller.signal,onProgress:event=>{
          if(event.loaded>loaded){loaded=event.loaded;refresh();}
          onProgress(event);
        }});
      })();
      return await Promise.race([request,timeout]);
    }catch(caught){
      const error=controller.signal.aborted?controller.signal.reason:caught instanceof LoadingResourceError?caught:
        new LoadingResourceError('network','Resource network request failed.',{detail:'网络连接中断或请求失败',retryable:true,cause:caught});
      abort(error);
      if(attempt!==0||!error.retryable||now()-started>=budget)throw error;
      onRetry(error);
    }finally{
      clearTimer(idleTimer);clearTimer(totalTimer);controller.signal.removeEventListener('abort',aborted);
    }
  }
}
