'use client';
import {createContext,useContext,useEffect,useState,useCallback} from 'react';
import {io,Socket} from 'socket.io-client';
import {usePathname,useRouter} from 'next/navigation';
import {enablePush,pushConfigured} from '@/lib/push';
import {api,ApiError} from '@/lib/api';
import {Lang,translate} from '@/i18n';
type Account={id:string;name:string;phone:string;roles:string[];partnerStatus:string};
type Context={lang:Lang;t:(key:string)=>string;user:Account|null;loading:boolean;socket:Socket|null;refresh:()=>Promise<void>;notify:(message:string)=>void;error:(e:unknown)=>void;switchLanguage:()=>void};
const AppContext=createContext<Context>(null!);
export const useApp=()=>useContext(AppContext);
export function AppProvider({lang,children}:{lang:Lang;children:React.ReactNode}){
 const [user,setUser]=useState<Account|null>(null),[loading,setLoading]=useState(true),[csrf,setCsrf]=useState(''),[socket,setSocket]=useState<Socket|null>(null),[toast,setToast]=useState('');
 const pathname=usePathname(),router=useRouter();
 const refresh=useCallback(async()=>{try{const d=await api('/auth/me');setUser(d.user);setCsrf(d.csrfToken);}catch{setUser(null);}finally{setLoading(false);}},[]);
 useEffect(()=>{void refresh();if('serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js').catch(()=>{});},[refresh]);
 useEffect(()=>{document.documentElement.lang=lang;document.cookie=`sheharmitra-language=${lang};path=/;max-age=31536000;SameSite=Lax`;localStorage.setItem('sheharmitra-language',lang);document.documentElement.dataset.large=localStorage.getItem('sheharmitra-large-text')==='true'?'true':'false';},[lang]);
 useEffect(()=>{if(!user||!csrf)return;const s=io(process.env.NEXT_PUBLIC_SOCKET_URL||'http://localhost:4000',{withCredentials:true,auth:{csrfToken:csrf},reconnection:true});setSocket(s);return()=>{s.disconnect();setSocket(null);};},[user?.id,csrf]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5500);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(!user)return;void api('/notifications/settings',{method:'POST',body:JSON.stringify({language:lang,categories:{}})}).catch(()=>{});if(pushConfigured()&&'Notification'in window&&Notification.permission==='granted')void enablePush(lang,false).catch(()=>{});},[user?.id,lang]);
 const t=useCallback((key:string)=>translate(lang,key),[lang]);
 function error(e:unknown){const code=e instanceof ApiError?e.code:'network_error';const translated=t(code);setToast(translated===code.replaceAll('_',' ')?t(e instanceof ApiError&&e.status===409?'conflict':'something_wrong'):translated);}
 return <AppContext.Provider value={{lang,t,user,loading,socket,refresh,notify:setToast,error,switchLanguage:()=>router.push(pathname.replace(/^\/(hi|en)/,lang==='hi'?'/en':'/hi'))}}>{children}{toast&&<div className="toast" role="status" aria-live="polite">{toast}<button onClick={()=>setToast('')} aria-label={t('close')}>×</button></div>}</AppContext.Provider>;
}
