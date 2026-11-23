import {createHmac} from 'node:crypto';
import {config} from './config.js';
import {HttpError} from './errors.js';
export const callsAvailable=()=>config.turnProvider==='cloudflare'?!!(config.cloudflareTurnKeyId&&config.cloudflareTurnApiToken):config.turnUrls.length>0&&config.turnSecret.length>=16;
export async function iceCredentials(userId:string){
 if(!callsAvailable())return {available:false,iceServers:[]};
 const ttl=7500;
 if(config.turnProvider==='cloudflare'){
  try{const response=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(config.cloudflareTurnKeyId)}/credentials/generate-ice-servers`,{method:'POST',headers:{Authorization:`Bearer ${config.cloudflareTurnApiToken}`,'Content-Type':'application/json'},body:JSON.stringify({ttl}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json() as {iceServers:unknown[]};if(!Array.isArray(data.iceServers))throw Error();return {available:true,expiresIn:ttl,iceServers:data.iceServers};}catch{throw new HttpError(503,'call_unavailable');}
 }
 const username=`${Math.floor(Date.now()/1000)+ttl}:${userId}`;return {available:true,expiresIn:ttl,iceServers:[...(config.stunUrls.length?[{urls:config.stunUrls}]:[]),{urls:config.turnUrls,username,credential:createHmac('sha1',config.turnSecret).update(username).digest('base64')}]};
}
