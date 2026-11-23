import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { LocalStore, emptyState } from '../src/data/store.js';
import { createApp } from '../src/app.js';
import { normalizeImage, storage } from '../src/uploads.js';
import mongoose from 'mongoose';
import { MongoStore } from '../src/data/store.js';
import { createServer } from 'node:http';
import { io as connect, type Socket } from 'socket.io-client';
import { attachRealtime } from '../src/realtime.js';
import { config } from '../src/config.js';
import sharp from 'sharp';

test('homepage origins configured with a trailing slash allow browser CORS and retain the origin boundary', async()=>{
  const {app}=await setup();
  const origin='http://localhost:3000';
  const csrf=await request(app).get('/api/auth/csrf').set('Origin',origin);
  assert.equal(csrf.status,200);
  assert.equal(csrf.headers['access-control-allow-origin'],origin);
  assert.equal(csrf.headers['access-control-allow-credentials'],'true');
  assert.ok(csrf.body.csrfToken);
  const preflight=await request(app).options('/api/auth/firebase').set('Origin',origin)
    .set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','content-type,x-csrf-token,idempotency-key');
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers['access-control-allow-origin'],origin);
  const untrusted=await request(app).get('/api/auth/csrf').set('Origin','http://localhost:3000.attacker.example');
  assert.equal(untrusted.headers['access-control-allow-origin'],undefined);
});

test('dispute evidence is restricted to order participants and its assigned reviewer', async()=>{
  const {app,db}=await setup();
  await db.transaction(s=>{s.orders.push({id:'evidence-order',buyerId:'buyer',sellerId:'seller',assignment:undefined} as any);});
  const buyer=await login(app,'9000000001'),outsider=await login(app,'9000000003');
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#eeeeee'}}).png().toBuffer();
  const send=(session:typeof buyer)=>session.agent.post('/api/uploads').set('Origin','http://localhost:3000').set('X-CSRF-Token',session.token).field('purpose','evidence').field('orderId','evidence-order').attach('file',bytes,{filename:'synthetic.png',contentType:'image/png'});
  assert.equal((await send(outsider)).status,403);
  const uploaded=await send(buyer);assert.equal(uploaded.status,201);
  const id=uploaded.body.upload.id;
  assert.equal((await buyer.agent.get(`/api/uploads/${id}/access`)).status,200);
  assert.equal((await outsider.agent.get(`/api/uploads/${id}/access`)).status,404);
  assert.equal((await outsider.agent.get(`/api/uploads/public/${id}`)).status,404);
  await db.transaction(s=>{s.orders[0].dispute={resolverId:'outsider'} as any;});
  assert.equal((await outsider.agent.get(`/api/uploads/${id}/access`)).status,200);
});

async function setup() {
  const state = emptyState();
  const passwordHash = await bcrypt.hash('TestPassword123!', 4);
  state.users = [
    { id: 'buyer', name: 'Buyer', phone: '9000000001', passwordHash, roles: ['buyer'], partnerStatus: 'none' },
    { id: 'seller', name: 'Seller', phone: '9000000002', passwordHash, roles: ['buyer','seller'], partnerStatus: 'none' },
    { id: 'outsider', name: 'Outsider', phone: '9000000003', passwordHash, roles: ['buyer'], partnerStatus: 'none' },
  ];
  state.conversations.push({ id: 'private-chat', members: ['buyer','seller'], createdAt: new Date().toISOString(), readAt: {} });
  state.messages.push({ id: 'message-1', conversationId: 'private-chat', senderId: 'buyer', text: 'Private message', createdAt: new Date().toISOString(), clientId: 'message-1-client' });
  state.uploads.push({ id: 'private-id', ownerId: 'seller', purpose: 'identity', key: 'private/document.webp', mime: 'image/webp', bytes: 12, createdAt: new Date().toISOString() });
  const db = new LocalStore(state);
  return { db, app: createApp(db) };
}
async function login(app: ReturnType<typeof createApp>, phone: string) {
  const agent = request.agent(app);
  let response = await agent.get('/api/auth/me');
  assert.equal(response.status, 200);
  response = await agent.post('/api/auth/login').set('Origin','http://localhost:3000').set('X-CSRF-Token',response.body.csrfToken).send({ phone, password: 'TestPassword123!' });
  assert.equal(response.status, 200);
  return { agent, token: response.body.csrfToken, cookie: response.headers['set-cookie'][0].split(';')[0] };
}

test('Mongo entity serialization preserves empty conversation read markers', () => {
  new MongoStore();
  const Conversation = mongoose.models.SheharMitra_conversations;
  const document = new Conversation({id:'serialization-only',members:['buyer','seller'],readAt:{}});
  assert.deepEqual(document.toObject().readAt, {});
});

test('legacy conversations missing readAt can list, send, retry and mark read', async () => {
  const {app,db}=await setup();
  await db.transaction(s=>{delete (s.conversations[0] as any).readAt;});
  const buyer=await login(app,'9000000001'),seller=await login(app,'9000000002');
  const list=await seller.agent.get('/api/conversations');
  assert.equal(list.status,200);assert.equal(list.body.conversations[0].unread,1);
  const send=()=>buyer.agent.post('/api/conversations/private-chat/messages').set('Origin','http://localhost:3000').set('X-CSRF-Token',buyer.token).send({text:'Synthetic regression message',clientId:'legacy-retry-client'});
  assert.equal((await send()).status,201);assert.equal((await send()).status,201);
  assert.equal(await db.read(s=>s.messages.filter(m=>m.clientId==='legacy-retry-client').length),1);
  await db.transaction(s=>{delete (s.conversations[0] as any).readAt;});
  const read=await seller.agent.post('/api/conversations/private-chat/read').set('Origin','http://localhost:3000').set('X-CSRF-Token',seller.token).send({});
  assert.equal(read.status,200);
  assert.equal((await seller.agent.get('/api/conversations')).body.conversations[0].unread,0);
});

test('owners see approved listings but cannot start a conversation with their own shop', async () => {
  const {app,db}=await setup();
  await db.transaction(s=>{s.shops.push({id:'self-shop',sellerId:'seller',approved:true,slug:'self-shop',town:'najibabad',name:{en:'Shop',hi:'Shop'},searchTokens:[],image:'/shops/food.svg',gallery:[]} as any);});
  const seller=await login(app,'9000000002'),buyer=await login(app,'9000000001');
  const listed=await seller.agent.get('/api/shops');assert.equal(listed.status,200);assert.equal(listed.body.shops[0].id,'self-shop');
  const self=await seller.agent.post('/api/conversations').set('Origin','http://localhost:3000').set('X-CSRF-Token',seller.token).send({shopId:'self-shop'});
  assert.equal(self.status,400);assert.equal(self.body.error.code,'invalid_recipient');
  const peer=await buyer.agent.post('/api/conversations').set('Origin','http://localhost:3000').set('X-CSRF-Token',buyer.token).send({shopId:'self-shop'});
  assert.equal(peer.status,201);assert.deepEqual(new Set(peer.body.conversation.members),new Set(['buyer','seller']));
});

test('public shop images return stable WebP bytes even when private signing is available', async () => {
  const {app,db}=await setup();const seller=await login(app,'9000000002');
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#eeeeee'}}).png().toBuffer();
  const uploaded=await seller.agent.post('/api/uploads').set('Origin','http://localhost:3000').set('X-CSRF-Token',seller.token).field('purpose','shop').attach('file',bytes,{filename:'synthetic.png',contentType:'image/png'});
  assert.equal(uploaded.status,201);
  const id=uploaded.body.upload.id,record=await db.read(s=>s.uploads.find(u=>u.id===id)!);
  const original=storage.privateUrl;storage.privateUrl=async()=>{throw Error('Public shop images must not redirect to expiring URLs');};
  try {
    const image=await request(app).get(`/api/uploads/public/${id}`);
    assert.equal(image.status,200);assert.match(image.headers['content-type'],/image\/webp/);assert.equal(image.headers.location,undefined);
    assert.equal((await sharp(image.body).metadata()).format,'webp');
    assert.equal((await request(app).get('/api/uploads/public/private-id')).status,404);
  } finally {storage.privateUrl=original;await storage.remove(record.key);}
});
test('sessions require CSRF and an exact origin; login rotates the session', async () => {
  const { app } = await setup();
  const agent = request.agent(app);
  const initial = await agent.get('/api/auth/me');
  assert.equal(initial.body.user, null);
  assert.match(initial.headers['set-cookie'][0], /HttpOnly/);
  const badOrigin = await agent.post('/api/auth/login').set('Origin','https://evil.example').set('X-CSRF-Token',initial.body.csrfToken).send({ phone: '9000000001', password: 'TestPassword123!' });
  assert.equal(badOrigin.status, 403);
  const noCsrf = await agent.post('/api/auth/login').set('Origin','http://localhost:3000').send({ phone: '9000000001', password: 'TestPassword123!' });
  assert.equal(noCsrf.status, 403);
  const good = await agent.post('/api/auth/login').set('Origin','http://localhost:3000').set('X-CSRF-Token', initial.body.csrfToken).send({ phone: '9000000001', password: 'TestPassword123!' });
  assert.equal(good.status,200); assert.notEqual(good.body.csrfToken, initial.body.csrfToken); assert.equal(good.body.user.passwordHash, undefined);
  const cached = await agent.get('/api/auth/me'); assert.match(cached.headers['cache-control'], /no-store/);
});
test('unrelated users cannot read chats, identity documents, or review submissions', async () => {
  const { app } = await setup(); const { agent, token } = await login(app, '9000000003');
  assert.equal((await agent.get('/api/conversations/private-chat/messages')).status,404);
  assert.equal((await agent.get('/api/uploads/private-id/access')).status,404);
  assert.equal((await agent.get('/api/admin/reviews')).status,403);
  assert.equal((await agent.post('/api/conversations/private-chat/messages').set('Origin','http://localhost:3000').set('X-CSRF-Token',token).send({ text:'intrusion',clientId:'intrusion-0001' })).status,404);
});
test('private chat retries do not duplicate messages and unread state is persisted', async () => {
  const { app, db } = await setup(); const { agent, token } = await login(app,'9000000001');
  const send = () => agent.post('/api/conversations/private-chat/messages').set('Origin','http://localhost:3000').set('X-CSRF-Token',token).send({ text:'Hello shop',clientId:'retry-message-0001' });
  const a = await send(), b = await send(); assert.equal(a.status,201); assert.equal(b.body.message.id,a.body.message.id);
  assert.equal(await db.read(s => s.messages.filter(m => m.clientId === 'retry-message-0001').length),1);
  const seller = await login(app,'9000000002');
  assert.equal((await seller.agent.get('/api/conversations')).body.conversations[0].unread,2);
  await seller.agent.post('/api/conversations/private-chat/read').set('Origin','http://localhost:3000').set('X-CSRF-Token',seller.token).send({});
  assert.equal((await seller.agent.get('/api/conversations')).body.conversations[0].unread,0);
});
test('registration rejects client authority and demo OTP is one-time with bounded attempts', async () => {
  const { app, db } = await setup(); const agent = request.agent(app); let initial = await agent.get('/api/auth/me');
  const mutate = (path: string, data: object) => agent.post(path).set('Origin','http://localhost:3000').set('X-CSRF-Token',initial.body.csrfToken).send(data);
  const otp = await mutate('/api/auth/otp/request',{ phone:'9000000099' }); assert.equal(otp.status,200); assert.match(otp.body.demoCode,/^\d{6}$/);
  const input = { name:'New Buyer',phone:'9000000099',password:'NewPassword123!',otp:otp.body.demoCode };
  assert.equal((await mutate('/api/auth/register',{...input,roles:['admin']})).status,400);
  const registered = await mutate('/api/auth/register',input); assert.equal(registered.status,201); assert.deepEqual(registered.body.user.roles,['buyer']);
  initial = { body:{csrfToken:registered.body.csrfToken} } as typeof initial;
  assert.equal((await mutate('/api/auth/register',input)).status,400);
  assert.equal(await db.read(s => s.users.filter(u => u.phone==='9000000099').length),1);
});
test('calling is explicitly unavailable until TURN is configured; malformed images rejected', async () => {
  const { app } = await setup(); const { agent } = await login(app,'9000000001');
  const ice = await agent.get('/api/calls/ice'); assert.equal(ice.status,200); assert.equal(ice.body.available,false); assert.deepEqual(ice.body.iceServers,[]);
  await assert.rejects(() => normalizeImage(Buffer.from('<svg><script>alert(1)</script></svg>')));
});
test('real Socket.IO signaling enforces conversation consent and atomic per-user busy state', async () => {
  const { app, db } = await setup();
  await db.transaction(s => { s.conversations.push({ id:'second-chat', members:['outsider','seller'], createdAt:new Date().toISOString(), readAt:{} }); });
  const server = createServer(app); const realtime = attachRealtime(server,db);
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address() as { port:number }; const sockets: Socket[] = [];
  const oldUrls = config.turnUrls, oldSecret = config.turnSecret;
  // Only signaling is under test; this fixture never pretends a media connection succeeded.
  config.turnUrls = ['turn:localhost:3478']; config.turnSecret = 'test-only-turn-secret-123456789';
  const call = (socket: Socket, event: string, payload: object) => new Promise<any>((resolve,reject) => socket.timeout(2000).emit(event,payload,(err: Error|null,value:any) => err ? reject(err) : resolve(value)));
  const event = (socket: Socket, name: string) => new Promise<any>((resolve,reject) => { const timer=setTimeout(() => reject(new Error(`missing ${name}`)),2000); socket.once(name,value => {clearTimeout(timer);resolve(value);}); });
  try {
    for (const phone of ['9000000001','9000000002','9000000003']) {
      const session = await login(app,phone);
      const socket = connect(`http://127.0.0.1:${address.port}`,{ transports:['websocket'], forceNew:true, reconnection:false, extraHeaders:{Origin:'http://localhost:3000',Cookie:session.cookie},auth:{csrfToken:session.token} });
      sockets.push(socket);
      await new Promise<void>((resolve,reject) => { socket.once('connect',resolve);socket.once('connect_error',reject); });
    }
    const [buyer,seller,outsider] = sockets;
    const incoming = event(seller,'call:incoming');
    const invite = await call(buyer,'call:invite',{conversationId:'private-chat',kind:'audio'});
    assert.ok(invite.callId); assert.equal((await incoming).callId,invite.callId);
    assert.equal((await call(outsider,'call:invite',{conversationId:'second-chat',kind:'audio'})).error,'busy');
    assert.equal((await call(outsider,'call:accept',{callId:invite.callId})).error,'not_allowed');
    assert.equal((await call(buyer,'call:signal',{callId:invite.callId,signal:{type:'offer',sdp:'before-consent'}})).error,'not_allowed');
    const accepted = event(buyer,'call:accepted');
    assert.equal((await call(seller,'call:accept',{callId:invite.callId})).ok,true); await accepted;
    assert.equal((await call(outsider,'call:signal',{callId:invite.callId,signal:{type:'offer',sdp:'unauthorized'}})).error,'not_allowed');
    const signal = event(seller,'call:signal');
    assert.equal((await call(buyer,'call:signal',{callId:invite.callId,signal:{type:'offer',sdp:'synthetic-signaling-test'}})).ok,true);
    assert.equal((await signal).signal.sdp,'synthetic-signaling-test');
    assert.equal((await call(seller,'call:end',{callId:invite.callId})).ok,true);
    const next = await call(outsider,'call:invite',{conversationId:'second-chat',kind:'video'}); assert.ok(next.callId);
    assert.equal((await call(seller,'call:reject',{callId:next.callId})).ok,true);
    // Cancel while persistence is still pending, then immediately call in reverse.
    const originalTransaction=db.transaction.bind(db);
    let release!:()=>void,entered!:()=>void;
    const enteredPromise=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
    let delay=true;
    db.transaction=async fn=>{if(delay){delay=false;entered();await gate;}return originalTransaction(fn);};
    const pendingId='4f546458-cf3f-4a5c-85de-26a8651c88d1';
    const pending=call(buyer,'call:invite',{conversationId:'private-chat',kind:'audio',callId:pendingId});
    await enteredPromise;
    const cancelled=call(buyer,'call:end',{callId:pendingId});release();
    assert.equal((await pending).callId,pendingId);assert.equal((await cancelled).ok,true);
    assert.equal(await db.read(s=>s.calls.find(c=>c.id===pendingId)?.status),'ended');
    const callback=await call(seller,'call:invite',{conversationId:'private-chat',kind:'video'});assert.ok(callback.callId);
    assert.equal((await call(buyer,'call:accept',{callId:callback.callId})).ok,true);
    const returned=event(buyer,'call:signal');await call(seller,'call:signal',{callId:callback.callId,signal:{type:'offer',sdp:'reverse-call'}});assert.equal((await returned).signal.sdp,'reverse-call');
    await call(buyer,'call:end',{callId:callback.callId});db.transaction=originalTransaction;
  } finally {
    sockets.forEach(s => s.disconnect()); config.turnUrls=oldUrls; config.turnSecret=oldSecret;
    await new Promise<void>(resolve => realtime.close(() => resolve()));
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('all callee devices ring; first answer wins, secondary disconnect is harmless, history is server-timed once',async()=>{
 const {app,db}=await setup(),server=createServer(app),realtime=attachRealtime(server,db),sockets:Socket[]=[];
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
 const oldUrls=config.turnUrls,oldSecret=config.turnSecret;config.turnUrls=['turn:localhost:3478'];config.turnSecret='synthetic-test-turn-secret';
 const send=(s:Socket,event:string,payload:object)=>new Promise<any>((resolve,reject)=>s.timeout(2000).emit(event,payload,(e:Error|null,r:any)=>e?reject(e):resolve(r)));
 const event=(s:Socket,name:string)=>new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing '+name)),2000);s.once(name,d=>{clearTimeout(timer);resolve(d);});});
 async function device(session:Awaited<ReturnType<typeof login>>){const socket=connect(`http://127.0.0.1:${port}`,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:{Origin:'http://localhost:3000',Cookie:session.cookie},auth:{csrfToken:session.token}});sockets.push(socket);await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});return socket;}
 try{
  const buyer=await device(await login(app,'9000000001')),sellerSession=await login(app,'9000000002'),a=await device(sellerSession),b=await device(sellerSession);
  const rings=[event(a,'call:incoming'),event(b,'call:incoming')];const call=await send(buyer,'call:invite',{conversationId:'private-chat',kind:'video'});assert.ok(call.callId);assert.ok((await Promise.all(rings)).every(r=>r.callId===call.callId));
  const answers=await Promise.all([send(a,'call:accept',{callId:call.callId}),send(b,'call:accept',{callId:call.callId})]);assert.equal(answers.filter(r=>r.ok).length,1);assert.equal(answers.filter(r=>r.error==='answered_elsewhere').length,1);
  const winner=answers[0].ok?a:b,loser=winner===a?b:a;
  assert.equal((await send(loser,'call:signal',{callId:call.callId,signal:{type:'answer',sdp:'wrong-device'}})).error,'not_allowed');
  loser.disconnect();await send(buyer,'presence:chat',{conversationId:null,visible:false});assert.equal(await db.read(s=>s.calls.find(c=>c.id===call.callId)?.status),'active');
  assert.equal((await send(buyer,'call:connected',{callId:call.callId,durationSeconds:99999})).error,'not_allowed');
  await send(buyer,'call:connected',{callId:call.callId});assert.equal(await db.read(s=>s.calls.find(c=>c.id===call.callId)?.connectedAt),undefined);
  await send(winner,'call:connected',{callId:call.callId});const connectedAt=await db.read(s=>s.calls.find(c=>c.id===call.callId)!.connectedAt);assert.ok(connectedAt);
  await send(winner,'call:end',{callId:call.callId,durationSeconds:99999});await send(buyer,'call:end',{callId:call.callId});
  await db.read(s=>{const history=s.messages.filter(m=>m.clientId==='call:'+call.callId);assert.equal(history.length,1);assert.equal(history[0].call?.outcome,'completed');assert.ok(history[0].call!.durationSeconds!<5);assert.equal(history[0].call?.connectedAt,connectedAt);});
  const other=await device(sellerSession);const newRings=[event(winner,'call:incoming'),event(other,'call:incoming')];const second=await send(buyer,'call:invite',{conversationId:'private-chat',kind:'audio'});await Promise.all(newRings);const ended=event(winner,'call:ended');await send(other,'call:reject',{callId:second.callId});assert.equal((await ended).outcome,'declined');assert.equal((await send(winner,'call:accept',{callId:second.callId})).error,'answered_elsewhere');
 }finally{sockets.forEach(s=>s.disconnect());config.turnUrls=oldUrls;config.turnSecret=oldSecret;await new Promise<void>(resolve=>realtime.close(()=>resolve()));if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
