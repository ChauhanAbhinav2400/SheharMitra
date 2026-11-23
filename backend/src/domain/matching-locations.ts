import type {State,Store,Point} from './types.js';
import {resolveAddress} from '../location.js';
import {geocodingEnabled} from '../geocoding.js';
import {ensure} from './errors.js';
const fingerprint=(value:unknown)=>JSON.stringify(value);
const coordinates=(p:Partial<Point>)=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)?{lat:p.lat!,lng:p.lng!}:undefined;
const orderKey=(o:State['orders'][number])=>fingerprint([o.status,o.destination,o.acceptedQuote,o.matchingPickup]);
const tripKey=(t:State['trips'][number])=>fingerprint([t.partnerId,t.route,t.originAddress,t.destinationAddress,t.originResolution,t.destinationResolution,t.departureAt,t.arrivalAt]);

// Resolve outside the database transaction, then apply only to unchanged addresses.
// Immutable quote versions and buyer/seller commercial agreements are preserved.
export async function prepareMatchingRefresh(store:Store,state:State,orderId:string){
 const order=state.orders.find(o=>o.id===orderId),patches:((s:State)=>boolean)[]=[];
 if(!order?.acceptedQuote||order.status!=='awaiting_delivery_partner')return {apply:()=>false};
 const before=orderKey(order),destination=order.destination,q=order.acceptedQuote;
 const nextDestination=destination.addressDetails?await resolveAddress(store,order.buyerId,destination.addressDetails,undefined,{addressDetails:destination.addressDetails,coordinates:coordinates(destination),locationResolution:destination.locationResolution}):undefined;
 const shop=state.shops.find(s=>s.id===order.shopId);
 const address=q.pickupAddressDetails||(shop?.address===q.pickupAddress?shop.addressDetails:undefined);
 const oldPickup=order.matchingPickup?.quoteVersion===q.version?order.matchingPickup:undefined;
 const pickup=address?await resolveAddress(store,order.sellerId,address,undefined,{addressDetails:address,coordinates:oldPickup?oldPickup.coordinates:q.pickup,locationResolution:oldPickup?oldPickup.resolution:q.pickupResolution}):undefined;
 const newDestination=nextDestination?{...destination,lat:nextDestination.coordinates?.lat,lng:nextDestination.coordinates?.lng,locationVerified:nextDestination.locationVerified,locationResolution:nextDestination.locationResolution}:destination;
 const newPickup=pickup?{quoteVersion:q.version,coordinates:pickup.coordinates,resolution:pickup.locationResolution}:order.matchingPickup;
 if(fingerprint(newDestination)!==fingerprint(destination)||fingerprint(newPickup)!==fingerprint(order.matchingPickup))patches.push(s=>{
  const current=s.orders.find(o=>o.id===orderId);if(!current||orderKey(current)!==before)return false;
  current.destination=newDestination;current.matchingPickup=newPickup;return true;
 });
 const eligible=state.trips.filter(t=>t.available&&Date.parse(t.departureAt)>Date.now()&&t.categories.includes(q.category)&&t.partnerId!==order.buyerId&&t.partnerId!==order.sellerId&&state.users.some(u=>u.id===t.partnerId&&!u.banned&&u.partnerStatus==='approved'&&!u.roles.some(r=>['admin','resolver','dispute_resolver'].includes(r))));
 for(const trip of eligible){
  if(!trip.originAddress||!trip.destinationAddress||(trip.originResolution&&trip.destinationResolution))continue;
  const beforeTrip=tripKey(trip);
  const a=await resolveAddress(store,trip.partnerId,trip.originAddress,undefined,{addressDetails:trip.originAddress,coordinates:trip.route[0],locationResolution:trip.originResolution});
  const b=await resolveAddress(store,trip.partnerId,trip.destinationAddress,undefined,{addressDetails:trip.destinationAddress,coordinates:trip.route.at(-1),locationResolution:trip.destinationResolution});
  const next={...trip,route:a.coordinates&&b.coordinates?[a.coordinates,b.coordinates]:[],originResolution:a.locationResolution,destinationResolution:b.locationResolution,locationVerified:!!(a.coordinates&&b.coordinates)};
  if(tripKey(next)===beforeTrip&&trip.locationVerified===next.locationVerified)continue;
  patches.push(s=>{const current=s.trips.find(t=>t.id===trip.id);if(!current||tripKey(current)!==beforeTrip)return false;Object.assign(current,{route:next.route,originResolution:next.originResolution,destinationResolution:next.destinationResolution,locationVerified:next.locationVerified});return true;});
 }
 return {apply:(s:State)=>{let changed=false;for(const patch of patches)changed=patch(s)||changed;return changed;},hasChanges:patches.length>0};
}
export async function refreshMatchingLocations(store:Store,orderId:string,userId:string){
 if(!geocodingEnabled())return;
 const state=await store.read(s=>s,['orders','trips','shops','users']);
 const order=state.orders.find(o=>o.id===orderId);ensure(order,'order_not_found',404);
 ensure(order.buyerId===userId||order.sellerId===userId,'forbidden',403);
 const plan=await prepareMatchingRefresh(store,state,orderId);
 if(plan.hasChanges)await store.transaction(s=>plan.apply(s),['orders','trips']);
}
