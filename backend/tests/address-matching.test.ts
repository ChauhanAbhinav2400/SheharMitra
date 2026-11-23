import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../src/data/seed.js';
import {LocalStore} from '../src/data/store.js';
import {findMatches,sameDeliveryArea} from '../src/domain/matching.js';
import {CommerceService} from '../src/domain/service.js';

const area=(city:string,locality:string)=>({pincode:'246762',state:'Uttar Pradesh',city,locality,line1:'Address agreed by phone',line2:''});
async function fixture(){
 const state=await seedState(),order=state.orders[0],trip=state.trips[0];
 order.status='awaiting_delivery_partner';order.acceptedQuote=structuredClone(order.quotes[0]);
 order.acceptedQuote.pickup=undefined;order.acceptedQuote.pickupAddressDetails=area('Nagina','Main market');
 order.destination={village:'Harganpur',address:'Buyer lane',addressDetails:area('Nagina','Harganpur')};
 trip.route=[];trip.originAddress=area('Nagina','Main market');trip.destinationAddress=area('Nagina','  HARGANPUR  ');
 const now=Date.now();trip.departureAt=new Date(now+3600000).toISOString();trip.arrivalAt=new Date(now+7200000).toISOString();
 order.acceptedQuote.readyAt=new Date(now+1800000).toISOString();order.acceptedQuote.pickupBy=new Date(now+5400000).toISOString();order.acceptedQuote.deliveryBy=new Date(now+10800000).toISOString();
 state.trips=[trip];return {state,order,trip};
}
test('unmapped village and PIN matches work through offer and confirmation without coordinates',async()=>{
 const {state,order,trip}=await fixture();
 const matches=findMatches(state,order);assert.equal(matches.length,1);assert.equal(matches[0].reason,'fits_address_route');assert.equal(matches[0].extraKm,null);assert.equal(matches[0].approximateLocation,true);
 const svc=new CommerceService(new LocalStore(state),{secret:'synthetic-test-secret-only-123456',platformFeePaise:0,maxValuePaise:500000,maxWeightGrams:20000});
 const proposed=await svc.offer(order.buyerId,order.id,trip.id,5000);const offer=proposed.order.offers.at(-1);
 await svc.respondOffer(trip.partnerId,order.id,offer.id,true);
 const confirmed=await svc.confirmOffer(order.buyerId,order.id,offer.id,'address-match-reservation');assert.equal(confirmed.order.status,'delivery_reserved');
});
test('same PIN does not match a different village, reversed trip, different state, or category',async()=>{
 for(const change of [
  (t:any)=>{t.destinationAddress.locality='Another village';},
  (t:any)=>{t.destinationAddress.pincode='246763';},
  (t:any)=>{t.destinationAddress.state='Uttarakhand';},
  (t:any)=>{[t.originAddress,t.destinationAddress]=[t.destinationAddress,t.originAddress];},
  (t:any)=>{t.categories=[];},
  (t:any)=>{t.departureAt=new Date(Date.now()-60000).toISOString();},
  (t:any)=>{t.arrivalAt=new Date(Date.now()+86400000).toISOString();},
  (t:any)=>{t.partnerId='buyer';},
 ]){const {state,order,trip}=await fixture();change(trip);assert.equal(findMatches(state,order).length,0);}
 const {state,order,trip}=await fixture();state.users.find(u=>u.id===trip.partnerId)!.partnerStatus='pending';assert.equal(findMatches(state,order).length,0);
});
test('area names are not limited to seeded villages and village/city field placement can differ',()=>{
 assert.equal(sameDeliveryArea(area('Nagina','Harganpur'),area('Harganpur','Harganpur')),true);
 assert.equal(sameDeliveryArea(area('Nagina','A new village'),area('Nagina','A NEW VILLAGE')),true);
 assert.equal(sameDeliveryArea(area('Nagina','Market'),area('Another town','Market')),false);
});
