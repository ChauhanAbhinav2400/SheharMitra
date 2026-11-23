import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {LocalStore} from '../src/data/store.js';
import {seedState} from '../src/data/seed.js';
import {createApp} from '../src/app.js';
import {resolveAddress,canonicalTown} from '../src/location.js';
import {CommerceService} from '../src/domain/service.js';
import {matchTrip} from '../src/domain/matching.js';
import {activeChats,enqueueNotification,notificationText} from '../src/notification-events.js';
import {startNotifications} from '../src/notifications.js';
const seed=seedState();
const address={pincode:'246763',state:'Uttar Pradesh',city:'Najibabad',locality:'Main Market',line1:'10 Test Lane',line2:''};

test('two shop owners share one chat in either role and old thread links retain combined history',async()=>{
 const {db,login}=await setup();
 await db.transaction(s=>{s.conversations=[];s.messages=[];s.shops.find(x=>x.id==='shop-household')!.sellerId='buyer';});
 const buyer=await login('9000000001'),seller=await login('9000000002'),outsider=await login('9000000003');
 const first=await buyer.post('/conversations',{shopId:'shop-tractor-parts'});assert.equal(first.status,201);const id=first.body.conversation.id;
 const reversed=await seller.post('/conversations',{shopId:'shop-household'});assert.equal(reversed.body.conversation.id,id);
 const order=await buyer.post('/conversations',{orderId:'order-bearing',recipientId:'seller'});assert.equal(order.body.conversation.id,id);
 assert.equal(await db.read(s=>s.conversations.length),1);
 await db.transaction(s=>{
  s.conversations.push({id:'legacy-thread',members:['seller','buyer'],shopId:'shop-household',createdAt:new Date(Date.now()+1000).toISOString(),readAt:{}});
  s.messages.push({id:'old-message',conversationId:'legacy-thread',senderId:'seller',text:'Old history',clientId:'old-client-id',createdAt:new Date().toISOString()});
 });
 const sent=await buyer.post('/conversations/legacy-thread/messages',{text:'New message',clientId:'unique-message-id'});assert.equal(sent.status,201);assert.equal(sent.body.message.conversationId,id);
 for(const thread of [id,'legacy-thread']){const messages=await buyer.agent.get(`/api/conversations/${thread}/messages`);assert.equal(messages.status,200);assert.equal(messages.body.messages.length,2);assert.equal(messages.body.conversation.id,id);}
 assert.equal((await seller.agent.get('/api/conversations')).body.conversations.length,1);
 await seller.post('/conversations/legacy-thread/read');assert.equal((await seller.agent.get('/api/conversations')).body.conversations[0].unread,0);
 assert.equal((await outsider.agent.get('/api/conversations/legacy-thread/messages')).status,404);
 const retried=await buyer.post(`/conversations/${id}/messages`,{text:'New message',clientId:'unique-message-id'});assert.equal(retried.body.message.id,sent.body.message.id);
});
async function setup(){const db=new LocalStore(await seed),app=createApp(db);async function login(phone:string){const agent=request.agent(app),first=await agent.get('/api/auth/me'),r=await agent.post('/api/auth/login').set('Origin','http://localhost:3000').set('X-CSRF-Token',first.body.csrfToken).send({phone,password:'DemoPass123!'});assert.equal(r.status,200);return {agent,post:(path:string,body:object={},key='test-workflow-key')=>agent.post('/api'+path).set('Origin','http://localhost:3000').set('X-CSRF-Token',r.body.csrfToken).set('Idempotency-Key',key).send(body)};}return {db,app,login};}

test('marketplace defaults to all towns and discovers shops outside the original demo towns',async()=>{
 const {db,app}=await setup();await db.transaction(s=>{for(const shop of s.shops)shop.town='nagina';});
 const all=await request(app).get('/api/shops');assert.equal(all.status,200);assert.equal(all.body.total,8);assert.deepEqual(all.body.towns,['nagina']);assert.ok(all.body.shops.every((s:any)=>s.town==='nagina'));
 assert.equal((await request(app).get('/api/shops?town=najibabad')).body.total,0);
 assert.equal((await request(app).get('/api/shops?town=nagina')).body.total,8);
 const category=await request(app).get('/api/shops?category=tractor-parts');assert.equal(category.body.total,1);assert.equal(category.body.shops[0].town,'nagina');
 assert.equal((await request(app).get('/api/shops?town=')).body.total,8);
});

test('town choices cover all pages and exclude unapproved, suspended and restricted owners',async()=>{
 const {db,app}=await setup();await db.transaction(s=>{
  s.shops[0].town='nagina';s.shops[1].town='bijnor';
  s.shops[2].town='unapproved-town';s.shops[2].approved=false;
  s.shops[3].town='suspended-town';s.shops[3].suspended=true;
  const owner=s.users.find(u=>u.id===s.shops[0].sellerId)!;
  s.users.push({...owner,id:'blocked-seller',phone:'9000000088',banned:true});s.shops[4].sellerId='blocked-seller';s.shops[4].town='banned-town';
  s.users.push({...owner,id:'staff-seller',phone:'9000000089',roles:['admin','seller']});s.shops[5].sellerId='staff-seller';s.shops[5].town='staff-town';
 });
 const page=await request(app).get('/api/shops?town=nagina&limit=1');assert.equal(page.status,200);assert.equal(page.body.shops.length,1);assert.deepEqual(page.body.towns,['bijnor','nagina','najibabad']);
 const empty=await request(app).get('/api/shops?q=nonexistent-shop');assert.equal(empty.body.total,0);assert.deepEqual(empty.body.towns,page.body.towns);
 const all=await request(app).get('/api/shops');assert.equal(all.body.total,4);
});

test('addresses preserve legacy coordinates, reject forged coordinates and save unresolved manual entries',async()=>{
 const {db,app,login}=await setup();const buyer=await login('9000000001');
 const legacy=await resolveAddress(db,'seller',address,undefined,{address:address.line1,town:'najibabad',locality:{en:'Main Market',hi:'बाज़ार'},coordinates:{lat:29.61,lng:78.34}});assert.equal(legacy.locationVerified,true);assert.equal(canonicalTown('नजीबाबाद'),'najibabad');
 const changed=await resolveAddress(db,'seller',{...address,line1:'20 Different Lane'},undefined,legacy);assert.equal(changed.coordinates,null);
 const created=await buyer.post('/orders',{shopId:'shop-tractor-parts',addressDetails:address});assert.equal(created.status,201);assert.equal(created.body.order.destination.locationVerified,false);assert.equal(created.body.order.destination.lat,undefined);
 assert.equal((await buyer.post('/orders',{shopId:'shop-tractor-parts',destination:{lat:1,lng:2,address:'forged',village:'Test'}})).status,400);
 assert.equal((await buyer.post('/orders',{shopId:'shop-tractor-parts',addressDetails:{...address,pincode:'123'}})).status,400);
 const shops=await request(app).get('/api/shops');assert.ok(shops.body.shops.length);for(const s of shops.body.shops){assert.equal(s.coordinates,undefined);assert.equal(s.addressDetails,undefined);assert.equal(s.address,undefined);}
});

test('location references are owner-scoped and invalidated when address changes',async()=>{
 const {db}=await setup();await db.transaction(s=>s.locations.push({id:'location-reference',userId:'buyer',address,coordinates:{lat:29,lng:78},expiresAt:new Date(Date.now()+60000).toISOString()}));
 assert.equal((await resolveAddress(db,'buyer',address,'location-reference')).locationVerified,true);
 assert.equal((await resolveAddress(db,'seller',address,'location-reference')).locationVerified,false);
 assert.equal((await resolveAddress(db,'buyer',{...address,city:'Bijnor'},'location-reference')).locationVerified,false);
});

test('trips require addresses and reject removed controls; unverifiable routes never match',async()=>{
 const {db,login}=await setup(),partner=await login('9000000003');const trip=await db.read(s=>s.trips[0]);const input={originAddress:address,destinationAddress:{...address,city:'Raipur'},departureAt:trip.departureAt,arrivalAt:trip.arrivalAt,transport:trip.transport,categories:['tractor-parts']};
 assert.equal((await partner.post('/trips',{...input,pickupFlexMinutes:5})).status,400);assert.equal((await partner.post('/trips',{...input,maxDetourKm:3})).status,400);assert.equal((await partner.post('/trips',{...input,route:[{lat:29,lng:78},{lat:30,lng:78}]})).status,400);
 const r=await partner.post('/trips',input);assert.equal(r.status,201);assert.equal(r.body.trip.locationVerified,false);assert.equal(r.body.trip.capacityGrams,undefined);assert.equal(r.body.trip.capacityParcels,undefined);assert.equal(r.body.trip.maxParcelSize,undefined);const quote=await db.read(s=>s.orders[0].quotes[0]);assert.equal(matchTrip(r.body.trip,quote,{lat:29.7,lng:78.4}),null);assert.equal(matchTrip(trip,{...quote,pickup:null},{lat:29.7,lng:78.4}),null);
});

test('staff identities cannot enter the marketplace, including mixed legacy roles',async()=>{
 const {db,login}=await setup();await db.transaction(s=>{s.users.find(u=>u.id==='buyer')!.roles=['buyer','admin'];});const mixed=await login('9000000001');
 for(const path of ['/shops','/orders','/trips','/conversations','/calls/ice'])assert.equal((await mixed.agent.get('/api'+path)).status,403,path);
 for(const path of ['/shops','/orders','/trips','/conversations'])assert.equal((await mixed.post(path,{})).status,403,path);
 assert.equal((await mixed.agent.get('/api/admin/overview')).status,200);assert.equal((await mixed.agent.get('/api/notifications')).status,200);
});

test('banning revokes local sessions and push, hides shops and trips, and preserves active history',async()=>{
 const {db,app,login}=await setup();const seller=await login('9000000002'),admin=await login('9000000004');
 await seller.post('/notifications/devices',{deviceId:'test-device-seller',token:'synthetic-token-never-sent',language:'en'});
 const count=await db.read(s=>s.orders.length);const banned=await admin.post('/admin/users/seller/ban',{banned:true,reason:'Synthetic security regression test'});assert.equal(banned.status,200);
 assert.equal((await seller.agent.get('/api/orders')).status,401);await db.read(s=>{assert.equal(s.sessions.some(x=>x.userId==='seller'),false);assert.equal(s.pushDevices.some(x=>x.userId==='seller'),false);assert.equal(s.orders.length,count);assert.ok(s.notifications.some(n=>n.userId==='buyer'&&n.event==='account_restricted'));assert.ok(s.infraAudit.some(a=>a.action==='user_banned'&&a.reason));});
 assert.equal((await request(app).get('/api/shops')).body.shops.some((s:any)=>s.sellerId==='seller'),false);
 const slug=await db.read(s=>s.shops.find(x=>x.sellerId==='seller')!.slug);assert.equal((await request(app).get('/api/shops/'+slug)).status,404);
 assert.equal((await admin.post('/admin/users/seller/ban',{banned:false,reason:'End synthetic restriction test'})).status,200);assert.equal((await seller.agent.get('/api/orders')).status,401);
});

test('resolver queue, race to claim, private evidence and immutable pending decisions',async()=>{
 const {db,login}=await setup();await db.transaction(s=>{const o=s.orders[0];o.status='disputed';o.payment={...o.payment,state:'funded',goodsPaise:120000,deliveryPaise:8000};o.dispute={id:'case-1',openedBy:'buyer',reason:'Incorrect item',description:'Synthetic order review',components:['goods','delivery'],evidence:['case-photo'],responses:[],responseDeadline:new Date(Date.now()-1000).toISOString(),status:'awaiting_response',openedAt:new Date().toISOString()};s.users.find(u=>u.phone==='9000000007')!.roles=['dispute_resolver'];s.uploads.push({id:'case-photo',ownerId:'buyer',purpose:'evidence',orderId:o.id,key:'private/synthetic.webp',mime:'image/webp',bytes:1,createdAt:new Date().toISOString()});});
 const reviewer=await login('9000000005'),second=await login('9000000007');const base='/resolver/order-bearing';assert.equal((await reviewer.agent.get('/api/uploads/case-photo/access')).status,404);
 assert.equal((await reviewer.agent.get('/api'+base)).status,200);assert.equal((await reviewer.agent.get('/api/uploads/case-photo/access')).status,200);
 const claimed=await Promise.all([reviewer.post(base+'/take'),second.post(base+'/take')]);assert.deepEqual(claimed.map(r=>r.status).sort(),[200,409]);const winner=claimed[0].status===200?reviewer:second,loser=winner===reviewer?second:reviewer;
 const decision={sellerPaise:60000,partnerPaise:8000,rationale:'Synthetic evidence supports a partial goods refund.',outcome:'partial_split'};
 assert.equal((await loser.post(base+'/decide',decision)).status,403);const ledger=await db.read(s=>s.orders[0].payment.ledger.length);
 assert.equal((await winner.post(base+'/decide',decision)).status,200);assert.equal((await winner.post(base+'/decide',decision)).status,200);assert.equal((await winner.post(base+'/decide',{...decision,sellerPaise:50000},'different-decision')).status,409);
 assert.equal((await winner.post(base+'/close')).status,200);await db.read(s=>{assert.equal(s.settlementInstructions.length,1);assert.equal(s.settlementInstructions[0].status,'pending_payment_execution');assert.equal(s.orders[0].payment.ledger.length,ledger);assert.equal(s.orders[0].payment.state,'funded');assert.equal(s.orders[0].dispute?.status,'closed');});
});

test('notification outbox uses recipient language, suppresses open chat, deduplicates and removes invalid devices',async()=>{
 const {db,login}=await setup(),buyer=await login('9000000001');await buyer.post('/notifications/devices',{deviceId:'notification-device',token:'synthetic-token-never-sent',language:'hi'});
 activeChats.set('test-socket',{userId:'buyer',conversationId:'open-chat',expires:Date.now()+60000});
 await db.transaction(s=>{enqueueNotification(s,{id:'open-message',userId:'buyer',category:'messages',event:'message',resourceId:'open-chat'});enqueueNotification(s,{id:'delivered',userId:'buyer',category:'orders',event:'delivered',resourceId:'order-bearing',role:'buyer'});enqueueNotification(s,{id:'delivered',userId:'buyer',category:'orders',event:'delivered',resourceId:'order-bearing',role:'buyer'});});
 const sent:any[]=[];const io={to:()=>({emit:()=>{}})} as any;const worker=startNotifications(db,io,async message=>{sent.push(message);return 'synthetic-id';});try{await worker.flush();await worker.flush();assert.equal(sent.length,1);assert.match(sent[0].data.body,/सामान/);assert.doesNotMatch(sent[0].data.body,/\d{6}/);assert.ok((await db.read(s=>s.notifications.find(n=>n.id==='open-message')))?.readAt);assert.equal((await db.read(s=>s.notifications.filter(n=>n.id==='delivered'))).length,1);}finally{worker();activeChats.delete('test-socket');}
 await db.transaction(s=>enqueueNotification(s,{id:'invalid-token-test',userId:'buyer',category:'orders',event:'ready',resourceId:'order-bearing'}));const invalid=startNotifications(db,io,async()=>{throw Object.assign(Error('synthetic invalid token'),{code:'messaging/registration-token-not-registered'});});try{await invalid.flush();assert.equal(await db.read(s=>s.pushDevices.filter(d=>d.userId==='buyer').length),0);}finally{invalid();}
});

test('delivered notification text instructs only the buyer to check the items',()=>{const common={id:'n',userId:'u',category:'orders' as const,event:'delivered',resourceId:'o',createdAt:new Date().toISOString(),pushState:'pending' as const};assert.match(notificationText({...common,role:'buyer'},'en'),/check/);assert.doesNotMatch(notificationText({...common,role:'seller'},'en'),/check/);assert.match(notificationText({...common,role:'partner'},'en'),/Thank you/);});
