import {createHash} from 'node:crypto';
import type {Address} from './location.js';
import type {Point} from './domain/types.js';
export type LocationResolution={version:2;source:'device'|'geocoder'|'legacy';accuracy:'point'|'street'|'city'};
type Result={coordinates:Point|null;address?:Address;resolution?:LocationResolution;legacyCoordinates?:Point;checked:boolean};
const memory=new Map<string,{expires:number;value:Result}>(),pending=new Map<string,Promise<Result>>();
const budgets=new Map<string,{count:number;reset:number}>();
const normalize=(s:string)=>s.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
const valid=(r:any)=>r?.country_code==='in'&&Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&Math.abs(r.lat)<=90&&Math.abs(r.lon)<=180;
const point=(r:any):Point=>({lat:r.lat,lng:r.lon});
const sameCity=(r:any,a:Address)=>[r.city,r.town,r.village].some(v=>typeof v==='string'&&normalize(v)===normalize(a.city))&&typeof r.state==='string'&&normalize(r.state)===normalize(a.state);
export function geocodingEnabled(){return process.env.GEOCODING_PROVIDER==='geoapify'&&!!process.env.GEOAPIFY_API_KEY;}
export async function geocode(query:{address?:Address;point?:Point},userId:string):Promise<Result>{
 if(!geocodingEnabled())return {coordinates:null,checked:false};
 const key=createHash('sha256').update(JSON.stringify(query)).digest('hex'),cached=memory.get(key);
 if(cached&&cached.expires>Date.now())return cached.value;
 if(pending.has(key))return pending.get(key)!;
 const request=async(params:Record<string,string>)=>{
  const b=budgets.get(userId);if(b&&b.reset>Date.now()){if(b.count>=12)throw Error('geocoding_budget');b.count++;}else{if(budgets.size>=1000)budgets.clear();budgets.set(userId,{count:1,reset:Date.now()+60000});}
  const url=new URL(`https://api.geoapify.com/v1/geocode/${query.point?'reverse':'search'}`);
  for(const [k,v] of Object.entries({...params,apiKey:process.env.GEOAPIFY_API_KEY!,format:'json'}))url.searchParams.set(k,v);
  const response=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('geocoding_unavailable');return (await response.json() as any).results||[];
 };
 const work=(async():Promise<Result>=>{
  try{
   if(query.point){const [r]=await request({lat:String(query.point.lat),lon:String(query.point.lng),limit:'1'});if(!valid(r))return {coordinates:null,checked:true};return {coordinates:query.point,checked:true,address:{pincode:r.postcode||'',state:r.state||'',city:r.city||r.town||r.village||r.county||'',locality:r.suburb||r.district||r.neighbourhood||r.city||'',line1:[r.housenumber,r.street].filter(Boolean).join(' ')||r.address_line1||'',line2:''}};}
   const a=query.address!;
   const rows=await request({text:[a.line1,a.line2,a.locality,a.city,a.state,a.pincode].filter(Boolean).join(', '),filter:'countrycode:in',limit:'1'});
   const legacyCoordinates=valid(rows[0])?point(rows[0]):undefined;
   const precise=rows.find((r:any)=>valid(r)&&sameCity(r,a)&&['building','street','amenity'].includes(r.result_type)&&r.rank?.confidence>=0.8&&(!r.postcode||r.postcode===a.pincode));
   if(precise)return {coordinates:point(precise),legacyCoordinates,checked:true,resolution:{version:2,source:'geocoder',accuracy:precise.result_type==='street'?'street':'point'}};
   // Postcode centroids and similarly named towns are not delivery locations.
   // An exact city/state fallback is an explicit area estimate, not a doorstep fix.
   const cities=(await request({city:a.city,state:a.state,country:'India',type:'city',filter:'countrycode:in',limit:'5'})).filter((r:any)=>valid(r)&&sameCity(r,a)&&r.result_type==='city'&&r.rank?.confidence_city_level>=0.9);
   const unique=[...new Map(cities.map((r:any)=>[`${r.lat}:${r.lon}`,r])).values()] as any[];
   const postal=unique.filter(r=>r.postcode===a.pincode);
   const chosen=unique.length===1?unique[0]:postal.length===1?postal[0]:undefined;
   return {coordinates:chosen?point(chosen):null,legacyCoordinates,checked:true,...(chosen?{resolution:{version:2 as const,source:'geocoder' as const,accuracy:'city' as const}}:{})};
  }catch{return {coordinates:null,checked:false};}
 })().then(value=>{
  if(value.checked){if(memory.size>=500)memory.delete(memory.keys().next().value!);memory.set(key,{expires:Date.now()+(value.coordinates?3600000:60000),value});}
  return value;
 }).finally(()=>pending.delete(key));
 pending.set(key,work);return work;
}
