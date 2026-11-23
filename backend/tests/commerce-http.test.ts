import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { LocalStore } from '../src/data/store.js';
import { seedState } from '../src/data/seed.js';
import { storage } from '../src/uploads.js';

test('HTTP commerce workflow authenticates actors, negotiates a quote, uploads packaging, verifies custody and settles once', async () => {
  const db = new LocalStore(await seedState()), app = createApp(db);
  async function account(phone: string) {
    const agent = request.agent(app), initial = await agent.get('/api/auth/me');
    const response = await agent.post('/api/auth/login').set('Origin', 'http://localhost:3000').set('X-CSRF-Token', initial.body.csrfToken).send({ phone, password: 'DemoPass123!' });
    assert.equal(response.status, 200);
    return { agent, token: response.body.csrfToken, post: (path: string, data: object = {}, key = '') => agent.post(path).set('Origin', 'http://localhost:3000').set('X-CSRF-Token', response.body.csrfToken).set('Idempotency-Key', key).send(data) };
  }
  const buyer = await account('9000000001'), seller = await account('9000000002'), partner = await account('9000000003'), outsider = await account('9000000007');
  const base = '/api/orders/order-bearing';
  assert.equal((await outsider.agent.get(base)).status, 403);
  assert.equal((await request(app).get(base)).status, 401);
  const search = await request(app).get('/api/shops').query({ q: 'बेयरिंग', town: 'najibabad' });
  assert.equal(search.body.shops[0].id, 'shop-tractor-parts');
  const oldQuote = await db.read(s => s.orders[0].quotes[0]);
  const quote = await seller.post(`${base}/quote`, { ...oldQuote, goodsTotalPaise: 1, items: [{ description: 'Confirmed bearing size', quantity: 2, unitPricePaise: 60000 }] });
  assert.equal(quote.status, 200); assert.equal(quote.body.order.quotes.at(-1).goodsTotalPaise, 120000);
  assert.equal((await buyer.post(`${base}/accept-quote`, { version: 2 })).status, 200);
  const matches = await buyer.agent.get(`${base}/matches`);
  assert.equal(matches.status, 200); assert.equal(matches.body.matches.some((m: any) => m.trip.id === 'trip-wrong-direction'), false);
  const offer = await buyer.post(`${base}/offers`, { tripId: 'trip-raipur', feePaise: 7000 });
  assert.equal(offer.status, 201); const offerId = offer.body.order.offers.at(-1).id;
  assert.equal((await partner.post(`${base}/offers/${offerId}/respond`, { accept: true, feePaise: 8000 })).status, 200);
  assert.equal((await seller.post(`${base}/confirm-offer`, { offerId }, 'seller-forged-accept')).status, 403);
  assert.equal((await buyer.post(`${base}/confirm-offer`, { offerId })).status, 400);
  assert.equal((await buyer.post(`${base}/confirm-offer`, { offerId }, 'buyer-confirm-http')).status, 200);
  const fund = await buyer.post(`${base}/fund`, {}, 'buyer-fund-http'); assert.equal(fund.status, 200);
  const repeated = await buyer.post(`${base}/fund`, {}, 'buyer-fund-http'); assert.equal(repeated.status, 200); assert.equal(repeated.body.order.payment.ledger.length, 1);
  assert.equal((await seller.agent.get(base)).body.order.destination.lat, undefined);
  assert.equal((await partner.agent.get(base)).body.order.destination.lat, undefined);
  assert.ok((await partner.agent.get(base)).body.order.destination.address);
  const image = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#1F6B4F' } }).png().toBuffer();
  const uploaded = await seller.agent.post('/api/uploads').set('Origin', 'http://localhost:3000').set('X-CSRF-Token', seller.token).field('purpose', 'packaging').field('orderId', 'order-bearing').attach('file', image, { filename: 'synthetic-package.png', contentType: 'image/png' });
  assert.equal(uploaded.status, 201);
  try {
    assert.equal((await seller.post(`${base}/ready`, { imageId: uploaded.body.upload.id, contents: 'Two bearings in a sealed synthetic demo package' })).status, 200);
    const pickup = await seller.agent.get(`${base}/codes`), delivery = await buyer.agent.get(`${base}/codes`);
    assert.equal((await partner.agent.get(`${base}/codes`)).body.pickupCode, undefined);
    assert.equal((await partner.post(`${base}/pickup`, { code: pickup.body.pickupCode })).status, 200);
    assert.equal((await partner.post(`${base}/deliver`, { code: delivery.body.deliveryCode })).status, 200);
    assert.equal((await buyer.post(`${base}/complete`, {}, 'buyer-complete-http')).status, 200);
    assert.equal((await buyer.post(`${base}/complete`, {}, 'buyer-complete-http')).body.order.payment.ledger.length, 2);
    assert.equal((await buyer.agent.get('/api/orders')).body.orders.some((o: any) => o.id === 'order-bearing'), false);
    assert.equal((await buyer.agent.get('/api/orders?archived=true')).body.orders.find((o: any) => o.id === 'order-bearing').status, 'completed');
  } finally {
    const record = await db.read(s => s.uploads.find(u => u.id === uploaded.body.upload.id));
    if (record) await storage.remove(record.key);
  }
});
