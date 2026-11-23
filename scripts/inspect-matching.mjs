// Read-only matching diagnostics. Never prints credentials, names, or street addresses.
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {matchTrip,distanceKm,matchingQuote,findMatchReport} from '../backend/src/domain/matching.ts';
import {prepareMatchingRefresh} from '../backend/src/domain/matching-locations.ts';
import {emptyState,LocalStore} from '../backend/src/data/store.ts';
dotenv.config({path:resolve('backend/.env'),quiet:true});
const fingerprint=JSON.stringify;
const now=Date.now(),mins=value=>value?Math.round((Date.parse(value)-now)/60000):null;
function projection(point,route){let best={distance:Infinity,progress:0},total=0;for(let i=0;i<route.length-1;i++){const a=route[i],b=route[i+1],scale=Math.cos(point.lat*Math.PI/180),dx=(b.lng-a.lng)*scale,dy=b.lat-a.lat,denom=dx*dx+dy*dy,t=denom===0?0:Math.max(0,Math.min(1,((point.lng-a.lng)*scale*dx+(point.lat-a.lat)*dy)/denom)),distance=distanceKm(point,{lat:a.lat+t*(b.lat-a.lat),lng:a.lng+t*(b.lng-a.lng)}),length=distanceKm(a,b);if(distance<best.distance)best={distance,progress:total+t*length};total+=length;}return {...best,total};}
try{
 let state;
 if(process.env.DATABASE_ADAPTER==='mongo'){
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000,autoIndex:false});
  const db=mongoose.connection.db;
  const [orders,trips,users,shops]=await Promise.all([
   db.collection('sheharmitra_orders').find(process.argv.includes('--all-orders')?{}:{status:'awaiting_delivery_partner'},{projection:{_id:0,id:1,shopId:1,buyerId:1,sellerId:1,status:1,destination:1,acceptedQuote:1,matchingPickup:1}}).limit(30).toArray(),
   db.collection('sheharmitra_trips').find({},{projection:{_id:0}}).limit(50).toArray(),
   db.collection('sheharmitra_users').find({},{projection:{_id:0,id:1,roles:1,banned:1,partnerStatus:1}}).limit(100).toArray(),
   db.collection('sheharmitra_shops').find({},{projection:{_id:0,id:1,address:1,addressDetails:1}}).limit(100).toArray()
  ]);state={...emptyState(),orders,trips,users,shops};
 }else state=JSON.parse(await readFile(resolve('backend',process.env.DATA_FILE||'./.data/sheharmitra.json'),'utf8'));
 console.log(JSON.stringify({geocodingProvider:process.env.GEOCODING_PROVIDER||'disabled',geocodingKeyPresent:!!process.env.GEOAPIFY_API_KEY,proximity:process.env.MATCH_PROXIMITY_KM||3,timeWindow:process.env.MATCH_TIME_WINDOW_MINUTES||15,waitingOrders:state.orders.filter(o=>o.status==='awaiting_delivery_partner').length,trips:state.trips.length}));
 if(process.argv.includes('--all-orders'))console.log(JSON.stringify({orders:state.orders.map(o=>({status:o.status,city:o.destination?.addressDetails?.city||o.destination?.village,locationResolution:o.destination?.locationResolution,accepted:!!o.acceptedQuote}))}));
 for(const [index,o] of state.orders.filter(o=>o.status==='awaiting_delivery_partner').entries()){
  if(process.argv.includes('--repair-preview')){const original=fingerprint(o.acceptedQuote),before=findMatchReport(state,o);const plan=await prepareMatchingRefresh(new LocalStore(state),state,o.id);plan.apply(state);const after=findMatchReport(state,o);console.log(JSON.stringify({repairPreview:{order:index+1,beforeMatches:before.matches.length,afterMatches:after.matches.length,reasons:after.reasons,approximate:after.matches.some(m=>m.approximateLocation),quoteUnchanged:fingerprint(o.acceptedQuote)===original,databaseWrites:false}}));}
  const q=matchingQuote(o);
  console.log(JSON.stringify({order:index+1,destinationCity:o.destination?.addressDetails?.city||o.destination?.village,quoteAccepted:!!q,pickupPresent:!!q?.pickup,destinationCoordinates:Number.isFinite(o.destination?.lat)&&Number.isFinite(o.destination?.lng),readyInMinutes:mins(q?.readyAt),pickupDeadlineInMinutes:mins(q?.pickupBy),deliveryDeadlineInMinutes:mins(q?.deliveryBy),perishable:q?.perishable,category:q?.category}));
  for(const [i,t] of state.trips.entries()){
   const u=state.users.find(u=>u.id===t.partnerId);
   if(process.argv.includes('--geocoding')&&Date.parse(t.departureAt)>now&&o.destination?.addressDetails&&t.destinationAddress){
    for(const [label,address] of [['order',o.destination.addressDetails],['trip',t.destinationAddress]]){
     const url=new URL('https://api.geoapify.com/v1/geocode/search');url.searchParams.set('apiKey',process.env.GEOAPIFY_API_KEY);url.searchParams.set('format','json');url.searchParams.set('limit','1');url.searchParams.set('filter','countrycode:in');url.searchParams.set('text',[address.line1,address.line2,address.locality,address.city,address.state,address.pincode].filter(Boolean).join(', '));
     const response=await fetch(url,{signal:AbortSignal.timeout(8000)}),data=await response.json(),r=data.results?.[0];
     console.log(JSON.stringify({geocoding:label,inputCity:address.city,inputPincode:address.pincode,inputState:address.state,httpStatus:response.status,result:r?{city:r.city,town:r.town,village:r.village,county:r.county,state:r.state,postcode:r.postcode,resultType:r.result_type,rank:r.rank,distanceFromSavedKm:distanceKm({lat:r.lat,lng:r.lon},label==='order'?o.destination:t.route.at(-1))}:null}));
    }
   }
   if(q?.pickup&&Number.isFinite(o.destination?.lat)&&t.route?.length>=2&&Date.parse(t.departureAt)>now){const p=projection(q.pickup,t.route),d=projection(o.destination,t.route),travel=Date.parse(t.arrivalAt)-Date.parse(t.departureAt),pickup=Date.parse(t.departureAt)+travel*p.progress/p.total,drop=Date.parse(t.departureAt)+travel*d.progress/p.total;console.log(JSON.stringify({geometry:{pickupDistanceKm:p.distance,dropDistanceKm:d.distance,pickupProgressKm:p.progress,dropProgressKm:d.progress,routeLengthKm:p.total,pickupFromOriginKm:distanceKm(q.pickup,t.route[0]),dropFromDestinationKm:distanceKm(o.destination,t.route.at(-1)),estimatedPickupInMinutes:Math.round((pickup-now)/60000),estimatedDropInMinutes:Math.round((drop-now)/60000)}}));}
   console.log(JSON.stringify({trip:i+1,origin:t.origin,destination:t.destination,available:t.available,routePoints:t.route?.length||0,verified:t.locationVerified,departureInMinutes:mins(t.departureAt),arrivalInMinutes:mins(t.arrivalAt),partnerApproved:u?.partnerStatus==='approved',restricted:!u||!!u.banned||u.roles?.some(r=>['admin','resolver','dispute_resolver'].includes(r)),selfDelivery:t.partnerId===o.buyerId||t.partnerId===o.sellerId,categorySupported:t.categories?.includes(q?.category),matched:!!(q&&matchTrip(t,q,o.destination,now))}));
  }
 }
}catch(e){console.error(JSON.stringify({diagnosticFailed:true,name:e.name,code:e.code||'connection_or_read_failed'}));process.exitCode=1;}finally{await mongoose.disconnect();}
