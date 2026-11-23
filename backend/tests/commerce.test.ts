import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore, MongoStore } from '../src/data/store.js';
import { seedState } from '../src/data/seed.js';
import { CommerceService, allowedOrder, publicOrder, expireReservations } from '../src/domain/service.js';
import { findMatches, matchTrip } from '../src/domain/matching.js';
import type { State, Order } from '../src/domain/types.js';

const initial = seedState();
const settings = { secret: 'test-secret-for-handover-encryption-long-enough', platformFeePaise: 0, maxValuePaise: 500000, maxWeightGrams: 20000 };
async function setup() { const db = new LocalStore(await initial); return { db, svc: new CommerceService(db, settings) }; }
async function reserve(svc: CommerceService, orderId = 'order-bearing', tripId = 'trip-raipur', buyerId = 'buyer') {
  await svc.acceptQuote(buyerId, orderId, 1, false);
  const proposed = await svc.offer(buyerId, orderId, tripId, 8000);
  const offer = proposed.order.offers.at(-1);
  await svc.respondOffer(offer.partnerId, orderId, offer.id, true);
  await svc.confirmOffer(buyerId, orderId, offer.id, `reserve-${orderId}`);
}
async function funded(svc: CommerceService, orderId = 'order-bearing') { await reserve(svc, orderId); await svc.fund('buyer', orderId, `fund-${orderId}`); }

test('trip edits expire pending agreements and are locked by buyer confirmation, including races',async()=>{
 const {db,svc}=await setup();
 const input=await db.read(s=>{const t=s.trips[0];return {origin:t.origin,destination:t.destination,route:t.route,departureAt:t.departureAt,arrivalAt:t.arrivalAt,transport:t.transport,categories:t.categories};});
 await assert.rejects(svc.updateTrip('buyer','trip-raipur',input),/partner_not_approved|forbidden/);
 await svc.acceptQuote('buyer','order-bearing',1,false);
 const proposed=await svc.offer('buyer','order-bearing','trip-raipur',8000),offer=proposed.order.offers.at(-1);
 await svc.respondOffer('partner','order-bearing',offer.id,true);
 const updated=await svc.updateTrip('partner','trip-raipur',{...input,transport:'car'});assert.equal(updated.trip.transport,'car');
 await assert.rejects(svc.confirmOffer('buyer','order-bearing',offer.id,'stale-edit-confirm'),/partner_must_accept/);
 assert.equal(await db.read(s=>s.orders[0].offers.find(o=>o.id===offer.id)?.status),'expired');
 const next=await svc.offer('buyer','order-bearing','trip-raipur',8500),nextOffer=next.order.offers.at(-1);await svc.respondOffer('partner','order-bearing',nextOffer.id,true);
 const results=await Promise.allSettled([svc.confirmOffer('buyer','order-bearing',nextOffer.id,'race-confirm'),svc.updateTrip('partner','trip-raipur',{...input,transport:'van'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 if(results[0].status==='fulfilled')assert.equal(await db.read(s=>s.trips[0].transport),'car');
 else{
  assert.equal(await db.read(s=>s.trips[0].transport),'van');assert.equal(await db.read(s=>s.orders[0].assignment),undefined);
  await assert.rejects(svc.confirmOffer('buyer','order-bearing',nextOffer.id,'retry-stale-race'),/partner_must_accept/);
  const revised=await svc.offer('buyer','order-bearing','trip-raipur',8500),revisedOffer=revised.order.offers.at(-1);await svc.respondOffer('partner','order-bearing',revisedOffer.id,true);await svc.confirmOffer('buyer','order-bearing',revisedOffer.id,'confirm-revised-trip');
 }
 await assert.rejects(svc.updateTrip('partner','trip-raipur',input),/trip_edit_locked/);
});
async function packaged(db: LocalStore, svc: CommerceService, orderId = 'order-bearing') {
  await db.transaction(s => { s.uploads.push({ id: `package-${orderId}`, ownerId: 'seller', purpose: 'packaging', key: 'synthetic-test-image', mime: 'image/png', bytes: 20, orderId, createdAt: new Date().toISOString() }); });
  await svc.ready('seller', orderId, `package-${orderId}`, 'Sealed demo parcel, declared items');
}

test('indexed token search finds bearing shop in Hindi, English and aliases', async () => {
  const { db } = await setup();
  for (const q of ['tractor bearing', 'bearing', 'बेयरिंग', 'tractor parts']) {
    const result = await db.searchShops({ town: 'najibabad', q });
    assert.equal(result.shops[0].id, 'shop-tractor-parts');
  }
  assert.equal((await db.searchShops({ town: 'other', q: 'bearing' })).total, 0);
  assert.equal((await db.searchShops({ q: '.*[' })).total, 8); // punctuation normalized, never executed as regex
});
test('matching enforces route and timing while space is agreed with the partner', async () => {
  const { db, svc } = await setup(); await svc.acceptQuote('buyer', 'order-bearing', 1, false);
  await db.read(s => {
    const order = s.orders[0], match = findMatches(s, order);
    assert.deepEqual(match.map(m => m.trip.id), ['trip-raipur', 'trip-raipur-replacement']);
    assert.equal(match[0].estimate, true); assert.ok(match[0].extraKm < 3);
    const trip = structuredClone(s.trips[0]); trip.capacityGrams = 1000; trip.capacityParcels = 1; trip.reservedParcels = 1; trip.maxParcelSize = 'small';
    assert.ok(matchTrip(trip, order.acceptedQuote!, order.destination));
    delete trip.capacityGrams; delete trip.capacityParcels; delete trip.maxParcelSize;
    assert.ok(matchTrip(trip, order.acceptedQuote!, order.destination));
    trip.available = false; assert.equal(matchTrip(trip, order.acceptedQuote!, order.destination), null); trip.available = true;
    trip.categories = ['food'];
    assert.equal(matchTrip(trip, order.acceptedQuote!, order.destination), null);
    trip.categories = ['tractor-parts'];
    assert.equal(matchTrip(trip, order.acceptedQuote!, { lat: 28.9, lng: 77.0 }), null);
  });
});
test('seller cannot buy their own shop or deliver their own transaction', async () => {
  const { svc, db } = await setup();
  await assert.rejects(svc.createOrder('seller', { shopId: 'shop-household', destination: { lat: 29.65, lng: 78.37, village: 'Demo', address: 'Demo point' } }), /self_dealing/);
  await svc.acceptQuote('buyer', 'order-bearing', 1, false);
  await db.transaction(s => { s.trips[0].partnerId = 'buyer'; s.users[0].partnerStatus = 'approved'; });
  await assert.rejects(svc.offer('buyer', 'order-bearing', 'trip-raipur', 5000), /trip_not_compatible/);
});
test('quote version changes invalidate acceptance and pending fee offers without mutating old quote', async () => {
  const { svc, db } = await setup(); await svc.acceptQuote('buyer', 'order-bearing', 1, false);
  await svc.offer('buyer', 'order-bearing', 'trip-raipur', 5000);
  const before = await db.read(s => structuredClone(s.orders[0].quotes[0]));
  await svc.quote('seller', 'order-bearing', { ...before, items: [{ description: 'Revised bearing', quantity: 1, unitPricePaise: 100000 }] });
  await db.read(s => { assert.deepEqual(s.orders[0].quotes[0], before); assert.equal(s.orders[0].acceptedQuote, undefined); assert.equal(s.orders[0].offers[0].status, 'expired'); });
  await assert.rejects(svc.acceptQuote('buyer', 'order-bearing', 1, false), /quote_changed/);
  await svc.acceptQuote('buyer', 'order-bearing', 2, false);
});
test('substitution consent is explicit and seller cannot accept a delivery fee', async () => {
  const { svc, db } = await setup();
  const q = await db.read(s => s.orders[0].quotes[0]);
  await svc.quote('seller', 'order-bearing', { ...q, substitutionConsentRequired: true, substitutions: 'Alternative size only with buyer consent' });
  await assert.rejects(svc.acceptQuote('buyer', 'order-bearing', 2, false), /substitution_consent_required/);
  await svc.acceptQuote('buyer', 'order-bearing', 2, true);
  await assert.rejects(svc.offer('seller', 'order-bearing', 'trip-raipur', 5000), /forbidden/);
});
test('partner-approved orders can share a trip without legacy capacity limits', async () => {
  const { svc, db } = await setup();
  await db.transaction(s => { const second = structuredClone(s.orders[0]); second.id = 'order-second'; second.buyerId = 'buyer2'; s.orders.push(second); s.trips[0].capacityGrams = 3000; });
  const proposals: { orderId: string; buyer: string; offerId: string }[] = [];
  for (const [orderId, buyer] of [['order-bearing', 'buyer'], ['order-second', 'buyer2']]) {
    await svc.acceptQuote(buyer, orderId, 1, false);
    const result = await svc.offer(buyer, orderId, 'trip-raipur', 8000), offer = result.order.offers.at(-1);
    await svc.respondOffer('partner', orderId, offer.id, true); proposals.push({ orderId, buyer, offerId: offer.id });
  }
  const results = await Promise.allSettled(proposals.map(p => svc.confirmOffer(p.buyer, p.orderId, p.offerId, `concurrent-${p.orderId}`)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  assert.equal(results.filter(r => r.status === 'rejected').length, 0);
  await db.read(s => { assert.equal(s.trips[0].reservedGrams, 4000); assert.equal(s.trips[0].reservedParcels, 2); });
});
test('repeated concurrent demo funding cannot charge twice and keys cannot change meaning', async () => {
  const { svc, db } = await setup(); await reserve(svc);
  await Promise.all([svc.fund('buyer', 'order-bearing', 'fund-idempotent-1'), svc.fund('buyer', 'order-bearing', 'fund-idempotent-1')]);
  await db.read(s => { assert.equal(s.orders[0].payment.ledger.length, 1); assert.equal(s.orders[0].payment.ledger[0].goodsPaise, 120000); assert.equal(s.orders[0].payment.ledger[0].deliveryPaise, 8000); });
  await assert.rejects(svc.complete('buyer', 'order-bearing', 'fund-idempotent-1'), /idempotency_key_reused/);
});
test('only approved partners can accept, and unrelated accounts cannot read orders', async () => {
  const { svc, db } = await setup(); await svc.acceptQuote('buyer', 'order-bearing', 1, false);
  const result = await svc.offer('buyer', 'order-bearing', 'trip-raipur', 8000), offer = result.order.offers[0];
  await db.transaction(s => { s.users.find(u => u.id === 'partner')!.partnerStatus = 'pending'; });
  await assert.rejects(svc.respondOffer('partner', 'order-bearing', offer.id, true), /partner_not_approved/);
  await assert.rejects(db.read(s => allowedOrder(s, 'order-bearing', 'buyer2')), /forbidden/);
  await db.read(s => { const view = publicOrder(s, s.orders[0], 'seller'); assert.deepEqual(view.destination, { village: 'Raipur (illustrative)' }); assert.equal(view.pickupCode, undefined); });
});
test('expired temporary reservations release capacity', async () => {
  const { svc, db } = await setup(); await reserve(svc);
  await db.transaction(s => { s.orders[0].assignment!.reservedUntil = new Date(Date.now() - 1).toISOString(); expireReservations(s); });
  await db.read(s => { assert.equal(s.trips[0].reservedGrams, 0); assert.equal(s.orders[0].status, 'awaiting_delivery_partner'); assert.equal(s.orders[0].assignment, undefined); });
  await assert.rejects(svc.fund('buyer', 'order-bearing', 'fund-expired'), /delivery_required/);
});
test('food preparation requires funding, commitment and fresh partner readiness', async () => {
  const { svc } = await setup();
  await assert.rejects(svc.prepare('seller', 'order-food'), /preparation_prerequisites/);
  await funded(svc, 'order-food');
  await assert.rejects(svc.prepare('seller', 'order-food'), /readiness_required/);
  await svc.readiness('partner', 'order-food');
  const result = await svc.prepare('seller', 'order-food'); assert.equal(result.order.status, 'preparing');
});
test('pickup and delivery have distinct actor-scoped codes and completion allocates both components once', async () => {
  const { svc, db } = await setup(); await funded(svc); await packaged(db, svc);
  const sellerCodes = await svc.codes('seller', 'order-bearing'), buyerCodes = await svc.codes('buyer', 'order-bearing');
  assert.match(sellerCodes.pickupCode, /^\d{6}$/); assert.match(buyerCodes.deliveryCode, /^\d{6}$/); assert.notEqual(sellerCodes.pickupCode, buyerCodes.deliveryCode);
  assert.equal(sellerCodes.deliveryCode, undefined); assert.equal(buyerCodes.pickupCode, undefined); assert.deepEqual(await svc.codes('partner', 'order-bearing'), {});
  await assert.rejects(svc.handover('buyer', 'order-bearing', sellerCodes.pickupCode, 'pickup'), /forbidden/);
  await svc.handover('partner', 'order-bearing', sellerCodes.pickupCode, 'pickup');
  await svc.handover('partner', 'order-bearing', buyerCodes.deliveryCode, 'deliver');
  await Promise.all([svc.complete('buyer', 'order-bearing', 'complete-once'), svc.complete('buyer', 'order-bearing', 'complete-once')]);
  await db.read(s => { const o = s.orders[0]; assert.equal(o.status, 'completed'); assert.equal(o.payment.ledger.length, 2); assert.equal(o.payment.ledger[1].sellerPaise, 120000); assert.equal(o.payment.ledger[1].partnerPaise, 8000); assert.equal(s.trips[0].reservedGrams, 0); });
});
test('incorrect handover attempts persist and lock after five guesses', async () => {
  const { svc, db } = await setup(); await funded(svc); await packaged(db, svc);
  for (let i = 0; i < 5; i++) await assert.rejects(svc.handover('partner', 'order-bearing', '000000', 'pickup'), /code_incorrect/);
  const code = (await svc.codes('seller', 'order-bearing')).pickupCode;
  await assert.rejects(svc.handover('partner', 'order-bearing', code, 'pickup'), /code_locked/);
  assert.equal(await db.read(s => s.orders[0].pickupCode!.attempts), 5);
});
test('courier cancellation refunds delivery only and rematching needs fresh buyer approval', async () => {
  const { svc, db } = await setup(); await funded(svc);
  await svc.cancelDelivery('partner', 'order-bearing', 'Vehicle problem before pickup');
  await db.read(s => { const o = s.orders[0]; assert.equal(o.status, 'awaiting_delivery_partner'); assert.equal(o.payment.state, 'funded'); assert.equal(o.payment.goodsPaise, 120000); assert.equal(o.payment.deliveryPaise, 0); assert.equal(o.payment.ledger[1].buyerRefundPaise, 8000); assert.equal(s.trips[0].reservedGrams, 0); });
  await assert.rejects(svc.fund('buyer', 'order-bearing', 'fund-no-new-terms'), /delivery_required/);
  const proposed = await svc.offer('buyer', 'order-bearing', 'trip-raipur-replacement', 9000), offer = proposed.order.offers.at(-1);
  await svc.respondOffer('partner2', 'order-bearing', offer.id, true, 10000);
  await svc.confirmOffer('buyer', 'order-bearing', offer.id, 'confirm-replacement');
  await svc.fund('buyer', 'order-bearing', 'fund-replacement');
  await db.read(s => { const ledger = s.orders[0].payment.ledger; assert.equal(ledger.at(-1)!.goodsPaise, 0); assert.equal(ledger.at(-1)!.deliveryPaise, 10000); });
});
test('food cancellation after preparation opens review, assigned independent resolver can partially settle once', async () => {
  const { svc, db } = await setup(); await funded(svc, 'order-food'); await svc.readiness('partner', 'order-food'); await svc.prepare('seller', 'order-food');
  await svc.cancel('buyer', 'order-food', 'Need to cancel after preparation');
  await assert.rejects(svc.resolveDispute('resolver', 'order-food', 20000, 0, 'Review of preparation cost', 'resolve-food'), /forbidden/);
  await svc.assignDispute('admin', 'order-food', 'resolver');
  await svc.respondDispute('seller', 'order-food', 'Half of the preparation is complete.');
  await assert.rejects(svc.resolveDispute('resolver','order-food',20000,0,'Review of preparation costs','too-early'),/response_window_open/);
  await svc.respondDispute('partner','order-food','I had not picked up the goods.');
  await svc.resolveDispute('resolver', 'order-food', 20000, 0, 'Goods partly prepared, courier had not picked up; refund remaining goods and delivery.', 'resolve-food');
  await svc.resolveDispute('resolver', 'order-food', 20000, 0, 'Goods partly prepared, courier had not picked up; refund remaining goods and delivery.', 'resolve-food');
  await db.read(s => { const o = s.orders.find(x => x.id === 'order-food')!; assert.equal(o.dispute!.decision!.buyerRefundPaise, 28000); assert.equal(o.payment.ledger.length, 1); assert.equal(o.payment.state,'funded'); assert.equal(o.status, 'disputed'); assert.equal(o.dispute!.status,'decided'); assert.equal(s.settlementInstructions.length,1); assert.equal(s.settlementInstructions[0].status,'pending_payment_execution'); });
});
test('goods-only dispute cannot confiscate correctly earned delivery fee', async () => {
  const { svc, db } = await setup(); await funded(svc); await packaged(db, svc);
  await svc.handover('partner', 'order-bearing', (await svc.codes('seller', 'order-bearing')).pickupCode, 'pickup');
  await svc.handover('partner', 'order-bearing', (await svc.codes('buyer', 'order-bearing')).deliveryCode, 'deliver');
  await svc.dispute('buyer', 'order-bearing', 'Incorrect bearing size received', ['goods'], []);
  await svc.assignDispute('admin', 'order-bearing', 'resolver');
  await db.transaction(s=>{s.orders.find(o=>o.id==='order-bearing')!.dispute!.responseDeadline=new Date(Date.now()-1000).toISOString();});
  await assert.rejects(svc.resolveDispute('resolver', 'order-bearing', 0, 0, 'Refund goods only', 'bad-resolution'), /unaffected_delivery_protected/);
  await svc.resolveDispute('resolver', 'order-bearing', 0, 8000, 'Full goods refund; correctly delivered parcel earns agreed fee.', 'good-resolution');
});
test('post-pickup cancellation remains an incident and never becomes an ordinary unassigned order', async () => {
  const { svc, db } = await setup(); await funded(svc); await packaged(db, svc);
  await svc.handover('partner', 'order-bearing', (await svc.codes('seller', 'order-bearing')).pickupCode, 'pickup');
  const result = await svc.cancelDelivery('partner', 'order-bearing', 'Road blocked, request recovery');
  assert.equal(result.order.status, 'disputed'); assert.equal(result.order.assignment.state, 'incident');
  assert.equal(await db.read(s => s.trips[0].reservedGrams), 2000);
  await assert.rejects(svc.offer('buyer', 'order-bearing', 'trip-raipur-replacement', 5000), /invalid_transition/);
});
test('local demo data survives restart and failed changes are rolled back', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sheharmitra-test-')), file = join(directory, 'state.json');
  try {
    const db = await LocalStore.open(file, () => initial); await db.transaction(s => { s.users[0].name = 'Saved name'; });
    await assert.rejects(db.transaction(s => { s.users[0].name = 'Should roll back'; throw new Error('rollback'); }), /rollback/);
    const reopened = await LocalStore.open(file, () => initial); assert.equal(await reopened.read(s => s.users[0].name), 'Saved name');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Mongo replica-set transaction smoke test', { skip: !process.env.MONGO_TEST_URI }, async () => {
  const db = await MongoStore.open(process.env.MONGO_TEST_URI!, () => initial);
  try { assert.ok(db.ready()); assert.ok((await db.searchShops({ q: 'बेयरिंग', town: 'najibabad' })).shops.length); }
  finally { await db.close(); }
});
