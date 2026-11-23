import {refreshMatchingLocations} from './matching-locations.js';
import {isStaff,isResolver} from '../roles.js';
import { randomUUID } from 'node:crypto';
import type { Assignment, Order, Quote, State, Store, User, LedgerEvent } from './types.js';
import { ensure, DomainError } from './errors.js';
import { findMatches, matchTrip } from './matching.js';
import { checkCode, createCode, revealCode } from './codes.js';
import { quoteSchema, tripSchema, shopSchema } from './validation.js';
import { shopTokens } from './search.js';
import { DemoPaymentProvider } from './payments.js';

type Settings = { secret: string; platformFeePaise: number; maxValuePaise: number; maxWeightGrams: number };
function configuredHours(name:string,fallback:number){const hours=Number(process.env[name]||fallback);ensure(Number.isFinite(hours)&&hours>0&&hours<=720,'invalid_configuration',500);return hours;}
const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID()}`;
export function actor(state: State, userId: string): User { const u = state.users.find(x => x.id === userId); ensure(u, 'unauthenticated', 401); ensure(!u.banned,'account_banned',403);return u; }
export function participant(order: Order, userId: string): boolean { return order.buyerId === userId || order.sellerId === userId || order.assignment?.partnerId === userId || (order.assignmentHistory||[]).some(a => a.partnerId === userId); }
export function allowedOrder(state: State, orderId: string, userId: string): Order {
  const o = state.orders.find(x => x.id === orderId); ensure(o, 'order_not_found', 404);
  const u = actor(state, userId);
  ensure(participant(o, userId) || o.offers.some(x => x.partnerId === userId) || u.roles.includes('admin') || (o.dispute?.resolverId === userId && isResolver(u)), 'forbidden', 403);
  return o;
}
function event(order: Order, type: string, actorId: string, detail?: string) { order.activity.push({ id: id('event'), type, actorId, at: nowIso(), ...(detail ? { detail } : {}) }); order.updatedAt = nowIso(); }
function only(userId: string, required: string | undefined) { ensure(userId === required, 'forbidden', 403); }
export function tripHasConfirmedDelivery(state: State, tripId: string): boolean {
  return state.orders.some(o => o.assignment?.tripId === tripId || o.assignmentHistory?.some(a => a.tripId === tripId));
}
function marketplaceActor(state:State,userId:string){const user=actor(state,userId);ensure(!user.banned&&!isStaff(user),'staff_marketplace_forbidden',403);return user;}
function active(order: Order) { ensure(!['cancelled', 'completed'].includes(order.status), 'order_closed', 409); }
function releaseCapacity(state: State, order: Order) {
  const a = order.assignment;
  if (!a || a.capacityReleased) return;
  const trip = state.trips.find(t => t.id === a.tripId);
  if (trip) { trip.reservedGrams = Math.max(0, trip.reservedGrams - (order.acceptedQuote?.weightGrams || 0)); trip.reservedParcels = Math.max(0, trip.reservedParcels - 1); }
  a.capacityReleased = true;
}
function archiveAssignment(state: State, order: Order, reason: string) {
  if (!order.assignment) return;
  releaseCapacity(state, order);
  order.assignment.state = 'cancelled'; order.assignment.cancelledAt = nowIso(); order.assignment.cancelReason = reason;
  order.assignmentHistory.push(structuredClone(order.assignment)); delete order.assignment;
  delete order.pickupCode; delete order.deliveryCode;
}
function checkKey(order: Order, key: string, fingerprint: string): boolean {
  ensure(key.length >= 8 && key.length <= 120, 'idempotency_key_required');
  const existing = order.idempotency[key];
  if (existing) { ensure(existing === fingerprint, 'idempotency_key_reused', 409); return false; }
  order.idempotency[key] = fingerprint;
  return true;
}
const paymentProvider = new DemoPaymentProvider();
function addLedger(order: Order, data: Omit<LedgerEvent, 'id' | 'at'>) { paymentProvider.validateEvent(data); ensure(!order.payment.ledger.some(e => e.key === data.key), 'duplicate_ledger_event', 409); order.payment.ledger.push({ id: id('ledger'), at: nowIso(), ...data }); }
function refundDelivery(order: Order, key: string) {
  if (order.payment.state !== 'funded' || !order.payment.deliveryPaise) return;
  addLedger(order, { key, type: 'refund', goodsPaise: 0, deliveryPaise: order.payment.deliveryPaise, platformPaise: 0, sellerPaise: 0, partnerPaise: 0, buyerRefundPaise: order.payment.deliveryPaise });
  order.payment.deliveryPaise = 0;
}
function makeDispute(order: Order, userId: string, reason: string, components: ('goods' | 'delivery')[], evidence: string[]) {
  ensure(!order.dispute || order.dispute.status === 'resolved', 'dispute_already_open', 409);
  ensure(order.payment.state !== 'settled' && order.payment.state !== 'refunded', 'already_settled', 409);
  ensure(order.payment.state === 'funded', 'payment_required_for_dispute', 409);
  order.dispute = { id: id('dispute'), openedBy: userId, reason, components, evidence, responses: [], responseDeadline: new Date(Date.now() + configuredHours('DISPUTE_RESPONSE_HOURS',48) * 3600000).toISOString(), status: 'open',openedAt:nowIso() };
  order.status = 'disputed'; event(order, 'dispute_opened', userId, reason);
}
export function expireReservations(state: State, now = Date.now()) {
  for (const order of state.orders) {
    if (order.assignment?.state === 'reserved' && Date.parse(order.assignment.reservedUntil) <= now) {
      archiveAssignment(state, order, 'reservation_expired'); order.status = 'awaiting_delivery_partner';
      for (const offer of order.offers) if (offer.status === 'confirmed') offer.status = 'expired';
      event(order, 'reservation_expired', 'system');
    }
  }
}
export function publicOrder(state: State, order: Order, userId: string): any {
  const result: any = structuredClone(order);
  if(result.acceptedQuote)delete result.acceptedQuote.pickup;for(const quote of result.quotes)delete quote.pickup;delete result.destination.lat;delete result.destination.lng;
  delete result.matchingPickup; delete result.pickupCode; delete result.deliveryCode; delete result.idempotency;
  // Exact home location is shared only with its owner and the committed courier.
  if (order.buyerId !== userId && !(order.assignment?.partnerId === userId && ['committed', 'picked_up', 'delivered', 'incident'].includes(order.assignment.state))) {
    result.destination = { village: order.destination.village };
  }
  result.isBuyer = order.buyerId === userId; result.isSeller = order.sellerId === userId;
  result.isPartner = order.assignment?.partnerId === userId;
  return result;
}

export class CommerceService {
  constructor(public store: Store, public settings: Settings) {}
  private async change(userId: string, orderId: string, fn: (state: State, order: Order, user: User) => unknown) {
    return this.store.transaction(state => {
      expireReservations(state);
      const user = actor(state, userId), order = allowedOrder(state, orderId, userId);
      fn(state, order, user);
      return { order: publicOrder(state, order, userId) };
    });
  }
  async createOrder(userId: string, input: { shopId: string; destination: Order['destination'] }) {
    return this.store.transaction(state => {
      marketplaceActor(state, userId);
      const shop = state.shops.find(s => s.id === input.shopId && s.approved && !s.closed && !s.suspended && state.users.some(u=>u.id===s.sellerId&&!u.banned&&!isStaff(u))); ensure(shop, 'shop_unavailable', 409);
      ensure(shop.sellerId !== userId, 'self_dealing', 409);
      const order: Order = { id: id('order'), buyerId: userId, sellerId: shop.sellerId, shopId: shop.id, shopName: shop.name, destination: input.destination, status: 'awaiting_quote', quotes: [], offers: [], assignmentHistory: [], payment: { mode: 'demo', state: 'unfunded', goodsPaise: 0, deliveryPaise: 0, platformPaise: 0, ledger: [] }, activity: [], idempotency: {}, createdAt: nowIso(), updatedAt: nowIso() };
      event(order, 'order_requested', userId); state.orders.push(order); return { order: publicOrder(state, order, userId) };
    });
  }
  async quote(userId: string, orderId: string, input: unknown) {
    const data = quoteSchema.parse(input);
    return this.change(userId, orderId, (state, order) => {
      only(userId, order.sellerId); active(order);
      ensure(!['preparing', 'ready', 'picked_up', 'delivered', 'disputed'].includes(order.status), 'quote_locked', 409);
      ensure(order.payment.state === 'unfunded', 'funded_quote_locked', 409);
      ensure(Date.parse(data.expiresAt) > Date.now() && Date.parse(data.readyAt) > Date.now(), 'quote_expired', 409);
      ensure(data.weightGrams <= this.settings.maxWeightGrams, 'parcel_too_heavy');
      const items = data.items.map(i => ({ ...i, lineTotalPaise: i.quantity * i.unitPricePaise }));
      const goodsTotalPaise = items.reduce((sum, i) => sum + i.lineTotalPaise, 0);
      ensure(goodsTotalPaise > 0 && goodsTotalPaise <= this.settings.maxValuePaise, 'pilot_value_limit');
      if (order.assignment) archiveAssignment(state, order, 'quote_revised');
      const quote: Quote = { ...data, items, goodsTotalPaise, version: order.quotes.length + 1, createdAt: nowIso() };
      order.quotes.push(quote); delete order.acceptedQuote; delete order.acceptedAt;
      for (const offer of order.offers) offer.status = 'expired';
      order.status = 'quote_proposed'; event(order, 'quote_proposed', userId, String(quote.version));
    });
  }
  async acceptQuote(userId: string, orderId: string, version: number, substitutionConsent: boolean) {
    return this.change(userId, orderId, (_state, order) => {
      only(userId, order.buyerId); ensure(order.status === 'quote_proposed', 'invalid_transition', 409);
      const quote = order.quotes.at(-1)!; ensure(quote.version === version, 'quote_changed', 409);
      ensure(Date.parse(quote.expiresAt) > Date.now(), 'quote_expired', 409);
      ensure(!quote.substitutionConsentRequired || substitutionConsent, 'substitution_consent_required');
      order.acceptedQuote = structuredClone(quote); order.acceptedAt = nowIso(); order.status = 'awaiting_delivery_partner';
      event(order, 'buyer_accepted', userId, String(version));
    });
  }
  async offer(userId: string, orderId: string, tripId: string, feePaise: number) {
    await refreshMatchingLocations(this.store,orderId,userId);
    return this.change(userId, orderId, (state, order) => {
      only(userId, order.buyerId); ensure(order.status === 'awaiting_delivery_partner', 'invalid_transition', 409);
      const match = findMatches(state, order).find(m => m.trip.id === tripId); ensure(match, 'trip_not_compatible', 409);
      ensure(!order.offers.some(o => o.tripId === tripId && ['proposed', 'countered', 'accepted_by_partner'].includes(o.status)), 'offer_already_open', 409);
      order.offers.push({ id: id('offer'), tripId, partnerId: match.trip.partnerId, proposedPaise: feePaise, finalPaise: feePaise, status: 'proposed', quoteVersion: order.acceptedQuote!.version, expiresAt: new Date(Date.now() + 15 * 60000).toISOString(), createdAt: nowIso() });
      event(order, 'delivery_fee_proposed', userId);
    });
  }
  async respondOffer(userId: string, orderId: string, offerId: string, accept: boolean, feePaise?: number) {
    return this.store.transaction(state => {
      expireReservations(state); const user = actor(state, userId);
      const order = state.orders.find(o => o.id === orderId); ensure(order, 'order_not_found', 404);
      const offer = order.offers.find(o => o.id === offerId); ensure(offer && offer.partnerId === userId, 'forbidden', 403);
      ensure(user.partnerStatus === 'approved', 'partner_not_approved', 403);
      ensure(order.status === 'awaiting_delivery_partner' && offer.status === 'proposed' && Date.parse(offer.expiresAt) > Date.now(), 'offer_expired', 409);
      ensure(userId !== order.buyerId && userId !== order.sellerId, 'self_dealing', 409);
      if (!accept) offer.status = 'declined';
      else if (feePaise !== undefined && feePaise !== offer.proposedPaise) { offer.status = 'countered'; offer.finalPaise = feePaise; }
      else offer.status = 'accepted_by_partner';
      event(order, `delivery_fee_${offer.status}`, userId);
      return { order: publicOrder(state, order, userId) };
    });
  }
  async confirmOffer(userId: string, orderId: string, offerId: string, key: string) {
    await refreshMatchingLocations(this.store,orderId,userId);
    return this.change(userId, orderId, (state, order) => {
      only(userId, order.buyerId);
      if (!checkKey(order, key, `confirm:${offerId}`)) return;
      ensure(order.status === 'awaiting_delivery_partner' && !order.assignment, 'already_assigned', 409);
      const offer = order.offers.find(o => o.id === offerId); ensure(offer && ['countered', 'accepted_by_partner'].includes(offer.status), 'partner_must_accept', 409);
      ensure(Date.parse(offer.expiresAt) > Date.now() && offer.quoteVersion === order.acceptedQuote?.version, 'offer_expired', 409);
      const match = findMatches(state, order).find(m => m.trip.id === offer.tripId); ensure(match, 'trip_not_compatible', 409);
      const trip = state.trips.find(t => t.id === offer.tripId)!;
      trip.reservedGrams += order.acceptedQuote!.weightGrams; trip.reservedParcels += 1;
      order.assignment = { id: id('assignment'), tripId: trip.id, partnerId: trip.partnerId, feePaise: offer.finalPaise, state: 'reserved', reservedUntil: new Date(Date.now() + 10 * 60000).toISOString(), capacityReleased: false };
      offer.status = 'confirmed'; for (const other of order.offers) if (other.id !== offer.id) other.status = 'expired';
      order.status = 'delivery_reserved'; event(order, 'delivery_reserved', userId);
    });
  }
  async fund(userId: string, orderId: string, key: string) {
    return this.change(userId, orderId, (_state, order) => {
      only(userId, order.buyerId); if (!checkKey(order, key, 'fund')) return;
      ensure(order.assignment && order.status === 'delivery_reserved', 'delivery_required', 409);
      ensure(Date.parse(order.assignment.reservedUntil) > Date.now(), 'reservation_expired', 409);
      const goods = order.acceptedQuote!.goodsTotalPaise, delivery = order.assignment.feePaise;
      // A cancelled courier's delivery portion was refunded; goods stay funded for rematching.
      const additionalGoods = order.payment.state === 'funded' ? 0 : goods;
      const additionalPlatform = order.payment.state === 'funded' ? 0 : this.settings.platformFeePaise;
      addLedger(order, { key, type: 'fund', goodsPaise: additionalGoods, deliveryPaise: delivery, platformPaise: additionalPlatform, sellerPaise: 0, partnerPaise: 0, buyerRefundPaise: 0 });
      order.payment.state = 'funded'; order.payment.goodsPaise = goods; order.payment.deliveryPaise = delivery; order.payment.platformPaise = this.settings.platformFeePaise;
      order.assignment.state = 'committed'; order.status = 'confirmed';
      const expiresAt = new Date(Date.parse(order.acceptedQuote!.deliveryBy) + 6 * 3600000).toISOString();
      order.pickupCode = createCode(this.settings.secret, expiresAt);
      order.deliveryCode = createCode(this.settings.secret, expiresAt, revealCode(order.pickupCode, this.settings.secret));
      event(order, 'demo_payment_funded', userId);
    });
  }
  async readiness(userId: string, orderId: string) {
    return this.change(userId, orderId, (_state, order) => {
      only(userId, order.assignment?.partnerId); ensure(order.assignment?.state === 'committed' && order.status === 'confirmed', 'invalid_transition', 409);
      ensure(Date.parse(order.acceptedQuote!.pickupBy) > Date.now(), 'pickup_window_expired', 409);
      order.assignment.readinessConfirmedAt = nowIso(); event(order, 'partner_readiness_confirmed', userId);
    });
  }
  async prepare(userId: string, orderId: string) {
    return this.change(userId, orderId, (_state, order) => {
      only(userId, order.sellerId); ensure(order.status === 'confirmed' && order.payment.state === 'funded' && order.assignment?.state === 'committed', 'preparation_prerequisites', 409);
      const quote = order.acceptedQuote!;
      ensure(Date.parse(quote.pickupBy) > Date.now(), 'pickup_window_expired', 409);
      if (quote.perishable) {
        ensure(order.assignment.readinessConfirmedAt && Date.now() - Date.parse(order.assignment.readinessConfirmedAt) < 15 * 60000, 'readiness_required', 409);
        ensure(Date.now() >= Date.parse(quote.readyAt) - (quote.preparationMinutes + 30) * 60000, 'preparation_too_early', 409);
      }
      order.status = 'preparing'; event(order, 'preparing', userId);
    });
  }
  async ready(userId: string, orderId: string, imageId: string, contents: string) {
    return this.change(userId, orderId, (state, order) => {
      only(userId, order.sellerId);
      ensure(order.status === 'preparing' || (order.status === 'confirmed' && !order.acceptedQuote!.perishable), 'invalid_transition', 409);
      const upload = state.uploads.find(u => u.id === imageId && u.ownerId === userId && u.purpose === 'packaging' && u.orderId === order.id);
      ensure(upload, 'packaging_photo_required');
      order.packaging = { imageId, contents, at: nowIso() }; order.status = 'ready'; event(order, 'ready', userId);
    });
  }
  async codes(userId: string, orderId: string) {
    return this.store.read(state => {
      const order = allowedOrder(state, orderId, userId), result: Record<string, string> = {};
      if (userId === order.sellerId && order.pickupCode && !order.pickupCode.consumedAt && ['confirmed', 'preparing', 'ready'].includes(order.status)) result.pickupCode = revealCode(order.pickupCode, this.settings.secret);
      if (userId === order.buyerId && order.deliveryCode && !order.deliveryCode.consumedAt && ['confirmed', 'preparing', 'ready', 'picked_up', 'disputed'].includes(order.status)) result.deliveryCode = revealCode(order.deliveryCode, this.settings.secret);
      return result;
    });
  }
  async handover(userId: string, orderId: string, value: string, kind: 'pickup' | 'deliver') {
    const result = await this.store.transaction(state => {
      const order = allowedOrder(state, orderId, userId); only(userId, order.assignment?.partnerId);
      ensure(order.status === (kind === 'pickup' ? 'ready' : 'picked_up'), 'invalid_transition', 409);
      const code = kind === 'pickup' ? order.pickupCode : order.deliveryCode; ensure(code, 'code_unavailable');
      const error = checkCode(code, value, this.settings.secret);
      if (error) { event(order, 'handover_code_attempt_failed', userId); return { error }; }
      if (kind === 'pickup') { ensure(order.packaging, 'packaging_photo_required'); order.status = 'picked_up'; order.assignment!.state = 'picked_up'; order.assignment!.pickedUpAt = nowIso(); }
      else { order.status = 'delivered'; order.assignment!.state = 'delivered'; order.assignment!.deliveredAt = nowIso(); releaseCapacity(state, order); }
      event(order, order.status, userId); return { order: publicOrder(state, order, userId) };
    });
    if ('error' in result) throw new DomainError(result.error!, 400);
    return result;
  }
  async complete(userId: string, orderId: string, key: string) {
    return this.change(userId, orderId, (_state, order) => {
      only(userId, order.buyerId); if (!checkKey(order, key, 'complete')) return;
      ensure(order.status === 'delivered' && order.payment.state === 'funded' && !order.dispute, 'invalid_transition', 409);
      addLedger(order, { key, type: 'release', goodsPaise: order.payment.goodsPaise, deliveryPaise: order.payment.deliveryPaise, platformPaise: order.payment.platformPaise, sellerPaise: order.payment.goodsPaise, partnerPaise: order.payment.deliveryPaise, buyerRefundPaise: 0 });
      order.payment.state = 'settled'; order.status = 'completed'; event(order, 'completed', userId);
    });
  }
  async cancel(userId: string, orderId: string, reason: string) {
    return this.change(userId, orderId, (state, order) => {
      ensure(userId === order.buyerId || userId === order.sellerId, 'forbidden', 403); active(order);
      ensure(order.status !== 'disputed', 'dispute_already_open', 409);
      if (['preparing', 'ready', 'picked_up', 'delivered'].includes(order.status)) {
        if (order.assignment && ['picked_up', 'delivered'].includes(order.assignment.state)) order.assignment.state = 'incident';
        makeDispute(order, userId, reason, ['goods', 'delivery'], []); return;
      }
      archiveAssignment(state, order, reason);
      if (order.payment.state === 'funded') {
        addLedger(order, { key: id('cancel'), type: 'refund', goodsPaise: order.payment.goodsPaise, deliveryPaise: order.payment.deliveryPaise, platformPaise: order.payment.platformPaise, sellerPaise: 0, partnerPaise: 0, buyerRefundPaise: order.payment.goodsPaise + order.payment.deliveryPaise + order.payment.platformPaise });
        order.payment.state = 'refunded';
      }
      order.status = 'cancelled'; event(order, 'cancelled', userId, reason);
    });
  }
  async cancelDelivery(userId: string, orderId: string, reason: string) {
    return this.change(userId, orderId, (state, order) => {
      only(userId, order.assignment?.partnerId); active(order);
      ensure(order.status !== 'disputed', 'dispute_already_open', 409);
      if (['picked_up', 'delivered'].includes(order.status)) { order.assignment!.state = 'incident'; makeDispute(order, userId, reason, ['delivery'], []); return; }
      if (['preparing', 'ready'].includes(order.status) && order.acceptedQuote?.perishable) { makeDispute(order, userId, reason, ['goods', 'delivery'], []); return; }
      refundDelivery(order, id('delivery_refund')); archiveAssignment(state, order, reason);
      order.status = 'awaiting_delivery_partner'; for (const offer of order.offers) offer.status = 'expired';
      event(order, 'delivery_cancelled_rematch', userId, reason);
    });
  }
  async dispute(userId: string, orderId: string, reason: string, components: ('goods' | 'delivery')[], evidence: string[],description='') {
    return this.change(userId, orderId, (state, order) => {
      ensure(participant(order, userId), 'forbidden', 403); active(order);
      for (const imageId of evidence) ensure(state.uploads.some(u => u.id === imageId && u.ownerId === userId && u.orderId === order.id && u.purpose==='evidence'), 'invalid_evidence');
      if(order.status==='delivered')ensure(Date.now()-Date.parse(order.assignment?.deliveredAt||order.updatedAt)<=configuredHours('DISPUTE_WINDOW_HOURS',48)*3600000,'dispute_window_closed',409);
      makeDispute(order, userId, reason, components, evidence);order.dispute!.description=description;order.dispute!.status='awaiting_response';
    });
  }
  async respondDispute(userId: string, orderId: string, text: string,evidence:string[]=[]) {
    return this.change(userId, orderId, (state, order) => {
      ensure(participant(order, userId), 'forbidden', 403); ensure(order.dispute&&['open','awaiting_response','under_review'].includes(order.dispute.status), 'dispute_not_open', 409);
      ensure(Date.parse(order.dispute.responseDeadline) > Date.now(), 'response_deadline_passed', 409);
      for(const id of evidence)ensure(state.uploads.some(u=>u.id===id&&u.ownerId===userId&&u.orderId===order.id&&u.purpose==='evidence'),'invalid_evidence');
      order.dispute.responses.push({ userId, text,evidence, at: nowIso() }); event(order, 'dispute_response', userId);
    });
  }
  async assignDispute(userId: string, orderId: string, resolverId: string) {
    return this.change(userId, orderId, (state, order, user) => {
      ensure(user.roles.includes('admin'), 'forbidden', 403); ensure(order.dispute&&['open','awaiting_response','under_review'].includes(order.dispute.status), 'dispute_not_open', 409);
      const resolver = actor(state, resolverId); ensure(isResolver(resolver) && !participant(order, resolverId), 'resolver_conflict', 403);
      order.dispute.resolverId = resolverId;order.dispute.status='under_review';state.infraAudit.push({id:id('audit'),actorId:userId,action:'dispute_assigned',resourceId:order.id,at:nowIso()}); event(order, 'resolver_assigned', userId);
    });
  }
  async resolveDispute(userId: string, orderId: string, sellerPaise: number, partnerPaise: number, rationale: string, key: string,outcome:'full_refund'|'full_release'|'partial_split'='partial_split') {
    return this.change(userId, orderId, (state, order, user) => {
      ensure(isResolver(user) && order.dispute?.resolverId === userId && !participant(order, userId), 'forbidden', 403);
      if (!checkKey(order, key, `resolve:${outcome}:${sellerPaise}:${partnerPaise}:${rationale}`)) return;
      ensure(['open','awaiting_response','under_review'].includes(order.dispute.status)&&!order.dispute.decision&&!state.settlementInstructions.some(x=>x.disputeId===order.dispute!.id)&&order.payment.state==='funded','already_settled',409);
      const respondents=[order.buyerId,order.sellerId,order.assignment?.partnerId].filter(x=>x&&x!==order.dispute!.openedBy);ensure(Date.parse(order.dispute.responseDeadline)<=Date.now()||respondents.every(id=>order.dispute!.responses.some(r=>r.userId===id)),'response_window_open',409);
      ensure(Number.isSafeInteger(sellerPaise)&&Number.isSafeInteger(partnerPaise)&&sellerPaise>=0&&partnerPaise>=0,'invalid_settlement');
      if(outcome==='full_refund')ensure(sellerPaise===0&&partnerPaise===0,'invalid_settlement');if(outcome==='full_release')ensure(sellerPaise===order.payment.goodsPaise&&partnerPaise===order.payment.deliveryPaise,'invalid_settlement');
      ensure(sellerPaise <= order.payment.goodsPaise && partnerPaise <= order.payment.deliveryPaise, 'invalid_settlement');
      if (!order.dispute.components.includes('delivery')) ensure(partnerPaise === order.payment.deliveryPaise, 'unaffected_delivery_protected');
      if (!order.dispute.components.includes('goods')) ensure(sellerPaise === order.payment.goodsPaise, 'unaffected_goods_protected');
      const buyerRefundPaise = order.payment.goodsPaise + order.payment.deliveryPaise + order.payment.platformPaise - sellerPaise - partnerPaise;
      const instructionId=id('settlement');order.dispute.decision={sellerPaise,partnerPaise,buyerRefundPaise,rationale,at:nowIso(),outcome,instructionId};order.dispute.status='decided';state.settlementInstructions.push({id:instructionId,orderId:order.id,disputeId:order.dispute.id,resolverId:userId,status:'pending_payment_execution',sellerPaise,partnerPaise,buyerRefundPaise,rationale,outcome,createdAt:nowIso()});state.infraAudit.push({id:id('audit'),actorId:userId,action:'dispute_decided',resourceId:order.id,reason:rationale,at:nowIso()});event(order,'dispute_decided',userId,rationale);
    });
  }
  async updateTrip(userId: string, tripId: string, input: unknown) {
    const data = tripSchema.parse(input);
    return this.store.transaction(state => {
      const user = marketplaceActor(state, userId);
      ensure(user.partnerStatus === 'approved', 'partner_not_approved', 403);
      const trip = state.trips.find(t => t.id === tripId);
      ensure(trip && trip.partnerId === userId, 'forbidden', 403);
      ensure(!tripHasConfirmedDelivery(state, tripId), 'trip_edit_locked', 409);
      ensure(Date.parse(trip.departureAt) > Date.now(), 'trip_departed', 409);
      ensure(Date.parse(data.departureAt) > Date.now() && Date.parse(data.arrivalAt) > Date.parse(data.departureAt), 'invalid_time_window');
      Object.assign(trip, data);
      // A changed route/time requires a new agreement, even for accepted fee offers.
      for (const order of state.orders) {
        let changed = false;
        for (const offer of order.offers) if (offer.tripId === tripId && ['proposed','countered','accepted_by_partner'].includes(offer.status)) {
          offer.status = 'expired'; changed = true;
        }
        if (changed) event(order, 'trip_updated', userId);
      }
      return {trip};
    });
  }
  async createTrip(userId: string, input: unknown) {
    const data = tripSchema.parse(input);
    return this.store.transaction(state => {
      const user = marketplaceActor(state, userId); ensure(user.partnerStatus === 'approved', 'partner_not_approved', 403);
      ensure(Date.parse(data.departureAt) > Date.now() && Date.parse(data.arrivalAt) > Date.parse(data.departureAt), 'invalid_time_window');
      const trip = { ...data, id: id('trip'), partnerId: userId, partnerName: user.name, reservedGrams: 0, reservedParcels: 0, available: true, createdAt: nowIso() };
      state.trips.push(trip); return { trip };
    });
  }
  async saveShop(userId: string, input: unknown, shopId?: string) {
    const data = shopSchema.parse(input);
    return this.store.transaction(state => {
      marketplaceActor(state, userId);
      for (const image of [data.image, ...data.gallery]) ensure(image.startsWith('/shops/') && /^\/shops\/[a-z-]+\.svg$/.test(image) || state.uploads.some(u => u.id === image && u.ownerId === userId && u.purpose === 'shop'), 'invalid_shop_image');
      if (shopId) {
        const shop = state.shops.find(s => s.id === shopId && s.sellerId === userId); ensure(shop, 'forbidden', 403);
        Object.assign(shop, data, { approved: false, updatedAt: nowIso() }); shop.searchTokens = shopTokens(shop);
        return { shop };
      }
      const slug = data.name.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + randomUUID().slice(0, 6);
      const shop = { ...data, id: id('shop'), slug, sellerId: userId, approved: false, searchTokens: [] as string[], createdAt: nowIso(), updatedAt: nowIso() };
      shop.searchTokens = shopTokens(shop); state.shops.push(shop); return { shop };
    });
  }
}
