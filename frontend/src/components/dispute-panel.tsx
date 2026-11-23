'use client';
import {useState} from 'react';
import {useApp} from './provider';
import {Button,Textarea,Field,Badge} from './ui';
import {api} from '@/lib/api';
import {dateTime,money} from '@/i18n';
import type {Order} from '@/lib/types';

export async function uploadEvidence(orderId:string,files:File[]){const ids:string[]=[];for(const file of files){if(!file.size)continue;const data=new FormData();data.append('purpose','evidence');data.append('orderId',orderId);data.append('file',file);const result=await api('/uploads',{method:'POST',body:data});ids.push(result.upload.id);}return ids;}
export default function DisputePanel({order,respond}:{order:Order;respond:(body:{text:string;evidence:string[]})=>Promise<void>}){
 const {t,lang,error}=useApp(),[busy,setBusy]=useState(false);const dispute=order.dispute;if(!dispute)return null;
 const view=(id:string)=><Button key={id} variant="secondary" onClick={async()=>{try{const data=await api(`/uploads/${id}/access`);window.open(data.url,'_blank','noopener,noreferrer');}catch(e){error(e);}}}>{t('view_evidence')}</Button>;
 const open=['open','awaiting_response','under_review'].includes(dispute.status),withinDeadline=Date.parse(dispute.responseDeadline)>Date.now();
 return <section className="panel form-stack"><div><h2>{t('disputes')}</h2><Badge status={dispute.status}/></div><p>{dispute.reason}</p>{dispute.description&&<p>{dispute.description}</p>}<p>{t('affected_part')}: {dispute.components.map(c=>t(c==='delivery'?'fee':c)).join(', ')}</p><div className="actions">{dispute.evidence.map(view)}</div><p>{t('deadline')}: {dateTime(dispute.responseDeadline,lang)}</p>{dispute.responses.map((r,i)=><div className="panel" key={i}><p>{r.text}</p><p className="small muted">{dateTime(r.at,lang)}</p><div className="actions">{r.evidence?.map(view)}</div></div>)}{open&&(withinDeadline?<form className="form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);try{const files=f.getAll('evidence').filter((v):v is File=>v instanceof File&&v.size>0);if(files.length>5)throw Error('invalid_evidence');const evidence=await uploadEvidence(order.id,files);await respond({text:String(f.get('text')),evidence});}catch(e){error(e);}finally{setBusy(false);}}}><Textarea label={t('response')} name="text" minLength={3} maxLength={1000} required/><Field label={t('evidence_optional')} name="evidence" type="file" multiple accept="image/png,image/jpeg,image/webp"/><Button loading={busy}>{t('respond')}</Button></form>:<p className="notice">{t('response_deadline_passed')}</p>)}{dispute.decision&&<div className="notice"><div><h3>{t('pending_payment_execution')}</h3><p>{dispute.decision.rationale}</p><p>{t('seller_payout')}: {money(dispute.decision.sellerPaise)}</p><p>{t('partner_payout')}: {money(dispute.decision.partnerPaise)}</p><p>{t('buyer_refund')}: {money(dispute.decision.buyerRefundPaise)}</p>{dispute.status==='closed'&&<p>{t('case_closed')}</p>}</div></div>}</section>;
}
