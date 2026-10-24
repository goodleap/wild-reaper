import assert from 'node:assert/strict';
import { AccountClient, GUEST_SAVE_KEY } from './dist/account-client.js';

const origin='https://api.game.example';
const world=level=>({version:1,start:{hero:'traveler'},player:{level}});
const text=level=>JSON.stringify(world(level));
const validateSave=value=>{if(value?.version!==1||!value.start||!Number.isInteger(value.player?.level))throw Error('invalid world');};
const memory=()=>{const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Service {
  constructor(){this.users=new Map();this.current=null;this.calls=[];this.offline=false;this.losePut=false;this.pausePut=null;this.nextId=0;}
  add(username,level=null){const user={id:`account-${++this.nextId}`,username};this.users.set(username,{user,password:'password8',revision:level===null?0:1,save:level===null?null:world(level),mutation:null});return user;}
  envelope(record){return {revision:record.revision,updatedAt:record.revision?'2026-10-24T00:00:00.000Z':null,save:record.save};}
  fetch=async(url,options)=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
    assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    if(options.method!=='GET'){assert.equal(options.headers['X-WR-Client'],'browser');assert.equal(options.headers['Content-Type'],'application/json');}
    this.calls.push({path,method:options.method,body});
    if(this.offline)throw Error('offline');
    if(path.endsWith('/session'))return response({user:this.current?.user??null});
    if(path.endsWith('/register')){
      if(this.users.has(body.username))return response({error:'USERNAME_TAKEN'},409);
      this.add(body.username);this.current=this.users.get(body.username);return response({user:this.current.user},201);
    }
    if(path.endsWith('/login')){
      const record=this.users.get(body.username);if(!record||record.password!==body.password)return response({error:'INVALID_CREDENTIALS'},401);
      this.current=record;return response({user:record.user});
    }
    if(!this.current)return response({error:'AUTH_REQUIRED'},401);
    if(options.headers['X-WR-Account']!==this.current.user.id)return response({error:'ACCOUNT_CHANGED'},401);
    if(path.endsWith('/logout')){this.current=null;return response({user:null});}
    assert.equal(path,'/api/account/save');
    const account=this.current;
    if(options.method==='GET')return response(this.envelope(account));
    if(this.pausePut){const gate=this.pausePut;this.pausePut=null;await gate.promise;}
    if(account.mutation===body.mutationId)return response(this.envelope(account));
    if(body.expectedRevision!==account.revision)return response({error:'SAVE_CONFLICT',revision:account.revision},409);
    account.revision++;account.save=body.save;account.mutation=body.mutationId;
    if(this.losePut){this.losePut=false;throw Error('reply lost after commit');}
    return response(this.envelope(account));
  };
}
const clients=[];
const client=(api,storage=memory(),options={})=>{const result=new AccountClient({origin,storage,fetchImpl:api.fetch,validateSave,debounceMs:60_000,retryDelays:[],eventTarget:null,...options});clients.push(result);return result;};
const login=(c,username)=>c.login({username,password:'password8'});
try {
  // Historical browser saves are not migrated into the new visitor slot.
  const api=new Service(),storage=memory();storage.setItem('wild-echoes-world-save-v1',text(99));
  const guest=client(api,storage);assert.equal(guest.snapshot.canPlay,false,'session discovery finishes before either mode can start');await guest.initialize();assert.equal(guest.snapshot.mode,'guest');assert.equal(guest.snapshot.hasGuestSave,false);
  const guestAdapter=guest.createSaveStorage();assert.equal(guestAdapter.getItem(GUEST_SAVE_KEY),null);guestAdapter.setItem(GUEST_SAVE_KEY,text(3));
  assert.equal(storage.getItem(GUEST_SAVE_KEY),text(3));assert.equal(api.calls.filter(c=>c.path.endsWith('/save')).length,0);
  assert.throws(()=>guestAdapter.setItem('other-slot',text(4)));
  const refreshed=client(api,storage);await refreshed.initialize();assert.equal(refreshed.createSaveStorage().getItem(GUEST_SAVE_KEY),text(3));refreshed.dispose();

  await guest.register({username:'new_player',password:'password8',useGuestProgress:true});
  assert.equal(guest.snapshot.mode,'account');assert.equal(guest.snapshot.status,'ready');assert.equal(api.current.save.player.level,3);assert.equal(storage.getItem(GUEST_SAVE_KEY),text(3));
  assert.throws(()=>guestAdapter.setItem(GUEST_SAVE_KEY,text(7)),'an old guest adapter cannot write into the account');
  const accountAdapter=guest.createSaveStorage();accountAdapter.setItem(GUEST_SAVE_KEY,text(5));assert.equal(api.current.save.player.level,3);
  assert(await guest.flush());assert.equal(api.current.save.player.level,5);
  accountAdapter.removeItem(GUEST_SAVE_KEY);assert(await guest.flush());assert.equal(api.current.save,null);assert.equal(api.current.revision,3,'reset retains the monotonic cloud revision');
  await guest.logout();assert.equal(guest.snapshot.mode,'guest');assert.equal(guest.createSaveStorage().getItem(GUEST_SAVE_KEY),text(3));assert.throws(()=>accountAdapter.setItem(GUEST_SAVE_KEY,text(9)));

  // Existing accounts start from their own cloud record, never the guest's.
  api.add('existing',12);await login(guest,'existing');assert.equal(guest.createSaveStorage().getItem(GUEST_SAVE_KEY),text(12));assert.equal(storage.getItem(GUEST_SAVE_KEY),text(3));
  await assert.rejects(guest.login({username:'existing',password:'wrongpass'}),{code:'INVALID_CREDENTIALS'});assert.equal(guest.snapshot.user.username,'existing');

  // A lost response retains the exact mutation and original CAS base over a refresh.
  const old=guest.createSaveStorage();old.setItem(GUEST_SAVE_KEY,text(13));api.losePut=true;
  assert.equal(await guest.flush(),false);assert.equal(api.current.revision,2);assert.equal(guest.snapshot.dirty,true);guest.dispose();
  const recovering=client(api,storage);await recovering.initialize();assert.equal(api.current.revision,2,'the retry is idempotent, not a second write');assert.equal(recovering.snapshot.dirty,false);assert.equal(recovering.createSaveStorage().getItem(GUEST_SAVE_KEY),text(13));
  const writes=api.calls.filter(c=>c.method==='PUT').slice(-2);assert.deepEqual(writes[0].body,writes[1].body,'refresh retries byte-equivalent logical content and mutation id');

  // Offline cached identity remains an account. No cloud or guest record is overwritten.
  recovering.createSaveStorage().setItem(GUEST_SAVE_KEY,text(14));api.offline=true;await recovering.flush();recovering.dispose();
  const offline=client(api,storage);await offline.initialize();assert.equal(offline.snapshot.mode,'account');assert(offline.snapshot.canPlay);assert.equal(offline.snapshot.status,'pending');
  const offlineAdapter=offline.createSaveStorage();offlineAdapter.setItem(GUEST_SAVE_KEY,text(15));api.offline=false;
  await offline.flush();await offline.flush();assert.equal(api.current.save.player.level,15);assert.equal(offline.snapshot.dirty,false);
  api.offline=true;await assert.rejects(offline.logout(),{code:'NETWORK'});assert.equal(offline.snapshot.mode,'account');api.offline=false;

  // Session GET can succeed while the pending save fails: the local adapter
  // must still be replaced after initialization with its usable account cache.
  offlineAdapter.setItem(GUEST_SAVE_KEY,text(16));offline.dispose();const changes=[];
  const partial=client(api,storage,{onChange:(state,event)=>changes.push({state,event}),fetchImpl:async(url,options)=>url.endsWith('/save')?Promise.reject(Error('offline')):api.fetch(url,options)});
  await partial.initialize();assert(partial.snapshot.canPlay);assert(changes.some(c=>c.event.replaceSave&&c.state.canPlay));assert.equal(partial.createSaveStorage().getItem(GUEST_SAVE_KEY),text(16));partial.dispose();

  // Updates captured while a write is in flight queue a later mutation.
  const serial=client(api,storage);await serial.initialize();const slot=serial.createSaveStorage();slot.setItem(GUEST_SAVE_KEY,text(17));
  const gate=deferred();api.pausePut=gate;const first=serial.flush();await tick();slot.setItem(GUEST_SAVE_KEY,text(18));gate.resolve();assert.equal(await first,false);assert.equal(serial.snapshot.dirty,true);
  assert(await serial.flush());assert.equal(api.current.save.player.level,18);assert.equal(serial.snapshot.dirty,false);

  // A different device starts from the same cloud version but owns its own cache.
  const another=client(api);await another.initialize();const otherSlot=another.createSaveStorage();
  slot.setItem(GUEST_SAVE_KEY,text(19));assert(await serial.flush());otherSlot.setItem(GUEST_SAVE_KEY,text(20));assert.equal(await another.flush(),false);assert.equal(another.snapshot.status,'conflict');assert.equal(another.snapshot.canPlay,false);assert.equal(api.current.save.player.level,19);
  assert.throws(()=>otherSlot.setItem(GUEST_SAVE_KEY,text(21)));await another.reloadCloud();assert.equal(another.createSaveStorage().getItem(GUEST_SAVE_KEY),text(19));assert.throws(()=>otherSlot.setItem(GUEST_SAVE_KEY,text(22)));

  // Same-browser tabs detect even local unuploaded changes, instead of adopting
  // another page's newer CAS revision while keeping their own old game instance.
  const shared=memory(),tabOne=client(api,shared);await tabOne.initialize();const tabTwo=client(api,shared);await tabTwo.initialize();
  assert(tabOne.createSaveStorage().getItem(GUEST_SAVE_KEY),'opening an unchanged cloud record does not invalidate another clean page');
  tabTwo.createSaveStorage().setItem(GUEST_SAVE_KEY,text(29));
  assert.throws(()=>tabOne.createSaveStorage().setItem(GUEST_SAVE_KEY,text(30)),{code:'STALE_STORAGE'});assert.equal(tabOne.snapshot.status,'conflict');

  // A changed cookie cannot redirect an old tab's save into a different account,
  // even if its revision happens to match.
  api.add('other_account');const switching=client(api);await login(switching,'other_account');
  const wrongAccountBefore=api.current.revision;
  slot.setItem(GUEST_SAVE_KEY,text(22));assert.equal(await serial.flush(),false);assert.equal(serial.snapshot.status,'auth-required');assert.equal(api.current.revision,wrongAccountBefore);assert.equal(api.current.save,null);
  await serial.logout();assert.equal(api.current.user.username,'other_account','an old tab cannot log out the newer cookie account');assert.equal(serial.snapshot.mode,'guest');

  // A newly registered guest adoption is durable even if its first upload fails.
  const regStorage=memory();regStorage.setItem(GUEST_SAVE_KEY,text(8));const regApi=new Service();
  const registerOffline=client(regApi,regStorage,{fetchImpl:async(url,options)=>{if(url.endsWith('/save'))throw Error('offline');return regApi.fetch(url,options);}});
  await registerOffline.register({username:'adopt_offline',password:'password8',useGuestProgress:true});assert(registerOffline.snapshot.canPlay);assert(registerOffline.snapshot.dirty);assert.equal(registerOffline.createSaveStorage().getItem(GUEST_SAVE_KEY),text(8));registerOffline.dispose();
  const adopted=client(regApi,regStorage);await adopted.initialize();assert.equal(regApi.current.save.player.level,8);assert.equal(adopted.snapshot.status,'ready');

  // Corrupt remote content cannot replace a valid cache or reset a campaign.
  const badApi=new Service();badApi.add('bad_cloud',4);const bad=client(badApi);await login(bad,'bad_cloud');const savedBad=bad.createSaveStorage();badApi.current.save={version:1,player:{level:999}};
  await bad.reloadCloud();assert.equal(bad.snapshot.status,'error');assert.equal(bad.snapshot.canPlay,false);assert.throws(()=>savedBad.setItem(GUEST_SAVE_KEY,text(5)));

  // An initial cloud read outage has a retry path even with no local campaign.
  const coldApi=new Service();coldApi.add('cold_load',7);let coldOffline=true;
  const cold=client(coldApi,memory(),{fetchImpl:(url,options)=>coldOffline&&url.endsWith('/save')?Promise.reject(Error('offline')):coldApi.fetch(url,options)});
  await login(cold,'cold_load');assert.equal(cold.snapshot.canPlay,false);assert.equal(cold.snapshot.status,'pending');coldOffline=false;
  assert(await cold.retry());assert.equal(cold.createSaveStorage().getItem(GUEST_SAVE_KEY),text(7));
  const coldKey=[...cold.storage.map.keys()].find(key=>key.includes(':save:'));cold.storage.setItem(coldKey,'broken');
  const broken=client(coldApi,cold.storage);await broken.initialize();assert.equal(broken.snapshot.status,'error');await broken.reloadCloud();assert.equal(broken.snapshot.canPlay,true);assert.equal(broken.createSaveStorage().getItem(GUEST_SAVE_KEY),text(7));

  // Pending payloads share one serialized copy while unchanged. If a later
  // checkpoint needs a second copy and hits quota, retain the original commit.
  const quotaApi=new Service();quotaApi.add('quota_user');const quotaStorage=memory();let limit=Infinity;
  const originalWrite=quotaStorage.setItem;quotaStorage.setItem=(key,value)=>{if(value.length>limit)throw Error('QuotaExceededError');originalWrite(key,value);};
  const quota=client(quotaApi,quotaStorage);await login(quota,'quota_user');const quotaSlot=quota.createSaveStorage();
  const large=JSON.stringify({...world(40),padding:'x'.repeat(400_000)});quotaSlot.setItem(GUEST_SAVE_KEY,large);quotaApi.losePut=true;await quota.flush();
  const quotaKey=[...quotaStorage.map.keys()].find(key=>key.includes(':save:')),raw=quotaStorage.getItem(quotaKey),storedPending=JSON.parse(raw).pending;
  assert.equal(storedPending.sameSave,true);assert(!Object.hasOwn(storedPending,'saveText'));assert(raw.length<large.length+1500);
  limit=raw.length+500;assert.throws(()=>quotaSlot.setItem(GUEST_SAVE_KEY,large.replace('"level":40','"level":41')),{code:'STORAGE_UNAVAILABLE'});
  assert.equal(quotaStorage.getItem(quotaKey),raw);assert.equal(quotaSlot.getItem(GUEST_SAVE_KEY),large);assert(quota.snapshot.dirty);
  limit=Infinity;assert(await quota.flush());assert.equal(quotaApi.current.revision,1,'quota recovery retries the committed mutation without another revision');

  // A server commit followed by a failed local ACK write keeps its original
  // pending mutation for an idempotent retry once disk space becomes available.
  const ackApi=new Service();ackApi.add('ack_user');const ackStorage=memory(),ackWrite=ackStorage.setItem;let failAck=false,armed=false;
  ackStorage.setItem=(key,value)=>{if(failAck)throw Error('quota');ackWrite(key,value);};
  const ack=client(ackApi,ackStorage,{fetchImpl:async(url,options)=>{const reply=await ackApi.fetch(url,options);if(armed&&options.method==='PUT')failAck=true;return reply;}});
  await login(ack,'ack_user');ack.createSaveStorage().setItem(GUEST_SAVE_KEY,text(6));armed=true;assert.equal(await ack.flush(),false);assert.equal(ack.snapshot.status,'error');assert(ack.snapshot.dirty);assert.equal(ackApi.current.revision,1);
  failAck=false;armed=false;assert(await ack.flush());assert.equal(ackApi.current.revision,1);assert.equal(ack.snapshot.dirty,false);

  // The browser storage event stops an already running page before its next
  // checkpoint; write-time checks also cover a missed or delayed event.
  const events=new EventTarget(),eventStorage=memory(),eventApi=new Service();eventApi.add('event_user');
  const observing=client(eventApi,eventStorage,{eventTarget:events});await login(observing,'event_user');const eventKey=[...eventStorage.map.keys()].find(key=>key.includes(':save:'));
  const otherRecord=JSON.parse(eventStorage.getItem(eventKey));otherRecord.stamp='another-tab';eventStorage.setItem(eventKey,JSON.stringify(otherRecord));
  events.dispatchEvent(Object.assign(new Event('storage'),{key:eventKey,newValue:eventStorage.getItem(eventKey)}));assert.equal(observing.snapshot.status,'conflict');

  // A proxy's HTML 413 is actionable and never enters the timed network retry loop.
  const limitApi=new Service();limitApi.add('proxy_limit');let rejectLarge=false;
  const limited=client(limitApi,memory(),{fetchImpl:(url,options)=>rejectLarge&&options.method==='PUT'?Promise.resolve(new Response('<html>too large</html>',{status:413})):limitApi.fetch(url,options)});
  await login(limited,'proxy_limit');limited.createSaveStorage().setItem(GUEST_SAVE_KEY,text(4));rejectLarge=true;await limited.flush();assert.match(limited.snapshot.message,/服务器上传限制/);assert.equal(limited._timer,null);
  limited.createSaveStorage().setItem(GUEST_SAVE_KEY,text(5));assert.equal(limited._timer,null);rejectLarge=false;await limited.retry();await limited.retry();assert.equal(limitApi.current.save.player.level,5);

  // An old read retry may finish after an explicit identity switch. Neither
  // its successful data nor its late authentication error owns the new state.
  const raceApi=new Service();raceApi.add('race_old',2);raceApi.add('race_new',9);let delayedRead=null;
  const racing=client(raceApi,memory(),{fetchImpl:(url,options)=>{
    if(delayedRead&&url.endsWith('/save')&&options.method==='GET'){const gate=delayedRead;delayedRead=null;return gate.promise;}
    return raceApi.fetch(url,options);
  }});
  await login(racing,'race_old');racing._set('pending','offline');const late=deferred();delayedRead=late;const oldRetry=racing.retry();
  await login(racing,'race_new');assert.equal(racing.snapshot.status,'ready');late.resolve(response({error:'ACCOUNT_CHANGED'},401));assert.equal(await oldRetry,false);
  assert.equal(racing.snapshot.user.username,'race_new');assert.equal(racing.snapshot.status,'ready');assert.equal(racing.createSaveStorage().getItem(GUEST_SAVE_KEY),text(9));
  const disposedStorage=memory(),loginGate=deferred();let disposedChange=0;
  const disposedLogin=client(raceApi,disposedStorage,{fetchImpl:()=>loginGate.promise,onChange:()=>disposedChange++});const lateLogin=login(disposedLogin,'race_old');disposedLogin.dispose();
  loginGate.resolve(response({user:raceApi.users.get('race_old').user}));await lateLogin;assert.equal(disposedStorage.map.size,0,'disposed authentication does not write a new identity or cache');assert.equal(disposedChange,0);

  const requests=api.calls.filter(c=>c.method==='PUT');assert(requests.every(c=>!Object.hasOwn(c.body,'username')&&!Object.hasOwn(c.body,'password')));
  console.log('Account client: isolated guest/account slots, explicit adoption, identity-bound adapters, durable CAS/idempotent retries, serial writes, offline/cold-load recovery, reset revisions, multi-device/tab conflicts, cookie binding, corrupt cache recovery, bounded quota-safe pending data and proxy upload limits passed.');
} finally {for(const c of clients)c.dispose();}
