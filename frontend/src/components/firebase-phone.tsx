'use client';
import {useEffect,useRef,useState} from 'react';
import {initializeApp,getApps} from 'firebase/app';
import {getAuth,inMemoryPersistence,setPersistence,RecaptchaVerifier,signInWithPhoneNumber,signOut,type ConfirmationResult} from 'firebase/auth';
import {useRouter} from 'next/navigation';
import {useApp} from './provider';
import {Button,Field} from './ui';
import {roleHome} from '@/lib/role-home';
import {mutate} from '@/lib/api';
import {phoneAuthIssue,type PhoneAuthIssue} from '@/lib/firebase-phone-error';
export default function FirebasePhone({register=false}:{register?:boolean}){
 const {t,lang,error,notify,refresh}=useApp(),router=useRouter();const [phone,setPhone]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[otp,setOtp]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[consent,setConsent]=useState(false);const captcha=useRef<HTMLDivElement>(null),verifier=useRef<RecaptchaVerifier|null>(null),confirmation=useRef<ConfirmationResult|null>(null);
 const configured=!!(process.env.NEXT_PUBLIC_FIREBASE_API_KEY&&process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN&&process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID&&process.env.NEXT_PUBLIC_FIREBASE_APP_ID);
 const [issue,setIssue]=useState<PhoneAuthIssue|null>(null),[localOrigin,setLocalOrigin]=useState(false);
 const inFlight=useRef(false),mounted=useRef(false);
 function clearCaptcha(){const current=verifier.current;verifier.current=null;current?.clear();}
 function startAgain(){setSent(false);setOtp('');confirmation.current=null;clearCaptcha();}
 useEffect(()=>{mounted.current=true;setLocalOrigin(['localhost','127.0.0.1','[::1]'].includes(window.location.hostname));return()=>{mounted.current=false;clearCaptcha();};},[]);
 async function submit(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setIssue(null);try{
  if(!configured){notify(t('firebase_not_configured'));return;}
  const app=getApps().find(a=>a.name==='sheharmitra-phone')||initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID},'sheharmitra-phone');const auth=getAuth(app);auth.languageCode=lang;await setPersistence(auth,inMemoryPersistence);
  if(!mounted.current)return;
  if(!sent){if(!verifier.current)verifier.current=new RecaptchaVerifier(auth,captcha.current!,{size:'normal'});const result=await signInWithPhoneNumber(auth,`+91${phone}`,verifier.current);if(!mounted.current)return;confirmation.current=result;clearCaptcha();setSent(true);}
  else{if(!confirmation.current){startAgain();return;}const credential=await confirmation.current.confirm(otp);try{if(!mounted.current)return;const result=await mutate<any>('/auth/firebase',{idToken:await credential.user.getIdToken(),...(register?{name}:{}),...(password?{password}:{})});await refresh();if(mounted.current)router.push(roleHome(result.user.roles,lang));}finally{await signOut(auth);}}
 }catch(e){if(!mounted.current)return;const failure=phoneAuthIssue(e);if(failure){setIssue(failure);if(failure.restart)startAgain();}else error(e);if(!sent)clearCaptcha();}finally{inFlight.current=false;if(mounted.current)setBusy(false);}}
 return <section className="panel auth-card">
  <h2>{t('phone_signin')}</h2>
  {!configured&&<p className="notice">{t('firebase_not_configured')}</p>}
  {localOrigin&&<p className="notice">{t('firebase_localhost_notice')}</p>}
  {issue&&<div className="notice danger" role="alert"><div><p>{t(issue.key)}</p><small>{t('firebase_error_reference')}: <code>{issue.code}</code></small></div></div>}
  {sent&&<p role="status">{t('firebase_code_sent')}</p>}
  <form className="form-stack" onSubmit={e=>{e.preventDefault();void submit();}}>
   {!sent?<>
    {register&&<Field label={t('name')} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} minLength={2} required disabled={busy}/>}
    <Field label={t('phone')} autoComplete="tel-national" inputMode="tel" pattern="[6-9][0-9]{9}" value={phone} onChange={e=>setPhone(e.target.value)} required disabled={busy}/>
    <Field label={t(register?'password':'link_password')} type="password" autoComplete={register?'new-password':'current-password'} minLength={10} value={password} onChange={e=>setPassword(e.target.value)} required={register} disabled={busy}/>
    <label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required disabled={busy}/><span>{t('firebase_consent')}</span></label>
   </>:<Field label={t('otp')} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={e=>setOtp(e.target.value)} required disabled={busy}/>}
   <div ref={captcha}/>
   <Button loading={busy} disabled={!configured||!consent}>{t(sent?'continue':'send_otp')}</Button>
   {sent&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>{startAgain();setIssue(null);}}>{t('change_phone')}</Button>}
  </form>
 </section>;
}
