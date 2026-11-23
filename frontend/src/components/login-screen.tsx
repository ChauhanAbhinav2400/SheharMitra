'use client';
import dynamic from 'next/dynamic';
const FirebasePhone=dynamic(()=>import('./firebase-phone'),{ssr:false});
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useApp} from './provider';
import {Button,Field} from './ui';
import {roleHome} from '@/lib/role-home';
import {mutate} from '@/lib/api';
export default function LoginScreen(){const {t,lang,refresh,error}=useApp(),router=useRouter();const [phone,setPhone]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);return <div className="container narrow">{process.env.NEXT_PUBLIC_AUTH_PROVIDER==='firebase'&&<FirebasePhone/>}<section className="panel auth-card"><h1>{t('login_title')}</h1><p>{t('login_sub')}</p><form className="form-stack" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const result=await mutate<any>('/auth/login',{phone,password});await refresh();router.push(roleHome(result.user.roles,lang));}catch(e){error(e);}finally{setBusy(false);}}}><Field label={t('phone')} value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required pattern="[0-9]{10}"/><Field label={t('password')} value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required/><Button loading={busy}>{t('login')}</Button></form><Link className="button secondary block" style={{marginTop:16}} href={`/${lang}/signup`}>{t('signup')}</Link>{process.env.NEXT_PUBLIC_DEMO_MODE!=='false'&&<><h3 style={{marginTop:28}}>{t('demo_accounts')}</h3><p className="small">{t('demo_password')}: DemoPass123!</p><div className="demo-logins">{['buyer','seller','partner','admin','resolver'].map((role,i)=><button key={role} onClick={()=>{setPhone(`900000000${i+1}`);setPassword('DemoPass123!');}}>{t(role)}</button>)}</div></>}</section></div>;}
