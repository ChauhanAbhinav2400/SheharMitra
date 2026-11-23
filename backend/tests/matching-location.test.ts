import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalStore} from '../src/data/store.js';
import {seedState} from '../src/data/seed.js';
import {addressText,resolveAddress} from '../src/location.js';
import {prepareMatchingRefresh} from '../src/domain/matching-locations.js';
import {findMatchReport,findMatches} from '../src/domain/matching.js';
import {CommerceService,publicOrder} from '../src/domain/service.js';
const nagina={lat:29.45,lng:78.43},raipur={lat:29.55,lng:78.44},wrongTown={lat:29.6,lng:78.45},postcode={lat:29.55,lng:78.55};
const address=(city:string,line1:string)=>({city,line1,pincode:'246763',state:'Uttar Pradesh',locality:'Market',line2:''});
function provider(){
 const original={fetch:globalThis.fetch,provider:process.env.GEOCODING_PROVIDER,key:process.env.GEOAPIFY_API_KEY};
 process.env.GEOCODING_PROVIDER='geoapify';process.env.GEOAPIFY_API_KEY='synthetic-test-only';
 let calls=0,rejectCity=false;
 globalThis.fetch=async input=>{
  calls++;const url=new URL(String(input));let result:any;
  if(url.searchParams.has('city')){
   const city=url.searchParams.get('city')!,p=city.toLowerCase()==='nagina'?nagina:raipur;
   result={...p,lon:p.lng,city:rejectCity?'Unrelated town':city,result_type:'city',rank:{confidence:1,confidence_city_level:1}};
  }else if(url.searchParams.get('text')?.includes('Buyer'))result={...postcode,lon:postcode.lng,result_type:'postcode',rank:{confidence:.25}};
  else if(url.searchParams.get('text')?.toLowerCase().includes('raipur'))result={...wrongTown,lon:wrongTown.lng,city:'Islampur Sadat',result_type:'city',rank:{confidence:.07,confidence_city_level:.9}};
  else result={...nagina,lon:nagina.lng,city:'Nagina',result_type:'city',rank:{confidence:.25,confidence_city_level:1}};
  return new Response(JSON.stringify({results:[{...result,country_code:'in',state:'Uttar Pradesh'}]}));
 };
 return {calls:()=>calls,reject:()=>{rejectCity=true;},restore:()=>{globalThis.fetch=original.fetch;for(const [key,value] of [['GEOCODING_PROVIDER',original.provider],['GEOAPIFY_API_KEY',original.key]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}}};
}
test('wrong-town and postcode hits fall back to the exact town; unmatched towns are not verified; device pins survive',async()=>{
 const mock=provider(),db=new LocalStore(await seedState());
 try{
  const corrected=await resolveAddress(db,'geocode-test',address('Raipur Sadat','Partner test lane'));
  assert.deepEqual(corrected.coordinates,raipur);assert.equal(corrected.locationResolution?.accuracy,'city');assert.equal(corrected.locationVerified,true);
  const a=address('Raipur Sadat','Existing GPS lane'),gps={lat:29.552,lng:78.445};
  const retained=await resolveAddress(db,'legacy-test',a,undefined,{addressDetails:a,coordinates:gps});assert.deepEqual(retained.coordinates,gps);assert.equal(retained.locationResolution?.source,'legacy');
  const before=mock.calls();const trusted=await resolveAddress(db,'device-test',a,undefined,{addressDetails:a,coordinates:gps,locationResolution:{version:2,source:'device',accuracy:'point'}});assert.deepEqual(trusted.coordinates,gps);assert.equal(mock.calls(),before);
  mock.reject();const invalid=await resolveAddress(db,'unmapped-test',address('Unknown village','Buyer unknown lane'));assert.equal(invalid.coordinates,null);assert.equal(invalid.locationVerified,false);
 }finally{mock.restore();}
});
test('legacy Nagina to Raipur Sadat locations repair without changing quotes and can reserve delivery',async()=>{
 const mock=provider(),state=await seedState();
 try{
  const order=state.orders[0],trip=state.trips[0],shop=state.shops.find(s=>s.id===order.shopId)!;
  state.trips=[trip];trip.origin='Nagina';trip.destination='Raipur Sadat';trip.originAddress=address('Nagina','Origin matching lane');trip.destinationAddress=address('Raipur Sadat','Partner matching lane');trip.route=[nagina,wrongTown];
  shop.addressDetails=address('Nagina','Shop matching lane');shop.address=addressText(shop.addressDetails);
  order.status='awaiting_delivery_partner';order.acceptedQuote=structuredClone(order.quotes[0]);order.acceptedQuote.pickup=nagina;order.acceptedQuote.pickupAddress=shop.address;
  order.destination={...postcode,village:'Raipur sadat',address:'Buyer matching address',addressDetails:address('Raipur sadat','Buyer matching lane'),locationVerified:true};
  const original=structuredClone(order.acceptedQuote),history=structuredClone(order.quotes);
  assert.equal(findMatches(state,order).length,0);assert.deepEqual(findMatchReport(state,order).reasons,['match_route_proximity']);
  const plan=await prepareMatchingRefresh(new LocalStore(state),state,order.id);assert.equal(plan.apply(state),true);
  assert.equal(findMatches(state,order).length,1);assert.equal(findMatches(state,order)[0].approximateLocation,true);
  assert.deepEqual(order.acceptedQuote,original);assert.deepEqual(order.quotes,history);
  assert.equal(publicOrder(state,order,order.buyerId).matchingPickup,undefined);
  const db=new LocalStore(state),svc=new CommerceService(db,{secret:'synthetic-test-only-secret-long-enough',platformFeePaise:0,maxValuePaise:500000,maxWeightGrams:20000});
  const proposed=await svc.offer(order.buyerId,order.id,trip.id,5000),offer=proposed.order.offers.at(-1);
  await svc.respondOffer(trip.partnerId,order.id,offer.id,true);const confirmed=await svc.confirmOffer(order.buyerId,order.id,offer.id,'repaired-location-confirm');assert.equal(confirmed.order.status,'delivery_reserved');
  // A refresh prepared before a concurrent address/trip edit must not overwrite it.
  const concurrent=await seedState();const target=concurrent.orders[0];target.status='awaiting_delivery_partner';target.acceptedQuote=structuredClone(original);target.destination={...order.destination,locationResolution:undefined};concurrent.shops.find(s=>s.id===target.shopId)!.addressDetails=shop.addressDetails;concurrent.shops.find(s=>s.id===target.shopId)!.address=shop.address;
  const guarded=await prepareMatchingRefresh(new LocalStore(concurrent),concurrent,target.id);target.destination.addressDetails=address('Different town','Edited lane');guarded.apply(concurrent);assert.equal(target.destination.addressDetails.city,'Different town');assert.equal(target.matchingPickup,undefined);
 }finally{mock.restore();}
});
