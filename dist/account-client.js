import { getServerConfigOptions } from './config-source.js';

export const GUEST_SAVE_KEY='wild-echoes-guest-world-v1';
export const DEBUG_GUEST_SAVE_KEY='wild-echoes-debug-guest-world-v1';
const PREFIX='wild-echoes-account-v1:',MAX_BYTES=4_000_000;
const uuid=()=>globalThis.crypto.randomUUID();
const storageDefault=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const bytes=text=>new TextEncoder().encode(text).byteLength;
const userValid=user=>user&&typeof user.id==='string'&&user.id.length<=80&&/^[a-z0-9_]{3,24}$/i.test(user.username);
const mutationValid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const messages={
  INVALID_CREDENTIALS:'账号或密码不正确。',USERNAME_TAKEN:'这个账号名已被使用。',
  INVALID_CREDENTIALS_FORMAT:'账号需为 3–24 位字母、数字或下划线，密码需为 8–128 位。',AUTH_BUSY:'登录请求较多，请稍后重试。',
  INVALID_REQUEST:'请检查账号和密码格式。',RATE_LIMITED:'操作较频繁，请稍后重试。',
  AUTH_REQUIRED:'登录已失效，请重新登录；本地进度仍然保留。',ACCOUNT_CHANGED:'账号已在其他页面切换，请重新登录。',
  SAVE_CONFLICT:'其他页面或设备已更新进度，请读取最新云端进度。',
  NETWORK:'暂时无法连接账号服务，进度保留在本机。',API_UNAVAILABLE:'当前地址未配置账号服务，可先以游客游玩。',
  INVALID_SAVE:'存档无法读取，已停止同步，请保留页面。',STORAGE_UNAVAILABLE:'本地进度无法保存，请检查浏览器存储。',
  STALE_STORAGE:'进度已在其他页面更新，请重新读取后继续。',BUSY:'账号操作进行中，请稍候。',
  SAVE_TOO_LARGE:'存档超过服务器上传限制，进度仍保存在本机，请检查服务配置。',
};
export class AccountError extends Error {
  constructor(code,status=0){super(messages[code]||'账号服务暂时不可用，请稍后重试。');this.name='AccountError';this.code=code;this.status=status;}
}

/** A single world-save slot, with identity-bound adapters and atomic cloud writes. */
export class AccountClient {
  constructor({storage=storageDefault(),fetchImpl=globalThis.fetch,location=globalThis.location,origin,debug=false,
    validateSave=value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('save');return value;},
    onChange=()=>{},eventTarget=globalThis,debounceMs=1000,timeoutMs=12000,
    retryDelays=[3000,10000,30000],makeId=uuid,setTimer=(...args)=>globalThis.setTimeout(...args),clearTimer=id=>globalThis.clearTimeout(id)}={}){
    Object.assign(this,{storage,fetchImpl,validateSave,onChange,eventTarget,debounceMs,timeoutMs,retryDelays,makeId,setTimer,clearTimer});
    this.debug=debug===true;this._guestKey=this.debug?DEBUG_GUEST_SAVE_KEY:GUEST_SAVE_KEY;
    this._savePath=this.debug?'/api/account/debug-save':'/api/account/save';
    this.origin=null;try{this.origin=getServerConfigOptions({enabled:true,location,...(origin?{originOverride:origin}:{})}).origin;}catch{}
    this._namespace=this.origin?`${PREFIX}${encodeURIComponent(this.origin)}:`:null;
    this._activeKey=this._namespace?`${this._namespace}active`:null;
    this.user=null;this.mode='guest';this.ready=true;this.status='guest';this.message='游客进度仅保存在当前浏览器。';
    this._epoch=0;this._timer=null;this._flight=null;this._identityBusy=false;this._disposed=false;this._attempt=0;this._record=null;this._cacheRaw=null;
    this._guestText=null;this._guestError=false;
    try{this._guestText=this._read(this._guestKey);this._parseSave(this._guestText);}catch{this._guestError=true;this.ready=false;this.status='error';this.message=messages.INVALID_SAVE;}
    if(this._activeKey)try{const hint=JSON.parse(this._read(this._activeKey)||'null');if(userValid(hint?.user)){this.user=hint.user;this.mode='account';this.ready=false;this.status='loading';this.message='正在读取账号进度。';this._loadRecord();}}catch{this.status='error';this.ready=false;this.message=messages.INVALID_SAVE;}
    if(this.origin&&this.status!=='error'){this.ready=false;this.status='loading';this.message='正在确认登录状态。';}
    this._onStorage=event=>this._storageChanged(event);
    eventTarget?.addEventListener?.('storage',this._onStorage);
  }
  get snapshot(){return {mode:this.mode,debug:this.debug,user:clone(this.user),ready:this.ready,canPlay:this.ready&&!['conflict','auth-required','loading','error'].includes(this.status),status:this.status,dirty:!!this._record?.dirty,message:this.message,hasGuestSave:!this._guestError&&!!this._guestText,originAvailable:!!this.origin};}
  _emit(reason,replaceSave=false){if(!this._disposed)this.onChange(this.snapshot,{reason,replaceSave});}
  _set(status,message,reason=status,replaceSave=false){this.status=status;this.message=message;this._emit(reason,replaceSave);}
  _read(key){try{if(!this.storage?.getItem)throw Error();return this.storage.getItem(key);}catch{throw new AccountError('STORAGE_UNAVAILABLE');}}
  _write(key,value){try{if(!this.storage?.setItem)throw Error();this.storage.setItem(key,value);}catch{throw new AccountError('STORAGE_UNAVAILABLE');}}
  _remove(key){try{if(!this.storage?.removeItem)throw Error();this.storage.removeItem(key);}catch{throw new AccountError('STORAGE_UNAVAILABLE');}}
  _parseSave(text){
    if(text===null)return null;
    if(typeof text!=='string'||bytes(text)>MAX_BYTES)throw new AccountError('INVALID_SAVE');
    try{const save=JSON.parse(text);this.validateSave(save);return save;}catch{throw new AccountError('INVALID_SAVE');}
  }
  _saveText(save){if(save===null)return null;const text=JSON.stringify(save);this._parseSave(text);return text;}
  _key(){return `${this._namespace}${this.debug?'debug-save':'save'}:${this.user.id}`;}
  _loadRecord(){
    const raw=this._read(this._key());this._cacheRaw=raw;this._record=null;if(!raw)return;
    let record;try{record=JSON.parse(raw);}catch{throw new AccountError('INVALID_SAVE');}
    if(record?.format!==1||!integer(record.revision)||typeof record.dirty!=='boolean'||typeof record.loaded!=='boolean'||typeof record.stamp!=='string')throw new AccountError('INVALID_SAVE');
    this._parseSave(record.saveText);
    if(record.pending){const p=record.pending;if(!integer(p.expectedRevision)||p.expectedRevision!==record.revision||!mutationValid(p.mutationId)||!record.dirty)throw new AccountError('INVALID_SAVE');if(p.sameSave===true&&!Object.hasOwn(p,'saveText'))p.saveText=record.saveText;delete p.sameSave;this._parseSave(p.saveText);}
    this._record=record;
  }
  _emptyRecord(){return {format:1,revision:0,updatedAt:null,saveText:null,dirty:false,pending:null,loaded:false,stamp:this.makeId()};}
  _checkExternal(){
    if(this.mode!=='account'){
      if(this._read(this._guestKey)!==this._guestText){this._conflict('STALE_STORAGE');throw new AccountError('STALE_STORAGE');}return;
    }
    const hint=JSON.parse(this._read(this._activeKey)||'null');
    if(hint?.user?.id!==this.user.id){this._set('auth-required',messages.ACCOUNT_CHANGED);throw new AccountError('ACCOUNT_CHANGED',401);}
    if(this._read(this._key())!==this._cacheRaw){this._conflict('STALE_STORAGE');throw new AccountError('STALE_STORAGE');}
  }
  _persistRecord({check=true}={}){
    if(check)this._checkExternal();
    const next={...this._record,stamp:this.makeId()},stored={...next};
    if(stored.pending?.saveText===stored.saveText){stored.pending={...stored.pending,sameSave:true};delete stored.pending.saveText;}
    const text=JSON.stringify(stored);this._write(this._key(),text);this._record=next;this._cacheRaw=text;
  }
  _conflict(code='SAVE_CONFLICT'){this._cancelTimer();this.ready=!!this._record?.loaded||this.mode==='guest';this._set('conflict',messages[code]);}
  _storageChanged(event){
    if(this._disposed||this._identityBusy)return;
    if(event.key===this._guestKey){
      if(this.mode==='guest'&&event.newValue!==this._guestText)this._conflict('STALE_STORAGE');
      else if(this.mode==='account')try{this._guestText=this._read(this._guestKey);this._parseSave(this._guestText);this._guestError=false;this._emit('guest-changed');}catch{this._guestError=true;}
    }
    if(this.mode==='account'&&(event.key===this._key()||event.key===this._activeKey||event.key===null)){
      try{this._checkExternal();}catch{}
    }
  }
  createSaveStorage(){
    const epoch=this._epoch,identity=this.user?.id??'guest';
    const check=()=>{if(this._disposed||epoch!==this._epoch||identity!==(this.user?.id??'guest'))throw new AccountError('STALE_STORAGE');if(!this.snapshot.canPlay)throw new AccountError(this.status==='conflict'?'SAVE_CONFLICT':this.status==='auth-required'?'AUTH_REQUIRED':'INVALID_SAVE');this._checkExternal();};
    return {
      getItem:key=>{if(key!==GUEST_SAVE_KEY)return null;check();return this.mode==='guest'?this._guestText:this._record?.saveText??null;},
      setItem:(key,text)=>{if(key!==GUEST_SAVE_KEY)throw new AccountError('INVALID_SAVE');check();this._parseSave(text);this._storeText(text);},
      removeItem:key=>{if(key!==GUEST_SAVE_KEY)return;check();this._storeText(null);},
    };
  }
  _storeText(text){
    if(this.mode==='guest'){
      if(text===null)this._remove(this._guestKey);else this._write(this._guestKey,text);
      this._guestText=text;this._guestError=false;this._emit('saved');return;
    }
    const previous=this._record;
    this._record={...previous,saveText:text,dirty:true};
    try{this._persistRecord();}catch(error){this._record=previous;throw error;}
    this._set(this._flight?'syncing':'pending',this._flight?'正在同步进度。':'进度已保存在本机，等待同步。','saved');this._schedule(this.debounceMs);
  }
  _cancelTimer(){if(this._timer!==null)this.clearTimer(this._timer);this._timer=null;}
  _schedule(delay){if(this._disposed||this._autoBlocked||this._timer!==null||this.status==='conflict'||this.status==='auth-required')return;this._timer=this.setTimer(()=>{this._timer=null;void this.flush();},delay);this._timer?.unref?.();}
  async _request(path,{method='GET',body,account=false}={}){
    if(!this.origin)throw new AccountError('API_UNAVAILABLE');
    const headers={Accept:'application/json'};
    if(method!=='GET'){headers['Content-Type']='application/json';headers['X-WR-Client']='browser';}
    if(account&&this.user)headers['X-WR-Account']=this.user.id;
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=this.setTimer(()=>{controller.abort();reject(new AccountError('NETWORK'));},this.timeoutMs);timer?.unref?.();});
    try{
      return await Promise.race([(async()=>{
        const response=await this.fetchImpl.call(globalThis,this.origin+path,{method,headers,credentials:'include',redirect:'error',cache:'no-store',signal:controller.signal,...(body===undefined?{}:{body:JSON.stringify(body)})});
        if(response.status===413)throw new AccountError('SAVE_TOO_LARGE',413);
        const text=await response.text();if(bytes(text)>MAX_BYTES+8192)throw new AccountError('INVALID_SAVE');
        let value;try{value=text?JSON.parse(text):{};}catch{throw new AccountError(response.ok?'INVALID_SAVE':'NETWORK',response.status);}
        if(!response.ok)throw new AccountError(typeof value.error==='string'?value.error:'NETWORK',response.status);
        return value;
      })(),timeout]);
    }catch(error){if(error instanceof AccountError)throw error;throw new AccountError('NETWORK');}
    finally{this.clearTimer(timer);}
  }
  _envelope(value){
    if(!value||!integer(value.revision)||!(value.updatedAt===null||typeof value.updatedAt==='string')||!Object.hasOwn(value,'save'))throw new AccountError('INVALID_SAVE');
    return {revision:value.revision,updatedAt:value.updatedAt,saveText:this._saveText(value.save)};
  }
  _adoptUser(user){
    if(!userValid(user))throw new AccountError('INVALID_SAVE');
    this._cancelTimer();this._epoch++;this.user={id:user.id,username:user.username};this.mode='account';this.ready=false;this._attempt=0;this._autoBlocked=false;this._blockedError=null;
    this._write(this._activeKey,JSON.stringify({user:this.user}));this._loadRecord();
  }
  async _loadCloud({discard=false}={}){
    if(this._record?.dirty&&!discard){const saved=await this.flush({allowLoading:true});if(!saved){if(this.snapshot.canPlay)this._emit('cached',true);return false;}}
    const epoch=this._epoch,value=this._envelope(await this._request(this._savePath,{account:true}));
    if(epoch!==this._epoch||this._disposed)return false;
    this._checkExternal();
    const unchanged=this._record?.loaded&&!this._record.dirty&&!this._record.pending&&this._record.revision===value.revision&&this._record.saveText===value.saveText&&this._record.updatedAt===value.updatedAt;
    if(!unchanged){this._record={...this._emptyRecord(),...value,loaded:true};this._persistRecord();}
    this.ready=true;this._set('ready','云端进度已同步。','loaded',true);return true;
  }
  _networkFailure(error,{replaceSave=false}={}){
    if(error.code==='SAVE_CONFLICT'||error.code==='STALE_STORAGE'){this._conflict(error.code);return false;}
    if(error.status===401){this._cancelTimer();this._set('auth-required',messages[error.code]||messages.AUTH_REQUIRED);return false;}
    if(error.code==='INVALID_SAVE'||error.code==='STORAGE_UNAVAILABLE'){this._blockedError=error.code;this.ready=false;this._set('error',error.message);return false;}
    this.ready=this.mode==='guest'?!this._guestError:!!this._record?.loaded;
    if(error.status===413){this._autoBlocked=true;this._cancelTimer();this._set('pending',messages.SAVE_TOO_LARGE,'upload-limit',replaceSave&&this.ready);return false;}
    this._set('pending',error.message||messages.NETWORK,'offline',replaceSave&&this.ready);
    if(this._record?.dirty&&this._attempt<this.retryDelays.length)this._schedule(this.retryDelays[this._attempt++]);
    return false;
  }
  async initialize(){
    if(this._identityBusy||this._disposed)return this.snapshot;
    if(!this.origin){if(this.mode==='guest')this._emit('initialized',true);return this.snapshot;}
    this._identityBusy=true;const epoch=this._epoch;
    try{
      const session=await this._request('/api/account/session');if(epoch!==this._epoch||this._disposed)return this.snapshot;
      if(!session.user){
        if(this.mode==='account')this._set('auth-required',messages.AUTH_REQUIRED);
        else{this.ready=!this._guestError;this._set(this._guestError?'error':'guest',this._guestError?messages.INVALID_SAVE:'游客进度仅保存在当前浏览器。','initialized',true);}
        return this.snapshot;
      }
      this._adoptUser(session.user);this._set('loading','正在读取账号进度。');await this._loadCloud();
    }catch(error){if(!this._disposed){if(this.mode==='account')this._networkFailure(error,{replaceSave:true});else{this.ready=!this._guestError;this._set(this._guestError?'error':'guest',this._guestError?messages.INVALID_SAVE:'游客进度仅保存在当前浏览器。','initialized',true);}}}
    finally{this._identityBusy=false;}
    return this.snapshot;
  }
  async _authenticate(path,{username,password,useGuestProgress=false}){
    if(this._identityBusy||this._disposed)throw new AccountError('BUSY');
    if(!/^[a-z\d_]{3,24}$/i.test(username||'')||typeof password!=='string'||password.length<8||password.length>128)throw new AccountError('INVALID_REQUEST');
    this._identityBusy=true;
    try{
      if(this._flight)await this._flight;
      else if(this.mode==='account'&&this._record?.dirty&&!['conflict','auth-required'].includes(this.status))await this.flush();
      if(this._disposed)return this.snapshot;
      let guest=null;if(useGuestProgress){guest=this._read(this._guestKey);this._parseSave(guest);}
      const session=await this._request(path,{method:'POST',body:{username,password}});
      if(this._disposed)return this.snapshot;
      this._adoptUser(session.user);this._set('loading','正在读取账号进度。');
      try{
        if(path.endsWith('/register')&&useGuestProgress&&guest!==null){
          // A successful registration owns a new, empty revision-zero slot.
          // Persist the explicit adoption before its first network write so a
          // connection loss cannot silently forget the chosen guest progress.
          this._record={...this._emptyRecord(),saveText:guest,dirty:true,loaded:true};this._persistRecord();
          await this.flush({allowLoading:true});this._emit('registered',true);
        }else await this._loadCloud();
      }catch(error){if(!this._disposed)this._networkFailure(error,{replaceSave:true});}
      return this.snapshot;
    }finally{this._identityBusy=false;}
  }
  login(credentials){return this._authenticate('/api/account/login',{...credentials,useGuestProgress:false});}
  register(credentials){return this._authenticate('/api/account/register',credentials);}
  async logout(){
    if(this.mode==='guest')return this.snapshot;
    if(this._identityBusy||this._disposed)throw new AccountError('BUSY');this._identityBusy=true;
    try{
      if(this._flight)await this._flight;else await this.flush();
      if(this._disposed)return this.snapshot;
      try{await this._request('/api/account/logout',{method:'POST',body:{},account:true});}
      catch(error){if(error.status!==401)throw error;}
      if(this._disposed)return this.snapshot;
      const hint=JSON.parse(this._read(this._activeKey)||'null');if(hint?.user?.id===this.user.id)this._remove(this._activeKey);
      this._cancelTimer();this._epoch++;this.user=null;this.mode='guest';this._record=null;this._cacheRaw=null;
      try{this._guestText=this._read(this._guestKey);this._parseSave(this._guestText);}catch(error){this._guestError=true;this.ready=false;this._set('error',error.message,'logout',true);return this.snapshot;}
      this._guestError=false;this.ready=true;
      this._set('guest','游客进度仅保存在当前浏览器。','logout',true);return this.snapshot;
    }finally{this._identityBusy=false;}
  }
  async reloadCloud(){
    if(this._identityBusy||this._disposed)throw new AccountError('BUSY');this._identityBusy=true;
    try{
      this._cancelTimer();if(this._flight)await this._flight;if(this._disposed)return this.snapshot;this._epoch++;
      if(this.mode==='guest'){
        this._guestText=this._read(this._guestKey);this._parseSave(this._guestText);this._guestError=false;this.ready=true;this._set('guest','游客进度仅保存在当前浏览器。','loaded',true);
      }else{
        // Explicit reload discards pending local content only after a valid
        // cloud response. It can recover a malformed local cache as well.
        this._cacheRaw=this._read(this._key());this.ready=false;this._set('loading','正在读取最新云端进度。');await this._loadCloud({discard:true});
      }
    }catch(error){if(!this._disposed)this._networkFailure(error,{replaceSave:true});}
    finally{this._identityBusy=false;}
    return this.snapshot;
  }
  async flush({allowLoading=false}={}){
    if(this.mode==='guest')return !this._guestError;
    if(this._flight)return this._flight;
    if(!allowLoading&&!this._record?.loaded&&this.status==='pending'){await this.initialize();return this.snapshot.canPlay;}
    const retryStorage=this.status==='error'&&this._blockedError==='STORAGE_UNAVAILABLE';
    if(this._disposed||['conflict','auth-required'].includes(this.status)||this.status==='error'&&!retryStorage||!allowLoading&&!this.ready&&!retryStorage)return false;
    if(!this._record?.dirty)return true;
    this._cancelTimer();const epoch=this._epoch;
    this._flight=(async()=>{
      await Promise.resolve();
      try{
        this._checkExternal();
        if(!this._record.pending){const previous=this._record;this._record={...previous,pending:{expectedRevision:previous.revision,mutationId:this.makeId(),saveText:previous.saveText}};try{this._persistRecord();}catch(error){this._record=previous;throw error;}}
        const pending=this._record.pending;
        this._set('syncing','正在同步进度。');
        const result=this._envelope(await this._request(this._savePath,{method:'PUT',account:true,body:{expectedRevision:pending.expectedRevision,mutationId:pending.mutationId,save:this._parseSave(pending.saveText)}}));
        if(epoch!==this._epoch||this._disposed)return false;
        this._checkExternal();
        if(result.revision!==pending.expectedRevision+1||result.saveText!==pending.saveText)throw new AccountError('SAVE_CONFLICT',409);
        const dirty=this._record.saveText!==pending.saveText;
        const previous=this._record;this._record={...previous,revision:result.revision,updatedAt:result.updatedAt,loaded:true,pending:null,dirty};
        try{this._persistRecord();}catch(error){this._record=previous;throw error;}
        this.ready=true;this._attempt=0;this._blockedError=null;this._autoBlocked=false;
        this._set(dirty?'pending':'ready',dirty?'进度已保存在本机，等待同步。':'云端进度已同步。','synced');
        if(dirty)this._schedule(this.debounceMs);return !dirty;
      }catch(error){if(epoch===this._epoch&&!this._disposed)this._networkFailure(error);return false;}
      finally{this._flight=null;}
    })();return this._flight;
  }
  async retry(){
    if(this._disposed||this._identityBusy)return false;
    if(this.mode==='guest'||!this._record?.loaded){await this.initialize();return this.snapshot.canPlay;}
    if(this._record.dirty)return this.flush();
    if(this.status!=='pending')return this.snapshot.canPlay;
    const epoch=this._epoch;
    try{
      const current=this._envelope(await this._request(this._savePath,{account:true}));if(epoch!==this._epoch||this._disposed)return false;
      this._checkExternal();
      if(current.revision!==this._record.revision||!this._record.dirty&&current.saveText!==this._record.saveText)throw new AccountError('SAVE_CONFLICT',409);
      if(this._record.dirty)return this.flush();
      this._set('ready','云端进度已同步。');return true;
    }catch(error){if(epoch===this._epoch&&!this._disposed)return this._networkFailure(error);return false;}
  }
  dispose(){this._disposed=true;this._epoch++;this._cancelTimer();this.eventTarget?.removeEventListener?.('storage',this._onStorage);}
}
