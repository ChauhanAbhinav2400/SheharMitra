import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {authentication,csrfProtection,createAuthRouter} from '../src/auth.js';
import {LocalStore,emptyState} from '../src/data/store.js';
import {config} from '../src/config.js';
import {iceCredentials} from '../src/turn.js';
import {createApiClient} from '../../frontend/src/lib/api.js';

test('Firebase sign-in works after logout and recovers a stale app session before verifying the token',async()=>{
 const previous=config.otpProvider;config.otpProvider='firebase';
 try{
  const state=emptyState();state.users.push({id:'returning-user',name:'Returning user',phone:'9000000008',passwordHash:'unused',firebaseUid:'test-firebase-uid',roles:['buyer'],partnerStatus:'none'});
  const db=new LocalStore(state);let verified=0,dropSession=false,csrfRequests=0,exchanges=0;
  const app=express();app.use(express.json(),cookieParser(),authentication(db),csrfProtection);app.use('/api/auth',createAuthRouter(db,async()=>{verified++;return {uid:'test-firebase-uid',phone:'9000000008'};}));app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||400).json({error:{code:error.code||'invalid_input'}}));
  const agent=request.agent(app);
  const api=createApiClient('http://localhost/api',async(input,options)=>{
   const path=new URL(String(input)).pathname,method=(options?.method||'GET').toLowerCase();
   if(path==='/api/auth/csrf')csrfRequests++;
   if(path==='/api/auth/firebase'){exchanges++;if(dropSession){dropSession=false;await db.transaction(s=>{s.sessions=[];});}}
   const req=method==='post'?agent.post(path):agent.get(path);req.set('Origin','http://localhost:3000');new Headers(options?.headers).forEach((value,key)=>req.set(key,value));if(options?.body)req.send(JSON.parse(String(options.body)));
   const response=await req;return new Response(JSON.stringify(response.body),{status:response.status});
  });
  const login=()=>api('/auth/firebase',{method:'POST',body:JSON.stringify({idToken:'synthetic-id-token-123456789'})});
  await api('/auth/me');await login();await api('/auth/logout',{method:'POST'});assert.equal(await db.read(s=>s.sessions.some(x=>x.userId==='returning-user')),false);
  // No page refresh or /me call between logout and login.
  assert.equal((await login()).user.id,'returning-user');assert.equal(verified,2);
  const beforeCsrf=csrfRequests;dropSession=true;assert.equal((await login()).user.id,'returning-user');assert.equal(csrfRequests-beforeCsrf,2);assert.equal(verified,3);assert.equal(exchanges,4);
  assert.equal((await api('/auth/me')).user.id,'returning-user');
 }finally{config.otpProvider=previous;}
});
test('Firebase exchange uses verified phone, preserves roles, rejects client authority and requires password to link',async()=>{
 const previous=config.otpProvider;config.otpProvider='firebase';
 try{const state=emptyState();state.users.push({id:'existing',name:'Owner',phone:'9000000001',passwordHash:await bcrypt.hash('ExistingPassword123!',4),roles:['buyer','admin'],partnerStatus:'none'});const db=new LocalStore(state);
 const app=express();app.use(express.json(),cookieParser(),authentication(db),csrfProtection);app.use('/auth',createAuthRouter(db,async token=>{if(token==='invalid-token-123456789')throw Object.assign(Error(),{status:401});return {uid:token==='existing-token-123456789'?'uid-owner':'uid-new',phone:token==='existing-token-123456789'?'9000000001':'9000000002'};}));app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||400).json({error:true}));
 const agent=request.agent(app),csrf=(await agent.get('/auth/me')).body.csrfToken;
 const post=(body:any,token=csrf)=>agent.post('/auth/firebase').set('Origin','http://localhost:3000').set('X-CSRF-Token',token).send(body);
 assert.equal((await post({idToken:'invalid-token-123456789'})).status,401);
 assert.equal((await post({idToken:'existing-token-123456789'})).status,401);
 assert.equal((await post({idToken:'new-user-token-123456789',roles:['admin'],name:'Injected',password:'NewPassword123!'})).status,400);
 const linked=await post({idToken:'existing-token-123456789',password:'ExistingPassword123!'});assert.equal(linked.status,200);assert.deepEqual(linked.body.user.roles,['buyer','admin']);
 const created=await post({idToken:'new-user-token-123456789',name:'New buyer',password:'NewPassword123!'},linked.body.csrfToken);assert.equal(created.status,200);assert.deepEqual(created.body.user.roles,['buyer']);
 assert.equal((await post({idToken:'new-user-token-123456789'},created.body.csrfToken)).status,200);
 assert.equal(await db.read(s=>s.users.length),2);
 }finally{config.otpProvider=previous;}
});
test('Cloudflare credentials stay server-side and upstream failures fail closed',async()=>{
 const saved={provider:config.turnProvider,id:config.cloudflareTurnKeyId,token:config.cloudflareTurnApiToken,fetch:globalThis.fetch};
 config.turnProvider='cloudflare';config.cloudflareTurnKeyId='test-key';config.cloudflareTurnApiToken='privileged-test-token';
 try{globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://rtc.live.cloudflare.com/v1/turn/keys/test-key/credentials/generate-ice-servers');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer privileged-test-token');assert.ok(JSON.parse(String(init?.body)).ttl>7200);return new Response(JSON.stringify({iceServers:[{urls:['turn:test.example'],username:'temporary',credential:'temporary-only'}]}),{status:201});};const result=await iceCredentials('buyer');assert.equal(result.available,true);assert.ok(!JSON.stringify(result).includes('privileged-test-token'));globalThis.fetch=async()=>new Response('',{status:403});await assert.rejects(()=>iceCredentials('buyer'),(e:any)=>e.code==='call_unavailable');}
 finally{config.turnProvider=saved.provider;config.cloudflareTurnKeyId=saved.id;config.cloudflareTurnApiToken=saved.token;globalThis.fetch=saved.fetch;}
});
