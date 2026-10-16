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
    if(loaded>maxBytes)throw new Error('Resource exceeds supported size.');
    if(total!==null&&loaded>total)total=null;
    if(chunk.byteLength)report(false);
    return chunk;
  };
  try{
    checkAbort();
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Invalid resource size limit.');
    if(total!==null&&total>maxBytes)throw new Error('Resource exceeds supported size.');
    report(false);
    let bytes;
    if(typeof response.body?.getReader==='function'){
      reader=response.body.getReader();const chunks=[];
      while(true){
        const result=await wait(reader.read());checkAbort();
        if(result.done)break;
        const chunk=result.value;
        if(!(chunk instanceof Uint8Array))throw new Error('Resource stream did not return bytes.');
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
