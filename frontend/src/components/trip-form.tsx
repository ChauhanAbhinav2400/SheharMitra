'use client';
import {useState} from 'react';
import {useApp} from './provider';
import {Button,Field,Select,Modal} from './ui';
import {AddressForm,emptyAddress} from './address-form';
import {mutate} from '@/lib/api';
import type {Trip} from '@/lib/types';
import {categories} from '@/i18n';
export default function TripForm({close,done,trip}:{close:()=>void;done:()=>void;trip?:Trip}){
 const localTime=(value:string)=>new Date(Date.parse(value)+330*60000).toISOString().slice(0,16);
 const {t,error}=useApp();const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[origin,setOrigin]=useState(()=>({...emptyAddress(),...trip?.originAddress})),[destination,setDestination]=useState(()=>({...emptyAddress(),...trip?.destinationAddress})),[data,setData]=useState<Record<string,string>>(trip?{transport:trip.transport,departure:localTime(trip.departureAt),arrival:localTime(trip.arrivalAt)}:{transport:'motorcycle'}),[supported,setSupported]=useState(trip?.categories||categories);
 const update=(k:string,v:string)=>setData(d=>({...d,[k]:v}));const field=(k:string,label:string,type='text')=><Field label={t(label)} value={data[k]||''} type={type} step={type==='number'?'any':undefined} onChange={e=>update(k,e.target.value)} required/>;
 return <Modal title={t(trip?'edit_trip':'publish_trip')} onClose={close}><form className="form-stack" onSubmit={async e=>{e.preventDefault();if(step<2){setStep(step+1);return;}setBusy(true);try{await mutate(trip?`/trips/${trip.id}`:'/trips',{originAddress:origin,destinationAddress:destination,originLocationId:origin.locationId,destinationLocationId:destination.locationId,departureAt:new Date(data.departure+'+05:30').toISOString(),arrivalAt:new Date(data.arrival+'+05:30').toISOString(),transport:data.transport,categories:supported},trip?'PATCH':'POST');done();close();}catch(e){error(e);}finally{setBusy(false);}}}>
 {step===0?<AddressForm value={origin} onChange={setOrigin} label={t('origin')}/>:step===1?<AddressForm value={destination} onChange={setDestination} label={t('trip_destination')}/>:<>
 <p>{t('utc_note')}</p>{field('departure','departure','datetime-local')}{field('arrival','arrival','datetime-local')}<p className="notice">{t('discuss_pickup')}</p>
 <Select label={t('transport')} value={data.transport} onChange={e=>update('transport',e.target.value)}>{['bicycle','motorcycle','car','van'].map(v=><option key={v} value={v}>{t(v)}</option>)}</Select>
 <fieldset><legend>{t('category')}</legend>{categories.map(c=><label className="check-label" key={c}><input type="checkbox" checked={supported.includes(c)} onChange={e=>setSupported(e.target.checked?[...supported,c]:supported.filter(x=>x!==c))}/>{t(c)}</label>)}</fieldset></>}
 <div className="actions">{step>0&&<Button type="button" variant="secondary" onClick={()=>setStep(step-1)}>{t('back')}</Button>}<Button loading={busy} disabled={step===2&&!supported.length}>{t(step===2?(trip?'save_trip':'publish_trip'):'continue')}</Button></div></form></Modal>;
}
