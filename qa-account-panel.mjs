import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAccountPanel } from './dist/account-panel.js';

const html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
const markup=html.slice(html.indexOf('<div class="modal-layer account-overlay'),html.indexOf('<div class="modal-layer hidden" id="end-overlay"'));
assert.match(markup,/role="dialog" aria-modal="true" aria-labelledby="account-title"/);
assert.match(markup,/type="password"[^>]+autocomplete="current-password"/);
assert.match(markup,/id="account-error"[^>]+role="alert"/);
assert.match(html,/id="account-button"[^>]+aria-haspopup="dialog"/);
assert.match(html,/id="pause-account-button"/);

function fixture(callbacks={}){
  const nodes=new Map();
  for(const match of markup.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
    const classes=new Set((match[0].match(/class="([^"]+)"/)?.[1]||'').split(/\s+/));
    const attributes=new Map(),listeners=new Map();
    const node={id:match[1],value:'',textContent:'',hidden:false,disabled:false,checked:/\bchecked\b/.test(match[0]),dataset:{},
      classList:{toggle:(name,force)=>force?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},
      setAttribute:(key,value)=>attributes.set(key,String(value)),getAttribute:key=>attributes.get(key)??null,
      addEventListener:(key,handler)=>listeners.set(key,handler),
      fire(type){const event={preventDefault(){this.defaultPrevented=true;}};listeners.get(type)?.(event);return event;}
    };
    nodes.set(node.id,node);
  }
  const root=nodes.get('account-overlay');root.querySelector=id=>nodes.get(id.slice(1));
  return {nodes,node:id=>nodes.get(`account-${id}`),view:createAccountPanel(root,callbacks)};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const guest={mode:'guest',user:null,status:'guest',hasGuestSave:true};
const account={mode:'account',user:{id:'test-id',username:'Player_One'},status:'ready',hasGuestSave:true};
const calls=[];let resolveLogin;
const f=fixture({onLogin:data=>{calls.push(['login',data]);return new Promise(resolve=>{resolveLogin=resolve;});},onRegister:data=>calls.push(['register',data]),onLogout:()=>calls.push(['logout']),onRetry:()=>calls.push(['retry']),onReload:()=>calls.push(['reload']),onClose:()=>calls.push(['close'])});
f.view.render(guest);
assert.equal(f.node('guest-option').hidden,true,'guest adoption is never offered when logging in to an existing account');
assert.equal(f.view.preferredFocus(),f.node('username'));
f.node('username').value='ab';f.node('password').value='password123';f.node('form').fire('submit');
assert.match(f.node('error').textContent,/账号名/);assert.equal(calls.length,0);
f.node('username').value='Player_One';f.node('password').value='short';f.node('form').fire('submit');
assert.match(f.node('error').textContent,/密码/);assert.equal(calls.length,0);
f.node('password').value='password123';f.node('form').fire('submit');
assert.equal(f.node('password').value,'','secrets leave the DOM immediately after submission');
assert(f.view.busy);assert(f.node('close').disabled);assert(f.node('submit').disabled);
f.node('password').value='password456';f.node('form').fire('submit');f.node('logout').fire('click');
assert.equal(calls.length,1,'a pending action cannot be submitted twice or interleaved with logout');
assert.deepEqual(calls[0],['login',{username:'Player_One',password:'password123'}]);
resolveLogin();await settle();assert(!f.view.busy);assert.equal(f.node('password').value,'');
f.view.setMode('register');assert.equal(f.node('password').getAttribute('autocomplete'),'new-password');assert(!f.node('guest-option').hidden);
f.node('password').value='password123';f.node('form').fire('submit');await settle();
assert.deepEqual(calls.at(-1),['register',{username:'Player_One',password:'password123',useGuestProgress:true}]);
f.view.render({...guest,hasGuestSave:false});assert(f.node('guest-option').hidden);
f.node('password').value='password123';f.node('form').fire('submit');await settle();assert.equal(calls.at(-1)[1].useGuestProgress,false);
f.view.render(account);assert(f.node('form').hidden);assert(!f.node('profile').hidden);assert.equal(f.node('username-display').textContent,'Player_One');assert.equal(f.view.preferredFocus(),f.node('close'));
f.view.render({...account,status:'pending'});assert(!f.node('retry').hidden);assert(f.node('reload').hidden);f.node('retry').fire('click');await settle();assert.deepEqual(calls.at(-1),['retry']);
f.view.render({...account,status:'conflict'});assert(f.node('retry').hidden);assert(!f.node('reload').hidden);assert.match(f.node('status').textContent,/其他页面更新/);f.node('reload').fire('click');await settle();assert.deepEqual(calls.at(-1),['reload']);
f.view.render({...account,status:'auth-required'});assert(!f.node('form').hidden);assert(f.node('username').readOnly);assert.equal(f.node('username').value,'Player_One');assert(f.node('tabs').hidden);assert(f.node('guest-option').hidden);
f.view.render({...guest,debug:true});assert(!f.node('debug-note').hidden);assert(!f.node('guest-note').hidden);assert.equal(f.node('tab-login').getAttribute('aria-pressed'),'true');
f.node('password').value='secret123';f.node('close').fire('click');assert.equal(f.node('password').value,'');assert.deepEqual(calls.at(-1),['close']);
f.view.render({...guest,status:'conflict',message:'generic conflict'});
assert(!f.node('profile').hidden);assert(!f.node('actions').hidden);assert(f.node('form').hidden);assert(f.node('logout').hidden);
assert.equal(f.node('reload').textContent,'读取本机进度');assert.match(f.node('status').textContent,/本机进度/);
f.node('reload').fire('click');await settle();assert.deepEqual(calls.at(-1),['reload'],'a guest tab can recover by explicitly reloading local progress');
f.view.render({...account,status:'conflict'});assert.equal(f.node('reload').textContent,'读取云端进度');assert.match(f.node('status').textContent,/读取后将替换本机未同步进度/);
f.view.render({...account,status:'error',message:'本机账号缓存无法读取。'});
assert(!f.node('reload').hidden);assert(!f.node('retry').hidden);assert.match(f.node('status').textContent,/读取后将替换本机未同步进度/);
f.node('reload').fire('click');await settle();assert.deepEqual(calls.at(-1),['reload'],'a damaged account cache can explicitly reload the cloud save');
f.view.render({...guest,status:'error'});assert(f.node('reload').hidden,'a guest cache error never offers cloud recovery');
f.view.render({...guest,status:'loading'});assert(!f.node('profile').hidden);assert.match(f.node('status').textContent,/正在确认账号状态/);assert(f.node('form').hidden);assert(f.node('guest-note').hidden);
f.view.render({...guest,originAvailable:false});
assert.match(f.node('status').textContent,/当前地址未配置账号服务/);assert(f.node('username').disabled);assert(f.node('password').disabled);assert(f.node('submit').disabled);assert(f.node('tab-register').disabled);assert(!f.node('close').disabled);
const beforeUnavailable=calls.length;f.node('username').value='Player';f.node('password').value='password123';f.node('form').fire('submit');await settle();assert.equal(calls.length,beforeUnavailable,'an unavailable account origin never attempts a password request');
assert.equal(f.view.preferredFocus(),f.node('close'));
const hostile='<img src=x onerror=alert(1)>',failed=fixture({onLogin:()=>{throw new Error(hostile);}});
failed.node('username').value='Player';failed.node('password').value='password123';failed.node('form').fire('submit');await settle();
assert.equal(failed.node('error').textContent,hostile);assert.equal(failed.node('error').innerHTML,undefined,'errors are rendered only as text');assert(!failed.view.busy);assert.equal(failed.node('password').value,'');
console.log('Account panel: login/register intent, guest adoption opt-in, pending actions, account/guest conflict, session checking, missing API origin, literal errors and password cleanup passed.');
