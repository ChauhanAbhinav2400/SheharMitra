'use client';
import {useState} from 'react';
import {MapPin} from 'lucide-react';
import {useApp} from './provider';
import {Button,Field} from './ui';
import {mutate} from '@/lib/api';
export type AddressDraft={pincode:string;state:string;city:string;locality:string;line1:string;line2:string;locationId?:string};
export const emptyAddress=():AddressDraft=>({pincode:'',state:'',city:'',locality:'',line1:'',line2:''});
export function UseCurrentLocationButton({onLocated}:{onLocated:(address:AddressDraft)=>void}){const {t}=useApp();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function locate(){setMessage('');if(!navigator.geolocation){setMessage('location_failed');return;}setBusy(true);try{const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:60000}));const result=await mutate<any>('/locations/current',{lat:position.coords.latitude,lng:position.coords.longitude});onLocated({...result.address,locationId:result.locationId});setMessage(result.geocoded?'address_check':'location_manual');}catch(e){setMessage((e as GeolocationPositionError).code===1?'location_denied':'location_failed');}finally{setBusy(false);}}
 return <><Button type="button" variant="secondary" loading={busy} onClick={()=>void locate()}><MapPin size={20}/>{t('use_current_location')}</Button>{message&&<p role="status" className="notice">{t(message)}</p>}</>;
}
export function AddressForm({value,onChange,label}:{value:AddressDraft;onChange:(value:AddressDraft)=>void;label?:string}){const {t}=useApp();return <fieldset className="address-form form-stack"><legend>{label||t('address')}</legend><UseCurrentLocationButton onLocated={onChange}/><p className="small muted">{t('address_check')}</p>{(['pincode','state','city','locality','line1','line2'] as const).map(key=><Field key={key} label={t('address_'+key)} value={value[key]} required={key!=='line2'} maxLength={{pincode:6,state:80,city:100,locality:140,line1:180,line2:180}[key]} minLength={key==='line2'?undefined:key==='line1'?3:2} inputMode={key==='pincode'?'numeric':undefined} pattern={key==='pincode'?'[1-9][0-9]{5}':undefined} onInvalid={e=>e.currentTarget.setCustomValidity(t(key==='pincode'?'invalid_pincode':'address_required'))} onChange={e=>{e.target.setCustomValidity('');onChange({...value,[key]:e.target.value,...(key==='line2'?{}:{locationId:undefined})});}}/>)}</fieldset>;}
