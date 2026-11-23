import {refreshMatchingLocations} from './domain/matching-locations.js';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import type { Store, Shop, Trip } from './domain/types.js';
import type { Address } from './location.js';
import { CommerceService, actor, allowedOrder, participant, publicOrder, expireReservations, tripHasConfirmedDelivery } from './domain/service.js';
import { findMatches,findMatchReport } from './domain/matching.js';
import { pointSchema, categories } from './domain/validation.js';
import { ensure } from './domain/errors.js';
import {resolveAddress,addressSchema,canonicalTown,locationResolutionSchema} from './location.js';
import {isStaff} from './roles.js';
import { config } from './config.js';

const text = z.string().trim().min(3).max(1000);
const paise = z.number().int().min(0).max(100000);
const key = (req: Request) => req.get('idempotency-key') || '';
const orderId = (req: Request) => String(req.params.id);
const who = (req: Request) => req.user!.id;
const areaLabel=(address:Address|undefined,fallback:string)=>!address?fallback:address.locality.toLowerCase()===address.city.toLowerCase()?address.city:`${address.locality}, ${address.city}`;
const tripLabels=(trip:Trip)=>({origin:areaLabel(trip.originAddress,trip.origin),destination:areaLabel(trip.destinationAddress,trip.destination)});
const publicShop = (shop: Shop) => ({ ...shop, coordinates:undefined,addressDetails:undefined,address:undefined, image: shop.image.startsWith('/shops/') ? shop.image : `${config.publicOrigin}/api/uploads/public/${encodeURIComponent(shop.image)}`, gallery: shop.gallery.map(image => image.startsWith('/shops/') ? image : `${config.publicOrigin}/api/uploads/public/${encodeURIComponent(image)}`) });
function setting(name: string, fallback: number) { const n = Number(process.env[name] || fallback); ensure(Number.isSafeInteger(n) && n >= 0, 'invalid_configuration', 500); return n; }

export function createCommerceRouter(store: Store, requireAuth: RequestHandler) {
  const router = Router();
  async function shopInput(req:Request){addressSchema.parse(req.body.addressDetails && (({locationId,...fields}:Record<string,unknown>)=>fields)(req.body.addressDetails));ensure(!('coordinates' in req.body)&&!('locationVerified' in req.body),'invalid_address');const prior=req.params.id?await store.read(s=>s.shops.find(x=>x.id===String(req.params.id)&&x.sellerId===who(req))):undefined;const location=await resolveAddress(store,who(req),req.body.addressDetails,req.body.locationId,prior);const {locationId,...body}=req.body;return {...body,...location,town:canonicalTown(location.addressDetails.city),locality:{en:location.addressDetails.locality,hi:location.addressDetails.locality}};}
  const service = new CommerceService(store, { secret: config.sessionSecret, platformFeePaise: setting('PLATFORM_FEE_PAISE', 0), maxValuePaise: setting('PILOT_MAX_VALUE_PAISE', 500000), maxWeightGrams: setting('PILOT_MAX_WEIGHT_GRAMS', 20000) });
  router.get('/shops', async (req, res) => {
    const query = z.object({ town: z.string().trim().max(100).default(''), category: z.enum(categories).optional(), q: z.string().max(120).optional(), page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(24).default(12) }).parse(req.query);
    const result = await store.searchShops(query);
    res.set('Cache-Control', 'no-store'); res.json({ ...result, shops: result.shops.map(publicShop) });
  });
  router.get('/shops/:slug', async (req, res) => {
    const shop = await store.read(s => s.shops.find(x => x.slug === req.params.slug && x.approved && !x.suspended && s.users.some(u=>u.id===x.sellerId&&!u.banned&&!isStaff(u)))); ensure(shop, 'shop_not_found', 404);
    res.set('Cache-Control', 'no-store'); res.json({ shop: publicShop(shop) });
  });
  router.get('/trips', async (_req, res) => {
    const trips = await store.read(s => s.trips.filter(t => t.available && Date.parse(t.departureAt) > Date.now() && s.users.some(u => u.id === t.partnerId && !u.banned && !isStaff(u) && u.partnerStatus === 'approved')));
    res.set('Cache-Control', 'no-store'); res.json({ trips:trips.map(t=>({...t,...tripLabels(t),route:undefined,originAddress:undefined,destinationAddress:undefined})), estimate: true });
  });
  router.use(requireAuth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.get('/my-shops', async (req, res) => res.json({ shops: await store.read(s => s.shops.filter(x => x.sellerId === who(req))) }));
  router.post('/shops', async (req, res) => {const data=await shopInput(req);res.status(201).json(await service.saveShop(who(req),data));});
  router.patch('/shops/:id', async (req, res) => {const data=await shopInput(req);res.json(await service.saveShop(who(req),data,orderId(req)));});
  router.patch('/shops/:id/availability', async (req,res)=>{
    const {closed}=z.object({closed:z.boolean()}).strict().parse(req.body);
    res.json(await store.transaction(s=>{const shop=s.shops.find(x=>x.id===orderId(req)&&x.sellerId===who(req));ensure(shop,'forbidden',403);shop.closed=closed;shop.updatedAt=new Date().toISOString();return {shop};}));
  });
  async function tripInput(req:Request) {
    const data=req.body;
    ensure(data.originAddress&&data.destinationAddress&&!('route' in data)&&!('locationVerified' in data),'invalid_address');
    const prior=req.params.id?await store.read(s=>s.trips.find(t=>t.id===String(req.params.id)&&t.partnerId===who(req))):undefined;
    if(req.params.id)ensure(prior,'forbidden',403);
    const previous=(address:any,coordinates:any,locationResolution:any)=>address?{addressDetails:address,coordinates,locationResolution}:undefined;
    const a=await resolveAddress(store,who(req),data.originAddress,data.originLocationId,previous(prior?.originAddress,prior?.route[0],prior?.originResolution));
    const b=await resolveAddress(store,who(req),data.destinationAddress,data.destinationLocationId,previous(prior?.destinationAddress,prior?.route.at(-1),prior?.destinationResolution));
    const {originLocationId,destinationLocationId,...rest}=data;
    return {...rest,originAddress:a.addressDetails,destinationAddress:b.addressDetails,originResolution:a.locationResolution,destinationResolution:b.locationResolution,origin:a.addressDetails.city,destination:b.addressDetails.city,route:a.coordinates&&b.coordinates?[a.coordinates,b.coordinates]:[],locationVerified:!!(a.coordinates&&b.coordinates)};
  }
  router.post('/trips', async (req,res)=>res.status(201).json(await service.createTrip(who(req),await tripInput(req))));
  router.patch('/trips/:id', async (req,res)=>res.json(await service.updateTrip(who(req),orderId(req),await tripInput(req))));
  router.get('/my-trips', async (req, res) => res.json({ trips: await store.read(s => s.trips.filter(t => t.partnerId === who(req)).map(t=>({...t,...tripLabels(t),editable:Date.parse(t.departureAt)>Date.now()&&!tripHasConfirmedDelivery(s,t.id)}))) }));
  router.patch('/trips/:id/availability', async (req, res) => {
    const { available } = z.object({ available: z.boolean() }).parse(req.body);
    res.json(await store.transaction(s => {
      const trip = s.trips.find(t => t.id === orderId(req) && t.partnerId === who(req)); ensure(trip, 'forbidden', 403);
      ensure(available || trip.reservedParcels === 0, 'active_deliveries_exist', 409); trip.available = available; return { trip };
    }));
  });
  router.get('/orders', async (req, res) => {
    const archived = req.query.archived === 'true';
    res.json(await store.transaction(s => {
      expireReservations(s); const user = actor(s, who(req));
      return { orders: s.orders.filter(o => participant(o, user.id) || o.offers.some(f => f.partnerId === user.id) || user.roles.includes('admin') || (user.roles.includes('resolver') && o.dispute?.resolverId === user.id))
        .filter(o => archived ? ['completed', 'cancelled'].includes(o.status) : !['completed', 'cancelled'].includes(o.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(o => publicOrder(s, o, user.id)) };
    }));
  });
  router.post('/orders', async (req, res) => {
    let body=z.object({shopId:z.string().max(100),addressDetails:addressSchema.extend({locationId:z.string().max(100).optional()}),locationId:z.string().max(100).optional()}).strict().parse(req.body);let resolved;{const location=await resolveAddress(store,who(req),body.addressDetails,body.locationId);resolved={shopId:body.shopId,destination:{...location.coordinates,village:location.addressDetails.city,address:location.address,addressDetails:location.addressDetails,locationVerified:location.locationVerified,locationResolution:location.locationResolution}};}
    const data = z.object({ shopId: z.string().max(100), destination: pointSchema.partial().extend({ village: z.string().trim().min(2).max(100), address: z.string().trim().min(3).max(1000),addressDetails:addressSchema.optional(),locationVerified:z.boolean().optional(),locationResolution:locationResolutionSchema.optional() }) }).parse(resolved);
    res.status(201).json(await service.createOrder(who(req), data));
  });
  router.get('/orders/:id', async (req, res) => res.json(await store.transaction(s => { expireReservations(s); return { order: publicOrder(s, allowedOrder(s, orderId(req), who(req)), who(req)) }; })));
  router.get('/orders/:id/matches', async (req, res) => {await refreshMatchingLocations(store,orderId(req),who(req));res.json(await store.read(s => {
    const order = allowedOrder(s, orderId(req), who(req)); ensure(order.buyerId === who(req) || order.sellerId === who(req), 'forbidden', 403);
    const report=findMatchReport(s,order);return { reasons:report.reasons, matches: report.matches.map(m=>({...m,extraKm:undefined,trip:{...m.trip,...tripLabels(m.trip),route:undefined,originAddress:undefined,destinationAddress:undefined}})), estimate: true };
  }));});
  router.post('/orders/:id/quote', async (req, res) => {const shop=await store.read(s=>{const order=allowedOrder(s,orderId(req),who(req));ensure(order.sellerId===who(req),'forbidden',403);return s.shops.find(x=>x.id===order.shopId);});ensure(shop,'shop_not_found',404);res.json(await service.quote(who(req),orderId(req),{...req.body,pickup:shop.coordinates||null,pickupAddress:shop.address,pickupAddressDetails:shop.addressDetails,pickupResolution:shop.locationResolution}));});
  router.post('/orders/:id/accept-quote', async (req, res) => { const b = z.object({ version: z.number().int().positive(), substitutionConsent: z.boolean().default(false) }).parse(req.body); res.json(await service.acceptQuote(who(req), orderId(req), b.version, b.substitutionConsent)); });
  router.post('/orders/:id/offers', async (req, res) => { const b = z.object({ tripId: z.string(), feePaise: paise }).parse(req.body); res.status(201).json(await service.offer(who(req), orderId(req), b.tripId, b.feePaise)); });
  router.post('/orders/:id/offers/:offerId/respond', async (req, res) => { const b = z.object({ accept: z.boolean(), feePaise: paise.optional() }).parse(req.body); res.json(await service.respondOffer(who(req), orderId(req), String(req.params.offerId), b.accept, b.feePaise)); });
  router.post('/orders/:id/confirm-offer', async (req, res) => { const b = z.object({ offerId: z.string() }).parse(req.body); res.json(await service.confirmOffer(who(req), orderId(req), b.offerId, key(req))); });
  router.post('/orders/:id/fund', async (req, res) => res.json(await service.fund(who(req), orderId(req), key(req))));
  router.post('/orders/:id/readiness', async (req, res) => res.json(await service.readiness(who(req), orderId(req))));
  router.post('/orders/:id/prepare', async (req, res) => res.json(await service.prepare(who(req), orderId(req))));
  router.post('/orders/:id/ready', async (req, res) => { const b = z.object({ imageId: z.string(), contents: text }).parse(req.body); res.json(await service.ready(who(req), orderId(req), b.imageId, b.contents)); });
  router.get('/orders/:id/codes', async (req, res) => res.json(await service.codes(who(req), orderId(req))));
  const codeLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'too_many_attempts' } } });
  router.post('/orders/:id/pickup', codeLimit, async (req, res) => { const b = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body); res.json(await service.handover(who(req), orderId(req), b.code, 'pickup')); });
  router.post('/orders/:id/deliver', codeLimit, async (req, res) => { const b = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body); res.json(await service.handover(who(req), orderId(req), b.code, 'deliver')); });
  router.post('/orders/:id/complete', async (req, res) => res.json(await service.complete(who(req), orderId(req), key(req))));
  router.post('/orders/:id/cancel', async (req, res) => { const b = z.object({ reason: text }).parse(req.body); res.json(await service.cancel(who(req), orderId(req), b.reason)); });
  router.post('/orders/:id/cancel-delivery', async (req, res) => { const b = z.object({ reason: text }).parse(req.body); res.json(await service.cancelDelivery(who(req), orderId(req), b.reason)); });
  router.post('/orders/:id/disputes', async (req, res) => { const b = z.object({ reason: text, description:z.string().trim().max(2000).default(''), components: z.array(z.enum(['goods', 'delivery'])).min(1).max(2), evidence: z.array(z.string()).max(10).default([]) }).parse(req.body); res.json(await service.dispute(who(req), orderId(req), b.reason, b.components, b.evidence,b.description)); });
  router.post('/orders/:id/disputes/respond', async (req, res) => { const b = z.object({ text,evidence:z.array(z.string()).max(10).default([]) }).parse(req.body); res.json(await service.respondDispute(who(req), orderId(req), b.text,b.evidence)); });
  router.post('/orders/:id/disputes/assign', async (req, res) => { const b = z.object({ resolverId: z.string() }).parse(req.body); res.json(await service.assignDispute(who(req), orderId(req), b.resolverId)); });
  router.post('/orders/:id/disputes/resolve', async (req, res) => { const b = z.object({ sellerPaise: z.number().int().nonnegative(), partnerPaise: z.number().int().nonnegative(), rationale: text }).parse(req.body); res.json(await service.resolveDispute(who(req), orderId(req), b.sellerPaise, b.partnerPaise, b.rationale, key(req))); });
  router.post('/orders/:id/incidents', async (req, res) => {
    const b = z.object({ action: z.enum(['contact_attempt', 'waiting', 'return_requested', 'returned']), note: text }).parse(req.body);
    res.json(await store.transaction(s => {
      const order = allowedOrder(s, orderId(req), who(req)); ensure(participant(order, who(req)), 'forbidden', 403);
      ensure(['picked_up', 'disputed'].includes(order.status), 'invalid_transition', 409);
      order.activity.push({ id: crypto.randomUUID(), type: b.action, actorId: who(req), detail: b.note, at: new Date().toISOString() });
      return { order: publicOrder(s, order, who(req)) };
    }));
  });
  return router;
}
