const DATABASE='wild-reaper-configuration-v1',STORE='snapshots',LIMIT=4;

// This small cache is optional. Blocked storage must never block game startup.
export function createConfigCache(indexedDB=globalThis.indexedDB){
  const run=(mode,action)=>new Promise(resolve=>{
    if(!indexedDB){resolve(null);return;}
    let db,transaction,settled=false,result=null;
    const finish=value=>{
      if(settled)return;settled=true;clearTimeout(timer);
      try{db?.close();}catch{}resolve(value);
    };
    const timer=setTimeout(()=>{try{transaction?.abort();}catch{}finish(null);},400);
    try{
      const opening=indexedDB.open(DATABASE,1);
      opening.onupgradeneeded=()=>{
        const store=opening.result.createObjectStore(STORE,{keyPath:'key'});
        store.createIndex('savedAt','savedAt');
      };
      opening.onerror=()=>finish(null);
      opening.onblocked=()=>finish(null);
      opening.onsuccess=()=>{
        db=opening.result;
        if(settled){db.close();return;}
        db.onversionchange=()=>db.close();
        try{
          transaction=db.transaction(STORE,mode);
          transaction.onabort=transaction.onerror=()=>finish(null);
          transaction.oncomplete=()=>finish(result);
          action(transaction.objectStore(STORE),value=>{result=value;});
        }catch{finish(null);}
      };
    }catch{finish(null);}
  });
  return {
    get:key=>run('readonly',(store,set)=>{
      const request=store.get(key);request.onsuccess=()=>set(request.result?.value??null);
    }),
    put:(key,value)=>run('readwrite',(store,set)=>{
      store.put({key,value,savedAt:Date.now()});
      const count=store.count();
      count.onsuccess=()=>{
        let remove=count.result-LIMIT;
        if(remove<=0){set(true);return;}
        const cursor=store.index('savedAt').openCursor();
        cursor.onsuccess=()=>{
          const entry=cursor.result;
          if(!entry||remove<=0){set(true);return;}
          if(entry.primaryKey!==key){entry.delete();remove--;}
          entry.continue();
        };
      };
    }),
  };
}
