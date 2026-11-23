const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
export class ApiError extends Error { constructor(public code: string,public status: number) {super(code);} }
const signInPaths = new Set(['/auth/login','/auth/firebase','/auth/register','/auth/otp/request']);
const rotatesSession = new Set(['/auth/login','/auth/firebase','/auth/register','/auth/logout']);
function responseError(response:Response,data:any) {
  return new ApiError(data.code||data.error?.code||(response.status===401?'unauthenticated':response.status===403?'forbidden':response.status===409?'conflict':'invalid_form'),response.status);
}
export function createApiClient(apiBase:string,send:typeof fetch=(input,init)=>fetch(input,init)) {
  let token='',sessionVersion=0;
  let csrfRequest:Promise<void>|undefined;
  function clearSessionToken() { token=''; sessionVersion++; csrfRequest=undefined; }
  async function refreshCsrf() {
    if(!csrfRequest) {
      // Coalesce startup requests; do not let an earlier /me response replace
      // the token for the session now being used to sign in.
      const version=++sessionVersion;
      const request=(async()=>{
        const response=await send(`${apiBase}/auth/csrf`,{credentials:'include',cache:'no-store'});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw responseError(response,data);
        if(version!==sessionVersion||typeof data.csrfToken!=='string'||!data.csrfToken)throw new ApiError('session_expired',403);
        token=data.csrfToken;
      })();
      csrfRequest=request;
      void request.finally(()=>{if(csrfRequest===request)csrfRequest=undefined;}).catch(()=>{});
    }
    await csrfRequest;
  }
  return async function api<T=any>(path:string,options:RequestInit={}):Promise<T> {
    const method=(options.method||'GET').toUpperCase();
    const write=!['GET','HEAD','OPTIONS'].includes(method);
    const signIn=method==='POST'&&signInPaths.has(path);
    if(write&&(signIn||!token))await refreshCsrf();
    const headers=new Headers(options.headers);
    if(!(options.body instanceof FormData)&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
    if(write&&!headers.has('Idempotency-Key'))headers.set('Idempotency-Key',crypto.randomUUID());
    for(let attempt=0;attempt<2;attempt++) {
      const version=sessionVersion;
      if(write)headers.set('X-CSRF-Token',token);
      const response=await send(`${apiBase}${path}`,{...options,method,credentials:'include',cache:'no-store',headers});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) {
        const error=responseError(response,data);
        if(error.status===403&&error.code==='session_expired') {
          if(version===sessionVersion)clearSessionToken();
          // This middleware rejection happens before the auth handler runs.
          // Retry only sign-in requests, never an order/chat/payment mutation.
          if(signIn&&attempt===0){await refreshCsrf();continue;}
        }
        throw error;
      }
      if(method==='POST'&&rotatesSession.has(path)) {
        clearSessionToken();
        if(path!=='/auth/logout'&&typeof data.csrfToken==='string')token=data.csrfToken;
      }else if(version===sessionVersion&&typeof data.csrfToken==='string')token=data.csrfToken;
      return data;
    }
    throw new ApiError('session_expired',403);
  };
}
export const api=createApiClient(base);
export const mutate = <T=any>(path:string,body:unknown={},method='POST') => api<T>(path,{method,body:JSON.stringify(body)});
export async function upload(file:File,purpose:string,conversationId?:string) {const form=new FormData();form.append('purpose',purpose);if(conversationId)form.append('conversationId',conversationId);form.append('file',file);return api<any>('/uploads',{method:'POST',body:form});}
export async function publicApi<T>(path:string): Promise<T|null> {try {const r=await fetch(`${process.env.API_INTERNAL_URL || base}${path}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});return r.ok?await r.json():null;}catch{return null;}}
export const siteOrigin = () => process.env.NEXT_PUBLIC_SITE_ORIGIN || 'http://localhost:3000';
