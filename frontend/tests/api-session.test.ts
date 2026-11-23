import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,createApiClient} from '../src/lib/api';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const post={method:'POST',body:JSON.stringify({idToken:'synthetic-firebase-token'})};
const expired=(error:unknown)=>error instanceof ApiError&&error.status===403&&error.code==='session_expired';

test('signing out clears the cached token and signing back in fetches a fresh session',async()=>{
 const calls:string[]=[];
 const api=createApiClient('https://test.invalid',async(input,options)=>{
  const path=new URL(String(input)).pathname;calls.push(path);
  if(path==='/auth/me')return json({csrfToken:'old-token'});
  if(path==='/auth/logout'){assert.equal(new Headers(options?.headers).get('X-CSRF-Token'),'old-token');return json({ok:true});}
  if(path==='/auth/csrf'){assert.equal(options?.cache,'no-store');assert.equal(options?.credentials,'include');return json({csrfToken:'new-anonymous-token'});}
  assert.equal(path,'/auth/firebase');assert.equal(new Headers(options?.headers).get('X-CSRF-Token'),'new-anonymous-token');return json({user:{id:'user'},csrfToken:'new-signed-in-token'});
 });
 await api('/auth/me');await api('/auth/logout',{method:'POST'});assert.equal((await api('/auth/firebase',post)).user.id,'user');
 assert.deepEqual(calls,['/auth/me','/auth/logout','/auth/csrf','/auth/firebase']);
});

test('a session changed by another tab is recovered once without changing the Firebase body or retry key',async()=>{
 let refreshes=0;const attempts:{token:string|null;key:string|null;body:BodyInit|null|undefined}[]=[];
 const api=createApiClient('https://test.invalid',async(input,options)=>{
  if(String(input).endsWith('/auth/csrf'))return json({csrfToken:`csrf-${++refreshes}`});
  const headers=new Headers(options?.headers);attempts.push({token:headers.get('X-CSRF-Token'),key:headers.get('Idempotency-Key'),body:options?.body});
  return attempts.length===1?json({error:{code:'session_expired'}},403):json({user:{id:'user'},csrfToken:'signed-in'});
 });
 await api('/auth/firebase',post);
 assert.equal(refreshes,2);assert.equal(attempts.length,2);assert.deepEqual(attempts.map(a=>a.token),['csrf-1','csrf-2']);assert.ok(attempts[0].key);assert.equal(attempts[0].key,attempts[1].key);assert.equal(attempts[0].body,attempts[1].body);
});

test('blocked cookies or repeated mismatches produce an actionable error after one retry',async()=>{
 let exchanges=0,refreshes=0;
 const api=createApiClient('https://test.invalid',async input=>{if(String(input).endsWith('/auth/csrf')){refreshes++;return json({csrfToken:'anonymous'});}exchanges++;return json({error:{code:'session_expired'}},403);});
 await assert.rejects(api('/auth/firebase',post),expired);assert.equal(exchanges,2);assert.equal(refreshes,2);
});

test('authorization failures and uncertain network failures are never retried',async()=>{
 for(const [status,code] of [[403,'account_banned'],[403,'origin_not_allowed'],[401,'firebase_invalid_token'],[401,'invalid_credentials']] as const){let exchanges=0;const api=createApiClient('https://test.invalid',async input=>{if(String(input).endsWith('/auth/csrf'))return json({csrfToken:'anonymous'});exchanges++;return json({error:{code}},status);});await assert.rejects(api('/auth/firebase',post),(e:unknown)=>e instanceof ApiError&&e.code===code);assert.equal(exchanges,1);}
 let calls=0;const api=createApiClient('https://test.invalid',async input=>{if(String(input).endsWith('/auth/csrf'))return json({csrfToken:'anonymous'});calls++;throw Error('connection lost');});await assert.rejects(api('/auth/firebase',post),/connection lost/);assert.equal(calls,1);
});

test('business mutations rejected for expired sessions are never silently replayed',async()=>{
 let writes=0,refreshes=0;const api=createApiClient('https://test.invalid',async input=>{if(String(input).endsWith('/auth/csrf')){refreshes++;return json({csrfToken:'token'});}writes++;return json({error:{code:'session_expired'}},403);});
 await assert.rejects(api('/orders/order-id/fund',{method:'POST',body:'{}'}),expired);assert.equal(writes,1);assert.equal(refreshes,1);
});

test('concurrent startup mutations share one CSRF bootstrap',async()=>{
 let refreshes=0,writes=0;const api=createApiClient('https://test.invalid',async(input,options)=>{if(String(input).endsWith('/auth/csrf')){refreshes++;return json({csrfToken:'shared'});}assert.equal(new Headers(options?.headers).get('X-CSRF-Token'),'shared');writes++;return json({ok:true});});
 await Promise.all([api('/notifications/settings',{method:'POST',body:'{}'}),api('/notifications/devices',{method:'POST',body:'{}'})]);assert.equal(refreshes,1);assert.equal(writes,2);
});

test('a late /me response cannot restore the token invalidated by sign-out',async()=>{
 let finishRead!:(value:Response)=>void,reads=0,refreshes=0;
 const api=createApiClient('https://test.invalid',async(input,options)=>{
  const path=new URL(String(input)).pathname;
  if(path==='/auth/me'){if(++reads===1)return json({csrfToken:'old'});return new Promise<Response>(resolve=>{finishRead=resolve;});}
  if(path==='/auth/logout')return json({ok:true});
  if(path==='/auth/csrf'){refreshes++;return json({csrfToken:'fresh'});}
  assert.equal(new Headers(options?.headers).get('X-CSRF-Token'),'fresh');return json({ok:true});
 });
 await api('/auth/me');const delayed=api('/auth/me');await api('/auth/logout',{method:'POST'});finishRead(json({csrfToken:'old'}));await delayed;await api('/notifications/settings',{method:'POST',body:'{}'});assert.equal(refreshes,1);
});

test('a failed CSRF bootstrap never submits login with an undefined token',async()=>{
 let calls=0;const api=createApiClient('https://test.invalid',async()=>{calls++;return json({error:{code:'account_banned'}},403);});await assert.rejects(api('/auth/login',post),(e:unknown)=>e instanceof ApiError&&e.code==='account_banned');assert.equal(calls,1);
});
