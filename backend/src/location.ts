import {Router} from 'express';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import type {Store,Point} from './domain/types.js';
import {requireAuth} from './auth.js';
import {ensure} from './errors.js';
import {geocode,type LocationResolution} from './geocoding.js';
export const locationResolutionSchema=z.object({version:z.literal(2),source:z.enum(['device','geocoder','legacy']),accuracy:z.enum(['point','street','city'])});

export const addressSchema=z.object({pincode:z.string().regex(/^[1-9]\d{5}$/,'invalid_pincode'),state:z.string().trim().min(2).max(80),city:z.string().trim().min(2).max(100),locality:z.string().trim().min(2).max(140),line1:z.string().trim().min(3).max(180),line2:z.string().trim().max(180).default('')}).strict();
export type Address=z.infer<typeof addressSchema>;
export const addressText=(a:Address)=>[a.line1,a.line2,a.locality,a.city,a.state,a.pincode].filter(Boolean).join(', ');
const point=z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).strict();
const normalized=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export const canonicalTown=(value:string)=>({'नजीबाबाद':'najibabad','नज़ीबाबाद':'najibabad','बिजनौर':'bijnor'}[normalized(value)]||normalized(value));
const samePlace=(a:Partial<Address>,b:Address)=>['pincode','state','city','locality','line1'].every(k=>normalized(a[k as keyof Address]||'')===normalized(b[k as keyof Address]));
export async function resolveAddress(db:Store,userId:string,raw:unknown,locationId?:string,prior?:{locationResolution?:LocationResolution;addressDetails?:Address;coordinates?:Point|null;address?:string;town?:string;locality?:{en:string;hi:string}}) {
  const {locationId:ignored,...fields}=z.record(z.string(),z.unknown()).parse(raw);const address=addressSchema.parse(fields);
  const saved=locationId?await db.read(s=>s.locations.find(l=>l.id===locationId&&l.userId===userId&&Date.parse(l.expiresAt)>Date.now()&&samePlace(l.address,address))):undefined;
  const unchanged=prior?.addressDetails?samePlace(prior.addressDetails,address):prior?.address&&normalized(prior.address)===normalized(address.line1)&&canonicalTown(prior.town||'')===canonicalTown(address.city)&&[prior.locality?.en,prior.locality?.hi].some(x=>normalized(x||'')===normalized(address.locality));
  const previous=unchanged?prior?.coordinates:undefined;
  let coordinates=saved?.coordinates||previous||null;
  let locationResolution:LocationResolution|undefined=saved?{version:2,source:'device',accuracy:'point'}:unchanged?prior?.locationResolution:undefined;
  if(!saved&&(!previous||!locationResolution)){
    const found=await geocode({address},userId);
    const old=found.legacyCoordinates;
    const wasGeocoded=!!(previous&&old&&Math.abs(previous.lat-old.lat)<0.00001&&Math.abs(previous.lng-old.lng)<0.00001);
    if(!previous||wasGeocoded){if(found.checked){coordinates=found.coordinates;locationResolution=found.resolution;}}
    else if(found.checked)locationResolution={version:2,source:'legacy',accuracy:'point'};
  }
  return {addressDetails:address,address:addressText(address),coordinates,locationVerified:!!coordinates,locationResolution};
}
export function createLocationRouter(db:Store){const router=Router();router.use(requireAuth,rateLimit({windowMs:60000,limit:12}));
  router.post('/current',async(req,res)=>{const coordinates=point.parse(req.body);const found=await geocode({point:coordinates},req.user!.id);const address=found.address||{pincode:'',state:'',city:'',locality:'',line1:'',line2:''};const id=randomUUID();
    await db.transaction(s=>{s.locations=s.locations.filter(l=>Date.parse(l.expiresAt)>Date.now());s.locations.push({id,userId:req.user!.id,address,coordinates,expiresAt:new Date(Date.now()+3600000).toISOString()});});
    res.json({address,locationId:id,geocoded:!!found.address});
  });
  router.post('/resolve',async(req,res)=>{const input=z.object({address:addressSchema,locationId:z.string().max(100).optional()}).strict().parse(req.body);const value=await resolveAddress(db,req.user!.id,input.address,input.locationId);res.json({address:value.addressDetails,verified:value.locationVerified});});return router;
}
