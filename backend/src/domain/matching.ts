import type { Order, Point, Quote, State, Trip } from './types.js';
import type { Address } from '../location.js';

const areaText=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu,' ').trim();
// PINs cover several villages. Require the named area too, never a PIN alone.
export function sameDeliveryArea(a?:Address,b?:Address):boolean {
  if(!a||!b||!a.pincode||a.pincode!==b.pincode||areaText(a.state)!==areaText(b.state))return false;
  const ac=areaText(a.city),bc=areaText(b.city),al=areaText(a.locality),bl=areaText(b.locality);
  if(!ac||!bc||!al||!bl)return false;
  if(ac===bc)return al===bl;
  // A village can be entered as city/village or locality under its nearby town.
  return ac===bl||bc===al;
}

const radians = (degrees: number) => degrees * Math.PI / 180;
export function distanceKm(a: Point, b: Point): number {
  const x = radians(b.lng - a.lng) * Math.cos(radians((a.lat + b.lat) / 2));
  const y = radians(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * 6371;
}
function nearestProjection(point: Point, route: Point[]) {
  let best = { distance: Infinity, progress: 0 };
  let traversed = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const scale = Math.cos(radians(point.lat));
    const dx = (b.lng - a.lng) * scale, dy = b.lat - a.lat;
    const denom = dx * dx + dy * dy;
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, (((point.lng - a.lng) * scale) * dx + (point.lat - a.lat) * dy) / denom));
    const projected = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    const distance = distanceKm(point, projected);
    const length = distanceKm(a, b);
    if (distance < best.distance) best = { distance, progress: traversed + t * length };
    traversed += length;
  }
  return { ...best, routeLength: traversed };
}
export type Match = { trip: Trip; extraKm: number|null; estimate: true; reason: 'fits_pickup_route'|'fits_address_route'; approximateLocation?: boolean; pickupAt: string; dropoffAt: string };
function evaluateCoordinateTrip(trip: Trip, quote: Quote, destination: Partial<Point>, now = Date.now()): {match:Match|null;reason?:string} {
  const reject=(reason:string)=>({match:null,reason});
  if (!quote.pickup || !Number.isFinite(quote.pickup.lat)||!Number.isFinite(quote.pickup.lng))return reject('match_shop_location');
  if(!Number.isFinite(destination.lat)||!Number.isFinite(destination.lng))return reject('match_delivery_location');
  if(!trip.available||Date.parse(trip.departureAt)<=now)return reject('match_no_upcoming');
  if(trip.route.length<2||trip.route.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lng)))return reject('match_trip_location');
  if([trip.departureAt,trip.arrivalAt,quote.readyAt,quote.pickupBy,quote.deliveryBy].some(t=>!Number.isFinite(Date.parse(t))))return reject('match_invalid_schedule');
  // Space and parcel size are agreed with the partner before accepting an offer.
  if (!trip.categories.includes(quote.category)) return reject('match_category');
  const pickup = nearestProjection(quote.pickup, trip.route), drop = nearestProjection(destination as Point, trip.route);
  if (pickup.progress >= drop.progress) return reject('match_direction');
  const extraKm = 2 * (pickup.distance + drop.distance);
  const proximity=Number(process.env.MATCH_PROXIMITY_KM||3);if(!Number.isFinite(proximity)||proximity<=0||proximity>50)return reject('match_configuration');
  if(pickup.distance>proximity||drop.distance>proximity||pickup.routeLength<=0)return reject('match_route_proximity');
  const travelMs = Date.parse(trip.arrivalAt) - Date.parse(trip.departureAt);
  const pickupAt = Date.parse(trip.departureAt) + travelMs * pickup.progress / pickup.routeLength;
  const dropoffAt = Date.parse(trip.departureAt) + travelMs * drop.progress / drop.routeLength;
  const flexMs = Number(process.env.MATCH_TIME_WINDOW_MINUTES||15) * 60000;if(!Number.isFinite(flexMs)||flexMs<0||flexMs>120*60000)return reject('match_configuration');
  if(pickupAt+flexMs<Date.parse(quote.readyAt)||pickupAt-flexMs>Date.parse(quote.pickupBy))return reject('match_pickup_window');
  if(dropoffAt>Date.parse(quote.deliveryBy))return reject('match_delivery_window');
  if (quote.perishable && Date.parse(quote.readyAt) - now < quote.preparationMinutes * 60000) return reject('match_preparation');
  return {match:{ trip, extraKm: Math.round(extraKm * 10) / 10, estimate: true, reason: 'fits_pickup_route', pickupAt: new Date(Math.max(pickupAt, Date.parse(quote.readyAt))).toISOString(), dropoffAt: new Date(dropoffAt).toISOString() }};
}
function evaluateTrip(trip:Trip,quote:Quote,destination:Partial<Point>&{addressDetails?:Address},now=Date.now()):{match:Match|null;reason?:string}{
 const geographic=evaluateCoordinateTrip(trip,quote,destination,now);
 if(geographic.match||!['match_shop_location','match_delivery_location','match_trip_location','match_direction','match_route_proximity'].includes(geographic.reason||''))return geographic;
 if(!sameDeliveryArea(quote.pickupAddressDetails,trip.originAddress)||!sameDeliveryArea(destination.addressDetails,trip.destinationAddress)||sameDeliveryArea(trip.originAddress,trip.destinationAddress))return geographic;
 const reject=(reason:string)=>({match:null,reason});
 if(!trip.available||Date.parse(trip.departureAt)<=now)return reject('match_no_upcoming');
 if([trip.departureAt,trip.arrivalAt,quote.readyAt,quote.pickupBy,quote.deliveryBy].some(t=>!Number.isFinite(Date.parse(t)))||Date.parse(trip.arrivalAt)<=Date.parse(trip.departureAt))return reject('match_invalid_schedule');
 if(!trip.categories.includes(quote.category))return reject('match_category');
 const pickupAt=Date.parse(trip.departureAt),dropoffAt=Date.parse(trip.arrivalAt);
 const flexMs=Number(process.env.MATCH_TIME_WINDOW_MINUTES||15)*60000;
 if(!Number.isFinite(flexMs)||flexMs<0||flexMs>120*60000)return reject('match_configuration');
 if(pickupAt+flexMs<Date.parse(quote.readyAt)||pickupAt-flexMs>Date.parse(quote.pickupBy))return reject('match_pickup_window');
 if(dropoffAt>Date.parse(quote.deliveryBy))return reject('match_delivery_window');
 if(Math.max(pickupAt,Date.parse(quote.readyAt))>=dropoffAt)return reject('match_pickup_window');
 if(quote.perishable&&Date.parse(quote.readyAt)-now<quote.preparationMinutes*60000)return reject('match_preparation');
 return {match:{trip,extraKm:null,estimate:true,reason:'fits_address_route',approximateLocation:true,pickupAt:new Date(Math.max(pickupAt,Date.parse(quote.readyAt))).toISOString(),dropoffAt:trip.arrivalAt}};
}
export function matchTrip(trip:Trip,quote:Quote,destination:Partial<Point>&{addressDetails?:Address},now=Date.now()):Match|null{return evaluateTrip(trip,quote,destination,now).match;}
export function matchingQuote(order:Order):Quote|undefined{
 const quote=order.acceptedQuote;if(!quote)return;
 const corrected=order.matchingPickup;
 return corrected?.quoteVersion===quote.version?{...quote,pickup:corrected.coordinates,pickupResolution:corrected.resolution}:quote;
}
export function findMatchReport(state:State,order:Order,now=Date.now()){
 let quote=matchingQuote(order);
 if(!quote)return {matches:[] as Match[],reasons:['match_accept_quote']};
 // Older quotes can reuse the shop address only while its text still matches.
 const shop=state.shops.find(s=>s.id===order.shopId);
 if(!quote.pickupAddressDetails&&shop?.address===quote.pickupAddress)quote={...quote,pickupAddressDetails:shop.addressDetails};
 if(Date.parse(quote.deliveryBy)<=now)return {matches:[] as Match[],reasons:['match_window_expired']};
 const candidates=state.trips.filter(t=>t.available&&Date.parse(t.departureAt)>now&&t.partnerId!==order.buyerId&&t.partnerId!==order.sellerId&&state.users.some(u=>u.id===t.partnerId&&!u.banned&&!u.roles.some(r=>['admin','resolver','dispute_resolver'].includes(r))&&u.partnerStatus==='approved'));
 const evaluated=candidates.map(t=>evaluateTrip(t,quote!,order.destination,now));
 const matches=evaluated.flatMap(r=>r.match?[{...r.match,approximateLocation:r.match.approximateLocation||[quote!.pickupResolution,order.destination.locationResolution,r.match.trip.originResolution,r.match.trip.destinationResolution].some(r=>r?.accuracy==='city')}]:[]).sort((a,b)=>(a.extraKm??Number.MAX_VALUE)-(b.extraKm??Number.MAX_VALUE));
 return {matches,reasons:matches.length?[]:candidates.length?[...new Set(evaluated.map(r=>r.reason).filter((r):r is string=>!!r))]:['match_no_upcoming']};
}
export function findMatches(state:State,order:Order,now=Date.now()):Match[]{return findMatchReport(state,order,now).matches;}
